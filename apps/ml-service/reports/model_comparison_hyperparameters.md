# Model comparison — hyperparameters per model

Real training on the **full** training set (428,040 rows; chronologically split
train 2023-03-27…2025-12-29 · validation 2026-01-05…2026-03-30 ·
test 2026-04-06…2026-06-29 — 38,376 hold-out test rows). Identical 51 features
and `log1p` target transform for every family. See `notebooks/02_model_comparison.ipynb`.

## 1. Linear Regression (`sklearn.linear_model.LinearRegression`)

No hyperparameters — ordinary least squares on the same features/target.

| Parameter | Value |
|---|---|
| fit_intercept | True (default) |
| others | none (plain OLS) |

## 2. Decision Tree (`sklearn.tree.DecisionTreeRegressor`)

| Parameter | Value | Notes |
|---|---|---|
| max_depth | **5** | shared with XGBoost / RF |
| min_samples_leaf | **12** | = XGBoost min_child_weight 12 |
| random_state | 42 | shared |
| criterion | squared_error | = XGBoost objective (log1p RMSE) |

## 3. Random Forest (`sklearn.ensemble.RandomForestRegressor`)

| Parameter | Value | Notes |
|---|---|---|
| n_estimators | **800** | shared (XGBoost n_estimators) |
| max_depth | **5** | shared |
| min_samples_leaf | **12** | shared (min_child_weight) |
| max_samples | **0.80** | = XGBoost subsample 0.80 (bagging) |
| max_features | **0.80** | = XGBoost colsample_bytree 0.80 |
| random_state | 42 | shared |
| n_jobs | -1 | all cores |

## 4. XGBoost (`xgboost.XGBRegressor`) — production configuration

| Parameter | Value | Notes |
|---|---|---|
| n_estimators | 800 | cap (best iteration 798) |
| max_depth | 5 | shared with DT / RF |
| learning_rate | 0.03 | boosting step size (XGBoost only) |
| subsample | 0.80 | row sampling per tree |
| colsample_bytree | 0.80 | feature sampling per tree |
| min_child_weight | 12 | leaf-size regulariser |
| reg_alpha (L1) | 0.20 | |
| reg_lambda (L2) | 3.0 | |
| gamma | 0.02 | min loss reduction for a split |
| objective | reg:squarederror | on log1p target |
| tree_method | hist | |
| early_stopping_rounds | 50 | on validation set (patience; best at 798) |
| random_state / n_jobs | 42 / -1 | shared / all cores |

## Shared-hyperparameter mapping (the fairness claim, verified in code)

| Knob (XGBoost) | Value | Decision Tree | Random Forest |
|---|---|---|---|
| n_estimators | 800 | — (single tree) | 800 |
| max_depth | 5 | 5 | 5 |
| subsample | 0.80 | — | max_samples = 0.80 |
| colsample_bytree | 0.80 | — | max_features = 0.80 |
| min_child_weight | 12 | min_samples_leaf = 12 | min_samples_leaf = 12 |
| seed | 42 | 42 | 42 |

Linear Regression has no tunable hyperparameters; it is the honest linear baseline.

## Results on the hold-out test set (identical split/features/target)

| Model | R² (units) | R² (log1p) | MAE | RMSE | WAPE | sMAPE | Train time |
|---|---|---|---|---|---|---|---|
| **XGBoost** | **0.908** | **0.953** | **31.07** | **90.0** | **22.91%** | **46.29%** | 24.0 s |
| Random Forest | 0.846 | 0.941 | 37.38 | 116.6 | 27.56% | 49.46% | 639.0 s |
| Decision Tree | 0.831 | 0.939 | 39.66 | 122.4 | 29.25% | 50.20% | 3.6 s |
| Linear Regression | −101.86 | 0.783 | 189.39 | 3,017 | 139.67% | 75.53% | 0.5 s |
