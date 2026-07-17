import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import "./CategoryDonutChart.css";

export default function CategoryDonutChart({ data }) {
  return (
    <div className="donut-wrap">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={38}
              outerRadius={62}
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="donut-legend">
        {data.map((item) => (
          <div key={item.name} className="donut-legend-row">
            <span className="donut-legend-dot" style={{ background: item.color }} />
            <span className="donut-legend-name">{item.name}</span>
            <span className="donut-legend-value">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
