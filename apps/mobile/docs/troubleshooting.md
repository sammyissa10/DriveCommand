# Mobile App Troubleshooting Guide

Common failure modes for the DriveCommand React Native / Expo mobile app, their causes, and fixes.

---

## 1. EAS Build Failures — Missing Secrets

**Symptoms:**
- EAS build fails with an error like:
  - `Error: missing environment variable EXPO_PUBLIC_SUPABASE_URL`
  - `The following secrets are missing: ...`
  - Build succeeds locally but fails on EAS servers

**Cause:**
The EAS build runs in a clean environment on Expo's servers. Environment variables from your local `.env.local` file are not available there. Secrets must be explicitly added to EAS.

**Fix:**
Check which secrets are configured:
```bash
cd apps/mobile
eas secret:list
```

Add missing secrets:
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project.supabase.co"
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key"
# Repeat for each missing secret
```

Required secrets for a production build:
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SENTRY_DSN` (optional, enables error tracking)
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (required for owner map screen)

---

## 2. EAS Build Failures — Expired Credentials

**Symptoms:**
- Build fails at the signing/packaging step
- Error messages like:
  - `Provisioning profile expired`
  - `Certificate is not valid`
  - `Keystore validation failed`

**Cause:**
Apple provisioning profiles and distribution certificates expire. Android keystores do not expire but can become invalid if the keystore file is lost or the credentials are rotated.

**Fix for Android:**
```bash
# Regenerate Android credentials
eas credentials

# Select Android → Keystore → Generate new keystore
```

**Fix for iOS:**
1. Go to [Apple Developer Portal](https://developer.apple.com) → Certificates, IDs & Profiles
2. Renew the expiring provisioning profile or distribution certificate
3. In EAS:
```bash
eas credentials
# Select iOS → Provisioning Profile → Sync with Apple
```

Alternatively, set EAS to manage credentials automatically:
```json
// In eas.json
{
  "build": {
    "production": {
      "ios": { "credentialsSource": "remote" }
    }
  }
}
```

---

## 3. Emulator Cannot Reach the API

**Symptoms:**
- Network request errors: `TypeError: Network request failed` or `fetch failed`
- All screens show loading spinners indefinitely
- API calls fail with connection refused

**Cause:**
One or more of the three required processes is not running, or the ADB reverse tunnels have dropped.

**Fix:**
Follow the full 4-step startup sequence from `local-development.md`:

1. Start the Android emulator (fully booted to home screen)
2. In `apps/web`: `npm run dev` (wait for "Ready on localhost:3000")
3. Run ADB tunnels: `adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8081 tcp:8081`
4. In `apps/mobile`: `npx expo start --clear`, then press `a`

**If the issue appears mid-session** (tunnels dropped):
```bash
# Re-run the ADB reverse commands
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081

# Then reload the app: press r in the Metro terminal
```

**Verify the emulator can see ADB:**
```bash
adb devices
# Should show something like: emulator-5554   device
```

---

## 4. Expo Go Incompatibility

**Symptoms:**
- App crashes on launch when opened via Expo Go
- Red error screen: `Native module not found: RNMMKVModule`
- Error: `Invariant Violation: Module AppRegistry is not a registered callable module`
- QR code scan works but app immediately crashes

**Cause:**
This project uses native modules that are not bundled in the Expo Go app:
- `react-native-mmkv` (synchronous key-value storage)
- `react-native-maps` (owner map screen)
- `@sentry/react-native` (crash reporting)

These modules require native code that must be compiled into a custom binary.

**Fix:**
Never use Expo Go for this project. Always use a custom development build installed on the Android emulator.

If you do not have a dev build installed:
```bash
cd apps/mobile
eas build --profile development --platform android
# Download the resulting APK and install it on the emulator
# adb install path/to/build.apk
```

---

## 5. Metro Bundler Cache Issues

**Symptoms:**
- Code changes are not reflected after saving
- Old component versions appear despite changes
- Stale error messages that you have already fixed
- Metro shows up-to-date files but the app shows old behavior

**Cause:**
Metro's transform cache has cached a stale version of a file. This can happen after:
- Upgrading a package
- Changing Babel config
- Pulling changes from git that affect native modules

**Fix:**
```bash
cd apps/mobile

# Clear Metro cache and restart
npx expo start --clear

# If that doesn't work, delete the cache directory
rm -rf node_modules/.cache

# In extreme cases, clear everything
rm -rf node_modules/.cache .expo
npx expo start --clear
```

---

## 6. Native Module Errors After Package Update

**Symptoms:**
- Red screen with error: `Cannot find native module 'RN[PackageName]'`
- `null is not an object (evaluating 'RN[PackageName].someMethod')`
- Error appears after running `npm install` or pulling new code

**Cause:**
The JavaScript layer (Metro bundle) has been updated to use a new version of a native module, but the native binary (the dev build APK) still contains the old version. The JS and native layers are out of sync.

**Fix:**
Rebuild the development client with the new native code:

```bash
cd apps/mobile
eas build --profile development --platform android
```

Once the build completes:
1. Download the new APK from the EAS dashboard
2. Install it on the emulator: `adb install path/to/new-build.apk`
3. Restart Metro: `npx expo start --clear`

---

## 7. Hot Reload Not Working

**Symptoms:**
- Saving a file does not update the app on the emulator
- Metro shows the file was processed but the app stays on the old version
- Changes only appear after a full app restart

**Cause:**
- Metro has lost its connection to the Expo runtime on the emulator
- A syntax error in a recently saved file prevented the bundle from reloading
- The app was started in a previous session and the connection is stale

**Fix:**
In the Metro terminal (where `npx expo start` is running):

```
Press r    → Reload JS bundle
Press j    → Open JS debugger
```

If pressing `r` doesn't work:
1. In the Metro terminal, press `Ctrl+C` to stop
2. Clear and restart: `npx expo start --clear`
3. Press `a` again to reconnect to the emulator

If there is a syntax error in your code, Metro will show it in the terminal. Fix the error and the reload will resume automatically.

---

## 8. Maps Not Rendering

**Symptoms:**
- Owner map screen shows a blank white or grey area where the map should be
- Console error: `AIzaSy... API key not valid. Please pass a valid API key.`
- Map tiles load but markers do not appear

**Cause:**
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is not set or is set to an invalid value
- The **Maps SDK for Android** is not enabled in your Google Cloud Console project
- The API key has domain/app restrictions that block the emulator

**Fix:**

1. Verify the environment variable is set:
```bash
grep GOOGLE_MAPS C:/Users/sammy/Projects/DriveCommand/apps/mobile/.env.local
```

2. Verify the Maps SDK is enabled:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to APIs & Services → Library
   - Search for "Maps SDK for Android"
   - Ensure it is **Enabled** for your project

3. If using an API key with application restrictions, add the emulator's package name or temporarily remove restrictions for testing.

4. After changing the API key, rebuild the dev client (the key is baked into the native binary via `app.json`):
```bash
eas build --profile development --platform android
```
