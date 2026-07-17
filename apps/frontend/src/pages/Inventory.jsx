import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, Search, Pill, SlidersHorizontal } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { formatDate } from "../utils/format";
import { statusTone } from "../utils/expiry";
import "./Inventory.css";

const FILTERS = ["All", "In Stock", "Low Stock", "Critical"];

export default function Inventory() {
  const [medicines, setMedicines] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    api.getMedicines().then(setMedicines);
  }, []);

  const filtered = useMemo(() => {
    if (!medicines) return [];
    return medicines.filter((m) => {
      const matchesQuery =
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.category.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === "All" || m.status === filter;
      return matchesQuery && matchesFilter;
    });
  }, [medicines, query, filter]);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Track stock levels, expiry, and batches across your hospital."
        actions={
          <Button variant="teal">
            <Plus size={16} /> Add Medicine
          </Button>
        }
      />

      <Card className="inv-toolbar">
        <div className="inv-toolbar-row">
          <div className="inv-search-wrap">
            <Search className="inv-search-icon" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or category…"
              className="inv-search-input"
            />
          </div>
          <div className="inv-filters">
            <SlidersHorizontal className="inv-filters-icon" size={16} />
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx("inv-filter-btn", filter === f && "inv-filter-btn-active")}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="inv-table-card">
        {medicines === null ? (
          <div className="inv-loading-pad">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 48, width: "100%" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Pill}
            title="No medicines found"
            description="Try a different search term or clear your filters."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilter("All");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="inv-med-cell">
                        <div className="inv-med-icon">
                          <Pill size={16} />
                        </div>
                        <span className="inv-med-name">{m.name}</span>
                      </div>
                    </td>
                    <td className="inv-batch-cell">{m.batch}</td>
                    <td>
                      <Badge tone="navy">{m.category}</Badge>
                    </td>
                    <td className="inv-mono-cell">
                      {m.quantity} {m.unit}
                    </td>
                    <td className="inv-muted-cell">{formatDate(m.expiry)}</td>
                    <td>
                      <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
