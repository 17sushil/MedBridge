import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import ExchangeRequestModal from "../components/modals/ExchangeRequestModal";
import { formatDate } from "../utils/format";
import { statusTone } from "../utils/expiry";
import { useApp } from "../context/AppContext";
import "./MyRequests.css";

export default function MyRequests() {
  const { activeHospital, refreshNotifications } = useApp();
  const [requests, setRequests] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const all = await api.getExchangeRequests({ direction: "outgoing" });
      // Fallback filtering if API ignoring direction (client safety)
      const outgoing = all.filter((r) => r.direction === "outgoing");
      setRequests(outgoing.length ? outgoing : all.filter((r) => r.direction === "outgoing" || r.direction === undefined));
      // If API already filtered, all are outgoing; if not, above filters.
      // Best: if backend fixed, all will already be outgoing, just use all.
      const finalList = all.every(r => r.direction === "outgoing" || !r.direction) ? all : outgoing;
      // Actually simplification: if we queried outgoing, use whatever returned, but re-evaluate:
      // To avoid confusion after fix: request with direction outgoing
      // Our backend now returns outgoing correctly.
      // So if we asked for outgoing, server already filtered.
      // We'll just trust server and if server returned empty but we still want client filter, reload all and filter.
      if (finalList.length === 0) {
        const allReqs = await api.getExchangeRequests();
        setRequests(allReqs.filter((r) => r.direction === "outgoing"));
      } else {
        setRequests(finalList);
      }
    } catch (e) {
      setError(e.message || "Failed to load my requests");
      setRequests([]);
    }
  }, []);

  // Initial load simplified
  useEffect(() => {
    const initial = async () => {
      try {
        const all = await api.getExchangeRequests();
        setRequests(all.filter((r) => r.direction === "outgoing"));
      } catch {
        setRequests([]);
      }
    };
    initial();
  }, []);

  const handleConfirmDelivery = async (id) => {
    setActionId(id);
    setError("");
    try {
      await api.updateExchangeStatus(id, "Completed");
      // reload
      const all = await api.getExchangeRequests();
      setRequests(all.filter((r) => r.direction === "outgoing"));
      await refreshNotifications().catch(() => {});
    } catch (e) {
      setError(e.message || "Failed to confirm delivery");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="My Requests"
        subtitle={`Exchange requests raised by ${activeHospital}.`}
        actions={
          <Button variant="teal" onClick={() => setShowModal(true)}>
            <Plus size={16} /> New Request
          </Button>
        }
      />

      {error && (
        <div style={{ marginBottom: 12, color: "#b91c1c", background: "#fef2f2", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      <Card className="myreq-card">
        {requests === null ? (
          <div className="myreq-loading-pad">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 56, width: "100%" }} />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="You haven't requested anything yet"
            description="Raise a request when your hospital needs stock from another facility on the network."
            action={
              <Button variant="teal" size="sm" onClick={() => setShowModal(true)}>
                <Plus size={16} /> New Request
              </Button>
            }
          />
        ) : (
          <table className="myreq-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Quantity</th>
                <th>From Hospital</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="myreq-name-cell">{r.medicine}</td>
                  <td className="myreq-mono-cell">
                    {r.quantity} {r.unit}
                  </td>
                  <td className="myreq-muted-cell">{r.fromHospital}</td>
                  <td className="myreq-muted-cell">{formatDate(r.requestedOn)}</td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </td>
                  <td>
                    {r.status === "In Transit" ? (
                      <Button
                        size="sm"
                        variant="teal"
                        disabled={actionId === r.id}
                        onClick={() => handleConfirmDelivery(r.id)}
                      >
                        {actionId === r.id ? "..." : "Confirm"}
                      </Button>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showModal && (
        <ExchangeRequestModal
          onClose={() => setShowModal(false)}
          onCreated={async () => {
            const all = await api.getExchangeRequests();
            setRequests(all.filter((r) => r.direction === "outgoing"));
            await refreshNotifications().catch(() => {});
          }}
        />
      )}
    </div>
  );
}
