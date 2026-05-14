---
phase: 320-phase-41-hotfix-remove-optional-tenantid
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/email/send-driver-invitation.ts
  - apps/web/src/lib/email/send-owner-invitation.ts
  - apps/web/src/lib/email/send-maintenance-reminder.ts
  - apps/web/src/lib/email/send-document-expiry-reminder.ts
  - apps/web/src/lib/email/send-driver-document-expiry-reminder.ts
  - apps/web/src/lib/email/send-fleet-message-notifications.ts
  - apps/web/src/lib/email/customer-notifications.ts
  - apps/web/src/app/(owner)/actions/drivers.ts
  - apps/web/src/app/(owner)/actions/team-permissions.ts
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/app/api/mobile/owner/drivers/invite/route.ts
  - apps/web/src/app/(admin)/actions/tenants.ts
  - apps/web/src/app/(owner)/actions/loads.ts
  - apps/web/src/lib/geofencing/geofence-check.ts
  - apps/web/src/app/(owner)/actions/fleet-messages.ts
autonomous: true

must_haves:
  truths:
    - "Every wrapped sender requires tenantId at the type level — no optional fallback exists"
    - "Every call site of every wrapped sender passes a real tenantId (from tenant context, scope variable, or orgId)"
    - "Dispatcher path runs for every send — legacy fallback only triggers on dispatcher throws"
    - "tsc --noEmit passes after all changes"
    - "npm run build passes locally"
  artifacts:
    - path: "apps/web/src/lib/email/send-driver-invitation.ts"
      provides: "DriverInvitationEmailData with REQUIRED tenantId, no early-return guard"
      contains: "tenantId: string"
    - path: "apps/web/src/lib/email/send-owner-invitation.ts"
      provides: "OwnerInvitationEmailData with REQUIRED tenantId, no early-return guard"
      contains: "tenantId: string"
    - path: "apps/web/src/lib/email/send-maintenance-reminder.ts"
      provides: "MaintenanceReminderProps with REQUIRED tenantId, no early-return guard"
      contains: "tenantId: string"
    - path: "apps/web/src/lib/email/send-document-expiry-reminder.ts"
      provides: "DocumentExpiryReminderProps with REQUIRED tenantId, no early-return guard"
      contains: "tenantId: string"
    - path: "apps/web/src/lib/email/send-driver-document-expiry-reminder.ts"
      provides: "DriverDocumentExpiryReminderProps with REQUIRED tenantId, no early-return guard"
      contains: "tenantId: string"
    - path: "apps/web/src/lib/email/send-fleet-message-notifications.ts"
      provides: "OwnerReplyNotificationParams with REQUIRED tenantId, no early-return guard"
      contains: "tenantId: string"
    - path: "apps/web/src/lib/email/customer-notifications.ts"
      provides: "LoadStatusEmailData with REQUIRED tenantId, no early-return guard"
      contains: "tenantId: string"
  key_links:
    - from: "apps/web/src/app/(owner)/actions/drivers.ts inviteDriver"
      to: "sendDriverInvitation"
      via: "tenantId from session context"
      pattern: "sendDriverInvitation\\([^)]*tenantId"
    - from: "apps/web/src/app/(owner)/actions/team-permissions.ts inviteTeamMember"
      to: "sendDriverInvitation"
      via: "tenantId from session context"
      pattern: "sendDriverInvitation\\([^)]*tenantId"
    - from: "apps/web/src/lib/carrier/fleet-drivers.ts createCarrierDriver"
      to: "sendDriverInvitation"
      via: "orgId passed AS tenantId (same value in this codebase)"
      pattern: "tenantId: orgId"
    - from: "apps/web/src/lib/carrier/fleet-drivers.ts resendCarrierDriverInvitation"
      to: "sendDriverInvitation"
      via: "orgId passed AS tenantId (same value in this codebase)"
      pattern: "tenantId: orgId"
    - from: "apps/web/src/app/api/mobile/owner/drivers/invite/route.ts POST"
      to: "sendDriverInvitation"
      via: "tenantId from mobile token context"
      pattern: "sendDriverInvitation\\([^)]*tenantId"
    - from: "apps/web/src/app/(admin)/actions/tenants.ts createTenant"
      to: "sendOwnerInvitation"
      via: "tenant.id from newly created Tenant row"
      pattern: "tenantId: tenant\\.id"
    - from: "apps/web/src/app/(admin)/actions/tenants.ts resendOwnerInvitation"
      to: "sendOwnerInvitation"
      via: "tenantId function parameter"
      pattern: "sendOwnerInvitation\\([^)]*tenantId"
    - from: "apps/web/src/app/(owner)/actions/loads.ts sendNotificationAndLogInteraction"
      to: "sendLoadStatusEmail"
      via: "tenantId function parameter"
      pattern: "sendLoadStatusEmail\\([^)]*tenantId"
    - from: "apps/web/src/lib/geofencing/geofence-check.ts notifyCustomer"
      to: "sendLoadStatusEmail"
      via: "load.tenantId from loaded Load record"
      pattern: "tenantId: load\\.tenantId"
    - from: "apps/web/src/app/(owner)/actions/fleet-messages.ts"
      to: "sendOwnerReplyNotification"
      via: "user.tenantId from session"
      pattern: "tenantId: user\\.tenantId"
