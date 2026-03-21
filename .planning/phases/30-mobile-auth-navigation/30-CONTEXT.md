# Phase 30: Mobile Auth + Navigation Shell - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the login screen, JWT auth flow with MMKV storage, auth guard routing, and the navigation shell for both driver and owner portals. Each portal gets a bottom tab navigator with placeholder screens. No actual feature screens yet — just the skeleton that all subsequent phases plug into.

</domain>

<decisions>
## Implementation Decisions

### Login screen design
- DriveCommand logo centered at top (Poppins heading font)
- Email + password fields, Sign In button
- Dark background (#0f172a) matching web app dark mode
- Error state inline under the form (not a modal)
- No "Forgot password" on mobile v1 — direct to web app support
- Loading spinner on the button while authenticating (button disabled)

### Token storage
- MMKV (react-native-mmkv) — encrypted storage
- Store: `{ token: string, user: AuthUser }` as JSON string under key "session"
- Biometric unlock: optional, prompt on first login, can skip
- Token validation: call /api/auth/me on app foreground (AppState change to active)
- On 401 from any API call: clear MMKV + redirect to login

### Role-based routing
- After login, read user.role from AuthUser
- OWNER → navigate to /(owner)/ (replace, not push)
- DRIVER → navigate to /(driver)/ (replace, not push)
- Root index.tsx checks MMKV on mount: session exists → route to role portal; no session → route to /login
- No mixed portal access — a driver cannot navigate to owner screens

### Driver tab navigator (5 tabs)
1. Dashboard — House icon
2. Loads — Truck icon
3. HOS — Clock icon
4. Messages — MessageSquare icon (badge for unread)
5. Documents — FileText icon

### Owner tab navigator (5 tabs)
1. Dashboard — LayoutDashboard icon
2. Map — Map icon
3. Loads — Package icon (badge for pending)
4. Drivers — Users icon
5. Fleet — Radio icon (messaging)

### Tab bar styling
- Dark background (#1e293b) with active tint (#0ea5e9 — brand blue)
- Inactive tint (#64748b — muted slate)
- No labels below icons (icon-only tabs, cleaner)
- Safe area respected on all devices

### Shared UI primitives to build in this phase
- Button component (primary, secondary, destructive variants; loading state)
- Card component (surface color, rounded, shadow)
- Badge component (status colors matching web)
- LoadingSpinner (centered, brand color)
- EmptyState (icon + title + subtitle)
- Input component (dark themed, error state)

### Claude's Discretion
- Exact animation on tab switch
- Exact shadow values on cards
- Whether to use expo-blur for tab bar frosted glass effect

</decisions>

<specifics>
## Specific Ideas

- Tab bar should feel like the Samsara mobile app — minimal, icon-only, dark
- The auth guard should be instantaneous — no flash of the wrong screen
- Use Expo Router's `(auth)` group pattern for the login screen to keep it separate from authenticated routes

</specifics>

<deferred>
## Deferred Ideas

- Forgot password flow — Phase 39 post-launch or future phase
- Social login (Google/Apple) — future milestone
- PIN code lock — future phase

</deferred>

---

*Phase: 30-mobile-auth-navigation*
*Context gathered: 2026-03-21*
