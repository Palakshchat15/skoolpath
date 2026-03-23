# Architecture

## Frontend

- `apps/driver-app`: driver starts the trip and continuously uploads live location
- `apps/parent-app`: parent subscribes to the assigned bus document and renders updates in real time

## Backend choice

Firebase is the best fit for the first production version because:

- real-time updates are built in
- scaling reads and writes is straightforward
- authentication and push notifications are already integrated
- it avoids custom socket infrastructure at the MVP stage

## Realtime flow

1. Driver authenticates and starts a trip.
2. App requests foreground and background GPS permission.
3. Location watcher pushes updates every few seconds or every few meters.
4. Firestore updates the active bus document.
5. Parent app listens to that document and updates the map instantly.

## Recommended next modules

- Role-based authentication
- Student-to-bus assignment
- Route and stop collection
- ETA engine with Google Maps Directions API
- Push notifications for bus approaching stop
- Admin dashboard for school operations
