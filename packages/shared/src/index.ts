import { FirebaseApp, FirebaseError, getApp, getApps, initializeApp } from "firebase/app";
import {
  Auth,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  CollectionReference,
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where
} from "firebase/firestore";

export type RouteStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  order: number;
  scheduledTime: string; // e.g. "07:30"
  actualArrivalTime?: string; // ISO string when the bus actually arrives
};

export type StudentRideStatus = "waiting" | "boarded" | "dropped";

export type StudentAssignment = {
  id: string;
  name: string;
  stopId: string;
  stopName: string;
  status: StudentRideStatus;
  guardianName: string;
};

export function isFirebaseError(error: unknown): error is { code: string; message: string } {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

export function calculateDelay(scheduledTime: string, actualArrivalTime?: string) {
  if (!actualArrivalTime) return null;
  const actualDate = new Date(actualArrivalTime);
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const scheduledDate = new Date(actualDate);
  scheduledDate.setHours(hours ?? 0, minutes ?? 0, 0, 0);

  const diffMinutes = Math.round((actualDate.getTime() - scheduledDate.getTime()) / 60000);
  
  if (diffMinutes <= 2 && diffMinutes > -5) return { status: "ontime", text: "On Time", minutes: diffMinutes };
  if (diffMinutes > 2) return { status: "delayed", text: `${diffMinutes}m Delayed`, minutes: diffMinutes };
  return { status: "early", text: `${Math.abs(diffMinutes)}m Early`, minutes: diffMinutes };
};

export type SchoolRecord = {
  id: string;
  name: string;
  city: string;
  contactEmail: string;
  transportManager: string;
};

export type BusRecord = {
  id: string;
  schoolId: string;
  label: string;
  plateNumber: string;
  driverId: string;
  routeName: string;
  capacity: number;
};

export type UserRole = "parent" | "driver" | "school-admin" | "super-admin";

export type UserRecord = {
  id: string;
  schoolId: string;
  fullName: string;
  email: string;
  role: UserRole;
  phone: string;
  busId?: string;
  studentName?: string;
  stopName?: string;
  expoPushToken?: string;
};

export type BusLiveLocation = {
  schoolId: string;
  busId: string;
  driverId: string;
  driverName: string;
  busLabel: string;
  routeName: string;
  tripActive: boolean;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  accuracy: number | null;
  currentStopId: string;
  currentStopName: string;
  nextStopId: string;
  nextStopName: string;
  routeStops: RouteStop[];
  students: StudentAssignment[];
  lastEvent: string;
  updatedAt: string;
};

export type TripRecord = {
  id: string; // tripId
  schoolId: string;
  busId: string;
  busLabel: string;
  routeName: string;
  driverId: string;
  driverName: string;
  startedAt: string;
  endedAt?: string; // missing if active
  status: "active" | "completed";
  lastKnownLatitude: number;
  lastKnownLongitude: number;
  lastKnownSpeed: number;
  lastEvent: string;
  totalStudents: number;
  updatedAt?: string;
};

export type SOSAlert = {
  id: string;
  parentId: string;
  parentName: string;
  studentName?: string;
  busId?: string;
  schoolId: string;
  timestamp: string;
  resolved: boolean;
};

export type AppNotification = {
  id: string;
  type: "system" | "driver" | "sos" | "trip_started";
  targetEmail: string; // email of the parent, or busId for a group blast
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  recipientName?: string;
  status?: "sent" | "pending" | "failed";
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  durationDays: number;
  maxSchools: number;
  maxStudents: number;
  maxBuses: number;
  maxDrivers: number;
  features: string[];
  active: boolean;
};

export type Subscription = {
  id: string;
  schoolId: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  status: "active" | "expired" | "pending" | "cancelled";
  startDate: string;
  expiryDate: string;
  nextBillingDate?: string;
};

export type RouteConfig = {
  id: string;
  name: string;
  schoolId: string;
  type: "pickup" | "drop";
  busId: string;
  driverId?: string;
  stops: RouteStop[];
  startTime: string;
  endTime: string;
  active: boolean;
};

export type AlertConfig = {
  id: string;
  schoolId: string; // "global" for system-wide defaults
  pickupAlerts: {
    busStarted: { enabled: boolean; advanceMinutes: number };
    oneStopAway: { enabled: boolean; proximityRadiusKm: number; advanceMinutes: number };
    arrivedAtStop: { enabled: boolean; arrivalRadiusKm: number; advanceMinutes: number };
    schoolReached: { enabled: boolean; arrivalRadiusKm: number; advanceMinutes: number };
  };
  dropoffAlerts: {
    studentOnboard: { enabled: boolean; advanceMinutes: number };
    busStartedDropoff: { enabled: boolean; advanceMinutes: number };
    oneStopAwayDropoff: { enabled: boolean; proximityRadiusKm: number; advanceMinutes: number };
    studentDroppedOff: { enabled: boolean; advanceMinutes: number };
  };
};

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "replace-me",
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "replace-me",
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "replace-me",
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "replace-me",
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
    "replace-me",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "replace-me"
};

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export const hasFirebaseConfig = () =>
  Object.values(firebaseConfig).every((value) => value && value !== "replace-me");

