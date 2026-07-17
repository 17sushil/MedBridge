import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight, Plus, Repeat2 } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { formatDate } from "../utils/format";
import { statusTone } from "../utils/expiry";
import "./ExchangeRequests.css";

const TABS = ["All", "Incoming", "Outgoing"];

export default function ExchangeRequests() {
  const [requests, setRequests] = useState(null);
  const [tab, setTab] = useState("All");

  useEffect(() => {
    api.getExchangeRequests().then(setRequests);
  }, []);

  const filtered =
    requests?.filter((r) => {
      if (tab === "All") return true;
      return r.direction === tab.toLowerCase();
    }) ?? [];

  return (
    <div>
      <PageHeader
        title="Exchange Requests"
        subtitle="Requests to send or receive medicine stock with partner hospitals."
        actions={
          <Button variant="teal">
            <Plus size={16} /> New Request
          </Button>
        }
      />

      <div className="ex-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx("ex-tab-btn", tab === t && "ex-tab-btn-active")}
          >
            {t}
          </button>
        ))}
      </div>

      {requests === null ? (
        <div className="ex-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 96, width: "100%" }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Repeat2}
            title="No exchange requests"
            description="When a hospital requests stock from you, or you request stock from another hospital, it will show up here."
          />
        </Card>
      ) : (
        <div className="ex-list">
          {filtered.map((r) => (
            <Card key={r.id} className="ex-card">
              <div className="ex-card-left">
                <div
                  className={clsx(
                    "ex-direction-icon",
                    r.direction === "incoming" ? "ex-direction-icon-in" : "ex-direction-icon-out"
                  )}
                >
                  {r.direction === "incoming" ? (
                    <ArrowDownLeft size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </div>
                <div className="ex-card-info">
                  <div className="ex-card-title">
                    {r.quantity} {r.unit} · {r.medicine}
                  </div>
                  <div className="ex-card-sub">
                    {r.fromHospital} <span className="ex-arrow">→</span> {r.toHospital}
                  </div>
                </div>
              </div>

              <div className="ex-card-right">
                <div>
                  <div className="ex-date-label">Requested</div>
                  <div className="ex-date-value">{formatDate(r.requestedOn)}</div>
                </div>
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                {r.status === "Pending" && r.direction === "incoming" && (
                  <div className="ex-actions">
                    <Button size="sm" variant="teal">
                      Approve
                    </Button>
                    <Button size="sm" variant="outline">
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
