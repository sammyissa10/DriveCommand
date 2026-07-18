---
phase: quick-424
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/424-bare-prisma-audit.md
autonomous: true

must_haves:
  truths:
    - "Every bare `prisma.` usage in apps/web/src is enumerated with file path and line number"
    - "Each usage is categorized A/B/C/D/E with justification"
    - "Audit output is sorted by category (A first) for the fix phase to consume"
    - "No source code is modified — audit is read-only"
    - "No commit, push, or deploy occurs"
  artifacts:
    - path: "apps/web/scripts/audit/424-bare-prisma-audit.md"
      provides: "Comprehensive categorized inventory of bare-prisma usage sites"
      contains: "Category A, Category B, Category C, Category D, Category E sections"
  key_links:
    - from: "audit findings"
      to: "Quick-423 $transaction + set_config pattern"
      via: "Category B classification"
      pattern: "set_config.*app.current_tenant_id"
    - from: "audit findings"
      to: "RLS spec Section 4.12 allowlist"
      via: "Category C classification (platform-level tables)"
      pattern: "Plan|Promo|carrier_catalog_meta|NotificationTemplate|NotificationEmailConfig|grid_preference|grid_view"
---

<objective>
Comprehensive read-only audit of every bare `prisma.` usage in `apps/web/src/` to produce a categorized inventory the fix phase will consume.

Purpose: Phase 2 local test (DATABASE_URL=app_user) revealed bare prisma calls bypass RLS — returning zero rows under app_user. Before doing more page-by-page discovery, we need a single comprehensive sweep so the fix plan can address all sites in one disciplined pass.

Output: `apps/web/scripts/audit/424-bare-prisma-audit.md` — every bare-prisma site enumerated, categorized A/B/C/D/E, sorted by category. NO source code changes. NO commits.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/app/api/auth/login/route.ts
@apps/web/src/lib/db/prisma.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit every bare-prisma site in apps/web/src and write categorized inventory</name>
  <files>apps/web/scripts/audit/424-bare-prisma-audit.md</files>
  <action>
This task is READ-ONLY against source code. The ONLY file you create or modify is `apps/web/scripts/audit/424-bare-prisma-audit.md`.

**DO NOT** modify any .ts/.tsx files, schema.prisma, the tenant-rls extension under `src/lib/db/extensions/`, or anything else under `apps/web/src/`.
**DO NOT** run `git add`, `git commit`, `git push`, or any deploy command.

---

**STEP 1 — Identify what counts as a "bare prisma" import**

Use Grep against `apps/web/src/` to find all files importing the bare Prisma client. Typical import shapes to capture:
- `import prisma from "@/lib/db/prisma"` (default)
- `import { prisma } from "@/lib/db/prisma"` (named)
- `import { prisma, TX_OPTIONS } from "@/lib/db/prisma"` (named with options)
- Any other path that resolves to the singleton `prisma` client (NOT `getTenantPrisma`, NOT `tenantRawQuery`, NOT `createTenantClient`)

Build a candidate file list from these imports first, then enumerate usages within each file.

**STEP 2 — Enumerate every `prisma.` call site**

For each file in the candidate list, use Grep with `-n` to capture every line matching `prisma\.` that is a real query/transaction call. Capture (at minimum):
- File path (relative to repo root, e.g., `apps/web/src/app/api/...`)
- Line number
- The full matched line (trim long lines to ~160 chars but keep the call signature)
- Model accessed (e.g., `tenant`, `user`, `truck`, `load`, `plan`, `notificationTemplate`)
- Method (e.g., `findUnique`, `findMany`, `create`, `update`, `delete`, `$transaction`, `$executeRaw`, `$queryRaw`)

Exclude false positives:
- `prisma` inside a string/comment
- The definition of `prisma` itself in `apps/web/src/lib/db/prisma.ts`
- `getTenantPrisma`, `tenantRawQuery`, `createTenantClient`, `withTenantRLS` (these are not bare prisma)
- TypeScript type-only references like `Prisma.SomethingArgs` (capital P, type namespace)

