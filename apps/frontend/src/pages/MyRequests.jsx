import { useEffect, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { formatDate } from "../utils/format";
import { statusTone } from "../utils/expiry";
import { useApp } from "../context/AppContext";
import "./MyRequests.css";

export default function MyRequests() {
  const { activeHospital } = useApp();
  const [requests, setRequests] = useState(null);

  useEffect(() => {
    api.getExchangeRequests().then((all) =>
      setRequests(all.filter((r) => r.direction === "outgoing"))
    );
  }, []);

  return (
    <div>
      <PageHeader
        title="My Requests"
        subtitle={`Exchange requests raised by ${activeHospital}.`}
        actions={
          <Button variant="teal">
            <Plus size={16} /> New Request
          </Button>
        }
      />

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
              <Button variant="teal" size="sm">
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
                <th>Sent To</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="myreq-name-cell">{r.medicine}</td>
                  <td className="myreq-mono-cell">
                    {r.quantity} {r.unit}
                  </td>
                  <td className="myreq-muted-cell">{r.toHospital}</td>
                  <td className="myreq-muted-cell">{formatDate(r.requestedOn)}</td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
