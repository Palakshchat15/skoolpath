"use client";
import React, { useEffect, useRef } from "react";
import type { UserRecord } from "@skoolpath/shared";
import { GraduationCap, Download, Edit3 } from "lucide-react";
import gsap from "gsap";

type Props = {
  users: UserRecord[];
  editUser: (record: UserRecord) => void;
};

export default function StudentsTab({ users, editUser }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current.querySelectorAll('.recordCard'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.05, duration: 0.6, ease: "power2.out" }
      );
    }
  }, [users]);

  // Aggregate students based off the parent profiles
  const aggregateStudents = () => {
    const students: any[] = [];
    users.forEach(u => {
      if (u.studentName) {
        students.push({
          parent: u,
          name: u.studentName,
          busId: u.busId || "Unassigned"
        });
      }
    });
    return students;
  };

  const studentList = aggregateStudents();

  return (
    <div className="animFadeIn" ref={containerRef}>
      <div className="pageHeader" style={{ paddingBottom: 24 }}>
        <div>
          <h1 className="pageTitle">Students</h1>
          <p className="pageSubtitle">Manage student records and assigned routes</p>
        </div>
      </div>
      <div className="card" style={{marginTop: 24}}>
        <div className="cardPadded tableHeader">
          <div className="tableCount">Enrolled Students ({studentList.length})</div>
          <button className="btnOutline btnSmall" style={{ display: "flex", gap: 8, alignItems: "center" }}><Download size={14} /> Export List</button>
        </div>
        <div className="tableContainer">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Parent</th>
                <th>Assigned Bus</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {studentList.map((st, i) => (
                <tr key={i} className="recordCard">
                  <td><div className="tableTitle">{st.name}</div></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {st.parent.fullName}
                      <span className="badge badgeGrey" style={{ fontSize: 10 }}>P</span>
                    </div>
                    <div className="tableSubtitle">{st.parent.email}</div>
                  </td>
                  <td>{st.busId}</td>
                  <td><span className="badge badgeGreen">Assigned</span></td>
                  <td>
                    <button className="btnIcon" title="Assign Bus" onClick={() => editUser(st.parent)}>
                      <Edit3 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {studentList.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "40px" }}>
                    <GraduationCap size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: 16 }} />
                    <div style={{ color: "var(--text-secondary)" }}>Student records are automatically created when parents register and configure their child's details.</div>
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
