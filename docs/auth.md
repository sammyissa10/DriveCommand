# Authentication

DriveCommand uses a custom cookie-based session system. There is no NextAuth, no JWT library, and no third-party auth provider. The session is encrypted with AES-256-GCM using the Web Crypto API, stored as an `httpOnly` cookie named `session`, and expires after 7 days.

**Key files:**

- `src/lib/auth/session.ts` — `encrypt`, `decrypt`, `getSession`, `setSession`, `clearSession`
- `src/lib/auth/server.ts` — `requireAuth`, `requireRole`, `isSystemAdmin`, `getCurrentUser`
- `src/middleware.ts` — request-level auth guard and `x-tenant-id` injection

---

## SessionData Shape

```typescript
interface SessionData {
  userId: string;       // UUID — User.id in the database
  email: string;
  role: string;         // 'OWNER' | 'MANAGER' | 'DRIVER'
  tenantId: string;     // UUID — Tenant.id in the database
  firstName?: string;
  lastName?: string;
  isSystemAdmin?: boolean;
}
```

`tenantId` is the primary scope for all data access. Every server action reads `session.tenantId` to construct tenant-scoped database queries.

`isSystemAdmin` in the session is supplementary — it is set at login time for convenience (to avoid a DB call on every middleware check). The authoritative check is via `isSystemAdmin()` in `server.ts`, which hits the database directly.

---

## Token Format

The cookie value is three base64url-encoded segments joined by `:`:

```
base64url(iv) : base64url(authTag) : base64url(ciphertext)
```

- **IV**: 12 bytes, randomly generated per `encrypt()` call using `crypto.getRandomValues()`
- **Auth tag**: 16 bytes, produced by AES-GCM and appended to ciphertext by Web Crypto
- **Ciphertext**: the AES-256-GCM encrypted JSON of the `SessionData` object

The `AUTH_SECRET` environment variable is SHA-256 hashed to derive the 256-bit AES key. This means `AUTH_SECRET` can be any string of 32+ characters — the hash normalizes it to the required 32-byte key length.

Tampered tokens (wrong IV, wrong auth tag, or wrong key) cause AES-GCM decryption to throw, which `decrypt()` catches and returns `null`.

---

## Session Functions

All session functions are in `src/lib/auth/session.ts`.

**`encrypt(payload: SessionData): Promise<string>`**
Encrypts the payload with AES-256-GCM using a fresh random IV. Returns the `iv:authTag:ciphertext` token string.

**`decrypt(token: string | undefined): Promise<SessionData | null>`**
Decrypts the token. Returns `null` on any failure — tampered token, wrong key, missing token, or malformed format. Never throws.

**`getSession(): Promise<SessionData | null>`**
Reads and decrypts the `session` cookie from `next/headers`. Wrapped with `React.cache()` so decryption runs at most once per request — all callers within the same request share the cached result. Use this in server components, server actions, and API routes.

**`setSession(data: SessionData): Promise<void>`**
Encrypts and sets the `session` cookie with these attributes:
- `httpOnly: true` — inaccessible to JavaScript
- `secure: true` in production — HTTPS only
- `sameSite: 'lax'` — protects against CSRF while allowing navigation links
- `maxAge: 604800` (7 days)
- `path: '/'` — available on all routes

**`clearSession(): Promise<void>`**
Deletes the session cookie. Called on logout.

---

## Auth Helpers (server.ts)

All helpers are in `src/lib/auth/server.ts`. They call `getSession()` internally (benefiting from the `React.cache()` deduplication).

**`getRole(): Promise<UserRole | null>`**
Reads the role from the session cookie. No database call. Use for role checks in server actions where a DB roundtrip is unacceptable.

**`requireAuth(): Promise<string>`**
Throws `Error('Unauthorized: Authentication required')` if there is no session. Returns `session.userId` (a UUID string) on success. Call this at the top of every protected server action.

**`requireRole(allowedRoles: UserRole[]): Promise<UserRole>`**
Throws if the session role is not in `allowedRoles`. Returns the matched role. Use for role-gated server actions.

