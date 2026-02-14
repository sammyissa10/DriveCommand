# Phase 7: Driver Portal - Research

**Researched:** 2026-02-14
**Domain:** Role-based access control, user-scoped data queries, read-only UI patterns
**Confidence:** HIGH

## Summary

Phase 7 implements a read-only driver portal that restricts access to only the routes assigned to the authenticated driver. The primary technical challenge is enforcing driver-scoped queries at both database and UI layers to prevent Insecure Direct Object Reference (IDOR) vulnerabilities while maintaining the existing tenant isolation architecture.

The driver portal reuses the same tech stack (Next.js 15 App Router, Clerk, Prisma, PostgreSQL RLS) but adds a critical new pattern: **user-scoped data filtering in addition to tenant-scoped filtering**. Drivers must only see routes where `route.driverId === currentUser.id`, enforced in every server action and data fetch.

The architecture follows the established portal pattern (separate route group with role guard in layout), but introduces read-only variations of existing route/truck detail components and driver-scoped query helpers.

**Primary recommendation:** Filter all driver queries by `driverId` in server actions using `getCurrentUser()`, never rely on URL parameters or client input for authorization, and create read-only component variants (not disabled forms) for better UX.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.0+ | App Router framework | Already in use, Server Components enable secure server-side auth checks |
| @clerk/nextjs | 6.37.4+ | Authentication | Already integrated, provides `auth()` and `currentUser()` helpers for server-side user resolution |
| Prisma Client | 7.4.0+ | Database ORM | Already in use, supports filtering by authenticated user ID in queries |
| React | 19.0+ | UI library | Already in use, component-based architecture for read-only UI variants |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.3.6+ | Schema validation | Already in use for input validation (not needed for read-only portal) |
| @tanstack/react-table | 8.21.3+ | Data tables | Already in use for owner portal lists (drivers see single route, so minimal need) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Clerk | NextAuth.js | Would require full auth system replacement, Clerk already integrated and working |
| Prisma raw filtering | ZenStack or Prisma-RBAC | Adds library dependency for automatic filtering, but codebase already uses manual filtering in server actions |
| Custom read-only UI | Shadcn/ui disabled forms | Existing approach works, no new library needed |

**Installation:**
No new dependencies required — all libraries already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/app/(driver)/
├── layout.tsx              # Role guard (DRIVER only), blue header
├── page.tsx                # Landing page - redirects to /my-route or shows "No assignment"
├── my-route/
│   └── page.tsx           # Driver's assigned route detail (read-only)
└── components/            # (optional) Driver-specific read-only components
```

### Pattern 1: Driver-Scoped Server Actions
**What:** Server actions that filter queries by authenticated user's ID, not URL params
**When to use:** Every data fetch for driver portal
**Example:**
```typescript
// Source: Established pattern from routes.ts + Clerk docs
// https://clerk.com/docs/references/nextjs/current-user
'use server';

import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';

/**
 * Get the current driver's assigned route.
 * CRITICAL: Filters by driverId from authenticated user, NOT from URL/params.
 * Returns null if no route is assigned or user is not a driver.
 */
export async function getMyAssignedRoute() {
  // Step 1: Verify DRIVER role
  await requireRole([UserRole.DRIVER]);

  // Step 2: Get authenticated user from database
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not found');
  }

  // Step 3: Query by authenticated user's ID (not client input)
  const prisma = await getTenantPrisma();
  return prisma.route.findFirst({
    where: {
      driverId: user.id,  // CRITICAL: Use database user.id, not URL param
      status: {
        in: ['PLANNED', 'IN_PROGRESS'],  // Only show active routes
      },
    },
    include: {
      truck: true,
      documents: true,
    },
    orderBy: {
      scheduledDate: 'asc',  // Show earliest upcoming route
    },
  });
}
```

### Pattern 2: Read-Only Component Variants
**What:** Display route/truck data without edit controls, using semantic HTML
**When to use:** Driver portal detail pages
**Example:**
```tsx
// Source: Established pattern from route-detail.tsx + React best practices
// Read-only displays use <div> and text, NOT disabled form inputs