**STEP 3 — Categorize each site**

Read enough surrounding context (the enclosing function, the route file's auth/middleware shape) to assign one of:

- **CATEGORY A** — Tenant-scoped query, `tenantId` is already in scope.
  Signals: file is under `app/api/(carrier|owner|driver)/`, `app/(authenticated)/`, a server action behind auth, the function calls `requireTenantId()`, `getSession()`, reads `x-tenant-id`, or receives `tenantId` as a parameter. Model is tenant-scoped (Truck, Driver, Load, Route, Invoice, Document, etc.).
  Action (later): replace bare `prisma` with `await getTenantPrisma()`.

- **CATEGORY B** — Tenant-scoped query, `tenantId` is NOT yet in scope (pre-context).
  Signals: file is under `app/api/auth/`, signup, password reset, invitation accept, webhook handler, or any route that runs BEFORE the tenant context middleware has been resolved — but still needs to read a tenant-scoped row (e.g., `Tenant.findUnique` during login).
  Action (later): wrap in `prisma.$transaction` with `SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)` per the Quick-423 pattern. Reference the existing login route as the canonical example.

- **CATEGORY C** — Platform-level table where bare prisma is CORRECT.
  Allowlist (per RLS spec Section 4.12, confirmed 2026-06-02): `Plan`, `Promo`, `carrier_catalog_meta`, `NotificationTemplate`, `NotificationEmailConfig`, `grid_preference`, `grid_view`.
  Action (later): no change. Note in audit: "Platform table — RLS not applicable per spec 4.12".

- **CATEGORY D** — Auth/health/system path with no tenant context needed.
  Examples: Supabase auth callbacks that only touch the Supabase client (not Prisma), health-check routes, cron routes that intentionally fan out across all tenants using admin bypass, anything explicitly using `app.bypass_rls` GUC.
  Action (later): no change. Note why bypass is intentional.

- **CATEGORY E** — UNCERTAIN. Cannot confidently classify from a quick read.
  Examples: mixed-purpose util functions, dynamic model access, deeply nested helpers where tenant scope depends on caller. Flag for human review with a one-line note explaining the uncertainty.

If a single file contains usages of multiple categories, list each usage separately under its own category — do not bucket a whole file.

**STEP 4 — Write the audit file**

Create `apps/web/scripts/audit/424-bare-prisma-audit.md` with this structure:

```markdown
# Quick-424 — Comprehensive Bare-Prisma Audit

**Date:** 2026-06-02
**Scope:** apps/web/src/ (every bare `prisma.` usage)
**Source files scanned:** <N files containing bare-prisma imports>
**Total usage sites found:** <N>

## Summary

| Category | Count | Action (fix phase) |
|----------|-------|--------------------|
| A — Tenant-scoped, tenantId in scope | <N> | Replace with `await getTenantPrisma()` |
| B — Tenant-scoped, pre-context | <N> | Wrap in `$transaction` + `set_config` (Quick-423 pattern) |
| C — Platform table (RLS not applicable) | <N> | No change |
| D — Auth/health/system (intentional bypass) | <N> | No change |
| E — UNCERTAIN (needs human review) | <N> | Skip; surface for review |

---

## Category A — Tenant-scoped, tenantId in scope

(Each entry as a bullet or sub-section)

### `apps/web/src/app/api/.../route.ts`
- **Line 42:** `prisma.truck.findMany({ where: { tenantId } })`
  - Model: `truck` · Method: `findMany`
  - tenantId source: `requireTenantId()` at line 28
  - Fix: replace with `await getTenantPrisma()`

...

---

## Category B — Tenant-scoped, pre-context

### `apps/web/src/app/api/auth/some-route/route.ts`
- **Line N:** `prisma.tenant.findUnique({ where: { id: tenantIdFromMeta } })`
  - Model: `tenant` · Method: `findUnique`
  - Pre-context reason: route runs before middleware sets x-tenant-id
  - Fix: wrap in `$transaction` with `set_config('app.current_tenant_id', tenantId, TRUE)` — see Quick-423 login route reference

...

---

## Category C — Platform table (no change)

(Group by model)

### Plan
- `apps/web/src/...:NN` — `prisma.plan.findMany(...)` — platform table, RLS not applicable per spec 4.12

### Promo
...

---

## Category D — Auth/health/system (no change)

- `apps/web/src/...:NN` — `prisma.$executeRaw\`SELECT set_config('app.bypass_rls', ...)\`` — intentional sysadmin bypass
- ...

---

## Category E — UNCERTAIN (needs human review)

- `apps/web/src/lib/some-util.ts:NN` — `prisma[model].findMany(...)` — dynamic model access, tenant scope depends on caller. Need to trace callers before classifying.
- ...

---

## Methodology Notes

- Grep pattern used to find imports: <pattern>
- Grep pattern used to find call sites: `prisma\.` with `-n`, excluding type-only references
- Files excluded: `apps/web/src/lib/db/prisma.ts` (definition), `apps/web/src/lib/context/tenant-context.ts` (helper wrapping bare prisma intentionally)
- This audit is READ-ONLY. No source files were modified. No commits were made.
```

**STEP 5 — Self-verification before finishing**

Before declaring done, re-grep `apps/web/src/` for `prisma\.` one more time and confirm the count of unique (file, line) pairs roughly matches the total in your audit summary table (allow small variance for filtered-out type-only matches and the two excluded helper files). If the audit count is wildly off, recount.

**Final constraints recap:**
- ONLY file written: `apps/web/scripts/audit/424-bare-prisma-audit.md`
- NO modifications to any .ts/.tsx file
- NO git operations (no add, no commit, no push)
- NO deploy
- Category E is acceptable — surface uncertainty, do NOT guess
  </action>
  <verify>
1. Confirm the audit file exists:
   - `ls apps/web/scripts/audit/424-bare-prisma-audit.md` (must exist)
2. Confirm no source files were touched:
   - `git status apps/web/src/` should show no changes from this task
3. Confirm no commits were made:
   - `git log -1 --oneline` should show the same HEAD as before the task started
4. Open the audit file and verify it contains all five category sections (A, B, C, D, E) — Category sections must be present even if a category has 0 entries (state "None found").
5. Verify the summary table totals equal the sum of entries listed in each category section.
  </verify>
  <done>
- `apps/web/scripts/audit/424-bare-prisma-audit.md` exists with all five categories represented
- Every bare-prisma call site in `apps/web/src/` is enumerated under exactly one category
- No `.ts`/`.tsx` source file was modified
- `git status` shows only the new audit file (plus any pre-existing unrelated working-tree changes from before the task)
- No `git commit` or `git push` was run
  </done>
</task>

</tasks>

<verification>
- `apps/web/scripts/audit/424-bare-prisma-audit.md` is the only new artifact
- Audit categorizes every bare-prisma usage in apps/web/src/
- Category A entries explicitly state where `tenantId` is sourced from
- Category B entries explicitly reference the Quick-423 pattern
- Category C entries are limited to the spec 4.12 allowlist
- Category E entries each include a one-line justification for the uncertainty
- Zero source code modifications
- Zero git operations performed
</verification>

<success_criteria>
- Audit document complete and readable
- Fix-phase planner can read the audit and generate per-category fix tasks without re-grepping
- User has a clean review surface for Category E (uncertain) before any code changes ship
</success_criteria>

<output>
After completion, the audit lives at `apps/web/scripts/audit/424-bare-prisma-audit.md`. No SUMMARY.md is required for this quick task — the audit file itself IS the deliverable. The user will review categories (especially E) and then authorize a separate quick task for the fix phase.
</output>
