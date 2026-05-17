---
phase: quick-359
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/context/tenant-context.ts
  - apps/web/src/lib/db/tenant-client.ts
autonomous: true

must_haves:
  truths:
    - "Writes performed via getTenantPrisma() populate createdById/updatedById with the current session user's id"
    - "Unauthenticated/system writes still succeed (session null -> audit injection no-ops)"
    - "tsc --noEmit passes from apps/web with zero errors"
    - "The 'Prompt 3 will wire...' TODO at tenant-client.ts:21 no longer exists"
  artifacts:
    - path: "apps/web/src/lib/context/tenant-context.ts"
      provides: "getTenantPrisma() that forwards session.userId to createTenantClient"
      contains: "getSession"
    - path: "apps/web/src/lib/db/tenant-client.ts"
      provides: "createTenantClient(tenantId, userId) — unchanged behavior, updated comment"
  key_links:
    - from: "apps/web/src/lib/context/tenant-context.ts"
      to: "apps/web/src/lib/auth/supabase.ts"
      via: "import { getSession }"
      pattern: "getSession"
    - from: "apps/web/src/lib/context/tenant-context.ts"
      to: "apps/web/src/lib/db/tenant-client.ts"
      via: "createTenantClient(tenantId, session?.userId ?? null)"
      pattern: "createTenantClient\\([^,]+,\\s*session\\?\\.userId"
---

<objective>
Wire the session userId from getTenantPrisma() into createTenantClient() so the withAuditColumns extension can populate createdById/updatedById on every write performed through the tenant-scoped client.

Purpose: Closes the TKT-0015 Wave 1 follow-up. Today every write via getTenantPrisma() writes NULL audit columns because the extension is constructed with userId=null. The extension and client factory are already correct; only the call site needs the fix.

