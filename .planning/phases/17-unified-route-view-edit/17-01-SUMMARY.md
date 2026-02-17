---
phase: 17-unified-route-view-edit
plan: 01
subsystem: routes
tags: [client-components, unsaved-changes, dirty-tracking, mode-toggling, url-state]

dependency_graph:
  requires: []
  provides:
    - useUnsavedChangesWarning hook for browser navigation protection
    - RouteEditSection component with dirty tracking
    - RoutePageClient wrapper with view/edit mode toggling
  affects:
    - route-form.tsx (added extraHiddenFields prop)

tech_stack:
  added:
    - Event delegation pattern for dirty tracking
    - window.history.replaceState for URL state sync
    - beforeunload event for unsaved changes warning
  patterns:
    - Client-side mode toggling without server roundtrip
    - Dirty state tracking via event listeners
    - Optimistic locking preparation via version field injection

key_files:
  created:
    - src/components/routes/use-unsaved-changes-warning.ts
    - src/components/routes/route-edit-section.tsx
    - src/app/(owner)/routes/[id]/route-page-client.tsx
  modified:
    - src/components/routes/route-form.tsx

decisions:
  - Used event delegation (onInput/onChange on wrapper div) for dirty tracking instead of controlled inputs to avoid re-render loops with RouteForm's defaultValue pattern
  - Used window.history.replaceState instead of Next.js router.replace to avoid server roundtrips for URL state sync
  - Added extraHiddenFields prop to RouteForm as backwards-compatible way to inject version field for optimistic locking
  - Kept updateRoute's existing redirect behavior (redirects to /routes/[id] without mode param) which naturally returns to view mode after save
  - Used window.confirm for unsaved changes dialog (simple, effective, matches existing pattern in expenses/payments sections)

metrics:
  duration: 188s
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  commits: 2
  completed_date: 2026-02-17
---

# Phase 17 Plan 01: Client Components for Unified Route View/Edit Summary

**One-liner:** Created client-side foundation for unified route page with unsaved changes protection, dirty tracking via event delegation, and view/edit mode toggling using URL state sync.

## What Was Built

Created three new client components that form the foundation for the unified route view/edit page:

1. **useUnsavedChangesWarning hook** - Browser navigation protection when form has unsaved changes
2. **RouteEditSection component** - Edit mode wrapper with dirty tracking and RouteForm integration
3. **RoutePageClient wrapper** - Main client component with view/edit mode toggling and URL state sync

Also updated RouteForm to accept an `extraHiddenFields` prop for injecting the version field (optimistic locking preparation).

## Technical Implementation

### Hook: useUnsavedChangesWarning

- Takes `isDirty: boolean` parameter
- Adds `beforeunload` event listener only when form is dirty
- Automatically cleans up listener on unmount or when isDirty becomes false
- Uses standard browser warning (custom messages blocked by modern browsers)

### Component: RouteEditSection

- Tracks dirty state via event delegation (input/change events on wrapper div)
- Avoids re-render loops by NOT using controlled inputs (RouteForm uses defaultValue pattern)
- Exposes dirty state to parent via `onDirtyChange` callback
- Pre-fills form with existing route data using `formatForDatetimeInput` utility
- Injects version field via RouteForm's new `extraHiddenFields` prop
- Relies on updateRoute's existing redirect behavior to return to view mode after save

### Component: RoutePageClient

- Manages view/edit mode state with client-side toggles
- Syncs mode to URL using `window.history.replaceState` (no server roundtrip)
- Shows confirmation dialog when canceling edit mode with unsaved changes
- In edit mode: renders RouteEditSection + read-only financial sections for context
- In view mode: renders full detail view (RouteDetail, financials, expenses, payments, files)
- Matches existing route detail page styling exactly

### Pattern: RouteForm Enhancement

- Added optional `extraHiddenFields?: Record<string, string | number>` prop
- Renders hidden inputs for each entry (used for version field injection)
- Backwards compatible - existing usages unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript compilation: PASSED
- All three new files exist and export their main components/hooks
- RouteForm accepts extraHiddenFields prop (backwards compatible)
- No import errors between new files

## Key Decisions

1. **Event delegation for dirty tracking** - Used onInput/onChange listeners on wrapper div instead of controlled inputs to avoid re-render loops with RouteForm's defaultValue pattern (per research Pitfall 3)

2. **window.history.replaceState for URL sync** - Chose this over Next.js router.replace to avoid server roundtrips when toggling mode (per research recommendation)

3. **Kept updateRoute's redirect behavior** - The existing redirect to `/routes/[id]` (without mode param) naturally returns to view mode after save, so no action modification needed

4. **window.confirm for unsaved changes** - Used simple browser confirm dialog, matching existing pattern in expenses/payments sections

5. **extraHiddenFields prop pattern** - Added backwards-compatible prop to RouteForm instead of modifying component internals or using DOM manipulation

## Integration Points

- RoutePageClient will be consumed by the route detail page (plan 02)
- RouteEditSection integrates with existing RouteForm component
- useUnsavedChangesWarning hook is reusable for other forms with unsaved changes protection needs

## Next Steps (Plan 02)

- Modify route detail page server component to pass initialEditMode from searchParams
- Fetch drivers and trucks lists for RouteEditSection dropdowns
- Update updateRoute server action to handle version field for optimistic locking
- Pass all required props to RoutePageClient
- Remove old separate edit page

## Commits

- `6f4d1f6`: feat(17-01): create unsaved changes hook and route edit section
- `dab9ae4`: feat(17-01): create RoutePageClient with view/edit mode toggling

## Self-Check: PASSED

All created files verified:
- src/components/routes/use-unsaved-changes-warning.ts: EXISTS
- src/components/routes/route-edit-section.tsx: EXISTS
- src/app/(owner)/routes/[id]/route-page-client.tsx: EXISTS

All commits verified:
- 6f4d1f6: FOUND
- dab9ae4: FOUND
