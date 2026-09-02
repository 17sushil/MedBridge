import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import Card from "../ui/Card";
import "./AIInsightPanel.css";

export default function AIInsightPanel({ title = "AI Insight", fetcher }) {
  const [insight, setInsight] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetcher().then((res) => mounted && setInsight(res));
    return () => {
      mounted = false;
    };
  }, [fetcher]);

  return (
    <Card className="ai-panel">
      <div className="ai-panel-head">
        <div className="ai-panel-icon-wrap">
          <Sparkles size={14} color="#57BDAF" />
        </div>
        <span className="ai-panel-title">{title}</span>
        {insight && !insight.available && <span className="ai-panel-badge">Coming soon</span>}
      </div>
      <p className="ai-panel-message">{insight ? insight.message : "Checking for insights…"}</p>
    </Card>
  );
}
