import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  type BusRecord,
  type RouteStop,
  type SchoolRecord,
  type StudentAssignment,
  type UserRecord,
  createStudentAssignmentsFromUsers,
  demoBuses,
  demoSchools,
  demoUsers,
  getBusById,
  getBusesCollection,
  getBusDocumentRef,
  getFirebaseDb,
  getParentUsersByBusId,
  getSchoolsCollection,
  getUsersCollection,
  hasFirebaseConfig,
  signInUser,
  signOutUser,
  signUpUser
} from "@skoolpath/shared";

type AdminScreen = "login" | "register" | "dashboard";

type AdminSession = {
  screen: AdminScreen;
  email: string;
};

const sessionKey = "admin-session";
const dataKey = "admin-dashboard-data";

type AdminDataCache = {
  schools: SchoolRecord[];
  buses: BusRecord[];
  users: UserRecord[];
};

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

const emptyRouteStopsInput = "";

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

export default function App() {
  const firebaseReady = hasFirebaseConfig();
  const db = useMemo(() => (firebaseReady ? getFirebaseDb() : null), [firebaseReady]);
  const [screen, setScreen] = useState<AdminScreen>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schools, setSchools] = useState<SchoolRecord[]>(demoSchools);
  const [buses, setBuses] = useState<BusRecord[]>(demoBuses);
  const [users, setUsers] = useState<UserRecord[]>(demoUsers);
  const [schoolForm, setSchoolForm] = useState<SchoolRecord>(emptySchool);
  const [busForm, setBusForm] = useState<BusRecord>(emptyBus);
  const [routeStopsInput, setRouteStopsInput] = useState(emptyRouteStopsInput);
  const [userForm, setUserForm] = useState<UserRecord>(emptyUser);
  const [status, setStatus] = useState(
    firebaseReady ? "Sign in to manage live transport data." : "Demo mode active. Add Firebase keys to unlock cloud data."
  );

  useEffect(() => {
    void loadSession();
    void loadCachedData();
  }, []);

  useEffect(() => {
    void loadFromFirebase();
  }, [db, screen]);

  const loadSession = async () => {
    const saved = await AsyncStorage.getItem(sessionKey);
    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved) as AdminSession;
    setScreen(parsed.screen);
    setEmail(parsed.email);
    setStatus("Session restored.");
  };

  const loadCachedData = async () => {
    const saved = await readStoredValue(dataKey);
    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved) as AdminDataCache;
    setSchools(parsed.schools ?? []);
    setBuses(parsed.buses ?? []);
    setUsers(parsed.users ?? []);
  };

  const persistSession = async (nextScreen: AdminScreen) => {
    const payload: AdminSession = {
      screen: nextScreen,
      email
    };
    await writeStoredValue(sessionKey, JSON.stringify(payload));
  };

  const persistData = async (nextData: AdminDataCache) => {
    await writeStoredValue(dataKey, JSON.stringify(nextData));
  };

  const loadFromFirebase = async () => {
    if (!db || screen !== "dashboard") {
      return;
    }

    const [schoolDocs, busDocs, userDocs] = await Promise.all([
      getDocs(getSchoolsCollection(db)),
      getDocs(getBusesCollection(db)),
      getDocs(getUsersCollection(db))
    ]);

    const nextSchools = schoolDocs.docs.map((item) => item.data());
    const nextBuses = busDocs.docs.map((item) => item.data());
    const nextUsers = userDocs.docs.map((item) => item.data());

    if (!nextSchools.length && !nextBuses.length && !nextUsers.length) {
      setStatus("No cloud records yet. Showing locally stored admin data if available.");
      return;
    }

    setSchools(nextSchools);
    setBuses(nextBuses);
    setUsers(nextUsers);
    await persistData({
      schools: nextSchools,
      buses: nextBuses,
      users: nextUsers
    });

    setStatus("Loaded latest data from Firestore.");
  };

  const handleLogin = async () => {
    try {
      if (firebaseReady) {
        await signInUser(email, password);
      }
      setScreen("dashboard");
      await persistSession("dashboard");
    setStatus(firebaseReady ? "Admin signed in with Firebase." : "Admin demo mode unlocked.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication failed.");
    }
  };

  const handleRegister = async () => {
    try {
      if (firebaseReady) {
        await signUpUser(email, password);
      }
      setScreen("dashboard");
      await persistSession("dashboard");
      setStatus(firebaseReady ? "Admin account created and signed in." : "Admin demo registration complete.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication failed.");
    }
  };

  const handleSignOut = async () => {
    if (firebaseReady) {
      await signOutUser();
    }
    await removeStoredValue(sessionKey);
    setScreen("login");
    setStatus("Signed out.");
  };

  if (screen === "login") {
    return (
      <AuthLayout
        title="Admin Login"
        subtitle="Sign in to manage schools, buses, users, and the live transport network."
        switchLabel="Need an admin account?"
        switchActionLabel="Register"
        onSwitch={() => setScreen("register")}
        statusMessage={status}
      >
        <LabeledInput label="Admin Email" placeholder="Enter your email" value={email} onChangeText={setEmail} />
        <LabeledInput label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title="Login" onPress={() => void handleLogin()} />
      </AuthLayout>
    );
  }

  if (screen === "register") {
    return (
      <AuthLayout
        title="Admin Register"
        subtitle="Create your admin account before configuring schools, routes, buses, and users."
        switchLabel="Already have an account?"
        switchActionLabel="Login"
        onSwitch={() => setScreen("login")}
        statusMessage={status}
      >
        <LabeledInput label="Admin Email" placeholder="Enter your email" value={email} onChangeText={setEmail} />
        <LabeledInput label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title="Register" onPress={() => void handleRegister()} />
      </AuthLayout>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <HeroCard
          kicker="Transport Admin"
          title="Run your bus operation from one dashboard."
          subtitle="Add schools, assign buses, register users, and prepare live tracking for real-world rollout."
          metrics={[
            { label: "Schools", value: String(schools.length) },
            { label: "Buses", value: String(buses.length) },
            { label: "Users", value: String(users.length) }
          ]}
        />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Admin Actions</Text>
          <View style={styles.buttonRow}>
            <Button title="Reload Data" onPress={() => void loadFromFirebase()} />
            <Button title="Logout" color="#1d4ed8" onPress={() => void handleSignOut()} />
          </View>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <View style={styles.grid}>
          <SectionCard title="Add School">
            <LabeledInput label="School ID" value={schoolForm.id} onChangeText={(value) => setSchoolForm((previous) => ({ ...previous, id: value }))} />
            <LabeledInput label="School Name" value={schoolForm.name} onChangeText={(value) => setSchoolForm((previous) => ({ ...previous, name: value }))} />
            <LabeledInput label="City" value={schoolForm.city} onChangeText={(value) => setSchoolForm((previous) => ({ ...previous, city: value }))} />
            <LabeledInput label="Contact Email" value={schoolForm.contactEmail} onChangeText={(value) => setSchoolForm((previous) => ({ ...previous, contactEmail: value }))} />
            <LabeledInput label="Transport Manager" value={schoolForm.transportManager} onChangeText={(value) => setSchoolForm((previous) => ({ ...previous, transportManager: value }))} />
            <Button
              title="Save School"
              onPress={() =>
                void saveSchoolRecord({
                  db,
                  record: schoolForm,
                  setRecords: setSchools,
                  setForm: setSchoolForm,
                  setStatus,
                  getData: () => ({ schools, buses, users }),
                  persistData
                })
              }
            />
          </SectionCard>

          <SectionCard title="Add Bus">
            <LabeledInput label="Bus ID" value={busForm.id} onChangeText={(value) => setBusForm((previous) => ({ ...previous, id: value }))} />
            <LabeledInput label="School ID" value={busForm.schoolId} onChangeText={(value) => setBusForm((previous) => ({ ...previous, schoolId: value }))} />
            <LabeledInput label="Bus Label" value={busForm.label} onChangeText={(value) => setBusForm((previous) => ({ ...previous, label: value }))} />
            <LabeledInput label="Plate Number" value={busForm.plateNumber} onChangeText={(value) => setBusForm((previous) => ({ ...previous, plateNumber: value }))} />
            <LabeledInput label="Driver ID" value={busForm.driverId} onChangeText={(value) => setBusForm((previous) => ({ ...previous, driverId: value }))} />
            <LabeledInput label="Route Name" value={busForm.routeName} onChangeText={(value) => setBusForm((previous) => ({ ...previous, routeName: value }))} />
            <LabeledInput label="Capacity" value={String(busForm.capacity)} onChangeText={(value) => setBusForm((previous) => ({ ...previous, capacity: Number(value || 0) }))} />
            <LabeledInput
              label="Route Stops"
              placeholder={"One stop per line: Stop Name|latitude|longitude|HH:MM"}
              value={routeStopsInput}
              onChangeText={setRouteStopsInput}
              multiline
            />
            <Button
              title="Save Bus"
              onPress={() =>
                void saveBusRecord({
                  db,
                  record: busForm,
                  routeStopsInput,
                  setRecords: setBuses,
                  setForm: setBusForm,
                  setRouteStopsInput,
                  setStatus,
                  getData: () => ({ schools, buses, users }),
                  persistData
                })
              }
            />
          </SectionCard>

          <SectionCard title="Add User">
            <LabeledInput label="User ID" value={userForm.id} onChangeText={(value) => setUserForm((previous) => ({ ...previous, id: value }))} />
            <LabeledInput label="School ID" value={userForm.schoolId} onChangeText={(value) => setUserForm((previous) => ({ ...previous, schoolId: value }))} />
            <LabeledInput label="Full Name" value={userForm.fullName} onChangeText={(value) => setUserForm((previous) => ({ ...previous, fullName: value }))} />
            <LabeledInput label="Email" value={userForm.email} onChangeText={(value) => setUserForm((previous) => ({ ...previous, email: value }))} />
            <LabeledInput label="Role" value={userForm.role} onChangeText={(value) => setUserForm((previous) => ({ ...previous, role: value as UserRecord["role"] }))} />
            <LabeledInput label="Phone" value={userForm.phone} onChangeText={(value) => setUserForm((previous) => ({ ...previous, phone: value }))} />
            <LabeledInput label="Assigned Bus ID" value={userForm.busId ?? ""} onChangeText={(value) => setUserForm((previous) => ({ ...previous, busId: value }))} />
            <LabeledInput label="Student Name" value={userForm.studentName ?? ""} onChangeText={(value) => setUserForm((previous) => ({ ...previous, studentName: value }))} />
            <LabeledInput label="Stop Name" value={userForm.stopName ?? ""} onChangeText={(value) => setUserForm((previous) => ({ ...previous, stopName: value }))} />
            <Button
              title="Save User"
              onPress={() =>
                void saveUserRecord({
                  db,
                  record: userForm,
                  setRecords: setUsers,
                  setForm: setUserForm,
                  setStatus,
                  getData: () => ({ schools, buses, users }),
                  persistData
                })
              }
            />
          </SectionCard>
        </View>

        <Overview title="Schools" records={schools.map((school) => `${school.name} | ${school.city} | ${school.transportManager}`)} />
        <Overview title="Buses" records={buses.map((bus) => `${bus.label} | ${bus.routeName} | ${bus.plateNumber}`)} />
        <Overview title="Users" records={users.map((user) => `${user.fullName} | ${user.role} | ${user.email}`)} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthLayout({
  title,
  subtitle,
  switchLabel,
  switchActionLabel,
  onSwitch,
  statusMessage,
  children
}: {
  title: string;
  subtitle: string;
  switchLabel: string;
  switchActionLabel: string;
  onSwitch: () => void;
  statusMessage: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.authShell}>
        <HeroCard kicker="SkoolPath" title={title} subtitle={subtitle} metrics={[]} />
        <View style={styles.authCard}>
          {children}
          <Text style={styles.statusText}>{statusMessage}</Text>
          <Text style={styles.switchLine}>
            {switchLabel} <Text style={styles.switchAction} onPress={onSwitch}>{switchActionLabel}</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function HeroCard({
  kicker,
  title,
  subtitle,
  metrics
}: {
  kicker: string;
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <View style={styles.heroCard}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {metrics.length ? (
        <View style={styles.metricRow}>
          {metrics.map((metric) => (
            <Metric key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LabeledInput({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  multiline
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.inputMultiline : null]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder ?? label}
        placeholderTextColor="#64748b"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Overview({ title, records }: { title: string; records: string[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {records.map((item) => (
        <Text key={item} style={styles.record}>
          {item}
        </Text>
      ))}
    </View>
  );
}

async function saveSchoolRecord({
  db,
  record,
  setRecords,
  setForm,
  setStatus,
  getData,
  persistData
}: {
  db: ReturnType<typeof getFirebaseDb> | null;
  record: SchoolRecord;
  setRecords: React.Dispatch<React.SetStateAction<SchoolRecord[]>>;
  setForm: React.Dispatch<React.SetStateAction<SchoolRecord>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  getData: () => AdminDataCache;
  persistData: (data: AdminDataCache) => Promise<void>;
}) {
  const nextRecord = normalizeSchool(record);
  const nextSchools = [nextRecord, ...getData().schools.filter((item) => item.id !== nextRecord.id)];
  setRecords(nextSchools);
  setForm(emptySchool);
  await persistData({
    ...getData(),
    schools: nextSchools
  });

  if (!db) {
    setStatus("School saved in demo mode.");
    return;
  }

  try {
    await setDoc(doc(db, "schools", nextRecord.id), {
      ...nextRecord,
      updatedAt: serverTimestamp()
    });
    setStatus("School saved to Firestore.");
  } catch (error) {
    setStatus(
      `School saved locally only. Firebase sync failed: ${
        error instanceof Error ? error.message : "Unknown Firestore error."
      }`
    );
  }
}

async function saveBusRecord({
  db,
  record,
  routeStopsInput,
  setRecords,
  setForm,
  setRouteStopsInput,
  setStatus,
  getData,
  persistData
}: {
  db: ReturnType<typeof getFirebaseDb> | null;
  record: BusRecord;
  routeStopsInput: string;
  setRecords: React.Dispatch<React.SetStateAction<BusRecord[]>>;
  setForm: React.Dispatch<React.SetStateAction<BusRecord>>;
  setRouteStopsInput: React.Dispatch<React.SetStateAction<string>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  getData: () => AdminDataCache;
  persistData: (data: AdminDataCache) => Promise<void>;
}) {
  const nextRecord = normalizeBus(record);
  const routeStops = parseRouteStops(routeStopsInput, nextRecord.id);
  const nextBuses = [nextRecord, ...getData().buses.filter((item) => item.id !== nextRecord.id)];
  setRecords(nextBuses);
  setForm(emptyBus);
  setRouteStopsInput(emptyRouteStopsInput);
  await persistData({
    ...getData(),
    buses: nextBuses
  });

  if (!db) {
    setStatus("Bus saved in demo mode.");
    return;
  }

  try {
    await setDoc(doc(db, "buses", nextRecord.id), {
      ...nextRecord,
      updatedAt: serverTimestamp()
    });

    await setDoc(
      getBusDocumentRef(db, nextRecord.schoolId, nextRecord.id),
      {
        busId: nextRecord.id,
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
        lastEvent: routeStops.length ? `Route loaded with ${routeStops.length} stops` : "Bus created",
        tripActive: false,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    setStatus("Bus saved to Firestore.");
  } catch (error) {
    setStatus(
      `Bus saved locally only. Firebase sync failed: ${
        error instanceof Error ? error.message : "Unknown Firestore error."
      }`
    );
  }
}

async function saveUserRecord({
  db,
  record,
  setRecords,
  setForm,
  setStatus,
  getData,
  persistData
}: {
  db: ReturnType<typeof getFirebaseDb> | null;
  record: UserRecord;
  setRecords: React.Dispatch<React.SetStateAction<UserRecord[]>>;
  setForm: React.Dispatch<React.SetStateAction<UserRecord>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  getData: () => AdminDataCache;
  persistData: (data: AdminDataCache) => Promise<void>;
}) {
  const nextRecord = normalizeUser(record);
  const nextUsers = [nextRecord, ...getData().users.filter((item) => item.id !== nextRecord.id)];
  setRecords(nextUsers);
  setForm(emptyUser);
  await persistData({
    ...getData(),
    users: nextUsers
  });

  if (!db) {
    setStatus("User saved in demo mode.");
    return;
  }

  try {
    await setDoc(doc(db, "users", nextRecord.id), {
      ...nextRecord,
      updatedAt: serverTimestamp()
    });

    if (nextRecord.role === "parent" && nextRecord.busId) {
      await syncBusStudents(db, nextRecord);
    }

    setStatus("User saved to Firestore.");
  } catch (error) {
    setStatus(
      `User saved locally only. Firebase sync failed: ${
        error instanceof Error ? error.message : "Unknown Firestore error."
      }`
    );
  }
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

async function readStoredValue(key: string) {
  try {
    const localValue =
      typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(key) : null;
    if (localValue) {
      return localValue;
    }
  } catch {
    // Ignore browser storage access failures and fall back to AsyncStorage.
  }

  return AsyncStorage.getItem(key);
}

async function writeStoredValue(key: string, value: string) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore browser storage access failures and continue with AsyncStorage.
  }

  await AsyncStorage.setItem(key, value);
}

async function removeStoredValue(key: string) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore browser storage access failures and continue with AsyncStorage.
  }

  await AsyncStorage.removeItem(key);
}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eff6ff"
  },
  content: {
    padding: 20,
    gap: 18
  },
  authShell: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    gap: 18
  },
  authCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    gap: 12
  },
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 28,
    padding: 22,
    gap: 10
  },
  kicker: {
    color: "#93c5fd",
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 1
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700"
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    gap: 10
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "700"
  },
  field: {
    gap: 6
  },
  fieldLabel: {
    color: "#475467",
    fontSize: 13
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#f8fafc",
    color: "#0f172a"
  },
  inputMultiline: {
    minHeight: 110,
    paddingTop: 12
  },
  statusText: {
    color: "#1e3a8a",
    fontSize: 14,
    lineHeight: 20
  },
  switchLine: {
    color: "#475467",
    fontSize: 14
  },
  switchAction: {
    color: "#2563eb",
    fontWeight: "700"
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  metric: {
    backgroundColor: "#1e293b",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 96
  },
  metricLabel: {
    color: "#93c5fd",
    fontSize: 12,
    textTransform: "uppercase"
  },
  metricValue: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  grid: {
    gap: 18
  },
  record: {
    fontSize: 15,
    color: "#243b53",
    lineHeight: 22
  }
});
