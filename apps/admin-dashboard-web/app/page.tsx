"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import {
  type BusRecord,
  type RouteStop,
  type SchoolRecord,
  type StudentAssignment,
  type TripRecord,
  type UserRecord,
  createStudentAssignmentsFromUsers,
  getBusById,
  getBusesCollection,
  getBusDocumentRef,
  getFirebaseDb,
  getBusLiveLocation,
  getParentUsersByBusId,
  getSchoolsCollection,
  getTripsCollection,
  getUsersCollection,
  getUserByEmail,
  hasFirebaseConfig,
  signInUser,
  signOutUser,
  signUpUser,
  getSOSCollection,
  type SOSAlert
} from "@skoolpath/shared";

type AdminScreen = "login" | "register" | "dashboard";
type AdminTab = "schools" | "buses" | "users" | "trips";

type AdminSession = {
  screen: AdminScreen;
  email: string;
  role?: string;
  schoolId?: string;
  fullName?: string;
};

type AdminDataCache = {
  schools: SchoolRecord[];
  buses: BusRecord[];
  users: UserRecord[];
  trips: TripRecord[];
};

type Toast = {
  id: number;
  message: string;
  icon: string;
};

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
};

const sessionKey = "admin-web-session";
const dataKey = "admin-web-data";

const emptySchool: SchoolRecord = {
  id: "",
  name: "",
  city: "",
  contactEmail: "",
  transportManager: ""
};

const emptyBus: BusRecord = {
  id: "",
  schoolId: "",
  label: "",
  plateNumber: "",
  driverId: "",
  routeName: "",
  capacity: 40
};

const emptyUser: UserRecord = {
  id: "",
  schoolId: "",
  fullName: "",
  email: "",
  role: "parent",
  phone: "",
  busId: "",
  studentName: "",
  stopName: ""
};

let toastCounter = 0;