export function RouteDetailReadOnly({ route }: { route: Route }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700">Origin</label>
        <p className="mt-1 text-gray-900">{route.origin}</p>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Destination</label>
        <p className="mt-1 text-gray-900">{route.destination}</p>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Status</label>
        <p className="mt-1">
          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
            {route.status}
          </span>
        </p>
      </div>
    </div>
  );
}
```

### Pattern 3: Landing Page with Assignment Check
**What:** Driver portal home redirects to assigned route or shows "no assignment" message
**When to use:** Driver login landing page
**Example:**
```tsx
// Source: Next.js redirect pattern + user-specific query
export default async function DriverPortalPage() {
  const route = await getMyAssignedRoute();

  if (!route) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">No Route Assigned</h2>
        <p className="mt-2 text-gray-600">Contact your manager for route assignment.</p>
      </div>
    );
  }

  // Redirect to route detail
  redirect(`/my-route`);
}
```

### Pattern 4: Defense in Depth - Multi-Layer Authorization
**What:** Authorization checks at layout, page, and server action layers
**When to use:** All driver portal routes
**Implementation layers:**
1. **Layout:** Role guard redirects non-drivers (already exists in `(driver)/layout.tsx`)
2. **Server Action:** Role check + user-scoped query filter
3. **Database:** RLS policies enforce tenant isolation (already exists)

**Example flow:**
```
User requests /my-route
  ↓
Layout: requireRole([DRIVER]) - redirects if not DRIVER
  ↓
Page: calls getMyAssignedRoute()
  ↓
Server Action: requireRole([DRIVER]) + getCurrentUser() + WHERE driverId = user.id
  ↓
