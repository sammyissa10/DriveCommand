---
status: resolved
trigger: "tkt-0039-carrier-role-gate-audit"
created: 2026-05-20T00:00:00Z
updated: 2026-05-20T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — carrier UI has multiple role-string gates that bypass granular User.permissions JSON
test: Grepped all carrier components and app routes for role-string conditionals
expecting: Full inventory table
next_action: COMPLETE — findings below

## Symptoms

expected: All carrier UI affordances should respect User.permissions JSON column
actual: ClientList.tsx:72, ClientDetail.tsx:495, ContractList.tsx:105 use raw role-string comparisons
errors: None — proactive audit
reproduction: Grep apps/web/src/components/carrier/ and apps/web/src/app/(owner)/carrier/ for role-string comparisons
started: Discovered during TKT-0039 diagnostic on 2026-05-20

## Eliminated

(none — read-only audit)

## Evidence

- timestamp: 2026-05-20
  checked: apps/web/src/lib/auth/permissions.ts
  found: hasPermission(permissions, key, role) function exists; getPermissions() also exists. OWNER always returns true. MANAGER defaults all-true, returns false only if key is explicitly false. fullAccess bypasses all granular checks.
  implication: Gold-standard pattern exists — just not applied in carrier components

- timestamp: 2026-05-20
  checked: apps/web/src/lib/auth/supabase.ts — SessionData interface
  found: session.permissions is typed as UserPermissions | undefined — available from getSession() without any extra DB calls
  implication: Server pages/components can pass session.permissions to client components at zero extra cost

- timestamp: 2026-05-20
  checked: ClientList.tsx:72, ContractList.tsx:105
  found: Both use `role !== 'MANAGER'` to hide "New X" link button. role prop is passed as session.role. No permissions prop passed.
  implication: A MANAGER with clients:true (default) cannot create clients/contracts — wrong

- timestamp: 2026-05-20
  checked: ClientDetail.tsx:495
  found: `role !== 'MANAGER'` hides "New Contract" link on the Contracts tab of client detail. Same pattern as above.
  implication: Same manager exclusion bug — MANAGER with contracts:true is blocked

- timestamp: 2026-05-20
  checked: StopTimelineCard.tsx:173–178, StopDocumentList.tsx:72–76
  found: Both define isOwnerOrManager = userRole === 'owner' || userRole === 'OWNER' || userRole === 'manager' || userRole === 'MANAGER'. Used to gate (a) Skip Stop button and (b) Delete document button.
  implication: These ARE correct in concept (MANAGER should have these actions) but the pattern is pure role-string, no permissions check. A future restriction of "dispatches" permission would not prevent skip/delete actions.

- timestamp: 2026-05-20
  checked: fleet/drivers/[id]/page.tsx:65–66
  found: canEdit = role === 'SYSTEM_ADMIN' || role === 'OWNER'; canMarkPaid = role === 'SYSTEM_ADMIN' || role === 'OWNER' || role === 'MANAGER'. Passed to BonusesTab (canEdit, canMarkPaid) and DeductionsTab (canEdit).
  implication: MANAGER cannot edit driver bonuses/deductions even if they have carrierDrivers:true. canEdit is intentionally OWNER-only for financial record edits — may be by design but not permission-aware.

- timestamp: 2026-05-20
  checked: driver-pay/settlements/page.tsx:112
  found: (role === UserRole.OWNER || role === UserRole.SYSTEM_ADMIN) gates ExportPayrollButton (payroll CSV export)
  implication: Intentionally OWNER-only — billing/payroll export is a privileged operation. Correct to remain role-only.

- timestamp: 2026-05-20
  checked: driver-pay/settlements/generate/page.tsx:31
  found: role !== UserRole.OWNER && role !== UserRole.SYSTEM_ADMIN — redirects MANAGER away from generate-settlements page
  implication: Generate Settlements is OWNER-only — intentional financial control. Correct to remain role-only.

- timestamp: 2026-05-20
  checked: driver-pay/pending, driver-pay/settlements, driver-pay/reports, driver-pay/reports/[driverId], stops/[id]
  found: All use isOwnerOrManager / isManagerOrAbove to gate SERVER-SIDE page access (redirect guards), not JSX affordances.
  implication: These are correct server-side role guards — both OWNER and MANAGER can access. Not permission-gated because driver-pay module does not currently have a per-key permission (driverPayReport covers reports, not the full module). Acceptable as-is.

- timestamp: 2026-05-20
  checked: carrier/layout.tsx:25,30
  found: Redirects DRIVER to /home, redirects non-OWNER/MANAGER to /unauthorized — belt-and-suspenders portal guard
  implication: Correct top-level role gate — not a permissions concern

