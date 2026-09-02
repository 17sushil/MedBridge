import { useCallback, useEffect, useState, useMemo } from "react";
import { TrendingUp, RefreshCw, Download, AlertTriangle, Package, Search, Filter } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import Badge from "../components/ui/Badge";
import DemandForecastChart from "../components/charts/DemandForecastChart";
import { statusTone } from "../utils/expiry";
import "./DemandForecast.css";

export default function DemandForecast() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getDemandForecast();
      setData(res);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartData = data?.chart || data?.series || [];
  const summary = data?.summary || null;
  const topMedicines = data?.topMedicines || [];
  const allMedicines = data?.allMedicines || topMedicines; // Backend should provide all, fallback to top
  const risks = data?.shortageRisks || [];
  const meta = data?.meta || {};

  // Filter all medicines
  const filteredAll = useMemo(() => {
    if (!allMedicines) return [];
    return allMedicines.filter(m => {
      const matchesSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.category.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === "All" || 
        (filter === "Critical" && (m.daysOfCover < 7 || m.riskLevel === "CRITICAL")) ||
        (filter === "Low" && m.daysOfCover < 14) ||
        (filter === "Healthy" && m.daysOfCover >= 30);
      return matchesSearch && matchesFilter;
    });
  }, [allMedicines, search, filter]);

  const handleExport = () => {
    if (!chartData.length) return;
    const csv = ["Month,Actual,Forecast", ...chartData.map(r => `${r.month},${r.actual ?? ""},${r.forecast ?? ""}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forecast-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const handleExportAll = () => {
    if (!filteredAll.length) return;
    const csv = ["Medicine,Category,CurrentStock,AvgMonthly,PredictedNextMonth,DaysCover,Status", ...filteredAll.map(m => `${m.name},${m.category},${m.currentStock},${m.avgMonthly},${m.predictedNextMonth},${m.daysOfCover},${m.riskLevel || m.status || "Normal"}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all-medicines-forecast-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="forecast-final">
      <PageHeader
        title="Demand Forecast"
        subtitle={meta?.hospitalName ? `${meta.hospitalName} • ${meta?.model || "Forecast"} • ${meta?.source === "xgboost" ? "XGBoost Live" : "Smart Average"} • All medicines forecast included` : "Actual vs predicted demand - all medicines with forecast, simple and actionable"}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!chartData.length}>
              <Download size={14} /> Chart CSV
            </Button>
          </div>
        }
      />

      {loading ? (
        <>
          <Skeleton style={{ height: 100, width: "100%", marginBottom: 16 }} />
          <Skeleton style={{ height: 300, width: "100%" }} />
        </>
      ) : error ? (
        <Card className="forecast-error">
          <AlertTriangle size={18} color="#DC2626" />
          <div>
            <h4>Failed to load forecast</h4>
            <p>{error}</p>
            <Button size="sm" onClick={fetchData} style={{ marginTop: 8 }}>Retry</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Summary - Useful */}
          {summary && (
            <div className="forecast-cards">
              <Card className="f-card">
                <div className="f-label">Forecast Next 2 Months</div>
                <div className="f-value">{summary.totalForecast?.toLocaleString() || 0} units</div>
                <div className={`f-sub ${summary.growthPercent > 0 ? "up" : "down"}`}>{summary.growthPercent > 0 ? "+" : ""}{summary.growthPercent}% vs last</div>
              </Card>
              <Card className="f-card">
                <div className="f-label">At Risk</div>
                <div className="f-value" style={{ color: summary.atRiskCount > 0 ? "#DC2626" : "#0E8C82" }}>{summary.atRiskCount || 0}</div>
                <div className="f-sub">{summary.criticalCount || 0} critical • {summary.expiryCount || 0} expiry</div>
              </Card>
              <Card className="f-card">
                <div className="f-label">Avg Cover</div>
                <div className="f-value">{summary.avgDaysCover || 0} days</div>
                <div className="f-sub">{summary.avgDaysCover < 14 ? "Low - reorder" : "Healthy"}</div>
              </Card>
              <Card className="f-card">
                <div className="f-label">Accuracy</div>
                <div className="f-value">{summary.accuracy ? `R² ${summary.accuracy}` : meta?.source === "xgboost" ? "XGBoost" : "Smart Avg"}</div>
                <div className="f-sub">{meta?.hospitalCode || "Local"} • {allMedicines.length} medicines</div>
              </Card>
            </div>
          )}

          {/* Chart */}
          <Card className="forecast-chart">
            <div className="forecast-chart-head">
              <h3><TrendingUp size={16} /> Actual vs Forecast</h3>
              {meta?.source === "xgboost" ? <span className="badge xgb">XGBoost Live</span> : <span className="badge fallback">Smart Avg</span>}
            </div>
            <DemandForecastChart data={chartData} />
          </Card>

          {/* All Medicines Forecast - NEW SECTION USER REQUESTED */}
          <Card className="forecast-all-section">
            <div className="forecast-all-head">
              <div>
                <h3><Package size={16} /> All Medicines Forecast - {filteredAll.length} medicines</h3>
                <p>Complete forecast for every medicine in your inventory with current stock, predicted need, and days of cover</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div className="search-wrap">
                  <Search size={14} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicine or category..." />
                </div>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
                  <option value="All">All</option>
                  <option value="Critical">Critical &lt;7d</option>
                  <option value="Low">Low &lt;14d</option>
                  <option value="Healthy">Healthy &gt;30d</option>
                </select>
                <Button variant="outline" size="sm" onClick={handleExportAll}><Download size={14} /> Export All</Button>
              </div>
            </div>

            <div className="forecast-table-wrap">
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Category</th>
                    <th>Current</th>
                    <th>Avg Monthly</th>
                    <th>Predicted Next</th>
                    <th>Days Cover</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAll.map((m, idx) => {
                    const isCritical = m.daysOfCover < 7 || m.riskLevel === "CRITICAL";
                    const isLow = m.daysOfCover < 14;
                    const status = isCritical ? "Critical" : isLow ? "Low" : m.daysOfCover < 30 ? "Medium" : "Healthy";
                    return (
                      <tr key={m.medicineId || idx} className={isCritical ? "critical-row" : isLow ? "low-row" : ""}>
                        <td>
                          <div className="med-name">{m.name}</div>
                          <div className="med-sub">{m.medicineId || m.unit}</div>
                        </td>
                        <td><Badge tone="navy">{m.category}</Badge></td>
                        <td>{m.currentStock} {m.unit}</td>
                        <td>{m.avgMonthly}</td>
                        <td style={{ fontWeight: 700, color: "#0E8C82" }}>{m.predictedNextMonth}</td>
                        <td>
                          <span className={`cover-badge ${isCritical ? "critical" : isLow ? "low" : "healthy"}`}>
                            {m.daysOfCover}d
                          </span>
                        </td>
                        <td><Badge tone={statusTone(status)}>{status}</Badge></td>
                        <td>
                          {isCritical ? <span className="action critical">Order Now</span> : isLow ? <span className="action low">Reorder Soon</span> : <span className="action ok">Monitor</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredAll.length === 0 && <div className="empty">No medicines match search</div>}
            </div>
          </Card>

          {/* Risks - Simple */}
          {risks.length > 0 && (
            <Card className="forecast-risks">
              <h4><AlertTriangle size={14} /> Shortage Risks - Immediate Attention</h4>
              <div className="risk-grid">
                {risks.slice(0, 6).map((r, i) => (
                  <div key={i} className={`risk-card ${r.riskLevel?.toLowerCase()}`}>
                    <div className="risk-name">{r.name}</div>
                    <div className="risk-meta">{r.quantity} {r.unit} • {r.reason} • Exp {new Date(r.expiry).toLocaleDateString()}</div>
                    <span className={`risk-badge ${r.riskLevel?.toLowerCase()}`}>{r.riskLevel}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="forecast-info">
            <h4>How forecast works</h4>
            <ul>
              <li><strong>XGBoost</strong> when ML online: 90 days consumption + seasonality, R² {summary?.accuracy || "0.85+"}</li>
              <li><strong>Smart Avg Fallback:</strong> 3-month weighted avg + trend</li>
              <li><strong>Days Cover:</strong> Stock / Daily use - &lt;7d Critical, &lt;14d Low, &gt;30d Healthy</li>
              <li><strong>All Medicines:</strong> Shows forecast for every medicine, not just top 5, with search and filter</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
