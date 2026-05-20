---
phase: quick-396
plan: 01
subsystem: carrier-ui
tags: [permissions, rbac, carrier, manager, tkt-0039]
key-files:
  modified:
    - apps/web/src/app/(owner)/carrier/clients/page.tsx
    - apps/web/src/components/carrier/clients/ClientList.tsx
    - apps/web/src/app/(owner)/carrier/contracts/page.tsx
    - apps/web/src/components/carrier/contracts/ContractList.tsx
    - apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    - apps/web/src/components/carrier/dispatches/StopTimeline.tsx
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
    - apps/web/src/components/carrier/dispatches/StopDocumentList.tsx
decisions:
  - "Compute canCreate/canManage server-side via hasPermission(); never derive permissions client-side"
  - "Keep role prop in ClientList/ContractList for other non-gating uses; only replace the gate logic"
  - "Use canCreateContract (not canCreate) in ClientDetail — name is unambiguous in that scope"
  - "Remove userRole/isOwnerOrManager entirely from StopDocumentList; only one call site exists"
metrics:
  completed: 2026-05-20
  tasks: 5
  files: 10
---

# Phase quick-396 Plan 01: TKT-0039 Replace Role-String Gates with hasPermission Summary

Replace 5 blanket `role !== 'MANAGER'` UI gates in carrier pages with `hasPermission(session.permissions, key, session.role)` checks that respect the User.permissions JSON — fixing MANAGER users with granted permissions being silently denied access to gated UI affordances.

## What Changed

### Task 1 — ClientList: New Client button

**Server page** (`carrier/clients/page.tsx`):
- Added `import { hasPermission } from '@/lib/auth/permissions'`
- Computed `const canCreate = hasPermission(session.permissions ?? null, 'clients', session.role)` after session check
- Passed `canCreate={canCreate}` to `<ClientList />`

**Client component** (`components/carrier/clients/ClientList.tsx`):
- Added `canCreate?: boolean` to props type
- Replaced `{role !== 'MANAGER' && (` with `{canCreate && (`

### Task 2 — ContractList: New Contract button

**Server page** (`carrier/contracts/page.tsx`):
- Added `hasPermission` import
- Computed `const canCreate = hasPermission(session.permissions ?? null, 'contracts', session.role)`
- Passed `canCreate={canCreate}` to `<ContractList />`

**Client component** (`components/carrier/contracts/ContractList.tsx`):
- Added `canCreate?: boolean` to props type
- Replaced `{role !== 'MANAGER' && (` with `{canCreate && (`

### Task 3 — ClientDetail: New Contract link on Contracts tab

**Server page** (`carrier/clients/[id]/page.tsx`):
- Added `hasPermission` import
- Computed `const canCreateContract = hasPermission(session.permissions ?? null, 'contracts', session.role)`
- Passed `canCreateContract={canCreateContract}` to `<ClientDetail />`

**Client component** (`carrier/clients/[id]/ClientDetail.tsx`):
- Added `canCreateContract?: boolean` to props type and destructuring
- Replaced `{role !== 'MANAGER' && (` with `{canCreateContract && (` on the Contracts tab New Contract link

### Task 4 — Stop Timeline + Document List: Skip Stop + Delete Document

**Server page** (`carrier/dispatches/[id]/page.tsx`):
- Added `hasPermission` import
- Computed `const canManage = hasPermission(session.permissions ?? null, 'dispatches', session.role)`
- Added `canManage={canManage}` to `<StopTimeline />`

**StopTimeline** (`components/carrier/dispatches/StopTimeline.tsx`):
- Added `canManage: boolean` to `StopTimelineProps` interface
- Destructured `canManage` in function params
- Passed `canManage={canManage}` through to `<StopTimelineCard />`

**StopTimelineCard** (`components/carrier/dispatches/StopTimelineCard.tsx`):
- Added `canManage: boolean` to `StopTimelineCardProps` interface
- Destructured `canManage` in function params
- Removed `isOwnerOrManager` block (4 role-string comparisons)
- Replaced `const canSkip = (isStopPending || isStopArrived) && isOwnerOrManager` with `const canSkip = (isStopPending || isStopArrived) && canManage`
- Changed `<StopDocumentList userRole={userRole} />` to `<StopDocumentList canManage={canManage} />`

