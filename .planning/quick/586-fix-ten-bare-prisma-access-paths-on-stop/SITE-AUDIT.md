# quick-586 — Re-derived Site Audit

Read-only. No source file under `apps/web/src` was modified while producing this
document (verified with `git status --porcelain apps/web` before any Task 2/3 edit).

---

## 1. Corrected helper signatures (F1) — CONFIRMED, no drift

`apps/web/src/lib/context/tenant-context.ts`:

- `getTenantPrisma(): Promise<PrismaClient>` — line 47. **Zero arguments.** Calls
  `requireTenantId()` (reads `x-tenant-id` header) and `getSession()`, then fires
  `await prisma.$executeRawUnsafe("SELECT set_config('app.current_tenant_id', $1, false)", tenantId)`
  (line 54-57, session scope, `false`) before returning `createTenantClient(tenantId, session?.userId ?? null)`.
- `getTenantPrismaForOrg(tenantId: string, userId?: string | null): Promise<PrismaClient>` —
  line 76. Same `set_config(..., false)` statement (lines 80-83), no header read.

`getTenantPrisma(session)` does not exist anywhere in this codebase and is not written
anywhere in this task's diffs (`grep -rn "getTenantPrisma(session" apps/web/src` → empty).

---

## 2. Re-derived grep counts vs F8 vs the diagnostic

Run from `apps/web/src`:

| grep | today | F8 (plan) | diagnostic |
|---|---|---|---|
| `\.(carrierStop\|carrierDocument\|routeTemplateStop)\b` occurrences | **159** | 159 | — |
| files matching the same pattern | **32** | 32 | 31 |
| `routeStop` (legacy `RouteStop`, case-insensitive substring, unfiltered) | 1573 | — | — |
| `^\s*stops:\s*\{` (nested include) | **37** | 37 | 34 |

**No drift from F8.** F8's numbers hold exactly.

**The 32-vs-31 file.** The extra file over the diagnostic's 31 is
`apps/web/src/generated/prisma/index.d.ts` — Prisma's own generated type declaration file.
It contains the string `carrierStop:` etc. as TypeScript property names on the generated
`PrismaClient` type (e.g. `carrierStop: Prisma.CarrierStopDelegate<...>`), which the
accessor grep matches but which is not a query site — it is the type declaration the query
sites import against. Excluded from the 32→31 reconciliation; the diagnostic's 31
real-source files are otherwise the same 31 of the 32.

