#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MedBridge — one-command local setup (idempotent; safe to re-run).
# Sets up: ML data+model, backend deps+.env+DB schema+seed, frontend deps.
#
#   bash scripts/bootstrap-local.sh          # deploy profile (fast, ~2 min)
#   FULL=1 bash scripts/bootstrap-local.sh   # full 41-hospital dataset (~4 min, ~1 GB RAM)
#
# After it finishes:  bash scripts/start-all.sh
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ------------------------------------------------------------------ checks
command -v python3 >/dev/null || { echo "✗ python3 not found"; exit 1; }
command -v node >/dev/null     || { echo "✗ node 20+ not found"; exit 1; }
command -v npm  >/dev/null     || { echo "✗ npm not found"; exit 1; }

echo "== MedBridge local bootstrap =="
echo "Python: $(python3 --version) | Node: $(node --version) | Root: $ROOT"

# ------------------------------------------------- ML: venv + deps + data
echo ""
echo "[1/5] ML service: virtualenv + Python dependencies"
cd apps/ml-service
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
./.venv/bin/pip install --quiet --upgrade pip
./.venv/bin/pip install --quiet -r requirements.txt

if [ "${FULL:-}" = "1" ]; then
  echo "[2/5] Generating FULL dataset (41 hospitals, 2023-01 → 2026-06)..."
  GEN_ENV=""
else
  echo "[2/5] Generating deploy-profile dataset (8 demo hospitals, 2025-03 → 2026-06)..."
  export MEDBRIDGE_START_DATE=2025-03-01 MEDBRIDGE_END_DATE=2026-06-30 MEDBRIDGE_DEMO_ONLY=1
fi
if [ ! -s data/processed/demand_features.csv ]; then
  ./.venv/bin/python training/generate_ledger_data.py
else
  echo "     (features already present — skipping generation; delete apps/ml-service/data to regenerate)"
fi

if [ ! -s artifacts/models/xgb_demand_model.joblib ]; then
  echo "     Training XGBoost..."
  ./.venv/bin/python training/train_xgb.py
else
  echo "     (model already present — delete apps/ml-service/artifacts to retrain)"
fi
cd "$ROOT"

# ------------------------------------------------- backend: deps + .env
echo ""
echo "[3/5] Backend: npm install + .env"
cd apps/backend
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

if [ ! -f .env ]; then
  echo "     Creating .env with generated secrets (local Postgres assumed)..."
  cat > .env <<EOF
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/medbridge"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
NODE_ENV=development
JWT_SECRET="$(openssl rand -hex 32 || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
JWT_EXPIRES_IN="7d"
ML_SERVICE_URL="http://localhost:8000"
ADMIN_EMAIL="admin@medbridge.local"
ADMIN_PASSWORD="$(openssl rand -hex 8 || node -e "console.log(require('crypto').randomBytes(8).toString('hex'))")"
ADMIN_SESSION_SECRET="$(openssl rand -hex 32 || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
LLM_PROVIDER="mock"
LLM_TEMPERATURE="0.7"
LLM_MAX_TOKENS="2048"
MOCK_LLM_ENABLED="true"
EOF
fi

# ------------------------------------------------- database
echo ""
echo "[4/5] Database: Postgres must be reachable at 127.0.0.1:5432"
if command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 -p 5432 -q; then
  echo "     Postgres is up."
else
  echo "     ✗ Postgres is not reachable. Start one, then re-run this script:"
  echo "       Docker:  docker run --name medbridge-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=medbridge -p 5432:5432 -d postgres:16"
  echo "       Ubuntu:  sudo apt-get install -y postgresql && sudo service postgresql start"
  echo "       macOS:   brew services start postgresql@16"
  echo "     (or set DATABASE_URL in apps/backend/.env to any Postgres, e.g. Neon)"
  exit 1
fi

# Create the database if it doesn't exist yet (harmless when it does)
if command -v psql >/dev/null 2>&1; then
  PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='medbridge'" | grep -q 1 || \
    PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -c "CREATE DATABASE medbridge;" || true
fi

echo "     Applying migrations + seeding demo hospitals..."
npx prisma migrate deploy
node prisma/seed.js | tail -4
cd "$ROOT"

# ------------------------------------------------- frontend
echo ""
echo "[5/5] Frontend: npm install"
cd apps/frontend
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
cd "$ROOT"

echo ""
echo "✅ Bootstrap complete."
echo ""
echo "Start everything:   bash scripts/start-all.sh"
echo "  Frontend  http://localhost:5173   (login: admin@hosp-bg-001.medbridge.local / MedBridge@2026)"
echo "  API       http://localhost:4000   (health: /health, admin panel: /admin)"
echo "  ML        http://localhost:8000   (health: /health, docs: /docs)"
echo "Verify:            bash scripts/verify-deploy.sh"
