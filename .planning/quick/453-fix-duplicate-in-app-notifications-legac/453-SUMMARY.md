# Quick-453 Summary: Fix duplicate InAppNotification rows

## What was done

### DB (Supabase MCP)
- **Audit:** 13 duplicate groups, 47 extra rows (187 total → 140 after dedupe = 25% — under 50% threshold)
- **entity_id NULL check:** 0 NULL values confirmed — full constraint, no partial index needed
- **Dedupe:** Deleted 47 rows. Strategy: keep `read=true` row per group (or earliest `created_at` if all unread). 47 rows deleted, 0 duplicate groups remaining.
- **Constraint:** `ALTER TABLE in_app_notifications ADD CONSTRAINT in_app_notifications_org_id_entity_id_type_key UNIQUE (org_id, entity_id, type)` — applied via `apply_migration` after confirming 0 duplicates

### Code
- **`apps/web/src/lib/carrier/in-app-notifications.ts`** — `createNotification()` changed from `create()` to `createMany({ skipDuplicates: true })`. Maps to `INSERT … ON CONFLICT DO NOTHING`. Idempotent on (org_id, entity_id, type); never overwrites existing row's read state.

### Schema
- **`apps/web/prisma/schema.prisma`** — Added `@@unique([orgId, entityId, type])` to `InAppNotification` model. Keeps schema in sync with live DB constraint. Prisma client regenerated.

## Verification
- `tsc --noEmit` → exit 0 (clean)
- `next build` → exit 0 (clean)
- 0 duplicate groups confirmed before applying constraint
- Commit `74e5a027` pushed to `master`

## RLS note
`in_app_notifications` has existing RLS policies (quick-228). No policy changes needed — the UNIQUE constraint is a DDL-only change; INSERT policy (WITH CHECK (true)) and SELECT/UPDATE (org_id = jwt org_id) remain intact. Tenant isolation is not weakened.

## Commit
`74e5a027` — fix(quick-453): dedupe in_app_notifications + unique constraint + idempotent createNotification()
