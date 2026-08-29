import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import Button from "../../components/ui/Button";
import "./Auth.css";

const ROLES = [
  { value: "STAFF", label: "Staff", hint: "Request stock and view inventory" },
  { value: "INVENTORY_MANAGER", label: "Inventory Manager", hint: "Add & manage medicines" },
];

export default function JoinHospital() {
  const { registerMember } = useAuth();
  const [hospitals, setHospitals] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [form, setForm] = useState({
    hospitalId: "",
    name: "",
    email: "",
    password: "",
    role: "STAFF",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api
      .getHospitalDirectory()
      .then(setHospitals)
      .catch(() => setHospitals([]))
      .finally(() => setLoadingHospitals(false));
  }, []);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await registerMember(form);
      setSubmitted(true);
      void result;
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-icon">M</div>
            <span className="auth-brand-name">MedBridge</span>
          </div>
          <h1 className="auth-title">Request submitted</h1>
          <div className="auth-success">
            Your account has been created but is <strong>pending approval</strong>. A hospital
            administrator must approve your account before you can sign in. You will be able to
            log in once approved.
          </div>
          <p className="auth-footer" style={{ marginTop: "1rem" }}>
            <Link to="/login" className="auth-link">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <div className="auth-brand-icon">M</div>
          <span className="auth-brand-name">MedBridge</span>
        </div>

        <h1 className="auth-title">Join your hospital</h1>
        <p className="auth-subtitle">
          Create a staff or inventory-manager account for an existing hospital. An administrator
          must approve you before you can sign in.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <label className="auth-field">
            <span className="auth-label">Hospital</span>
            <select
              className="auth-select"
              value={form.hospitalId}
              onChange={update("hospitalId")}
              required
              disabled={loadingHospitals}
            >
              <option value="" disabled>
                {loadingHospitals ? "Loading hospitals…" : "Select your hospital"}
              </option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.location ? ` — ${h.location}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="auth-divider">Your role</div>

          <label className="auth-field">
            <span className="auth-label">Role</span>
            <select className="auth-select" value={form.role} onChange={update("role")}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </select>
          </label>

          <div className="auth-divider">Account</div>

          <label className="auth-field">
            <span className="auth-label">Your full name</span>
            <input
              className="auth-input"
              value={form.name}
              onChange={update("name")}
              placeholder="Jane Doe"
              required
              minLength={2}
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Work email</span>
            <input
              type="email"
              className="auth-input"
              value={form.email}
              onChange={update("email")}
              placeholder="you@hospital.org"
              required
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <input
              type="password"
              className="auth-input"
              value={form.password}
              onChange={update("password")}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          <Button type="submit" variant="teal" className="auth-submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Request access"}
          </Button>
        </form>

        <p className="auth-footer">
          Already have an account?{" "}
          <Link to="/login" className="auth-link">
            Sign in
          </Link>
          {" · "}
          New hospital?{" "}
          <Link to="/register" className="auth-link">
            Register your hospital
          </Link>
        </p>
      </div>
    </div>
  );
}