export const getFirebaseApp = () => {
  if (!hasFirebaseConfig()) {
    throw new Error("Firebase environment variables are missing.");
  }

  if (appInstance) {
    return appInstance;
  }

  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return appInstance;
};

export const getFirebaseDb = () => {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
};

export const getFirebaseAuth = () => {
  if (authInstance) {
    return authInstance;
  }

  authInstance = getAuth(getFirebaseApp());
  return authInstance;
};

export const signInUser = async (email: string, password: string) => {
  validateCredentials(email, password);

  try {
    return await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  } catch (error) {
    throw new Error(getAuthErrorMessage(error));
  }
};

export const signUpUser = async (email: string, password: string) => {
  validateCredentials(email, password);

  try {
    return await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  } catch (error) {
    throw new Error(getAuthErrorMessage(error));
  }
};

export const signOutUser = async () => signOut(getFirebaseAuth());

export const createBusDocPath = (schoolId: string, busId: string) =>
  `schools/${schoolId}/buses/${busId}`;

export const schoolsCollectionPath = "schools";
export const usersCollectionPath = "users";
export const busesCollectionPath = "buses";
export const tripsCollectionPath = "trips";

export const getBusDocumentRef = (db: Firestore, schoolId: string, busId: string) =>
  doc(db, createBusDocPath(schoolId, busId));

export const getSchoolsCollection = (db: Firestore) =>
  collection(db, schoolsCollectionPath) as CollectionReference<SchoolRecord>;

export const getUsersCollection = (db: Firestore) =>
  collection(db, usersCollectionPath) as CollectionReference<UserRecord>;

export const getBusesCollection = (db: Firestore) =>
  collection(db, busesCollectionPath) as CollectionReference<BusRecord>;

export const getTripsCollection = (db: Firestore) =>
  collection(db, "trips") as CollectionReference<TripRecord>;

export const getSOSCollection = (db: Firestore) =>
  collection(db, "sos_alerts") as CollectionReference<SOSAlert>;

export const getNotificationsCollection = (db: Firestore) =>
  collection(db, "notifications") as CollectionReference<AppNotification>;

export const getSubscriptionPlansCollection = (db: Firestore) =>
  collection(db, "subscription_plans") as CollectionReference<SubscriptionPlan>;

export const getSubscriptionsCollection = (db: Firestore) =>
  collection(db, "subscriptions") as CollectionReference<Subscription>;

export const getRoutesCollection = (db: Firestore) =>
  collection(db, "routes") as CollectionReference<RouteConfig>;

export const getAlertConfigsCollection = (db: Firestore) =>
  collection(db, "alert_configs") as CollectionReference<AlertConfig>;

export const getUserByEmail = async (db: Firestore, email: string) => {
  const snapshot = await getDocs(query(getUsersCollection(db), where("email", "==", email.trim())));
  return snapshot.docs[0]?.data() ?? null;
};

