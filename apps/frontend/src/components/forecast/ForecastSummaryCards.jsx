import { TrendingUp, TrendingDown, AlertTriangle, Package, Target, Clock, DollarSign, Activity } from "lucide-react";
import Card from "../ui/Card";

export default function ForecastSummaryCards({ summary, meta }) {
  if (!summary) return null;

  const cards = [
    {
      label: "Total Forecast (Next 2 Mo)",
      value: `${summary.totalForecast?.toLocaleString() || 0} units`,
      sub: `${summary.growthPercent > 0 ? "+" : ""}${summary.growthPercent}% vs last month`,
      icon: TrendingUp,
      color: summary.growthPercent > 0 ? "#0E8C82" : "#8A94A3",
      trend: summary.growthPercent > 0 ? "up" : "down",
    },
    {
      label: "At-Risk SKUs",
      value: `${summary.atRiskCount || 0}`,
      sub: `${summary.criticalCount || 0} critical, ${summary.expiryCount || 0} expiry risk`,
      icon: AlertTriangle,
      color: summary.atRiskCount > 0 ? "#DC2626" : "#0E8C82",
      trend: summary.atRiskCount > 0 ? "down" : "up",
    },
    {
      label: "Avg Days of Cover",
      value: `${summary.avgDaysCover || 0} days`,
      sub: summary.avgDaysCover < 14 ? "Low cover - reorder needed" : summary.avgDaysCover < 30 ? "Medium cover" : "Healthy cover",
      icon: Clock,
      color: summary.avgDaysCover < 14 ? "#DC2626" : summary.avgDaysCover < 30 ? "#D97706" : "#0E8C82",
    },
    {
      label: "Model Accuracy",
      value: summary.accuracy ? `R² ${summary.accuracy}` : "Fallback",
      sub: meta?.source === "xgboost" ? `XGBoost • ${meta?.hospitalCode}` : "Weighted Avg • Local",
      icon: Target,
      color: meta?.source === "xgboost" ? "#0E8C82" : "#8A94A3",
    },
  ];

  return (
    <div className="forecast-summary-grid">
      {cards.map((c, idx) => (
        <Card key={idx} className="forecast-summary-card">
          <div className="forecast-summary-head">
            <div className="forecast-summary-icon" style={{ background: `${c.color}15`, color: c.color }}>
              <c.icon size={18} />
            </div>
            {c.trend && (
              <span className={`forecast-trend ${c.trend}`}>
                {c.trend === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              </span>
            )}
          </div>
          <div className="forecast-summary-label">{c.label}</div>
          <div className="forecast-summary-value" style={{ color: c.color }}>{c.value}</div>
          <div className="forecast-summary-sub">{c.sub}</div>
        </Card>
      ))}
    </div>
  );
}
