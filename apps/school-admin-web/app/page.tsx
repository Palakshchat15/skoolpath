"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import {
  type BusRecord,
  type SchoolRecord,
  type TripRecord,
  type UserRecord,
  type SOSAlert,
  getFirebaseAuth,
  getFirebaseDb,
  getSchoolsCollection,
  getBusesCollection,
  getUsersCollection,
  getTripsCollection,
  getSOSCollection,
  hasFirebaseConfig,
  signOutUser
} from "@skoolpath/shared";

import { Bell, Bus, CalendarDays, CheckCircle2, LayoutDashboard, MapPin, ShieldCheck, Users, LogOut, Route, FileText, Settings, Sun, Moon, Menu, X } from "lucide-react";

type Alert = {
  id: string;
  title: string;
  status: "open" | "resolved";
  school: string;
};

export default function Page() {
  const firebaseReady = hasFirebaseConfig();
  const auth = useMemo(() => (firebaseReady ? getFirebaseAuth() : null), [firebaseReady]);
  const db = useMemo(() => (firebaseReady ? getFirebaseDb() : null), [firebaseReady]);

  const [user, setUser] = useState<User | null>(null);
  const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
  const [school, setSchool] = useState<SchoolRecord | null>(null);
  const [buses, setBuses] = useState<BusRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      window.location.href = "/login";
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          if (db) {
            const userData = await getDocs(query(getUsersCollection(db), where("email", "==", firebaseUser.email)));
            if (!userData.empty) {
              const userRec = userData.docs[0].data();
              setUserRecord(userRec);
              if (userRec.role === "school-admin" && userRec.schoolId) {
                const schoolData = await getDocs(query(getSchoolsCollection(db), where("id", "==", userRec.schoolId)));
                if (!schoolData.empty) {
                  setSchool(schoolData.docs[0].data());
                }
              } else {
                await signOutUser();
                setUser(null);
                setUserRecord(null);
              }
            } else {
              await signOutUser();
              setUser(null);
            }
          }
        } else {
          setUser(null);
          setUserRecord(null);
          setSchool(null);
          window.location.href = "/login";
        }
      } catch (err) {
        console.error("Firebase Auth or Firestore error:", err);
        // Ensure user is signed out if there's a permissions error
        await signOutUser().catch(() => {});
        setUser(null);
        window.location.href = "/login";
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, db]);

  useEffect(() => {
    if (!db || !school) return;

    // Load buses for school
    const busesQuery = query(getBusesCollection(db), where("schoolId", "==", school.id));
    const unsubscribeBuses = onSnapshot(busesQuery, (snapshot) => {
      setBuses(snapshot.docs.map(doc => doc.data()));
    });

    // Load users for school
    const usersQuery = query(getUsersCollection(db), where("schoolId", "==", school.id));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data()));
    });

    // Load trips for school
    const tripsQuery = query(getTripsCollection(db), where("schoolId", "==", school.id));
    const unsubscribeTrips = onSnapshot(tripsQuery, (snapshot) => {
      setTrips(snapshot.docs.map(doc => doc.data()));
    });

    // Load SOS alerts for school
    const alertsQuery = query(getSOSCollection(db), where("schoolId", "==", school.id), where("resolved", "==", false));
    const unsubscribeAlerts = onSnapshot(alertsQuery, (snapshot) => {
      setAlerts(snapshot.docs.map(doc => doc.data()));
    });

    return () => {
      unsubscribeBuses();
      unsubscribeUsers();
      unsubscribeTrips();
      unsubscribeAlerts();
    };
  }, [db, school]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("school-admin-theme");
    if (savedTheme === "dark") {
      setDarkMode(true);
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  const handleLogout = async () => {
    await signOutUser();
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("school-admin-theme", next ? "dark" : "light");
  };

  if (loading) {
    return (
      <div className="loadingScreen">
        <div className="loadingSpinner" />
        <span className="loadingLabel">Loading School Dashboard...</span>
      </div>
    );
  }

  if (!user || !userRecord || !school) {
    return null; // Will redirect
  }

  // Calculate metrics
  const activeStudents = users.filter(u => u.role === "parent").length;
  const driversOnDuty = users.filter(u => u.role === "driver").length;
  const routesLive = [...new Set(buses.map(b => b.routeName))].length;
  const completedTrips = trips.filter(t => t.status === "completed").length;
  const totalTrips = trips.length;
  const onTimeScore = totalTrips > 0 ? Math.round((completedTrips / totalTrips) * 100) : 0;

  const metrics = [
    { label: "Active Students", value: activeStudents.toString(), icon: "🎓", color: "#3b82f6" },
    { label: "Drivers On Duty", value: driversOnDuty.toString(), icon: "🚌", color: "#9b61ff" },
    { label: "Routes Live", value: routesLive.toString(), icon: "🛣️", color: "#10b981" },
    { label: "On-Time Score", value: `${onTimeScore}%`, icon: "✅", color: "#f59e0b" }
  ];

  const alertList: Alert[] = alerts.map(a => ({
    id: a.id,
    title: `SOS from ${a.parentName}`,
    status: "open",
    school: school.name
  }));

  const drivers = users.filter(u => u.role === "driver").map(d => ({
    name: d.fullName,
    vehicle: buses.find(b => b.driverId === d.id)?.label || "Unassigned",
    status: trips.some(t => t.driverId === d.id && t.status === "active") ? "On Route" : "Standby"
  }));

  const routes = [...new Set(buses.map(b => b.routeName))].map(name => {
    const routeBuses = buses.filter(b => b.routeName === name);
    const activeTrips = trips.filter(t => routeBuses.some(b => b.id === t.busId) && t.status === "active");
    return {
      name,
      stops: routeBuses.length, // Approximate
      status: activeTrips.length > 0 ? "On Schedule" : "Completed"
    };
  });

  return (
    <div className="dashboard-layout">
      {/* Mobile Menu Button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        style={{ display: 'none' }}
      >
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="sidebar-overlay open"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/logo.png" alt="Logo" style={{ height: 28, width: 28, borderRadius: 4, objectFit: "contain" }} />
            SkoolPath
          </h2>
          <p>School Admin — {school?.name || "Your School"}</p>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`} 
            onClick={() => {
              setActiveTab("dashboard");
              setMobileMenuOpen(false);
            }}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
          <button 
            className={`nav-item ${activeTab === "buses" ? "active" : ""}`} 
            onClick={() => {
              setActiveTab("buses");
              setMobileMenuOpen(false);
            }}
          >
            <Bus size={20} />
            Buses
          </button>
          <button 
            className={`nav-item ${activeTab === "students" ? "active" : ""}`} 
            onClick={() => {
              setActiveTab("students");
              setMobileMenuOpen(false);
            }}
          >
            <Users size={20} />
            Students
          </button>
          <button 
            className={`nav-item ${activeTab === "routes" ? "active" : ""}`} 
            onClick={() => {
              setActiveTab("routes");
              setMobileMenuOpen(false);
            }}
          >
            <Route size={20} />
            Routes
          </button>
          <button 
            className={`nav-item ${activeTab === "trips" ? "active" : ""}`} 
            onClick={() => {
              setActiveTab("trips");
              setMobileMenuOpen(false);
            }}
          >
            <CalendarDays size={20} />
            Trips
          </button>
          <button 
            className={`nav-item ${activeTab === "reports" ? "active" : ""}`} 
            onClick={() => {
              setActiveTab("reports");
              setMobileMenuOpen(false);
            }}
          >
            <FileText size={20} />
            Reports
          </button>
          <button 
            className={`nav-item ${activeTab === "settings" ? "active" : ""}`} 
            onClick={() => {
              setActiveTab("settings");
              setMobileMenuOpen(false);
            }}
          >
            <Settings size={20} />
            Settings
          </button>
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle-btn" onClick={toggleDarkMode}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === "dashboard" && (
          <>
            <header className="page-header">
              <div>
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">Welcome back, {userRecord?.fullName}. Here's what's happening with your school's transport operations.</p>
              </div>
            </header>

            <div className="stats-grid">
              {metrics.map((metric, i) => (
                <div key={metric.label} className="stat-card" style={{ animationDelay: `${i * 0.1}s` }}>
                  <div className="stat-icon-wrap" style={{ background: `${metric.color}18`, color: metric.color }}>
                    <span style={{ fontSize: 22 }}>{metric.icon}</span>
                  </div>
                  <div className="stat-content">
                    <h3 className="stat-value" style={{ color: metric.color }}>{metric.value}</h3>
                    <p className="stat-label">{metric.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-section">
                <div className="section-card">
                  <div className="section-header">
                    <h2 className="section-title">Active Alerts</h2>
                    <Bell size={20} />
                  </div>
                  <div className="alerts-list">
                    {alertList.map((alert) => (
                      <div key={alert.id} className="alert-item">
                        <div className="alert-content">
                          <strong>{alert.title}</strong>
                          <span className="alert-meta">{alert.school} • Requires attention</span>
                        </div>
                        <span className="alert-status open">Open</span>
                      </div>
                    ))}
                    {alertList.length === 0 && <p className="empty-state">No active alerts</p>}
                  </div>
                </div>

                <div className="section-card">
                  <div className="section-header">
                    <h2 className="section-title">Route Performance</h2>
                    <CalendarDays size={20} />
                  </div>
                  <div className="routes-list">
                    {routes.map((route) => (
                      <div key={route.name} className="route-item">
                        <div className="route-content">
                          <strong>{route.name}</strong>
                          <span className="route-meta">{route.stops} buses</span>
                        </div>
                        <span className={`route-status ${route.status === "On Schedule" ? "active" : "completed"}`}>
                          {route.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dashboard-section">
                <div className="section-card">
                  <div className="section-header">
                    <h2 className="section-title">Driver Roster</h2>
                    <ShieldCheck size={20} />
                  </div>
                  <div className="drivers-list">
                    {drivers.map((driver) => (
                      <div key={driver.name} className="driver-item">
                        <div className="driver-content">
                          <strong>{driver.name}</strong>
                          <span className="driver-meta">{driver.vehicle}</span>
                        </div>
                        <span className={`driver-status ${driver.status === "On Route" ? "active" : "standby"}`}>
                          {driver.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="section-card">
                  <div className="section-header">
                    <h2 className="section-title">Operations Summary</h2>
                    <CheckCircle2 size={20} />
                  </div>
                  <div className="operations-list">
                    <div className="operation-item">
                      <span>Active Buses</span>
                      <strong>{buses.length}</strong>
                    </div>
                    <div className="operation-item">
                      <span>Completed Trips</span>
                      <strong>{completedTrips}</strong>
                    </div>
                    <div className="operation-item">
                      <span>Total Capacity</span>
                      <strong>{buses.reduce((sum, b) => sum + b.capacity, 0)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "buses" && (
          <div className="tab-content">
            <header className="page-header">
              <h1 className="page-title">Buses</h1>
              <p className="page-subtitle">Manage your school's bus fleet and assignments.</p>
            </header>
            <div className="buses-grid">
              {buses.map((bus) => (
                <div key={bus.id} className="bus-card">
                  <div className="bus-header">
                    <Bus size={24} />
                    <h3>{bus.label}</h3>
                  </div>
                  <div className="bus-details">
                    <p><strong>Plate:</strong> {bus.plateNumber}</p>
                    <p><strong>Route:</strong> {bus.routeName}</p>
                    <p><strong>Capacity:</strong> {bus.capacity} students</p>
                  </div>
                </div>
              ))}
              {buses.length === 0 && <p className="empty-state">No buses assigned to this school</p>}
            </div>
          </div>
        )}

        {activeTab === "students" && (
          <div className="tab-content">
            <header className="page-header">
              <h1 className="page-title">Students</h1>
              <p className="page-subtitle">View student information and bus assignments.</p>
            </header>
            <div className="students-list">
              {users.filter(u => u.role === "parent").map((student) => (
                <div key={student.id} className="student-card">
                  <div className="student-info">
                    <h3>{student.studentName || "Unnamed Student"}</h3>
                    <p><strong>Parent:</strong> {student.fullName}</p>
                    <p><strong>Bus:</strong> {student.busId || "Unassigned"}</p>
                    <p><strong>Stop:</strong> {student.stopName || "Unassigned"}</p>
                  </div>
                </div>
              ))}
              {users.filter(u => u.role === "parent").length === 0 && <p className="empty-state">No students registered</p>}
            </div>
          </div>
        )}

        {activeTab === "routes" && (
          <div className="tab-content">
            <header className="page-header">
              <h1 className="page-title">Routes</h1>
              <p className="page-subtitle">Monitor and manage bus routes for your school.</p>
            </header>
            <div className="routes-grid">
              {routes.map((route) => (
                <div key={route.name} className="route-card">
                  <h3>{route.name}</h3>
                  <p><strong>Buses:</strong> {route.stops}</p>
                  <p><strong>Status:</strong> {route.status}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "trips" && (
          <div className="tab-content">
            <header className="page-header">
              <h1 className="page-title">Trips</h1>
              <p className="page-subtitle">Track current and completed bus trips.</p>
            </header>
            <div className="trips-list">
              {trips.map((trip) => (
                <div key={trip.id} className="trip-card">
                  <div className="trip-info">
                    <h3>{trip.busLabel}</h3>
                    <p><strong>Driver:</strong> {trip.driverName}</p>
                    <p><strong>Status:</strong> {trip.status}</p>
                    <p><strong>Started:</strong> {new Date(trip.startedAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {trips.length === 0 && <p className="empty-state">No trips recorded</p>}
            </div>
          </div>
        )}

        {activeTab === "reports" && (
          <div className="tab-content">
            <header className="page-header">
              <h1 className="page-title">Reports</h1>
              <p className="page-subtitle">Generate and view transport reports.</p>
            </header>
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="section-card">
                <div className="section-header">
                  <h2 className="section-title">Trip Analytics</h2>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
                    <div style={{ padding: 16, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--background-secondary)' }}>
                      <p style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', opacity: 0.7 }}>Total Trips</p>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{trips.length}</p>
                    </div>
                    <div style={{ padding: 16, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--background-secondary)' }}>
                      <p style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', opacity: 0.7 }}>Completed</p>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{completedTrips}</p>
                    </div>
                    <div style={{ padding: 16, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--background-secondary)' }}>
                      <p style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', opacity: 0.7 }}>On-Time Score</p>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{onTimeScore}%</p>
                    </div>
                    <div style={{ padding: 16, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--background-secondary)' }}>
                      <p style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', opacity: 0.7 }}>Avg Capacity Used</p>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{buses.length > 0 ? Math.round((activeStudents / (buses.length * 50)) * 100) : 0}%</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="section-card">
                <div className="section-header">
                  <h2 className="section-title">Route Performance</h2>
                </div>
                <div className="tableContainer">
                  <table className="dataTable" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Route Name</th>
                      <th>Buses</th>
                      <th>Students</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((route) => (
                      <tr key={route.name}>
                        <td><strong style={{ color: 'var(--text-primary)' }}>{route.name}</strong></td>
                        <td style={{ color: 'var(--text-primary)' }}>{route.stops}</td>
                        <td style={{ color: 'var(--text-primary)' }}>{users.filter(u => u.role === "parent" && u.stopName === route.name).length}</td>
                        <td><span style={{ padding: '6px 12px', borderRadius: 6, background: route.status === 'On Schedule' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(107, 114, 128, 0.1)', color: route.status === 'On Schedule' ? '#22c55e' : 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>{route.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="tab-content">
            <header className="page-header">
              <h1 className="page-title">Settings</h1>
              <p className="page-subtitle">Configure your school admin preferences and properties.</p>
            </header>
            <div style={{ display: 'grid', gap: 24, maxWidth: 600 }}>
              <div className="section-card">
                <div className="section-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
                  <h2 className="section-title">School Information</h2>
                </div>
                <div style={{ padding: 16, display: 'grid', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>School Name</label>
                    <input type="text" value={school?.name || ''} disabled style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--background-secondary)', color: 'var(--text-primary)', cursor: 'not-allowed', fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Admin Name</label>
                    <input type="text" value={userRecord?.fullName || ''} disabled style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--background-secondary)', color: 'var(--text-primary)', cursor: 'not-allowed', fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Email</label>
                    <input type="email" value={user?.email || ''} disabled style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--background-secondary)', color: 'var(--text-primary)', cursor: 'not-allowed', fontSize: 14 }} />
                  </div>
                </div>
              </div>
              <div className="section-card">
                <div className="section-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
                  <h2 className="section-title">Account Statistics</h2>
                </div>
                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--background-secondary)' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', opacity: 0.7 }}>Total Users</p>
                    <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{users.length}</p>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--background-secondary)' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', opacity: 0.7 }}>Active Buses</p>
                    <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#3b82f6' }}>{buses.length}</p>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--background-secondary)' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', opacity: 0.7 }}>Total Capacity</p>
                    <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#06b6d4' }}>{buses.reduce((sum, b) => sum + b.capacity, 0)}</p>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--background-secondary)' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', opacity: 0.7 }}>Active Alerts</p>
                    <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: alerts.length > 0 ? '#ef4444' : '#22c55e' }}>{alerts.length}</p>
                  </div>
                </div>
              </div>
              <div className="section-card">
                <div className="section-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
                  <h2 className="section-title">Preferences</h2>
                </div>
                <div style={{ padding: 16, display: 'grid', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '8px 0' }}>
                    <input type="checkbox" defaultChecked onChange={toggleDarkMode} style={{ cursor: 'pointer', width: 18, height: 18 }} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Dark Mode</span>
                  </label>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', opacity: 0.7 }}>Toggle between light and dark theme</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
