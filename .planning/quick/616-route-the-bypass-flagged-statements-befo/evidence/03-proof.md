# quick-616 Task 3 — the proof, on staging, with `bypass_rls_policy` DROPPED

**Instrument:** `apps/web/scripts/audit/616-routing-verify.ts`
**Database:** `wyixpgunnjmzguhggocz` (**staging**). Production `oqdhberkghtnszrkdvfm` was never
connected to. Every connection string is refused **positively** — it must CONTAIN the staging ref,
and naming the production ref is a hard stop before any statement is issued. `.env.staging` is
loaded explicitly and **never** through `scripts/_bootstrap-env` (quick-607). The resolved ref goes
to **stderr** with the credential never printed at all.
**Raw transcript:** `03-run-transcript.txt` · **captured DDL:** `03-policy-capture.json` ·
**cells:** `03-probe-cells.json`

---

## 1. The policy drop — capture, scope, restore

### Capture, BEFORE any DDL

```
bypass_rls_policy: 86 policies on 86 tables
captured DDL for all 86 → evidence/03-policy-capture.json
sorted table list length: 86
```

Every `bypass_rls_policy` was read from `pg_policies` — `schemaname`, `tablename`, `permissive`,
`roles`, `cmd`, `qual`, `with_check` — reconstructed into `CREATE POLICY` DDL and written to disk
**before a single `DROP`**. The instrument asserts the count is exactly **86** and STOPS if it is
not: a different number means the population changed and this plan's numbers are stale.

### The drop was SCOPED

```
DROPPED bypass_rls_policy ON public."SupportTicket"
bypass_rls_policy now: 85 (was 86)
```

**One table**, named explicitly — `AFFECTED_TABLES = ['SupportTicket']` — because it is the only
table either routed statement touches. Never all 86.

### The restore, verified — IDENTICAL SORTED LIST *and* BYTE-FOR-BYTE BODIES

```
──────── RESTORE VERIFICATION (always last) ────────
re-created from captured DDL : 1
live bypass_rls_policy count : 86 (must be 86)
sorted table list IDENTICAL  : true
  only-in-before             : none
  only-in-after              : none
byte-for-byte body mismatches: NONE
RESTORE VERIFIED
────────────────────────────────────────────────────
```

Both halves matter and neither is sufficient alone:

- **The sorted table list, compared element by element** — `only-in-before` and `only-in-after` both
  empty, lengths equal, every position equal. **A count is not sufficient**: two compensating
  changes keep a count identical (quick-599/612), which is why the user asked for the sorted list.
- **A byte-for-byte comparison of `permissive` / `roles` / `cmd` / `qual` / `with_check`** against
  the captured original, per policy. "A policy with that name exists" is exactly what lets a restored
  policy with a **different body** pass.

The restore verification is the **last thing printed, always**, on every exit path.

---

## 2. The `finally` — what was proven, and what FAILED

### The SIGINT proof FAILED, and the failure is the finding

The plan asked for a deliberate SIGINT mid-run as "the only honest proof the `finally` actually
fires". It was attempted. **It did not work, and it left staging in a modified state.**

```
--sigint-after-drop: raising SIGINT on this process ON PURPOSE
EXIT=1
```

No handler ran. No `finally` ran. **On Windows, `process.kill(pid, 'SIGINT')` to one's own process
terminates it UNCONDITIONALLY** — Node's `'SIGINT'` listener never fires. The run exited having
dropped `bypass_rls_policy` on `SupportTicket` (**85** live) and created two `/616-fixture`
`SupportTicket` rows.

**Recovery was immediate and is recorded rather than hidden.** A manual
`616-routing-verify.ts --restore` put the policy back and byte-verified it (86, identical sorted
list, no body mismatches); a separate cleanup deleted the two fixture rows and re-read staging as
**86 policies / 0 `SupportTicket` rows**. Elapsed exposure: under a minute, on staging, on a table
that is empty there anyway.

### What replaced it — and it is stronger than a signal handler

A signal handler is not a safety net on this platform, and neither is a `finally`. Two things
replace it, **neither of which depends on the dying process**:

1. **`--throw-after-drop`** proves the `finally` on the path it CAN cover — an exception, which is
   every failure mode except a hard kill. Witnessed:

   ```
   DROPPED bypass_rls_policy ON public."SupportTicket"
   bypass_rls_policy now: 85 (was 86)
   fixtures torn down; leftover 616 rows: 0
   ──────── RESTORE VERIFICATION (always last) ────────
   re-created from captured DDL : 1
   live bypass_rls_policy count : 86 (must be 86)
   sorted table list IDENTICAL  : true
   byte-for-byte body mismatches: NONE
   RESTORE VERIFIED
   ────────────────────────────────────────────────────
   Error: --throw-after-drop: deliberate failure, to prove the `finally` restores
   ```

   The restore runs, verifies, and prints **before** the error surfaces — i.e. the `finally`
   genuinely precedes the rethrow.

2. **A SELF-HEALING PRE-FLIGHT.** Every `--run` and `--capture` compares the live count against 86
   **first**. If it is short and a capture file exists, it restores from that file, says so loudly,
   and only then proceeds. If it is short and there is **no** capture file, it REFUSES. If it is
   **larger** than 86 it also refuses — that is not an interrupted run, that is a population change.
   This is the real protection: it works after a hard kill, a power cut or a closed terminal,
   because it runs in the **next** process.

A single `BEGIN … DROP POLICY … ROLLBACK` would give a free restore (DDL is transactional in
PostgreSQL) and was **rejected for a measured reason**: `DROP POLICY` takes ACCESS EXCLUSIVE on the
table, so the `app_user` probe connections — which must be separate connections to carry a different
role — would block until that transaction ended and would never see the drop.

---

## 3. The matrix — both directions, one transaction per cell

Five cells, all **PASS**. Lane notation: role · tenant GUC · tripwire · policy state.

| # | site | lane | expectation | observed | verdict |
|---|---|---|---|---|---|
| 1 | `generateTicketNumber` — **NEW** receiver | `app_user` · GUC **empty** · tripwire **ARMED** · policy **DROPPED** | `nextval` succeeds and strictly increases | `nextval #1 = 4`, `#2 = 5` | **PASS** |
| 2a | `generateTicketNumber` — **OLD** receiver | `app_user` · GUC **empty** · tripwire **ARMED** · policy **DROPPED** | `TC001` | raised **`TC001`** | **PASS** |
| 2b | `generateTicketNumber` — **OLD** receiver | `app_user` · GUC **empty** · tripwire **OFF** · policy **DROPPED** | **zero rows, no error** — §9's silent wrong answer | `count = 0, max = null`; privileged counter-read `count = 2, max = "TKT-9002"` | **PASS** |
| 3 | `generateTicketNumber` — **OLD** receiver | `app_user` · GUC **= tenant A** · policy **DROPPED** | sees only A's rows, returns A's LOCAL max, not the global one | `visible = 1`, tenant-B rows visible `= 0`, `max seen = "TKT-9001"`; privileged global `max = "TKT-9002"` | **PASS** |
| 4 | `generateTicketNumber` — **NEW** receiver | `app_user` · GUC **= tenant A** · policy **DROPPED** | unchanged — a sequence has no tenant dimension | `nextval = 6` | **PASS** |

**Unproven cells: none.** Every cell ran with a fixture behind it.

### The rules, applied

- **ONE TRANSACTION PER CELL.** Each cell opens its own connection and its own
  `BEGIN … ROLLBACK`. Cell 2a raises `TC001`, which aborts its transaction; because that transaction
  is the cell's own, cells 2b, 3 and 4 are unaffected. In one shared transaction they would all have
  returned `25P02` — one failure wearing four costumes.
- **SQLSTATE off the CAUSE CHAIN.** `sqlstateOf` walks `err.cause` and matches the first
  five-character code. `TC001` is recognised **by code, never by message prose**.
- **Every zero carries a PRIVILEGED counter-read on a SEPARATE connection.** Cell 2b's `count = 0`
  is paired with `count = 2` read as `postgres`. A zero over an empty table proves nothing
  (quick-610), and `SupportTicket` is genuinely zero-row on staging.
