# quick-587 Session One — `app.bypass_rls` flag classification

**Date:** 2026-09-03 · **Type:** read-only audit. **No flag removed. No file under `apps/` or
`packages/` modified. No RLS policy created, altered or dropped. No migration run.**

Follow-up to quick-586 §8 (`SITE-AUDIT.md`). Stops here for approval per the brief's step 3.

---

## 0. Headline — the "nine sites" is a FILE count, and it overstates the scope by more than 2×

The brief scopes this task to "the nine sites setting `app.bypass_rls` while touching the
three tables". Re-derived against the current tree, those nine files contain **29
`set_config('app.bypass_rls', 'on', TRUE)` statements**, and **only 13 of them sit inside a
transaction that touches `stops`, `carrier_documents` or `route_template_stops` at all.**

The other **16 belong to transactions that never touch any of the three tables** — they are
`FleetMessage`-only, `User`-only, `Trip`-only or `CarrierLoad`-only transactions that happen
to live in the same file. **12 of those 16 touch a NON-EXEMPT model**, so removing them is
precisely the third-class hazard the brief's step 5 describes.

This is the same file-level-attribution trap that quick-586 found in quick-583's diagnostic,
recurring one layer down: the census in `SITE-AUDIT.md` §8 counted flags **per file**, and
the brief inherited that count as though it were per access path.

| bucket | flags | disposition |
|---|---|---|
| **VESTIGIAL** — tenant-scoped read, `tenantPrisma`, all models EXEMPT | **10** | recommend removal |
| **DEFER (third class)** — `carrierDocument.create`, unscoped INSERT, policy decision not made | **2** | do NOT remove yet |
| **EXCLUDED** — `stops/[id]/page.tsx`, forbidden by the brief; also `User` non-exempt | **1** | do not touch |
| **OUT OF SCOPE** — transaction never touches the three tables | **16** | do not touch |
| | **29** | |

**SYSTEM sites: ZERO.** Not one of the 29 demonstrably reads or writes across tenants. Every
one is a single-tenant request path. The brief's step 6 (add a "why cross-tenant" comment to
each SYSTEM site) therefore has an **empty set**, and step 7's counter-assertion for retained
SYSTEM flags has nothing to pin. Said plainly rather than manufacturing a SYSTEM site to fill
the slot.

---

## 1. The fact that decides everything: the siblings all have live bypass policies

Queried live, read-only:

| table | RLS | FORCED | policies |
|---|---|---|---|
| `carrier_drivers` | on | on | `bypass_rls_policy`, `tenant_isolation_policy` |
| `dispatches` | on | on | `bypass_rls_policy`, `tenant_isolation_policy` |
| `loads` | on | on | `bypass_rls_policy`, `tenant_isolation_policy` |
| `carrier_expenses` | on | on | `bypass_rls_policy`, `tenant_isolation_policy` |
| `User` | on | on | `bypass_rls_policy`, `tenant_isolation_policy` |
| `FleetMessage` | on | on | `bypass_rls_policy`, `tenant_isolation_policy` |
| **`stops`** | on | on | **(none)** |
| **`carrier_documents`** | on | on | **(none)** |
| **`route_template_stops`** | on | on | **(none)** |

**The flag is not inert in general — it is live for every sibling model in these
transactions.** It is inert only for the three target tables, which have no policies to
honour it. So "vestigial" cannot be decided from the three tables alone; it has to be decided
from **every model in the enclosing transaction**, which is what §3 does.

Two consequences worth separating:

1. **Today nothing changes either way.** The app connects as `postgres`, which carries
   `BYPASSRLS`, so no policy is evaluated for any of these statements. Removal is a no-op
   against production **as currently configured**. The question is entirely about the state
   after the RLS Phase 2 cutover to `app_user`.
2. **After cutover**, a flag removal matters only if some row the transaction touches would
   fail `tenant_isolation_policy`. For the 10 VESTIGIAL flags that cannot happen — see §3.

