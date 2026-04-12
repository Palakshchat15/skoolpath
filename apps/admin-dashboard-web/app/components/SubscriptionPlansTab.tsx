"use client";
import React, { useEffect, useRef, useState } from "react";
import { CreditCard, CheckCircle2 } from "lucide-react";
import gsap from "gsap";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb, getSubscriptionPlansCollection, type SubscriptionPlan } from "@skoolpath/shared";

export default function SubscriptionPlansTab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  
  const [starterPrice, setStarterPrice] = useState(3999);
  const [enterprisePrice, setEnterprisePrice] = useState(16999);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (containerRef.current) gsap.fromTo('.animCard', { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, stagger: 0.1, duration: 0.8, ease: "back.out(1.5)" });
    
    async function fetchPlans() {
      try {
        const db = getFirebaseDb();
        const starterSnap = await getDoc(doc(getSubscriptionPlansCollection(db), "starter"));
        if (starterSnap.exists()) {
          setStarterPrice(starterSnap.data().price);
        }
        
        const enterpriseSnap = await getDoc(doc(getSubscriptionPlansCollection(db), "enterprise"));
        if (enterpriseSnap.exists()) {
          setEnterprisePrice(enterpriseSnap.data().price);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    void fetchPlans();
  }, []);

  const handleSave = async (slug: 'starter' | 'enterprise') => {
    setLoading(true);
    try {
      const db = getFirebaseDb();
      const planDoc = doc(getSubscriptionPlansCollection(db), slug);
      const isStarter = slug === 'starter';
      
      const payload: Partial<SubscriptionPlan> = {
        id: slug,
        slug,
        price: isStarter ? starterPrice : enterprisePrice,
        currency: "INR",
        name: isStarter ? "Starter" : "Enterprise",
        active: true,
      };
      
      await setDoc(planDoc, payload, { merge: true });
      setEditing(null);
    } catch (e) {
      console.error(e);
      alert("Failed to save pricing configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animFadeIn" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Subscription Plans</h1>
          <p className="pageSubtitle">Manage subscription plans and pricing</p>
        </div>
      </div>
      <div className="statsGrid">
        {/* Starter Plan */}
        <div className="card animCard cardPadded borderPurple" style={{ borderTop: "4px solid var(--primary)", textAlign: "center" }}>
          <h3 style={{ color: "var(--text-heading)", fontSize: 24 }}>Starter</h3>
          <p style={{ color: "var(--text-secondary)" }}>For small autonomous schools.</p>
          <div style={{ fontSize: 48, fontWeight: "bold", margin: "20px 0" }}>₹{starterPrice}<span style={{ fontSize: 16, color: "var(--text-secondary)" }}>/mo</span></div>
          
          {editing === 'starter' ? (
            <div style={{ marginBottom: 16, textAlign: "left" }}>
              <input className="fieldInput" type="number" value={starterPrice} onChange={(e) => setStarterPrice(Number(e.target.value))} style={{ marginBottom: 8 }} disabled={loading} />
              <button className="btnPrimary" style={{ width: "100%" }} onClick={() => void handleSave('starter')} disabled={loading}>{loading ? "Saving..." : "Save Plan"}</button>
            </div>
          ) : (
            <button className="btnOutline" style={{ width: "100%", marginBottom: 16 }} onClick={() => setEditing('starter')}>Edit Price</button>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: 0, textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
            <li style={{ display: "flex", gap: 8, color: "var(--text-primary)" }}><CheckCircle2 size={18} color="var(--primary)" /> 5 Active Buses</li>
            <li style={{ display: "flex", gap: 8, color: "var(--text-primary)" }}><CheckCircle2 size={18} color="var(--primary)" /> Basic Analytics</li>
          </ul>
        </div>
        
        {/* Enterprise Plan */}
        <div className="card animCard cardPadded borderGreen" style={{ borderTop: "4px solid var(--success)", textAlign: "center" }}>
          <h3 style={{ color: "var(--text-heading)", fontSize: 24 }}>Enterprise</h3>
          <p style={{ color: "var(--text-secondary)" }}>Unlimited scalable telematics.</p>
          <div style={{ fontSize: 48, fontWeight: "bold", margin: "20px 0" }}>₹{enterprisePrice}<span style={{ fontSize: 16, color: "var(--text-secondary)" }}>/mo</span></div>
          
          {editing === 'enterprise' ? (
            <div style={{ marginBottom: 16, textAlign: "left" }}>
              <input className="fieldInput" type="number" value={enterprisePrice} onChange={(e) => setEnterprisePrice(Number(e.target.value))} style={{ marginBottom: 8 }} disabled={loading} />
              <button className="btnPrimary" style={{ width: "100%" }} onClick={() => void handleSave('enterprise')} disabled={loading}>{loading ? "Saving..." : "Save Plan"}</button>
            </div>
          ) : (
            <button className="btnOutline" style={{ width: "100%", marginBottom: 16 }} onClick={() => setEditing('enterprise')}>Edit Price</button>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: 0, textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
            <li style={{ display: "flex", gap: 8, color: "var(--text-primary)" }}><CheckCircle2 size={18} color="var(--success)" /> Unlimited Buses</li>
            <li style={{ display: "flex", gap: 8, color: "var(--text-primary)" }}><CheckCircle2 size={18} color="var(--success)" /> WebGL Live View</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
