"""
MedBridge ML HTTP API (FastAPI).

Run from apps/ml-service:
  uvicorn app.api.server:app --host 0.0.0.0 --port 8000 --reload

Backend (Node) calls these endpoints for forecast / expiry / exchange.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.exchange_services import demo_exchange_plan, suggest_matches
from app.services.forecast_services import (
    batch_forecast,
    daily_anchored_forecast,
    load_bundle,
    load_daily_bundle,
    next_week_forecast,
    recursive_forecast,
)
from app.services.inventory_services import (
    expiry_alerts,
    hospital_inventory_summary,
    low_stock_alerts,
    load_hospitals,
    load_medicines,
)

RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
ART = ROOT / "artifacts"

app = FastAPI(
    title="MedBridge ML Service",
    description="XGBoost demand forecasting + inventory/exchange helpers",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_features() -> Path:
    path = PROC / "demand_features.csv"
    if not path.exists() or path.stat().st_size == 0:
        raise HTTPException(
            status_code=503,
            detail="demand_features.csv missing. Run: python3 training/generate_ledger_data.py",
        )
    return path


def _hospital_partition_path(hospital_id: str) -> Path:
    safe_id = "".join(
        character if character.isalnum() or character in ("-", "_") else "_"
        for character in str(hospital_id)
    )
    return PROC / "by_hospital" / f"{safe_id}.csv"


def _load_hospital_features(hospital_id: str) -> pd.DataFrame:
    """Load a small serving partition; fall back to the full training table."""
    partition = _hospital_partition_path(hospital_id)
    if partition.exists() and partition.stat().st_size > 0:
        return pd.read_csv(partition, parse_dates=["week_start"])

    feature_path = _require_features()
    all_features = pd.read_csv(feature_path, parse_dates=["week_start"])
    return all_features[all_features["hospital_id"] == hospital_id].copy()


def _load_hospital_daily_features(hospital_id: str) -> pd.DataFrame:
    """Daily history for one hospital (serving partition, else full table)."""
    safe_id = "".join(
        ch for ch in str(hospital_id) if ch.isalnum() or ch in ("-", "_")
    )
    partition = PROC / "daily_by_hospital" / f"{safe_id}.csv.gz"
    if partition.exists() and partition.stat().st_size > 0:
        frame = pd.read_csv(partition, parse_dates=["date"])
    else:
        full = PROC / "daily_ledger.csv.gz"
        if not full.exists() or full.stat().st_size == 0:
            raise HTTPException(
                status_code=503,
                detail="daily_ledger.csv.gz missing. Run: python3 training/generate_daily_ledger.py",
            )
        frame = pd.read_csv(
            full, parse_dates=["date"],
            dtype={
                "hospital_id": "category",
                "medicine_id": "category",
                "category": "category",
                "facility_type": "category",
            },
        )
        frame = frame[frame["hospital_id"] == hospital_id].copy()
    frame = frame.rename(columns={"demand_units": "target_demand"})
    # Attach the human-readable name from the reference catalogue (serving only).
    meds_path = RAW / "medicines.csv"
    if meds_path.exists():
        meds = pd.read_csv(meds_path, usecols=["medicine_id", "generic_name"])
        frame = frame.merge(meds, on="medicine_id", how="left")
    return frame.sort_values(["hospital_id", "medicine_id", "date"]).reset_index(drop=True)


def _require_model() -> None:
    model = ART / "models" / "xgb_demand_model.joblib"
    enc = ART / "encoders" / "label_encoders.joblib"
    if not model.exists() or model.stat().st_size == 0:
        raise HTTPException(
            status_code=503,
            detail="Model missing. Run: python training/train_xgb.py",
        )
    if not enc.exists() or enc.stat().st_size == 0:
        raise HTTPException(
            status_code=503,
            detail="Encoders missing. Run: python training/train_xgb.py",
        )


def _require_daily_model() -> None:
    model = ART / "models" / "xgb_demand_daily.joblib"
    enc = ART / "encoders" / "daily_label_encoders.joblib"
    if not model.exists() or model.stat().st_size == 0:
        raise HTTPException(
            status_code=503,
            detail="Daily model missing. Run: python training/train_daily_xgb.py",
        )
    if not enc.exists() or enc.stat().st_size == 0:
        raise HTTPException(
            status_code=503,
            detail="Daily encoders missing. Run: python training/train_daily_xgb.py",
        )


def _df_records(df: pd.DataFrame, limit: Optional[int] = None) -> list[dict[str, Any]]:
    if df is None or len(df) == 0:
        return []
    out = df.copy()
    if limit is not None:
        out = out.head(limit)
    # JSON-safe
    for c in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[c]):
            out[c] = out[c].astype(str)
    out = out.replace({np.nan: None})
    return out.to_dict(orient="records")


@app.get("/health")
def health() -> dict[str, Any]:
    model_ok = (ART / "models" / "xgb_demand_model.joblib").exists() and (
        ART / "models" / "xgb_demand_model.joblib"
    ).stat().st_size > 0
    feats_ok = (PROC / "demand_features.csv").exists() and (
        PROC / "demand_features.csv"
    ).stat().st_size > 0
    metrics_path = ART / "metrics" / "training_metrics.json"
    metrics = None
    if metrics_path.exists() and metrics_path.stat().st_size > 0:
        try:
            metrics = json.loads(metrics_path.read_text(encoding="utf-8")).get("test_metrics")
        except Exception:
            metrics = None
    return {
        "status": "ok" if model_ok and feats_ok else "degraded",
        "model_loaded": model_ok,
        "features_ready": feats_ok,
        "test_metrics": metrics,
        "service": "medbridge-ml",
    }


@app.get("/metrics")
def metrics() -> dict[str, Any]:
    path = ART / "metrics" / "training_metrics.json"
    if not path.exists() or path.stat().st_size == 0:
        raise HTTPException(status_code=404, detail="training_metrics.json not found")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/hospitals")
def hospitals(demo_only: bool = Query(False)) -> dict[str, Any]:
    df = load_hospitals()
    if demo_only and "is_demo" in df.columns:
        df = df[df["is_demo"] == 1]
    return {"count": len(df), "items": _df_records(df)}


@app.get("/medicines")
def medicines() -> dict[str, Any]:
    df = load_medicines()
    return {"count": len(df), "items": _df_records(df)}


@app.get("/forecast")
def forecast(
    hospital_id: str = Query(..., description="e.g. HOSP-BG-003"),
    top: int = Query(50, ge=1, le=500),
    week: Optional[str] = Query(
        None,
        description="Historical YYYY-MM-DD for a backtest; omit for the next future week",
    ),
) -> dict[str, Any]:
    """Medicine-level one-week-ahead demand forecast for one hospital."""
    _require_model()
    history = _load_hospital_features(hospital_id)
    if history.empty:
        raise HTTPException(status_code=404, detail=f"No feature rows for hospital_id={hospital_id}")

    last_observed = pd.Timestamp(history["week_start"].max())
    is_future = week is None

    try:
        if is_future:
            predicted = next_week_forecast(history)
            forecast_week = pd.Timestamp(predicted["week_start"].iloc[0])
        else:
            requested_week = pd.Timestamp(week)
            rows = history[history["week_start"] == requested_week].copy()
            if rows.empty:
                raise HTTPException(
                    status_code=404,
                    detail=f"No historical feature rows for hospital_id={hospital_id}, week={week}",
                )
            predicted = batch_forecast(rows)
            forecast_week = requested_week
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {error}") from error

    predicted = predicted.sort_values("predicted_demand", ascending=False).head(top)
    columns = [
        column
        for column in [
            "hospital_id",
            "medicine_id",
            "generic_name",
            "category",
            "facility_type",
            "week_start",
            "target_demand",
            "predicted_demand",
        ]
        if column in predicted.columns
    ]
    items = _df_records(predicted[columns])

    slice_mae = None
    if not is_future and "target_demand" in predicted.columns:
        actual = predicted["target_demand"].to_numpy(float)
        estimate = predicted["predicted_demand"].to_numpy(float)
        slice_mae = round(float(np.mean(np.abs(actual - estimate))), 4)

    return {
        "hospital_id": hospital_id,
        "week_start": str(forecast_week.date()),
        "last_observed_week": str(last_observed.date()),
        "forecast_type": "future" if is_future else "historical_backtest",
        "model": "XGBoostRegressor",
        "n_items": len(items),
        "slice_mae": slice_mae,
        "items": items,
    }

@app.get("/forecast/chart")
def forecast_chart(
    hospital_id: str = Query(...),
    months: int = Query(6, ge=3, le=12),
) -> dict[str, Any]:
    """Return historical backtests plus eight weeks of genuine future forecasts."""
    _require_model()
    history = _load_hospital_features(hospital_id)
    if history.empty:
        raise HTTPException(status_code=404, detail=f"No data for {hospital_id}")

    last_observed = pd.Timestamp(history["week_start"].max())
    first_history_month = (last_observed.to_period("M") - (months - 1)).start_time
    recent = history[history["week_start"] >= first_history_month].copy()

    try:
        historical_prediction = batch_forecast(recent)
        future_prediction = recursive_forecast(history, periods=8)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {error}") from error

    historical_prediction["monthKey"] = (
        historical_prediction["week_start"].dt.to_period("M").astype(str)
    )
    historical_monthly = historical_prediction.groupby("monthKey", as_index=False).agg(
        actual=("target_demand", "sum"),
        forecast=("predicted_demand", "sum"),
    )

    future_prediction["week_start"] = pd.to_datetime(future_prediction["week_start"])
    future_prediction["monthKey"] = future_prediction["week_start"].dt.to_period("M").astype(str)
    future_monthly = future_prediction.groupby("monthKey", as_index=False).agg(
        forecast=("predicted_demand", "sum")
    )

    series = []
    for row in historical_monthly.itertuples():
        period = pd.Period(row.monthKey, freq="M")
        series.append({
            "month": period.strftime("%b"),
            "monthKey": row.monthKey,
            "actual": int(round(float(row.actual))),
            "forecast": int(round(float(row.forecast))),
            "kind": "historical_backtest",
        })
    for row in future_monthly.itertuples():
        period = pd.Period(row.monthKey, freq="M")
        series.append({
            "month": period.strftime("%b"),
            "monthKey": row.monthKey,
            "actual": None,
            "forecast": int(round(float(row.forecast))),
            "kind": "future_forecast",
        })

    detail = forecast(hospital_id=hospital_id, top=15, week=None)
    return {
        "hospital_id": hospital_id,
        "model": "XGBoostRegressor",
        "forecast_horizon_weeks": 8,
        "last_observed_week": str(last_observed.date()),
        "series": series,
        "topMedicines": detail["items"],
        "week_start": detail["week_start"],
        "available": True,
        "message": "Leakage-audited one-week model with recursive eight-week forecast",
    }

@app.get("/forecast/daily")
def forecast_daily(
    hospital_id: str = Query(...),
    days: int = Query(30, ge=1, le=90),
    top: int = Query(10, ge=1, le=100),
) -> dict[str, Any]:
    """Hybrid daily demand forecast.

    The daily XGBoost model shapes the day-by-day curve; within each ISO week
    the curve is rescaled so the daily values sum EXACTLY to the weekly
    model's forecast for that week (daily and weekly views cannot disagree).
    """
    _require_model()
    _require_daily_model()
    daily_history = _load_hospital_daily_features(hospital_id)
    weekly_history = _load_hospital_features(hospital_id)
    if daily_history.empty:
        raise HTTPException(status_code=404, detail=f"No daily data for {hospital_id}")
    if weekly_history.empty:
        raise HTTPException(status_code=404, detail=f"No weekly data for {hospital_id}")

    try:
        daily = daily_anchored_forecast(daily_history, weekly_history, days=days)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Daily prediction failed: {error}") from error

    if daily.empty:
        raise HTTPException(status_code=500, detail="Daily forecast produced no rows")

    # --- consistency guard: sum(daily in week) == week total ----------------
    daily["week_start"] = pd.to_datetime(daily["week_start"])
    sums = daily.groupby(
        ["hospital_id", "medicine_id", "week_start"], observed=True, sort=False,
        as_index=False,
    )["predicted_daily"].sum()
    sums["week_total"] = daily.groupby(
        ["hospital_id", "medicine_id", "week_start"], observed=True, sort=False,
    )["week_total"].first().to_numpy()
    diff = float((sums["predicted_daily"] - sums["week_total"]).abs().max())

    last_observed = pd.Timestamp(daily_history["date"].max())
    first_day = pd.Timestamp(daily["date"].min())

    # hospital-wide daily totals for the chart
    totals = (
        daily.groupby("date", as_index=False)
        .agg(predicted_demand=("predicted_daily", "sum"),
             week_start=("week_start", "first"))
        .sort_values("date")
    )
    totals["weekday"] = totals["date"].dt.strftime("%a")

    # week_total is per pair-week repeated on each day row: dedupe first,
    # then sum across medicines (hospital-level weekly totals).
    week_pairs = daily[["hospital_id", "medicine_id", "week_start", "week_total"]].drop_duplicates(
        ["hospital_id", "medicine_id", "week_start"]
    )
    week_summary = (
        week_pairs.groupby("week_start", as_index=False)["week_total"].sum()
        .merge(
            daily.groupby("week_start", as_index=False).agg(
                days_covered=("date", "nunique"),
                date_from=("date", "min"),
                date_to=("date", "max"),
            ),
            on="week_start",
            how="left",
        )
        .sort_values("week_start")
    )

    # per-medicine daily curves (top-N by first full week's forecast)
    order = (
        daily[daily["horizon_day"] <= 7]
        .groupby("medicine_id", as_index=False)["predicted_daily"].sum()
        .sort_values("predicted_daily", ascending=False)
        .head(top)["medicine_id"].tolist()
    )
    items = []
    generic = {}
    medicine_cols = [c for c in daily.columns if c.startswith("generic")]
    for medicine_id in order:
        med = daily[daily["medicine_id"] == medicine_id].sort_values("date")
        medicine_items = _df_records(
            med[["date", "horizon_day", "predicted_daily", "week_total"]]
        )
        meta = med.iloc[0]
        items.append({
            "medicine_id": medicine_id,
            "generic_name": meta.get("generic_name"),
            "category": meta.get("category"),
            "week_total": float(med["week_total"].iloc[0]),
            "daily": medicine_items,
        })
        del medicine_items

    bundle = load_daily_bundle()
    return {
        "hospital_id": hospital_id,
        "daily_model": "XGBoostRegressor (daily, log1p-rmse)",
        "weekly_model": "XGBoostRegressor (weekly, log1p-rmse)",
        "anchor": "weekly totals with daily allocation (sums match exactly)",
        "days": days,
        "last_observed_date": str(last_observed.date()),
        "first_forecast_date": str(first_day.date()),
        "consistency_error": round(diff, 6),
        "weekly_consistency_ok": diff <= 1e-3,
        "daily_totals": _df_records(totals),
        "week_summary": _df_records(week_summary),
        "topMedicines": items,
        "available": True,
        "message": "Daily curve shaped by the daily model, anchored to weekly totals",
        "daily_model_meta": {
            "best_iteration": bundle.get("best_iteration"),
            "split": bundle.get("split"),
        },
    }


@app.get("/expiry")
def expiry(
    hospital_id: Optional[str] = None,
    days: int = Query(90, ge=1, le=365),
    limit: int = Query(100, ge=1, le=1000),
) -> dict[str, Any]:
    try:
        df = expiry_alerts(within_days=days, hospital_id=hospital_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {"count": len(df), "items": _df_records(df, limit)}


@app.get("/low-stock")
def low_stock(
    hospital_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
) -> dict[str, Any]:
    try:
        df = low_stock_alerts(hospital_id=hospital_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {"count": len(df), "items": _df_records(df, limit)}


@app.get("/inventory/summary")
def inventory_summary(hospital_id: str = Query(...)) -> dict[str, Any]:
    try:
        return hospital_inventory_summary(hospital_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.get("/exchange/suggest")
def exchange_suggest(
    hospital_id: Optional[str] = None,
    medicine_id: Optional[str] = None,
    demo_only: bool = Query(True),
    top_k: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    try:
        if demo_only and not hospital_id and not medicine_id:
            df = demo_exchange_plan(top_k=top_k)
        else:
            df = suggest_matches(
                requesting_hospital_id=hospital_id,
                medicine_id=medicine_id,
                demo_only=demo_only,
                top_k=top_k,
            )
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return {
        "available": True,
        "count": 0 if df is None else len(df),
        "items": _df_records(df) if df is not None else [],
        "message": "Smart match based on surplus, shortage, distance, and near-expiry",
    }


from pydantic import BaseModel
from app.services.seed_service import seed_hospital_history


class HospitalOnboardRequest(BaseModel):
    hospital_id: str
    facility_type: str
    province: str
    district: str
    bed_capacity: int
    weeks_of_history: int = 26


@app.post("/onboarding/seed-history")
def onboarding_seed_history(payload: HospitalOnboardRequest):
    result = seed_hospital_history(
        payload.model_dump(exclude={"weeks_of_history"}),
        weeks_of_history=payload.weeks_of_history,
    )
    return result

@app.on_event("startup")
def _warmup() -> None:
    # Best-effort model load so first request is fast
    try:
        if (ART / "models" / "xgb_demand_model.joblib").exists():
            load_bundle()
            print("XGBoost model warmed up")
    except Exception as e:
        print("Model warmup skipped:", e)


# Optional: allow `python -m app.api.server`
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.api.server:app", host="0.0.0.0", port=8000, reload=False)