# MedBridge XGBoost Training Report

## Model
- Algorithm: **XGBoost Regressor** (`reg:squarederror`, hist)
- Target: weekly `target_demand` with **log1p** transform
- Features: **74**
- Best iteration: **1199**

## Hold-out test performance
| Metric | Train | Valid | Test |
|--------|------:|------:|-----:|
| R² | 0.9991 | 0.9982 | **0.9957** |
| MAE | 2.18 | 2.18 | **3.27** |
| RMSE | 10.58 | 12.55 | **23.07** |
| sMAPE % | 9.61 | 9.57 | **9.76** |

## Top 15 features
       feature  importance
        ewm_4w    0.395623
  roll_mean_4w    0.273048
       ewm_12w    0.187034
 stockout_flag    0.040834
  roll_mean_2w    0.034958
 roll_mean_12w    0.026030
  roll_mean_8w    0.024088
        lag_1w    0.007213
       diff_1w    0.004459
       diff_4w    0.002919
        lag_4w    0.001661
   roll_max_4w    0.000349
seasonal_index    0.000231
   roll_min_4w    0.000214
   cost_x_lag4    0.000174

## Artifacts
- `artifacts/models/xgb_demand_model.joblib`
- `artifacts/models/xgb_demand_model.json`
- `artifacts/encoders/label_encoders.joblib`
- `artifacts/metrics/training_metrics.json`
