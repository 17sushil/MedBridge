# MedBridge XGBoost Training Report

## Model
- Algorithm: **XGBoost Regressor** (`reg:squarederror`, hist)
- Target: weekly `target_demand` with **log1p** transform
- Features: **55**
- Best iteration: **1196**

## Hold-out test performance
| Metric | Train | Valid | Test |
|--------|------:|------:|-----:|
| R² | 0.9983 | 0.9917 | **0.9908** |
| MAE | 2.51 | 3.12 | **3.59** |
| RMSE | 13.20 | 25.79 | **29.62** |
| sMAPE % | 1.21 | 1.44 | **1.42** |

## Top 15 features
            feature  importance
             ewm_4w    0.518809
       roll_mean_4w    0.212214
            ewm_12w    0.140624
      roll_mean_12w    0.031290
       roll_mean_2w    0.026820
             lag_1w    0.021536
       roll_mean_8w    0.011705
            diff_1w    0.009563
exchange_in_last_4w    0.006833
            diff_4w    0.006172
          pack_size    0.004033
             lag_4w    0.003704
        roll_min_4w    0.001554
  emergency_last_4w    0.000942
      unit_cost_npr    0.000808

## Artifacts
- `artifacts/models/xgb_demand_model.joblib`
- `artifacts/models/xgb_demand_model.json`
- `artifacts/encoders/label_encoders.joblib`
- `artifacts/metrics/training_metrics.json`
