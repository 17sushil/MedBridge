#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MedBridge — end-to-end deployment smoke test.
# Works locally AND against Render/Vercel URLs:
#
#   bash scripts/verify-deploy.sh                                  # local services
#   API_URL=https://medbridge-api-xxxx.onrender.com \
#   ML_URL=https://medbridge-ml-xxxx.onrender.com \
#   bash scripts/verify-deploy.sh                                  # deployed stack
#   (optional) FRONT_URL=https://medbridge.vercel.app  checks the SPA + proxy
#
# Exits 0 only if every check passes.
# ---------------------------------------------------------------------------
set -uo pipefail

API_URL="${API_URL:-http://localhost:4000}"
ML_URL="${ML_URL:-http://localhost:8000}"
FRONT_URL="${FRONT_URL:-}"
LOGIN_EMAIL="${LOGIN_EMAIL:-admin@hosp-bg-001.medbridge.local}"
LOGIN_PASSWORD="${LOGIN_PASSWORD:-MedBridge@2026}"

API_URL="${API_URL%/}"; ML_URL="${ML_URL%/}"; FRONT_URL="${FRONT_URL%/}"

PASS=0; FAIL=0
ok()   { echo "  ✔ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✘ $1"; FAIL=$((FAIL+1)); }

jqget() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null || echo ""; }

echo "== MedBridge verification =="
echo "  API : $API_URL"
echo "  ML  : $ML_URL"
[ -n "$FRONT_URL" ] && echo "  FRONT: $FRONT_URL"

echo ""
echo "[1/6] ML service health (model + features + metrics)"
H=$(curl -fsS --max-time 60 "$ML_URL/health" 2>/dev/null | jqget "d.get('status')") || H=""
if [ "$H" = "ok" ]; then ok "ML status=ok"; else bad "ML /health (got '$H') — if on Render free, first call may need ~50 s cold start"; fi
R2=$(curl -fsS --max-time 30 "$ML_URL/health" 2>/dev/null | jqget "round(d['test_metrics']['R2'],4)") || R2=""
[ -n "$R2" ] && ok "model R²=$R2" || bad "no test metrics"

echo ""
echo "[2/6] API health"
H=$(curl -fsS --max-time 60 "$API_URL/health" 2>/dev/null | jqget "d.get('status')") || H=""
[ "$H" = "ok" ] && ok "API status=ok" || bad "API /health (got '$H')"

echo ""
echo "[3/6] Login (hospital admin)"
TOKEN=$(curl -fsS --max-time 60 -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}" 2>/dev/null | jqget "d.get('token','')") || TOKEN=""
if [ -n "$TOKEN" ]; then ok "JWT issued (${#TOKEN} chars, email $LOGIN_EMAIL)"; else bad "login failed"; fi

echo ""
echo "[4/6] Forecast via API → ML integration"
if [ -n "$TOKEN" ]; then
  F=$(curl -fsS --max-time 90 "$API_URL/api/demand-forecast?weeks=3" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null | jqget "len(d)") || F=""
  if [ -n "$F" ] && [ "$F" -gt 0 ] 2>/dev/null; then ok "forecast returned $F months"; else bad "forecast empty/error"; fi
else
  bad "skipped (no token)"
fi

echo ""
echo "[5/6] Dashboard stats"
if [ -n "$TOKEN" ]; then
  S=$(curl -fsS --max-time 60 "$API_URL/api/dashboard/stats" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null | jqget "d.get('totalMedicines',{}).get('value',0)") || S=""
  if [ -n "$S" ]; then ok "dashboard stats: $S total medicine units"; else bad "dashboard/stats failed"; fi
else
  bad "skipped (no token)"
fi

echo ""
echo "[6/6] Frontend"
if [ -n "$FRONT_URL" ]; then
  T=$(curl -fsS --max-time 90 "$FRONT_URL/" 2>/dev/null | grep -o "<title>[^<]*</title>" | head -1) || T=""
  [ -n "$T" ] && ok "SPA served ($T)" || bad "frontend not reachable"

  # Two supported topologies:
  #  A) same-origin proxy (local Vite dev / Docker nginx): login via FRONT_URL/api
  #  B) cross-origin (Vercel SPA → Render API): browser-simulated login from
  #     the FRONT_URL origin directly to API_URL
  P=$(curl -fsS --max-time 60 -X POST "$FRONT_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}" 2>/dev/null | jqget "d.get('token','')") || P=""
  if [ -n "$P" ]; then
    ok "frontend → API proxy works (login via SPA origin)"
  else
    C=$(curl -fsS --max-time 60 -D /tmp/verify_headers.txt -X POST "$API_URL/api/auth/login" \
      -H "Content-Type: application/json" \
      -H "Origin: $FRONT_URL" \
      -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}" 2>/dev/null | jqget "d.get('token','')") || C=""
    CORSOK=$(grep -i "access-control-allow-origin: $FRONT_URL" /tmp/verify_headers.txt >/dev/null 2>&1 && echo yes || echo no)
    if [ -n "$C" ]; then
      ok "cross-origin login works (Vercel SPA → Render API, CORS $CORSOK)"
    else
      bad "login failed both via proxy and cross-origin — check VITE_API_URL & CLIENT_ORIGIN"
    fi
  fi
else
  echo "  - skipped (set FRONT_URL to check the SPA + proxy)"
fi

echo ""
echo "== Result: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
