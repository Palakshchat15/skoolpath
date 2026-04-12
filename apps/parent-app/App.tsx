import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, onSnapshot, query, setDoc, where, orderBy, limit } from "firebase/firestore";
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Modal
} from "react-native";
import MapSurface from "./MapSurface";
import {
  type BusLiveLocation,
  createDefaultBusState,
  distanceInKm,
  formatTimestamp,
  getBusById,
  getEtaMinutes,
  getBusDocumentRef,
  getFirebaseDb,
  getBusLiveLocation,
  getUserByEmail,
  hasFirebaseConfig,
  signInUser,
  signOutUser,
  signUpUser,
  calculateDelay,
  getSOSCollection,
  getNotificationsCollection,
  getUsersCollection,
  type AppNotification
} from "@skoolpath/shared";

type ParentScreen = "login" | "register" | "tracking";

type ParentSession = {
  screen: ParentScreen;
  email: string;
  fullName: string;
  schoolId: string;
  busId: string;
  studentName: string;
  stopName: string;
};

const sessionKey = "parent-session";

async function registerForPushNotificationsAsync() {
  let token;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }
  try {
    const projectId = "replace-this-with-your-eas-project-id";
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    try {
      token = (await Notifications.getExpoPushTokenAsync()).data;
    } catch {}
  }
  return token;
}

