import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Plus, Search, Pill, SlidersHorizontal, Pencil, Trash2 } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import MedicineFormModal from "../components/modals/MedicineFormModal";
import { formatDate } from "../utils/format";
import { statusTone } from "../utils/expiry";
import "./Inventory.css";

const FILTERS = ["All", "In Stock", "Low Stock", "Critical"];

export default function Inventory() {
  const [medicines, setMedicines] = useState(null);
  const [filter, setFilter] = useState("All");
  const [modal, setModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("search") || "";

  const loadMedicines = useCallback(() => {
    setMedicines(null);
    api.getMedicines({ search: query }).then(setMedicines).catch(() => setMedicines([]));
  }, [query]);

  useEffect(() => {
    queueMicrotask(loadMedicines);
  }, [loadMedicines]);

  const filtered = useMemo(() => {
    if (!medicines) return [];
    return medicines.filter((m) => {
      return filter === "All" || m.status === filter;
    });
  }, [medicines, filter]);

  const setSearch = (value) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value.trim()) next.set("search", value);
      else next.delete("search");
      return next;
    });
  };

  const handleSave = async (data) => {
    if (modal?.mode === "edit") {
      await api.updateMedicine(modal.medicine.id, data);
    } else {
      await api.createMedicine(data);
    }
    loadMedicines();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this medicine from inventory?")) return;
    setDeletingId(id);
    try {
      await api.deleteMedicine(id);
      loadMedicines();
    } catch (err) {
      alert(err.message || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Track stock levels, expiry, and batches across your hospital."
        actions={
          <Button variant="teal" onClick={() => setModal({ mode: "create" })}>
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, category, batch, or code…"
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
                  setSearch("");
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
                  <th aria-label="Actions" />
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
                    <td>
                      <div className="inv-row-actions">
                        <button
                          type="button"
                          className="inv-action-btn"
                          title="Edit"
                          onClick={() => setModal({ mode: "edit", medicine: m })}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="inv-action-btn inv-action-btn-danger"
                          title="Delete"
                          disabled={deletingId === m.id}
                          onClick={() => handleDelete(m.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <MedicineFormModal
          medicine={modal.mode === "edit" ? modal.medicine : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
