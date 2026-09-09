#!/usr/bin/env python3
"""
MedBridge -- model-comparison figure (reads report CSV, no refitting).

Draws the final 3-panel comparison figure from reports/model_comparison.csv
(produced by notebooks/02_model_comparison.ipynb):

  Panel 1  accuracy      R² (units) and R² (log1p)           higher = better
  Panel 2  absolute err  MAE and RMSE (log scale)            lower  = better
  Panel 3  relative err  WAPE % and sMAPE % (log scale)      lower  = better

Linear Regression is off the unit scale (R² = -101.9, RMSE = 3,017 units) so
its unit-scale bar is annotated instead of drawn; its log-space value is
plotted. Naive baselines are listed/saved but omitted from the bars.
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REPORTS = ROOT / "reports"
CSV = REPORTS / "model_comparison.csv"
OUT = REPORTS / "model_comparison_figure.png"

NAVY, TEAL, AMBER, CORAL, GREY, LIGHT = (
    "#233A5C", "#0E8C82", "#E8A23D", "#D96C5F", "#8A94A3", "#E4E9EE",
)
MODEL_ORDER = ["XGBoost", "Random Forest", "Decision Tree", "Linear Regression"]
PALETTE = {
    "XGBoost": TEAL,
    "Random Forest": NAVY,
    "Decision Tree": AMBER,
    "Linear Regression": CORAL,
}


def main() -> None:
    data = pd.read_csv(CSV)
    show = data[data["Model"].isin(MODEL_ORDER)].copy()
    for col in ("R2", "R2_log1p", "MAE", "RMSE", "WAPE_pct", "sMAPE_pct", "seconds"):
        show[col] = pd.to_numeric(show[col], errors="coerce")
    # order: strongest first
    show["order"] = show["Model"].map({m: i for i, m in enumerate(MODEL_ORDER)})
    show = show.sort_values("order").reset_index(drop=True)
    names = show["Model"].tolist()
    x = np.arange(len(names))

    fig, axes = plt.subplots(1, 3, figsize=(15.4, 4.9))

    # ---------------- Panel 1: accuracy -------------------------------------
    ax = axes[0]
    w = 0.38
    r2_log = show["R2_log1p"].to_numpy()
    r2_units = show["R2"].to_numpy()
    b_log = ax.bar(x + w / 2, r2_log, w, color=TEAL, label="R² (log1p)")
    # unit-scale R²: draw only where >= 0; annotate otherwise
    b_unit = ax.bar(x - w / 2, np.maximum(r2_units, 0.0), w, color=NAVY, label="R² (units)")
    for i, (name, val) in enumerate(zip(names, r2_units)):
        if val < 0:
            ax.text(i - w / 2, 0.02, f"R² = {val:.0f}\n(off scale)",
                    ha="center", va="bottom", fontsize=7.5, color=CORAL, fontweight="bold")
        else:
            ax.text(i - w / 2, val + 0.015, f"{val:.3f}", ha="center", va="bottom",
                    fontsize=8, color=NAVY, fontweight="bold")
        ax.text(i + w / 2, r2_log[i] + 0.015, f"{r2_log[i]:.3f}", ha="center", va="bottom",
                fontsize=8, color=TEAL, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=16, ha="right", fontsize=9.5)
    ax.set_ylim(0, 1.12)
    ax.set_ylabel("R²  (higher is better)", fontsize=10.5)
    ax.set_title("Accuracy on the hold-out test set", fontweight="bold", fontsize=12, pad=26)
    # Legend ABOVE the axes so it never covers the tallest (XGBoost) bars.
    ax.legend(fontsize=8.5, loc="lower center", bbox_to_anchor=(0.5, 1.02), ncol=2)
    ax.grid(axis="x", visible=False)
    ax.axhline(0, color=GREY, lw=0.9)

    # ---------------- Panel 2: absolute errors (log scale) ------------------
    ax = axes[1]
    mae = show["MAE"].to_numpy()
    rmse = show["RMSE"].to_numpy()
    b1 = ax.bar(x - w / 2, mae, w, color=NAVY, label="MAE (units)")
    b2 = ax.bar(x + w / 2, rmse, w, color=AMBER, label="RMSE (units)")
    for i in range(len(names)):
        ax.text(i - w / 2, mae[i] * 1.12, f"{mae[i]:,.1f}", ha="center", va="bottom",
                fontsize=8, color=NAVY, fontweight="bold")
        ax.text(i + w / 2, rmse[i] * 1.12, f"{rmse[i]:,.0f}", ha="center", va="bottom",
                fontsize=8, color=AMBER, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=16, ha="right", fontsize=9.5)
    ax.set_yscale("log")
    ax.set_ylim(3, 20_000)
    ax.set_ylabel("demand units  (log scale, lower is better)", fontsize=10.5)
    ax.set_title("Absolute errors", fontweight="bold", fontsize=12)
    ax.legend(fontsize=8.5, loc="upper left")
    ax.grid(axis="x", visible=False)

    # ---------------- Panel 3: relative errors (log scale) ------------------
    ax = axes[2]
    wape = show["WAPE_pct"].to_numpy()
    smape = show["sMAPE_pct"].to_numpy()
    b1 = ax.bar(x - w / 2, wape, w, color=NAVY, label="WAPE %")
    b2 = ax.bar(x + w / 2, smape, w, color=CORAL, label="sMAPE %")
    for i in range(len(names)):
        ax.text(i - w / 2, wape[i] * 1.12, f"{wape[i]:.1f}%", ha="center", va="bottom",
                fontsize=8, color=NAVY, fontweight="bold")
        ax.text(i + w / 2, smape[i] * 1.12, f"{smape[i]:.1f}%", ha="center", va="bottom",
                fontsize=8, color=CORAL, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=16, ha="right", fontsize=9.5)
    ax.set_yscale("log")
    ax.set_ylim(5, 400)
    ax.set_ylabel("percent  (log scale, lower is better)", fontsize=10.5)
    ax.set_title("Relative errors", fontweight="bold", fontsize=12)
    ax.legend(fontsize=8.5, loc="upper left")
    ax.grid(axis="x", visible=False)

    # ---------------- footnote ----------------------------------------------
    ftext = (
        "Same features (51), chronological split (train 2023-03-27…2025-12-29 · valid 2026-01-05…2026-03-30 "
        "· test 2026-04-06…2026-06-29), log1p target for all families.\n"
        "Shared hyperparameters: 800 estimators · max_depth 5 · subsample 0.80 · colsample 0.80 · "
        "min_child_weight 12 (→ min_samples_leaf 12 for DT/RF) · random_state 42.\n"
        "Linear Regression has no hyperparameters (plain OLS). Naive baselines (CSV): last-week R²=0.844 · "
        "4-wk mean R²=0.872 — below every trained family."
    )
    fig.text(0.5, -0.045, ftext, ha="center", va="top", fontsize=8.6, color=GREY,
             linespacing=1.5)
    fig.suptitle(
        "Weekly demand model — Linear Regression vs Decision Tree vs Random Forest vs XGBoost "
        "(n = 38,376 hold-out test rows)",
        fontweight="bold", fontsize=13, y=1.005,
    )
    fig.tight_layout(rect=(0, 0.02, 1, 0.99))
    fig.savefig(OUT, dpi=200, bbox_inches="tight")
    print(f"saved {OUT}")
    print(show[["Model", "seconds", "R2", "R2_log1p", "MAE", "RMSE", "WAPE_pct", "sMAPE_pct"]]
          .round(3).to_string(index=False))


if __name__ == "__main__":
    main()
