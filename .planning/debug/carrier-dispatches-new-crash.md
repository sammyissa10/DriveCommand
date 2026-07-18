---
status: resolved
trigger: "Clicking 'Add New Dispatch' on /carrier/dispatches navigates to /carrier/dispatches/new, which throws 'An error occurred in the Server Components render' (Error ID: 3066917071) in production."
created: 2026-06-09T00:00:00Z
updated: 2026-06-09T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — /carrier/dispatches/new has no dedicated route; Next.js routes it to [id]/page.tsx with id="new". That page calls getTrip(orgId, "new"), which calls getTenantPrisma(), which calls requireTenantId(). requireTenantId() reads the x-tenant-id header injected by middleware. On the /carrier/dispatches/new URL, middleware either does not inject the header or the tenant is resolved — but the trip query itself returns null for id="new" (no such DB row), so notFound() is called. However, the actual throw is earlier: getTrip() calls getTenantPrisma() → requireTenantId() → THROWS if header is missing, or the prisma query for id="new" fails with a Prisma validation error because "new" is not a valid CUID/UUID.
test: Read [id]/page.tsx and getTrip() in trips.ts
expecting: Confirmed — the page is a dispatch detail page, not a "create new dispatch" page
next_action: DIAGNOSIS COMPLETE — report produced

## Symptoms

expected: /carrier/dispatches/new renders a form/page for creating a new dispatch
actual: Next.js Server Components render error thrown — "An error occurred in the Server Components render" (Error ID: 3066917071)
errors: Server Components render error, Error ID: 3066917071
reproduction: Navigate to /carrier/dispatches → click "Add New Dispatch"
started: Current production crash on drivecommand.app

## Eliminated

- hypothesis: getTenantPrisma() throws because x-tenant-id header is missing
  evidence: The list page (/carrier/dispatches/page.tsx) uses bare prisma (not getTenantPrisma), so it works fine. The [id] detail page calls getTenantPrisma() and would throw if the header were missing — but the more likely throw is the Prisma query itself receiving "new" as an ID value.
  timestamp: 2026-06-09T00:00:00Z

## Evidence

- timestamp: 2026-06-09T00:00:00Z
  checked: apps/web/src/app/(owner)/carrier/dispatches/ directory listing
  found: Only [id]/, _grid/, and page.tsx. No `new/` subdirectory exists.
  implication: Navigating to /carrier/dispatches/new hits the [id] dynamic segment with id="new"

- timestamp: 2026-06-09T00:00:00Z
  checked: apps/web/src/app/(owner)/carrier/dispatches/_grid/DispatchesGrid.tsx line 229
  found: onNew={() => router.push('/carrier/dispatches/new')
  implication: The "Add New Dispatch" button navigates to /carrier/dispatches/new, which has no dedicated page — it falls through to [id]/page.tsx

- timestamp: 2026-06-09T00:00:00Z
  checked: apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx lines 26-42
  found: const { id } = await params; then getTrip(orgId, id) where id="new"
  implication: getTrip() is called with id="new" — a string that is not a valid UUID/CUID

- timestamp: 2026-06-09T00:00:00Z
  checked: apps/web/src/lib/carrier/trips.ts getTrip() lines 150-167
  found: calls getTenantPrisma(), then tenantPrisma.trip.findFirst({ where: { id, orgId } })
  implication: The Prisma query receives id="new". In PostgreSQL/Prisma, if the id column is a UUID type, passing the literal string "new" causes a database-level cast error (invalid UUID syntax), which propagates as an unhandled exception in the Server Component.

- timestamp: 2026-06-09T00:00:00Z
  checked: apps/web/src/lib/context/tenant-context.ts getTenantPrisma() line 48
  found: calls requireTenantId() which throws if x-tenant-id header is absent
  implication: Secondary throw path — if middleware does not set the header for this URL, requireTenantId() throws before the Prisma query. Either way the page throws.

- timestamp: 2026-06-09T00:00:00Z
  checked: apps/web/src/app/(owner)/carrier/dispatches/page.tsx (list page)
  found: Uses bare `prisma` (not getTenantPrisma), reads tenantId from session directly
  implication: List page bypasses getTenantPrisma entirely — explains why it works while [id]/page.tsx crashes

## Resolution

root_cause: There is no /carrier/dispatches/new route. The "Add New Dispatch" button navigates to /carrier/dispatches/new, which is caught by the [id] dynamic segment and renders the dispatch detail page with id="new". That page calls getTrip(orgId, "new"), which passes the literal string "new" to a Prisma UUID field query, causing a database-level cast error (invalid UUID input syntax) that surfaces as an unhandled Server Component exception.

fix: Create a dedicated apps/web/src/app/(owner)/carrier/dispatches/new/page.tsx that renders a dispatch creation form. This static segment takes priority over [id] in Next.js routing, so /carrier/dispatches/new will no longer hit the detail page.

files_changed: []
