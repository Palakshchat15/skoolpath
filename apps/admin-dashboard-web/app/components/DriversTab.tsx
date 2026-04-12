"use client";
import React, { useEffect, useRef } from "react";
import type { UserRecord } from "@skoolpath/shared";
import { Users, Search, Download, Trash, Edit3, ShieldAlert, Copy, Check } from "lucide-react";
import gsap from "gsap";

type Props = {
  users: UserRecord[];
  adminRole: string;
  userForm: any;
  setUserForm: (v: any) => void;
  userPassword: string;
  setUserPassword: (v: string) => void;
  saveUser: () => void;
  editUser: (u: UserRecord) => void;
  deleteUser: (u: UserRecord) => void;
  showConfirm: (t: string, m: string, c: () => void, cl?: string) => void;
};

export default function DriversTab({
  users, adminRole, userForm, setUserForm, userPassword, setUserPassword, saveUser, editUser, deleteUser, showConfirm
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current.querySelectorAll('.recordCard'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.05, duration: 0.6, ease: "power2.out" }
      );
    }
  }, [users]);

  // Set default role to driver if form is empty
  useEffect(() => {
    if (!userForm.role) {
      setUserForm({ ...userForm, role: "driver" });
    }
  }, [userForm, setUserForm]);

  return (
    <div className="animFadeIn formAndRecords" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Drivers</h1>
          <p className="pageSubtitle">Verify commercial licenses and operator histories</p>
        </div>
      </div>

      <div className="card">
        <div className="cardPadded">
          <div className="cardTitle"><ShieldAlert size={18} style={{ display: "inline-block", marginRight: 8, verticalAlign: "-3px" }} /> Provision Driver License</div>
          <div className="fieldGroup" style={{ marginBottom: 16 }}>
            <label className="fieldLabel">Operator Name</label>
            <input className="fieldInput" value={userForm.fullName || ""} onChange={e => setUserForm({...userForm, fullName: e.target.value, role: "driver"})} />
          </div>
          <div className="fieldGroup" style={{ marginBottom: 16 }}>
            <label className="fieldLabel">Contact Telemetry</label>
            <input className="fieldInput" value={userForm.phone || ""} onChange={e => setUserForm({...userForm, phone: e.target.value, role: "driver"})} />
          </div>
          <div className="fieldGroup" style={{ marginBottom: 16 }}>
            <label className="fieldLabel">Password</label>
            <input className="fieldInput" type="password" value={userPassword} onChange={e => setUserPassword(e.target.value)} placeholder="Minimum 6 characters" />
          </div>
          <div className="fieldGroup" style={{ marginBottom: 16 }}>
            <label className="fieldLabel">System Login Email</label>
            <input className="fieldInput" value={userForm.email || ""} onChange={e => setUserForm({...userForm, email: e.target.value, role: "driver"})} />
          </div>
          {adminRole === "super-admin" && (
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Assigned School Token</label>
              <input className="fieldInput" value={userForm.schoolId || ""} onChange={e => setUserForm({...userForm, schoolId: e.target.value, role: "driver"})} />
            </div>
          )}
          <button className="btnPrimary" style={{ width: "100%", marginTop: 12 }} onClick={() => saveUser()}>Sync Operator Profile</button>
        </div>
      </div>

      <div className="card" style={{marginTop: 24}}>
        <div className="cardPadded tableHeader">
          <div className="tableCount">Logistics Operators ({users.length})</div>
          <button className="btnOutline btnSmall" style={{ display: "flex", gap: 8, alignItems: "center" }}><Download size={14} /> Export Node Map</button>
        </div>
        <div className="tableContainer">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Operator Badge</th>
                <th>Contact</th>
                <th>License / ID Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((operator: UserRecord) => (
                <tr key={operator.id} className="recordCard">
                  <td>
                    <div className="tableTitle">{operator.fullName || "Unnamed Operator"}</div>
                    <div className="tableSubtitle" style={{ marginBottom: 6 }}>{operator.email}</div>
                    <div 
                      style={{ 
                        fontSize: 10, 
                        color: "var(--primary)", 
                        cursor: "pointer", 
                        display: "flex", 
                        alignItems: "center", 
                        gap: 4,
                        background: "rgba(251, 191, 36, 0.05)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        width: "fit-content"
                      }}
                      onClick={() => navigator.clipboard.writeText(operator.id)}
                      title="Click to copy Driver ID"
                    >
                      <Copy size={9} /> ID: {operator.id}
                    </div>
                  </td>
                  <td>{operator.phone || "N/A"}</td>
                  <td><span className="badge badgeGreen">Verified</span></td>
                  <td>
                    <div className="tableActions">
                      <button className="btnIcon" title="Edit Profile" onClick={() => editUser(operator)}><Edit3 size={16} /></button>
                      <button className="btnIcon danger" title="Purge Operator" onClick={() => showConfirm(
                        "Purge Operator", 
                        `Delete ${operator.fullName}?`, 
                        () => void deleteUser(operator),
                        "Purge Operator"
                      )}><Trash size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "40px" }}>
                    <Users size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: 16 }} />
                    <div style={{ color: "var(--text-secondary)" }}>No operator nodes provisioned.</div>
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
