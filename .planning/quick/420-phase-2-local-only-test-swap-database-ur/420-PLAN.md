---
phase: quick-420
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/.env.local
  - apps/web/scripts/audit/phase2-local-test-checklist.md
autonomous: true
no_commit: true

must_haves:
  truths:
    - "apps/web/.env.local DATABASE_URL points to the app_user connection string"
    - "Original postgres superuser DATABASE_URL is preserved as a commented backup line for one-step revert"
    - "DATABASE_URL_APP_USER line remains untouched"
    - "phase2-local-test-checklist.md exists and contains every section verbatim per task spec"
    - "User is told exactly how to restart the dev server, work through the checklist, and revert"
    - "Nothing is committed, pushed, or deployed"
  artifacts:
    - path: "apps/web/.env.local"
      provides: "Local DATABASE_URL swapped to app_user with commented backup of postgres URL above it"
      contains: "ORIGINAL_DATABASE_URL_BACKUP_2026-06-02"
    - path: "apps/web/scripts/audit/phase2-local-test-checklist.md"
      provides: "Local Phase 2 test checklist covering setup, smoke tests, cross-tenant isolation, write path, driver portal, settlement PDFs, final checks, and revert instructions"
      contains: "Phase 2 Local Test Checklist"
  key_links:
    - from: "apps/web/.env.local DATABASE_URL"
      to: "value of DATABASE_URL_APP_USER"
      via: "direct string copy from existing DATABASE_URL_APP_USER line"
      pattern: "DATABASE_URL=\"postgresql://app_user"
    - from: "phase2-local-test-checklist.md Revert Instructions"
      to: ".env.local backup comment marker"
      via: "comment marker text"
      pattern: "ORIGINAL_DATABASE_URL_BACKUP_2026-06-02"
---

<objective>
Swap the local DATABASE_URL in apps/web/.env.local to the app_user connection string and create a structured local test checklist for Phase 2 RLS cutover validation.

Purpose: Before flipping production to app_user (Phase 2 cutover), the app must be exercised locally as app_user to surface every missing GRANT, RLS gap, or query that depends on the postgres superuser. The backup comment makes revert a 2-line edit; the checklist makes the verification systematic instead of ad-hoc.

Output:
- apps/web/.env.local modified in place (DATABASE_URL now points to app_user, original kept as commented backup)
- apps/web/scripts/audit/phase2-local-test-checklist.md created
- Clear instructions printed to user on how to restart dev server, run the checklist, and revert
- ZERO commits, ZERO pushes, ZERO deploys, ZERO application code changes
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Read these to understand the Phase 1 grants that just shipped and the GUC pool-leak constraint
# (informational only — do NOT modify anything from them in this task)
# - Quick-419 SUMMARY: app_user has full DML on 83 tenant-scoped tables
# - Quick-413: GUC set_config pool-leak constraint still open (irrelevant to local single-session test)

# The file being modified
@apps/web/.env.local
</context>

<tasks>

<task type="auto">
  <name>Task 1: Swap local DATABASE_URL to app_user with revert-friendly backup comment</name>
  <files>apps/web/.env.local</files>
  <action>
Read apps/web/.env.local. Locate the existing DATABASE_URL line and the DATABASE_URL_APP_USER line.

Capture the exact current value of DATABASE_URL (the postgres superuser connection string starting with `postgresql://postgres.oqdhberkghtnszrkdvfm:...`) and the exact current value of DATABASE_URL_APP_USER (starting with `postgresql://app_user...`).

Edit apps/web/.env.local so the DATABASE_URL block looks like this (preserve all other env vars exactly as they were):

```
# ORIGINAL_DATABASE_URL_BACKUP_2026-06-02 (revert by uncommenting and commenting out the line below):
# DATABASE_URL="<EXACT original postgres superuser string here>"
DATABASE_URL="<EXACT value from DATABASE_URL_APP_USER here>"
```

Rules:
- The DATABASE_URL_APP_USER line MUST remain in the file untouched, in its original position.
- Do NOT change any other env var (Supabase keys, R2, SMTP, Upstash, Sentry, etc.).
- Do NOT add or remove blank lines elsewhere.
- The backup comment line MUST contain the literal marker `ORIGINAL_DATABASE_URL_BACKUP_2026-06-02` so the checklist's revert instructions can reference it.
- Use the Read tool first, then Edit (not Write) to make surgical changes — .env.local has secrets that must not be reconstructed.