---

## 2. Method

`set_config` lines were mapped to their **innermost enclosing `$transaction`** by
brace/paren matching over the real source (CRLF-normalised), not by proximity; every
`tx.<model>` operation inside each matched body was enumerated and checked against the
literal `EXEMPT_MODELS` list in `lib/db/extensions/tenant-rls.ts`. Tenant scoping was then
read out of each transaction body. Line numbers are **current** — they drifted by 1–3 from
`SITE-AUDIT.md` §8 because quick-586 inserted import lines.

---

## 3. VESTIGIAL — 10 flags, recommend removal

All ten are on a `tenantPrisma` transaction (converted by quick-586, so
`app.current_tenant_id` is set on the connection), every model in the transaction is in
`EXEMPT_MODELS`, and every query carries an **explicit** tenant predicate.

| # | file | flag line | tx range | models (all EXEMPT) | tenant predicate |
|---|---|---|---|---|---|
| 1 | `(driver)/actions/driver-routes.ts` | **275** | 274–292 | CarrierDriver, CarrierStop | explicit `orgId` |
| 2 | `(driver)/actions/driver-routes.ts` | **320** | 319–337 | CarrierDriver, CarrierStop | explicit `orgId` |
| 3 | `api/driver/stops/[stopId]/documents/route.ts` | **119** | 118–140 | CarrierDriver, CarrierStop | explicit `orgId` |
| 4 | `api/driver/stops/[stopId]/documents/route.ts` | **244** | 243–276 | CarrierDriver, CarrierStop, CarrierDocument | explicit `orgId` |
| 5 | `api/driver/stops/[stopId]/messages/route.ts` | **41** | 40–60 | CarrierDriver, CarrierStop | explicit `orgId` |
| 6 | `api/driver/stops/[stopId]/messages/route.ts` | **183** | 182–201 | CarrierDriver, CarrierStop | explicit `orgId` |
| 7 | `api/mobile/.../dispatches/[id]/expenses/route.ts` | **100** | 99–164 | CarrierDriver, Trip, CarrierStop, CarrierExpense | explicit `auth.tenantId` |
| 8 | `api/mobile/.../stops/[stopId]/documents/route.ts` | **113** | 112–121 | CarrierStop | `dispatch: { orgId: auth.tenantId }` |
| 9 | `api/v1/carrier/stops/[id]/messages/route.ts` | **38** | 37–43 | CarrierStop | `dispatch: { orgId: tenantId }` |
| 10 | `api/v1/carrier/stops/[id]/messages/route.ts` | **170** | 169–186 | CarrierStop | `dispatch: { orgId: tenantId }` |

**Evidence for the classification, not intuition:** each of these reads rows the caller's own
tenant owns, named as such in the `where`. Post-cutover, `tenant_isolation_policy` on
`carrier_drivers` / `dispatches` / `loads` / `carrier_expenses` resolves
`org_id = current_tenant_id()`, the GUC is set correctly by `getTenantPrisma*`, and the rows
match — so the bypass adds nothing. On the three target tables there will be no
`bypass_rls_policy` by decision, so the flag can never fire there regardless. **Removing these
ten cannot change which rows are returned.**

**Step 5 check (non-exempt models newly filtered): PASSES for all ten.** Every model listed
is in `EXEMPT_MODELS`, so the extension injects nothing before or after removal. No model in
any of these ten transactions would newly acquire a `tenantId` filter.

---

## 4. DEFER — 2 flags, third class, do NOT remove

| # | file | flag line | tx range | operation |
|---|---|---|---|---|
| A | `api/driver/stops/[stopId]/documents/route.ts` | **178** | 177–197 | `carrierDocument.create` |
| B | `api/mobile/.../stops/[stopId]/documents/route.ts` | **159** | 158–179 | `carrierDocument.create` |

