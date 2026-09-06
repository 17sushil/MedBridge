# MedBridge — Step-by-Step Deployment Guide (Zero Cost)

This is the complete, click-by-click walkthrough. Total cost: **$0/month**.
Total time: **~30 minutes**, most of it waiting for builds.

| Component | Host | Free tier |
|---|---|---|
| Frontend (React SPA) | **Vercel** | always-on, unlimited static requests |
| Backend API (Express + Prisma) | **Render** web service | 512 MB, sleeps after ~15 min idle |
| ML service (FastAPI + XGBoost) | **Render** web service | 512 MB, sleeps after ~15 min idle |
| PostgreSQL | **Neon** | persistent free tier (512 MB storage) |

> ⚠️ Do **not** use Render's free PostgreSQL: it **deletes your data after
> 30 days**. Neon is permanent.

---

## What's already prepared in this repo

| File | Purpose |
|---|---|
| `render.yaml` | Blueprint for both Render services (API + ML). Builds generate the dataset, train XGBoost, migrate & seed the DB automatically. |
| `apps/frontend/vercel.json` | SPA rewrite so React Router works on Vercel. |
| `.github/workflows/ci.yml` | Free CI on every push: backend tests (with a Postgres service container), frontend build, ML generate→train→pytest→health smoke. |

> **Pushing `.github/workflows/` requires a token with the `workflow` scope.**
> GitHub refuses Personal Access Tokens that only have `Contents` permission
> when a commit adds/changes workflow files. Options: create a fine-grained
> PAT with **Workflows: Read and write** (plus Contents: Read and write), or
> add the file manually from the GitHub web UI (Add file → Create new file →
> path `.github/workflows/ci.yml` → paste the content). CI is optional for
> deployment — Render and Vercel never read it.
| `docker-compose.yml` + 3 `Dockerfile`s | Self-host the whole stack with one command (`docker compose up --build`). |
| `scripts/bootstrap-local.sh` | One-command local setup (data + model + deps + DB + seed). |
| `scripts/start-all.sh` / `stop-all.sh` | Start/stop all three services locally. |
| `scripts/verify-deploy.sh` | End-to-end smoke test (works locally AND against deployed URLs). |
| `scripts/check-dotenv.sh` | Validates your `.env` before boot. |
| `docs/ENV_REFERENCE.md` | Every environment variable explained. |

---

## STEP 0 — Get these changes onto GitHub

The repo currently has **uncommitted deployment changes** (made in this
workspace). Two ways:

**Option A — I push it for you (no work on your side).**
Give me a **fine-grained GitHub token** (Settings → Developer settings →
Personal access tokens → Fine-grained tokens → Generate):
- Repository access: **only `17sushil/MedBridge`**, permissions: **Contents:
  Read and write**.
- Paste it here. I'll commit and push, and you can revoke it afterwards.

**Option B — you push from your machine.** On your computer:

```bash
git clone https://github.com/17sushil/MedBridge.git && cd MedBridge
# then copy the changed/new files from this workspace:
#   render.yaml
#   docs/DEPLOYMENT_GUIDE.md  docs/ENV_REFERENCE.md
#   apps/frontend/vercel.json
#   apps/frontend/vite.config.js   (host/allowedHosts lines)
#   apps/ml-service/training/generate_synthetic_data.py
#   apps/ml-service/training/generate_ledger_data.py
#   apps/ml-service/requirements.txt
#   .github/workflows/ci.yml
#   scripts/ bootstrap-local.sh start-all.sh stop-all.sh verify-deploy.sh check-dotenv.sh
#   docker-compose.yml
#   apps/backend/.env.production.example
#   apps/{backend,frontend}/.dockerignore, apps/frontend/{Dockerfile,nginx.conf},
#   apps/backend/Dockerfile, apps/ml-service/{Dockerfile,.dockerignore}
git add -A && git commit -m "deploy: zero-cost hosting configs (Render+Vercel+Neon), CI, Docker, scripts" && git push
```

