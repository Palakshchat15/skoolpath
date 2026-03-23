# SkoolPath Clone

React Native bus tracking system with:

- Parent app
- Driver app
- Shared Firebase real-time GPS sync

## Stack

- Expo React Native + TypeScript
- Firebase Auth + Firestore
- Expo Location + Task Manager
- React Native Maps

## Why this stack

This setup works well from Windows while still targeting Android and iOS. You can build iOS from Windows using Expo Application Services (EAS), even though you cannot run the iOS simulator locally without macOS.

## Apps

- `apps/driver-app`: publishes live GPS updates for the active bus trip
- `apps/parent-app`: subscribes to the active bus and shows its live position
- `packages/shared`: Firebase config, shared types, and helpers

## GPS flow

1. Driver signs in and starts a trip.
2. Driver app collects live location and writes it to Firestore.
3. Parent app subscribes to the bus document in Firestore.
4. Parents immediately see location, speed, heading, and trip status.

## Browser preview

If you open the plain Expo dev server URL in the browser, it can show a JSON manifest. That is normal for native mode.

Use these commands for an actual browser-rendered preview:

- `npm run web:driver`
- `npm run web:parent`

## Next build phases

- Authentication and role-based access
- School, bus, route, and stop management
- Push notifications for ETA and pickup alerts
- Attendance and SOS
- Admin web panel
## Run the apps

From the repo root:

```powershell
npm run serve:parent
npm run serve:driver
npm run serve:admin-web
```

Default local URLs:

- Parent app: `http://localhost:8081`
- Driver app: `http://localhost:8082`
- Admin website: `http://localhost:3000`

## Admin website workflow

Use the website admin to create operational data in this order:

1. Create a school
2. Create a driver user
3. Create a bus and assign that driver from the dropdown
4. Enter route stops in the bus form using one line per stop:

```txt
Block A Gate|28.6139|77.2090|07:30
Main Road Turn|28.6155|77.2132|07:40
School Gate|28.6200|77.2180|07:55
```

5. Create a parent user and assign the bus, student name, and stop name

After that:

- Driver login loads the assigned bus and student attendance list
- Parent login loads the assigned bus and route timeline

## New capabilities

- Admin website now supports editing and deleting schools, buses, and users
- Driver trips now create trip-history documents in the `trips` collection
- Firestore project config and starter rules are included in:
  - `firebase.json`
  - `firestore.rules`

## Important rule caveat

The current app stores custom user IDs like `driver-001` and `300001` in Firestore, while Firebase Authentication uses its own UID values.

That means the starter `firestore.rules` file is a secure baseline draft, but for a full production rollout you should align the Firestore `users` document IDs with Firebase Auth UIDs, or add a server-backed claims/role layer before enforcing those rules in production.
