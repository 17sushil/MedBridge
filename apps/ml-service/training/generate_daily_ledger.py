#!/usr/bin/env python3
"""
MedBridge -- day-level demand ledger.

Builds a day-granularity consumption ledger from the existing weekly
transaction ledger so the forecasting stack can serve *daily* demand
forecasts (one value per calendar day) in addition to the weekly ones.

Design (deliberate, no hidden randomness):

  * The weekly model stays exactly as trained: weekly quantities come from
    data/raw/transactions.csv (CONSUMPTION aggregated per hospital/medicine/
    Monday week-start). This script never changes a week's total.
  * Each week's demand is allocated across Mon..Sun with a deterministic
    day-of-week profile. Profiles express a standard assumption for
    hospital medicine consumption:

      ACUTE  - OPD/emergency/surgical/campaign-driven items (antipyretics,
               ORS, IV fluids, antibiotics, anaesthetics, surgical
               consumables, ...): weekday-heavy, Sunday/Saturday dip.
      STEADY - chronic, 24/7, or maternal items (antihypertensives,
               antidiabetics, cardiovascular, blood products, maternity,
               nutrition, paediatrics): flat across the week.
      MILD   - everything else: slight weekend dip.

    Facility type modulates the dip: PHC (outpatient-only) dips more,
    Teaching/Central (round-the-clock inpatient load) dips less.

  * Normalisation guarantees  sum(daily in week) == weekly demand EXACTLY,
    so daily and weekly views can never contradict each other.

Outputs:
  data/processed/daily_ledger.csv.gz                 (full 41-hospital set)
  data/processed/daily_by_hospital/{id}.csv.gz       (serving partitions)

Run from apps/ml-service:
    python3 training/generate_daily_ledger.py
"""

from __future__ import annotations

import gc
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from training.generate_ledger_data import (  # noqa: E402
    OUT_PROCESSED,
    OUT_RAW,
)

DAILY_OUT = OUT_PROCESSED / "daily_ledger.csv.gz"
DAILY_PART_DIR = OUT_PROCESSED / "daily_by_hospital"

# Day-of-week demand weights, Mon..Sun, normalised to a mean of 1 inside code.
WEIGHTS = {
    "ACUTE": np.array([1.13, 1.16, 1.13, 1.11, 1.06, 0.60, 0.68], dtype=float),
    "STEADY": np.array([1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00], dtype=float),
    "MILD": np.array([1.04, 1.05, 1.04, 1.03, 1.01, 0.86, 0.90], dtype=float),
}

ACUTE_CATEGORIES = {
    "Antipyretic", "Analgesic", "ORS_Electrolyte", "IV_Fluid",
    "Gastrointestinal", "Antidiarrheal", "Antibiotic", "Respiratory",
    "Antimalarial", "Trauma_Emergency", "Antiseptic", "Ophthalmic",
    "Anesthetic", "Surgical_Consumable", "Vaccine", "Oncology",
    "Anthelmintic",
}
STEADY_CATEGORIES = {
    "Antihypertensive", "Antidiabetic", "Cardiovascular", "Blood_Product",
    "Nutritional", "Maternity_OBGYN", "Pediatric",
}

# Facility-type multiplier on the weekend dip (applied to Sat/Sun only).
# Hospitals.csv facility_type values; >1 deepens the weekend dip, <1 flattens
# it (24/7 inpatient/maternity/trauma load keeps weekends busy).
FACILITY_DIP_FACTOR = {
    "Primary_Health_Center": 1.25,   # outpatient-only: weekend ward empties
    "District_Hospital": 1.05,
    "Regional_Hospital": 1.00,
    "Zonal_Hospital": 1.00,
    "Central_Hospital": 0.92,        # 24/7 inpatient load smooths weekends
    "Teaching_Hospital": 0.90,
    "Trauma_Center": 0.88,
    "Maternity_Hospital": 0.88,      # labour is round-the-clock
    "Children_Hospital": 0.95,
    "Cancer_Hospital": 1.00,         # oncology is already ACUTE (weekday ops)
    "Eye_Hospital": 1.00,
    "Mental_Hospital": 1.00,
    "Community_Hospital": 1.00,
}


def _profile_for(category: str) -> str:
    if category in ACUTE_CATEGORIES:
        return "ACUTE"
    if category in STEADY_CATEGORIES:
        return "STEADY"
    return "MILD"


