# quick-587 — Audit and removal of vestigial `app.bypass_rls` flags

**Date:** 2026-09-03
**Session one:** read-only classification → [`587-CLASSIFICATION.md`](./587-CLASSIFICATION.md), commit `d25e6a2a`
**Session two:** removal + guard → commit `46484486`

**No RLS policy created, altered or dropped. No migration run. No change to
`tenant-rls.ts`, `EXEMPT_MODELS`, `getTenantPrisma`, `schema.prisma`, or
`stops/[id]/page.tsx`. Database untouched.**

---

## 1. What was removed — 12 flags

All 12 were on transactions quick-586 had already routed onto a tenant-scoped
client, where **every model in the transaction is in `EXEMPT_MODELS`** and every
query carries an explicit `orgId` predicate.

| file | flags removed |
|---|---|
| `app/(driver)/actions/driver-routes.ts` | 2 |
| `app/api/driver/stops/[stopId]/documents/route.ts` | 3 |
| `app/api/driver/stops/[stopId]/messages/route.ts` | 2 |
| `app/api/mobile/.../dispatches/[id]/expenses/route.ts` | 1 |
| `app/api/mobile/.../stops/[stopId]/documents/route.ts` | 2 |
| `app/api/v1/carrier/stops/[id]/messages/route.ts` | 2 |
| **total** | **12** |

Every removal was asserted **byte-exact** against the expected `set_config`
statement before deletion — a line that did not match the exact statement would
have aborted the run rather than being removed on a line-number guess.

**Nothing else changed.** No query, `include`, `select`, `orderBy`, `TX_OPTIONS`
or return shape was touched. Verified by reading the whole diff.

### Step-5 check (non-exempt models newly filtered): PASSES for all 12

Every model across the 12 transactions — `CarrierDriver`, `CarrierStop`,
`CarrierDocument`, `Trip`, `CarrierExpense` — is in `EXEMPT_MODELS`, so the RLS
extension injects nothing before or after the change. **No model newly acquires a
`tenantId` filter.**

---

## 2. What was retained — 17 flags, deliberately

All 17 remaining flags sit on the **bare `prisma` client**, in transactions that
never reach `stops`, `carrier_documents` or `route_template_stops`
(`FleetMessage`, `User`, `Trip`, `CarrierLoad`). **12 of the 17 touch a NON-EXEMPT
model** (`User` / `FleetMessage`, both carrying `tenantId`), so removing one would
newly apply a tenant filter — precisely the third-class hazard quick-586
documented on `stops/[id]/page.tsx`.

Per-file after: driver-routes 3 · stops/[id] 3 · trips/[id] 1 · trips/[id]/stops 1
· driver documents 0 · driver messages 5 · mobile expenses 0 · mobile documents 0
· v1 messages 4 = **17**.

---

## 3. Sites A and B — the orphan-row check you asked for

**Neither site can produce a row with all five parent FKs null.**

| | site A — `driver/stops/[stopId]/documents` | site B — `mobile/.../stops/[stopId]/documents` |
|---|---|---|
| `stopId` source | `params: Promise<{ stopId: string }>` — required dynamic segment | same |
| validated before the write? | yes — 404 `Stop not found` if the stop is not owned by the tenant | yes — 404 at the same point |
| written into `data` | `parentId: stopId`, `stopId` — both hardcoded, non-conditional | identical |

`stopId` is a required path segment (Next.js cannot match the route without it),
it is typed `string` rather than `string | undefined`, and **both handlers
404 before reaching the create** unless the stop exists and belongs to the
caller's tenant. There is no branch through either `POST` that reaches
`carrierDocument.create` with `stopId` absent. Both therefore always populate at
least one parent FK — in fact always `stop_id`, the join the policy would use.

**But the schema concern is real, and it arrives by a different route.** All five
parents are `ON DELETE SET NULL` (verified against `pg_constraint`, not inferred):

```
carrier_documents_client_id_fkey    ... ON DELETE SET NULL
carrier_documents_contract_id_fkey  ... ON DELETE SET NULL
carrier_documents_dispatch_id_fkey  ... ON DELETE SET NULL
carrier_documents_load_id_fkey      ... ON DELETE SET NULL
carrier_documents_stop_id_fkey      ... ON DELETE SET NULL
```

So a row that was born correctly parented becomes an unreachable orphan **when its
parent is deleted** — and stop deletion is a live path (`trips.ts` does
`carrierStop.deleteMany({ where: { dispatchId } })` when a trip's stops are
regenerated). The orphan risk is a **deletion** property, not an insert property;
these two INSERTs are not the source.

