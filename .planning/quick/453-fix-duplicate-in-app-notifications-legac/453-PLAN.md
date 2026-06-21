# Quick-453 Plan: Fix duplicate InAppNotification rows (legacy createNotification idempotency)

## Task
Stop duplicate `in_app_notifications` rows from the legacy `createNotification()` path.
Nightly crons re-insert fresh unread rows for the same entity; user marks one read,
the new one shows unread → "read reverted."

## Approach
1. **Audit** — query duplicate groups on (org_id, entity_id, type) via Supabase MCP
2. **Dedupe** — delete extra rows keeping read=true (or earliest createdAt if all unread)
3. **Constrain** — add UNIQUE (org_id, entity_id, type) via `apply_migration`
4. **Code** — change `createNotification()` insert → `createMany({ skipDuplicates: true })`
5. **Schema** — add `@@unique([orgId, entityId, type])` to InAppNotification in schema.prisma

## Files
- `apps/web/src/lib/carrier/in-app-notifications.ts` — createMany + skipDuplicates
- `apps/web/prisma/schema.prisma` — @@unique on InAppNotification
- `apps/web/src/generated/prisma/` — regenerated client

## DB (Supabase MCP only — no prisma migrate deploy)
- Dedupe SQL: ROW_NUMBER() OVER (PARTITION BY org_id, entity_id, type ORDER BY read DESC, created_at ASC) → delete rn > 1
- Constraint: ALTER TABLE in_app_notifications ADD CONSTRAINT in_app_notifications_org_id_entity_id_type_key UNIQUE (org_id, entity_id, type)

## Constraints
- entity_id is NOT NULL in schema → full constraint, no partial index needed
- ON CONFLICT DO NOTHING → never overwrites existing row's read state
- Dedupe ran first; constraint only applied after 0 duplicate groups confirmed
