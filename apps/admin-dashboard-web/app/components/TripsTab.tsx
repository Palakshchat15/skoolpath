"use client";

import React, { useEffect, useRef } from "react";
import type { TripRecord } from "@skoolpath/shared";
import { Search, Download, Navigation, Eye, Trash2, Route } from "lucide-react";
import gsap from "gsap";

type Props = {
  trips: TripRecord[];
  searchTerm: string;
  setSearchTerm: (t: string) => void;
};

export default function TripsTab({ trips, searchTerm, setSearchTerm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current.querySelectorAll('.recordCard'),
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, stagger: 0.05, duration: 0.5, ease: "power2.out" }
      );
    }
  }, [trips, searchTerm]);

  const filtered = trips.filter(t => 
    (t.busLabel || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.driverName || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animFadeIn singleCol" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Trips</h1>
          <p className="pageSubtitle">Live geographical status of fleet iterations</p>
        </div>
      </div>

      <div className="filtersCard">
        <div className="filtersTitle"><Search size={16} style={{ verticalAlign: "-2px" }}/> Matrix Filters</div>
        <div className="filtersRow">
          <div className="searchWrap" style={{ flex: 1, position: "relative" }}>
            <Search className="searchIcon" size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
            <input 
              placeholder="Search by Node Designation..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="filterInput"
              style={{ paddingLeft: 44 }}
            />
          </div>
          <div className="filterGroup" style={{ maxWidth: 180 }}>
            <label className="filterLabel">Iteration State</label>
            <select className="filterSelect"><option>All States</option><option>Active</option><option>Completed</option></select>
          </div>
          <button className="btnPrimary" style={{height: 42}}>Apply Parameters</button>
        </div>
      </div>

      <div className="card" style={{marginTop: 24}}>
        <div className="cardPadded tableHeader">
          <div className="tableCount">Recorded Telematics Logs ({filtered.length})</div>
          <button className="btnOutline btnSmall" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Download size={14} /> Download Trajectory Block
          </button>
        </div>
        <div className="tableContainer">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Hex ID</th>
                <th>Fleet Node</th>
                <th>Operator</th>
                <th>Trajectory Vector</th>
                <th>Iteration Start</th>
                <th>State</th>
                <th>Override</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(trip => (
                <tr key={trip.id} className="recordCard">
                  <td style={{ fontFamily: "monospace", color: "var(--primary)" }}>#{trip.id.substring(0,8)}</td>
                  <td><div className="tableTitle">{trip.busLabel}</div></td>
                  <td>{trip.driverName}</td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><Route size={14} color="var(--primary)"/> Active Vector</div></td>
                  <td>{new Date(trip.startedAt).toLocaleString()}</td>
                  <td>
                    {trip.status === "active" && <span className="badge badgePurple" style={{ boxShadow: "0 0 10px var(--primary-glow)" }}>Live Transmission</span>}
                    {trip.status === "completed" && <span className="badge badgeGreen">Vector Finalized</span>}
                  </td>
                  <td>
                    <div className="tableActions">
                      <button className="btnIcon" title="View Telematics"><Eye size={16} /></button>
                      <button className="btnIcon danger" title="Halt Operator"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px" }}>
                    <Navigation size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: 16 }} />
                    <div style={{ color: "var(--text-secondary)" }}>No active trajectory vectors located within parameters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
