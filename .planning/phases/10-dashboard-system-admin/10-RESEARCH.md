# Phase 10: Dashboard & System Admin - Research

**Researched:** 2026-02-15
**Domain:** Next.js dashboard development, multi-tenant admin portals, fleet KPI aggregation
**Confidence:** HIGH

## Summary

Phase 10 builds two distinct capabilities: (1) Owner dashboard with fleet overview metrics and aggregated data from existing widgets, and (2) System admin portal for cross-tenant management (view, create, suspend, delete tenants). The owner dashboard extends Phase 9's widget foundation with stat cards showing total counts and broader fleet metrics. The admin portal requires bypassing tenant RLS to access all tenants using the base prisma client without tenant extension.

The technical foundation already exists: Phase 9 delivered dashboard widgets with server actions, shadcn/ui card patterns, and color-coded urgency indicators. This phase adds stat cards (total trucks, drivers, routes, maintenance alerts) and combines existing widgets into a comprehensive fleet command center. For system admin, the codebase has admin layout with isSystemAdmin checks and base Prisma client for cross-tenant queries.

**Primary recommendation:** Build owner dashboard using shadcn/ui Card for stat cards with count aggregations via server actions, reuse Phase 9 widget patterns. Build system admin using base prisma client (NOT getTenantPrisma) for cross-tenant access, with Tenant table CRUD operations and confirmation dialogs for destructive actions.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15 | Server Components, server actions | Dashboard data fetching on server, no client bundle for aggregations |
| shadcn/ui Card | Latest | Dashboard stat cards and widgets | Already used in Phase 9, consistent design system |
| Prisma | 7 | Database ORM with RLS extension | Multi-tenant with tenant-scoped and admin-scoped clients |
| PostgreSQL | Latest | Relational database with RLS | Powers tenant isolation, supports aggregation queries |
| Clerk | Latest | Authentication provider | Already integrated, provides isSystemAdmin flag |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React Server Components | Next.js 15 | Dashboard page rendering | Default for all dashboard pages |
| Server Actions | Next.js 15 | Data mutations and fetching | All CRUD operations, stat aggregations |
| TanStack Table | Latest | Admin tenant list | Already used for trucks/drivers/routes lists |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Components | Client-side data fetching | Server Components eliminate client bundle for dashboards, better performance |
| Base Prisma client | Service role bypass | This project uses Prisma 7 with RLS extension, not Supabase service keys |
| Confirmation dialogs | Immediate deletion | Suspension/deletion are destructive, confirmation prevents mistakes |

**Installation:**
No new dependencies required - all components exist in codebase.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(owner)/
│   └── dashboard/
│       └── page.tsx              # Dashboard page with stat cards + Phase 9 widgets
├── app/(owner)/actions/
│   └── dashboard.ts              # NEW: Server actions for fleet stat aggregations
├── app/(admin)/
│   ├── layout.tsx                # EXISTS: Admin layout with isSystemAdmin check
│   └── tenants/
│       └── page.tsx              # NEW: Tenant management page
├── app/(admin)/actions/
│   └── tenants.ts                # NEW: Cross-tenant CRUD server actions
├── components/dashboard/
│   ├── upcoming-maintenance-widget.tsx  # EXISTS: Phase 9
│   ├── expiring-documents-widget.tsx    # EXISTS: Phase 9
│   └── stat-card.tsx             # NEW: Reusable stat card component
└── lib/
    ├── db/prisma.ts              # EXISTS: Base Prisma client (NO tenant extension)
    └── context/tenant-context.ts # EXISTS: getTenantPrisma() for tenant-scoped queries
```

### Pattern 1: Owner Dashboard with Stat Cards + Widgets

**What:** Dashboard page combines stat cards (totals/counts) with Phase 9 widgets (upcoming maintenance, expiring documents) in responsive grid layout.

**When to use:** Owner dashboard that shows fleet overview (totals) and actionable alerts (widgets).

**Example:**
```typescript
// src/app/(owner)/dashboard/page.tsx
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getFleetStats } from '@/app/(owner)/actions/dashboard';
import { getUpcomingMaintenance, getExpiringDocuments } from '@/app/(owner)/actions/notifications';
import { StatCard } from '@/components/dashboard/stat-card';
import { UpcomingMaintenanceWidget } from '@/components/dashboard/upcoming-maintenance-widget';
import { ExpiringDocumentsWidget } from '@/components/dashboard/expiring-documents-widget';

