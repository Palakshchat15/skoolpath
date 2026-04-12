"use client";

import React, { useEffect, useRef } from "react";
import type { BusRecord, RouteStop, UserRecord } from "@skoolpath/shared";
import { Search, Download, Trash, Edit3, Bus, Plus, MapPin, Clock } from "lucide-react";
import gsap from "gsap";

type Props = {
  buses: BusRecord[];
  users: UserRecord[];
  searchTerm: string;
  setSearchTerm: (t: string) => void;
  adminRole: string;
  busForm: any;
  setBusForm: (v: any) => void;
  saveBus: () => void;
  editBus: (b: BusRecord) => void;
  showConfirm: (t: string, m: string, c: () => void, cl?: string) => void;
  deleteBus: (b: BusRecord) => void;
  routeStops: Partial<RouteStop>[];
  setRouteStops: (v: Partial<RouteStop>[]) => void;
};

export default function BusesTab({
  buses, users, searchTerm, setSearchTerm, adminRole, busForm, setBusForm, saveBus, editBus, showConfirm, deleteBus, routeStops, setRouteStops
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current.querySelectorAll('.recordCard'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.05, duration: 0.6, ease: "power2.out" }
      );
    }
  }, [buses, searchTerm]);

  const filtered = buses.filter(b => 
    (b.label || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (b.id || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (b.schoolId || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const drivers = (users ?? []).filter(u => u.role === "driver");

  return (
    <div className="animFadeIn" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Buses</h1>
          <p className="pageSubtitle">Register buses and configure route maps</p>
        </div>
        <div className="pageActions">
          <button className="btnPrimary">Add Bus Manually</button>
        </div>
      </div>

      <div className="formAndRecords">
        {/* Form Panel */}
        <div className="card">
          <div className="cardPadded">
            <div className="cardTitle"><Bus size={18} style={{ display: "inline-block", marginRight: 8, verticalAlign: "-3px" }} /> Add Bus & Route</div>
            
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Bus ID (Registration)</label>
              <input className="fieldInput" value={busForm.id} onChange={e => setBusForm({...busForm, id: e.target.value})} />
            </div>
            {adminRole === "super-admin" && (
              <div className="fieldGroup" style={{ marginBottom: 16 }}>
                <label className="fieldLabel">School ID</label>
                <input className="fieldInput" value={busForm.schoolId} onChange={e => setBusForm({...busForm, schoolId: e.target.value})} />
              </div>
            )}
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Label (e.g. Bus 1)</label>
              <input className="fieldInput" value={busForm.label} onChange={e => setBusForm({...busForm, label: e.target.value})} />
            </div>
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Plate Number (Notation)</label>
              <input className="fieldInput" value={busForm.plateNumber} onChange={e => setBusForm({...busForm, plateNumber: e.target.value})} placeholder="e.g. AB 12 CD 3456" />
            </div>
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Assigned Driver</label>
              <select 
                className="fieldSelect" 
                value={busForm.driverId} 
                onChange={e => setBusForm({...busForm, driverId: e.target.value})}
              >
                <option value="">-- No Driver Assigned --</option>
                {drivers.map(driver => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName} ({driver.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Route Name</label>
              <input className="fieldInput" value={busForm.routeName} onChange={e => setBusForm({...busForm, routeName: e.target.value})} />
            </div>
            <div className="fieldGroup" style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <label className="fieldLabel" style={{ marginBottom: 0 }}>Route Stops</label>
                <button 
                  className="btnOutline btnSmall" 
                  onClick={() => setRouteStops([...routeStops, { name: "", scheduledTime: "" }])}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px" }}
                >
                  <Plus size={14} /> Add Stop
                </button>
              </div>
              
              <div className="stopsList" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {routeStops.map((stop, idx) => (
                  <div key={idx} className="stopBuilderCard" style={{ 
                    display: "flex", 
                    gap: 8, 
                    alignItems: "center", 
                    background: "rgba(255,255,255,0.03)", 
                    padding: 8, 
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.05)"
                  }}>
                    <div style={{ color: "var(--primary)", opacity: 0.5, fontSize: 12, fontWeight: "bold", width: 20 }}>{idx + 1}</div>
                    <div style={{ flex: 1, position: "relative" }}>
                      <MapPin size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
                      <input 
                        className="fieldInput" 
                        style={{ padding: "6px 8px 6px 28px", fontSize: 13, height: 34 }}
                        placeholder="Stop Name (e.g. North Gate)" 
                        value={stop.name} 
                        onChange={e => {
                          const next = [...routeStops];
                          next[idx].name = e.target.value;
                          setRouteStops(next);
                        }} 
                      />
                    </div>
                    <div style={{ width: 100, position: "relative" }}>
                      <Clock size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
                      <input 
                        className="fieldInput" 
                        style={{ padding: "6px 8px 6px 28px", fontSize: 13, height: 34 }}
                        placeholder="07:30" 
                        value={stop.scheduledTime} 
                        onChange={e => {
                          const next = [...routeStops];
                          next[idx].scheduledTime = e.target.value;
                          setRouteStops(next);
                        }} 
                      />
                    </div>
                    <button 
                      className="btnIcon dangerSmall" 
                      onClick={() => setRouteStops(routeStops.filter((_, i) => i !== idx))}
                      style={{ padding: 6 }}
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
                {routeStops.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8, opacity: 0.5, fontSize: 13 }}>
                    No stops added. Click "Add Stop" to begin.
                  </div>
                )}
              </div>
            </div>
            <button className="btnPrimary" style={{ width: "100%" }} onClick={() => saveBus()}>Deploy Bus</button>
          </div>
        </div>

        {/* Data Table */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="cardPadded tableHeader">
            <div className="tableCount">Active Buses ({filtered.length})</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div className="searchWrap" style={{ position: "relative" }}>
                <Search className="searchIcon" size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
                <input 
                  placeholder="Search fleet..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="filterInput"
                  style={{ paddingLeft: 36, width: 220, padding: "8px 12px 8px 36px" }}
                />
              </div>
              <button className="btnOutline btnSmall" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Download size={14} /> Export
              </button>
            </div>
          </div>
          
          <div className="tableContainer">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Bus / ID</th>
                  <th>Driver ID</th>
                  <th>Route Label</th>
                  <th>School ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(bus => (
                  <tr key={bus.id} className="recordCard">
                    <td>
                      <div className="tableTitle">{bus.label}</div>
                      <div className="tableSubtitle">{bus.id}</div>
                    </td>
                    <td>{bus.driverId || <span className="badge badgeGrey">Unassigned</span>}</td>
                    <td>{bus.routeName || "N/A"}</td>
                    <td>{bus.schoolId}</td>
                    <td>
                      <div className="tableActions">
                        <button className="btnIcon" title="Edit Bus" onClick={() => editBus(bus)}>
                          <Edit3 size={16} />
                        </button>
                        <button className="btnIcon danger" title="Delete Bus" onClick={() => showConfirm(
                          "Delete Bus",
                          `Delete bus ${bus.label}? This action is irreversible.`,
                          () => void deleteBus(bus),
                          "Delete Bus"
                        )}>
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "40px" }}>
                      <Bus size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: 16 }} />
                      <div style={{ color: "var(--text-secondary)" }}>No buses found globally.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
