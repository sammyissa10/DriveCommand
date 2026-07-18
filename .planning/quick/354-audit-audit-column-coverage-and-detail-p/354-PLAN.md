---
phase: quick-354
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md
autonomous: true
read_only: true

must_haves:
  truths:
    - "Every tenant-scoped Prisma model is listed with its actual database column state for created_at, updated_at, created_by_id, updated_by_id (verified against information_schema, not just schema.prisma)"
    - "Every detail-page route under apps/web/src/app/(owner)/**, (driver)/**, (admin)/**, (shared)/** is inventoried with file path, underlying model, and whether timestamps are already displayed"
    - "The canonical users table name, PK column, PK type, and FK declaration style are documented with a concrete example from the existing codebase"
    - "The session/current-user helper available in Server Components / Server Actions / API routes is named, located, and its returned shape (especially user.id type) is documented"
    - "Per-table casing convention (camelCase vs snake_case) is recorded so Prompt 2 can match the existing convention on each table"
    - "A precise scope statement for Prompt 2 is produced: which tables, which columns to add, which casing per table, in what order"
  artifacts:
    - path: ".planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md"
      provides: "Complete six-section audit report with Markdown tables, recommended scope statement, and decision-flag list"
      min_lines: 200
  key_links:
    - from: "354-SUMMARY.md Section 1"
      to: "information_schema.columns via Supabase MCP"
      via: "list_tables / execute_sql queries"
      pattern: "actual DB column state — not schema.prisma alone"
    - from: "354-SUMMARY.md Section 3"
      to: "apps/web/src/app/(owner|driver|admin|shared)/**/[id]/page.tsx"
      via: "glob + read of detail-page route files"
      pattern: "[id] / [loadId] / [driverId] dynamic segments"
    - from: "354-SUMMARY.md Section 4"
      to: "apps/web/src/lib/auth/supabase.ts"
      via: "read of auth helper file"
      pattern: "exported getServerSession / requireAuth / auth() function and its return type"
---

<objective>
Produce a precise, current, six-section audit report for TKT-0015 (audit-column rollout) so that the follow-up migration prompt (Prompt 2) can be written with zero ambiguity.

Purpose: Before generating migrations, middleware, and UI for `created_by_id / updated_by_id / created_at / updated_at` on every tenant-scoped table, we need ground-truth data on what columns already exist, what shape the user FK should take, every detail-page route that will display these fields, and the session helper that exposes the current user. The previous DatabaseSecurity Prompt 1 audit (commit 2026-05-14) flagged ~62-77 of 77 tenant-scoped tables as missing audit columns, but `schema.prisma` may have drifted from the actual database — so the database itself must be queried via Supabase MCP.

Output: A single SUMMARY.md file at `.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md` containing Sections 1-6 as specified in the task brief, plus a recommended scope statement and decision-flag list.

CRITICAL: This is a READ-ONLY task. No file edits outside of writing the SUMMARY. No migrations. No DDL. No UPDATEs. No schema changes. No middleware code. No UI code. Audit only.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Route group mismatch — IMPORTANT
The task brief references `apps/web/src/app/(carrier)/**`, but this codebase uses these route groups instead:
- `(owner)` — carrier/fleet owner portal (the primary "carrier-side" surface)
- `(driver)` — driver portal
- `(admin)` — sysadmin portal
- `(shared)` — cross-portal shared routes
- `(auth)` — auth flows (exclude from detail-page inventory)

Treat `(owner)` as the "carrier" portal the brief refers to. Also include detail pages under `(driver)`, `(admin)`, and `(shared)` in Section 3, but exclude `(auth)`, list pages, dashboards, login, onboarding, marketing, and `/track/*` (public tracking).

# Files to read
@apps/web/prisma/schema.prisma
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/lib/auth/guards.tsx
@apps/web/src/lib/auth/permissions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Gather schema and database column state for tenant-scoped tables</name>
  <files>
    (read-only — no files modified in this task; output is held in working memory for Task 3)
  </files>
  <action>
Read `apps/web/prisma/schema.prisma` in full. Build a working list of every model that is tenant-scoped — defined as: the model has a `tenantId` (camelCase) or `org_id` / `tenantId` field that FKs to the `Tenant` model, OR the model is a child of a tenant-scoped parent and inherits scoping transitively. Include the model name AND its `@@map(...)` table name if different.

Categorize each model by casing convention:
- **camelCase Postgres** — fields like `tenantId`, `createdAt`, `updatedAt` map to columns of the same name (no `@map`)
- **snake_case Postgres** — fields like `tenantId` are mapped via `@map("tenant_id")` to snake_case columns; tables typically use `@@map("snake_case_name")`

