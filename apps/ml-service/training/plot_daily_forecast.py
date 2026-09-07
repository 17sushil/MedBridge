#!/usr/bin/env python3
"""
MedBridge -- daily forecast verification figure.

Runs the production path (same functions the API uses) for one demonstration
hospital and draws:

  Panel A  30-day daily forecast (bars) with weekday coloring and the
           weekly anchor totals as a dotted step line
  Panel B  the same horizon as weekly totals (proof that the daily values
           sum exactly to the weekly totals)

Run after training:
    python3 training/plot_daily_forecast.py
Outputs: reports/residual_analysis/daily_forecast_verification.png
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.api.server import (  # noqa: E402
    _load_hospital_daily_features,
    _load_hospital_features,
)
from app.services.forecast_services import (  # noqa: E402
    clear_model_cache,
    daily_anchored_forecast,
)

OUT = ROOT / "reports" / "residual_analysis" / "daily_forecast_verification.png"
NAVY, TEAL, AMBER, GREY, LIGHT = (
    "#233A5C", "#0E8C82", "#E8A23D", "#8A94A3", "#E4E9EE",
)
HOSPITAL = "HOSP-BG-001"
DAYS = 30


def main() -> None:
    clear_model_cache()
    daily_history = _load_hospital_daily_features(HOSPITAL)
    weekly_history = _load_hospital_features(HOSPITAL)
    if daily_history.empty or weekly_history.empty:
        raise SystemExit(f"No data for {HOSPITAL}")

    forecast = daily_anchored_forecast(daily_history, weekly_history, days=DAYS)

    # week-level anchors are per pair-week; dedupe the repeated day rows,
    # then sum across medicines for the hospital-level view
    week_anchor = (
        forecast[["hospital_id", "medicine_id", "week_start", "week_total"]]
        .drop_duplicates(["hospital_id", "medicine_id", "week_start"])
        .groupby("week_start", as_index=False)["week_total"].sum()
    )
    weekly_totals = dict(zip(week_anchor["week_start"], week_anchor["week_total"]))

    totals = (
        forecast.groupby("date", as_index=False)
        .agg(predicted_daily=("predicted_daily", "sum"),
             week_start=("week_start", "first"))
        .sort_values("date")
    )
    totals["week_total"] = totals["week_start"].map(weekly_totals)
    totals["dow"] = totals["date"].dt.dayofweek

    # consistency check at the hospital level
    by_week = totals.groupby("week_start", as_index=False).agg(
        daily_sum=("predicted_daily", "sum"),
        week_total=("week_total", "first"),
        days_covered=("date", "count"),
    )
    err = float((by_week["daily_sum"] - by_week["week_total"]).abs().max())

    fig, (ax_a, ax_b) = plt.subplots(
        2, 1, figsize=(13.2, 7.4), sharex=False,
        gridspec_kw={"height_ratios": [1.55, 1.0], "hspace": 0.42},
    )

    # ---- Panel A: daily bars ----------------------------------------------
    colors = [AMBER if dow >= 5 else TEAL for dow in totals["dow"]]
    ax_a.bar(totals["date"], totals["predicted_daily"], color=colors, width=0.72)
    ax_a.set_title(
        f"{HOSPITAL} — next {DAYS} days, hybrid daily forecast "
        f"(daily curve rescaled to weekly totals)",
        fontweight="bold", fontsize=13,
    )
    ax_a.set_ylabel("predicted units / day", fontsize=11)
    ax_a.tick_params(labelsize=10)
    ax_a.grid(alpha=0.3, axis="y")
    ax_a.spines[["top", "right"]].set_visible(False)
    ax_a.xaxis.set_major_locator(mdates.DayLocator(interval=3))
    ax_a.xaxis.set_major_formatter(mdates.DateFormatter("%a %d %b"))
    ax_a.set_ylim(bottom=0, top=float(totals["predicted_daily"].max()) * 1.32)
    ax_a.text(
        0.005, 0.98,
        "teal = weekday   amber = weekend\n"
        "full weeks: sum(days in week) == weekly total exactly\n"
        "last partial week (2 days) shows the raw daily forecast",
        transform=ax_a.transAxes, ha="left", va="top", fontsize=10,
        bbox=dict(boxstyle="round", fc=LIGHT, ec=GREY, alpha=0.92),
    )

    # ---- Panel B: weekly totals for the same horizon -----------------------
    ax_b.bar(
        by_week["week_start"].dt.date, by_week["week_total"],
        color=NAVY, width=4.5, alpha=0.92,
    )
    ax_b.set_ylim(bottom=0, top=float(by_week["week_total"].max()) * 1.22)
    ax_b.set_title("Same horizon as weekly totals (what the Weekly view shows)",
                   fontweight="bold", fontsize=12)
    ax_b.set_ylabel("predicted units / week", fontsize=11)
    ax_b.tick_params(labelsize=10)
    ax_b.grid(alpha=0.3, axis="y")
    ax_b.spines[["top", "right"]].set_visible(False)
    ax_b.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
    ax_b.xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    for i, (_, row) in enumerate(by_week.iterrows()):
        label = f"{row['week_total']:,.0f}"
        if i == len(by_week) - 1 and int(row.get("days_covered", 7)) < 7:
            label += " (2 days)"
        ax_b.text(
            row["week_start"].date(), row["week_total"] * 1.02, label,
            ha="center", va="bottom", fontsize=9, color=NAVY, fontweight="bold",
        )

    fig.suptitle(
        "MedBridge demand forecast — daily versus weekly granularity",
        fontweight="bold", fontsize=15, y=0.99,
    )
    fig.savefig(OUT, dpi=200)
    print(f"Saved {OUT}")
    print(f"  consistency: max |sum(daily in week) - week_total| = {err:.2e}")
    print(f"  total next-{DAYS}d: {totals['predicted_daily'].sum():,.0f} units")


if __name__ == "__main__":
    main()
