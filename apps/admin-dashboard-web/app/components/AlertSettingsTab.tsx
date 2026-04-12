"use client";
import React, { useEffect, useRef, useState } from "react";
import { Settings2, Save, CheckCircle2 } from "lucide-react";
import gsap from "gsap";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb, getAlertConfigsCollection, type AlertConfig } from "@skoolpath/shared";

type Props = {
  adminSchoolId: string;
};

export default function AlertSettingsTab({ adminSchoolId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [success, setSuccess] = useState(false);
  const [radius, setRadius] = useState<number>(500);
  const [velocity, setVelocity] = useState<number>(80);
  const [loading, setLoading] = useState(true);

  // The document ID will be the school ID or "global"
  const docId = adminSchoolId || "global";

  useEffect(() => {
    if (containerRef.current) gsap.fromTo('.animCard', { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.8, ease: "power2.out" });
    
    // Fetch initial settings from Firestore
    async function loadSettings() {
      try {
        const db = getFirebaseDb();
        const docRef = doc(getAlertConfigsCollection(db), docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as AlertConfig;
          // We pick one radius value for simplification, but ideally this drives data.pickupAlerts.oneStopAway.proximityRadiusKm
          const radKm = data.pickupAlerts?.oneStopAway?.proximityRadiusKm;
          if (typeof radKm === 'number') {
            setRadius(radKm * 1000); // convert km to meters for UI
          }
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      } finally {
        setLoading(false);
      }
    }
    
    void loadSettings();
  }, [docId]);

  const handleSaveState = async () => {
    setLoading(true);
    try {
      const db = getFirebaseDb();
      const docRef = doc(getAlertConfigsCollection(db), docId);
      
      const configUpdate: Partial<AlertConfig> = {
        id: docId,
        schoolId: docId,
        pickupAlerts: {
          busStarted: { enabled: true, advanceMinutes: 5 },
          oneStopAway: { enabled: true, proximityRadiusKm: radius / 1000, advanceMinutes: 5 },
          arrivedAtStop: { enabled: true, arrivalRadiusKm: 0.1, advanceMinutes: 0 },
          schoolReached: { enabled: true, arrivalRadiusKm: 0.2, advanceMinutes: 0 }
        },
        dropoffAlerts: {
          studentOnboard: { enabled: true, advanceMinutes: 0 },
          busStartedDropoff: { enabled: true, advanceMinutes: 5 },
          oneStopAwayDropoff: { enabled: true, proximityRadiusKm: radius / 1000, advanceMinutes: 5 },
          studentDroppedOff: { enabled: true, advanceMinutes: 0 }
        }
      };
      
      await setDoc(docRef, configUpdate, { merge: true });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.error(e);
      alert("Failed to save configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animFadeIn formAndRecords" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Alert Settings</h1>
          <p className="pageSubtitle">Configure geofence alerts and speed limits</p>
        </div>
      </div>
      <div className="card animCard">
        <div className="cardPadded">
          <div className="cardTitle"><Settings2 size={18} style={{ display: "inline-block", marginRight: 8, verticalAlign: "-3px" }} /> Settings</div>
          
          {success && (
            <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid var(--success)", padding: "16px", borderRadius: 8, color: "var(--success)", display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
              <CheckCircle2 size={20} /> Settings saved successfully.
            </div>
          )}

          <div className="fieldGroup" style={{ marginBottom: 16 }}>
            <label className="fieldLabel">Proximity Radius (Meters)</label>
            <input className="fieldInput" value={radius} onChange={e => setRadius(Number(e.target.value))} type="number" disabled={loading} />
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: '4px 0 0' }}>Fires automatic parent alerts upon radius intersection.</p>
          </div>
          <div className="fieldGroup" style={{ marginBottom: 16 }}>
            <label className="fieldLabel">Max Speed (Km/h)</label>
            <input className="fieldInput" value={velocity} onChange={e => setVelocity(Number(e.target.value))} type="number" disabled={loading} />
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: '4px 0 0' }}>Triggers speeding alerts.</p>
          </div>
          <button className="btnPrimary" style={{ width: "100%", display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 24 }} onClick={() => void handleSaveState()} disabled={loading}>
            <Save size={16} /> {loading ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
