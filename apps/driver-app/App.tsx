import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Network from 'expo-network';
import { doc, serverTimestamp, setDoc, type DocumentReference } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import MapSurface from "./MapSurface";
import {
  type BusLiveLocation,
  type TripRecord,
  type StudentAssignment,
  createStudentAssignmentsFromUsers,
  getBusByDriverId,
  getBusLiveLocation,
  createDefaultBusState,
  formatTimestamp,
  getBusDocumentRef,
  getFirebaseDb,
  getNextStop,
  getParentUsersByBusId,
  getTripsCollection,
  getUserByEmail,
  hasFirebaseConfig,
  signInUser,
  signOutUser,
  signUpUser,
  getNotificationsCollection
} from "@skoolpath/shared";

type DriverScreen = "login" | "register" | "console";

type DriverSession = {
  screen: DriverScreen;
  driverName: string;
  driverEmail: string;
  location: BusLiveLocation;
  activeTripId: string;
};

type SyncItem = {
  id: string;
  path: string;
  data: any;
  merge: boolean;
  timestamp: string;
};

const sessionKey = "driver-session";
const queueKey = "sync-queue";
const LOCATION_TASK_NAME = "background-location-task";

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) { console.error(error); return; }
  if (data) {
    const { locations } = data as any;
    if (locations && locations.length > 0) {
      const loc = locations[0];
      const savedQ = await AsyncStorage.getItem(queueKey) || "[]";
      const savedS = await AsyncStorage.getItem(sessionKey);
      if (savedS) {
        const session = JSON.parse(savedS);
        if (session.location?.tripActive && session.activeTripId) {
          const syncQueue = JSON.parse(savedQ);
          const timestamp = new Date().toISOString();
          syncQueue.push({
            id: Math.random().toString(36).substring(7),
            path: `schools/${session.location.schoolId}/buses/${session.location.busId}`,
            data: {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              speed: loc.coords.speed ?? 0,
              heading: loc.coords.heading ?? 0,
              accuracy: loc.coords.accuracy ?? null,
              updatedAt: timestamp
            },
            merge: true,
            timestamp
          });
          await AsyncStorage.setItem(queueKey, JSON.stringify(syncQueue));
        }
      }
    }
  }
});