---

<objective>
Hotfix: Make `tenantId` REQUIRED on every Phase 41 Plan 05 wrapped email sender and update every call site to pass it. Right now `tenantId` is optional on 7 wrappers and an `if (!data.tenantId) return legacySend(...)` guard short-circuits the dispatcher on every real send. Result: zero `NotificationSendLog` rows, tenant template customizations have no effect on real emails.

The fail-loud signature is the point. After this hotfix, the TypeScript compiler must force every caller to provide a tenantId.

Purpose: Restore the dispatcher pipeline so per-tenant template customizations actually take effect on production emails (invitations, customer notifications, fleet messages). Surface any missing call site as a TS error rather than silently degrading.

Output: 7 wrapper files with REQUIRED tenantId + no guard, 8 call sites updated to pass tenantId, tsc --noEmit clean, `npm run build` clean.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/lib/email/send-driver-invitation.ts
@apps/web/src/lib/email/send-owner-invitation.ts
@apps/web/src/lib/email/send-maintenance-reminder.ts
@apps/web/src/lib/email/send-document-expiry-reminder.ts
@apps/web/src/lib/email/send-driver-document-expiry-reminder.ts
@apps/web/src/lib/email/send-fleet-message-notifications.ts
@apps/web/src/lib/email/customer-notifications.ts

# Diagnostic Audit (Pre-Plan)

**Wrappers Plan 05 created (commit 8921f6b):**

| Wrapper file | tenantId field | Has guard? | Needs fix? |
|--------------|----------------|------------|------------|
| send-driver-invitation.ts | optional | yes | YES |
| send-owner-invitation.ts | optional | yes | YES |
| send-maintenance-reminder.ts | optional | yes | YES (but no live callers — cron 319-02 calls dispatcher directly) |
| send-document-expiry-reminder.ts | optional | yes | YES (no live callers) |
| send-driver-document-expiry-reminder.ts | optional | yes | YES (no live callers) |
| send-fleet-message-notifications.ts:DriverMessageNotificationParams | REQUIRED | no | NO (already correct) |
| send-fleet-message-notifications.ts:OwnerReplyNotificationParams | optional | yes | YES |
| customer-notifications.ts (LoadStatusEmailData) | optional | yes | YES |
| send-sysadmin-invoice.ts | n/a (takes invoiceId, looks up tenantId from DB) | no | NO (already correct) |
| send-geofence-alert.ts | n/a (Plan 05 intentionally skipped) | n/a | NO TOUCH |
| send-support-notifications.ts | n/a (Plan 05 intentionally skipped) | n/a | NO TOUCH |

**Call site audit:**

