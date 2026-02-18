---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - prisma/schema.prisma
  - src/middleware.ts
  - src/lib/auth/server.ts
  - src/lib/auth/guards.tsx
  - src/lib/auth/session.ts
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
  - src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
  - src/app/(auth)/layout.tsx
  - src/app/(owner)/layout.tsx
  - src/app/(admin)/layout.tsx
  - src/app/(driver)/layout.tsx
  - src/app/(owner)/actions/drivers.ts
  - src/app/(owner)/dashboard/page.tsx
  - src/app/api/webhooks/clerk/route.ts
  - src/app/onboarding/page.tsx
  - src/app/api/auth/login/route.ts
  - src/app/api/auth/logout/route.ts
  - src/app/api/auth/me/route.ts
  - src/components/navigation/sidebar.tsx
  - src/components/navigation/user-menu.tsx
  - src/lib/db/repositories/tenant.repository.ts
  - prisma/seed.ts
  - .env.example
autonomous: true
must_haves:
  truths:
    - "User can sign in with email demo@drivecommand.com and password demo1234"
    - "Authenticated user is redirected to /dashboard"
    - "Unauthenticated user is redirected to /sign-in on protected routes"
    - "x-tenant-id header is injected for authenticated users with a tenant"
    - "All role-based guards (owner, admin, driver layouts) work with new auth"
    - "Sidebar and user menu display user info without Clerk"
    - "Sign-in page shows demo credentials box"
    - "No Clerk imports remain anywhere in the codebase (outside generated/)"
  artifacts:
    - path: "src/lib/auth/session.ts"
      provides: "Cookie-based session management (encrypt/decrypt/get/set/clear)"
    - path: "src/app/api/auth/login/route.ts"
      provides: "POST login endpoint with bcrypt password verification"
    - path: "src/app/api/auth/logout/route.ts"
      provides: "POST logout endpoint that clears session cookie"
    - path: "src/middleware.ts"
      provides: "Session-based auth middleware injecting x-tenant-id header"
    - path: "src/lib/auth/server.ts"
      provides: "Auth helpers reading from session instead of Clerk"
  key_links:
    - from: "src/app/api/auth/login/route.ts"
      to: "src/lib/auth/session.ts"
      via: "setSession after password verification"
      pattern: "setSession"
    - from: "src/middleware.ts"
      to: "src/lib/auth/session.ts"
      via: "getSession to check auth and extract tenantId"
      pattern: "getSession"
    - from: "src/lib/auth/server.ts"
      to: "src/lib/auth/session.ts"
      via: "getSession for requireAuth, getRole, getCurrentUser"
      pattern: "getSession"
---

<objective>
Remove Clerk authentication entirely and replace with a custom cookie-based session auth system using bcrypt for password hashing. Create a demo user that works out of the box.

Purpose: Eliminate third-party auth dependency (Clerk), making the app self-contained with database-stored credentials. The demo user (demo@drivecommand.com / demo1234) allows instant access without external service configuration.

Output: Fully functional auth system with no Clerk references, custom sign-in page, session cookies, and all existing role-based guards preserved.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@prisma/schema.prisma
@src/middleware.ts
@src/lib/auth/server.ts
@src/lib/auth/roles.ts
@src/lib/auth/guards.tsx
@src/lib/context/tenant-context.ts
@src/app/layout.tsx
@src/app/page.tsx
@src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
@src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
@src/app/(owner)/layout.tsx
@src/app/(admin)/layout.tsx
@src/app/(driver)/layout.tsx
@src/app/(owner)/actions/drivers.ts
@src/app/api/webhooks/clerk/route.ts
@src/app/onboarding/page.tsx
@src/components/navigation/sidebar.tsx
@src/components/navigation/user-menu.tsx
@src/lib/db/repositories/tenant.repository.ts
@prisma/seed.ts
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create session auth infrastructure and update Prisma schema</name>
  <files>
    src/lib/auth/session.ts
    src/app/api/auth/login/route.ts
    src/app/api/auth/logout/route.ts
    src/app/api/auth/me/route.ts
    prisma/schema.prisma
    package.json
    .env.example
  </files>
  <action>
**1. Install bcryptjs (pure JS, no native deps) and remove Clerk packages:**

