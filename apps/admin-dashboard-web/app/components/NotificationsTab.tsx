"use client";
import React, { useEffect, useRef, useState } from "react";
import { BellRing, Send, CheckCircle2, Users, Route } from "lucide-react";
import gsap from "gsap";
import { addDoc } from "firebase/firestore";
import { getFirebaseDb, getNotificationsCollection, type AppNotification } from "@skoolpath/shared";

type Target = "all_parents" | "route_parents" | "global";

export default function NotificationsTab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [success, setSuccess] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<Target>("all_parents");
  const [routeId, setRouteId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (containerRef.current) gsap.fromTo('.animCard', { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.8, ease: "power2.out" });
  }, []);

  const handleDispatch = async () => {
    if (!title || !body) return;
    if (target === "route_parents" && !routeId.trim()) return;
    setLoading(true);
    
    try {
      const db = getFirebaseDb();
      // Map selection to the targetEmail used by Parent App listener
      const targetEmail: string =
        target === "all_parents"  ? "all_parents" :
        target === "route_parents" ? `route_${routeId.trim()}` :
        "global";

      const newNotification: Omit<AppNotification, "id"> = {
        type: "system",
        targetEmail,
        title,
        message: body,
        timestamp: new Date().toISOString(),
        read: false,
        status: "pending"
      };
      
      await addDoc(getNotificationsCollection(db), newNotification);
      
      setSuccess(true);
      setTitle("");
      setBody("");
      setRouteId("");
      setTimeout(() => setSuccess(false), 4000);
    } catch (e) {
      console.error(e);
      alert("Failed to send notification. Please check your database connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animFadeIn formAndRecords" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Notifications</h1>
          <p className="pageSubtitle">Send announcements to parents and drivers</p>
        </div>
      </div>

      <div className="card animCard">
        <div className="cardPadded">
          <div className="cardTitle"><BellRing size={18} style={{ display: "inline-block", marginRight: 8, verticalAlign: "-3px" }} /> Send Notification</div>
          
          {success && (
            <div className="notifSuccessBanner">
              <CheckCircle2 size={20} />
              <div>
                <strong>Notification sent!</strong>
                <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.8 }}>
                  Delivered to {target === "all_parents" ? "all parents" : target === "route_parents" ? `Route ${routeId} parents` : "all users"}.
                </p>
              </div>
            </div>
          )}

          {/* Target Audience */}
          <div className="fieldGroup" style={{ marginBottom: 16 }}>
            <label className="fieldLabel">Target Audience</label>
            <div className="notifTargetGrid">
              <button
                className={`notifTargetBtn ${target === "all_parents" ? "active" : ""}`}
                onClick={() => setTarget("all_parents")}
              >
                <Users size={16} />
                All Parents
              </button>
              <button
                className={`notifTargetBtn ${target === "route_parents" ? "active" : ""}`}
                onClick={() => setTarget("route_parents")}
              >
                <Route size={16} />
                Specific Route
              </button>
            </div>
          </div>

          {/* Route ID field — only shown when Specific Route is selected */}
          {target === "route_parents" && (
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Route ID / Name</label>
              <input
                className="fieldInput"
                placeholder="e.g. Route-A or bus_001"
                value={routeId}
                onChange={e => setRouteId(e.target.value)}
              />
            </div>
          )}

          <div className="fieldGroup" style={{ marginBottom: 16 }}>
            <label className="fieldLabel">Title</label>
            <input className="fieldInput" placeholder="e.g. Bus Delay – Route A" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="fieldGroup" style={{ marginBottom: 24 }}>
            <label className="fieldLabel">Message</label>
            <textarea className="fieldTextarea" placeholder="Enter your message here..." value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <button
            className="btnPrimary"
            style={{ width: "100%", display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}
            onClick={() => void handleDispatch()}
            disabled={!title || !body || loading || (target === "route_parents" && !routeId.trim())}
          >
            <Send size={16} /> {loading ? "Sending..." : "Send Notification"}
          </button>
        </div>
      </div>
    </div>
  );
}