**The 34→37 nested-include drift.** Confirmed +3, not investigated line-by-line (out of
this task's scope — Task 1 asks only to name it), but the exclusion class is verified below.

---

## 3. Corrected access count excluding legacy `RouteStop`

The 37 nested `stops: {` sites are NOT all the same relation. Four sites reference the
**legacy `Route` → `RouteStop`** relation, a different table entirely (`Route` is the
pre-Carrier-Ops model; `RouteStop` has no bearing on this task's three tables):

- `app/(owner)/actions/routes.ts:170` — `Route.stops` (legacy)
- `app/(owner)/actions/routes.ts:622` — `Route.stops` (legacy)
- `app/api/mobile/owner/routes/route.ts:242` — legacy `Route.stops`
- `app/api/mobile/owner/routes/[id]/route.ts:51` and `:187` — legacy `Route.stops`
  (two sites, same file)

That is 5 nested-include occurrences across legacy `Route`, in 3 distinct files
(`(owner)/actions/routes.ts` twice, `api/mobile/owner/routes/route.ts` once,
`api/mobile/owner/routes/[id]/route.ts` twice — 3 files, 5 occurrences).

**Corrected count: 37 − 5 = 32 real `CarrierStop`-via-`Trip`/`CarrierLoad`/`CarrierClient`/
`CarrierFacility` nested-include sites**, excluding the three named legacy-`Route` files.
This corrected count is informational only (Task 1 does not ask these nested-include sites
to be converted — see §7, "Additional observation").

---

## 4. Re-derived site table (14 sites) — file, lines, table(s), R/W, context, helper

Every line number below was re-read from the working tree just now, not copied from the
diagnostic or the plan text. Divergences from F4 are called out inline and summarised in §6.

### Group 1 — request context (`x-tenant-id` header present) → `getTenantPrisma()`

| # | file | site lines (tx root → accessor) | table(s) | R/W | classification |
|---|---|---|---|---|---|
| 1 | `app/(driver)/actions/driver-routes.ts` | tx 272→280 (`arriveAtStop`), tx 316→324 (`completeCurrentStop`) | CarrierStop | R | SAFE-TO-SWAP (each tx: carrierDriver EXEMPT, carrierStop EXEMPT) |
| 2 | `app/(owner)/carrier/loads/[id]/page.tsx` | 133, 255 | CarrierStop | R | SAFE-TO-SWAP (direct calls, no transaction, no bypass_rls) |
| 3 | `app/(owner)/carrier/stops/[id]/page.tsx` | 74 (direct); tx 116→118 | CarrierStop, CarrierDocument | R | **SPLIT** — see §5, NEEDS-DECISION on the tx |
| 4 | `app/(owner)/carrier/trips/[id]/page.tsx` | 92, 109, 114 | RouteTemplateStop, CarrierDocument | R | SAFE-TO-SWAP (all three are direct calls, NOT inside the file's `fleetMessage` transaction — see §5) |
| 5 | `app/(owner)/carrier/trips/[id]/stops/page.tsx` | 101 | CarrierDocument | R | SAFE-TO-SWAP (direct call, not inside the file's `fleetMessage` transaction) |
| 6 | `app/api/driver/stops/[stopId]/documents/route.ts` | tx 116→126 (POST step 1), tx 175→177 (POST step 4, **W**), tx 240→250,263 (GET) | CarrierStop, CarrierDocument | R+W | SAFE-TO-SWAP (every tx: carrierDriver EXEMPT, carrierStop EXEMPT, carrierDocument EXEMPT) |
| 7 | `app/api/driver/stops/[stopId]/messages/route.ts` | tx 38→48 (GET), tx 179→188 (POST) | CarrierStop | R | SAFE-TO-SWAP (both tx: carrierDriver EXEMPT, carrierStop EXEMPT only — the file's other three transactions, at 62/88/101 GET and 203/213 POST, touch only `fleetMessage`/`user` and are OUT OF SCOPE, see §5) |
| 10 | `app/api/v1/carrier/stops/[id]/messages/route.ts` | tx 35→37 (GET), tx 166→168 (POST) | CarrierStop | R | SAFE-TO-SWAP (both tx: carrierStop EXEMPT, nested `dispatch`/`primaryDriver` reads Trip+CarrierDriver, both EXEMPT) |

### Group 2 — `/api/mobile/*`, no header → `getTenantPrismaForOrg(orgId, userId)`

| # | file | site lines | table(s) | R/W | classification |
|---|---|---|---|---|---|
| 8 | `app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts` | tx 97→127 | CarrierStop | R | SAFE-TO-SWAP (tx: carrierDriver, trip, carrierStop, carrierExpense — all EXEMPT). Fields: `auth.tenantId`, `auth.userId` (confirmed in `MobileAuthContext`, `lib/auth/mobile-auth.ts:37-41`) |
| 9 | `app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts` | tx 110→112 (R), tx 156→158 (**W**) | CarrierStop, CarrierDocument | R+W | SAFE-TO-SWAP (each tx touches exactly one EXEMPT model). Same `auth.tenantId`/`auth.userId` fields |

### Group 3 — sites the diagnostic missed, already-resolved tenant client in scope

| # | file:line | table(s) | R/W | classification |
|---|---|---|---|---|
| 11 | `app/(driver)/actions/driver-dashboard.ts` — tx root at **line 85** (not :83 — see §6), `tx.carrierStop.count` at line 100 | CarrierStop | R | SAFE-TO-SWAP. `tenantPrisma` from `getTenantPrisma()` at line 70. Tx touches `trip` (EXEMPT) + `carrierStop` (EXEMPT). **The file's OTHER bare transaction, line 73-79 (`carrierDriver` only), is OUT OF SCOPE and untouched — it never reaches our three tables.** |
| 12 | `lib/carrier/trips.ts` — array-form tx at **line 1033** (not :1033 root differs slightly — confirmed 1033 is correct), `prisma.carrierStop.update` at line 1035 | CarrierStop | **W** | SAFE-TO-SWAP. `tenantPrisma` from `getTenantPrisma()` at **line 1017** (not :1025 — see §6), inside `reorderTripStops`. Array-form `$transaction([...])`, no `TX_OPTIONS` (none passed today; none added). |
| 13 | `lib/carrier/dispatch-generator.ts` — tx root at **line 331**, `tx.carrierStop.create` at line 420 | CarrierStop | **W** | SAFE-TO-SWAP. `tenantPrisma` from `getTenantPrismaForOrg(orgId)` at line 217, same function (`generateDispatches`), `orgId` is a function parameter (line 204). Tx touches `trip`, `carrierLoad`, `carrierStop` — all EXEMPT. No `TX_OPTIONS` passed. |
| 14 | `lib/carrier/route-template-save.ts` — tx roots at **lines 348 and 371**, `tx.routeTemplateStop.*` at lines 356, 358, 381 | RouteTemplateStop | **W** | SAFE-TO-SWAP. `db: PrismaClient` parameter at line 148 (`saveRouteTemplateCore(db, orgId, data)`). Both tx bodies touch only `routeTemplate` + `routeTemplateStop` — both EXEMPT. No `TX_OPTIONS` on either. The `prisma` import (line 30, "kept for $transaction — see below") becomes genuinely unused once both are swapped to `db.$transaction(` — confirmed by grep: no other `prisma.` usage in the file. |

**Every line number above was confirmed by directly reading the file just now.** Two Group
3 lines drifted from F4's text: driver-dashboard.ts's tx root is at line **85**, not 83
(F4 said ":83"), and trips.ts's `tenantPrisma` resolution is at line **1017**, not 1025 (F4
said ":1025"). Both are off by single-digit line counts from ordinary file drift since
planning; neither changes the site's identity or classification.

---

## 5. Per-transaction model classification — the load-bearing part

This is classified **per transaction body**, not per file, per hard constraint 7.

### NEEDS-DECISION — 1 transaction, NOT converted

**`app/(owner)/carrier/stops/[id]/page.tsx`, transaction at lines 116-150** (the
`documents` fetch). Body touches:

- `tx.carrierDocument.findMany` (line 118) — **CarrierDocument, EXEMPT**
- `tx.user.findMany` (line 136) — **User, NOT EXEMPT** (`schema.prisma:260`, `tenantId String @db.Uuid`)

Per hard constraint 7, a transaction touching a non-exempt model is NEEDS-DECISION unless
the injection is **provably a no-op**. Checked directly: the `where` on `tx.user.findMany`
at line 136-139 is `{ id: { in: uploaderIds } }` — **no existing `tenantId` filter at all**.
Swapping the transaction root to a tenant client would have `withTenantRLS` inject
`AND tenantId = orgId` into that `where`. In practice every `uploaderId` here was written
from `session.userId` at upload time by a user of this tenant, so the injected filter is
very likely a true no-op — but it is **not provable from the query text**, which is the bar
hard constraint 7 sets. This is exactly the shape F3 flagged for this file.

**This transaction is left as bare `prisma.$transaction(...)` in Tasks 2/3. It is NOT
converted.**

**Proposed pattern for the policy work / a future task**, not built here: either
(a) split the transaction so the CarrierDocument fetch (line 118) runs on `tenantPrisma`
outside the shared transaction while the `User` lookup stays on the bare `prisma` client
with its own `bypass_rls` set_config (this is what "conversion" would look like without
touching User's injection), or (b) audit that every `Document.uploadedBy` on this table is
provably scoped to the tenant (a data-model guarantee, not a query-text one) and accept
the swap as a deliberate decision, recorded as such. Neither is done here.

**The rest of site 3 (line 74, the standalone `prisma.carrierStop.findUnique`) has no
transaction wrapper and no non-exempt model in its own call — it is independently
SAFE-TO-SWAP** and is converted on its own in Task 2, separate from the NEEDS-DECISION tx.

### SAFE-TO-SWAP — every other transaction in the fourteen sites

Confirmed per §4's table. Summary of non-exempt models found and why they do not block:

- **`app/(owner)/carrier/trips/[id]/page.tsx`** — F3 listed `fleetMessage` as a model this
  file's bare-prisma usage reaches. Re-verified: the file's `fleetMessage` access is a
  **separate transaction** at lines 133-140 (`tx.fleetMessage.groupBy`) that does **not**
  wrap the three-table accesses at lines 92, 109, 114 — those three are plain, unwrapped
  `prisma.routeTemplateStop.findMany` / `prisma.carrierDocument.groupBy` calls with no
  `$transaction` around them at all. Converting them to `tenantPrisma.routeTemplateStop…` /
  `tenantPrisma.carrierDocument…` touches no other model and is a pure client swap. The
  `fleetMessage` transaction is untouched — it was never one of the fourteen sites and
  contains no access to our three tables.
- **`app/(owner)/carrier/trips/[id]/stops/page.tsx`** — identical shape. The three-table
  access (line 101, `carrierDocument.groupBy`) is a standalone call; the file's `fleetMessage`
  transaction (lines 114-121) is separate and untouched.
- **`app/(owner)/carrier/stops/[id]/page.tsx`** — see NEEDS-DECISION above; this is the one
  file where a genuine non-exempt model shares a transaction with an in-scope table.
- **`app/api/driver/stops/[stopId]/messages/route.ts`** and
  **`app/api/v1/carrier/stops/[id]/messages/route.ts`** — both have several bare-`prisma`
  transactions touching `fleetMessage`/`user` (message send/list/mark-read/sender-name
  lookups). None of those transactions touch `stops`/`route_template_stops`/
  `carrier_documents` — verified by reading every transaction in both files (§4, Group 1
  rows 7 and 10 list only the two tx per file that do reach `CarrierStop`). Those
  message/user transactions are **out of scope for this task** (not part of the fourteen)
  and are **not converted** — converting them is a separate FleetMessage/User RLS-hygiene
  task, not this one.

No other non-exempt model was found inside any of the fourteen sites' transaction bodies.

---

## 6. Divergences from `docs/diagnostics/rls-policy-gap-stops.md` and from the plan's F4

1. **The diagnostic's ten are all still bare.** Confirmed — every one of sites 1-10 above
   still runs its stated access through the bare `prisma` singleton, unchanged since the
   diagnostic (quick-583).
2. **Four more sites exist that file-level grep missed** — sites 11-14 (§4, Group 3),
   confirmed present and bare, two of them writes (12, 13, and 14's writes — three total
   writes: 12, 13, 14).
3. **`after()` — the set is EMPTY, not "two of them".** Confirmed by reading both blocks:
   - `app/api/driver/stops/[stopId]/messages/route.ts:243,250` — calls only
     `sendPushToUser(...)` and `createMessageNotification(...)`.
   - `app/api/v1/carrier/stops/[id]/messages/route.ts:225,232` — same two calls.
   Neither touches `stops`, `route_template_stops` or `carrier_documents`. All three-table
   access in both files happens synchronously before the response, inside a live session.
   **Zero of the fourteen sites' three-table accesses occur inside `after()`.**
4. **Cron — "none" is TRANSITIVELY false.** `app/api/cron/carrier-auto-dispatch/route.ts:108`
   calls `generateDispatches(tenant.id, template.id, generateThroughDate)`
   (`lib/carrier/dispatch-generator.ts`), whose transaction at line 331 creates a
   `carrierStop` row at line 420 (site 13). The cron already threads an explicit
   `tenant.id` all the way through (`route.ts:83` loop variable → `generateDispatches`
   param → `getTenantPrismaForOrg(orgId)` at `dispatch-generator.ts:217`) — the fix needs
   no fabricated session, only using the client that function already resolves.
5. **Grep counts drifted exactly as F8 predicted and no further**: 159 / 32 / 37, matching
   F8's own numbers (not the diagnostic's older 31 / 34). The 32nd file is
   `generated/prisma/index.d.ts` (§2) — a type declaration, not a query site. The 37→34
   nested-include drift is +3 as F8 said; §3 identifies and excludes the legacy-`RouteStop`
   sites from any "real" count.
6. **Two Group 3 line numbers drifted from F4's text** (site 11's tx root: line 85 not 83;
   site 12's `tenantPrisma` resolution: line 1017 not 1025) — ordinary drift since planning,
   noted in §4, no effect on classification.
7. **NEEDS-DECISION was not previously named as a concrete transaction anywhere in the plan
   text** — F3 flagged `User` as a non-exempt model present in this file's bare-prisma
   reach, but did not identify that it is scoped to exactly one transaction (lines 116-150)
   that also touches the in-scope `CarrierDocument`, while the file's OTHER two bare
   transactions (lines 87-100 and 106-112) touch only `Trip` and `CarrierLoad` — both
   EXEMPT — and are therefore not NEEDS-DECISION themselves; they are simply outside our
   three-table scope entirely (neither reaches `stops`/`route_template_stops`/
   `carrier_documents`) and are left as-is, untouched by this task either way.
8. **F3's per-file "models reached through `tx.`" table over-attributed risk to two files**
   that turn out to have NO transaction wrapping their three-table access at all
   (`trips/[id]/page.tsx`, `trips/[id]/stops/page.tsx` — see §5). Their `fleetMessage`
   transactions are real but are a different, unwrapped, out-of-scope access path within
   the same file, not the transaction root the three-table swap runs through.

---

## 7. Additional observation — OUT OF SCOPE, reported for completeness

While confirming site 1 (`app/(driver)/actions/driver-routes.ts`), two more bare-`prisma`
transactions in the SAME file were found that also reach the `stops` table, but via a
**nested `include: { stops: {...} } }` on `Trip`**, not a direct `.carrierStop` accessor —
so they are invisible to the accessor-grep methodology this task (and the diagnostic) uses,
and were never part of the fourteen-site enumeration:

- `getMyActiveDispatch` — `prisma.$transaction(...)` at line 45, `tx.trip.findFirst`
  (lines 78, 89) with `include: { stops: {...} } }` (line 58) reaching `CarrierStop`,
  `CarrierDocument` (nested `documents` at line 64), `CarrierFacility` (line 61),
  `CarrierLoad`/`CarrierClient` (line 70-74) — all EXEMPT.
- `getMyDispatchHistory` — `prisma.$transaction(...)` at line 121, `tx.trip.findMany`
  (line 130) with the same nested `stops`/`documents`/`facility`/`carrierLoads` shape
  (lines 142-157) — all EXEMPT.

Both transactions also already set `app.bypass_rls` (transaction-scoped) at their own
start (lines 46, 122), which is why F7's bypass_rls count for this file is 7 rather than
the 5 that sites 1's two direct-accessor transactions alone would produce (2 comment
mentions + 5 `set_config` statements across all 5 transactions in the file = 7, matching
F7 exactly).

**Model census for both: all EXEMPT** (Trip, CarrierStop, CarrierDocument, CarrierFacility,
CarrierLoad, CarrierClient) — by F2's argument these would be provably safe pure client
swaps if converted, same as sites 1-14.

**Not converted here.** This task's scope (Task 2/3's `<files>` lists, and the guard test's
`SITES` array) is bounded to the fourteen sites enumerated by the accessor-based grep
methodology (§4). Nested-include access to the three tables is a structurally identical
but categorically different discovery (Section 6 of the diagnostic itself calls this class
"invisible to a table-name grep" and separates it from the ten bare-prisma sites). Widening
scope to cover it would mean auditing some fraction of the 32 real nested-include sites
(§3), which is a materially larger task than "convert the ten/fourteen enumerated sites."
**Reported rather than converted, per this project's stated preference for naming a gap
loudly over quietly expanding scope to close it.** A follow-up task should audit the 32
real (non-legacy-`Route`) nested-include sites the same way this task audited the 14
accessor sites, per-transaction, and convert the SAFE-TO-SWAP ones.

---

## 8. `bypass_rls` expectation census — exact line numbers

| file | comment mentions | `set_config` statement lines | total |
|---|---|---|---|
| `(driver)/actions/driver-routes.ts` | 36, 39 | 46, 122, 192, 273, 317 | 7 |
| `(owner)/carrier/loads/[id]/page.tsx` | — | — | **0** (the only one of the ten that sets none) |
| `(owner)/carrier/stops/[id]/page.tsx` | — | 88, 107, 117 | 3 |
| `(owner)/carrier/trips/[id]/page.tsx` | — | 134 | 1 |
| `(owner)/carrier/trips/[id]/stops/page.tsx` | — | 115 | 1 |
| `api/driver/stops/[stopId]/documents/route.ts` | 107, 108, 237 | 117, 176, 241 | 6 |
| `api/driver/stops/[stopId]/messages/route.ts` | 32, 174 | 39, 63, 89, 102, 180, 204, 214 | 9 |
| `api/mobile/.../dispatches/[id]/expenses/route.ts` | 90, 91 | 98 | 3 |
| `api/mobile/.../stops/[stopId]/documents/route.ts` | 101, 102 | 111, 157 | 4 |
| `api/v1/carrier/stops/[id]/messages/route.ts` | 29, 160 | 36, 46, 73, 86, 167, 196 | 8 |

All ten counts match F7 exactly — no drift. Group 3 files (11-14) set NO `bypass_rls` at
their swap points — `driver-dashboard.ts` line 85's tx and `trips.ts`'s array-transaction,
`dispatch-generator.ts`'s tx at 331, and `route-template-save.ts`'s two tx at 348/371 carry
no `set_config('app.bypass_rls'...)` call at all; they rely solely on the tenant-scoped
client (once converted) or explicit `orgId`/`where` filters.

**Hand-off to the policy work.** Every `set_config('app.bypass_rls', 'on', TRUE)` statement
above is left byte-identical — this task does not touch, remove or reorder any of them
(forbidden_changes). Once a policy exists on `stops`, `route_template_stops` or
`carrier_documents`, if that policy includes the control tables' `bypass_rls_policy` half
(§4/§8.5 of the diagnostic recommends adding it), **every line in this table becomes a
site where that request deliberately bypasses tenant isolation on these three tables by
design** — not a bug, but a scope the policy author must decide on knowingly. The
conversion this task performs does not change that calculus; its value for these
`bypass_rls`-setting sites is GUC hygiene and defence-in-depth (the session-scope
`app.current_tenant_id` GUC is set correctly regardless of whether `bypass_rls_policy`
ever fires), not a change to what the bypass itself permits.

---

## 9. Summary — what Task 2/3 will convert

- **13 of the 14 sites are SAFE-TO-SWAP** (1, 2, 3-partial [line 74 only], 4, 5, 6, 7, 8, 9,
  10, 11, 12, 13, 14).
- **1 transaction is NEEDS-DECISION and is NOT converted**:
  `app/(owner)/carrier/stops/[id]/page.tsx` lines 116-150 (the `CarrierDocument` +
  `User` transaction). §5 has the proposed pattern.
- **Zero sites require a call-site change.** Zero sites lack a tenant context obtainable
  in-function. Zero conversions change a return shape. The brief's stop-and-report
  conditions (hard constraint 6) are not triggered by any of the fourteen sites.
- Four additional nested-include sites in `driver-routes.ts` are reported (§7) but out of
  this task's scope and not converted.
