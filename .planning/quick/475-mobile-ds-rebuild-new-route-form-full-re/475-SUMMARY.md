---
phase: quick-475
plan: 475
subsystem: ui
tags: [nextjs, react, useActionState, server-actions, mobile-design-system, tailwind, route-form]

# Dependency graph
requires:
  - phase: quick-470
    provides: listCarrierTrucks (carrier trucks feeding the truck picker)
  - phase: quick-474
    provides: mobile-web ds create-form pattern (ClientCreateMobile / DriverCreateMobile precedent)
provides:
  - RouteCreateMobile.tsx — full mobile-ds rebuild of the New Route form, submitting via the createRoute server action
  - lg:hidden / hidden lg:block wrapper pattern applied to routes/new/page.tsx
  - New Dispatch Quick Create item repointed to its real create route
affects: [mobile-design-system-audit, quick-create-menu]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Real <form action={formAction}> + useActionState for mobile ds forms that must share a desktop server action's exact FormData contract (vs. the fetch/JSON POST pattern used by simpler carrier create forms)"
    - "NavHeader right button triggers formRef.current?.requestSubmit() to submit a form it isn't visually nested inside"
    - "Controlled visible inputs mirrored into separate hidden name={...} inputs for array/index-based FormData fields (stops_<i>_*), ported verbatim from RouteForm"

key-files:
  created:
    - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
  modified:
    - apps/web/src/app/(owner)/routes/new/page.tsx
    - apps/web/src/components/quick-actions/quickActions.config.ts

key-decisions:
  - "createRoute cast to (prevState: ActionState | null, formData: FormData) => Promise<ActionState> when passed to useActionState — TS otherwise infers the action's own return-type union (which includes a truckId field from an unrelated overload) instead of the shared ActionState contract that route-form.tsx's action prop already relaxes to"
  - "Stop type select stays a small ds-styled inline control (h-[38px]) rather than the full 46px field height — it sits beside reorder/remove icon buttons in a single row and doesn't need full field-line height"

patterns-established:
  - "Mobile ds forms wrapping an existing server action reuse ALL of that action's controlled-state + hidden-mirror-input logic verbatim; only the JSX markup and class names are restyled to ds tokens"

# Metrics
duration: ~12min
completed: 2026-07-18
---

# Quick Task 475: Mobile DS Rebuild — New Route Form + New Dispatch Href Fix Summary

**Full mobile-web ds rebuild of /routes/new (route name, address autocomplete, live OSRM distance badge, multi-stop editor, driver/truck/co-driver pickers, notes) submitting through the exact same createRoute server action as desktop, plus a one-line fix repointing the New Dispatch Quick Create item to its real create route.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-18
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `/routes/new` now renders the mobile-web design system at phone widths instead of falling back to the legacy desktop `RouteForm` — the last remaining Quick Create destination that hadn't been migrated
- Route creation on mobile submits through `createRoute` with the byte-identical FormData contract desktop uses (including the `carrierTruckId` vs `truckId` naming trap called out in the plan), so behavior — validation, driver conflict checks, redirect to `/routes/{id}` — matches desktop exactly
- Desktop `/routes/new` (lg+) is untouched — `new-route-client.tsx` and `route-form.tsx` were not modified
- The New Dispatch Quick Create menu item now opens `/carrier/trips/new` (the actual create form) instead of the non-functional `/carrier/dispatches` link

## Task Commits

Each task was committed atomically:

1. **Task 1: Build RouteCreateMobile + wire it into page.tsx via lg:hidden wrapper** - `7111c2d1` (feat)
2. **Task 2: Repoint New Dispatch Quick Create item to /carrier/trips/new** - `3158758c` (fix)

## Files Created/Modified
- `apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx` (new, 512 lines) - Mobile ds restyle of RouteForm's create path: same React state (originCoords/destCoords/stopCoords/distance/distanceLoading/selectedDriverId/coDriverIds/stops), same effects (OSRM distance fetch), same handlers (addStop/removeStop/moveStopUp/moveStopDown/updateStop/toggleCoDriver), submits via `useActionState(createRoute, ...)` through a real `<form action={formAction}>`
- `apps/web/src/app/(owner)/routes/new/page.tsx` - Added `lg:hidden -m-4` wrapper around `RouteCreateMobile` and `hidden lg:block space-y-6` wrapper around the existing desktop heading + `NewRouteClient` card; server-side data loading (`requireTenantId`, `listDrivers`, `listCarrierTrucks`) unchanged
- `apps/web/src/components/quick-actions/quickActions.config.ts` - `create-dispatch` item `href` changed from `/carrier/dispatches` to `/carrier/trips/new`; removed the stale "Dispatch creation uses a modal" TODO comment

## Decisions Made
- Cast `createRoute` to the shared `ActionState`-based action signature when calling `useActionState` — passing it raw produced a TS2769 overload mismatch because TypeScript inferred `createRoute`'s literal return-type union (which carries an unrelated `truckId` field from a different validation branch) instead of the looser `ActionState` contract that `route-form.tsx`'s `action` prop type already uses. This is the same relaxation `RouteForm` gets implicitly via its typed prop; RouteCreateMobile needed it explicit since it calls `createRoute` directly.
- Kept the exact hidden-input-mirrors-controlled-state pattern from `route-form.tsx` for stops (visible ds-styled select/inputs update React state; separate `<input type="hidden">` elements carry the actual `name` attributes read by `createRoute`'s FormData parser) — this is the only way to keep per-stop `type`/`scheduledAt`/`notes`/`lat`/`lng` submitting correctly while giving the stop card ds-native form controls.

## Deviations from Plan

None - plan executed exactly as written. The `createRoute` cast was anticipated by the plan's own "cross-check every FormData key" instruction and resolved as a straightforward TypeScript typing fix (Rule 3 — blocking issue), not a scope change.

## Issues Encountered
- Initial `tsc --noEmit` run flagged a TS2769 overload-mismatch on the `useActionState(createRoute, ...)` call (createRoute's inferred return type includes a `truckId` field from an unrelated code path, and TS rejected the plain `{ success: false }` initial state against that narrower union). Fixed by explicitly casting `createRoute` to `(prevState: ActionState | null, formData: FormData) => Promise<ActionState>` — the same relaxed signature `route-form.tsx`'s `action` prop already declares. Re-ran `tsc --noEmit`: zero errors, confirming no new errors were introduced in either touched file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All Quick Create destinations now render the mobile-web design system at phone widths; the mobile-design-system audit's "last remaining legacy page" gap is closed.
- No blockers for future work. If a future audit revisits Quick Create hrefs, note `action-assign-driver` / `action-send-rate-confirmation` / `action-mark-delivered` in `QUICK_ACTION_ITEMS` still point at list pages (`/carrier/loads`) rather than deep-linked actions — out of scope for this task but a candidate for a future quick task.

---
*Phase: quick-475*
*Completed: 2026-07-18*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (7111c2d1, 3158758c) verified present in git log.
