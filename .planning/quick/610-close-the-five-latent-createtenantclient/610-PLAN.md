---
phase: quick-610
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
files_modified:
  - apps/web/scripts/audit/610-repo-cold-probe.ts
  - apps/web/scripts/audit/610-crosstenant-probe.ts
  - apps/web/src/lib/db/repositories/base.repository.ts
  - apps/web/src/lib/db/repositories/document.repository.ts
  - apps/web/src/lib/db/repositories/truck.repository.ts
  - apps/web/src/app/(owner)/actions/dashboard.ts
  - apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
  - apps/web/tests/security/tenant-mechanism-fence.test.ts
  - docs/audits/app-user-failure-remediation.md

must_haves:
  truths:
    - "Every one of the six `createTenantClient` callers outside `lib/context/tenant-context.ts` obtains a GUC-setting client."
    - "Each caller's LATENT/NOT-LATENT status is a measured cold-pool result, quoted per caller, not an inference from reading."
    - "A caller that passes cold is reclassified with its evidence rather than 'fixed' anyway on the strength of the prior report."
    - "After the fix each path succeeds for its own tenant AND returns zero foreign rows for another tenant."
    - "The frozen-inventory guard names the three emptied files as a NEGATIVE, so re-adding a call fails."
    - "Nothing was written to production at any point."
  artifacts:
    - path: "apps/web/scripts/audit/610-repo-cold-probe.ts"
      provides: "in-process cold-pool TC001 probe driving the real repository modules"
    - path: "apps/web/scripts/audit/610-crosstenant-probe.ts"
      provides: "both-directions proof — own-tenant read succeeds, foreign-tenant read returns zero rows"
    - path: ".planning/quick/610-close-the-five-latent-createtenantclient/evidence/01-inventory.md"
      provides: "per-site tenant source + reachability + table/policy mapping"
    - path: ".planning/quick/610-close-the-five-latent-createtenantclient/evidence/02-latency-before.json"
      provides: "the cold-pool measurement, per caller, BEFORE any fix"
    - path: ".planning/quick/610-close-the-five-latent-createtenantclient/evidence/07-remaining-before-cutover.md"
      provides: "what is still open before the app_user cutover"
  key_links:
    - from: "src/lib/db/repositories/base.repository.ts"
      to: "getTenantPrismaForOrg"
      via: "async `client()` accessor, awaited per method"
      pattern: "getTenantPrismaForOrg\\(this\\.tenantId\\)"
    - from: "tests/security/tenant-mechanism-fence.test.ts"
      to: "the three emptied files"
      via: "named negative assertion"
      pattern: "EMPTIED_FILES|offenders"
---

<objective>
Close the SIX (not five — see §Inventory) `createTenantClient` callers that obtain a
Prisma client carrying the tenant filter at the Prisma layer and **no GUC on the
connection**, so that each instead obtains a client whose connection has had
`app.current_tenant_id` set.

Purpose: these are the last known LATENT paths of the class quick-602 measured and
quick-606 moved. Under the tripwire a GUC-less statement raises `TC001` the moment no
earlier statement has left a context on the `max: 1` pool; after the `app_user` cutover
the same statement is a **silent zero-row read** instead. They are the remaining
application-side blocker in `docs/audits/app-user-failure-remediation.md` §8.

Output: six converted call sites, a measured before/after in both directions, an updated
frozen-inventory guard that fences the emptied files, and the remaining-before-cutover list.

**This task does NOT begin the bypass drop or the cutover.**
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/audits/app-user-failure-remediation.md
@docs/audits/guc-binding.md
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/repositories/base.repository.ts
@apps/web/tests/security/tenant-mechanism-fence.test.ts
</context>

<inventory>

## The six sites — established, do NOT re-grep to confirm

| # | file | line | function | tenant source | reachable in-process? |
|---|---|---|---|---|---|
| 1 | `src/app/(owner)/actions/dashboard.ts` | 85 | `_fetchNotificationAlerts` | `tenantId` **function argument**, resolved upstream by `getAuthContext()` from the session | **No** — module-private (not exported) inside a `'use server'` module |
| 2 | `src/app/(owner)/actions/dashboard.ts` | 330 | `_fetchDashboardMetrics` | same | **No** — same |
| 3 | `src/app/(owner)/actions/tenant-notification-settings.ts` | 374 | `listTenantUsers` | `requireTenantAccess()` → session | Exported, but its first line needs a session |
| 4 | `src/app/(owner)/actions/tenant-notification-settings.ts` | 513 | `listTenantSendLog` | same | same |
| 5 | `src/app/(owner)/actions/tenant-notification-settings.ts` | 543 | `getTenantSendLogStats` | same | same |
| 6 | `src/lib/db/repositories/base.repository.ts` | 11 | `TenantRepository` constructor | `tenantId` **constructor argument** | **Yes** — no session anywhere in the path |

