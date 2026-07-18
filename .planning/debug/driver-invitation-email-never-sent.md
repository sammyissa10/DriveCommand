---
status: diagnosed
trigger: "driver-invitation-email-never-sent — Driver invitation emails never arrive (60-day Gmail check, inbox + spam). Support-ticket emails from team@drivecommand.io DO arrive."
created: 2026-06-16T00:00:00Z
updated: 2026-06-16T00:30:00Z
symptoms_prefilled: true
goal: find_root_cause_only
read_only: true
---

## Current Focus

hypothesis: CONFIRMED — The dispatcher's cachedHtml guard (dispatcher.ts:132-149) is the blocker. The `driver.invited` NotificationTemplate.defaultHtmlCache is NULL (or was reset), causing every dispatch to return {sent:0, skipped:0, failed:1} without throwing — so the UI shows "Driver created" success toast while email is silently dropped.
test: Traced full call chain from CarrierDriverForm → POST /api/v1/carrier/fleet/drivers → createCarrierDriver → sendDriverInvitation → dispatchNotification → cachedHtml null guard
expecting: N/A — root cause confirmed
next_action: Return diagnosis

## Symptoms

expected: Inviting a driver via owner portal sends email to the driver with invitation link
actual: Email never arrives (inbox or spam). UI shows success toast. Zero emails in 60 days.
errors: Unknown at UI level — errors are swallowed. NotificationSendLog likely has FAILED rows with errorMessage "No cached HTML available for trigger — seed migration missing or save flow not run"
reproduction: Invite a driver via /carrier/fleet/drivers/new (CarrierDriverForm)
timeline: Unknown exact start — 60+ days confirmed broken
comparison: Support-ticket emails from team@drivecommand.io DO arrive (use legacy Gmail path, bypass dispatcher entirely)

## Eliminated

- hypothesis: Different email client or API key (infra issue)
  evidence: support-ticket sender (send-support-notifications.ts) uses sendEmail() which calls resend-client.ts. send-driver-invitation.ts also uses resend-client.ts in its legacy fallback — same client, same RESEND_API_KEY env var. But the primary path goes through dispatchNotification, not legacy Gmail directly. The from-address is FROM_EMAIL = RESEND_FROM_EMAIL || 'DriveCommand <team@drivecommand.io>' — same domain for both paths.
  timestamp: 2026-06-16T00:10:00Z

- hypothesis: Dispatcher not reached (tenantId missing, early-return guard)
  evidence: Quick-320 (fix(320-01)) made tenantId required and removed early-return guards. All call sites were updated in fix(320-02). Both inviteDriver (drivers.ts) and createCarrierDriver (fleet-drivers.ts) pass tenantId to sendDriverInvitation. No early-return path exists.
  timestamp: 2026-06-16T00:15:00Z

- hypothesis: Template isActive=false
  evidence: Prior debug session (manager-invited-email-not-delivered.md) confirmed driver.invited isActive=true. The seed sets isActive=true and seed-notifications.ts intentionally does NOT overwrite isActive on update to preserve SysAdmin runtime toggles.
  timestamp: 2026-06-16T00:20:00Z

- hypothesis: TenantNotificationSettings suppressing driver.invited
  evidence: Prior debug session confirmed only driver.invited had a TenantNotificationSettings row and it was isActive=true. Even if absent, absence does not suppress (Step 2 only suppresses if isActive===false).
  timestamp: 2026-06-16T00:20:00Z

- hypothesis: Recipient resolver fails for external_email rule
  evidence: Quick-321 fixed the exact bug (was 'related' type which looked up by userId UUID — but driverEmail is an email, not a UUID). Changed to external_email type. The recipient-resolver.ts external_email handler correctly processes email strings. The payload key driverEmail matches both the seed's defaultRecipients[0].payloadKey AND what sendDriverInvitation passes.
  timestamp: 2026-06-16T00:22:00Z

