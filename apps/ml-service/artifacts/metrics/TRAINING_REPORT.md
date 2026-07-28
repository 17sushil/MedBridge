# MedBridge XGBoost Training Report

## Model
- Algorithm: **XGBoost Regressor** (`reg:squarederror`, hist)
- Target: weekly `target_demand` with **log1p** transform
- Features: **74**
- Best iteration: **1199**

## Hold-out test performance
| Metric | Train | Valid | Test |
|--------|------:|------:|-----:|
| R² | 0.9991 | 0.9971 | **0.9967** |
| MAE | 2.18 | 2.44 | **2.75** |
| RMSE | 10.79 | 16.38 | **19.48** |
| sMAPE % | 9.51 | 10.07 | **9.22** |

## Top 15 features
       feature  importance
        ewm_4w    0.370435
  roll_mean_4w    0.291203
       ewm_12w    0.190485
  roll_mean_2w    0.043134
 stockout_flag    0.039275
  roll_mean_8w    0.026186
 roll_mean_12w    0.017270
        lag_1w    0.007848
       diff_1w    0.004585
   roll_max_4w    0.004161
       diff_4w    0.002385
        lag_4w    0.001221
     month_cos    0.000228
seasonal_index    0.000186
   cost_x_lag4    0.000166

## Artifacts
- `artifacts/models/xgb_demand_model.joblib`
- `artifacts/models/xgb_demand_model.json`
- `artifacts/encoders/label_encoders.joblib`
- `artifacts/metrics/training_metrics.json`