Database: RLS filters by tenantId
```

### Anti-Patterns to Avoid

- **NEVER use URL params for driver ID:** Don't do `/drivers/:driverId/routes` — driver sees only their own data, resolve via `getCurrentUser()`
- **NEVER trust client input for authorization:** Don't accept `driverId` from form data or query string
- **NEVER use disabled form inputs for read-only UI:** Use semantic HTML (`<div>`, `<p>`) instead — disabled inputs have poor UX (greyed out, not selectable)
- **NEVER skip role checks in server actions:** Even though layout guards the route, server actions can be called directly via fetch
- **NEVER query all routes and filter client-side:** Filter in database query using `WHERE driverId = user.id`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Automatic query filtering by user | Custom Prisma middleware that auto-injects driverId | Manual filtering in server actions | Explicit filtering is more secure and debuggable than "magic" middleware, especially when combining tenant + user scopes |
| Session management | Custom JWT parsing or session cookies | Clerk `auth()` and `currentUser()` | Clerk handles session validation, token refresh, and security — already integrated |
| RBAC permission system | Custom permission objects/matrices | Role enums + `requireRole()` helper | Three-role system is simple enough for manual checks, complex RBAC libraries add unnecessary overhead |
| Authorization context propagation | React Context for current user | Server-side `getCurrentUser()` per action | Server Components eliminate need for React Context, each server action independently resolves auth |

**Key insight:** The existing patterns (role guards, tenant-scoped Prisma client, server actions) already provide the foundation. Driver portal needs only **one new pattern**: user-scoped filtering via `getCurrentUser()`. Don't introduce new libraries or complex abstractions.

## Common Pitfalls

### Pitfall 1: Insecure Direct Object Reference (IDOR)
**What goes wrong:** Driver can access other drivers' routes by manipulating URL or request parameters
**Why it happens:** Developer trusts client input (URL param, form field) instead of database user lookup
**How to avoid:**
- Always resolve user ID via `getCurrentUser()` on server
- Never accept `driverId` as input parameter
- Filter queries by `user.id` from database, not from request
**Warning signs:**
- Server action accepts `driverId` parameter
- Query uses `params.driverId` or `formData.get('driverId')`
- URL structure like `/routes/:routeId` without ownership check

**Example - VULNERABLE:**
```typescript
// BAD: Trusts URL parameter
export async function getRoute(routeId: string) {
  return prisma.route.findUnique({ where: { id: routeId } });
}
```

**Example - SECURE:**
```typescript
// GOOD: Filters by authenticated user
export async function getMyRoute() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  return prisma.route.findFirst({
    where: { driverId: user.id },
  });
}
```

### Pitfall 2: Authorization Checks Only in Layout
**What goes wrong:** Developer adds role check to layout, assumes server actions are protected
**Why it happens:** Misunderstanding of Next.js Partial Rendering and server action direct invocation
**How to avoid:**
- Add `requireRole([UserRole.DRIVER])` to every server action
- Never rely solely on layout guards for security
- Server actions can be invoked directly via fetch, bypassing layout
**Warning signs:**
- Server action has no `requireRole()` call
- Comments like "layout handles auth, no need to check here"
- Auth logic only in layout.tsx

**Reference:** [Next.js Security: How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions)
- "authorization should be handled directly in the code rather than by blocking access to a given endpoint using a reverse proxy or middleware component as this may be easily bypassed"
- "those functions should always start by validating that the current user is allowed to invoke this action"

### Pitfall 3: N+1 Query for User Lookup
**What goes wrong:** Every server action calls `getCurrentUser()`, causing excessive database queries
**Why it happens:** Each server action independently fetches user data
**How to avoid:**
- Use React.cache() to memoize `getCurrentUser()` per request
- Next.js automatically deduplicates within a single request scope
- Don't pass user object through component props — let each action call `getCurrentUser()`
**Warning signs:**
- Multiple `SELECT * FROM User WHERE clerkUserId = ...` in logs for single page load
- Passing user object through 5+ component layers

**Example - CORRECT APPROACH:**
```typescript
// React.cache ensures getCurrentUser() only queries once per request
import { cache } from 'react';

export const getCurrentUser = cache(async () => {
  const { userId } = await auth();
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { clerkUserId: userId },
  });
});
```

**Reference:** [Next.js Data Fetching: Patterns and Best Practices](https://nextjs.org/docs/14/app/building-your-application/data-fetching/patterns)
- "you can use fetch or React cache in the component that needs the data without worrying about the performance implications of making multiple requests for the same data"

### Pitfall 4: Showing Disabled Form Inputs for Read-Only
**What goes wrong:** UI uses `<input disabled />` to show read-only data, resulting in poor UX (greyed out, not selectable)
**Why it happens:** Developer reuses editable form components and toggles `disabled` attribute
**How to avoid:**
- Create separate read-only component variants using semantic HTML (`<div>`, `<p>`)
- Use `<dl>` (definition list) for key-value pairs
- Never use form inputs just to display data
**Warning signs:**
- Greyed-out form fields that users can't select or copy
- `disabled` or `readOnly` props on all inputs
- User complaints about inability to copy text

**Reference:** [Cloudscape Design System: Disabled and Read-Only States](https://cloudscape.design/patterns/general/disabled-and-read-only-states/)
- "Read-only fields display without greying out, while disabled fields are greyed out"
- "Using the disabled attribute to implement read-only form fields is a common UI anti-pattern"

### Pitfall 5: Forgetting to Filter by Active Routes
**What goes wrong:** Driver sees completed or cancelled routes in their view
**Why it happens:** Query doesn't filter by route status
**How to avoid:**
- Add `status: { in: ['PLANNED', 'IN_PROGRESS'] }` to driver route queries
- Only show active routes to drivers
- Optionally create separate "Route History" page for completed routes
**Warning signs:**
- Driver landing page shows COMPLETED routes
- No status filter in driver-facing queries

## Code Examples

Verified patterns from official sources and existing codebase:

### Get Authenticated User in Server Action
```typescript
// Source: Clerk currentUser() docs
// https://clerk.com/docs/references/nextjs/current-user
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db/prisma';

