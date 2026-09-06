#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# MedBridge — sanity-check apps/backend/.env before boot/deploy.
#   bash scripts/check-dotenv.sh
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/apps/backend/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ no .env found at apps/backend/.env — copy apps/backend/.env.example"
  exit 1
fi

val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' ; }

FAIL=0
warn() { echo "  ⚠ $1"; }
ok()   { echo "  ✔ $1"; }
err()  { echo "  ✘ $1"; FAIL=1; }

echo "== .env check =="

DB=$(val DATABASE_URL)
case "$DB" in
  postgresql://*) ok "DATABASE_URL set";;
  *) err "DATABASE_URL missing or not a postgresql:// URL";;
esac

JWT=$(val JWT_SECRET)
if [ -z "$JWT" ]; then err "JWT_SECRET empty"; elif [ "${#JWT}" -lt 32 ]; then err "JWT_SECRET too short (<32 chars)"; else ok "JWT_SECRET set (${#JWT} chars)"; fi
case "$JWT" in
  *medbridge-dev-secret*|*change-me*|secret|dev-secret) err "JWT_SECRET is a known-weak value";;
esac

ML=$(val ML_SERVICE_URL)
[ -n "$ML" ] && ok "ML_SERVICE_URL=$ML" || err "ML_SERVICE_URL missing (e.g. http://localhost:8000)"

ORIGIN=$(val CLIENT_ORIGIN)
if [ -n "$ORIGIN" ]; then
  case "$ORIGIN" in
    *localhost*) warn "CLIENT_ORIGIN=$ORIGIN — fine for dev, must be your Vercel URL in production";;
    *) ok "CLIENT_ORIGIN=$ORIGIN";;
  esac
else
  warn "CLIENT_ORIGIN unset (CORS will fail for a cross-origin frontend)"
fi

PROVIDER=$(val LLM_PROVIDER); KEY=""
case "$PROVIDER" in
  openai)  KEY=$(val OPENAI_API_KEY);;
  gemini)  KEY=$(val GEMINI_API_KEY);;
  claude)  KEY=$(val CLAUDE_API_KEY);;
  groq)    KEY=$(val GROQ_API_KEY);;
  deepseek)KEY=$(val DEEPSEEK_API_KEY);;
  openrouter) KEY=$(val OPENROUTER_API_KEY);;
  mock|"") PROVIDER=mock;;
  *) warn "LLM_PROVIDER=$PROVIDER unrecognized — will fall back to mock";;
esac
if [ "$PROVIDER" != "mock" ] && [ -z "$KEY" ]; then
  warn "LLM_PROVIDER=$PROVIDER but no API key set — assistant will use mock"
else
  ok "LLM_PROVIDER=$PROVIDER"
fi

# Optional AdminJS (all three needed to enable /admin)
A1=$(val ADMIN_EMAIL); A2=$(val ADMIN_PASSWORD); A3=$(val ADMIN_SESSION_SECRET)
if [ -n "$A1" ] && [ -n "$A2" ] && [ -n "$A3" ]; then ok "AdminJS enabled (/admin)"; else warn "AdminJS disabled — set ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_SESSION_SECRET to enable /admin"; fi

echo ""
[ "$FAIL" -eq 0 ] && echo "✅ .env looks good" || echo "❌ fix the items above"
exit "$FAIL"