These are the only two candidates that are **writes**, and the only two whose transaction body
carries **no tenant predicate at all** — necessarily, because `carrier_documents` has no
tenant column (confirmed in `schema.prisma`: `parentId` / `stopId`, no `orgId`; the `orgId` at
schema line 2622 belongs to the adjacent `CarrierDocumentType`). Tenancy is reached only by
the `stop_id` → `stops` → `dispatches.org_id` join.

They are not third-class for the step-5 reason (no non-exempt model is present). They are
third-class for a different and, I think, more important reason:

> **The brief's decision covers `stops` and `route_template_stops`. It does not mention
> `carrier_documents`.** Whether `carrier_documents` gets a `bypass_rls_policy` is still open,
> and these two INSERTs are exactly the statements a future join-based `WITH CHECK` on
> `carrier_documents` would govern. Removing their flag now decides that open question by
> implication, in the direction that could fail a write.

**Recommendation: hold both until the `carrier_documents` policy shape is settled.** If it is
decided that `carrier_documents` also gets no bypass policy, both flags become vestigial by
the same argument as §3 and can be removed in the same follow-up.

---

## 5. EXCLUDED — 1 flag

`(owner)/carrier/stops/[id]/page.tsx` **line 120**, transaction 119–153, models
`CarrierDocument` + **`User` (NON-EXEMPT)**. Forbidden by the brief, and independently
third-class: `User` carries `tenantId`, so this transaction is the one quick-586 already left
on the bare client with a counter-assertion (`site-3b-needs-decision-untouched`).

Note the same file also carries flags at **91** (tx 90–103, `Trip`) and **110** (tx 109–115,
`CarrierLoad`). Neither transaction touches the three tables, so both fall in §6 regardless.
Reading the brief's exclusion as "the whole file", which is the conservative reading, changes
nothing about the outcome — flagged only so the boundary is explicit rather than assumed.

---

## 6. OUT OF SCOPE — 16 flags whose transaction never touches the three tables

Listed so nobody mistakes them for the "nine sites" later. **Do not remove these.** Twelve of
the sixteen touch a non-exempt model.

| file | flag lines | models in tx |
|---|---|---|
| `(driver)/actions/driver-routes.ts` | 47, 123, 193 | CarrierDriver, Trip (exempt, but no target table) |
| `(owner)/carrier/stops/[id]/page.tsx` | 91, 110 | Trip · CarrierLoad |
| `(owner)/carrier/trips/[id]/page.tsx` | 137 | **FleetMessage (NON-EXEMPT)** |
| `(owner)/carrier/trips/[id]/stops/page.tsx` | 118 | **FleetMessage (NON-EXEMPT)** |
| `api/driver/stops/[stopId]/messages/route.ts` | 65, 91, 217 | **FleetMessage (NON-EXEMPT)** |
| `api/driver/stops/[stopId]/messages/route.ts` | 104, 207 | **User (NON-EXEMPT)** |
| `api/v1/carrier/stops/[id]/messages/route.ts` | 48, 75, 199 | **FleetMessage (NON-EXEMPT)** |
| `api/v1/carrier/stops/[id]/messages/route.ts` | 88 | **User (NON-EXEMPT)** |

All twelve non-exempt ones are still on the **bare `prisma`** client — quick-586 deliberately
did not convert them (out of its scope), so they have no correct GUC either. That is a real
open item, but it is a *conversion* question, not a *flag* question, and it belongs with the
nested-include follow-up quick-586 reported, not here.

---

## 7. What I did not do

- Removed nothing. Stopped at step 3 as instructed.
- Did not touch `tenant-rls.ts`, `EXEMPT_MODELS`, `getTenantPrisma`, any policy, any
  migration, `schema.prisma`, or `stops/[id]/page.tsx`.
- Did not write the step-7 guard test — it depends on which flags are approved for removal,
  and its SYSTEM counter-assertion currently has an empty set to pin.
- Did not run `tsc` / `next build` / the Vitest suite: no source file changed, so there is
  nothing to regress. Those gates belong to session two.
