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

import DashboardOverviewTab from "./components/DashboardOverviewTab";
import SchoolsTab from "./components/SchoolsTab";
import BusesTab from "./components/BusesTab";
import UsersTab from "./components/UsersTab";
import TripsTab from "./components/TripsTab";
import DriversTab from "./components/DriversTab";
import StudentsTab from "./components/StudentsTab";
import RoutesTab from "./components/RoutesTab";
import SubscriptionPlansTab from "./components/SubscriptionPlansTab";
import SubscriptionsTab from "./components/SubscriptionsTab";
import NotificationsTab from "./components/NotificationsTab";
import AlertSettingsTab from "./components/AlertSettingsTab";
import ReportsTab from "./components/ReportsTab";

import { LayoutDashboard, School, Users, Bus, Navigation, UserCheck, GraduationCap, Route, CreditCard, Receipt, BellRing, Settings, BarChart3, Sun, Moon, LogOut, Menu, X } from "lucide-react";
import BusRouteAnimation from "./components/BusRouteAnimation";

type AdminScreen = "login" | "register" | "dashboard";
type AdminTab = "dashboard" | "schools" | "buses" | "users" | "drivers" | "students" | "routes" | "trips" | "subscription-plans" | "subscriptions" | "notifications" | "alert-settings" | "reports";

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
  confirmLabel?: string;
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
  const [schoolPassword, setSchoolPassword] = useState("");
  const [busForm, setBusForm] = useState<BusRecord>(emptyBus);
  const [routeStops, setRouteStops] = useState<Partial<RouteStop>[]>([]);
  const [userForm, setUserForm] = useState<UserRecord>(emptyUser);
  const [userPassword, setUserPassword] = useState("");

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
  const [isLoading, setIsLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadSession();
    loadCachedData();
    const savedTheme = localStorage.getItem("admin-theme") ?? "dark";
    setDarkMode(savedTheme === "dark");
    document.documentElement.setAttribute("data-theme", savedTheme);
    // Small delay to prevent flash
    setTimeout(() => setIsLoading(false), 400);
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

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel = "Delete") => {
    setConfirmState({ open: true, title, message, onConfirm, confirmLabel });
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
    setSchoolPassword("");
    persistData({ ...getFullData(), schools: nextSchools });

    if (!db) {
      setStatus("School saved locally only.");
      addToast("School saved locally.", "💾");
      return;
    }

    const adminUserId = nextRecord.contactEmail.trim().toLowerCase();
    const adminUser: UserRecord = {
      id: adminUserId,
      schoolId: nextRecord.id,
      fullName: nextRecord.transportManager.trim() || `${nextRecord.name} Admin`,
      email: adminUserId,
      role: "school-admin",
      phone: "",
      busId: "",
      studentName: "",
      stopName: ""
    };

    if (schoolPassword) {
      try {
        await signUpUser(adminUser.email, schoolPassword);
        addToast("School admin login created.", "🔐");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create school admin auth account.";
        if (message.includes("already registered") || message.includes("email-already-in-use")) {
          addToast("School admin auth account already exists.", "ℹ️");
        } else {
          setStatus(message);
          addToast(message, "❌");
        }
      }
    }

    await setDoc(doc(db, "schools", nextRecord.id), {
      ...nextRecord,
      updatedAt: serverTimestamp()
    });

    const nextUsers = [adminUser, ...users.filter((item) => item.id !== adminUser.id)];
    setUsers(nextUsers);
    persistData({ ...getFullData(), users: nextUsers });
    await setDoc(doc(db, "users", adminUser.id), {
      ...adminUser,
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
    setStatus("Resolving route coordinates and saving bus...");
    addToast("Finalizing route mapping...", "⏳");
    const geocodedStops = await geocodeRouteStops(
      routeStops,
      nextRecord.id,
      schools.find((school) => school.id === nextRecord.schoolId) ?? null
    );
    const nextBuses = [nextRecord, ...buses.filter((item) => item.id !== nextRecord.id)];
    setBuses(nextBuses);
    setBusForm(emptyBus);
    setRouteStops([]);
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
        routeStops: geocodedStops,
        currentStopId: geocodedStops[0]?.id ?? "",
        currentStopName: geocodedStops[0]?.name ?? "",
        nextStopId: geocodedStops[1]?.id ?? geocodedStops[0]?.id ?? "",
        nextStopName: geocodedStops[1]?.name ?? geocodedStops[0]?.name ?? "",
        latitude: geocodedStops[0]?.latitude ?? 28.6139,
        longitude: geocodedStops[0]?.longitude ?? 77.209,
        speed: 0,
        heading: 0,
        accuracy: null,
        students: [],
        tripActive: false,
        driverName: "",
        lastEvent: geocodedStops.length ? `Route loaded with ${geocodedStops.length} stops` : "Bus created",
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    setStatus("Bus and route saved to Firestore.");
    addToast(`Bus "${nextRecord.label}" saved with ${geocodedStops.length} stops.`, "🚌");
  };

  const saveUser = async () => {
    const nextRecord = normalizeUser(userForm);
    if (!nextRecord.id) {
      nextRecord.id = nextRecord.email.trim().toLowerCase() || crypto.randomUUID();
    }
    if (adminRole === "school-admin") {
      nextRecord.schoolId = adminSchoolId;
    }
    const nextUsers = [nextRecord, ...users.filter((item) => item.id !== nextRecord.id)];
    setUsers(nextUsers);
    setUserForm(emptyUser);
    setUserPassword("");
    persistData({ ...getFullData(), users: nextUsers });

    if (!db) {
      setStatus("User saved locally only.");
      addToast("User saved locally.", "💾");
      return;
    }

    if (userPassword) {
      try {
        await signUpUser(nextRecord.email, userPassword);
        addToast("Authentication account created.", "🔐");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create auth account.";
        if (message.includes("already registered")) {
          addToast("Authentication account already exists for that email.", "ℹ️");
        } else {
          setStatus(message);
          addToast(message, "❌");
          return;
        }
      }
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
    setSchoolPassword("");
    setActiveTab("schools");
  };

  const editBus = async (record: BusRecord) => {
    setBusForm(record);
    setActiveTab("buses");
    if (!db) {
      setRouteStops([]);
      return;
    }

    const liveBus = await getBusLiveLocation(db, record.schoolId, record.id);
    setRouteStops(liveBus?.routeStops ?? []);
  };

  const editUser = (record: UserRecord) => {
    setUserForm(record);
    setUserPassword("");
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
    
    // Aggregate ALL possible keys across all rows to prevent column shifting
    const headerSet = new Set<string>();
    data.forEach(row => Object.keys(row).forEach(key => headerSet.add(key)));
    const headersArray = Array.from(headerSet);
    
    const headers = headersArray.join(",");
    const rows = data.map(row => 
      headersArray.map(key => {
        let value = row[key] ?? "";
        // Safely parse Firestore Timestamps into readable dates
        if (typeof value === "object" && value !== null && "seconds" in value) {
            value = new Date(value.seconds * 1000).toLocaleString();
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(",")
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

  /* ─── Global Loading Screen ─── */
  if (isLoading) {
    return (
      <div className="loadingScreen">
        <div className="loadingSpinner" />
        <span className="loadingLabel">Loading SkoolPath...</span>
      </div>
    );
  }

  /* ─── Auth Screen (Split Glassmorphism UI) ─── */
  if (screen !== "dashboard") {
    return (
      <main className="splitAuthLayout">
      <section className="splitAuthMedia">
          <div className="glowingOrb1"></div>
          <div className="glowingOrb2"></div>
          

          
          {/* Floating Logo */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
            <img className="loginLogoAnim" src="/logo.png" alt="SkoolPath Logo" style={{ width: '80%', height: '80%', objectFit: 'contain', opacity: 1 }} />
          </div>

          {/* Logo background decoration */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.15, pointerEvents: "none", zIndex: 1 }}>
            <img src="/logo.png" alt="Decoration" style={{ width: "110%", height: "110%", objectFit: "contain", filter: "blur(60px)" }} />
          </div>

          <div className="loginBusTrack">
            <div className="animatedBus">🚌</div>
          </div>
        </section>

        <section className="splitAuthForm">
          <div className="authCardInner">
            <div style={{ marginBottom: 40, textAlign: "left" }}>
              <div className="sidebarBrandIcon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 72, height: 48, marginBottom: 16, padding: "0 12px" }}>
                <img src="/logo.png" alt="logo" style={{ height: 32, objectFit: 'contain' }} />
              </div>
              <h2 style={{ color: "var(--text-heading)", margin: "0 0 8px" }}>
                {screen === "login" ? "Login" : "Register Admin"}
              </h2>
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                {screen === "login" ? "Sign in to access your dashboard." : "Create an administrator account."}
              </p>
            </div>
            
            <div className="fieldGroup" style={{ marginBottom: 20 }}>
              <label className="fieldLabel">Email Address</label>
              <input className="fieldInput" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@skoolpath.com" />
            </div>
            <div className="fieldGroup" style={{ marginBottom: 32 }}>
              <label className="fieldLabel">Password</label>
              <input className="fieldInput" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <button className="btnPrimary" style={{ width: "100%", height: 48, fontSize: 16 }} onClick={() => void (screen === "login" ? handleLogin() : handleRegister())}>
                {screen === "login" ? "Login" : "Register"}
              </button>
              <button className="btnOutline" style={{ width: "100%", height: 48, border: 'none' }} onClick={() => setScreen(screen === "login" ? "register" : "login")}>
                {screen === "login" ? "Create an account" : "Back to login"}
              </button>
            </div>
            <p className="status" style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "var(--primary-light)" }}>{status}</p>
          </div>
        </section>

        <ToastContainer toasts={toasts} />
      </main>
    );
  }

  /* ─── Dashboard Screen ─── */
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
          <p>Admin Dashboard</p>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => {
            setActiveTab("dashboard");
            setMobileMenuOpen(false);
          }}>
            <span><LayoutDashboard size={18} /></span>
            <span>Dashboard</span>
          </button>
          
          <div className="sidebarSectionLabel">MANAGEMENT</div>
          <button className={`nav-item ${activeTab === "schools" ? "active" : ""}`} onClick={() => {
            setActiveTab("schools");
            setSearchTerm("");
            setMobileMenuOpen(false);
          }}>
            <span><School size={18} /></span>
            <span>Schools</span>
            <span className="tabBadge">{schools.length}</span>
          </button>
          <button className={`nav-item ${activeTab === "users" ? "active" : ""}`} onClick={() => {
            setActiveTab("users");
            setSearchTerm("");
            setMobileMenuOpen(false);
          }}>
            <span><Users size={18} /></span>
            <span>Users</span>
            <span className="tabBadge">{users.length}</span>
          </button>
          <button className={`nav-item ${activeTab === "buses" ? "active" : ""}`} onClick={() => {
            setActiveTab("buses");
            setSearchTerm("");
            setMobileMenuOpen(false);
          }}>
            <span><Bus size={18} /></span>
            <span>Buses</span>
            <span className="tabBadge">{buses.length}</span>
          </button>
          <button className={`nav-item ${activeTab === "drivers" ? "active" : ""}`} onClick={() => {
            setActiveTab("drivers");
            setSearchTerm("");
            setMobileMenuOpen(false);
          }}>
            <span><UserCheck size={18} /></span>
            <span>Drivers</span>
          </button>
          <button className={`nav-item ${activeTab === "students" ? "active" : ""}`} onClick={() => {
            setActiveTab("students");
            setSearchTerm("");
            setMobileMenuOpen(false);
          }}>
            <span><GraduationCap size={18} /></span>
            <span>Students</span>
          </button>
          <button className={`nav-item ${activeTab === "routes" ? "active" : ""}`} onClick={() => {
            setActiveTab("routes");
            setSearchTerm("");
            setMobileMenuOpen(false);
          }}>
            <span><Route size={18} /></span>
            <span>Routes</span>
          </button>
          <button className={`nav-item ${activeTab === "trips" ? "active" : ""}`} onClick={() => {
            setActiveTab("trips");
            setSearchTerm("");
            setMobileMenuOpen(false);
          }}>
            <span><Navigation size={18} /></span>
            <span>Trips</span>
            <span className="tabBadge">{activeTripsCount}</span>
          </button>

          <div className="sidebarSectionLabel">BILLING & SUBSCRIPTIONS</div>
          <button className={`nav-item ${activeTab === "subscription-plans" ? "active" : ""}`} onClick={() => {
            setActiveTab("subscription-plans");
            setMobileMenuOpen(false);
          }}>
            <span><CreditCard size={18} /></span>
            <span>Plans</span>
          </button>
          <button className={`nav-item ${activeTab === "subscriptions" ? "active" : ""}`} onClick={() => {
            setActiveTab("subscriptions");
            setMobileMenuOpen(false);
          }}>
            <span><Receipt size={18} /></span>
            <span>Subscriptions</span>
          </button>

          <div className="sidebarSectionLabel">TOOLS & SETTINGS</div>
          <button className={`nav-item ${activeTab === "notifications" ? "active" : ""}`} onClick={() => {
            setActiveTab("notifications");
            setMobileMenuOpen(false);
          }}>
            <span><BellRing size={18} /></span>
            <span>Notifications</span>
          </button>
          <button className={`nav-item ${activeTab === "alert-settings" ? "active" : ""}`} onClick={() => {
            setActiveTab("alert-settings");
            setMobileMenuOpen(false);
          }}>
            <span><Settings size={18} /></span>
            <span>Alert Settings</span>
          </button>
          <button className={`nav-item ${activeTab === "reports" ? "active" : ""}`} onClick={() => {
            setActiveTab("reports");
            setMobileMenuOpen(false);
          }}>
            <span><BarChart3 size={18} /></span>
            <span>Reports</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle-btn" onClick={toggleDarkMode}>
            <span>{darkMode ? <Sun size={18}/> : <Moon size={18}/>}</span>
            <span>{darkMode ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <button className="logout-btn" onClick={() => void handleLogout()}>
            <span><LogOut size={18} /></span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* SOS Alert Banner */}
        {activeSOS.length > 0 && (
          <div className="sosBanner animFadeIn">
            <h3>🚨 ACTIVE EMERGENCY SOS</h3>
            <p>
              {activeSOS.length} parent(s) have triggered an SOS alert. Please coordinate with the bus driver or authorities.
            </p>
            {activeSOS.map(alert => (
              <div key={alert.id} className="sosItem">
                <div>
                  <strong>{alert.parentName}</strong> {alert.studentName ? `(Child: ${alert.studentName})` : ""}
                  <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>
                    Bus ID: {alert.busId || "Unknown"} | Time: {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <button className="btnSuccess" onClick={() => resolveSOS(alert.id)}>Mark Resolved</button>
              </div>
            ))}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === "dashboard" && <DashboardOverviewTab schools={schools} buses={buses} users={users} trips={trips} activeSOS={activeSOS} setActiveTab={setActiveTab} setSchoolForm={setSchoolForm} setUserForm={setUserForm} />}
        {activeTab === "schools" && <SchoolsTab schools={schools} searchTerm={searchTerm} setSearchTerm={setSearchTerm} adminRole={adminRole} schoolForm={schoolForm} schoolPassword={schoolPassword} setSchoolPassword={setSchoolPassword} setSchoolForm={setSchoolForm} saveSchool={saveSchool} editSchool={editSchool} showConfirm={showConfirm} deleteSchool={deleteSchool} />}
        {activeTab === "buses" && <BusesTab buses={buses} users={users} searchTerm={searchTerm} setSearchTerm={setSearchTerm} adminRole={adminRole} busForm={busForm} setBusForm={setBusForm} saveBus={saveBus} editBus={editBus} showConfirm={showConfirm} deleteBus={deleteBus} routeStops={routeStops} setRouteStops={setRouteStops} />}
        {activeTab === "users" && <UsersTab users={users} searchTerm={searchTerm} setSearchTerm={setSearchTerm} adminRole={adminRole} userForm={userForm} setUserForm={setUserForm} userPassword={userPassword} setUserPassword={setUserPassword} saveUser={saveUser} editUser={editUser} showConfirm={showConfirm} deleteUser={deleteUser} />}
        {activeTab === "trips" && <TripsTab trips={trips} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />}
        {activeTab === "drivers" && <DriversTab users={users.filter(u => u.role === "driver")} adminRole={adminRole} userForm={userForm} setUserForm={setUserForm} userPassword={userPassword} setUserPassword={setUserPassword} saveUser={saveUser} editUser={editUser} deleteUser={deleteUser} showConfirm={showConfirm} />}
        {activeTab === "students" && <StudentsTab users={users.filter(u => u.role === "parent")} editUser={editUser} />}
        {activeTab === "routes" && <RoutesTab buses={buses} />}
        {activeTab === "subscription-plans" && <SubscriptionPlansTab />}
        {activeTab === "subscriptions" && <SubscriptionsTab schools={schools} />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "alert-settings" && <AlertSettingsTab adminSchoolId={adminSchoolId} />}
        {activeTab === "reports" && <ReportsTab trips={trips} />}
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
          confirmLabel={confirmState.confirmLabel}
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
function ConfirmModal({ title, message, onConfirm, onCancel, confirmLabel = "Delete" }: { 
  title: string; message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string 
}) {
  return (
    <div className="modalOverlay" onClick={onCancel}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalIcon">🛑</div>
          <div>
            <h3 className="modalTitle">{title}</h3>
            <p className="modalMessage">{message || "This action is permanent and cannot be undone."}</p>
          </div>
        </div>
        <div className="modalButtons">
          <button className="btnGhost" onClick={onCancel}>Cancel</button>
          <button className="btnDanger" onClick={() => {
            onConfirm();
            onCancel();
          }}>{confirmLabel}</button>
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
  stops: Partial<RouteStop>[],
  busId: string,
  school: SchoolRecord | null
): Promise<RouteStop[]> {
  const finalStops: RouteStop[] = [];

  for (const [index, stop] of stops.entries()) {
    let { name, latitude, longitude, scheduledTime } = stop;
    
    // Default name if missing
    if (!name) name = `Stop ${index + 1}`;

    // Geocode if lat/lng are missing
    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      const resolvedLocation = await geocodeStopByName(name, school);
      latitude = resolvedLocation?.latitude ?? 28.6139;
      longitude = resolvedLocation?.longitude ?? 77.209;
    }

    finalStops.push({
      id: `${busId}-stop-${index + 1}`,
      name,
      latitude,
      longitude,
      order: index + 1,
      scheduledTime: scheduledTime || ""
    });
  }

  return finalStops;
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
