---
phase: quick-339
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/dispatcher.ts
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
autonomous: true

must_haves:
  truths:
    - "Every meaningful step in dispatchNotification emits a [notif-trace] console.log line"
    - "The createAssignment caller emits [notif-trace] lines immediately before and after the await dispatchNotification call"
    - "No PII (emails, full names, payload content) appears in any [notif-trace] line — only IDs, counts, booleans, and enum-like tokens"
    - "All existing dispatcher behavior is preserved bit-for-bit — no control flow, return shape, or signature changes"
    - "TypeScript strict mode compiles clean: npx tsc --noEmit from apps/web returns exit 0"
    - "Existing notification unit tests still pass: npx vitest run __tests__/notifications/ green"
  artifacts:
    - path: "apps/web/src/lib/notifications/dispatcher.ts"
      provides: "Instrumented dispatcher with 16 [notif-trace] log statements"
      contains: "[notif-trace]"
      min_trace_lines: 16
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "Caller traces around createAssignment dispatchNotification call"
      contains: "[notif-trace] caller:"
      min_trace_lines: 2
  key_links:
    - from: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "await dispatchNotification('load.assigned', ...)"
      pattern: "\\[notif-trace\\] caller:before-dispatch.*\\[notif-trace\\] dispatchNotification:start"
    - from: "console.log [notif-trace] lines"
      to: "Vercel runtime logs"
      via: "stdout — Next.js Server Action runtime forwards console output to Vercel logs"
      pattern: "\\[notif-trace\\]"
---

<objective>
Add explicit [notif-trace] diagnostic logging to the notification dispatcher and the createAssignment caller so the next production click leaves a complete paper trail in Vercel logs.

Purpose: After three rounds of fixes (quick-336/337/338), NotificationSendLog rows are still missing in production despite a fresh assignment row at 02:28:12 UTC and no [notifications] errors in any log window. We have run out of guesses — we need ground truth. This task wires observability into every meaningful step so the next dispatch attempt tells us exactly where execution stops (template missing? settings inactive? zero recipients? render fail? silent process termination after the await?).

Output: An instrumented dispatcher.ts with 16+ trace points and a caller in load-driver-assignments.ts with 2 caller-side trace points. Zero behavior change. Ready to deploy and observe.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/338-convert-server-action-dispatchnotificati/338-PLAN.md

# Files being modified — read in full before editing
@apps/web/src/lib/notifications/dispatcher.ts
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Instrument dispatcher.ts with 16 [notif-trace] log lines</name>
  <files>apps/web/src/lib/notifications/dispatcher.ts</files>
  <action>
Open `apps/web/src/lib/notifications/dispatcher.ts` and add exactly 16 `[notif-trace]` log statements at the precise insertion points listed below. All lines use `console.log` EXCEPT trace #16 (catastrophic failure) which uses `console.error`. Use the exact prefix `[notif-trace]` (lowercase, hyphenated, in brackets).

Constraints (NON-NEGOTIABLE):
- DO NOT change any existing logic, control flow, return shape, function signature, or error handling
- DO NOT add try/catch wrappers
- DO NOT remove any existing console.error lines (the two `[notifications] ...` lines at outerErr and per-recipient catch remain untouched)
- DO NOT log PII — no `r.email`, no `r.name`, no `options.payload` contents, no `subjectFinal`, no `html`. Only IDs, counts, booleans, and enum-like tokens.
- TypeScript strict mode — all template literals must be safely typed. Use `String(x)` or known-string fields only.
- All new lines must be INSIDE the existing function body — do not move code around.

Insertion points (line numbers reference the file as it exists today; insert relative to the structural anchor, not the absolute line):

1. **Function entry** — immediately after `let failed = 0;` (~line 59), BEFORE the `try {` on line 61:
   ```ts
   console.log(`[notif-trace] dispatchNotification:start trigger=${triggerKey} tenant=${options.tenantId} hasPayload=${options.payload != null} hasRelatedEntity=${options.relatedEntity != null}`);
   ```

