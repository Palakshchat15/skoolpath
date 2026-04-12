"use client";

import React from "react";

const DOT_COUNT = 18;
const DOT_COLUMNS = 6;

export default function InteractiveGlobeMap() {
  return (
    <div className="gaspFeatureContainer">
      <div className="gaspFeaturePanel">
        <span className="gaspBadge">Live Data Surge</span>
        <h3>Realtime Pulse Network</h3>
        <p>Softly animated telemetry bursts that show the system is active, secure, and moving.</p>
      </div>

      <div className="gaspFeatureGrid">
        {Array.from({ length: DOT_COUNT }).map((_, idx) => (
          <span key={idx} className={`gaspDot dot-${idx % DOT_COLUMNS}`} />
        ))}
      </div>

      <div className="gaspRings">
        <span className="gaspRing ring1" />
        <span className="gaspRing ring2" />
        <span className="gaspRing ring3" />
      </div>
    </div>
  );
}
