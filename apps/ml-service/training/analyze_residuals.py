#!/usr/bin/env python3
"""
MedBridge — Residual & test-set evaluation (real training/test evaluation).

Loads the trained XGBoost model bundle, rebuilds the EXACT chronological
hold-out split used at training time (same helper functions as
training/train_xgb.py), predicts the hold-out test set, and produces:

  Fig 1  reports/residual_analysis/residual_distribution_and_error_analysis.png
         - distribution of prediction residuals (actual - predicted)
         - error analysis by medicine category and by hospital type
  Fig 2  reports/residual_analysis/actual_vs_predicted_test_set.png
         - actual vs predicted weekly demand on the hold-out test set
           (per series scatter + weekly aggregate time series)

Also writes residual_stats.csv, error_by_category.csv,
error_by_facility_type.csv and test_predictions.csv next to the figures.

Run from apps/ml-service:
    python3 training/analyze_residuals.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
DATA = ROOT / "data" / "processed" / "demand_features.csv"
MODEL = ROOT / "artifacts" / "models" / "xgb_demand_model.joblib"
ENC = ROOT / "artifacts" / "encoders" / "label_encoders.joblib"
OUT = ROOT / "reports" / "residual_analysis"

# Palette shared with notebooks/04
NAVY, TEAL, AMBER, CORAL, GREY, LIGHT = (
    "#233A5C", "#0E8C82", "#E8A23D", "#D96C5F", "#8A94A3", "#E4E9EE",
)

from training.train_xgb import (  # noqa: E402
    chronological_split,
    metrics_dict,
    DROP_COLS,
)


def encode_with_saved_encoders(df: pd.DataFrame, cat_cols: list[str]) -> pd.DataFrame:
    """Encode categoricals with the encoders saved at training time (which were
    fitted on TRAIN rows only — same guarantee as the training path). Unseen
    values fall back to the encoder's first class (same as serving)."""
    encoders = joblib.load(ENC)
    out = df.copy()
    for col in cat_cols:
        if col not in out.columns or col not in encoders:
            continue
        enc = encoders[col]
        known = set(enc.classes_)
        fallback = enc.classes_[0]
        values = out[col].fillna("UNKNOWN").astype(str)
        mapped = values.map(lambda v: v if v in known else fallback)
        try:
            out[col] = enc.transform(mapped)
        except ValueError:
            out[col] = enc.transform(mapped.where(mapped.isin(known), fallback))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bundle = joblib.load(MODEL)
    model = bundle["model"]
    feature_columns = bundle["feature_columns"]
    cat_cols = bundle.get("cat_cols", [])

    print(f"Loading features from {DATA} ...")
    df = pd.read_csv(DATA, parse_dates=["week_start"])
    print(f"  rows={len(df):,} cols={df.shape[1]}")

    train_mask, valid_mask, test_mask, split_desc = chronological_split(df)
    print(f"  split: train {split_desc['train']} | valid {split_desc['validation']} "
          f"| test {split_desc['test']}")

    print("Encoding categoricals (saved train-fitted encoders) ...")
    encoded = encode_with_saved_encoders(df, cat_cols)
    for col in feature_columns:
        encoded[col] = pd.to_numeric(encoded[col], errors="coerce").fillna(0).astype("float32")

    test = encoded.loc[test_mask]
    X_test = test[feature_columns]
    y_test = df.loc[test_mask, "target_demand"].astype(float).to_numpy()

    print(f"Predicting hold-out test set ({len(X_test):,} rows, {len(feature_columns)} features) ...")
    # Model was trained on log1p(target); inverse is expm1 (same as serving).
    pred = np.maximum(0.0, np.expm1(model.predict(X_test)))

    resid = y_test - pred
    abs_err = np.abs(resid)

    # ------------------------------------------------------------------ metrics
    met = metrics_dict(y_test, pred)
    print("\n=== Hold-out test metrics ===")
    for k, v in met.items():
        print(f"  {k}: {v}")

    stats_df = pd.DataFrame(
        {
            "metric": [
                "n", "mean_actual", "mean_pred", "MAE", "RMSE", "R2",
                "R2_log1p", "WAPE_pct", "sMAPE_pct", "residual_mean",
                "residual_median", "residual_std", "residual_p5",
                "residual_p95", "pct_within_+/-_25_units",
            ],
            "value": [
                len(y_test), float(y_test.mean()), float(pred.mean()),
                met["MAE"], met["RMSE"], met["R2"], met["R2_log1p"],
                met["WAPE_pct"], met["sMAPE_pct"],
                float(resid.mean()), float(np.median(resid)), float(resid.std()),
                float(np.percentile(resid, 5)), float(np.percentile(resid, 95)),
                float(100 * (abs_err <= 25).mean()),
            ],
        }
    )
    stats_df.to_csv(OUT / "residual_stats.csv", index=False)

    meta = df.loc[test_mask, ["week_start", "hospital_id", "medicine_id", "category", "facility_type"]].copy()
    meta["actual"] = y_test
    meta["predicted"] = pred
    meta["residual"] = resid
    meta["abs_error"] = abs_err
    meta.to_csv(OUT / "test_predictions.csv", index=False)

    # ================================================================== FIG 1
    # Residual distribution + error by category / hospital type.
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))

    ax = axes[0]
    ax.hist(resid, bins=120, color=NAVY, edgecolor="none", alpha=0.9)
    ax.axvline(0, color=CORAL, lw=1.6, ls="--")
    ax.axvline(resid.mean(), color=AMBER, lw=1.6, ls=":", label=f"mean {resid.mean():+.1f}")
    ax.axvline(np.median(resid), color=TEAL, lw=1.6, ls=":", label=f"median {np.median(resid):+.1f}")
    ax.set_title("Residual distribution (hold-out test)", fontweight="bold")
    ax.set_xlabel("residual = actual − predicted (units)")
    ax.set_ylabel("count")
    ax.legend(fontsize=8)
    ax.text(
        0.98, 0.97,
        f"n = {len(resid):,}\nmean = {resid.mean():+.1f}\nstd = {resid.std():.1f}\n"
        f"P5 = {np.percentile(resid, 5):+.1f}\nP95 = {np.percentile(resid, 95):+.1f}",
        transform=ax.transAxes, ha="right", va="top", fontsize=9,
        bbox=dict(boxstyle="round", fc=LIGHT, ec=GREY, alpha=0.85),
    )

    ax = axes[1]
    g = meta.groupby("category").agg(mae=("abs_error", "mean"), n=("actual", "size"))
    g = g[g["n"] > 100].sort_values("mae", ascending=False).head(12)
    ax.barh(g.index[::-1], g["mae"][::-1], color=NAVY)
    for i, (idx, row) in enumerate(g[::-1].iterrows()):
        ax.text(row["mae"] + 0.4, i, f"n={int(row['n']):,}", va="center", fontsize=8, color=GREY)
    ax.set_title("MAE by medicine category (top 12)", fontweight="bold")
    ax.set_xlabel("mean absolute error (units)")

    ax = axes[2]
    g = meta.groupby("facility_type").agg(mae=("abs_error", "mean"), n=("actual", "size"))
    g = g.sort_values("mae", ascending=False)
    ax.barh(g.index[::-1], g["mae"][::-1], color=TEAL)
    for i, (idx, row) in enumerate(g[::-1].iterrows()):
        ax.text(row["mae"] + 0.4, i, f"n={int(row['n']):,}", va="center", fontsize=8, color=GREY)
    ax.set_title("MAE by hospital type (facility type)", fontweight="bold")
    ax.set_xlabel("mean absolute error (units)")

    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
    plt.tight_layout()
    fig.savefig(OUT / "residual_distribution_and_error_analysis.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved {OUT / 'residual_distribution_and_error_analysis.png'}")

    meta.groupby("category").agg(mae=("abs_error", "mean"), n=("actual", "size")) \
        .sort_values("mae", ascending=False).to_csv(OUT / "error_by_category.csv")
    meta.groupby("facility_type").agg(mae=("abs_error", "mean"), n=("actual", "size")) \
        .sort_values("mae", ascending=False).to_csv(OUT / "error_by_facility_type.csv")

    # ================================================================== FIG 2
    # Actual vs predicted on the hold-out test set.
    fig, axes = plt.subplots(1, 2, figsize=(15, 5.5))

    ax = axes[0]
    lo = np.percentile(np.concatenate([y_test, pred]), 0.5)
    hi = np.percentile(np.concatenate([y_test, pred]), 99.5)
    ax.hexbin(y_test, pred, gridsize=70, cmap="Blues", mincnt=1,
              extent=(lo, hi, lo, hi))
    lims = [lo, hi]
    ax.plot(lims, lims, color=CORAL, ls="--", lw=1.6, label="perfect prediction")
    ax.set_xlim(lims); ax.set_ylim(lims)
    ax.set_xlabel("actual weekly demand (units)")
    ax.set_ylabel("predicted weekly demand (units)")
    ax.set_title("Actual vs predicted — hold-out test set", fontweight="bold")
    ax.text(
        0.04, 0.96,
        f"R² = {met['R2']:.4f}\nMAE = {met['MAE']:.2f}\nWAPE = {met['WAPE_pct']:.2f}%\nn = {len(y_test):,}",
        transform=ax.transAxes, ha="left", va="top", fontsize=10,
        bbox=dict(boxstyle="round", fc=LIGHT, ec=GREY, alpha=0.9),
    )
    ax.legend(loc="lower right", fontsize=9)

    ax = axes[1]
    wk = meta.groupby("week_start").agg(actual=("actual", "sum"), predicted=("predicted", "sum"))
    ax.plot(wk.index, wk["actual"], color=NAVY, lw=2, marker="o", ms=3.5, label="actual demand")
    ax.plot(wk.index, wk["predicted"], color=TEAL, lw=2, ls="--", marker="o", ms=3.5, label="XGBoost prediction")
    ax.fill_between(wk.index, wk["actual"], wk["predicted"], color=CORAL, alpha=0.15)
    ax.set_title("Weekly aggregate demand — actual vs predicted", fontweight="bold")
    ax.set_xlabel("week"); ax.set_ylabel("total units (all hospitals)")
    ax.legend(fontsize=9)
    wk_mae = (wk["actual"] - wk["predicted"]).abs().mean()
    ax.text(0.02, 0.97, f"weekly aggregate MAE = {wk_mae:,.0f} units",
            transform=ax.transAxes, fontsize=10, va="top",
            bbox=dict(boxstyle="round", fc=LIGHT, ec=GREY, alpha=0.9))

    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
    plt.tight_layout()
    fig.savefig(OUT / "actual_vs_predicted_test_set.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved {OUT / 'actual_vs_predicted_test_set.png'}")

    # ================================================================== FIG 3
    # Per-hospital hold-out R² (demo hospitals highlighted).
    hospitals = pd.read_csv(ROOT / "data" / "raw" / "hospitals.csv")
    demo_ids = set(hospitals.loc[hospitals["is_demo"] == 1, "hospital_id"])

    per_hosp = []
    for hid, grp in meta.groupby("hospital_id"):
        r2 = np.nan
        if grp["actual"].nunique() > 1 and len(grp) > 2:
            r2 = 1 - ((grp["actual"] - grp["predicted"]) ** 2).sum() / (
                (grp["actual"] - grp["actual"].mean()) ** 2).sum()
        per_hosp.append({
            "hospital_id": hid, "R2": r2,
            "MAE": grp["abs_error"].mean(), "n": len(grp),
        })
    # Ascending so barh draws the best hospital at the top.
    per_hosp = pd.DataFrame(per_hosp).dropna(subset=["R2"]).sort_values("R2", ascending=True)

    fig, ax = plt.subplots(figsize=(11, max(6, 0.28 * len(per_hosp) + 2)))
    colors = [TEAL if h in demo_ids else GREY for h in per_hosp["hospital_id"]]
    ax.barh(per_hosp["hospital_id"], per_hosp["R2"], color=colors)
    for i, (h, row) in enumerate(per_hosp.iterrows()):
        ax.text(
            row["R2"] + 0.004, i,
            f"{row['R2']:.3f} · n={int(row['n']):,}" + (" ★" if h in demo_ids else ""),
            va="center", fontsize=7.5, color=NAVY if h in demo_ids else GREY,
        )
    ax.axvline(0, color=CORAL, lw=1.2, ls="--")
    ax.set_xlim(-0.05, 1.05)
    ax.set_title("Per-hospital hold-out R²  (teal = demonstration hospitals)", fontweight="bold")
    ax.set_xlabel("R² on the hold-out test set")
    from matplotlib.patches import Patch
    ax.legend(
        handles=[Patch(color=TEAL, label="demo hospital (seeded login)"),
                 Patch(color=GREY, label="network hospital")],
        loc="lower right", fontsize=9,
    )
    ax.spines[["top", "right"]].set_visible(False)
    plt.tight_layout()
    fig.savefig(OUT / "per_hospital_holdout_r2.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved {OUT / 'per_hospital_holdout_r2.png'}")
    per_hosp.to_csv(OUT / "per_hospital_holdout_r2.csv", index=False)
    print("\nPer-hospital R² (demo marked):")
    print(per_hosp.assign(demo=per_hosp["hospital_id"].isin(demo_ids).map({True: "★demo", False: ""}))
          .head(10).to_string(index=False))

    # ================================================================== FIG 4
    # Training vs validation loss (log-space RMSE) per boosting round.
    hist_path = ROOT / "artifacts" / "metrics" / "training_history.csv"
    if hist_path.exists():
        hist = pd.read_csv(hist_path)
        best_iter = bundle.get("best_iteration") if bundle.get("best_iteration") is not None else None

        fig, ax = plt.subplots(figsize=(10, 4.8))
        ax.plot(hist["iteration"], hist["train_log_rmse"], color=GREY, lw=1.4,
                label="training (log-space RMSE)")
        ax.plot(hist["iteration"], hist["validation_log_rmse"], color=TEAL, lw=1.8,
                label="validation (log-space RMSE)")
        if best_iter is not None:
            ax.axvline(best_iter, color=CORAL, ls="--", lw=1.6)
            best_val = hist.loc[hist["iteration"] == best_iter, "validation_log_rmse"]
            if len(best_val):
                ax.scatter([best_iter], [best_val.iloc[0]], color=CORAL, zorder=5, s=45)
            ax.annotate(
                f"early stop @ iter {best_iter}\nval log-RMSE {hist.loc[hist['iteration'] == best_iter, 'validation_log_rmse'].iloc[0]:.4f}",
                xy=(best_iter, hist.loc[hist["iteration"] == best_iter, "validation_log_rmse"].iloc[0]),
                xytext=(best_iter - 180, ax.get_ylim()[1] * 0.72),
                color=CORAL, fontsize=9, ha="right",
                arrowprops=dict(arrowstyle="->", color=CORAL, lw=1.2),
            )
        ax.set_title("XGBoost learning curve — train vs validation loss (log1p RMSE)",
                     fontweight="bold")
        ax.set_xlabel("boosting iteration"); ax.set_ylabel("log1p space RMSE")
        ax.legend(fontsize=9)
        ax.grid(alpha=0.25); ax.spines[["top", "right"]].set_visible(False)
        plt.tight_layout()
        fig.savefig(OUT / "training_validation_loss.png", dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"Saved {OUT / 'training_validation_loss.png'}")
        print(f"  best_iteration={best_iter} | train log-RMSE last={hist['train_log_rmse'].iloc[-1]:.4f} "
              f"| val @ best={hist.loc[hist['iteration'] == best_iter, 'validation_log_rmse'].iloc[0]:.4f}")
    else:
        print("training_history.csv not found — skipping Fig 4 (run training/train_xgb.py)")

    # ------------------------------------------------------------------ summary
    print("\n=== Error analysis summary ===")
    print("\nTop 6 categories by MAE:")
    print(meta.groupby("category").agg(mae=("abs_error", "mean"), n=("actual", "size"))
          .sort_values("mae", ascending=False).head(6).round(2).to_string())
    print("\nBy hospital type:")
    print(meta.groupby("facility_type").agg(mae=("abs_error", "mean"), n=("actual", "size"))
          .sort_values("mae", ascending=False).round(2).to_string())


if __name__ == "__main__":
    main()