**No site is in the "nowhere" state.** At all six the tenant is an in-hand value at the
point the client is obtained, so every one of these is a ROUTING change, not a signature
change. Requirement 1 is satisfied by the table above; the executor restates it per site
in `01-inventory.md` with the measured result beside it.

`src/lib/context/tenant-context.ts` lines 184 and 214 are the **two legitimate callers**
(`getTenantPrisma` / `getTenantPrismaForOrg`), each of which issues `set_config` first.
**Out of scope. Do not touch.**

### "Five" is an arithmetic slip in the source document

`docs/audits/app-user-failure-remediation.md` §8 item 3 says "Four", against its own §7
table of 2 + 3 + 1. The brief says five. The grep-verified figure is **six call sites
across three files**. Task 6 corrects §8 in place.

### Which wrapper, and why NOT `getTenantPrisma()`

All six take **`getTenantPrismaForOrg(tenantId)` with NO userId.**

- The tenant is already in hand at each site, so there is nothing to re-derive.
- `getTenantPrisma()` would (a) re-derive the tenant from the session — which sites 1, 2
  and 6 cannot reach at all — and (b) forward `session.userId` into the audit-column
  extension. Today `createTenantClient(tenantId)` is called with **no userId**, so audit
  injection is a no-op. Switching to `getTenantPrisma()` would start writing
  `createdById`/`updatedById` on `DocumentRepository.create()` and `TruckRepository.create()`.
  That is a **behaviour change** and is forbidden by this task's constraints.
- `getTenantPrismaForOrg(tenantId)` = exactly today's client **plus** the GUC, and also
  runs `assertRoleBootGuard()` (memoised, no-op while `DB_ROLE_ASSERT` is off).

**This is a deliberate, reasoned divergence from §8 item 3's suggestion of
`getTenantPrisma()`.** Record it as such in the SUMMARY — do not let a later reader
think it was an oversight.

### The hypothesis the measurement must settle

`TC001` raises only when a **policy is evaluated**. A table with no RLS policy never
calls `current_tenant_id()` and therefore never raises, no matter how cold the pool.
So a GUC-less caller touching only unpolicied tables is **NOT LATENT** in the `TC001`
sense — though it is still a correctness risk after the cutover.

`tenant-notification-settings.ts:539-541` carries an in-code comment asserting
*"NotificationSendLog has no Postgres RLS"*. A grep of `prisma/migrations` finds
`NotificationSendLog` named in **3 files containing `CREATE POLICY`**, so that comment
is probably **stale**. It is a claim, not evidence — the exact shape quick-547/548/549
kept finding. **The measurement decides it, and Task 6 corrects or confirms the comment.**

</inventory>

<instruments>

Two instruments, because the six sites are not reachable the same way. State per site
which one reached it.

**Instrument A — in-process cold-pool probe (`610-repo-cold-probe.ts`).**
For site 6 only. `new DocumentRepository(tenantId)` needs no session. Follow the pattern
`docs/audits/guc-binding.md` §2 describes: pre-seed `globalThis.pool` with an instrumented
`pg.Pool` that `prisma.ts` adopts through its own singleton guard, then import and drive
the **real** `document.repository.ts` / `truck.repository.ts` modules. Never reimplement
a repository method.

**Instrument B — the HTTP click-through.**
For sites 1-5. All five sit behind `'use server'` entry points that call
`getAuthContext()` / `requireTenantAccess()`; sites 1 and 2 are module-private and have
**no in-process entry point at all**. A real request with a real session cookie is the
only thing that reaches them. Use the committed launcher and the existing harness —
`scripts/audit/604-click-through.ts` correlates by server-log byte offset, which is the
authority for `TC001` (a 200 is not evidence — quick-602 measured seven raises behind
`success:true`).

Surfaces that reach sites 1-5: the **owner dashboard** (1, 2) and
**`/settings/notifications`** incl. its send-log tab (3, 4, 5).