export default function App() {
  const firebaseReady = hasFirebaseConfig();
  const db = useMemo(() => (firebaseReady ? getFirebaseDb() : null), [firebaseReady]);
  const [screen, setScreen] = useState<ParentScreen>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [busId, setBusId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [stopName, setStopName] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    firebaseReady ? "Sign in to track child's bus live location." : "Firebase config missing."
  );
  const [busLocation, setBusLocation] = useState<BusLiveLocation>(createDefaultBusState());
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("tracking"); // New: Tab state
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [realNotifications, setRealNotifications] = useState<AppNotification[]>([]);
  const [showInbox, setShowInbox] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [hasNotifiedArrival, setHasNotifiedArrival] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setIsDataLoading(true);
    void loadSession().finally(() => setIsDataLoading(false));
  }, []);

  useEffect(() => {
    if (!db || screen !== "tracking" || !schoolId.trim() || !busId.trim()) {
      return;
    }

    setIsDataLoading(true);
    const unsubscribe = onSnapshot(doc(db, `schools/${schoolId}/buses/${busId}`), (snapshot) => {
      setIsDataLoading(false);
      if (!snapshot.exists()) {
        setStatusMessage("Bus has not started publishing live data yet.");
        return;
      }

      const data = snapshot.data() as Omit<BusLiveLocation, "updatedAt"> & {
        updatedAt?: { toDate?: () => Date };
      };

      setBusLocation({
        ...data,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString()
      });
      setStatusMessage("Live tracking connected.");
    });

    return () => unsubscribe();
  }, [busId, db, schoolId, screen]);

  useEffect(() => {
    if (screen !== "tracking" || !db || !email) return;

    const notifQuery = query(
      getNotificationsCollection(db),
      where("targetEmail", "in", [email, `bus_${busId}`, "all_parents", "route_parents"]),
      limit(20)
    );

    const unsubscribe = onSnapshot(notifQuery, (snapshot) => {
      // Manual sorting to avoid Firestore composite index requirements
      const list = snapshot.docs
        .map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as AppNotification))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setRealNotifications(list);

      // Trigger local push for brand new notification
      if (!snapshot.metadata.fromCache && snapshot.docChanges().length > 0) {
        snapshot.docChanges().forEach(change => {
          if (change.type === "added") {
            const data = change.doc.data();
            Notifications.scheduleNotificationAsync({
              content: { 
                title: data.title, 
                body: data.message, 
                sound: true,
              },
              trigger: null
            });
          }
        });
      }
    }, (error) => {
      console.error("Parent Notif Listener Error:", error);
    });

    return () => unsubscribe();
  }, [screen, db, email, busId]);

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    } as any),
  });

  const loadSession = async () => {
    const saved = await AsyncStorage.getItem(sessionKey);
    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved) as ParentSession;
    if (firebaseReady && db && parsed.email) {
      const userRecord = await getUserByEmail(db, parsed.email);
      if (!userRecord || userRecord.role !== "parent") {
        await AsyncStorage.removeItem(sessionKey);
        setStatusMessage("Your saved parent session was cleared because the profile no longer exists in Firebase.");
        return;
      }
    }

    setScreen(parsed.screen);
    setEmail(parsed.email);
    setFullName(parsed.fullName);
    setSchoolId(parsed.schoolId);
    setBusId(parsed.busId);
    setStudentName(parsed.studentName);
    setStopName(parsed.stopName);
    setStatusMessage("Session restored.");
  };

  const persistSession = async (nextScreen: ParentScreen) => {
    const payload: ParentSession = {
      screen: nextScreen,
      email,
      fullName,
      schoolId,
      busId,
      studentName,
      stopName
    };
    await AsyncStorage.setItem(sessionKey, JSON.stringify(payload));
  };

  const trackedStudent =
    busLocation.students.find((student) => student.name === studentName) ?? busLocation.students[0] ?? null;
  const trackedStop =
    busLocation.routeStops.find((stop) => stop.name === stopName) ?? busLocation.routeStops[0] ?? null;
  const distanceKm = distanceInKm(
    busLocation.latitude,
    busLocation.longitude,
    trackedStop?.latitude ?? busLocation.latitude,
    trackedStop?.longitude ?? busLocation.longitude
  );
  const etaMinutes = getEtaMinutes(distanceKm, busLocation.speed);

  useEffect(() => {
    if (busLocation.tripActive && distanceKm <= 0.5 && !hasNotifiedArrival) {
      setHasNotifiedArrival(true);
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Bus is Approaching!",
          body: `Your bus is less than 500 meters away and arriving shortly.`,
          sound: true,
        },
        trigger: null
      });
    } else if (!busLocation.tripActive || distanceKm > 1.0) {
      setHasNotifiedArrival(false);
    }
  }, [distanceKm, busLocation.tripActive, hasNotifiedArrival]);

  const notificationsSummary = realNotifications.length > 0 
    ? realNotifications.slice(0, 3).map(n => `${n.title}: ${n.message}`)
    : [
        busLocation.tripActive
          ? `Bus is moving and about ${etaMinutes} minutes away.`
          : "Bus trip has not started yet.",
        `Latest event: ${busLocation.lastEvent}.`
      ];

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      let nextFullName = fullName;
      let nextSchoolId = schoolId;
      let nextBusId = busId;
      let nextStudentName = studentName;
      let nextStopName = stopName;

      if (firebaseReady) {
        await signInUser(email, password);
        const userRecord = await getUserByEmail(db!, email);
        if (!userRecord || userRecord.role !== "parent") {
          await signOutUser();
          setStatusMessage("No parent profile exists for this account. Ask the admin to create the parent record first.");
          return;
        }

        nextFullName = userRecord.fullName || "";
        nextSchoolId = userRecord.schoolId || "";
        nextBusId = userRecord.busId || "";
        nextStudentName = userRecord.studentName || "";
        nextStopName = userRecord.stopName || "";

        setFullName(nextFullName);
        setSchoolId(nextSchoolId);
        setBusId(nextBusId);
        setStudentName(nextStudentName);
        setStopName(nextStopName);

        if (userRecord.busId) {
          const busRecord = await getBusById(db!, userRecord.busId);
          if (busRecord) {
            nextBusId = busRecord.id;
            nextSchoolId = busRecord.schoolId;
            const liveBus = await getBusLiveLocation(db!, busRecord.schoolId, busRecord.id);
            setBusId(nextBusId);
            setSchoolId(nextSchoolId);
            setBusLocation({
              ...createDefaultBusState(),
              ...liveBus,
              schoolId: busRecord.schoolId,
              busId: busRecord.id,
              busLabel: busRecord.label,
              routeName: busRecord.routeName,
              driverId: busRecord.driverId
            });
          }
        }
        if (!userRecord.busId) {
          setStatusMessage("No bus is assigned to this parent account yet. Ask the admin to assign a bus, student, and stop.");
        }

        const expoPushToken = await registerForPushNotificationsAsync();
        if (expoPushToken) {
           const userRef = doc(getUsersCollection(db!), userRecord.id);
           await setDoc(userRef, { expoPushToken }, { merge: true });
        }
      }
      setScreen("tracking");
      await AsyncStorage.setItem(
        sessionKey,
        JSON.stringify({
          screen: "tracking",
          email,
          fullName: nextFullName,
          schoolId: nextSchoolId,
          busId: nextBusId,
          studentName: nextStudentName,
          stopName: nextStopName
        } satisfies ParentSession)
      );
      if (!nextBusId && firebaseReady) {
        return;
      }
      setStatusMessage(firebaseReady ? "Signed in with Firebase." : "Demo mode login successful.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    try {
      setIsLoading(true);
      if (firebaseReady) {
        await signUpUser(email, password);
        await signOutUser();
        setStatusMessage("Account created in Authentication. Ask the admin to create your parent profile before login.");
        setScreen("login");
        return;
      }
      setScreen("tracking");
      await persistSession("tracking");
      setStatusMessage(firebaseReady ? "Account created and signed in." : "Demo mode registration successful.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to register.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (firebaseReady) {
      await signOutUser();
    }
    await AsyncStorage.removeItem(sessionKey);
    setScreen("login");
    setStatusMessage("Signed out.");
  };

  const handleSave = async () => {
    setIsLoading(true);
    await persistSession("tracking");
    setIsLoading(false);
  };

  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    setShowScrollTop(event.nativeEvent.contentOffset.y > 300);
  };

  const handleSOS = () => {
    Alert.alert(
      "Emergency SOS",
      "Trigger an immediate SOS alert to the dashboard?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Trigger SOS", 
          style: "destructive", 
          onPress: async () => {
            if (!db || !schoolId) return;
            setIsLoading(true);
            try {
              const alertRef = doc(getSOSCollection(db));
              await setDoc(alertRef, {
                id: alertRef.id,
                parentId: email,
                parentName: fullName,
                studentName,
                busId,
                schoolId,
                timestamp: new Date().toISOString(),
                resolved: false
              });
              Alert.alert("SOS Sent", "The administration has been notified immediately.");
            } catch (error) {
              setStatusMessage(error instanceof Error ? error.message : "Failed to send SOS");
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  /* ─── Auth Screens ─── */
  if (screen === "login") {
    return (
      <AuthLayout
        title="Parent Login"
        subtitle="Sign in to view your child's bus live location, ETA, and ride status."
        switchLabel="Need an account?"
        switchActionLabel="Register"
        onSwitch={() => setScreen("register")}
        statusMessage={statusMessage}
      >
        <FloatingInput label="Email" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <FloatingInput label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry />
        <GradientButton icon="🔓" label="Login" onPress={() => void handleLogin()} loading={isLoading} colors={["#2563eb", "#1d4ed8"]} />
      </AuthLayout>
    );
  }

  if (screen === "register") {
    return (
      <AuthLayout
        title="Parent Register"
        subtitle="Create your parent account to start tracking assigned buses and receiving updates."
        switchLabel="Already have an account?"
        switchActionLabel="Login"
        onSwitch={() => setScreen("login")}
        statusMessage={statusMessage}
      >
        <FloatingInput label="Full Name" placeholder="Enter your full name" value={fullName} onChangeText={setFullName} />
        <FloatingInput label="Email" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <FloatingInput label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry />
        <GradientButton icon="✨" label="Register" onPress={() => void handleRegister()} loading={isLoading} colors={["#2563eb", "#1d4ed8"]} />
      </AuthLayout>
    );
  }

  /* ─── Tracking Screen ─── */
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} onScroll={handleScroll} scrollEventThrottle={100}>
        {activeTab === "tracking" ? (
          <FadeInView delay={100} style={{ gap: 16 }}>
            <HeroCard kicker="Parent Tracker" title="Your child's ride, live and clear."
              subtitle="Track the bus on a real map, watch ETA, and stay updated on every route event."
              metrics={[
                { label: "ETA", value: `${etaMinutes} min` },
                { label: "Bus", value: busId || "Unassigned" },
                { label: "Status", value: trackedStudent?.status ?? "Unknown" }
              ]} />

            <TripStatusBanner tripActive={busLocation.tripActive} lastEvent={busLocation.lastEvent} etaMinutes={etaMinutes} stopName={trackedStop?.name ?? "your stop"} />

            {isDataLoading ? <SkeletonCard height={120} /> : (
              <View style={styles.etaSection}>
                <EtaRing etaMinutes={etaMinutes} maxMinutes={60} />
                <View style={styles.etaInfo}>
                  <Text style={styles.etaInfoTitle}>Estimated Arrival</Text>
                  <Text style={styles.etaInfoValue}>{etaMinutes} min</Text>
                  <Text style={styles.etaInfoSub}>{distanceKm.toFixed(1)} km away • {Math.round(busLocation.speed)} m/s</Text>
                </View>
              </View>
            )}

            <MapSurface busLocation={busLocation} />

            <View style={styles.grid}>
              {isDataLoading ? (
                <><SkeletonCard height={140} /><SkeletonCard height={140} /></>
              ) : (
                <>
                  <InfoCard icon="📋" title="Ride Summary" lines={[
                    `Student: ${studentName || "Not assigned yet"}`,
                    `Driver: ${busLocation.driverName || "No driver assigned"}`,
                    `Last synced: ${formatTimestamp(busLocation.updatedAt)}`
                  ]} />
                  <InfoCard icon="🔔" title="Notifications" lines={notificationsSummary} onPress={() => setShowInbox(true)} />
                </>
              )}
            </View>

            <View style={styles.timelineCard}>
              <Text style={styles.sectionTitle}>Route Timeline</Text>
              {isDataLoading ? <SkeletonCard height={200} /> : 
                busLocation.routeStops.length ? busLocation.routeStops.map((stop, index) => {
                  const isCurrent = stop.id === busLocation.currentStopId;
                  const isNext = stop.id === busLocation.nextStopId;
                  const isLast = index === busLocation.routeStops.length - 1;
                  return (
                    <View key={stop.id} style={styles.timelineStop}>
                      <View style={styles.timelineDotCol}>
                        <View style={[styles.timelineDot, isCurrent ? styles.timelineDotCurrent : isNext ? styles.timelineDotNext : styles.timelineDotIdle]}>
                          {isCurrent && <PulsingDot color="#16a34a" />}
                        </View>
                        {!isLast && <View style={styles.timelineLine} />}
                      </View>
                      <View style={styles.timelineContent}>
                        <View style={styles.timelineRow}>
                          <View>
                            <Text style={[styles.stopName, isCurrent && styles.stopNameCurrent]}>{stop.name}</Text>
                            <Text style={styles.stopTime}>Scheduled: {stop.scheduledTime}</Text>
                          </View>
                          {(isCurrent || isNext) && (
                            <View style={[styles.stopBadge, isCurrent ? styles.badgeCurrent : styles.badgeNext]}>
                              <Text style={styles.stopBadgeText}>{isCurrent ? "● Current" : "◎ Next"}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                }) : <Text style={styles.infoLine}>No route stops yet.</Text>
              }
            </View>
          </FadeInView>
        ) : activeTab === "notifications" ? (
          <FadeInView delay={100} style={{ gap: 16 }}>
            <InfoCard icon="🔔" title="Recent Alerts" lines={notificationsSummary} />
            {realNotifications.map(n => (
              <View key={n.id} style={styles.card}>
                <Text style={{ fontWeight: "800" }}>{n.title}</Text>
                <Text style={{ color: "#64748b" }}>{n.message}</Text>
              </View>
            ))}
          </FadeInView>
        ) : (
          <FadeInView delay={100} style={styles.card}>
            <Text style={styles.sectionTitle}>Account Settings</Text>
            <FloatingInput label="Full Name" value={fullName} onChangeText={setFullName} />
            <FloatingInput label="Email" value={email} onChangeText={setEmail} />
            <FloatingInput label="Assigned Bus ID" value={busId} onChangeText={setBusId} />
            <TouchableOpacity onPress={() => void handleLogout()} style={{ marginTop: 10 }}>
              <StatusLine message="Tap here to sign out" connected={false} />
            </TouchableOpacity>
          </FadeInView>
        )}
      </ScrollView>

      <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />
      
      {showScrollTop && (
        <TouchableOpacity style={[styles.scrollTopFab, { bottom: 100 }]} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} activeOpacity={0.8}>
          <Text style={styles.scrollTopIcon}>↑</Text>
        </TouchableOpacity>
      )}

      {/* SOS FAB */}
      <TouchableOpacity
        style={styles.sosFab}
        onPress={handleSOS}
        activeOpacity={0.8}
      >
        <Text style={styles.sosIcon}>🚨</Text>
      </TouchableOpacity>

      {/* Notification Inbox Modal */}
      <Modal visible={showInbox} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.inboxCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Inbox History</Text>
              <TouchableOpacity onPress={() => setShowInbox(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ marginTop: 10 }}>
              {realNotifications.length ? realNotifications.map(n => (
                <View key={n.id} style={styles.notifItem}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.notifTitle}>{n.title}</Text>
                    <Text style={styles.notifTime}>{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <Text style={styles.notifBody}>{n.message}</Text>
                </View>
              )) : (
                <Text style={{ textAlign: "center", color: "#64748b", marginTop: 40 }}>No past notifications found.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ─── Navigation ─── */
function BottomNavBar({ activeTab, onTabChange }: { activeTab: string; onTabChange: (t: string) => void }) {
  return (
    <View style={styles.bottomNav}>
      <TabItem icon="🗺️" label="Track" active={activeTab === "tracking"} onPress={() => onTabChange("tracking")} />
      <TabItem icon="🔔" label="Alerts" active={activeTab === "notifications"} onPress={() => onTabChange("notifications")} />
      <TabItem icon="👤" label="Profile" active={activeTab === "settings"} onPress={() => onTabChange("settings")} />
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
      top, left, opacity: 0.1, filter: "blur(40px)", transform: [{ scale: pulse }]
    } as any} />
  );
}

function DrivingBus() {
  const busAnim = useRef(new Animated.Value(-100)).current;
  const screenWidth = Dimensions.get("window").width;

  useEffect(() => {
    Animated.loop(
      Animated.timing(busAnim, { toValue: screenWidth + 100, duration: 12000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [busAnim, screenWidth]);

  return (
    <View style={styles.busTrack}>
      <Animated.Text style={[styles.busEmoji, { transform: [{ translateX: busAnim }] }]}>🚌</Animated.Text>
    </View>
  );
}

/* ─── Pulsing Dot ─── */
function PulsingDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: color,
        opacity: 0.3,
        transform: [{ scale: pulse }]
      }}
    />
  );
}

/* ─── Status Line with Pulse ─── */
function StatusLine({ message, connected }: { message: string; connected: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (connected) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true })
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [connected, pulse]);

  return (
    <View style={styles.statusRow}>
      <Animated.View style={[
        styles.statusDotView,
        { backgroundColor: connected ? "#16a34a" : "#f59e0b", opacity: connected ? pulse : 1 }
      ]} />
      <Text style={styles.statusText}>{message}</Text>
    </View>
  );
}

/* ─── Skeleton Card ─── */
function SkeletonCard({ height }: { height: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.skeletonCard,
        {
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
        }
      ]}
    >
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, { width: "60%" }]} />
      <View style={[styles.skeletonLine, { width: "40%" }]} />
    </Animated.View>
  );
}