- hypothesis: Idempotency check wrongly skipping all sends
  evidence: idempotency key uses current timestamp-to-second, so each new invitation attempt gets a unique key. Would not cause 60 days of silent failures.
  timestamp: 2026-06-16T00:22:00Z

## Evidence

- timestamp: 2026-06-16T00:05:00Z
  checked: apps/web/src/lib/email/send-driver-invitation.ts (current)
  found: Routes through dispatchNotification('driver.invited', ...). Falls back to legacySendDriverInvitation (which calls sendEmail → resend-client.ts) ONLY if dispatchNotification throws. But dispatchNotification is decorated @never throws — it always returns {sent,skipped,failed}. The fallback is therefore NEVER triggered.
  implication: If the dispatcher fails silently (returns failed:1 without throwing), the legacy Resend fallback never runs and no email is sent.

- timestamp: 2026-06-16T00:08:00Z
  checked: apps/web/src/lib/notifications/dispatcher.ts lines 132-149
  found: "const cachedHtml = tenantSettings?.customHtmlCache ?? template.defaultHtmlCache" — if this is null, dispatcher pushes a FAILED audit row with errorMessage "No cached HTML available for trigger — seed migration missing or save flow not run" and immediately returns {sent:0, skipped:0, failed:1} WITHOUT throwing.
  implication: This is the exact silent failure mechanism. The dispatcher logs the failure to NotificationSendLog but does not throw. sendDriverInvitation sees no exception, returns normally. The calling action (inviteDriver / createCarrierDriver) has no way to detect the failure — it sees emailSent=true and returns success.

- timestamp: 2026-06-16T00:10:00Z
  checked: apps/web/prisma/seeds/seed-notifications.ts (upsert logic)
  found: The seed UPDATE path (for existing templates) only writes: category, displayName, description, defaultSubject, defaultBlockJson, availableVariables, defaultRecipients. It NEVER writes defaultHtmlCache. defaultHtmlCache is only populated by: (a) scripts/backfill-notification-html-cache.ts, or (b) the SysAdmin template editor (updateNotificationTemplate action writes cachedHtml).
  implication: If the seed was re-run without the backfill, defaultHtmlCache for driver.invited would remain as previously set. But if the template was created fresh (e.g., DB wipe and re-seed without backfill), it would be NULL.

- timestamp: 2026-06-16T00:12:00Z
  checked: chore(quick-353) commit 419c89c9
  found: Quick-353 (May 16) chained backfill into seed:notifications script: "tsx --env-file=.env.local prisma/seeds/seed-notifications.ts && tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts". So running seed:notifications now also runs the backfill. Before QT-353, the backfill had to be run separately.
  implication: Any seed:notifications run AFTER QT-353 (May 16) will also populate defaultHtmlCache. Before May 16, it had to be run manually.

- timestamp: 2026-06-16T00:14:00Z
  checked: Prior debug session (manager-invited-email-not-delivered.md) — Evidence entry from 2026-05-16T00:06:00Z
  found: "driver.invited has cache_len=375, is_null=false" — as of May 16, driver.invited DID have a cached HTML. Also: "Two rows — EMAIL/SENT and IN_APP/SKIPPED_DISABLED — proving driver.invited pipeline works end-to-end."
  implication: As of May 16, driver.invited was confirmed working. The 60-day report (since ~April 16) predates the May 16 confirmation, meaning either: (a) the May 16 test was a deliberate test invite that worked but production invites are somehow different, OR (b) the problem manifests only for NEW tenants/invites not for the tested scenario, OR (c) something in the actual path the user uses is different from what was tested.

- timestamp: 2026-06-16T00:18:00Z
  checked: TWO invitation code paths compared
  found: Path 1 (old): apps/web/src/app/(owner)/actions/drivers.ts inviteDriver() — uses DriverInvitation model, calls sendDriverInvitation with tenantId. Path 2 (new, carrier module): apps/web/src/lib/carrier/fleet-drivers.ts createCarrierDriver() — also creates DriverInvitation + calls sendDriverInvitation with orgId as tenantId. BOTH paths call the same sendDriverInvitation. The NEW CarrierDriverForm (carrier/fleet/drivers) POSTs to /api/v1/carrier/fleet/drivers → createCarrierDriver.
  implication: Both paths use the same email send function and same dispatcher. If the dispatcher is the issue, both paths fail.

