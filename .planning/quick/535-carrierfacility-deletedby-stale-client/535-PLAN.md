# quick-535 — CarrierFacility "missing" deletedById/deletedBy

**Date:** 2026-08-24
**Outcome:** the reported defect does not exist in the codebase. No code change was made, and none was correct to make.

---

## Step 1 — the model, quoted

`apps/web/prisma/schema.prisma`, model `CarrierFacility`, the relevant lines:

```prisma
  deletedAt           DateTime? @map("deleted_at") @db.Timestamptz
  // Added by quick-534. … The relation below carries `onDelete: SetNull` to
  // match the siblings exactly, but there is NO foreign key in the database on
  // `deleted_by_id` … verified with `pg_get_constraintdef`.
  deletedById         String?  @map("deleted_by_id") @db.Uuid
  …
  createdBy          User?  @relation(name: "CarrierFacilityCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  updatedBy          User?  @relation(name: "CarrierFacilityUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  deletedBy          User?  @relation(name: "CarrierFacilityDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull)
```

**Both are present.** `deletedById` is present. The `deletedBy` relation is present, named `CarrierFacilityDeletedBy`, with `onDelete: SetNull`, matching the siblings.

---

## Step 2 — what happened in quick-534 step 3

**The edit was made, to the right model, and was never reverted.** It is in commit `4ab27705`, and `git log -- apps/web/prisma/schema.prisma` shows that commit as the most recent touch. The working tree is clean at `16570f7c`, so the running code is the committed code. quick-534 step 3 was correctly reported as IMPLEMENTED.

Nothing in the file or the history supports "made and reverted", "made to the wrong model", or "never made".

---

## Verification chain — five independent layers, all correct

| Layer | Check | Result |
|---|---|---|
| Source schema | `awk` the model | both fields present |
| Generated schema copy | `src/generated/prisma/schema.prisma` | both present |
| Generated types | `CarrierFacilitySelect` in `index.d.ts` | `deletedById?: boolean` and `deletedBy?: boolean \| CarrierFacility$deletedByArgs` |
| Generated runtime | `index.js` | contains `deleted_by_id` and `CarrierFacilityDeletedBy` |
| Live database | quick-534, `information_schema` + `pg_constraint` | `uuid` NULL, zero constraints |

Then the decisive test — **the exact failing select, run in a fresh Node process against the on-disk client**:

```
QUERY ACCEPTED by the on-disk client. rows = 0
```

A false lead worth recording: grepping `index.d.ts` for the relation NAME (`CarrierFacilityDeletedBy`) returns 0 — but so does the known-good sibling `CarrierClientDeletedBy`. Relation names do not appear in the generated types. Grepping for the relation name is not a valid probe; grep the `Select` type instead.

---

## Actual root cause

The dev server on :3000 was **PID 1588, started 2026-08-24 07:26:15**. `prisma generate` ran at **19:03:54** — eleven and a half hours later. The same PID was already serving :3000 during quick-533, so the process predates quick-534 entirely and **was never restarted**, whatever was restarted elsewhere.

That is the exact failure mode already recorded in project memory: the `prisma` singleton is pinned on `globalThis` to survive HMR, so regenerating on disk does not refresh the client a long-running dev process already imported. A field added after the process started throws a **client-side** validation error — "Unknown field `deletedBy`" — before any SQL is sent, which is why the database looks innocent and `deletedAt` (added by quick-530, before this process started) is still accepted while `deletedById` is not.

---

## Why steps 3 and 4 were NOT executed

Adding `deletedById` and `deletedBy` as instructed would declare each field **twice** in one model. `prisma validate` rejects duplicates, so the result would not be a no-op — it would break generation and the build, converting a stale-cache annoyance into a hard failure.

---

## What was done instead

1. Stopped PID 1588 (port 3000 confirmed free).
2. Deleted `apps/web/.next` and `tsconfig.tsbuildinfo` — `prisma generate` rewrote seven files under `src/generated/prisma` while Turbopack was live, and per project memory a Turbopack cache poisoned that way survives a restart.
3. Ran the tsc probe and the full suite.

The user restarts the dev server; `/carrier/recently-deleted` then loads the client that has been correct on disk since 19:03.
