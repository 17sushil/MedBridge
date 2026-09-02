import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Pill,
  DollarSign,
  AlertTriangle,
  Repeat2,
  ArrowRight,
  Package,
  TrendingUp,
  Clock,
  ShoppingCart,
  AlertCircle,
  Truck,
} from "lucide-react";
import { api } from "../services/api";
import { aiService } from "../services/aiService";
import { useAsyncData } from "../hooks/useAsyncData";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import ErrorState from "../components/ui/ErrorState";
import InventoryTrendChart from "../components/charts/InventoryTrendChart";
import CategoryDonutChart from "../components/charts/CategoryDonutChart";
import AIInsightPanel from "../components/ai/AIInsightPanel";
import { formatCurrency, formatNumber, formatDate } from "../utils/format";
import { statusTone } from "../utils/expiry";
import "./Dashboard.css";

const getRecentMedicines = () => api.getMedicines().then((m) => m.slice(0, 4));
const getDashboardStats = () => api.getDashboardStats();
const getMedicineCategories = () => api.getMedicineCategories();
const getExpiryAlerts = () => api.getExpiryAlerts();
const getRecentActivity = () => api.getRecentActivity();

export default function Dashboard() {
  const [period, setPeriod] = useState("week");
  const getInventoryOverview = useCallback(() => api.getInventoryOverview(period), [period]);

  const { data: stats, error: statsError, reload: reloadStats } = useAsyncData(getDashboardStats);
  const { data: overview, error: overviewError, reload: reloadOverview } = useAsyncData(getInventoryOverview);
  const { data: categories, error: categoriesError, reload: reloadCategories } = useAsyncData(getMedicineCategories);
  const { data: medicines, error: medicinesError, reload: reloadMedicines } = useAsyncData(getRecentMedicines);
  const { data: alerts, error: alertsError, reload: reloadAlerts } = useAsyncData(getExpiryAlerts);
  const { data: activity, error: activityError, reload: reloadActivity } = useAsyncData(getRecentActivity);

  const forecastFetcher = useCallback(() => aiService.getForecastInsight(), []);
  const smartMatchFetcher = useCallback(() => aiService.getSmartMatchSuggestions(), []);

  return (
    <div className="dashboard-improved">
      <PageHeader
        title="Dashboard"
        subtitle="Useful insights, not clutter - inventory health at a glance"
      />

      {/* Improved Stat Cards - Useful & Productive */}
      <div className="dash-stat-grid">
        {statsError ? (
          <Card className="dash-skeleton-card" style={{ gridColumn: "1 / -1" }}>
            <ErrorState title="Couldn't load stats" description={statsError.message} onRetry={reloadStats} />
          </Card>
        ) : stats ? (
          <>
            <StatCard
              label="Total Medicines"
              value={`${stats.totalMedicines.value} SKUs`}
              icon={Pill}
              iconTone="navy"
              delta={stats.totalMedicines.delta}
              trend={stats.totalMedicines.trend}
              helper={stats.totalMedicines.helper}
            />
            <StatCard
              label="Total Value"
              value={formatCurrency(stats.totalValue.value)}
              icon={DollarSign}
              iconTone="teal"
              delta={stats.totalValue.delta}
              trend={stats.totalValue.trend}
              helper={stats.totalValue.helper}
            />
            <StatCard
              label="Expiring Soon"
              value={`${stats.expiringSoon.value} batches`}
              icon={AlertTriangle}
              iconTone={stats.expiringSoon.value > 5 ? "coral" : "amber"}
              helper={stats.expiringSoon.expired > 0 ? `${stats.expiringSoon.expired} expired • NPR ${formatNumber(stats.expiringSoon.valueAtRisk)} at risk` : `${stats.expiringSoon.value} in 30 days • NPR ${formatNumber(stats.expiringSoon.valueAtRisk)} at risk`}
            />
            <StatCard
              label="Needs Attention"
              value={`${stats.activeExchanges.lowStock + stats.activeExchanges.critical} items`}
              icon={stats.activeExchanges.critical > 0 ? AlertCircle : Package}
              iconTone={stats.activeExchanges.critical > 0 ? "coral" : "amber"}
              helper={stats.activeExchanges.helper}
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="dash-skeleton-card">
              <Skeleton style={{ height: "100%", width: "100%" }} />
            </Card>
          ))
        )}
      </div>

      {/* Charts - Useful */}
      <div className="dash-charts-grid">
        <Card className="dash-trend-card">
          <div className="dash-card-head-row">
            <h3 className="dash-card-title"><TrendingUp size={16} /> Inventory Movement</h3>
            <select className="dash-select" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
            </select>
          </div>
          {overviewError ? (
            <ErrorState title="Couldn't load overview" description={overviewError.message} onRetry={reloadOverview} />
          ) : overview ? (
            <InventoryTrendChart data={overview} />
          ) : (
            <Skeleton style={{ height: 260, width: "100%", marginTop: "0.5rem" }} />
          )}
        </Card>

        <Card className="dash-categories-card">
          <h3 className="dash-categories-title"><Package size={16} /> Categories</h3>
          {categoriesError ? (
            <ErrorState title="Couldn't load categories" description={categoriesError.message} onRetry={reloadCategories} />
          ) : categories ? (
            <CategoryDonutChart data={categories} />
          ) : (
            <Skeleton style={{ height: 132, width: "100%" }} />
          )}
          <div className="dash-quick-actions">
            <h4>Quick Actions</h4>
            <div className="dash-action-grid">
              <Link to="/inventory" className="dash-action-btn"><ShoppingCart size={14} /> Add Stock</Link>
              <Link to="/exchange-requests" className="dash-action-btn"><Truck size={14} /> Request</Link>
              <Link to="/demand-forecast" className="dash-action-btn"><TrendingUp size={14} /> Forecast</Link>
              <Link to="/ai-assistant" className="dash-action-btn"><Package size={14} /> Ask AI</Link>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom Grid - Useful, Productive, Interactive */}
      <div className="dash-bottom-grid">
        {/* Expiry Alerts - FIXED LOGIC */}
        <Card className="dash-panel expiry-panel">
          <div className="dash-panel-head">
            <h3 className="dash-panel-title"><Clock size={16} /> Expiry Alerts - Fixed</h3>
            <Link to="/inventory" className="dash-panel-link">View all <ArrowRight size={12} /></Link>
          </div>
          <div className="dash-alert-list">
            {alertsError ? (
              <ErrorState title="Couldn't load expiry" description={alertsError.message} onRetry={reloadAlerts} />
            ) : alerts ? (
              alerts.length === 0 ? (
                <div className="dash-empty">✅ No medicines expiring in 30 days - healthy!</div>
              ) : (
                alerts.slice(0, 5).map((a) => (
                  <div key={a.id} className={`dash-alert-row ${a.isExpired ? "expired" : a.daysLeft <= 7 ? "critical" : a.daysLeft <= 14 ? "warning" : ""}`}>
                    <div className={`dash-alert-dial ${a.isExpired ? "expired" : a.daysLeft <= 7 ? "critical" : "warning"}`}>
                      <span className="dash-alert-dial-num">{a.isExpired ? "!" : a.daysLeft}</span>
                      <span className="dash-alert-dial-label">{a.isExpired ? "EXP" : "days"}</span>
                    </div>
                    <div className="dash-alert-info">
                      <div className="dash-alert-name">{a.medicine}</div>
                      <div className="dash-alert-exp">
                        {a.isExpired ? `Expired ${Math.abs(a.daysLeft)} days ago • ${a.expiry}` : `Exp. ${a.expiry} • ${a.daysLeft} days left`}
                      </div>
                    </div>
                    <Badge tone={a.isExpired ? "coralStrong" : statusTone(a.severity)}>{a.isExpired ? "Expired" : a.severity}</Badge>
                  </div>
                ))
              )
            ) : (
              <Skeleton style={{ height: 96, width: "100%" }} />
            )}
          </div>
        </Card>

        {/* Low Stock - NEW USEFUL */}
        <Card className="dash-panel lowstock-panel">
          <div className="dash-panel-head">
            <h3 className="dash-panel-title"><AlertCircle size={16} /> Low Stock - Needs Attention</h3>
            <Link to="/inventory" className="dash-panel-link">View all <ArrowRight size={12} /></Link>
          </div>
          <div className="dash-alert-list">
            {medicinesError ? (
              <ErrorState title="Couldn't load" description={medicinesError.message} onRetry={reloadMedicines} />
            ) : medicines ? (
              medicines.filter(m => ["Low Stock", "Critical"].includes(m.status)).length === 0 ? (
                <div className="dash-empty">✅ No low stock - all healthy!</div>
              ) : (
                medicines.filter(m => ["Low Stock", "Critical"].includes(m.status)).slice(0, 5).map((m) => (
                  <div key={m.id} className={`dash-alert-row ${m.status === "Critical" ? "critical" : "warning"}`}>
                    <div className={`dash-alert-dial ${m.status === "Critical" ? "critical" : "warning"}`}>
                      <span className="dash-alert-dial-num">{m.quantity}</span>
                      <span className="dash-alert-dial-label">{m.unit}</span>
                    </div>
                    <div className="dash-alert-info">
                      <div className="dash-alert-name">{m.name}</div>
                      <div className="dash-alert-exp">{m.batch} • {m.category}</div>
                    </div>
                    <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                  </div>
                ))
              )
            ) : (
              <Skeleton style={{ height: 96, width: "100%" }} />
            )}
          </div>
        </Card>

        {/* AI Insights - Useful */}
        <div className="dash-ai-stack">
          <AIInsightPanel title="Forecast Insight" fetcher={forecastFetcher} />
          <Card className="dash-panel" style={{ marginTop: "1rem" }}>
            <div className="dash-panel-head">
              <h3 className="dash-panel-title"><Truck size={16} /> Smart Matches</h3>
            </div>
            <AIInsightPanel title="" fetcher={smartMatchFetcher} />
          </Card>
        </div>
      </div>

      {/* Recent Inventory - Useful, not clutter */}
      <Card className="dash-table-card">
        <div className="dash-panel-head">
          <h3 className="dash-panel-title"><Package size={16} /> Recent Inventory</h3>
          <Link to="/inventory" className="dash-panel-link">View all <ArrowRight size={12} /></Link>
        </div>
        {medicinesError ? (
          <ErrorState title="Couldn't load medicines" description={medicinesError.message} onRetry={reloadMedicines} />
        ) : medicines ? (
          <div className="dash-table-scroll">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Expiry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="dash-med-cell">
                        <div className="dash-med-icon"><Pill size={14} /></div>
                        <span className="dash-med-name">{m.name}</span>
                      </div>
                    </td>
                    <td className="dash-mono-cell">{m.batch}</td>
                    <td><Badge tone="navy">{m.category}</Badge></td>
                    <td className="dash-mono-cell">{m.quantity} {m.unit}</td>
                    <td className="dash-muted-cell">{formatDate(m.expiry)}</td>
                    <td><Badge tone={statusTone(m.status)}>{m.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Skeleton style={{ height: 120, width: "100%" }} />
        )}
      </Card>
    </div>
  );
}