**COLD POOL means a fresh process with no prior statement having set a tenant context.**
quick-602's finding stands: `getTenantPrismaForOrg` writes the GUC at **session scope**
and the pool holds `max: 1`, so any earlier scoped call leaves a context behind and the
next probe measures the previous probe. For Instrument A: **one process per caller.**
For Instrument B: the target surface must be the **first** tenant-scoped request the
server serves, or the reading is void. Restart the server between surfaces, or state
plainly in the evidence why an observed raise is still conclusive (a raise is sound
evidence of latency regardless; only a PASS needs the cold guarantee).

</instruments>

<tasks>

<task type="auto">
  <name>Task 1: Measure — inventory, and prove latency per caller on a cold pool</name>
  <files>
apps/web/scripts/audit/610-repo-cold-probe.ts
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/01-inventory.md
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/02-latency-before.json
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/02-latency-before.md
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/00-604-hashes-at-open.txt
  </files>
  <action>
NO SOURCE CHANGES IN THIS TASK. Measure the tree as it stands.

1. Open the staging server with the COMMITTED launcher — do not rewrite it:
   `bash .planning/quick/606-*/evidence/run-staging-server.sh <610-evidence>/03-server.log`
   Quote its `GUARD 1:` line (role + ref + port) into the evidence. It already refuses
   on the production ref and refuses a non-`app_user` role.

