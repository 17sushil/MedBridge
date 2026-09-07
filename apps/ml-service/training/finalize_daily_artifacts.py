#!/usr/bin/env python3
"""
MedBridge -- salvage missing daily-model artifacts after a crashed run.

Rebuilds nothing (the booster + encoders + metrics + history were already
saved by train_daily_xgb.py) but regenerates the two trailing artifacts:
daily_feature_importance.csv and daily_test_predictions.csv.gz

Run from apps/ml-service:
    python3 training/finalize_daily_artifacts.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.train_daily_xgb import (  # noqa: E402
    ART_MET,
    build_daily_features,
    metrics_dict,
    extract_matrix,
    SPLIT,
    TEST_PRED,
)
from training.train_daily_xgb import ART_ENC, ART_MODEL  # noqa: E402

DAILY = ROOT / "data" / "processed" / "daily_ledger.csv.gz"


def main() -> None:
    bundle = joblib.load(ART_MODEL)
    booster = bundle["model"]
    feature_columns = bundle["feature_columns"]
    best_iteration = int(bundle["best_iteration"] or 0)
    print(f"booster loaded (best_iteration={best_iteration}, "
          f"features={len(feature_columns)})", flush=True)

    # --- feature importance ------------------------------------------------
    feature_scores = booster.get_score(importance_type="gain")
    pd.DataFrame(
        {"feature": list(feature_scores.keys()), "importance": list(feature_scores.values())}
    ).sort_values("importance", ascending=False).to_csv(
        ART_MET / "daily_feature_importance.csv", index=False
    )
    print(f"Saved {ART_MET / 'daily_feature_importance.csv'} "
          f"({len(feature_scores)} features)", flush=True)

    # --- test predictions ---------------------------------------------------
    raw = pd.read_csv(
        DAILY,
        dtype={
            "hospital_id": "category",
            "medicine_id": "category",
            "category": "category",
            "facility_type": "category",
        },
    )
    print("Rebuilding features for the test window...", flush=True)
    df = build_daily_features(raw)
    del raw

    encoders = joblib.load(ART_ENC)
    cat_maps = {}
    for column in ("category", "facility_type"):
        enc = encoders[column]
        cat_maps[column] = dict(zip(enc.classes_, enc.transform(enc.classes_)))
        values = df[column].astype(str)
        df[f"{column}_code"] = (
            values.map(cat_maps[column]).fillna(cat_maps[column][enc.classes_[0]])
        ).astype("int32")
    df = df.drop(columns=["category", "facility_type"])

    test = ((df["date"] > SPLIT["valid_end"]) & (df["date"] <= SPLIT["test_end"])).to_numpy()
    X_te = extract_matrix(df, feature_columns, test)
    test_meta = df.loc[test, ["hospital_id", "medicine_id", "date",
                              "category_code", "facility_type_code", "demand_units"]].copy()
    del df

    dmatrix = xgb.DMatrix(X_te, feature_names=feature_columns)
    test_pred = np.expm1(booster.predict(dmatrix, iteration_range=(0, best_iteration + 1)))
    y_test_raw = test_meta["demand_units"].to_numpy(float)

    daily_metrics = metrics_dict(y_test_raw, test_pred)
    print("TEST (finalize):", {k: round(v, 4) for k, v in daily_metrics.items()}, flush=True)

    test_meta["predicted_demand"] = np.round(test_pred, 4)
    test_meta["week_start"] = test_meta["date"].dt.to_period("W-SUN").dt.start_time
    weekly = test_meta.groupby(
        ["hospital_id", "medicine_id", "week_start"], observed=True, as_index=False,
    ).agg(actual=("demand_units", "sum"), forecast=("predicted_demand", "sum"))
    rollout = metrics_dict(
        weekly["actual"].to_numpy(float), weekly["forecast"].to_numpy(float)
    )
    print("WEEKLY ROLL-UP:", {k: round(v, 4) for k, v in rollout.items()}, flush=True)

    TEST_PRED.parent.mkdir(parents=True, exist_ok=True)
    test_meta.to_csv(TEST_PRED, index=False, compression="gzip")
    print(f"Saved {TEST_PRED}", flush=True)


if __name__ == "__main__":
    main()
