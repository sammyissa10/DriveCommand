---
phase: quick-115
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260328000001_enable_rls_prisma_migrations_and_tenant/migration.sql
autonomous: true
must_haves:
  truths:
    - "_prisma_migrations table has RLS enabled with no permissive policies"
    - "Tenant table has RLS enabled with no permissive policies"
    - "Supabase security advisor no longer warns about these two tables"
  artifacts:
    - path: "apps/web/prisma/migrations/20260328000001_enable_rls_prisma_migrations_and_tenant/migration.sql"
      provides: "RLS enablement migration for internal tables"
  key_links: []
---

<objective>
Enable Row Level Security on `_prisma_migrations` and `Tenant` tables to resolve Supabase security advisor warnings.

Purpose: These tables are only accessed server-side via Prisma (never by the Supabase client), so enabling RLS with zero permissive policies effectively locks out all direct client access while satisfying the security advisor.

Output: A single Prisma migration file.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/migrations/20260327000008_add_rls_support_tickets/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create RLS migration for _prisma_migrations and Tenant</name>
  <files>apps/web/prisma/migrations/20260328000001_enable_rls_prisma_migrations_and_tenant/migration.sql</files>
  <action>
Create the migration directory and `migration.sql` file at the path above.

The migration should:

1. Enable RLS on `_prisma_migrations`:
   ```sql
   ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
   ```
   Do NOT create any permissive policies. No client should ever access this table directly.

2. Enable RLS on `Tenant`:
   ```sql
   ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
   ```
   Do NOT create any tenant_isolation_policy. The Tenant table itself is not tenant-scoped data accessed by the Supabase client. However, DO add the standard bypass_rls_policy so that server-side Prisma access (which sets `app.bypass_rls = 'on'`) continues to work:
   ```sql
   DROP POLICY IF EXISTS bypass_rls_policy ON "Tenant";
   CREATE POLICY bypass_rls_policy ON "Tenant"
     FOR ALL
     USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
   ```

   Note: `_prisma_migrations` does NOT need a bypass policy because Prisma's migration runner uses a direct connection (not the Supabase pooler), so it operates as the database owner which bypasses RLS automatically.

Add clear SQL comments explaining why no permissive policies are added (server-only tables).
  </action>
  <verify>
    - File exists at the correct path
    - SQL syntax is valid (no typos in policy names or settings)
    - `_prisma_migrations` has ENABLE RLS and zero policies
    - `Tenant` has ENABLE RLS and only the bypass_rls_policy
  </verify>
  <done>Migration file created. When applied via `npx prisma migrate deploy`, both tables will have RLS enabled, resolving Supabase security advisor warnings while maintaining full server-side access.</done>
</task>

</tasks>

<verification>
- Migration file exists at `apps/web/prisma/migrations/20260328000001_enable_rls_prisma_migrations_and_tenant/migration.sql`
- File contains `ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY`
- File contains `ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY`
- File contains bypass_rls_policy for Tenant only
- No permissive policies on _prisma_migrations
</verification>

<success_criteria>
Migration file is ready to be applied. After `npx prisma migrate deploy`, the Supabase security advisor will no longer flag _prisma_migrations or Tenant as missing RLS.
</success_criteria>

<output>
After completion, create `.planning/quick/115-enable-rls-on-prisma-migrations-and-tena/115-SUMMARY.md`
</output>