Explicitly check for the following columns per model AS DECLARED IN PRISMA:
- `createdAt` / `created_at` — type, default, `@updatedAt` annotation
- `updatedAt` / `updated_at` — type, default, `@updatedAt` annotation
- `createdById` / `created_by_id` — type, FK target, nullable?
- `updatedById` / `updated_by_id` — type, FK target, nullable?

Then, using the Supabase MCP, verify the ACTUAL database state. The codebase memory notes that `schema.prisma` may have drifted from the database (Phase 51 / DatabaseSecurity Prompt 1 found drift). Run these MCP calls:

1. `mcp__supabase__list_tables` with schemas=["public"] to enumerate all live tables.
2. For audit columns specifically, use `mcp__supabase__execute_sql` with a query like:
   ```sql
   SELECT
     table_name,
     column_name,
     data_type,
     is_nullable,
     column_default
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name IN (
       'createdAt', 'created_at',
       'updatedAt', 'updated_at',
       'createdById', 'created_by_id',
       'updatedById', 'updated_by_id'
     )
   ORDER BY table_name, column_name;
   ```
3. Get row counts for the 5-10 largest tenant-scoped tables (e.g. GpsReport, FleetMessage, Load, Invoice, Document) using a single query:
   ```sql
   SELECT relname AS table_name, n_live_tup AS estimated_rows
   FROM pg_stat_user_tables
   WHERE schemaname = 'public'
   ORDER BY n_live_tup DESC
   LIMIT 25;
   ```

Cross-reference the Prisma model list against the live database column inventory. Note any drift (column exists in DB but not Prisma, or vice versa).

Identify and flag tables that should be EXCLUDED from audit-column rollout:
- Join tables with composite PKs and no surrogate id
- Append-only event/log tables that already have their own audit semantics (e.g. NotificationSendLog, GpsReport, AuditLog if present)
- System/global tables not tenant-scoped (e.g. Plan, Promo, FeatureFlag) — list these but mark as "skip — not tenant-scoped"

Hold all gathered data in working memory for Task 3 to assemble into Sections 1, 5, and the row-count portion of Section 6.

DO NOT modify any file. DO NOT run DDL or UPDATE. Read-only queries only.
  </action>
  <verify>
- Prisma schema fully read
- `mcp__supabase__list_tables` returned a non-empty result for the public schema
- `information_schema.columns` query returned rows for the audit-column names
- Row-count query returned at least the top 25 tables
- A working list of tenant-scoped models with per-column status (present in Prisma / present in DB / both / neither) is held in context
  </verify>
  <done>
Complete column-state data for every tenant-scoped table is gathered, cross-referenced against the live database via Supabase MCP, and ready to be tabulated. Excluded-table flags identified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Inventory detail-page routes and confirm session/user-FK shapes</name>
  <files>
    (read-only — no files modified in this task; output is held in working memory for Task 3)
  </files>
  <action>
**Part A — Detail-page route inventory (Section 3 data):**

Use Glob to find every detail page across the relevant route groups. Search patterns:
- `apps/web/src/app/(owner)/**/[*]/page.tsx`
- `apps/web/src/app/(driver)/**/[*]/page.tsx`
- `apps/web/src/app/(admin)/**/[*]/page.tsx`
- `apps/web/src/app/(shared)/**/[*]/page.tsx`

For each match, classify as a "detail page" (single-record view) vs a non-detail page (e.g. `[id]/edit/page.tsx` edit forms — include these too if they show a record). Exclude:
- List pages (no dynamic segment)
- Dashboard / index pages
- `(auth)/` flows
- `onboarding/`, `track/`, marketing pages

For each detail page, read enough of the file to extract:
- Route path (e.g. `/owner/loads/[id]`)
- File path (absolute)
- Underlying Prisma model — usually obvious from the `prisma.<model>.findUnique(...)` call
- Whether the page already renders any timestamp (grep for `createdAt`, `formatDate`, `toLocaleDateString`, "Created", "Updated")
- Whether the component is a Server Component (no `"use client"` directive) or Client Component

Tip: To keep this efficient, batch reads — use Grep with `output_mode: "files_with_matches"` for `prisma\\.` + `findUnique` across the candidate file list, then targeted Reads on each.

**Part B — User reference shape (Section 2 data):**

From `schema.prisma` (already read in Task 1):
- Confirm the canonical users table name (look for `model User { ... @@map("...")` or no @@map for camelCase)
- Confirm PK column name and type (`id String @id @default(...)` — UUID? cuid? Supabase auth id?)
- Find 2-3 existing user-FK examples on other models (e.g. `Load.assignedDriverId`, `FleetMessage.recipientId`, `Document.uploadedById`) and note exactly how they're declared (type, `@map`, FK relation syntax, nullable, onDelete)
- Determine if a separate `Driver` model exists distinct from `User`, and if so which is canonical for audit-trail "who performed the action" purposes (per memory: `Driver` is a profile linked to `User` — confirm)