- **Every `foreign === 0` is PAIRED with `own > 0`.** Cell 3: tenant-B rows visible = 0 **and**
  visible rows = 1. Either half alone is vacuous.
- **Counts come from a SCALAR**, `count(*)::int`, never `rowCount` — which is 1 for every count
  query.
- **Fixtures were committed, then torn down with an asserted zero.** Two `SupportTicket` rows
  (`TKT-9001` tenant A, `TKT-9002` tenant B) created on the privileged connection — the probes run
  on *other* connections, so an uncommitted fixture would be invisible to them — and
  `fixtures torn down; leftover 616 rows: 0` on every run. Staging re-read after all runs:
  **0 `SupportTicket` rows, 86 `bypass_rls_policy`.** No `auth.users` row was ever created.

### Cell 2 corrected its own expectation, and that is the most interesting result here

The cell was written expecting **zero rows, no error**, quoting `admin-connection.md` §9. The first
run **raised `TC001` instead** and was recorded as a FAIL.

The code was not wrong; the expectation was. With quick-602's tripwire **armed**, the old read never
reaches a policy at all — `tenant_context_required()` refuses it first. §9's "zero rows, not an
error" describes **production today**, where the tripwire is not armed.

So the cell was **split** rather than relaxed: 2a measures the armed world (`TC001`) and 2b measures
the unarmed one (`count = 0`, with the privileged counter-read showing the rows exist). Both pass,
and together they say something neither said alone: **§9's predicted `TKT-0001`-forever symptom is
real, and it is the shape the failure takes on the database as it is configured for production.**
The tripwire is explicitly `set_config(…, 'off')` in 2b rather than merely left unset, because the
pooler can hand back a backend where a previous session left it `'on'` (quick-602 — session scope on
a `max: 1` pool).

### What the drop actually bought

Cells 2b and 3 are the whole point of dropping the policy. With `bypass_rls_policy` live and
`app.bypass_rls` unset they would look identical — the flag is off either way — but **the proof would
have rested on a policy that is about to be deleted**. With it dropped, the `SupportTicket` table has
exactly one policy left, `tenant_isolation_policy`, and that is the world the routing is for.

---

## 4. The migration, applied and read back

```
sequence before: DOES NOT EXIST
applied 20260915180000_support_ticket_number_sequence
sequence after : [{"sequencename":"support_ticket_number_seq","last_value":null,"start_value":"1"}]
USAGE grants   : anon, app_admin, app_user, authenticated, postgres, service_role
ledger sentinel visible: 20260915170000_auth_user_display_definer_function
ledger read-back: [{"migration_name":"20260915180000_support_ticket_number_sequence",
                    "checksum":"fa41210ce4a85d48dc3a3a25a74ce969b5420c5efc53307742efee155ff34e84",
                    "applied_steps_count":0,"logs":""}]
```

- **The sentinel was confirmed visible BEFORE the read-back was trusted.** `_prisma_migrations` runs
  RLS enabled with zero policies and no `app_user` grant, so an empty read from a non-owner role is
  indistinguishable from "the row was never written" — and would prompt a duplicate write (DEC-17).
- `applied_steps_count = 0` is the signature of a hand-mirrored row; `migrate.mjs` writes `1` with
  the literal checksum `'manual'`.
- The first `nextval` returned **1** on staging, which is correct for a zero-row table.
- **`anon` / `authenticated` / `service_role` USAGE was NOT granted by this migration** — see
  `02-routing.md` §3, "One finding from applying it". Supabase's platform `ALTER DEFAULT PRIVILEGES`
  gives those three `rwU` on every sequence created in `public`. Reported, not acted on.

---

## 5. What this task did NOT do to staging

- **`bypass_rls_policy` is 86 before and 86 after**, verified as an identical sorted table list and
  byte-identical policy bodies. The drop was temporary, scoped to one table, and inside the proof.
  **The permanent drop is the NEXT task.**
- **No production statement was issued**, read or write.
- **Zero leftover fixtures.** `SupportTicket` is back to 0 rows on staging.
- The tripwire was never disarmed globally — cell 2b sets it `'off'` **inside its own transaction**,
  on its own connection, and that transaction is rolled back.
