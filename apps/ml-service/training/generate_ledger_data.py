#!/usr/bin/env python3
"""
MedBridge — event-driven inventory ledger simulation, WITH batch-level tracking.

Produces THREE files (not two — this is the corrected version):

  transactions.csv       — every stock-changing event, one row each, typed:
                            CONSUMPTION / PROCUREMENT / EXCHANGE_OUT /
                            EXCHANGE_IN / EXPIRY_WRITEOFF / EMERGENCY_REQUEST
                            Each row references the batch_no it actually moved.

  inventory.csv           — CURRENT batch-level snapshot (as of END_DATE),
                            exactly matching the production `inventory` table:
                            Hospital_ID, Medicine_ID, Batch_No, Quantity_Available,
                            Manufacture_Date, Expiry_Date, Last_Updated.
                            This is what seeds/mirrors the real Postgres
                            `Medicine` table (batch/expiry fields already exist
                            there) — the ML model never reads this file.

  inventory_state.csv     — weekly AGGREGATE balance per (hospital, medicine),
                            used ONLY to build ML training features. The model
                            forecasts total demand, not which batch fulfilled it.

hospitals.csv and medicines.csv are UNCHANGED.

Run from apps/ml-service/:
    python training/generate_ledger_data.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from datetime import date, timedelta

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_synthetic_data import (  # noqa: E402  (reuse existing, unmodified builders)
    build_hospitals,
    build_medicines,
    specialty_mult,
    CATEGORY_SEASON,
    ECOREGION_PRESSURE,
    SEASONAL_BASE,
    festival_boost_month_day,
    week_starts,
    START_DATE,
    END_DATE,
)

RNG = np.random.default_rng(7)

ROOT = Path(__file__).resolve().parents[1]
OUT_RAW = ROOT / "data" / "raw"
OUT_PROCESSED = ROOT / "data" / "processed"

SUPPLIERS = [
    "DoDA Logistics", "Nepal CMS", "Provincial Medical Store",
    "Private Distributor - Kathmandu", "UNICEF Supply",
    "Local Pharmacy Wholesaler", "BPKMCH Pharmacy Store", "Kanti Central Store",
]


def build_pairs(hospitals: pd.DataFrame, medicines: pd.DataFrame) -> pd.DataFrame:
    h, m = hospitals.copy(), medicines.copy()
    h["_k"] = 1
    m["_k"] = 1
    pairs = h.merge(m, on="_k").drop(columns="_k").reset_index(drop=True)
    pairs["affinity"] = RNG.normal(1.0, 0.10, len(pairs)).clip(0.65, 1.45)
    pairs["spec_mult"] = [
        specialty_mult(ft, cat) for ft, cat in zip(pairs["facility_type"], pairs["category"])
    ]
    pairs["daily_base"] = (
        pairs["base_demand_per_100_beds"] * (pairs["bed_capacity"] / 100.0)
        * pairs["load_factor"] * pairs["urban_factor"]
        * pairs["affinity"] * pairs["spec_mult"]
    )
    pairs["reorder_level"] = np.maximum(3, (pairs["daily_base"] * 10).round().astype(int))
    pairs["shelf_life_months"] = pairs["shelf_life_months"].astype(int)
    return pairs


def weekly_multiplier(week_start: pd.Timestamp, ecoregion: np.ndarray, category: np.ndarray,
                       facility_type: np.ndarray, is_referral: np.ndarray) -> np.ndarray:
    month = week_start.month
    day = week_start.day
    seasonal = SEASONAL_BASE.get(month, 1.0)
    festival = festival_boost_month_day(month, day)
    cat_season = np.array([CATEGORY_SEASON.get(c, {}).get(month, 1.0) for c in category])
    eco_cat = np.array([ECOREGION_PRESSURE.get(e, {}).get(c, 1.0) for e, c in zip(ecoregion, category)])
    mult = seasonal * festival * cat_season * eco_cat
    mult = np.where(is_referral == 1, 1.0 + (mult - 1.0) * 0.85, mult)
    return mult


class BatchLedger:
    """One FIFO batch list per (hospital, medicine) pair, indexed by pair position."""

    def __init__(self, n_pairs: int):
        self.batches: list[list[dict]] = [[] for _ in range(n_pairs)]
        self._batch_seq = 0

    def new_batch_no(self) -> str:
        self._batch_seq += 1
        return f"BATCH-{self._batch_seq:07d}"

    def balance(self, i: int) -> int:
        return sum(b["qty"] for b in self.batches[i])

    def add_batch(self, i: int, qty: int, manufacture_date: date, shelf_life_months: int) -> str:
        batch_no = self.new_batch_no()
        expiry = manufacture_date + timedelta(days=int(shelf_life_months * 30.44))
        self.batches[i].append({
            "batch_no": batch_no, "qty": qty,
            "manufacture_date": manufacture_date, "expiry_date": expiry,
        })
        return batch_no

    def consume_fifo(self, i: int, qty_needed: int):
        """Draws qty_needed from the oldest batches first. Returns list of
        (batch_no, qty_taken) actually consumed, and leftover unmet quantity."""
        self.batches[i].sort(key=lambda b: b["manufacture_date"])
        taken = []
        remaining = qty_needed
        for b in self.batches[i]:
            if remaining <= 0:
                break
            take = min(b["qty"], remaining)
            if take <= 0:
                continue
            b["qty"] -= take
            remaining -= take
            taken.append((b["batch_no"], take))
        self.batches[i] = [b for b in self.batches[i] if b["qty"] > 0]
        return taken, remaining  # remaining > 0 means unmet demand

    def expire_batches(self, i: int, as_of: date):
        """Removes any batch whose real expiry_date has passed; returns
        list of (batch_no, qty_written_off)."""
        writeoffs = []
        keep = []
        for b in self.batches[i]:
            if b["expiry_date"] <= as_of and b["qty"] > 0:
                writeoffs.append((b["batch_no"], b["qty"]))
            else:
                keep.append(b)
        self.batches[i] = keep
        return writeoffs


def run_simulation(hospitals: pd.DataFrame, medicines: pd.DataFrame,
                    weeks: pd.DatetimeIndex | None = None,
                    ledger: BatchLedger | None = None,
                    start_tx_id: int = 0):
    pairs = build_pairs(hospitals, medicines)
    n = len(pairs)
    if weeks is None:
        weeks = week_starts(START_DATE, END_DATE)
    print(f"Simulating {n} hospital-medicine pairs across {len(weeks)} weeks "
          f"({n * len(weeks):,} pair-weeks), batch-level...")

    ecoregion = pairs["ecoregion"].to_numpy()
    category = pairs["category"].to_numpy()
    facility_type = pairs["facility_type"].to_numpy()
    is_referral = pairs["is_referral"].to_numpy()
    hospital_id = pairs["hospital_id"].to_numpy()
    medicine_id = pairs["medicine_id"].to_numpy()
    province = pairs["province"].to_numpy()
    daily_base = pairs["daily_base"].to_numpy()
    reorder_level = pairs["reorder_level"].to_numpy()
    shelf_life_months = pairs["shelf_life_months"].to_numpy()

    if ledger is None:
        ledger = BatchLedger(n)
        # Seed each pair with 1-2 starting batches so week 1 isn't empty-shelved
        for i in range(n):
            start_qty = max(1, int(daily_base[i] * 7 * RNG.uniform(1.5, 3.5)))
            manuf = weeks[0].date() - timedelta(weeks=int(RNG.integers(0, 6)))
            ledger.add_batch(i, start_qty, manuf, int(shelf_life_months[i]))

    disruption_left = np.zeros(n, dtype=int)
    shock_left = np.zeros(n, dtype=int)

    transactions: list[dict] = []
    inventory_rows: list[dict] = []
    tx_id = start_tx_id

    def next_tx_id():
        nonlocal tx_id
        tx_id += 1
        return f"TX-{tx_id:07d}"

    for week_start in weeks:
        wk_date = week_start.date()
        wk_str = wk_date.isoformat()
        wk_mult = weekly_multiplier(week_start, ecoregion, category, facility_type, is_referral)

        new_disruption = (disruption_left == 0) & (RNG.random(n) < 0.0025)
        disruption_left = np.where(new_disruption, RNG.integers(4, 9, n), disruption_left)
        new_shock = (shock_left == 0) & (RNG.random(n) < 0.0035)
        shock_left = np.where(new_shock, RNG.integers(1, 4, n), shock_left)
        disruption_mult = np.where(disruption_left > 0, RNG.uniform(0.25, 0.55, n), 1.0)
        shock_mult = np.where(shock_left > 0, RNG.uniform(1.8, 3.2, n), 1.0)

        mu = daily_base * 7.0 * wk_mult * disruption_mult * shock_mult
        rel_noise_sigma = np.clip(0.35 - 0.02 * np.log1p(mu), 0.12, 0.45)
        noise = RNG.lognormal(mean=0.0, sigma=rel_noise_sigma)
        desired = np.maximum(0.0, mu * noise)
        desired_int = RNG.poisson(np.clip(desired, 0, 5000))

        unmet = np.zeros(n, dtype=int)

        # --- expiry check FIRST (stock that expired going into this week) ---
        for i in range(n):
            for batch_no, qty in ledger.expire_batches(i, wk_date):
                transactions.append({
                    "transaction_id": next_tx_id(), "date": wk_str, "type": "EXPIRY_WRITEOFF",
                    "hospital_id": hospital_id[i], "medicine_id": medicine_id[i],
                    "batch_no": batch_no, "counterparty_id": None, "department": None,
                    "quantity": -qty, "emergency_flag": 0, "note": "Expired unrotated",
                })

        # --- consumption, FIFO from real batches ---
        for i in range(n):
            if desired_int[i] <= 0:
                continue
            taken, remaining = ledger.consume_fifo(i, int(desired_int[i]))
            unmet[i] = remaining
            dept = str(RNG.choice(["Emergency", "ICU", "OPD", "Pharmacy", "Surgery", "Pediatrics"]))
            for batch_no, qty in taken:
                transactions.append({
                    "transaction_id": next_tx_id(), "date": wk_str, "type": "CONSUMPTION",
                    "hospital_id": hospital_id[i], "medicine_id": medicine_id[i],
                    "batch_no": batch_no, "counterparty_id": None, "department": dept,
                    "quantity": -qty, "emergency_flag": 1 if remaining > 0 else 0, "note": None,
                })

        # --- reorder / exchange / procurement: who is short? ---
        balances = np.array([ledger.balance(i) for i in range(n)])
        short_idx = np.nonzero((balances < reorder_level) | (unmet > 0))[0]
        surplus_mask = balances > (2.2 * reorder_level)
        by_medicine_surplus: dict[str, list[int]] = {}
        for i in np.nonzero(surplus_mask)[0]:
            by_medicine_surplus.setdefault(medicine_id[i], []).append(i)

        for i in short_idx:
            urgent = unmet[i] > 0
            shortfall = int(max(reorder_level[i] * 2.5 - balances[i], reorder_level[i]))
            matched = False

            if urgent:
                candidates = by_medicine_surplus.get(medicine_id[i], [])
                same_prov = [j for j in candidates if province[j] == province[i] and j != i]
                pick_pool = same_prov if same_prov else [j for j in candidates if j != i]
                if pick_pool:
                    j = pick_pool[int(RNG.integers(0, len(pick_pool)))]
                    j_balance = ledger.balance(j)
                    available = max(0, j_balance - int(1.8 * reorder_level[j]))
                    give = min(shortfall, available)
                    if give > 0:
                        taken, _ = ledger.consume_fifo(j, give)  # pulled OUT of j's real batches
                        for batch_no, qty in taken:
                            transactions.append({
                                "transaction_id": next_tx_id(), "date": wk_str, "type": "EXCHANGE_OUT",
                                "hospital_id": hospital_id[j], "medicine_id": medicine_id[i],
                                "batch_no": batch_no, "counterparty_id": hospital_id[i],
                                "department": None, "quantity": -qty, "emergency_flag": 1, "note": None,
                            })
                        # re-derive expiry from source batches just consumed isn't tracked after
                        # removal, so create the incoming batch using the medicine's shelf life
                        # from an assumed recent manufacture date at the source (simplification,
                        # documented): incoming stock is treated as manufactured ~mid-shelf-life.
                        manuf_est = wk_date - timedelta(weeks=int(RNG.integers(2, 12)))
                        in_batch_no = ledger.add_batch(i, give, manuf_est, int(shelf_life_months[i]))
                        transactions.append({
                            "transaction_id": next_tx_id(), "date": wk_str, "type": "EXCHANGE_IN",
                            "hospital_id": hospital_id[i], "medicine_id": medicine_id[i],
                            "batch_no": in_batch_no, "counterparty_id": hospital_id[j],
                            "department": None, "quantity": give, "emergency_flag": 1, "note": None,
                        })
                        matched = True

                transactions.append({
                    "transaction_id": next_tx_id(), "date": wk_str, "type": "EMERGENCY_REQUEST",
                    "hospital_id": hospital_id[i], "medicine_id": medicine_id[i], "batch_no": None,
                    "counterparty_id": None, "department": None,
                    "quantity": int(unmet[i]) if unmet[i] > 0 else shortfall,
                    "emergency_flag": 1,
                    "note": "Fulfilled_via_exchange" if matched else ("Open" if unmet[i] > 0 else "Pending"),
                })

            if not matched:
                order_qty = int(max(shortfall, reorder_level[i]))
                batch_no = ledger.add_batch(i, order_qty, wk_date, int(shelf_life_months[i]))
                transactions.append({
                    "transaction_id": next_tx_id(), "date": wk_str, "type": "PROCUREMENT",
                    "hospital_id": hospital_id[i], "medicine_id": medicine_id[i],
                    "batch_no": batch_no, "counterparty_id": str(RNG.choice(SUPPLIERS)),
                    "department": None, "quantity": order_qty, "emergency_flag": 0, "note": None,
                })

        disruption_left = np.maximum(0, disruption_left - 1)
        shock_left = np.maximum(0, shock_left - 1)

        end_balances = np.array([ledger.balance(i) for i in range(n)])
        avg_recent = np.maximum(daily_base, 0.05)
        days_of_cover = np.where(avg_recent > 0, end_balances / avg_recent, np.nan)
        status = np.where(end_balances <= 0, "OUT_OF_STOCK",
                  np.where(end_balances < reorder_level, "LOW_STOCK", "OK"))
        for i in range(n):
            inventory_rows.append({
                "week_start": wk_str, "hospital_id": hospital_id[i], "medicine_id": medicine_id[i],
                "quantity_on_hand": int(end_balances[i]), "reorder_level": int(reorder_level[i]),
                "avg_daily_use": round(float(avg_recent[i]), 3),
                "days_of_cover": round(float(days_of_cover[i]), 2) if not np.isnan(days_of_cover[i]) else None,
                "stock_status": status[i],
            })

        if week_start.week % 20 == 0:
            print(f"  ...{wk_str} done ({len(transactions):,} tx so far)")

    tx_df = pd.DataFrame(transactions)
    inv_state_df = pd.DataFrame(inventory_rows)

    # CURRENT batch-level snapshot — this is the actual `inventory` table
    snap_rows = []
    last_date = weeks[-1].date().isoformat()
    for i in range(n):
        for b in ledger.batches[i]:
            if b["qty"] <= 0:
                continue
            snap_rows.append({
                "hospital_id": hospital_id[i], "medicine_id": medicine_id[i],
                "batch_no": b["batch_no"], "quantity_available": b["qty"],
                "manufacture_date": b["manufacture_date"].isoformat(),
                "expiry_date": b["expiry_date"].isoformat(),
                "last_updated": last_date,
            })
    inventory_df = pd.DataFrame(snap_rows)

    return tx_df, inv_state_df, inventory_df, ledger


def build_features_from_ledger(tx_df: pd.DataFrame, hospitals: pd.DataFrame,
                                medicines: pd.DataFrame) -> pd.DataFrame:
    """Weekly demand + features for ML. Batch_No/Expiry_Date are NOT used
    here — the model forecasts aggregate demand, not batch fate."""
    print("Building features from the transaction ledger...")
    cons = tx_df[tx_df["type"] == "CONSUMPTION"].copy()
    cons["date"] = pd.to_datetime(cons["date"])
    cons["quantity"] = cons["quantity"].abs()

    weekly = (
        cons.groupby(["hospital_id", "medicine_id", "date"])
        .agg(demand_units=("quantity", "sum"))
        .reset_index().rename(columns={"date": "week_start"})
        .sort_values(["hospital_id", "medicine_id", "week_start"]).reset_index(drop=True)
    )

    emer = tx_df[tx_df["type"] == "EMERGENCY_REQUEST"][["hospital_id", "medicine_id", "date"]].copy()
    emer["date"] = pd.to_datetime(emer["date"]); emer["had_emergency"] = 1
    exch_in = tx_df[tx_df["type"] == "EXCHANGE_IN"][["hospital_id", "medicine_id", "date"]].copy()
    exch_in["date"] = pd.to_datetime(exch_in["date"]); exch_in["had_exchange_in"] = 1

    weekly = weekly.merge(emer.drop_duplicates(["hospital_id", "medicine_id", "date"])
                           .rename(columns={"date": "week_start"}),
                           on=["hospital_id", "medicine_id", "week_start"], how="left")
    weekly = weekly.merge(exch_in.drop_duplicates(["hospital_id", "medicine_id", "date"])
                           .rename(columns={"date": "week_start"}),
                           on=["hospital_id", "medicine_id", "week_start"], how="left")
    weekly["had_emergency"] = weekly["had_emergency"].fillna(0).astype(int)
    weekly["had_exchange_in"] = weekly["had_exchange_in"].fillna(0).astype(int)

    df = weekly.copy()
    df["year"] = df["week_start"].dt.year
    df["month"] = df["week_start"].dt.month
    df["week_of_year"] = df["week_start"].dt.isocalendar().week.astype(int)
    df["quarter"] = df["week_start"].dt.quarter
    df["is_monsoon"] = df["month"].isin([6, 7, 8, 9]).astype(int)
    df["is_winter"] = df["month"].isin([12, 1, 2]).astype(int)

    g = df.groupby(["hospital_id", "medicine_id"], group_keys=False)["demand_units"]
    for lag in (1, 2, 3, 4, 8, 12):
        df[f"lag_{lag}w"] = g.shift(lag)
    for win in (2, 4, 8, 12):
        df[f"roll_mean_{win}w"] = g.transform(lambda s: s.shift(1).rolling(win, min_periods=1).mean())
        df[f"roll_std_{win}w"] = g.transform(lambda s: s.shift(1).rolling(win, min_periods=1).std())
    df["roll_min_4w"] = g.transform(lambda s: s.shift(1).rolling(4, min_periods=1).min())
    df["roll_max_4w"] = g.transform(lambda s: s.shift(1).rolling(4, min_periods=1).max())
    df["diff_1w"] = g.diff(1)
    df["diff_4w"] = g.diff(4)
    df["ewm_4w"] = g.transform(lambda s: s.shift(1).ewm(span=4, adjust=False).mean())
    df["ewm_12w"] = g.transform(lambda s: s.shift(1).ewm(span=12, adjust=False).mean())

    ge = df.groupby(["hospital_id", "medicine_id"], group_keys=False)["had_emergency"]
    gx = df.groupby(["hospital_id", "medicine_id"], group_keys=False)["had_exchange_in"]
    df["emergency_last_4w"] = ge.transform(lambda s: s.shift(1).rolling(4, min_periods=1).max()).fillna(0)
    df["exchange_in_last_4w"] = gx.transform(lambda s: s.shift(1).rolling(4, min_periods=1).max()).fillna(0)
    df = df.drop(columns=["had_emergency", "had_exchange_in"])  # same-week -> leakage, drop raw

    hcols = ["hospital_id", "facility_type", "province", "district", "ecoregion", "urban_class",
             "bed_capacity", "ownership", "load_factor", "urban_factor", "is_referral",
             "road_access_score", "latitude", "longitude", "is_demo"]
    mcols = ["medicine_id", "generic_name", "category", "dosage_form", "shelf_life_months",
             "unit_cost_npr", "requires_cold_chain", "is_essential",
             "base_demand_per_100_beds", "abc_class", "pack_size"]
    df = df.merge(hospitals[hcols], on="hospital_id", how="left")
    df = df.merge(medicines[mcols], on="medicine_id", how="left")

    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    df["week_sin"] = np.sin(2 * np.pi * df["week_of_year"] / 52)
    df["week_cos"] = np.cos(2 * np.pi * df["week_of_year"] / 52)

    df = df.rename(columns={"demand_units": "target_demand"})
    df = df[df["week_start"] >= (pd.Timestamp(START_DATE) + pd.Timedelta(weeks=12))].copy()
    feature_fill = [c for c in df.columns if c.startswith(("lag_", "roll_", "diff_", "ewm_"))]
    for c in feature_fill:
        df[c] = df[c].fillna(0)
    return df


def main():
    OUT_RAW.mkdir(parents=True, exist_ok=True)
    OUT_PROCESSED.mkdir(parents=True, exist_ok=True)

    hospitals = build_hospitals()
    medicines = build_medicines()

    tx_df, inv_state_df, inventory_df, _ = run_simulation(hospitals, medicines)
    tx_df.to_csv(OUT_RAW / "transactions.csv", index=False)
    inv_state_df.to_csv(OUT_RAW / "inventory_state.csv", index=False)
    inventory_df.to_csv(OUT_RAW / "inventory.csv", index=False)
    print(f"transactions={len(tx_df):,}  inventory_state={len(inv_state_df):,}  "
          f"inventory(current batches)={len(inventory_df):,}")
    print(tx_df["type"].value_counts())

    features = build_features_from_ledger(tx_df, hospitals, medicines)
    features.to_csv(OUT_PROCESSED / "demand_features.csv", index=False)
    print(f"demand_features={len(features):,} cols={features.shape[1]}")


if __name__ == "__main__":
    main()