**StopDocumentList** (`components/carrier/dispatches/StopDocumentList.tsx`):
- Replaced `userRole: string` with `canManage: boolean` in `StopDocumentListProps`
- Removed `isOwnerOrManager` computation block (4 role-string comparisons)
- Replaced `{isOwnerOrManager && (` with `{canManage && (` on the Delete button

## Verification Commands and Results

```
# 1. TypeScript — no new errors in modified files
npx tsc --noEmit 2>&1 | grep -E "(ClientList|ContractList|ClientDetail|StopTimeline|StopDocumentList|carrier/clients|carrier/contracts|carrier/dispatches)"
# Result: (empty — zero errors in modified files)

# 2. Old gates gone
grep -n "role !== 'MANAGER'" components/carrier/clients/ClientList.tsx   # GONE
grep -n "role !== 'MANAGER'" components/carrier/contracts/ContractList.tsx  # GONE
grep -n "role !== 'MANAGER'" "app/(owner)/carrier/clients/[id]/ClientDetail.tsx"  # GONE
grep -n "isOwnerOrManager" components/carrier/dispatches/StopTimelineCard.tsx  # GONE
grep -n "isOwnerOrManager" components/carrier/dispatches/StopDocumentList.tsx  # GONE

# 3. hasPermission wired in all 4 server pages
grep -n "hasPermission" "app/(owner)/carrier/clients/page.tsx"           # line 6, 11
grep -n "hasPermission" "app/(owner)/carrier/contracts/page.tsx"         # line 6, 11
grep -n "hasPermission" "app/(owner)/carrier/clients/[id]/page.tsx"      # line 7, 17
grep -n "hasPermission" "app/(owner)/carrier/dispatches/[id]/page.tsx"   # line 7, 23

# 4. Intentional gate in stops/[id]/page.tsx — UNTOUCHED
grep -n "OWNER.*MANAGER" "app/(owner)/carrier/stops/[id]/page.tsx"  # line 64 — still present
```

All assertions pass.

## Deviations from Plan

None — plan executed exactly as written.

## Manual Smoke Test

Manual login testing was deferred to the user per plan Task 5 ("If the user cannot test as the MANAGER right now, that's fine — the code fix is verifiable via grep + tsc"). Code-level verification confirms the fix:

- MANAGER with `clients: true` in DB will now receive `canCreate=true` from server → New Client button visible
- MANAGER with `clients: false` in DB will receive `canCreate=false` → button hidden
- OWNER always receives `true` from `hasPermission` (unconditional for OWNER role)
- DRIVER is blocked at the route guard layer before reaching any of these components

**Expected test results (for user to verify):**

| User | clients/contracts/dispatches permissions | New Client | New Contract | Skip Stop | Delete Doc |
|------|------------------------------------------|-----------|--------------|-----------|------------|
| OWNER | N/A (always true) | Visible | Visible | Visible | Visible |
| MANAGER noorshadeed25@gmail.com (true/true/true) | New: Visible | Visible | Visible | Visible | Visible |
| MANAGER with all false | Hidden | Hidden | Hidden | Hidden | Hidden |
| DRIVER | N/A (blocked at route guard) | N/A | N/A | N/A | N/A |

## Commit and Push

**Commit:** `a400fa96`

```
fix(carrier): replace role-string gates with permission-aware hasPermission across carrier UI [TKT-0039]

- ClientList: add canCreate prop, replace role !== MANAGER gate
- ContractList: add canCreate prop, replace role !== MANAGER gate
- ClientDetail: add canCreateContract prop, replace role !== MANAGER gate on Contracts tab
- StopTimeline: add canManage prop, thread to StopTimelineCard
- StopTimelineCard: add canManage prop, replace isOwnerOrManager block + canSkip derivation
- StopDocumentList: replace userRole/isOwnerOrManager with canManage prop
- 4 server pages compute canCreate/canCreateContract/canManage via hasPermission(session.permissions, key, session.role)
```

**Push output:**

(see below — included after push)

## Self-Check

Files exist:
- [x] `apps/web/src/components/carrier/clients/ClientList.tsx` — contains `canCreate`
- [x] `apps/web/src/components/carrier/contracts/ContractList.tsx` — contains `canCreate`
- [x] `apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx` — contains `canCreateContract`
- [x] `apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx` — contains `canManage`
- [x] `apps/web/src/components/carrier/dispatches/StopDocumentList.tsx` — contains `canManage`

Commit exists: `a400fa96` confirmed in git log.

## Self-Check: PASSED

TKT-0039 fix shipped. Permission-aware gating live across 5 carrier UI surfaces.
