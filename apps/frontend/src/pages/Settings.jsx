import { useApp } from "../context/AppContext";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import "./Settings.css";

function Field({ label, value, type = "text" }) {
  return (
    <label className="set-field">
      <span className="set-field-label">{label}</span>
      <input type={type} defaultValue={value} className="set-field-input" />
    </label>
  );
}

function Toggle({ label, description, defaultChecked }) {
  return (
    <div className="set-toggle-row">
      <div>
        <div className="set-toggle-label">{label}</div>
        {description && <div className="set-toggle-desc">{description}</div>}
      </div>
      <label className="set-switch">
        <input type="checkbox" className="set-switch-input" defaultChecked={defaultChecked} />
        <div className="set-switch-track" />
        <div className="set-switch-thumb" />
      </label>
    </div>
  );
}

export default function Settings() {
  const { user } = useApp();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account, hospital, and platform preferences." />

      <div className="set-grid">
        <Card className="set-profile-card">
          <h3 className="set-card-title">Profile</h3>
          <div className="set-field-grid">
            <Field label="Full name" value={user?.name} />
            <Field label="Role" value={user?.role} />
            <Field label="Hospital" value={user?.hospital} />
            <Field label="Email" value="sarah.johnson@cityhospital.org" type="email" />
          </div>
          <div className="set-save-row">
            <Button variant="teal">Save Changes</Button>
          </div>
        </Card>

        <Card className="set-notif-card">
          <h3 className="set-notif-title">Notifications</h3>
          <div className="set-divide-list">
            <Toggle label="Expiry alerts" description="Get notified before medicines expire" defaultChecked />
            <Toggle label="Exchange requests" description="New requests from partner hospitals" defaultChecked />
            <Toggle label="Low stock warnings" description="When quantity drops below threshold" defaultChecked />
            <Toggle label="Weekly summary email" description="A digest every Monday morning" />
          </div>
        </Card>
      </div>

      <Card className="set-ai-card">
        <h3 className="set-notif-title">AI features</h3>
        <p className="set-ai-desc">
          These are placeholders today — they'll activate as AI capabilities are connected.
        </p>
        <div className="set-divide-list">
          <Toggle label="Demand forecasting" description="Predict shortages before they happen" />
          <Toggle label="Smart exchange matching" description="Suggest the best partner hospital for a request" />
          <Toggle label="MedBridge Assistant" description="Ask questions about your data in plain language" />
        </div>
      </Card>
    </div>
  );
}