2. **After template fetch** — immediately after the `findUnique` block closes (after line 67 `});`), BEFORE the `if (!template || !template.isActive)` check on line 69:
   ```ts
   console.log(`[notif-trace] template:fetched found=${template != null} isActive=${template?.isActive ?? 'n/a'}`);
   ```

3. **Early return on missing/inactive template** — inside the `if (!template || !template.isActive)` block, immediately BEFORE the `return { sent, skipped, failed };` on line 81:
   ```ts
   console.log(`[notif-trace] dispatchNotification:exit reason=${!template ? 'skip:template_missing' : 'skip:template_inactive'} trigger=${triggerKey}`);
   ```

4. **After settings fetch** — immediately after the `findUnique` block closes (after line 89 `});`), BEFORE the `if (tenantSettings && tenantSettings.isActive === false)` check on line 93:
   ```ts
   console.log(`[notif-trace] settings:fetched found=${tenantSettings != null} isActive=${tenantSettings?.isActive ?? 'n/a'}`);
   ```

5. **Early return on inactive settings** — inside the `if (tenantSettings && tenantSettings.isActive === false)` block, immediately BEFORE the `return { sent, skipped, failed };` on line 105:
   ```ts
   console.log(`[notif-trace] dispatchNotification:exit reason=skip:settings_inactive trigger=${triggerKey}`);
   ```

6. **After recipient resolution** — immediately after the `await resolveRecipients(...)` call closes (after line 118 `);`), BEFORE the Steps 4-5 comment block:
   ```ts
   console.log(`[notif-trace] recipients:resolved count=${recipients.length}`);
   ```

7. **Early return on zero recipients** — NOTE: the current code does NOT short-circuit on zero recipients (the for loop simply iterates zero times). DO NOT add a new return. Instead, place this trace immediately after trace #6, inside an `if (recipients.length === 0)` that emits the trace and falls through (no return added):
   ```ts
   if (recipients.length === 0) {
     console.log(`[notif-trace] recipients:none trigger=${triggerKey} reason=skip:no_recipients`);
   }
   ```
   Rationale: spec asks for a "skip:no_recipients" trace; preserving behavior means we do NOT add a return, we only emit the trace. The for-loop body below will simply not execute.

8. **After template content picked** — immediately after the `const subjectTemplate = ...` line (~line 124), BEFORE the `if (!cachedHtml)` check on line 126:
   ```ts
   console.log(`[notif-trace] content:picked source=${tenantSettings?.customHtmlCache != null ? 'custom' : 'default'}`);
   ```

9. **Before render** — immediately AFTER the `if (!cachedHtml) { ... return ... }` block closes (after line 139 `}`), BEFORE the `const { html, subjectFinal } = await renderTemplate(...)` on line 141:
   ```ts
   console.log(`[notif-trace] render:start`);
   ```

10. **After render** — immediately after the `await renderTemplate(...)` call closes (after line 145 `);`), BEFORE the Steps 6-9 comment block:
    ```ts
    console.log(`[notif-trace] render:done html_length=${html.length}`);
    ```

11. **Per recipient iteration (start)** — inside the `for (const r of recipients)` loop, immediately after `try {` on line 151, BEFORE the Step 6a comment. Derive a channel token from preferences:
    ```ts
    console.log(`[notif-trace] recipient:start userId=${r.userId ?? 'null'} hasEmail=${r.emailEnabled} hasInApp=${r.userId !== null && r.inAppEnabled}`);
    ```
    Note: spec asks for `channel=EMAIL|IN_APP` but each recipient may have both channels enabled simultaneously. Logging both booleans is more accurate and contains no PII.