export async function getCurrentUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  return prisma.user.findUnique({
    where: { clerkUserId: clerkUser.id },
  });
}
```

### Driver-Scoped Route Query
```typescript
// Source: Existing routes.ts pattern + user filtering
// Combines tenant RLS (via getTenantPrisma) with user-scoped WHERE clause
export async function getMyAssignedRoute() {
  await requireRole([UserRole.DRIVER]);

  const user = await getCurrentUser();
  if (!user) throw new Error('User not found');

  const prisma = await getTenantPrisma();
  return prisma.route.findFirst({
    where: {
      driverId: user.id,  // User-scoped filter
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    },
    include: {
      truck: {
        select: {
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          vin: true,
          odometer: true,
        },
      },
      documents: true,
    },
  });
}
```

### Driver Portal Landing Page
```tsx
// Source: Next.js Server Component + redirect pattern
import { redirect } from 'next/navigation';
import { getMyAssignedRoute } from '@/app/(driver)/actions/routes';

export default async function DriverPortalPage() {
  const route = await getMyAssignedRoute();

  if (!route) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <h2 className="text-2xl font-semibold text-gray-900">
          No Route Assigned
        </h2>
        <p className="mt-4 text-gray-600">
          You don't have an active route assignment. Contact your manager for details.
        </p>
      </div>
    );
  }

  // Redirect to route detail
  redirect('/my-route');
}
```

### Read-Only Route Detail Component
```tsx
// Source: Existing RouteDetail component pattern + read-only variant
interface RouteDetailReadOnlyProps {
  route: Route & {
    truck: Truck;
  };
  formattedScheduledDate: string;
}