| Wrapper | Call site file:line | tenantId source in scope | Action |
|---------|---------------------|--------------------------|--------|
| sendDriverInvitation | apps/web/src/app/(owner)/actions/drivers.ts:145 | `tenantId` (local var, line 120-131) | Add `tenantId,` to payload |
| sendDriverInvitation | apps/web/src/app/(owner)/actions/team-permissions.ts:178 | `tenantId` (in scope) | Add `tenantId,` to payload |
| sendDriverInvitation | apps/web/src/lib/carrier/fleet-drivers.ts:214 | `orgId` (carrier scope) | Add `tenantId: orgId,` + comment "orgId === tenantId in this codebase" |
| sendDriverInvitation | apps/web/src/lib/carrier/fleet-drivers.ts:372 | `orgId` (carrier scope) | Add `tenantId: orgId,` + comment "orgId === tenantId in this codebase" |
| sendDriverInvitation | apps/web/src/app/api/mobile/owner/drivers/invite/route.ts:121 | `tenantId` (mobile token) | Add `tenantId,` to payload |
| sendOwnerInvitation | apps/web/src/app/(admin)/actions/tenants.ts:142 | `tenant.id` (newly created tenant on line 98) | Add `tenantId: tenant.id,` |
| sendOwnerInvitation | apps/web/src/app/(admin)/actions/tenants.ts:374 | `tenantId` (function param, line 340) | Add `tenantId,` |
| sendLoadStatusEmail | apps/web/src/app/(owner)/actions/loads.ts:68 | `tenantId` (function param, line 44) | Add `tenantId,` |
| sendLoadStatusEmail | apps/web/src/lib/geofencing/geofence-check.ts:265 | `load.tenantId` (from prisma include) | Add `tenantId: load.tenantId,` (verify field exists on Load model) |
| sendOwnerReplyNotification | apps/web/src/app/(owner)/actions/fleet-messages.ts:208 | `user.tenantId` (session) | Add `tenantId: user.tenantId,` |
| sendMaintenanceReminder | (none — only cron used to call it, now bypasses) | — | No call site change needed |
| sendDocumentExpiryReminder | (none) | — | No call site change needed |
| sendDriverDocumentExpiryReminder | (none) | — | No call site change needed |
| sendDriverMessageNotification | apps/web/src/app/(driver)/actions/driver-messages.ts:121,205 | already passes `tenantId: user.tenantId` | NO change (already correct) |

Total: 7 wrappers to edit + 9 call sites to edit (one call site is paired with one comment for orgId rename clarity).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make tenantId required on all 7 wrappers and delete the early-return guards</name>
  <files>
    apps/web/src/lib/email/send-driver-invitation.ts
    apps/web/src/lib/email/send-owner-invitation.ts
    apps/web/src/lib/email/send-maintenance-reminder.ts
    apps/web/src/lib/email/send-document-expiry-reminder.ts
    apps/web/src/lib/email/send-driver-document-expiry-reminder.ts
    apps/web/src/lib/email/send-fleet-message-notifications.ts
    apps/web/src/lib/email/customer-notifications.ts
  </files>
  <action>
For EACH of the 7 wrapper files, make exactly two structural changes. The legacy fallback functions and the try/catch shape MUST be preserved unchanged.

**Change A — Type signature:** Change `tenantId?: string;` to `tenantId: string;` and update the JSDoc comment on the line above so it no longer says "Optional: if provided" — replace with a one-line description such as `/** Tenant the email is being sent on behalf of — drives template lookup and audit log. */`.

**Change B — Remove early-return guard:** Delete the entire `if (!data.tenantId) { return await legacySendX(...); }` block (or the equivalent `if (!params.tenantId)` block in send-fleet-message-notifications.ts). The dispatcher call that immediately follows must remain. The catch branch (`catch (err) { ... return legacySendX(...) }`) must remain intact — that is the legitimate fallback path when the dispatcher itself throws.

**Exact file targets:**

1. `apps/web/src/lib/email/send-driver-invitation.ts`
   - Line 19: `tenantId?: string;` → `tenantId: string;`
   - Lines 32-34: delete the `if (!data.tenantId) { return await legacySendDriverInvitation(toEmail, data); }` block
   - JSDoc on function (around line 22-26): update wording from "Routes through dispatchNotification when tenantId is available" to "Routes through dispatchNotification (tenant-aware). Falls back to legacy Gmail SMTP only when the dispatcher itself throws."

2. `apps/web/src/lib/email/send-owner-invitation.ts`
   - Line 19: `tenantId?: string;` → `tenantId: string;`
   - Lines 32-34: delete the `if (!data.tenantId) { return await legacySendOwnerInvitation(toEmail, data); }` block
   - JSDoc on function: same wording fix as above.

3. `apps/web/src/lib/email/send-maintenance-reminder.ts`
   - Line 21: `tenantId?: string;` → `tenantId: string;`
   - Lines 36-38: delete the `if (!data.tenantId) { return await legacySendMaintenanceReminder(toEmail, data); }` block
   - JSDoc: same wording fix. Note: `truckId?: string;` on line 23 stays optional — only `tenantId` is being promoted.

