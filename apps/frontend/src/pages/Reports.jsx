import { useEffect, useState } from "react";
import { FileBarChart2, Download, Plus, X } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { formatDate } from "../utils/format";
import "./Reports.css";

const REPORT_TYPES = [
  { value: "INVENTORY", label: "Inventory" },
  { value: "EXCHANGE", label: "Exchange" },
  { value: "COMPLIANCE", label: "Compliance" },
];

function downloadReportCsv(report) {
  const header = ["Name", "Period", "Type", "Generated On"];
  const row = [report.name, report.period, report.type, formatDate(report.generatedOn)];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header, row].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${report.id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [reports, setReports] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", period: "", type: "INVENTORY" });
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => api.getReports().then(setReports).catch(() => setReports([]));

  useEffect(() => {
    load();
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.period.trim()) {
      setFormError("Name and period are required.");
      return;
    }
    setGenerating(true);
    setFormError("");
    try {
      await api.createReport({ name: form.name.trim(), period: form.period.trim(), type: form.type });
      setForm({ name: "", period: "", type: "INVENTORY" });
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Generated summaries of inventory, exchanges, and compliance."
        actions={
          <Button variant="teal" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? "Cancel" : "Generate Report"}
          </Button>
        }
      />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={handleGenerate} style={{ display: "grid", gap: 12 }}>
            {formError && (
              <div style={{ color: "#b91c1c", background: "#fef2f2", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
                {formError}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span>Report name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Monthly Inventory Summary"
                  style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)" }}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span>Period</span>
                <input
                  value={form.period}
                  onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                  placeholder="Aug 2026"
                  style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)" }}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span>Type</span>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)" }}
                >
                  {REPORT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <Button type="submit" variant="teal" disabled={generating}>
                {generating ? "Generating…" : "Generate"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="rep-card">
        {reports === null ? (
          <div className="rep-loading-pad">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 56, width: "100%" }} />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FileBarChart2}
            title="No reports yet"
            description="Generate a report to see it here."
            action={
              <Button variant="teal" size="sm" onClick={() => setShowForm(true)}>
                <Plus size={16} /> Generate Report
              </Button>
            }
          />
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
                <Button size="sm" variant="outline" onClick={() => downloadReportCsv(r)}>
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
