---
phase: quick-109
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/supabase/server.ts
  - apps/web/src/lib/supabase/client.ts
  - apps/web/src/lib/supabase/middleware.ts
  - apps/web/src/lib/supabase/admin.ts
  - apps/web/src/lib/auth/session.ts
  - apps/web/src/lib/auth/server.ts
  - apps/web/src/lib/auth/require-permission.ts
  - apps/web/src/lib/auth/mobile-auth.ts
  - apps/web/src/middleware.ts
  - apps/web/src/app/api/auth/login/route.ts
  - apps/web/src/app/api/auth/logout/route.ts
  - apps/web/src/app/api/auth/me/route.ts
  - apps/web/src/app/api/auth/accept-invitation/route.ts
  - apps/web/src/app/api/auth/callback/route.ts
  - apps/web/package.json
autonomous: false
user_setup:
  - service: supabase
    why: "Supabase Auth requires service_role key for admin operations"
    env_vars:
      - name: SUPABASE_SERVICE_ROLE_KEY
        source: "Supabase Dashboard -> Settings -> API -> service_role (secret key)"
    dashboard_config:
      - task: "Copy service_role key and add to .env.local and Vercel env vars"
        location: "Supabase Dashboard -> Settings -> API"
must_haves:
  truths:
    - "User can sign in with demo@drivecommand.com / demo1234 via Supabase Auth"
    - "Session is managed by Supabase (cookie-based via @supabase/ssr)"
    - "Middleware validates Supabase session and injects x-tenant-id header"
    - "Role-based redirects still work (DRIVER->my-route, OWNER->dashboard, SYSADMIN->admin-dashboard)"
    - "Mobile app can authenticate and receive a Supabase access token"
    - "Server-side getSession/requireAuth/getRole still work for all existing server actions"
    - "Driver invitation flow creates Supabase auth user and app User record"
  artifacts:
    - path: "apps/web/src/lib/supabase/server.ts"
      provides: "Server-side Supabase client (cookieStore-based)"
    - path: "apps/web/src/lib/supabase/client.ts"
      provides: "Browser-side Supabase client"
    - path: "apps/web/src/lib/supabase/middleware.ts"
      provides: "Middleware Supabase client for session refresh"
    - path: "apps/web/src/lib/supabase/admin.ts"
      provides: "Admin Supabase client using service_role key"
    - path: "apps/web/src/lib/auth/session.ts"
      provides: "Rewritten getSession using Supabase, same SessionData interface"
  key_links:
    - from: "apps/web/src/middleware.ts"
      to: "apps/web/src/lib/supabase/middleware.ts"
      via: "createMiddlewareClient to refresh session"
    - from: "apps/web/src/lib/auth/session.ts"
      to: "apps/web/src/lib/supabase/server.ts"
      via: "getSession reads Supabase user + user_metadata"
    - from: "apps/web/src/app/api/auth/login/route.ts"
      to: "supabase.auth.signInWithPassword"
      via: "Supabase client call replaces bcrypt"
---

<objective>
Migrate DriveCommand web authentication from custom bcrypt/AES-256-GCM session system to Supabase Auth.

Purpose: Replace hand-rolled auth with Supabase Auth for better security, session management, and future OAuth/SSO support. User metadata in JWT eliminates Prisma DB lookups during auth flow (bypassing the broken IPv6 DB connection from Vercel).

