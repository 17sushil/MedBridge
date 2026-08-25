# MedBridge ML Service

FastAPI + XGBoost service for leakage-audited weekly medicine-demand forecasting, inventory alerts, and exchange matching.

For the full file-by-file and step-by-step explanation, see [`../../docs/ML_PIPELINE_GUIDE.md`](../../docs/ML_PIPELINE_GUIDE.md).

## Setup

```bash
cd apps/ml-service
python3 -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
python3 -m pip install -r requirements.txt
```

## Generate, train, test, serve

```bash
python3 training/generate_ledger_data.py
python3 training/train_xgb.py
python3 training/evaluate_model.py
python3 -m pytest -q
python3 -m uvicorn app.api.server:app --host 0.0.0.0 --port 8000 --reload
```

Do not run `generate_synthetic_data.py` directly. It is the reference-data library imported by the ledger generator.

## Health and API docs

- Health: <http://localhost:8000/health>
- OpenAPI UI: <http://localhost:8000/docs>
- Next-week forecast: `GET /forecast?hospital_id=HOSP-BG-001`
- Forecast chart: `GET /forecast/chart?hospital_id=HOSP-BG-001&months=6`
- Metrics: `GET /metrics`

## Current validation result

The current leakage-audited chronological holdout run reports approximately:

- test pooled R²: **0.9085**
- test MAE: **31.07 weekly units**
- test RMSE: **90.00 weekly units**
- test WAPE: **22.91%**

The former result near 0.99 was invalid because `diff_1w` used current-week demand. The fixed feature uses only earlier weeks. No noise was added merely to lower the score.

Always read R² with WAPE, sMAPE, MAE, naive baselines, and the train/validation/test gap. R² is not an “accuracy percentage.”

## CLI helpers

```bash
python3 main.py doctor
python3 main.py metrics
python3 main.py forecast --hospital HOSP-BG-001
python3 main.py expiry --hospital HOSP-BG-001
python3 main.py exchange --demo
```

## Generated files

Large files and model binaries are intentionally Git-ignored:

```text
data/raw/transactions.csv
data/processed/demand_features.csv
data/processed/by_hospital/
artifacts/models/
artifacts/encoders/
artifacts/metrics/
```

A fresh clone must regenerate and retrain before the forecast endpoints become healthy.