4. `apps/web/src/lib/email/send-document-expiry-reminder.ts`
   - Line 19: `tenantId?: string;` → `tenantId: string;`
   - Lines 34-36: delete the `if (!data.tenantId) { return await legacySendDocumentExpiryReminder(toEmail, data); }` block
   - JSDoc: same wording fix. `truckId?: string;` stays optional.

5. `apps/web/src/lib/email/send-driver-document-expiry-reminder.ts`
   - Line 19: `tenantId?: string;` → `tenantId: string;`
   - Lines 50-52: delete the `if (!data.tenantId) { return await legacySendDriverDocumentExpiryReminder(toEmail, data); }` block
   - JSDoc: same wording fix. `driverId?: string;` stays optional.

6. `apps/web/src/lib/email/send-fleet-message-notifications.ts`
   - `DriverMessageNotificationParams` (lines 15-24): ALREADY has `tenantId: string;` — leave it alone. No guard exists in `sendDriverMessageNotification`. Do not modify.
   - `OwnerReplyNotificationParams` (line 92): `tenantId?: string;` → `tenantId: string;`
   - Lines 106-109 in `sendOwnerReplyNotification`: delete the `if (!params.tenantId) { await legacySendOwnerReplyNotification(params); return; }` block
   - JSDoc on `sendOwnerReplyNotification` (line 97-101): update wording the same way.

7. `apps/web/src/lib/email/customer-notifications.ts`
   - Line 23: `tenantId?: string;` → `tenantId: string;`
   - Lines 50-52: delete the `if (!data.tenantId) { return await legacySendLoadStatusEmail(toEmail, data); }` block
   - The final `return await legacySendLoadStatusEmail(toEmail, data);` on line 88 (the "Unknown status" branch) MUST stay — it is a legitimate non-error fallback for statuses outside DELIVERED/IN_TRANSIT.
   - JSDoc: same wording fix. `loadId?: string;` and `deliveredAt?: string;` stay optional.

**DO NOT TOUCH:**
- `apps/web/src/lib/email/send-sysadmin-invoice.ts` (no guard exists; looks up tenantId from DB)
- `apps/web/src/lib/email/send-geofence-alert.ts` (Plan 05 intentionally skipped)
- `apps/web/src/lib/email/send-support-notifications.ts` (Plan 05 did not wrap; out of scope)
- The dispatcher itself in `apps/web/src/lib/notifications/`
- Any legacy* fallback function body
- The `truckId?`, `driverId?`, `loadId?`, `senderId?`, `threadUrl?`, `deliveredAt?` optional fields on these interfaces

**Structural sanity check before moving on:** Each modified wrapper must end up with this exact shape inside its public export:
```ts
try {
  const result = await dispatchNotification(<trigger>, { tenantId: data.tenantId, payload: {...}, relatedEntity: {...} });
  return ...;
} catch (err) {
  console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
  return legacySendX(toEmail, data);
}
```
No `if (!data.tenantId)` line remains anywhere. The `customer-notifications.ts` file is the one exception that retains a non-error legacy call (unknown-status branch) inside the try.

