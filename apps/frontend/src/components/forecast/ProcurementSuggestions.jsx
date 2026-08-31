import { ShoppingCart, AlertTriangle, DollarSign, Truck, Clock } from "lucide-react";
import Card from "../ui/Card";
import Button from "../ui/Button";

export default function ProcurementSuggestions({ suggestions, shortageRisks }) {
  const hasSuggestions = suggestions && suggestions.length > 0;
  const hasRisks = shortageRisks && shortageRisks.length > 0;

  if (!hasSuggestions && !hasRisks) {
    return (
      <Card className="forecast-info-card">
        <h3 className="forecast-info-title">All Good</h3>
        <p style={{ fontSize: 13, color: "#8A94A3" }}>No critical shortage risks detected. Inventory is healthy.</p>
      </Card>
    );
  }

  const totalCost = suggestions ? suggestions.reduce((a, b) => a + (b.estimatedCost || 0), 0) : 0;

  return (
    <div className="procurement-wrap">
      {hasRisks && (
        <Card className="forecast-info-card" style={{ borderLeft: "4px solid #DC2626" }}>
          <h3 className="forecast-info-title" style={{ display: "flex", gap: 6, alignItems: "center", color: "#DC2626" }}>
            <AlertTriangle size={16} /> Shortage Risks ({shortageRisks.length})
          </h3>
          <div className="risk-list">
            {shortageRisks.slice(0, 5).map((r, idx) => (
              <div key={idx} className="risk-item">
                <div className="risk-item-head">
                  <span className="risk-name">{r.name}</span>
                  <span className={`risk-badge risk-${r.riskLevel.toLowerCase()}`}>{r.riskLevel}</span>
                </div>
                <div className="risk-reason">{r.reason} • {r.quantity} {r.unit} left • Exp: {new Date(r.expiry).toLocaleDateString()}</div>
                {r.predictedStockout && <div className="risk-stockout">Stockout predicted: {r.predictedStockout}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {hasSuggestions && (
        <Card className="forecast-info-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="forecast-info-title" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <ShoppingCart size={16} color="#0E8C82" /> Procurement Suggestions
            </h3>
            <span style={{ fontSize: 12, color: "#8A94A3" }}>Est. Cost: NPR {totalCost.toLocaleString()}</span>
          </div>

          <div className="procurement-list">
            {suggestions.map((s, idx) => (
              <div key={idx} className="procurement-item">
                <div className="procurement-item-head">
                  <span className="procurement-name">{s.name}</span>
                  <span className={`procurement-priority priority-${s.priority.toLowerCase()}`}>{s.priority}</span>
                </div>
                <div className="procurement-details">
                  <span><Clock size={10} /> {s.currentStock} → {s.suggestedQty} {s.unit}</span>
                  <span><DollarSign size={10} /> NPR {(s.estimatedCost || 0).toLocaleString()}</span>
                </div>
                <div className="procurement-reason">{s.reason}</div>
                <div className="procurement-action">
                  <Truck size={12} /> {s.action}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Button size="sm" style={{ flex: 1 }}>Generate Purchase Order</Button>
            <Button variant="outline" size="sm" style={{ flex: 1 }}>Request from Partner</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