export default async function DashboardPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parallel data fetching
  const [stats, upcomingMaintenance, expiringDocuments] = await Promise.all([
    getFleetStats(),
    getUpcomingMaintenance(),
    getExpiringDocuments(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Fleet overview and alerts</p>
      </div>

      {/* Stat cards - 4 columns on desktop, responsive */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Total Trucks" value={stats.totalTrucks} />
        <StatCard label="Active Drivers" value={stats.activeDrivers} />
        <StatCard label="Active Routes" value={stats.activeRoutes} />
        <StatCard
          label="Maintenance Alerts"
          value={stats.maintenanceAlerts}
          variant={stats.maintenanceAlerts > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Widgets - 2 columns on desktop, Phase 9 pattern */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingMaintenanceWidget items={upcomingMaintenance} />
        <ExpiringDocumentsWidget items={expiringDocuments} />
      </div>
    </div>
  );
}
```

**Server actions for fleet stats:**
```typescript
// src/app/(owner)/actions/dashboard.ts
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { RouteStatus } from '@/generated/prisma/client';

export async function getFleetStats() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const db = await getTenantPrisma();

  // Parallel aggregation queries for performance
  const [totalTrucks, activeDrivers, activeRoutes, maintenanceAlerts] = await Promise.all([
    db.truck.count(),
    db.user.count({ where: { role: UserRole.DRIVER, isActive: true } }),
    db.route.count({ where: { status: { in: [RouteStatus.PLANNED, RouteStatus.IN_PROGRESS] } } }),
    db.scheduledService.count({ where: { isCompleted: false } }),
  ]);

  return { totalTrucks, activeDrivers, activeRoutes, maintenanceAlerts };
}
```

**Stat card component:**
```typescript
// src/components/dashboard/stat-card.tsx
'use client';

interface StatCardProps {
  label: string;
  value: number;
  variant?: 'default' | 'warning';
}

export function StatCard({ label, value, variant = 'default' }: StatCardProps) {
  const cardClass = variant === 'warning'
    ? 'border-yellow-300 bg-yellow-50'
    : 'border-gray-200 bg-white';

  return (
    <div className={`rounded-lg border p-6 shadow-sm ${cardClass}`}>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
```

### Pattern 2: System Admin Cross-Tenant Access

**What:** System admin portal uses base Prisma client (NOT getTenantPrisma) to bypass RLS and access all tenants. This pattern is ONLY for isSystemAdmin users.

**When to use:** Cross-tenant operations: viewing all tenants, creating new tenants, suspending/deleting tenants.

**Example:**
```typescript
// src/app/(admin)/actions/tenants.ts
'use server';

import { requireAuth } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma'; // Base client, NOT getTenantPrisma!
import { isSystemAdmin } from '@/lib/auth/server';

export async function getAllTenants() {
  await requireAuth();

  // CRITICAL: Check system admin before cross-tenant access
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) {
    throw new Error('Unauthorized: System admin access required');
  }

  // Use base prisma client to query ALL tenants (bypass RLS)
  return await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          trucks: true,
          routes: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function suspendTenant(tenantId: string) {
  await requireAuth();
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  return await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: false },
  });
}

export async function deleteTenant(tenantId: string) {
  await requireAuth();
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  // Hard delete (per project decision)
  return await prisma.tenant.delete({
    where: { id: tenantId },
  });
}
```

**Why base Prisma client:** The project uses Prisma 7 with a custom RLS extension (`withTenantRLS`) that wraps queries in transactions setting `app.current_tenant_id`. `getTenantPrisma()` returns `prisma.$extends(withTenantRLS(tenantId))`, which scopes all queries to one tenant. System admin needs ALL tenants, so must use the base `prisma` client without the extension.

### Pattern 3: Parallel Data Fetching for Dashboard Performance

**What:** Use Promise.all() to fetch multiple dashboard data sources concurrently in server components.

**When to use:** Dashboard pages with multiple independent data sources (stat cards, widgets).

**Example:**
```typescript
// Fetch all dashboard data in parallel
const [stats, maintenance, documents] = await Promise.all([
  getFleetStats(),           // Count aggregations
  getUpcomingMaintenance(),  // Phase 9 widget data
  getExpiringDocuments(),    // Phase 9 widget data
]);
```

**Why:** Avoids request waterfalls where each query waits for the previous to complete. Dashboard loads faster when data fetches run concurrently.

### Pattern 4: Confirmation Dialogs for Destructive Actions

**What:** Require explicit confirmation before suspending or deleting tenants.

**When to use:** Any destructive admin operation (suspend, delete).

**Example:**
```typescript
// Client component for tenant management
'use client';

import { useState } from 'react';
import { deleteTenant } from '@/app/(admin)/actions/tenants';

export function TenantRow({ tenant }) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    await deleteTenant(tenant.id);
    window.location.reload();
  };

  return (
    <tr>
      <td>{tenant.name}</td>
      <td>
        <button onClick={() => setShowConfirm(true)}>Delete</button>
        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg">
              <p>Delete {tenant.name}? This cannot be undone.</p>
              <button onClick={handleDelete}>Confirm Delete</button>
              <button onClick={() => setShowConfirm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
```

### Anti-Patterns to Avoid

- **Using getTenantPrisma() for system admin:** This scopes queries to one tenant. System admin needs base `prisma` client for cross-tenant access.
- **Forgetting isSystemAdmin check:** Always verify `isSystemAdmin()` before using base Prisma client for cross-tenant queries.
- **Client-side data fetching for dashboards:** Use Server Components and server actions. Aggregation queries belong on the server.
- **Waterfall data fetching:** Fetch dashboard data sequentially instead of parallel with Promise.all().
- **No confirmation for destructive actions:** Suspend/delete operations are irreversible, always confirm.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stat card component | Custom metric displays with complex styling | shadcn/ui Card primitives | Consistent with Phase 9 widgets, accessible, responsive |
| Tenant table UI | Custom admin table | TanStack Table (already in codebase) | Same pattern as trucks/drivers/routes lists, sorting/filtering built-in |
| Confirmation dialogs | Custom modal implementation | shadcn/ui Dialog + AlertDialog | Accessible, keyboard navigation, focus management |
| Date formatting | Custom date utilities | Existing date-fns patterns from Phase 8 | Already in codebase, consistent formatting |
| Fleet KPI aggregations | Manual query building | Prisma count() and aggregations | Type-safe, efficient, single database round-trip |

**Key insight:** Dashboard development is about composition, not invention. The codebase has all primitives needed: shadcn/ui Cards, server actions pattern, Prisma aggregations, TanStack Table. This phase combines existing patterns into owner and admin dashboards.

## Common Pitfalls

### Pitfall 1: Using getTenantPrisma() for System Admin Queries

**What goes wrong:** System admin needs to see ALL tenants, but getTenantPrisma() scopes queries to the admin user's tenant (which may be empty or irrelevant).

**Why it happens:** Pattern of "always use getTenantPrisma()" is correct for owner/driver actions but wrong for cross-tenant admin operations.

**How to avoid:**
- Owner/driver actions: `const db = await getTenantPrisma()` (tenant-scoped)
- System admin actions: `import { prisma } from '@/lib/db/prisma'` (base client, no extension)
- Always check `await isSystemAdmin()` before using base client

**Warning signs:**
- Admin tenant list is empty when tenants exist in database
- Admin can only see their own tenant
- RLS errors in admin actions

### Pitfall 2: Forgetting isSystemAdmin Authorization Check

**What goes wrong:** Server actions use base Prisma client for cross-tenant access without verifying user is actually a system admin, allowing any authenticated user to access all tenant data.

**Why it happens:** Admin layout checks isSystemAdmin, developers assume layout protection is sufficient for server actions.

**How to avoid:**
```typescript
// WRONG - layout check only, server action unprotected
export async function getAllTenants() {
  return await prisma.tenant.findMany(); // No auth check!
}

// CORRECT - server action enforces its own authorization
export async function getAllTenants() {
  await requireAuth();
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) throw new Error('Unauthorized');
  return await prisma.tenant.findMany();
}
```

**Warning signs:** Direct navigation to API routes bypasses layout checks, server actions callable from any client component.

### Pitfall 3: Dashboard Query Waterfalls

**What goes wrong:** Dashboard loads slowly because data fetches run sequentially instead of in parallel.

**Why it happens:** Natural pattern is to await each query before starting the next.

**How to avoid:**
```typescript
// SLOW - sequential queries (waterfall)
const stats = await getFleetStats();
const maintenance = await getUpcomingMaintenance();
const documents = await getExpiringDocuments();

// FAST - parallel queries
const [stats, maintenance, documents] = await Promise.all([
  getFleetStats(),
  getUpcomingMaintenance(),
  getExpiringDocuments(),
]);
```

**Warning signs:** Dashboard page takes 3x as long as individual queries, multiple round-trips to database visible in logs.

### Pitfall 4: No Confirmation for Destructive Admin Actions

**What goes wrong:** Misclick deletes production tenant with all data (hard deletes per project decision).

**Why it happens:** "Delete" button has direct onClick handler to server action, no intermediate confirmation.

**How to avoid:** Always show confirmation dialog for suspend/delete operations with tenant name displayed.

**Warning signs:** Users report accidental deletions, no "undo" mechanism exists.

### Pitfall 5: Mixing Widget Data Windows

**What goes wrong:** Dashboard shows broader data windows (30 days for maintenance, 60 days for documents) but widgets show different thresholds.

**Why it happens:** Copy-paste from Phase 9 email notification logic (7 days, 14 days) instead of using dashboard thresholds.

**How to avoid:** Dashboard uses Phase 9 server actions (`getUpcomingMaintenance`, `getExpiringDocuments`) which already implement broader windows:
- Maintenance: 30 days / 1000 miles (vs 7 days for emails)
- Documents: 60 days (vs 14 days for emails)

**Warning signs:** Widget shows items that shouldn't appear based on dashboard requirements.

## Code Examples

Verified patterns from codebase and official sources.

### Owner Dashboard Page (Server Component)
```typescript
// src/app/(owner)/dashboard/page.tsx
// Extends Phase 9 dashboard with stat cards

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getFleetStats } from '@/app/(owner)/actions/dashboard';
import {
  getUpcomingMaintenance,
  getExpiringDocuments,
} from '@/app/(owner)/actions/notifications';
import { StatCard } from '@/components/dashboard/stat-card';
import { UpcomingMaintenanceWidget } from '@/components/dashboard/upcoming-maintenance-widget';
import { ExpiringDocumentsWidget } from '@/components/dashboard/expiring-documents-widget';

