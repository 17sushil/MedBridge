#!/usr/bin/env python3
"""
Train high-accuracy XGBoost demand forecasting model for MedBridge.

Saves:
  artifacts/models/xgb_demand_model.json
  artifacts/models/xgb_demand_model.joblib
  artifacts/encoders/label_encoders.joblib
  artifacts/encoders/feature_columns.json
  artifacts/metrics/training_metrics.json
  artifacts/metrics/feature_importance.csv
  artifacts/metrics/test_predictions_sample.csv
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    mean_absolute_percentage_error,
)

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed" / "demand_features.csv"
ART_MODELS = ROOT / "artifacts" / "models"
ART_ENC = ROOT / "artifacts" / "encoders"
ART_MET = ROOT / "artifacts" / "metrics"

CAT_COLS = [
    "facility_type", "province", "ecoregion", "urban_class", "ownership",
    "category", "dosage_form", "abc_class", "hospital_id", "medicine_id", "district",
]

DROP_COLS = [
    "week_start", "generic_name", "target_demand",
    "hospital_id", "medicine_id",
]


def smape(y_true, y_pred) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.abs(y_true) + np.abs(y_pred)
    mask = denom > 1e-6
    if mask.sum() == 0:
        return 0.0
    return float(np.mean(2.0 * np.abs(y_pred[mask] - y_true[mask]) / denom[mask]) * 100)


def metrics_dict(y_true, y_pred) -> dict:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.maximum(0, np.asarray(y_pred, dtype=float))
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(mean_squared_error(y_true, y_pred) ** 0.5)
    r2 = float(r2_score(y_true, y_pred))
    # MAPE on non-zero actuals
    nz = y_true > 0
    mape = float(mean_absolute_percentage_error(y_true[nz], y_pred[nz]) * 100) if nz.sum() else None
    return {
        "MAE": round(mae, 4),
        "RMSE": round(rmse, 4),
        "R2": round(r2, 6),
        "sMAPE_pct": round(smape(y_true, y_pred), 4),
        "MAPE_nonzero_pct": round(mape, 4) if mape is not None else None,
        "n": int(len(y_true)),
        "mean_actual": round(float(y_true.mean()), 4),
        "mean_pred": round(float(y_pred.mean()), 4),
    }


def encode_categoricals(df: pd.DataFrame):
    from sklearn.preprocessing import LabelEncoder

    encoders = {}
    out = df.copy()
    for c in CAT_COLS:
        if c not in out.columns:
            continue
        le = LabelEncoder()
        # fit on full data so train/valid/test share mapping
        out[c] = le.fit_transform(out[c].astype(str))
        encoders[c] = le
    return out, encoders


def main():
    try:
        from xgboost import XGBRegressor
    except ImportError:
        import subprocess, sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "xgboost", "-q"])
        from xgboost import XGBRegressor

    ART_MODELS.mkdir(parents=True, exist_ok=True)
    ART_ENC.mkdir(parents=True, exist_ok=True)
    ART_MET.mkdir(parents=True, exist_ok=True)

    print("Loading features...")
    df = pd.read_csv(DATA, parse_dates=["week_start"])
    print(f"  rows={len(df):,} cols={df.shape[1]}")

    df, encoders = encode_categoricals(df)

    feature_cols = [c for c in df.columns if c not in DROP_COLS]
    # ensure numeric
    for c in feature_cols:
        if df[c].dtype == object:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    train = df[df["week_start"] <= "2025-12-29"].copy()
    valid = df[(df["week_start"] >= "2026-01-05") & (df["week_start"] <= "2026-03-30")].copy()
    test = df[df["week_start"] >= "2026-04-06"].copy()

    print(f"  train={len(train):,} valid={len(valid):,} test={len(test):,} features={len(feature_cols)}")

    X_train, y_train = train[feature_cols], train["target_demand"].astype(float)
    X_valid, y_valid = valid[feature_cols], valid["target_demand"].astype(float)
    X_test, y_test = test[feature_cols], test["target_demand"].astype(float)

    # Log1p target stabilizes heavy-tailed demand (hospitals vary hugely)
    y_train_log = np.log1p(y_train)
    y_valid_log = np.log1p(y_valid)

    model = XGBRegressor(
        n_estimators=1200,
        max_depth=8,
        learning_rate=0.03,
        subsample=0.85,
        colsample_bytree=0.85,
        colsample_bylevel=0.85,
        min_child_weight=4,
        reg_alpha=0.1,
        reg_lambda=1.2,
        gamma=0.0,
        objective="reg:squarederror",
        tree_method="hist",
        random_state=42,
        n_jobs=-1,
        early_stopping_rounds=60,
    )

    print("Training XGBoost (log1p target)...")
    model.fit(
        X_train,
        y_train_log,
        eval_set=[(X_valid, y_valid_log)],
        verbose=False,
    )

    def predict(X):
        return np.maximum(0, np.expm1(model.predict(X)))

    pred_train = predict(X_train)
    pred_valid = predict(X_valid)
    pred_test = predict(X_test)

    m_train = metrics_dict(y_train, pred_train)
    m_valid = metrics_dict(y_valid, pred_valid)
    m_test = metrics_dict(y_test, pred_test)

    print("\n=== Metrics ===")
    print("TRAIN", m_train)
    print("VALID", m_valid)
    print("TEST ", m_test)
    print(f"best_iteration={model.best_iteration}")

    # Feature importance
    imp = pd.DataFrame({
        "feature": feature_cols,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False)
    imp.to_csv(ART_MET / "feature_importance.csv", index=False)

    # Sample predictions for report
    sample = test[["week_start", "hospital_id", "medicine_id", "target_demand"]].copy()
    # decode ids back for readability
    sample["hospital_id"] = encoders["hospital_id"].inverse_transform(sample["hospital_id"].astype(int))
    sample["medicine_id"] = encoders["medicine_id"].inverse_transform(sample["medicine_id"].astype(int))
    sample["predicted_demand"] = np.round(pred_test, 2)
    sample["abs_error"] = np.round(np.abs(sample["target_demand"] - sample["predicted_demand"]), 2)
    sample = sample.sample(n=min(500, len(sample)), random_state=42)
    sample.to_csv(ART_MET / "test_predictions_sample.csv", index=False)

    # Per demo hospital accuracy on test
    demo_ids = [f"DEMO-0{i}" for i in range(1, 9)]
    demo_rows = []
    # need original hospital ids on test
    test_h = encoders["hospital_id"].inverse_transform(test["hospital_id"].astype(int))
    for hid in demo_ids:
        mask = test_h == hid
        if mask.sum() == 0:
            continue
        demo_rows.append({
            "hospital_id": hid,
            **metrics_dict(y_test.to_numpy()[mask], pred_test[mask]),
        })
    demo_metrics = pd.DataFrame(demo_rows)
    if len(demo_metrics):
        demo_metrics.to_csv(ART_MET / "demo_hospital_test_metrics.csv", index=False)
        print("\nDemo hospital test R2:\n", demo_metrics[["hospital_id", "R2", "MAE", "sMAPE_pct"]])

    # Persist model + encoders
    model_path_json = ART_MODELS / "xgb_demand_model.json"
    model.save_model(model_path_json)

    bundle = {
        "model": model,
        "feature_columns": feature_cols,
        "cat_cols": CAT_COLS,
        "target_transform": "log1p",
        "best_iteration": int(model.best_iteration) if model.best_iteration is not None else None,
    }
    joblib.dump(bundle, ART_MODELS / "xgb_demand_model.joblib")
    joblib.dump(encoders, ART_ENC / "label_encoders.joblib")
    (ART_ENC / "feature_columns.json").write_text(json.dumps(feature_cols, indent=2), encoding="utf-8")

    report = {
        "model": "XGBRegressor",
        "target": "target_demand (weekly units)",
        "target_transform": "log1p / expm1",
        "n_features": len(feature_cols),
        "best_iteration": bundle["best_iteration"],
        "train_metrics": m_train,
        "valid_metrics": m_valid,
        "test_metrics": m_test,
        "split": {
            "train": "week_start <= 2025-12-29",
            "valid": "2026-01-05 .. 2026-03-30",
            "test": "week_start >= 2026-04-06",
        },
        "paths": {
            "model_json": str(model_path_json.relative_to(ROOT)),
            "model_joblib": "artifacts/models/xgb_demand_model.joblib",
            "encoders": "artifacts/encoders/label_encoders.joblib",
        },
    }
    (ART_MET / "training_metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    # Human-readable summary for report
    summary = f"""# MedBridge XGBoost Training Report

