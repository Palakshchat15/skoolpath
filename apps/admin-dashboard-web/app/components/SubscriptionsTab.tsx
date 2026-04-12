"use client";
import React, { useEffect, useRef } from "react";
import type { SchoolRecord } from "@skoolpath/shared";
import { FileText, Download } from "lucide-react";
import gsap from "gsap";

type Props = {
  schools: SchoolRecord[];
};

export default function SubscriptionsTab({ schools }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) gsap.fromTo('.animCard', { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.8, ease: "power2.out" });
  }, []);

  return (
    <div className="animFadeIn" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Subscriptions</h1>
          <p className="pageSubtitle">A ledger containing active monetized clients</p>
        </div>
      </div>
      <div className="card animCard">
        <div className="cardPadded tableHeader">
          <div className="tableCount">Active Tenants ({schools.length})</div>
          <button className="btnOutline btnSmall" style={{ display: "flex", gap: 8, alignItems: "center" }}><Download size={14} /> Export Invoices</button>
        </div>
        <div className="tableContainer">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Tenant Scope (School)</th>
                <th>Monetization Tier</th>
                <th>Status</th>
                <th>Next Billing Cycle</th>
              </tr>
            </thead>
            <tbody>
              {schools.map(school => (
                <tr key={school.id}>
                  <td>
                    <div className="tableTitle">{school.name}</div>
                    <div className="tableSubtitle">{school.id}</div>
                  </td>
                  <td>Starter Tier (₹3,999/mo)</td>
                  <td><span className="badge badgeGreen">Good Standing</span></td>
                  <td>{(new Date(Date.now() + 30*24*60*60*1000)).toLocaleDateString()}</td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "40px" }}>
                    <FileText size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: 16 }} />
                    <div style={{ color: "var(--text-secondary)" }}>No active tenants deployed on matrix.</div>
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
