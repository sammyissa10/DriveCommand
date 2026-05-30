---
phase: quick-415
plan: "01"
subsystem: database/audit
tags: [trip-model, schema-drift, p2022, diagnostic, migration]
dependency_graph:
  requires: []
  provides: [diagnose-trip-column-drift.ts]
  affects: [dispatches table, Trip model]
tech_stack:
  added: []
  patterns: [pg Pool + PrismaPg adapter, information_schema query, migration file scan]
key_files:
  created:
    - apps/web/scripts/audit/diagnose-trip-column-drift.ts
  modified: []
decisions:
  - "Script targets `dispatches` table — the Trip model uses @@map('dispatches'), not 'Trip' or 'trip'"
  - "Migration scan uses broad pattern matching (dispatches + Trip + column name) to catch indirect references"
  - "Exit code 0 even on drift found — diagnostic is not a CI gate"
metrics:
  duration: ~8 minutes
  completed: 2026-05-30
  tasks_completed: 1
  files_created: 1
---

# Quick-415: Trip Column Drift Diagnostic — Summary

**One-liner:** Read-only diagnostic script that identified two missing columns on the `dispatches` table (`deleted_at` + `deleted_by_id`), scanned all migrations, and produced a concrete remediation recommendation.

---

## Drift Found (Script Output)

### SECTION 1 — Schema parse

- Model `Trip` detected, physical table via `@@map`: **`dispatches`**
- Total scalar fields in schema.prisma: **24**

### SECTION 2 — Live DB columns

- Candidate table names queried: `"dispatches"`, `"Trip"`, `"trip"`
- Matched: **`dispatches`** — **22 columns** returned
- `"Trip"` and `"trip"` returned 0 rows (correct — only `dispatches` exists)

### SECTION 3 — Diff

**MISSING_IN_DB (2 columns — root cause of P2022):**

| Physical column | Prisma field | Type |
|---|---|---|
| `deleted_at` | `deletedAt` | `DateTime?` |
| `deleted_by_id` | `deletedById` | `String?` |

**EXTRA_IN_DB:** None — no orphan columns.

---

## SECTION 4 — Migration Scan Results

| Column | Migration hit? | Migration dir |
|---|---|---|
| `deleted_at` | YES — 30 hits | `20260515000001_db_security_standardization` |
| `deleted_by_id` | NO — zero hits | — |

### Key finding for `deleted_at`

Migration `20260515000001_db_security_standardization` contains:
```sql
CREATE INDEX IF NOT EXISTS idx_dispatches_org_id_deleted_at ON dispatches(org_id, deleted_at);
```
This references `dispatches.deleted_at` in an index creation, implying the column was intended to be added. However, the index line alone doesn't prove the `ADD COLUMN` was issued for `dispatches` specifically — the migration adds `deleted_at` to many tables but the `dispatches` `ADD COLUMN` line may be missing. The column is not present in production.

### Key finding for `deleted_by_id`

**No migration file anywhere references `deleted_by_id` on the `dispatches` table.** This field was added to `schema.prisma` without any corresponding migration being authored — pure schema drift.

---

## SECTION 5 — Recommendation Branch

**Branch: "Schema drift WITHOUT source-controlled migration"**

The script landed on this branch because `deleted_by_id` has zero migration hits.

### Remediation steps (deferred — not executed in this task)

```bash
# From apps/web:

# Step 1 — Author new migration for deleted_by_id
npx prisma migrate dev --name add_trip_deleted_by_id --create-only
# Review generated SQL — it should also contain the ADD COLUMN for deleted_at if missing

# Step 2 — Apply to production
npx prisma migrate deploy

# Step 3 — Redeploy
vercel --prod
```

**Note:** Because `deleted_at` migration hits exist but the column is not in DB, running `prisma migrate deploy` may apply the pending migration that adds `deleted_at`. The new `--create-only` migration will handle `deleted_by_id`. Review the generated SQL carefully before deploying.

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Self-Check

```
FOUND: apps/web/scripts/audit/diagnose-trip-column-drift.ts
FOUND: commit d162d6b7
```

## Self-Check: PASSED