```bash
npm install bcryptjs
npm install --save-dev @types/bcryptjs
npm uninstall @clerk/nextjs svix
```

Update `.env.example`: Remove all `CLERK_*` and `NEXT_PUBLIC_CLERK_*` entries. Add:
```
AUTH_SECRET=your-secret-key-min-32-chars-change-in-production
```

**2. Update Prisma schema — User model:**

Replace `clerkUserId String @unique` with `passwordHash String?` (optional since existing demo seed users won't have hashes initially — the seed will set them).

Keep the `@@index([clerkUserId])` line but rename it: remove the `@@index([clerkUserId])` line entirely (no longer needed). Keep `@@index([email])`.

Add `@@unique([email, tenantId])` to ensure email is unique per tenant.

Run `npx prisma db push` after schema changes. Then run `npx prisma generate`.

**3. Create `src/lib/auth/session.ts` — Cookie-based session management:**

Use Next.js `cookies()` API with encrypted JSON session cookies. Use Node.js `crypto` module (built-in) for AES-256-GCM encryption (no external JWT library needed).

Session cookie structure: `{ userId: string, email: string, role: string, tenantId: string, firstName?: string, lastName?: string }`

Functions to export:
- `encrypt(payload: SessionData): string` — AES-256-GCM encrypt JSON payload using AUTH_SECRET env var
- `decrypt(token: string): SessionData | null` — decrypt and parse, return null on failure
- `getSession(): Promise<SessionData | null>` — read `session` cookie, decrypt
- `setSession(data: SessionData): Promise<void>` — encrypt, set httpOnly cookie with path=/, maxAge=7 days, sameSite=lax, secure in production
- `clearSession(): Promise<void>` — delete the `session` cookie

Use `process.env.AUTH_SECRET` (must be at least 32 chars). Derive a 32-byte key from it using `crypto.createHash('sha256').update(secret).digest()`.

**4. Create `src/app/api/auth/login/route.ts`:**

POST endpoint:
- Accept `{ email, password }` JSON body
- Look up user by email (bypass RLS with `set_config('app.bypass_rls', 'on', TRUE)` in transaction, same pattern as seed.ts)
- Compare password with `bcrypt.compare(password, user.passwordHash)`
- If match: call `setSession({ userId: user.id, email: user.email, role: user.role, tenantId: user.tenantId, firstName: user.firstName, lastName: user.lastName })`
- Return `{ success: true, redirectUrl: '/dashboard' }` on success
- Return `{ error: 'Invalid email or password' }` with 401 on failure
- If user has no passwordHash, return 401 with same generic error

**5. Create `src/app/api/auth/logout/route.ts`:**

POST endpoint:
- Call `clearSession()`
- Return `{ success: true }` with 200

**6. Create `src/app/api/auth/me/route.ts`:**

GET endpoint:
- Call `getSession()`
- If no session, return 401
- Return session data (userId, email, role, tenantId, firstName, lastName)
  </action>
  <verify>
Run `npx prisma db push` and `npx prisma generate` successfully. Verify `bcryptjs` is in package.json and `@clerk/nextjs` and `svix` are removed. Verify `src/lib/auth/session.ts` exports getSession, setSession, clearSession. Verify login/logout/me routes exist and TypeScript compiles.
  </verify>
  <done>
Session infrastructure is in place: encrypted cookie sessions, login/logout/me API routes, Prisma schema updated with passwordHash field replacing clerkUserId. Clerk packages removed from package.json.
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace all Clerk references across middleware, layouts, components, and actions</name>
  <files>
    src/middleware.ts
    src/lib/auth/server.ts
    src/lib/auth/guards.tsx
    src/app/layout.tsx
    src/app/page.tsx
    src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
    src/app/(auth)/layout.tsx
    src/app/(owner)/layout.tsx
    src/app/(admin)/layout.tsx
    src/app/(driver)/layout.tsx
    src/app/(owner)/actions/drivers.ts
    src/app/(owner)/dashboard/page.tsx
    src/app/onboarding/page.tsx
    src/app/api/webhooks/clerk/route.ts
    src/components/navigation/sidebar.tsx
    src/components/navigation/user-menu.tsx
    src/lib/db/repositories/tenant.repository.ts
  </files>
  <action>
**CRITICAL: Every file that imports from `@clerk/nextjs` or `@clerk/nextjs/server` must be updated. Zero Clerk imports should remain.**

**1. `src/middleware.ts` — Complete rewrite:**

Replace Clerk middleware with custom session-based middleware:
- Import `getSession` from `@/lib/auth/session` (NOTE: cannot use `cookies()` from `next/headers` in middleware — must use `request.cookies` directly. So create a `getSessionFromRequest(request: NextRequest)` approach: read `session` cookie from `request.cookies.get('session')?.value`, then decrypt it inline).
- Public routes: `/sign-in`, `/sign-up`, `/api/auth/login`, `/api/auth/logout`, `/api/webhooks(.*)`, `/_next/static`, `/_next/image`, `/favicon.ico`
- If no session on protected route: redirect to `/sign-in?redirect_url={current_url}`
- If session exists but no tenantId: redirect to `/onboarding` (unless already on `/onboarding` or `/api`)
- If session with tenantId: inject `x-tenant-id` header into request (same pattern as current middleware)
- Keep the same `config.matcher` pattern

For decrypting in middleware: duplicate the decrypt logic inline or import from a shared module that does NOT use `next/headers` (since middleware uses `NextRequest`). Best approach: make `decrypt` a pure function in `session.ts` that takes a token string (no cookies dependency), and have `getSession` call `decrypt(cookies().get('session')?.value)`. Then middleware can call `decrypt(request.cookies.get('session')?.value)` directly.

**2. `src/lib/auth/server.ts` — Replace all `auth()` calls:**

Replace `import { auth } from '@clerk/nextjs/server'` with `import { getSession } from '@/lib/auth/session'`.

- `getRole()`: Call `getSession()`, return `session.role as UserRole` or null
- `requireAuth()`: Call `getSession()`, throw if null, return `session.userId` (the database UUID, not clerkUserId)
- `requireRole()`: Call `getRole()`, check against allowed roles
- `isSystemAdmin()`: Call `getSession()`, if no session return false. Look up user by `id` (not clerkUserId) — `prisma.user.findUnique({ where: { id: session.userId } })`, return `user?.isSystemAdmin ?? false`
- `getCurrentUser()`: Call `getSession()`, if no session return null. Look up by `id` — `prisma.user.findUnique({ where: { id: session.userId } })`

**3. `src/lib/auth/guards.tsx` — Replace `useUser` from Clerk:**

Replace `useUser` with a React context approach. Create a `useAuth` hook:
- Create `src/lib/auth/auth-context.tsx` (new file):
  - `AuthContext` with `{ user: { id, email, role, firstName, lastName } | null, isLoaded: boolean }`
  - `AuthProvider` component that fetches `/api/auth/me` on mount and provides context
  - `useAuth()` hook that reads from context
- Update `guards.tsx`: Replace `useUser()` with `useAuth()`. Read `role` from `auth.user.role` instead of `user?.publicMetadata?.role`.

**4. `src/app/layout.tsx` — Remove ClerkProvider:**

Remove `ClerkProvider` import and wrapping. Remove the `hasClerkKey` conditional. Just render html/body directly. Wrap children in `<AuthProvider>` from the new auth-context.

**5. `src/app/page.tsx` — Replace Clerk auth check:**

Replace `import { auth } from '@clerk/nextjs/server'` with `import { getSession } from '@/lib/auth/session'`. Replace `const { userId } = await auth()` with `const session = await getSession()`. Check `session` instead of `userId`.

**6. `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` — Custom sign-in form:**

Replace Clerk `<SignIn>` with a custom "use client" form component:
- Email input, password input, submit button
- On submit: `fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })`
- On success: `window.location.href = data.redirectUrl` (use window.location for full page reload to pick up new cookie)
- On error: show error message
- Keep the demo credentials box below the form (same styling as current)
- Style with Tailwind to match the app's design: card with shadow, branded header, blue primary button

**7. `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — Simplify or redirect:**

Since we're removing self-service sign-up (credentials are managed in DB), replace with a simple page that says "Contact your administrator to get an account" with a link back to sign-in. This is appropriate because drivers are invited and owners are seeded.

**8. `src/app/(owner)/layout.tsx`, `src/app/(admin)/layout.tsx`, `src/app/(driver)/layout.tsx`:**

In ALL three layouts: Replace `import { auth } from '@clerk/nextjs/server'` with `import { getSession } from '@/lib/auth/session'`. Replace `const { userId } = await auth()` with `const session = await getSession()`. Check `!session` instead of `!userId`. The rest of the logic (getRole, requireRole, isSystemAdmin calls) stays the same since those helpers are already updated.

**9. `src/components/navigation/sidebar.tsx` — Replace `useUser`:**

Replace `import { useUser } from '@clerk/nextjs'` with `import { useAuth } from '@/lib/auth/auth-context'`. Replace `const { user } = useUser()` with `const { user } = useAuth()`. Replace `user?.publicMetadata?.role as UserRole` with `user?.role as UserRole`.

**10. `src/components/navigation/user-menu.tsx` — Replace Clerk UserButton:**

Replace Clerk's `<UserButton>` with a custom dropdown showing user initials avatar and a sign-out option:
- Import `useAuth` from auth-context
- Show user's initials in a circle (e.g., "DO" for Demo Owner) using first letter of firstName + lastName
- Show user email below name
- Sign out button that calls `fetch('/api/auth/logout', { method: 'POST' })` then `window.location.href = '/sign-in'`
- Use Radix Popover or simple dropdown with Tailwind styling

**11. `src/app/(owner)/actions/drivers.ts` — Remove clerkClient usage:**

Remove `import { clerkClient } from '@clerk/nextjs/server'`.
- `inviteDriver`: Remove the Clerk invitation API call. Instead, just create the `DriverInvitation` record in the database with status PENDING. Generate a random `clerkInvitationId` value (or make that field optional in schema and set null). The invitation is now just a database record. Remove the Clerk invitation code block entirely.
- `deactivateDriver`: Remove the Clerk session revocation code. Just set `isActive: false` in the database. The middleware will check `isActive` on next request (or simply: since we control sessions, clearing their cookie would require knowing their session — simpler to just mark inactive and let middleware/auth check handle it).

**12. `src/app/api/webhooks/clerk/route.ts` — Delete this file entirely.**

It's Clerk-specific and no longer needed. User provisioning now happens at seed time or through direct database operations.

**13. `src/app/onboarding/page.tsx` — Simplify:**

Remove Clerk imports (`auth`, `clerkClient`, `SignOutButton`). Replace with session-based check:
- Call `getSession()`. If no session, redirect to `/sign-in`.
- If session has tenantId, redirect to `/dashboard`.
- If no tenantId, show a message: "Your account is being set up. Please contact your administrator."
- Add a simple sign-out link that calls the logout API.

**14. `src/lib/db/repositories/tenant.repository.ts`:**

Replace `ownerClerkUserId` parameter name with `ownerId` or remove the provisioning method since it's no longer called from a webhook. Keep `findTenantByClerkUserId` but rename to `findTenantByUserId` and change the query from `{ clerkUserId }` to `{ id: userId }`. Or remove methods that are no longer used. Keep `listAllTenants`.

**15. `src/app/(owner)/dashboard/page.tsx`:**

Remove the comment referencing `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`. No code changes needed beyond removing the comment.

**16. `.env.example`:**

Remove all `CLERK_*` and `NEXT_PUBLIC_CLERK_*` entries. Add `AUTH_SECRET=change-this-to-a-random-32-char-string-in-production`.
  </action>
  <verify>
Run `grep -r "@clerk" src/ --include="*.ts" --include="*.tsx" | grep -v "generated/"` — should return ZERO results. Run `grep -r "clerkClient\|ClerkProvider\|useUser.*clerk\|UserButton.*clerk" src/ --include="*.ts" --include="*.tsx" | grep -v "generated/"` — should return ZERO results. Run `npx next build` (or at minimum `npx tsc --noEmit`) to verify TypeScript compiles with no errors.
  </verify>
  <done>
All Clerk imports and usage removed from every file in `src/` (excluding `generated/`). Middleware uses session cookies. All layouts use `getSession()`. Sidebar and user-menu use custom `useAuth` hook. Sign-in page has custom form. Webhook route deleted. Driver actions no longer call Clerk API. The app compiles with zero Clerk references.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update seed script with bcrypt passwords, run migration, and verify end-to-end auth</name>
  <files>
    prisma/seed.ts
  </files>
  <action>
**1. Update `prisma/seed.ts`:**

Add `import bcrypt from 'bcryptjs'` at the top.

In the demo tenant creation section, update the owner user:
- Change `clerkUserId: demo_owner_...` to remove clerkUserId (field no longer exists)
- Add `passwordHash: await bcrypt.hash('demo1234', 12)`
- Change email from `owner@drivecommand.demo` to `demo@drivecommand.com` (matching the demo credentials shown on sign-in page)

For driver users in the seed: Add passwordHash too so they can also log in if needed (use `await bcrypt.hash('driver1234', 12)` for all drivers). Remove the `clerkUserId` fields from all user creates.

For the driver invitation records: Make `clerkInvitationId` optional in the Prisma schema if not already (or remove it from seed data and schema). Since Clerk is gone, this field is vestigial. Either:
- Option A: Remove `clerkInvitationId` from the DriverInvitation model entirely in schema.prisma (cleaner)
- Option B: Make it optional and stop setting it in seeds

Choose Option A (remove the field) since Clerk is fully removed. Run `npx prisma db push` after this change.

Also in the webhook tenant-takeover logic that was in the webhook handler — since that's deleted, ensure the seed creates the owner with the correct email `demo@drivecommand.com`. The current seed creates owners with `owner@drivecommand.demo` — change this to `demo@drivecommand.com`.

**2. Also update `prisma/seeds/seed-fleet-intelligence.ts` if it references clerkUserId.**

Check and update if needed.

**3. Run the seed:**

```bash
npx prisma db push
npx prisma generate
npm run seed -- --reset
```

**4. Verify end-to-end:**

```bash
npm run build
```

If build succeeds, start dev server and test:
- Visit `/sign-in` — custom form appears with demo credentials box
- Enter `demo@drivecommand.com` / `demo1234` — should redirect to `/dashboard`
- Visit `/sign-in` while logged in — should redirect to `/dashboard`
- The sidebar should show user info
- Sign out should clear session and redirect to `/sign-in`

**5. Clean up `.env.local`:**

Add `AUTH_SECRET=dev-secret-key-for-local-development-only-change-in-prod` to `.env.local` if not present (do NOT commit this file). Remove any `CLERK_*` vars from `.env.local`.

**IMPORTANT:** Also remove any Clerk-related entries from `.env` if that file exists and has Clerk vars. The `.env` file should not have Clerk keys anymore.
  </action>
  <verify>
Run `npm run build` — must succeed with zero errors. Run `npm run seed -- --reset` — seed completes with demo user having passwordHash. Verify with: `grep -r "clerk" prisma/ --include="*.ts" | grep -v node_modules` — zero results (seed no longer references Clerk). Verify `grep -r "@clerk\|clerkUserId\|clerkClient" src/ --include="*.ts" --include="*.tsx" | grep -v generated/` returns nothing.
  </verify>
  <done>
Seed script creates demo user (demo@drivecommand.com / demo1234) with bcrypt-hashed password. All clerkUserId references removed from seeds. The app builds successfully. End-to-end login flow works: sign-in form -> API login -> session cookie -> dashboard with correct tenant context and role-based access.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` passes with zero errors
2. `grep -r "@clerk" src/ --include="*.ts" --include="*.tsx" | grep -v "generated/"` returns nothing
3. `grep -r "clerkUserId" prisma/ --include="*.ts"` returns nothing
4. `grep -r "CLERK" .env.example` returns nothing
5. The sign-in page renders a custom email/password form with demo credentials box
6. Login with demo@drivecommand.com / demo1234 redirects to /dashboard
7. Protected routes redirect to /sign-in when not authenticated
8. x-tenant-id header is set correctly for authenticated requests
9. User menu shows user info and sign-out works
10. Sidebar role-based visibility (Fleet Intelligence for OWNER/MANAGER) works
</verification>

<success_criteria>
- Zero Clerk references in source code (outside generated/)
- Zero Clerk packages in package.json
- Custom sign-in form with demo credentials box
- Demo user (demo@drivecommand.com / demo1234) works out of the box after seeding
- All role-based guards (owner, admin, driver) function correctly
- Session cookie auth with x-tenant-id injection in middleware
- `npm run build` succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/5-remove-clerk-and-replace-with-custom-ema/5-SUMMARY.md`
</output>
