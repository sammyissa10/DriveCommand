---
phase: quick-588
plan: 588
type: execute
wave: 1
depends_on: []
autonomous: true

files_modified:
  - apps/web/src/app/(driver)/actions/driver-routes.ts
  - apps/web/src/app/(driver)/actions/driver-load.ts
  - apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts
  - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts
  - apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
  - apps/web/tests/security/bypass-rls-flag-removal.test.ts
  - apps/web/tests/security/tenant-client-stop-access.test.ts
  - apps/web/tests/security/fail-closed-stop-access.test.ts

hard_constraints:
  - "NO RLS policy created, altered or dropped. NO migration file written or applied. No Supabase MCP apply_migration / execute_sql DDL."
  - "DO NOT edit apps/web/src/lib/db/extensions/tenant-rls.ts, EXEMPT_MODELS, getTenantPrisma, getTenantPrismaForOrg, or apps/web/prisma/schema.prisma."
  - "DO NOT change any where / select / include / orderBy / take / TX_OPTIONS argument or any return shape. The only edits permitted to query code are (a) the receiver of $transaction, (b) removal of the bypass set_config line inside a converted transaction, (c) the site-F split."
  - "DO NOT touch src/app/(owner)/actions/load-driver-assignments.ts or src/app/(owner)/actions/trucks.ts. Both are already correct (shadowing false positives, re-verified)."
  - "DO NOT touch driver-routes.ts transaction at L192-208 (startTrip ownership check) or its bypass flag. It reaches none of the three tables and is one of the retained out-of-scope flags."
  - "DO NOT touch the bypass flags in the other seven quick-587 files, nor stops/[id]/page.tsx's dispatch (@90) and load (@109) transactions."
  - "getTenantPrisma() takes NO arguments. getTenantPrismaForOrg(tenantId, userId?) is the header-less form. Never write getTenantPrisma(session)."
  - "STOP AND REPORT (do not work around) if: any site needs a call-site change or a return-shape change; site F's User lookup turns out to be a nested include on carrierDocument rather than a separate tx.user call; any transaction's model census contains a non-exempt model not already anticipated here."

must_haves:
  truths:
    - "The five straightforward transactions (A-E) run on a tenant-scoped Prisma client, with byte-identical queries and return shapes."
    - "The stops/[id]/page.tsx documents block is split: carrierDocument reads on tenantPrisma, the User lookup still on the bare client with its bypass flag."
    - "The nested-include audit re-run reports zero fail-closed sites, and site F is separately confirmed converted."
    - "Both pre-existing security guards (bypass-rls-flag-removal, tenant-client-stop-access) are GREEN after the change, updated where this task legitimately invalidated a pinned value."
    - "A new guard pins every converted site and pins the F split so a later merge cannot collapse it back; each assertion is proven red by an actual revert probe."
  artifacts:
    - path: "apps/web/tests/security/fail-closed-stop-access.test.ts"
      provides: "quick-588 conversion guard, CRLF-normalised, site-count floor, byte floor, was-it-found assertions"
    - path: "apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx"
      provides: "the split documents block"
  key_links:
    - from: "apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts"
      to: "getTenantPrismaForOrg"
      via: "auth.tenantId, auth.userId from validateMobileToken"
      pattern: "getTenantPrismaForOrg\\(auth\\.tenantId, auth\\.userId\\)"
    - from: "apps/web/src/app/(driver)/actions/driver-load.ts"
      to: "getTenantPrisma"
      via: "session-cookie request context"
      pattern: "await getTenantPrisma\\(\\)"
---

<objective>
Move the ten fail-closed carrier access paths onto tenant-scoped Prisma clients **before** the
drafted RLS policies on `stops`, `route_template_stops` and `carrier_documents` are applied. On
cutover day these ten would all return zero rows at once — driver route screens, mobile dispatch
endpoints, and the owner stop-detail document list.

Purpose: remove the last fail-closed blockers to the RLS Phase 2 cutover.
Output: five transaction-root client swaps, one transaction split, three guard-test updates, and
a re-run of the nested-include audit showing zero fail-closed sites.

**This plan carries completed research. Do not re-derive it — VERIFY each stated fact against the
file, report any divergence, then act.**
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/diagnostics/rls-policy-design.md
@apps/web/tests/security/bypass-rls-flag-removal.test.ts
@apps/web/tests/security/tenant-client-stop-access.test.ts
</context>

