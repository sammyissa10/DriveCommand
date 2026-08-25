# quick-535 — Summary

**Date:** 2026-08-24
**Code changed:** none. **Schema changed:** none. **DDL:** none.
**tsc:** 0 errors, gate probe-verified live.
**Tests:** failing set byte-identical to the pre-task commit. Zero regressions.

---

## Finding

`CarrierFacility` is **not** missing `deletedById` or the `deletedBy` relation. Both are present in `schema.prisma`, in the generated schema copy, in the generated types, and in the generated runtime — and the exact select the dev server rejects is **accepted** by that on-disk client in a fresh Node process.

The failure was entirely in the running dev server. **PID 1588 on port 3000 started at 07:26:15; `prisma generate` ran at 19:03:54.** The process predated the regeneration by eleven and a half hours and was still the same PID that had been serving :3000 since quick-533 — so it was never restarted, whatever restart was performed.

This is the documented failure in `project_stale_dev_prisma_client_500`: the `prisma` singleton is pinned on `globalThis` to survive HMR, so regenerating on disk cannot refresh the client a long-running process already imported. The rejection happens **client-side**, before any SQL is sent, which is why the database looks innocent — and why `deletedAt` is still accepted (it existed when the process booted, from quick-530) while `deletedById` is not.

quick-534 step 3 was correctly reported as IMPLEMENTED. The edit is in commit `4ab27705`, is the most recent touch to the file, and was never reverted.

---

## Steps 3 and 4 were deliberately not executed

Adding the two fields as instructed would declare each **twice** in one model. Prisma rejects duplicate fields, so this would not have been a harmless no-op — it would have broken generation and the build, turning a stale-cache annoyance into a hard failure. Reporting that was more useful than complying.

Step 4's proof-of-regeneration was still produced, just against the existing client rather than a new one — see the table below.

---

## Proof the on-disk client is correct (step 4, adapted)

| Layer | Probe | Result |
|---|---|---|
| Source schema | `awk` the model | `deletedById` + `deletedBy` present |
| Generated schema copy | `src/generated/prisma/schema.prisma` | both present |
| Generated **types** | `CarrierFacilitySelect` in `index.d.ts` | `deletedById?: boolean`, `deletedBy?: boolean \| CarrierFacility$deletedByArgs<ExtArgs>` |
| Generated **runtime** | `index.js` | contains `deleted_by_id` and `CarrierFacilityDeletedBy` |
| mtime | `index.d.ts` | 2026-08-24 19:03:54 — the quick-534 generate |
| **Behaviour** | the exact failing select, fresh process | `QUERY ACCEPTED by the on-disk client. rows = 0` |

The behavioural test is the one that matters; the rest are corroboration.

**A false lead worth recording:** grepping `index.d.ts` for the relation name `CarrierFacilityDeletedBy` returns 0 — but so does the known-good sibling `CarrierClientDeletedBy`. **Relation names never appear in the generated types.** Grepping for one is not a valid probe and briefly looked like a confirmed defect. Grep the `Select` type instead, or better, run the query.

---

## Fix applied

1. Stopped PID 1588; port 3000 confirmed free.
2. Deleted `apps/web/.next` and `tsconfig.tsbuildinfo`. `prisma generate` rewrote seven files under `src/generated/prisma` while Turbopack was live, and per `feedback_stop_dev_server_before_mass_file_changes` a cache poisoned that way survives a restart — so a restart alone might have reproduced the symptom and sent the next investigation down the same path.

**Action required: restart the dev server** (`cd apps/web`, `npm run dev`). The first build will be slower — the Turbopack cache is cold by design.

---

## Verification

**tsc probe.** Injected `const __probe535: number = "not a number"` into `lib/carrier/soft-delete.ts`; tsc reported that error and nothing else, so the gate was live — worth confirming here because `tsconfig.tsbuildinfo` had just been deleted. Probe removed, real run **0 errors**, no stale probe files.

**Suite.** 61 failed / 1226 passed, and `diff` against the pre-task failing set is empty — same 14 files. Zero regressions, as expected from a task that changed no code.

---

## Follow-up

Project memory `project_stale_dev_prisma_client_500` was updated. Its diagnosis checklist already passed at every step here, and the missing instruction was the one that actually resolved it: **verify the restart happened by process start time, rather than accepting that it did.** Two tasks were spent on a client that had been correct on disk the whole time.

Still open from quick-534, unaffected by this task:
1. The double confirmation dialog on all seven sibling grids (`shell/shared/QuickActions.tsx` overloads `destructive`).
2. The dead `shell/*` island — zero external importers, removable only as a set.
3. `@@index([deletedAt])` declared in Prisma but absent from the database.
