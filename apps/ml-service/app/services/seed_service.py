"""
apps/ml-service/app/services/seed_service.py

Generates starter transaction/inventory history for a brand-new hospital
that just signed up, using the SAME simulation engine as the bulk generator
(training/generate_ledger_data.py), just scoped to one hospital instead of
all 42-ish reference hospitals.

Returns plain Python data (lists of dicts) — this service does NOT write to
Postgres itself. The Node backend calls this endpoint, gets the data back,
and writes it into the real database, tagging it isSynthetic=True.
"""
from __future__ import annotations

import sys
from pathlib import Path
from datetime import date, timedelta

import numpy as np
import pandas as pd

TRAINING_DIR = Path(__file__).resolve().parents[2] / "training"
sys.path.insert(0, str(TRAINING_DIR))

from generate_synthetic_data import build_medicines  # noqa: E402
from generate_ledger_data import build_pairs, run_simulation, week_starts  # noqa: E402

# Reasonable defaults when the signup form doesn't collect every attribute
# our simulation formula wants. Keep this list in sync with what the signup
# form on the frontend actually asks for.
DEFAULTS = {
    "urban_class": "Municipality",
    "ecoregion": "Hill",
    "ownership": "public",
    "load_factor": 1.0,
    "urban_factor": 1.0,
    "is_referral": 0,
    "road_access_score": 0.7,
    "latitude": 27.7,
    "longitude": 85.3,
    "is_demo": 0,
}


def seed_hospital_history(hospital_row: dict, weeks_of_history: int = 26) -> dict:
    """
    hospital_row must at minimum contain:
      hospital_id (str, the Postgres Hospital.id — used as the join key),
      facility_type (str), province (str), district (str), bed_capacity (int)
    Anything else falls back to DEFAULTS.
    """
    row = {**DEFAULTS, **hospital_row}
    hospitals_df = pd.DataFrame([row])
    medicines_df = build_medicines()

    end = date.today()
    start = end - timedelta(weeks=weeks_of_history)
    weeks = week_starts(start, end)

    tx_df, inv_state_df, inventory_df, _, _ = run_simulation(
        hospitals_df, medicines_df, weeks=weeks
    )

    return {
        "hospital_id": row["hospital_id"],
        "weeks_generated": len(weeks),
        "transactions": tx_df.to_dict(orient="records"),
        "current_inventory": inventory_df.to_dict(orient="records"),
        "transaction_count": len(tx_df),
        "batch_count": len(inventory_df),
    }