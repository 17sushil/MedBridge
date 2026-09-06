# MedBridge — Environment Variable Reference

Every variable, where it lives, and whether it is required.

| Variable | Used by | Required | Default | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | API | ✅ | – | Postgres URL (`postgresql://…?sslmode=require` for Neon). Create it in Neon, paste on Render. |
| `PORT` | API | – | `4000` | Render injects `PORT` automatically; `$PORT` is used for ML. |
| `CLIENT_ORIGIN` | API | ✅ prod | `http://localhost:5173` | **Exact** frontend origin, no trailing slash. CORS allow-list. Set to your Vercel URL. |
| `NODE_ENV` | API | – | `development` | Set `production` on Render. Server refuses weak `JWT_SECRET` in production. |
| `JWT_SECRET` | API | ✅ prod | – | `openssl rand -hex 32`. Keep stable across redeploys or sessions invalidate. |
| `JWT_EXPIRES_IN` | API | – | `7d` | `https://github.com/vercel/ms` format. |
| `ML_SERVICE_URL` | API | – | `http://localhost:8000` | `render.yaml` wires Render's ML URL automatically via `fromService`. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET` | API | – | – | All three = AdminJS panel at `/admin`. Delete to disable. Auto-generated on Render. |
| `LLM_PROVIDER` | API | – | `mock` | `openai` `gemini` `claude` `groq` `deepseek` `openrouter` `mock`. Unknown → mock. |
| `LLM_MODEL` | API | – | provider default | Optional override for the chosen provider. |
| `LLM_TEMPERATURE` | API | – | `0.7` | |
| `LLM_MAX_TOKENS` | API | – | `2048` | |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | API | key ⇒ | `gpt-4o-mini` | Only needed when `LLM_PROVIDER=openai`. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | API | key ⇒ | `gemini-1.5-flash` | |
| `CLAUDE_API_KEY` / `CLAUDE_MODEL` | API | key ⇒ | `claude-3-haiku-20240307` | |
| `GROQ_API_KEY` / `GROQ_MODEL` | API | key ⇒ | `llama-3.1-70b-versatile` | **Best free option** (console.groq.com). |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | API | key ⇒ | `deepseek-chat` | |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` / `OPENROUTER_BASE_URL` | API | key ⇒ | `openai/gpt-4o-mini` | One key, many models. |
| `MOCK_LLM_ENABLED` | API | – | `true` | `false` disables the mock fallback (assistant errors without a real key). |
| `VITE_API_URL` | Frontend (build-time) | prod | `/api` | Vercel → Settings → Environment Variables. Absolute: `https://medbridge-api-xxxx.onrender.com/api`. Unset ⇒ same-origin (local dev / Docker nginx). |
| `MEDBRIDGE_START_DATE` / `MEDBRIDGE_END_DATE` | ML (build) | – | `2023-01-02` / `2026-06-30` | Dataset window. Deploy profile: `2025-03-01` / `2026-06-30`. |
| `MEDBRIDGE_DEMO_ONLY` | ML (build) | – | unset | `1` = only the 8 demo hospitals (fits free-tier builds). |
| `SEED_ON_START` | API (Docker only) | – | unset | `1` = re-seed demo hospitals at container start. |
| `PYTHONUNBUFFERED` | ML | – | – | Log lines appear immediately. |

## Where each host reads them

- **Render `medbridge-api`**: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`,
  `NODE_ENV` (sync vars you fill at Blueprint time), `LLM_PROVIDER` + one
  provider key (optional), `ADMIN_*` (auto-generated).
- **Render `medbridge-ml`**: `MEDBRIDGE_*` (baked into `render.yaml`); no
  secrets.
- **Vercel**: `VITE_API_URL` (Project → Settings → Environment Variables;
  then **Redeploy** — it is baked in at build time).
- **Local**: `apps/backend/.env` (created by `scripts/bootstrap-local.sh`;
  `scripts/check-dotenv.sh` validates it).
