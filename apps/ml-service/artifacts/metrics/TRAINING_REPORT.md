# MedBridge XGBoost Training Report

## Model
- Algorithm: **XGBoost Regressor** (`reg:squarederror`, hist)
- Target: weekly `target_demand` with **log1p** transform
- Features: **57**
- Best iteration: **1199**

## Hold-out test performance
| Metric | Train | Valid | Test |
|--------|------:|------:|-----:|
| R² | 0.9981 | 0.9952 | **0.9925** |
| MAE | 2.62 | 3.05 | **4.15** |
| RMSE | 14.36 | 20.08 | **29.57** |
| sMAPE % | 1.23 | 1.50 | **1.60** |

## Top 15 features
            feature  importance
             ewm_4w    0.507948
            ewm_12w    0.348046
       roll_mean_4w    0.055713
      roll_mean_12w    0.028215
       roll_mean_8w    0.014585
exchange_in_last_4w    0.010839
             lag_1w    0.008908
            diff_1w    0.006949
            diff_4w    0.006657
             lag_4w    0.003785
        roll_min_4w    0.002531
  emergency_last_4w    0.001417
       roll_mean_2w    0.000803
        roll_std_8w    0.000407
        roll_max_4w    0.000338

## Artifacts
- `artifacts/models/xgb_demand_model.joblib`
- `artifacts/models/xgb_demand_model.json`
- `artifacts/encoders/label_encoders.joblib`
- `artifacts/metrics/training_metrics.json`
