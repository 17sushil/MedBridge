#!/usr/bin/env python3
"""
MedBridge -- model-comparison figure (reads report CSV, no refitting).

Draws the final 3-panel comparison figure from reports/model_comparison.csv
(produced by notebooks/02_model_comparison.ipynb):

  Panel 1  accuracy      R² in demand units (single series)   higher = better
  Panel 2  absolute err  MAE and RMSE (log scale)             lower  = better
  Panel 3  relative err  WAPE % and sMAPE % (log scale)       lower  = better

Linear Regression is EXCLUDED from the figure (its hold-out R² = -101.9 is
negative / off-scale); it remains documented in the CSV and in
reports/model_comparison_hyperparameters.md. Naive baselines are saved in the
CSV but omitted from the bars. No footnote clutter on the figure.
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
MODEL_ORDER = ["XGBoost", "Random Forest", "Decision Tree"]
MODEL_COLORS = {
    "XGBoost": TEAL,
    "Random Forest": NAVY,
    "Decision Tree": AMBER,
}


def main() -> None:
    data = pd.read_csv(CSV)
    show = data[data["Model"].isin(MODEL_ORDER)].copy()
    for col in ("R2", "MAE", "RMSE", "WAPE_pct", "sMAPE_pct", "seconds"):
        show[col] = pd.to_numeric(show[col], errors="coerce")
    show["order"] = show["Model"].map({m: i for i, m in enumerate(MODEL_ORDER)})
    show = show.sort_values("order").reset_index(drop=True)
    names = show["Model"].tolist()
    x = np.arange(len(names))
    w = 0.5

    fig, axes = plt.subplots(1, 3, figsize=(14.6, 4.4))

    # ---------------- Panel 1: accuracy (R², units) -------------------------
    ax = axes[0]
    r2 = show["R2"].to_numpy()
    colors = [MODEL_COLORS[m] for m in names]
    ax.bar(x, r2, w, color=colors)
    for i, val in enumerate(r2):
        ax.text(i, val + 0.015, f"{val:.3f}", ha="center", va="bottom",
                fontsize=9.5, color=NAVY, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=16, ha="right", fontsize=9.5)
    ax.set_ylim(0, 1.12)
    ax.set_ylabel("R² (units)  ·  higher is better", fontsize=10.5)
    ax.set_title("Accuracy", fontweight="bold", fontsize=12)
    ax.grid(axis="x", visible=False)
    ax.axhline(0, color=GREY, lw=0.9)

    # ---------------- Panel 2: absolute errors (log scale) ------------------
    ax = axes[1]
    mae = show["MAE"].to_numpy()
    rmse = show["RMSE"].to_numpy()
    b1 = ax.bar(x - w / 2, mae, w / 1.7, color=NAVY, label="MAE (units)")
    b2 = ax.bar(x + w / 2, rmse, w / 1.7, color=AMBER, label="RMSE (units)")
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
    b1 = ax.bar(x - w / 2, wape, w / 1.7, color=NAVY, label="WAPE %")
    b2 = ax.bar(x + w / 2, smape, w / 1.7, color=CORAL, label="sMAPE %")
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

    fig.suptitle(
        "Weekly demand model — Decision Tree vs Random Forest vs XGBoost "
        "(n = 38,376 hold-out test rows)",
        fontweight="bold", fontsize=13, y=1.0,
    )
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    fig.savefig(OUT, dpi=200, bbox_inches="tight")
    print(f"saved {OUT}")
    print(show[["Model", "seconds", "R2", "MAE", "RMSE", "WAPE_pct", "sMAPE_pct"]]
          .round(3).to_string(index=False))


if __name__ == "__main__":
    main()
