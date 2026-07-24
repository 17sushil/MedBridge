"""
MedBridge demand forecasting service — load trained XGBoost and predict.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "artifacts" / "models" / "xgb_demand_model.joblib"
ENC_PATH = ROOT / "artifacts" / "encoders" / "label_encoders.joblib"


@lru_cache(maxsize=1)
def load_bundle() -> dict[str, Any]:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}. Run: python training/train_xgb.py"
        )
    bundle = joblib.load(MODEL_PATH)
    encoders = joblib.load(ENC_PATH)
    bundle["encoders"] = encoders
    return bundle


def _encode_frame(df: pd.DataFrame, encoders: dict) -> pd.DataFrame:
    out = df.copy()
    for col, le in encoders.items():
        if col not in out.columns:
            continue
        # unseen labels → most frequent class (index 0) fallback
        known = set(le.classes_)
        vals = out[col].astype(str).map(lambda x: x if x in known else le.classes_[0])
        out[col] = le.transform(vals)
    return out


def predict_demand(features: pd.DataFrame) -> np.ndarray:
    """
    features: DataFrame with the same columns used in training (raw categoricals OK).
    Returns non-negative demand predictions (original scale).
    """
    bundle = load_bundle()
    model = bundle["model"]
    cols = bundle["feature_columns"]
    encoders = bundle["encoders"]

    X = _encode_frame(features, encoders)
    for c in cols:
        if c not in X.columns:
            X[c] = 0
        X[c] = pd.to_numeric(X[c], errors="coerce").fillna(0)
    X = X[cols]
    pred = np.expm1(model.predict(X))
    return np.maximum(0, pred)


def forecast_from_history_row(
    history_features_row: dict[str, Any] | pd.Series,
) -> float:
    """Single-row convenience wrapper."""
    df = pd.DataFrame([dict(history_features_row)])
    return float(predict_demand(df)[0])


def batch_forecast(feature_df: pd.DataFrame) -> pd.DataFrame:
    """Attach predicted_demand column."""
    out = feature_df.copy()
    out["predicted_demand"] = np.round(predict_demand(out), 2)
    return out
