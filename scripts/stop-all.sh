#!/usr/bin/env bash
# Stop all MedBridge services started by start-all.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for f in .local/api.pid .local/ml.pid .local/frontend.pid; do
  if [ -f "$f" ]; then
    kill "$(cat "$f")" 2>/dev/null && echo "◇ stopped $(basename "$f" .pid)" || true
    rm -f "$f"
  fi
done
# fallback sweep (also covers children of the nohup shells)
pkill -f "uvicorn app.api.server:app" 2>/dev/null || true
pkill -f "node src/index.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
echo "✅ Stopped (Postgres left running)."