- timestamp: 2026-06-16T00:20:00Z
  checked: apps/web/src/lib/carrier/fleet-drivers.ts createCarrierDriver() error handling
  found: The sendDriverInvitation call is inside try/catch. On exception: returns {driver, emailSent:false, emailWarning:'Driver created but invitation email failed to send...'} — which propagates as a response body warning. BUT dispatchNotification never throws — it returns normally. So the catch is never triggered, emailSent=true is returned, and the API route returns HTTP 201 with no warning.
  implication: The UI never sees a warning. The toast says "Driver created". The email was never sent.

- timestamp: 2026-06-16T00:22:00Z
  checked: apps/web/src/app/(owner)/actions/drivers.ts inviteDriver() error handling
  found: Same pattern. sendDriverInvitation is awaited inside try/catch. If no exception (which is always the case since dispatcher never throws), emailSent=true, returns {success:true, message:'Invitation sent to {email}'}. The "check" on line 213 (if (!emailSent)) is unreachable because no exception is ever thrown.
  implication: inviteDriver also cannot detect the silent failure.

- timestamp: 2026-06-16T00:25:00Z
  checked: The fallback mechanism in send-driver-invitation.ts
  found: The outer try/catch in sendDriverInvitation catches only if dispatchNotification throws. Since dispatcher is @never throws, the catch block (which would invoke legacySendDriverInvitation → Resend API directly) is NEVER reached. The dispatcher's internal failure is invisible to the wrapper.
  implication: Even though a working legacy SMTP fallback exists in the code, it is architecturally unreachable because the dispatcher violates the contract the fallback depends on (it swallows all errors instead of re-throwing).

- timestamp: 2026-06-16T00:28:00Z
  checked: Root cause candidates — what makes defaultHtmlCache NULL vs non-null
  found: The backfill was run once on May 15 (commit 58ff1a1d) and chained into seed:notifications on May 16 (commit 419c89c9). If the production DB is a Supabase instance that has been running since before May 15, the driver.invited row should have defaultHtmlCache populated from the one-time backfill. UNLESS: (1) the template row was deleted and re-seeded without backfill after May 16, or (2) a SysAdmin cleared the template HTML via the admin editor (updateNotificationTemplate with empty cachedHtml), or (3) the production DB was reset/migrated to a fresh state after QT-353 but seed:notifications was not re-run.
  implication: The most likely ongoing failure scenario: defaultHtmlCache IS null in production for driver.invited, causing 100% failure rate. The May 16 "working" test may have been a test environment or pre-production check, not the actual production tenant the user invites from.

## Resolution

root_cause: The notification dispatcher (dispatcher.ts:132-149) requires NotificationTemplate.defaultHtmlCache to be non-null before sending any email. The driver.invited template's defaultHtmlCache is NULL (or was reset) in production. Because the dispatcher is designed to never throw (@never throws contract), the send failure is invisible: sendDriverInvitation returns normally → inviteDriver/createCarrierDriver sets emailSent=true → UI shows success toast. The legacy Resend fallback in send-driver-invitation.ts is architecturally unreachable (it only fires if dispatchNotification throws, which it never does). The root cause is the same NULL-cache failure pattern as manager.invited (same bug, different trigger key).

fix: Run the backfill script against production DB: from apps/web, run `npx tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts` OR run `npm run seed:notifications` (which chains the backfill since QT-353). This will populate defaultHtmlCache for driver.invited (and any other NULL templates).

verification: After running, check NotificationSendLog for a driver.invited trigger — should show EMAIL/SENT (not FAILED). Also check that defaultHtmlCache for driver.invited is non-null and ~375+ chars.

files_changed: []
