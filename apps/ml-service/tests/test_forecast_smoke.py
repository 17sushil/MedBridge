from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_batch_forecast_returns_non_negative_predictions():
    pytest.importorskip("xgboost")
    from app.services.forecast_services import batch_forecast

    features_path = ROOT / "data" / "processed" / "demand_features.csv"
    if not features_path.exists():
        pytest.skip("Generated demand features are not available")

    frame = pd.read_csv(features_path).head(3)
    predicted = batch_forecast(frame)
    assert len(predicted) == len(frame)
    assert "predicted_demand" in predicted
    assert (predicted["predicted_demand"] >= 0).all()