**Part C — Session helper (Section 4 data):**

Read `apps/web/src/lib/auth/supabase.ts` in full. Identify:
- The exported helper(s) used in Server Components / Server Actions / API routes (e.g. `getServerSession`, `requireAuth`, `auth()`)
- The exact return shape — does it expose `user.id` as the UUID that matches `User.id`? Or is it a Supabase Auth `sub` claim that needs translation?
- Where `app_metadata` claims (role, tenantId) are read
- Any existing Prisma extension / middleware / `$extends(...)` registration (search the codebase for `$extends` and `Prisma.defineExtension` to find cross-cutting infrastructure)

Also read `apps/web/src/lib/auth/guards.tsx` and `apps/web/src/lib/auth/permissions.ts` to round out the picture.

Hold all gathered data in working memory for Task 3.

DO NOT modify any file. Read-only.
  </action>
  <verify>
- A complete list of detail-page routes with their Prisma model, file path, server/client classification, and existing-timestamp-display status is held in context
- The users table name, PK type, and 2-3 concrete user-FK declaration examples are identified
- The session helper name and return shape (specifically the `user.id` type) is documented
- Any existing Prisma `$extends` / middleware registrations are located (or confirmed absent)
  </verify>
  <done>
All input data for Sections 2, 3, and 4 of the report is gathered. Edge cases (e.g. ambiguous "created by" on log tables, drift cases) are noted for Section 5.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write the six-section audit SUMMARY.md</name>
  <files>.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md</files>
  <action>
Assemble the data gathered in Tasks 1 and 2 into a single Markdown file at the path above. Follow this exact structure:

```markdown
# Quick Task 354 — Audit Column Coverage + Detail-Page Inventory (TKT-0015)

**Status:** Audit complete (read-only)
**Date:** 2026-05-16
**Scope:** apps/web (Next.js 15, Prisma 7, Supabase Postgres)

## Executive Summary
(2-3 sentences: total tenant-scoped tables, how many missing each audit column, count of detail pages, headline recommendation for Prompt 2)

## Section 1 — Column inventory across tenant-scoped tables

| Prisma Model | DB Table | Casing | created_at | updated_at (auto?) | created_by_id | updated_by_id | Missing Count |
|---|---|---|---|---|---|---|---|
| (rows sorted DESCENDING by Missing Count — tables missing the MOST audit columns first) | | | | | | | |

Notes:
- "auto?" column = whether `updated_at` has Prisma `@updatedAt` annotation
- Drift findings: (list any columns present in DB but not Prisma, or vice versa)

## Section 2 — User reference shape

- **Users table:** `User` (Prisma model) → `User` or `"User"` (Postgres) — confirm `@@map`
- **PK:** `id` — type `String @id @default(uuid())` (or whatever the actual declaration is)
- **FK declaration style (concrete examples):**
  ```prisma
  // Example 1 — from Load model
  assignedDriverId String? @db.Uuid
  assignedDriver   User?   @relation("LoadAssignedDriver", fields: [assignedDriverId], references: [id], onDelete: SetNull)
  ```
  (paste 2-3 actual examples)
- **Driver vs User:** (confirm Driver is a profile linked to User; for audit trail "who acted", the canonical FK target is `User.id`)
- **Multiple user tables:** (list any others — e.g. CarrierUser, ExternalUser — if found)

## Section 3 — Detail-page inventory

| Route | File Path | Prisma Model | Timestamps Shown? | Component Type |
|---|---|---|---|---|
| /owner/loads/[id] | apps/web/src/app/(owner)/loads/[id]/page.tsx | Load | No | Server |
| (one row per detail page) | | | | |

Total detail pages: N (split owner/driver/admin/shared: a/b/c/d)

## Section 4 — Session / current-user availability in server context

- **Server helper:** `<exact function name>` exported from `apps/web/src/lib/auth/supabase.ts`
- **Returned shape:**
  ```ts
  // exact return type signature
  { user: { id: string; ... }, tenantId: string, role: '...' }
  ```
- **`user.id` ↔ `User.id` match:** Yes / No — (explain)
- **Existing Prisma extensions / middleware:** (list any `$extends` or middleware registrations, or "none found")

## Section 5 — Edge cases to flag

- **Skip — not tenant-scoped:** (list system tables like Plan, Promo, FeatureFlag)
- **Skip — append-only / has own audit semantics:** (e.g. NotificationSendLog, GpsReport, AuditLog)
- **Skip — join tables with composite PK:** (list any)
- **Ambiguous `created_by_id`:** (e.g. NotificationSendLog — sender vs subject; FleetMessage — author vs recipient)
- **Tables writing `createdAt` explicitly (not via Prisma default):** (list any — these need migration ordering care)
- **Casing convention per table:** (call out which models are camelCase vs snake_case and confirm the new audit columns should match the existing per-table convention, not pick one global rule)

## Section 6 — Recommended migration ordering

**Grouping strategy:** (one mega-migration vs 2-3 grouped by domain — recommend with reasoning)

**Suggested groups (if grouped):**
1. Fleet domain — Truck, Driver, Load, Route, RouteStop, Document, DriverHOSEntry, DriverIncident
2. Finance domain — Invoice, InvoiceItem, Payment, Payroll, Expense
3. Communications/CRM — FleetMessage, CRM contacts, SupportTicket, etc.

**Smoke-test first:** Recommend 1-2 low-row-count, low-write-rate tables to migrate first as a smoke test.

**Largest tables (row counts):**

| Table | Estimated Rows | Backfill Concern? |
|---|---|---|
| (top 10 from pg_stat_user_tables) | | |

Per the locked decision (option B1), legacy rows stay NULL — no backfill. So row counts inform DDL lock duration only, not backfill batching.

---

## Recommended scope for Prompt 2

(One precise paragraph: "Add `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `created_by_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`, `updated_by_id UUID NULL REFERENCES users(id) ON DELETE SET NULL` to the following N tables, using <camelCase|snake_case> per table as listed in Section 1, in the following order: ...")

