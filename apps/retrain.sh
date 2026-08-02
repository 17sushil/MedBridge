#!/usr/bin/env bash
# apps/retrain.sh — run this manually before a demo/milestone, or schedule it.
#
# What it does, in order:
#   1. Export real (non-synthetic) InventoryMovement rows from Postgres
#   2. Merge them into the ML service's transactions.csv
#   3. Rebuild demand_features.csv
#   4. Retrain XGBoost
#
# Usage: bash apps/retrain.sh

set -e  # stop immediately if any step fails, don't train on half-broken data

echo "== 1/4: Exporting real transactions from Postgres =="
cd apps/backend
node scripts/export_for_ml.js

echo "== 2/4: Merging real data into ML training set =="
cd ../ml-service
python3 - <<'PYEOF'
import pandas as pd
from pathlib import Path

real_path = Path("../backend/exports/real_transactions.csv")
tx_path = Path("data/raw/transactions.csv")

if real_path.exists() and real_path.stat().st_size > 0:
    real = pd.read_csv(real_path)
    existing = pd.read_csv(tx_path)
    merged = pd.concat([existing, real], ignore_index=True).drop_duplicates(subset=["transaction_id"])
    merged.to_csv(tx_path, index=False)
    print(f"Merged {len(real)} real rows in (total now {len(merged)})")
else:
    print("No real data yet — training on synthetic history only, that's fine.")
PYEOF

echo "== 3/4: Rebuilding features =="
python3 -c "
from training.generate_ledger_data import build_features_from_ledger
from training.generate_synthetic_data import build_hospitals, build_medicines
import pandas as pd
tx = pd.read_csv('data/raw/transactions.csv')
feats = build_features_from_ledger(tx, build_hospitals(), build_medicines())
feats.to_csv('data/processed/demand_features.csv', index=False)
print(f'Rebuilt {len(feats)} feature rows')
"

echo "== 4/4: Retraining XGBoost =="
python3 training/train_xgb.py

echo "Done. New model artifacts saved to artifacts/models/"