export default function App() {
  const [screen, setScreen] = useState<DriverScreen>("login");
  const [driverName, setDriverName] = useState("");
  const [driverEmail, setDriverEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currentLocation, setCurrentLocation] = useState<BusLiveLocation>(createDefaultBusState());
  const [tripActive, setTripActive] = useState(false);
  const [activeTripId, setActiveTripId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Login to access the driver console.");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTripLoading, setIsTripLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [syncQueue, setSyncQueue] = useState<SyncItem[]>([]);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const firebaseReady = hasFirebaseConfig();
  const db = useMemo(() => (firebaseReady ? getFirebaseDb() : null), [firebaseReady]);

  useEffect(() => {
    setIsDataLoading(true);
    void loadSession().finally(() => setIsDataLoading(false));
    void loadQueue();

    const unsubscribe = Network.addNetworkStateListener(state => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(offline);
      if (!offline) {
        void flushQueue();
      }
    });

    return () => { 
      watchRef.current?.remove(); 
      unsubscribe.remove();
    };
  }, []);

  useEffect(() => {
    if (!isOffline && syncQueue.length > 0) {
      void flushQueue();
    }
  }, [isOffline, syncQueue.length]);

  const busRef = useMemo(() => {
    if (!db || !currentLocation.schoolId.trim() || !currentLocation.busId.trim()) return null;
    return getBusDocumentRef(db, currentLocation.schoolId, currentLocation.busId);
  }, [currentLocation.busId, currentLocation.schoolId, db]);

  const loadSession = async () => {
    const saved = await AsyncStorage.getItem(sessionKey);
    if (!saved) return;
    const parsed = JSON.parse(saved) as DriverSession;
    if (firebaseReady && db && parsed.driverEmail) {
      const userRecord = await getUserByEmail(db, parsed.driverEmail);
      if (!userRecord || userRecord.role !== "driver") {
        await AsyncStorage.removeItem(sessionKey);
        setSyncStatus("Your saved driver session was cleared because the profile no longer exists in Firebase.");
        return;
      }
    }
    setScreen(parsed.screen);
    setDriverName(parsed.driverName);
    setDriverEmail(parsed.driverEmail);
    setCurrentLocation(parsed.location);
    setTripActive(parsed.location.tripActive);
    setActiveTripId(parsed.activeTripId ?? "");
    setSyncStatus("Session restored.");
  };

  const persistSession = async (nextScreen: DriverScreen, location = currentLocation, nextTripId = activeTripId) => {
    const payload: DriverSession = { screen: nextScreen, driverName, driverEmail, location, activeTripId: nextTripId };
    await AsyncStorage.setItem(sessionKey, JSON.stringify(payload));
  };

  const persistTripRecord = async (tripId: string, data: Partial<TripRecord>) => {
    if (!db || !tripId) return;
    await safeSetDoc(doc(getTripsCollection(db), tripId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  };

  const syncLocation = async (location: Location.LocationObject) => {
    const nextStop = getNextStop(currentLocation.routeStops, currentLocation.currentStopId);
    const nextLocation: BusLiveLocation = {
      ...currentLocation, driverName, tripActive: true,
      latitude: location.coords.latitude, longitude: location.coords.longitude,
      speed: location.coords.speed ?? 0, heading: location.coords.heading ?? 0,
      accuracy: location.coords.accuracy ?? null,
      nextStopId: nextStop?.id ?? "", nextStopName: nextStop?.name ?? "",
      lastEvent: nextStop ? `Heading to ${nextStop.name}` : "Sharing live location",
      updatedAt: new Date().toISOString()
    };
    setCurrentLocation(nextLocation);
    await persistSession("console", nextLocation, activeTripId);
    if (!busRef) { setSyncStatus("Demo mode active. Add Firebase keys to enable real-time sync."); return; }
    await safeSetDoc(busRef, { ...nextLocation, updatedAt: serverTimestamp() }, { merge: true });
    if (activeTripId) {
      await persistTripRecord(activeTripId, {
        lastKnownLatitude: nextLocation.latitude, lastKnownLongitude: nextLocation.longitude,
        lastKnownSpeed: nextLocation.speed, lastEvent: nextLocation.lastEvent, status: "active"
      });
    }
    setSyncStatus("Live location synced to Firestore.");
  };

  const requestLocationPermissions = async () => {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== "granted") throw new Error("Foreground location permission was denied.");
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== "granted") console.warn("Background location permission denied. Tracking will stop when app closes.");
  };

  const startTrip = async () => {
    try {
      setIsTripLoading(true);
      await requestLocationPermissions();
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await syncLocation(location);
      const tripId = `${currentLocation.busId || "bus"}-${Date.now()}`;
      setActiveTripId(tripId);
      
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
        distanceInterval: 10,
        deferredUpdatesInterval: 10000,
        foregroundService: {
          notificationTitle: "SkoolPath Driver",
          notificationBody: "Live tracking is running in the background.",
          notificationColor: "#2563eb",
        },
      });

      watchRef.current?.remove();
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 10 },
        syncLocation
      );
      setTripActive(true);
      const updatedRouteStops = currentLocation.routeStops.map((stop) => 
        stop.id === currentLocation.currentStopId ? { ...stop, actualArrivalTime: new Date().toISOString() } : stop
      );
      const nextLocation = { ...currentLocation, routeStops: updatedRouteStops, tripActive: true, lastEvent: "Trip started" };
      setCurrentLocation(nextLocation);
      await persistSession("console", nextLocation, tripId);
      await persistTripRecord(tripId, {
        id: tripId, schoolId: nextLocation.schoolId, busId: nextLocation.busId,
        busLabel: nextLocation.busLabel, routeName: nextLocation.routeName,
        driverId: nextLocation.driverId, driverName: driverName || nextLocation.driverName,
        startedAt: new Date().toISOString(), status: "active",
        lastKnownLatitude: location.coords.latitude, lastKnownLongitude: location.coords.longitude,
        lastKnownSpeed: location.coords.speed ?? 0, lastEvent: "Trip started",
        totalStudents: nextLocation.students.length
      });
      await sendAppNotification("driver", `bus_${nextLocation.busId}`, "Trip Started", `The bus has started its route.`);
    } catch (error) {
      Alert.alert("Unable to start trip", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsTripLoading(false);
    }
  };

  const stopTrip = async () => {
    setIsTripLoading(true);
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    watchRef.current?.remove();
    watchRef.current = null;
    setTripActive(false);
    const nextLocation = { ...currentLocation, tripActive: false, speed: 0, lastEvent: "Trip completed", updatedAt: new Date().toISOString() };
    setCurrentLocation(nextLocation);
    await persistSession("console", nextLocation, "");
    const tripId = activeTripId;
    setActiveTripId("");
    if (busRef) {
      await safeSetDoc(busRef, { ...nextLocation, updatedAt: serverTimestamp(), endedAt: serverTimestamp() }, { merge: true });
    }
    if (tripId) {
      await persistTripRecord(tripId, {
        endedAt: new Date().toISOString(), status: "completed",
        lastKnownLatitude: nextLocation.latitude, lastKnownLongitude: nextLocation.longitude,
        lastKnownSpeed: 0, lastEvent: "Trip completed", totalStudents: nextLocation.students.length
      });
    }
    await sendAppNotification("driver", `bus_${nextLocation.busId}`, "Trip Completed", `The bus has finished its entire route.`);
    setSyncStatus("Trip stopped and synced.");
  };

  const loadQueue = async () => {
    const saved = await AsyncStorage.getItem(queueKey);
    if (saved) setSyncQueue(JSON.parse(saved));
  };

  const safeSetDoc = async (ref: DocumentReference<any> | null, data: any, options: { merge?: boolean } = {}) => {
    if (!ref || !db) return;
    if (isOffline) {
      const newItem: SyncItem = {
        id: Math.random().toString(36).substring(7),
        path: ref.path,
        data,
        merge: !!options.merge,
        timestamp: new Date().toISOString()
      };
      const nextQueue = [...syncQueue, newItem];
      setSyncQueue(nextQueue);
      await AsyncStorage.setItem(queueKey, JSON.stringify(nextQueue));
      setSyncStatus("Offline: queued update.");
      return;
    }

    try {
      await setDoc(ref, data, options);
    } catch (e) {
      // If write fails due to network, queue it
      const newItem: SyncItem = {
        id: Math.random().toString(36).substring(7),
        path: ref.path,
        data,
        merge: !!options.merge,
        timestamp: new Date().toISOString()
      };
      const nextQueue = [...syncQueue, newItem];
      setSyncQueue(nextQueue);
      await AsyncStorage.setItem(queueKey, JSON.stringify(nextQueue));
      setSyncStatus("Write failed: queued for later.");
    }
  };

  const flushQueue = async () => {
    if (!db || isOffline || syncQueue.length === 0) return;
    setSyncStatus(`Syncing ${syncQueue.length} pending updates...`);
    const remaining = [...syncQueue];
    while (remaining.length > 0) {
      const item = remaining[0];
      if (!item) break;
      try {
        const ref = doc(db, item.path);
        await setDoc(ref, item.data, { merge: item.merge });
        remaining.shift();
      } catch (e) {
        break; // Network might have cut out again
      }
    }
    setSyncQueue(remaining);
    await AsyncStorage.setItem(queueKey, JSON.stringify(remaining));
    setSyncStatus(remaining.length === 0 ? "All updates synced." : `Retrying sync later...`);
  };

  const setSyncStatus = (message: string) => {
    setStatusMessage(message);
    setLastSync(new Date());
  };

  const sendAppNotification = async (type: "system" | "driver" | "sos", targetEmail: string, title: string, message: string) => {
    if (!db) return;
    try {
      const ref = doc(getNotificationsCollection(db));
      await safeSetDoc(ref, { id: ref.id, type, targetEmail, title, message, timestamp: new Date().toISOString(), read: false });

      // Send actual real push notification
      const sendPush = async (token: string) => {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: token, sounds: 'default', title, body: message })
        }).catch(e => console.warn("Push failed", e));
      };

      if (targetEmail.startsWith("bus_")) {
        const busId = targetEmail.split("_")[1];
        if (busId) {
          const parents = await getParentUsersByBusId(db, busId);
          await Promise.all(parents.map(p => p.expoPushToken ? sendPush(p.expoPushToken) : Promise.resolve()));
        }
      } else {
        const user = await getUserByEmail(db, targetEmail);
        if (user && user.expoPushToken) {
          await sendPush(user.expoPushToken);
        }
      }
    } catch {
      // fire and forget
    }
  };

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      let nextLocation = currentLocation;
      if (firebaseReady) {
        await signInUser(driverEmail, password);
        const userRecord = await getUserByEmail(db!, driverEmail);
        if (!userRecord || userRecord.role !== "driver") {
          await signOutUser();
          setSyncStatus("No driver profile exists for this account. Ask the admin to create the driver record first.");
          return;
        }
        setDriverName(userRecord.fullName || "");
        const busRecord = await getBusByDriverId(db!, userRecord.id);
        if (busRecord) {
          const parentUsers = await getParentUsersByBusId(db!, busRecord.id);
          const liveBus = await getBusLiveLocation(db!, busRecord.schoolId, busRecord.id);
          nextLocation = {
            ...createDefaultBusState(), ...liveBus, schoolId: busRecord.schoolId,
            busId: busRecord.id, busLabel: busRecord.label, routeName: busRecord.routeName,
            driverId: userRecord.id, driverName: userRecord.fullName || "",
            students: liveBus?.students?.length ? liveBus.students : createStudentAssignmentsFromUsers(parentUsers)
          };
          setCurrentLocation(nextLocation);
        } else {
          nextLocation = { ...createDefaultBusState(), driverId: userRecord.id, driverName: userRecord.fullName || "" };
          setCurrentLocation(nextLocation);
          setSyncStatus("No bus is assigned to this driver yet. Ask the admin to link your driver ID to a bus.");
        }
      }
      setScreen("console");
      await persistSession("console", nextLocation, "");
      if (!nextLocation.busId && firebaseReady) return;
      setSyncStatus(firebaseReady ? "Signed in with Firebase." : "Demo mode login successful.");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    try {
      setIsLoading(true);
      if (firebaseReady) {
        await signUpUser(driverEmail, password);
        await signOutUser();
        setSyncStatus("Account created in Authentication. Ask the admin to create your driver profile before login.");
        setScreen("login");
        return;
      }
      setScreen("console");
      await persistSession("console");
      setSyncStatus(firebaseReady ? "Driver account created." : "Demo mode registration successful.");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Unable to register.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (firebaseReady) await signOutUser();
    await AsyncStorage.removeItem(sessionKey);
    setScreen("login");
    setSyncStatus("Signed out.");
  };

  const updateStudentStatus = async (studentId: string, status: StudentAssignment["status"]) => {
    const students = currentLocation.students.map((student) =>
      student.id === studentId ? { ...student, status } : student
    );
    const nextLocation = {
      ...currentLocation, students,
      lastEvent: `${students.find((student) => student.id === studentId)?.name ?? "Student"} marked ${status}`,
      updatedAt: new Date().toISOString()
    };
    setCurrentLocation(nextLocation);
    await persistSession("console", nextLocation, activeTripId);
    if (busRef) {
      await safeSetDoc(busRef, { students, lastEvent: nextLocation.lastEvent, updatedAt: serverTimestamp() }, { merge: true });
    }
    const student = students.find((s) => s.id === studentId);
    if (student) {
      await sendAppNotification("system", student.id, "Student Status Update", `${student.name} was marked as ${status.toUpperCase()}.`);
    }
  };

  const goToNextStop = async () => {
    const nextStop = getNextStop(currentLocation.routeStops, currentLocation.currentStopId);
    if (!nextStop) { setSyncStatus("No route stops are configured yet."); return; }
    const futureStop = getNextStop(currentLocation.routeStops, nextStop.id);
    
    const updatedRouteStops = currentLocation.routeStops.map((stop) =>
      stop.id === nextStop.id ? { ...stop, actualArrivalTime: new Date().toISOString() } : stop
    );

    const nextLocation = {
      ...currentLocation, 
      routeStops: updatedRouteStops,
      currentStopId: nextStop.id, currentStopName: nextStop.name,
      nextStopId: futureStop?.id ?? "", nextStopName: futureStop?.name ?? "",
      latitude: nextStop.latitude, longitude: nextStop.longitude,
      lastEvent: `Arrived at ${nextStop.name}`, updatedAt: new Date().toISOString()
    };
    setCurrentLocation(nextLocation);
    await persistSession("console", nextLocation, activeTripId);
    if (busRef) { await safeSetDoc(busRef, { ...nextLocation, updatedAt: serverTimestamp() }, { merge: true }); }
    await sendAppNotification("driver", `bus_${nextLocation.busId}`, "Bus Moving", `The bus has arrived at ${nextStop.name} and is heading to the next stop.`);
  };

  const studentCounts = useMemo(() => {
    const boarded = currentLocation.students.filter((s) => s.status === "boarded").length;
    const dropped = currentLocation.students.filter((s) => s.status === "dropped").length;
    const waiting = currentLocation.students.length - boarded - dropped;
    return { boarded, dropped, waiting, total: currentLocation.students.length };
  }, [currentLocation.students]);

  const isConnected = statusMessage.includes("synced") || statusMessage.includes("Signed in");

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    setShowScrollTop(event.nativeEvent.contentOffset.y > 300);
  };

  /* ─── Auth Screens ─── */
  if (screen === "login") {
    return (
      <AuthLayout title="Driver Login" subtitle="Sign in to publish live bus location, run trips, and manage boarding."
        switchLabel="Need a driver account?" switchActionLabel="Register"
        onSwitch={() => setScreen("register")} statusMessage={statusMessage}>
        <FloatingInput label="Email" placeholder="Enter your email" value={driverEmail} onChangeText={setDriverEmail} keyboardType="email-address" />
        <FloatingInput label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry />
        <GradientButton icon="🔓" label="Login" onPress={() => void handleLogin()} loading={isLoading} colors={["#2563eb", "#1d4ed8"]} />
      </AuthLayout>
    );
  }

  if (screen === "register") {
    return (
      <AuthLayout title="Driver Register" subtitle="Create a driver account before you start publishing route updates."
        switchLabel="Already registered?" switchActionLabel="Login"
        onSwitch={() => setScreen("login")} statusMessage={statusMessage}>
        <FloatingInput label="Full Name" placeholder="Enter your full name" value={driverName} onChangeText={setDriverName} />
        <FloatingInput label="Email" placeholder="Enter your email" value={driverEmail} onChangeText={setDriverEmail} keyboardType="email-address" />
        <FloatingInput label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry />
        <GradientButton icon="✨" label="Register" onPress={() => void handleRegister()} loading={isLoading} colors={["#2563eb", "#1d4ed8"]} />
      </AuthLayout>
    );
  }

  /* ─── Console Screen ─── */
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} onScroll={handleScroll} scrollEventThrottle={100}>
        <HeroCard kicker="Driver Console" title="Manage the trip in one focused workspace."
          subtitle="Publish GPS, move stop-by-stop, and keep parent updates accurate throughout the route."
          metrics={[
            { label: "Trip", value: tripActive ? "Active" : "Idle" },
            { label: "Bus", value: currentLocation.busLabel || "Unassigned" },
            { label: "Next", value: currentLocation.nextStopName || "No stop" }
          ]} />

        <View style={[styles.banner, { backgroundColor: tripActive ? "#dcfce7" : "#fef3c7" }]}>
          <Text style={[styles.bannerText, { color: tripActive ? "#14532d" : "#92400e" }]}>
            {tripActive ? "🟢  Trip is active — broadcasting live GPS" : "⏸  Trip is idle — press Start Trip to begin"}
          </Text>
        </View>

        {currentLocation.students.length > 0 && (
          isDataLoading ? <SkeletonCard height={90} /> : <AttendanceProgressBar counts={studentCounts} />
        )}

        {currentLocation.routeStops.length > 0 && (
          isDataLoading ? <SkeletonCard height={100} /> : (
            <StopStepper stops={currentLocation.routeStops} currentStopId={currentLocation.currentStopId} nextStopId={currentLocation.nextStopId} />
          )
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Trip Setup</Text>
          <FloatingInput label="School ID" value={currentLocation.schoolId}
            onChangeText={(v) => setCurrentLocation((p) => ({ ...p, schoolId: v }))} />
          <FloatingInput label="Bus ID" value={currentLocation.busId}
            onChangeText={(v) => setCurrentLocation((p) => ({ ...p, busId: v }))} />
          <FloatingInput label="Driver ID" value={currentLocation.driverId}
            onChangeText={(v) => setCurrentLocation((p) => ({ ...p, driverId: v }))} />
          <FloatingInput label="Route Name" value={currentLocation.routeName}
            onChangeText={(v) => setCurrentLocation((p) => ({ ...p, routeName: v }))} />
          <View style={styles.buttonRow}>
            <GradientButton style={{ flex: 1 }} icon="▶" label="Start Trip" onPress={() => void startTrip()} colors={["#16a34a", "#15803d"]} disabled={tripActive} loading={isTripLoading && !tripActive} />
            <GradientButton style={{ flex: 1 }} icon="⏹" label="Stop Trip" onPress={() => void stopTrip()} colors={["#dc2626", "#b91c1c"]} disabled={!tripActive} loading={isTripLoading && tripActive} />
          </View>
          <View style={styles.buttonRow}>
            <GradientButton style={{ flex: 1 }} icon="⏭" label="Next Stop" onPress={() => void goToNextStop()} colors={["#2563eb", "#1d4ed8"]} />
            <GradientButton style={{ flex: 1 }} icon="🚪" label="Logout" onPress={() => void handleLogout()} colors={["#64748b", "#475569"]} />
          </View>
          <StatusLine message={statusMessage} connected={isConnected} />
        </View>

        <MapSurface currentLocation={currentLocation} />

        <View style={styles.grid}>
          {isDataLoading ? (
            <><SkeletonCard height={140} /><SkeletonCard height={140} /></>
          ) : (
            <>
              <InfoCard icon="📡" title="Live Status" lines={[
                `Current stop: ${currentLocation.currentStopName}`, `Next stop: ${currentLocation.nextStopName}`,
                `Last event: ${currentLocation.lastEvent}`, `Last update: ${formatTimestamp(currentLocation.updatedAt)}`
              ]} />
              <InfoCard icon="🧭" title="Route Snapshot" lines={[
                `Latitude: ${currentLocation.latitude.toFixed(5)}`, `Longitude: ${currentLocation.longitude.toFixed(5)}`,
                `Speed: ${Math.round(currentLocation.speed)} m/s`, `Heading: ${Math.round(currentLocation.heading)} deg`
              ]} />
            </>
          )}
        </View>

        <View style={styles.timelineCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>👨‍🎓</Text>
            <Text style={styles.sectionTitle}>Student Attendance</Text>
          </View>
          {isDataLoading ? <SkeletonCard height={200} /> :
            currentLocation.students.length ? currentLocation.students.map((student) => (
            <View key={student.id} style={styles.studentRow}>
              <View style={styles.studentInfo}>
                <View style={[
                  styles.studentAvatar,
                  student.status === "boarded" ? styles.avatarBoarded
                    : student.status === "dropped" ? styles.avatarDropped : styles.avatarWaiting
                ]}>
                  <Text style={styles.avatarText}>{student.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.studentCopy}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentMeta}>
                    {student.stopName} • <Text style={[
                      styles.studentStatusText,
                      student.status === "boarded" ? { color: "#16a34a" }
                        : student.status === "dropped" ? { color: "#2563eb" } : { color: "#f59e0b" }
                    ]}>{student.status}</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.attendanceButtons}>
                <ScaleButton
                  style={[styles.attendBtn, styles.boardedBtn, student.status === "boarded" && styles.attendBtnActive]}
                  onPress={() => void updateStudentStatus(student.id, "boarded")}>
                  <Text style={[styles.attendBtnText, student.status === "boarded" && styles.attendBtnTextActive]}>✓ Boarded</Text>
                </ScaleButton>
                <ScaleButton
                  style={[styles.attendBtn, styles.droppedBtn, student.status === "dropped" && styles.attendBtnActiveBlue]}
                  onPress={() => void updateStudentStatus(student.id, "dropped")}>
                  <Text style={[styles.attendBtnText, student.status === "dropped" && styles.attendBtnTextActive]}>↓ Dropped</Text>
                </ScaleButton>
              </View>
            </View>
          )) : <Text style={styles.infoLine}>No students are assigned yet. Add them from the admin dashboard.</Text>}
        </View>
      </ScrollView>

      {showScrollTop && (
        <TouchableOpacity style={styles.scrollTopFab}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} activeOpacity={0.8}>
          <Text style={styles.scrollTopIcon}>↑</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

/* ─── Reusable Components ─── */

function PulsingDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.6, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true })
    ]));
    a.start();
    return () => a.stop();
  }, [pulse]);
  return <Animated.View style={{ position: "absolute", width: 18, height: 18, borderRadius: 9, backgroundColor: color, opacity: 0.3, transform: [{ scale: pulse }] }} />;
}

