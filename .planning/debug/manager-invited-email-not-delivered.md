---
status: diagnosed
trigger: "manager-invited-email-not-delivered — After QT 352, manager.invited emails never arrive. Driver.invited works fine."
created: 2026-05-16T00:00:00Z
updated: 2026-05-16T00:10:00Z
symptoms_prefilled: true
goal: find_root_cause_only
read_only: true
---

## Current Focus

hypothesis: CONFIRMED — manager.invited template row exists in DB but defaultHtmlCache IS NULL. The dispatcher short-circuits at Step 4 with FAILED status before any recipient is resolved.
test: Direct DB query confirmed defaultHtmlCache IS NULL for manager.invited; LENGTH=0. driver.invited has 375 chars cached.
expecting: N/A — root cause confirmed
next_action: Return diagnosis

## Symptoms

expected: inviteTeamMember() → sendManagerInvitation() → manager.invited trigger → email delivered to sammy.issa21+marcus@gmail.com
actual: UI shows "Invitation sent" toast, no error, email never arrives. No server-side error thrown.
errors: None visible in UI. NotificationSendLog has FAILED rows for manager.invited with errorMessage "No cached HTML available for trigger — seed migration missing or save flow not run".
reproduction: Invite a manager via Team & Permissions page in owner portal
started: Broken since QT 352 (commits 1e6c269, bbff90c, 197eab3, 3e02af1). driver.invited works fine.

## Eliminated

- hypothesis: manager.invited not in TriggerKey union
  evidence: types.ts line 27 has 'manager.invited' in the union
  timestamp: 2026-05-16T00:05:00Z

- hypothesis: dispatcher doesn't route manager.invited (no switch/registry)
  evidence: dispatcher uses TypeScript generics on TriggerKey directly — no registry needed. Any valid TriggerKey is dispatched the same way.
  timestamp: 2026-05-16T00:05:00Z

- hypothesis: recipient resolver doesn't know how to extract manager email
  evidence: seed entry has defaultRecipients: [{type:'external_email', payloadKey:'managerEmail'}]. Resolver handles external_email type generically. The payload from sendManagerInvitation includes managerEmail field. This path is correct.
  timestamp: 2026-05-16T00:07:00Z

- hypothesis: TenantNotificationSettings suppressing manager.invited
  evidence: No TenantNotificationSettings row exists for manager.invited at all (only driver.invited has one, and it's isActive=true). Absence means not suppressed.
  timestamp: 2026-05-16T00:08:00Z

- hypothesis: Template row missing or isActive=false
  evidence: Template row EXISTS, isActive=true, inAppEnabled=false. Correct.
  timestamp: 2026-05-16T00:08:00Z

## Evidence

- timestamp: 2026-05-16T00:03:00Z
  checked: NotificationSendLog for sammy.issa21+marcus@gmail.com
  found: Zero rows. The recipient email never appears in the log.
  implication: The dispatcher fails before reaching the recipient fan-out loop — it never resolves a recipient.

- timestamp: 2026-05-16T00:04:00Z
  checked: NotificationSendLog for triggerKey = 'manager.invited' (all recipients)
  found: Two FAILED rows with recipientEmail=null and errorMessage="No cached HTML available for trigger — seed migration missing or save flow not run". Timestamps: 2026-05-17T00:00:29Z, 2026-05-17T00:03:29Z.
  implication: The dispatcher is being called, reaches Step 4 (HTML cache check), finds NULL, writes a FAILED audit row, and returns immediately. This matches the dispatcher code at lines 136-149.

- timestamp: 2026-05-16T00:05:00Z
  checked: NotificationSendLog for sammy.issa21+derek@gmail.com (control)
  found: Two rows — EMAIL/SENT and IN_APP/SKIPPED_DISABLED — proving driver.invited pipeline works end-to-end.
  implication: The notification infrastructure is healthy. The failure is specific to manager.invited.

- timestamp: 2026-05-16T00:06:00Z
  checked: NotificationTemplate.defaultHtmlCache for both triggers
  found: driver.invited has cache_len=375, is_null=false. manager.invited has cache_len=0, is_null=TRUE.
  implication: The backfill script (scripts/backfill-notification-html-cache.ts) was NOT run after QT 352 seeded the manager.invited template. The seed script (seed-notifications.ts) only writes defaultBlockJson — it never writes defaultHtmlCache. The HTML cache must be populated by a separate step.

- timestamp: 2026-05-16T00:07:00Z
  checked: scripts/backfill-notification-html-cache.ts
  found: Script queries WHERE defaultHtmlCache IS NULL, renders Tiptap HTML from defaultBlockJson, then UPDATEs the row. It is idempotent. It was the mechanism that populated driver.invited's cache.
  implication: QT 352 added the manager.invited seed entry and upserted the template row but never ran this backfill. The row was INSERT-ed with defaultHtmlCache=NULL and stayed that way.

- timestamp: 2026-05-16T00:08:00Z
  checked: send-manager-invitation.ts payload vs send-driver-invitation.ts payload
  found: manager uses {managerEmail, firstName, tenantName, inviteUrl}; driver uses {driverEmail, driverFirstName, tenantName, inviteUrl}. The seed defaultRecipients.payloadKey matches these field names correctly in both cases.
  implication: No payload mismatch. The external_email resolver would find the right key IF execution reached Step 3.

## Resolution

root_cause: The manager.invited NotificationTemplate row was seeded with defaultHtmlCache=NULL. The dispatcher's Step 4 guard (dispatcher.ts lines 136-149) short-circuits with status=FAILED and returns before resolving any recipients when cachedHtml is null/empty. The backfill script (scripts/backfill-notification-html-cache.ts) that populates defaultHtmlCache from defaultBlockJson was not run after QT 352 inserted this template row. Because the dispatcher catches its own outer error and never throws, inviteTeamMember() catches nothing, returns {success:true}, and the UI shows the success toast — giving the false impression of delivery.
fix: Run the backfill script from apps/web: npx tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts
verification: After running, defaultHtmlCache for manager.invited will be non-null. Next manager invite will produce a SENT row in NotificationSendLog and the email will arrive.
files_changed: []
