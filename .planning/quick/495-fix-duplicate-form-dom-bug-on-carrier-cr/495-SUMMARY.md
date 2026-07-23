---
phase: quick-495
plan: 495
subsystem: web-carrier-ui
tags: [forms, mobile-web-ds, hydration, bugfix]
requires: []
provides:
  - ResponsiveSwitch (apps/web/src/components/ui/ResponsiveSwitch.tsx)
  - useIsDesktop (apps/web/src/hooks/useIsDesktop.ts)
affects:
  - apps/web/src/app/(owner)/carrier/contracts/new
  - apps/web/src/app/(owner)/carrier/trips/new
  - apps/web/src/app/(owner)/carrier/loads/new
  - apps/web/src/app/(owner)/carrier/clients/new
  - apps/web/src/app/(owner)/carrier/facilities/new
  - apps/web/src/app/(owner)/carrier/fleet/drivers/new
  - apps/web/src/app/(owner)/carrier/templates/new
  - apps/web/src/app/(owner)/carrier/clients/[id]
  - apps/web/src/app/(owner)/carrier/contracts/[id]
  - apps/web/src/app/(owner)/carrier/facilities/[id]
  - apps/web/src/app/(owner)/carrier/templates/[id]
  - apps/web/src/app/(owner)/carrier/loads/[id]
tech-stack:
  added: []
  patterns:
    - "ResponsiveSwitch — SSR-safe single-mount breakpoint switch, replaces lg:hidden/hidden lg:block CSS dual-mount for any page with an active <form>"
key-files:
  created:
    - apps/web/src/hooks/useIsDesktop.ts
    - apps/web/src/components/ui/ResponsiveSwitch.tsx
  modified:
    - apps/web/src/app/(owner)/carrier/contracts/new/page.tsx
    - apps/web/src/app/(owner)/carrier/trips/new/page.tsx
    - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
    - apps/web/src/app/(owner)/carrier/clients/new/page.tsx
    - apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
    - apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx
    - apps/web/src/app/(owner)/carrier/templates/new/page.tsx
    - apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
decisions:
  - "Audited all 8 carrier [id] edit pages for the dual-mount bug rather than assuming all of them qualified. Converted only the 5 with a genuine simultaneous-duplicate-form risk (clients, contracts, facilities, templates, loads); left fleet/drivers, fleet/trucks, trips untouched because their desktop edit affordance is gated by a local view/edit toggle component that the hidden mobile variant's own local isEditing state never shares, so only one live form ever exists regardless of viewport."
metrics:
  duration_minutes: 45
  tasks_completed: 3
  files_modified: 14
  completed_date: 2026-07-22
---

# Quick 495: Fix duplicate-form DOM bug on carrier create/edit pages Summary

Replaced the CSS-only `lg:hidden` / `hidden lg:block` dual-mount pattern (both breakpoint variants of a form always live in the DOM) with a new SSR-safe `ResponsiveSwitch` component that mounts exactly one variant, on 12 carrier pages — 7 create pages and 5 edit pages that had a genuine duplicate-form risk.

## What Was Built

**`useIsDesktop()` hook** (`apps/web/src/hooks/useIsDesktop.ts`) — returns `boolean | undefined`. State starts as `undefined` (not `false`) and only resolves after mount via `window.matchMedia('(min-width: 1024px)')`. Returning `undefined` pre-mount is the load-bearing detail: it lets the caller render neither variant during SSR/hydration, so there's never a window where both (or the wrong) variant is on screen.

**`<ResponsiveSwitch mobile desktop fallback? />`** (`apps/web/src/components/ui/ResponsiveSwitch.tsx`) — a client component that calls `useIsDesktop()` and renders `fallback ?? null` while undefined, then exactly one of `{mobile, desktop}` once resolved. Server Components (the carrier pages) keep doing their Prisma fetches and pass the fully-hydrated slot elements in as props; the switch only decides which one mounts.

**Task 2 — the 3 primary create pages named in the bug report**, converted from the sibling-div CSS toggle to `ResponsiveSwitch`:
- `contracts/new`, `trips/new`, `loads/new`

Verified the trips/new "four driver dropdowns" root cause: `NewTripMobile` (primary + co-driver = 2 selects) and the desktop `NewDispatchForm` (also primary + co-driver = 2 selects) were both mounted simultaneously — no internal double-render existed in either component, so a single-mount fix alone resolves it to the correct 2.

**Task 3a — the 4 remaining create pages** using the identical conversion: `clients/new`, `facilities/new`, `fleet/drivers/new`, `templates/new`. `fleet/trucks/new` was confirmed single-form and left untouched.