Why this shape: the backup is one line above the live line, so revert is a 2-edit toggle (uncomment backup, comment live). No shell scripts, no separate backup file (which could accidentally get committed).

DO NOT git add this file. DO NOT commit. .env.local is gitignored but explicit safety still applies.
  </action>
  <verify>
Read apps/web/.env.local back and confirm all three of:
1. A line exists matching `# ORIGINAL_DATABASE_URL_BACKUP_2026-06-02`
2. A commented `# DATABASE_URL="postgresql://postgres.` line exists directly below the marker
3. An uncommented `DATABASE_URL="postgresql://app_user` line exists directly below the commented one
4. The original `DATABASE_URL_APP_USER="postgresql://app_user...` line is still present unchanged
5. `git status apps/web/.env.local` shows the file as ignored (no staging)
  </verify>
  <done>apps/web/.env.local has DATABASE_URL pointing to the app_user string, the original postgres string preserved as a commented backup with the dated marker, DATABASE_URL_APP_USER unchanged, and no other env var touched.</done>
</task>

<task type="auto">
  <name>Task 2: Create phase2-local-test-checklist.md</name>
  <files>apps/web/scripts/audit/phase2-local-test-checklist.md</files>
  <action>
Create apps/web/scripts/audit/phase2-local-test-checklist.md with the EXACT content below. Do not paraphrase, reorder, or add sections. The user will work through this checklist in their browser after restarting the dev server.

```markdown
# Phase 2 Local Test Checklist

**DO NOT proceed to production cutover until every item passes.**

---

## Section 1: Setup

- [ ] dev server starts without error (`npm run dev` from `apps/web`)
- [ ] `/login` page loads
- [ ] Sign in as `owner@test.com` / `TestPass123!` succeeds

---

## Section 2: Core Page Smoke Tests

> Check each page — look for 500s in the browser network tab and server errors in the terminal.

- [ ] `/carrier/dashboard` — loads without error
- [ ] `/carrier/loads` — data appears
- [ ] `/carrier/dispatches` — data appears
- [ ] `/carrier/clients` — data appears or correct empty state
- [ ] `/carrier/drivers` — data appears
- [ ] `/carrier/trucks` — data appears
- [ ] `/carrier/routes` — data appears
- [ ] `/carrier/contracts` — data appears
- [ ] `/carrier/reports/revenue` — loads without error
- [ ] `/carrier/driver-pay` — assignments visible
- [ ] `/carrier/driver-pay/settlements` — loads without error

---

## Section 3: Cross-Tenant Isolation Spot Check

- [ ] Sign out
- [ ] Sign in as `owner_b@test.com` / `TestPass123!`
- [ ] Confirm you see **different** data than `owner@test.com` (different loads, drivers, etc.)
- [ ] No 500s in network tab

---

## Section 4: Write Path Test

> Catches missing INSERT/UPDATE grants.

- [ ] Create a new load via `/carrier/loads/new`
- [ ] Edit an existing driver
- [ ] Delete something (a draft, a test record, anything)

---

## Section 5: Driver Portal Test

- [ ] Sign out
- [ ] Sign in as `driver@test.com` / `TestPass123!`
- [ ] Driver portal pages load with the driver's own data (no 500s)

---

## Section 6: Settlement / PDF Generation

> Catches Storage and signed URL issues.

- [ ] Open a finalized settlement
- [ ] PDF generates and opens successfully

---

## Section 7: Final Checks

- [ ] Zero 500 errors observed in network tab anywhere during the session
- [ ] No console errors mentioning "permission denied" or "RLS"

---

## After All Checks

Paste back **any checklist items that failed**, along with:
- The network error (status code + response body)
- The terminal error (Prisma error message + query)

**Only when ALL items pass** is it safe to proceed to production cutover (Phase 2).

---

## Revert Instructions

If you need to revert to the postgres superuser connection:

1. Open `apps/web/.env.local`
2. Uncomment the `ORIGINAL_DATABASE_URL_BACKUP_2026-06-02` line
3. Comment out the `DATABASE_URL` line below it
4. Save the file
5. Restart the dev server (`Ctrl+C`, then `npm run dev` from `apps/web`)
```

DO NOT commit this file. The user will review it locally and may want to tweak it.
  </action>
  <verify>