12. **Per recipient outcome (done)** — at the end of the per-recipient `try { ... }` block, immediately BEFORE the closing `} catch (perRecipientErr) {` on line 309. Track per-recipient outcome by snapshotting counters at the top of the iteration:
    - At the very start of the `for (const r of recipients)` body, BEFORE the `try {` on line 151, capture pre-iteration counters:
      ```ts
      const _preSent = sent, _preSkipped = skipped, _preFailed = failed;
      ```
    - Immediately BEFORE the `} catch (perRecipientErr) {` on line 309, emit:
      ```ts
      console.log(`[notif-trace] recipient:done userId=${r.userId ?? 'null'} sent=${sent - _preSent} skipped=${skipped - _preSkipped} failed=${failed - _preFailed}`);
      ```

13. **Before writeAuditLog call** — inside the `finally` block (line 324), immediately BEFORE `await writeAuditLog(db, audits);` on line 326:
    ```ts
    console.log(`[notif-trace] audit:writing entries=${audits.length}`);
    ```

14. **After writeAuditLog returns** — immediately AFTER `await writeAuditLog(db, audits);` on line 326, still inside the `finally` block:
    ```ts
    console.log(`[notif-trace] audit:done`);
    ```

15. **Function exit** — immediately BEFORE the final `return { sent, skipped, failed };` on line 329 (the one OUTSIDE the try/catch/finally):
    ```ts
    console.log(`[notif-trace] dispatchNotification:done trigger=${triggerKey} sent=${sent} skipped=${skipped} failed=${failed}`);
    ```

16. **Catastrophic failure (in catch handler)** — inside the outer `catch (outerErr)` block, immediately AFTER the existing `console.error('[notifications] dispatch failed before fan-out', outerErr);` on line 322:
    ```ts
    console.error(`[notif-trace] dispatchNotification:catastrophic message=${(outerErr as Error)?.message ?? 'unknown'} stack=${((outerErr as Error)?.stack ?? '').slice(0, 500)}`);
    ```
    Note: stack is capped at 500 chars to avoid log spam. No PII risk since `outerErr` originates from template/settings fetch or render — none of those code paths contain user payload data in their error messages.

Verification scan: after editing, the file must contain exactly 16 occurrences of the literal string `[notif-trace]` (15 console.log + 1 console.error inside the catastrophic handler). Trace #7 contains the literal string once; trace #12 contains it once at recipient:done (the `_preSent` capture line is not a trace).

Acceptable count: between 16 and 17 occurrences (16 is the spec target; 17 is acceptable if the implementation chose to trace BOTH `recipient:start` channel breakdown lines separately — but the prescribed implementation yields exactly 16).
  </action>
  <verify>
From `apps/web`:
1. `grep -c "\[notif-trace\]" src/lib/notifications/dispatcher.ts` returns ≥ 16
2. `npx tsc --noEmit` exits 0
3. `npx vitest run __tests__/notifications/` — all existing tests still pass (count unchanged)
4. Diff review: `git diff apps/web/src/lib/notifications/dispatcher.ts` shows ONLY added lines (no deletions of existing logic, no modifications to existing lines except possibly trailing whitespace)
  </verify>
  <done>
- dispatcher.ts contains ≥ 16 `[notif-trace]` log statements at the specified insertion points
- One of those 16 is a `console.error` inside the outer catch (catastrophic failure)
- All 15 others are `console.log`
- No existing line was deleted or semantically modified
- No PII appears in any `[notif-trace]` line (no `r.email`, no `r.name`, no `subjectFinal`, no `html` content, no payload values)
- `npx tsc --noEmit` from apps/web exits 0
- `npx vitest run __tests__/notifications/` from apps/web exits 0
  </done>
</task>

<task type="auto">
  <name>Task 2: Add 2 [notif-trace] caller traces in load-driver-assignments.ts</name>
  <files>apps/web/src/app/(owner)/actions/load-driver-assignments.ts</files>
  <action>
Open `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` and add exactly 2 `[notif-trace]` lines around the `createAssignment` site's `dispatchNotification` call (currently at line 257).

