# quick-617 — Task 4: the surface proof, staging, `app_user`, tripwire armed, `bypass_rls_policy` DROPPED

Harness: `apps/web/scripts/audit/617-routing-verify.ts`, adapted from `616-routing-verify.ts` rather
than reinvented. Full transcript at `04-run-transcript.txt`; per-cell JSON at `04-probe-cells.json`;
captured DDL at `04-policy-capture.json`; hashes at `04-sorted-list-hashes.json`.

---

## 1. Instrument safety

```
[db-target] project : wyixpgunnjmzguhggocz (staging)  host : aws-0-us-west-1.pooler.supabase.com:5432
            role : postgres.wyixpgunnjmzguhggocz   lane : RUN   (credential MASKED, never printed)
[db-target] project : wyixpgunnjmzguhggocz (staging)  host : aws-0-us-west-1.pooler.supabase.com:5432
            role : app_user.wyixpgunnjmzguhggocz   lane : GUC PROBE (app_user, tripwire armed)
```

- **`scripts/_bootstrap-env` is never imported** — it does `DATABASE_URL = DIRECT_URL`, and in this
  repo `DIRECT_URL` points at production (quick-607). `apps/web/.env.staging` is loaded explicitly.
- **Refusal is POSITIVE**: the run proceeds only when the ref *is* `wyixpgunnjmzguhggocz`, and
  refuses by name on `oqdhberkghtnszrkdvfm`. A negative-only check passes on a third, unknown
  database.
- The banner goes to **STDERR**, with the credential masked, on every lane including the one
  read-only production statement.
- **`.env.staging` is never echoed.** No connection string, password or key appears in any artefact
  this task wrote — only host, role and project ref.
- **Production received exactly one statement all task**: the `pg_policies` SELECT behind `--hashes`.
  Nothing was written to it.

---

## 2. Capture → drop → probe → restore

```
bypass_rls_policy: 86 policies on 86 tables
captured DDL for all 86 → evidence/04-policy-capture.json
tables reached by routed statements : 18
  carrying bypass_rls_policy (DROP) : 18 — ["Customer","Document","DriverHOSEntry","DriverIncident",
    "DriverInvitation","FleetMessage","FuelRecord","Invoice","Load","PayrollRecord","Route",
    "RouteStop","ScheduledService","StepInstance","SupportTicket","Tenant","Truck","User"]
  NOT carrying one (nothing to drop): 0 — []
DROPPED bypass_rls_policy ON public."Customer"   … ×18 …
bypass_rls_policy now: 68 (was 86)
```

The DROP is scoped to the tables reached by the **routed** statements. The eight stopped-and-reported
files are excluded by construction: they still carry their bypass flag, and a failure under a policy
dropped beneath unchanged code would be attributed to the routing.

Capture refuses to proceed if the live population is not 86, **before any drop**.

---

## 3. The matrix — every cell in its own transaction, in its own cold child process

```
  PASS  guc-visible            {"readBack":"b5623cdd-…","expected":"b5623cdd-…","role":"app_user"}
  PASS  unscoped-raises        {"raised":true,"sqlstate":"TC001"}
  PASS  own-read               {"own":1}
  PASS  foreign-read           {"foreignSeenByTenantA":0,"privilegedCounterRead":1}
  PASS  own-write-audit-null   {"id":"9d80db33-…","createdById":null,"updatedById":null,
                                "tenantId":"b5623cdd-…"}
  PASS  finduniq-select-hazard {"selectWithoutTenantId":null,"selectWithTenantId":{…},
                                "noSelect":{…},"privilegedCounterRead":1,"hazardConfirmed":true}
```

### Per table — 18 of 18

Three questions per model, in one cold process, **in this order** because only the first can run
before any tenant context exists:

| # | question | why it is worth asking on an EMPTY table |
|---|---|---|
| A | bare client, no tenant context, FIRST statement of the process → must raise `TC001` | the policy expression is evaluated at **scan setup, not per row** (quick-610), so an empty table raises exactly as a populated one does. With `bypass_rls_policy` dropped, the only policy left standing is `tenant_isolation_policy` |
| B | tenant client → must NOT raise, returns a count | proves the routed shape actually works against the remaining policy |
| C | same client counting the OTHER tenant's rows → must be 0 | reported **UNPROVEN BY NAME** unless the privileged counter-read shows foreign rows exist **and** `own > 0` |

**Result: A passed on all 18 (`TC001` on every one) and B passed on all 18 (no raise).**

C, honestly:

| model | unscoped | scoped own | cross-tenant verdict |
|---|---|---:|---|
| `Document` | TC001 | 1 | **PROVEN** — foreign 0, counter-read 1 |
| `DriverIncident` | TC001 | 2 | **PROVEN** — foreign 0, counter-read 1 |
| `Truck` | TC001 | 1 | **PROVEN** — foreign 0, counter-read 1 |
| `User` | TC001 | 6 | **PROVEN** — foreign 0, counter-read 4 |
| `Tenant` | TC001 | 1 | **N/A** — no `tenantId` column, and an `EXEMPT_MODEL` |
| `Customer`, `DriverHOSEntry`, `DriverInvitation`, `FleetMessage`, `FuelRecord`, `Invoice`, `Load`, `PayrollRecord`, `Route`, `RouteStop`, `ScheduledService`, `StepInstance`, `SupportTicket` | TC001 | 0 | **UNPROVEN BY NAME** — zero rows on staging on BOTH sides |

