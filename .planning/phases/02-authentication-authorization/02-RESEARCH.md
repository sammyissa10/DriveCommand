# Phase 2: Authentication & Authorization - Research

**Researched:** 2026-02-14
**Domain:** Multi-tenant SaaS authentication and role-based access control with Clerk
**Confidence:** HIGH

## Summary

This phase builds the authentication and authorization layer on top of the multi-tenant foundation from Phase 1. Since Clerk is already integrated (webhook for tenant provisioning, middleware for tenant resolution), the focus is on implementing user-facing authentication flows (sign-up, sign-in, sign-out) and role-based access control (RBAC) for three distinct roles: System Admin, Owner/Manager, and Driver.

**Critical insight:** Clerk already handles the authentication infrastructure—session management, token validation, multi-device sessions, and remember-me functionality work out-of-the-box. The real work is building the UI flows, implementing role-based component visibility, and enforcing authorization in server actions and API routes. Authentication flows are already wired (middleware resolves tenant from Clerk metadata), so this phase is primarily about surface-level UI and RBAC enforcement.

**Primary recommendation:** Use Clerk's pre-built components (`<SignIn />`, `<SignUp />`, `<UserButton />`) for authentication UI, implement RBAC using Clerk's publicMetadata for role storage in session tokens, create authorization helpers that check roles from `auth()` server-side, build UI guard components for client-side conditional rendering, and enforce authorization in every server action and API route as close to the data layer as possible—never rely solely on middleware for security.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Clerk | ^6.37.4 (already installed) | Authentication & session management | SaaS-focused auth with multi-tenant metadata, pre-built UI components, webhook-based provisioning, session management across devices |
| Next.js 16 | ^16.0.0 (already installed) | Full-stack framework | App Router with Server Components, proxy.ts for middleware, auth() helper for server-side auth checks |
| Prisma | 7.4.0 (already installed) | ORM with tenant RLS | Already configured for multi-tenant data access, User model stores role field |
| Zod | Latest | Input validation | Type-safe schema validation for server actions, recommended by Next.js security best practices |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | ^4.0.18 (already installed) | Testing framework | Mocking Clerk auth in unit tests, testing RBAC logic |
| @clerk/backend | Latest | Clerk server-side SDK | Webhook signature verification (via Svix), server-side user operations |
| next-safe-action | Latest | Type-safe server actions | Optional: Composable middleware for auth + validation patterns (alternative to manual checks) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Clerk pre-built components | Custom UI with Clerk headless API | Pre-built components are faster to implement and maintained by Clerk; custom UI offers full design control but requires more code and maintenance |
| publicMetadata for roles | Clerk Organizations | Organizations is for B2B with team/role management within tenants; publicMetadata is simpler for flat role structure (one role per user) |
| Manual auth checks | next-safe-action library | next-safe-action provides composable middleware patterns but adds dependency; manual checks are straightforward and explicit |

**Installation:**
```bash
npm install zod  # Input validation for server actions
# Optional: npm install next-safe-action  # If using composable middleware pattern
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (auth)/                  # Auth route group
│   │   ├── sign-in/
│   │   │   └── [[...sign-in]]/page.tsx    # Clerk SignIn component
│   │   ├── sign-up/
│   │   │   └── [[...sign-up]]/page.tsx    # Clerk SignUp component
│   │   └── onboarding/page.tsx            # Post-signup onboarding (already referenced in middleware)
│   ├── (admin)/                 # System Admin portal
│   │   └── layout.tsx           # Admin auth check
│   ├── (owner)/                 # Owner/Manager portal
│   │   └── layout.tsx           # Owner auth check
│   ├── (driver)/                # Driver portal
│   │   └── layout.tsx           # Driver auth check
│   └── layout.tsx               # ClerkProvider wrapper (already exists)
├── lib/
│   ├── auth/
│   │   ├── roles.ts             # Role enum, permission definitions
│   │   ├── server.ts            # requireRole(), requireAuth() server helpers
│   │   └── guards.tsx           # <RoleGuard>, <PermissionGuard> client components
│   └── actions/                 # Server actions with auth checks
└── components/
    └── navigation/
        └── user-menu.tsx        # UserButton with role-based navigation
```

