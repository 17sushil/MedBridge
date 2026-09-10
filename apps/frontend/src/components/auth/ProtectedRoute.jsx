import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../pages/auth/Auth.css";

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-loading">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RoleGuard({ roles, children }) {
  const { user } = useAuth();
  if (roles && roles.length > 0 && user?.roleKey && !roles.includes(user.roleKey)) {
    const fallback = user.roleKey === "INVENTORY_MANAGER" ? "/inventory" : "/";
    return <Navigate to={fallback} replace />;
  }
  return children;
}

export function GuestRoute() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-loading">Loading…</div>
      </div>
    );
  }

  if (isAuthenticated) {
    const target = user?.roleKey === "INVENTORY_MANAGER" ? "/inventory" : "/";
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