export default async function DashboardPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Fetch all data in parallel
  const [stats, upcomingMaintenance, expiringDocuments] = await Promise.all([
    getFleetStats(),
    getUpcomingMaintenance(),
    getExpiringDocuments(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Fleet overview and alerts</p>
      </div>

      {/* Stat cards grid */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Trucks" value={stats.totalTrucks} />
        <StatCard label="Active Drivers" value={stats.activeDrivers} />
        <StatCard label="Active Routes" value={stats.activeRoutes} />
        <StatCard
          label="Maintenance Alerts"
          value={stats.maintenanceAlerts}
          variant={stats.maintenanceAlerts > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Phase 9 widgets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingMaintenanceWidget items={upcomingMaintenance} />
        <ExpiringDocumentsWidget items={expiringDocuments} />
      </div>
    </div>
  );
}
```

### Fleet Stats Server Action
```typescript
// src/app/(owner)/actions/dashboard.ts
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { RouteStatus } from '@/generated/prisma/client';

export async function getFleetStats() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // IMPORTANT: Use getTenantPrisma() for tenant-scoped queries
  const db = await getTenantPrisma();

  // Parallel count queries for dashboard stat cards
  const [totalTrucks, activeDrivers, activeRoutes, maintenanceAlerts] = await Promise.all([
    db.truck.count(),
    db.user.count({
      where: {
        role: UserRole.DRIVER,
        isActive: true
      }
    }),
    db.route.count({
      where: {
        status: {
          in: [RouteStatus.PLANNED, RouteStatus.IN_PROGRESS]
        }
      }
    }),
    db.scheduledService.count({
      where: {
        isCompleted: false
      }
    }),
  ]);

  return {
    totalTrucks,
    activeDrivers,
    activeRoutes,
    maintenanceAlerts,
  };
}
```

### System Admin Tenant Management (Cross-Tenant)
```typescript
// src/app/(admin)/actions/tenants.ts
'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma'; // Base client for cross-tenant access

export async function getAllTenants() {
  await requireAuth();

  // CRITICAL: Verify system admin before cross-tenant queries
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) {
    throw new Error('Unauthorized: System admin access required');
  }

  // Use base prisma (NO tenant extension) to see all tenants
  return await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          users: true,
          trucks: true,
          routes: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTenant(data: { name: string; slug: string }) {
  await requireAuth();
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  return await prisma.tenant.create({
    data: {
      name: data.name,
      slug: data.slug,
      isActive: true,
    },
  });
}

export async function suspendTenant(tenantId: string) {
  await requireAuth();
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  return await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: false },
  });
}