Read apps/web/scripts/audit/phase2-local-test-checklist.md back and confirm:
1. File exists
2. First H1 is `# Phase 2 Local Test Checklist`
3. All 7 sections present (Setup, Core Page Smoke Tests, Cross-Tenant Isolation Spot Check, Write Path Test, Driver Portal Test, Settlement / PDF Generation, Final Checks)
4. "After All Checks" and "Revert Instructions" trailing sections present
5. Revert Instructions references the marker `ORIGINAL_DATABASE_URL_BACKUP_2026-06-02`
6. `git status apps/web/scripts/audit/phase2-local-test-checklist.md` shows untracked (not staged)
  </verify>
  <done>phase2-local-test-checklist.md exists at the specified path with all sections verbatim, references the dated backup marker in the revert section, and is not staged for commit.</done>
</task>

<task type="auto">
  <name>Task 3: Print user instructions and confirm no-commit posture</name>
  <files>(none — output only)</files>
  <action>
After Tasks 1 and 2 are complete and verified, print the following message to the user EXACTLY as written (between the dashes):

```
---
TO REVERT: open apps/web/.env.local, uncomment the backup DATABASE_URL line, comment out the app_user line, save, restart the dev server.

RESTART YOUR DEV SERVER NOW:
  Stop it (Ctrl+C if running)
  cd apps/web
  npm run dev

The new DATABASE_URL takes effect on restart. Open phase2-local-test-checklist.md and work through each item in your browser. Note anything that fails. Come back and report results when done.

DO NOT commit .env.local — it's gitignored. DO NOT push anything. DO NOT deploy to Vercel.
---
```

Then run `git status --short apps/web/.env.local apps/web/scripts/audit/phase2-local-test-checklist.md` (read-only) to confirm:
- apps/web/.env.local is NOT in the output (gitignored)
- apps/web/scripts/audit/phase2-local-test-checklist.md shows as `??` (untracked, not staged)

If anything is staged, STOP and tell the user — do not attempt to unstage automatically.

Explicitly DO NOT run: `git add`, `git commit`, `git push`, `vercel`, `vercel --prod`, `npx prisma migrate deploy`, or any deploy command. This task ends with the user instructions printed.
  </action>
  <verify>
1. The exact instruction block was printed to the user (between the `---` lines)
2. `git status --short` for the two files shows .env.local absent (ignored) and the checklist as `??`
3. No git add / commit / push / deploy command was executed
  </verify>
  <done>User has been given clear restart + test + revert instructions, no files were staged or committed, no deploy was triggered. Quick task is complete and handed back to the user for manual checklist execution.</done>
</task>

</tasks>

<verification>
End-state of this plan:

1. apps/web/.env.local: DATABASE_URL now equals the app_user connection string; original postgres URL preserved as a commented line with marker `ORIGINAL_DATABASE_URL_BACKUP_2026-06-02` directly above it; DATABASE_URL_APP_USER unchanged.
2. apps/web/scripts/audit/phase2-local-test-checklist.md exists with all 7 sections + After All Checks + Revert Instructions.
3. User has been printed instructions covering: dev server restart, checklist location, revert procedure, no-commit/no-deploy warning.
4. `git status --short` confirms zero staged changes from this task; .env.local remains gitignored.
5. No git commits, no `git push`, no `vercel --prod`, no `prisma migrate deploy` executed.
</verification>

<success_criteria>
- [ ] apps/web/.env.local DATABASE_URL points to the app_user string
- [ ] Commented backup line with `ORIGINAL_DATABASE_URL_BACKUP_2026-06-02` marker is directly above live DATABASE_URL
- [ ] DATABASE_URL_APP_USER line is unchanged and still present
- [ ] No other env var in .env.local was modified
- [ ] apps/web/scripts/audit/phase2-local-test-checklist.md created with the verbatim 7-section structure
- [ ] User instruction block printed exactly as specified
- [ ] `git status --short` shows the checklist as `??` and .env.local NOT listed
- [ ] No commits, pushes, or deploys executed during this task
</success_criteria>

<output>
This quick task does NOT produce a SUMMARY.md and does NOT commit. The deliverables are:
- Modified apps/web/.env.local (uncommitted, gitignored)
- New apps/web/scripts/audit/phase2-local-test-checklist.md (uncommitted, untracked)
- Instructions printed to the user

The user will manually execute the checklist in their browser and report results back in a follow-up message. A separate quick task can then commit the checklist (without .env.local) once the user is happy with its content, if desired.
</output>
