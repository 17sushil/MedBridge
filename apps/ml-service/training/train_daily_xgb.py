#!/usr/bin/env python3
"""
MedBridge -- daily demand XGBoost model.

Companion to training/train_xgb.py (weekly model). Trains a day-level model
on data/processed/daily_ledger.csv.gz with the same leakage discipline:

  * row dated t has target = demand on day t; every demand-derived feature
    (lags, rolling stats, differences, EWMs) uses only history through t-1,
  * split is chronological (never random): the same boundaries as the
    weekly model (validation 2026-01-05..2026-03-30, test 2026-04-06..
    2026-06-29),
  * hospital_id / medicine_id are identifiers, not model features,
  * target is log1p-transformed; predictions are expm1-inverted,
  * memory-lean for a 2 GB box: float32 everywhere, category codes instead
    of strings, column-wise matrix extraction (no pandas consolidation
    copy), native xgboost API + QuantileDMatrix, frames freed before fit.

Also reports how far the daily model gets when its daily predictions are
rolled up to weeks (the practical "daily view" the product shows).

Run from apps/ml-service:
    python3 training/train_daily_xgb.py
Requires: python3 training/generate_ledger_data.py && python3 training/generate_daily_ledger.py
"""

from __future__ import annotations

import gc
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DAILY = ROOT / "data" / "processed" / "daily_ledger.csv.gz"
ART_MODEL = ROOT / "artifacts" / "models" / "xgb_demand_daily.joblib"
ART_ENC = ROOT / "artifacts" / "encoders" / "daily_label_encoders.joblib"
ART_MET = ROOT / "artifacts" / "metrics"
TEST_PRED = ROOT / "reports" / "residual_analysis" / "daily_test_predictions.csv.gz"

DAILY_LAGS = (1, 2, 3, 7, 14, 30)
DAILY_WINDOWS = (7, 14, 30)
DROP_COLS = {
    "hospital_id", "medicine_id", "date", "demand_units", "target_demand",
    "category", "facility_type", "is_demo",
}
TARGET = "demand_units"
NTHREAD = 2

SPLIT = {
    "train_end": pd.Timestamp("2025-12-29"),
    "valid_end": pd.Timestamp("2026-03-30"),
    "test_end": pd.Timestamp("2026-06-29"),
}


def smape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = (np.abs(y_true) + np.abs(y_pred)) / 2
    safe = denom > 1e-9
    if not safe.any():
        return 0.0
    return float(100 * np.mean(np.abs(y_pred - y_true)[safe] / denom[safe]))


