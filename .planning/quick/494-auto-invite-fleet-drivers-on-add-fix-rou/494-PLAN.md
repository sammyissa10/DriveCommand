---
phase: quick-494
plan: 494
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx
  - apps/web/tests/unit/carrier/create-driver-invite-optin.test.ts
  - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
  - apps/web/src/components/routes/route-form.tsx
autonomous: true
gap_closure: false

must_haves:
  truths:
    - "Adding a fleet driver with an email sends a portal invitation by default (no explicit opt-in required)"
    - "An owner can still opt OUT of the invite by unchecking the control on the Add Driver form"
    - "InviteDriverSheet still sends exactly one invite (unchanged)"
    - "The New Route driver picker no longer dead-ends: the empty state links to Add Driver"
    - "Submitting the mobile New Route form with missing required fields surfaces native validation instead of failing silently"
    - "npx next build succeeds from apps/web"
  artifacts:
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "createCarrierDriver invite gate flipped to default-on"
      contains: "sendInvite !== false"
    - path: "apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx"
      provides: "Actionable driver empty-state + reportValidity submit guard"
    - path: "apps/web/src/components/routes/route-form.tsx"
      provides: "Actionable driver empty-state link"
  key_links:
    - from: "CarrierDriverForm.tsx / DriverCreateMobile.tsx"
      to: "createCarrierDriver invite gate"
      via: "sendInvite defaults ON so add-with-email invites by default"
      pattern: "useState\\(true\\)"
    - from: "RouteCreateMobile NavHeader Create button"
      to: "form native validation"
      via: "reportValidity() before requestSubmit()"
      pattern: "reportValidity"
---

<objective>
Make freshly-added fleet drivers reachable for route assignment WITHOUT creating ghost Users, and remove the route-form dead-ends that made this invisible to owners.

Two required deliverables + one optional display-only nicety:
1. Auto-invite on fleet Add Driver when an email is present (lean on the EXISTING DriverInvitation machinery already in createCarrierDriver — do NOT create Supabase Auth users or bare Prisma User rows).
2. Fix the New Route driver picker dead-ends (actionable empty-state copy + link; surface native validation on the mobile programmatic submit).
3. (Optional, conditional) Show invite/active status on the fleet drivers list — include ONLY if it is a small display-only change; otherwise document as a follow-up.

Purpose: Diagnosis established Route.driverId → User(role=DRIVER), and Users only exist after a DriverInvitation is ACCEPTED. Auto-inviting on add starts that clock automatically, and the route form now points owners at the right action instead of silently failing.
Output: One conditional flip + form default changes, route-form UX fixes, updated unit test.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Behavior-change background (READ — this REVERSES part of quick-484)
# quick-484 made the invite OPT-IN (`if (email && sendInvite === true)`) and set BOTH
# Add-Driver forms to default the checkbox UNCHECKED, passing an EXPLICIT `false`.
# quick-494 flips the DEFAULT to on. Because the forms currently pass explicit `false`,
# flipping ONLY the lib gate would leave the main Add-Driver forms still NOT inviting.
# To honor the product goal ("adding a fleet driver with an email now emails them an
# invite") AND keep the opt-out, the two form defaults must also flip to ON.

# Files to edit (inspect before editing — line numbers approximate)
@apps/web/src/lib/carrier/fleet-drivers.ts
@apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
@apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx
@apps/web/tests/unit/carrier/create-driver-invite-optin.test.ts
@apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
@apps/web/src/components/routes/route-form.tsx

