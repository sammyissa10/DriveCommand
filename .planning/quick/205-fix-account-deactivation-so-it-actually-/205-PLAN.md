---
phase: quick-205
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(admin)/actions/tenants.ts
  - apps/web/src/app/(owner)/actions/drivers.ts
  - apps/web/src/app/api/auth/login/route.ts
autonomous: true
must_haves:
  truths:
    - "Deactivated user cannot log in via Supabase Auth (banned)"
    - "Deactivated user's existing sessions are immediately invalidated"
    - "Reactivated user can log in again (ban lifted)"
    - "Login route rejects users with inactive account or suspended tenant with 403"
    - "Local DB status update still succeeds even if Supabase ban call fails"
  artifacts:
    - path: "apps/web/src/app/(admin)/actions/tenants.ts"
      provides: "Supabase Auth ban/unban on tenant suspend/reactivate"
      contains: "ban_duration"
    - path: "apps/web/src/app/(owner)/actions/drivers.ts"
      provides: "Supabase Auth ban/unban on driver deactivate/reactivate"
      contains: "ban_duration"
    - path: "apps/web/src/app/api/auth/login/route.ts"
      provides: "Post-auth guard checking user.isActive and tenant.isActive"
      contains: "account has been deactivated"
  key_links:
    - from: "apps/web/src/app/(admin)/actions/tenants.ts"
      to: "apps/web/src/lib/supabase/admin.ts"
      via: "createAdminClient() for auth.admin.updateUserById"
      pattern: "createAdminClient.*auth\\.admin"
    - from: "apps/web/src/app/api/auth/login/route.ts"
      to: "prisma.user"
      via: "Post-login DB check for isActive + tenant.isActive"
      pattern: "prisma\\.user\\.findUnique"
---

<objective>
Fix account deactivation so it actually blocks login by integrating Supabase Auth ban/unban calls into the existing suspend/deactivate actions, and adding a post-auth login guard.

Purpose: Currently deactivating a user or suspending a tenant only sets a local DB flag. The user can still log in because their Supabase Auth account is untouched.
Output: Three modified files that enforce deactivation at the Supabase Auth level and at the login route level.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(admin)/actions/tenants.ts
@apps/web/src/app/(owner)/actions/drivers.ts
@apps/web/src/app/api/auth/login/route.ts
@apps/web/src/lib/supabase/admin.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Supabase Auth ban/unban to tenant suspend/reactivate and driver deactivate/reactivate</name>
  <files>
    apps/web/src/app/(admin)/actions/tenants.ts
    apps/web/src/app/(owner)/actions/drivers.ts
  </files>
  <action>
**In `apps/web/src/app/(admin)/actions/tenants.ts`:**

1. Import `createAdminClient` from `@/lib/supabase/admin`.

2. In `suspendTenant()` — AFTER the existing `prisma.tenant.update` call succeeds:
   - Query all users belonging to this tenant: `prisma.user.findMany({ where: { tenantId }, select: { id: true } })`.
   - For each user, wrap in try/catch and call:
     ```ts
     const supabaseAdmin = createAdminClient();
     await supabaseAdmin.auth.admin.updateUserById(user.id, { ban_duration: '87600h' });
     await supabaseAdmin.auth.admin.signOut(user.id, 'global');
     ```
   - If the Supabase call fails for a user, log the error with `logger.error` but do NOT throw — the local DB update already succeeded and should not be rolled back.
   - Use `Promise.allSettled` to process all users in parallel for efficiency.

3. In `reactivateTenant()` — AFTER the existing `prisma.tenant.update` call succeeds:
   - Query all users belonging to this tenant (same query as above).
   - For each user, call `supabaseAdmin.auth.admin.updateUserById(user.id, { ban_duration: 'none' })` to lift the ban.
   - Same error handling: log failures, do not throw.
   - Use `Promise.allSettled`.

**In `apps/web/src/app/(owner)/actions/drivers.ts`:**

1. Import `createAdminClient` from `@/lib/supabase/admin`.
2. Import `logger` from `@/lib/logger` (if not already imported).