2. Hash the existing `604-click-through.ts` artefacts into `00-604-hashes-at-open.txt`
   (the convention quick-606 used: hashes at open and at close, so a later reader can
   tell which artefacts this task's runs replaced).

3. Write `apps/web/scripts/audit/610-repo-cold-probe.ts`:
   - Refuses positively on the production ref `oqdhberkghtnszrkdvfm` — an explicit
     `case`/`if` that exits non-zero, never merely "we pointed it at staging".
   - MUST NOT import `scripts/_bootstrap-env` (604's rule); read `.env.staging`
     explicitly, repoint `:6543`→`:5432`, strip `?pgbouncer=true`.
   - Prints the resolved project ref to **stderr** (quick-607), password masked.
   - Pre-seeds `globalThis.pool` with an instrumented `pg.Pool` so `prisma.ts` adopts it,
     then imports the REAL `DocumentRepository` and `TruckRepository` and calls a read
     method on each with a known staging tenant id.
   - Accepts a `--caller <name>` argument and exercises exactly ONE caller per process,
     so the pool is cold for the one being measured.
   - Detects `TC001` **at the driver** (`err.code === 'TC001'`), attached with
     `.then(undefined, ...)` so the original rejection still propagates — quick-602's
     rule, which took its own count from 1 to 12. Do not infer from an HTTP status or
     from a rethrown message.
   - `TENANT_CONTEXT_TRIPWIRE=on` in the probe's own environment.

4. Run Instrument A for site 6 (one process per repository).

5. Run Instrument B for sites 1-5 via `604-click-through.ts` against the launcher's
   server, hitting the owner dashboard and `/settings/notifications`. Read the
   **log slice**, not the status code.

6. For EACH of the six, record in `01-inventory.md` and `02-latency-before.json`:
   file+line · function · tenant source (session / argument / job payload / nowhere) ·
   which instrument reached it · the Prisma models it touches · whether each of those
   tables carries an RLS policy on staging (query `pg_policy`; do not infer from the
   migration grep, which only says a name appears in a file that also contains
   `CREATE POLICY`) · **raised `TC001`: yes/no**, with the raising statement quoted
   from `current_query()` where available.

7. Any caller that does NOT raise cold is **RECLASSIFIED as NOT LATENT with its
   evidence** — state why (almost certainly: every table it touches is unpolicied).
   It is still converted in Tasks 2-3 (the cutover risk is a silent zero-row read, which
   the tripwire cannot see), but it must NOT be reported as a measured failure.
   Do not let the prior document's classification override a measurement.
  </action>
  <verify>
`02-latency-before.json` carries exactly six caller entries, each with a boolean
`raisedTC001` and a non-empty `evidence` field. The launcher's `GUARD 1:` line is quoted
and names `wyixpgunnjmzguhggocz` and `app_user`. `610-repo-cold-probe.ts` exits non-zero
when `DATABASE_URL` is pointed at the production ref — demonstrate this and paste the
refusal.
  </verify>
  <done>
Every one of the six callers has a measured cold-pool verdict with evidence. The
NotificationSendLog-has-no-RLS question is answered from `pg_policy`. Production refusal
demonstrated, not asserted. Zero source files changed.
  </done>
</task>

<task type="auto">
  <name>Task 2: base.repository.ts FIRST and SEPARATELY — its own commit</name>
  <files>
apps/web/src/lib/db/repositories/base.repository.ts
apps/web/src/lib/db/repositories/document.repository.ts
apps/web/src/lib/db/repositories/truck.repository.ts
apps/web/tests/security/tenant-mechanism-fence.test.ts
  </files>
  <action>
This is the widest of the six and it goes first, alone, in its own commit.

**Blast radius — state these numbers in the commit message and the SUMMARY:**
- `TenantRepository` has exactly **TWO** subclasses: `DocumentRepository`,
  `TruckRepository`. `TenantProvisioningRepository` does **not** extend it.
- `TruckRepository`: **zero** instantiation sites outside its own file.
- `DocumentRepository`: **22** `new DocumentRepository(tenantId)` sites across 11 files.
- The fix reaches **all** subclasses, because it changes the base class's own client
  acquisition. Say so explicitly (requirement 3).

**THE CONSTRAINT:** the constructor is SYNCHRONOUS; `getTenantPrismaForOrg` is ASYNC
(it awaits `assertRoleBootGuard()` then `$executeRawUnsafe(set_config ...)`). A
constructor cannot await. Adopt the lazy accessor:

```ts
export class TenantRepository {
  protected readonly tenantId: string;
  constructor(tenantId: string) { this.tenantId = tenantId; }
  protected async client(): Promise<PrismaClient> {
    return getTenantPrismaForOrg(this.tenantId);
  }
}
```

…and in each subclass method change `this.db.x` to `(await this.client()).x`.

**REJECT the async-static-factory alternative** and record why: it makes construction
async and touches all 22 `new DocumentRepository(tenantId)` sites, which would change
what those callers do rather than only how the repository obtains its client — the
explicit constraint of this task. The lazy accessor keeps all 22 call sites
**byte-identical**.

**DELETE the `protected db` field — do not leave it in place.** This is load-bearing,
not tidiness: with the field gone, every surviving `this.db.` reference is a **tsc
error**, so the compiler enumerates the methods that must be converted. Leaving `db`
alongside `client()` would let a method silently keep the GUC-less client, which is
precisely the defect being closed. Same idiom as the T3/T4 verdict union — make the
wrong state unrepresentable rather than adding a rule an edit can drop.

**DO NOT memoise the client on the instance.** `guc-binding.md`: every non-transactional
statement is an independent pool checkout, and `set_config` is written at **session**
scope. Caching per instance would re-open exactly this bug the moment another tenant's
statement interleaves between two method calls on the same repository object. The extra
round trip per method is the cost every other migrated path already pays — name it as
an accepted, deliberate cost rather than hiding it.

**Change nothing about what any method returns or asserts.** `findById` still returns
null for a foreign row; `create` still derives `isRestricted`; no new `include`, no new
`select`, no `where` widened.

**Update the fence guard IN THIS COMMIT** so the commit is green on its own:
`src/lib/db/repositories/base.repository.ts` leaves `TENANT_CLIENT_INVENTORY`, and the
file is added to a new named-negative list (see Task 4 for the shape — implement the
entry here, the full negative assertion lands with Task 3's files too).
  </action>
  <verify>
`npx tsc --noEmit` in `apps/web` is clean — **and probe the gate** (CLAUDE.md): inject
`const x: number = 'y'` into `base.repository.ts`, confirm tsc reports THAT error, then
delete the probe. If the only errors are syntax errors or sit in files you did not touch,
the gate is blind: delete `apps/web/.next/dev/types/validator.ts` and
`apps/web/tsconfig.tsbuildinfo` and re-run. Grep `this.db` across
`src/lib/db/repositories/` returns zero hits.
  </verify>
  <done>
`TenantRepository` obtains its client from `getTenantPrismaForOrg(this.tenantId)` lazily
per method. Both subclasses converted. All 22 `new DocumentRepository(tenantId)` sites
unchanged — verified by `git diff --stat` naming none of the 11 files. tsc clean and the
gate proven non-blind. Committed alone.
  </done>
</task>

<task type="auto">
  <name>Task 3: Convert the five server-action sites</name>
  <files>
apps/web/src/app/(owner)/actions/dashboard.ts
apps/web/src/app/(owner)/actions/tenant-notification-settings.ts
apps/web/tests/security/tenant-mechanism-fence.test.ts
  </files>
  <action>
Replace `createTenantClient(tenantId)` with `await getTenantPrismaForOrg(tenantId)` at
all five sites. All five are already inside `async` functions, so no signature changes.

- `dashboard.ts:85` `_fetchNotificationAlerts` — `tenantId` is already the parameter.
- `dashboard.ts:330` `_fetchDashboardMetrics` — same.
- `tenant-notification-settings.ts:374` `listTenantUsers`
- `tenant-notification-settings.ts:513` `listTenantSendLog`
- `tenant-notification-settings.ts:543` `getTenantSendLogStats`

**No userId argument at any of the five** — see §Inventory. Passing one would begin
writing audit columns and is a behaviour change.

**Do not touch the `where` clauses.** Both notification-settings sites keep their
explicit `where: { tenantId }` as defence in depth, and `listTenantUsers` keeps
`where: { isActive: true }`. The `.catch(() => 0)` fallbacks in `_fetchDashboardMetrics`
stay exactly as they are — this task changes how the client is obtained and nothing else.
Note in the SUMMARY that those `.catch(() => 0)` swallows mean a `TC001` on the dashboard
renders as a **zero metric**, not an error — which is why the log slice, not the rendered
page, is the authority for sites 1 and 2.

**Correct the two stale in-code comments in the same commit** (they will be actively
misleading once the client changes):
- `tenant-notification-settings.ts` ~line 371: *"Use createTenantClient(tenantId) —
  session-bound, not header-bound"* — the reason survives, the mechanism named does not.
- `tenant-notification-settings.ts` ~line 539: *"NotificationSendLog has no Postgres RLS"*
  and *"The postgres role has BYPASSRLS privilege so no bypass_rls SET is needed"* —
  rewrite from Task 1's `pg_policy` measurement. The BYPASSRLS half is false on the
  `app_user` connection this whole programme is about.

**Update the fence guard IN THIS COMMIT** so it is green on its own.
  </action>
  <verify>
`npx tsc --noEmit` clean (probe the gate). Grep `createTenantClient` across `src/`
returns hits in exactly two files: `lib/db/tenant-client.ts` (the definition) and
`lib/context/tenant-context.ts` (×2, the legitimate callers).
  </verify>
  <done>
Five sites converted to `getTenantPrismaForOrg(tenantId)` with no userId. No `where`
clause, return shape or assertion changed anywhere — provable from `git diff`. Both stale
comments corrected against measurement.
  </done>
</task>

<task type="auto">
  <name>Task 4: Re-point the frozen-inventory guard, with named negatives</name>
  <files>
apps/web/tests/security/tenant-mechanism-fence.test.ts
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/04-fence-red.md
  </files>
  <action>
Tasks 2 and 3 each carried their own slice of this; this task closes the shape and proves
it fires.

`TENANT_CLIENT_INVENTORY` becomes the new true inventory — **two** entries only:
`src/lib/db/tenant-client.ts` (calls: 1, the definition) and
`src/lib/context/tenant-context.ts` (calls: 2, the legitimate callers).

**A shrinking list is not enough, and this is the point of the task.** The existing
both-directions set-equality test would pass identically if someone later re-added a call
to `dashboard.ts` AND widened the inventory — which is exactly the failure mode quick-566
recorded when AR Aging was removed from the sidebar. So add a NAMED NEGATIVE:

```ts
/** quick-610 — emptied. A new call in any of these is a deliberate, reviewable edit. */
const EMPTIED_BY_610 = [
  'src/app/(owner)/actions/dashboard.ts',
  'src/app/(owner)/actions/tenant-notification-settings.ts',
  'src/lib/db/repositories/base.repository.ts',
];
```

…asserted as: each file was READ (defined, and above its byte floor — quick-546, the
failure mode of a bad read is GREEN), **and** its `tenantClientCalls === 0`. Both halves.
The "was read" half is what stops the assertion passing vacuously if the walker or a path
rename makes the file invisible.

Update the file's header prose: LIST 2 is no longer "a FROZEN INVENTORY of latent
callers" — the latent set is closed. It is now the inventory of the mechanism itself plus
a closed fence over the three files that used to hold it. The header currently says
`base.repository.ts` is "the one most worth converting next" — that sentence is now
history and must be rewritten, not left to mislead.

Leave `RLS_ALLOWLIST`, the alias ban, the anti-vacuity floors and the counter-assertion
file untouched.

**PROVE THE GUARD FIRES.** Temporarily re-add a `createTenantClient` call to
`dashboard.ts`, run the suite, capture the RED output into `04-fence-red.md`, then revert
and confirm green. A guard asserted without a witnessed red is the quick-549 shape.
  </action>
  <verify>
`npx vitest run tests/security/tenant-mechanism-fence.test.ts` passes. `04-fence-red.md`
contains a real failing assertion naming `dashboard.ts`, and the tree is confirmed green
after reverting the deliberate break.
  </verify>
  <done>
The inventory names only the definition and the two legitimate callers. The three emptied
files are a named negative with a was-read counter-assertion. The guard is proven red on
a re-added call and green after revert. Header prose no longer describes a latent set
that no longer exists.
  </done>
</task>

<task type="auto">
  <name>Task 5: Re-measure cold, in BOTH directions</name>
  <files>
apps/web/scripts/audit/610-crosstenant-probe.ts
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/05-latency-after.json
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/05-latency-after.md
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/05-crosstenant.json
  </files>
  <action>
Re-run Task 1's measurement on the fixed tree, with the **same instruments, same cold
guarantee, same detection method**. Restart the server from the committed launcher so the
pool is genuinely cold. A measurement taken a different way than the baseline is not a
comparison.

**Direction 1 — the legitimate read SUCCEEDS.** Each of the six now completes with no
`TC001` and returns the expected rows for its own tenant. A path that returns **zero rows
without raising** is NOT a pass — that is the post-cutover silent-zero failure wearing a
green coat. Assert a non-zero row count for its own tenant, or state explicitly why that
table is legitimately empty on staging.

**Direction 2 — a cross-tenant variant is REFUSED.** Write
`apps/web/scripts/audit/610-crosstenant-probe.ts` (same production refusal, same stderr
ref print, same no-`_bootstrap-env` rule). For each converted path, drive it with tenant A
in hand and attempt to reach a row known to belong to tenant B. The pass condition is
**zero foreign rows** — filtered away by the policy, not by the Prisma `where`. Prove the
distinction: a fixture row of tenant B must be confirmed to EXIST (counted on an admin or
known-good connection) before its absence through the tenant path means anything. An
absence you never proved was a presence is the quick-599 silent-zero trap.

**One direction alone proves nothing** — a path that refuses everything passes Direction 2
and is broken; a path that returns everything passes Direction 1 and is a breach.

For site 6 the cross-tenant probe is direct (`new DocumentRepository(tenantA)` reaching
for a tenant-B document id via `findById`). For sites 1-5, drive the HTTP surface with a
tenant-A session and assert no tenant-B row appears in the response — and say plainly in
the evidence where an assertion is weaker than the in-process one and why.

Quote the result **PER CALLER**, never summarised (requirement 5 and the closing gate).
  </action>
  <verify>
`05-latency-after.json` carries six entries, each `raisedTC001: false` with a row count.
`05-crosstenant.json` carries, per caller, the tenant-B fixture id, its confirmed
existence count on a known-good connection, and the zero it returns through the
tenant-A path.
  </verify>
  <done>
All six pass cold in both directions, quoted per caller. Every cross-tenant zero is
backed by a proven-present fixture row. No policy was widened and no grant added to
reach this state.
  </done>
</task>

<task type="auto">
  <name>Task 6: Regression gates — click-through, drift, build, suite</name>
  <files>
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/06-click-through.md
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/06-rls-policy-drift.txt
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/06-suite-before.json
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/06-suite-after.json
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/10-604-hashes-at-close.txt
  </files>
  <action>
**a) 604 click-through against staging.** Re-run `scripts/audit/604-click-through.ts`
(`--surfaces`, `--surfaces2`, `--writes`) against the launcher's server. Report the
numbers and state plainly whether anything regressed relative to quick-606's close
figures. Note that the harness's `EVIDENCE_DIR` is hardcoded to the **604** directory —
so hash its artefacts at close into `10-604-hashes-at-close.txt` and diff against Task 1's
open hashes, so a reader can tell which artefacts this task's runs replaced.

**b) Policy drift.** `npm run audit:rls-policy-drift` with `DATABASE_URL` pinned at
staging. Per quick-607 the script honours an explicitly-set `DATABASE_URL` **verbatim**
and PRINTS the resolved project ref to stderr — **quote the printed ref** in the evidence.
Gate: missing 0, unexpected 0, definition drift 0. This task adds no DDL and touches no
policy, so any non-zero here is a finding about the environment, not about this work —
report it, do not absorb it.

**c) Build.** `npm run build` in `apps/web` succeeds.

