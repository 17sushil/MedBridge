import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { Cross, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { routes, navGroups } from "../../routes";
import { useApp } from "../../context/AppContext";
import "./Sidebar.css";

function NavItem({ item, collapsed }) {
  const { label, icon: Icon, badge } = item.nav;
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        clsx("sidebar-nav-item", isActive && "sidebar-nav-item-active")
      }
      title={collapsed ? label : undefined}
    >
      {({ isActive }) => (
        <>
          <span className={clsx("sidebar-active-bar", isActive && "sidebar-active-bar-on")} />
          <Icon className="sidebar-nav-icon" size={18} strokeWidth={1.9} />
          {!collapsed && <span className="sidebar-nav-label">{label}</span>}
          {!collapsed && badge && <span className="sidebar-nav-badge">{badge}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, sidebarMobileOpen, setSidebarMobileOpen } =
    useApp();

  const grouped = navGroups
    .map((group) => ({
      group,
      items: routes.filter((r) => r.nav?.group === group),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {sidebarMobileOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarMobileOpen(false)} />
      )}

      <aside
        className={clsx(
          "sidebar",
          sidebarCollapsed && "sidebar-collapsed",
          sidebarMobileOpen && "sidebar-open"
        )}
      >
        <div className="sidebar-top-row">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">
              <Cross size={16} color="#8DD3CA" strokeWidth={2.5} />
            </div>
            {!sidebarCollapsed && (
              <div className="sidebar-brand-text">
                <div className="sidebar-brand-name">MedBridge</div>
                <div className="sidebar-brand-sub">Medicine Exchange Platform</div>
              </div>
            )}
          </div>
          <button className="sidebar-close-btn" onClick={() => setSidebarMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className={clsx("sidebar-nav", "scrollbar-thin")}>
          {grouped.map(({ group, items }) => (
            <div key={group}>
              {!sidebarCollapsed && <div className="sidebar-group-label">{group}</div>}
              <div className="sidebar-group-items">
                {items.map((item) => (
                  <NavItem key={item.path} item={item} collapsed={sidebarCollapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="sidebar-collapse-btn"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <>
                <PanelLeftClose size={16} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
