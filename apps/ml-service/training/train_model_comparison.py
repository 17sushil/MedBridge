#!/usr/bin/env python3
"""
MedBridge — end-to-end model comparison: Linear Regression vs Decision Tree
vs Random Forest vs XGBoost (REAL training, no sampling, no shortcuts)
===========================================================================

What this script does
---------------------
1. Loads the leakage-safe weekly feature table (`data/processed/demand_features.csv`).
2. Splits it CHRONOLOGICALLY (no shuffling):
       train      2023-03-27 .. 2025-12-29   (428,040 rows)
       validation 2026-01-05 .. 2026-03-30   (early stopping only, XGBoost)
       test       2026-04-06 .. 2026-06-29   (38,376 rows — every metric here)
3. Trains FOUR model families from scratch on the FULL training set, using the
   SAME hyperparameters wherever a knob exists in more than one family, so the
   comparison isolates the algorithm — not the tuning.
4. Evaluates every model on the identical hold-out test set with the identical
   metrics (R², MAE, RMSE, WAPE, sMAPE) on the original demand-unit scale.
5. Appends two naive baselines (last week, 4-week mean) for context — a model is
   only worth deploying if it beats simple persistence.
6. Writes `reports/model_comparison.csv`, prints the summary table and then
   regenerates `reports/model_comparison_figure.png` (the 3-panel figure).

Fair-comparison rules enforced here (same as `notebooks/02_model_comparison.ipynb`)
--------------------------------------------------------------------------------
* Same 51 features, same split, same `log1p` target transform for every family.
* `hospital_id` / `medicine_id` are identifiers, never features; categorical
  encoders are fitted on the TRAINING split only (leakage-safe, no future info).
  The leakage audit from `training/train_xgb.py` applies unchanged.
* Shared knobs are identical: 800 estimators · max_depth 5 · subsample 0.80 ·
  colsample 0.80 · min_child_weight 12 (= min_samples_leaf 12) · seed 42.
  XGBoost keeps the production-only knobs (lr 0.03, L1 0.20, L2 3.0, gamma 0.02,
  early stopping on validation). LinearRegression is plain OLS — no knobs.
* Memory note: fitted estimators and wide frames are freed (`del` + `gc.collect`)
  after each family so the whole comparison runs on a 2 GB machine.

Usage
-----
    cd apps/ml-service
    python training/train_model_comparison.py            # train + CSV + figure
    python training/train_model_comparison.py --skip-plot  # CSV only

Reproduces exactly:
    reports/model_comparison.csv
    reports/model_comparison_figure.png
"""
from __future__ import annotations

import argparse
import gc
import sys
import time
import warnings
from pathlib import Path

import matplotlib

matplotlib.use("Agg")


# ---------------------------------------------------------------------------
# Repository layout helpers
# ---------------------------------------------------------------------------
def find_root() -> Path:
    """Locate the ml-service root (the dir that contains training/ and data/)."""
    here = Path(__file__).resolve().parent  # .../apps/ml-service/training
    root = here.parent
    if not (root / "data" / "processed").exists():
        raise SystemExit(
            f"Expected ml-service layout under {root} — run from the repo. "
            "If the feature table is missing, generate it first:\n"
            "    python training/generate_ledger_data.py"
        )
    return root


ROOT = find_root()
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REPORTS = ROOT / "reports"
REPORTS.mkdir(parents=True, exist_ok=True)

warnings.filterwarnings("ignore")  # keep the console free of sklearn/xgb noise

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

# Reuse the production helper functions so the comparison uses EXACTLY the
# same split logic, encoding and metric definitions as train_xgb.py.
from training.train_xgb import (  # noqa: E402
    DROP_COLS,
    chronological_split,
    encode_categoricals,
    metrics_dict,
)


# ---------------------------------------------------------------------------
# Shared hyperparameter constants (the production XGBoost table)
# ---------------------------------------------------------------------------
N_ESTIMATORS = 800        # XGBoost & Random Forest
MAX_DEPTH = 5             # XGBoost, Random Forest & Decision Tree
LEARNING_RATE = 0.03      # XGBoost only (no counterpart in sklearn trees)
SUBSAMPLE = 0.80          # XGBoost -> RandomForest(max_samples=0.80)
COLSAMPLE = 0.80          # XGBoost -> RandomForest(max_features=0.80)
MIN_CHILD_WEIGHT = 12     # XGBoost -> min_samples_leaf=12 for DT / RF
SEED = 42                 # everything that takes a random_state

