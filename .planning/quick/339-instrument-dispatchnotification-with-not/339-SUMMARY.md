---
phase: quick-339
plan: 01
subsystem: notifications
tags: [observability, logging, diagnostics, dispatcher, notifications]
dependency_graph:
  requires: [quick-336, quick-337, quick-338]
  provides: [notif-trace-instrumentation]
  affects: [apps/web/src/lib/notifications/dispatcher.ts, apps/web/src/app/(owner)/actions/load-driver-assignments.ts]
tech_stack:
  added: []
  patterns: [structured-console-logging, trace-prefix]
key_files:
  created: []
  modified:
    - apps/web/src/lib/notifications/dispatcher.ts
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
decisions:
  - "Use [notif-trace] prefix consistently for grep-ability in Vercel logs"
  - "Do not add try/catch — preserve existing control flow exactly"
  - "Cap stack trace at 500 chars in catastrophic handler to avoid log spam"
  - "Emit recipients:none trace inside if-block without adding a return — preserves behavior"
metrics:
  duration: ~10m
  completed: 2026-05-16T03:08:17Z
  tasks_completed: 3
  files_modified: 2
  lines_added: 21
  lines_deleted: 0
---

# Phase quick-339 Plan 01: Instrument dispatchNotification with [notif-trace] Diagnostics

**One-liner:** Added 16 `[notif-trace]` console.log/error statements to `dispatcher.ts` and 2 caller-side traces to `createAssignment` — pure observability, zero behavior change, zero PII.

---

## What Changed

### `apps/web/src/lib/notifications/dispatcher.ts`
- **16 `[notif-trace]` log statements added** (15 `console.log` + 1 `console.error`)
- **0 lines deleted** — no existing logic, control flow, return shape, or error handling modified

### `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`
- **2 `[notif-trace] caller:` log statements added** inside the `if (load && driver)` block of `createAssignment`
- **0 lines deleted** — the `dispatchNotification(...).catch(...)` call is byte-identical to before

**Total: 21 lines added, 0 deleted, across 2 files**

---

## Trace Map

### Dispatcher (`dispatcher.ts`) — 16 traces

