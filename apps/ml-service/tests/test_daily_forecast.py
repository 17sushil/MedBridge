from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]


def _daily_history():
    pytest.importorskip("xgboost")
    partition = ROOT / "data" / "processed" / "daily_by_hospital" / "HOSP-BG-001.csv.gz"
    if not partition.exists():
        pytest.skip("Generated daily serving partitions are not available")
    return pd.read_csv(partition, parse_dates=["date"]).rename(
        columns={"demand_units": "target_demand"}
    )


def _daily_model_present() -> bool:
    model = ROOT / "artifacts" / "models" / "xgb_demand_daily.joblib"
    enc = ROOT / "artifacts" / "encoders" / "daily_label_encoders.joblib"
    return model.exists() and model.stat().st_size > 0 and enc.exists()


def test_daily_forecast_is_genuinely_future_and_daily():
    from app.services.forecast_services import recursive_daily_forecast

    history = _daily_history()
    future = recursive_daily_forecast(history, days=7)
    assert len(future) == history["medicine_id"].nunique() * 7
    assert future["date"].min() > history["date"].max()
    assert (future["target_demand"].isna()).all()
    assert (future["predicted_demand"] >= 0).all()
    # day-by-day, no gaps
    per_med = future[future["medicine_id"] == future["medicine_id"].iloc[0]]
    dates = sorted(per_med["date"].dt.date)
    assert len(dates) == 7
    assert all((dates[i + 1] - dates[i]).days == 1 for i in range(len(dates) - 1))


def test_daily_anchor_sums_exactly_to_weekly_total():
    pytest.importorskip("xgboost")
    if not _daily_model_present():
        pytest.skip("Trained daily model is not available")
    from app.services.forecast_services import daily_anchored_forecast

    daily_history = _daily_history()
    weekly_history = pd.read_csv(
        ROOT / "data" / "processed" / "by_hospital" / "HOSP-BG-001.csv",
        parse_dates=["week_start"],
    )
    result = daily_anchored_forecast(daily_history, weekly_history, days=14)
    assert not result.empty

    result["week_start"] = pd.to_datetime(result["week_start"])
    sums = result.groupby(
        ["hospital_id", "medicine_id", "week_start"], observed=True, sort=False,
        as_index=False,
    )["predicted_daily"].sum()
    totals = result.groupby(
        ["hospital_id", "medicine_id", "week_start"], observed=True, sort=False,
        as_index=False,
    )["week_total"].first()
    merged = sums.merge(totals, on=["hospital_id", "medicine_id", "week_start"])
    error = (merged["predicted_daily"] - merged["week_total"]).abs().max()
    assert error <= 1e-2


def test_daily_feature_builder_is_t_minus_1_safe():
    from app.services.forecast_services import build_next_day_features

    history = _daily_history()
    future = build_next_day_features(history)
    expected_date = pd.Timestamp(history["date"].max()) + pd.Timedelta(days=1)
    assert (pd.to_datetime(future["date"]) == expected_date).all()
    assert future["target_demand"].isna().all()
    # lag_1d of the forecast day must equal the last observed value
    last_values = history.sort_values("date").groupby(
        ["hospital_id", "medicine_id"], observed=True
    )["target_demand"].last()
    row = future.iloc[0]
    key = (row["hospital_id"], row["medicine_id"])
    assert abs(row["lag_1d"] - last_values[key]) < 1e-6
