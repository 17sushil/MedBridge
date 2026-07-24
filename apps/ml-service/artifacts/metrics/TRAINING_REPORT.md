# MedBridge XGBoost Training Report

## Model
- Algorithm: **XGBoost Regressor** (`reg:squarederror`, hist)
- Target: weekly `target_demand` with **log1p** transform
- Features: **74**
- Best iteration: **1199**

## Hold-out test performance
| Metric | Train | Valid | Test |
|--------|------:|------:|-----:|
| R² | 0.9990 | 0.9978 | **0.9959** |
| MAE | 2.25 | 2.33 | **3.02** |
| RMSE | 11.33 | 14.30 | **21.83** |
| sMAPE % | 9.99 | 9.97 | **10.52** |

## Top 15 features
          feature  importance
           ewm_4w    0.511485
     roll_mean_4w    0.210837
          ewm_12w    0.126188
    stockout_flag    0.048612
     roll_mean_8w    0.035361
     roll_mean_2w    0.030386
    roll_mean_12w    0.017791
           lag_1w    0.008590
          diff_1w    0.005030
          diff_4w    0.002833
           lag_4w    0.001266
      roll_min_4w    0.000226
      roll_max_4w    0.000222
maternity_x_obgyn    0.000131
      cost_x_lag4    0.000125

## Artifacts
- `artifacts/models/xgb_demand_model.joblib`
- `artifacts/models/xgb_demand_model.json`
- `artifacts/encoders/label_encoders.joblib`
- `artifacts/metrics/training_metrics.json`
