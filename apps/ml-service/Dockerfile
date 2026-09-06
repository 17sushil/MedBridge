# MedBridge ML service — self-hosted image (also used by docker-compose).
# Build: generates nothing (fast). At start: regenerates data + retrains
# (deploy profile, ~2 min), then serves FastAPI. This keeps the image small
# and lets you retrain by simply restarting the container.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MEDBRIDGE_START_DATE=2025-03-01 \
    MEDBRIDGE_END_DATE=2026-06-30 \
    MEDBRIDGE_DEMO_ONLY=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", \
     "python training/generate_ledger_data.py && \
      python training/train_xgb.py && \
      exec uvicorn app.api.server:app --host 0.0.0.0 --port 8000"]
