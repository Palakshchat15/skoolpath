"use client";

import React, { useEffect, useRef } from "react";

/**
 * BusRouteAnimation — replaces the old "Realtime Pulse Network" dots.
 * Draws an SVG road-map scene with:
 *  - A winding dashed route path
 *  - An animated school bus driving along it
 *  - Pulsing stop markers
 *  - Floating stat badges
 */
export default function BusRouteAnimation() {
  const busRef = useRef<SVGGElement>(null);
  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Waypoints for the bus path (SVG coords inside 800×450 viewBox)
  const waypoints = [
    { x: 60,  y: 360 },
    { x: 180, y: 300 },
    { x: 280, y: 320 },
    { x: 380, y: 230 },
    { x: 500, y: 200 },
    { x: 600, y: 260 },
    { x: 720, y: 200 },
  ];

  // Build smooth SVG path string via cubic bezier
  const buildPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cx1 = prev.x + (curr.x - prev.x) * 0.5;
      const cy1 = prev.y;
      const cx2 = prev.x + (curr.x - prev.x) * 0.5;
      const cy2 = curr.y;
      d += ` C ${cx1} ${cy1} ${cx2} ${cy2} ${curr.x} ${curr.y}`;
    }
    return d;
  };

  const pathData = buildPath(waypoints);

  // Interpolate position along polyline (0..1)
  const interpolate = (t: number) => {
    const segments = waypoints.length - 1;
    const seg = Math.min(Math.floor(t * segments), segments - 1);
    const localT = t * segments - seg;
    const a = waypoints[seg];
    const b = waypoints[seg + 1];
    // Simple smooth-step
    const s = localT * localT * (3 - 2 * localT);
    return {
      x: a.x + (b.x - a.x) * s,
      y: a.y + (b.y - a.y) * s,
      angle: Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI),
    };
  };

  useEffect(() => {
    const speed = 0.0006;
    const animate = () => {
      progressRef.current = (progressRef.current + speed) % 1;
      const pos = interpolate(progressRef.current);
      if (busRef.current) {
        busRef.current.setAttribute(
          "transform",
          `translate(${pos.x}, ${pos.y}) rotate(${pos.angle})`
        );
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 340, overflow: "hidden" }}>
      {/* Floating info badges */}
      <div className="busAnimBadge" style={{ top: 24, left: 32 }}>
        <span className="busAnimBadgeDot" style={{ background: "#10b981" }} />
        Live Tracking Active
      </div>
      <div className="busAnimBadge" style={{ top: 24, right: 32 }}>
        <span className="busAnimBadgeDot" style={{ background: "#9b61ff" }} />
        All Routes Monitored
      </div>
      <div className="busAnimBadge" style={{ bottom: 24, left: 32 }}>
        🏫 Schools Connected
      </div>
      <div className="busAnimBadge" style={{ bottom: 24, right: 32 }}>
        🚌 Fleet GPS Active
      </div>

      <svg
        viewBox="0 0 800 450"
        style={{ width: "100%", height: "100%" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Road gradient */}
          <linearGradient id="roadGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#9b61ff" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.15" />
          </linearGradient>
          {/* Glow filter */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Bus shadow */}
          <filter id="busShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#9b61ff" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* Background grid dots */}
        {Array.from({ length: 12 }).map((_, row) =>
          Array.from({ length: 20 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={col * 44 + 12}
              cy={row * 42 + 12}
              r={1.5}
              fill="rgba(255,255,255,0.07)"
            />
          ))
        )}

        {/* Route road shadow */}
        <path
          d={pathData}
          fill="none"
          stroke="url(#roadGrad)"
          strokeWidth={22}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.4}
        />

        {/* Main route path */}
        <path
          d={pathData}
          fill="none"
          stroke="rgba(155,97,255,0.5)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray="10 6"
          filter="url(#glow)"
          strokeLinejoin="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-160"
            dur="3s"
            repeatCount="indefinite"
          />
        </path>

        {/* Stop markers */}
        {waypoints.map((pt, i) => (
          <g key={i}>
            {/* Pulse ring */}
            <circle cx={pt.x} cy={pt.y} r={14} fill="rgba(155,97,255,0.08)">
              <animate
                attributeName="r"
                from="10"
                to="22"
                dur={`${1.2 + i * 0.15}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                from="0.5"
                to="0"
                dur={`${1.2 + i * 0.15}s`}
                repeatCount="indefinite"
              />
            </circle>
            {/* Stop dot */}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={6}
              fill={i === 0 ? "#10b981" : i === waypoints.length - 1 ? "#ef4444" : "#9b61ff"}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={2}
              filter="url(#glow)"
            />
            {/* Stop label */}
            {(i === 0 || i === waypoints.length - 1) && (
              <text
                x={pt.x}
                y={pt.y - 14}
                textAnchor="middle"
                fontSize={11}
                fill="rgba(255,255,255,0.7)"
                fontFamily="system-ui"
              >
                {i === 0 ? "School" : "Home"}
              </text>
            )}
          </g>
        ))}

        {/* Animated bus */}
        <g ref={busRef} filter="url(#busShadow)">
          {/* Bus body */}
          <rect x={-18} y={-9} width={36} height={18} rx={5} fill="#9b61ff" />
          {/* Windows */}
          <rect x={-12} y={-6} width={8} height={6} rx={2} fill="rgba(255,255,255,0.6)" />
          <rect x={2} y={-6} width={8} height={6} rx={2} fill="rgba(255,255,255,0.6)" />
          {/* Wheels */}
          <circle cx={-10} cy={9} r={4} fill="#1e1e2f" stroke="#4b4b6a" strokeWidth={1.5} />
          <circle cx={10} cy={9} r={4} fill="#1e1e2f" stroke="#4b4b6a" strokeWidth={1.5} />
          {/* Headlights */}
          <circle cx={18} cy={-3} r={2.5} fill="#fef08a" opacity={0.9} />
          <circle cx={18} cy={3} r={2.5} fill="#fef08a" opacity={0.9} />
        </g>
      </svg>
    </div>
  );
}
