---
phase: quick-136
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/*/migration.sql
autonomous: true
must_haves:
  truths:
    - "User model has composite index on (tenantId, role, isActive)"
    - "Route model has composite index on (tenantId, driverId, scheduledDate)"
    - "DriverInvitation model has composite index on (tenantId, status)"
    - "Migration SQL file exists with CREATE INDEX statements for all 3 indexes"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "3 new @@index decorators"
      contains: "@@index([tenantId, role, isActive])"
    - path: "apps/web/prisma/migrations/*_add_missing_composite_indexes/migration.sql"
      provides: "SQL migration for composite indexes"
  key_links: []
---

<objective>
Add 3 missing composite indexes to the Prisma schema and generate the corresponding database migration.

Purpose: Improve query performance for frequently-used multi-column filters (active drivers by role, scheduling conflict detection, invitation listing).
Output: Updated schema.prisma with 3 new @@index decorators and a generated migration SQL file.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add composite indexes and generate migration</name>
  <files>apps/web/prisma/schema.prisma</files>
  <action>
Add 3 composite @@index decorators to schema.prisma:

1. **User model** (line ~191, before the closing `}`): Add `@@index([tenantId, role, isActive])` after the existing `@@index([email])` line. This supports 5+ endpoints that filter active drivers by role within a tenant.

2. **DriverInvitation model** (line ~253, before the closing `}`): Add `@@index([tenantId, status])` after the existing `@@index([email])` line. This supports invitation listing queries filtered by tenant and status.

3. **Route model** (line ~297, before the closing `}`): Add `@@index([tenantId, driverId, scheduledDate])` after the existing `@@index([archivedAt])` line. This supports scheduling conflict detection queries.

Then run from `apps/web` directory:
```bash
npx prisma migrate dev --name add_missing_composite_indexes
```

This generates the migration SQL and applies it to the local dev database.
  </action>
  <verify>
1. `grep -c "@@index(\[tenantId, role, isActive\])" apps/web/prisma/schema.prisma` returns 1
2. `grep -c "@@index(\[tenantId, status\])" apps/web/prisma/schema.prisma` returns 1
3. `grep -c "@@index(\[tenantId, driverId, scheduledDate\])" apps/web/prisma/schema.prisma` returns 1
4. A new migration directory exists under `apps/web/prisma/migrations/` with `migration.sql` containing 3 CREATE INDEX statements
5. `npx prisma validate` passes from `apps/web`
  </verify>
  <done>
All 3 composite indexes exist in schema.prisma, migration SQL file is generated with CREATE INDEX statements for each, and prisma validate passes.
  </done>
</task>

</tasks>

<verification>
- schema.prisma contains all 3 new @@index decorators
- Migration SQL file exists with 3 CREATE INDEX statements
- `npx prisma validate` passes
</verification>

<success_criteria>
- 3 composite indexes added to Prisma schema (User, Route, DriverInvitation models)
- Migration file generated and ready for deployment
</success_criteria>

<output>
After completion, create `.planning/quick/136-add-3-missing-composite-indexes-to-prism/136-SUMMARY.md`
</output>
