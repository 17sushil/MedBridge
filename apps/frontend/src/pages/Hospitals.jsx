import { useEffect, useState } from "react";
import { Building2, MapPin, Star, Repeat2 } from "lucide-react";
import { api } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import Button from "../components/ui/Button";
import { useApp } from "../context/AppContext";
import "./Hospitals.css";

export default function Hospitals() {
  const [hospitals, setHospitals] = useState(null);
  const { activeHospital, setActiveHospital } = useApp();

  useEffect(() => {
    api.getHospitals().then(setHospitals);
  }, []);

  return (
    <div>
      <PageHeader
        title="Hospitals"
        subtitle="Partner hospitals and clinics connected to your exchange network."
      />

      <div className="hosp-grid">
        {hospitals === null
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="hosp-skeleton-card">
                <Skeleton style={{ height: "100%", width: "100%" }} />
              </Card>
            ))
          : hospitals.map((h) => (
              <Card key={h.id} className="hosp-card">
                <div className="hosp-head">
                  <div className="hosp-icon-wrap">
                    <Building2 className="hosp-icon" size={20} />
                  </div>
                  <div>
                    <div className="hosp-name">{h.name}</div>
                    <div className="hosp-location">
                      <MapPin size={12} /> {h.location} · {h.type}
                    </div>
                  </div>
                </div>

                <div className="hosp-meta">
                  <span className="hosp-meta-item">
                    <Star size={14} className="hosp-star" />
                    {h.rating.toFixed(1)}
                  </span>
                  <span className="hosp-meta-item">
                    <Repeat2 size={14} />
                    {h.activeExchanges} active
                  </span>
                </div>

                <div className="hosp-actions">
                  <Button size="sm" variant="outline" className="hosp-actions-btn">
                    View Profile
                  </Button>
                  <Button
                    size="sm"
                    variant={activeHospital === h.name ? "teal" : "outline"}
                    className="hosp-actions-btn"
                    onClick={() => setActiveHospital(h.name)}
                  >
                    Request Stock
                  </Button>
                </div>
              </Card>
            ))}
      </div>
    </div>
  );
}
