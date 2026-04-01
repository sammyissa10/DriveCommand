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
    compliance/         # Compliance dashboard data
    crm/                # CRM customers list + detail
    customers/          # Customer list (alias)
    dashboard/          # Owner dashboard summary
    drivers/            # Driver list + invite
    fleet/              # Fleet overview
    fleet-positions/    # Live truck positions for map
    fuel/               # Fuel records
    invoices/           # Invoice list + detail
    loads/              # Load list + detail + assign-truck sub-routes
    map/                # Map data
    payroll/            # Payroll records
    profit-predictor/   # AI profit predictor
    routes/             # Routes list + detail
    safety/             # Safety events
    trucks/             # Truck list + detail (with [id]/ sub-routes)
  driver/
    dashboard/          # Driver dashboard summary
    documents/          # Driver document viewer
    hos/                # Hours of service
    incidents/          # Incident reporting
    loads/              # Load detail + status update + rate-confirmation + revert sub-routes
    messages/           # Fleet messaging + mark-read + route-thread + unread-count sub-routes
    route/              # Active route with stops
    tracking-token/     # Load tracking token
  support/              # Support ticket screenshot upload
```

---

## Authentication

The mobile app uses **Supabase Auth** with JWT Bearer tokens stored in `expo-secure-store`. Both web and mobile now use Supabase Auth, but via different mechanisms — web uses `@supabase/ssr` cookie-based sessions, while mobile uses JWT Bearer tokens:

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
  index.tsx            # Root redirect: unauthenticated → login, owner → (owner)/dashboard, driver → (driver)/active-route
  login.tsx            # Login screen
  (owner)/             # Owner portal route group
    _layout.tsx        # Owner navigation shell (tab bar: Dashboard, Loads, Routes, Map, More)
    index.tsx          # Dashboard
    loads/
      _layout.tsx      # Loads sub-layout
      index.tsx        # Load list
      [id].tsx         # Load detail
    routes/
      _layout.tsx      # Routes sub-layout
      index.tsx        # Routes list
      [id].tsx         # Route detail
    map.tsx            # Live map (react-native-maps + clustering)
    drivers/
      _layout.tsx      # Drivers sub-layout
      index.tsx        # Driver list
      [id].tsx         # Driver detail
      invite.tsx       # Driver invitation form
    more/
      _layout.tsx      # "More" tab sub-navigation
      index.tsx        # More menu index
      fleet.tsx        # Fleet overview (trucks list)
      ai-documents.tsx # AI document reader
      compliance.tsx   # Compliance dashboard
      fuel.tsx         # Fuel records
      payroll.tsx      # Payroll records
      profit-predictor.tsx  # AI profit predictor
      safety.tsx       # Safety analytics
      trucks/
        _layout.tsx    # Trucks sub-layout
        index.tsx      # Truck list
        [id].tsx       # Truck detail
        new.tsx        # New truck form
      crm/
        _layout.tsx    # CRM sub-layout
        index.tsx      # Customer list
        [id].tsx       # Customer detail
        new.tsx        # New customer form
      invoices/
        _layout.tsx    # Invoices sub-layout
        index.tsx      # Invoice list
        [id].tsx       # Invoice detail
        new.tsx        # New invoice form
      settings/
        _layout.tsx    # Settings sub-layout
        index.tsx      # Settings menu
        account.tsx    # Account settings
        team.tsx       # Team management
  (driver)/            # Driver portal route group
    _layout.tsx        # Driver navigation shell
    index.tsx          # Active route / home
    loads/
      _layout.tsx      # Loads sub-layout
      index.tsx        # Load list
      [id].tsx         # Load detail
      my-route.tsx     # Active route with stops
    documents.tsx      # Document viewer
    hos.tsx            # Hours of service
    incidents/
      _layout.tsx      # Incidents sub-layout
      index.tsx        # Incident list
      new.tsx          # Report new incident
    messages.tsx       # Fleet messaging
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

**Supabase Auth for both web and mobile** — Both portals now use Supabase Auth, but via different mechanisms. Web uses `@supabase/ssr` for cookie-based sessions (seamlessly handled by Next.js middleware). Mobile uses JWT Bearer tokens stored in `expo-secure-store`, because cookies are not a natural auth mechanism in React Native and the Supabase client handles token refresh automatically.

**NativeWind v4** — Tailwind CSS utility classes work directly in React Native components. Styles are compiled at build time, not runtime, for performance.

**Expo Router** — File-based routing mirrors Next.js conventions. Route groups (`(owner)/`, `(driver)/`) keep portal-specific screens isolated without affecting URLs.

**MMKV over AsyncStorage** — react-native-mmkv is synchronous and significantly faster than AsyncStorage for non-sensitive data. Auth tokens go in SecureStore; everything else in MMKV.

---

## Architecture Decision Records

### ADR-001: Supabase JWT for Mobile Auth (not session cookies)

**Status:** Accepted

**Context:**
The web app uses Supabase Auth with cookie-based sessions via `@supabase/ssr`. This design works well for web (Next.js middleware handles cookie lifecycle automatically). However, cookies are not a natural auth mechanism for mobile apps — React Native has no cookie jar, and cookie-based session auth adds complexity to the `@drivecommand/api-client`. Both web and mobile now use Supabase Auth, but the decision to use JWT Bearer tokens for mobile remains the correct approach regardless of the web implementation.

**Decision:**
Mobile uses Supabase Auth with JWT access tokens stored in `expo-secure-store`.

**Rationale:**
- `expo-secure-store` provides hardware-backed encrypted storage on the device (Android Keystore / iOS Secure Enclave). Tokens are as secure as possible on mobile.
- The Supabase client handles token refresh automatically. When the access token expires, the SDK silently fetches a new one using the refresh token. No custom refresh logic needed.
- JWT Bearer auth (`Authorization: Bearer <token>`) is the standard for mobile API clients and is straightforward to implement in the HTTP client.
- No cookie jar management needed in React Native.

**Consequences:**
- The web API routes under `/api/mobile/` cannot use the session-cookie auth middleware. They call `validateMobileToken()` or use the `withMobileAuth()` wrapper instead.
- All mobile routes must call `bypass_rls` in their database transactions because Postgres RLS policies are session-scoped and cannot see the Bearer token. Each mobile route is responsible for filtering data by `tenantId`.

---

### ADR-002: MMKV over AsyncStorage

**Status:** Accepted

**Context:**
The mobile app needs fast persistent key-value storage for non-sensitive data: user preferences, last-read message timestamps, cache flags, UI state that survives app restarts. The standard React Native solution is `@react-native-async-storage/async-storage`, but it has known performance characteristics that can cause jank on the main thread due to its asynchronous bridge calls.

**Decision:**
Use `react-native-mmkv` instead of AsyncStorage for all non-sensitive persistent data.

**Rationale:**
- MMKV is synchronous — no `await` needed. Reads and writes happen on the calling thread with no bridge overhead.
- Benchmarks show MMKV is approximately 30x faster than AsyncStorage for typical key-value operations.
- MMKV uses memory-mapped files, making it efficient for both reads and writes.
- Auth tokens (sensitive data) stay in `expo-secure-store`. MMKV is only for non-sensitive data like preferences and cache metadata.

**Consequences:**
- `react-native-mmkv` is a native module — it requires a custom dev build (not compatible with Expo Go).
- All MMKV operations are synchronous, which simplifies code by eliminating async/await boilerplate in storage reads.

---

### ADR-003: NativeWind v4 over StyleSheet.create

**Status:** Accepted

**Context:**
The web app is styled with Tailwind CSS + shadcn/ui. New developers working on both web and mobile need to know two separate styling systems if mobile uses React Native's `StyleSheet.create` API. Additionally, `StyleSheet.create` produces verbose boilerplate for common patterns (spacing, colors, typography).

**Decision:**
Use NativeWind v4 (Tailwind CSS for React Native) as the primary styling solution for the mobile app.

**Rationale:**
- Same utility class vocabulary as the web app. A developer who knows `className="flex-1 p-4 bg-background"` on web can apply the same pattern on mobile without learning a new API.
- NativeWind v4 compiles Tailwind classes at build time into `StyleSheet` objects — no runtime CSS parsing overhead.
- Supports dark mode via the `dark:` prefix, identical to the web pattern.
- Supports responsive breakpoints and state variants (`active:`, `disabled:`, `focus:`).
- Significantly reduces style boilerplate compared to `StyleSheet.create` for common patterns.

**Consequences:**
- Tailwind's `tailwind.config.js` must be configured at `apps/mobile/tailwind.config.js` with the correct content paths.
- Not all Tailwind properties map 1:1 to React Native. Web-only properties (like `display: block`, `text-decoration`) are silently ignored. Developers should test visual output on device.
- NativeWind v4 is a native module — it requires a custom dev build.