**d) Vitest failing-FILE set unchanged, measured the SAME WAY both times.**
- **Stop `next dev` first** (the launcher's server included).
- Do NOT use a `git worktree` baseline: it does not carry the untracked
  `apps/web/.env.local` and its numbers will skew (quick-567 — 25 tests moved and read
  exactly like a regression).
- Baseline in the MAIN tree: `git stash` (or `git checkout <pre-610 rev> -- <the files
  this task touched>`), run, restore.
- **Same reporter both times.** `--reporter=basic` does not exist in vitest 4 and exits 0
  having run ZERO tests (quick-565); `--silent` and `--reporter=json` disagree by ±4
  (quick-549's cold-cache flake). Read the `Test Files … | Tests …` summary line and
  compare TEST counts, not suite counts.
- Run the suite AFTER the last commit of this task, not before it (quick-561 — three
  consecutive tasks have published a baseline measuring a different tree than they thought).
- The gate is the failing-FILE SET, not the count. A new failing file is a regression; a
  file that stops failing needs explaining, not celebrating.
  </action>
  <verify>
Drift run quotes the printed staging ref and reports 0/0/0. `npm run build` exits 0.
`06-suite-before.json` and `06-suite-after.json` carry identical failing-file sets, each
with its `Test Files … | Tests …` line and the reporter named. Click-through numbers
quoted against quick-606's.
  </verify>
  <done>
Four gates run and quoted. Any delta is explained rather than absorbed. The 604 artefact
hashes bracket this task's runs.
  </done>
</task>

<task type="auto">
  <name>Task 7: The remaining-before-cutover list, and the document corrections</name>
  <files>
docs/audits/app-user-failure-remediation.md
.planning/quick/610-close-the-five-latent-createtenantclient/evidence/07-remaining-before-cutover.md
.planning/STATE.md
CLAUDE.md
  </files>
  <action>
1. Correct `docs/audits/app-user-failure-remediation.md` §8 item 3: **"Four"** is an
   arithmetic slip against its own §7 table of 2 + 3 + 1. The figure is **six call sites
   across three files**. Correct it **in place** and mark it as a correction (the repo's
   convention — quick-520 struck through and corrected 07-SUMMARY items 2 and 3 rather
   than silently rewriting). Record in the same edit that its `getTenantPrisma()`
   suggestion was deliberately diverged from, with the audit-column reason.

2. Write `07-remaining-before-cutover.md` as a LIST, each item with a one-line status of
   whether THIS task changed it:
   - **The `AutomationRule` DELETE split** — `WITH CHECK` never applies to DELETE
     (quick-599); needs a per-command policy split (`FOR SELECT`/`FOR INSERT`/`FOR
     UPDATE`/`FOR DELETE`), not a check bolted onto one `FOR ALL`. *Unchanged by 610.*
   - **The 17 `25P02` sites.** *Unchanged by 610* — unless Task 1's or Task 5's runs
     surfaced one, in which case say so.
   - **`app_admin` LOGIN on production.** *Unchanged by 610.*
   - **The bypass policy drop.** *Unchanged by 610 — explicitly not begun.*
   - **Anything NEW found** by Tasks 1-6. In particular: any caller reclassified as NOT
     LATENT (and what that implies — an unpolicied table is a silent-zero risk the
     tripwire structurally cannot see, so it will never appear in a `TC001` sweep); the
     `pg_policy` verdict on `NotificationSendLog`; and the `.catch(() => 0)` swallows in
     `_fetchDashboardMetrics`, which mean a dashboard `TC001` renders as a zero metric.

3. Update `.planning/STATE.md` and add a CLAUDE.md entry for the durable lessons —
   candidates: the sync-constructor / async-wrapper constraint and why deleting
   `protected db` is what makes tsc the enforcement; why `getTenantPrismaForOrg` and not
   `getTenantPrisma` (audit columns); and `TC001` requires a POLICY, so an unpolicied
   table is invisible to the tripwire and needs the cutover-era silent-zero argument
   instead. Keep entries short and load-bearing.
  </action>
  <verify>
§8 item 3 reads "six" with the correction marked. `07-remaining-before-cutover.md` carries
every known open item with an explicit changed/unchanged verdict. STATE.md and CLAUDE.md
updated.
  </verify>
  <done>
The document's arithmetic is corrected in place, the divergence from its recommendation
is recorded as deliberate, and the next task inherits an accurate open-items list.
  </done>
</task>

</tasks>

<prohibitions>

Encode these as refusals, not intentions.

- **Never write to production** (`oqdhberkghtnszrkdvfm`). Every probe script carries a
  positive refusal on that ref that exits non-zero, demonstrated at least once
  (Task 1 verify). Per quick-607: **do not run a writer with `--allow-production` to
  demonstrate `--allow-production`** — that put real rows into production. The banner is
  the evidence; running to completion adds nothing.
- **Do not install any package.**
- **Do not route anything to `getAdminDb`.** Every one of the six has its tenant in hand
  and is served by a tenant-scoped path. If a site is found that genuinely cannot be,
  STOP and state why before routing it — `app_admin` carries `rolbypassrls`, so routing a
  path there removes it from the tripwire's reach entirely.
- **Do not change what any caller returns or asserts** — only how it obtains its client.
  No `where` widened, no `include`/`select` added, no fallback removed, no userId passed.
- **Do not widen a policy or add a grant** to make a path pass. If a path needs one,
  that is a finding for Task 7's list, not a fix.
- **Do not begin the bypass drop or the cutover.**
- **Do not touch `lib/context/tenant-context.ts` lines 184/214** — the two legitimate
  callers.
- **Do not weaken the fence guard to make a run green.** Its inventory shrinks because
  call sites were removed; if it is red for any other reason, that is the signal.

</prohibitions>

<verification>

Closing gates — all must be quoted in the SUMMARY, not summarised away:

1. **Task 1's cold-pool measurement is quoted PER CALLER**, six entries, each with
   `raisedTC001` and its evidence. Any NOT-LATENT reclassification carries its reason.
2. **Task 2 states the subclass count** (two: `DocumentRepository`, `TruckRepository`;
   `TenantProvisioningRepository` does not extend it) **and that the fix reaches all of
   them**, with the 22-call-site figure and proof those 22 are unchanged.
3. **Task 5 proves BOTH directions**, per caller: own-tenant read succeeds with a non-zero
   row count (or a stated reason for an empty table), and the cross-tenant variant returns
   zero foreign rows against a fixture proven to exist.
4. **`npm run audit:rls-policy-drift` reports ZERO** against staging — missing 0,
   unexpected 0, definition drift 0 — with the script's **printed project ref quoted**.
5. **`npm run build` succeeds.**
6. **The vitest failing-FILE set is unchanged**, measured the same way both directions,
   `next dev` stopped, no worktree baseline, same reporter, `Test Files … | Tests …` lines
   quoted for both runs.
7. **`npx tsc --noEmit` is clean and the gate was PROVEN non-blind** by an injected probe
   that tsc reported, with the probe then deleted.
8. **Nothing was written to production**, and the refusal was demonstrated rather than
   asserted.

</verification>

<success_criteria>
- `createTenantClient` is called from exactly two files in `src/`: its own definition and
  `lib/context/tenant-context.ts` (×2).
- All six converted sites obtain `getTenantPrismaForOrg(tenantId)` with no userId.
- Each site's latency is a measured cold-pool verdict; reclassifications carry evidence.
- Both directions proven per caller after the fix.
- The fence guard names the three emptied files as a negative and was witnessed red.
- Four regression gates green and quoted.
- The remaining-before-cutover list is written with explicit changed/unchanged verdicts.
- Seven commits, each green on its own; `base.repository.ts` is its own commit and lands
  first.
</success_criteria>

<output>
After completion, create
`.planning/quick/610-close-the-five-latent-createtenantclient/610-SUMMARY.md`.

Commit each task separately. Per the repo's standing rule: **commit only, never push** —
the user pushes and deploys.
</output>
</content>
</invoke>
