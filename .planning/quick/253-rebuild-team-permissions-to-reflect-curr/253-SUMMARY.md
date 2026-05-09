---
phase: quick-253
plan: "01"
subsystem: auth/permissions
tags: [permissions, rbac, manager, middleware, sidebar, team-permissions]
dependency_graph:
  requires: []
  provides:
    - Route-based permission system with 16 keys covering all Carrier Ops pages
    - Grouped Team Permissions UI with section toggles
    - Middleware enforcement redirecting unauthorized managers to /carrier/dashboard
    - Sidebar permission gating per nav item
  affects:
    - apps/web/src/lib/auth/permissions.ts
    - apps/web/src/middleware.ts
    - apps/web/src/components/navigation/sidebar.tsx
    - apps/web/src/app/(owner)/settings/team-permissions/page.tsx
    - apps/web/src/lib/auth/guards.tsx
    - apps/web/src/app/(owner)/actions/team-permissions.ts
tech_stack:
  added: []
  patterns:
    - Default-all-true permission model (explicit false blocks, missing = allowed)
    - Supabase app_metadata sync on permission save (middleware reads from session)
    - PermissionGuard wrapping individual sidebar items
    - Shared PermissionEditor component for member sheet + invite sheet
key_files:
  created: []
  modified:
    - apps/web/src/lib/auth/permissions.ts
    - apps/web/src/middleware.ts
    - apps/web/src/app/(owner)/actions/team-permissions.ts
    - apps/web/src/app/(owner)/settings/team-permissions/page.tsx
    - apps/web/src/components/navigation/sidebar.tsx
    - apps/web/src/lib/auth/guards.tsx
    - apps/web/src/lib/auth/supabase.ts
    - apps/web/src/app/(owner)/actions/ai-documents.ts
    - apps/web/src/app/(owner)/actions/customers.ts
    - apps/web/src/app/(owner)/actions/expense-categories.ts
    - apps/web/src/app/(owner)/actions/expense-templates.ts
    - apps/web/src/app/(owner)/actions/ifta.ts
    - apps/web/src/app/(owner)/actions/integrations.ts
    - apps/web/src/app/(owner)/actions/invoices.ts
    - apps/web/src/app/(owner)/actions/lane-analytics.ts
    - apps/web/src/app/(owner)/actions/payroll.ts
    - apps/web/src/app/(owner)/actions/profit-predictor.ts
    - apps/web/src/app/(owner)/actions/subscription.ts
decisions:
  - Default-all-true: MANAGER permissions default to true, owner restricts by toggling off (reversed from old all-false default)
  - Legacy server actions: removed requirePermission calls from old routes (payroll, invoices, crm, ifta, lane-analytics, profit-predictor) since those routes are not in the carrier ops system
  - Settings pages (expense categories, templates, integrations) are always accessible to managers — no permission gate
  - Subscription and Team Permissions are owner-only enforced in both middleware and sidebar
  - Supabase app_metadata sync on permission save using admin.auth.admin.listUsers() email lookup
metrics:
  duration: "~35 minutes"
  completed: "2026-04-18"
  tasks_completed: 3
  files_modified: 18
---

# Quick 253: Rebuild Team Permissions to Reflect Current Carrier Ops Pages

Route-based permission system with 16 Carrier Ops keys, default-all-true for managers, full sidebar and middleware enforcement, and a grouped toggle UI with section enable/disable controls.

## What Was Built

### Task 1: Permission Constants & Server Actions
- Replaced 9 legacy `canView*/canManage*` keys with 16 route-based permission keys in `permissions.ts`
- Keys map directly to Carrier Ops routes: `carrierDashboard`, `clients`, `contracts`, `templates`, `dispatches`, `carrierLoads`, `carrierDrivers`, `carrierTrucks`, `facilities`, `revenueReport`, `driverPayReport`, `arAgingReport`, `performanceReport`, `liveMap`, `aiDocuments`
- All defaults set to `true` (manager has full access by default; owner restricts by toggling off)
- Added `PERMISSION_SECTIONS` export with 5 grouped sections for UI rendering
- Added `PERMISSION_LABELS` derived from sections (backward-compat flattened record)
- Updated `PERMISSION_GATED_PATHS` with all 15 carrier route mappings
- Fixed `requirePermission` in `supabase.ts` to use `=== false` check (default-all-true)
- Added Supabase `app_metadata` sync in `updateUserPermissions` so middleware reads fresh permissions
- Added `updatedAt` field to `TeamMember` interface
- Cleaned up `requirePermission` calls in 11 legacy server actions (removed old keys, updated `aiDocuments`)

### Task 2: Middleware, Guards, Sidebar Enforcement
- Added `/carrier` to `OWNER_PATHS` (blocks DRIVER role from carrier routes)
- Added `OWNER_ONLY_PATHS = ['/settings/team-permissions', '/subscription']`
- MANAGER hitting `OWNER_ONLY_PATHS` → redirect to `/carrier/dashboard`
- MANAGER permission denial → redirect to `/carrier/dashboard` (was `/unauthorized`)
- Fixed middleware check to use `=== false` (default-all-true)
- Fixed `PermissionGuard` in `guards.tsx`: missing permissions → show content (not hide)
- Rebuilt sidebar: every Carrier Ops nav item wrapped in `PermissionGuard` with new key
- Fleet and Reports parent groups conditionally shown based on any sub-permission being granted
- Subscription + Team Permissions shown only to OWNER (role check, not permission check)
- Settings pages (expense categories, templates, integrations) always visible to OWNER/MANAGER

### Task 3: Team Permissions UI
- Shared `PermissionEditor` component used in both member permission sheet and invite sheet
- 5 grouped sections with section label and Enable All / Disable All buttons per section
- Master Enable All / Disable All at top of editor
- Individual toggles with optimistic update and revert on error
- Member list badge: "Full access" (16/16), "No access" (0/16), or "X of 16"
- Last updated timestamp per manager (relative: Today, Yesterday, N days ago, or date)
- Invite sheet: all permissions default to true, uses same grouped layout
- Info card: "Support and Settings are always accessible" + "Team Permissions and Subscription are owner-only"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Legacy server actions used old permission keys**
- **Found during:** Task 1
- **Issue:** 11 server actions called `requirePermission()` with old keys (`canViewPayroll`, `canViewInvoices`, `canViewCRM`, `canViewIFTA`, `canManageSettings`, `canViewBilling`, `canViewLaneAnalytics`, `canViewProfitPredictor`) that no longer exist in the new `UserPermissions` interface. This caused TypeScript errors.
- **Fix:** Removed `requirePermission` calls from legacy actions (routes no longer in carrier ops system). Updated `ai-documents.ts` to use new `aiDocuments` key. Removed `requirePermission` from `subscription.ts` (owner-only enforced via middleware + sidebar instead).
- **Files modified:** 10 server action files + `supabase.ts`
- **Commits:** `72b7219`

**2. [Rule 2 - Missing] PermissionEditor optimistic update needed revert-on-error**
- **Found during:** Task 3
- **Issue:** The plan described instant-save but didn't specify revert behavior on error. Added proper revert logic: optimistic update applied immediately, reverted if `updateUserPermissions` throws.
- **Fix:** Track previous permissions before optimistic update, revert on catch.
- **Commit:** `4006b18`

## Self-Check: PASSED

All key files exist. All task commits verified. One JSDoc comment in `supabase.ts` contains an old permission key for documentation purposes — not live code. Zero TypeScript errors.