Constraints (NON-NEGOTIABLE):
- ONLY modify the `createAssignment` function — DO NOT touch `updateAssignment`, `deleteAssignment`, `listAssignmentsForLoad`, or any other code
- DO NOT change behavior, return shape, control flow, or error handling
- Preserve the existing `.catch(...)` chained on `dispatchNotification`
- No PII — log only IDs

**Insertion point 1** — immediately BEFORE `await dispatchNotification('load.assigned', { ... })` on line 257 (still inside the `if (load && driver) {` block):
```ts
console.log(`[notif-trace] caller:before-dispatch trigger=load.assigned load=${loadId} driver=${cd.id}`);
```

**Insertion point 2** — immediately AFTER the entire `await dispatchNotification('load.assigned', { ... }).catch(...)` expression-statement closes (after the `;` on line 268), still inside the `if (load && driver) {` block, BEFORE the closing `}` of the if-block on line 269:
```ts
console.log(`[notif-trace] caller:after-dispatch trigger=load.assigned`);
```

The resulting structure should read:
```ts
if (load && driver) {
  console.log(`[notif-trace] caller:before-dispatch trigger=load.assigned load=${loadId} driver=${cd.id}`);
  // Synchronous await — quick-336 ... (existing comment block unchanged)
  await dispatchNotification('load.assigned', {
    // ... existing payload unchanged ...
  }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
  console.log(`[notif-trace] caller:after-dispatch trigger=load.assigned`);
}
```
  </action>
  <verify>
From `apps/web`:
1. `grep -c "\[notif-trace\] caller:" src/app/\(owner\)/actions/load-driver-assignments.ts` returns exactly 2
2. `npx tsc --noEmit` exits 0
3. `git diff apps/web/src/app/(owner)/actions/load-driver-assignments.ts` shows ONLY 2 added lines, both inside the `if (load && driver) { ... }` block of `createAssignment`
4. The existing `dispatchNotification(...).catch(...)` call is byte-identical to before
  </verify>
  <done>
- Exactly 2 `[notif-trace] caller:` log lines added in `createAssignment`
- Line 1 is `caller:before-dispatch` immediately before the await
- Line 2 is `caller:after-dispatch` immediately after the awaited promise (and its `.catch`) resolves
- No other functions or call sites modified
- No behavior change — the dispatch call, its payload, and its `.catch` are byte-identical
- `npx tsc --noEmit` from apps/web exits 0
  </done>
</task>

<task type="auto">
  <name>Task 3: Build + test gates and commit</name>
  <files>apps/web/src/lib/notifications/dispatcher.ts, apps/web/src/app/(owner)/actions/load-driver-assignments.ts</files>
  <action>
Run the full build + test gate from BOTH the apps/web directory and the monorepo root, then commit.

1. From `apps/web`:
   - `npx tsc --noEmit` — must exit 0
   - `npm run build` — must succeed (Next.js production build)
   - `npx vitest run __tests__/notifications/` — must exit 0 (all existing notification tests still pass)

2. From monorepo root (`C:/Users/sammy/Projects/DriveCommand`):
   - `npm run build` — must succeed (turborepo full build)

3. Manual scan:
   - `grep -c "\[notif-trace\]" apps/web/src/lib/notifications/dispatcher.ts` returns ≥ 16
   - `grep -c "\[notif-trace\] caller:" apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts` returns exactly 2

4. If all gates pass, commit using the GSD commit tool:
   ```
   node C:/Users/sammy/.claude/get-shit-done/bin/gsd-tools.js commit "chore(quick-task-339): add [notif-trace] diagnostic logging to dispatchNotification and createAssignment caller — pure observability, no behavior change" --files apps/web/src/lib/notifications/dispatcher.ts apps/web/src/app/(owner)/actions/load-driver-assignments.ts
   ```

5. Push to GitHub per project workflow rule:
   ```
   git push origin master
   ```

Do NOT deploy to Vercel in this task — the user will deploy manually after reviewing the diff. Diagnostic logs in production are a deliberate decision; the user must own the deploy click.
  </action>
  <verify>