### Pattern 1: Authentication UI with Clerk Pre-Built Components

**What:** Clerk provides `<SignIn />`, `<SignUp />`, and `<UserButton />` components that handle all authentication flows (email/password, OAuth, MFA) with zero custom logic required.

**When to use:** Always for v1—pre-built components save 100+ hours of development time and include accessibility, security best practices, and edge case handling.

**Example:**
```typescript
// Source: https://clerk.com/docs/nextjs/reference/components/authentication/sign-in
// app/(auth)/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn
        appearance={{
          elements: {
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
          }
        }}
      />
    </div>
  );
}
```

**Configuration:**
Set redirect URLs in .env.local (already configured in .env.example):
```bash
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
```

### Pattern 2: RBAC with Clerk Public Metadata

**What:** Store user role in Clerk's `publicMetadata` (exposed in session token, read-only in browser) instead of fetching from database on every request.

**When to use:** For simple flat role hierarchies (one role per user). Use Clerk Organizations if you need team-based permissions within tenants.

**Example:**
```typescript
// Source: https://clerk.com/docs/guides/secure/basic-rbac
// Set role in webhook after user creation
import { clerkClient } from '@clerk/nextjs/server';

const client = await clerkClient();
await client.users.updateUserMetadata(clerkUserId, {
  publicMetadata: {
    role: 'OWNER', // Or 'MANAGER', 'DRIVER'
  },
});
```

**Reading role server-side:**
```typescript
// lib/auth/server.ts
import { auth } from '@clerk/nextjs/server';

export async function getRole(): Promise<UserRole | null> {
  const { sessionClaims } = await auth();
  const publicMetadata = sessionClaims?.publicMetadata as { role?: string };
  return publicMetadata?.role as UserRole || null;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const role = await getRole();
  if (!role || !allowedRoles.includes(role)) {
    throw new Error('Unauthorized');
  }
  return role;
}
```

### Pattern 3: Server Action Authorization (Data Access Layer Pattern)

**What:** Perform authentication and authorization checks at the entry point of every server action, as close to the data source as possible.

**When to use:** Every single server action and API route—middleware alone is insufficient for security.

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// app/actions/trucks.ts
'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';

const createTruckSchema = z.object({
  licensePlate: z.string().min(1),
  model: z.string().min(1),
});

export async function createTruck(input: unknown) {
  // 1. Validate input
  const data = createTruckSchema.parse(input);

  // 2. Check authentication & authorization
  await requireRole(['OWNER', 'MANAGER']);

  // 3. Get tenant-scoped Prisma client
  const prisma = await getTenantPrisma();

  // 4. Perform operation
  return await prisma.truck.create({ data });
}
```

**Critical:** Server actions are public POST endpoints. Every action needs explicit auth checks—middleware doesn't protect them.

### Pattern 4: Role-Based Component Visibility (Client-Side Guards)

**What:** Conditionally render UI elements based on user role to improve UX (not for security—always enforce server-side).

**When to use:** Hiding "Delete" buttons from drivers, showing "Admin Panel" link only to system admins, role-specific navigation.

**Example:**
```typescript
// Source: https://clerk.com/blog/nextjs-role-based-access-control
// lib/auth/guards.tsx
'use client';

import { useUser } from '@clerk/nextjs';
import { UserRole } from '@/lib/auth/roles';