## Decision flags — items needing user input before Prompt 2

- [ ] **Flag 1:** (e.g. NotificationSendLog — is `created_by_id` = sender or = subject? Recommend: skip table entirely since it's an append-only log)
- [ ] **Flag 2:** (e.g. Should `Tenant` itself get audit columns? It's the root, so created_by_id would FK to a User in another tenant context)
- [ ] (any other ambiguities found during the audit)
```

**Writing rules:**
- Use exact table/column names from the live database, not paraphrases
- Cite file paths as absolute paths from repo root
- Keep Section 1 sorted so tables MOST missing audit columns appear at the top
- Section 6 must contain a concrete table-by-table recommendation, not generic advice
- The final "Recommended scope for Prompt 2" paragraph must be specific enough that a migration author could write the SQL with zero further questions
- Decision flags should list specific tables, not abstract concerns

This is the ONLY file write in this entire plan.
  </action>
  <verify>
- File exists at `.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md`
- File contains all six sections plus the "Recommended scope for Prompt 2" paragraph and decision-flag checklist
- Section 1 table is sorted by missing-column count, descending
- Section 3 table contains every detail page found (none missed)
- Section 4 names the actual session helper function and its return shape
- Section 6 contains a concrete grouping recommendation with specific table names
- No other files were modified
  </verify>
  <done>
A self-contained, decision-ready audit report is committed at the SUMMARY path. Prompt 2 author can write the migration without further investigation.
  </done>
</task>

</tasks>

<verification>
- Confirm SUMMARY.md exists and is non-empty: `ls .planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md`
- Confirm no files outside `.planning/quick/354-*/` were modified: `git status --short` should show only the new SUMMARY (and any planning artifacts)
- Confirm no migrations were created: `ls apps/web/prisma/migrations/` should be unchanged
- Confirm Section 1 table cross-references the live DB (not just schema.prisma) — Section 1 should include a "drift findings" subsection
- Confirm at least one Supabase MCP query was actually executed (not skipped in favor of guessing from schema.prisma)
</verification>

<success_criteria>
- READ-ONLY: zero application files modified, zero DB writes, zero migrations generated
- SUMMARY.md contains all six sections in order
- Every tenant-scoped Prisma model appears in Section 1 with its actual DB column state
- Every detail page under (owner)/(driver)/(admin)/(shared) with a dynamic `[id]` segment appears in Section 3
- The session helper and `user.id` ↔ `User.id` match are confirmed in Section 4
- "Recommended scope for Prompt 2" paragraph is specific enough that no follow-up clarification is needed
- Decision-flag checklist names specific tables, not generic concerns
- The route-group mismatch with the task brief (brief said `(carrier)`, actual is `(owner)/(driver)/(admin)/(shared)`) is called out explicitly in the SUMMARY's executive summary or notes section
</success_criteria>

<output>
After completion, the SUMMARY at `.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md` IS the deliverable. No separate phase summary needed — this is a quick task.
</output>
