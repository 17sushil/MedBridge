# MedBridge ML Service

FastAPI + XGBoost service for leakage-audited weekly medicine-demand forecasting, inventory alerts, and exchange matching.

For the full file-by-file and step-by-step explanation, see [`../../docs/ML_PIPELINE_GUIDE.md`](../../docs/ML_PIPELINE_GUIDE.md).

## Folder layout

```
apps/ml-service/
  notebooks/        # Jupyter notebooks — the primary interface for EDA, model
  │                 #   comparison, training, and evaluation (see below)
  training/         # Production scripts (called by notebooks + retrain.sh)
  app/api/          # FastAPI server (forecast / expiry / low-stock / exchange)
  app/services/     # Forecasting, inventory, exchange, seed logic
  data/raw/         # Generated datasets (git-ignored, deterministic)
  data/processed/   # Generated feature table + per-hospital partitions
  artifacts/        # Trained model + encoders + metrics (git-ignored)
  reports/          # Persisted comparison results (small CSVs, committed)
  tests/            # pytest suite (leakage guard, smoke, model load, seed)
```

## Notebooks (start here)

Everything an analyst or reviewer needs is in `notebooks/`, run from `apps/ml-service/`:

| # | Notebook | What it does |
|---|---|---|
| 1 | `01_data_extraction_and_eda.ipynb` | Extracts/generates the dataset and explores demand behaviour |
| 2 | `02_model_comparison.ipynb` | Benchmarks Linear/Ridge, Decision Tree, Random Forest, Gradient Boosting, HistGB and XGBoost — **shows why XGBoost wins** |
| 3 | `03_xgboost_training.ipynb` | Trains the production XGBoost (learning curve, feature importance, baselines) |
| 4 | `04_evaluation_and_visualization.ipynb` | Hold-out evaluation, error analysis, per-hospital accuracy, and a live recursive forecast from history |

The notebooks are committed **with their executed outputs** (tables + charts), so the model-selection
evidence is visible directly on GitHub without re-running. To re-run from scratch:

```bash
cd apps/ml-service
pip install -r requirements.txt jupyter
jupyter notebook notebooks/          # or `jupyter nbconvert --execute` on each
```

To regenerate the notebooks' source from `build_notebooks.py`:

```bash
python3 build_notebooks.py
```

## Setup

```bash
cd apps/ml-service
python3 -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
python3 -m pip install -r requirements.txt
```

## Generate, train, test, serve

```bash
python3 training/generate_ledger_data.py      # weekly ledger + features (41 hospitals)
python3 training/train_xgb.py                 # weekly model
python3 training/generate_daily_ledger.py     # day-level ledger (from the weekly ledger)
python3 training/train_daily_xgb.py           # daily model
python3 training/evaluate_model.py
python3 training/analyze_residuals.py    # residual + test-set figures (Fig 1 & 2)
python3 -m pytest -q
python3 -m uvicorn app.api.server:app --host 0.0.0.0 --port 8000 --reload
```

Do not run `generate_synthetic_data.py` directly. It is the reference-data library imported by the ledger generator.

## Residual & test-set analysis

`training/analyze_residuals.py` (and `notebooks/05_residual_and_test_analysis.ipynb`) rebuild the exact
chronological hold-out split and produce:

- `reports/residual_analysis/residual_distribution_and_error_analysis.png` — residual distribution
  (actual − predicted) + MAE by medicine category and by hospital type
- `reports/residual_analysis/actual_vs_predicted_test_set.png` — actual vs predicted weekly demand on
  the hold-out test set (per-series hexbin + weekly aggregate time series)
- `reports/residual_analysis/per_hospital_holdout_r2.png` — per-hospital hold-out R² with the eight
  demonstration hospitals highlighted (teal)
- `reports/residual_analysis/training_validation_loss.png` — training vs validation loss (log-space
  RMSE) per boosting round with the early-stopping iteration marked
- `residual_stats.csv`, `error_by_category.csv`, `error_by_facility_type.csv`,
  `per_hospital_holdout_r2.csv`, `test_predictions.csv` (predictions are git-ignored; regenerate with
  the script) and `residual_analysis_report.html` (self-contained report with all four figures).