/* ─── ETA Ring ─── */
function EtaRing({ etaMinutes, maxMinutes }: { etaMinutes: number; maxMinutes: number }) {
  const progress = Math.min(etaMinutes / maxMinutes, 1);
  const color = etaMinutes <= 5 ? "#16a34a" : etaMinutes <= 15 ? "#f59e0b" : "#2563eb";

  return (
    <View style={styles.etaRingWrap}>
      <View style={styles.etaRingBg}>
        <Text style={[styles.etaRingValue, { color }]}>{etaMinutes}</Text>
        <Text style={styles.etaRingLabel}>min</Text>
      </View>
      <View style={[styles.etaRingCircle, { borderColor: color, borderWidth: 5, opacity: 0.15 }]} />
      <View style={[styles.etaRingCircle, {
        borderColor: color,
        borderWidth: 5,
        borderTopColor: "transparent",
        borderRightColor: progress > 0.25 ? color : "transparent",
        borderBottomColor: progress > 0.5 ? color : "transparent",
        borderLeftColor: progress > 0.75 ? color : "transparent",
        transform: [{ rotate: "-90deg" }]
      }]} />
    </View>
  );
}

/* ─── Trip Status Banner ─── */
function TripStatusBanner({ tripActive, lastEvent, etaMinutes, stopName }: {
  tripActive: boolean; lastEvent: string; etaMinutes: number; stopName: string;
}) {
  const isArrived = lastEvent.toLowerCase().includes("arrived");
  const bannerColor = !tripActive ? "#fef3c7" : isArrived ? "#dbeafe" : "#dcfce7";
  const textColor = !tripActive ? "#92400e" : isArrived ? "#1e3a8a" : "#14532d";
  const icon = !tripActive ? "⏸" : isArrived ? "📍" : "🚌";
  const message = !tripActive
    ? "Bus trip has not started yet"
    : isArrived ? `Bus has arrived at ${stopName}`
      : `Bus is on the way — ${etaMinutes} min to ${stopName}`;

  return (
    <View style={[styles.banner, { backgroundColor: bannerColor }]}>
      <Text style={[styles.bannerText, { color: textColor }]}>{icon}  {message}</Text>
    </View>
  );
}