Output:
- apps/web/src/lib/context/tenant-context.ts updated to forward session.userId
- apps/web/src/lib/db/tenant-client.ts comment at line ~21 updated to reflect wired state
- tsc clean, commit pushed
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/db/extensions/audit-columns.ts
@apps/web/src/lib/auth/supabase.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Forward session.userId from getTenantPrisma to createTenantClient and refresh TODO comment</name>
  <files>
    apps/web/src/lib/context/tenant-context.ts
    apps/web/src/lib/db/tenant-client.ts
  </files>
  <action>
    Scope is intentionally tight. ONLY the call site in tenant-context.ts and the stale comment in tenant-client.ts change. Do NOT modify audit-columns.ts, the extension composition in tenant-client.ts, or any business logic / route / server action.

    Edit `apps/web/src/lib/context/tenant-context.ts`:

    1. Add an import for `getSession` from the consolidated auth module:
       `import { getSession } from '@/lib/auth/supabase';`
       (Confirm the alias '@/lib/auth/supabase' is the canonical path — `getSession` is exported from `apps/web/src/lib/auth/supabase.ts` line 41 and is wrapped in React `cache()`, so calling it inside the same request is free.)

    2. Modify `getTenantPrisma()` (line 34-37) so it:
       - Calls `requireTenantId()` first (unchanged — auth-context boundary).
       - Then calls `getSession()` and forwards `session?.userId ?? null` as the second argument to `createTenantClient`.

       Resulting body:
       ```ts
       export async function getTenantPrisma(): Promise<PrismaClient> {
         const tenantId = await requireTenantId();
         const session = await getSession();
         return createTenantClient(tenantId, session?.userId ?? null);
       }
       ```

       Update the JSDoc comment block immediately above `getTenantPrisma()` to add one sentence: "Forwards the current session's userId to the audit-columns extension so createdById/updatedById are auto-populated on writes. Pass-through is null for unauthenticated/system contexts." Keep the rest of the existing doc text.

    3. Scan the file for other `getTenantPrisma`-style helpers (e.g. `getTenantPrismaForRole`, `getTenantPrismaWithUser`, anything that also calls `createTenantClient`). Apply the same `getSession()` + `session?.userId ?? null` forwarding pattern to each. As of the current snapshot the only call site is the single `getTenantPrisma` function above and `tenantRawQuery` (which uses `$transaction` on the base prisma — leave it untouched, raw queries bypass the audit extension by design).

    4. Do NOT modify `tenantRawQuery`. Do NOT add new exports. Do NOT use `as any` or non-null assertions on `session`. The `session?.userId ?? null` pattern is the contract.

    Edit `apps/web/src/lib/db/tenant-client.ts`:

    5. Update the JSDoc comment block at lines ~6-22. Replace the line "Prompt 3 will wire the actual session userId at the call site." with: "Wired by `getTenantPrisma()` in lib/context/tenant-context.ts — it forwards `session?.userId ?? null` from the React-cached getSession() so writes get audit columns automatically."

       Do NOT change the function signature, the body, the `$extends` composition, or the type casts. Only the comment line changes.

    Verification (run from `apps/web`):
    - `npx tsc --noEmit` exits 0.
    - Grep confirms `getSession` is imported and called in tenant-context.ts.
    - Grep confirms the old "Prompt 3 will wire" sentence is gone from tenant-client.ts.

    Commit + push:
    - `git add apps/web/src/lib/context/tenant-context.ts apps/web/src/lib/db/tenant-client.ts`
    - `git commit -m "fix(audit): forward session userId from getTenantPrisma to withAuditColumns [TKT-0015 Wave 1 fix]"`
    - `git push origin master`
  </action>
  <verify>
    From `apps/web`:
    - `npx tsc --noEmit` exits 0.
    - `grep -n "getSession" src/lib/context/tenant-context.ts` shows both the import and the call inside `getTenantPrisma`.
    - `grep -n "session?.userId ?? null" src/lib/context/tenant-context.ts` returns at least one match inside `getTenantPrisma`.
    - `grep -n "Prompt 3 will wire" src/lib/db/tenant-client.ts` returns no matches.
    - `git log -1 --oneline` shows the new commit.
    - `git status` is clean.
  </verify>
  <done>
    - getTenantPrisma() calls getSession() and forwards session?.userId ?? null into createTenantClient(tenantId, userId).
    - No other functions / files modified beyond tenant-context.ts and the comment in tenant-client.ts.
    - tsc --noEmit clean from apps/web.
    - Stale "Prompt 3 will wire..." TODO replaced with an accurate comment.
    - Commit pushed to origin/master with the specified message.
  </done>
</task>

</tasks>

<verification>
End-to-end behavioral check (eyes-on, optional but recommended):
1. From the running app, perform any tenant-scoped write through a server action / API route that uses getTenantPrisma() (e.g. create a Tag, ExpenseCategory, or any model carrying createdById/updatedById).
2. Query the row directly in Supabase: `createdById` and `updatedById` should equal the acting user's auth.users.id (NOT NULL).
3. Repeat for a system context (cron route that calls getTenantPrisma without session) — write should still succeed and createdById/updatedById should remain NULL or whatever the route explicitly passed.

TypeScript: `npx tsc --noEmit` from `apps/web` exits 0.
</verification>

<success_criteria>
- All `<verify>` checks in Task 1 pass.
- tsc --noEmit exits 0 from apps/web.
- New writes via getTenantPrisma() populate createdById/updatedById with the session user's id (truth #1 in must_haves).
- Unauthenticated/system writes still work without throwing (truth #2 in must_haves).
- Commit `fix(audit): forward session userId from getTenantPrisma to withAuditColumns [TKT-0015 Wave 1 fix]` exists on master and is pushed to origin.
</success_criteria>

<output>
After completion, create `.planning/quick/359-fix-gettenantprisma-to-forward-session-u/359-SUMMARY.md` capturing:
- The exact diff applied to tenant-context.ts and tenant-client.ts (or a tight summary of each).
- The commit hash.
- Confirmation that tsc --noEmit was run and exited 0.
- Any other call sites of createTenantClient found and either updated or explicitly left alone (with reason).
</output>