def _day_weights(category: str, facility_type: str) -> np.ndarray:
    """Normalised Mon..Sun weights that sum to exactly 7.0."""
    profile = _profile_for(category)
    weights = WEIGHTS[profile].copy()
    factor = FACILITY_DIP_FACTOR.get(facility_type, 1.0)
    if factor != 1.0:
        weights[5] = weights[5] ** factor      # Saturday
        weights[6] = weights[6] ** factor      # Sunday
    return weights * (7.0 / weights.sum())


def build_daily_ledger() -> pd.DataFrame:
    """Allocate every pair-week's consumption onto its seven calendar days.

    Processes one hospital at a time and returns the full frame; streaming
    callers should use `iter_hospital_daily()` instead (constant memory).
    """
    frames = list(iter_hospital_daily())
    if not frames:
        raise SystemExit("No daily rows produced.")
    daily = pd.concat(frames, ignore_index=True)
    daily["demand_units"] = daily["demand_units"].round(4).astype("float32")
    daily = daily.sort_values(["hospital_id", "medicine_id", "date"]).reset_index(drop=True)
    return daily


def iter_hospital_daily():
    """Yield (hospital_id, daily_frame) for every hospital in the ledger."""
    tx_path = OUT_RAW / "transactions.csv"
    if not tx_path.exists() or tx_path.stat().st_size == 0:
        raise SystemExit(
            f"Missing {tx_path}. Run: python3 training/generate_ledger_data.py"
        )

    hospitals = pd.read_csv(OUT_RAW / "hospitals.csv")
    medicines = pd.read_csv(OUT_RAW / "medicines.csv")
    hospital_info = hospitals[["hospital_id", "facility_type"]].copy()
    medicine_info = medicines[["medicine_id", "category"]].copy()

    weekly_parts: list[pd.DataFrame] = []
    needed = ["hospital_id", "medicine_id", "date", "type", "quantity"]
    for chunk in pd.read_csv(
        tx_path, usecols=needed, chunksize=200_000,
        dtype={"hospital_id": "category", "medicine_id": "category",
               "type": "category", "quantity": "float32"},
    ):
        chunk["date"] = pd.to_datetime(chunk["date"], errors="coerce")
        chunk = chunk.dropna(subset=["date"])
        consumption = chunk[chunk["type"] == "CONSUMPTION"]
        if consumption.empty:
            continue
        consumption = consumption.copy()
        consumption["quantity"] = consumption["quantity"].abs().astype("float32")
        weekly_parts.append(
            consumption.groupby(
                ["hospital_id", "medicine_id", "date"], observed=True,
                as_index=False,
            )["quantity"].sum()
        )

    if not weekly_parts:
        raise SystemExit("No CONSUMPTION events found in the transaction ledger.")
    weekly = (
        pd.concat(weekly_parts, ignore_index=True)
        .groupby(["hospital_id", "medicine_id", "date"], observed=True,
                 as_index=False)["quantity"].sum()
        .rename(columns={"date": "week_start", "quantity": "demand_units"})
    )
    del weekly_parts
    gc.collect()

    weekly = weekly.merge(medicine_info, on="medicine_id", how="left")
    weekly = weekly.merge(hospital_info, on="hospital_id", how="left")
    weekly["week_start"] = pd.to_datetime(weekly["week_start"])
    weekly["facility_type"] = weekly["facility_type"].fillna("District")
    weekly["category"] = weekly["category"].fillna("Unknown")

    print(f"Weekly pair-weeks: {len(weekly):,} across "
          f"{weekly['hospital_id'].nunique()} hospitals")
    print("Allocating weekly demand onto calendar days (per hospital)...")

    total_rows = 0
    for hospital_id, group in weekly.groupby("hospital_id", observed=True, sort=False):
        ftype = group["facility_type"].iloc[0]

        # Profile cache: category -> normalised weights (first-seen ftype wins;
        # facility type is constant within a hospital).
        cache: dict[str, np.ndarray] = {}
        for category in group["category"].unique():
            cache[category] = _day_weights(category, ftype)

        start = group["week_start"].min()
        end = group["week_start"].max()
        # weeks are Mon..Sun; the day range must include the final Sunday
        dates = pd.date_range(start, end + pd.Timedelta(days=6), freq="D")
        dow = dates.dayofweek  # 0=Mon .. 6=Sun

        rows = []
        for (category, medicine_id), cat_group in group.groupby(
            ["category", "medicine_id"], observed=True, sort=False
        ):
            weights = cache[category]
            wvec = weights[dow]  # per-day weight, length = len(dates)
            by_week = (
                cat_group.set_index("week_start")["demand_units"]
                .reindex(pd.date_range(start, end, freq="W-MON"))
                .fillna(0.0)
                .to_numpy()
            )
            # each week value repeats 7x: aligns day-major with the date range
            # weights have mean 1.0 (sum 7), so each day receives its share
            per_day = np.repeat(by_week, 7) * wvec / 7.0
            rows.append(pd.DataFrame({
                "hospital_id": pd.Categorical([hospital_id] * len(per_day)),
                "medicine_id": pd.Categorical([medicine_id] * len(per_day)),
                "category": pd.Categorical([category] * len(per_day)),
                "facility_type": pd.Categorical([ftype] * len(per_day)),
                "date": dates,
                "demand_units": per_day,
            }))
        daily = pd.concat(rows, ignore_index=True)
        del rows
        total_rows += len(daily)
        yield hospital_id, daily
    print(f"Daily rows produced: {total_rows:,}")