/* ─── Auth Layout ─── */
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
          <Image source={require("./assets/logo.png")} style={{ width: 100, height: 100 }} resizeMode="contain" />
        </FadeInView>

        <FadeInView delay={200}>
          <HeroCard kicker="SkoolPath Parent" title={title} subtitle={subtitle} metrics={[]} />
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

/* ─── Hero Card ─── */
function HeroCard({ kicker, title, subtitle, metrics }: {
  kicker: string; title: string; subtitle: string; metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroAccentDot} />
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

/* ─── Floating Label Input ─── */
function FloatingInput({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType }: {
  label: string; placeholder?: string; value: string;
  onChangeText: (value: string) => void; secureTextEntry?: boolean; keyboardType?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureTextEntry ?? false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(labelAnim, {
      toValue: focused || value ? 1 : 0,
      duration: 180,
      useNativeDriver: false
    }).start();
  }, [focused, value, labelAnim]);

  const isFloated = focused || !!value;
  const hasError = secureTextEntry && value.length > 0 && value.length < 6;
  const isValid = !secureTextEntry ? (value.length > 0) : (value.length >= 6);

  return (
    <View style={styles.floatingWrap}>
      <Animated.Text style={[
        styles.floatingLabel,
        {
          top: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, -10] }),
          fontSize: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 12] }),
          color: focused ? "#2563eb" : "#64748b",
          backgroundColor: isFloated ? "#ffffff" : "transparent",
          paddingHorizontal: isFloated ? 6 : 0
        }
      ]}>
        {label}
      </Animated.Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.floatingInput,
            focused && styles.floatingInputFocused,
            secureTextEntry ? styles.inputWithToggle : null
          ]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={hidden}
          placeholderTextColor="#cbd5e1"
          autoCapitalize="none"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {/* Validation icon */}
        {value.length > 0 && !secureTextEntry && (
          <View style={styles.validationIcon}>
            <Text style={{ color: "#16a34a", fontSize: 14 }}>✓</Text>
          </View>
        )}
        {secureTextEntry && value.length > 0 && (
          <View style={[styles.validationIcon, { right: 40 }]}>
            <Text style={{ color: hasError ? "#dc2626" : "#16a34a", fontSize: 14 }}>
              {hasError ? "✗" : "✓"}
            </Text>
          </View>
        )}
        {secureTextEntry && (
          <TouchableOpacity style={styles.eyeButton} onPress={() => setHidden(!hidden)}>
            <Text style={styles.eyeIcon}>{hidden ? "👁" : "🙈"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/* ─── Gradient Button with Scale + Loading ─── */
function GradientButton({ icon, label, onPress, loading, colors, disabled, style }: {
  icon: string; label: string; onPress: () => void;
  colors: string[]; loading?: boolean; disabled?: boolean; style?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={[styles.gradientButton, { backgroundColor: colors[0] }, (disabled || loading) && styles.styledButtonDisabled]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.gradientButtonIcon}>{icon}</Text>
        )}
        <Text style={styles.gradientButtonLabel}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ─── Metric Pill ─── */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

/* ─── Info Card ─── */
function InfoCard({ icon, title, lines, onPress }: { icon: string; title: string; lines: string[]; onPress?: () => void }) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.cardIcon}>{icon}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {onPress && <Text style={{ color: "#2563eb", fontSize: 13, fontWeight: "700" }}>View All</Text>}
      </View>
      {lines.map((line, i) => (
        <Text key={i} style={styles.infoLine} numberOfLines={1}>{line}</Text>
      ))}
    </TouchableOpacity>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, gap: 16, paddingBottom: 100 },

  /* Auth */
  authShell: { flex: 1, padding: 24, justifyContent: "center", gap: 14, backgroundColor: "#ffffff" },
  authCard: {
    backgroundColor: "rgba(255, 255, 255, 0.9)", 
    borderRadius: 32, 
    padding: 24, 
    gap: 16,
    shadowColor: "#0f172a", 
    shadowOffset: { width: 0, height: 20 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 40, 
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)"
  },
  switchWrap: { paddingVertical: 8, alignItems: "center" },

  /* Status */
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4, justifyContent: "center" },
  statusDotView: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: "#475569", fontSize: 14, fontWeight: "600" },
  switchLine: { color: "#64748b", fontSize: 15 },
  switchAction: { color: "#2563eb", fontWeight: "800" },

  /* Hero */
  heroCard: { 
    backgroundColor: "#0f172a", 
    borderRadius: 32, 
    padding: 26, 
    gap: 12, 
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8
  },
  heroAccentDot: {
    position: "absolute", top: -40, right: -40, width: 140, height: 140,
    borderRadius: 70, backgroundColor: "rgba(37, 99, 235, 0.3)"
  },
  kicker: { color: "#60a5fa", textTransform: "uppercase", fontSize: 13, letterSpacing: 2, fontWeight: "800" },
  title: { color: "#ffffff", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  subtitle: { color: "#94a3b8", fontSize: 16, lineHeight: 24 },

  /* Bus Track */
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

  /* Banner */
  banner: {
    borderRadius: 20, paddingHorizontal: 20, paddingVertical: 16,
    shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2
  },
  bannerText: { fontSize: 16, fontWeight: "700", lineHeight: 24 },

  /* ETA */
  etaSection: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#ffffff", borderRadius: 28, padding: 22, gap: 20,
    shadowColor: "#0f172a", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 3
  },
  etaRingWrap: { width: 110, height: 110, alignItems: "center", justifyContent: "center" },
  etaRingBg: { alignItems: "center", justifyContent: "center" },
  etaRingValue: { fontSize: 32, fontWeight: "900" },
  etaRingLabel: { fontSize: 13, color: "#64748b", fontWeight: "700" },
  etaRingCircle: { position: "absolute", width: 104, height: 104, borderRadius: 52 },
  etaInfo: { flex: 1, gap: 4 },
  etaInfoTitle: { fontSize: 14, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: "800" },
  etaInfoValue: { fontSize: 36, fontWeight: "900", color: "#0f172a" },
  etaInfoSub: { fontSize: 15, color: "#94a3b8", fontWeight: "500" },

  /* Cards */
  card: {
    backgroundColor: "#ffffff", borderRadius: 28, padding: 22, gap: 12,
    shadowColor: "#0f172a", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 3
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  cardIcon: { fontSize: 22 },
  sectionTitle: { color: "#0f172a", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },

  /* Floating Input */
  floatingWrap: { marginBottom: 6, position: "relative" },
  floatingLabel: { position: "absolute", left: 16, zIndex: 1, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center" },
  floatingInput: {
    flex: 1, borderWidth: 2, borderColor: "#f1f5f9", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 18, backgroundColor: "#ffffff",
    color: "#0f172a", fontSize: 16, fontWeight: "600"
  },
  floatingInputFocused: {
    borderColor: "#2563eb",
    shadowColor: "#2563eb", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4,
    backgroundColor: "#ffffff"
  },
  inputWithToggle: { paddingRight: 75 },
  validationIcon: { position: "absolute", right: 18 },
  eyeButton: { position: "absolute", right: 16, padding: 6, borderRadius: 12, backgroundColor: "#f8fafc" },
  eyeIcon: { fontSize: 20 },

  /* Gradient Button */
  gradientButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 20, paddingHorizontal: 22, paddingVertical: 18,
    shadowColor: "#2563eb", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 8
  },
  styledButtonDisabled: { opacity: 0.5, shadowOpacity: 0 },
  gradientButtonIcon: { fontSize: 18 },
  gradientButtonLabel: { color: "#ffffff", fontSize: 17, fontWeight: "800" },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", gap: 14 },

  /* Metrics */
  metricRow: { flexDirection: "row", gap: 12, flexWrap: "wrap", marginTop: 8 },
  metric: {
    backgroundColor: "rgba(255, 255, 255, 0.08)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, minWidth: 104,
    borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.1)"
  },
  metricLabel: { color: "#60a5fa", fontSize: 12, textTransform: "uppercase", fontWeight: "800", letterSpacing: 1 },
  metricValue: { color: "#ffffff", fontSize: 19, fontWeight: "900", marginTop: 4 },

  /* Grid */
  grid: { gap: 18 },
  infoLine: { color: "#475569", fontSize: 15, lineHeight: 24, fontWeight: "500" },

  /* Timeline */
  timelineCard: {
    backgroundColor: "#ffffff", borderRadius: 28, padding: 22,
    shadowColor: "#0f172a", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 3
  },
  timelineStop: { flexDirection: "row", minHeight: 70 },
  timelineDotCol: { width: 40, alignItems: "center" },
  timelineDot: { width: 16, height: 16, borderRadius: 8, marginTop: 6, zIndex: 1, alignItems: "center", justifyContent: "center" },
  timelineDotCurrent: {
    backgroundColor: "#16a34a", borderWidth: 4, borderColor: "#dcfce7",
    width: 20, height: 20, borderRadius: 10, marginTop: 4
  },
  timelineDotNext: { backgroundColor: "#2563eb", borderWidth: 4, borderColor: "#dbeafe" },
  timelineDotIdle: { backgroundColor: "#f1f5f9", borderWidth: 2, borderColor: "#e2e8f0" },
  timelineLine: { flex: 1, width: 3, backgroundColor: "#f1f5f9", marginVertical: 4 },
  timelineContent: { flex: 1, paddingBottom: 20, paddingLeft: 12 },
  timelineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stopName: { color: "#0f172a", fontSize: 17, fontWeight: "700" },
  stopNameCurrent: { color: "#16a34a", fontWeight: "800" },
  stopTime: { color: "#64748b", fontSize: 14, marginTop: 4, fontWeight: "600" },
  stopBadge: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  badgeCurrent: { backgroundColor: "#dcfce7" },
  badgeNext: { backgroundColor: "#dbeafe" },
  stopBadgeText: { fontSize: 13, fontWeight: "800", color: "#0f172a" },

  /* Skeleton */
  skeletonCard: {
    backgroundColor: "#f1f5f9", borderRadius: 28, padding: 24, gap: 14, justifyContent: "center"
  },
  skeletonLine: {
    height: 16, backgroundColor: "#e2e8f0", borderRadius: 10, width: "85%" as never
  },

  /* Scroll-to-top FAB */
  scrollTopFab: {
    position: "absolute", bottom: 30, right: 30, width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center",
    shadowColor: "#0f172a", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8
  },
  scrollTopIcon: { color: "#ffffff", fontSize: 22, fontWeight: "900" },

  /* Bottom Nav */
  bottomNav: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 85,
    backgroundColor: "rgba(255, 255, 255, 0.85)", 
    flexDirection: "row", justifyContent: "space-around", alignItems: "center",
    borderTopWidth: 1, borderTopColor: "rgba(15, 23, 42, 0.05)",
    paddingBottom: 20, paddingHorizontal: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.05, shadowRadius: 15, elevation: 10
  },
  tabItem: { alignItems: "center", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, gap: 4 },
  tabItemActive: { backgroundColor: "rgba(37, 99, 235, 0.08)" },
  tabIcon: { fontSize: 20, opacity: 0.6 },
  tabLabel: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  tabLabelActive: { color: "#2563eb" },

  sosFab: {
    position: "absolute", bottom: 100, right: 24, width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#dc2626", justifyContent: "center", alignItems: "center",
    shadowColor: "#dc2626", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10
  },
  sosIcon: { color: "#ffffff", fontSize: 26 },

  /* Modal & Inbox */
  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "flex-end" },
  inboxCard: {
    backgroundColor: "#ffffff", borderTopLeftRadius: 40, borderTopRightRadius: 40,
    padding: 26, paddingBottom: 50, height: "75%", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 32
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  closeBtn: { fontSize: 24, color: "#94a3b8", padding: 6, fontWeight: "700" },
  notifItem: { paddingVertical: 18, borderBottomWidth: 1.5, borderBottomColor: "#f1f5f9" },
  notifTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  notifTime: { fontSize: 13, color: "#94a3b8", fontWeight: "600" },
  notifBody: { fontSize: 15, color: "#475569", marginTop: 6, lineHeight: 24, fontWeight: "500" }
});