(Simplest: clone this workspace's repo as an extra remote and `git pull` it.)

---

## STEP 1 — Create the database on Neon (5 min)

1. Go to <https://neon.tech> → **Sign up** (GitHub login works).
2. **Create project** → name `medbridge`, region nearest you (e.g. Singapore),
   PostgreSQL 16/17 → **Create**.
3. On the project page: **Connect** → pick **psql** or the connection string.
4. Copy the **Direct** connection string:

   ```
   postgresql://neondb_owner:xxxx@ep-yyyy-zzzz.region.aws.neon.tech/medbridge?sslmode=require
   ```

   Keep this — it's your `DATABASE_URL`.

---

## STEP 2 — Deploy API + ML on Render (10 min, one Blueprint)

1. <https://render.com> → **Sign up** (GitHub login).
2. Dashboard → **New → Blueprint** (not "Web Service" — Blueprint reads
   `render.yaml` and creates BOTH services at once).
3. **Connect repository** → choose `17sushil/MedBridge` → **Select**.
4. Render shows the detected services `medbridge-ml` and `medbridge-api`.
   Click **Apply**.
5. **Sync environment variables** — Render asks for the variables marked
   `sync: false` in the blueprint:
   - `DATABASE_URL` → paste the Neon string from Step 1
   - `JWT_SECRET` → run `openssl rand -hex 32` on your machine (any 64-char
     hex string)
   - `CLIENT_ORIGIN` → `https://medbridge.vercel.app` (you'll create the
     Vercel project in Step 3; if Vercel gives you a different URL, change
     this later, then Render restarts the API automatically)
6. **Create Resources** → builds start (~3 min each):
   - `medbridge-api`: installs Node deps → **generates the same ML dataset**
     → `prisma migrate deploy` → `preDeployCommand` **seeds the 8 demo
     hospitals** → serves Express. Requires that the Python generation
     succeeds (it needs only numpy+pandas; we trimmed it to keep builds fast).
   - `medbridge-ml`: installs Python deps → **generates the dataset and
     trains XGBoost during the build** (deploy profile ≈ 250 MB peak RAM,
     ~2 min — sized to fit the free 512 MB instance) → serves FastAPI.
7. When green, note the URLs:
   - API: `https://medbridge-api-xxxx.onrender.com` (the URL suffix is
     assigned by Render; click the service to see it)
   - ML: `https://medbridge-ml-xxxx.onrender.com`
8. **Check the ML health** (also warms it up):
   `curl https://medbridge-ml-xxxx.onrender.com/health`
   Expect `"status": "ok"` with model metrics.
9. **Admin panel**: enabled at `/admin` on the API URL. `ADMIN_PASSWORD` and
   `ADMIN_SESSION_SECRET` were auto-generated — see the service's
   **Environment** tab (values are visible there).

> First request after idle takes ~50 s (free-tier spin-down) — that's normal.

---

## STEP 3 — Deploy the frontend on Vercel (5 min)

1. <https://vercel.com> → **Sign up** (GitHub login).
2. **Add New… → Project → Import** → `17sushil/MedBridge`.
3. Vercel detects the repo but **you must set the root**:
   - Framework preset: **Vite** (auto-detected)
   - **Root Directory: `apps/frontend`** (click Edit → select the folder)
   - Build command: `npm run build` (auto), Output: `dist` (auto)
4. **Deploy.** You get `https://medbridge.vercel.app` (Vercel may append a
   suffix; use the URL shown).
5. Confirm the SPA loads. It will show a login page; **login won't work yet**
   — that's expected until Step 4.

---

## STEP 4 — Wire the two together (2 min)

The only two cross-references:

**4a. Point the frontend at the API** (Vercel):
1. Project → **Settings → Environment Variables** → Add:
   - Name: `VITE_API_URL`
   - Value: `https://medbridge-api-xxxx.onrender.com/api`
   - Environments: **Production, Preview, Development**
2. Save → go to **Deployments** → top deployment → **⋯ → Redeploy**.
   (VITE_* vars are baked at build time — a plain restart is NOT enough.)

**4b. Point the API's CORS at the frontend** (Render):
1. `medbridge-api` → **Environment** → confirm
   `CLIENT_ORIGIN = https://medbridge.vercel.app` (exactly, no trailing `/`).
2. If you edited it, Render restarts the service automatically. Done.

If Vercel gave you a custom/suffixed URL, update BOTH sides to match.

---

## STEP 5 — Verify the deployment (2 min)

From your machine (fill in your URLs):

```bash
API_URL=https://medbridge-api-xxxx.onrender.com \
ML_URL=https://medbridge-ml-xxxx.onrender.com \
FRONT_URL=https://medbridge.vercel.app \
bash scripts/verify-deploy.sh
```

Expected output: 6/6 ✔ — ML health + model R², API health, login, forecast
(API→ML round trip), dashboard stats, SPA + proxy.

Manual check: open `https://medbridge.vercel.app`, log in with
`admin@hosp-bg-001.medbridge.local` / `MedBridge@2026`, and visit
**Demand Forecast** (real XGBoost output), **Inventory**, **AI Assistant**.

---

## STEP 6 — Optional add-ons (still $0)

**Real AI answers (free Groq tier, 1 min):**
1. <https://console.groq.com/keys> → create a free API key.
2. Render → `medbridge-api` → **Environment** → add:
   `LLM_PROVIDER=groq`, `GROQ_API_KEY=<key>` → Save → **Manual Deploy**.
   (Any provider works: openai, gemini, claude, deepseek, openrouter — see
   `docs/ENV_REFERENCE.md`.)

**Keep services warm (avoid 50 s cold starts):**
Create a free <https://uptimerobot.com> monitor that pings
`https://medbridge-api-xxxx.onrender.com/health` every 5 minutes (and one for
the ML URL). Vercel and Neon never sleep.

**Custom domain:** Vercel → Settings → Domains → add yours; then update
Render's `CLIENT_ORIGIN` to match.

---

## Day-2 operations

| Task | How |
|---|---|
| **Deploy new code** | `git push` → Vercel auto-deploys frontend; Render auto-deploys both services. |
| **Retrain the model** | Render → `medbridge-ml` → **Manual Deploy → Clear build cache & deploy**. Build regenerates data + retrains. (For real data first: run `bash apps/retrain.sh` locally after adding transactions, then deploy.) |
| **Reset demo data** | Render → `medbridge-api` → **Manual Deploy** (seed runs at preDeploy). |
| **Rotate JWT_SECRET** | Edit in Render env → Save. All users re-login. |
| **Disable /admin** | Delete `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` env vars. |
| **Upgrade dataset locally** | `FULL=1 bash scripts/bootstrap-local.sh` (full 41-hospital, 3.5-year dataset). |

---

## Self-hosting (alternative to Vercel/Render)

With Docker on any VPS/PC:

```bash
docker compose up --build
# Frontend http://localhost:5173 · API http://localhost:4000 · ML http://localhost:8000
# First boot: ~2 min (ML generates data + trains, API seeds)
```

Environment variables for compose live in `docker-compose.yml` (change
`JWT_SECRET` before exposing it publicly).

---

## Local development

```bash
bash scripts/bootstrap-local.sh   # everything: deps, data, model, .env, DB, seed
bash scripts/start-all.sh         # ML :8000 · API :4000 · frontend :5173
bash scripts/verify-deploy.sh     # 6/6 checks
bash scripts/stop-all.sh
```

(`FULL=1` on bootstrap = full dataset instead of the 8-hospital deploy
profile.)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| API `/health` ok but login 401 | `JWT_SECRET` changed after redeploy → reset it to a stable value, users re-login |
| Browser CORS error | `CLIENT_ORIGIN` must be the exact origin (scheme+host, no path, no trailing `/`) and match the URL users actually open |
| Forecast page error / "Cannot reach ML service" | ML service is asleep or the URL is wrong. Hit `…/health` to wake it; check `ML_SERVICE_URL` env (auto in blueprint) |
| ML `/health` says `degraded` | Build didn't finish training → Manual Deploy with cache clear |
| Build killed (OOM) | `MEDBRIDGE_DEMO_ONLY=1` / date vars were removed; full dataset needs ~1 GB |
| `prisma generate` fails in build | Transient engine download; re-run deploy. `NODE_VERSION=20` is set |
| Seed fails: missing CSV | Render builds must run the ML generation **before** `npm install` (already in `buildCommand`); local: re-run bootstrap |
| Vercel shows blank page on refresh | `vercel.json` must exist for the SPA rewrite (it's in the repo) |
| Data disappeared after 30 days | You're on Render's free Postgres → switch to Neon, redeploy |
| Vite dev warns "allowedHosts" (local weird hosts) | `apps/frontend/vite.config.js` already whitelists `.e2b.app` / `.localhost` |
| CI fails on ML tests | Tests skip when artifacts are absent, but CI generates them first; `test_model_load` needs training to have run |
