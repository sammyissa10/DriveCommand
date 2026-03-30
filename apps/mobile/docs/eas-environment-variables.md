# EAS Environment Variables — DriveCommand Mobile

This document describes the environment variable strategy for EAS builds of the DriveCommand React Native app.

## Build Profiles

| Profile | Distribution | Purpose | API URL |
|---------|-------------|---------|---------|
| `development` | Internal | Local dev with development client | `http://localhost:3000` |
| `preview` | Internal | Staging / QA builds | Your staging Vercel URL |
| `production` | Store | App Store / Google Play releases | Your production Vercel URL |

## Required Environment Variables

### `EXPO_PUBLIC_API_URL`

The only environment variable currently used by the app. Points to the DriveCommand Next.js backend.

| Build Profile | Current Value | Action Required |
|--------------|--------------|-----------------|
| `development` | `http://localhost:3000` | None — correct for local dev |
| `preview` | `https://your-production-url.vercel.app` | **Replace with your staging URL** |
| `production` | `https://your-production-url.vercel.app` | **Replace with your production URL** |

The `preview` and `production` profile values in `eas.json` are placeholders. You MUST update them before building for staging or production:

```json
// eas.json — update these values:
"preview": {
  "env": { "EXPO_PUBLIC_API_URL": "https://drivecommand-staging.vercel.app" }
},
"production": {
  "autoIncrement": true,
  "env": { "EXPO_PUBLIC_API_URL": "https://drivecommand.vercel.app" }
}
```

## Setting Secrets

For sensitive values that should NOT be in `eas.json` (API keys, signing secrets), use EAS Secrets:

```bash
# Set a project-scoped secret
eas secret:create --name SECRET_NAME --value "your-secret-value" --scope project

# List existing secrets
eas secret:list

# Delete a secret
eas secret:delete --name SECRET_NAME --scope project
```

Secrets set via `eas secret:create` are available as environment variables during the build process. They are NOT embedded in the app binary (use `EXPO_PUBLIC_` prefix only for values safe to expose in the client bundle).

## Submit Configuration (App Store / Google Play)

The `submit` section in `eas.json` requires the following before your first store submission:

### iOS App Store

```json
"ios": {
  "appleId": "your-apple-id@email.com",       // Your Apple Developer account email
  "ascAppId": "your-app-store-connect-app-id", // Numeric App ID from App Store Connect
  "appleTeamId": "your-team-id"               // 10-char alphanumeric Team ID
}
```

Find these at: [App Store Connect](https://appstoreconnect.apple.com)

### Google Play Store

```json
"android": {
  "serviceAccountKeyPath": "./google-play-key.json", // Downloaded from Google Play Console
  "track": "production"                               // or "internal" for internal testing
}
```

Download the service account JSON from: Google Play Console > Setup > API access

## Production Build Checklist

Before running `eas build --platform all --profile production`:

- [ ] Update `EXPO_PUBLIC_API_URL` in `eas.json` production profile to your real domain
- [ ] Replace iOS submit credentials (appleId, ascAppId, appleTeamId)
- [ ] Add `google-play-key.json` to the project (or set as EAS Secret)
- [ ] Enrolled in Apple Developer Program ($99/year)
- [ ] Enrolled in Google Play Developer account ($25 one-time)
- [ ] EAS project configured: `eas build:configure`
- [ ] App version bumped in `app.json`

## How Expo Reads Variables

Variables prefixed with `EXPO_PUBLIC_` are embedded into the JavaScript bundle at build time and accessible via `process.env.EXPO_PUBLIC_API_URL` in the app code. Variables WITHOUT the `EXPO_PUBLIC_` prefix are only available during the build process (useful for native module configuration, not runtime client code).

See: [Expo Environment Variables](https://docs.expo.dev/guides/environment-variables/)