# Caller inspection findings (already verified during planning — confirm still true)
# - API POST apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts: passes parsed.data
#   straight through; sendInvite is optional in its Zod schema. Omit → undefined → now sends.
#   NO CHANGE NEEDED.
# - InviteDriverSheet.tsx: sends `sendInvite: true`. Unchanged behavior. NO CHANGE NEEDED.
# - CarrierDriverForm.tsx (desktop): `useState(false)`, on create always passes an explicit
#   boolean via `...(!isEdit ? { sendInvite } : {})`. Must flip default to `true`.
# - DriverCreateMobile.tsx (mobile-web): `useState(false)`, always passes `sendInvite,`.
#   Must flip default to `true`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Auto-invite on fleet Add Driver (flip gate + form defaults + test)</name>
  <files>
    apps/web/src/lib/carrier/fleet-drivers.ts
    apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx
    apps/web/tests/unit/carrier/create-driver-invite-optin.test.ts
  </files>
  <action>
    A. lib/carrier/fleet-drivers.ts — createCarrierDriver invite gate (~line 286):
       Change `if (email && sendInvite === true) {` to `if (email && sendInvite !== false) {`.
       Keep the ENTIRE invitation body unchanged (cancel prior PENDING via updateMany,
       create DriverInvitation, fetch tenant name, build acceptUrl, sendDriverInvitation,
       emailSent/emailWarning returns). Do NOT touch the "link to existing User by email"
       block (~lines 264-283) — if the email already belongs to a DRIVER User in this org it
       links; the invite still firing is harmless (invitation acceptance is idempotent per
       quick-480). Do NOT create Supabase Auth users or bare Prisma User rows.

    B. Flip the two Add-Driver form defaults so "Add Driver with email" invites BY DEFAULT
       (this is the intended product change; opt-out preserved):
       - CarrierDriverForm.tsx (~line 93): `useState(false)` → `useState(true)` for sendInvite.
         Update caption (~line 427) from "Off by default. You can send it later from the
         driver's profile." to on-by-default copy, e.g. "On by default — the driver gets an
         email invite to the portal. Uncheck to add them without inviting yet."
         The `...(!isEdit ? { sendInvite } : {})` create payload stays as-is (still passes the
         explicit boolean; true when checked, false when opted out).
       - DriverCreateMobile.tsx (~line 97): `useState(false)` → `useState(true)` for sendInvite.
         Update caption (~line 242) similarly. The `sendInvite,` body field stays as-is.

    C. Do NOT change InviteDriverSheet.tsx (already sends true) or the API route
       (passes through). Confirm during execution these are still true; if either changed,
       note it and keep their invite-on behavior.

    D. Update the existing unit test create-driver-invite-optin.test.ts to the new default-on
       semantics (rename the describe/wording away from "opt-in" to "default-on"):
       - Test A: sendInvite=false → still no invite (KEEP).
       - Test B: sendInvite OMITTED → NOW sends invite + creates DriverInvitation (INVERT the
         assertions; set up prisma.tenant.findUnique mock like Test C so the email path runs).
       - Test C: sendInvite=true → sends (KEEP).
       Keep the "existing User → link, no double-provision" behavior out of scope unless a
       cheap assertion is trivial.
  </action>
  <verify>
    npx vitest run apps/web/tests/unit/carrier/create-driver-invite-optin.test.ts (3/3 pass).
    Grep confirms `sendInvite !== false` present in fleet-drivers.ts and `useState(true)` in
    both forms.
  </verify>
  <done>
    Adding a fleet driver with an email sends exactly one invite by default; unchecking the
    control opts out (passes false → no invite); InviteDriverSheet and the API route behave
    exactly as before; the unit test reflects default-on and passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix New Route driver dead-ends (mobile-web + desktop)</name>
  <files>
    apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
    apps/web/src/components/routes/route-form.tsx
  </files>
  <action>
    A. RouteCreateMobile.tsx empty-state (~lines 438-442): replace the "Invite drivers first
       before creating routes." warning with actionable copy + a client-nav link/button to
       /carrier/fleet/drivers/new, e.g. "No drivers can be assigned yet. Add a driver with an
       email to invite them, then assign once they accept." plus a link/button "Add a driver".
       Use this file's existing patterns — it already uses useRouter (router.push for Cancel);
       either a next/link <Link> or a small onClick={() => router.push('/carrier/fleet/drivers/new')}
       is fine. Keep the ds warning/text styling already used (text-ds-warning / ds field
       classes). Do not restructure the select.

    B. RouteCreateMobile.tsx NavHeader "Create" button (~line 191): it calls
       `formRef.current?.requestSubmit()` programmatically, which bypasses native validation
       feedback. Change to guard: `if (formRef.current?.reportValidity()) formRef.current.requestSubmit();`
       so required-field validation surfaces visibly instead of silently blocking. The in-form
       PrimaryButton/type=submit path validates natively already — only this programmatic
       NavHeader path needs the guard (verify the in-form submit is a native submit button; if
       it is, leave it).

    C. route-form.tsx (desktop) empty-state (~lines 490-494): same actionable copy + link to
       /carrier/fleet/drivers/new, using this file's styling (text-amber-600 / text-sm). This
       file does not currently import Link or useRouter — add `import Link from 'next/link'`
       (it is already a client component via useActionState) and render a <Link> styled
       inline. No submit change needed here — the desktop submit is a native
       <button type="submit"> so validation already surfaces.
  </action>
  <verify>
    npx next build from apps/web succeeds. Grep confirms `reportValidity` present in
    RouteCreateMobile.tsx and `/carrier/fleet/drivers/new` referenced in both route files.
    No remaining literal "Invite drivers first before creating routes." string.
  </verify>
  <done>
    Both route forms show actionable empty-state copy linking to Add Driver; the mobile New
    Route Create button surfaces native validation via reportValidity() before submitting.
  </done>
