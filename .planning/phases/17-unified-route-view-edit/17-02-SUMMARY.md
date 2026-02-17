---
phase: 17-unified-route-view-edit
plan: 02
subsystem: routes
tags: [server-integration, optimistic-locking, backwards-compatibility, searchParams]

dependency_graph:
  requires:
    - 17-01 (client components for view/edit toggle)
  provides:
    - Unified route page wired to server data layer
    - Optimistic locking via version field on updateRoute
    - Backwards compatibility for /routes/[id]/edit URLs
  affects:
    - routes.ts (updateRoute action with version field)
    - routes/[id]/page.tsx (server page now renders RoutePageClient)
    - routes/[id]/edit/page.tsx (redirect to unified page)

tech_stack:
  added:
    - Optimistic locking pattern with Prisma version field
    - Conditional data fetching based on searchParams
    - Server-to-client data handoff pattern
  patterns:
    - searchParams for initial client state determination
    - Conditional driver/truck fetching only in edit mode
    - Version-based concurrent edit protection

key_files:
  created: []
  modified:
    - src/app/(owner)/actions/routes.ts
    - src/app/(owner)/routes/[id]/page.tsx
    - src/app/(owner)/routes/[id]/edit/page.tsx

decisions:
  - Used searchParams to determine initial edit mode (server-side decision)
  - Fetch drivers/trucks conditionally only when in edit mode for performance optimization
  - Version field is optional in updateRoute for backwards compatibility with existing route forms
  - Prisma P2025 error code indicates version mismatch (optimistic locking conflict)
  - Keep old /routes/[id]/edit page as redirect rather than removing (preserves bookmarks)

metrics:
  duration: 220s
  tasks_completed: 2
  files_created: 0
  files_modified: 3
  commits: 2
  completed_date: 2026-02-17
---

# Phase 17 Plan 02: Wire Unified Route Page with Optimistic Locking Summary

**One-liner:** Connected RoutePageClient to server data layer with searchParams-driven edit mode, added optimistic locking via version field to prevent concurrent edits, and replaced old edit page with backwards-compatible redirect.

## What Was Built

Integrated the client components from Plan 01 with the server-side route page, added concurrent edit protection via optimistic locking, and ensured backwards compatibility for the old edit route URL.

### Key Changes

1. **Modified `src/app/(owner)/actions/routes.ts`**
   - Added optimistic locking to `updateRoute` action using Route.version field
   - Version field is parsed from FormData and checked during update
   - If version mismatch occurs (P2025 error), returns user-friendly error message
   - Backwards compatible: if no version field provided, updates without version check
   - Version is incremented on successful update

2. **Modified `src/app/(owner)/routes/[id]/page.tsx`**
   - Added `searchParams` to props interface with `mode?: string` parameter
   - Reads `mode === 'edit'` to determine initial edit mode
   - Conditionally fetches drivers and trucks ONLY when in edit mode (performance optimization)
   - Replaced entire JSX body with `<RoutePageClient>` component
   - Passes all server-fetched data as props to client wrapper
   - Removed unused imports (Link, ArrowLeft, Pencil, all section components)

3. **Modified `src/app/(owner)/routes/[id]/edit/page.tsx`**
   - Replaced entire file with simple redirect to `/routes/[id]?mode=edit`
   - Preserves backwards compatibility for bookmarks and existing links
   - Removed all data fetching and rendering logic

## Technical Implementation

### Optimistic Locking Flow

1. RouteEditSection injects `version` field via RouteForm's `extraHiddenFields` prop
2. FormData includes current version number when submitting
3. updateRoute parses version from FormData
4. Prisma update uses `where: { id, version: currentVersion }`
5. On success, version is incremented: `version: { increment: 1 }`
6. On P2025 error (record not found = version mismatch), returns helpful error

### Conditional Data Fetching

```typescript
if (isEditMode) {
  const prisma = await getTenantPrisma();
  [drivers, trucks] = await Promise.all([
    prisma.user.findMany({ where: { role: 'DRIVER', isActive: true }, ... }),
    prisma.truck.findMany({ ... }),
  ]);
}
```

Only fetches driver/truck lists when mode=edit, avoiding unnecessary DB queries in view mode.

### Server-to-Client Handoff

Server page:
- Fetches all data (route, documents, expenses, payments, categories, templates, analytics)
- Formats dates in tenant timezone
- Conditionally fetches drivers/trucks
- Passes everything as props to RoutePageClient

Client wrapper:
- Manages edit mode state
- Syncs URL state with mode
- Renders appropriate sections based on mode
- Handles dirty tracking and unsaved changes warnings

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

### TypeScript Compilation
- `npx tsc --noEmit`: PASSED

### Production Build
- `npm run build`: PASSED
- All routes compiled successfully
- `/routes/[id]/edit` still appears in build (as redirect page)

### Code Verification
- updateRoute action includes version-based optimistic locking: VERIFIED
- Server page accepts searchParams with mode parameter: VERIFIED
- Drivers/trucks fetched conditionally only in edit mode: VERIFIED
- Old edit page redirects to unified page with ?mode=edit: VERIFIED
- No broken imports across codebase: VERIFIED

## Key Decisions

1. **Conditional data fetching** - Only fetch drivers/trucks in edit mode to avoid unnecessary DB queries in view mode (performance optimization)

2. **Backwards-compatible version field** - Made version field optional in updateRoute action to maintain compatibility with existing route forms (e.g., route creation, bulk updates)

3. **P2025 error handling** - Used Prisma error code P2025 to detect version mismatch and return user-friendly error message instead of generic failure

4. **Redirect over deletion** - Kept old edit page as redirect rather than deleting to preserve bookmarks and existing links (backwards compatibility)

5. **searchParams pattern** - Used searchParams to determine initial edit mode server-side, avoiding client-side URL parsing

## Integration Points

- Unified route page now works in both view and edit modes via URL param
- Old /routes/[id]/edit URLs seamlessly redirect to unified page
- updateRoute action protects against concurrent edits via version field
- All existing route functionality preserved (view, status transitions, expenses, payments, documents)

## Next Steps

This completes Phase 17. The unified route view/edit page is now fully functional with:
- Client-side mode toggling without page navigation
- Optimistic locking to prevent concurrent edit conflicts
- Backwards compatibility for old edit page URLs
- Performance optimizations for conditional data fetching

## Commits

- `7cb3fda`: feat(17-02): wire unified route page with optimistic locking
- `2d4e812`: feat(17-02): replace old edit page with redirect to unified page

## Self-Check: PASSED

All modified files verified:
- src/app/(owner)/actions/routes.ts: EXISTS
- src/app/(owner)/routes/[id]/page.tsx: EXISTS
- src/app/(owner)/routes/[id]/edit/page.tsx: EXISTS

All commits verified:
- 7cb3fda: FOUND
- 2d4e812: FOUND
