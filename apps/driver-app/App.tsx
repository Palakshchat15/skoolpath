import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Network from 'expo-network';
import * as Notifications from "expo-notifications";
import { doc, serverTimestamp, setDoc, onSnapshot, query, where, limit, type DocumentReference } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
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
  getNotificationsCollection,
  getAlertConfigsCollection,
  type AlertConfig,
  type AppNotification
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
  const [statusMessage, setStatusMessage] = useState("System ready.");
  const [syncStatus, setInternalSyncStatus] = useState("Idle");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [realNotifications, setRealNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTripLoading, setIsTripLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [syncQueue, setSyncQueue] = useState<SyncItem[]>([]);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const latestLocationRef = useRef<BusLiveLocation>(currentLocation);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const firebaseReady = hasFirebaseConfig();
  const db = useMemo(() => (firebaseReady ? getFirebaseDb() : null), [firebaseReady]);

  useEffect(() => {
    latestLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    if (!firebaseReady || !db) return;
    const targetDocId = currentLocation.schoolId || "global_settings";
    const unsub = onSnapshot(doc(getAlertConfigsCollection(db), targetDocId), (snap) => {
      if (snap.exists()) {
        setAlertConfig(snap.data() as AlertConfig);
      }
    });
    return () => unsub();
  }, [firebaseReady, db, currentLocation.schoolId]);

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

  // Notification Listener for Drivers
  useEffect(() => {
    if (!db || !driverEmail) return;

    const notifQuery = query(
      getNotificationsCollection(db),
      where("targetEmail", "in", [driverEmail, "global", "all_drivers"]),
      limit(20)
    );

    const unsubscribe = onSnapshot(notifQuery, (snapshot) => {
      const list = snapshot.docs
        .map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as AppNotification))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setRealNotifications(list);

      if (!snapshot.metadata.fromCache && snapshot.docChanges().length > 0) {
        snapshot.docChanges().forEach(change => {
          if (change.type === "added") {
            const data = change.doc.data();
            Notifications.scheduleNotificationAsync({
              content: { title: data.title, body: data.message, sound: true },
              trigger: null
            });
          }
        });
      }
    }, (error) => {
      console.error("Driver Notif Listener Error:", error);
    });

    return () => unsubscribe();
  }, [db, driverEmail]);

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

  const syncLocation = async (location: Location.LocationObject, overrideTripId?: string) => {
    const locState = latestLocationRef.current;
    const nextStop = getNextStop(locState.routeStops, locState.currentStopId);
    const activeId = overrideTripId || activeTripId;
    
    const nextLocation: BusLiveLocation = {
      ...locState, driverName, tripActive: !!activeId,
      latitude: location.coords.latitude, longitude: location.coords.longitude,
      speed: location.coords.speed ?? 0, heading: location.coords.heading ?? 0,
      accuracy: location.coords.accuracy ?? null,
      nextStopId: nextStop?.id ?? "", nextStopName: nextStop?.name ?? "",
      lastEvent: nextStop ? `Heading to ${nextStop.name}` : "Sharing live location",
      updatedAt: new Date().toISOString()
    };
    
    // Check speed threshold
    const currentSpeedKmH = (location.coords.speed ?? 0) * 3.6;
    let nextStatus = "Live location synced to Firestore.";
    if (alertConfig && (alertConfig as any).velocity > 0 && currentSpeedKmH > (alertConfig as any).velocity) {
      nextStatus = `⚠️ SPEEDING: ${Math.round(currentSpeedKmH)} km/h (Limit: ${(alertConfig as any).velocity} km/h)`;
      if (activeId && Math.random() < 0.1) {
         sendAppNotification("system", "admin", "Speed Limit Exceeded", `Driver ${driverName} (${locState.busId}) driving at ${Math.round(currentSpeedKmH)} km/h`);
      }
    }

    setCurrentLocation(nextLocation);
    await persistSession("console", nextLocation, activeId);
    if (!busRef) { setSyncStatus("Demo mode active. Live sync disabled."); return; }
    await safeSetDoc(busRef, { ...nextLocation, updatedAt: serverTimestamp() }, { merge: true });
    
    if (activeId) {
      await persistTripRecord(activeId, {
        lastKnownLatitude: nextLocation.latitude, lastKnownLongitude: nextLocation.longitude,
        lastKnownSpeed: nextLocation.speed, lastEvent: nextLocation.lastEvent, status: "active"
      });
    }
    setSyncStatus(nextStatus);
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
      setSyncStatus("Initializing location services...");
      await requestLocationPermissions();
      
      const tripId = `${currentLocation.busId || "bus"}-${Date.now()}`;
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      
      // 1. Set trip ID first to allow syncLocation to recognize it
      setActiveTripId(tripId);
      setTripActive(true);

      // 2. Initialize the trip record in Firestore
      const updatedRouteStops = currentLocation.routeStops.map((stop, i) => 
        i === 0 ? { ...stop, actualArrivalTime: new Date().toISOString() } : stop
      );
      const nextLocation = { ...currentLocation, routeStops: updatedRouteStops, tripActive: true, lastEvent: "Trip started" };
      setCurrentLocation(nextLocation);

      await persistTripRecord(tripId, {
        id: tripId, schoolId: nextLocation.schoolId, busId: nextLocation.busId,
        busLabel: nextLocation.busLabel, routeName: nextLocation.routeName,
        driverId: nextLocation.driverId, driverName: driverName || nextLocation.driverName,
        startedAt: new Date().toISOString(), status: "active",
        lastKnownLatitude: location.coords.latitude, lastKnownLongitude: location.coords.longitude,
        lastKnownSpeed: location.coords.speed ?? 0, lastEvent: "Trip started",
        totalStudents: nextLocation.students.length
      });

      // 3. Start background/foreground tracking (Mobile only)
      if (Platform.OS !== 'web') {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 8000,
          distanceInterval: 10,
          foregroundService: {
            notificationTitle: "SkoolPath Driver",
            notificationBody: "Reporting live location to school and parents.",
            notificationColor: "#2563eb",
          },
        });
      }

      watchRef.current?.remove();
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 10 },
        (loc) => syncLocation(loc, tripId) // Pass tripId explicitly
      );

      await persistSession("console", nextLocation, tripId);
      await sendAppNotification("driver", `bus_${nextLocation.busId}`, "Trip Started", `The bus has started its route.`);
      setSyncStatus("Trip is now live.");
    } catch (error) {
      Alert.alert("Startup Failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsTripLoading(false);
    }
  };

  const stopTrip = async () => {
    try {
      setIsTripLoading(true);
      setSyncStatus("Finalizing trip records...");
      if (Platform.OS !== 'web') {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (hasStarted) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
      
      watchRef.current?.remove();
      watchRef.current = null;
      
      const tripId = activeTripId;
      setTripActive(false);
      setActiveTripId("");

      const nextLocation: BusLiveLocation = { 
        ...currentLocation, 
        tripActive: false, speed: 0, 
        currentStopId: "", currentStopName: "None", nextStopId: "", nextStopName: "Standby",
        lastEvent: "Trip completed", updatedAt: new Date().toISOString() 
      };
      
      setCurrentLocation(nextLocation);
      await persistSession("console", nextLocation, "");
      
      if (busRef) {
        await safeSetDoc(busRef, { ...nextLocation, updatedAt: serverTimestamp(), endedAt: serverTimestamp() }, { merge: true });
      }
      
      if (tripId) {
        await persistTripRecord(tripId, {
          endedAt: new Date().toISOString(), status: "completed",
          lastKnownLatitude: nextLocation.latitude, lastKnownLongitude: nextLocation.longitude,
          lastKnownSpeed: 0, lastEvent: "Trip completed"
        });
      }
      
      await sendAppNotification("driver", `bus_${nextLocation.busId}`, "Trip Completed", `The bus has finished its entire route.`);
      setSyncStatus("Standby mode active.");
    } catch (error) {
       console.error("Stop Trip Error:", error);
    } finally {
      setIsTripLoading(false);
    }
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
    if (!nextStop) { setSyncStatus("No remaining stops found."); return; }
    
    // Check if next stop was actually found (findIndex didn't return last stop)
    const isActuallyNew = nextStop.id !== currentLocation.currentStopId;
    if (!isActuallyNew) { setSyncStatus("Already at the last stop."); return; }

    const futureStop = getNextStop(currentLocation.routeStops, nextStop.id);
    
    const updatedRouteStops = currentLocation.routeStops.map((stop) =>
      stop.id === nextStop.id ? { ...stop, actualArrivalTime: new Date().toISOString() } : stop
    );

    const nextLocation = {
      ...currentLocation, 
      routeStops: updatedRouteStops,
      currentStopId: nextStop.id, currentStopName: nextStop.name,
      nextStopId: futureStop?.id ?? "", nextStopName: futureStop?.name ?? "",
      lastEvent: `Arrived at ${nextStop.name}`, updatedAt: new Date().toISOString()
    };
    
    setCurrentLocation(nextLocation);
    await persistSession("console", nextLocation, activeTripId);
    if (busRef) { await safeSetDoc(busRef, { ...nextLocation, updatedAt: serverTimestamp() }, { merge: true }); }
    await sendAppNotification("driver", `bus_${nextLocation.busId}`, "Bus Moving", `The bus has arrived at ${nextStop.name} and is heading to the next destination.`);
    setSyncStatus(`Arrived: ${nextStop.name}`);
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
        {activeTab === "dashboard" ? (
          <FadeInView delay={100} style={{ gap: 16 }}>
            <HeroCard kicker="Mission Control" title={`Hey, ${driverName || "Driver"}`}
              subtitle="Your active instrument cluster for real-time trip management and telemetry."
              metrics={[
                { label: "Trip", value: tripActive ? "Live" : "Idle" },
                { label: "Bus", value: currentLocation.busLabel || "None" },
                { label: "Pax", value: `${studentCounts.boarded}/${studentCounts.total}` }
              ]} />

            <View style={[styles.banner, { backgroundColor: tripActive ? "#0f172a" : "#f1f5f9" }]}>
              <Text style={[styles.bannerText, { color: tripActive ? "#60a5fa" : "#64748b" }]}>
                {tripActive ? "📡  Broadcasting Live GPS Signal" : "💤  System standby — start trip to begin"}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Trip Controls</Text>
              <View style={styles.buttonRow}>
                <GradientButton style={{ flex: 1 }} icon="▶" label="Start" onPress={() => void startTrip()} colors={["#16a34a", "#15803d"]} disabled={tripActive} />
                <GradientButton style={{ flex: 1 }} icon="⏹" label="Stop" onPress={() => void stopTrip()} colors={["#dc2626", "#b91c1c"]} disabled={!tripActive} />
              </View>
              <GradientButton icon="⏭" label="Arrive at Next Stop" onPress={() => void goToNextStop()} colors={["#2563eb", "#1d4ed8"]} disabled={!tripActive} />
            </View>

            <View style={styles.grid}>
              <InfoCard icon="📍" title="Next Destination" lines={[`Target: ${currentLocation.nextStopName || "Finish"}`, `Status: In Pursuit`]} />
              <InfoCard icon="⚡" title="Telemetry" lines={[`Speed: ${Math.round(currentLocation.speed)} m/s`, `Signal: ${isConnected ? "Strong" : "Weak"}`]} />
            </View>

            {realNotifications.length > 0 && (
              <InfoCard icon="🔔" title="Admin Announcements" 
                lines={realNotifications.slice(0, 2).map(n => `${n.title}: ${n.message}`)} 
              />
            )}

            <GradientButton 
              icon="🚨" 
              label="HOLD TO TRIGGER SOS" 
              onPress={() => Alert.alert("SOS Trigger", "Hold the button for 2 seconds to alert emergency services.")} 
              colors={["#ef4444", "#991b1b"]} 
              style={{ marginTop: 10 }}
            />
          </FadeInView>
        ) : activeTab === "route" ? (
          <FadeInView delay={100} style={{ gap: 16 }}>
            <MapSurface currentLocation={currentLocation} />
            <AttendanceProgressBar counts={studentCounts} />
            <StopStepper stops={currentLocation.routeStops} currentStopId={currentLocation.currentStopId} nextStopId={currentLocation.nextStopId} />
            
            <View style={styles.timelineCard}>
              <View style={styles.cardHeader}><Text style={styles.cardIcon}>👨‍🎓</Text><Text style={styles.sectionTitle}>Students</Text></View>
              {currentLocation.students.map((student) => (
                <View key={student.id} style={styles.studentRow}>
                  <View style={styles.studentInfo}>
                    <View style={[styles.studentAvatar, student.status === "boarded" ? styles.avatarBoarded : student.status === "dropped" ? styles.avatarDropped : styles.avatarWaiting]}>
                      <Text style={styles.avatarText}>{student.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.studentCopy}>
                      <Text style={styles.studentName}>{student.name}</Text>
                      <Text style={styles.studentMeta}>{student.stopName} • {student.status}</Text>
                    </View>
                  </View>
                  <View style={styles.attendanceButtons}>
                    <ScaleButton style={[styles.attendBtn, styles.boardedBtn, student.status === "boarded" && styles.attendBtnActive]} onPress={() => void updateStudentStatus(student.id, "boarded")}>
                      <Text style={[styles.attendBtnText, student.status === "boarded" && styles.attendBtnTextActive]}>Board</Text>
                    </ScaleButton>
                    <ScaleButton style={[styles.attendBtn, styles.droppedBtn, student.status === "dropped" && styles.attendBtnActiveBlue]} onPress={() => void updateStudentStatus(student.id, "dropped")}>
                      <Text style={[styles.attendBtnText, student.status === "dropped" && styles.attendBtnTextActive]}>Drop</Text>
                    </ScaleButton>
                  </View>
                </View>
              ))}
            </View>
          </FadeInView>
        ) : (
          <FadeInView delay={100} style={styles.card}>
            <Text style={styles.sectionTitle}>Configurations</Text>
            <FloatingInput label="Admin School ID" value={currentLocation.schoolId} onChangeText={(v) => setCurrentLocation((p) => ({ ...p, schoolId: v }))} />
            <FloatingInput label="Bus Identifier" value={currentLocation.busId} onChangeText={(v) => setCurrentLocation((p) => ({ ...p, busId: v }))} />
            <FloatingInput label="Driver ID" value={currentLocation.driverId} onChangeText={(v) => setCurrentLocation((p) => ({ ...p, driverId: v }))} />
            <GradientButton icon="🚪" label="Sign Out" onPress={() => void handleLogout()} colors={["#64748b", "#475569"]} />
            <StatusLine message={statusMessage} connected={isConnected} />
          </FadeInView>
        )}
      </ScrollView>

      <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />

      {showScrollTop && (
        <TouchableOpacity style={[styles.scrollTopFab, { bottom: 100 }]}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} activeOpacity={0.8}>
          <Text style={styles.scrollTopIcon}>↑</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

function BottomNavBar({ activeTab, onTabChange }: { activeTab: string; onTabChange: (t: string) => void }) {
  return (
    <View style={styles.bottomNav}>
      <TabItem icon="🎮" label="Console" active={activeTab === "dashboard"} onPress={() => onTabChange("dashboard")} />
      <TabItem icon="🗺️" label="Route" active={activeTab === "route"} onPress={() => onTabChange("route")} />
      <TabItem icon="⚙️" label="Settings" active={activeTab === "settings"} onPress={() => onTabChange("settings")} />
    </View>
  );
}

function TabItem({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tabItem, active && styles.tabItemActive]}>
      <Text style={[styles.tabIcon, active && { opacity: 1 }]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── Modern Animation Wrappers ─── */

function FadeInView({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, delay, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, delay, useNativeDriver: false, easing: Easing.out(Easing.back(1.5)) })
    ]).start();
  }, [fadeAnim, slideAnim, delay]);

  return (
    <Animated.View style={[style, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {children}
    </Animated.View>
  );
}

function GlowingOrb({ color, size, top, left, delay = 0 }: { color: string; size: number; top?: number; left?: number; delay?: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 4000 + delay, useNativeDriver: false, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(pulse, { toValue: 1, duration: 4000 + delay, useNativeDriver: false, easing: Easing.inOut(Easing.sin) })
      ])
    ).start();
  }, [pulse, delay]);

  return (
    <Animated.View style={{
      position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color,
      top: top, left: left, opacity: 0.1, transform: [{ scale: pulse }],
      pointerEvents: "none"
    } as any} />
  );
}

