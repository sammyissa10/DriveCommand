# quick-534 — Summary

**Date:** 2026-08-24
**Commits:** `4ab27705`, `c88d82b8`, `29524bbd`, `40cd201a`
**tsc:** 0 errors, gate probe-verified live
**Tests:** 14 files / 61 tests failing — **byte-identical set** to the pre-task commit. Zero regressions.

All three defects closed.

---

## Step 1 — pre-read, confirmed independently

See the plan for the two full result sets. Headline: `pg_get_constraintdef` over clients, loads and facilities returned **six FKs, all on `created_by_id`/`updated_by_id`, none on `deleted_by_id`**. The survey was correct; no contradiction, so no stop.

Extra finding, not acted on: **no index on `deleted_at` exists in the database** on any of the three tables, despite `schema.prisma` declaring `@@index([deletedAt])` for clients, loads and trucks. Pre-existing drift, unrelated to this task, left alone — but it means the Prisma-vs-DB gap here is wider than just FKs.

---

## Step 2 — the migration and its verification row

`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS deleted_by_id UUID;`

Applied via Supabase MCP `apply_migration` (Supabase version `20260824...`, the same mechanism as every prior DDL in this project), then mirrored to `apps/web/prisma/migrations/20260824120000_facilities_deleted_by_id/` and marked applied with `prisma migrate resolve --applied` — **not** `deploy`.

```
migration_name                          | applied_steps_count | finished_at                    | rolled_back_at
20260824120000_facilities_deleted_by_id | 0                   | 2026-08-25 00:03:09.13805+00   | null
20260823120100_facilities_deleted_at    | 0                   | 2026-08-24 04:18:42.033847+00  | null
```

Row shape identical to the quick-530 precedent directly above it. Post-DDL column check:

```
column_name   | data_type | is_nullable | column_default | constraints_on_col
deleted_by_id | uuid      | YES         | null           | 0
```

Nullable uuid, no default, **zero constraints** — matching the seven siblings.

Two notes on mechanics:
- `prisma.config.ts` reads `DIRECT_URL` via `dotenv/config`, which loads `.env`, not `.env.local`. `resolve` fails with "datasource.url property is required" until the var is supplied explicitly.
- The migration auto-deploy hook recorded in memory **is no longer configured** — the only hook in settings is `SessionStart`. Writing `migration.sql` did not trigger a deploy, which is why `applied_steps_count` stayed 0.

---

## Step 3 — schema.prisma mirrors a relation, not a bare scalar

The siblings declare **both**, so facilities now does too:

```prisma
deletedById String? @map("deleted_by_id") @db.Uuid
deletedBy   User?   @relation(name: "CarrierFacilityDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull)
```

plus `carrierFacilitiesDeleted CarrierFacility[] @relation(name: "CarrierFacilityDeletedBy")` on `User`.

Worth stating plainly: **that relation declares `onDelete: SetNull` while the database has no foreign key at all.** Prisma does not require one, and all seven siblings are in exactly this state. Mirroring the siblings therefore means reproducing a Prisma-vs-DB gap on purpose. The alternative — a bare scalar — would have been more honest about the DB but would have broken `deletedBy: { select: { email: true } }`, which is the entire point of the column.

---

## Step 5 — can the guard go?

**No entity still needs it, and it is kept anyway.**

All eight entries in `HAS_DELETED_BY` are now `true`, so it changes no behaviour at runtime. It stays because it is the only part of `softDeleteRecords`/`restoreRecords` a type-checker can police — those delegates are reached through `(model as any)`, so a nonexistent column is a runtime Prisma error, not a compile error. A ninth entity still fails the build until someone states which kind it is.

A uniformly-`true` map is precisely the shape a future reader deletes on sight, so the comment now says why it survives. The stale union comment claiming facilities lack the column was corrected in the same commit.

---

## Step 6 — who owned the stale dialog, and who still renders it

**Owner: `components/data-grid/shell/shared/QuickActions.tsx`** — the live component the barrel exports. Not the dead `shell/QuickActions.tsx` twin from quick-533's step 6.

The mechanism is one overloaded flag. In `handleAction`:

```ts
if (action.destructive) { setDeleteConfirm(action); } else { action.onClick(); }
```

so `destructive: true` **replaces** the click with QuickActions' own AlertDialog. Confirming it runs `deleteConfirm.onClick()` — which is `requestDelete` — opening the canonical dialog second. The same flag also tints the icon red on hover; the two behaviours are inseparable from outside the component.

