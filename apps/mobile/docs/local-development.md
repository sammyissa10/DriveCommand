# Mobile Local Development Guide

This guide covers everything needed to run the DriveCommand mobile app on an Android emulator from scratch.

---

## Prerequisites

Before starting, ensure you have the following installed and configured:

1. **Node.js 20+** — `node --version` should print `v20.x.x` or higher
2. **Android Studio** with:
   - Android SDK installed
   - At least one Android Virtual Device (AVD) configured in the Virtual Device Manager
   - ADB (Android Debug Bridge) available in your PATH — run `adb --version` to verify
3. **Java 17** — Required for Android build tools. `java -version` should print `17.x.x`.
4. **EAS CLI** — `npm install -g eas-cli`

**Why not Expo Go?** The mobile app uses native modules (`react-native-mmkv`, `react-native-maps`, `@sentry/react-native`) that are incompatible with Expo Go. You must use a custom development build on the Android emulator.

---

## Initial Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd DriveCommand

# 2. Install all workspace dependencies (Turborepo monorepo)
npm install
```

`apps/mobile` is a Turborepo workspace. Running `npm install` at the root installs dependencies for all workspaces. You do not need to `cd` into `apps/mobile` to install.

---

## Environment Variables

Copy the example env file and fill in your values:

```bash
cd apps/mobile
cp .env.example .env.local
```

Open `.env.local` and configure:

```env
# Web API backend
# Android emulator uses 10.0.2.2 which maps to host machine localhost
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000

# Supabase Auth — get from Supabase Dashboard → Settings → API
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: Sentry error tracking
EXPO_PUBLIC_SENTRY_DSN=

# Optional: Google Maps (enables the owner map screen)
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

**Why `10.0.2.2`?** Android emulators cannot reach `localhost` on the host machine. The address `10.0.2.2` is the standard alias Android provides to reach the host's loopback.

---

## Development Build

The first time you run the app, you must create a development build and install it on the emulator. This is a one-time step (unless you add new native modules).

```bash
cd apps/mobile

# Build a dev client APK for Android
eas build --profile development --platform android
```

This uploads the build to EAS servers and produces an APK. Download the APK from the EAS dashboard and drag-and-drop it onto the running emulator to install it, or use:

```bash
adb install path/to/downloaded.apk
```

**EAS Secrets:** Before building, ensure the required EAS secrets are set. Check with:
```bash
eas secret:list
```

---

## The 4-Step Startup Sequence

Once the dev build is installed, follow this exact sequence every session. **Order matters.**

### Step 1 — Start the Android Emulator

Open Android Studio → **More Actions** → **Virtual Device Manager** → press the **Play** button next to your device (`Medium_Phone_API_36.1` or similar).

Wait until the emulator fully boots to the Android home screen before proceeding.

### Step 2 — Terminal 1: Start the Web Server

Open a terminal in `apps/web` and start the Next.js development server:

```bash
cd C:\Users\sammy\Projects\DriveCommand\apps\web
npm run dev
```

Wait until you see:
```
✓ Ready on http://localhost:3000
```

The mobile app makes all API calls to the web server. If the web server isn't running, nothing loads.

### Step 3 — Terminal 2: Set Up ADB Reverse Tunnels

Open a second terminal (can be anywhere) and run:

```bash
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
```

These commands tunnel traffic from the emulator's localhost ports to the host machine:
- Port `3000` → Next.js web server
- Port `8081` → Metro bundler (JS bundle server)

**Must run after the emulator is fully booted.** If you restart the emulator, re-run these commands.

### Step 4 — Terminal 3: Start Metro / Expo

Open a third terminal in `apps/mobile`:

```bash
cd C:\Users\sammy\Projects\DriveCommand\apps\mobile
npx expo start --clear
```

Once Metro is ready, press `a` to open the app on the Android emulator.

---

## Common Issues

### Network errors mid-session ("Unable to connect" or fetch failures)

ADB reverse tunnels sometimes drop mid-session. Fix:

```bash
# Re-run the tunnels
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081

# Then reload the app in the Metro terminal
# Press r
```

### Code changes not appearing (hot reload not working)

Metro may have lost connection to the emulator. In the Metro terminal:

- Press `r` to reload the JS bundle on the device

If that doesn't work, stop Metro and restart it:

```bash
npx expo start --clear
```

### Red screen: "Cannot find native module X"

The JS layer has been updated but the native binary is stale. You need to rebuild the dev client:

```bash
eas build --profile development --platform android
```

Then reinstall the APK on the emulator.

### Metro cache issues (stale code)

The `--clear` flag in `npx expo start --clear` clears Metro's transform cache. Use it whenever you encounter unexplained stale behavior.

---

## Useful Commands

```bash
# Check if ADB can see the emulator
adb devices

# View Metro's complete log
# (Metro already prints to its terminal — no extra commands needed)

# Check EAS build status
eas build:list

# View EAS secrets
eas secret:list

# Run TypeScript type check (always do this before deploying)
cd apps/mobile
npx tsc --noEmit
```

---

## EAS Build Profiles

Build profiles are defined in `apps/mobile/eas.json`:

| Profile | Purpose | Distribution |
|---------|---------|-------------|
| `development` | Dev client with Expo Dev Client for debugging | Internal only |
| `preview` | Production-like build for internal testing | Internal / TestFlight |
| `production` | App store submission | App Store / Google Play |

```bash
# Build dev client (Android only)
eas build --profile development --platform android

# Build preview for both platforms
eas build --profile preview --platform all

# Build production for app store
eas build --profile production --platform all
```

---

## Project Structure

```
apps/mobile/
  app/               # Expo Router file-based routes
    (owner)/         # Owner portal screens
    (driver)/        # Driver portal screens
    sign-in.tsx      # Login screen
    _layout.tsx      # Root layout (AuthContext, React Query)
  components/        # Shared UI components
  lib/               # Utilities, hooks, API client config
  docs/              # This documentation
  eas.json           # EAS build profiles
  app.json           # Expo app config
  .env.example       # Environment variable template
```

See [architecture.md](architecture.md) for the full architecture overview.
