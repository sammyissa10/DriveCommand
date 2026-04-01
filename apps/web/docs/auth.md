# Authentication

DriveCommand uses Supabase Auth for all authentication. Sessions are managed via `@supabase/ssr` — cookie-based sessions set automatically on sign-in, with no custom JWT libraries or AES session encryption.

**Key files:**

- `src/lib/auth/supabase.ts` — all server-side auth helpers: `getSession()`, `requireAuth`, `requireRole`, `isSystemAdmin`, `getCurrentUser`, `requirePermission`
- `src/lib/auth/mobile-auth.ts` — `validateMobileToken()` for mobile Bearer token auth
- `src/lib/auth/permissions.ts` — `UserPermissions` interface and permission key definitions
- `src/lib/auth/guards.tsx` — server component auth guard wrappers
- `src/lib/auth/auth-context.tsx` — client-side auth context (used by web client components)
- `src/middleware.ts` — request-level auth guard and `x-tenant-id` injection

---

## SessionData Shape

```typescript
interface SessionData {
  userId: string;       // UUID — User.id in the database (same as Supabase Auth user id)
  email: string;
  role: string;         // 'OWNER' | 'MANAGER' | 'DRIVER'
  tenantId: string;     // UUID — Tenant.id in the database
  firstName?: string;
  lastName?: string;
  isSystemAdmin?: boolean;
  permissions?: UserPermissions;
}
```

`tenantId` is the primary scope for all data access. Every server action reads `session.tenantId` to construct tenant-scoped database queries.

---

## Metadata Storage

Security-critical claims are split from display fields across two Supabase metadata buckets:

| Field | Metadata bucket | Writable by |
|---|---|---|
| `role` | `app_metadata` | Service role only (admin) |
| `tenantId` | `app_metadata` | Service role only (admin) |
| `isSystemAdmin` | `app_metadata` | Service role only (admin) |
| `permissions` | `app_metadata` | Service role only (admin) |
| `firstName` | `user_metadata` | User (via `supabase.auth.updateUser`) |
| `lastName` | `user_metadata` | User (via `supabase.auth.updateUser`) |

`app_metadata` is admin-only — end users cannot overwrite these fields via `supabase.auth.updateUser()`. This prevents privilege escalation (e.g., a user changing their own role).

`getSession()` uses a dual-source pattern:
```typescript
const appMeta = user.app_metadata || {};
const userMeta = user.user_metadata || {};
// Security claims from appMeta, display fields from userMeta
```

---

## Session Functions

**`getSession(): Promise<SessionData | null>`**
Reads the current Supabase Auth user via `supabase.auth.getUser()`. Wrapped with `React.cache()` so the Supabase call runs at most once per request. Returns `null` if not authenticated.

---

## Auth Helpers (supabase.ts)

All helpers call `getSession()` internally (benefiting from `React.cache()` deduplication).

**`getRole(): Promise<UserRole | null>`**
Reads the role from the session. No database call.

**`requireAuth(): Promise<string>`**
Throws `Error('Unauthorized: Authentication required')` if there is no session. Returns `session.userId` on success.

**`requireRole(allowedRoles: UserRole[]): Promise<UserRole>`**
Throws if the session role is not in `allowedRoles`. Returns the matched role.

**`isSystemAdmin(): Promise<boolean>`**
Runs a `$queryRaw` SELECT to check `User.isSystemAdmin` in the database. **Makes a DB call — use sparingly.**

**`getCurrentUser()`**
Fetches the User record via a `bypass_rls` transaction. **Makes a DB call — use sparingly.**

**`requirePermission(key: keyof UserPermissions): Promise<void>`**
Throws `Error('Forbidden')` if the current session does not have the specified permission enabled. Permissions are stored in `app_metadata` and are only relevant for `MANAGER` role users (owners have all permissions implicitly).

---

## Role Model

Three roles exist in the `UserRole` enum:

| Role | Description |
|---|---|
| `OWNER` | Full access to all owner portal features for their tenant |
| `MANAGER` | Configurable subset of owner access via `permissions` in `app_metadata` |
| `DRIVER` | Restricted to driver portal paths only (`/my-route`, `/my-load`, `/hours`, `/incidents`, `/messages`) |

`isSystemAdmin: boolean` flags DriveCommand internal staff. System admins are routed exclusively to admin portal paths (`/admin*`, `/tenants`).

---

## Login and Logout Flow

**Login** — `POST /api/auth/login`
1. Calls `supabase.auth.signInWithPassword({ email, password })`.
2. `@supabase/ssr` sets session cookies automatically.
3. Reads security claims (`role`, `isSystemAdmin`) from `user.app_metadata` to determine redirect URL.
4. Returns `{ redirectUrl, token, refreshToken, user }` for both web and mobile.

**Logout** — `POST /api/auth/logout`
1. Calls `supabase.auth.signOut()` which clears the session cookie.
2. Redirects to `/sign-in`.

**Accept Invitation** — `GET /accept-invitation?id=<uuid>` → `POST /api/auth/accept-invitation`
1. Validates `DriverInvitation` record (PENDING, not expired).
2. Creates Supabase Auth user via `admin.auth.admin.createUser()` with security claims in `app_metadata` and display fields in `user_metadata`.
3. Creates Prisma `User` record.
4. Calls `supabase.auth.signInWithPassword()` to auto-log-in the new user.
5. Returns redirect to `/my-route` (drivers) or `/dashboard` (owners/managers).

---

## Mobile Authentication

Mobile API routes use Bearer token auth (not cookies). The flow:

1. Mobile client calls `POST /api/auth/login` → receives `access_token`.
2. Stores token in MMKV secure storage.
3. Every `/api/mobile/*` request includes `Authorization: Bearer <token>`.
4. Route handlers call `validateMobileToken(req)` from `mobile-auth.ts`, which uses `admin.auth.getUser(token)` to verify and extract `{ userId, tenantId, role }` from `user.app_metadata`.

---

## Server Action Pattern

Every protected server action starts with these guards:

```typescript
const session = await getSession();
if (!session) throw new Error('Unauthorized');
const role = session.role as UserRole;
if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
  throw new Error('Unauthorized');
}
// session.tenantId is the tenant scope for this request
```

`getSession()` is wrapped with `React.cache()` — multiple calls within the same request are deduplicated automatically.

---

## Admin Portal Authentication

The SysAdmin portal (`/admin*`) uses a separate mechanism: `ADMIN_SECRET_KEY` environment variable. Logging in at `/admin/login` compares the submitted key against `ADMIN_SECRET_KEY`. On success, a Supabase Auth session for a designated sysadmin user is established.