**`isSystemAdmin(): Promise<boolean>`**
Runs a `$queryRaw` SELECT to check `User.isSystemAdmin` in the database. Returns false if not authenticated. **This makes a database call — use sparingly.** For routine role checks, use `getRole()` or `requireRole()`.

**`getCurrentUser()`**
Fetches the User record using a `bypass_rls` transaction (see [Database](./database.md) for the pattern). Returns `null` if not authenticated. **This makes a database call — use sparingly.**

---

## Role Model

Three roles exist in the `UserRole` enum:

| Role | Description |
|---|---|
| `OWNER` | Full access to all owner portal features for their tenant |
| `MANAGER` | Same access as OWNER (not yet differentiated in middleware) |
| `DRIVER` | Restricted to driver portal paths only (`/my-route`, `/my-load`, `/my-tickets`, `/hours`, `/incidents`, `/messages`) |

Additionally, `User.isSystemAdmin: boolean` flags DriveCommand internal staff. System admins have a `tenantId` (they belong to a tenant) but are routed exclusively to admin portal paths (`/admin*`, `/tenants`). Their `tenantId` is irrelevant for data access — sysadmin operations bypass RLS entirely.

---

## Login and Logout Flow

**Login** — `POST /api/auth/login`
1. Reads `email` and `password` from the request body.
2. Finds the `User` record by email using a `bypass_rls` transaction (no tenant context at login time).
3. Compares the submitted password against `User.passwordHash` with `bcrypt.compare()`.
4. Calls `setSession()` with the user's `userId`, `email`, `role`, `tenantId`, `firstName`, `lastName`, and `isSystemAdmin`.
5. Returns a redirect response to the appropriate portal (`/dashboard` for owners/managers, `/my-route` for drivers, `/admin-support` for sysadmins).

**Logout** — `POST /api/auth/logout`
1. Calls `clearSession()` to delete the session cookie.
2. Redirects to `/sign-in`.

**Accept Invitation** — `GET /accept-invitation?token=<id>` → `POST /api/auth/accept-invitation`
1. Validates the `DriverInvitation` record by UUID `id` and checks `status === 'PENDING'` and `expiresAt > now`.
2. Creates a `User` record with the invitation's `email`, `firstName`, `lastName`, `tenantId`, and `role`.
3. Sets `invitation.status = 'ACCEPTED'`.
4. Calls `setSession()` to auto-log-in the new user.
5. Redirects to `/my-route` (drivers) or `/dashboard` (owners).

---

## Server Action Pattern

Every protected server action starts with these guards:

```typescript
// At the top of every protected server action:
const userId = await requireAuth();
const role = await requireRole([UserRole.OWNER, UserRole.MANAGER]);
const session = await getSession();
// session.tenantId is the tenant scope for this request
```

Because `getSession()` is wrapped with `React.cache()`, calling it after `requireAuth()` and `requireRole()` (which also call `getSession()` internally) does not result in additional cookie reads or decryption work.

---

## isSystemAdmin Bypass

System admin status is checked via `$queryRaw`, which bypasses RLS entirely (runs as the database superuser):

```typescript
const rows = await prisma.$queryRaw<{ isSystemAdmin: boolean }[]>`
  SELECT "isSystemAdmin" FROM "User" WHERE id = ${session.userId}::uuid LIMIT 1
`;
```

The `isSystemAdmin` field on the session cookie is populated at login time for convenience — it allows the middleware to redirect admin users without a database call. However, it is not the sole authority. Any server action that needs to verify admin status should call `isSystemAdmin()` from `server.ts`, which hits the database.

---

## Admin Portal Authentication

The SysAdmin portal (`/admin*`) uses a separate authentication mechanism: a plain `ADMIN_SECRET_KEY` environment variable. Logging in at `/admin/login` compares the submitted password against `ADMIN_SECRET_KEY` with a 500ms artificial delay (brute-force resistance). On success, a separate `admin_session` cookie is set (encrypted with the same AES-256-GCM system).

The middleware checks the `admin_session` cookie for admin portal paths and bypasses all tenant session checks for those routes.
