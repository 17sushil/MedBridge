import { useCallback, useEffect, useMemo, useState } from "react";
import { TrendingUp, CalendarDays, CalendarRange } from "lucide-react";
import { api } from "../services/api";
import { aiService } from "../services/aiService";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import DemandForecastChart from "../components/charts/DemandForecastChart";
import AIInsightPanel from "../components/ai/AIInsightPanel";
import "./DemandForecast.css";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

export default function DemandForecast() {
  const [data, setData] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [granularity, setGranularity] = useState("weekly");

  useEffect(() => {
    api.getDemandForecast().then(setData);
  }, []);

  useEffect(() => {
    if (granularity !== "daily" || dailyData) return;
    setDailyLoading(true);
    api
      .getDailyDemandForecast(30)
      .then(setDailyData)
      .finally(() => setDailyLoading(false));
  }, [granularity, dailyData]);

  const dailyStats = useMemo(() => {
    if (!dailyData?.daily_totals?.length) return null;
    const totals = dailyData.daily_totals;
    const total = totals.reduce((sum, row) => sum + row.predicted_demand, 0);
    const peak = totals.reduce((best, row) =>
      row.predicted_demand > best.predicted_demand ? row : best
    );
    return {
      total: Math.round(total),
      avgPerDay: Math.round(total / totals.length),
      peakDate: peak.date,
      peakValue: Math.round(peak.predicted_demand),
      days: totals.length,
    };
  }, [dailyData]);

  const fetcher = useCallback(() => aiService.getForecastInsight(), []);

  return (
    <div>
      <PageHeader
        title="Demand Forecast"
        subtitle="Historical demand versus projected need — weekly totals or day-by-day values."
      />

      <div className="forecast-grid">
        <Card className="forecast-chart-card">
          <div className="forecast-chart-head">
            <TrendingUp size={16} color="#0B7269" />
            <h3 className="forecast-chart-title">Actual vs. Forecast Demand</h3>
            <div className="forecast-toggle" role="tablist" aria-label="Forecast granularity">
              <button
                type="button"
                className={`forecast-toggle-btn ${
                  granularity === "weekly" ? "forecast-toggle-btn--active" : ""
                }`}
                onClick={() => setGranularity("weekly")}
                aria-pressed={granularity === "weekly"}
              >
                <CalendarRange size={14} /> Weekly
              </button>
              <button
                type="button"
                className={`forecast-toggle-btn ${
                  granularity === "daily" ? "forecast-toggle-btn--active" : ""
                }`}
                onClick={() => setGranularity("daily")}
                aria-pressed={granularity === "daily"}
              >
                <CalendarDays size={14} /> Daily
              </button>
            </div>
          </div>

          {granularity === "weekly" &&
            (data ? (
              <DemandForecastChart data={data} mode="weekly" />
            ) : (
              <Skeleton style={{ height: 300, width: "100%", marginTop: "0.5rem" }} />
            ))}

          {granularity === "daily" &&
            (dailyLoading && !dailyData ? (
              <Skeleton style={{ height: 300, width: "100%", marginTop: "0.5rem" }} />
            ) : dailyData ? (
              <>
                <DemandForecastChart
                  data={data}
                  mode="daily"
                  dailyData={dailyData}
                />
                {dailyStats && (
                  <>
                    {dailyData.available === false && (
                      <p className="forecast-fallback-note">{dailyData.message}</p>
                    )}
                    <div className="forecast-daily-stats">
                      <div className="forecast-daily-stat">
                        <span className="forecast-daily-stat-label">Next {dailyStats.days} days</span>
                        <span className="forecast-daily-stat-value">
                          {formatNumber(dailyStats.total)} units
                        </span>
                      </div>
                      <div className="forecast-daily-stat">
                        <span className="forecast-daily-stat-label">Average / day</span>
                        <span className="forecast-daily-stat-value">
                          {formatNumber(dailyStats.avgPerDay)} units
                        </span>
                      </div>
                      <div className="forecast-daily-stat">
                        <span className="forecast-daily-stat-label">Peak day</span>
                        <span className="forecast-daily-stat-value">
                          {dailyStats.peakDate} · {formatNumber(dailyStats.peakValue)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <Skeleton style={{ height: 300, width: "100%", marginTop: "0.5rem" }} />
            ))}
        </Card>

        <div className="forecast-side">
          <AIInsightPanel title="Forecast Insight" fetcher={fetcher} />
          <Card className="forecast-info-card">
            <h3 className="forecast-info-title">How forecasting will work</h3>
            <ul className="forecast-info-list">
              <li className="forecast-info-item">
                <span className="forecast-info-dot" />
                Weekly totals come from the leakage-audited XGBoost model.
              </li>
              <li className="forecast-info-item">
                <span className="forecast-info-dot" />
                Daily values shape each week Mon–Sun, and always sum exactly to
                the weekly total (hybrid daily forecast).
              </li>
              <li className="forecast-info-item">
                <span className="forecast-info-dot" />
                Suggests which partner hospitals to request from first.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
