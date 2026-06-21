---
phase: quick-457
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: false
must_haves:
  truths:
    - "All NotificationTemplate rows have non-null defaultHtmlCache in production"
    - "driver.invited and any other previously-NULL triggers now send email successfully"
  artifacts:
    - path: "apps/web/scripts/backfill-notification-html-cache.ts"
      provides: "One-shot backfill script — reads existing, no app code changes"
  key_links:
    - from: "scripts/backfill-notification-html-cache.ts"
      to: "prisma.notificationTemplate"
      via: "findMany where defaultHtmlCache IS NULL + update per row"
      pattern: "defaultHtmlCache.*null"
---

<objective>
Diagnose the full scope of NULL defaultHtmlCache in production, understand root cause, and run the established backfill script to fix all affected NotificationTemplate rows.

Purpose: dispatchNotification silently fails (logs FAILED, returns {failed:1} without throwing) when defaultHtmlCache is NULL — callers report success but no email is sent. driver.invited is confirmed broken in production.
Output: All NotificationTemplate rows have populated defaultHtmlCache; all triggers fire email correctly.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/scripts/backfill-notification-html-cache.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scope — query production for all NULL defaultHtmlCache rows</name>
  <files></files>
  <action>
    Use Supabase MCP to run a raw SQL query against production:

    ```sql
    SELECT id, "triggerKey", "isActive", "defaultHtmlCache" IS NULL AS cache_is_null
    FROM "NotificationTemplate"
    ORDER BY "triggerKey";
    ```

    Report the full result set. Count how many rows have cache_is_null = true. These are all silently broken triggers.

    No writes — read-only diagnostic.
  </action>
  <verify>Query returns results and you can identify the complete list of NULL-cache triggers.</verify>
  <done>Full list of affected triggerKeys reported with count (e.g., "N of M templates have NULL cache").</done>
</task>

<task type="auto">
  <name>Task 2: Root cause — why does driver.invited go NULL</name>
  <files></files>
  <action>
    Read apps/web/prisma/seeds/seed-notifications.ts (already loaded in context above).

    The seed script's UPDATE path (lines 102–114) writes: category, displayName, description, defaultSubject, defaultBlockJson, availableVariables, defaultRecipients — but does NOT write defaultHtmlCache.

    This means: every time seed:notifications is re-run, existing rows get defaultBlockJson updated but defaultHtmlCache is NOT regenerated and NOT preserved (it is left as-is if it was already populated, but if it was somehow NULL it stays NULL). The cache goes NULL if:
    1. The row was first created before the backfill script was run (INSERT path in seed also omits defaultHtmlCache), OR
    2. The sysadmin save-flow in apps/web/src/app/(admin)/actions/notifications.ts writes defaultHtmlCache: data.cachedHtml — if cachedHtml was undefined/null from the UI, it would overwrite a good cache with NULL.

    Report the finding: "Seed UPDATE path does not write defaultHtmlCache. Rows seeded before the backfill script ran have no cache. Additionally, if the admin save action receives a null cachedHtml it overwrites the cache."

    No code changes — read-only finding.
  </action>
  <verify>Root cause explanation is coherent and matches both the seed script and admin save-flow code.</verify>
  <done>Root cause documented in task output. No files modified.</done>
</task>

<task type="auto">
  <name>Task 3: Confirm backfill script scope (read-only check)</name>
  <files></files>
  <action>
    Confirm from reading apps/web/scripts/backfill-notification-html-cache.ts (already loaded above):
    - It queries WHERE defaultHtmlCache IS NULL only (does not touch rows that already have a cache)
    - It only writes defaultHtmlCache (no changes to isActive, recipients, subject, blockJson, or any other field)
    - It uses DIRECT_URL (bypasses pgbouncer) — correct for a script

    Report: "Script confirmed safe — only populates defaultHtmlCache on NULL rows, no other fields touched."
  </action>
  <verify>Confirmation matches the actual script source code.</verify>
  <done>Scope confirmed; cleared to run against production.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Tasks 1-3 are read-only diagnostics. The full scope of broken triggers and root cause are now known. Task 4 (running the backfill) will write to production.
  </what-built>
  <how-to-verify>
    Review the output of Tasks 1-3:
    1. Confirm the list of NULL-cache triggers makes sense.
    2. Confirm the root cause explanation is understood.
    3. Confirm you are ready to run the backfill script against production.
  </how-to-verify>
  <resume-signal>Type "run backfill" to proceed, or describe concerns.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Run backfill script against production</name>
  <files></files>
  <action>
    From the apps/web directory, run:

    ```
    npx tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts
    ```

    The script will:
    1. Print "[backfill] found N NotificationTemplate rows with NULL defaultHtmlCache"
    2. For each row: print "[backfill] {triggerKey} -> {N} chars cached"
    3. Print "[backfill] done"

    Capture and report the full console output.
  </action>
  <verify>Script exits with code 0. No "[backfill] FAILED" lines appear in output.</verify>
  <done>All previously-NULL rows report a cache write. Script completes with "[backfill] done".</done>
</task>

<task type="auto">
  <name>Task 5: Post-backfill verification — confirm zero NULL rows remain</name>
  <files></files>
  <action>
    Use Supabase MCP to run the same diagnostic query as Task 1:

    ```sql
    SELECT id, "triggerKey", "isActive", "defaultHtmlCache" IS NULL AS cache_is_null
    FROM "NotificationTemplate"
    ORDER BY "triggerKey";
    ```

    Verify that cache_is_null = false for ALL rows (especially driver.invited and any other rows that were NULL in Task 1).

    Report before/after counts: "Before: N NULL. After: 0 NULL."
  </action>
  <verify>Zero rows have cache_is_null = true in the post-backfill query result.</verify>
  <done>All NotificationTemplate rows have non-null defaultHtmlCache. driver.invited and all other previously-broken triggers will now dispatch email successfully.</done>
</task>

</tasks>

<verification>
- SQL query (Task 1) shows the complete NULL-cache trigger list
- Root cause identified (Task 2): seed UPDATE path omits defaultHtmlCache; admin save-flow can also write NULL
- Backfill script confirmed to only touch defaultHtmlCache on NULL rows (Task 3)
- Script runs cleanly with zero FAILED lines (Task 4)
- Post-backfill SQL confirms 0 NULL rows remain (Task 5)
</verification>

<success_criteria>
- Before count: N rows with NULL defaultHtmlCache (N >= 1, driver.invited confirmed)
- After count: 0 rows with NULL defaultHtmlCache
- No application code changed
- dispatchNotification will now find a populated cache for all active triggers
</success_criteria>

<output>
After completion, create `.planning/quick/457-backfill-null-defaulthtmlcache-for-notif/457-SUMMARY.md`
</output>
