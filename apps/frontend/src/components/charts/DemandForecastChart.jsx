import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// Simplified fast chart - no heavy calculations
function SimpleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const actual = payload.find(p => p.dataKey === "actual")?.value;
  const forecast = payload.find(p => p.dataKey === "forecast")?.value;
  return (
    <div style={{ background: "#14213D", color: "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {actual != null && <div>Actual: {actual}</div>}
      {forecast != null && <div>Forecast: {forecast}</div>}
    </div>
  );
}

export default function DemandForecastChart({ data }) {
  if (!data?.length) {
    return <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#8A94A3", fontSize: 13 }}>No data. Check ML service or inventory.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E4E9EE" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8A94A3" }} axisLine={{ stroke: "#E4E9EE" }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#8A94A3" }} axisLine={false} tickLine={false} />
        <Tooltip content={<SimpleTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="actual" name="Actual" fill="#B3C0D9" radius={[4, 4, 0, 0]} barSize={24} />
        <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#0E8C82" strokeWidth={2} dot={{ r: 3, fill: "#0E8C82" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
