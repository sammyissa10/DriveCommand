---
phase: 391-tkt-0034-verification-failure-trucks-pos
plan: 391
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Definitive answer: does middleware.ts inject x-tenant-id for /api/v1/carrier/* routes?"
    - "Confirmation that 3 audit-fix commits (3192ee63, dba86cd8, 50a780e8) are not on origin/master"
    - "Confirmation of withAuditColumns null-userId behavior (silent skip vs throw)"
    - "Clear go/no-go recommendation on whether QT-390's fix approach will work once pushed"
  artifacts:
    - path: ".planning/quick/391-tkt-0034-verification-failure-trucks-pos/391-SUMMARY.md"
      provides: "Diagnostic findings + recommendation for next action"
      contains: "middleware header injection analysis, commit status, audit extension behavior, recommendation"
  key_links:
    - from: "middleware.ts"
      to: "/api/v1/carrier/* routes"
      via: "x-tenant-id header injection (matcher config)"
      pattern: "x-tenant-id|matcher"
    - from: "getTenantPrisma()"
      to: "withAuditColumns userId"
      via: "getSession() -> session.user.id flows into audit extension"
      pattern: "withAuditColumns|userId"
---

<objective>
Read-only diagnostic to determine why TKT-0034 verification failed (truck POST stamps "Unknown" / NULL audit columns) after QT-390's fix.

Purpose: Confirm or rule out three hypotheses before writing more code:
1. Commits not pushed → Vercel running old code (most likely)
2. middleware.ts doesn't inject x-tenant-id for carrier routes → getTenantPrisma() fails silently or throws
3. withAuditColumns has unexpected null behavior

Output: A SUMMARY.md with definitive findings and a clear next-step recommendation. NO source code changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/390-use-defaultprisma-for-notification-prefe/390-SUMMARY.md
@apps/web/src/middleware.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/extensions/audit-columns.ts
@apps/web/src/app/api/v1/carrier/trucks/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Confirm git push state and read all three diagnostic files</name>
  <files>READ-ONLY (no files modified)</files>
  <action>
    Execute these read-only investigations in parallel and capture results:

    1. **Git push state** — Run `git log --oneline origin/master..HEAD` and confirm the three commits (3192ee63, dba86cd8, 50a780e8) are listed as un-pushed. Also run `git log --oneline -5 origin/master` to see what production is actually running.

    2. **middleware.ts full read** — Read apps/web/src/middleware.ts in full. Look for:
       - The `config.matcher` array — does it include `/api/v1/carrier/:path*` or equivalent?
       - The header-setting code — does it set `x-tenant-id` on the request headers for carrier routes?
       - Any early returns or skip conditions that would bypass header injection for API routes
       - How tenantId is resolved (from session? from JWT? from subdomain?)

    3. **tenant-context.ts re-read** — Read apps/web/src/lib/context/tenant-context.ts. Confirm:
       - `getTenantPrisma()` signature and behavior
       - `requireTenantId()` behavior when x-tenant-id header is missing (does it throw, return null, fallback to session?)
       - Whether there's a fallback path that still resolves userId for audit columns even if tenantId is missing

    4. **audit-columns.ts re-read** — Read apps/web/src/lib/db/extensions/audit-columns.ts. Confirm the exact null-userId behavior:
       - Does it `return query(args)` unchanged when userId is null (silent skip)?
       - Does it log a warning?
       - Does it throw?

    5. **trucks POST handler** — Read apps/web/src/app/api/v1/carrier/trucks/route.ts (POST handler only). Confirm:
       - It calls `getTenantPrisma()` (after QT-390's fix)
       - It does NOT use bare `prisma` for the create call
       - Error handling — would a thrown error from requireTenantId() be visible to the user?

    Capture exact line numbers and code snippets for the SUMMARY.

    Do NOT modify any source files. Do NOT commit anything in this task.
  </action>
  <verify>
    All five investigations completed. Notes captured for SUMMARY with exact file paths, line numbers, and verbatim code snippets where load-bearing.
  </verify>
  <done>
    Have definitive answers to:
    - Are commits pushed? (expected: no)
    - Does middleware inject x-tenant-id for /api/v1/carrier/*? (unknown — primary question)
    - What does requireTenantId() do when header is missing?
    - What does withAuditColumns do when userId is null?
    - Does the POST handler call getTenantPrisma() correctly?
  </done>
</task>

<task type="auto">
  <name>Task 2: Synthesize findings and write SUMMARY.md with recommendation</name>
  <files>.planning/quick/391-tkt-0034-verification-failure-trucks-pos/391-SUMMARY.md</files>
  <action>
    Write SUMMARY.md with this structure:

    ```markdown
    # QT-391 — TKT-0034 Verification Failure Diagnostic

    ## Question
    Why does truck POST still stamp "Unknown" / NULL audit columns after QT-390's fix?

    ## Findings

    ### 1. Git push state
    - Commits NOT pushed: [list with hashes]
    - origin/master HEAD: [hash + message]
    - Verdict: Vercel is/isn't running the fix

    ### 2. middleware.ts — x-tenant-id injection
    - File: apps/web/src/middleware.ts
    - Matcher config: [verbatim]
    - Header injection logic: [verbatim with line numbers]
    - Coverage of /api/v1/carrier/* routes: YES / NO / PARTIAL
    - Verdict: [explanation]

    ### 3. requireTenantId() behavior
    - File: apps/web/src/lib/context/tenant-context.ts
    - Behavior when header missing: [throws / returns null / fallback]
    - Impact on POST handler: [500 error / silent skip / works via fallback]

    ### 4. withAuditColumns null-userId behavior
    - File: apps/web/src/lib/db/extensions/audit-columns.ts
    - Behavior: [silent skip / warning / throw]
    - This is why "Unknown" appears: [yes/no — explanation]

    ### 5. trucks POST handler state
    - File: apps/web/src/app/api/v1/carrier/trucks/route.ts
    - Uses getTenantPrisma(): YES / NO
    - Error handling: [description]

    ## Root Cause Hypothesis (ranked)
    1. [Most likely] — explanation
    2. [Second] — explanation
    3. [Third] — explanation

    ## Recommendation
    [Clear next action: push commits / new QT to fix middleware / different approach entirely]

    ## What we did NOT change
    - No source files modified
    - No git commits to source code
    - This task only adds PLAN.md and SUMMARY.md docs
    ```

    Be precise. Quote code verbatim. Make the recommendation actionable.
  </action>
  <verify>
    SUMMARY.md exists at .planning/quick/391-tkt-0034-verification-failure-trucks-pos/391-SUMMARY.md. Contains all 5 finding sections, ranked hypotheses, and a clear recommendation.
  </verify>
  <done>
    User can read SUMMARY.md alone and know: (a) what's wrong, (b) why, (c) what to do next. No code spelunking required.
  </done>
</task>

</tasks>

<verification>
- `git log --oneline origin/master..HEAD` confirms commit push state
- SUMMARY.md exists and contains all five finding sections
- Recommendation is specific and actionable (not "investigate further")
- No source files in apps/web/ were modified (verify with `git status apps/web/`)
</verification>

<success_criteria>
- All five diagnostic questions have definitive answers backed by verbatim code references
- Ranked root cause hypothesis with reasoning
- Clear next-step recommendation (push / new QT / rethink)
- Zero source code changes — only PLAN.md and SUMMARY.md created
</success_criteria>

<output>
After completion, create `.planning/quick/391-tkt-0034-verification-failure-trucks-pos/391-SUMMARY.md` per Task 2.

Commit ONLY the docs:
```bash
git add .planning/quick/391-tkt-0034-verification-failure-trucks-pos/
git commit -m "docs(quick-391): TKT-0034 verification failure diagnostic"
```
</output>
