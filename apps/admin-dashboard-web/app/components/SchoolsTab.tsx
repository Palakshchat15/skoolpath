"use client";

import React, { useEffect, useRef } from "react";
import type { SchoolRecord } from "@skoolpath/shared";
import { Search, Download, Trash, Edit3, School } from "lucide-react";
import gsap from "gsap";

type Props = {
  schools: SchoolRecord[];
  searchTerm: string;
  setSearchTerm: (t: string) => void;
  adminRole: string;
  schoolForm: SchoolRecord;
  schoolPassword: string;
  setSchoolPassword: (v: string) => void;
  setSchoolForm: (v: any) => void;
  saveSchool: () => void;
  editSchool: (s: SchoolRecord) => void;
  showConfirm: (t: string, m: string, cb: () => void, cl?: string) => void;
  deleteSchool: (id: string) => void;
};

export default function SchoolsTab({
  schools,
  searchTerm,
  setSearchTerm,
  adminRole,
  schoolForm,
  schoolPassword,
  setSchoolPassword,
  setSchoolForm,
  saveSchool,
  editSchool,
  showConfirm,
  deleteSchool
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current.querySelectorAll('.recordCard'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.05, duration: 0.6, ease: "power2.out" }
      );
    }
  }, [schools, searchTerm]);

  const filtered = schools.filter(s => 
    (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.id || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animFadeIn" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Schools</h1>
          <p className="pageSubtitle">Manage all schools in the system</p>
        </div>
        <div className="pageActions">
          <button className="btnPrimary" onClick={() => {
            setSchoolForm({ id: "", name: "", city: "", contactEmail: "", transportManager: "" });
            setSchoolPassword("");
          }}>
            + Add New School
          </button>
        </div>
      </div>

      <div className="filtersCard">
        <div className="filtersTitle"><span className="btnIcon">🔍</span> Filters</div>
        <div className="filtersRow">
          <div className="searchWrap" style={{ flex: 1, position: "relative" }}>
            <Search className="searchIcon" size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
            <input 
              placeholder="Search schools by name or ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="filterInput"
              style={{ paddingLeft: 44 }}
            />
          </div>
          <div className="filterGroup" style={{ maxWidth: 200 }}>
            <select className="filterSelect"><option>All Cities</option></select>
          </div>
          <button className="btnPrimary" style={{height: 42}}>Filter</button>
          <button className="btnOutline" style={{height: 42, display: "flex", gap: 8, alignItems: "center"}} onClick={() => setSearchTerm("")}>
            Clear
          </button>
        </div>
      </div>

      {(schoolForm.id || adminRole === "super-admin") && (
        <div className="card cardPadded">
          <h3 className="cardTitle">{schoolForm.id ? "Edit School" : "Add School"}</h3>
          <div className="formGrid formGrid2Col">
            <div className="fieldGroup">
              <label className="fieldLabel">School ID / Code</label>
              <input className="fieldInput" value={schoolForm.id} onChange={e => setSchoolForm({...schoolForm, id: e.target.value})} />
            </div>
            <div className="fieldGroup">
              <label className="fieldLabel">School Name</label>
              <input className="fieldInput" value={schoolForm.name} onChange={e => setSchoolForm({...schoolForm, name: e.target.value})} />
            </div>
            <div className="fieldGroup">
              <label className="fieldLabel">City</label>
              <input className="fieldInput" value={schoolForm.city} onChange={e => setSchoolForm({...schoolForm, city: e.target.value})} />
            </div>
            <div className="fieldGroup">
              <label className="fieldLabel">Contact Email</label>
              <input className="fieldInput" value={schoolForm.contactEmail} onChange={e => setSchoolForm({...schoolForm, contactEmail: e.target.value})} />
            </div>
            <div className="fieldGroup">
              <label className="fieldLabel">Transport Manager</label>
              <input className="fieldInput" value={schoolForm.transportManager} onChange={e => setSchoolForm({...schoolForm, transportManager: e.target.value})} />
            </div>
            <div className="fieldGroup">
              <label className="fieldLabel">School Admin Password</label>
              <input className="fieldInput" type="password" value={schoolPassword} onChange={e => setSchoolPassword(e.target.value)} placeholder="Create a secure password" />
              <p className="fieldHelp">Use this password for the school admin login.</p>
            </div>
          </div>
          <div className="pageActions" style={{ marginTop: 20 }}>
            <button className="btnPrimary" onClick={saveSchool}>Save School</button>
            <button className="btnOutline" onClick={() => {
              setSchoolForm({ id: "", name: "", city: "", contactEmail: "", transportManager: "" });
              setSchoolPassword("");
            }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{marginTop: 24}}>
        <div className="cardPadded tableHeader">
          <div className="tableCount">Active Schools ({filtered.length})</div>
          <button className="btnOutline btnSmall" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Download size={14} /> Export
          </button>
        </div>
        <div className="tableContainer">
          <table className="dataTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>School Name</th>
                <th>Contact</th>
                <th>Manager</th>
                <th>Plan</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(school => (
                <tr key={school.id} className="recordCard">
                  <td>{school.id}</td>
                  <td><div className="tableTitle">{school.name}</div><div className="tableSubtitle">{school.city}</div></td>
                  <td>{school.contactEmail}</td>
                  <td>{school.transportManager || "N/A"}</td>
                  <td>
                    <span className="badge badgePurple">Active Plan</span>
                  </td>
                  <td>
                    {adminRole === "super-admin" && (
                      <div className="tableActions">
                        <button className="btnIcon" title="Edit School" onClick={() => editSchool(school)}>
                          <Edit3 size={16} />
                        </button>
                        <button className="btnIcon danger" title="Delete School" onClick={() => showConfirm(
                          "Delete School",
                          `Delete school ${school.name}? This action is irreversible.`,
                          () => void deleteSchool(school.id),
                          "Delete School"
                        )}>
                          <Trash size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px 20px" }}>
                    <div className="emptyStateText" style={{ margin: "0 auto" }}>No schools found.</div>
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
