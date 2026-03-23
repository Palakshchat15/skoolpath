# Setup Guide

## 1. Install prerequisites

- Node.js 20+
- npm 10+
- Expo CLI via `npx`
- Android Studio for Android emulator and SDK

## 2. Create Firebase project

Create a Firebase project and enable:

- Authentication
- Cloud Firestore
- Cloud Messaging

## 3. Add Expo public environment variables

Create `.env` files in both app folders by copying the included `.env.example` files:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Files:

- `apps/driver-app/.env`
- `apps/parent-app/.env`

## 4. Firestore model

Driver app writes to:

```text
schools/{schoolId}/buses/{busId}
```

Suggested document fields:

- `latitude`
- `longitude`
- `speed`
- `heading`
- `accuracy`
- `driverId`
- `routeName`
- `tripActive`
- `updatedAt`

## 5. Run locally

```bash
npm install
npm run dev:driver
npm run dev:parent
```

For browser preview instead of native manifest output:

```bash
npm run web:driver
npm run web:parent
```

## 6. iOS from Windows

You can build for iOS from Windows with Expo EAS:

```bash
npx eas build --platform ios
```

You still need an Apple Developer account for production signing, but you do not need a Mac just to produce the cloud build.
