"use client";
import React, { useEffect, useRef, useState } from "react";
import type { BusRecord } from "@skoolpath/shared";
import { Route, MapPin, Eye, X } from "lucide-react";
import gsap from "gsap";

type Props = {
  buses: BusRecord[];
};

export default function RoutesTab({ buses }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedRoute, setSelectedRoute] = useState<BusRecord | null>(null);

  useEffect(() => {
    if (containerRef.current) gsap.fromTo('.animCard', { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.8, ease: "power2.out" });
  }, [buses]);

  return (
    <div className="animFadeIn" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Routes</h1>
          <p className="pageSubtitle">Manage bus routes and stops</p>
        </div>
      </div>
      
      <div className="dashGrid3">
        {buses.map((bus, i) => (
          <div key={buses[i].id} className="card animCard cardPadded" style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 className="cardTitle" style={{ margin: "0 0 4px" }}>{bus.routeName || "Unnamed Route"}</h3>
                <span className="badge badgePurple">{bus.label}</span>
              </div>
              <button className="btnIcon" title="View Map" onClick={() => setSelectedRoute(bus)}>
                <Eye size={16} />
              </button>
            </div>
            
            <div style={{ padding: "16px", background: "rgba(0,0,0,0.2)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <MapPin size={16} color="var(--success)" />
                <div style={{ fontSize: 13 }}>Start Point</div>
              </div>
              <div style={{ width: 2, height: 16, background: "rgba(255,255,255,0.1)", marginLeft: 7 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <MapPin size={16} color="var(--primary)" />
                <div style={{ fontSize: 13 }}>Intermediate Stops</div>
              </div>
              <div style={{ width: 2, height: 16, background: "rgba(255,255,255,0.1)", marginLeft: 7 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <MapPin size={16} color="var(--danger)" />
                <div style={{ fontSize: 13 }}>End Point</div>
              </div>
            </div>
          </div>
        ))}
        {buses.length === 0 && (
          <div style={{ gridColumn: "span 3", padding: 40, textAlign: "center", background: "var(--card-bg)", borderRadius: "var(--radius-xl)", border: "1px solid var(--card-border)" }}>
            <Route size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: 16 }} />
            <div style={{ color: "var(--text-secondary)" }}>No routes available.</div>
          </div>
        )}
      </div>

      {/* Map Topology Modal */}
      {selectedRoute && (
        <div className="modalOverlay" onClick={() => setSelectedRoute(null)}>
          <div className="modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ color: "var(--text-heading)", margin: 0, fontSize: 20 }}>
                {selectedRoute.routeName || "Unnamed Route"} Details
              </h2>
              <button className="btnIcon" onClick={() => setSelectedRoute(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: 24, background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ color: "var(--text-secondary)", marginBottom: 16 }}>Assigned Bus: <span style={{ color: "var(--text-heading)" }}>{selectedRoute.label} ({selectedRoute.plateNumber || "N/A"})</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                     <div style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 10px var(--success)" }} />
                     <div style={{ width: 2, height: 40, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
                  </div>
                  <div style={{ paddingTop: -2 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>Start Point</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Route starting location</div>
                  </div>
                </div>
                
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                     <div style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--primary)", boxShadow: "0 0 10px var(--primary)" }} />
                     <div style={{ width: 2, height: 40, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
                  </div>
                  <div style={{ paddingTop: -2 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>Intermediate Stops</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{selectedRoute.capacity || 0} students mapped along route</div>
                  </div>
                </div>
                
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                     <div style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--danger)", boxShadow: "0 0 10px var(--danger)" }} />
                  </div>
                  <div style={{ paddingTop: -2 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>End Point</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Route ending location</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modalActions">
              <button className="btnPrimary" onClick={() => setSelectedRoute(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