export async function deleteTenant(tenantId: string) {
  await requireAuth();
  const isAdmin = await isSystemAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  // Hard delete (per project decision in ROADMAP.md)
  return await prisma.tenant.delete({
    where: { id: tenantId },
  });
}
```

### Stat Card Component
```typescript
// src/components/dashboard/stat-card.tsx
'use client';

/**
 * Reusable stat card for dashboard metrics.
 * Follows Phase 9 Card pattern with shadcn/ui primitives.
 */

interface StatCardProps {
  label: string;
  value: number;
  variant?: 'default' | 'warning';
}

export function StatCard({
  label,
  value,
  variant = 'default'
}: StatCardProps) {
  const cardClass = variant === 'warning'
    ? 'border-yellow-300 bg-yellow-50'
    : 'border-gray-200 bg-white';

  return (
    <div className={`rounded-lg border p-6 shadow-sm ${cardClass}`}>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
```

## Fleet Management Dashboard KPIs

Based on industry research, fleet management dashboards in 2026 focus on these core KPI categories:

### Primary "North Star" KPIs
- **Fleet Size:** Total trucks, active vehicles
- **Utilization:** Active routes, vehicles in use vs idle
- **Maintenance Compliance:** Upcoming services, overdue items
- **Driver Availability:** Active drivers, assigned vs unassigned

### DriveCommand Phase 10 Mapping
| Industry KPI | DriveCommand Implementation |
|--------------|----------------------------|
| Fleet Size | Total Trucks stat card |
| Active Fleet | Active Routes stat card (trucks in use) |
| Driver Availability | Active Drivers stat card |
| Maintenance Compliance | Maintenance Alerts stat card + UpcomingMaintenanceWidget |
| Document Compliance | ExpiringDocumentsWidget (registration, insurance) |

**Design principle:** Tiered dashboard with stat cards (high-level totals) backed by detailed widgets (actionable items). Users see counts at a glance, click into widgets for specifics.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side dashboard fetching | Server Components with server actions | Next.js 13+ (2023) | Eliminates client bundle for data fetching, faster loads |
| Sequential data queries | Parallel Promise.all() | Always available, emphasized 2024+ | Faster dashboard rendering, eliminates waterfalls |
| Supabase service_role for RLS bypass | Prisma client extensions + base client pattern | Prisma 7 (2025) | Type-safe RLS bypass, no special environment keys |
| Custom admin tables | TanStack Table v8 | 2023+ | Headless pattern, framework-agnostic |
| Custom stat cards | shadcn/ui Card primitives | 2024+ | Composable, accessible, Radix UI foundation |

**Deprecated/outdated:**
- Supabase service_role pattern: This project uses Prisma 7 with custom RLS extension, not Supabase. Admin uses base Prisma client, not service keys.
- Client-side React Query for dashboards: Next.js 15 Server Components handle data fetching on server, no need for client-side cache libraries.
- Custom confirmation modals: shadcn/ui AlertDialog provides accessible, keyboard-navigable confirmations.

## Open Questions

1. **Should stat cards link to detail pages?**
   - What we know: Phase 9 widgets link to /trucks at bottom
   - What's unclear: Should "Total Trucks" card itself be clickable?
   - Recommendation: Make stat cards clickable links - "Total Trucks" → /trucks, "Active Drivers" → /drivers, "Active Routes" → /routes, "Maintenance Alerts" → /trucks (same as widget). Improves navigation, aligns with dashboard-as-navigation pattern.

2. **Should admin portal show detailed tenant analytics?**
   - What we know: Requirements specify view all tenants with status, create/suspend/delete
   - What's unclear: Does "status" mean just isActive boolean or broader metrics (user count, truck count, last activity)?
   - Recommendation: Include counts via Prisma `_count` relation aggregation (users, trucks, routes) to help admin assess tenant health. Example in getAllTenants() code example above.

3. **Confirmation dialog implementation: shadcn/ui Dialog or custom?**
   - What we know: Codebase doesn't show existing Dialog usage
   - What's unclear: Use shadcn/ui AlertDialog component or simple custom modal?
   - Recommendation: Start with simple custom confirmation div (shown in Pattern 4 example) to avoid adding shadcn/ui Dialog dependency mid-phase. Can refactor to AlertDialog later if needed across multiple admin features.

## Sources

### Primary (HIGH confidence)
- DriveCommand codebase - Phase 9 dashboard implementation: `src/app/(owner)/dashboard/page.tsx`, `src/components/dashboard/upcoming-maintenance-widget.tsx`, `src/app/(owner)/actions/notifications.ts`
- DriveCommand codebase - RLS implementation: `src/lib/db/extensions/tenant-rls.ts`, `src/lib/context/tenant-context.ts`, `src/lib/db/prisma.ts`
- DriveCommand codebase - Admin layout: `src/app/(admin)/layout.tsx`, `src/lib/auth/server.ts`
- [Next.js Official Docs - Server Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js Official Docs - Server Actions](https://nextjs.org/docs/app/getting-started/updating-data)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) - RLS bypass patterns

### Secondary (MEDIUM confidence)
- [Next.js: The Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/nextjs-complete-guide) - Server Components architecture
- [Next.js Server Actions: The Complete Guide (2026)](https://makerkit.dev/blog/tutorials/nextjs-server-actions) - Server action patterns
- [Next.js SaaS Dashboard Development: Scalability & Best Practices](https://www.ksolves.com/blog/next-js/best-practices-for-saas-dashboards) - Dashboard performance
- [Top 12 Fleet Management KPIs for 2026](https://trackobit.com/blog/top-fleet-management-kpis) - Industry KPIs
- [Fleet Management KPIs: 6 Metrics to Improve Efficiency (Fleetio)](https://www.fleetio.com/blog/fleet-management-kpis) - Fleet dashboard metrics
- [Handling Tenant Suspension and Reactivation Gracefully in Multi-Tenant SaaS](https://sollybombe.medium.com/handling-tenant-suspension-and-reactivation-gracefully-in-multi-tenant-saas-0af58945545a) - Tenant lifecycle
- [The developer's guide to SaaS multi-tenant architecture (WorkOS)](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) - Multi-tenant patterns
- [The Top 5 React Chart Libraries to Know in 2026 (Syncfusion)](https://www.syncfusion.com/blogs/post/top-5-react-chart-libraries) - Chart library options (if Phase 10 needs charts later)
- [shadcn/ui Card Documentation](https://www.shadcn.io/ui/card) - Card component primitives
- [Shadcn UI Statistics Card](https://horizon-ui.com/docs-boilerplate/shadcn-components/statistics) - Stat card patterns
- [Securing Multi-Tenant Applications Using Row Level Security in PostgreSQL with Prisma ORM](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) - Prisma RLS patterns
- [DesignRevision - Supabase Row Level Security Complete Guide (2026)](https://designrevision.com/blog/supabase-row-level-security) - RLS best practices

### Tertiary (LOW confidence, for context only)
- Various Next.js dashboard templates - General UI patterns only, not architecture guidance
- Generic SaaS multi-tenant blog posts - Conceptual understanding, not implementation specifics

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in codebase, Next.js 15 and Prisma 7 patterns verified
- Architecture: HIGH - Phase 9 provides widget foundation, codebase shows clear RLS bypass pattern with base Prisma client
- Pitfalls: HIGH - Common mistakes identified from codebase patterns (getTenantPrisma vs prisma) and industry sources
- Fleet KPIs: MEDIUM - Industry sources agree on core metrics, DriveCommand has data to support them

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days - stable technologies, slow-moving patterns)
