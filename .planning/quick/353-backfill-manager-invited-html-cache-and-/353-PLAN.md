---
phase: 353-backfill-manager-invited-html-cache-and-
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
autonomous: true

must_haves:
  truths:
    - "NotificationTemplate row for manager.invited has non-null defaultHtmlCache"
    - "Future runs of seed:notifications automatically refresh the HTML cache via the backfill script"
    - "apps/web typechecks cleanly after the package.json change"
  artifacts:
    - path: "apps/web/package.json"
      provides: "Chained seed:notifications script (seed + backfill)"
      contains: "scripts/backfill-notification-html-cache.ts"
  key_links:
    - from: "apps/web/package.json::scripts.seed:notifications"
      to: "apps/web/scripts/backfill-notification-html-cache.ts"
      via: "npm script chain (&&)"
      pattern: "seed-notifications\\.ts && tsx --env-file=\\.env\\.local scripts/backfill-notification-html-cache\\.ts"
---

<objective>
Fix the silently-failing manager.invited notification trigger by backfilling its HTML cache and prevent the regression in future seeds by chaining the backfill into the seed:notifications npm script.

Purpose: Quick task 352 added manager.invited but left defaultHtmlCache NULL. The dispatcher short-circuits at the HTML cache check, so manager invitation emails are never sent. Running the backfill once fixes the existing row; chaining the backfill into seed:notifications prevents the same gap when future templates are added.

Output:
- manager.invited row in NotificationTemplate has populated defaultHtmlCache
- apps/web/package.json's seed:notifications runs the seed AND the backfill
- TypeScript still compiles cleanly
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/353-backfill-manager-invited-html-cache-and-/353-CONTEXT.md
@apps/web/package.json
@apps/web/scripts/backfill-notification-html-cache.ts
@apps/web/prisma/seeds/seed-notifications.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run the HTML cache backfill for manager.invited and verify</name>
  <files>(no files modified — script execution + DB verification only)</files>
  <action>
    1. Confirm package manager: read the monorepo root package.json (`C:/Users/sammy/Projects/DriveCommand/package.json`) and check for `pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json` at repo root and inside `apps/web/`. Note which is used (likely pnpm based on Turborepo setup).

    2. Read `apps/web/package.json` and quote the EXACT current value of the `seed:notifications` script verbatim in your task summary. Do not modify it yet.

    3. Run the backfill from the apps/web directory. Use a single Bash call with an absolute cd:
       ```
       cd "C:/Users/sammy/Projects/DriveCommand/apps/web" && npx tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts
       ```
       Capture stdout and stderr. If the script reports errors for any template OTHER than manager.invited, surface them but do not attempt to fix them (out of scope).

    4. Verify the backfill succeeded using the Supabase MCP `execute_sql` tool. Run EXACTLY this query:
       ```sql
       SELECT "triggerKey", LENGTH("defaultHtmlCache") AS html_length
       FROM "NotificationTemplate"
       WHERE "triggerKey" IN ('manager.invited', 'driver.invited');
       ```
       Confirm:
       - manager.invited row has html_length > 0 (NOT null)
       - driver.invited row html_length is unchanged from what the backfill reports (do NOT modify it)

    Constraints:
    - Do NOT run `seed:notifications` itself — only the backfill script
    - Do NOT modify the backfill script, the seed script, the dispatcher, sender, or any trigger registration code
    - Do NOT delete any NotificationSendLog rows
    - Do NOT modify manager.invited template content (subject, body, etc.) — only its HTML cache should change
  </action>
  <verify>
    Supabase MCP query returns html_length > 0 for manager.invited. Backfill script stdout shows a success line for manager.invited (e.g., "Updated manager.invited" or equivalent — check actual script output format).
  </verify>
  <done>
    NotificationTemplate.defaultHtmlCache for triggerKey='manager.invited' is non-null and non-empty. driver.invited row is untouched. No other tables modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Chain backfill into seed:notifications + typecheck</name>
  <files>apps/web/package.json</files>
  <action>
    1. Edit `apps/web/package.json`. Locate the `seed:notifications` script in the `"scripts"` object and replace its value with EXACTLY:
       ```
       "seed:notifications": "tsx --env-file=.env.local prisma/seeds/seed-notifications.ts && tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts"
       ```
       Notes:
       - Use the Edit tool with the exact old string (from Task 1 step 2) and the exact new string above
       - Do NOT touch any other script in the file
       - Do NOT touch any other key (name, version, dependencies, devDependencies, etc.)
       - Preserve existing JSON formatting (indentation, trailing comma rules)

    2. Confirm the edit by re-reading the modified `seed:notifications` line.

    3. Run TypeScript check from apps/web:
       ```
       cd "C:/Users/sammy/Projects/DriveCommand/apps/web" && npx tsc --noEmit
       ```
       Must complete with zero errors. If errors appear that are unrelated to this change, note them in the summary but do not attempt to fix them — confirm they pre-existed by checking git status/diff scope.

    Constraints:
    - Do NOT run `seed:notifications` after editing — only verify the script text and run tsc
    - Do NOT modify any other npm scripts
    - Do NOT modify apps/web/scripts/backfill-notification-html-cache.ts
    - Do NOT modify apps/web/prisma/seeds/seed-notifications.ts
  </action>
  <verify>
    `apps/web/package.json` shows the chained script exactly as specified. `npx tsc --noEmit` from apps/web exits with code 0.
  </verify>
  <done>
    seed:notifications is the exact chained command; tsc --noEmit passes; no other files modified.
  </done>
</task>

</tasks>

<verification>
- manager.invited NotificationTemplate row has populated defaultHtmlCache (verified via Supabase MCP SQL)
- apps/web/package.json contains the exact chained seed:notifications command
- `npx tsc --noEmit` in apps/web exits 0
- git diff shows ONLY apps/web/package.json modified (no other files)
- driver.invited template row is untouched
</verification>

<success_criteria>
- [ ] Backfill script ran successfully against the local/Supabase DB
- [ ] Supabase MCP confirms manager.invited.defaultHtmlCache IS NOT NULL and LENGTH > 0
- [ ] apps/web/package.json's seed:notifications now chains seed + backfill exactly as specified
- [ ] TypeScript compiles clean from apps/web
- [ ] No untouched files were modified (only apps/web/package.json on disk)
- [ ] Manager invitation emails would now pass the dispatcher's HTML cache check (verified by non-null cache)
</success_criteria>

<output>
After completion, create `.planning/quick/353-backfill-manager-invited-html-cache-and-/353-SUMMARY.md` documenting:
- Old vs new seed:notifications value
- Backfill script output (relevant lines)
- Supabase query result table (triggerKey + html_length for both rows)
- tsc result
- Git diff scope (file count + paths)
</output>
