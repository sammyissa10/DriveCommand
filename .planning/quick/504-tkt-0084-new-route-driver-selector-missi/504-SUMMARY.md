---
phase: quick-504
plan: 504
subsystem: routes
tags: [nextjs, react, prisma, vitest, routes, driver-selector, client-server-boundary]

# Dependency graph
requires:
  - phase: quick-477
    provides: "Route.driverId must reference a DRIVER-role User.id, never a CarrierDriver.id"
  - phase: quick-478/479
    provides: "Sample + deactivated drivers excluded from assignment selectors; already-assigned preserved on edit"
provides:
  - "listRouteAssignableDrivers(orgId, opts) — full carrier roster + orphan DRIVER-role Users, server-only"
  - "routeDriverBlockedLabel() — pure, client-safe label mapper (own module, zero imports)"
  - "New Route + route-edit driver pickers show the whole roster with blocked-state reasons"
affects: [routes, route-form.tsx, RouteCreateMobile.tsx, routes/[id], client-server-boundary]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure/client-safe half of a data helper split into its own zero-import module (driver-blocked-label.ts) so a 'use client' component never drags Prisma/pg into the browser bundle"
    - "Show-but-explain-the-block: unassignable options render disabled with a reason instead of being hidden"
---

# Quick 504 — TKT-0084: New Route driver selector missing drivers

## Problem
`/routes/new` sourced its Primary Driver picker from `listDrivers()`
(`prisma.user.findMany({ role: 'DRIVER', isActive: true, isSample: false, take: 100 })`).
A DRIVER-role `User` row only exists once a carrier driver accepts their portal invite,
so any driver added at `/carrier/fleet/drivers/new` who hasn't accepted (or is linked to a
non-DRIVER-role User) was silently absent. On the demo org the picker showed **4 of 7** real
drivers; on the reporter's org, a similar gap. URGENT.

## Root cause (confirmed against prod)
Over-restrictive source, not a filter bug. Verified via `carrier_drivers LEFT JOIN "User"`:
drivers with `user_id IS NULL` (invite pending) and drivers linked to an OWNER-role User were
both dropped by the `role='DRIVER'` filter.

## Fix
- **New `listRouteAssignableDrivers()`** (server-only, `lib/routes/assignable-drivers.ts`) merges
  the full active/non-sample/non-deleted carrier roster with orphan DRIVER-role Users. A row is
  `assignable: true` only when it has a linked, active, DRIVER-role, non-sample User — that
  `User.id` is the ONLY value ever submitted as `driverId`/`coDriverIds` (guards quick-477).
  Unlinked → `INVITE_PENDING`; linked-but-deactivated or non-DRIVER-role → `ACCESS_REVOKED`.
  `opts.includeUserIds` force-includes an already-assigned driver on edit (quick-479).
- **Pure `routeDriverBlockedLabel()`** maps the blocked reason to display text.
- Desktop (`route-form.tsx`) + mobile (`RouteCreateMobile.tsx`) render every roster driver;
  blocked ones are disabled `<option>`s ("— Invitation pending" / "— Portal access revoked") with
  a helper line linking to `/carrier/fleet/drivers`. Co-driver checkboxes exclude blocked drivers.
- `/routes/[id]` edit swapped `listDrivers()` for `listRouteAssignableDrivers()`, preserving the
  existing assigned-driver merge.

## Two defects found & fixed AFTER the executor's initial pass
1. **Build break (`8f9369b9`).** `RouteCreateMobile.tsx` + `route-form.tsx` are client components;
   importing `routeDriverBlockedLabel` from `assignable-drivers.ts` pulled `getTenantPrisma → prisma
   → pg` into the browser bundle → `next build` failed "Module not found: Can't resolve 'tls'".
   `tsc --noEmit` reported 0 errors throughout (blind to client/server boundary). Fixed by
   splitting the pure half into its own zero-import module `lib/routes/driver-blocked-label.ts`.
   This is why two prod deploys (43d83e51) failed; prod stayed on the last good build.
2. **Dropped soft-deleted driver (`04f3cdca`).** Found during live verification on the demo org:
   SAMMY ISSA (active DRIVER-role User) had a carrier record soft-deleted 2026-06-17. The roster
   loop skipped it (deleted) and the orphan loop also skipped it (had a carrierDriverProfile row) —
   so the driver vanished entirely, the exact TKT-0084 failure mode reintroduced. Dedupe now relies
   solely on `seenUserIds`; the "must never shrink vs listDrivers()" invariant restored.

## Verification
- Vitest `assignable-drivers.test.ts` 3/3.
- `npx tsc --noEmit` 0 errors; `npx next build` compiled successfully (54s) after the boundary split.
- Live browser (demo org): picker went 4 → 7 → then 8/9 after the soft-delete fix; sample driver
  correctly absent; 3 invite-pending drivers greyed and unselectable; selecting a real driver saved.

## Commits
- `d11356dd` feat: add listRouteAssignableDrivers + pure blocked-label helper
- `26bfd107` fix: show full driver roster in New Route selector with blocked-state reasons
- `8f9369b9` fix: split pure driver-blocked-label out of server-only module (build fix)
- `04f3cdca` fix: stop dropping drivers whose carrier record was soft-deleted

Not deployed, not pushed.
