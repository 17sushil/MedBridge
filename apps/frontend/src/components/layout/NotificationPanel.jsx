import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Bell, AlertTriangle, Repeat2, Info, CheckCircle2, CheckCheck, ArrowRight } from "lucide-react";
import { useApp } from "../../context/AppContext";
import "./NotificationPanel.css";

const iconMap = {
  critical: { icon: AlertTriangle, cls: "np-icon-critical" },
  exchange: { icon: Repeat2, cls: "np-icon-exchange" },
  info: { icon: Info, cls: "np-icon-info" },
  success: { icon: CheckCircle2, cls: "np-icon-success" },
};

export default function NotificationPanel() {
  const { notifications, unreadCount, markAllNotificationsRead } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on outside click so the bell behaves like a toggle with a dismiss.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When opening, auto-mark existing unread as read (app-like behaviour).
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      markAllNotificationsRead().catch(() => {});
    }
  };

  const goToAll = () => {
    setOpen(false);
    navigate("/notifications");
  };

  const recent = notifications.slice(0, 6);

  return (
    <div className="np-wrap" ref={wrapRef}>
      <button
        type="button"
        className={clsx("topbar-icon-btn", "np-trigger", open && "np-trigger-active")}
        onClick={toggle}
        aria-label={open ? "Close notifications" : "Open notifications"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={18} />
        {unreadCount > 0 && !open && <span className="topbar-bell-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="np-panel animate-fade-up" role="menu">
          <div className="np-head">
            <div>
              <div className="np-title">Notifications</div>
              <div className="np-subtitle">{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}</div>
            </div>
            {unreadCount > 0 && (
              <button type="button" className="np-mark-btn" onClick={() => markAllNotificationsRead().catch(() => {})}>
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="np-empty">
              <Bell size={20} />
              <p>No notifications right now.</p>
            </div>
          ) : (
            <div className="np-list">
              {recent.map((n) => {
                const cfg = iconMap[n.type] || iconMap.info;
                const Icon = cfg.icon;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className="np-item"
                    onClick={goToAll}
                  >
                    <span className={clsx("np-item-icon", cfg.cls)}>
                      <Icon size={16} />
                    </span>
                    <span className="np-item-body">
                      <span className="np-item-title">{n.title}</span>
                      <span className="np-item-text">{n.body}</span>
                      <span className="np-item-time">{n.time}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button type="button" className="np-view-all" onClick={goToAll}>
            View all notifications <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