function StatusLine({ message, connected }: { message: string; connected: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (connected) {
      const a = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true })
      ]));
      a.start();
      return () => a.stop();
    }
  }, [connected, pulse]);
  return (
    <View style={styles.statusRow}>
      <Animated.View style={[styles.statusDotView, { backgroundColor: connected ? "#16a34a" : "#f59e0b", opacity: connected ? pulse : 1 }]} />
      <Text style={styles.statusText}>{message}</Text>
    </View>
  );
}

function SkeletonCard({ height }: { height: number }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 1200, useNativeDriver: true })
    ]));
    a.start();
    return () => a.stop();
  }, [shimmer]);
  return (
    <Animated.View style={[styles.skeletonCard, { height, opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }) }]}>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, { width: "60%" as never }]} />
      <View style={[styles.skeletonLine, { width: "40%" as never }]} />
    </Animated.View>
  );
}

function ScaleButton({ style, onPress, children }: { style: any; onPress: () => void; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity style={style} onPress={onPress} activeOpacity={1}
        onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function AttendanceProgressBar({ counts }: { counts: { boarded: number; dropped: number; waiting: number; total: number } }) {
  const boardedPct = counts.total > 0 ? (counts.boarded / counts.total) * 100 : 0;
  const droppedPct = counts.total > 0 ? (counts.dropped / counts.total) * 100 : 0;
  const waitingPct = counts.total > 0 ? (counts.waiting / counts.total) * 100 : 0;
  return (
    <View style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressTitle}>Attendance</Text>
        <Text style={styles.progressCount}>{counts.boarded + counts.dropped}/{counts.total}</Text>
      </View>
      <View style={styles.progressBar}>
        {boardedPct > 0 && <View style={[styles.progressSegment, { width: `${boardedPct}%` as never, backgroundColor: "#16a34a" }]} />}
        {droppedPct > 0 && <View style={[styles.progressSegment, { width: `${droppedPct}%` as never, backgroundColor: "#2563eb" }]} />}
        {waitingPct > 0 && <View style={[styles.progressSegment, { width: `${waitingPct}%` as never, backgroundColor: "#e2e8f0" }]} />}
      </View>
      <View style={styles.progressLegend}>
        <LegendItem color="#16a34a" label={`Boarded ${counts.boarded}`} />
        <LegendItem color="#2563eb" label={`Dropped ${counts.dropped}`} />
        <LegendItem color="#94a3b8" label={`Waiting ${counts.waiting}`} />
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function StopStepper({ stops, currentStopId, nextStopId }: { stops: Array<{ id: string; name: string }>; currentStopId: string; nextStopId: string }) {
  return (
    <View style={styles.stepperCard}>
      <Text style={styles.stepperLabel}>Route Progress</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepperRow}>
        {stops.map((stop, index) => {
          const isCurrent = stop.id === currentStopId;
          const isNext = stop.id === nextStopId;
          const isPassed = !isCurrent && !isNext && stops.findIndex((s) => s.id === currentStopId) > index;
          const isLast = index === stops.length - 1;
          return (
            <View key={stop.id} style={styles.stepperItem}>
              <View style={styles.stepperDotRow}>
                <View style={[styles.stepperDot,
                  isCurrent ? styles.stepperDotCurrent : isNext ? styles.stepperDotNext
                    : isPassed ? styles.stepperDotPassed : styles.stepperDotIdle]}>
                  {isCurrent && <PulsingDot color="#16a34a" />}
                  {isCurrent && <Text style={styles.stepperDotIcon}>●</Text>}
                  {isPassed && <Text style={styles.stepperCheckIcon}>✓</Text>}
                </View>
                {!isLast && <View style={[styles.stepperLine, isPassed ? styles.stepperLinePassed : null]} />}
              </View>
              <Text style={[styles.stepperName,
                isCurrent && { color: "#16a34a", fontWeight: "700" as const },
                isNext && { color: "#2563eb", fontWeight: "600" as const }
              ]} numberOfLines={2}>{stop.name}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AuthLayout({ title, subtitle, switchLabel, switchActionLabel, onSwitch, statusMessage, children }: {
  title: string; subtitle: string; switchLabel: string; switchActionLabel: string;
  onSwitch: () => void; statusMessage: string; children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.authShell}>
        <View style={styles.authGradientTop} /><View style={styles.authGradientBottom} />
        <HeroCard kicker="SkoolPath" title={title} subtitle={subtitle} metrics={[]} />
        <View style={styles.authCard}>
          {children}
          <StatusLine message={statusMessage} connected={false} />
          <TouchableOpacity onPress={onSwitch} style={styles.switchWrap}>
            <Text style={styles.switchLine}>{switchLabel}{" "}<Text style={styles.switchAction}>{switchActionLabel}</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function HeroCard({ kicker, title, subtitle, metrics }: {
  kicker: string; title: string; subtitle: string; metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroAccentDot} />
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {metrics.length ? <View style={styles.metricRow}>{metrics.map((m) => <Metric key={m.label} label={m.label} value={m.value} />)}</View> : null}
    </View>
  );
}

function FloatingInput({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType }: {
  label: string; placeholder?: string; value: string; onChangeText: (v: string) => void;
  secureTextEntry?: boolean; keyboardType?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry ?? false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(labelAnim, { toValue: focused || value ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [focused, value, labelAnim]);

  const isFloated = focused || !!value;
  const hasError = secureTextEntry && value.length > 0 && value.length < 6;

  return (
    <View style={styles.floatingWrap}>
      <Animated.Text style={[styles.floatingLabel, {
        top: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, -10] }),
        fontSize: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 12] }),
        color: focused ? "#2563eb" : "#64748b",
        backgroundColor: isFloated ? "#ffffff" : "transparent",
        paddingHorizontal: isFloated ? 6 : 0
      }]}>{label}</Animated.Text>
      <View style={styles.inputRow}>
        <TextInput style={[styles.floatingInput, focused && styles.floatingInputFocused, secureTextEntry ? styles.inputWithToggle : null]}
          value={value} onChangeText={onChangeText} secureTextEntry={hidden}
          placeholderTextColor="#cbd5e1"
          autoCapitalize="none" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
        {value.length > 0 && !secureTextEntry && <View style={styles.validationIcon}><Text style={{ color: "#16a34a", fontSize: 14 }}>✓</Text></View>}
        {secureTextEntry && value.length > 0 && <View style={[styles.validationIcon, { right: 40 }]}><Text style={{ color: hasError ? "#dc2626" : "#16a34a", fontSize: 14 }}>{hasError ? "✗" : "✓"}</Text></View>}
        {secureTextEntry && <TouchableOpacity style={styles.eyeButton} onPress={() => setHidden(!hidden)}><Text style={styles.eyeIcon}>{hidden ? "👁" : "🙈"}</Text></TouchableOpacity>}
      </View>
    </View>
  );
}

function GradientButton({ icon, label, onPress, loading, colors, disabled, style }: {
  icon: string; label: string; onPress: () => void; colors: string[]; loading?: boolean; disabled?: boolean; style?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={[styles.gradientButton, { backgroundColor: colors[0] }, (disabled || loading) && styles.styledButtonDisabled]}
        onPress={onPress} disabled={disabled || loading} activeOpacity={1}
        onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}>
        {loading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.gradientButtonIcon}>{icon}</Text>}
        <Text style={styles.gradientButtonLabel}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function InfoCard({ icon, title, lines }: { icon: string; title: string; lines: string[] }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}><Text style={styles.cardIcon}>{icon}</Text><Text style={styles.sectionTitle}>{title}</Text></View>
      {lines.map((line) => <Text key={line} style={styles.infoLine}>{line}</Text>)}
    </View>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eff6ff" },
  content: { padding: 20, gap: 16, paddingBottom: 80 },

  authShell: { flex: 1, padding: 20, justifyContent: "center", gap: 18 },
  authGradientTop: { position: "absolute", top: 0, left: 0, right: 0, height: 260, backgroundColor: "#0f172a", borderBottomLeftRadius: 40, borderBottomRightRadius: 40, opacity: 0.06 },
  authGradientBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 200, backgroundColor: "#2563eb", borderTopLeftRadius: 40, borderTopRightRadius: 40, opacity: 0.04 },
  authCard: { backgroundColor: "#ffffff", borderRadius: 24, padding: 22, gap: 14, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.08, shadowRadius: 32, elevation: 8 },
  switchWrap: { paddingVertical: 4 },

  heroCard: { backgroundColor: "#0f172a", borderRadius: 28, padding: 24, gap: 10, overflow: "hidden" },
  heroAccentDot: { position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(37, 99, 235, 0.25)" },
  kicker: { color: "#93c5fd", textTransform: "uppercase", fontSize: 12, letterSpacing: 1.5, fontWeight: "700" },
  title: { color: "#ffffff", fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: "#cbd5e1", fontSize: 15, lineHeight: 22 },

  banner: { borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  bannerText: { fontSize: 15, fontWeight: "600", lineHeight: 22 },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  statusDotView: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: "#1e3a8a", fontSize: 14, lineHeight: 20, flex: 1 },
  switchLine: { color: "#475467", fontSize: 14 },
  switchAction: { color: "#2563eb", fontWeight: "700" },

  progressCard: { backgroundColor: "#ffffff", borderRadius: 24, padding: 20, gap: 12, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 2 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  progressCount: { fontSize: 15, fontWeight: "700", color: "#64748b" },
  progressBar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: "#f1f5f9" },
  progressSegment: { height: 10 },
  progressLegend: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, color: "#64748b", fontWeight: "600" },

  stepperCard: { backgroundColor: "#ffffff", borderRadius: 24, padding: 20, gap: 10, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 2 },
  stepperLabel: { fontSize: 13, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 1 },
  stepperRow: { paddingVertical: 8 },
  stepperItem: { alignItems: "center", width: 80 },
  stepperDotRow: { flexDirection: "row", alignItems: "center", width: 80, justifyContent: "center" },
  stepperDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", zIndex: 1 },
  stepperDotCurrent: { backgroundColor: "#16a34a", shadowColor: "#16a34a", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  stepperDotNext: { backgroundColor: "#2563eb", borderWidth: 3, borderColor: "#bfdbfe" },
  stepperDotPassed: { backgroundColor: "#bbf7d0", borderWidth: 2, borderColor: "#16a34a" },
  stepperDotIdle: { backgroundColor: "#e2e8f0", borderWidth: 2, borderColor: "#cbd5e1" },
  stepperDotIcon: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
  stepperCheckIcon: { color: "#16a34a", fontSize: 12, fontWeight: "800" },
  stepperLine: { position: "absolute", left: 50, right: -30, height: 3, backgroundColor: "#e2e8f0", zIndex: 0 },
  stepperLinePassed: { backgroundColor: "#16a34a" },
  stepperName: { fontSize: 11, color: "#64748b", marginTop: 6, textAlign: "center" },

  card: { backgroundColor: "#ffffff", borderRadius: 24, padding: 18, gap: 10, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardIcon: { fontSize: 20 },
  sectionTitle: { color: "#0f172a", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },

  floatingWrap: { marginBottom: 4, position: "relative" },
  floatingLabel: { position: "absolute", left: 14, zIndex: 1, fontWeight: "600" },
  inputRow: { flexDirection: "row", alignItems: "center" },
  floatingInput: { flex: 1, borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 15, backgroundColor: "#ffffff", color: "#0f172a", fontSize: 15 },
  floatingInputFocused: { borderColor: "#2563eb", shadowColor: "#2563eb", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  inputWithToggle: { paddingRight: 70 },
  validationIcon: { position: "absolute", right: 14 },
  eyeButton: { position: "absolute", right: 12, padding: 4 },
  eyeIcon: { fontSize: 18 },

  gradientButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 15, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 6 },
  styledButtonDisabled: { opacity: 0.4 },
  gradientButtonIcon: { fontSize: 16 },
  gradientButtonLabel: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },

  metricRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 6 },
  metric: { backgroundColor: "#1e293b", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, minWidth: 96, borderWidth: 1, borderColor: "rgba(148, 163, 184, 0.15)" },
  metricLabel: { color: "#93c5fd", fontSize: 11, textTransform: "uppercase", fontWeight: "700", letterSpacing: 0.5 },
  metricValue: { color: "#ffffff", fontSize: 17, fontWeight: "800", marginTop: 2 },

  grid: { gap: 16 },
  infoLine: { color: "#334155", fontSize: 15, lineHeight: 22 },

  timelineCard: { backgroundColor: "#ffffff", borderRadius: 24, padding: 20, gap: 4, shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16, elevation: 2 },
  studentRow: { gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  studentInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  studentAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarBoarded: { backgroundColor: "#dcfce7" },
  avatarDropped: { backgroundColor: "#dbeafe" },
  avatarWaiting: { backgroundColor: "#fef3c7" },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  studentCopy: { flex: 1, gap: 2 },
  studentName: { color: "#0f172a", fontSize: 16, fontWeight: "700" },
  studentMeta: { color: "#64748b", fontSize: 13 },
  studentStatusText: { fontWeight: "700" },
  attendanceButtons: { flexDirection: "row", gap: 8, marginTop: 2 },
  attendBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5 },
  boardedBtn: { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" },
  droppedBtn: { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" },
  attendBtnActive: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  attendBtnActiveBlue: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  attendBtnText: { fontSize: 13, fontWeight: "700", color: "#334155" },
  attendBtnTextActive: { color: "#ffffff" },

  skeletonCard: { backgroundColor: "#e2e8f0", borderRadius: 24, padding: 20, gap: 12, justifyContent: "center" },
  skeletonLine: { height: 14, backgroundColor: "#cbd5e1", borderRadius: 8, width: "80%" as never },

  scrollTopFab: { position: "absolute", bottom: 24, right: 24, width: 48, height: 48, borderRadius: 24, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center", shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  scrollTopIcon: { color: "#ffffff", fontSize: 20, fontWeight: "800" }
});
