"use client";

import React, { useEffect, useRef } from "react";
import type { SchoolRecord, BusRecord, UserRecord, TripRecord, SOSAlert } from "@skoolpath/shared";
import gsap from "gsap";

type Props = {
  schools: SchoolRecord[];
  buses: BusRecord[];
  users: UserRecord[];
  trips: TripRecord[];
  activeSOS: SOSAlert[];
  setActiveTab: React.Dispatch<React.SetStateAction<any>>;
  setSchoolForm: React.Dispatch<React.SetStateAction<any>>;
  setUserForm: React.Dispatch<React.SetStateAction<any>>;
};

export default function DashboardOverviewTab({
  schools, buses, users, trips, activeSOS, setActiveTab, setSchoolForm, setUserForm
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // GSAP Stagger Animation for Stat Cards
    const cards = containerRef.current.querySelectorAll('.statCard');
    gsap.fromTo(cards, 
      { y: 50, opacity: 0 }, 
      { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power3.out" }
    );
    
    // QuickActions stagger
    const actions = containerRef.current.querySelectorAll('.quickActionBtn');
    gsap.fromTo(actions,
      { x: -30, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "power2.out", delay: 0.3 }
    );
  }, []);

  const activeSchools = schools.length;
  const activeTripsCount = trips.filter(t => t.status === "active").length;
  
  return (
    <div className="formAndRecords animFadeIn" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Dashboard</h1>
          <p className="pageSubtitle">Welcome to the admin dashboard</p>
        </div>
        <div className="pageActions">
          <button className="btnPrimary" onClick={() => { setActiveTab("schools"); setSchoolForm({ id: "", name: "", city: "", contactEmail: "", transportManager: "" }); }}>+ Add New School</button>
          <button className="btnOutline" onClick={() => setActiveTab("reports")}>View Reports</button>
        </div>
      </div>

      <div className="statsGrid">
        <div className="statCard borderPurple">
          <div><div className="statLabel">Total Schools</div><div className="statValue">{schools.length}</div><div className="statSubtext">+0 new this week</div></div>
          <div className="statIconRight bgPurple">🏫</div>
        </div>
        <div className="statCard borderGreen">
          <div><div className="statLabel">Active Schools</div><div className="statValue">{activeSchools}</div><div className="statSubtext">100% of total</div></div>
          <div className="statIconRight bgGreen">✓</div>
        </div>
        <div className="statCard borderOrange">
          <div><div className="statLabel">Expiring Soon</div><div className="statValue">0</div><div className="statSubtext textWarning">Within 30 days</div></div>
          <div className="statIconRight bgOrange">⚠️</div>
        </div>
        <div className="statCard borderBlue">
          <div><div className="statLabel">Total Buses</div><div className="statValue">{buses.length}</div><div className="statSubtext">Across all schools</div></div>
          <div className="statIconRight bgBlue">🚌</div>
        </div>
        
        <div className="statCard borderGreen">
          <div><div className="statLabel">Active Trips</div><div className="statValue">{activeTripsCount}</div><div className="statSubtext">Currently in progress</div></div>
          <div className="statIconRight bgGreen">🛣️</div>
        </div>
        <div className="statCard borderBlue">
          <div><div className="statLabel">Total Students</div><div className="statValue">{users.filter(u => u.role === "parent").length}</div><div className="statSubtext textInfo">Enrolled students</div></div>
          <div className="statIconRight bgBlue">🎓</div>
        </div>
        <div className="statCard borderBlue">
          <div><div className="statLabel">Total Drivers</div><div className="statValue">{users.filter(u => u.role === "driver").length}</div><div className="statSubtext textInfo">Active drivers</div></div>
          <div className="statIconRight bgBlue">👤</div>
        </div>
        <div className="statCard borderGreen">
          <div><div className="statLabel">Active Subscriptions</div><div className="statValue">{schools.length}</div><div className="statSubtext">Paid subscriptions</div></div>
          <div className="statIconRight bgGreen">💳</div>
        </div>
      </div>

      <div className="dashGrid2x1" style={{ marginTop: 24 }}>

        <div className="dashGrid1">
          <div className="card cardPadded">
            <h3 className="cardTitle">⚡ Quick Actions</h3>
            <div className="quickActions">
              <button className="quickActionBtn" onClick={() => setActiveTab("schools")}>+ Add New School</button>
              <button className="quickActionBtn" onClick={() => setActiveTab("users")}>+ Add New User</button>
              <button className="quickActionBtn" onClick={() => setActiveTab("buses")}>+ Add New Bus</button>
              <button className="quickActionBtn" onClick={() => setActiveTab("notifications")}>✉ Send Notification</button>
            </div>
          </div>
          
          <div className="card cardPadded">
            <h3 className="cardTitle">⏰ Expiring Soon</h3>
            <div className="emptyState" style={{ padding: "20px 0" }}>
              <div className="emptyStateText">No subscriptions expiring in the next 30 days.</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
