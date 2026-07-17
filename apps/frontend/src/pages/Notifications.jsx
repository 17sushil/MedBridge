import { useEffect, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Bell, CheckCircle2, Repeat2, Info } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import { useApp } from "../context/AppContext";
import "./Notifications.css";

const iconMap = {
  critical: { icon: AlertTriangle, cls: "notif-icon-critical" },
  exchange: { icon: Repeat2, cls: "notif-icon-exchange" },
  info: { icon: Info, cls: "notif-icon-info" },
  success: { icon: CheckCircle2, cls: "notif-icon-success" },
};

export default function Notifications() {
  const { markAllNotificationsRead } = useApp();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.getNotifications().then(setItems);
  }, []);

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Stay on top of low stock, expiries, and exchange updates."
        actions={
          <Button variant="outline" size="sm" onClick={markAllNotificationsRead}>
            Mark all as read
          </Button>
        }
      />

      <Card className="notif-card">
        {items === null ? (
          <div className="notif-loading-pad">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 64, width: "100%" }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="You're all caught up" description="No notifications right now." />
        ) : (
          <div className="notif-divide">
            {items.map((n) => {
              const cfg = iconMap[n.type] || iconMap.info;
              const Icon = cfg.icon;
              return (
                <div key={n.id} className={clsx("notif-row", !n.read && "notif-row-unread")}>
                  <div className={clsx("notif-icon-wrap", cfg.cls)}>
                    <Icon size={18} />
                  </div>
                  <div className="notif-body">
                    <div className="notif-top-row">
                      <span className="notif-title">{n.title}</span>
                      {!n.read && <span className="notif-unread-dot" />}
                    </div>
                    <p className="notif-text">{n.body}</p>
                    <span className="notif-time">{n.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
