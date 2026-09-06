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
python training/generate_ledger_data.py           # generates data/raw CSVs + features
python training/train_xgb.py                      # trains + saves the model
# (or open notebooks/01–04 for EDA, model comparison, training & evaluation)
uvicorn app.api.server:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Backend
```bash
cd apps/backend
npm install                     # also auto-generates the Prisma client (postinstall)
cp .env.example .env            # set DATABASE_URL + a strong JWT_SECRET
npm run db:setup                # applies migrations + seeds the 8 demo hospitals
npm run dev                     # http://localhost:4000
```

> **Database setup is a single step.** The schema is a single squashed
> baseline migration (`prisma/migrations/20260831000000_baseline`), so
> `npm run db:setup` works against any fresh database with zero drift prompts.
> Other handy commands: `npm run db:migrate` (apply pending), `npm run
> db:studio` (browse tables), `npm run db:reset` (wipe + rebuild).

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
| DEMO-01 Bir Hospital | `admin@demo-01.medbridge.local` |
| DEMO-02 TUTH | `admin@demo-02.medbridge.local` |
| DEMO-03 … DEMO-08 | `admin@demo-0X.medbridge.local` |

Legacy single login: `sarah.johnson@cityhospital.org` / `password123`.

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
- `docs/DEPLOYMENT_GUIDE.md` — **zero-cost deploy (Vercel + Render + Neon)**
- `docs/ML_PIPELINE_GUIDE.md` — ML pipeline deep-dive
- `RECOVERY_REPORT.md` — historical postmortem of a regression recovery pass

## One-command local setup

```bash
bash scripts/bootstrap-local.sh   # deps + ML data/model + .env + DB schema + seed
bash scripts/start-all.sh         # ML :8000 · API :4000 · frontend :5173
bash scripts/verify-deploy.sh     # 6/6 end-to-end checks
bash scripts/stop-all.sh
```

(`FULL=1 bash scripts/bootstrap-local.sh` regenerates the full 41-hospital
dataset instead of the lightweight 8-hospital deploy profile.)

## Deployment (zero cost)

Everything is preconfigured — frontend → **Vercel**, API + ML → **Render
Blueprint** (`render.yaml`), database → **Neon free**:

- The Render builds **generate the dataset and train XGBoost automatically**
  using a `MEDBRIDGE_DEMO_ONLY` profile sized for the free 512 MB instances.
- `.github/workflows/ci.yml` runs backend tests, the frontend build, and the
  full ML pipeline (generate → train → test → health smoke) on every push.
- `docker-compose.yml` + per-app `Dockerfile`s let you self-host everything
  with `docker compose up --build`.

Follow **`docs/DEPLOYMENT_GUIDE.md`** — a click-by-click walkthrough with
verification; `docs/ENV_REFERENCE.md` documents every environment variable.
