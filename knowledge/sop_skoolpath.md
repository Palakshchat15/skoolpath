# SkoolPath Standard Operating Procedure (SOP)

This document outlines the architecture, features, and operational workflows of the SkoolPath Fleet Management ecosystem.

## 1. System Architecture

SkoolPath is built as a unified monorepo to ensure consistency across web and mobile platforms.

*   **Shared Core (`@skoolpath/shared`)**: Contains all Firebase logic, type definitions, and business rules used by every app.
*   **Backend**: 
    *   **Firestore**: Real-time synchronization of bus locations and student statuses.
    *   **Authentication**: Secure login for Admins, Drivers, and Parents.
    *   **Cloud Messaging**: Push notifications for trip starts and emergencies.
*   **Mobile Apps**: Built on **Expo SDK 53** (React Native 0.79) for high-performance native execution.
*   **Admin Dashboard**: Built with **Next.js** for secure, high-speed fleet management.

---

## 2. Implemented Features

### 🛡️ Native Stability & Performance
*   **AndroidX Force-Resolution**: A custom native plugin (`withAndroidXCoreDowngrade.js`) forcefully clamps AndroidX libraries to version 1.15.0. This prevents the "App keeps stopping" crash common in modern Android environments.
*   **Hermes Optimization**: Dependencies are locked to specific versions (React 19.0.0, Firebase 10.14.1) to ensure the mobile JavaScript engine executes without syntax errors.

### 📍 Real-Time Tracking
*   **Live Telemetry**: Driver apps broadcast GPS coordinates every 5-10 seconds during active trips.
*   **Low-Latency Consumption**: Parent apps listen directly to Firestore "live" documents for zero-lag bus movement on the map.
*   **Smart ETA**: Automated calculation of minutes-to-stop based on current bus speed and distance.

### 👨‍🎓 Student Management
*   **Digital Manifest**: Drivers manage student boarding/dropping with a single tap.
*   **Attendance Sync**: Statuses (Waiting, Boarded, Dropped) are instantly visible to both Parents and School Admins.
*   **Dynamic Stops**: Admin-defined routes with automated geocoding of stop coordinates.

### 🚨 Alert & Safety System
*   **SOS Notifications**: Instant dashboard and mobile alerts for emergencies.
*   **Speeding Telemetry**: The system detects when a driver exceeds school-defined speed limits and logs an alert.
*   **Push Notifications**: Automated alerts for "Bus Started," "Student Boarded," and "Arrived at Stop."

---

## 3. Operational Workflow

### **A. Administrative Setup**
1.  **Register School**: Create the school entity in the Web Dashboard.
2.  **Add Users**: Register Drivers and Parents. Ensure Emails match between Auth and the User document.
3.  **Configure Fleet**: Add Buses and link them to specific Drivers.
4.  **Route Design**: Add stops to the bus route in the "Routes" or "Buses" tab.

### **B. The Daily Trip Cycle**
1.  **Preparation**: Driver logs in; system verifies bus assignment and data sync status.
2.  **Execution**: Driver taps "Start Trip." 
    *   *System Action*: Notifies parents and begins background GPS tracking.
3.  **Stops**: Driver arrives at stops, marks students as "Boarded."
    *   *System Action*: Updates the Parent's dashboard and status indicator.
4.  **Completion**: Driver taps "End Trip."
    *   *System Action*: Finalizes the trip record and saves it to the "Trips" history.

---

## 4. Maintenance & Deployment (Technical SOP)

To maintain the "Once and for All" stability achieved in this project, follow these build rules:

### **Build Guidelines**
*   **Build Command**: Always build in the cloud to avoid local environment issues:
    `npx eas-cli build --profile preview --platform android --non-interactive`
*   **Clean Builds**: If native errors reappear, delete the local `android` folder and run `npx expo prebuild` to regenerate the fixed native files.

### **Dependency Guard**
Do **NOT** upgrade the following packages without full testing, as newer versions are incompatible with the current native engine:
*   `react`: Must remain **19.0.0**
*   `firebase`: Must remain **10.14.1**
*   `react-native-maps`: Must remain **1.20.1**

---

## 5. Troubleshooting

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **"App keeps stopping"** | AndroidX Version Conflict | Ensure `withAndroidXCoreDowngrade.js` is active in `app.config.js`. |
| **White Screen on Launch** | JS Syntax Error (Firebase 11) | Revert Firebase to 10.14.1 and clear `node_modules`. |
| **Map not showing Bus** | Missing Google Maps Key | Verify `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is set in EAS Secrets. |
| **Notifications not arriving** | Missing google-services.json | Ensure the file is linked in `app.config.js` and matches the package name. |