- `npx tsc --noEmit` from apps/web: exit 0
- `npm run build` from apps/web: exit 0
- `npx vitest run __tests__/notifications/` from apps/web: exit 0
- `npm run build` from monorepo root: exit 0
- `git log -1 --oneline` shows the new commit with the prescribed message
- `git status` shows clean working tree
- `git rev-parse HEAD` matches what was pushed (verify with `git log origin/master..HEAD` — should be empty)
  </verify>
  <done>
- All TypeScript / build / test gates green at both scopes (apps/web and monorepo root)
- Commit landed with the exact prescribed message
- `git push origin master` completed successfully
- Working tree clean; local HEAD == origin/master
- User can now deploy via `vercel --prod` when ready and watch Vercel logs for `[notif-trace]` lines on the next load assignment click
  </done>
</task>

</tasks>

<verification>
Phase-wide checks (run after all 3 tasks complete):

1. **Trace count**: `apps/web/src/lib/notifications/dispatcher.ts` contains ≥ 16 occurrences of `[notif-trace]`.
2. **Caller count**: `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` contains exactly 2 occurrences of `[notif-trace] caller:`.
3. **Behavior preservation**:
   - `git diff master~1 master -- apps/web/src/lib/notifications/dispatcher.ts` shows ONLY additions (lines starting with `+`), zero `-` lines except possibly trailing whitespace.
   - Same for `load-driver-assignments.ts`.
4. **Type safety**: `npx tsc --noEmit` from apps/web exits 0.
5. **Build safety**: `npm run build` from apps/web AND from monorepo root both exit 0.
6. **Test safety**: `npx vitest run __tests__/notifications/` exits 0 with the same test count as before this change.
7. **PII audit**: `grep -E "\[notif-trace\].*(@|email|firstName|lastName|fullName|payload\.)" apps/web/src/lib/notifications/dispatcher.ts apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts` returns ZERO matches.
8. **Commit landed**: `git log --oneline -1` shows `chore(quick-task-339): add [notif-trace] diagnostic logging ...`.
9. **Remote in sync**: `git log origin/master..HEAD` is empty (HEAD pushed).
</verification>

<success_criteria>
- Dispatcher emits ≥ 16 `[notif-trace]` lines covering: function entry, template fetch, template skip, settings fetch, settings skip, recipients resolved, zero-recipient note, content picked, render start, render done, per-recipient start, per-recipient done, audit writing, audit done, function exit, catastrophic failure.
- Caller emits 2 `[notif-trace]` lines bracketing the createAssignment dispatchNotification call.
- Zero behavior change: existing tests pass, TypeScript clean, builds green, no existing line semantically modified.
- Zero PII in any new log line.
- Commit landed with the exact prescribed message and pushed to origin/master.
- Ready for user to `vercel --prod` and observe a real production click — the next failed dispatch will leave a complete paper trail showing exactly which step silently stops execution.
</success_criteria>

<output>
After completion, create `.planning/quick/339-instrument-dispatchnotification-with-not/339-SUMMARY.md` covering:

- **What changed**: file paths, line counts added, no deletions
- **Trace map**: numbered list mapping each of the 16 dispatcher traces + 2 caller traces to the step they instrument
- **Behavior preservation evidence**: `tsc --noEmit` output, vitest output, build output (all green)
- **PII audit**: grep result confirming zero PII leaks
- **Next action for user**: `vercel --prod` to deploy, then trigger a load assignment in production and grep Vercel logs for `[notif-trace]` to find the silent stopping point
- **Hypothesis tree to validate post-deploy**: which trace line absence corresponds to which root cause (e.g., `dispatchNotification:start` missing → call site never reached; `template:fetched` missing → DB query hung; `recipients:resolved count=0` → recipient resolver bug; `audit:writing` reached but no row in DB → writeAuditLog or bypass_rls failure; nothing after `caller:before-dispatch` → process terminated mid-await — the very thing waitUntil and the sync await were both supposed to fix)
</output>
