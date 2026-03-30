# Mobile Architecture

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| SDK | Expo | `~55.0.8` |
| Framework | React Native | `0.83.2` |
| Routing | Expo Router | `~55.0.7` |
| Styling | NativeWind | `^4.2.3` |
| Server State | React Query | `^5.95.0` |
| Auth | Supabase Auth + expo-secure-store | `^2.100.0` / `~55.0.9` |
| API Client | @drivecommand/api-client | workspace |
| Local Storage | react-native-mmkv | `^3.3.3` |

---

## Monorepo Position

The mobile app (`apps/mobile`) is one of two apps in the DriveCommand Turborepo monorepo. It shares three packages with the web app:

- `@drivecommand/types` — TypeScript interfaces for all API payloads and domain objects
- `@drivecommand/validation` — Zod schemas for validating API requests and responses
- `@drivecommand/api-client` — Typed HTTP client that calls the Next.js web API routes

The web app (`apps/web`) serves as the API backend. Mobile-specific API routes live under `apps/web/src/app/api/mobile/`:

```
apps/web/src/app/api/mobile/
  owner/
    customers/     # CRM customers list + detail
    drivers/       # Driver list + invite
    invoices/      # Invoice list
    trucks/        # Truck list + detail (with [id]/ sub-routes)
  driver/          # Driver-specific endpoints
  support/         # Support ticket screenshot upload
```

---

## Authentication

The mobile app uses **Supabase Auth** (separate from the web app's custom AES-256-GCM session cookie):

1. **Sign in** — User submits email + password. The `@supabase/supabase-js` client calls Supabase Auth and returns a JWT access token and refresh token.
2. **Token storage** — Tokens are stored in `expo-secure-store` (hardware-backed encrypted storage on device).
3. **Session context** — An `AuthContext` React context wraps the app root. It holds the current user, session, and sign-in/sign-out functions. Components access auth state via `useAuth()` hook.
4. **API calls** — The `@drivecommand/api-client` reads the stored token and attaches it as a `Bearer` header on all API requests. The web API routes validate the token via Supabase's JWT verification.
5. **Token refresh** — Supabase client handles token refresh automatically. The secure store is updated when tokens rotate.

---

## Navigation

Navigation uses **Expo Router** (file-based routing, similar to Next.js App Router).

```
app/
  _layout.tsx          # Root layout — AuthContext provider, React Query client, toast
  index.tsx            # Root redirect: unauthenticated → sign-in, owner → (owner)/dashboard, driver → (driver)/active-route
  sign-in.tsx          # Sign-in screen
  (owner)/             # Owner portal route group
    _layout.tsx        # Owner navigation shell (tab bar: Dashboard, Loads, Map, More)
    index.tsx          # Dashboard
    loads/
      index.tsx        # Load list
      [id].tsx         # Load detail
    drivers/
      invite.tsx       # Driver invitation form
    map/
      index.tsx        # Live map (react-native-maps + clustering)
    more/
      _layout.tsx      # "More" tab sub-navigation
      fleet.tsx        # Fleet overview (trucks list)
      trucks/
        _layout.tsx    # Trucks sub-layout
        [id].tsx       # Truck detail
        new.tsx        # New truck form
      crm/
        _layout.tsx    # CRM sub-layout
        index.tsx      # Customer list (redirects to _layout)
        new.tsx        # New customer form
      invoices/
        new.tsx        # New invoice form
  (driver)/            # Driver portal route group
    _layout.tsx        # Driver navigation shell
    index.tsx          # Active route / home
    loads/             # Load management
    documents/         # Document viewer
    hos/               # Hours of service
    incidents/         # Incident reporting
    messages/          # Fleet messaging
```

---

## State Management

| Concern | Solution |
|---|---|
| Server data (API responses) | React Query (`@tanstack/react-query`) — caching, refetching, mutations |
| Auth session | React Context (`AuthContext`) — current user, role, sign-in/out |
| UI state | Local `useState` / `useReducer` — form fields, modals, toggles |
| Fast local KV | react-native-mmkv — lightweight persistent storage for non-sensitive data |
| Secure tokens | expo-secure-store — JWT tokens, encrypted on device |

---

## Push Notifications

Push notifications use Expo's push notification infrastructure:

- **Registration** — `expo-notifications` generates an Expo Push Token on the device. The app stores it in the `PushToken` table on the server (keyed by `userId`, not `tenantId` — no RLS on this table).
- **Background handling** — `expo-task-manager` registers a background task that handles notifications when the app is in the background or terminated.
- **Server-side sending** — The web app uses `expo-server-sdk` to send notifications via the Expo Push API.

---

## Error Monitoring

`@sentry/react-native` (`~7.11.0`) is configured for crash reporting and performance monitoring. Sentry wraps the root component in `app/_layout.tsx`.

---

## Maps

The Owner portal Map screen uses `react-native-maps` with `react-native-map-clustering` for clustering markers. The web app uses Leaflet (separate library).

---

## Build and Deployment

Builds use **EAS Build** (Expo Application Services):

```bash
# Development build — includes Expo Dev Client for debugging
eas build --profile development --platform android

# Preview build — production-like, for internal distribution
eas build --profile preview --platform all

# Production build — app store submission
eas build --profile production --platform all
```

Build profiles are defined in `eas.json` at `apps/mobile/eas.json`.

Over-the-air (OTA) updates use `expo-updates`. Minor JS changes can be deployed without a new app store submission.

---

## Key Design Decisions

**Single backend** — The web app's Next.js API routes serve both web and mobile. No separate mobile API server. Mobile-specific endpoints live under `/api/mobile/` and are secured with Supabase JWT verification.

**Supabase Auth for mobile, custom session for web** — Web uses a custom AES-256-GCM cookie because it runs in Edge Runtime (middleware) where Web Crypto API is available. Mobile uses Supabase Auth because it integrates cleanly with expo-secure-store and provides token refresh out of the box.

**NativeWind v4** — Tailwind CSS utility classes work directly in React Native components. Styles are compiled at build time, not runtime, for performance.

**Expo Router** — File-based routing mirrors Next.js conventions. Route groups (`(owner)/`, `(driver)/`) keep portal-specific screens isolated without affecting URLs.

**MMKV over AsyncStorage** — react-native-mmkv is synchronous and significantly faster than AsyncStorage for non-sensitive data. Auth tokens go in SecureStore; everything else in MMKV.