**Production today: 41 `carrier_documents` rows, 0 with all five parents null,
0 with `parent_type='stop'` but `stop_id IS NULL`.** Clean so far.

**One mitigating detail worth having before the schema decision:**
`carrier_documents_uploaded_by_fkey` is `ON DELETE **RESTRICT**` to `"User"`, and
`uploaded_by` is null on **0 of 41** rows. `"User"` carries `tenantId`. So a
join-based policy has a second, non-nullable path to tenancy available if the five
nullable parents are judged insufficient. Not a recommendation — the shape of the
`carrier_documents` policy is a schema decision, and per your instruction **I have
not changed anything about it.**

---

## 4. The guard pins ONLY removals — confirmed

`apps/web/tests/security/bypass-rls-flag-removal.test.ts`, 29 tests.

**There are zero SYSTEM sites.** Nothing among the original 29 flags demonstrably
reads or writes across tenants; every one is a single-tenant request path. So
there is **no "deliberately retained because cross-tenant" set to counter-assert**,
and the guard does not pretend otherwise — step 6's comment set and the SYSTEM
half of step 7 are both empty rather than invented.

The guard pins two things, and the second is *not* a SYSTEM justification:

1. **RULE 1 — removals stay removed.** No `tenantPrisma`/`db` transaction in the
   nine files may contain `app.bypass_rls`. This encodes the *reason* (a
   tenant-scoped client does not need the bypass) rather than a line number, so it
   survives ordinary file drift.
2. **RULE 2 — retentions stay retained.** The bare-`prisma` transactions keep
   exactly their 17 flags. This exists to stop someone "finishing the job" into the
   non-exempt transactions — a hazard guard, explicitly documented in the file as
   *not* a cross-tenant justification.

Anti-vacuity, **both probes run by me, not reported second-hand**:

| probe | action | result |
|---|---|---|
| 1 | re-added a flag into a `tenantPrisma` transaction (`v1 messages`) | **RED — 3 failed** |
| 2 | deleted a retained flag (`trips/[id]/page.tsx`, `FleetMessage`, NON-EXEMPT) | **RED — 4 failed** |

Both restored afterwards. The guard also carries a `SITES.length`-style integrity
floor, per-file byte floors, a "transactions were actually found" assertion, and
CRLF normalisation.

**Incident worth recording:** probe 1's `git checkout --` restore reverted the
*whole file*, silently undoing that file's two real removals and two comment
rewrites. Caught by re-counting flags rather than trusting the probe's cleanup;
the file was rebuilt and re-verified (4 flags, 2 notes). **A `git checkout` used to
undo a probe will also undo your work in the same file** — count the artifact
afterwards, don't assume.

---

## 5. Stranded doc-comments — 8 blocks rewritten

Eight `@bypass_rls reason:` blocks existed solely to justify a flag that is now
gone; left alone they would assert a bypass that is not there — the stale-comment
class this repo has been bitten by repeatedly. Their `SCOPE` and `SAFETY` lines are
**kept**, because they document the tenant scoping that is now the *only*
protection. Only the justification line (and the `WHY: … require bypass_rls …`
lines) was replaced, with a note recording the removal so nobody re-adds the flag.

Untouched and still correct: `driver-routes.ts:37` (documents a **retained**
transaction), and the three `@bypass_rls` annotations in files outside this task's
nine (`gps-ping`, `mobile/dispatches`, `mobile/dispatches/[id]`).

---

## 6. Verification

| gate | result |
|---|---|
| `npx tsc --noEmit`, **probed** | probe reported at `v1/carrier/stops/[id]/messages/route.ts(263,7): error TS2322` — gate confirmed live; probe removed, grep-confirmed 0; clean run **exit 0** |
| `npx next build` | **succeeded** |
| full Vitest, after the last commit, default reporter | **63 failed / 1801 passed** / 61 skipped / 3 todo (1928) vs quick-586 baseline **63 / 1772** / 61 / 3 (1899) — **+29 passed, exactly the new guard; 63 failed unchanged, zero regressions** |
| flag census | 29 → **17**, per-file counts match the spec exactly |
| database | untouched — no policy, no migration, no DML |

## 7. Not done

- Did not touch `stops/[id]/page.tsx` (excluded), nor any of the 16 out-of-scope
  flags.
- Did not change the `carrier_documents` orphan situation — reported only, as
  instructed, since it is a schema decision.
- Did not push.