Output: All auth flows (login, logout, session validation, middleware, mobile token, invitation) use Supabase Auth. The existing User table and all downstream consumers (server actions, layouts, API routes) continue working unchanged.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/auth/session.ts
@apps/web/src/lib/auth/server.ts
@apps/web/src/lib/auth/mobile-auth.ts
@apps/web/src/lib/auth/require-permission.ts
@apps/web/src/lib/auth/permissions.ts
@apps/web/src/lib/auth/roles.ts
@apps/web/src/middleware.ts
@apps/web/src/app/api/auth/login/route.ts
@apps/web/src/app/api/auth/logout/route.ts
@apps/web/src/app/api/auth/me/route.ts
@apps/web/src/app/api/auth/accept-invitation/route.ts
@apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
@apps/web/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install Supabase packages, create client utilities, and create demo user in Supabase Auth</name>
  <files>
    apps/web/package.json
    apps/web/src/lib/supabase/server.ts
    apps/web/src/lib/supabase/client.ts
    apps/web/src/lib/supabase/middleware.ts
    apps/web/src/lib/supabase/admin.ts
    apps/web/.env.local
    apps/web/.env.example
  </files>
  <action>
    **1. Install packages:**
    ```bash
    cd apps/web && npm install @supabase/supabase-js @supabase/ssr
    ```

    **2. Add env vars to .env.local** (append, do not overwrite existing):
    ```
    NEXT_PUBLIC_SUPABASE_URL=https://oqdhberkghtnszrkdvfm.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xZGhiZXJrZ2h0bnN6cmtkdmZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTY3MzgsImV4cCI6MjA4OTk3MjczOH0.Y4R8ZqOeQCfUVQR-5_sQ_gx3e1tF5hft7xfd_TZOXas
    SUPABASE_SERVICE_ROLE_KEY=placeholder-user-must-add-real-key
    ```
    Also update .env.example with placeholder versions of these 3 vars.

    **3. Create `apps/web/src/lib/supabase/client.ts`** — Browser client:
    ```typescript
    import { createBrowserClient } from '@supabase/ssr';
    export function createClient() {
      return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }
    ```

    **4. Create `apps/web/src/lib/supabase/server.ts`** — Server client (for Server Components, Server Actions, Route Handlers):
    Uses `createServerClient` from `@supabase/ssr` with `cookies()` from `next/headers`.
    Must handle both get and set on the cookie store. Follow the official @supabase/ssr pattern for Next.js App Router:
    ```typescript
    import { createServerClient } from '@supabase/ssr';
    import { cookies } from 'next/headers';

    export async function createSupabaseServerClient() {
      const cookieStore = await cookies();
      return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch { /* Called from Server Component — ignore */ }
            },
          },
        }
      );
    }
    ```

    **5. Create `apps/web/src/lib/supabase/middleware.ts`** — Middleware client:
    Uses `createServerClient` from `@supabase/ssr` with NextRequest/NextResponse cookie handling.
    Returns both `supabase` client and `response` (with refreshed cookie headers). Follow the official pattern:
    ```typescript
    import { createServerClient } from '@supabase/ssr';
    import { NextRequest, NextResponse } from 'next/server';

    export async function createMiddlewareClient(request: NextRequest) {
      let supabaseResponse = NextResponse.next({ request });
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              supabaseResponse = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
              );
            },
          },
        }
      );
      return { supabase, response: supabaseResponse };
    }
    ```

    **6. Create `apps/web/src/lib/supabase/admin.ts`** — Admin client (service_role):
    ```typescript
    import { createClient } from '@supabase/supabase-js';

    export function createAdminClient() {
      return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
    }
    ```

    **7. Create demo user in Supabase Auth** via a one-time script OR directly in the login route migration (Task 2). The preferred approach: use the admin client in the login route's first-run to auto-create the Supabase auth user if it doesn't exist. BUT for clean setup, create a script `apps/web/scripts/create-supabase-demo-user.ts`:
    ```typescript
    // Run: npx tsx apps/web/scripts/create-supabase-demo-user.ts
    import { createClient } from '@supabase/supabase-js';
    import 'dotenv/config';

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    async function main() {
      // Create demo user with the SAME UUID as the existing User record
      const { data, error } = await supabase.auth.admin.createUser({
        id: 'a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a',
        email: 'demo@drivecommand.com',
        password: 'demo1234',
        email_confirm: true,
        user_metadata: {
          role: 'OWNER',
          tenantId: '7e9eca25-1f97-46ed-9365-e67be49436d5',
          firstName: 'Demo',
          lastName: 'User',
          isSystemAdmin: false,
          permissions: {
            canViewPayroll: true, canViewInvoices: true, canViewCRM: true,
            canViewAIDocuments: true, canViewLaneAnalytics: true,
            canViewProfitPredictor: true, canViewIFTA: true,
            canManageSettings: true, canViewBilling: true,
          },
        },
      });
      if (error) {
        if (error.message?.includes('already been registered')) {
          console.log('Demo user already exists in Supabase Auth. Updating metadata...');
          const { error: updateError } = await supabase.auth.admin.updateUserById(
            'a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a',
            {
              password: 'demo1234',
              user_metadata: {
                role: 'OWNER',
                tenantId: '7e9eca25-1f97-46ed-9365-e67be49436d5',
                firstName: 'Demo', lastName: 'User',
                isSystemAdmin: false,
                permissions: {
                  canViewPayroll: true, canViewInvoices: true, canViewCRM: true,
                  canViewAIDocuments: true, canViewLaneAnalytics: true,
                  canViewProfitPredictor: true, canViewIFTA: true,
                  canManageSettings: true, canViewBilling: true,
                },
              },
            }
          );
          if (updateError) console.error('Update failed:', updateError);
          else console.log('Demo user metadata updated.');
        } else {
          console.error('Failed to create demo user:', error);
        }
      } else {
        console.log('Demo user created:', data.user.id);
      }
    }
    main();
    ```

    IMPORTANT: The script MUST be run AFTER the user adds the real SUPABASE_SERVICE_ROLE_KEY to .env.local. Add a note at the top of the script file.
  </action>
  <verify>
    - `ls apps/web/node_modules/@supabase/ssr` confirms package installed
    - `ls apps/web/src/lib/supabase/` shows server.ts, client.ts, middleware.ts, admin.ts
    - `grep SUPABASE apps/web/.env.local` shows all 3 env vars
    - TypeScript compiles: `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -20` (no errors in supabase/ files)
  </verify>
  <done>
    Supabase client utilities exist for all 4 contexts (browser, server, middleware, admin). Env vars configured. Demo user creation script ready.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite auth layer — session.ts, server.ts, login, logout, me, middleware, mobile-auth, invitation</name>
  <files>
    apps/web/src/lib/auth/session.ts
    apps/web/src/lib/auth/server.ts
    apps/web/src/lib/auth/require-permission.ts
    apps/web/src/lib/auth/mobile-auth.ts
    apps/web/src/middleware.ts
    apps/web/src/app/api/auth/login/route.ts
    apps/web/src/app/api/auth/logout/route.ts
    apps/web/src/app/api/auth/me/route.ts
    apps/web/src/app/api/auth/accept-invitation/route.ts
    apps/web/src/app/api/auth/callback/route.ts
  </files>
  <action>
    **CRITICAL DESIGN PRINCIPLE:** Store role, tenantId, firstName, lastName, isSystemAdmin, and permissions in Supabase `user_metadata`. The JWT's `user_metadata` claim is readable without any DB query. This is the key to bypassing the broken Prisma/IPv6 connection for auth flows.

    **A. Rewrite `apps/web/src/lib/auth/session.ts`:**

    Keep the SAME `SessionData` interface and SAME `getSession` export signature. Remove ALL AES-256-GCM encryption code. The new implementation:

    ```typescript
    import { cache } from 'react';
    import type { UserPermissions } from './permissions';

    export interface SessionData {
      userId: string;
      email: string;
      role: string;
      tenantId: string;
      firstName?: string;
      lastName?: string;
      isSystemAdmin?: boolean;
      permissions?: UserPermissions;
    }

    // getSession reads from Supabase auth — cached per request
    export const getSession = cache(async function getSession(): Promise<SessionData | null> {
      // Dynamic import to avoid circular deps and ensure server-only
      const { createSupabaseServerClient } = await import('@/lib/supabase/server');
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const meta = user.user_metadata || {};
      return {
        userId: user.id,
        email: user.email!,
        role: meta.role || 'DRIVER',
        tenantId: meta.tenantId || '',
        firstName: meta.firstName,
        lastName: meta.lastName,
        isSystemAdmin: meta.isSystemAdmin || false,
        permissions: meta.permissions,
      };
    });
    ```

    Remove `encrypt`, `decrypt`, `setSession`, `clearSession` exports. Any file that imports them will be updated in this task.

    **B. Rewrite `apps/web/src/app/api/auth/login/route.ts`:**

    Replace bcrypt verification with `supabase.auth.signInWithPassword({ email, password })`. After successful sign-in, read user_metadata from the Supabase user for role/tenantId. The login route must ALSO return a token for the mobile app — use the Supabase `session.access_token`.

    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { createSupabaseServerClient } from '@/lib/supabase/server';

    export async function POST(req: NextRequest) {
      try {
        const { email, password } = await req.json();
        if (!email || !password) {
          return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase().trim(),
          password,
        });

        if (error || !data.user) {
          return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        const meta = data.user.user_metadata || {};
        const name = [meta.firstName, meta.lastName].filter(Boolean).join(' ') || data.user.email;

        let redirectUrl = '/dashboard';
        if (meta.isSystemAdmin) redirectUrl = '/admin-dashboard';
        else if (meta.role === 'DRIVER') redirectUrl = '/my-route';

        return NextResponse.json({
          success: true,
          redirectUrl,
          // Mobile app reads these:
          token: data.session?.access_token,
          refreshToken: data.session?.refresh_token,
          user: {
            id: data.user.id,
            email: data.user.email,
            name,
            role: meta.role,
            tenantId: meta.tenantId,
            companyName: meta.companyName || '',
          },
        });
      } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'An error occurred during login' }, { status: 500 });
      }
    }
    ```

    **C. Rewrite `apps/web/src/app/api/auth/logout/route.ts`:**

    ```typescript
    import { NextResponse } from 'next/server';
    import { createSupabaseServerClient } from '@/lib/supabase/server';

    export async function POST() {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
      return NextResponse.json({ success: true });
    }
    ```

    **D. Rewrite `apps/web/src/app/api/auth/me/route.ts`:**

    For web (cookie-based): use the server client's `getUser()` and return user_metadata fields.
    For mobile (Bearer token): validate the Supabase JWT. Use the Supabase admin client's `getUser(token)` to validate the access_token from the Authorization header.

    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { createSupabaseServerClient } from '@/lib/supabase/server';
    import { createAdminClient } from '@/lib/supabase/admin';

    export async function GET(req: NextRequest) {
      const authHeader = req.headers.get('Authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (bearerToken) {
        // Mobile: validate Supabase access token
        const admin = createAdminClient();
        const { data: { user }, error } = await admin.auth.getUser(bearerToken);
        if (error || !user) {
          return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const meta = user.user_metadata || {};
        const name = [meta.firstName, meta.lastName].filter(Boolean).join(' ') || user.email;
        return NextResponse.json({
          id: user.id, email: user.email, name,
          role: meta.role, tenantId: meta.tenantId,
          companyName: meta.companyName || '',
        });
      }

      // Web: cookie-based session
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      const meta = user.user_metadata || {};
      return NextResponse.json({
        userId: user.id, email: user.email, role: meta.role,
        tenantId: meta.tenantId, firstName: meta.firstName,
        lastName: meta.lastName, permissions: meta.permissions,
      });
    }
    ```

    **E. Rewrite `apps/web/src/middleware.ts`:**

    Replace `decrypt(sessionToken)` with Supabase middleware client. The middleware must:
    1. Call `createMiddlewareClient(request)` to get supabase + response
    2. Call `supabase.auth.getUser()` to validate and refresh the session
    3. If no user on protected route, redirect to /sign-in
    4. Read `user.user_metadata` for role, tenantId, isSystemAdmin, permissions
    5. Apply the SAME guards: public paths, onboarding redirect, sysadmin guard, driver guard, manager permission guard
    6. Set `x-tenant-id` header on the response's request headers
    7. Return the response from createMiddlewareClient (has refreshed cookies)

    IMPORTANT: When injecting x-tenant-id header, clone the response's request headers:
    ```typescript
    const { supabase, response } = await createMiddlewareClient(request);
    const { data: { user } } = await supabase.auth.getUser();
    // ... guards ...
    // Inject tenant header into the response
    response.headers.set('x-tenant-id', meta.tenantId);
    // Also set on request headers for downstream
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', meta.tenantId);
    // Return new response with both
    const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
    // Copy Supabase cookie headers from the middleware response
    response.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return finalResponse;
    ```

    Keep the same PUBLIC_PATHS and OWNER_PATHS arrays. Keep the PERMISSION_GATED_PATHS import.
    Add `/api/auth/callback` to PUBLIC_PATHS.

    **F. Rewrite `apps/web/src/lib/auth/mobile-auth.ts`:**

    Replace `decrypt(token)` with Supabase JWT validation. Use the admin client to validate the access_token:

    ```typescript
    import { NextResponse } from 'next/server';
    import { createAdminClient } from '@/lib/supabase/admin';
    import type { UserRole } from '../../generated/prisma';

    export interface MobileAuthContext {
      userId: string;
      tenantId: string;
      role: UserRole;
      driverId?: string;
    }

    export async function validateMobileToken(req: Request): Promise<MobileAuthContext | null> {
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token) return null;

      try {
        const admin = createAdminClient();
        const { data: { user }, error } = await admin.auth.getUser(token);
        if (error || !user) return null;

        const meta = user.user_metadata || {};
        const ctx: MobileAuthContext = {
          userId: user.id,
          tenantId: meta.tenantId,
          role: meta.role as UserRole,
        };
        if (meta.role === 'DRIVER') {
          ctx.driverId = user.id;
        }
        return ctx;
      } catch {
        return null;
      }
    }

    // Keep these unchanged:
    export function unauthorizedResponse(): NextResponse { ... }
    export function forbiddenResponse(): NextResponse { ... }
    ```

    NOTE: This removes the Prisma DB lookup for mobile auth. The user's active status is no longer checked on every request (Supabase handles session validity). If we need to check isActive, we can add a periodic check or use Supabase's ban_duration feature. For now, deactivating a user should also call `supabase.auth.admin.deleteUser()` or `updateUserById({ banned: true })`. This is acceptable for the migration — document as a future improvement.

    **G. Update `apps/web/src/lib/auth/server.ts`:**

    `getRole`, `requireAuth`, `requireRole` — these already use `getSession()` from session.ts. Since we kept the same SessionData interface and getSession signature, these should work WITHOUT changes. Verify by reading them.

    `isSystemAdmin` — currently does a raw Prisma query. Update to read from session first (fast path), fall back to Prisma only if needed:
    ```typescript
    export async function isSystemAdmin(): Promise<boolean> {
      const session = await getSession();
      return session?.isSystemAdmin ?? false;
    }
    ```

    `getCurrentUser` — still needs Prisma. Keep as-is. This is used in a few places and the DB connection issue is separate from auth.

    **H. `require-permission.ts`** — Uses `getSession()` from session.ts. No changes needed since the interface is preserved.

    **I. Update `apps/web/src/app/api/auth/accept-invitation/route.ts`:**

    Replace `bcrypt.hash` + Prisma user creation with:
    1. Keep the invitation validation (GET handler) as-is — it uses Prisma which is fine for this non-auth flow
    2. In POST handler:
       - Validate invitation (keep existing Prisma code)
       - Create Supabase auth user via admin client: `admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role, tenantId, firstName, lastName, ... } })`
       - Use the returned Supabase user ID when creating the Prisma User record (set `id` explicitly)
       - Then sign the user in: create a server client, call `signInWithPassword({ email, password })`
       - Remove `setSession()` call (Supabase handles cookies via signIn)
       - Remove bcrypt import

    IMPORTANT: The `createUser` call must set `email_confirm: true` so the user can sign in immediately.

    **J. Create `apps/web/src/app/api/auth/callback/route.ts`:**

    Standard Supabase auth callback for email confirmations, OAuth flows, etc:
    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { createSupabaseServerClient } from '@/lib/supabase/server';

    export async function GET(request: NextRequest) {
      const { searchParams, origin } = new URL(request.url);
      const code = searchParams.get('code');
      const next = searchParams.get('next') ?? '/dashboard';

      if (code) {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          return NextResponse.redirect(`${origin}${next}`);
        }
      }
      return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`);
    }
    ```

    **K. Remove bcryptjs dependency** from apps/web/package.json if no other file uses it. Check with grep first — if accept-invitation was the only other consumer besides login, both are now migrated.
    ```bash
    grep -r "bcrypt" apps/web/src/ --include="*.ts" --include="*.tsx"
    ```
    If clean, run `cd apps/web && npm uninstall bcryptjs @types/bcryptjs`.

    **L. Do NOT delete the old session.ts encryption functions yet.** The file is being rewritten in-place. The old `encrypt`/`decrypt`/`setSession`/`clearSession` exports are removed. Any imports of these specific functions will cause build errors — but the only consumers are the files being rewritten in this task (login, logout, accept-invitation, me, middleware, mobile-auth).
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -40` — no TypeScript errors
    - `cd apps/web && npm run build 2>&1 | tail -20` — build succeeds
    - `grep -r "bcryptjs\|bcrypt" apps/web/src/ --include="*.ts"` — no results (bcrypt fully removed)
    - `grep -r "encrypt\|decrypt\|AES" apps/web/src/lib/auth/session.ts` — no results (old crypto removed)
    - `grep "getSession" apps/web/src/lib/auth/session.ts` — exists and imports from supabase
  </verify>
  <done>
    All auth routes use Supabase Auth. Session reads from Supabase JWT user_metadata. Middleware validates via @supabase/ssr. Mobile auth validates Supabase access tokens. No bcrypt/AES-GCM code remains. Build succeeds.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify auth migration works end-to-end</name>
  <what-built>
    Complete auth migration from custom bcrypt/AES-256-GCM to Supabase Auth. All login, logout, session validation, middleware guards, and mobile token validation now use Supabase.
  </what-built>
  <how-to-verify>
    **Prerequisites:**
    1. Add real SUPABASE_SERVICE_ROLE_KEY to apps/web/.env.local (from Supabase Dashboard -> Settings -> API -> service_role secret key)
    2. Run the demo user script: `cd apps/web && npx tsx scripts/create-supabase-demo-user.ts`

    **Test login:**
    1. Run `cd apps/web && npm run dev`
    2. Visit http://localhost:3000/sign-in
    3. Sign in with demo@drivecommand.com / demo1234
    4. Should redirect to /dashboard
    5. Check browser cookies — should see `sb-oqdhberkghtnszrkdvfm-auth-token` (Supabase cookie), no old `session` cookie

    **Test session persistence:**
    6. Refresh the page — should stay on /dashboard (not redirected to sign-in)

    **Test logout:**
    7. Click logout (or POST /api/auth/logout)
    8. Should redirect to /sign-in
    9. Visiting /dashboard should redirect to /sign-in

    **Test API:**
    10. While logged in, open browser console: `fetch('/api/auth/me').then(r=>r.json()).then(console.log)`
    11. Should return userId, email, role, tenantId, permissions

    **Note:** If the Prisma DB connection is broken (IPv6 issue), pages that query Prisma for data will fail — but auth itself (login, session, middleware) should work since it reads from Supabase JWT only.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- TypeScript build passes with zero errors in auth files
- No references to bcrypt, AES-GCM, or old encrypt/decrypt in auth code
- Login returns Supabase access_token for mobile
- Middleware reads Supabase session, not old cookie
- All 20+ files importing getSession from session.ts work unchanged (interface preserved)
- All 35 mobile API routes using validateMobileToken work with Supabase JWT
</verification>

<success_criteria>
1. demo@drivecommand.com / demo1234 can sign in and reach /dashboard
2. Session persists across page refreshes
3. Logout clears session and redirects to sign-in
4. Middleware correctly redirects DRIVER to /my-route, SYSADMIN to /admin-dashboard
5. /api/auth/me returns correct user data from Supabase JWT metadata
6. Build passes (`npm run build`)
7. No bcryptjs dependency remains in package.json
</success_criteria>

<output>
After completion, create `.planning/quick/109-migrate-auth-to-supabase-auth/109-SUMMARY.md`
</output>
