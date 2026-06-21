---
phase: quick-459
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/dispatcher.ts
autonomous: true

must_haves:
  truths:
    - "When resend.emails.send returns an error object, that recipient's EMAIL channel is logged as FAILED (not SENT)"
    - "The FAILED audit row carries errorMessage built from the Resend error (name + message)"
    - "Successful sends (no error returned) still log status SENT"
    - "A single recipient's Resend error does not abort sending to the remaining recipients"
  artifacts:
    - path: "apps/web/src/lib/notifications/dispatcher.ts"
      provides: "Email-send block that captures the Resend { error } result and branches to FAILED audit"
      contains: "const { error }"
  key_links:
    - from: "resend.emails.send() return value"
      to: "audits.push status FAILED with errorMessage"
      via: "if (error) branch in the email-send block"
      pattern: "const \\{ (data, )?error \\} = await resend\\.emails\\.send"
---

<objective>
Fix the silent Resend failure in the notification dispatcher. `resend.emails.send()` returns `{ data, error }` and does NOT throw on API-level failures (unverified domain, bad from-address, 4xx/5xx) — it only throws on network errors. The current email-send block (dispatcher.ts ~194-211) discards the return value and unconditionally pushes status `SENT`, so `driver.invited` records SENT while no email is delivered.

Purpose: Make `NotificationSendLog` truthful — failures must record `FAILED` with the real Resend error message so silent send failures are diagnosable.
Output: Corrected email-send block in `dispatcher.ts` that captures the Resend result, logs `FAILED` (with errorMessage) on `error`, and logs `SENT` only on genuine success. Per-recipient isolation preserved.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# File to modify (email-send block ~194-211 inside the per-recipient loop)
@apps/web/src/lib/notifications/dispatcher.ts

# Reference only — do NOT modify
# resend-client.ts: exports `resend` and `FROM_EMAIL` (= RESEND_FROM_EMAIL). Its own sendEmail()
# helper already does the correct pattern: `const { data, error } = await resend.emails.send(...); if (error) throw`.
@apps/web/src/lib/email/resend-client.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Capture Resend { error } and log FAILED on API-level send failures</name>
  <files>apps/web/src/lib/notifications/dispatcher.ts</files>
  <action>
In the per-recipient EMAIL channel block (currently ~lines 194-213, the `else` branch after the idempotency check), change the send so the Resend return value is captured and inspected instead of discarded.

Current (broken) shape:
```ts
try {
  await resend.emails.send({ from: FROM_EMAIL, to: r.email, subject: subjectFinal, react: ... });
  audits.push({ ... status: 'SENT', ... });
  sent++;
} catch (emailErr) {
  audits.push({ ... status: 'FAILED', errorMessage: (emailErr as Error).message?.slice(0, 1000) ?? null, ... });
  failed++;
}
```

New shape — capture the result, branch on `error`:
```ts
try {
  const { error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: r.email,
    subject: subjectFinal,
    react: React.createElement(DynamicTemplateEmail, { bodyHtml: html }),
  });

  if (sendError) {
    const failMessage = `${sendError.name}: ${sendError.message}`;
    audits.push({
      tenantId: options.tenantId,
      triggerKey,
      recipientUserId: r.userId ?? null,
      recipientEmail: r.email,
      channel: 'EMAIL',
      subject: subjectFinal,
      status: 'FAILED',
      idempotencyKey: idemKey,
      errorMessage: failMessage.slice(0, 1000),
      relatedEntityType: options.relatedEntity?.type ?? null,
      relatedEntityId: options.relatedEntity?.id ?? null,
    });
    failed++;
  } else {
    audits.push({
      tenantId: options.tenantId,
      triggerKey,
      recipientUserId: r.userId ?? null,
      recipientEmail: r.email,
      channel: 'EMAIL',
      subject: subjectFinal,
      status: 'SENT',
      idempotencyKey: idemKey,
      relatedEntityType: options.relatedEntity?.type ?? null,
      relatedEntityId: options.relatedEntity?.id ?? null,
    });
    sent++;
  }
} catch (emailErr) {
  // Network-level throw (Resend only throws here, not on API errors)
  audits.push({
    tenantId: options.tenantId,
    triggerKey,
    recipientUserId: r.userId ?? null,
    recipientEmail: r.email,
    channel: 'EMAIL',
    subject: subjectFinal,
    status: 'FAILED',
    idempotencyKey: idemKey,
    errorMessage: (emailErr as Error).message?.slice(0, 1000) ?? null,
    relatedEntityType: options.relatedEntity?.type ?? null,
    relatedEntityId: options.relatedEntity?.id ?? null,
  });
  failed++;
}
```

Requirements / guardrails:
- KEEP the existing outer `try/catch (emailErr)` so network-level throws still log FAILED (do not remove the network catch path).
- `error` from the Resend SDK is typed (`ErrorResponse | null`) — use `sendError.name` and `sendError.message`. No `any` casts. TypeScript strict must pass.
- Use the SAME audit-log object shape as the existing SENT/FAILED pushes (same fields, same null-coalescing). Only the `status` and `errorMessage` differ between branches.
- Match the existing 1000-char truncation (`.slice(0, 1000)`) used on errorMessage.
- Preserve `failed++` / `sent++` counters consistent with each branch.
- DO NOT touch: callers, template seeding, the IN_APP channel block (Step 6b), the SKIPPED_IDEMPOTENT / SKIPPED_USER_PREF paths, the legacy fallback, or `resend-client.ts`.
- The per-recipient `for` loop and its surrounding `try` (with `_preSent`/`_preSkipped`/`_preFailed` snapshot) must remain — one recipient failing must not abort the loop.
- git diff must be limited to `dispatcher.ts`.
  </action>
  <verify>
Run from repo root:
- `cd apps/web && npx tsc --noEmit` — no NEW TypeScript errors in dispatcher.ts (respect the known 35-error baseline; only regressions/touched-file errors matter).
- `git diff --name-only` shows ONLY `apps/web/src/lib/notifications/dispatcher.ts`.
- Grep the file: the email-send block now contains `const { error` capturing the Resend result, and an `if (sendError)` (or equivalent) branch pushing `status: 'FAILED'` with `errorMessage`.
  </verify>
  <done>
The dispatcher captures `resend.emails.send()`'s returned error. On API-level failure the recipient's EMAIL channel logs `FAILED` with `errorMessage = "{name}: {message}"`; on success it logs `SENT`. Network throws still log `FAILED` via the retained outer catch. Per-recipient isolation intact, tsc clean (no new errors), diff limited to dispatcher.ts.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` (run in apps/web) introduces no new type errors; `sendError.name`/`sendError.message` resolve without `any`.
- `git diff --name-only` returns exactly `apps/web/src/lib/notifications/dispatcher.ts`.
- Logic trace: error present → FAILED audit + `failed++`, no SENT; error null → SENT audit + `sent++`; thrown network error → existing outer catch → FAILED audit + `failed++`.
- IN_APP channel, idempotency-skip, and user-pref-skip paths are unchanged.
</verification>

<success_criteria>
- A `driver.invited` (or any) send that fails at the Resend API level (unverified domain / bad from-address / 4xx/5xx) records `NotificationSendLog.status = FAILED` with the real Resend error message — never `SENT`.
- Genuinely successful sends still record `SENT`.
- One recipient's failure does not stop the remaining recipients from being processed.
- Change is isolated to `dispatcher.ts`; TypeScript strict passes with no `any`.
</success_criteria>

<output>
After completion, create `.planning/quick/459-fix-silent-resend-failure-log-failed-sta/459-SUMMARY.md`
</output>
