import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Pill,
  DollarSign,
  AlertTriangle,
  Repeat2,
  ArrowRight,
} from "lucide-react";
import { api } from "../services/api";
import { aiService } from "../services/aiService";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import Badge from "../components/ui/Badge";
import Skeleton from "../components/ui/Skeleton";
import InventoryTrendChart from "../components/charts/InventoryTrendChart";
import CategoryDonutChart from "../components/charts/CategoryDonutChart";
import AIInsightPanel from "../components/ai/AIInsightPanel";
import { formatCurrency, formatNumber, formatDate } from "../utils/format";
import { statusTone } from "../utils/expiry";
import "./Dashboard.css";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [overview, setOverview] = useState([]);
  const [categories, setCategories] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    api.getDashboardStats().then(setStats);
    api.getInventoryOverview().then(setOverview);
    api.getMedicineCategories().then(setCategories);
    api.getMedicines().then((m) => setMedicines(m.slice(0, 4)));
    api.getExpiryAlerts().then(setAlerts);
    api.getRecentActivity().then(setActivity);
  }, []);

  const forecastFetcher = useCallback(() => aiService.getForecastInsight(), []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back! Here's what's happening with your inventory."
      />

      <div className="dash-stat-grid">
        {stats ? (
          <>
            <StatCard
              label="Total Medicines"
              value={formatNumber(stats.totalMedicines.value)}
              icon={Pill}
              iconTone="navy"
              delta={stats.totalMedicines.delta}
              trend={stats.totalMedicines.trend}
              helper="from last month"
            />
            <StatCard
              label="Total Value"
              value={formatCurrency(stats.totalValue.value)}
              icon={DollarSign}
              iconTone="teal"
              delta={stats.totalValue.delta}
              trend={stats.totalValue.trend}
              helper="from last month"
            />
            <StatCard
              label="Expiring Soon"
              value={stats.expiringSoon.value}
              icon={AlertTriangle}
              iconTone="amber"
              helper={`Within ${stats.expiringSoon.window}`}
            />
            <StatCard
              label="Active Exchanges"
              value={stats.activeExchanges.value}
              icon={Repeat2}
              iconTone="coral"
              helper={stats.activeExchanges.label}
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

      <div className="dash-charts-grid">
        <Card className="dash-trend-card">
          <div className="dash-card-head-row">
            <h3 className="dash-card-title">Inventory Overview</h3>
            <select className="dash-select">
              <option>This Week</option>
              <option>This Month</option>
              <option>This Quarter</option>
            </select>
          </div>
          {overview.length ? (
            <InventoryTrendChart data={overview} />
          ) : (
            <Skeleton style={{ height: 260, width: "100%", marginTop: "0.5rem" }} />
          )}
        </Card>

        <Card className="dash-categories-card">
          <h3 className="dash-categories-title">Medicine Categories</h3>
          {categories.length ? (
            <CategoryDonutChart data={categories} />
          ) : (
            <Skeleton style={{ height: 132, width: "100%" }} />
          )}
        </Card>
      </div>

      <div className="dash-bottom-grid">
        <Card className="dash-panel">
          <div className="dash-panel-head">
            <h3 className="dash-panel-title">Expiry Alerts</h3>
            <Link to="/inventory" className="dash-panel-link">
              View all
            </Link>
          </div>
          <div className="dash-alert-list">
            {alerts.length ? (
              alerts.map((a) => (
                <div key={a.id} className="dash-alert-row">
                  <div className="dash-alert-dial">
                    <span className="dash-alert-dial-num">{a.daysLeft}</span>
                    <span className="dash-alert-dial-label">days</span>
                  </div>
                  <div className="dash-alert-info">
                    <div className="dash-alert-name">{a.medicine}</div>
                    <div className="dash-alert-exp">Exp. {a.expiry}</div>
                  </div>
                  <Badge tone={statusTone(a.severity)}>{a.severity}</Badge>
                </div>
              ))
            ) : (
              <Skeleton style={{ height: 96, width: "100%" }} />
            )}
          </div>
        </Card>

        <Card className="dash-panel">
          <div className="dash-panel-head">
            <h3 className="dash-panel-title">Recent Activity</h3>
            <Link to="/notifications" className="dash-panel-link">
              View all
            </Link>
          </div>
          <div className="dash-activity-list">
            {activity.length ? (
              activity.map((a) => (
                <div key={a.id} className="dash-activity-row">
                  <span className="dash-activity-dot" />
                  <div>
                    <div className="dash-activity-text">{a.text}</div>
                    <span className="dash-activity-time">{a.time}</span>
                  </div>
                </div>
              ))
            ) : (
              <Skeleton style={{ height: 96, width: "100%" }} />
            )}
          </div>
        </Card>

        <AIInsightPanel title="Forecast Insight" fetcher={forecastFetcher} />
      </div>

      <Card className="dash-table-card">
        <div className="dash-panel-head">
          <h3 className="dash-panel-title">Recent Medicines</h3>
          <Link to="/inventory" className="dash-panel-link dash-panel-link-icon">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="dash-table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Medicine Name</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Expiry Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="dash-med-cell">
                      <div className="dash-med-icon">
                        <Pill size={16} />
                      </div>
                      <span className="dash-med-name">{m.name}</span>
                    </div>
                  </td>
                  <td>
                    <Badge tone="navy">{m.category}</Badge>
                  </td>
                  <td className="dash-mono-cell">
                    {m.quantity} {m.unit}
                  </td>
                  <td className="dash-muted-cell">{formatDate(m.expiry)}</td>
                  <td>
                    <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