export function RoleGuard({
  children,
  allowedRoles
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) {
  const { user } = useUser();
  const role = user?.publicMetadata?.role as UserRole | undefined;

  if (!role || !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
```

**Usage:**
```tsx
// components/truck-list.tsx
<RoleGuard allowedRoles={['OWNER', 'MANAGER']}>
  <button onClick={handleDelete}>Delete Truck</button>
</RoleGuard>
```

**Important:** This only controls visibility. Server actions must still enforce authorization.

### Pattern 5: Portal-Specific Layouts with Auth Checks

**What:** Use Next.js route groups to create separate portal layouts (admin, owner, driver) with role-based redirects.

**When to use:** When you have distinct UIs for different user roles (System Admin portal, Owner dashboard, Driver mobile view).

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// app/(owner)/layout.tsx
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

export default async function OwnerLayout({ children }) {
  const { sessionClaims } = await auth();
  const role = sessionClaims?.publicMetadata?.role;

  // Redirect non-owners
  if (role !== 'OWNER' && role !== 'MANAGER') {
    redirect('/unauthorized');
  }

  return (
    <div className="owner-layout">
      {/* Owner-specific navigation */}
      {children}
    </div>
  );
}
```

**Caution:** Layouts don't re-render on navigation, so auth checks here are for initial access only. Still enforce authorization in server actions.

### Pattern 6: UserButton with Custom Actions

**What:** Clerk's `<UserButton />` component provides account management and sign-out, with support for custom menu items and actions.

**When to use:** Adding role-specific navigation links (e.g., "Admin Panel" for system admins) or custom actions to the user menu.

**Example:**
```typescript
// Source: https://clerk.com/docs/nextjs/reference/components/user/user-button
// components/navigation/user-menu.tsx
import { UserButton } from '@clerk/nextjs';

export function UserMenu() {
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: 'h-10 w-10',
        }
      }}
      afterSignOutUrl="/"
    />
  );
}
```

**Features:**
- Account settings modal (email, password, MFA)
- Multi-session support (switch between accounts)
- Sign-out with redirect
- Custom menu items via `userProfileUrl` and `userProfileMode`

### Anti-Patterns to Avoid

- **Middleware-only auth:** Never rely solely on middleware for authorization. Middleware is bypassable via direct endpoint calls. Always enforce authorization in server actions and API routes.
- **Client-side role checks for security:** Client-side guards (RoleGuard) only control UI visibility, not access. Attackers can bypass client-side logic—always validate server-side.
- **Trusting URL params for roles:** Never use `searchParams.isAdmin` or similar. Roles must come from verified session tokens or database.
- **Blocking auth checks in layouts:** Layouts don't re-render on navigation, so auth checks there only run once. Perform checks in server actions and components that do re-render.
- **Not validating input in server actions:** Every server action is a public POST endpoint. Always validate input with Zod or similar before processing.
- **Storing sensitive data in publicMetadata:** Only store non-sensitive data (role, display name) in publicMetadata—it's visible in browser. Use privateMetadata for sensitive tenant data (already used for tenantId).
- **Forgetting webhook idempotency:** Clerk retries failed webhooks. Webhook handlers must be idempotent (already implemented in Phase 1 webhook).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authentication UI | Custom sign-in/sign-up forms | Clerk `<SignIn />`, `<SignUp />` | Pre-built components handle email/password, OAuth, MFA, password reset, email verification, accessibility, error states, loading states, and security best practices—100+ hours of dev time |
| Session management | Custom JWT + cookies | Clerk session tokens | Clerk handles token rotation, multi-device sessions, session activity tracking, revocation, and "stay logged in" automatically |
| Webhook signature verification | Custom HMAC validation | Svix `Webhook.verify()` (via `@clerk/backend`) | Handles signature parsing, timestamp validation, replay attack prevention, and constant-time comparison to prevent timing attacks |
| Password reset flow | Custom email + token logic | Clerk password reset | Handles secure token generation, expiration, email delivery, rate limiting, and account recovery flows |
| MFA | TOTP/SMS implementation | Clerk MFA (optional) | Handles TOTP secret storage, backup codes, SMS delivery, and recovery flows—complex security requirements |

**Key insight:** Authentication is deceptively complex. Email deliverability, rate limiting, account enumeration prevention, session fixation attacks, CSRF protection, XSS mitigation, and password strength enforcement are all hidden edge cases. Clerk handles these, allowing you to focus on RBAC and business logic.

## Common Pitfalls

### Pitfall 1: CVE-2025-29927 Middleware Authorization Bypass

**What goes wrong:** Attackers bypass authentication by sending the `x-middleware-subrequest` header, which Next.js uses internally to indicate a request should skip middleware logic.

**Why it happens:** Next.js middleware doesn't run when this header is present, allowing direct access to protected routes.

**How to avoid:**
- Never rely solely on middleware for critical security checks
- Enforce authorization in every server action and API route
- Use the Data Access Layer pattern—verify auth at the data fetch point
- Update to Next.js 16 patched versions (CVE fixed in recent releases)

**Warning signs:**
- Auth logic only in middleware
- No auth checks in server actions
- Assuming middleware always runs

**Source:** https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/

### Pitfall 2: Server Actions Without Explicit Auth Checks

**What goes wrong:** Server actions marked with `'use server'` create public POST endpoints that bypass middleware, type guards, and component-level protections. Attackers can call them directly with any payload.

**Why it happens:** Developers assume Server Components are inherently protected because they render server-side, but server actions are exposed HTTP endpoints.

**How to avoid:**
- Add explicit auth check in every server action: `await requireRole(['OWNER'])`
- Validate input with Zod at the top of every action
- Never skip auth checks even for "read-only" operations (data leakage)
- Consider using `next-safe-action` for composable auth middleware

**Warning signs:**
- Server actions without `requireAuth()` or `requireRole()` calls
- Assuming server actions inherit component-level auth
- No input validation schemas

**Source:** https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions

### Pitfall 3: `<ClerkProvider>` Missing or Misplaced

**What goes wrong:** Clerk hooks (`useUser()`, `useAuth()`) return undefined or throw errors. Auth-dependent components fail to render.

**Why it happens:** `<ClerkProvider>` must wrap the entire app tree. If placed inside a layout or route group, Clerk context isn't available to child components.

**How to avoid:**
- Always wrap the root layout (`app/layout.tsx`) with `<ClerkProvider>`
- Check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` exists (already handled with conditional ClerkProvider in current layout.tsx)
- Don't nest multiple `<ClerkProvider>` instances

**Warning signs:**
- Error: "useUser() called outside ClerkProvider"
- `user` is always undefined in components
- Clerk components don't render

**Source:** https://clerk.com/docs/reference/nextjs/errors/auth-was-called

### Pitfall 4: Clerk Webhook Race Condition

**What goes wrong:** User signs up, webhook fires to create tenant, but user logs in faster than webhook completes. Middleware redirects to `/onboarding` indefinitely because `tenantId` is missing from Clerk metadata.

**Why it happens:** Webhook processing has network latency. User's first login session is created before `updateUserMetadata()` sets `tenantId`.

**How to avoid:**
- Webhook handler already checks for existing user (idempotency)
- Onboarding page should poll or refresh session to detect when `tenantId` appears
- Consider using Clerk's `afterSignUp` callback to delay first login until webhook completes
- Add timeout logic in onboarding to show "Setting up your workspace..." message

**Warning signs:**
- Users stuck on `/onboarding` after signup
- `tenantId` is null in middleware even after successful webhook
- Webhook logs show success but user session doesn't have metadata

**Source:** https://clerk.com/docs/guides/development/webhooks/syncing

### Pitfall 5: Layouts Don't Re-Render on Navigation

**What goes wrong:** Auth check in layout redirects once, but user navigates to different routes and bypass logic doesn't re-run. User role changes but UI doesn't update.

**Why it happens:** Next.js layouts preserve state and don't re-render during client-side navigation for performance.

**How to avoid:**
- Use layouts for initial access checks only (redirect non-admins from admin portal)
- Perform auth checks in server actions and components that do re-render
- Don't rely on layout-level auth for granular permission checks
- Use server components for data fetching (they re-run on navigation)

**Warning signs:**
- Auth logic only in layout.tsx
- UI doesn't update when user role changes
- Stale session data displayed after navigation

**Source:** https://clerk.com/articles/complete-authentication-guide-for-nextjs-app-router

### Pitfall 6: Forgetting to Update Role in Clerk Metadata

**What goes wrong:** User role is stored in database (Prisma User model has `role` field) but not synced to Clerk's `publicMetadata`. Server-side code reads from database (correct), but client-side guards read from `publicMetadata` (stale).

**Why it happens:** Role is stored in two places: Prisma (source of truth) and Clerk metadata (for session token access). Updates to Prisma aren't automatically synced to Clerk.

**How to avoid:**
- When creating user (webhook), set both Prisma `role` and Clerk `publicMetadata.role`
- When changing role, update both locations in a transaction
- Consider making Prisma the single source of truth and always fetch role from database server-side
- Only use `publicMetadata.role` for client-side UI guards (not security decisions)

**Warning signs:**
- Server-side role checks pass but client UI shows wrong role
- `publicMetadata.role` doesn't match database `role` field
- Role changes don't reflect in UI without full logout/login

**Source:** https://www.3zerodigital.com/blog/how-to-update-clerk-metadata-in-next-js-applications

### Pitfall 7: Multi-Tenant Context Leakage in RBAC Checks

**What goes wrong:** System Admin (not tied to tenant) tries to access data, RLS policies block them because `app.current_tenant_id` is required. Or admin accidentally gets scoped to their own tenant and can't see other tenants.

**Why it happens:** RLS extension wraps all queries with tenant context. System Admins need to bypass RLS to access all tenants.

**How to avoid:**
- Create separate Prisma client for system admins without RLS extension
- Check `isSystemAdmin` flag from User model before applying tenant context
- Consider using database role with `BYPASSRLS` privilege for admin operations (be careful—use sparingly)
- Add admin-specific queries that use raw SQL without RLS

**Warning signs:**
- System Admin sees "no data" in admin portal
- Admin accidentally limited to one tenant's data
- RLS policies block legitimate admin access

**Source:** Multi-tenant architecture best practices (AWS, Microsoft Azure docs)

## Code Examples

Verified patterns from official sources:

### Sign-Up Page with Clerk Component
```typescript
// Source: https://clerk.com/docs/nextjs/reference/components/authentication/sign-up
// app/(auth)/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        appearance={{
          elements: {
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
            card: 'shadow-lg',
          }
        }}
      />
    </div>
  );
}
```

### Server Action with Role-Based Authorization
```typescript
// Source: https://nextjs.org/docs/app/guides/authentication
// app/actions/routes.ts
'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';

