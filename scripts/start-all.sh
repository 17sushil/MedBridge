#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MedBridge — start all three services in the background (logs in .local/).
#    bash scripts/start-all.sh    (re-run to restart; safe/idempotent)
#    bash scripts/stop-all.sh     (stop them)
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .local/logs

# Make sure the DB is running (Linux; macOS/Windows: start it your usual way)
if command -v pg_isready >/dev/null 2>&1 && ! pg_isready -h 127.0.0.1 -p 5432 -q; then
  echo "◇ Postgres down — starting (if you use systemd/brew start it manually)…"
  (sudo service postgresql start 2>/dev/null || true) && sleep 2 || true
fi

stop() { # stop a service by its log marker
  local name="$1"
  pkill -f "uvicorn app.api.server:app" 2>/dev/null && echo "◇ stopped $name" || true
}

# stop whatever is running (best-effort)
pkill -f "medbridge-api-log" 2>/dev/null || true
pkill -f "uvicorn app.api.server:app" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 1

echo "◇ Starting ML service (port 8000)…"
nohup sh -c 'cd apps/ml-service && exec ./.venv/bin/uvicorn app.api.server:app --host 0.0.0.0 --port 8000' \
  > .local/logs/ml.log 2>&1 &
echo $! > .local/ml.pid

echo "◇ Starting backend API (port 4000)…"
nohup sh -c 'cd apps/backend && exec node src/index.js' > .local/logs/api.log 2>&1 &
echo $! > .local/api.pid

echo "◇ Starting frontend (port 5173)…"
nohup sh -c 'cd apps/frontend && exec npm run dev -- --host' > .local/logs/frontend.log 2>&1 &
echo $! > .local/frontend.pid

echo ""
echo "✅ All services launching. Watch logs:"
echo "  tail -f .local/logs/ml.log .local/logs/api.log .local/logs/frontend.log"
echo "  or verify: bash scripts/verify-deploy.sh"
