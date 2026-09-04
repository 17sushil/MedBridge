import { useCallback, useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { api } from "../services/api";
import { aiService } from "../services/aiService";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import DemandForecastChart from "../components/charts/DemandForecastChart";
import AIInsightPanel from "../components/ai/AIInsightPanel";
import "./DemandForecast.css";

export default function DemandForecast() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getDemandForecast().then(setData);
  }, []);

  const forecastFetcher = useCallback(() => aiService.getForecastInsight(), []);
  const smartMatchFetcher = useCallback(() => aiService.getSmartMatchSuggestions(), []);

  return (
    <div>
      <PageHeader
        title="Demand Forecast"
        subtitle="Historical demand versus projected need for the coming months."
      />

      <div className="forecast-grid">
        <Card className="forecast-chart-card">
          <div className="forecast-chart-head">
            <TrendingUp size={16} color="#0B7269" />
            <h3 className="forecast-chart-title">Actual vs. Forecast Demand</h3>
          </div>
          {data ? (
            <DemandForecastChart data={data} />
          ) : (
            <Skeleton style={{ height: 300, width: "100%", marginTop: "0.5rem" }} />
          )}
        </Card>

        <div className="forecast-side">
          <AIInsightPanel title="Forecast Insight" fetcher={forecastFetcher} />
          <div style={{ marginTop: "1rem" }}>
            <AIInsightPanel title="Smart Match Insight" fetcher={smartMatchFetcher} />
          </div>
        </div>
      </div>
    </div>
  );
}