<research_findings>

## DIVERGENCE 1 — the count is TEN, not eleven. Report this prominently.

`docs/diagnostics/rls-policy-design.md` §6b is titled "**10**, in 5 files" and lists ten rows.
The brief's "eleven" traces to an arithmetic slip in quick-588 §7, which wrote *"the ten
fail-closed sites in §6b **plus** the one in §3"* — but **§6b row #10 IS the §3 site**
(`stops/[id]/page.tsx:121`), so it was counted twice. Re-derived against the current tree:
**9 nested-include sites + 1 direct site = 10.** Nothing is missing; one site was double-counted.
Use 10 throughout.

## DIVERGENCE 2 — ten sites, but only SIX transaction roots.

The client swap happens at the transaction root, so the nine nested sites collapse into five
root edits plus the special case. **All line numbers below were re-verified against the working
tree today.**

| # | file | tx root | models called in tx | nested keys | §6b sites |
|---|---|---|---|---|---|
| A | `src/app/(driver)/actions/driver-routes.ts` | `return prisma.$transaction` **L46** | `tx.carrierDriver`, `tx.trip` ×2 | `stops:` L59, `documents:` L65 | 1, 2 |
| B | `src/app/(driver)/actions/driver-routes.ts` | `return prisma.$transaction` **L122** | `tx.carrierDriver`, `tx.trip` | `stops:` L143, `documents:` L149 | 3, 4 |
| C | `src/app/(driver)/actions/driver-load.ts` | `return prisma.$transaction` **L39** | `tx.carrierDriver`, `tx.trip`, `tx.carrierLoad` | `stops:` L68 | 5 |
| D | `src/app/api/mobile/carrier/driver/dispatches/route.ts` | `const dispatches = await prisma.$transaction` **L36** | `tx.carrierDriver`, `tx.trip` | `stops:` L61, `documents:` L70 | 6, 7 |
| E | `src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts` | `const result = await prisma.$transaction` **L42** | `tx.carrierDriver`, `tx.trip` | `stops:` L74, `documents:` L78 | 8, 9 |
| F | `src/app/(owner)/carrier/stops/[id]/page.tsx` | `const documents = await prisma.$transaction` **L119** | `tx.carrierDocument` (L121), **`tx.user`** (L140) | — direct call | 10 |

## STEP-5 MODEL CENSUS (the quick-587 non-exempt check) — done, verified against `EXEMPT_MODELS`

`EXEMPT_MODELS` (in `src/lib/db/extensions/tenant-rls.ts`, **do not edit**) contains
`CarrierDriver`, `Trip`, `CarrierLoad`, `CarrierStop`, `CarrierDocument`, `CarrierExpense`,
`RouteTemplateStop`, and the rest of the carrier family.