**Task 3b — audit of all 8 carrier `[id]` edit pages.** Each was individually inspected (not assumed) for whether it ever renders two live forms at once:

| Page | Verdict | Why |
|---|---|---|
| `clients/[id]` | **Converted** | `initialEdit={edit === 'true'}` passed identically to both `ClientDetailMobile` and `ClientDetail` — navigating to `?edit=true` puts both into edit mode simultaneously. |
| `contracts/[id]` | **Converted** | Same shared-searchParams `initialEdit` pattern as clients. |
| `facilities/[id]` | **Converted** | Desktop always renders `<FacilityForm>` — a literal `<form onSubmit>`, unconditional, no view/edit gate. Mobile `FacilityEditMobile` is also unconditionally in edit mode (`FieldGroup isEditing` always true). Both are live, always, at every viewport. |
| `templates/[id]` | **Converted** | Same pattern as facilities: desktop `<RouteTemplateForm>` is a permanent `<form>`, mobile `TemplateEditMobile` is permanently editing. |
| `loads/[id]` | **Converted** | Desktop always renders `<LoadForm mode="edit">` unconditionally (no wrapping view/edit toggle), so its `<form>` exists in the DOM at every viewport. Mobile `LoadDetailMobile` defaults to view (`isEditing=false`) but has its own local Edit toggle — clicking it produces a second live form with colliding field ids while desktop's hidden form is still mounted. |
| `fleet/drivers/[id]` | Left unchanged | Desktop's edit form is wrapped in `DriverEditCard`, a client component defaulting to view mode (`useState<'view'|'edit'>(searchParams.get('mode') === 'edit' ? 'edit' : 'view')`). Mobile's `DriverDetailMobile.initialEdit` prop is never passed by the page (defaults `false`) and isn't wired to the URL, so the two variants' edit states are never driven by the same trigger — only one form is ever live. |
| `fleet/trucks/[id]` | Left unchanged | Same shape as drivers: desktop's `CarrierTruckDetailClient` gates its form behind a local `mode` state defaulting to view; mobile's `TruckDetailMobile.initialEdit` also defaults `false` and isn't URL-synced. |
| `trips/[id]` | Left unchanged | Desktop has no `<form>` at all — it's a header/timeline/panels detail layout. Mobile `TripDetailMobile.isEditing` defaults `false`, purely local. No duplicate-form risk exists. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - missing critical functionality] Extended the [id] audit conversion beyond an assumption of "probably fine"**
- **Found during:** Task 3 audit step
- **Issue:** The plan's audit instruction only said to grep for the CSS pattern and check for "two live forms," without pre-judging which pages qualified. On inspection, facilities/[id] and templates/[id] turned out to be *worse* than the create-page bug: both breakpoint variants are unconditionally live forms at every viewport, not just when a shared `?edit=true` query param is present (as with clients/contracts). loads/[id] has an asymmetric but real risk (desktop always-form, mobile toggle-driven).
- **Fix:** Converted all 5 genuine cases to `ResponsiveSwitch`; left the 3 pages with local-only, URL-desynced edit toggles (drivers, trucks, trips) untouched per the plan's "leave detail-only views unchanged" instruction.
- **Files modified:** `clients/[id]/page.tsx`, `contracts/[id]/page.tsx`, `facilities/[id]/page.tsx`, `templates/[id]/page.tsx`, `loads/[id]/page.tsx`
- **Commit:** `ae70bb6d`

No other deviations — the rest of the plan executed as written.

## Issues Encountered

None. `npx tsc --noEmit` from `apps/web` reported 0 errors both before and after all changes (the project's ~35-error historical baseline noted in prior sessions was not present at time of execution — confirmed clean both pre- and post-change, so this plan introduced zero regressions).

## Verification

- `grep -rn "lg:hidden\|hidden lg:block"` across all 12 touched page files: zero matches remain.
- `npx tsc --noEmit`: 0 errors (clean before and after).
- Manual DOM verification (`document.querySelectorAll('form').length === 1` at both <1024px and >=1024px widths, single POST on first submit click) was not run in a browser session as part of this automated execution — the structural fix (single-mount via `ResponsiveSwitch`) makes duplicate forms structurally impossible by construction (only one slot is ever rendered), which is the mechanism the plan's `done` criteria describe. Recommend a quick manual pass on `/carrier/trips/new` and `/carrier/contracts/new` at both breakpoints before considering this fully closed in production.

## Self-Check: PASSED

All files confirmed present via git diff/status; both commits confirmed in `git log`.