export function RouteDetailReadOnly({
  route,
  formattedScheduledDate,
}: RouteDetailReadOnlyProps) {
  return (
    <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
      <h2 className="text-xl font-semibold mb-4">Route Details</h2>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-gray-500">Origin</dt>
          <dd className="mt-1 text-sm text-gray-900">{route.origin}</dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-gray-500">Destination</dt>
          <dd className="mt-1 text-sm text-gray-900">{route.destination}</dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-gray-500">Scheduled Date</dt>
          <dd className="mt-1 text-sm text-gray-900">{formattedScheduledDate}</dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-gray-500">Status</dt>
          <dd className="mt-1">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
              {route.status}
            </span>
          </dd>
        </div>

        {route.notes && (
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Notes</dt>
            <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
              {route.notes}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-6 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-medium mb-4">Assigned Truck</h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Vehicle</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {route.truck.year} {route.truck.make} {route.truck.model}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">License Plate</dt>
            <dd className="mt-1 text-sm text-gray-900">{route.truck.licensePlate}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
```

### Document List (Read-Only for Drivers)
```typescript
// Source: Existing documents.ts actions + role check
// Drivers can list/download but not upload/delete
export async function listRouteDocuments(routeId: string) {
  // Allow OWNER, MANAGER, and DRIVER
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  // CRITICAL for drivers: verify routeId belongs to current user
  const role = await getRole();
  if (role === UserRole.DRIVER) {
    const user = await getCurrentUser();
    if (!user) throw new Error('User not found');

    const prisma = await getTenantPrisma();
    const route = await prisma.route.findFirst({
      where: {
        id: routeId,
        driverId: user.id,  // Verify ownership
      },
    });

    if (!route) {
      throw new Error('Route not found or not assigned to you');
    }
  }

  // Fetch documents
  const tenantId = await requireTenantId();
  const repo = new DocumentRepository(tenantId);
  return repo.findByRouteId(routeId);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Role checks in middleware only | Role checks in every server action + layout | Dec 2025 (CVE-2025-29927) | Server actions must independently validate authorization, middleware is bypassable |
| Disabled form inputs for read-only | Semantic HTML (`<dl>`, `<div>`, `<p>`) | Ongoing best practice | Better UX, text is selectable and copyable |
| React Context for user propagation | Server-side `getCurrentUser()` per action | Next.js 13+ App Router | Server Components eliminate client-side context, each action independently resolves user |
| Manual WHERE clauses for tenant isolation | Prisma RLS extension | Already implemented in Phase 1 | Centralized tenant filtering, but user filtering still manual |

**Deprecated/outdated:**
- **Middleware-only authorization:** CVE-2025-29927 demonstrated middleware can be bypassed for server actions
- **Client-side role checks:** Server Components move auth to server, client checks are for UX only
- **Global user context:** App Router Server Components prefer per-action user resolution over React Context

## Open Questions

1. **Should drivers see completed routes in a history view?**
   - What we know: Current requirement says "see only their assigned route" (singular, active)
   - What's unclear: Whether drivers need historical route visibility
   - Recommendation: Start with single active route only, add history page in future phase if requested

2. **Should drivers see all truck documents or only route-specific?**
   - What we know: Requirements say "view assigned truck details and documents" and "view route documents"
   - What's unclear: Whether truck documents (registration, insurance) should be visible to drivers
   - Recommendation: Show both — truck documents for pre-trip inspection reference, route documents for shipping/compliance

3. **How to handle drivers with no assigned route?**
   - What we know: Landing page should show "No Route Assigned" message
   - What's unclear: Should they see completed routes, or just a blank state?
   - Recommendation: Blank state with contact message for active drivers, optionally show last completed route

4. **Should driver portal include route status transitions?**
   - What we know: Owner portal has "Start Route" and "Complete Route" buttons
   - What's unclear: Whether drivers should self-transition route status or if manager does it
   - Recommendation: Read-only for Phase 7, add driver status updates in future phase (Phase 7.1 or 8)

## Sources

### Primary (HIGH confidence)
- [Clerk: currentUser() API Reference](https://clerk.com/docs/references/nextjs/current-user) - Server-side user resolution
- [Clerk: Server Actions with Next.js](https://clerk.com/docs/references/nextjs/server-actions) - Auth helpers for server actions
- [Next.js: How to Think About Security](https://nextjs.org/blog/security-nextjs-server-components-actions) - Authorization best practices, server action security
- [Next.js: Data Fetching Patterns](https://nextjs.org/docs/14/app/building-your-application/data-fetching/patterns) - Request memoization with React.cache()
- Existing codebase: `src/app/(owner)/actions/routes.ts`, `src/lib/auth/server.ts`, `src/app/(driver)/layout.tsx`

### Secondary (MEDIUM confidence)
- [OWASP: Insecure Direct Object Reference Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html) - IDOR prevention techniques
- [Cloudscape Design System: Disabled and Read-Only States](https://cloudscape.design/patterns/general/disabled-and-read-only-states/) - Read-only UI patterns
- [Clerk: Implement Role-Based Access Control in Next.js 15](https://clerk.com/blog/nextjs-role-based-access-control) - RBAC implementation patterns
- [Permit.io: Prisma ORM Data Filtering with ReBAC](https://www.permit.io/blog/prisma-orm-data-filtering-with-rebac) - User-scoped query patterns

### Tertiary (LOW confidence)
- None — all critical patterns verified against official docs and existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - Patterns directly extend existing server action + role guard patterns
- Pitfalls: HIGH - IDOR and auth bypass pitfalls documented in official Next.js security guide and CVE reports
- Code examples: HIGH - All examples based on existing codebase patterns or official Clerk/Next.js docs

**Research date:** 2026-02-14
**Valid until:** 2026-03-15 (30 days) - Stable domain, established patterns, no rapid framework changes expected