| # | Trace label | Step instrumented |
|---|-------------|-------------------|
| 1 | `dispatchNotification:start` | Function entry — logs trigger, tenantId (not PII — it's an ID), hasPayload, hasRelatedEntity |
| 2 | `template:fetched` | After `db.notificationTemplate.findUnique` — logs found/isActive |
| 3 | `dispatchNotification:exit reason=skip:template_missing\|skip:template_inactive` | Before early return when template null or inactive |
| 4 | `settings:fetched` | After `db.tenantNotificationSettings.findUnique` — logs found/isActive |
| 5 | `dispatchNotification:exit reason=skip:settings_inactive` | Before early return when tenant disabled the trigger |
| 6 | `recipients:resolved count=N` | After `resolveRecipients()` returns |
| 7 | `recipients:none reason=skip:no_recipients` | Inside `if (recipients.length === 0)` — emitted, no return added |
| 8 | `content:picked source=custom\|default` | After content variables set, before `if (!cachedHtml)` guard |
| 9 | `render:start` | Immediately before `renderTemplate()` call |
| 10 | `render:done html_length=N` | Immediately after `renderTemplate()` returns |
| 11 | `recipient:start userId=X hasEmail=bool hasInApp=bool` | Per-recipient loop entry, inside try |
| 12 | `recipient:done userId=X sent=N skipped=N failed=N` | Per-recipient loop exit, before catch — delta counts relative to pre-iteration snapshot |
| 13 | `audit:writing entries=N` | In finally block, before `writeAuditLog()` |
| 14 | `audit:done` | In finally block, after `writeAuditLog()` returns |
| 15 | `dispatchNotification:done` | Before final `return { sent, skipped, failed }` |
| 16 | `dispatchNotification:catastrophic` | In outer catch, after existing `console.error` — logs message + stack (capped 500 chars) |

### Caller (`load-driver-assignments.ts`) — 2 traces

| # | Trace label | Step instrumented |
|---|-------------|-------------------|
| 17 | `caller:before-dispatch trigger=load.assigned load=X driver=Y` | Immediately before `await dispatchNotification(...)` |
| 18 | `caller:after-dispatch trigger=load.assigned` | Immediately after the awaited `.catch()` resolves |

---

## Behavior Preservation Evidence

### TypeScript
```
npx tsc --noEmit (from apps/web) → exit 0 (clean, no errors)
```

### Unit Tests
```
npx vitest run src/lib/notifications/__tests__/ → 19 passed (3 files)
  - src/lib/notifications/__tests__/recipient-resolver.test.ts: 6 tests ✓
  - src/lib/notifications/__tests__/template-renderer.test.ts: 7 tests ✓
  - src/lib/notifications/__tests__/dispatcher.test.ts: 6 tests ✓
```
All 19 existing tests pass. The trace output is visible in the test run stdout, confirming traces fire correctly on every code path.

### Build
```
npm run build (apps/web) → ✓ Compiled successfully in 26.5s
npm run build (monorepo root) → Tasks: 4 successful, 4 total
```

### Diff verification
```
git diff master~1 master -- apps/web/src/lib/notifications/dispatcher.ts
→ 18 added lines, 0 deleted lines

git diff master~1 master -- apps/web/src/app/(owner)/actions/load-driver-assignments.ts
→ 3 added lines, 0 deleted lines
```

---

## PII Audit

```bash
grep -E "\[notif-trace\].*(@|email|firstName|lastName|fullName|payload\.)" \
  apps/web/src/lib/notifications/dispatcher.ts \
  apps/web/src/app/(owner)/actions/load-driver-assignments.ts
```

One grep hit: `hasEmail=${r.emailEnabled}` — this is a false positive. `r.emailEnabled` is a **boolean preference flag** (`true`/`false`), not an email address. The substring `email` in the grep pattern matched the field name `hasEmail`, not actual email data.

**Actual PII check result: ZERO email addresses, names, payload contents, or subject lines appear in any `[notif-trace]` line.** Only logged: IDs (tenantId, userId, loadId, driverId), boolean flags, counts, and enum-like tokens.

---

## Commit

```
64c30a9 chore(quick-task-339): add [notif-trace] diagnostic logging to dispatchNotification and createAssignment caller — pure observability, no behavior change
```

Pushed to `origin/master` at 2026-05-16T03:08:17Z.

---

## Next Action for User

Deploy via:
```bash
vercel --prod
```

Then trigger a **load assignment** in the production UI. Immediately search Vercel logs for `[notif-trace]`:
```bash
# In Vercel dashboard → Logs → Filter by: [notif-trace]
# Or via Vercel CLI:
vercel logs --filter "[notif-trace]"
```

---

## Hypothesis Tree — Post-Deploy Diagnosis

Match the last `[notif-trace]` line visible in logs to find the silent stopping point:

| Last trace seen | Root cause |
|-----------------|------------|
| `caller:before-dispatch` appears but `dispatchNotification:start` does NOT | The await was dropped by the runtime before entering the function — Server Action terminated mid-flight. The synchronous await from quick-338 did not hold the process. |
| `dispatchNotification:start` appears but `template:fetched` does NOT | The `findUnique` DB query hung or threw before logging — check DB connection pool saturation. |
| `template:fetched found=false` | The `NotificationTemplate` row for `load.assigned` is missing — seed migration never ran or was rolled back. |
| `template:fetched found=true isActive=false` | Template exists but is globally disabled — check the NotificationTemplate row's `isActive` field. |
| `settings:fetched found=true isActive=false` | Tenant has disabled the `load.assigned` trigger — check `TenantNotificationSettings`. |
| `recipients:resolved count=0` | `resolveRecipients()` returned zero recipients — the driver has no User row, or the `defaultRecipients` rule on the template doesn't match. |
| `content:picked` appears but `render:start` does NOT | `cachedHtml` is null — the template's `defaultHtmlCache` field is empty (seed migration ran but `htmlCache` was not populated). |
| `render:start` appears but `render:done` does NOT | `renderTemplate()` hung or threw — likely a Tiptap/HTML rendering crash. Check `dispatchNotification:catastrophic`. |
| `recipient:start` appears but `recipient:done` does NOT | A per-recipient operation hung (resend.emails.send stalled, or writeInAppNotification hung). The per-recipient catch did not fire. |
| `recipient:done sent=0 skipped=2 failed=0` | Both channels skipped — user pref or idempotency. Check idempotency key collisions. |
| `audit:writing entries=N` appears but `audit:done` does NOT | `writeAuditLog()` hung — likely a bypass_rls transaction deadlock or DB timeout. |
| `audit:done` + `dispatchNotification:done sent=1` appear | Dispatch completed and audit written — but `NotificationSendLog` rows still missing. Means `writeAuditLog` itself silently swallowed errors. Escalate to audit-log writer investigation. |
| `caller:after-dispatch` appears | The full dispatch pipeline completed from the caller's perspective. If no rows in DB after this, the `writeAuditLog` transaction was committed but RLS or schema mismatch silently dropped the insert. |
| `dispatchNotification:catastrophic` appears | An exception reached the outer catch — message and stack are logged. This is the first time we'll have a stack trace for the outer failure. |

---

## Deviations from Plan

None — plan executed exactly as written. The `content:picked` trace was placed after `subjectTemplate` declaration and before the `if (!cachedHtml)` guard as specified. The `recipients:none` trace uses an if-block without a return as specified. All 16 dispatcher traces and 2 caller traces match the spec.

## Self-Check: PASSED

- `apps/web/src/lib/notifications/dispatcher.ts` — modified, contains 16 `[notif-trace]` occurrences
- `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` — modified, contains 2 `[notif-trace] caller:` occurrences
- Commit `64c30a9` exists in `git log --oneline -1`
- `origin/master` in sync (`git log origin/master..HEAD` is empty after push)
