import { useEffect, useState } from "react";
import { FileBarChart2, Download } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { formatDate } from "../utils/format";
import "./Reports.css";

export default function Reports() {
  const [reports, setReports] = useState(null);

  useEffect(() => {
    api.getReports().then(setReports);
  }, []);

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Generated summaries of inventory, exchanges, and compliance."
      />

      <Card className="rep-card">
        {reports === null ? (
          <div className="rep-loading-pad">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 56, width: "100%" }} />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <EmptyState icon={FileBarChart2} title="No reports yet" description="Generated reports will appear here." />
        ) : (
          <div className="rep-divide">
            {reports.map((r) => (
              <div key={r.id} className="rep-row">
                <div className="rep-icon-wrap">
                  <FileBarChart2 size={18} />
                </div>
                <div className="rep-info">
                  <div className="rep-name">{r.name}</div>
                  <div className="rep-meta">
                    {r.period} · Generated {formatDate(r.generatedOn)}
                  </div>
                </div>
                <Badge tone="navy" hideOnMobile>
                  {r.type}
                </Badge>
                <Button size="sm" variant="outline">
                  <Download size={14} /> Export
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