def verify_weekly_invariant() -> float:
    """Max |sum(daily in week) - weekly demand| across all pair-weeks."""
    daily = pd.read_csv(
        DAILY_OUT,
        usecols=["hospital_id", "medicine_id", "date", "demand_units"],
        dtype={"hospital_id": "category", "medicine_id": "category"},
    )
    daily["date"] = pd.to_datetime(daily["date"])
    daily["week_start"] = daily["date"].dt.to_period("W-SUN").dt.start_time
    daily_weekly = daily.groupby(
        ["hospital_id", "medicine_id", "week_start"], observed=True,
        as_index=False,
    )["demand_units"].sum()
    tx_path = OUT_RAW / "transactions.csv"
    needed = ["hospital_id", "medicine_id", "date", "type", "quantity"]
    parts = []
    for chunk in pd.read_csv(
        tx_path, usecols=needed, chunksize=200_000,
        dtype={"hospital_id": "category", "medicine_id": "category",
               "type": "category", "quantity": "float32"},
    ):
        chunk["date"] = pd.to_datetime(chunk["date"], errors="coerce")
        chunk = chunk.dropna(subset=["date"])
        consumption = chunk[chunk["type"] == "CONSUMPTION"]
        if consumption.empty:
            continue
        consumption = consumption.copy()
        consumption["quantity"] = consumption["quantity"].abs().astype("float32")
        parts.append(
            consumption.groupby(
                ["hospital_id", "medicine_id", "date"], observed=True,
                as_index=False,
            )["quantity"].sum()
        )
    weekly = (
        pd.concat(parts, ignore_index=True)
        .groupby(["hospital_id", "medicine_id", "date"], observed=True,
                 as_index=False)["quantity"].sum()
        .rename(columns={"date": "week_start", "quantity": "weekly_units"})
    )
    merged = daily_weekly.merge(weekly, on=["hospital_id", "medicine_id", "week_start"],
                                how="left")
    merged["weekly_units"] = merged["weekly_units"].fillna(0.0)
    err = float((merged["demand_units"] - merged["weekly_units"]).abs().max())
    if err > 1e-3:
        raise SystemExit("Daily disaggregation is inconsistent with the weekly ledger.")
    return err


def main() -> None:
    OUT_PROCESSED.mkdir(parents=True, exist_ok=True)
    DAILY_OUT.parent.mkdir(parents=True, exist_ok=True)
    DAILY_PART_DIR.mkdir(parents=True, exist_ok=True)

    # Stream one hospital at a time: write its serving partition immediately
    # and append it to the full gzip file (constant peak memory).
    written = False
    total_rows = 0
    for hospital_id, daily in iter_hospital_daily():
        safe = "".join(
            ch for ch in str(hospital_id) if ch.isalnum() or ch in ("-", "_")
        )
        daily.to_csv(DAILY_PART_DIR / f"{safe}.csv.gz", index=False, compression="gzip")
        daily.to_csv(
            DAILY_OUT, index=False, compression="gzip", mode="a", header=not written
        )
        written = True
        total_rows += len(daily)

    if not written:
        raise SystemExit("No daily data was produced.")
    print(f"saved {DAILY_OUT} rows={total_rows:,}")

    err = verify_weekly_invariant()
    print(f"INVARIANT CHECK: max |daily-sum - weekly| = {err:.6f} (must be <= 1e-3)")
    print(f"saved {DAILY_PART_DIR} partitions={len(list(DAILY_PART_DIR.glob('*.csv.gz')))}")


if __name__ == "__main__":
    main()
