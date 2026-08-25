# MedBridge

A hospital medicine-exchange platform for Nepal. Hospitals track their own
inventory (batches, quantities, expiry, pricing), request surplus stock from
partner hospitals on the network, and get AI-assisted insights — live inventory
Q&A, XGBoost demand forecasting, expiry alerts, and smart exchange matching.

## Architecture

```
apps/
  backend/      Node.js + Express + Prisma (PostgreSQL) — REST API
  frontend/     React 19 + Vite — dashboard SPA
  ml-service/   FastAPI + XGBoost — forecasting, expiry, exchange matching
```

```
React SPA ──HTTP──▶ Express API ──Prisma──▶ PostgreSQL
     │                    │
     │                    └──▶ FastAPI ML service (XGBoost) :8000
     └── AI assistant (LLM via provider abstraction, RAG over live inventory)
```

## Quickstart

### 1. ML service (optional — needed for forecasting/matching)
```bash
cd apps/ml-service
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 training/generate_ledger_data.py          # event ledger + leakage-safe features
python3 training/train_xgb.py                     # audited training + saved model
uvicorn app.api.server:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Backend
```bash
cd apps/backend
npm install
cp .env.example .env            # set DATABASE_URL + a strong JWT_SECRET
npx prisma migrate dev
npm run seed                    # imports the 8 demo hospitals from ML CSVs
npm run dev                     # http://localhost:4000
```

### 3. Frontend
```bash
cd apps/frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api → :4000)
```

## Demo logins

Seeded from `apps/ml-service/data/raw/*.csv` (run the ML data generation
first). All use password **`MedBridge@2026`**:

| Hospital | Login |
|---|---|
| HOSP-BG-001 Bir Hospital | `admin@hosp-bg-001.medbridge.local` |
| HOSP-BG-002 TUTH | `admin@hosp-bg-002.medbridge.local` |
| Other six demo hospitals | Run `cd apps/backend && npm run verify:demo-logins` |

All demo administrators use `MedBridge@2026`. Legacy login: `sarah.johnson@cityhospital.org` / `password123`.

## AI Assistant

The assistant (`/ai-assistant`) supports multiple LLM providers (OpenAI,
Gemini, Claude, Groq, DeepSeek, OpenRouter) via `LLM_PROVIDER` in `.env`, and
falls back to a built-in mock provider when no API keys are configured. It
uses RAG to answer inventory, pricing, expiry, and stock questions from live
data.

## Admin panel

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` in `.env` to
enable the AdminJS panel at `/admin`.

## Tests

```bash
cd apps/backend && npm test      # node --test
```

## Docs

- `apps/backend/README.md` — API reference and adding-new-resource guide
- `docs/data/data_dictionary.md` — the synthetic Nepal dataset schema
- `RECOVERY_REPORT.md` — historical postmortem of a regression recovery pass