Fixed by not setting the flag on the facility row action. Cost: a red hover tint on an icon that is already a trash can, already labelled Delete, and already leads to a destructive-styled confirmation.

**Every other grid still renders it.** All eight grids pass `destructive: true` to `QuickActions`: Clients, Contracts, Drivers, Trucks, Loads, Dispatches, Routes, and (until this commit) Facilities. Each is also wired to `useSoftDelete`. **So all seven siblings currently show two dialogs, the first reading "This action cannot be undone" — which is false for every one of them.** The correct fix is to split styling from confirmation in the shared component, changing all eight at once; out of scope for a task told not to touch sibling wiring. Recommended as the next task.

The bulk path was already correct and is unchanged: `BulkActionsBar`'s `destructive` only picks a button variant and has no dialog, which is why the bulk path had no confirmation at all before quick-533.

---

## Step 7 — route path and confirmation

**Route is `/carrier/recently-deleted`.** The guessed `/carrier/settings/recently-deleted` 404s because there is no `settings` segment — `(owner)` is a route group and contributes nothing to the URL. It is linked from `components/navigation/sidebar.tsx`.

Facilities did **not** appear there merely from adding the column: the page runs seven hardcoded queries. An eighth was added. `RecentlyDeletedGrid` needed no change — it is already generic over `ENTITY_DISPLAY_NAMES`, which gained `'Facility'` in quick-533, so restore and permanent-delete work for the new type as-is.

Verified end-to-end against production inside a **transaction that rolls back**, so no data was mutated:

```
using facility "QA Shipper Facility" (4cd1bb9a…) in org 73c69018…
using deleter owner@test.com

[1] soft delete wrote 1 row(s) incl. deletedById -> OK
[2] Recently Deleted query returned 1 facility row(s):
      - "QA Shipper Facility"  deletedAt=2026-08-25T00:11:17.919Z  deletedBy=owner@test.com
[3] deletedBy relation resolved to the right user -> OK
[4] restore wrote 1 row(s) -> OK
[5] transaction rolled back — production data unchanged
[6] deleted facilities remaining in DB: 0 (expected 0)
RESULT: PASS
```

Step [1] is the write that would have thrown `Unknown argument 'deletedById'` before this task. Step [3] is the join that had no column to join on.

Defect (b) resolves as a consequence: the canonical copy — "moved to Recently Deleted and automatically purged after 30 days. You can restore it anytime before then" — is now true for facilities. Its wording was not touched, as instructed.

---

## Steps 8 & 9 — verification

**tsc probe.** Injected `const __probe534: number = "not a number"` into `recently-deleted/page.tsx`. tsc reported *that* error and nothing else — so the gate was live, and the new `deletedBy` relation and the eighth query already typechecked against the regenerated client. Probe removed, real run **0 errors**, no stale `__probe*` files.

**Suite.** 14 files / 61 tests failing, and `diff` against the pre-task failing set returns **identical** — same 14 files, same count. All pre-existing and unrelated (workflow-engine tRPC routers, auth guards, validation schemas, notifications). **Zero regressions.**

**Not run:** `scripts/full-schema-drift-scan.ts`, referenced in project memory as a pre-deploy gate, **no longer exists** — `apps/web/scripts/` contains only `check-doc-drift.ts`. The memory entry is stale. Schema/DB agreement was instead verified directly against `information_schema` and by the round-trip above, which is stronger evidence than the script would have given. `prisma migrate status` could not be used as a substitute: the `DIRECT_URL` host was unreachable (P1001) minutes after `migrate resolve` reached it successfully, so that is a transient direct-connection issue, not a schema problem.

---

## Follow-ups

1. **The double dialog on all seven sibling grids** — the real fix is splitting `destructive` into styling and confirmation in `shell/shared/QuickActions.tsx`. Highest-value next task; it also lets facilities get its red tint back.
2. **The dead `shell/*` island** (quick-533 step 6) — still zero external importers, still safe to remove only as a set.
3. **`@@index([deletedAt])` exists in Prisma but not in the database** for clients, loads and trucks.
4. **Bulk-bar selection lingering** in the seven siblings (fixed for facilities in quick-533).
5. **Portal event-bubbling defect** — explicitly deferred by the brief.
