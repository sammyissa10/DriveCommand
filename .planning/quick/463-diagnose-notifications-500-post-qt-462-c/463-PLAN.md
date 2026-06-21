---
phase: quick-463
plan: 463
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: false
must_haves:
  truths:
    - "The verbatim Vercel/Sentry error for GET /api/v1/carrier/notifications is captured (exact message + stack)"
    - "Root cause is classified: connection exhaustion (QT-462 regression) vs a distinct bug (schema drift, RLS, query shape)"
    - "A clear verdict states why /notifications still 500s while /dispatches and /messages were fixed by QT-462"
  artifacts: []
  key_links: []
---

<objective>
Diagnose why `GET /api/v1/carrier/notifications` is STILL returning 500 every minute (20:20-20:29 UTC and ongoing) after QT-462 (dpl_C5oqpqLx2mp1YCvPyMjdQcA68qnx) fixed the same symptom on `/dispatches` and `/messages` by adding `idleTimeoutMillis:10000` to the pg.Pool.

Purpose: Determine whether this is leftover connection exhaustion (QT-462 incomplete) or a distinct bug masked by the connection storm. The notifications route is structurally identical to the fixed routes (uses `getSession` -> `getTenantPrisma` -> Prisma model query inside try/catch returning generic 500), so a different root cause is suspected.

Output: A diagnostic report (returned to the user, NOT written as a file) containing the verbatim error and classified root cause. READ-ONLY: no code changes, no fixes, no commits.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/462-urgent-prod-500-emaxconnsession-pooler-fix/462-SUMMARY.md
@apps/web/src/app/api/v1/carrier/notifications/route.ts
@apps/web/src/lib/context/tenant-context.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Capture the verbatim production error</name>
  <files>(read-only — no files modified)</files>
  <action>
    Pull the exact error for GET /api/v1/carrier/notifications from production. Do NOT guess the error — capture it verbatim.

    1. Use the Supabase MCP `get_logs` tool (service: `postgres` and `api`/`edge` as available) scoped to the 20:20-20:29 UTC window and ongoing, filtering for the notifications route or inAppNotification table. Capture exact error text, SQLSTATE code, and any Postgres-side message.
    2. If the user has Vercel/Sentry access, instruct them to copy the verbatim runtime error + stack from the Vercel function logs (or Sentry issue) for `GET /api/v1/carrier/notifications`. The route catches all errors and returns a generic `{ error: 'Internal server error' }` 500 (route.ts line 42-45) while logging via `logger.error` with the real `err` — so the real cause is in the server logs, not the HTTP response body.
    3. Record: exact error message, error class/name, SQLSTATE (if Postgres), stack frame, and whether it originates from `prisma.$executeRawUnsafe` (the set_config GUC call in getTenantPrisma, line 54) or from the `inAppNotification.findMany/count` queries (route.ts line 22-39).

    Capture the error text verbatim. No paraphrasing, no fixes.
  </action>
  <verify>Verbatim error string (with SQLSTATE if Postgres) is in hand and attributable to a specific line/call.</verify>
  <done>The exact production error for the notifications route is captured, not inferred.</done>
</task>

<task type="auto">
  <name>Task 2: Classify root cause — connection vs distinct bug</name>
  <files>(read-only — no files modified)</files>
  <action>
    With the verbatim error from Task 1, classify the root cause against three hypotheses. Do NOT fix anything.

    Hypothesis A — Connection exhaustion / QT-462 regression:
    - Error mentions EMAXCONNSESSION, "remaining connection slots", "too many clients", pool timeout, or connection terminated.
    - If so, explain why /notifications still hits it while /dispatches and /messages don't (e.g. notifications polls every 60s adding pool pressure, or QT-462's idleTimeoutMillis didn't fully resolve the pooler exhaustion). Confirm the deployed prisma.ts actually carries the idleTimeoutMillis fix.

    Hypothesis B — Schema drift (HIGH PRIORITY given project history):
    - Error is P2022 (column does not exist), P2021 (table does not exist), 42703 (undefined_column), or 42P01 (undefined_table) for `InAppNotification` / `in_app_notification`.
    - Cross-check `inAppNotification` model in apps/web/prisma/schema.prisma against the live prod schema via Supabase MCP `list_tables` (columns: orgId, userId, read, createdAt, plus any soft-delete columns). The project has a documented P2022 schema-drift incident (2026-05-30, QT-417/418) and recent QT-459/460/461 drift investigations — verify whether the prod `in_app_notification` table is missing columns the Prisma query selects.
    - Note: /dispatches and /messages hit DIFFERENT tables, so a notifications-table-only drift would explain why ONLY this route still 500s after QT-462.

    Hypothesis C — RLS / GUC / query-shape bug:
    - Error relates to RLS policy denial, the set_config GUC pool-leak pattern (documented QT-413), or the OR/userFilter query (route.ts line 19-37). Check whether `in_app_notification` has an app_user GRANT and a working RLS policy using current_tenant_id().

    Use Supabase MCP `list_tables` and `get_advisors` (security + performance) to gather evidence. Pick the hypothesis the verbatim error supports; explicitly rule out the others with evidence.

    READ-ONLY. No schema changes, no migrations, no code edits.
  </action>
  <verify>Exactly one root-cause hypothesis is selected and supported by the captured error + live schema/log evidence; the other two are ruled out.</verify>
  <done>Root cause classified with evidence; clear explanation of why /notifications differs from the QT-462-fixed routes.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>A diagnostic report: verbatim error + classified root cause + reason /notifications still 500s post-QT-462.</what-built>
  <how-to-verify>
    Review the returned report. Confirm it contains:
    1. The verbatim production error (exact text + SQLSTATE/error code).
    2. A single classified root cause (Connection / Schema drift / RLS-GUC-query) with supporting evidence.
    3. A clear statement of why this route still 500s while /dispatches and /messages were fixed by QT-462.
    4. NO code changes, NO fixes, NO commits were made (read-only diagnostic confirmed).
  </how-to-verify>
  <resume-signal>Type "approved" to accept the diagnosis, or describe what needs deeper investigation.</resume-signal>
</task>

</tasks>

<verification>
- Verbatim error captured from Supabase/Vercel logs (not inferred from the generic 500 body).
- Root cause classified against the three hypotheses with live-schema/log evidence.
- Confirmed zero code changes, zero migrations, zero commits (read-only).
</verification>

<success_criteria>
- The exact production error for GET /api/v1/carrier/notifications is documented verbatim.
- Root cause is classified: connection exhaustion (QT-462 regression) vs distinct bug (schema drift / RLS / query).
- The report explains why this route still 500s while /dispatches and /messages were fixed.
- No fixes applied — diagnosis only, ready for a follow-up fix task.
</success_criteria>

<output>
Return the diagnostic findings DIRECTLY as the final assistant message (verbatim error + root cause + why-it-differs). Do NOT write a report .md file. Then update `.planning/STATE.md` with a quick-task row for 463 (diagnostic verdict + commit hash of the STATE.md doc commit only — no code commit).
</output>
