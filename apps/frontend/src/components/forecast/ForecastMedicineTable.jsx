import { AlertTriangle, TrendingUp, Package, Clock } from "lucide-react";

export default function ForecastMedicineTable({ medicines, title = "Top Medicines Forecast" }) {
  if (!medicines || !medicines.length) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#8A94A3", fontSize: 14 }}>
        No medicine forecast data. Check inventory movements or start ML service.
      </div>
    );
  }

  const getStatusBadge = (item) => {
    if (item.daysOfCover < 7) return { label: "Critical", color: "#DC2626", bg: "#FEF2F2" };
    if (item.daysOfCover < 14) return { label: "Low", color: "#D97706", bg: "#FFFBEB" };
    if (item.daysOfCover < 30) return { label: "Medium", color: "#2563EB", bg: "#EFF6FF" };
    return { label: "Healthy", color: "#0E8C82", bg: "#F0FDFA" };
  };

  return (
    <div className="forecast-table-wrap">
      <div className="forecast-table-head">
        <h4 className="forecast-table-title">{title}</h4>
        <span className="forecast-table-count">{medicines.length} medicines</span>
      </div>
      <div className="forecast-table-scroll">
        <table className="forecast-table">
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Category</th>
              <th>Current Stock</th>
              <th>Avg Monthly Use</th>
              <th>Predicted Next Mo</th>
              <th>Days Cover</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {medicines.map((m, idx) => {
              const badge = getStatusBadge(m);
              return (
                <tr key={m.medicineId || idx}>
                  <td>
                    <div style={{ fontWeight: 600, color: "#14213D" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "#8A94A3" }}>{m.medicineId || m.unit}</div>
                  </td>
                  <td><span className="forecast-category-badge">{m.category}</span></td>
                  <td>{m.currentStock?.toLocaleString()} {m.unit}</td>
                  <td>{m.avgMonthly?.toLocaleString()} {m.unit}</td>
                  <td style={{ fontWeight: 700, color: "#0E8C82" }}>{m.predictedNextMonth?.toLocaleString()} {m.unit}</td>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={12} color={badge.color} /> {m.daysOfCover}d
                    </span>
                  </td>
                  <td><span className="forecast-status-badge" style={{ background: badge.bg, color: badge.color, borderColor: badge.color + "30" }}>{badge.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
