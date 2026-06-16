# Quick Task 458 — SUMMARY: driver.invited Send Bisection

## Baseline NotificationSendLog (before fresh trigger)

Most recent `driver.invited` rows (descending):

| id | status | channel | recipientEmail | createdAt |
|---|---|---|---|---|
| `6f5acb8a` | SKIPPED_DISABLED | IN_APP | sammy.issa21+testing@gmail.com | 2026-06-12 01:06:21 UTC |
| `1bdf01f0` | **SENT** | EMAIL | sammy.issa21+testing@gmail.com | 2026-06-12 01:06:21 UTC |
| `b1b5b17d` | FAILED | IN_APP | (null) | 2026-05-26 04:02:10 UTC |
| `67beb5d4` | SENT | EMAIL | sammy.issa21+may25@gmail.com | 2026-05-26 04:02:10 UTC |

Fresh invite to `nadeem7awawda+invitetest@gmail.com` was **not triggered** — cannot authenticate to the production REST API from this investigation context. The branch verdict is determinable from existing log data + code alone (see below).

---

## Code Path Traced

Both owner-portal and carrier-portal invitation flows converge on the same sender:

```
inviteDriver (actions/drivers.ts)
createCarrierDriver (lib/carrier/fleet-drivers.ts)
resendCarrierDriverInvitation (lib/carrier/fleet-drivers.ts)
  └─→ sendDriverInvitation (lib/email/send-driver-invitation.ts)
        └─→ dispatchNotification('driver.invited', { driverEmail, driverFirstName, tenantName, inviteUrl })
              └─→ recipient resolved via external_email rule → payloadKey: 'driverEmail'
                    └─→ resend.emails.send({ from: FROM_EMAIL, to: driverEmail, ... })
```

`send-driver-invitation.ts` also has a legacy Gmail SMTP fallback, but it only fires if `dispatchNotification` itself **throws** — which it never does (it's `@never throws`).

---

## Template State

- `triggerKey`: `driver.invited`
- `isActive`: **true**
- `defaultHtmlCache`: **375 chars** (non-null — QT-457 backfill confirmed working)
- `defaultRecipients`: `[{ type: "external_email", payloadKey: "driverEmail" }]`
- `defaultSubject`: `"You've been invited to join {{tenantName}} on DriveCommand"`

---

## Verdict: **(a) — SENT rows exist, but SENT ≠ Resend accepted the email**

### Root Cause

`dispatcher.ts:195` calls `resend.emails.send()` and **discards the return value**:

```ts
// dispatcher.ts:194-229  ← THE BUG
try {
  await resend.emails.send({          // return { data, error } is THROWN AWAY
    from: FROM_EMAIL,
    to: r.email,
    subject: subjectFinal,
    react: React.createElement(DynamicTemplateEmail, { bodyHtml: html }),
  });
  audits.push({ status: 'SENT', ... });   // always runs if no JS throw
} catch (emailErr) {
  audits.push({ status: 'FAILED', ... }); // never runs on Resend API errors
}
```

Resend SDK v6.9.2 (`node_modules/resend/dist/index.cjs`) — confirmed via source:

```js
// fetchRequest in index.cjs
if (!response.ok) {
  return { data: null, error: JSON.parse(rawError), headers: ... };  // ← RETURNS, never throws
}
```

**All Resend API-level errors (domain not verified, bad from address, invalid API key, 4xx/5xx) return `{ data: null, error: {...} }` without throwing.** The dispatcher's `catch` is never reached. Every send logs SENT regardless of whether Resend actually queued the email.

### From Domain

`FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DriveCommand <team@drivecommand.io>'`
(`resend-client.ts:29`)

If `drivecommand.io` is not a verified sending domain in the Resend dashboard, every send returns a non-throwing error object — silently logged as SENT.

---

## Smallest Correct Fix (NOT implemented — report only)

**File:** `apps/web/src/lib/notifications/dispatcher.ts`, lines ~194-211

**Change:** Destructure and check `{ error }` from `resend.emails.send()`:

```ts
// Before
await resend.emails.send({ from: FROM_EMAIL, to: r.email, ... });

// After
const { error: resendError } = await resend.emails.send({ from: FROM_EMAIL, to: r.email, ... });
if (resendError) throw new Error(`Resend API error: ${resendError.message}`);
```

This turns silent Resend API rejections into caught `emailErr` values, which the existing `catch` block already handles correctly — it logs a `FAILED` row with the real error message (e.g., `"The from address is not valid"` or `"Domain not verified"`).

After this fix, trigger one fresh invite and the send log will show either:
- `SENT` → Resend accepted it; check Resend dashboard delivery status and from-domain DNS records
- `FAILED` with `errorMessage` → the real rejection reason is now surfaced

---

## Verification Step (to do after fix)

1. Deploy the one-liner fix above
2. Trigger invite to `nadeem7awawda+invitetest@gmail.com` via the carrier driver form
3. Query `NotificationSendLog WHERE "triggerKey" = 'driver.invited' ORDER BY "createdAt" DESC LIMIT 2`
4. If `FAILED`: `errorMessage` reveals the Resend rejection (likely domain or API key issue)
5. If `SENT`: check the Resend dashboard events for that email ID — look for delivery/bounce/spam events