If any wrapper turns out to have a structurally different shape from the table above, STOP and report — do not edit it.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web/`. Expected: a clean pass on the wrapper files themselves, but errors at every call site that does not yet pass tenantId. The errors must reference the 9 call sites listed in Task 2. If TS reports zero errors, something is wrong — the field promotion did not take. If TS reports errors elsewhere, STOP and report.

Also run:
```
grep -n "if (!data.tenantId)" apps/web/src/lib/email/*.ts
grep -n "if (!params.tenantId)" apps/web/src/lib/email/*.ts
grep -n "tenantId?:" apps/web/src/lib/email/send-driver-invitation.ts apps/web/src/lib/email/send-owner-invitation.ts apps/web/src/lib/email/send-maintenance-reminder.ts apps/web/src/lib/email/send-document-expiry-reminder.ts apps/web/src/lib/email/send-driver-document-expiry-reminder.ts apps/web/src/lib/email/send-fleet-message-notifications.ts apps/web/src/lib/email/customer-notifications.ts
```
All three greps must return zero matches.
  </verify>
  <done>
The 7 wrappers each have `tenantId: string` (required) on their public data type and no `if (!data.tenantId)` early-return guard. Legacy fallback bodies and try/catch shapes are unchanged. `tsc --noEmit` reports errors only at the 9 call sites in Task 2.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update all 9 call sites to pass tenantId (using orgId where applicable, with comment)</name>
  <files>
    apps/web/src/app/(owner)/actions/drivers.ts
    apps/web/src/app/(owner)/actions/team-permissions.ts
    apps/web/src/lib/carrier/fleet-drivers.ts
    apps/web/src/app/api/mobile/owner/drivers/invite/route.ts
    apps/web/src/app/(admin)/actions/tenants.ts
    apps/web/src/app/(owner)/actions/loads.ts
    apps/web/src/lib/geofencing/geofence-check.ts
    apps/web/src/app/(owner)/actions/fleet-messages.ts
  </files>
  <action>
Add `tenantId` to every call to a wrapped sender. Use the exact source variable in scope as audited below. Do NOT introduce new lookups or fetches — every call site already has a tenant identifier in scope. If somehow not, STOP and report.

**Call site edits (one per row):**

1. `apps/web/src/app/(owner)/actions/drivers.ts` around line 145
   - Inside the `sendDriverInvitation(email, { ... })` payload, add `tenantId,` (shorthand — the variable `tenantId` is already in scope from line 120 area).

2. `apps/web/src/app/(owner)/actions/team-permissions.ts` around line 178
   - Inside the `sendDriverInvitation(email, { ... })` payload, add `tenantId,` (shorthand — `tenantId` already in scope).

3. `apps/web/src/lib/carrier/fleet-drivers.ts` around line 214 (inside `createCarrierDriver`)
   - Inside the `sendDriverInvitation(data.email, { ... })` payload, add this line as the FIRST property:
     ```ts
     // NOTE: orgId and tenantId are the same value in this codebase (carrier scope === tenant scope).
     tenantId: orgId,
     ```

4. `apps/web/src/lib/carrier/fleet-drivers.ts` around line 372 (inside `resendCarrierDriverInvitation`)
   - Inside the `sendDriverInvitation(driver.email, { ... })` payload, add this line as the FIRST property:
     ```ts
     // NOTE: orgId and tenantId are the same value in this codebase (carrier scope === tenant scope).
     tenantId: orgId,
     ```

5. `apps/web/src/app/api/mobile/owner/drivers/invite/route.ts` around line 121
   - Inside the `sendDriverInvitation(normalizedEmail, { ... })` payload, add `tenantId,` (shorthand — `tenantId` already in scope from the mobile token context above).

6. `apps/web/src/app/(admin)/actions/tenants.ts` around line 142 (inside `createTenant`)
   - Inside the `sendOwnerInvitation(validation.data.ownerEmail, { ... })` payload, add `tenantId: tenant.id,` (the newly-created Tenant row from line 98).

7. `apps/web/src/app/(admin)/actions/tenants.ts` around line 374 (inside `resendOwnerInvitation`)
   - Inside the `sendOwnerInvitation(invitation.email, { ... })` payload, add `tenantId,` (shorthand — `tenantId` is the function parameter from line 340).

8. `apps/web/src/app/(owner)/actions/loads.ts` around line 68 (inside `sendNotificationAndLogInteraction`)
   - Inside the `sendLoadStatusEmail(load.customer.email, { ... })` payload, add `tenantId,` (shorthand — `tenantId` is the function parameter from line 44).

9. `apps/web/src/lib/geofencing/geofence-check.ts` around line 265 (inside `notifyCustomer`)
   - Inside the `sendLoadStatusEmail(load.customer.email, { ... })` payload, add `tenantId: load.tenantId,`. The `load` object is the result of an upstream Prisma findUnique on the Load model — `tenantId` is a scalar on the Load model so it is present without any include. (If for some reason `load.tenantId` is typed as `undefined` here, the upstream query in `apps/web/src/lib/geofencing/geofence-check.ts` selects whole-row and tenantId IS on Load — STOP and report only if Prisma typing actually flags it.)

10. `apps/web/src/app/(owner)/actions/fleet-messages.ts` around line 208
    - Inside the `sendOwnerReplyNotification({ ... })` payload, add `tenantId: user.tenantId,` (the `user` object is from `requireRole` / session context already used on line 195 as `user.tenantId`).

**DO NOT TOUCH:**
- The two `sendDriverMessageNotification` calls in `apps/web/src/app/(driver)/actions/driver-messages.ts` (lines 121, 205) — already pass `tenantId: user.tenantId`.
- The `sendSysAdminInvoice(invoiceId)` call in `apps/web/src/app/(admin)/actions/sysadmin-invoices.ts:370` — signature takes only an invoiceId.
- Any call site for a wrapper that is not in the table above.

After all 10 edits (9 distinct call sites + 1 NOTE comment shared across two carrier sites), run `tsc --noEmit` and `npm run build` from `apps/web/`. Both must pass clean.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — must report zero errors.
2. `cd apps/web && npm run build` — must complete successfully.
3. `grep -n "sendDriverInvitation\|sendOwnerInvitation\|sendLoadStatusEmail\|sendOwnerReplyNotification" apps/web/src` — every match outside `apps/web/src/lib/email/` must be visually inspected to confirm a `tenantId` (or `tenantId: orgId` / `tenantId: load.tenantId` / `tenantId: tenant.id` / `tenantId: user.tenantId`) property appears within the payload object.
4. Confirm both carrier call sites contain the exact comment: `// NOTE: orgId and tenantId are the same value in this codebase (carrier scope === tenant scope).`
5. Manual production verification (post-deploy, sanity only — do NOT block the plan on this): trigger a driver invitation in dev, then via Supabase MCP run:
   ```sql
   SELECT id, "templateKey", "tenantId", "status", "createdAt"
   FROM "NotificationSendLog"
   ORDER BY "createdAt" DESC
   LIMIT 5;
   ```
   Expect at least one row written for the driver invitation. The plan is considered done at the build-pass step; this query is a follow-up smoke test.
  </verify>
  <done>
All 9 call sites pass a real `tenantId`. The two carrier sites carry the orgId-equivalence comment. `npx tsc --noEmit` clean. `npm run build` clean. Manual Supabase MCP query (post-deploy) confirms `NotificationSendLog` rows are now being written.
  </done>
</task>

</tasks>

<verification>
End-to-end gate:
1. `cd apps/web && npx tsc --noEmit` — zero errors.
2. `cd apps/web && npm run build` — green.
3. Grep audit:
   - `grep -rn "if (!data.tenantId)" apps/web/src/lib/email/` → no matches
   - `grep -rn "if (!params.tenantId)" apps/web/src/lib/email/` → no matches
   - `grep -rn "tenantId?:" apps/web/src/lib/email/send-driver-invitation.ts apps/web/src/lib/email/send-owner-invitation.ts apps/web/src/lib/email/send-maintenance-reminder.ts apps/web/src/lib/email/send-document-expiry-reminder.ts apps/web/src/lib/email/send-driver-document-expiry-reminder.ts apps/web/src/lib/email/customer-notifications.ts` → no matches
   - `grep -n "tenantId" apps/web/src/lib/email/send-fleet-message-notifications.ts` → `OwnerReplyNotificationParams` field shows `tenantId: string` (NOT `tenantId?: string`)
4. Spot-check carrier comment present at both fleet-drivers.ts call sites.
5. Post-deploy: Supabase MCP query against `NotificationSendLog` after a real send shows ≥ 1 row.
</verification>

<success_criteria>
- 7 wrapper files: `tenantId` required, `if (!data.tenantId)` guard removed, try/catch + legacy fallback bodies unchanged.
- 9 call sites: pass real tenantId from in-scope variable.
- 2 carrier call sites carry the `orgId === tenantId` explanation comment.
- `npx tsc --noEmit` clean from `apps/web/`.
- `npm run build` clean from `apps/web/`.
- Files NOT touched: `send-support-notifications.ts`, `send-geofence-alert.ts`, `send-sysadmin-invoice.ts`, the dispatcher library, BlockEditor, any `/admin/notifications` or `/settings/notifications` page, `prisma/schema.prisma`, the `sendDriverMessageNotification` call sites (already correct).
</success_criteria>

<output>
After completion, create `.planning/quick/320-phase-41-hotfix-remove-optional-tenantid/320-SUMMARY.md` covering:
- Wrappers edited (with old/new tenantId field signature)
- Call sites updated (file:line + source variable)
- tsc and build results
- Post-deploy NotificationSendLog Supabase MCP query result (if run)
</output>