## Daily forecast (day-by-day values)

The product shows demand per calendar day as well as per week. Two extra pipeline
steps produce the daily model; the weekly model is **not** retrained or changed:

```bash
python3 training/generate_daily_ledger.py   # day-level ledger, Mon..Sun profiles
python3 training/train_daily_xgb.py         # daily XGBoost + weekly roll-up metrics
```

- `generate_daily_ledger.py` splits each week's observed demand onto its seven
  calendar days with deterministic category-aware weekday profiles (OPD/acute
  items dip ~35–40% on Sat/Sun; chronic, maternity and blood products stay
  flat; the dip is deeper at PHCs, shallower at 24/7 teaching/trauma
  hospitals). The invariant `sum(days in week) == weekly demand` is verified to
  machine precision, so daily and weekly views can never contradict.
- `train_daily_xgb.py` trains XGBoost on day-level features (lags 1/2/3/7/14/30
  days, rolling 7/14/30, EWMs, day-of-week sin/cos, month sin/cos,
  monsoon/winter flags) with the same leakage discipline and the same
  chronological split as the weekly model, and also reports the metrics when
  daily predictions are rolled up to weeks.
- Serving is a **hybrid anchor**: the daily model shapes the Mon–Sun curve, and
  each ISO week's daily values are rescaled to sum exactly to the weekly
  model's total for that week (`daily_anchored_forecast`).

Metrics artefacts: `artifacts/metrics/daily_metrics.json`,
`artifacts/metrics/daily_training_history.csv`,
`artifacts/metrics/daily_feature_importance.csv`.

## Health and API docs

- Health: <http://localhost:8000/health>
- OpenAPI UI: <http://localhost:8000/docs>
- Next-week forecast: `GET /forecast?hospital_id=HOSP-BG-001`
- Forecast chart: `GET /forecast/chart?hospital_id=HOSP-BG-001&months=6`
- Daily forecast: `GET /forecast/daily?hospital_id=HOSP-BG-001&days=30&top=10`
- Metrics: `GET /metrics`

## Current validation result

The current leakage-audited chronological holdout run reports approximately:

- test pooled R²: **0.9085**
- test MAE: **31.07 weekly units**
- test RMSE: **90.00 weekly units**
- test WAPE: **22.91%**

**Daily model** (same hold-out period, day-level):

- daily test R²: **0.9789**, MAE **0.996 units/day**, WAPE **5.25%**, sMAPE **21.06%**
- daily predictions rolled up to weeks: R² **0.9952**, MAE **5.26**, WAPE **4.27%**
- early stopping at boosting round **687** of 700 (validation log-RMSE 0.1191)

The model-selection comparison (notebook 02) shows XGBoost ahead of every alternative family on
hold-out R² / MAE / WAPE; linear models are catastrophic (negative R²) on this heavy-tailed data.

The former result near 0.99 was invalid because `diff_1w` used current-week demand. The fixed feature uses only earlier weeks. No noise was added merely to lower the score.

Always read R² with WAPE, sMAPE, MAE, naive baselines, and the train/validation/test gap. R² is not an "accuracy percentage."

## CLI helpers

```bash
python3 main.py doctor
python3 main.py metrics
python3 main.py forecast --hospital HOSP-BG-001
python3 main.py expiry --hospital HOSP-BG-001
python3 main.py exchange --demo
```

## Generated files

Large files and model binaries are intentionally Git-ignored and regenerable:

```text
data/raw/*.csv            (hospitals, medicines, transactions, inventory_state, ...)
data/raw/*.json           (pending_arrivals)
data/processed/           (demand_features.csv, by_hospital/, daily_ledger.csv.gz, daily_by_hospital/)
artifacts/models/         (xgb_demand_model.joblib, xgb_demand_daily.joblib)
artifacts/encoders/       (label_encoders.joblib, daily_label_encoders.joblib)
artifacts/metrics/        (training_metrics.json, daily_metrics.json, ...)
```

A fresh clone must regenerate and retrain before the forecast endpoints become healthy.