const createRouteSchema = z.object({
  name: z.string().min(1),
  driverId: z.string().uuid(),
  truckId: z.string().uuid(),
});

export async function createRoute(input: unknown) {
  // 1. Validate input
  const data = createRouteSchema.parse(input);

  // 2. Require OWNER or MANAGER role
  await requireRole(['OWNER', 'MANAGER']);

  // 3. Get tenant-scoped client (already includes RLS)
  const prisma = await getTenantPrisma();

  // 4. Create route
  const route = await prisma.route.create({
    data: {
      name: data.name,
      driverId: data.driverId,
      truckId: data.truckId,
    },
  });

  return { success: true, routeId: route.id };
}
```

### Client-Side Role Guard Component
```typescript
// Source: https://clerk.com/blog/nextjs-role-based-access-control
// lib/auth/guards.tsx
'use client';

import { useUser } from '@clerk/nextjs';
import { UserRole } from './roles';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
}

export function RoleGuard({ children, allowedRoles, fallback = null }: RoleGuardProps) {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return null; // or loading spinner
  }

  const role = user?.publicMetadata?.role as UserRole | undefined;

  if (!role || !allowedRoles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
```

### Role Definition and Server Helpers
```typescript
// Source: Combining patterns from Clerk RBAC docs and Next.js auth guide
// lib/auth/roles.ts
export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  DRIVER = 'DRIVER',
}

