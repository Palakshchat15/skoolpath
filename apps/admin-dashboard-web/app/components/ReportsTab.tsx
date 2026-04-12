"use client";
import React, { useEffect, useRef } from "react";
import type { TripRecord } from "@skoolpath/shared";
import { BarChart3, Download } from "lucide-react";
import gsap from "gsap";

type Props = {
  trips: TripRecord[];
};

export default function ReportsTab({ trips }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) gsap.fromTo('.animCard', { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.8, ease: "power2.out" });
  }, []);

  const downloadCSV = () => {
    if (!trips.length) return;
    const headerSet = new Set<string>();
    trips.forEach((row: any) => Object.keys(row).forEach(key => headerSet.add(key)));
    const headers = Array.from(headerSet);

    const rows = trips.map((row: any) =>
      headers
        .map(fieldName => {
          let val = row[fieldName] === null || row[fieldName] === undefined ? "" : String(row[fieldName]);
          val = val.replace(/"/g, '""');
          if (val.search(/("|,|\n)/g) >= 0) val = `"${val}"`;
          return val;
        })
        .join(",")
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "skoolpath_telematics_extraction.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animFadeIn singleCol" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Reports</h1>
          <p className="pageSubtitle">Generate highly customized ledger audits</p>
        </div>
      </div>
      <div className="card animCard">
        <div className="cardPadded tableHeader">
          <div className="tableCount">Generated Matrices ({trips.length} vectors)</div>
        </div>
        <div style={{ padding: 40, textAlign: "center" }}>
          <BarChart3 size={48} color={trips.length > 0 ? "var(--primary)" : "var(--text-secondary)"} style={{ opacity: trips.length > 0 ? 1 : 0.3, marginBottom: 16 }} />
          <div style={{ color: "var(--text-heading)", fontSize: 18, marginBottom: 8 }}>{trips.length} Data Blocks Buffered</div>
          <div style={{ color: "var(--text-secondary)" }}>System is buffering historical data blocks directly from Firestore array payloads.</div>
          <button className="btnPrimary" style={{ marginTop: 24, display: "inline-flex", gap: 8, alignItems: "center" }} onClick={downloadCSV} disabled={trips.length === 0}>
            <Download size={16}/> Extract Raw Logs (CSV)
          </button>
        </div>
      </div>
    </div>
  );
}
