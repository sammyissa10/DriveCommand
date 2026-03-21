# Phase 28: Driver History — Research

**Researched:** 2026-03-21
**Domain:** Driver portal — read-only history lists in existing Load and Route tabs
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Where history lives:** Completed loads appear in the **Load tab** — active load card at top, "Past Loads" section below. Completed routes appear in the **Route tab** — active route at top, completed routes list below. No separate History tab in the bottom nav.
- **History scope:** Show **all** completed loads and routes for the driver (no date limit, no item cap). Scoped strictly to the logged-in driver (driverId + tenantId).
- **Interaction on tap:** Tapping a completed load or route **expands inline** — no navigation to a detail page. Expanded view shows the full detail within the card.
- **Empty state:** Simple message with a small icon: e.g. "No completed loads yet" / "No completed routes yet". No suggested actions — drivers can't create loads/routes.
- **Access model:** Strictly read-only — no edit controls, no status updates. Driver only sees their own history (not other drivers' loads/routes).

### Claude's Discretion
- Exact fields shown on load history cards
- Visual treatment of expanded inline card (height, animation, content layout)
- Skeleton/loading state design
- Ordering of history items (most recent first assumed)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 28 adds a read-only "Past Loads" section to `/my-load` and a completed routes list to `/my-route` in the driver portal. The architecture is minimal: two new server actions (one per data type) and two new client components (expandable history card lists). No schema changes, no new routes, no nav changes.

The existing codebase already has all the patterns needed — server actions in `src/app/(driver)/actions/`, read-only display components in `src/components/driver/`, and the security model (requireRole + getCurrentUser + getTenantPrisma) is already established. This phase is wiring new queries and new UI components into already-existing pages.

**Primary recommendation:** Extend the existing `driver-load.ts` and `driver-routes.ts` action files with new history-fetch functions, then build client components for the expandable history lists. Both pages remain server components at the page level; history sections are client components for interactivity (expand/collapse).

---

## Standard Stack

### Core (all already in the project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | Current | Page routing, server components | Already used throughout driver portal |
| Prisma + `getTenantPrisma()` | Current | DB queries with tenant RLS | All driver actions use this pattern |
| React `useState` | Current | Local expand/collapse state | Used in `LoadStatusButton`, `RouteDetailReadOnly` |
| Tailwind CSS | Current | Styling | Used in all driver components |
| Lucide React | Current | Icons | Used in all driver components |

### No new dependencies needed
This phase requires zero new packages. All tooling is already installed and in use.

---

## Architecture Patterns

### Existing File Structure (reference)
```
src/app/(driver)/
├── my-load/
│   └── page.tsx            ← Add "Past Loads" section here
├── my-route/
│   └── page.tsx            ← Add "Completed Routes" section here
├── actions/
│   ├── driver-load.ts      ← Add getMyCompletedLoads() here
│   └── driver-routes.ts    ← Add getMyCompletedRoutes() here

src/components/driver/
│   ├── load-status-button.tsx         ← Reference for client component pattern
│   ├── route-detail-readonly.tsx      ← Reference for read-only display pattern
│   └── [new components for history]
```

### Pattern 1: Driver-Scoped Server Action
This is the only allowed pattern for all data fetching. No exceptions.

```typescript
// Source: src/app/(driver)/actions/driver-load.ts (existing)
'use server';

export async function getMyCompletedLoads() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.DRIVER]);

  const user = await getCurrentUser();
  if (!user) throw new Error('User not found');

  const prisma = await getTenantPrisma();

  return prisma.load.findMany({
    where: {
      driverId: user.id,       // CRITICAL: from database, NEVER from params
      status: 'DELIVERED',     // Only DELIVERED = "past" for loads
    },
    include: {
      customer: { select: { companyName: true } },
    },
    orderBy: { deliveryDate: 'desc' }, // Most recent first
  });
}
```

**Security invariant (non-negotiable):**
1. `requireRole([UserRole.DRIVER])` — always first line
2. `getCurrentUser()` — identity from DB, never from URL params
3. `getTenantPrisma()` — RLS-scoped client
4. `driverId: user.id` in WHERE clause — never accepts driverId as input

### Pattern 2: Client Component with Expand/Collapse
History cards need local UI state. Use the same pattern as `LoadStatusButton` (client component with `useState`).

```typescript
// Source: pattern from src/components/driver/load-status-button.tsx
'use client';

import { useState } from 'react';

export function PastLoadsList({ loads }: { loads: CompletedLoad[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  return (
    <div className="space-y-2">
      {loads.map((load) => (
        <PastLoadCard
          key={load.id}
          load={load}
          isExpanded={expandedId === load.id}
          onToggle={() => toggleExpand(load.id)}
        />
      ))}
    </div>
  );
}
```

### Pattern 3: Page Structure (server component + client section)
Pages stay as server components. History data is fetched server-side and passed as props to client components.

```typescript
// Pattern: src/app/(driver)/my-load/page.tsx (extension)
export default async function MyLoadPage() {
  const [load, completedLoads] = await Promise.all([
    getMyActiveLoad().catch(() => null),
    getMyCompletedLoads().catch(() => []),
  ]);

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Existing active load section — unchanged */}
      {load ? <ActiveLoadSection load={load} /> : <NoActiveLoadState />}

      {/* New: Past Loads section */}
      <PastLoadsList loads={completedLoads} />
    </div>
  );
}
```

### Recommended Card Styling
Match the established card style: `rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card shadow-sm`

For completed/past items, add a subtle muted treatment to signal "inactive":
- Status badge: `bg-muted text-muted-foreground` (not a bright color)
- Left border accent: `border-l-4 border-l-muted` or omit accent entirely
- Expand/collapse chevron: `ChevronDown` / `ChevronUp` from lucide-react, rotated with CSS transition

### Anti-Patterns to Avoid
- **Separate history page:** CONTEXT.md locks history inside the existing tabs — no new routes
- **Filtering or pagination UI:** CONTEXT.md says show all — no filter bar, no "Load more" button
- **Status update buttons:** Read-only — no `advanceLoadStatus` wiring on history cards
- **Fetching driverId from URL/params:** Always use `getCurrentUser().id` — existing security invariant
- **Including non-DELIVERED loads in load history:** PENDING, DISPATCHED, PICKED_UP, IN_TRANSIT are active statuses. Only `DELIVERED` = completed for loads. Note: `INVOICED` and `CANCELLED` loads are edge cases — see Open Questions.

---

## Data Layer: What to Query

### Completed Loads
- **Status filter:** `status: 'DELIVERED'` (the terminal successful status for loads)
- **Note on INVOICED:** Loads become INVOICED after billing. A driver would still want to see these in their history. Consider `status: { in: ['DELIVERED', 'INVOICED'] }` — see Open Questions.
- **Note on CANCELLED:** Probably not useful in driver history. Omit.
- **Fields for summary card:** `loadNumber`, `origin`, `destination`, `deliveryDate`, `rate`, `customer.companyName`
- **Fields for expanded view (full detail):** All fields from existing `getMyActiveLoad()` include shape: `pickupDate`, `deliveryDate`, `weight`, `commodity`, `rate`, `notes`, `customer.companyName`, `route.name`
- **Order:** `deliveryDate: 'desc'` (most recent delivery first; fallback to `pickupDate: 'desc'` for loads without a deliveryDate)

### Completed Routes
- **Status filter:** `status: 'COMPLETED'`
- **Fields for summary card:** `name`, `origin`, `destination`, `completedAt`, `scheduledDate`, `distanceMiles`
- **Fields for expanded view:** All fields from existing `getMyAssignedRoute()` include shape (truck, driver, stops, loads)
- **Order:** `completedAt: 'desc'` (most recent completion first; fallback to `scheduledDate: 'desc'`)

### Prisma include shapes (reference)
Loads — existing include from `getMyActiveLoad()`:
```typescript
include: {
  customer: { select: { companyName: true } },
  route: { select: { id: true, name: true, origin: true, destination: true, status: true } },
}
```

Routes — existing include from `getMyAssignedRoute()`:
```typescript
include: {
  truck: { select: { id, make, model, year, vin, licensePlate, odometer, documentMetadata } },
  driver: { select: { id, firstName, lastName, email, licenseNumber } },
  documents: true,
  stops: { orderBy: { position: 'asc' } },
  loads: { select: { id, loadNumber, origin, destination, status }, orderBy: { pickupDate: 'asc' } },
}
```

For history routes, the document include and full truck/driver detail may be overkill. A lighter include (`truck: { select: { make, model, year, licensePlate } }`, no documents) is preferable for the summary card to keep queries fast.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant data isolation | Custom WHERE tenantId clause | `getTenantPrisma()` (existing) | RLS extension handles it automatically |
| Driver identity | URL param driverId | `getCurrentUser()` (existing) | Security invariant — already established in the codebase |
| Expand/collapse animation | CSS height transitions on `auto` | CSS `grid-template-rows: 0fr → 1fr` trick or simple `display:none` toggle | Height auto transitions don't work in CSS; use grid row or visibility approach |
| Loading skeleton | Spinner/custom loader | Tailwind `animate-pulse` with div placeholders | Matches existing loading patterns in the app |

**Key insight:** The codebase already solved the hard problems (auth, tenancy, RLS). This phase is entirely UI + thin data layer extension.

---

## Common Pitfalls

### Pitfall 1: getMyActiveLoad Includes DELIVERED Status
**What goes wrong:** `getMyActiveLoad()` currently filters `status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] }`. A DELIVERED load will appear both in the "active load" section AND in the history section.
**Why it happens:** The existing action was written before history existed. DELIVERED was included so the driver could see their just-delivered load.
**How to avoid:** When writing `getMyCompletedLoads()`, filter to `status: 'DELIVERED'`. In the page, the same DELIVERED load will show at top as "active" and at the bottom as the most recent history item. This is acceptable UX — the driver sees it in both places briefly. Alternatively, filter history to loads where `deliveryDate` is not null and in the past. Best approach: keep the overlap — it's not a bug, it's a feature (the driver sees confirmation).
**Warning signs:** If history shows zero items even after a delivery — check status filter.

### Pitfall 2: Route History Missing Due to driverId FK
**What goes wrong:** `Route` has a single `driverId` FK. The `RouteDriver` join table (`coDrivers`) also links drivers to routes. A co-driver would not see routes via the primary `driverId` filter.
**Why it happens:** The data model supports co-drivers via `RouteDriver` join table, but current driver actions only use the primary `driverId` field.
**How to avoid:** For Phase 28, scope history to `driverId: user.id` only (primary driver). This matches the existing `getMyAssignedRoute()` behavior. Co-driver history is a deferred feature.
**Warning signs:** Driver reports "I drove this route but don't see it in history."

### Pitfall 3: Inline Expand on Mobile — Fixed Positioning Issues
**What goes wrong:** Expanded cards with lots of content push the bottom nav out of view or cause layout overflow on small screens.
**Why it happens:** The driver layout has `pb-20` on main to clear the fixed bottom nav. Very long expanded cards can still feel overwhelming.
**How to avoid:** Keep expanded content concise — group fields, use a compact `dl`/`dt`/`dd` grid layout. Don't include documents download section in history (no files attached to history). The active route page already has a long scrollable page, so drivers are accustomed to scrolling.

### Pitfall 4: Missing `'use server'` or `'use client'` Directive
**What goes wrong:** Next.js throws a runtime error if a file that calls `headers()` or Prisma is not marked `'use server'`.
**Why it happens:** Easy to forget when adding a new action file or creating a component near the boundary.
**How to avoid:** Follow the existing pattern exactly — new action functions go into the existing `driver-load.ts` / `driver-routes.ts` files (already `'use server'`). New UI components with `useState` get `'use client'` at the top.

### Pitfall 5: archivedAt Soft-Delete Not Filtered
**What goes wrong:** Loads and routes have `archivedAt` soft-delete fields. If an owner archives a load, it should not appear in driver history.
**Why it happens:** The existing `getMyActiveLoad()` does not filter `archivedAt: null`. Prisma RLS may or may not handle this.
**How to avoid:** Add `archivedAt: null` to the WHERE clause in the new history actions. Check if the existing active-load action also needs this fix.

---

## Code Examples

### Server Action: Get Completed Loads
```typescript
// Add to: src/app/(driver)/actions/driver-load.ts
// Source: follows existing getMyActiveLoad() pattern exactly

export async function getMyCompletedLoads() {
  await requireRole([UserRole.DRIVER]);

  const user = await getCurrentUser();
  if (!user) throw new Error('User not found');

  const prisma = await getTenantPrisma();

  return prisma.load.findMany({
    where: {
      driverId: user.id,
      status: { in: ['DELIVERED', 'INVOICED'] },
      archivedAt: null,
    },
    include: {
      customer: { select: { companyName: true } },
      route: { select: { id: true, name: true } },
    },
    orderBy: [
      { deliveryDate: 'desc' },
      { pickupDate: 'desc' },
    ],
  });
}
```

### Server Action: Get Completed Routes
```typescript
// Add to: src/app/(driver)/actions/driver-routes.ts
// Source: follows existing getMyAssignedRoute() pattern exactly

export async function getMyCompletedRoutes() {
  await requireRole([UserRole.DRIVER]);

  const user = await getCurrentUser();
  if (!user) throw new Error('User not found');

  const prisma = await getTenantPrisma();

  return prisma.route.findMany({
    where: {
      driverId: user.id,
      status: 'COMPLETED',
      archivedAt: null,
    },
    include: {
      truck: {
        select: { make: true, model: true, year: true, licensePlate: true },
      },
      stops: { orderBy: { position: 'asc' } },
      loads: {
        select: { id: true, loadNumber: true, origin: true, destination: true, status: true },
        orderBy: { pickupDate: 'asc' },
      },
    },
    orderBy: [
      { completedAt: 'desc' },
      { scheduledDate: 'desc' },
    ],
  });
}
```

### Client Component: Expand/Collapse Card
```typescript
// Source: pattern from src/components/driver/load-status-button.tsx (useState) +
//         src/components/driver/route-detail-readonly.tsx (card styling)
'use client';

import { useState } from 'react';
import { ChevronDown, Package } from 'lucide-react';

export function PastLoadCard({ load, isExpanded, onToggle }: PastLoadCardProps) {
  return (
    <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card shadow-sm overflow-hidden">
      {/* Summary row — always visible, tap to expand */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left min-h-[56px]"
        aria-expanded={isExpanded}
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">Load #{load.loadNumber}</p>
          <p className="text-xs text-muted-foreground truncate">
            {load.origin} → {load.destination}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs text-muted-foreground">
            {load.deliveryDate ? new Date(load.deliveryDate).toLocaleDateString() : '—'}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded detail — conditionally rendered */}
      {isExpanded && (
        <div className="border-t border-border p-4">
          {/* Full detail fields here */}
        </div>
      )}
    </div>
  );
}
```

### Empty State Pattern
```typescript
// Source: matches existing empty state in my-load/page.tsx and my-route/page.tsx
{loads.length === 0 && (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Package className="h-6 w-6 text-muted-foreground" />
    </div>
    <p className="text-sm text-muted-foreground">No completed loads yet.</p>
  </div>
)}
```

---

## Recommended Load History Card Fields

Based on driver use cases (disputes, pay questions, record-keeping) and the existing active load card as reference:

**Summary row (always visible):**
- Load number (`#LD-0042`)
- Origin → Destination (truncated)
- Delivery date

**Expanded detail:**
- Customer company name
- Pickup date + Delivery date
- Weight (if set)
- Commodity (if set)
- Rate (with green treatment — `$X,XXX.XX`)
- Notes (if set)
- Linked route name (if set)
- Status badge (DELIVERED / INVOICED)

**Omit from history cards:** status update buttons, linked route link, truck info, document downloads (these belong to the active view, not history reference).

---

## Recommended Route History Card Fields

**Summary row:**
- Route name (or "Unnamed Route")
- Origin → Destination
- Completed date

**Expanded detail:**
- Scheduled date
- Completed at
- Distance (if `distanceMiles` set)
- Truck (year make model, license plate)
- Notes (if set)
- Stops list (position, type, address, status)
- Loads on route (loadNumber, status)

**Omit from history cards:** document downloads, truck documents, route messages panel.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Separate history page | Inline section in existing tab | Confirmed by CONTEXT.md — no new route needed |
| Infinite scroll / pagination | Show all items | Confirmed by CONTEXT.md — no cap |
| Detail page navigation on tap | Expand inline | Confirmed by CONTEXT.md — `useState` expand/collapse |

---

## Open Questions

1. **Should INVOICED loads appear in driver history?**
   - What we know: `LoadStatus` enum includes `INVOICED` as a post-DELIVERED state. A load moves DELIVERED → INVOICED after billing.
   - What's unclear: Whether the driver should see `INVOICED` loads in their history (they would recognize the load regardless of billing status).
   - Recommendation: Include `INVOICED` in the history filter (`status: { in: ['DELIVERED', 'INVOICED'] }`). The driver cares about whether the delivery happened, not the billing state. If the planner disagrees, restrict to `DELIVERED` only.

2. **Should CANCELLED loads appear in driver history?**
   - What we know: `LoadStatus` includes `CANCELLED`.
   - What's unclear: Does a driver ever need to reference a cancelled load?
   - Recommendation: Exclude `CANCELLED` from history. Drivers reference history for disputes/pay verification — cancelled loads weren't completed.

3. **Does `archivedAt` need filtering in existing active-load actions?**
   - What we know: `Load` and `Route` have `archivedAt` fields. The existing `getMyActiveLoad()` does not filter `archivedAt: null`.
   - What's unclear: Whether RLS policy handles soft-deletes automatically.
   - Recommendation: Add `archivedAt: null` to new history actions. Flag as a potential bug in existing active-load actions for the executor to check.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/app/(driver)/actions/driver-load.ts` — existing auth/query pattern
- Direct codebase inspection: `src/app/(driver)/actions/driver-routes.ts` — existing route query pattern
- Direct codebase inspection: `prisma/schema.prisma` — Load, Route, LoadStatus, RouteStatus models
- Direct codebase inspection: `src/components/driver/` — all existing driver components
- Direct codebase inspection: `src/app/(driver)/my-load/page.tsx`, `my-route/page.tsx` — page structure

### Secondary (MEDIUM confidence)
- React docs: `useState` for expand/collapse — standard pattern, no library needed
- Next.js App Router: server component + client component boundary — standard pattern

---

## Metadata

**Confidence breakdown:**
- Data layer (actions): HIGH — schema is clear, existing pattern is exact template
- Security model: HIGH — invariants already established and consistent throughout codebase
- UI component structure: HIGH — existing card/page patterns are directly reusable
- Expand/collapse pattern: HIGH — straightforward React useState, no library needed
- Field selection (Claude's discretion): MEDIUM — reasonable defaults documented, planner/executor may adjust

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable codebase, no fast-moving dependencies)
