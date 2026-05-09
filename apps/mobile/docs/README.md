# DriveCommand Mobile App

The DriveCommand mobile app is built with Expo SDK 55 and React Native 0.83. It provides two portals:

| Portal | Users | Description |
|---|---|---|
| **Owner** | Fleet owners and managers | Manage loads, trucks, drivers, invoices, and CRM on the go |
| **Driver** | Truck drivers | Execute routes, log HOS, report incidents, view documents, and message dispatch |

The mobile app communicates with the same Next.js backend as the web app. There is no separate mobile API server — the `@drivecommand/api-client` package calls the web app's `/api/mobile/*` routes.

---

## Table of Contents

- [Architecture](./architecture.md) — Stack details, auth flow, navigation, state management, build process

---

## Quick Start

> Always use an Android emulator. Native modules (MMKV, react-native-maps) are incompatible with Expo Go.

### Prerequisites

- **Node.js 20+**
- **Android Studio** with an Android emulator configured
- **ADB** (Android Debug Bridge) — included with Android Studio

### Run the app

```bash
# From the monorepo root, install all dependencies first
npm install

# Start the web backend (in a separate terminal)
cd apps/web && npm run dev

# Set up ADB reverse tunnels so the emulator can reach localhost
# (run after the emulator is fully booted)
adb reverse tcp:3000 tcp:3000

# Start the mobile app
cd apps/mobile
npx expo start
```

When the Expo server starts, press `a` to open the Android emulator.

### Build for distribution

```bash
cd apps/mobile

# Development build (includes dev client, full debugging)
npm run build:dev

# Preview build (production-like, for internal testing)
npm run build:preview

# Production build (app store submission)
npm run build:prod
```

All builds use [EAS Build](https://docs.expo.dev/build/introduction/) (Expo Application Services).

---

## Key Libraries

| Library | Version | Purpose |
|---|---|---|
| `expo` | `~55.0.8` | Core Expo SDK |
| `react-native` | `0.83.2` | React Native framework |
| `expo-router` | `~55.0.7` | File-based navigation (Expo Router) |
| `nativewind` | `^4.2.3` | Tailwind CSS for React Native |
| `@tanstack/react-query` | `^5.95.0` | Server state management |
| `@supabase/supabase-js` | `^2.100.0` | Supabase Auth client |
| `expo-secure-store` | `~55.0.9` | Secure token storage |
| `react-native-mmkv` | `^3.3.3` | Fast local key-value storage |
| `react-native-maps` | `1.27.2` | Maps (Owner map screen) |
| `react-native-map-clustering` | `^4.0.0` | Marker clustering on maps |
| `expo-notifications` | `~55.0.13` | Push notifications |
| `expo-task-manager` | `~55.0.10` | Background tasks |
| `@sentry/react-native` | `~7.11.0` | Error monitoring |

See [architecture.md](./architecture.md) for full details.