- **A, B, C, D, E — PASS.** Every model called in each of those five transactions is exempt, so
  the tenant-RLS extension injects nothing. The swap is a pure receiver change and the emitted
  SQL is bit-identical. (E's nested `expenses` include resolves to `CarrierExpense` — exempt.)
- **F — FAILS the check.** The transaction calls `tx.user.findMany` and **`User` is NOT exempt**,
  so a wholesale swap would newly inject a `tenantId` filter into that lookup. F must be split,
  never swapped whole.

## DIVERGENCE 3 — a THIRD transaction in driver-routes.ts is out of scope.

`driver-routes.ts` also has `const owned = await prisma.$transaction` at **L192** (`startTrip`
ownership check: `tx.carrierDriver` + `tx.trip`, no nested `stops`/`documents`). It never reaches
the three tables. **Leave it and its bypass flag alone.** The file's two other transactions
(L274, L318) are already on `tenantPrisma` from quick-586.

## STEP-2 SHADOWING CHECK — no false positives among the ten. Two found elsewhere.

Measured (`import { prisma` from `@/lib/db/prisma` vs `const prisma =` shadow count):

| file | bare import | shadows | verdict |
|---|---|---|---|
| `driver-routes.ts` | 1 (L14) | 0 | genuinely bare |
| `driver-load.ts` | 1 (L14) | 0 | genuinely bare |
| `mobile .../dispatches/route.ts` | 1 (L3) | 0 | genuinely bare |
| `mobile .../dispatches/[id]/route.ts` | 1 (L3) | 0 | genuinely bare |
| `stops/[id]/page.tsx` | 1 (L8) | 0 | genuinely bare |
| **`(owner)/actions/load-driver-assignments.ts`** | **0** | **4** | **already correct — DO NOT TOUCH** |
| **`(owner)/actions/trucks.ts`** | **0** | **7** | **SECOND false positive — DO NOT TOUCH.** quick-588 excluded it only for being legacy `Truck.documents` → `Document`; it is *also* shadowed. Report both reasons. |

## Auth context per file — verified today, use exactly these

- **A, B** (`driver-routes.ts`) — `requireRole([DRIVER])` + `getSession()`, session-cookie request
  context, `x-tenant-id` header present. **`getTenantPrisma` is already imported at L15.**
  → `const tenantPrisma = await getTenantPrisma();`
- **C** (`driver-load.ts`) — same auth shape. **No tenant helper imported yet — add the import.**
  → `const tenantPrisma = await getTenantPrisma();`
- **D, E** (mobile dispatches) — `validateMobileToken(req)` → `auth.tenantId` / `auth.userId`.
  `/api/mobile/*` sends **no `x-tenant-id` header** (DEC-11), so `getTenantPrisma()` would throw.
  → `const tenantPrisma = await getTenantPrismaForOrg(auth.tenantId, auth.userId);`
  Both files already use `auth.tenantId` / `auth.userId` in their `where` clauses — no new plumbing.
- **F** (`stops/[id]/page.tsx`) — `getSession()` @L62, `orgId = session.tenantId` @L70, and
  **`const tenantPrisma = await getTenantPrisma()` ALREADY EXISTS at L73** (quick-586).
  The split reuses that variable. **Do not add a second call.**

## Site F is SEPARABLE — verified by reading L119-153

The body is sequential, not nested:

1. `const docs = await tx.carrierDocument.findMany({ where: { stopId: id }, orderBy: { createdAt: 'desc' }, select: { id, documentType, filename, fileSizeBytes, fileUrl, uploadedBy, createdAt } })`
2. `const uploaderIds = [...new Set(docs.map(d => d.uploadedBy).filter(Boolean) as string[])]`
3. `if (uploaderIds.length) { const users = await tx.user.findMany({ where: { id: { in: uploaderIds } }, select: { id, firstName, lastName, email } }); ... }`
4. `return docs.map(d => ({ ...d, uploaderName: ..., createdAt: d.createdAt.toISOString() }))`

The `User` reference is a **separate `tx.user.findMany`**, not an include. The STOP condition does
not trigger. `documents` is consumed at L165 (`.some(d => d.documentType === 'bol')`), L166
(`'pod'`) and L322 (`documents={documents}` prop) — the return shape must stay identical.

## The three bypass-flag facts

- `set_config('app.bypass_rls'` statement counts today: `driver-routes.ts` **3**,
  `driver-load.ts` **1**, `dispatches/route.ts` **1**, `dispatches/[id]/route.ts` **1**,
  `stops/[id]/page.tsx` **3**. Repo-wide non-test count in `apps/web/src`: **218**.
- **`set_config(..., TRUE)` is transaction-local.** So F's `User` lookup must keep its own
  `prisma.$transaction` wrapper to keep its flag meaningful — do not hoist it to a bare
  `prisma.user.findMany`.

## DIVERGENCE 4 (NEW — not in the brief) — two committed guards collide with this work

**These were found by reading the guard files, not assumed. Both must be handled or this task
ships a red suite.**

### 4a. `tests/security/bypass-rls-flag-removal.test.ts` RULE 1 forbids the brief's flag policy.

Its RULE 1 is: *"no `tenantPrisma` / `db` transaction body may contain `set_config('app.bypass_rls'`"*.
Converting A and B to `tenantPrisma.$transaction` **while keeping their flags** produces two
offenders and turns that committed guard RED.

Its RULE 2 pins `countOf(src, BYPASS) === retainedFlags` per file, with
`{ path: 'app/(driver)/actions/driver-routes.ts', retainedFlags: 3, removedFlags: 2 }` and
totals `TOTAL_REMOVED = 12`, `TOTAL_RETAINED = 17`.

**Resolution — the flag inside each CONVERTED transaction is removed, and the guard table is
updated to the measured values.** This is quick-587's own established rule applied uniformly, and
it touches only flags *inside the six in-scope transactions*. Every out-of-scope flag stays
byte-identical. Report this as a deliberate, evidenced divergence from the brief's
"leave every flag except F's" wording.

Expected post-change values (executor must **measure**, not copy):
- `driver-routes.ts`: `retainedFlags: 3 → 1` (only `startTrip` @L192 keeps one), `removedFlags: 2 → 4`
- `stops/[id]/page.tsx`: **`retainedFlags` stays 3** — the documents tx loses its flag but the new
  `User`-only `prisma.$transaction` carries one, so the file's count is unchanged at 3, and the
  `bareWithFlag.length === 3` half of RULE 2 still holds (dispatch, load, user).
- `TOTAL_REMOVED: 12 → 14`, `TOTAL_RETAINED: 17 → 15`.
- **Do NOT add `driver-load.ts` or the two mobile dispatch routes to that `FILES` array** — its
  integrity floor asserts `FILES.length === 9`. Their coverage belongs in the new quick-588 guard.
- The final belt-and-braces check asserts `checked >= 10`; verify it still passes (A/B bodies
  reference `tx.trip`/`tx.carrierDriver`, not `tx.carrierStop`, so they do not enter that count).

### 4b. `tests/security/tenant-client-stop-access.test.ts` site `site-3b-needs-decision-untouched`
asserts `mustContain: /const documents = await prisma\.\$transaction\(async \(tx\) => \{/` — i.e.
it explicitly pins F as **unconverted**. The F split invalidates it. That row must be **inverted**
in the same commit as the split: it becomes the assertion that the split HAPPENED
(`tenantPrisma` carries `carrierDocument`, a bare `prisma.$transaction` still carries `tx.user`).
Keep `SITES.length` correct — the integrity floor asserts `15`; adjust it only if you change the
row count, and prefer editing the row in place so it stays 15.

Also verified safe: `site-1-driver-routes`'s `mustNotContain` regex targets a
`const owned = await prisma.$transaction` block ending in `tx.carrierStop.findFirst`. Neither A
(`return prisma.$transaction`) nor B matches it, and `startTrip` @L192 uses `tx.trip.findFirst`.
That row stays green untouched — **confirm by running it, do not assume.**

## Nested-include audit reproduction (step 6)

Audit logic: walk every `^\s*(stops|documents|carrierDocuments|routeTemplateStops)\s*:\s*\{` back
to its enclosing `<recv>.<model>.<op>(`, resolving `tx` to its `$transaction` receiver. Today it
reports **46 raw sites**, of which 30 genuinely reach the three tables. Exclusions to preserve
(all re-verified): 8 legacy `Route.stops` → `RouteStop` (incl. 2 nested under `route:` in
`api/mobile/{driver,owner}/loads/[id]/route.ts`), 4 legacy `Truck.documents` → `Document`,
4 non-Prisma false positives (`lib/geo/osrm.ts:135`,
`lib/document-import/facility-resolution.ts:127`, `resolution.ts:1206`,
`lib/trucks/compute-truck-status.ts:59` — a TypeScript interface field), 3 test fixtures in
`facility-ladder.test.ts`. **Discriminator: `orderBy: { position }` = legacy `RouteStop`;
`orderBy: { sequenceOrder }` = `CarrierStop`.**

**Site F is a DIRECT call, not a nested include — the nested audit will not cover it. Check it
separately.**

</research_findings>

<tasks>

<task type="auto">
  <name>Task 1: Verify the ten sites, then swap the five straightforward transaction roots (A-E)</name>
  <files>
apps/web/src/app/(driver)/actions/driver-routes.ts
apps/web/src/app/(driver)/actions/driver-load.ts
apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts
apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts
apps/web/tests/security/bypass-rls-flag-removal.test.ts
  </files>
  <action>
**VERIFY FIRST (do not skip — report any divergence before editing).**

1. Establish the pre-change baseline for the two committed guards:
   `npx vitest run tests/security/bypass-rls-flag-removal.test.ts tests/security/tenant-client-stop-access.test.ts`
   Record pass counts. Both must be GREEN before you touch anything.
2. Confirm each of the six transaction roots at the line numbers in `<research_findings>`
   DIVERGENCE 2. If a line number has moved, report the new one and continue.
3. Confirm the shadowing table: for each of the five in-scope files, `grep -c "import { prisma"`
   and `grep -c "const prisma ="`. Confirm `load-driver-assignments.ts` and `trucks.ts` show
   0 bare imports / 4 and 7 shadows respectively, and leave both untouched.
4. Confirm the model census for A-E contains only exempt models by grepping each transaction body
   for `tx\.[a-zA-Z]*\.` and checking each against `EXEMPT_MODELS` in
   `src/lib/db/extensions/tenant-rls.ts` (read only). **If any non-exempt model appears, STOP and
   report — do not convert that transaction.**

**THEN CONVERT — five edits, one per transaction root.**

For A and B in `driver-routes.ts`:
- Add `const tenantPrisma = await getTenantPrisma();` immediately after the existing
  `if (!session) throw new Error('Unauthorized');` in each function. `getTenantPrisma` is already
  imported at L15 — do not re-import, and **it takes no arguments**.
- Change `return prisma.$transaction(async (tx) => {` to `return tenantPrisma.$transaction(async (tx) => {`.
- **Delete the `await tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`;` line
  inside each of those two bodies** (DIVERGENCE 4a).
- Rewrite the `@bypass_rls reason:` block comment above each converted transaction to describe
  what is now true: a tenant-scoped client with `app.current_tenant_id` set, and why the bypass
  is no longer needed (the three target tables get no `bypass_rls_policy`; the sibling exempt
  models are admitted by `tenant_isolation_policy` because every query carries an explicit
  `orgId` predicate). Do not leave a comment describing a bypass that no longer happens.
- **Leave the transaction at L192 (`const owned = await prisma.$transaction`, `startTrip`)
  completely untouched, flag included.** `prisma` and `TX_OPTIONS` stay imported.

For C in `driver-load.ts`:
- Add `import { getTenantPrisma } from '@/lib/context/tenant-context';` after the existing
  `@/lib/db/prisma` import.
- Add `const tenantPrisma = await getTenantPrisma();` after the session guard, swap the receiver,
  delete the bypass line, rewrite the block comment as above.
- After the swap, `prisma` is unused in this file (its only usage is that transaction). **Remove
  `prisma` from the import and keep `TX_OPTIONS`**: `import { TX_OPTIONS } from '@/lib/db/prisma';`.

For D in `dispatches/route.ts` and E in `dispatches/[id]/route.ts`:
- Add `import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';`.
- Add `const tenantPrisma = await getTenantPrismaForOrg(auth.tenantId, auth.userId);` inside the
  `try` block, immediately before the transaction. **Not `getTenantPrisma()`** — `/api/mobile/*`
  has no `x-tenant-id` header (DEC-11) and it would throw.
- Swap the receiver, delete the bypass line, rewrite the `@bypass_rls reason: mobile-api` comment.
- `prisma` becomes unused in both files — reduce each import to
  `import { TX_OPTIONS } from '@/lib/db/prisma';`.

**Nothing else changes.** No `where`, `select`, `include`, `orderBy`, `take`, `TX_OPTIONS`
argument, or return statement may differ. Verify with `git diff` that every changed line is one
of: an import, a `const tenantPrisma =` insertion, a `$transaction` receiver, a deleted
`set_config` line, or comment prose.

**UPDATE THE COLLIDING GUARD (DIVERGENCE 4a):** in
`tests/security/bypass-rls-flag-removal.test.ts`, update the `driver-routes.ts` row to the
**measured** flag count (`grep -c "set_config('app.bypass_rls'"`), and update `TOTAL_REMOVED` /
`TOTAL_RETAINED` to the new sums. Do NOT add new files to that `FILES` array
(`FILES.length === 9` is its integrity floor). Add a short comment naming quick-588 as the reason
the numbers moved.

**VERIFY:** `npx tsc --noEmit` clean, both guards green, then commit.
`git commit` message: `fix(quick-588): route five fail-closed carrier transactions onto tenant clients`
  </action>
  <verify>
cd apps/web
# 1. tsc with an injected probe — a clean unprobed run is not evidence.
#    Inject `const __probe: number = 'y';` into driver-load.ts, run `npx tsc --noEmit`,
#    confirm THAT error is reported (not only unrelated syntax errors elsewhere), then
#    DELETE THE PROBE LINE BY HAND. Do NOT use `git checkout --` to remove it — that
#    reverts the whole file including this task's real work (quick-587 lost four edits
#    that way). Re-run `npx tsc --noEmit` and confirm 0 errors.
# 2. Receiver check:
grep -n '\$transaction' "src/app/(driver)/actions/driver-routes.ts" "src/app/(driver)/actions/driver-load.ts" "src/app/api/mobile/carrier/driver/dispatches/route.ts" "src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts"
#    Expected: driver-routes L~46/L~122 tenantPrisma, L~192 STILL prisma, L~274/L~318 tenantPrisma;
#    the other three files: tenantPrisma only.
# 3. Flag count, measured not assumed:
for f in "src/app/(driver)/actions/driver-routes.ts" "src/app/(driver)/actions/driver-load.ts" "src/app/api/mobile/carrier/driver/dispatches/route.ts" "src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts"; do echo "$(grep -c "set_config('app.bypass_rls'" "$f")  $f"; done
#    Expected: 1, 0, 0, 0.
# 4. npx vitest run tests/security/bypass-rls-flag-removal.test.ts tests/security/tenant-client-stop-access.test.ts  -> both GREEN
  </verify>
  <done>
A-E all run on a tenant client; startTrip and every out-of-scope flag byte-identical;
`git diff` contains no query-shape change; tsc probed clean; both committed guards green;
one commit made.
  </done>
</task>

<task type="auto">
  <name>Task 2: Split the stops/[id]/page.tsx documents transaction (site F)</name>
  <files>
apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
apps/web/tests/security/tenant-client-stop-access.test.ts
  </files>
  <action>
**VERIFY FIRST:** re-read L119-153. Confirm the `User` work is a **separate `tx.user.findMany`**
and not an include nested on `carrierDocument`. If it is a nested include, **STOP AND REPORT** —
leave the site unconverted and say so. (Verified separable today; confirm it still is.)

**THE SPLIT.** Replace the single `const documents = await prisma.$transaction(...)` block with
three sequential pieces, preserving the exact query arguments and the exact final shape:

1. **carrierDocument on the tenant client.** Reuse the `tenantPrisma` already declared at L73 —
   do not call `getTenantPrisma()` again. Issue the same `findMany` with the identical `where`,
   `orderBy` and `select`. **No bypass flag** — `CarrierDocument` is exempt so no `tenantId` is
   injected, and `carrier_documents` will have no `bypass_rls_policy`.
2. **The uploader-id derivation** stays as plain JS between the two reads
   (`[...new Set(docs.map(d => d.uploadedBy).filter(Boolean) as string[])]`).
3. **The User lookup stays on the bare `prisma` client, inside its own `prisma.$transaction`,
   with `set_config('app.bypass_rls', 'on', TRUE)` intact.** `User` is NOT in `EXEMPT_MODELS`, so
   a tenant client would newly inject a `tenantId` filter — that is exactly why this half cannot
   move. The wrapper transaction is required because `set_config(..., TRUE)` is transaction-local;
   do not flatten it to a bare `prisma.user.findMany`. Keep the `if (uploaderIds.length)` guard so
   an empty list issues no query, as today. Pass `TX_OPTIONS` as before.
4. **The final mapping** (`docs.map(d => ({ ...d, uploaderName, createdAt: d.createdAt.toISOString() }))`)
   produces `documents` with a **byte-identical shape** to today. Verify against its three
   consumers: L~165 `.some(d => d.documentType === 'bol')`, L~166 `'pod'`, and the
   `documents={documents}` prop. **If the split forces any consumer or prop type to change, STOP
   AND REPORT.**

Add a comment above the split naming quick-588 and stating why it is two clients: the
`carrierDocument` read must be tenant-scoped so it survives the RLS cutover; the `User` read must
stay on the bare client because `User` is non-exempt and would newly acquire a `tenantId` filter.
Say plainly that merging them back would break one or the other.

**Leave the dispatch transaction (@L90) and the load transaction (@L109) and their two flags
completely untouched.**

**UPDATE THE COLLIDING GUARD (DIVERGENCE 4b):** in
`tests/security/tenant-client-stop-access.test.ts`, the `site-3b-needs-decision-untouched` row
currently asserts `mustContain: /const documents = await prisma\.\$transaction\(async \(tx\) => \{/`
— it pins F as unconverted and will now fail. **Invert it in place** (keeping `SITES.length` at
15): rename it to something like `site-3b-documents-split`, assert the tenant half
(`tenantPrisma.carrierDocument.findMany(`), assert a bare `prisma.$transaction` still wraps
`tx.user.findMany`, and `mustNotContain` the old single-transaction shape. Update its doc comment
to explain the split rather than the old "NEEDS-DECISION" state.

Then confirm `bypass-rls-flag-removal.test.ts`'s `stops/[id]/page.tsx` row is still accurate:
the file's flag count should still be **3** (documents loses one, the new user tx gains one) and
`bareWithFlag.length` should still be 3. **Measure it; if it is not 3, update the row to the
measured value and adjust the totals.**

`git commit` message: `fix(quick-588): split the stop-detail documents read across tenant and bare clients`
This must be a separate, independently revertible commit from Task 1.
  </action>
  <verify>
cd apps/web
grep -n '\$transaction\|tenantPrisma\.\|tx\.user\|tx\.carrierDocument' "src/app/(owner)/carrier/stops/[id]/page.tsx"
grep -c "set_config('app.bypass_rls'" "src/app/(owner)/carrier/stops/[id]/page.tsx"   # expect 3
git diff -- "src/app/(owner)/carrier/stops/[id]/page.tsx"   # confirm no where/select/orderBy/prop change
npx tsc --noEmit                                            # 0 errors (probe as in Task 1)
npx vitest run tests/security/                              # all security guards green
  </verify>
  <done>
`carrierDocument.findMany` runs on `tenantPrisma` with no bypass flag; `user.findMany` runs on
bare `prisma` inside its own flagged transaction; `documents` shape and all three consumers
unchanged; file flag count is 3; site-3b inverted; separate commit made.
  </done>
</task>

<task type="auto">
  <name>Task 3: Re-run the audit, add the quick-588 guard with a real revert probe, verify the suite</name>
  <files>
apps/web/tests/security/fail-closed-stop-access.test.ts
  </files>
  <action>
**1. RE-RUN THE NESTED-INCLUDE AUDIT (step 6).** Write a throwaway script (scratchpad, not
committed) implementing the logic in `<research_findings>`: walk every
`^\s*(stops|documents|carrierDocuments|routeTemplateStops)\s*:\s*\{` in `apps/web/src` back to its
enclosing `<recv>.<model>.<op>(`, resolving `tx` to its `$transaction` receiver. Apply the same
exclusions (8 legacy `Route.stops`, 4 legacy `Truck.documents`, 4 non-Prisma false positives,
3 test fixtures), using `orderBy: { position }` vs `orderBy: { sequenceOrder }` as the
`RouteStop`/`CarrierStop` discriminator. Report: raw site count, genuine count (expect ~30), and
**fail-closed count, which must be 0.** Separately confirm site F, which is a direct call the
nested audit cannot see. If any site remains fail-closed, name it and why.

**2. ADD THE GUARD** `apps/web/tests/security/fail-closed-stop-access.test.ts`, following the
conventions already used by `tenant-client-stop-access.test.ts`:
- Normalise CRLF (`.replace(/\r\n/g, '\n')`) before any match — `core.autocrlf=true`, no
  `.gitattributes`, so an unnormalised scan passes vacuously on this checkout.
- A per-file byte floor (use each file's real size rounded down; `driver-load.ts` is ~2.7 KB, so
  a blanket 4000 floor would fail on correct source — floor each file individually).
- A "was it actually found" assertion for every `mustContain`.
- Assert the site count so deleting a row fails loudly.
- A counter-assertion proving the scan reads real content (e.g. `driver-routes.ts` still contains
  a real `set_config('app.bypass_rls'` for `startTrip`).

Pin, at minimum:
- A/B: `tenantPrisma.$transaction` on both, `startTrip` still `const owned = await prisma.$transaction`,
  and no `set_config('app.bypass_rls'` inside either converted body.
- C: `getTenantPrisma()` imported and called, `tenantPrisma.$transaction`, no bare `prisma.` usage.
- D/E: `getTenantPrismaForOrg(auth.tenantId, auth.userId)` — assert the **exact argument form**, so
  a later edit to `getTenantPrisma()` (which throws on `/api/mobile/*`) fails here.
- F: **the split** — `tenantPrisma` carries `carrierDocument.findMany`, AND a bare
  `prisma.$transaction` still carries `tx.user.findMany`. Both halves asserted, so a merge back to
  one client fails in whichever direction it is merged.

**3. ANTI-VACUITY PROBE — run it, do not claim it.** For each converted site in turn: hand-edit
the source to revert that one conversion (`tenantPrisma` → `prisma`, or collapse F back to a
single transaction), run the guard, **capture the actual failing output**, then **restore by
hand-editing back — never `git checkout --`**, which reverts the whole file including other work
(quick-587 lost two removals and two comment rewrites exactly this way). After every restore,
re-measure: `git diff --stat` must show only the intended files, and re-run the receiver and flag
greps from Tasks 1 and 2. Report the probe output verbatim in the summary, per site.

**4. FULL VERIFICATION.**
- `npx tsc --noEmit` with an injected `const __probe: number = 'y';` in a file this task actually
  edited; confirm THAT error is reported before believing a clean run; delete the probe by hand;
  re-run clean. If the only errors are syntax errors or sit in files you did not touch, the gate
  is blind — clear `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`
  and re-run.
- `npm run build` (or `npx next build`) in `apps/web` — must compile.
- Full Vitest suite, default reporter, against the quick-587 baseline of
  **63 failed / 1801 passed / 61 skipped / 3 todo / 1928 total**. Report the actual
  `Test Files ... | Tests ...` summary lines. A run whose output contains no test counts is not a
  green run. New tests should raise `passed` and `total`; `failed` must not rise. Investigate and
  report any new failure — do not absorb it into the baseline.
- Final flag accounting: repo-wide `grep -rn "set_config('app.bypass_rls'" src --include=*.ts
  --include=*.tsx | grep -v "__tests__\|tests/" | wc -l` — baseline was **218**; expect **213**
  (five removed from A-E, F net zero). Report the measured number, and if it differs, explain
  which file moved and why.

`git commit` message: `test(quick-588): pin the ten converted fail-closed carrier access paths`
  </action>
  <verify>
cd apps/web
npx vitest run tests/security/            # all green, including the new file
npx vitest run                            # compare to 63 failed / 1801 passed / 61 skipped / 3 todo / 1928 total
npx tsc --noEmit                          # 0 errors, probed
npm run build                             # compiles
grep -rn "set_config('app.bypass_rls'" src --include=*.ts --include=*.tsx | grep -v "__tests__\|tests/" | wc -l   # expect 213
  </verify>
  <done>
Audit re-run reports 0 fail-closed nested sites plus site F separately confirmed; the guard exists
and every assertion has been driven RED by a real hand-edit revert with captured output; tsc
probed clean; `next build` compiles; Vitest `failed` did not rise above 63; flag count measured
and explained; commit made.
  </done>
</task>

</tasks>

<verification>
- The re-derived site list is reported with all four divergences called out: count is 10 not 11;
  ten sites collapse to six transaction roots; driver-routes L192 is out of scope; and the two
  committed guards (`bypass-rls-flag-removal` RULE 1/2, `tenant-client-stop-access` site-3b)
  collide with this work and were updated rather than left red.
- Two shadowing false positives reported: `load-driver-assignments.ts` (0 bare / 4 shadows) and
  `trucks.ts` (0 bare / 7 shadows, excluded for two independent reasons) — neither touched.
- Per-transaction model census reported for all six, with F named as the single non-exempt case.
- `git diff` across all five source files contains no `where` / `select` / `include` / `orderBy` /
  `take` / `TX_OPTIONS` / return-shape change.
- No RLS policy, no migration, no edit to `tenant-rls.ts`, `EXEMPT_MODELS`, `getTenantPrisma*` or
  `schema.prisma`.
- Three commits, in order, each independently revertible.
</verification>

<success_criteria>
- Ten fail-closed sites resolved across six transaction roots; nested audit re-run reports 0.
- `npx tsc --noEmit` clean with a probe proving the gate was not blind.
- `next build` compiles.
- Vitest `failed` count does not exceed 63; `passed` rises by the new guard's tests.
- Every new guard assertion proven red by an actual hand-edit revert, with output reported.
- Repo-wide bypass-flag count measured (expected 213 from 218) and any deviation explained.
</success_criteria>

<output>
After completion, create
`.planning/quick/588-fix-eleven-fail-closed-access-paths-befo/588-SUMMARY.md`
covering: the re-derived site list with divergences, the shadowing false positives, the five
conversions, the F split, the per-transaction model census, the audit re-run result, the guard
tests with verbatim probe output, and the final flag accounting.
</output>
</content>
</invoke>
