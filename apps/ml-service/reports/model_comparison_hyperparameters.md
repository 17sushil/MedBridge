# Model Comparison — Hyperparameters per Model

Real training on the **full** training set (428,040 rows; chronologically split:
train 2023-03-27…2025-12-29 · validation 2026-01-05…2026-03-30 ·
test 2026-04-06…2026-06-29 — 38,376 hold-out test rows).
Identical 51 features for every family. See `notebooks/02_model_comparison.ipynb`.

---

## 1. Linear Regression — `sklearn.linear_model.LinearRegression`

> **Excluded from the comparison figure** — its hold-out R² is **−101.9** (negative,
> i.e. worse than predicting the mean). It remains here for completeness and is
> kept in `model_comparison.csv`; the plotted comparison shows the three models
> with positive R² only.

| Parameter | Value |
|---|---|
| fit_intercept | True (default) |
| others | none — plain OLS, no tunable hyperparameters |

## 2. Decision Tree — `sklearn.tree.DecisionTreeRegressor`

| Parameter | Value | Notes |
|---|---|---|
| max_depth | 5 | shared with XGBoost / Random Forest |
| min_samples_leaf | 12 | = XGBoost min_child_weight 12 |
| criterion | squared_error | same objective family |
| random_state | 42 | shared |

## 3. Random Forest — `sklearn.ensemble.RandomForestRegressor`

| Parameter | Value | Notes |
|---|---|---|
| n_estimators | 800 | shared with XGBoost |
| max_depth | 5 | shared |
| min_samples_leaf | 12 | shared (min_child_weight) |
| max_samples | 0.80 | = XGBoost subsample (bagging) |
| max_features | 0.80 | = XGBoost colsample_bytree |
| criterion | squared_error | same objective family |
| n_jobs | -1 | all cores |
| random_state | 42 | shared |

## 4. XGBoost — `xgboost.XGBRegressor` (production model)

| Parameter | Value | Notes |
|---|---|---|
| n_estimators | 800 | cap; best iteration 798 |
| max_depth | 5 | shared with DT / RF |
| learning_rate | 0.03 | boosting step size (XGBoost only) |
| subsample | 0.80 | row sampling per tree |
| colsample_bytree | 0.80 | feature sampling per tree |
| min_child_weight | 12 | leaf-size regulariser |
| reg_alpha (L1) | 0.20 | L1 regularisation |
| reg_lambda (L2) | 3.0 | L2 regularisation |
| gamma | 0.02 | min loss reduction for a split |
| objective | reg:squarederror | on log1p target |
| tree_method | hist | histogram-based, fast |
| early_stopping_rounds | 50 | patience on validation (best at 798) |
| random_state / n_jobs | 42 / -1 | shared / all cores |

---

## Shared-knob mapping (the fairness claim)

| Knob (XGBoost) | Value | Decision Tree | Random Forest |
|---|---|---|---|
| n_estimators | 800 | — (single tree) | 800 |
| max_depth | 5 | 5 | 5 |
| subsample | 0.80 | — | max_samples = 0.80 |
| colsample_bytree | 0.80 | — | max_features = 0.80 |
| min_child_weight | 12 | min_samples_leaf = 12 | min_samples_leaf = 12 |
| random_state | 42 | 42 | 42 |

Linear Regression has no tunable hyperparameters — it is the honest linear baseline.

---

## Results on the hold-out test set (identical split / features / target)

*The figure shows the three models with positive R²; Linear Regression is reported
here for completeness only.*

| Model | R² (units) | MAE | RMSE | WAPE | sMAPE | Train time |
|---|---|---|---|---|---|---|
| **XGBoost** | **0.908** | **31.07** | **90.0** | **22.91%** | **46.29%** | 24.0 s |
| Random Forest | 0.846 | 37.38 | 116.6 | 27.56% | 49.46% | 639.0 s |
| Decision Tree | 0.831 | 39.66 | 122.4 | 29.25% | 50.20% | 3.6 s |
| Linear Regression (excluded from figure) | −101.86 | 189.39 | 3,017 | 139.67% | 75.53% | 0.5 s |

**Naive persistence baselines on the same test rows (for context):**

| Baseline | R² (units) | MAE | RMSE | WAPE | sMAPE |
|---|---|---|---|---|---|
| Naive: 4-week mean | 0.872 | 35.89 | 106.6 | 26.47% | 46.14% |
| Naive: last week | 0.844 | 41.26 | 117.5 | 30.43% | 50.82% |

> Reading the table honestly: only **XGBoost** beats the 4-week-mean baseline on R² and
> WAPE. Random Forest and Decision Tree fall below it — for a smooth 13-week horizon,
> simple persistence is a surprisingly strong baseline, and the comparison shows the
> boost comes from gradient boosting, not from the shared hyperparameter values.

---

## Why these hyperparameters? (answer you can give)

**Principle: defaults from domain experience, then validated — not tuned to a
split was chosen on purpose.** We started from a deliberately balanced
configuration and validated it on a strict chronological hold-out, so the
choice is evidence-based rather than fitted to the test set.

1. **n_estimators = 800 with early_stopping_rounds = 50.** A large enough budget
   to converge fully; early stopping on the *validation* split (never the test
   set) picks the best boosting round (798 of 800) and prevents overfitting —
   the training/validation gap at the stop point was ≈0.0012 in log-RMSE.

2. **max_depth = 5, min_child_weight = 12.** Shallow trees + a high leaf-weight
   threshold keep each learner weak and generalisable. Weekly demand is
   moderately noisy per hospital–medicine pair; deep trees memorise it
   (the same depth-10 configuration degrades on the hold-out).

3. **learning_rate = 0.03** (small) **with subsample / colsample = 0.80**.
   A small step size plus row/column sampling reduces variance and lets the
   model exploit the full 800-round budget — the classic "slow + regularised +
   many rounds" recipe for gradient boosting on tabular data.

4. **reg_alpha = 0.20, reg_lambda = 3.0, gamma = 0.02.** Mild L1/L2 shrinkage
   plus a minimum loss-reduction for splits keeps the model sparse and dampens
   the heavy-tailed error cases seen in the residual analysis (the extreme
   residuals beyond ±500 units).

5. **Random Forest / Decision Tree mirrors.** To keep the comparison fair, every
   knob the two families expose is set to the same value (800 trees, depth 5,
   subsample/cols 0.80, leaf ≥ 12, seed 42). The remaining gap is therefore
   attributable to the *algorithm* (boosting vs bagging vs single tree), which
   is exactly what the figure is meant to show.

6. **What we did NOT do.** No hyperparameter search on the test set, no
   per-model tuning to inflate scores. The configuration came from the same
   production file used to serve the model (`training/train_xgb.py`), and the
   comparison simply confirms that choice on held-out data.