function DrivingBus() {
  const busAnim = useRef(new Animated.Value(-100)).current;
  const screenWidth = Dimensions.get("window").width;

  useEffect(() => {
    Animated.loop(
      Animated.timing(busAnim, { toValue: screenWidth + 100, duration: 12000, easing: Easing.linear, useNativeDriver: false })
    ).start();
  }, [busAnim, screenWidth]);

  return (
    <View style={[styles.busTrack, { pointerEvents: "none" }]}>
      <Animated.Text style={[styles.busEmoji, { transform: [{ translateX: busAnim }] }]}>🚌</Animated.Text>
    </View>
  );
}

/* ─── Reusable Components ─── */

function PulsingDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.6, duration: 800, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false })
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
        Animated.timing(pulse, { toValue: 0.4, duration: 1000, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: false })
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
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: false })
    ]));
    a.start();
    return () => a.stop();
  }, [pulse]);
  return (
    <Animated.View style={[styles.skeletonCard, {
      height,
      transform: [{
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.95, 1.05]
        })
      }],
      opacity: pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.7, 1]
      })
    }]}>
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
        onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: false, speed: 50, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: false, speed: 50, bounciness: 4 }).start()}>
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
        <GlowingOrb color="#2563eb" size={300} top={-100} left={-100} />
        <GlowingOrb color="#3b82f6" size={250} top={Dimensions.get("window").height - 200} left={Dimensions.get("window").width - 150} delay={1000} />
        
        <FadeInView delay={100} style={{ alignItems: "center", marginBottom: 10 }}>
          <Image source={require("./assets/logo.png")} resizeMode="contain" style={{ width: 100, height: 100 }} />
        </FadeInView>

        <FadeInView delay={200}>
          <HeroCard kicker="SkoolPath Driver" title={title} subtitle={subtitle} metrics={[]} />
        </FadeInView>

        <FadeInView delay={400} style={styles.authCard}>
          {children}
          <StatusLine message={statusMessage} connected={false} />
          <TouchableOpacity onPress={onSwitch} style={styles.switchWrap}>
            <Text style={styles.switchLine}>{switchLabel}{" "}<Text style={styles.switchAction}>{switchActionLabel}</Text></Text>
          </TouchableOpacity>
        </FadeInView>
        
        <DrivingBus />
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
        onPress={onPress} disabled={disabled || loading} activeOpacity={1}>
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
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, gap: 16, paddingBottom: 100 },

  authShell: { flex: 1, padding: 24, justifyContent: "center", gap: 14, backgroundColor: "#ffffff" },
  authCard: { 
    backgroundColor: "rgba(255, 255, 255, 0.9)", 
    borderRadius: 32, 
    padding: 24, 
    gap: 16, 
    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.1)",
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)"
  },
  switchWrap: { paddingVertical: 8, alignItems: "center" },

  heroCard: { 
    backgroundColor: "#0f172a", 
    borderRadius: 32, 
    padding: 26, 
    gap: 12, 
    overflow: "hidden",
    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.3)",
    elevation: 8
  },
  heroAccentDot: { position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(37, 99, 235, 0.3)" },
  kicker: { color: "#60a5fa", textTransform: "uppercase", fontSize: 13, letterSpacing: 2, fontWeight: "800" },
  title: { color: "#ffffff", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  subtitle: { color: "#94a3b8", fontSize: 16, lineHeight: 24 },

  busTrack: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    height: 40,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 23, 42, 0.05)",
    justifyContent: "center"
  },
  busEmoji: { fontSize: 32 },

  banner: { borderRadius: 20, paddingHorizontal: 20, paddingVertical: 16, boxShadow: "0 4px 10px rgba(15, 23, 42, 0.05)", elevation: 2 },
  bannerText: { fontSize: 16, fontWeight: "700", lineHeight: 24 },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4, justifyContent: "center" },
  statusDotView: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: "#475569", fontSize: 14, fontWeight: "600" },
  switchLine: { color: "#64748b", fontSize: 15 },
  switchAction: { color: "#2563eb", fontWeight: "800" },

  progressCard: { backgroundColor: "#ffffff", borderRadius: 28, padding: 22, boxShadow: "0 10px 20px rgba(15, 23, 42, 0.05)", elevation: 3 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  progressTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  progressCount: { fontSize: 16, fontWeight: "800", color: "#64748b" },
  progressBar: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: "#f1f5f9" },
  progressSegment: { height: 12 },
  progressLegend: { flexDirection: "row", gap: 18, flexWrap: "wrap", marginTop: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 14, color: "#64748b", fontWeight: "700" },

  stepperCard: { backgroundColor: "#ffffff", borderRadius: 28, padding: 22, boxShadow: "0 10px 20px rgba(15, 23, 42, 0.05)", elevation: 3 },
  stepperLabel: { fontSize: 14, fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5 },
  stepperRow: { paddingVertical: 12 },
  stepperItem: { alignItems: "center", width: 90 },
  stepperDotRow: { flexDirection: "row", alignItems: "center", width: 90, justifyContent: "center" },
  stepperDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", zIndex: 1 },
  stepperDotCurrent: { backgroundColor: "#16a34a", boxShadow: "0 0 10px #16a34a", elevation: 6 },
  stepperDotNext: { backgroundColor: "#2563eb", borderWidth: 4, borderColor: "#bfdbfe" },
  stepperDotPassed: { backgroundColor: "#dcfce7", borderWidth: 2, borderColor: "#16a34a" },
  stepperDotIdle: { backgroundColor: "#f1f5f9", borderWidth: 2, borderColor: "#e2e8f0" },
  stepperDotIcon: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  stepperCheckIcon: { color: "#16a34a", fontSize: 14, fontWeight: "900" },
  stepperLine: { position: "absolute", left: 55, right: -35, height: 4, backgroundColor: "#f1f5f9", zIndex: 0 },
  stepperLinePassed: { backgroundColor: "#16a34a" },
  stepperName: { fontSize: 12, color: "#64748b", marginTop: 8, textAlign: "center", fontWeight: "600" },

  card: { backgroundColor: "#ffffff", borderRadius: 28, padding: 22, gap: 12, boxShadow: "0 10px 20px rgba(15, 23, 42, 0.05)", elevation: 3 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  cardIcon: { fontSize: 22 },
  sectionTitle: { color: "#0f172a", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },

  floatingWrap: { marginBottom: 6, position: "relative" },
  floatingLabel: { position: "absolute", left: 16, zIndex: 1, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center" },
  floatingInput: { 
    flex: 1, 
    borderWidth: 2, 
    borderColor: "#f1f5f9", 
    borderRadius: 20, 
    paddingHorizontal: 16, 
    paddingVertical: 18, 
    backgroundColor: "#ffffff", 
    color: "#0f172a", 
    fontSize: 16,
    fontWeight: "600"
  },
  floatingInputFocused: { 
    borderColor: "#2563eb", 
    boxShadow: "0 0 10px rgba(37, 99, 237, 0.15)",
    elevation: 4,
    backgroundColor: "#ffffff"
  },
  inputWithToggle: { paddingRight: 75 },
  validationIcon: { position: "absolute", right: 18 },
  eyeButton: { position: "absolute", right: 16, padding: 6, borderRadius: 12, backgroundColor: "#f8fafc" },
  eyeIcon: { fontSize: 20 },

  gradientButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 18, boxShadow: "0 10px 20px rgba(37, 99, 235, 0.25)", elevation: 8 },
  styledButtonDisabled: { opacity: 0.5, shadowOpacity: 0 },
  gradientButtonIcon: { fontSize: 18 },
  gradientButtonLabel: { color: "#ffffff", fontSize: 17, fontWeight: "800" },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", gap: 14 },

  metricRow: { flexDirection: "row", gap: 12, flexWrap: "wrap", marginTop: 8 },
  metric: { backgroundColor: "rgba(255, 255, 255, 0.08)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, minWidth: 104, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.1)" },
  metricLabel: { color: "#60a5fa", fontSize: 12, textTransform: "uppercase", fontWeight: "800", letterSpacing: 1 },
  metricValue: { color: "#ffffff", fontSize: 19, fontWeight: "900", marginTop: 4 },

  grid: { gap: 18 },
  infoLine: { color: "#475569", fontSize: 15, lineHeight: 24, fontWeight: "500" },

  timelineCard: { backgroundColor: "#ffffff", borderRadius: 28, padding: 22, boxShadow: "0 10px 20px rgba(15, 23, 42, 0.05)", elevation: 3 },
  studentRow: { gap: 12, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: "#f1f5f9" },
  studentInfo: { flexDirection: "row", alignItems: "center", gap: 14 },
  studentAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarBoarded: { backgroundColor: "#dcfce7" },
  avatarDropped: { backgroundColor: "#dbeafe" },
  avatarWaiting: { backgroundColor: "#fff7ed" },
  avatarText: { fontSize: 18, fontWeight: "800", color: "#1e293b" },
  studentCopy: { flex: 1, gap: 4 },
  studentName: { color: "#0f172a", fontSize: 17, fontWeight: "800" },
  studentMeta: { color: "#64748b", fontSize: 14, fontWeight: "600" },
  studentStatusText: { fontWeight: "800" },
  attendanceButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  attendBtn: { borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, borderWidth: 2 },
  boardedBtn: { borderColor: "#dcfce7", backgroundColor: "#f0fdf4" },
  droppedBtn: { borderColor: "#dbeafe", backgroundColor: "#eff6ff" },
  attendBtnActive: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  attendBtnActiveBlue: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  attendBtnText: { fontSize: 14, fontWeight: "800", color: "#475569" },
  attendBtnTextActive: { color: "#ffffff" },

  skeletonCard: { backgroundColor: "#f1f5f9", borderRadius: 28, padding: 24, gap: 14, justifyContent: "center" },
  skeletonLine: { height: 16, backgroundColor: "#e2e8f0", borderRadius: 10, width: "85%" as never },

  scrollTopFab: { position: "absolute", bottom: 30, right: 30, width: 56, height: 56, borderRadius: 28, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 16px rgba(15, 23, 42, 0.3)", elevation: 8 },
  scrollTopIcon: { color: "#ffffff", fontSize: 22, fontWeight: "900" },

  /* Bottom Nav */
  bottomNav: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 85,
    backgroundColor: "rgba(255, 255, 255, 0.85)", 
    flexDirection: "row", justifyContent: "space-around", alignItems: "center",
    borderTopWidth: 1, borderTopColor: "rgba(15, 23, 42, 0.05)",
    paddingBottom: 20, paddingHorizontal: 10,
    boxShadow: "0 -10px 15px rgba(0, 0, 0, 0.05)", elevation: 10
  },
  tabItem: { alignItems: "center", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, gap: 4 },
  tabItemActive: { backgroundColor: "rgba(37, 99, 235, 0.08)" },
  tabIcon: { fontSize: 20, opacity: 0.6 },
  tabLabel: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  tabLabelActive: { color: "#2563eb" }
});