## Model
- Algorithm: **XGBoost Regressor** (`reg:squarederror`, hist)
- Target: weekly `target_demand` with **log1p** transform
- Features: **{len(feature_cols)}**
- Best iteration: **{bundle['best_iteration']}**

## Hold-out test performance
| Metric | Train | Valid | Test |
|--------|------:|------:|-----:|
| R² | {m_train['R2']:.4f} | {m_valid['R2']:.4f} | **{m_test['R2']:.4f}** |
| MAE | {m_train['MAE']:.2f} | {m_valid['MAE']:.2f} | **{m_test['MAE']:.2f}** |
| RMSE | {m_train['RMSE']:.2f} | {m_valid['RMSE']:.2f} | **{m_test['RMSE']:.2f}** |
| sMAPE % | {m_train['sMAPE_pct']:.2f} | {m_valid['sMAPE_pct']:.2f} | **{m_test['sMAPE_pct']:.2f}** |

## Top 15 features
{imp.head(15).to_string(index=False)}

## Artifacts
- `artifacts/models/xgb_demand_model.joblib`
- `artifacts/models/xgb_demand_model.json`
- `artifacts/encoders/label_encoders.joblib`
- `artifacts/metrics/training_metrics.json`
"""
    (ART_MET / "TRAINING_REPORT.md").write_text(summary, encoding="utf-8")
    print("\nSaved artifacts to", ART_MODELS, ART_ENC, ART_MET)
    print("TEST R2 =", m_test["R2"], "MAE =", m_test["MAE"])


if __name__ == "__main__":
    main()
