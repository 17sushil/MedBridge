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
from app.services.forecast_services import batch_forecast, load_bundle
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
            detail="demand_features.csv missing. Run: python training/generate_synthetic_data.py",
        )
    return path


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
    hospital_id: str = Query(..., description="e.g. DEMO-03"),
    top: int = Query(50, ge=1, le=500),
    week: Optional[str] = Query(None, description="YYYY-MM-DD week_start; default=latest"),
) -> dict[str, Any]:
    """Medicine-level weekly demand forecast for one hospital (XGBoost)."""
    _require_model()
    feat_path = _require_features()

    feats = pd.read_csv(feat_path, parse_dates=["week_start"])
    sub = feats[feats["hospital_id"] == hospital_id]
    if sub.empty:
        raise HTTPException(status_code=404, detail=f"No feature rows for hospital_id={hospital_id}")

    if week:
        latest = pd.Timestamp(week)
        rows = sub[sub["week_start"] == latest]
        if rows.empty:
            # nearest week
            latest = sub["week_start"].max()
            rows = sub[sub["week_start"] == latest]
    else:
        latest = sub["week_start"].max()
        rows = sub[sub["week_start"] == latest].copy()

    try:
        pred = batch_forecast(rows)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}") from e

    pred = pred.sort_values("predicted_demand", ascending=False).head(top)
    cols = [
        c
        for c in [
            "hospital_id",
            "medicine_id",
            "generic_name",
            "category",
            "facility_type",
            "week_start",
            "target_demand",
            "predicted_demand",
        ]
        if c in pred.columns
    ]
    items = _df_records(pred[cols])
    # accuracy on this slice
    if "target_demand" in pred.columns and "predicted_demand" in pred.columns:
        y = pred["target_demand"].to_numpy(float)
        p = pred["predicted_demand"].to_numpy(float)
        mae = float(np.mean(np.abs(y - p))) if len(y) else None
    else:
        mae = None

    return {
        "hospital_id": hospital_id,
        "week_start": str(pd.Timestamp(latest).date()),
        "model": "XGBoostRegressor",
        "n_items": len(items),
        "slice_mae": round(mae, 4) if mae is not None else None,
        "items": items,
    }


@app.get("/forecast/chart")
def forecast_chart(
    hospital_id: str = Query(...),
    months: int = Query(6, ge=3, le=12),
) -> dict[str, Any]:
    """
    Frontend-friendly monthly series:
      [{ month, actual, forecast }, ...]
    Built from weekly XGBoost predictions + historical target_demand.
    """
    _require_model()
    feat_path = _require_features()
    feats = pd.read_csv(feat_path, parse_dates=["week_start"])
    sub = feats[feats["hospital_id"] == hospital_id].copy()
    if sub.empty:
        raise HTTPException(status_code=404, detail=f"No data for {hospital_id}")

    # Historical weekly totals (actual)
    weekly_actual = (
        sub.groupby("week_start", as_index=False)["target_demand"].sum()
        .sort_values("week_start")
    )
    weekly_actual["month"] = weekly_actual["week_start"].dt.to_period("M").astype(str)

    # Predict latest week at medicine grain, then we also backfill forecast
    # using lag-based batch on recent weeks (sample up to last 16 weeks for speed)
    recent_weeks = sorted(sub["week_start"].unique())[-16:]
    recent = sub[sub["week_start"].isin(recent_weeks)].copy()
    try:
        recent_pred = batch_forecast(recent)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}") from e

    weekly_pred = (
        recent_pred.groupby("week_start", as_index=False)["predicted_demand"].sum()
        .sort_values("week_start")
    )
    weekly_pred["week_start"] = pd.to_datetime(weekly_pred["week_start"])
    weekly_pred["month"] = weekly_pred["week_start"].dt.to_period("M").astype(str)

    # Monthly actual (last N months)
    monthly_actual = weekly_actual.groupby("month", as_index=False)["target_demand"].sum()
    monthly_pred = weekly_pred.groupby("month", as_index=False)["predicted_demand"].sum()

    months_sorted = sorted(set(monthly_actual["month"]).union(set(monthly_pred["month"])))
    months_sorted = months_sorted[-months:]

    series = []
    for m in months_sorted:
        a = monthly_actual.loc[monthly_actual["month"] == m, "target_demand"]
        f = monthly_pred.loc[monthly_pred["month"] == m, "predicted_demand"]
        # pretty label
        try:
            label = pd.Period(m, freq="M").strftime("%b")
        except Exception:
            label = m
        series.append(
            {
                "month": label,
                "monthKey": m,
                "actual": int(round(float(a.iloc[0]))) if len(a) else 0,
                "forecast": int(round(float(f.iloc[0]))) if len(f) else None,
            }
        )

    # Project 2 future months using last forecast / growth
    if series:
        base = series[-1]["forecast"] or series[-1]["actual"] or 0
        last_key = series[-1]["monthKey"]
        try:
            p = pd.Period(last_key, freq="M")
            for i in range(1, 3):
                fut = p + i
                series.append(
                    {
                        "month": fut.strftime("%b"),
                        "monthKey": str(fut),
                        "actual": None,
                        "forecast": int(round(base * (1 + 0.04 * i))),
                    }
                )
        except Exception:
            pass

    # Top medicine forecasts for cards
    detail = forecast(hospital_id=hospital_id, top=15, week=None)

    return {
        "hospital_id": hospital_id,
        "model": "XGBoostRegressor",
        "series": series,
        "topMedicines": detail["items"],
        "week_start": detail["week_start"],
        "available": True,
        "message": "XGBoost demand forecast ready",
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