def metrics_dict(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    return {
        "r2": float(1 - ss_res / ss_tot) if ss_tot > 0 else float("nan"),
        "mae": float(np.mean(np.abs(y_true - y_pred))),
        "rmse": float(np.sqrt(np.mean((y_true - y_pred) ** 2))),
        "wape": float(100 * np.sum(np.abs(y_true - y_pred)) / max(np.sum(y_true), 1e-9)),
        "smape": smape(y_true, y_pred),
    }


def build_daily_features(raw: pd.DataFrame) -> pd.DataFrame:
    """One row per hospital/medicine/day with t-1-safe features (float32)."""
    df = raw.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["hospital_id", "medicine_id", "date"]).reset_index(drop=True)
    df["demand_units"] = df["demand_units"].astype("float32")
    del raw
    gc.collect()

    df["year"] = df["date"].dt.year.astype("int16")
    df["month"] = df["date"].dt.month.astype("int8")
    df["day_of_week"] = df["date"].dt.dayofweek.astype("int8")
    df["week_of_year"] = df["date"].dt.isocalendar().week.astype("int16")
    df["is_winter"] = df["month"].isin([12, 1, 2]).astype("int8")
    df["is_monsoon"] = df["month"].isin([6, 7, 8, 9]).astype("int8")
    df["is_weekend"] = (df["day_of_week"] >= 5).astype("int8")
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12).astype("float32")
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12).astype("float32")
    df["dow_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7).astype("float32")
    df["dow_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7).astype("float32")

    g = df.groupby(["hospital_id", "medicine_id"], observed=True, sort=False)[
        "demand_units"
    ]
    for lag in DAILY_LAGS:
        df[f"lag_{lag}d"] = g.shift(lag).astype("float32")
    for window in DAILY_WINDOWS:
        df[f"roll_mean_{window}d"] = g.transform(
            lambda s: s.shift(1).rolling(window, min_periods=1).mean()
        ).astype("float32")
        df[f"roll_std_{window}d"] = g.transform(
            lambda s: s.shift(1).rolling(window, min_periods=2).std()
        ).astype("float32")
    df["roll_min_7d"] = g.transform(
        lambda s: s.shift(1).rolling(7, min_periods=1).min()
    ).astype("float32")
    df["roll_max_7d"] = g.transform(
        lambda s: s.shift(1).rolling(7, min_periods=1).max()
    ).astype("float32")
    # Leakage-safe differences: only history through t-1.
    df["diff_1d"] = g.transform(lambda s: s.shift(1).diff(1)).astype("float32")
    df["diff_7d"] = g.transform(lambda s: s.shift(1).diff(7)).astype("float32")
    df["ewm_7d"] = g.transform(
        lambda s: s.shift(1).ewm(span=7, adjust=False).mean()
    ).astype("float32")
    df["ewm_30d"] = g.transform(
        lambda s: s.shift(1).ewm(span=30, adjust=False).mean()
    ).astype("float32")
    return df


def extract_matrix(df: pd.DataFrame, columns: list[str], mask: np.ndarray) -> np.ndarray:
    """Column-wise float32 extraction (avoids pandas consolidation copies)."""
    indices = np.flatnonzero(mask)
    out = np.empty((len(indices), len(columns)), dtype="float32")
    for j, column in enumerate(columns):
        out[:, j] = df[column].to_numpy(dtype="float32", na_value=0.0)[indices]
    return out


def main() -> None:
    if not DAILY.exists():
        raise SystemExit(
            f"Missing {DAILY}. Run: python3 training/generate_daily_ledger.py"
        )
    print("Loading daily ledger...", flush=True)
    raw = pd.read_csv(
        DAILY,
        dtype={
            "hospital_id": "category",
            "medicine_id": "category",
            "category": "category",
            "facility_type": "category",
        },
    )
    print(f"rows={len(raw):,} hospitals={raw['hospital_id'].nunique()} "
          f"medicines={raw['medicine_id'].nunique()}", flush=True)

    print("Building leakage-safe daily features...", flush=True)
    df = build_daily_features(raw)
    del raw
    gc.collect()

    train = (df["date"] <= SPLIT["train_end"]).to_numpy()
    valid = ((df["date"] > SPLIT["train_end"]) & (df["date"] <= SPLIT["valid_end"])).to_numpy()
    test = ((df["date"] > SPLIT["valid_end"]) & (df["date"] <= SPLIT["test_end"])).to_numpy()
    print(f"  train rows={int(train.sum()):,}  valid={int(valid.sum()):,}  "
          f"test={int(test.sum()):,}", flush=True)

    # Categoricals -> integer codes fitted on TRAIN only (string dtypes are
    # the main memory hog at 3.78M rows).
    encoders: dict[str, LabelEncoder] = {}
    cat_maps: dict[str, dict] = {}
    for column in ("category", "facility_type"):
        enc = LabelEncoder()
        enc.fit(df.loc[train, column].astype(str))
        encoders[column] = enc
        cat_maps[column] = dict(zip(enc.classes_, enc.transform(enc.classes_)))
        values = df[column].astype(str)
        df[f"{column}_code"] = (
            values.map(cat_maps[column]).fillna(cat_maps[column][enc.classes_[0]])
        ).astype("int32")
        del values
    df = df.drop(columns=["category", "facility_type"])
    gc.collect()

    feature_columns = [col for col in df.columns if col not in DROP_COLS]
    # Leakage audit (mirrors the weekly model): the target must never be a
    # feature (lags are fine -- history through t-1), and difference features
    # must be reconstructible from lags only.
    leaked = sorted({"target_demand", "demand_units"}.intersection(feature_columns))
    if leaked:
        raise RuntimeError(f"Target columns found in features: {leaked}")
    if {"diff_1d", "lag_1d", "lag_2d"}.issubset(df.columns):
        corruption = float((df["diff_1d"] - (df["lag_1d"] - df["lag_2d"])).abs().max())
        if corruption > 1e-5:
            raise RuntimeError("Leakage detected: diff_1d is not built from lags only.")
        print(
            f"Leakage audit: PASSED (diff_1d == lag_1d - lag_2d, max err {corruption:.2e})",
            flush=True,
        )
    print(f"features={len(feature_columns)}", flush=True)

    # Keep only the test-row metadata needed for the evaluation CSV; the
    # full frame is dropped before fitting.
    test_meta = df.loc[test, ["hospital_id", "medicine_id", "date",
                              "category_code", "facility_type_code", TARGET]].copy()

    X_tr = extract_matrix(df, feature_columns, train)
    X_va = extract_matrix(df, feature_columns, valid)
    X_te = extract_matrix(df, feature_columns, test)
    y_tr = np.log1p(df[TARGET].to_numpy(dtype="float32")[train]).astype("float32")
    y_va = np.log1p(df[TARGET].to_numpy(dtype="float32")[valid]).astype("float32")
    y_te = np.log1p(df[TARGET].to_numpy(dtype="float32")[test]).astype("float32")
    del df
    gc.collect()

    print("Training XGBoost (log1p RMSE, early stopping on validation)...", flush=True)
    params = {
        "objective": "reg:squarederror",
        "eval_metric": "rmse",
        "tree_method": "hist",
        "max_depth": 7,
        "eta": 0.08,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "min_child_weight": 3,
        "reg_lambda": 1.2,
        "nthread": NTHREAD,
        "seed": 42,
    }
    # Keep a representative train sample for in-sample metrics; the full
    # training matrix is freed immediately after the QuantileDMatrix is built
    # (2 GB box: DMatrix copies would otherwise OOM).
    X_tr_sample = X_tr[::6].copy()
    y_tr_sample = y_tr[::6].copy()
    dtrain = xgb.QuantileDMatrix(X_tr, label=y_tr, feature_names=feature_columns)
    del X_tr, y_tr
    gc.collect()
    dvalid = xgb.QuantileDMatrix(X_va, label=y_va, feature_names=feature_columns, ref=dtrain)
    evals_result: dict = {}
    booster = xgb.train(
        params, dtrain, num_boost_round=700,
        evals=[(dvalid, "validation_0")],
        early_stopping_rounds=50,
        verbose_eval=100,
        evals_result=evals_result,
    )
    best_iteration = int(booster.best_iteration or 0)
    print(f"best_iteration={best_iteration}", flush=True)
    del dtrain, dvalid
    gc.collect()

    def predict_log(rows: np.ndarray) -> np.ndarray:
        dmatrix = xgb.DMatrix(rows, feature_names=feature_columns)
        return np.expm1(
            booster.predict(dmatrix, iteration_range=(0, best_iteration + 1))
        )

    train_pred = predict_log(X_tr_sample)
    valid_pred = predict_log(X_va)
    test_pred = predict_log(X_te)
    y_train_raw = np.expm1(y_tr_sample)
    y_valid_raw = np.expm1(y_va)
    y_test_raw = np.expm1(y_te)
    del X_tr_sample, X_va, X_te, y_tr_sample, y_va, y_te
    gc.collect()

    daily_metrics = {}
    for name, y_true, y_pred in (
        ("train_1in6_sample", y_train_raw, train_pred),
        ("validation", y_valid_raw, valid_pred),
        ("test", y_test_raw, test_pred),
    ):
        daily_metrics[name] = metrics_dict(y_true, y_pred)
        print(name.upper(), {k: round(v, 4) for k, v in daily_metrics[name].items()}, flush=True)

    # Weekly roll-up of the daily test predictions (what the UI shows).
    test_out = test_meta.copy()
    test_out["predicted_demand"] = np.round(test_pred, 4)
    test_out["week_start"] = test_out["date"].dt.to_period("W-SUN").dt.start_time
    weekly_actual = test_out.groupby(
        ["hospital_id", "medicine_id", "week_start"], observed=True, as_index=False,
    ).agg(actual=("demand_units", "sum"), forecast=("predicted_demand", "sum"))
    rollout = metrics_dict(
        weekly_actual["actual"].to_numpy(float),
        weekly_actual["forecast"].to_numpy(float),
    )
    print("WEEKLY ROLL-UP OF DAILY TEST PREDICTIONS (per pair-week):",
          {k: round(v, 4) for k, v in rollout.items()}, flush=True)

    # --- artifacts ----------------------------------------------------------
    ART_MODEL.parent.mkdir(parents=True, exist_ok=True)
    ART_ENC.parent.mkdir(parents=True, exist_ok=True)
    ART_MET.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": booster,
            "feature_columns": feature_columns,
            "feature_map": {
                "category_code": encoders["category"].classes_.tolist(),
                "facility_type_code": encoders["facility_type"].classes_.tolist(),
            },
            "best_iteration": best_iteration,
            "trained_at": str(pd.Timestamp.now(tz="UTC")),
            "source": str(DAILY),
            "split": {k: str(v.date()) for k, v in SPLIT.items()},
        },
        ART_MODEL,
    )
    joblib.dump(encoders, ART_ENC)
    (ART_MET / "daily_metrics.json").write_text(
        json.dumps(
            {"daily": daily_metrics, "weekly_rollup_test": rollout,
             "best_iteration": best_iteration},
            indent=2,
        ),
        encoding="utf-8",
    )
    history = evals_result.get("validation_0", {})
    pd.DataFrame(history).to_csv(
        ART_MET / "daily_training_history.csv", index_label="round"
    )
    feature_scores = booster.get_score(importance_type="gain")
    pd.DataFrame(
        {
            "feature": list(feature_scores.keys()),
            "importance": list(feature_scores.values()),
        }
    ).sort_values("importance", ascending=False).to_csv(
        ART_MET / "daily_feature_importance.csv", index=False
    )
    TEST_PRED.parent.mkdir(parents=True, exist_ok=True)
    test_out.to_csv(TEST_PRED, index=False, compression="gzip")
    print(f"Saved {ART_MODEL}", flush=True)
    print(f"Saved {ART_MET / 'daily_metrics.json'}", flush=True)
    print("Saved daily_test_predictions.csv.gz", flush=True)


if __name__ == "__main__":
    main()