// lib/auth/server.ts
import { auth } from '@clerk/nextjs/server';
import { UserRole } from './roles';

export async function getRole(): Promise<UserRole | null> {
  const { sessionClaims } = await auth();
  const publicMetadata = sessionClaims?.publicMetadata as { role?: string } | undefined;
  return publicMetadata?.role as UserRole || null;
}

export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized: Authentication required');
  }
  return userId;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<UserRole> {
  const role = await getRole();
  if (!role || !allowedRoles.includes(role)) {
    throw new Error(`Unauthorized: Required roles: ${allowedRoles.join(', ')}`);
  }
  return role;
}

export async function isSystemAdmin(): Promise<boolean> {
  const role = await getRole();
  return role === UserRole.SYSTEM_ADMIN;
}
```

### Webhook Handler with Role Assignment
```typescript
// Source: Current implementation + Clerk metadata update pattern
// app/api/webhooks/clerk/route.ts (excerpt showing role assignment)
import { clerkClient } from '@clerk/nextjs/server';

// After creating user in database
const client = await clerkClient();
await client.users.updateUserMetadata(clerkUserId, {
  privateMetadata: {
    tenantId: result.tenant.id,
  },
  publicMetadata: {
    role: 'OWNER', // Set role in session token
  },
});
```

### Testing Clerk Authentication with Vitest
```typescript
// Source: https://clerk.com/blog/testing-clerk-nextjs
// __tests__/actions/trucks.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createTruck } from '@/app/actions/trucks';