export default function Page() {
  const firebaseReady = hasFirebaseConfig();
  const db = useMemo(() => (firebaseReady ? getFirebaseDb() : null), [firebaseReady]);
  const [screen, setScreen] = useState<AdminScreen>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(
    firebaseReady ? "Sign in to manage the live fleet." : "Firebase config is missing for the admin website."
  );
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [buses, setBuses] = useState<BusRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [schoolForm, setSchoolForm] = useState<SchoolRecord>(emptySchool);
  const [busForm, setBusForm] = useState<BusRecord>(emptyBus);
  const [routeStopsInput, setRouteStopsInput] = useState("");
  const [userForm, setUserForm] = useState<UserRecord>(emptyUser);

  /* New UI state */
  const [activeTab, setActiveTab] = useState<AdminTab>("schools");
  const [searchTerm, setSearchTerm] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [adminRole, setAdminRole] = useState("super-admin");
  const [adminSchoolId, setAdminSchoolId] = useState("");
  const [activeSOS, setActiveSOS] = useState<SOSAlert[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {}
  });
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    loadSession();
    loadCachedData();
    const savedTheme = localStorage.getItem("admin-theme");
    if (savedTheme === "dark") {
      setDarkMode(true);
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  useEffect(() => {
    if (screen === "dashboard") {
      void loadFromFirebase();
    }
  }, [screen, db]);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("admin-theme", next ? "dark" : "light");
  };

  const addToast = useCallback((message: string, icon = "ℹ️") => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    if (screen !== "dashboard" || !db) return;

    let sosQuery = query(getSOSCollection(db), where("resolved", "==", false));
    if (adminRole === "school-admin" && adminSchoolId) {
      sosQuery = query(getSOSCollection(db), where("resolved", "==", false), where("schoolId", "==", adminSchoolId));
    }

    const unsubscribe = onSnapshot(sosQuery, (snapshot) => {
      const sosList = snapshot.docs.map(docSnap => docSnap.data());
      setActiveSOS((prev) => {
        // Only trigger toast if there are MORE alerts than before, or a brand new one
        if (sosList.length > prev.length) {
          const fresh = sosList[sosList.length - 1];
          addToast(`🚨 SOS TRIGGERED by ${fresh?.parentName || "Parent"}`, "🚨");
        }
        return sosList;
      });
    });

    return () => unsubscribe();
  }, [screen, db, adminRole, adminSchoolId, addToast]);

  const resolveSOS = async (alertId: string) => {
    if (!db) return;
    await setDoc(doc(getSOSCollection(db), alertId), { resolved: true }, { merge: true });
    addToast("SOS marked as resolved.", "✅");
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmState({ open: true, title, message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmState({ open: false, title: "", message: "", onConfirm: () => {} });
  };

  const availableDrivers = users.filter((user) => user.role === "driver");

  /* ─── All existing backend logic is UNCHANGED below ─── */

  const loadSession = () => {
    const saved = localStorage.getItem(sessionKey);
    if (!saved) {
      return;
    }
    const parsed = JSON.parse(saved) as AdminSession;
    setScreen(parsed.screen);
    setEmail(parsed.email);
    if (parsed.role) setAdminRole(parsed.role);
    if (parsed.schoolId) setAdminSchoolId(parsed.schoolId);
    setStatus("Session restored.");
  };

  const loadCachedData = () => {
    const saved = localStorage.getItem(dataKey);
    if (!saved) {
      return;
    }
    const parsed = JSON.parse(saved) as AdminDataCache;
    setSchools(parsed.schools ?? []);
    setBuses(parsed.buses ?? []);
    setUsers(parsed.users ?? []);
    setTrips(parsed.trips ?? []);
  };

  const persistSession = (nextScreen: AdminScreen, nextEmail = email, nextRole = adminRole, nextSchoolId = adminSchoolId) => {
    localStorage.setItem(
      sessionKey,
      JSON.stringify({
        screen: nextScreen,
        email: nextEmail,
        role: nextRole,
        schoolId: nextSchoolId
      } satisfies AdminSession)
    );
  };

  const persistData = (nextData: AdminDataCache) => {
    localStorage.setItem(dataKey, JSON.stringify(nextData));
  };

  const getFullData = () => ({ schools, buses, users, trips });

  const loadFromFirebase = async () => {
    if (!db) {
      return;
    }

    let schoolQuery = getSchoolsCollection(db) as any;
    let busQuery = getBusesCollection(db) as any;
    let userQuery = getUsersCollection(db) as any;
    let tripQuery = getTripsCollection(db) as any;

    if (adminRole === "school-admin" && adminSchoolId) {
      schoolQuery = query(schoolQuery, where("__name__", "==", adminSchoolId));
      busQuery = query(busQuery, where("schoolId", "==", adminSchoolId));
      userQuery = query(userQuery, where("schoolId", "==", adminSchoolId));
      tripQuery = query(tripQuery, where("schoolId", "==", adminSchoolId));
    }

    const [schoolDocs, busDocs, userDocs, tripDocs] = await Promise.all([
      getDocs(schoolQuery),
      getDocs(busQuery),
      getDocs(userQuery),
      getDocs(tripQuery)
    ]);

    const nextData = {
      schools: schoolDocs.docs.map((item: any) => item.data() as SchoolRecord),
      buses: busDocs.docs.map((item: any) => item.data() as BusRecord),
      users: userDocs.docs.map((item: any) => item.data() as UserRecord),
      trips: tripDocs.docs.map((item: any) => item.data() as TripRecord).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    };

    if (!nextData.schools.length && !nextData.buses.length && !nextData.users.length && !nextData.trips.length) {
      setSchools([]);
      setBuses([]);
      setUsers([]);
      setTrips([]);
      localStorage.removeItem(dataKey);
      setStatus("Firebase is empty right now, so the old local dashboard cache has been cleared.");
      addToast("Firebase is empty — local cache cleared.", "🗑️");
      return;
    }

    setSchools(nextData.schools);
    setBuses(nextData.buses);
    setUsers(nextData.users);
    setTrips(nextData.trips);
    persistData(nextData);
    setStatus("Loaded latest data from Firestore.");
    addToast("Data loaded from Firestore.", "✅");
  };

  const handleLogin = async () => {
    try {
      await signInUser(email, password);
      if (db) {
        const userRec = await getUserByEmail(db, email);
        if (!userRec || (userRec.role !== "super-admin" && userRec.role !== "school-admin")) {
          await signOutUser();
          throw new Error("Access denied. Admin role required.");
        }
        setAdminRole(userRec.role);
        setAdminSchoolId(userRec.schoolId ?? "");
        persistSession("dashboard", email, userRec.role, userRec.schoolId ?? "");
      } else {
        persistSession("dashboard");
      }
      setScreen("dashboard");
      setStatus("Admin signed in.");
      addToast("Welcome back, admin!", "👋");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign in.");
      addToast(error instanceof Error ? error.message : "Unable to sign in.", "❌");
    }
  };

  const handleRegister = async () => {
    try {
      await signUpUser(email, password);
      setScreen("dashboard");
      persistSession("dashboard");
      setStatus("Admin account created.");
      addToast("Admin account created successfully.", "✅");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to register.");
      addToast(error instanceof Error ? error.message : "Unable to register.", "❌");
    }
  };

  const handleLogout = async () => {
    await signOutUser();
    localStorage.removeItem(sessionKey);
    setScreen("login");
    setStatus("Signed out.");
  };

  const saveSchool = async () => {
    const nextRecord = normalizeSchool(schoolForm);
    const nextSchools = [nextRecord, ...schools.filter((item) => item.id !== nextRecord.id)];
    setSchools(nextSchools);
    setSchoolForm(emptySchool);
    persistData({ ...getFullData(), schools: nextSchools });

    if (!db) {
      setStatus("School saved locally only.");
      addToast("School saved locally.", "💾");
      return;
    }

    await setDoc(doc(db, "schools", nextRecord.id), {
      ...nextRecord,
      updatedAt: serverTimestamp()
    });
    setStatus("School saved to Firestore.");
    addToast(`School "${nextRecord.name}" saved.`, "🏫");
  };

  const saveBus = async () => {
    const nextRecord = normalizeBus(busForm);
    if (adminRole === "school-admin") {
      nextRecord.schoolId = adminSchoolId;
    }
    setStatus("Resolving route stops and saving bus...");
    addToast("Resolving route stops...", "⏳");
    const routeStops = await geocodeRouteStops(
      routeStopsInput,
      nextRecord.id,
      schools.find((school) => school.id === nextRecord.schoolId) ?? null
    );
    const nextBuses = [nextRecord, ...buses.filter((item) => item.id !== nextRecord.id)];
    setBuses(nextBuses);
    setBusForm(emptyBus);
    setRouteStopsInput("");
    persistData({ ...getFullData(), buses: nextBuses });

    if (!db) {
      setStatus("Bus saved locally only.");
      addToast("Bus saved locally.", "💾");
      return;
    }

    await setDoc(doc(db, "buses", nextRecord.id), {
      ...nextRecord,
      updatedAt: serverTimestamp()
    });

    await setDoc(
      getBusDocumentRef(db, nextRecord.schoolId, nextRecord.id),
      {
        busId: nextRecord.id,
        schoolId: nextRecord.schoolId,
        busLabel: nextRecord.label,
        routeName: nextRecord.routeName,
        driverId: nextRecord.driverId,
        routeStops,
        currentStopId: routeStops[0]?.id ?? "",
        currentStopName: routeStops[0]?.name ?? "",
        nextStopId: routeStops[1]?.id ?? routeStops[0]?.id ?? "",
        nextStopName: routeStops[1]?.name ?? routeStops[0]?.name ?? "",
        latitude: routeStops[0]?.latitude ?? 28.6139,
        longitude: routeStops[0]?.longitude ?? 77.209,
        speed: 0,
        heading: 0,
        accuracy: null,
        students: [],
        tripActive: false,
        driverName: "",
        lastEvent: routeStops.length ? `Route loaded with ${routeStops.length} stops` : "Bus created",
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    setStatus("Bus and route saved to Firestore.");
    addToast(`Bus "${nextRecord.label}" saved with ${routeStops.length} stops.`, "🚌");
  };

  const saveUser = async () => {
    const nextRecord = normalizeUser(userForm);
    if (adminRole === "school-admin") {
      nextRecord.schoolId = adminSchoolId;
    }
    const nextUsers = [nextRecord, ...users.filter((item) => item.id !== nextRecord.id)];
    setUsers(nextUsers);
    setUserForm(emptyUser);
    persistData({ ...getFullData(), users: nextUsers });

    if (!db) {
      setStatus("User saved locally only.");
      addToast("User saved locally.", "💾");
      return;
    }

    await setDoc(doc(db, "users", nextRecord.id), {
      ...nextRecord,
      updatedAt: serverTimestamp()
    });

    if (nextRecord.role === "parent" && nextRecord.busId) {
      await syncBusStudents(db, nextRecord);
    }

    setStatus("User saved to Firestore.");
    addToast(`User "${nextRecord.fullName}" saved.`, "👤");
  };

  const editSchool = (record: SchoolRecord) => {
    setSchoolForm(record);
    setActiveTab("schools");
  };

  const editBus = async (record: BusRecord) => {
    setBusForm(record);
    setActiveTab("buses");
    if (!db) {
      setRouteStopsInput("");
      return;
    }

    const liveBus = await getBusLiveLocation(db, record.schoolId, record.id);
    setRouteStopsInput(formatRouteStops(liveBus?.routeStops ?? []));
  };

  const editUser = (record: UserRecord) => {
    setUserForm(record);
    setActiveTab("users");
  };

  const deleteSchool = async (schoolId: string) => {
    const nextBuses = buses.filter((item) => item.schoolId !== schoolId);
    const nextUsers = users.filter((item) => item.schoolId !== schoolId);
    const nextTrips = trips.filter((item) => item.schoolId !== schoolId);
    const nextSchools = schools.filter((item) => item.id !== schoolId);

    setSchools(nextSchools);
    setBuses(nextBuses);
    setUsers(nextUsers);
    setTrips(nextTrips);
    persistData({
      schools: nextSchools,
      buses: nextBuses,
      users: nextUsers,
      trips: nextTrips
    });

    if (db) {
      const [schoolBuses, schoolUsers, schoolTrips] = await Promise.all([
        getDocs(query(getBusesCollection(db), where("schoolId", "==", schoolId))),
        getDocs(query(getUsersCollection(db), where("schoolId", "==", schoolId))),
        getDocs(query(getTripsCollection(db), where("schoolId", "==", schoolId)))
      ]);

      await Promise.all(
        schoolBuses.docs.map(async (busDoc) => {
          const bus = busDoc.data();
          await deleteDoc(doc(db, "buses", bus.id));
          await deleteDoc(getBusDocumentRef(db, bus.schoolId, bus.id));
        })
      );
      await Promise.all(schoolUsers.docs.map((userDoc) => deleteDoc(doc(db, "users", userDoc.data().id))));
      await Promise.all(schoolTrips.docs.map((tripDoc) => deleteDoc(doc(db, "trips", tripDoc.data().id))));
      await deleteDoc(doc(db, "schools", schoolId));
    }

    setStatus("School and related Firebase records deleted.");
    addToast("School and related records deleted.", "🗑️");
  };

  const deleteBus = async (bus: BusRecord) => {
    const nextBuses = buses.filter((item) => item.id !== bus.id);
    const nextUsers = users.map((item) =>
      item.busId === bus.id ? { ...item, busId: "", studentName: "", stopName: "" } : item
    );
    const nextTrips = trips.filter((item) => item.busId !== bus.id);

    setBuses(nextBuses);
    setUsers(nextUsers);
    setTrips(nextTrips);
    persistData({
      schools,
      buses: nextBuses,
      users: nextUsers,
      trips: nextTrips
    });

    if (db) {
      const [linkedUsers, linkedTrips] = await Promise.all([
        getDocs(query(getUsersCollection(db), where("busId", "==", bus.id))),
        getDocs(query(getTripsCollection(db), where("busId", "==", bus.id)))
      ]);

      await Promise.all(
        linkedUsers.docs.map((userDoc) =>
          setDoc(
            doc(db, "users", userDoc.data().id),
            {
              busId: "",
              studentName: "",
              stopName: "",
              updatedAt: serverTimestamp()
            },
            { merge: true }
          )
        )
      );
      await Promise.all(linkedTrips.docs.map((tripDoc) => deleteDoc(doc(db, "trips", tripDoc.data().id))));
      await deleteDoc(doc(db, "buses", bus.id));
      await deleteDoc(getBusDocumentRef(db, bus.schoolId, bus.id));
    }

    setStatus("Bus deleted from the dashboard and Firebase.");
    addToast(`Bus "${bus.label}" deleted.`, "🗑️");
  };

  const deleteUser = async (user: UserRecord) => {
    const nextUsers = users.filter((item) => item.id !== user.id);
    setUsers(nextUsers);
    persistData({
      schools,
      buses,
      users: nextUsers,
      trips
    });

    if (db) {
      await deleteDoc(doc(db, "users", user.id));
      if (user.role === "parent" && user.busId) {
        await syncBusStudents(db, user);
      }
    }

    setStatus("User deleted from the dashboard and Firebase.");
    addToast(`User "${user.fullName}" deleted.`, "🗑️");
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(row => 
      Object.values(row).map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ─── Search filtering (client-side only) ─── */
  const term = searchTerm.toLowerCase();

  const filteredSchools = schools.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(term) ||
      (s.id || "").toLowerCase().includes(term) ||
      (s.city || "").toLowerCase().includes(term)
  );

  const filteredBuses = buses.filter(
    (b) =>
      (b.label || "").toLowerCase().includes(term) ||
      (b.id || "").toLowerCase().includes(term) ||
      (b.routeName || "").toLowerCase().includes(term) ||
      (b.plateNumber || "").toLowerCase().includes(term)
  );

  const filteredUsers = users.filter(
    (u) =>
      (u.fullName || "").toLowerCase().includes(term) ||
      (u.email || "").toLowerCase().includes(term) ||
      (u.role || "").toLowerCase().includes(term) ||
      (u.id || "").toLowerCase().includes(term)
  );

  const filteredTrips = trips.filter(
    (t) =>
      (t.busLabel || "").toLowerCase().includes(term) ||
      t.busId.toLowerCase().includes(term) ||
      t.driverName.toLowerCase().includes(term) ||
      t.status.toLowerCase().includes(term)
  );

  const activeTripsCount = trips.filter((t) => t.status === "active").length;

  /* ─── Auth Screen ─── */
  if (screen !== "dashboard") {
    return (
      <main className="shell">
        <section className="hero authHero">
          <div className="heroBadge">SkoolPath Admin Web</div>
          <p className="eyebrow">Transport control, built for the browser</p>
          <h1>{screen === "login" ? "Operate the full school fleet from one polished web console." : "Create the admin layer before managing the fleet."}</h1>
          <p>
            Manage schools, buses, routes, driver assignments, parent mappings, and trip visibility from one browser-first workspace.
          </p>
          <div className="authHighlights">
            <HighlightCard title="Live Assignments" copy="Map drivers, buses, stops, and students without touching app code." />
            <HighlightCard title="Route Control" copy="Publish route timelines that sync directly into the parent and driver experiences." />
            <HighlightCard title="Fleet Visibility" copy="Track live buses and trip history from a website built for operations teams." />
          </div>
        </section>

        <section className="authCard">
          <div className="authTop">
            <div>
              <p className="formEyebrow">{screen === "login" ? "Welcome back" : "Start setup"}</p>
              <h2>{screen === "login" ? "Login to Admin" : "Register Admin Account"}</h2>
            </div>
            <div className="authOrb" />
          </div>
          <Field label="Email" value={email} onChange={setEmail} placeholder="Enter your email" />
          <Field label="Password" value={password} onChange={setPassword} placeholder="Enter your password" type="password" />
          <div className="stackButtons">
            <button className="primary" onClick={() => void (screen === "login" ? handleLogin() : handleRegister())}>
              {screen === "login" ? "Login" : "Register"}
            </button>
            <button className="ghost" onClick={() => setScreen(screen === "login" ? "register" : "login")}>
              {screen === "login" ? "Create admin account" : "Back to login"}
            </button>
          </div>
          <p className="status">{status}</p>
        </section>

        <ToastContainer toasts={toasts} />
      </main>
    );
  }

  /* ─── Dashboard Screen ─── */
  return (
    <div className="dashboardLayout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebarBrand">
          <div className="sidebarBrandName">SkoolPath</div>
          <div className="sidebarBrandSub">Admin Dashboard</div>
        </div>
        <nav className="sidebarNav">
          <SidebarTab icon="🏫" label="Schools" badge={schools.length} active={activeTab === "schools"} onClick={() => { setActiveTab("schools"); setSearchTerm(""); }} />
          <SidebarTab icon="🚌" label="Buses" badge={buses.length} active={activeTab === "buses"} onClick={() => { setActiveTab("buses"); setSearchTerm(""); }} />
          <SidebarTab icon="👥" label="Users" badge={users.length} active={activeTab === "users"} onClick={() => { setActiveTab("users"); setSearchTerm(""); }} />
          <SidebarTab icon="📋" label="Trips" badge={activeTripsCount} active={activeTab === "trips"} onClick={() => { setActiveTab("trips"); setSearchTerm(""); }} />
        </nav>
        <div className="sidebarFooter">
          <button className="themeToggle" onClick={toggleDarkMode}>
            <span className="sidebarTabIcon">{darkMode ? "☀️" : "🌙"}</span>
            <span>{darkMode ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <button className="themeToggle" onClick={() => void handleLogout()}>
            <span className="sidebarTabIcon">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="mainContent">
        {/* Hero */}
        <section className="hero heroWide">
          <div>
            <p className="eyebrow">Transport Operations</p>
            <h1>Website admin dashboard for the whole fleet.</h1>
            <p>Create schools, assign drivers, publish route timelines, and map parents to buses.</p>
          </div>
          <div className="heroStats">
            <Stat label="Schools" value={String(schools.length)} />
            <Stat label="Buses" value={String(buses.length)} />
            <Stat label="Users" value={String(users.length)} />
          </div>
        </section>

        {/* Summary Stats */}
        <div className="statsRow">
          <StatCard icon="🏫" label="Schools" value={schools.length} colorClass="statIconSchools" />
          <StatCard icon="🚌" label="Buses" value={buses.length} colorClass="statIconBuses" />
          <StatCard icon="👥" label="Users" value={users.length} colorClass="statIconUsers" />
          <StatCard icon="📋" label="Active Trips" value={activeTripsCount} colorClass="statIconTrips" />
        </div>

        {/* Toolbar */}
        <section className="toolbar">
          <div className="toolbarCopy">
            <strong>System status</strong>
            <p>{status}</p>
          </div>
          <div className="row">
            <button className="ghost" onClick={() => void loadFromFirebase()}>↻ Reload</button>
          </div>
        </section>

        {/* SOS Alert Banner */}
        {activeSOS.length > 0 && (
          <div style={{ backgroundColor: "#fee2e2", border: "2px solid #ef4444", borderRadius: 16, padding: 18, marginBottom: 20 }}>
            <h3 style={{ color: "#b91c1c", margin: 0, fontSize: 18, marginBottom: 8 }}>🚨 ACTIVE EMERGENCY SOS</h3>
            <p style={{ color: "#991b1b", margin: 0, marginBottom: 16 }}>
              {activeSOS.length} parent(s) have triggered an SOS alert. Please coordinate with the bus driver or authorities.
            </p>
            {activeSOS.map(alert => (
              <div key={alert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#ffffff", padding: 12, borderRadius: 8, marginBottom: 8 }}>
                <div>
                  <strong>{alert.parentName}</strong> {alert.studentName ? `(Child: ${alert.studentName})` : ""}
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                    Bus ID: {alert.busId || "Unknown"} | Time: {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <button 
                  onClick={() => resolveSOS(alert.id)}
                  style={{ backgroundColor: "#10b981", color: "#ffffff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}
                >
                  Mark Resolved
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === "schools" && (
          <div className="formAndRecords">
            {adminRole === "super-admin" ? (
              <Panel title="Add School">
                <Field label="School ID" value={schoolForm.id} onChange={(value) => setSchoolForm((prev) => ({ ...prev, id: value }))} />
                <Field label="School Name" value={schoolForm.name} onChange={(value) => setSchoolForm((prev) => ({ ...prev, name: value }))} />
                <Field label="City" value={schoolForm.city} onChange={(value) => setSchoolForm((prev) => ({ ...prev, city: value }))} />
                <Field label="Contact Email" value={schoolForm.contactEmail} onChange={(value) => setSchoolForm((prev) => ({ ...prev, contactEmail: value }))} />
                <Field label="Transport Manager" value={schoolForm.transportManager} onChange={(value) => setSchoolForm((prev) => ({ ...prev, transportManager: value }))} />
                <button className="primary" onClick={() => void saveSchool()}>Save School</button>
              </Panel>
            ) : (
              <Panel title="Your School">
                <div style={{ padding: "0 10px 10px", color: "var(--muted)", fontSize: 14 }}>
                  As a School Admin, you can only view and manage your assigned school. To add a new school, contact a Super Admin.
                </div>
              </Panel>
            )}

            <Panel title={`Schools (${filteredSchools.length})`}>
              <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search schools..." />
              {filteredSchools.length ? filteredSchools.map((school) => (
                <RecordLine
                  key={school.id}
                  title={school.name}
                  subtitle={`${school.city} | ${school.id}`}
                  meta={school.transportManager}
                  onEdit={() => editSchool(school)}
                  onDelete={() =>
                    showConfirm(
                      "Delete School",
                      `Delete "${school.name}" and its related buses, users, and trips?`,
                      () => { void deleteSchool(school.id); closeConfirm(); }
                    )
                  }
                />
              )) : (
                <EmptyState
                  icon="🏫"
                  title="No schools found"
                  text={searchTerm ? "Try a different search term." : "Add your first school using the form on the left."}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === "buses" && (
          <div className="formAndRecords">
            <Panel title="Add Bus">
              <Field label="Bus ID" value={busForm.id} onChange={(value) => setBusForm((prev) => ({ ...prev, id: value }))} />
              {adminRole === "super-admin" && (
                <Field label="School ID" value={busForm.schoolId} onChange={(value) => setBusForm((prev) => ({ ...prev, schoolId: value }))} />
              )}
              <Field label="Bus Label" value={busForm.label} onChange={(value) => setBusForm((prev) => ({ ...prev, label: value }))} />
              <Field label="Plate Number" value={busForm.plateNumber} onChange={(value) => setBusForm((prev) => ({ ...prev, plateNumber: value }))} />
              <label className="field">
                <span>Driver Assignment</span>
                <select
                  value={busForm.driverId}
                  onChange={(event) => setBusForm((prev) => ({ ...prev, driverId: event.target.value }))}
                >
                  <option value="">Select assigned driver</option>
                  {availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.fullName} ({driver.id})
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Route Name" value={busForm.routeName} onChange={(value) => setBusForm((prev) => ({ ...prev, routeName: value }))} />
              <Field label="Capacity" value={String(busForm.capacity)} onChange={(value) => setBusForm((prev) => ({ ...prev, capacity: Number(value || 0) }))} />
              <Field
                label="Route Stops"
                value={routeStopsInput}
                onChange={setRouteStopsInput}
                placeholder="One stop per line: Stop Name|07:35 or Stop Name|latitude|longitude|07:35"
                multiline
              />
              <button className="primary" onClick={() => void saveBus()}>Save Bus</button>
            </Panel>

            <Panel title={`Buses (${filteredBuses.length})`}>
              <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search buses..." />
              {filteredBuses.length ? filteredBuses.map((bus) => (
                <RecordLine
                  key={bus.id}
                  title={`${bus.label} | ${bus.id}`}
                  subtitle={`${bus.routeName} | ${bus.plateNumber}`}
                  meta={`Driver: ${bus.driverId || "Unassigned"}`}
                  onEdit={() => void editBus(bus)}
                  onDelete={() =>
                    showConfirm(
                      "Delete Bus",
                      `Delete bus "${bus.label}" and its live route data?`,
                      () => { void deleteBus(bus); closeConfirm(); }
                    )
                  }
                />
              )) : (
                <EmptyState
                  icon="🚌"
                  title="No buses found"
                  text={searchTerm ? "Try a different search term." : "Add your first bus using the form on the left."}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === "users" && (
          <div className="formAndRecords">
            <Panel title="Add User">
              <Field label="User ID" value={userForm.id} onChange={(value) => setUserForm((prev) => ({ ...prev, id: value }))} />
              {adminRole === "super-admin" && (
                <Field label="School ID" value={userForm.schoolId} onChange={(value) => setUserForm((prev) => ({ ...prev, schoolId: value }))} />
              )}
              <Field label="Full Name" value={userForm.fullName} onChange={(value) => setUserForm((prev) => ({ ...prev, fullName: value }))} />
              <Field label="Email" value={userForm.email} onChange={(value) => setUserForm((prev) => ({ ...prev, email: value }))} />
              <label className="field">
                <span>Role</span>
                <select
                  value={userForm.role}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value as UserRecord["role"] }))}
                >
                  <option value="parent">Parent</option>
                  <option value="driver">Driver</option>
                  <option value="school-admin">School Admin</option>
                  {adminRole === "super-admin" && <option value="super-admin">Super Admin</option>}
                </select>
              </label>
              <Field label="Phone" value={userForm.phone} onChange={(value) => setUserForm((prev) => ({ ...prev, phone: value }))} />
              <label className="field">
                <span>Assigned Bus</span>
                <select
                  value={userForm.busId ?? ""}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, busId: event.target.value }))}
                >
                  <option value="">Select bus</option>
                  {buses.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.label} ({bus.id})
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Student Name" value={userForm.studentName ?? ""} onChange={(value) => setUserForm((prev) => ({ ...prev, studentName: value }))} />
              <Field label="Stop Name" value={userForm.stopName ?? ""} onChange={(value) => setUserForm((prev) => ({ ...prev, stopName: value }))} />
              <button className="primary" onClick={() => void saveUser()}>Save User</button>
            </Panel>

            <Panel title={`Users (${filteredUsers.length})`}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search users..." />
                </div>
                <button className="secondary" onClick={() => downloadCSV(filteredUsers, "users_export.csv")}>Download CSV</button>
              </div>
              {filteredUsers.length ? filteredUsers.map((user) => (
                <RecordLine
                  key={user.id}
                  title={`${user.fullName} | ${user.role}`}
                  subtitle={user.email}
                  meta={`Bus: ${user.busId || "None"} | Student: ${user.studentName || "N/A"}`}
                  onEdit={() => editUser(user)}
                  onDelete={() =>
                    showConfirm(
                      "Delete User",
                      `Delete user "${user.fullName}" from Firebase data?`,
                      () => { void deleteUser(user); closeConfirm(); }
                    )
                  }
                />
              )) : (
                <EmptyState
                  icon="👥"
                  title="No users found"
                  text={searchTerm ? "Try a different search term." : "Add your first user using the form on the left."}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === "trips" && (
          <div className="singleCol">
            <Panel title={`Trip History (${filteredTrips.length})`}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search trips..." />
                </div>
                <button className="secondary" onClick={() => downloadCSV(filteredTrips, "trips_export.csv")}>Download CSV</button>
              </div>
              {filteredTrips.length ? filteredTrips.map((trip) => (
                <RecordLine
                  key={trip.id}
                  title={`${trip.busLabel || trip.busId} | ${trip.status}`}
                  subtitle={`${trip.driverName} | ${trip.routeName}`}
                  meta={`${trip.startedAt}${trip.endedAt ? ` → ${trip.endedAt}` : ""}`}
                />
              )) : (
                <EmptyState
                  icon="📋"
                  title="No trips found"
                  text={searchTerm ? "Try a different search term." : "Trips will appear here once drivers start publishing routes."}
                />
              )}
            </Panel>
          </div>
        )}
      </main>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} />

      {/* Confirm Modal */}
      {confirmState.open && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}

/* ─── Sidebar Tab ─── */
function SidebarTab({ icon, label, badge, active, onClick }: { icon: string; label: string; badge?: number; active: boolean; onClick: () => void }) {
  return (
    <button className={`sidebarTab ${active ? "sidebarTabActive" : ""}`} onClick={onClick}>
      <span className="sidebarTabIcon">{icon}</span>
      <span>{label}</span>
      {badge !== undefined && <span className="tabBadge">{badge}</span>}
    </button>
  );
}

/* ─── Summary Stat Card ─── */
function StatCard({ icon, label, value, colorClass }: { icon: string; label: string; value: number; colorClass: string }) {
  return (
    <div className="statCardEnhanced hover-lift animate-fade-in">
      <div className={`statIcon ${colorClass}`}>{icon}</div>
      <div className="statCardLabel">{label}</div>
      <div className="statCardValue">{value}</div>
    </div>
  );
}

/* ─── Toast Container ─── */
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toastContainer">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <span className="toastIcon">{toast.icon}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Confirm Modal ─── */
function ConfirmModal({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modalOverlay" onClick={onCancel}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalIcon">⚠️</div>
        <h3 className="modalTitle">{title}</h3>
        <p className="modalMessage">{message}</p>
        <div className="modalButtons">
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button className="primary dangerBtn" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Search Bar ─── */
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="searchWrap">
      <span className="searchIcon">🔍</span>
      <input
        className="searchInput"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="emptyStateWrap animate-fade-in">
      <div className="emptyStateIcon">{icon}</div>
      <div className="emptyStateTitle">{title}</div>
      <div className="emptyStateText">{text}</div>
    </div>
  );
}

/* ─── Existing Components (unchanged interface) ─── */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel animate-slide-in">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const isFloated = focused || !!value;
  
  // We handle simple input fields with floating labels
  if (!multiline && type !== "textarea") {
    return (
      <div className="floatingWrap">
        <span className="floatingLabel" style={{ 
          top: isFloated ? -10 : 16, 
          fontSize: isFloated ? 12 : 15,
          color: focused ? "var(--primary)" : "var(--muted)",
          backgroundColor: isFloated ? "var(--panel)" : "transparent",
          padding: isFloated ? "0 4px" : "0"
        }}>{label}</span>
        <div className="inputRow">
          <input
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ 
              width: "100%", 
              borderColor: focused ? "var(--primary)" : "var(--line)",
              padding: "16px 14px"
            }}
          />
          {value.length > 0 && <span className="validationIcon">✓</span>}
        </div>
      </div>
    );
  }

  // Fallback for textarea/multiline
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? label} />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="statCard">
      <div className="statLabel">{label}</div>
      <div className="statValue">{value}</div>
    </div>
  );
}

function HighlightCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="highlightCard">
      <div className="highlightDot" />
      <div>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
    </div>
  );
}

function RecordLine({
  title,
  subtitle,
  meta,
  onEdit,
  onDelete
}: {
  title: string;
  subtitle: string;
  meta: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="recordCard tableRow hover-lift">
      <div className="recordTitle">{title}</div>
      <div className="recordSubtitle">{subtitle}</div>
      <div className="recordMeta">{meta}</div>
      {onEdit || onDelete ? (
        <div className="recordActions">
          {onEdit ? <button className="ghost ghostSmall" onClick={onEdit}>✏️ Edit</button> : null}
          {onDelete ? <button className="ghost ghostSmall" onClick={onDelete}>🗑️ Delete</button> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Utility functions (ALL UNCHANGED) ─── */

function normalizeSchool(record: SchoolRecord): SchoolRecord {
  return {
    ...record,
    id: record.id.trim(),
    name: record.name.trim(),
    city: record.city.trim(),
    contactEmail: record.contactEmail.trim(),
    transportManager: record.transportManager.trim()
  };
}

function normalizeBus(record: BusRecord): BusRecord {
  return {
    ...record,
    id: record.id.trim(),
    schoolId: record.schoolId.trim(),
    label: record.label.trim(),
    plateNumber: record.plateNumber.trim(),
    driverId: record.driverId.trim(),
    routeName: record.routeName.trim()
  };
}

function normalizeUser(record: UserRecord): UserRecord {
  return {
    ...record,
    id: record.id.trim(),
    schoolId: record.schoolId.trim(),
    fullName: record.fullName.trim(),
    email: record.email.trim(),
    phone: record.phone.trim(),
    busId: record.busId?.trim() ?? "",
    studentName: record.studentName?.trim() ?? "",
    stopName: record.stopName?.trim() ?? ""
  };
}

function parseRouteStops(input: string, busId: string): RouteStop[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, latitude, longitude, scheduledTime] = line.split("|").map((part) => part.trim());
      return {
        id: `${busId}-stop-${index + 1}`,
        name: name || `Stop ${index + 1}`,
        latitude: Number(latitude || 28.6139),
        longitude: Number(longitude || 77.209),
        order: index + 1,
        scheduledTime: scheduledTime || ""
      };
    });
}

async function geocodeRouteStops(
  input: string,
  busId: string,
  school: SchoolRecord | null
): Promise<RouteStop[]> {
  const rows = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const routeStops: RouteStop[] = [];

  for (const [index, line] of rows.entries()) {
    const parts = line.split("|").map((part) => part.trim());
    const name = parts[0] || `Stop ${index + 1}`;

    let latitude: number | null = null;
    let longitude: number | null = null;
    let scheduledTime = "";

    if (parts.length >= 4 && isNumeric(parts[1]) && isNumeric(parts[2])) {
      latitude = Number(parts[1]);
      longitude = Number(parts[2]);
      scheduledTime = parts[3] || "";
    } else if (parts.length >= 2) {
      scheduledTime = parts[1] || "";
    }

    if (latitude === null || longitude === null) {
      const resolvedLocation = await geocodeStopByName(name, school);
      latitude = resolvedLocation?.latitude ?? 28.6139;
      longitude = resolvedLocation?.longitude ?? 77.209;
    }

    routeStops.push({
      id: `${busId}-stop-${index + 1}`,
      name,
      latitude,
      longitude,
      order: index + 1,
      scheduledTime
    });
  }

  return routeStops;
}

function formatRouteStops(routeStops: RouteStop[]) {
  return routeStops
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((stop) => `${stop.name}|${stop.latitude}|${stop.longitude}|${stop.scheduledTime}`)
    .join("\n");
}

async function geocodeStopByName(name: string, school: SchoolRecord | null) {
  const query = [name, school?.name, school?.city].filter(Boolean).join(", ");

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    const results = (await response.json()) as Array<{ lat: string; lon: string }>;
    const first = results[0];
    if (!first) {
      return null;
    }

    return {
      latitude: Number(first.lat),
      longitude: Number(first.lon)
    };
  } catch {
    return null;
  }
}

function isNumeric(value: string) {
  return value !== "" && !Number.isNaN(Number(value));
}

async function syncBusStudents(db: ReturnType<typeof getFirebaseDb>, userRecord: UserRecord) {
  const busRecord = await getBusById(db, userRecord.busId ?? "");
  if (!busRecord) {
    return;
  }

  const assignedParents = await getParentUsersByBusId(db, busRecord.id);
  const students = createStudentAssignmentsFromUsers(assignedParents);

  await setDoc(
    getBusDocumentRef(db, busRecord.schoolId, busRecord.id),
    {
      schoolId: busRecord.schoolId,
      busId: busRecord.id,
      busLabel: busRecord.label,
      routeName: busRecord.routeName,
      driverId: busRecord.driverId,
      students: students as StudentAssignment[],
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