# XGBoost keeps its production regularisation (validated in train_xgb.py)
XGB_REG_ALPHA, XGB_REG_LAMBDA, XGB_GAMMA = 0.20, 3.0, 0.02
EARLY_STOPPING_ROUNDS = 50
TARGET_COL = "target_demand"     # weekly demand in units (log1p-transformed)


# ---------------------------------------------------------------------------
# Step 1 — load the feature table and split it chronologically
# ---------------------------------------------------------------------------
def load_and_split() -> tuple:
    """Return the feature DataFrame plus the train/valid/test masks + split info."""
    features_path = ROOT / "data" / "processed" / "demand_features.csv"
    print(f"[1/5] Loading {features_path.name} ...", flush=True)
    df = pd.read_csv(features_path, parse_dates=["week_start"])
    print(f"      feature rows={len(df):,}  columns={df.shape[1]}", flush=True)

    train_mask, valid_mask, test_mask, split = chronological_split(df)
    print("      chronological split:", split, flush=True)
    return df, train_mask, valid_mask, test_mask, split


# ---------------------------------------------------------------------------
# Step 2 — encode categoricals (train-only) and build memory-lean matrices
# ---------------------------------------------------------------------------
def build_matrices(df: pd.DataFrame, train_mask, valid_mask, test_mask):
    """
    Encode categorical columns with encoders fitted on the TRAIN split only,
    then assemble X/y as float32 NumPy arrays for all three splits.

    Memory strategy (2 GB box): the wide pandas frames are deleted as soon as
    the matrices exist; the naive-baseline predictors are captured first.
    """
    print("[2/5] Encoding categoricals (fitted on train only) ...", flush=True)
    encoded, _encoders = encode_categoricals(df, train_mask)
    feature_cols = [c for c in encoded.columns if c not in DROP_COLS]
    for c in feature_cols:  # make every feature numeric + dense
        encoded[c] = pd.to_numeric(encoded[c], errors="coerce").fillna(0).astype("float32")
    print(f"      features={len(feature_cols)}", flush=True)

    X_train = encoded.loc[train_mask, feature_cols].to_numpy(dtype="float32")
    X_valid = encoded.loc[valid_mask, feature_cols].to_numpy(dtype="float32")
    X_test = encoded.loc[test_mask, feature_cols].to_numpy(dtype="float32")
    # log1p on the target: multiplicative demand is modelled in log space
    y_train = np.log1p(df.loc[train_mask, TARGET_COL].to_numpy(dtype="float32"))
    y_valid = np.log1p(df.loc[valid_mask, TARGET_COL].to_numpy(dtype="float32"))
    y_test = df.loc[test_mask, TARGET_COL].to_numpy(dtype="float32")  # units!

    # naive persistence baselines: predictors ANY hospital can use with zero ML
    naive_last_week = encoded.loc[test_mask, "lag_1w"].to_numpy(dtype="float32")
    naive_4wk_mean = encoded.loc[test_mask, "roll_mean_4w"].to_numpy(dtype="float32")

    # free the wide frames before training the ensembles
    del df, encoded
    gc.collect()

    print(f"      train={X_train.shape}  valid={X_valid.shape}  test={X_test.shape}", flush=True)
    return X_train, X_valid, X_test, y_train, y_valid, y_test, naive_last_week, naive_4wk_mean