</task>

<task type="auto">
  <name>Task 3 (OPTIONAL, conditional): Invite/active status on fleet drivers list</name>
  <files>
    apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/DriversGrid or columns.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/DriversMobile.tsx
  </files>
  <action>
    Assess FIRST, then decide (bias toward keeping this quick task quick — Tasks 1 & 2 are the
    required deliverables):
    - listCarrierDrivers already includes the linked `user` (email, isActive). Derive a simple
      status: linked active DRIVER user → "Active"; userId null → "Invited · pending"
      (post-Task-1, a roster driver added with an email now has a PENDING DriverInvitation, so
      "no user yet" reliably means invited/awaiting acceptance).
    - If this is a SMALL, display-only change deriving the badge from the EXISTING `user` field
      with edits to at most the page derivation + one grid column + one mobile row component,
      and NO new query joins/DriverInvitation lookups: implement it.
    - If distinguishing "Invited · pending" from "roster-only" would require adding
      DriverInvitation joins or restructuring the query, or touches multiple components
      significantly: DO NOT implement. Instead document it as a follow-up in the SUMMARY (and
      note the two-state derivation available from `user` presence for a future pass).
  </action>
  <verify>
    If implemented: npx next build succeeds and the drivers list shows Active vs
    Invited · pending. If deferred: SUMMARY documents the follow-up with rationale.
  </verify>
  <done>
    Either a small display-only status badge ships, or the follow-up is clearly documented —
    with no query restructuring and no scope creep beyond a quick task.
  </done>
</task>

</tasks>

<verification>
- npx next build from apps/web passes (the authoritative gate — not just tsc --noEmit).
- npx tsc --noEmit introduces no NEW errors in touched files (baseline ~35 pre-existing).
- npx vitest run on the updated invite-gate test passes (3/3).
- Manual sanity: adding a fleet driver with an email (default control state) triggers one
  invitation email; unchecking opts out; New Route empty state links to Add Driver.
</verification>

<success_criteria>
- createCarrierDriver invites by default when an email is present (`sendInvite !== false`),
  with NO Supabase Auth / Prisma User rows created and the accept-invitation flow untouched.
- Both Add-Driver forms default the invite ON with an opt-out; InviteDriverSheet + API route
  unchanged; no double-send.
- Both New Route forms have actionable driver empty states linking to Add Driver; the mobile
  Create button surfaces native validation.
- Task 3 either shipped as a small display-only change or documented as a follow-up.
- npx next build succeeds; invite-gate unit test passes.
- Explicitly NOT touched: listDrivers(), createRoute, Route/User Prisma schema,
  accept-invitation flow.
</success_criteria>

<output>
After completion, create `.planning/quick/494-auto-invite-fleet-drivers-on-add-fix-rou/494-SUMMARY.md`.
Suggested atomic commits (planner's discretion): (1) auto-invite gate + form defaults + test;
(2) route form dead-ends; (3) optional invite-status or follow-up note.
Do NOT push — commit only (per project workflow).
</output>