## Resolution

root_cause: READ-ONLY audit — 4 JSX gates use role-string comparisons that ignore granular User.permissions. No hasPermission calls exist anywhere in carrier components yet. Gold-standard pattern exists in permissions.ts but is unused in carrier UI.
fix: N/A — diagnose_only mode
verification: N/A
files_changed: []

---

## Inventory Table

| File:line | Conditional expression | UI element gated | Perm key | Classification | Notes |
|---|---|---|---|---|---|
| components/carrier/clients/ClientList.tsx:72 | `role !== 'MANAGER'` | "New Client" Link button | `clients` | PERMISSION-AWARE | MANAGER with clients:true should see this |
| components/carrier/contracts/ContractList.tsx:105 | `role !== 'MANAGER'` | "New Contract" Link button | `contracts` | PERMISSION-AWARE | MANAGER with contracts:true should see this |
| app/(owner)/carrier/clients/[id]/ClientDetail.tsx:495 | `role !== 'MANAGER'` | "New Contract" Link on Contracts tab | `contracts` | PERMISSION-AWARE | MANAGER with contracts:true should see this |
| components/carrier/dispatches/StopTimelineCard.tsx:173–179 | `isOwnerOrManager` (role === 'owner'\|'OWNER'\|'manager'\|'MANAGER') | "Skip Stop" AlertDialog trigger button | `dispatches` | PERMISSION-AWARE (future) | Currently correct (all MANAGERs can skip); should become hasPermission(permissions,'dispatches',role) |
| components/carrier/dispatches/StopDocumentList.tsx:72–76,183 | `isOwnerOrManager` (same pattern) | Delete document (Trash2) button on stop docs | `dispatches` | PERMISSION-AWARE (future) | Same as above |
| app/(owner)/carrier/fleet/drivers/[id]/page.tsx:65 | `role === 'SYSTEM_ADMIN' \|\| role === 'OWNER'` | canEdit → BonusesTab + DeductionsTab edit affordances | `carrierDrivers` | ROLE-ONLY (debatable) | Intentionally OWNER-only for financial record editing; MANAGER with carrierDrivers:true excluded |
| app/(owner)/carrier/fleet/drivers/[id]/page.tsx:66 | `role === 'SYSTEM_ADMIN' \|\| role === 'OWNER' \|\| role === 'MANAGER'` | canMarkPaid → BonusesTab "Mark Paid" button | — | ROLE-ONLY (acceptable) | All MANAGERs allowed; no granular perm key needed |
| app/(owner)/carrier/driver-pay/settlements/page.tsx:112 | `role === UserRole.OWNER \|\| role === UserRole.SYSTEM_ADMIN` | ExportPayrollButton (payroll CSV export) | — | ROLE-ONLY (correct) | Billing/payroll export is intentionally OWNER-only |
| app/(owner)/carrier/driver-pay/settlements/generate/page.tsx:31 | `role !== UserRole.OWNER && role !== UserRole.SYSTEM_ADMIN` | Entire generate-settlements page (server redirect) | — | ROLE-ONLY (correct) | Financial operation — OWNER-only by design |
| app/(owner)/carrier/stops/[id]/page.tsx:64 | `session.role !== 'OWNER' && session.role !== 'MANAGER'` | Entire stop detail page (server redirect) | — | ROLE-ONLY (correct) | Portal-level guard — both OWNER and MANAGER should access |
| app/(owner)/carrier/layout.tsx:25,30 | `role === UserRole.DRIVER` / `role !== OWNER && role !== MANAGER` | Entire carrier section (server redirect) | — | ROLE-ONLY (correct) | Top-level portal guard — not permission-gated |
| app/(owner)/carrier/driver-pay/pending/page.tsx:13–19 | `isOwnerOrManager` (server redirect) | Entire pending-pay page | — | ROLE-ONLY (correct) | Both OWNER and MANAGER have access — correct |
| app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx:31–33 | `isManagerOrAbove` (server redirect) | Entire settlement detail page | — | ROLE-ONLY (correct) | Both OWNER and MANAGER have access |
| app/(owner)/carrier/driver-pay/reports/page.tsx:78–80 | `isManagerOrAbove` (server redirect) | Entire driver-pay reports page | — | ROLE-ONLY (correct) | driverPayReport permission covers navigation; page guard correct |
| app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx:75–77 | `isManagerOrAbove` (server redirect) | Entire per-driver report page | — | ROLE-ONLY (correct) | Same as above |