# ---------------------------------------------------------------------------
# Step 3 — the four candidate families (same knobs where knobs exist)
# ---------------------------------------------------------------------------
def build_models() -> dict:
    """Instantiate the four families with the aligned hyperparameters."""
    from sklearn.linear_model import LinearRegression
    from sklearn.tree import DecisionTreeRegressor
    from sklearn.ensemble import RandomForestRegressor
    from xgboost import XGBRegressor

    return {
        # plain OLS — the honest baseline: no tunable hyperparameters at all
        "Linear Regression": LinearRegression(),
        # single tree: same depth + same leaf-size constraint as XGBoost
        "Decision Tree": DecisionTreeRegressor(
            max_depth=MAX_DEPTH,
            min_samples_leaf=MIN_CHILD_WEIGHT,
            random_state=SEED,
        ),
        # bagged trees: 800 trees, row+column subsampling mirrors XGBoost's
        # subsample/colsample; n_jobs=-1 uses every core
        "Random Forest": RandomForestRegressor(
            n_estimators=N_ESTIMATORS,
            max_depth=MAX_DEPTH,
            min_samples_leaf=MIN_CHILD_WEIGHT,
            max_samples=SUBSAMPLE,
            max_features=COLSAMPLE,
            n_jobs=-1,
            random_state=SEED,
        ),
        # production model: gradient boosting + early stopping on validation,
        # keeping the production regularisation from training/train_xgb.py
        "XGBoost": XGBRegressor(
            n_estimators=N_ESTIMATORS,
            max_depth=MAX_DEPTH,
            learning_rate=LEARNING_RATE,
            subsample=SUBSAMPLE,
            colsample_bytree=COLSAMPLE,
            min_child_weight=MIN_CHILD_WEIGHT,
            reg_alpha=XGB_REG_ALPHA,
            reg_lambda=XGB_REG_LAMBDA,
            gamma=XGB_GAMMA,
            tree_method="hist",
            n_jobs=-1,
            random_state=SEED,
            early_stopping_rounds=EARLY_STOPPING_ROUNDS,
        ),
    }


# ---------------------------------------------------------------------------
# Step 4 — fit every family on the FULL training set and score on the test set
# ---------------------------------------------------------------------------
def fit_and_score(models: dict, matrices: tuple) -> pd.DataFrame:
    """
    Train each model on all 428,040 training rows (validation set is used ONLY
    for XGBoost early stopping), predict the 38,376 test rows and score them on
    the original demand-unit scale (expm1 of the log-space prediction, clipped
    at zero — demand cannot be negative).
    """
    X_train, X_valid, X_test, y_train, y_valid, y_test, naive_last_week, naive_4wk_mean = matrices

    print("[3/5] Training 4 families on the full training set ...", flush=True)
    results: list[dict] = []
    for name, model in models.items():
        t0 = time.time()
        print(f"      fitting {name} ... ({len(X_train):,} rows)", flush=True)
        # XGBoost gets the validation set for early stopping; the others don't
        # (they have no such mechanism with the same semantics).
        if name == "XGBoost":
            model.fit(X_train, y_train, eval_set=[(X_valid, y_valid)], verbose=False)
        else:
            model.fit(X_train, y_train)
        # back to demand units: clip at 0, then expm1 (inverse of log1p)
        pred = np.maximum(0.0, np.expm1(model.predict(X_test)))
        results.append({
            "Model": name,
            "seconds": round(time.time() - t0, 1),
            **metrics_dict(y_test, pred),
        })
        del model  # free the fitted estimator before the next family (2 GB box)
        gc.collect()

    print("[4/5] Scoring naive persistence baselines ...", flush=True)
    for bname, base_pred in [
        ("Naive: last week", naive_last_week),     # "next week = this week"
        ("Naive: 4-wk mean", naive_4wk_mean),      # "next week = last 4-wk mean"
    ]:
        results.append({"Model": bname, "seconds": 0.0, **metrics_dict(y_test, base_pred)})

    comparison = (pd.DataFrame(results)
                  .sort_values("R2", ascending=False)
                  .reset_index(drop=True))
    return comparison


# ---------------------------------------------------------------------------
# Step 5 — save the CSV, print the table, regenerate the figure
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-plot", action="store_true",
                        help="only (re)train and write the CSV, skip the figure")
    args = parser.parse_args()

    df, train_mask, valid_mask, test_mask, split = load_and_split()
    matrices = build_matrices(df, train_mask, valid_mask, test_mask)
    comparison = fit_and_score(build_models(), matrices)

    csv_path = REPORTS / "model_comparison.csv"
    comparison.to_csv(csv_path, index=False)
    print(f"[5/5] saved {csv_path}", flush=True)

    pretty = comparison[["Model", "seconds", "R2", "MAE", "RMSE",
                         "WAPE_pct", "sMAPE_pct"]].round(3)
    print("\n=== hold-out test results (n = 38,376 rows) ===")
    print(pretty.to_string(index=False))

    # regenerate the 3-panel figure from the CSV above (no refitting needed)
    if not args.skip_plot:
        print("\nregenerating figure ...", flush=True)
        from training.plot_model_comparison import main as plot_main
        plot_main()


if __name__ == "__main__":
    main()
