"use client";

import React, { useEffect, useRef } from "react";
import type { UserRecord } from "@skoolpath/shared";
import { Search, Download, Trash, Edit3, Users, Copy, Check } from "lucide-react";
import gsap from "gsap";

type Props = {
  users: UserRecord[];
  searchTerm: string;
  setSearchTerm: (t: string) => void;
  adminRole: string;
  userForm: any;
  setUserForm: (v: any) => void;
  userPassword: string;
  setUserPassword: (v: string) => void;
  saveUser: () => void;
  editUser: (u: UserRecord) => void;
  showConfirm: (t: string, m: string, c: () => void, cl?: string) => void;
  deleteUser: (u: UserRecord) => void;
};

export default function UsersTab({
  users, searchTerm, setSearchTerm, adminRole, userForm, setUserForm, userPassword, setUserPassword, saveUser, editUser, showConfirm, deleteUser
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current.querySelectorAll('.recordCard'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.05, duration: 0.6, ease: "power2.out" }
      );
    }
  }, [users, searchTerm]);

  const filtered = users.filter((u: UserRecord) => 
    (u.fullName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.role || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animFadeIn" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Users</h1>
          <p className="pageSubtitle">Oversee parents, drivers, and sub-administrators</p>
        </div>
        <div className="pageActions">
          <button className="btnPrimary">Add New User</button>
        </div>
      </div>

      <div className="formAndRecords">
        {/* Form Panel */}
        <div className="card">
          <div className="cardPadded">
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Full Name</label>
              <input className="fieldInput" value={userForm.fullName} onChange={e => setUserForm({...userForm, fullName: e.target.value})} />
            </div>
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Email Address</label>
              <input className="fieldInput" type="email" value={userForm.email || ""} onChange={e => setUserForm({...userForm, email: e.target.value})} placeholder="example@domain.com" />
            </div>
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Phone Number</label>
              <input className="fieldInput" value={userForm.phone} onChange={e => setUserForm({...userForm, phone: e.target.value})} />
            </div>
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">Password</label>
              <input className="fieldInput" type="password" value={userPassword} onChange={e => setUserPassword(e.target.value)} placeholder="Minimum 6 characters" />
            </div>
            <div className="fieldGroup" style={{ marginBottom: 16 }}>
              <label className="fieldLabel">User Role</label>
              <select 
                className="fieldSelect" 
                value={userForm.role} 
                onChange={e => setUserForm({...userForm, role: e.target.value})}
                disabled={adminRole === "school-admin" && userForm.role === "super-admin"}
              >
                {adminRole === "super-admin" && <option value="super-admin">Super Admin</option>}
                <option value="school-admin">School Admin</option>
                <option value="parent">Parent</option>
                <option value="driver">Driver</option>
              </select>
            </div>
            {adminRole === "super-admin" && userForm.role !== "super-admin" && (
              <div className="fieldGroup" style={{ marginBottom: 16 }}>
                <label className="fieldLabel">School ID</label>
                <input className="fieldInput" value={userForm.schoolId} onChange={e => setUserForm({...userForm, schoolId: e.target.value})} />
              </div>
            )}
            
            {userForm.role === "parent" && (
              <div style={{ padding: "16px", background: "rgba(0,0,0,0.2)", borderRadius: 8, border: "1px solid var(--card-border)", marginBottom: 24 }}>
                <div style={{ fontSize: 13, color: "var(--primary)", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Bus Assignment Config</div>
                <div className="fieldGroup" style={{ marginBottom: 12 }}>
                  <label className="fieldLabel">Bus ID</label>
                  <input className="fieldInput" value={userForm.busId} onChange={e => setUserForm({...userForm, busId: e.target.value})} />
                </div>
                <div className="fieldGroup" style={{ marginBottom: 12 }}>
                  <label className="fieldLabel">Student Name</label>
                  <input className="fieldInput" value={userForm.studentName} onChange={e => setUserForm({...userForm, studentName: e.target.value})} />
                </div>
                <div className="fieldGroup">
                  <label className="fieldLabel">Stop Name</label>
                  <input className="fieldInput" value={userForm.stopName || ""} onChange={e => setUserForm({...userForm, stopName: e.target.value})} />
                </div>
              </div>
            )}
            
            <button className="btnPrimary" style={{ width: "100%", marginTop: 12 }} onClick={() => saveUser()}>Save User</button>
          </div>
        </div>

        {/* Data Table */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="cardPadded tableHeader">
            <div className="tableCount">Registered Users ({filtered.length})</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div className="searchWrap" style={{ position: "relative" }}>
                <Search className="searchIcon" size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
                <input 
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="filterInput"
                  style={{ paddingLeft: 36, width: 220, padding: "8px 12px 8px 36px" }}
                />
              </div>
              <button className="btnOutline btnSmall" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Download size={14} /> Export Users
              </button>
            </div>
          </div>
          
          <div className="tableContainer">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Bus Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user: UserRecord) => (
                  <tr key={user.id} className="recordCard">
                    <td>
                      <div className="tableTitle">{user.fullName || "Unknown User"}</div>
                      <div className="tableSubtitle">{user.email}</div>
                    </td>
                    <td>
                      <div>{user.phone || "No Phone"}</div>
                    </td>
                    <td>
                      {user.role === "super-admin" && <span className="badge badgeRed">Super Admin</span>}
                      {user.role === "school-admin" && <span className="badge badgeOrange">School Admin</span>}
                      {user.role === "parent" && <span className="badge badgeGreen">Parent</span>}
                      {user.role === "driver" && (
                        <div 
                          style={{ 
                            fontSize: 11, 
                            color: "var(--primary)", 
                            marginTop: 6, 
                            cursor: "pointer", 
                            display: "flex", 
                            alignItems: "center", 
                            gap: 4,
                            background: "rgba(251, 191, 36, 0.05)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            width: "fit-content"
                          }}
                          onClick={() => {
                            navigator.clipboard.writeText(user.id);
                            // Simple visual feedback could be added here if state allows, 
                            // but for now we'll just copy.
                          }}
                          title="Click to copy Driver ID"
                        >
                          <Copy size={10} /> ID: {user.id}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>School: {user.schoolId || "GLOBAL"}</div>
                    </td>
                    <td>
                      {user.role === "parent" ? (
                         user.busId ? (
                           <div>
                             <div style={{ fontWeight: 600 }}>{user.studentName}</div>
                             <div className="tableSubtitle">Bus: {user.busId} • Stop: {user.stopName || "Unassigned"}</div>
                           </div>
                         ) : <span className="badge badgeGrey">Unassigned</span>
                      ) : <span style={{ color: "var(--text-secondary)" }}>N/A</span>}
                    </td>
                    <td>
                      <div className="tableActions">
                        <button className="btnIcon" title="Edit User" onClick={() => editUser(user)}>
                          <Edit3 size={16} />
                        </button>
                        <button className="btnIcon danger" title="Delete User" onClick={() => showConfirm(
                          "Delete User",
                          `Are you sure you want to delete ${user.email}?`,
                          () => void deleteUser(user),
                          "Delete User"
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
                      <Users size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: 16 }} />
                      <div style={{ color: "var(--text-secondary)" }}>No users matching your search parameters.</div>
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
