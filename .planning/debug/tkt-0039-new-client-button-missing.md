---
status: diagnosed
trigger: "tkt-0039-new-client-button-missing — Can't add a new client, no button available on /carrier/clients (iPad Safari)"
created: 2026-05-20T00:00:00Z
updated: 2026-05-20T00:00:00Z
---

## Current Focus

hypothesis: RBAC role gate hides "New Client" button from all MANAGER-role users regardless of their permissions
test: Checked DB for noorshadeed25@gmail.com role + checked ClientList.tsx render guard
expecting: Confirmed — `role !== 'MANAGER'` is false for this user, so button is never rendered
next_action: DONE — root cause confirmed, diagnostic complete

## Symptoms

expected: A "New Client" button should be visible and clickable on /carrier/clients for users with the appropriate role
actual: The button is not visible at all. Screenshot shows iPad-sized viewport with bottom Safari dock.
errors: None reported — the button simply doesn't appear
reproduction: Navigate to /carrier/clients on iPad Safari (portrait ~768px, landscape ~1024px) as noorshadeed25@gmail.com
started: Reported May 16, 2026 by noorshadeed25@gmail.com (Nadeem's Testing tenant). Unknown if it ever worked.

## Eliminated

- hypothesis: Responsive CSS hides "New Client" at iPad-class widths
  evidence: Button className is `inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors` — no `hidden`, no `sm:`, `md:`, `lg:`, or `xl:` responsive visibility modifiers. The wrapper div uses `sm:ml-auto` only for alignment, not visibility. The parent container uses `flex flex-col sm:flex-row gap-3` — no hiding at any breakpoint.
  timestamp: 2026-05-20

- hypothesis: Layout overflow pushes the button off-screen at 768–1024px
  evidence: The filter row is `flex flex-col sm:flex-row gap-3` — it stacks vertically on mobile and flows into a row on sm+. The button wrapper is `sm:ml-auto`. No fixed widths, no overflow:hidden on the parent that would clip a rendered button. Since the button is never rendered at all (DOM absent), overflow cannot be the cause.
  timestamp: 2026-05-20

- hypothesis: The page genuinely doesn't render a New Client button on mobile/tablet breakpoints at all
  evidence: There are no breakpoint-conditional renders. The page is server-rendered and the button would appear in the HTML at ALL breakpoints if the role check passes. The conditional is not viewport-based.
  timestamp: 2026-05-20

## Evidence

- timestamp: 2026-05-20
  checked: apps/web/src/components/carrier/clients/ClientList.tsx line 72
  found: `{role !== 'MANAGER' && (` wraps the entire New Client button. Role is passed as `session.role` from the server page.
  implication: Any user with role === 'MANAGER' will NEVER see the button, regardless of their permissions.

- timestamp: 2026-05-20
  checked: Database query — SELECT id, email, role, "tenantId", "isActive" FROM "User" WHERE email = 'noorshadeed25@gmail.com'
  found: role = 'MANAGER', isActive = true, tenantId = '61c48b49-a406-4f2c-8be9-8bae758be415'
  implication: The role check `role !== 'MANAGER'` evaluates to `false` — button is not rendered.

- timestamp: 2026-05-20
  checked: Database query — SELECT permissions FROM "User" WHERE email = 'noorshadeed25@gmail.com'
  found: permissions = { "clients": true, "fullAccess": true, ... all keys true }
  implication: This MANAGER has both fullAccess: true and clients: true — the permissions system grants full create access, but the button render guard ignores permissions entirely.

- timestamp: 2026-05-20
  checked: apps/web/src/lib/auth/permissions.ts — hasPermission() and getPermissions()
  found: MANAGER with fullAccess: true or clients: true should have create-client access per the permissions design. The system explicitly supports MANAGER having this ability.
  implication: The button's role guard is INCONSISTENT with the permissions system design. A MANAGER with fullAccess should see the button.

- timestamp: 2026-05-20
  checked: apps/web/src/components/carrier/clients/ClientList.tsx — all className strings
  found: No `hidden`, `sm:hidden`, `md:hidden`, `lg:hidden`, `xl:hidden` classes on any element in the file.
  implication: Responsive CSS is definitively NOT the cause.

- timestamp: 2026-05-20
  checked: Grep for `role !== 'MANAGER'` across apps/web/src
  found: Same pattern in ClientDetail.tsx line 495 and ContractList.tsx line 105 — both also hide create/edit actions from all MANAGERs
  implication: The overly-broad MANAGER exclusion is a systemic pattern, not isolated to ClientList.

## Resolution

root_cause: |
  ClientList.tsx line 72 has a blanket render guard `{role !== 'MANAGER' && (...New Client button...)}` that hides the button from ALL users with role === 'MANAGER', regardless of their permissions. noorshadeed25@gmail.com has role = 'MANAGER' in the database, so the condition is always false and the button is never rendered.

  The user's permissions record has `clients: true` and `fullAccess: true`, meaning the permissions system DOES grant them create access to clients — but the button render guard completely ignores permissions. This is a design inconsistency between the RBAC permissions system (which supports granular MANAGER access) and the UI guard (which uses a role-only exclusion).

fix: |
  NOT APPLIED — diagnose only mode.
  Recommended fix: Replace `role !== 'MANAGER'` with a permission-aware check. The button should be shown to:
  - OWNER: always
  - MANAGER: only if permissions.clients !== false (i.e., `hasPermission(permissions, 'clients', role)`)
  The `hasPermission()` helper in permissions.ts already implements this logic correctly.

verification: not applied
files_changed: []
