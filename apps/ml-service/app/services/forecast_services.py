"""MedBridge demand forecasting service.

Loads the audited XGBoost bundle, encodes raw feature rows, and constructs
real future feature rows from historical demand. Future forecasts never reuse
the target value from the week being predicted.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "artifacts" / "models" / "xgb_demand_model.joblib"
ENC_PATH = ROOT / "artifacts" / "encoders" / "label_encoders.joblib"

LAGS = (1, 2, 3, 4, 8, 12)
ROLLING_WINDOWS = (2, 4, 8, 12)


@lru_cache(maxsize=1)
def load_bundle() -> dict[str, Any]:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}. Run: python3 training/train_xgb.py"
        )
    if not ENC_PATH.exists():
        raise FileNotFoundError(
            f"Encoders not found at {ENC_PATH}. Run: python3 training/train_xgb.py"
        )
    bundle = joblib.load(MODEL_PATH)
    bundle["encoders"] = joblib.load(ENC_PATH)
    return bundle


def clear_model_cache() -> None:
    """Call after retraining when model serving and training share a process."""
    load_bundle.cache_clear()
    load_daily_bundle.cache_clear()


def _encode_frame(df: pd.DataFrame, encoders: dict) -> pd.DataFrame:
    out = df.copy()
    for column, encoder in encoders.items():
        if column not in out.columns:
            continue
        known = set(encoder.classes_)
        fallback = encoder.classes_[0]
        values = out[column].fillna("UNKNOWN").astype(str)
        values = values.map(lambda value: value if value in known else fallback)
        out[column] = encoder.transform(values)
    return out


def predict_demand(features: pd.DataFrame) -> np.ndarray:
    """Predict non-negative weekly units from raw or encoded feature rows."""
    bundle = load_bundle()
    model = bundle["model"]
    columns = bundle["feature_columns"]
    encoders = bundle["encoders"]

    frame = _encode_frame(features, encoders)
    for column in columns:
        if column not in frame.columns:
            frame[column] = 0
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)
    prediction = np.expm1(model.predict(frame[columns]))
    return np.maximum(0, prediction)


def forecast_from_history_row(history_features_row: dict[str, Any] | pd.Series) -> float:
    return float(predict_demand(pd.DataFrame([dict(history_features_row)]))[0])


def batch_forecast(feature_df: pd.DataFrame) -> pd.DataFrame:
    """Backtest supplied rows by attaching `predicted_demand`."""
    out = feature_df.copy()
    out["predicted_demand"] = np.round(predict_demand(out), 2)
    return out


def _update_calendar(row: pd.Series, forecast_week: pd.Timestamp) -> None:
    row["week_start"] = forecast_week
    row["year"] = forecast_week.year
    row["month"] = forecast_week.month
    row["week_of_year"] = int(forecast_week.isocalendar().week)
    row["quarter"] = forecast_week.quarter
    row["is_monsoon"] = int(forecast_week.month in (6, 7, 8, 9))
    row["is_winter"] = int(forecast_week.month in (12, 1, 2))
    row["month_sin"] = np.sin(2 * np.pi * forecast_week.month / 12)
    row["month_cos"] = np.cos(2 * np.pi * forecast_week.month / 12)
    row["week_sin"] = np.sin(2 * np.pi * int(forecast_week.isocalendar().week) / 52)
    row["week_cos"] = np.cos(2 * np.pi * int(forecast_week.isocalendar().week) / 52)


def build_next_week_features(history: pd.DataFrame) -> pd.DataFrame:
    """Construct one feature row per hospital/medicine for the next week.

    `history` must contain past `target_demand` rows. For forecast week t, all
    lag, rolling, difference, and EWM values are calculated only from demand
    observed through t-1.
    """
    required = {"week_start", "hospital_id", "medicine_id", "target_demand"}
    missing = required.difference(history.columns)
    if missing:
        raise ValueError(f"History is missing required columns: {sorted(missing)}")

    frame = history.copy()
    frame["week_start"] = pd.to_datetime(frame["week_start"])
    frame = frame.sort_values(["hospital_id", "medicine_id", "week_start"])
    rows = []

    for _, group in frame.groupby(["hospital_id", "medicine_id"], observed=True, sort=False):
        group = group.sort_values("week_start")
        values = group["target_demand"].fillna(0).astype(float).to_numpy()
        if not len(values):
            continue

        row = group.iloc[-1].copy()
        forecast_week = pd.Timestamp(group["week_start"].iloc[-1]) + pd.Timedelta(weeks=1)
        _update_calendar(row, forecast_week)

        for lag in LAGS:
            row[f"lag_{lag}w"] = values[-lag] if len(values) >= lag else 0.0
        for window in ROLLING_WINDOWS:
            recent = values[-window:]
            row[f"roll_mean_{window}w"] = float(np.mean(recent)) if len(recent) else 0.0
            row[f"roll_std_{window}w"] = float(np.std(recent, ddof=1)) if len(recent) > 1 else 0.0

        recent_four = values[-4:]
        row["roll_min_4w"] = float(np.min(recent_four)) if len(recent_four) else 0.0
        row["roll_max_4w"] = float(np.max(recent_four)) if len(recent_four) else 0.0
        row["diff_1w"] = float(values[-1] - values[-2]) if len(values) >= 2 else 0.0
        row["diff_4w"] = float(values[-1] - values[-5]) if len(values) >= 5 else 0.0
        row["ewm_4w"] = float(pd.Series(values).ewm(span=4, adjust=False).mean().iloc[-1])
        row["ewm_12w"] = float(pd.Series(values).ewm(span=12, adjust=False).mean().iloc[-1])

        # These features are already lagged in the training table. Until the
        # raw current-week event flags are persisted separately, carrying the
        # latest known lagged state is safer than inventing an event.
        row["emergency_last_4w"] = int(row.get("emergency_last_4w", 0) or 0)
        row["exchange_in_last_4w"] = int(row.get("exchange_in_last_4w", 0) or 0)
        row["target_demand"] = np.nan
        rows.append(row)

    if not rows:
        return pd.DataFrame(columns=history.columns)
    return pd.DataFrame(rows).reset_index(drop=True)


def next_week_forecast(history: pd.DataFrame) -> pd.DataFrame:
    """Forecast the first genuinely future week after `history`."""
    future = build_next_week_features(history)
    future["predicted_demand"] = np.round(predict_demand(future), 2)
    return future


def recursive_forecast(history: pd.DataFrame, periods: int = 8) -> pd.DataFrame:
    """Generate multi-week forecasts recursively.

    After the first future week, each prediction is fed back only as a lag for
    the next horizon. Returned rows are clearly future rows and do not contain
    an observed target.
    """
    if periods < 1:
        return pd.DataFrame()

    working = history.copy()
    working["week_start"] = pd.to_datetime(working["week_start"])
    outputs = []

    for horizon in range(1, periods + 1):
        future = build_next_week_features(working)
        prediction = np.round(predict_demand(future), 2)
        future["predicted_demand"] = prediction
        future["horizon_week"] = horizon
        outputs.append(future.copy())

        feedback = future.drop(columns=["predicted_demand", "horizon_week"]).copy()
        feedback["target_demand"] = prediction
        working = pd.concat([working, feedback], ignore_index=True)

    return pd.concat(outputs, ignore_index=True)


# ---------------------------------------------------------------------------
# Daily forecast (companion to the weekly model above)
# ---------------------------------------------------------------------------

DAILY_MODEL_PATH = ROOT / "artifacts" / "models" / "xgb_demand_daily.joblib"
DAILY_ENC_PATH = ROOT / "artifacts" / "encoders" / "daily_label_encoders.joblib"
DAILY_LAGS = (1, 2, 3, 7, 14, 30)
DAILY_WINDOWS = (7, 14, 30)


@lru_cache(maxsize=1)
def load_daily_bundle() -> dict[str, Any]:
    if not DAILY_MODEL_PATH.exists() or not DAILY_ENC_PATH.exists():
        raise FileNotFoundError(
            "Daily model missing. Run: python3 training/generate_daily_ledger.py "
            "&& python3 training/train_daily_xgb.py"
        )
    bundle = joblib.load(DAILY_MODEL_PATH)
    bundle["encoders"] = joblib.load(DAILY_ENC_PATH)
    return bundle


def predict_daily_demand(features: pd.DataFrame) -> np.ndarray:
    """Predict non-negative daily units from raw or encoded feature rows."""
    bundle = load_daily_bundle()
    model = bundle["model"]
    columns = bundle["feature_columns"]
    encoders = bundle["encoders"]
    best_iteration = int(bundle.get("best_iteration") or 0)

    frame = features.copy()
    # Daily model consumes categoricals as integer codes (category_code /
    # facility_type_code) using train-fitted LabelEncoders with a safe
    # fallback class for unseen categories.
    for column in ("category", "facility_type"):
        enc = encoders.get(column)
        code_column = f"{column}_code"
        if enc is not None and column in frame.columns:
            known = set(enc.classes_)
            values = frame[column].fillna("UNKNOWN").astype(str)
            values = values.map(lambda v: v if v in known else enc.classes_[0])
            frame[code_column] = enc.transform(values)
    for column in columns:
        if column not in frame.columns:
            frame[column] = 0
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)
    dmatrix = xgb.DMatrix(
        frame[columns].to_numpy(dtype="float32"), feature_names=columns
    )
    prediction = np.expm1(
        model.predict(dmatrix, iteration_range=(0, best_iteration + 1))
    )
    return np.maximum(0, prediction)


def _update_day_calendar(row: pd.Series, forecast_date: pd.Timestamp) -> None:
    row["date"] = forecast_date
    row["year"] = forecast_date.year
    row["month"] = forecast_date.month
    row["day_of_week"] = forecast_date.dayofweek
    row["week_of_year"] = int(forecast_date.isocalendar().week)
    row["is_winter"] = int(forecast_date.month in (12, 1, 2))
    row["is_monsoon"] = int(forecast_date.month in (6, 7, 8, 9))
    row["is_weekend"] = int(forecast_date.dayofweek >= 5)
    row["month_sin"] = np.sin(2 * np.pi * forecast_date.month / 12)
    row["month_cos"] = np.cos(2 * np.pi * forecast_date.month / 12)
    row["dow_sin"] = np.sin(2 * np.pi * forecast_date.dayofweek / 7)
    row["dow_cos"] = np.cos(2 * np.pi * forecast_date.dayofweek / 7)


def build_next_day_features(daily_history: pd.DataFrame) -> pd.DataFrame:
    """Construct one feature row per hospital/medicine for the next day.

    `daily_history` must contain past `target_demand` rows (one per
    hospital/medicine/day). All lag/rolling/difference/EWM values use only
    demand observed through t-1, same leakage discipline as the weekly model.
    """
    required = {"date", "hospital_id", "medicine_id", "target_demand"}
    missing = required.difference(daily_history.columns)
    if missing:
        raise ValueError(f"Daily history is missing required columns: {sorted(missing)}")

    frame = daily_history.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.sort_values(["hospital_id", "medicine_id", "date"])
    rows = []

    for _, group in frame.groupby(["hospital_id", "medicine_id"], observed=True, sort=False):
        group = group.sort_values("date")
        values = group["target_demand"].fillna(0).astype(float).to_numpy()
        if not len(values):
            continue

        row = group.iloc[-1].copy()
        forecast_date = pd.Timestamp(group["date"].iloc[-1]) + pd.Timedelta(days=1)
        _update_day_calendar(row, forecast_date)

        for lag in DAILY_LAGS:
            row[f"lag_{lag}d"] = values[-lag] if len(values) >= lag else 0.0
        for window in DAILY_WINDOWS:
            recent = values[-window:]
            row[f"roll_mean_{window}d"] = float(np.mean(recent)) if len(recent) else 0.0
            row[f"roll_std_{window}d"] = (
                float(np.std(recent, ddof=1)) if len(recent) > 1 else 0.0
            )
        recent_seven = values[-7:]
        row["roll_min_7d"] = float(np.min(recent_seven)) if len(recent_seven) else 0.0
        row["roll_max_7d"] = float(np.max(recent_seven)) if len(recent_seven) else 0.0
        row["diff_1d"] = float(values[-1] - values[-2]) if len(values) >= 2 else 0.0
        row["diff_7d"] = float(values[-1] - values[-8]) if len(values) >= 8 else 0.0
        row["ewm_7d"] = float(pd.Series(values).ewm(span=7, adjust=False).mean().iloc[-1])
        row["ewm_30d"] = float(pd.Series(values).ewm(span=30, adjust=False).mean().iloc[-1])

        row["target_demand"] = np.nan
        rows.append(row)

    if not rows:
        return pd.DataFrame(columns=daily_history.columns)
    return pd.DataFrame(rows).reset_index(drop=True)


def recursive_daily_forecast(daily_history: pd.DataFrame, days: int = 30) -> pd.DataFrame:
    """Generate day-by-day forecasts recursively (predictions feed back as lags)."""
    if days < 1:
        return pd.DataFrame()

    working = daily_history.copy()
    working["date"] = pd.to_datetime(working["date"])
    outputs = []

    for horizon in range(1, days + 1):
        future = build_next_day_features(working)
        prediction = np.round(predict_daily_demand(future), 4)
        future["predicted_demand"] = prediction
        future["horizon_day"] = horizon
        outputs.append(future.copy())

        feedback = future.drop(columns=["predicted_demand", "horizon_day"]).copy()
        feedback["target_demand"] = prediction
        working = pd.concat([working, feedback], ignore_index=True)

    return pd.concat(outputs, ignore_index=True)


def daily_anchored_forecast(
    daily_history: pd.DataFrame, weekly_history: pd.DataFrame, days: int = 30
) -> pd.DataFrame:
    """Hybrid daily forecast: daily curve shaped by the daily model, rescaled
    per ISO week so each week's days sum EXACTLY to the weekly model's total.

    Returns rows with date, week_start, horizon_day, predicted_daily,
    week_total (the weekly anchor) and identity columns.
    """
    daily = recursive_daily_forecast(daily_history, days=days)
    if daily.empty:
        return daily

    daily["date"] = pd.to_datetime(daily["date"])
    daily["week_start"] = daily["date"].dt.to_period("W-SUN").dt.start_time

    n_weeks = int(np.ceil(days / 7))
    weekly = recursive_forecast(weekly_history, periods=n_weeks)
    if not weekly.empty:
        weekly["week_start"] = pd.to_datetime(weekly["week_start"])
        anchors = weekly[["hospital_id", "medicine_id", "week_start", "predicted_demand"]].rename(
            columns={"predicted_demand": "week_total"}
        )
    else:
        anchors = None

    daily["week_start"] = daily["week_start"].astype("datetime64[ns]")

    if anchors is not None:
        daily = daily.merge(
            anchors, on=["hospital_id", "medicine_id", "week_start"], how="left"
        )
    else:
        daily["week_total"] = np.nan

    keys = ["hospital_id", "medicine_id", "week_start"]
    g = daily.groupby(keys, observed=True, sort=False)
    curve_sum = g["predicted_demand"].transform("sum").to_numpy()
    anchor = g["week_total"].transform("first").to_numpy()
    days_in_group = g["date"].transform("size").to_numpy()

    raw = daily["predicted_demand"].to_numpy()
    # Trailing partial weeks (fewer than 7 covered days) stay unanchored:
    # the raw daily curve is reported as-is so per-day magnitudes stay
    # comparable; full weeks are rescaled to the weekly total exactly.
    partial = days_in_group < 7
    scaled = np.where(
        partial,
        raw,
        np.where(
            curve_sum > 1e-9,
            raw * np.where(np.isnan(anchor), 1.0, anchor / curve_sum),
            np.where(np.isnan(anchor), 0.0, anchor / 7.0),
        ),
    )
    daily["predicted_daily"] = np.round(np.maximum(0.0, scaled), 4)
    # For partial weeks the reported week_total is what the covered days
    # forecast (sum of the raw curve), keeping the invariant exact.
    raw_sum = g["predicted_demand"].transform("sum").to_numpy()
    fixed = np.where(partial, np.round(raw_sum, 4), daily["week_total"].to_numpy())
    daily["week_total"] = fixed
    return daily.reset_index(drop=True)