// Mock Clerk
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

// Mock tenant context
vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

describe('createTruck', () => {
  it('should allow OWNER to create truck', async () => {
    const { auth } = await import('@clerk/nextjs/server');

    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      sessionClaims: {
        publicMetadata: { role: 'OWNER' },
      },
    });

    // ... rest of test
  });

  it('should reject DRIVER from creating truck', async () => {
    const { auth } = await import('@clerk/nextjs/server');

    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      sessionClaims: {
        publicMetadata: { role: 'DRIVER' },
      },
    });

    await expect(createTruck({ licensePlate: 'ABC123' })).rejects.toThrow('Unauthorized');
  });
});
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` in Next.js 16 | Next.js 16 (2025) | Breaking change—middleware file renamed to proxy, exported function renamed from `middleware` to `proxy` |
| Props/context for auth | `auth()` helper in Server Components | Next.js 13+ App Router | Eliminates prop drilling, works in Server Components, faster auth checks |
| Layout-based auth | Data Access Layer pattern | 2025-2026 best practices | Auth checks at data fetch point, not route entry—prevents bypass attacks |
| Custom auth forms | Clerk pre-built components | Clerk evolution | 100+ hours saved, security + accessibility built-in |
| Private metadata for roles | Public metadata for roles | Clerk RBAC guide (2024+) | Roles in session token (no DB fetch), read-only in browser (secure) |
| Jest for testing | Vitest | 2024+ | 10-20× faster, better ESM support, native TypeScript |
| Manual input validation | Zod schemas | Next.js security best practices (2025) | Type-safe validation, auto-complete in IDEs |

**Deprecated/outdated:**
- **Next.js 12 Pages Router auth patterns:** Old patterns use `getServerSideProps` for auth checks. App Router uses Server Components with `auth()` helper.
- **Clerk's legacy `withAuth()` HOC:** Replaced by `auth()` helper for App Router. Don't use `withAuth()` in new code.
- **Client-side auth checks only:** Old SPAs checked auth client-side. Modern Next.js enforces auth server-side (Server Components, server actions).
- **Middleware as primary security layer:** CVE-2025-29927 proved middleware-only auth is bypassable. 2026 pattern: middleware for convenience, server actions for security.

## Open Questions

1. **System Admin Portal vs. Special Tenant**
   - What we know: `isSystemAdmin` boolean exists on User model, system admins need to see all tenants
   - What's unclear: Should admins bypass RLS entirely, or use a separate Prisma client? Should there be a dedicated admin portal route group, or admin features in main app?
   - Recommendation: Create `(admin)` route group with layout that checks `isSystemAdmin`, use separate Prisma client without RLS for admin queries, keep admin UI separate from tenant portals

2. **Driver Onboarding Flow**
   - What we know: Drivers are provisioned by managers (requirement: "Manager-provisioned driver accounts")
   - What's unclear: Do drivers self-serve sign-up with invite code, or do managers create accounts directly? Do drivers have email/password, or different auth method?
   - Recommendation: Defer to planning phase—likely pattern is manager creates user record, sends invite email, driver sets password on first login

3. **Role Change Workflow**
   - What we know: User model has `role` field, needs to sync with Clerk `publicMetadata`
   - What's unclear: Can roles change after signup? If manager is demoted to driver, what happens to their active session?
   - Recommendation: Make role immutable for v1 (simpler), or if needed, implement role change that updates both DB and Clerk metadata + forces re-login

4. **Session Timeout and "Remember Me"**
   - What we know: Clerk handles session management automatically
   - What's unclear: What's the default session timeout? Does "Remember me" work cross-device?
   - Recommendation: Verify Clerk's default session settings (likely 7-day rolling window), confirm multi-device sessions work as expected, adjust session lifetime in Clerk Dashboard if needed

## Sources

### Primary (HIGH confidence)
- [Clerk Next.js Quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart) - Official integration guide
- [Clerk clerkMiddleware() Reference](https://clerk.com/docs/reference/nextjs/clerk-middleware) - Middleware configuration
- [Clerk Basic RBAC Guide](https://clerk.com/docs/guides/secure/basic-rbac) - Role-based access control with metadata
- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication) - Official Next.js auth patterns
- [Clerk SignIn Component](https://clerk.com/docs/nextjs/reference/components/authentication/sign-in) - Pre-built sign-in UI
- [Clerk UserButton Component](https://clerk.com/docs/nextjs/reference/components/user/user-button) - User menu component
- [Clerk Webhooks Overview](https://clerk.com/docs/guides/development/webhooks/overview) - Webhook signature verification
- [Next.js Data Security Guide](https://nextjs.org/docs/app/guides/data-security) - Server action security

### Secondary (MEDIUM confidence)
- [Clerk Complete Authentication Guide for Next.js App Router (2025)](https://clerk.com/articles/complete-authentication-guide-for-nextjs-app-router) - Modern patterns
- [Clerk Role-Based Access Control in Next.js 15](https://clerk.com/blog/nextjs-role-based-access-control) - RBAC implementation
- [Clerk Testing Next.js Applications](https://clerk.com/blog/testing-clerk-nextjs) - Vitest mocking patterns
- [Clerk Multi-Tenant Architecture Guide](https://clerk.com/docs/guides/how-clerk-works/multi-tenant-architecture) - Tenant isolation with Clerk
- [Next.js Server Actions Security (2026)](https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions) - Security best practices
- [Datadog: CVE-2025-29927 Next.js Middleware Bypass](https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/) - Critical vulnerability
- [AWS Multi-Tenant SaaS Security Practices](https://aws.amazon.com/blogs/security/security-practices-in-aws-multi-tenant-saas-environments/) - Tenant isolation patterns

### Tertiary (LOW confidence)
- [Medium: Building Scalable RBAC in Next.js](https://medium.com/@muhebollah.diu/building-a-scalable-role-based-access-control-rbac-system-in-next-js-b67b9ecfe5fa) - Community patterns
- [ZenStack: Multi-Tenant Apps with Clerk](https://zenstack.dev/blog/clerk-multitenancy) - Third-party integration guide

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Clerk already integrated, official docs current as of 2026, Next.js 16 patterns verified
- Architecture: HIGH - Pre-built components well-documented, RBAC patterns from official Clerk guides, server action security from Next.js docs
- Pitfalls: HIGH - CVEs documented with official advisories, common errors from Clerk troubleshooting docs, security vulnerabilities from DataDog Security Labs

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days—stable auth patterns, Clerk API unlikely to change significantly)
