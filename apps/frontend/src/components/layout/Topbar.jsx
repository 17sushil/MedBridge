import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { useApp } from "../../context/AppContext";
import "./Topbar.css";

export default function Topbar() {
  const { user, unreadCount, setSidebarMobileOpen } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <button className="topbar-menu-btn" onClick={() => setSidebarMobileOpen(true)}>
        <Menu size={20} />
      </button>

      <div className="topbar-search-wrap">
        <Search className="topbar-search-icon" size={16} />
        <input
          type="text"
          placeholder="Search medicines, hospitals..."
          className="topbar-search-input"
        />
      </div>

      <div className="topbar-spacer" />

      <Link to="/notifications" className="topbar-icon-btn">
        <Bell size={18} />
        {unreadCount > 0 && <span className="topbar-bell-badge">{unreadCount}</span>}
      </Link>

      <div className="topbar-user-menu-wrap">
        <button onClick={() => setMenuOpen((v) => !v)} className="topbar-user-btn">
          {user ? (
            <img src={user.avatar} alt={user.name} className="topbar-avatar" />
          ) : (
            <div className="topbar-avatar-placeholder" />
          )}
          <div className="topbar-user-text">
            <div className="topbar-user-name">{user?.name || "…"}</div>
            <div className="topbar-user-role">{user?.role}</div>
          </div>
          <ChevronDown className="topbar-chevron" size={16} />
        </button>

        {menuOpen && (
          <div
            className={clsx("topbar-dropdown", "animate-fade-up")}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <Link to="/settings" className="topbar-dropdown-item" onClick={() => setMenuOpen(false)}>
              Account settings
            </Link>
            <Link to="/hospitals" className="topbar-dropdown-item" onClick={() => setMenuOpen(false)}>
              Switch hospital
            </Link>
            <div className="topbar-dropdown-divider" />
            <button className={clsx("topbar-dropdown-item", "topbar-dropdown-danger")}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