**The 13 UNPROVEN cells are stated, not quietly counted as passes.** A `foreign === 0` over an empty
foreign set proves nothing, and `own === 0` makes it worse than nothing (quick-610). What they *do*
carry is A and B, which are not vacuous on an empty table. Closing the remaining 13 needs staging
fixtures with their FK chains — named as a follow-up in `617-SUMMARY.md` §7, not claimed here.

### The rules each cell obeys

- **ONE TRANSACTION PER CELL.** A `TC001` aborts its transaction and every later statement in it
  returns `25P02` — which would make one raise look like eighteen.
- **ONE COLD CHILD PROCESS per cell.** The GUC is session scope and the pool is `max: 1`, so the
  first tenant-touching statement in a process leaves it set for everything after (quick-602/610).
  Cell A is the first tenant-touching statement of its own process, or it is measuring the previous
  cell.
- **SQLSTATE off `err.cause.code`**, walking the cause chain, never `err.code` — `undefined` on
  Prisma's `DriverAdapterError` (quick-610). Recognised by **code**, never by message prose.
- **Every zero carries a privileged counter-read.** Counts are read as **scalars**, never `rowCount`.
- The probe imports the REAL `getTenantPrismaForOrg` from `src/lib/context/tenant-context`. A probe
  that re-derives the acquisition is not measuring the acquisition.

---

## 4. Restore, verified by SORTED TABLE LIST against production

```
RESTORE: re-created 18; live now 86
  sorted list identical : true
  only in before        : []
  only in after         : []
  body mismatches       : []
  VERDICT               : PASS
fixtures left: 0 (must be 0)
```

Never by count — 86 restored policies on the wrong 86 tables is a passing count and a broken
database. Verified three ways: the sorted table list, byte-for-byte comparison of
`permissive`/`roles`/`cmd`/`qual`/`with_check` against the captured original, and the live count.

**Independent re-read in a FRESH process** (`--hashes`, and a second `--fixtures-teardown` that
asserts `left 0` again):

```
staging      count 86   sha256        0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
                        md5           8d1d6cbda610a7e3a8f3a5582078b42c
                        md5BareComma  29498ef6e52f51dcc02461a1abbb84b0
production   count 86   sha256        0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
                        md5           8d1d6cbda610a7e3a8f3a5582078b42c
                        md5BareComma  29498ef6e52f51dcc02461a1abbb84b0
fixtures left: 0 (must be 0)
```

**Staging equals production, byte for byte, under every spelling** — and production is the right
reference precisely because this task never wrote to it.

### Fact H, resolved rather than assumed

Two figures were on record for "the same list" and they were never in conflict — two algorithms over
two spellings:

| recorded where | figure | reproduced by |
|---|---|---|
| quick-616 `evidence/05-bypass-policy-count.txt` | `0fa356b9…f8cd` | **sha256** over `public.X\npublic.Y…` |
| the orchestrator, `.planning/STATE.md:966` | `29498ef6e52f51dcc02461a1abbb84b0` | **md5** over **bare, comma-joined** names |

The inherited harness computed sha256 only and could never have printed the second figure, so a naive
comparison would have shown a mismatch that means nothing. The bare/comma normalisation was **found
by trying fourteen** — full/bare names, `\n` / `,` / `, ` / JSON joiners, with and without a trailing
newline, lowercased — of which **exactly one matched**. Both are now computed and labelled by name
inside the script, so no future reader has to search for it.

---

## 5. The `finally` is proven, and `process.kill` is nowhere

`--run --single-file --throw-after-drop`:

```
DROPPED bypass_rls_policy ON public."DriverIncident"
bypass_rls_policy now: 85 (was 86)

!! --throw-after-drop: deliberate throw between the DROP and the probes, to prove the finally restores.
RESTORE: re-created 1; live now 86
  sorted list identical : true
  body mismatches       : []
  VERDICT               : PASS
fixtures left: 0 (must be 0)
EXIT=3
```

Exits non-zero **and** leaves staging restored, confirmed by an independent read in a fresh process.

quick-616's SIGINT proof terminated unconditionally on Windows — no handler, no `finally` — and left
staging at 85 policies. **That method is not used here, and `process.kill` appears in no new code
path.** What a `finally` cannot cover is covered by `preflightHeal()`, which runs in the **next**
process: it refuses loudly if the live count is *above* 86 (that is population growth, not an
interrupted run) and refuses loudly if the count is short and there is no capture file to heal from.

---

## 6. Fixtures

Created on the **privileged** connection, two `DriverIncident` rows tagged
`quick-617 fixture — safe to delete`, one per staging tenant; torn down in the `finally` with an
asserted `left 0`, re-asserted afterwards in a separate process. The `own-write-audit-null` cell's
created row carries the same tag and is removed by the same teardown.

No disposable tenant was needed, so the `in_app_notifications.org_id` FK ordering trap (quick-546)
does not arise here. **Staging carries no leftover rows from this task.**

---

## 7. What could not be probed, and why

- **13 of the 18 tables' cross-tenant cells** — zero rows on staging on both sides. Stated by name
  above.
- **The 8 stopped files** — deliberately not routed, so there is nothing of theirs to prove. The
  `findUnique` hazard that stopped them *was* measured, on two models, and is the strongest single
  result in this run.
- **quick-588's `carrier_expenses.created_by_id` question** — `carrier_expenses` is **empty on
  staging** (`total 0, with_creator 0`), so the table can neither confirm nor deny that quick-588
  began populating it. The verdict in `01-inventory.md` §5 is from reading the schema and the call
  site, and is labelled as such; nothing is inferred from the emptiness.