export const getBusById = async (db: Firestore, busId: string) => {
  const snapshot = await getDocs(query(getBusesCollection(db), where("id", "==", busId.trim())));
  return snapshot.docs[0]?.data() ?? null;
};

export const getBusByDriverId = async (db: Firestore, driverId: string) => {
  const snapshot = await getDocs(query(getBusesCollection(db), where("driverId", "==", driverId.trim())));
  return snapshot.docs[0]?.data() ?? null;
};

export const getBusLiveLocation = async (db: Firestore, schoolId: string, busId: string) => {
  const snapshot = await getDoc(getBusDocumentRef(db, schoolId.trim(), busId.trim()));
  return snapshot.exists() ? (snapshot.data() as Partial<BusLiveLocation>) : null;
};

export const getParentUsersByBusId = async (db: Firestore, busId: string) => {
  const snapshot = await getDocs(query(getUsersCollection(db), where("busId", "==", busId.trim())));
  return snapshot.docs
    .map((item) => item.data())
    .filter((user) => user.role === "parent");
};

export const createStudentAssignmentsFromUsers = (users: UserRecord[]): StudentAssignment[] =>
  users
    .filter((user) => user.studentName?.trim())
    .map((user) => ({
      id: user.id,
      name: user.studentName!.trim(),
      stopId: `${user.id}-${user.stopName?.trim() || "stop"}`,
      stopName: user.stopName?.trim() || "Stop not assigned",
      status: "waiting",
      guardianName: user.fullName.trim()
    }));

export const formatTimestamp = (timestamp?: string | null) => {
  if (!timestamp) {
    return "Not synced yet";
  }

  return new Date(timestamp).toLocaleString();
};

export const demoRouteStops: RouteStop[] = [
  
];

export const demoStudents: StudentAssignment[] = [];
export const demoSchools: SchoolRecord[] = [];
export const demoBuses: BusRecord[] = [];
export const demoUsers: UserRecord[] = [];

export const createDefaultBusState = (): BusLiveLocation => ({
  schoolId: "",
  busId: "",
  driverId: "",
  driverName: "",
  busLabel: "",
  routeName: "",
  tripActive: false,
  latitude: 28.6139,
  longitude: 77.209,
  speed: 0,
  heading: 0,
  accuracy: null,
  currentStopId: "",
  currentStopName: "",
  nextStopId: "",
  nextStopName: "",
  routeStops: demoRouteStops,
  students: demoStudents,
  lastEvent: "No live trip yet",
  updatedAt: new Date().toISOString()
});

export const getNextStop = (routeStops: RouteStop[], currentStopId: string) => {
  if (!routeStops.length) {
    return null;
  }
  const currentIndex = routeStops.findIndex((stop) => stop.id === currentStopId);
  return routeStops[currentIndex + 1] ?? routeStops[currentIndex] ?? routeStops[0];
};

export const distanceInKm = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
) => {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(toLatitude - fromLatitude);
  const dLng = degreesToRadians(toLongitude - fromLongitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(fromLatitude)) *
      Math.cos(degreesToRadians(toLatitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const getEtaMinutes = (distanceKm: number, speedMetersPerSecond: number) => {
  const speedKmPerMinute = Math.max(speedMetersPerSecond * 0.06, 0.35);
  return Math.max(1, Math.round(distanceKm / speedKmPerMinute));
};

const validateCredentials = (email: string, password: string) => {
  if (!email.trim()) {
    throw new Error("Enter your email address.");
  }

  if (!password) {
    throw new Error("Enter your password.");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
};

const getAuthErrorMessage = (error: unknown) => {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "This email is already registered. Try logging in instead.";
      case "auth/invalid-email":
        return "Enter a valid email address.";
      case "auth/weak-password":
        return "Password must be at least 6 characters long.";
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "The email or password is incorrect.";
      case "auth/network-request-failed":
        return "Network error while contacting Firebase. Check your internet connection.";
      case "auth/operation-not-allowed":
        return "Email/password sign-in is not enabled in Firebase Authentication.";
      default:
        return error.message || "Firebase authentication failed.";
    }
  }

  return error instanceof Error ? error.message : "Firebase authentication failed.";
};
