#!/usr/bin/env python3
"""
MedBridge — Zoomed residual distribution figure.

Reads the hold-out test predictions produced by training/analyze_residuals.py
(reports/residual_analysis/test_predictions.csv — 38,376 rows, full
41-hospital network) and draws a clean, zoomed view of the prediction
residuals:

  Panel A  core zoom: residuals in [-150, +150] units (fine bins + density)
  Panel B  full range: log-scale histogram of the whole residual range,
           showing how rare the extreme errors are

Outputs:
  reports/residual_analysis/residual_distribution_zoomed.png

Run from apps/ml-service:
    python3 training/plot_residual_zoom.py
(requires test_predictions.csv — regenerate with analyze_residuals.py)
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PRED = ROOT / "reports" / "residual_analysis" / "test_predictions.csv"
OUT = ROOT / "reports" / "residual_analysis" / "residual_distribution_zoomed.png"
NAVY, TEAL, AMBER, CORAL, GREY, LIGHT = (
    "#233A5C", "#0E8C82", "#E8A23D", "#D96C5F", "#8A94A3", "#E4E9EE",
)


def gaussian_density(values: np.ndarray, centers: np.ndarray, sigma: float) -> np.ndarray:
    """Kernel density estimate (schoolbook Gaussian kernel, no scipy needed)."""
    z = (centers[:, None] - values[None, :]) / sigma
    return np.exp(-0.5 * z**2).sum(axis=1) / (sigma * np.sqrt(2 * np.pi) * len(values))


def main() -> None:
    if not PRED.exists():
        raise SystemExit(
            f"Missing {PRED}. Run: python3 training/analyze_residuals.py first."
        )
    df = pd.read_csv(PRED)
    resid = df["residual"].to_numpy(dtype=float)
    n = len(resid)

    q = lambda p: float(np.percentile(resid, p))  # noqa: E731
    within = lambda w: 100 * float((np.abs(resid) <= w).mean())  # noqa: E731
    stats = {
        "n": n, "mean": float(resid.mean()), "median": float(np.median(resid)),
        "std": float(resid.std()),
        "P5": q(5), "P25": q(25), "P75": q(75), "P95": q(95),
        "min": float(resid.min()), "max": float(resid.max()),
        "w10": within(10), "w25": within(25), "w50": within(50),
        "w100": within(100), "w250": within(250),
    }

    fig, (axA, axB) = plt.subplots(
        1, 2, figsize=(14.5, 5.4),
        gridspec_kw={"width_ratios": [1.35, 1.0], "wspace": 0.24},
    )

    # ---- Panel A: core zoom (-150 .. +150) --------------------------------
    lo, hi = -150.0, 150.0
    bins = np.arange(lo, hi + 2, 2)                     # 2-unit bins
    axA.hist(resid, bins=bins, color=NAVY, alpha=0.92, edgecolor="none")
    centers = (bins[:-1] + bins[1:]) / 2
    core = resid[(resid >= lo) & (resid <= hi)]
    dens = gaussian_density(core, centers, sigma=6.0)
    axA.plot(centers, dens * 2.0 * n * 0.92, color=TEAL, lw=2.4,
             label="density (smoothed)")
    top = axA.get_ylim()[1]
    for x, c, ls, lbl, yfrac in [
        (0.0, CORAL, "--", "zero (perfect)", 0.90),
        (stats["mean"], AMBER, ":", f"mean {stats['mean']:+.1f}", 0.76),
        (stats["median"], TEAL, ":", f"median {stats['median']:+.1f}", 0.62),
        (stats["P5"], GREY, "-.", f"P5 {stats['P5']:+.1f}", 0.90),
        (stats["P95"], GREY, "-.", f"P95 {stats['P95']:+.1f}", 0.90),
    ]:
        axA.axvline(x, color=c, ls=ls, lw=1.6)
        axA.text(x - 4, top * yfrac, lbl, rotation=90, va="top", ha="right",
                 fontsize=8.5, color=c, fontweight="bold")

    # 25-unit band = the "close enough" window cited in the report
    axA.axvspan(-25, 25, color=TEAL, alpha=0.10, zorder=0)
    axA.set_xlim(lo, hi)
    axA.set_title("Zoomed core: −150 … +150 units", fontweight="bold", fontsize=13)
    axA.set_xlabel("residual = actual − predicted (units)", fontsize=12)
    axA.set_ylabel("count", fontsize=12)
    axA.tick_params(labelsize=10)
    axA.legend(fontsize=9.5, loc="upper right")
    axA.grid(alpha=0.3, axis="y")
    axA.spines[["top", "right"]].set_visible(False)
    axA.text(
        0.02, 0.97,
        f"n = {stats['n']:,}\nmean = {stats['mean']:+.1f}   median = {stats['median']:+.1f}\n"
        f"std = {stats['std']:.1f}\nP5 = {stats['P5']:+.1f}   P95 = {stats['P95']:+.1f}\n"
        f"±10 → {stats['w10']:.1f}%   ±25 → {stats['w25']:.1f}%\n"
        f"±50 → {stats['w50']:.1f}%   ±100 → {stats['w100']:.1f}%",
        transform=axA.transAxes, ha="left", va="top", fontsize=10,
        bbox=dict(boxstyle="round", fc=LIGHT, ec=GREY, alpha=0.92),
    )

    # ---- Panel B: full range on log count ---------------------------------
    binsB = np.linspace(resid.min(), resid.max(), 160)
    axB.hist(resid, bins=binsB, color=NAVY, alpha=0.92, edgecolor="none")
    axB.set_yscale("log")
    axB.axvline(0, color=CORAL, ls="--", lw=1.6)
    for x, c, lbl in [(stats["P5"], GREY, f"P5 {stats['P5']:+.0f}"),
                      (stats["P95"], GREY, f"P95 {stats['P95']:+.0f}")]:
        axB.axvline(x, color=c, ls="-.", lw=1.4)
        axB.text(x, axB.get_ylim()[1] * 0.03, lbl, rotation=90, va="bottom", ha="right",
                 fontsize=8.5, color=c, fontweight="bold")
    axB.set_title(f"Full range (log scale): {stats['min']:,.0f} … {stats['max']:,.0f} units",
                  fontweight="bold", fontsize=13)
    axB.set_xlabel("residual = actual − predicted (units)", fontsize=12)
    axB.set_ylabel("count (log)", fontsize=12)
    axB.tick_params(labelsize=10)
    axB.grid(alpha=0.3, which="both")
    axB.spines[["top", "right"]].set_visible(False)
    axB.text(
        0.98, 0.97,
        f"inside ±100 units: {stats['w100']:.1f}%\ninside ±250 units: {stats['w250']:.1f}%\n"
        f"|residual| > 500: {100 - within(500):.3f}%",
        transform=axB.transAxes, ha="right", va="top", fontsize=10,
        bbox=dict(boxstyle="round", fc=LIGHT, ec=GREY, alpha=0.92),
    )

    fig.suptitle("XGBoost demand model — prediction residual distribution (hold-out test set)",
                 fontweight="bold", fontsize=15, y=1.0)
    plt.tight_layout(rect=(0, 0, 1, 0.94))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT, dpi=200, bbox_inches="tight")
    print(f"Saved {OUT}")
    print(f"  n={stats['n']:,} mean={stats['mean']:+.2f} median={stats['median']:+.2f} "
          f"std={stats['std']:.2f} P5={stats['P5']:+.1f} P95={stats['P95']:+.1f}")
    print(f"  within ±10={stats['w10']:.1f}% ±25={stats['w25']:.1f}% ±50={stats['w50']:.1f}% "
          f"±100={stats['w100']:.1f}% ±250={stats['w250']:.1f}%")


if __name__ == "__main__":
    main()