3. In `deactivateDriver(id)` — AFTER the existing `prisma.user.update` call succeeds:
   - Wrap in try/catch:
     ```ts
     try {
       const supabaseAdmin = createAdminClient();
       await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '87600h' });
       await supabaseAdmin.auth.admin.signOut(id, 'global');
     } catch (err) {
       logger.error('[deactivateDriver] Supabase ban failed for user:', id, err);
     }
     ```
   - The `id` param is the User.id which equals the Supabase Auth user UUID.

4. In `reactivateDriver(id)` — AFTER the existing `prisma.user.update` call succeeds:
   - Wrap in try/catch:
     ```ts
     try {
       const supabaseAdmin = createAdminClient();
       await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' });
     } catch (err) {
       logger.error('[reactivateDriver] Supabase unban failed for user:', id, err);
     }
     ```

IMPORTANT: Do NOT modify any other functions in these files. Do NOT change the return values or the existing DB operations. The Supabase calls are fire-and-forget additions after the DB update.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` to confirm no type errors. Grep for `ban_duration` in both files to confirm the calls are present.
  </verify>
  <done>
Both tenant suspend/reactivate and driver deactivate/reactivate now call Supabase Auth to ban/unban users. Supabase failures are logged but do not block the operation.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add post-auth login guard checking user and tenant status</name>
  <files>apps/web/src/app/api/auth/login/route.ts</files>
  <action>
In the POST handler of `apps/web/src/app/api/auth/login/route.ts`, AFTER the successful `signInWithPassword` call (after the `if (error || !data.user)` check, around line 46) and BEFORE building the response:

1. Import `createAdminClient` from `@/lib/supabase/admin` at the top of the file.

2. Add a post-auth check block:
   ```ts
   // Post-auth guard: check if user or tenant is deactivated
   const localUser = await prisma.user.findUnique({
     where: { id: data.user.id },
     select: { isActive: true, tenantId: true, tenant: { select: { isActive: true } } },
   });

   if (!localUser || !localUser.isActive || !localUser.tenant.isActive) {
     // Sign the user out since Supabase just created a session
     try {
       const supabaseAdmin = createAdminClient();
       await supabaseAdmin.auth.admin.signOut(data.user.id, 'global');
     } catch (signOutErr) {
       logger.error('[login] Failed to sign out deactivated user:', signOutErr);
     }
     return NextResponse.json(
       { error: 'Your account has been deactivated. Please contact support.' },
       { status: 403 }
     );
   }
   ```

3. This handles:
   - User with `isActive: false` (driver deactivated by owner)
   - Tenant with `isActive: false` (tenant suspended by sysadmin)
   - User not found in local DB (edge case)

IMPORTANT: The `prisma` import already exists at top of this file. The sign-out call ensures the session Supabase just created is destroyed so the deactivated user does not get a valid cookie. Use `createAdminClient` for the signOut call since the regular supabase client may not have admin privileges.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` to confirm no type errors. Read the login route to verify the guard appears between the signInWithPassword success check and the response.
  </verify>
  <done>
Login route returns 403 with "Your account has been deactivated" message when either the user's isActive is false or the user's tenant isActive is false. The Supabase session created during the sign-in attempt is immediately destroyed.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. Grep confirms `ban_duration` in tenants.ts and drivers.ts
3. Grep confirms `deactivated` message in login route.ts
4. No changes to schema.prisma, middleware, RLS, or non-admin portal files
</verification>

<success_criteria>
- Deactivating a driver (owner action) bans them in Supabase Auth and invalidates sessions
- Suspending a tenant (sysadmin action) bans all tenant users in Supabase Auth and invalidates sessions
- Reactivating a driver or tenant lifts the Supabase Auth ban
- Login route returns 403 for deactivated users or suspended tenants, even if Supabase Auth ban was not applied (belt-and-suspenders)
- All Supabase Auth failures are logged but do not block the local DB operation
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/205-fix-account-deactivation-so-it-actually-/205-SUMMARY.md`
</output>
