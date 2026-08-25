# quick-534 — facilities.deleted_by_id, Recently Deleted, and the duplicate delete dialog

**Date:** 2026-08-24
**Follows:** quick-530 (added `deleted_at`), quick-533 (wired the grid, worked around the missing column)

---

## Step 1 — pre-read before DDL (DEC-14 discipline)

Two read-only queries against production before writing anything.

**Column shapes** (`information_schema.columns`):

| table | column | type | nullable | default |
|---|---|---|---|---|
| clients | deleted_by_id | uuid | YES | null |
| loads | deleted_by_id | uuid | YES | null |
| facilities | deleted_by_id | **absent** | — | — |

**Constraints** (`pg_get_constraintdef` over clients, loads, facilities, filtered to the three `*_by_id` columns) — six rows, all foreign keys:

```
clients_created_by_id_fkey     FOREIGN KEY (created_by_id) REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL
clients_updated_by_id_fkey     FOREIGN KEY (updated_by_id) REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL
facilities_created_by_id_fkey  FOREIGN KEY (created_by_id) REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL
facilities_updated_by_id_fkey  FOREIGN KEY (updated_by_id) REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL
loads_created_by_id_fkey       FOREIGN KEY (created_by_id) REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL
loads_updated_by_id_fkey       FOREIGN KEY (updated_by_id) REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL
```

**Zero FKs on `deleted_by_id`.** The survey is confirmed independently and is not contradicted. Proceeding.

Also checked and deliberately not mirrored: **no index** on `deleted_at` or `deleted_by_id` exists on any of the three tables, despite `@@index([deletedAt])` appearing in `schema.prisma` for clients/loads/trucks. Pre-existing Prisma-vs-DB drift, out of scope, not touched.

---

## Tasks

1. **DDL** — `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS deleted_by_id UUID;` via Supabase MCP `apply_migration` (the mechanism all prior DDL used). No FK, no default, no backfill, no index.
2. **DEC-3 mirror** — write `20260824120000_facilities_deleted_by_id/migration.sql`, mark applied with `prisma migrate resolve --applied`, verify `applied_steps_count = 0` and non-null `finished_at` by SELECT.
3. **schema.prisma** — mirror the siblings exactly: scalar `deletedById` **and** the named `deletedBy` relation, plus the `User` back-relation. Regenerate.
4. **HAS_DELETED_BY** — flip `CarrierFacility` to `true`; report whether the guard can go.
5. **FacilitiesGrid** — remove the duplicate dialog so exactly one fires.
6. **Recently Deleted** — add the eighth query so facilities actually appear. Without this, defect (a) is unfixed and the canonical dialog's copy stays false, which is the stated reason the copy must not change.
7. **Verify** — tsc probe, real typecheck, full suite vs pre-task commit.

---

## Scope note

`recently-deleted/page.tsx` is not in the brief's "files to modify" list, but it is also not in the "do not touch" list, and steps 7 and (b) both require facilities to appear there. The page's seven queries are hardcoded; a column alone changes nothing. Wiring it is treated as in scope.
