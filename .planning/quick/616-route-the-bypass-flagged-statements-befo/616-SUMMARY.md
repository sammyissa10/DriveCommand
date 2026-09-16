---
phase: quick-616
plan: 01
subsystem: database / RLS bypass programme
tags: [rls, app_user-cutover, bypass_rls, census, sequence, click-through]
requires: [quick-596, quick-600, quick-601, quick-602, quick-604, quick-610, quick-612, quick-613, quick-615]
provides:
  - "the app.bypass_rls census — 177 statements / 87 files, per SURFACE x per CATEGORY, machine-readable"
  - "a fifth category, TENANT_KNOWN_UNSCOPED, holding 152 of 177"
  - "the 211/103 reconciliation — 34 disappearances, all attributed"
  - "B7 closed: a real TKT sequence replacing a cross-tenant max in two racing copies"
  - "the first rendered-surface measurement since the keys landed: 66 entries, 0 fail, 0 TC001"
affects:
  - "the bypass drop, which REMAINS BLOCKED — the census is what makes it plannable"
tech-stack:
  added: []
  patterns:
    - "a database sequence in place of a cross-tenant read-the-maximum"
    - "capture-DDL-then-drop-then-restore, verified by an identical sorted list AND byte-for-byte bodies"
    - "a self-healing pre-flight in the NEXT process, because a finally cannot survive a hard kill"
key-files:
  created:
    - apps/web/scripts/audit/616-bypass-census.ts
    - apps/web/scripts/audit/616-census-classification.ts
    - apps/web/scripts/audit/616-audit211-transcription.json
    - apps/web/scripts/audit/616-routing-verify.ts
    - apps/web/prisma/migrations/20260915180000_support_ticket_number_sequence/migration.sql
  modified:
    - apps/web/src/actions/support-tickets.ts
    - apps/web/src/app/api/mobile/support/ticket/route.ts
    - apps/web/scripts/audit/wrapper-countdown.json
    - docs/audits/bypass-call-classification.md
decisions:
  - "the brief's ~20 was 615 §8's FIRST row; the NEXT row of the same table said ~211. 177/87 is measured"
  - "a FIFTH category was named: 152 of 177 are TENANT_KNOWN_UNSCOPED, not DECORATIVE"
  - "B7 takes a real sequence, not getAdminDb — the admin connection leaves the race"
  - "B8 and the four SupportTicket BROKEN_POLICY sites are STOPPED AND REPORTED"
  - "no wrapper-migration statement converted — the countdown stays the single tracker"
metrics:
  census_statements: 177
  census_files: 87
  routed: 2
  stopped_and_reported: 11
  probe_cells: 5
  click_through_entries: 66
---

# quick-616: Census the `app.bypass_rls` population, route the named subset — Summary

---

## §1 — THE COUNT RECONCILIATION, FIRST

**The brief assumed `~20` statements. The measured population is `177` statements across `87`
files** — nine times larger.

**The `~20` is `615-SUMMARY.md` §8's FIRST table row.** Verbatim:

> | **The bypass-flagged population** — B7's two `generateTicketNumber` copies, B8
> (`lib/auth/supabase.ts:164`), the 7 in `support-tickets.ts`, `evaluator.ts:95-96`,
> `workflow-digest`'s 8, the `api/track/[token]` GPS lookup | **~20 statements across 86 tables'
> worth of policies** | The **Phase 0 bypass programme**. …

That row enumerates only the statements prior audits had **NAMED INDIVIDUALLY**. It was never a
count of the population.

**The NEXT row of the same table gives the population.** Verbatim:

> | **`~211` bypass-exempt sites the tripwire cannot signal** | 211 | quick-602's stated cost,
> unchanged. Owned by the bypass programme |

**Both numbers were in the source, one line apart.** The source was not ambiguous; the first row was
the wrong row for the question "how big is the bypass population". Said plainly rather than softened,
because softening it invites the same mis-read next time.

### Adjudicating 211 vs 177/87 vs 180/89

| number | what it is | verdict |
|---|---|---|
| **211 / 103** | `bypass-call-classification.md`, 2026-09-12 | **correct then.** 34 statements have gone since; all attributed — §4 |
| **177 / 87** | planning's naive line-grep | **correct, and the AST parse agrees exactly** |
| **180 / 89** | the orchestrator's brief | **not reproducible.** See below |
| **179 / 89** | — | reproducible, and wrong |

The parse is `ts.createSourceFile` — no `Program`, no type checker. A statement is the **innermost**
`CallExpression` or `TaggedTemplateExpression` whose own literal children contain `app.bypass_rls`.
Comments are not AST nodes, so prose is excluded **by construction**, not by a pattern.

Dropping the `//` clause from the prior audits' awk filter — i.e. rejecting only `^\*` — admits
exactly two lines and yields **179 / 89**:

```
src/app/api/email-confirm/[token]/route.ts:53:  // `app.bypass_rls` with the tenant GUC, which …
src/lib/email/sender-config.ts:134:            //   set_config('app.bypass_rls', 'on', TRUE)
```

Both are `//` prose in files that carry **no** executable statement, which is why they move the FILE
count by exactly 2 — reproducing the brief's 89. **The brief's 180th statement is not reproducible
by any comment-filter spelling tried** (five variants, plus a spaces-only trim and a no-filter run).
Reported as unreconciled rather than averaged away.

> Neither 179 nor 180 is "safe because larger". Both are wrong in the same direction and for the
> same reason — a comment heuristic admitting comments — and the two extra "statements" name files
> that contain none. A count two files too large sends a follow-up batch to two files with nothing
> to do in them.

**The named subset is 13, not ~20**, and every line number in both source documents had drifted. §7
lists the corrections.

---

## §2 — THE MATRIX: per surface × per category, FILE and STATEMENT counts

Pre-routing (the 177 this task measured). Read `Nf / Ms` as *N files / M statements*. File counts are
by containment, so a row's TOTAL can be less than its cells' sum.

| surface | BOOTSTRAP | BROKEN POLICY | CROSS TENANT | DECORATIVE | **TENANT KNOWN UNSCOPED** | TOTAL |
|---|---|---|---|---|---|---|
| `MOBILE_API` | — | — | 1f / 1s | — | 47f / 83s | **47f / 84s** |
| `LIB_SERVICES` | 1f / 1s | 2f / 5s | 1f / 1s | — | 12f / 38s | **15f / 45s** |
| `API_V1` | — | 1f / 1s | — | 1f / 3s | 5f / 10s | **6f / 14s** |
| `OWNER_PORTAL` | — | — | — | 3f / 5s | 1f / 2s | **4f / 7s** |
| `DRIVER_PORTAL` | — | 2f / 2s | — | 1f / 1s | 2f / 3s | **4f / 6s** |
| `API_DRIVER` | — | 1f / 1s | — | 1f / 4s | 1f / 1s | **2f / 6s** |
| `API_CRON` | — | — | — | — | 1f / 4s | **1f / 4s** |
| `API_AUTH` | — | — | — | — | 2f / 3s | **2f / 3s** |
| `API_DRIVER_PAY` | — | — | — | — | 1f / 2s | **1f / 2s** |
| `API_GPS` | — | — | — | — | 1f / 2s | **1f / 2s** |
| `API_INTEGRATIONS` | — | — | — | — | 2f / 2s | **2f / 2s** |
| `API_PUSH_TOKENS` | — | — | — | — | 1f / 1s | **1f / 1s** |
| `API_TRACK` | — | — | — | — | 1f / 1s | **1f / 1s** |
| `ADMIN_PORTAL` · `AUTH_PORTAL` · `API_EMAIL_CONFIRM` · `ONBOARDING_PAGES` | — | — | — | — | — | **0f / 0s** |
| **TOTAL** | **1f / 1s** | **6f / 9s** | **2f / 2s** | **6f / 13s** | **77f / 152s** | **87f / 177s** |

`1 + 9 + 2 + 13 + 152 = 177`. After this task's routing: **175**, and **CROSS_TENANT is now 0**.

**The four surfaces the user named cover 142 of 177.** The other 35 live in nine further surfaces,
seven of which are a single route. They are listed individually — never bucketed — because a
follow-up batch has to be able to see them. Four rules match nothing today and are kept anyway:
quick-600 emptied `ADMIN_PORTAL`, quick-601 emptied the other three. A rule that has gone to zero is
worth keeping visible; deleting it makes a regression look like a new surface.

---

## §3 — Per category: what routing it needs, and how many FILES

| category | statements | **files** | routing it needs | what a batch closing it looks like |
|---|---:|---:|---|---|
| **BOOTSTRAP** | 1 | **1** | admin connection on one branch only, or a narrow `SECURITY DEFINER` | one file, but **nine call-chain units** reach a transaction through it. A restructuring task, not an edit |
| **BROKEN_POLICY** | 9 | **6** | **DDL. A migration, never a bypass** | three distinct gaps: `audit_log`'s cast (1, already remediated at the DB by quick-599), `SupportTicket`'s null-tenant rows (4, needs a product decision), `stops` having zero policies on production (4, needs only shipping staging's existing policy) |
| **CROSS_TENANT** | 2 → **0** | 2 → **0** | a real sequence — **not** an admin connection | **done in this task** |
| **DECORATIVE** | 13 | **6** | **delete the line. Nothing else** | one commit. Genuinely trivial — and it is **7%** of the population, not 90% |
| **TENANT_KNOWN_UNSCOPED** | **152** | **77** | `getTenantPrismaForOrg(tenantId[, userId])` acquired where none is acquired today, flag deleted in the same edit | **the whole remaining programme.** One task per surface |

**This is the answer to "a DECORATIVE count of 80 and a CROSS_TENANT count of 80 imply very
different remaining work".** The population is not 161 DECORATIVE + 50 CROSS_TENANT (the 2026-09-12
axis) nor 172 DECORATIVE (the design document's). It is **13 one-line deletions, 152 client
acquisitions, 9 migrations' worth of policy work, 2 sequence conversions and 1 restructuring.** Four
of those five numbers are small.

> **A warning that travels with the DECORATIVE 13.** `tests/security/bypass-rls-flag-removal.test.ts`
> pins an exact `retainedFlags` count for nine named files, `TOTAL_RETAINED = 15`, and rule 2 exists
> *"to stop someone finishing the job"*. **Twelve of the thirteen DECORATIVE statements are inside
> that guard.** The "trivial one-commit" batch must update its numbers deliberately and witness it
> red, not discover it.

---

## §4 — THE FIFTH CATEGORY, and the 211 reconciliation

### `TENANT_KNOWN_UNSCOPED` — named because the four genuinely do not fit

The four categories are **quoted, not re-invented**, from
`docs/audits/bypass-replacement-design.md` §1's precedence test (BOOTSTRAP → BROKEN_POLICY →
CROSS_TENANT → DECORATIVE). But that document's own §1.4 splits its DECORATIVE bucket in a sentence
and then does not carry the split into a category:

> Thirteen of the 171 already work and keep working, because a `getTenantPrisma()` earlier in the
> same request left the GUC set on the `max: 1` pool …

and the earlier audit measured the identical split and called it *"the number that actually
matters"*: **15 survive the cutover, 145 do not.** Those are two different jobs with two different
owners — one line deleted, versus a tenant client acquired where none is acquired today.

| category | definition |
|---|---|
| `DECORATIVE` | tenant in hand **and** `app.current_tenant_id` **already set** for that request → `DELETE_FLAG_ONLY` |
| `TENANT_KNOWN_UNSCOPED` *(new)* | tenant in hand from a **verified source** (JWT claim, session, signed token, a row already read under a tenant predicate) and the GUC **never** set → `getTenantPrismaForOrg` |

**Forcing these into DECORATIVE would have reported "165 DECORATIVE" and implied 165 one-line
deletions.** The truth is 13 deletions and 152 client acquisitions. That is the census's single most
valuable finding.

### The 211 → 177 reconciliation: 34 gone, 0 appeared, ALL attributed

The per-file map is a hand transcription of `bypass-call-classification.md` §3/§4 and is
**self-checking** — the census refuses to run unless it adds to exactly 211/103, so a mis-typed row
cannot silently explain away a real disappearance.

| task | statements removed |
|---|---:|
| **quick-600** `0c08a959` | **24** |
| **quick-601** `a30de408` | **9** |
| **quick-596** `a7d52a8c` | **1** |
| **total** | **34** |
| **unaccounted** | **ZERO** |

**Two of the 34 needed a different instrument, and that is worth keeping.** `git log -S` counts
occurrences of the string, so it is **blind to a statement that became a comment** — the occurrence
is still there. `api/email-confirm/[token]/route.ts` and `lib/email/sender-config.ts` came back
attributed to the commits that *added* the line. `git blame` on the comment named the real ones, and
both files appear in today's prose-only list, which corroborates it independently. **`-S` alone would
have left two statements unaccounted and invited the conclusion that the walker was broken** — the
exact failure this reconciliation exists to rule out.

Third independent agreement: `bypass-replacement-design.md` §0 says *"Today's live count is
therefore 210 across 102 files"* on 2026-09-12. 210 − 24 − 9 = **177**.

---

## §5 — What was ROUTED (2), and what was stopped (11)

### B7 — a real sequence, argued against `getAdminDb` in writing

`CREATE SEQUENCE public.support_ticket_number_seq`
(`prisma/migrations/20260915180000_support_ticket_number_sequence`), and both
`generateTicketNumber` copies become one `$queryRaw` for `nextval` — no transaction, no bypass flag.

1. **The sequence removes the LIVE RACE. `getAdminDb` does not.** Two entry points (a server action
   and `/api/mobile/*`) doing read-max-then-insert with no lock against a **global** unique index.
2. **§9's predicted symptom is a SILENT WRONG ANSWER**, which is the worse failure mode — and it was
   **measured, not assumed** (§6 cell 2b).
3. **An admin connection papers over a data-model problem** — §9's own words.
4. **It is strictly less privilege.** `getAdminDb` would hand the ticket-number path `BYPASSRLS` plus
   `SELECT` on `SupportTicket`. The sequence path holds `USAGE ON SEQUENCE` and cannot read a ticket.

The start value is **read from the table, per database**, inside the migration: staging (0 rows) →
first `nextval` = 1, observed; production (87 rows at the last count) → 88. A hardcoded number would
have been wrong on one of the two. DEC-17 ledger row hand-written, `applied_steps_count = 0`, real
SHA-256 over LF bytes, **read back only after a known-good sentinel row was confirmed visible**.

**Accepted cost, stated:** a sequence is not transactional, so a rolled-back insert leaves a gap.
Ticket numbers are identifiers, not a count. A gap beats a collision.

### `set_config` removed vs remaining — reconciled

```
PASS  ROUTED STATEMENTS ARE GONE  —  2 routed statements absent
PASS  REMOVED + REMAINING RECONCILES  —  175 remaining + 2 routed = 177 (must be 177)
statements: 175   files: 87
```

Asserted as a **MOVE**, not an absence: the census names both routed statements and fails if either
is still present **and** if the arithmetic does not close. A merely shorter list would pass
identically whether a statement was routed or simply deleted along with the read it protected
(quick-566 / quick-599's union rule).

**No `getAdminDb` call site was added.** `tests/security/admin-connection-allowlist.test.ts` is
unchanged and green at 9/9. There was nothing to raise `TOTAL_EXPECTED_CALLS` for and nothing to
witness red — adding an entry to demonstrate a gate for a call site that does not exist would be
theatre.

### The 11 not routed, each with a reason

| item | why not |
|---|---|
| **B8** `lib/auth/supabase.ts:164` | **STOPPED AND REPORTED.** `set_config(…, TRUE)` is transaction-local, so deleting the transaction silently removes the bypass and `User` is FORCE-RLS — **nobody logs in**. `withTenantContext` is explicitly the wrong remedy (it leaves `app.bypass_rls = on` for the rest of the caller's unit of work). **Nine call-chain units** reach a transaction through it. The real fix is a branch: the GUC from the JWT for 37 of 38 accounts, admin only on `isSystemAdmin`. A half-done auth path is worse than a named open item |
| **`support-tickets.ts` 179 / 227 / 417 / 456** | **BROKEN_POLICY**, live policy quoted from `pg_policies` below. The remedy is a product decision, not a migration |
| **`evaluator.ts:127`, `workflow-digest` ×4, `track/[token]:50`** | **wrapper-migration population — CENSUS-ONLY here, by the user's decision.** `admin-connection.md` §9 already names `getTenantPrismaForOrg` as their destination |

**BROKEN_POLICY, quoted live from staging `pg_policies` (DEC-14 — never a migration file):**

```sql
-- public."SupportTicket"   relrowsecurity = true, relforcerowsecurity = true
tenant_isolation_policy  FOR ALL  TO public  USING ("tenantId" = current_tenant_id())
                                             WITH CHECK -- none declared; DERIVED from USING
```

**What cannot satisfy it:** a row with `tenantId IS NULL`. The predicate becomes
`NULL = current_tenant_id()` → NULL → *not true*, at **every** GUC value including NULL, because
`NULL = NULL` is NULL. `tenantId` is nullable **deliberately** so a sysadmin can file a tenant-less
ticket, and production holds **7 such rows out of 87**. With `bypass_rls_policy` gone there is no
second permissive policy to OR with.

**`track/[token]:50` corrected a correction.** `admin-connection.md` §9 is right that design §1.1's
"needs nothing" is stale — the query carries no tenant predicate. But the tenant **is** in hand
(`load.tenantId`), so its receiver is a tenant client, **not `getAdminDb`**. Routing it here would
have broken this task's own prohibition.

**Routing 13 down to 2 is the correct outcome, not a shortfall.**

---

## §6 — The proof, with `bypass_rls_policy` DROPPED

**Five cells, all PASS, on staging as `app_user`, tripwire armed and read back, with
`bypass_rls_policy` dropped on the one affected table.** Full detail in `evidence/03-proof.md`.

| # | lane | observed |
|---|---|---|
| 1 | NEW receiver · GUC empty · tripwire ARMED · **policy DROPPED** | `nextval` 4 → 5, strictly increasing |
| 2a | OLD receiver · GUC empty · tripwire **ARMED** · policy DROPPED | raised **`TC001`** |
| 2b | OLD receiver · GUC empty · tripwire **OFF** (production today) · policy DROPPED | `count = 0, max = null`; privileged counter-read `count = 2, max = "TKT-9002"` |
| 3 | OLD receiver · GUC = tenant A · policy DROPPED | visible 1, tenant-B visible **0**, local max `TKT-9001` ≠ privileged global `TKT-9002` |
| 4 | NEW receiver · GUC = tenant A · policy DROPPED | `nextval = 6`, unchanged |

One transaction per cell · SQLSTATE off `err.cause.code` by CODE never prose · every zero paired with
a **privileged counter-read on a separate connection** · every `foreign === 0` paired with `own > 0`
· scalar counts, never `rowCount` · **zero unproven cells**.

**Cell 2 corrected its own expectation, and that is the most interesting result.** It was written
expecting "zero rows, no error" per §9 and the first run raised `TC001` instead. The code was not
wrong; the expectation was — with the tripwire armed the read never reaches a policy. So the cell was
**split**, not relaxed: 2a measures the armed world, 2b the unarmed one. Together they confirm **§9's
predicted `TKT-0001`-forever symptom is real, and is the shape the failure takes on the database as
configured for production.**

### The policy drop and restore

- **`--capture` first:** all 86 policies' DDL written to disk **before any DROP**; the count asserted
  at exactly 86 with a hard stop otherwise.
- **The DROP was scoped to ONE table** — `SupportTicket`, the only table either routed statement
  touches — never all 86.
- **The restore is verified two ways:** the sorted table list **compared element by element** (nothing
  only-in-before, nothing only-in-after — a count is not sufficient, quick-599/612) **AND** a
  byte-for-byte comparison of each restored `permissive`/`roles`/`cmd`/`qual`/`with_check` against
  its captured original. "A policy with that name exists" is what lets a restored policy with a
  different body pass.
- **86 before, 86 after**, independently re-measured in §7's gates with a second instrument,
  hash-equal on the sorted list.

### **THE SIGINT PROOF FAILED, and it is recorded rather than hidden**

The plan asked for a deliberate SIGINT as the only honest proof the `finally` fires. It was
attempted. **On Windows, `process.kill(pid, 'SIGINT')` to one's own process terminates it
UNCONDITIONALLY** — no handler, no `finally`. The run exited 1 having dropped a policy (**85** live)
and created two fixture rows. A manual `--restore` + cleanup put staging back to **86 policies / 0
`SupportTicket` rows**, byte-verified, within the minute.

Two things replaced it, **neither depending on the dying process**:

1. **`--throw-after-drop`** proves the `finally` on the path it CAN cover — an exception, which is
   every failure mode except a hard kill. Witnessed: the restore runs, verifies and prints *before*
   the error surfaces.
2. **A SELF-HEALING PRE-FLIGHT.** Every `--run`/`--capture` compares the live count against 86 first;
   if short with a capture file it restores and says so loudly, if short without one it **refuses**,
   if **larger** it also refuses. It runs in the **next** process, so it survives a hard kill.

A single `BEGIN … DROP POLICY … ROLLBACK` would restore for free (DDL is transactional) and was
**rejected for a measured reason**: `DROP POLICY` takes ACCESS EXCLUSIVE, so the separate `app_user`
probe connections would block and never see the drop.

---

## §7 — The click-through harness: **IT RAN**, and 13 surfaces are newly measurable

quick-615 could not run it because `NEXT_PUBLIC_SUPABASE_URL` named **production**. `.env.staging`
now carries a staging URL and anon key; the ref was asserted **by name before the server started**,
and all four target-deciding values were refused positively.

| | entries | pass | fail | not-reachable |
|---|---:|---:|---:|---:|
| **quick-604** | 66 | 47 | **13** | 6 |
| **quick-616** | 66 | **60** | **0** | 6 |

**The verdict is the correlated log slice, never the status code** (quick-602 measured
`purge-deleted` raising `TC001` seven times behind an HTTP 200). Result:
**0 `TC001` in any entry's slice, and 0 in the whole 20,829-byte server log** — two independent
scans. No `[prisma] tripwire arm failed`, no 500.

### Was anything PREVIOUSLY UNMEASURED?

**No new surface** — the list is a committed constant and both runs covered the identical 66 entries
(`only in 616: NONE`, `only in 604: NONE`).

**But thirteen surfaces that previously 500'd now execute to completion**, so everything downstream
of those failures had never been exercised by an authenticated request against `app_user` with the
tripwire armed: `/carrier/trips`, `/documents`, `/carrier/driver-pay/settlements`,
`/checklists/automation`, and nine cron routes including `purge-deleted` (28 `TC001` mentions in
604's slice), the three digests (8 each), `send-reminders` (8) and `trip-reminders` (4). **66 `TC001`
mentions across 604's slices → 0.** No surface regressed.

This is the **first rendered-surface measurement of quick-606/610/612/613/615's routing** — 615
shipped 47 routed statements and could not exercise one of them through a browser path.

**"Zero TC001" is exactly what a DISARMED tripwire looks like**, so a four-part counter-assertion:
`shouldArmTripwire` returns `true` for the server's exact inputs and **false** for the production ref
and for `flag=off`; the GUC reads back `'on'`; an unscoped read raises `TC001` armed and is
**silent** with it off. What it does **not** prove — that every one of the 66 requests ran on an
armed connection — is stated rather than glossed.

**Passes 1 and 2 shared one absolute `--out`** and one `CLICK_THROUGH_LOG`. All **77**
quick-604/605/606 evidence files were SHA-256 hashed at open and at close: **byte-identical**.

**A caveat that must travel with the number.** Staging is sparse — `Truck`, `Load`, `SupportTicket`
and `PlaybookInstance` are all zero-row. quick-606's own artefacts make the point about
`carrier-auto-dispatch`: *"the 2xx proves the raise is gone and NOTHING about the scoping"*. The
honest reading of "60 pass" is **the routes no longer raise**, and no scoping claim follows for the
ones whose row sets are empty.

---

## §8 — The gates

| gate | result | measured against |
|---|---|---|
| `tsc --noEmit` | **0**, **proven not blind** — injected probe reported TS2322 at `support-tickets.ts:642`, the file this task edited; probe deleted and swept repo-wide | the working tree |
| `npm run build` | **exit 0**, `✓ Compiled successfully in 35.6s` | the working tree |
| `audit:rls-policy-drift` | **CLEAN exit 0** — 186/186, 0 missing, 0 unexpected, **definition layer RAN** (186 bodies, 0 drift, not exit 3) | **STAGING `wyixpgunnjmzguhggocz`**, pinned on the command line because the script still does not name its own target |
| vitest | **717 · 2129 · 2010 passed · 64 failed · 52 pending — IDENTICAL both ways**, failing-**FILE** set identical at **25 files** | `apps/web`, `--reporter=json` both directions, baseline `3e08f6bc` via `git checkout` in the main tree |
| `bypass_rls_policy` | **86 before, 86 after, identical sorted list**, hash-equal | **STAGING**, an instrument independent of Task 3's own |
| wrapper countdown | **475 / 479 UNCHANGED**, anti-vacuity counter still 0 | the working tree |
| allowlist gate | **9/9 green, unmodified** | the working tree |
| census anti-vacuity | floor + two positive witnesses + confirmed-read-yields-zero + orphan-override, **witnessed RED**, writes nothing on failure | `apps/web/src` |

---

## §9 — **THE BYPASS DROP REMAINS BLOCKED**

Not "progress toward". **Blocked.**

**What blocks it: 175 live `app.bypass_rls` statements across 87 files.** This task removed 2. The
census does not shrink the work; it makes it **plannable for the first time** by saying where the
work is and what each part of it costs.

Three named blockers, in order of size:

1. **152 statements / 77 files need a tenant client acquired where none is acquired today**
   (`TENANT_KNOWN_UNSCOPED`). That is the wrapper-migration programme — countdown 475/479, still 0
   migrated units.
2. **9 statements / 6 files need DDL** (`BROKEN_POLICY`) — one of the three gaps needs a product
   decision about sysadmin tickets, one needs shipping a policy staging already has to production.
3. **1 statement needs an auth-path restructuring** reaching nine call-chain units (B8).

The 13 `DECORATIVE` deletions are the only part that is genuinely one commit — and even those trip
a guard that must be updated deliberately.

### What would break if `bypass_rls_policy` were dropped today — BY SURFACE

Derived from `01-census.json` joined to the enclosing route/function, not recalled. Under
`app_user`; today's `postgres` connection carries `BYPASSRLS`, so the drop is observable only at the
cutover.

**Mobile app — the whole of it. 83 statements across 47 route files.**
- **The driver's phone:** the home dashboard, the loads list and every load detail, load status
  updates and reverts, the rate-confirmation view, **the HOS screen** (`GET` and `POST` — a driver
  could not record a duty-status change), incident reporting, the documents list and upload, the
  route screen, the tasks list, the messages thread and its unread badge, the tracking token.
- **The owner's phone:** the KPI dashboard, drivers list/detail/invite, trucks list/detail/maintenance
  and scheduled service, loads list/detail/assign-truck, routes, invoices, payroll, CRM, customers,
  compliance, safety, fuel log, profit predictor, **the live fleet map** and fleet-positions, and
  **the fleet message thread** (13 statements across two files — the single densest pair).
- **The mobile support ticket form.**

**Owner web portal — 7 statements across 4 pages:** the carrier dashboard's tenant header and its
truck/driver/load/client counts, the stop detail page, the trip detail page, the trip stops overview.

**Driver web portal — 6 statements across 4 files:** the driver quick-action badges, **`startTrip`**
(a driver could not start a trip), the tasks list, and the task detail page including its audit
footer.

**Messaging and the driver REST API — 20 statements:** owner↔driver conversations, thread reads,
send, broadcast, voice-message URLs, and the driver stop-message thread on both surfaces.

**Everything else, one or two statements each:** the workflow-digest cron, invitation acceptance and
one login branch, the driver-pay settlement dispute (mobile branch only), GPS report ingest and the
geofence checks it drives, the Samsara and Motive integration syncs, push-token registration, and
**the public customer tracking page's live map pin**.

**Cross-cutting, and the worst of them — `LIB_SERVICES`, 45 statements across 15 files.** These are
not a screen; they are under many. Push notifications (`sendPushToUser`/`sendPushToOrg` — every push
in the product), the workflow notification service (10 statements: tenant name, user name, truck
label, dispatcher lookup, admin emails, step-assigned, step-overdue, instance-blocked and its
escalation email), workflow analytics, playbook instance generation, the activation tracker, the
geofence checker (8), the security audit log, the notification audit log, doc feedback, the
driver-pay mobile auth gate, and **`getCurrentUser` — which every authenticated request reaches.**

**And the failure mode is silence, not an outage.** At least 14 of these sites sit inside
`.catch(() => null)`, `catch {}` or log at `info`. The cron routes return `{ success: true }` with a
zero count. An owner's dashboard would confidently report no drivers, no routes and no revenue.

---

## §10 — The backlog, sized PER SURFACE, ready to be one task each

| # | surface | statements | files | categories | what it needs | blocker |
|---:|---|---:|---:|---|---|---|
| 1 | **`MOBILE_API` — owner** | 61 | 30 | TENANT_KNOWN_UNSCOPED | `getTenantPrismaForOrg(auth.tenantId, auth.userId)` per route. quick-588 already did `/api/mobile/carrier/*` — the precedent exists | — |
| 2 | **`MOBILE_API` — driver** | 21 | 16 | TENANT_KNOWN_UNSCOPED | same shape | — |
| 3 | **`LIB_SERVICES` — notifications & workflows** | 24 | 5 | TENANT_KNOWN_UNSCOPED | **the hard one.** Dual-caller helpers: one import site decides behaviour for every caller. Needs a tenant argument threaded through, or a deliberate split into two entry points | design §6 item 2 |
| 4 | **`LIB_SERVICES` — the rest** | 14 | 6 | TENANT_KNOWN_UNSCOPED | geofencing (8, single caller), activation tracker, doc feedback, driver-pay auth gate, geofence email | — |
| 5 | **`API_V1` + `API_DRIVER` messaging** | 17 | 7 | TENANT_KNOWN_UNSCOPED + DECORATIVE + BROKEN_POLICY | mixed: 10 need a client, 7 need only the flag deleted, 2 are `stops` | the `stops` policy |
| 6 | **`DECORATIVE` sweep** (cuts across 5 and 6) | 13 | 6 | DECORATIVE | delete the line | **12 of 13 are inside quick-587's guard** — update it deliberately |
| 7 | **`BROKEN_POLICY` — `stops`** | 4 | 4 | BROKEN_POLICY | ship staging's existing `stops` policy to production. Nothing to design | a production migration |
| 8 | **`BROKEN_POLICY` — `SupportTicket`** | 4 | 1 | BROKEN_POLICY | a **product decision**: a sentinel tenant, or branch null-tenant traffic to admin. Option (i) needs an `app.current_user_id` GUC nothing sets | product |
| 9 | **B8 — `getCurrentUser`** | 1 | 1 | BOOTSTRAP | GUC from the JWT for 37/38 accounts, admin only on `isSystemAdmin`; re-verify nine call-chain units | highest blast radius in the census |
| 10 | **`OWNER_PORTAL` + `DRIVER_PORTAL`** | 13 | 8 | all but CROSS_TENANT | mixed; overlaps 6 and 7 | — |
| 11 | **The residue** — `API_CRON` 4 · `API_AUTH` 3 · `API_DRIVER_PAY` 2 · `API_GPS` 2 · `API_INTEGRATIONS` 2 · `API_PUSH_TOKENS` 1 · `API_TRACK` 1 | 15 | 10 | TENANT_KNOWN_UNSCOPED | one small batch, or folded into 3 (`API_GPS` drives the geofence helpers) | — |

**`MOBILE_API` at 84 statements is the biggest and the census supports splitting it** — the owner and
driver halves are 61/30 and 21/16, share no file, and the surface rule already separates them.

Every row is drivable from `evidence/01-census.json` without re-reading source.

---

## §11 — Stopped and reported rather than guessed

1. **The 180/89 count is not reproducible.** 177/87 measured, 179/89 reproduced and explained, 180
   unreconciled. Not averaged.
2. **Every line number in both source documents had drifted.** 615 §8's "7 in `support-tickets.ts`"
   is 5; its "`evaluator.ts:95-96`" is one statement at `:127`; its "`workflow-digest`'s 8" is 4;
   `admin-connection.md` §9's "second bypass statement" in `track/[token]` is the only one; design
   §1.3(c)'s `371`/`410` are `417`/`456`. Re-resolved **by symbol**, corrections reported in public.
3. **The mobile `generateTicketNumber` annotation was FALSE in three places** — `SCOPE: only the
   authenticated user's tenant` over a query with no tenant predicate, and `SAFETY: gated by
   validateMobileToken() above` on a module-level helper. Its web twin was annotated `cross-tenant`
   and was correct. Fixed **in the file**, not deleted quietly.
4. **A second annotation measured false:** `api/mobile/driver/messages/route.ts:109` —
   `load.findFirst({ where: { id, driverId } })` omits `tenantId`, unlike every sibling in the file.
5. **Two prior-audit claims CORRECTED rather than repeated.** `bypass-call-classification.md` §6 says
   the `fleet-positions`/`map/vehicles` `Truck` **and** `User` joins carry no tenant predicate; the
   `User` join reaches through a tenant-anchored `Load`. And `mobile/owner/loads/[id]:206` carries no
   annotation at all, so there is nothing there to verify. **Overstating a finding is as damaging as
   missing one.**
6. **B8 left unrouted**, sized, with the reason in full (§5).
7. **The four `SupportTicket` BROKEN_POLICY sites left unrouted**, with the live policy quoted and
   the two candidate remedies weighed — one needs a GUC nothing sets, the other is a product decision.
8. **THE SIGINT PROOF FAILED on Windows**, left staging modified for under a minute, and is recorded
   in full with the two mechanisms that replaced it (§6).
9. **The first vitest baseline used the WRONG revision.** `11146846` came from the session context
   snapshot and is fifteen commits older than the true parent `3e08f6bc` — all of quick-615 sits
   between them. It produced a one-test, one-file delta, **exactly what a real regression looks
   like**. `git log --oneline --graph` gave the true parent. **Take a baseline revision from
   `git log`, never from a context snapshot** — quick-561/565/567's trap in its fourth distinct form.
10. **`audit:rls-policy-drift` still does not name its own database** — 615's finding, unchanged, and
    still worth its own task.
11. **`dotenv` logs to STDOUT**, so a connection string captured from a `node -e` command
    substitution contains the banner. It produced a `P2010 DatabaseNotReachable` that looked like a
    network fault. `{ quiet: true }`.
12. **`CRON_SECRET` exists in no env file on this machine** and the click-through harness refuses
    without it. A throwaway was generated for both sides and deleted. The next runner hits the same
    refusal.
13. **`npm run build` regenerates two docs search indexes and both came back modified** — 162
    insertions including a route correction `/carrier/route-templates` → `/carrier/templates`.
    Pre-existing drift unrelated to 616; **reverted, not swept into this diff** — but the committed
    index is what `/help` reads and it names a route that does not exist.
14. **Supabase's `ALTER DEFAULT PRIVILEGES` grants `anon`, `authenticated` and `service_role` `rwU`
    on every new sequence in `public`**, so the new ticket sequence has them. Not granted by this
    migration; a database-wide platform posture. `w` permits `setval`. Reported, not acted on —
    narrowing it on one sequence would make it the odd one out.

---

## §12 — What this task deliberately did NOT do

- **No bypass drop.** `bypass_rls_policy` is **86 before and 86 after**, compared as an identical
  sorted table list, verified twice by two independent instruments. Task 3's drop was temporary,
  scoped to one table, inside the proof, and restored from captured DDL with a byte-for-byte body
  comparison.
- **No cutover.** `DATABASE_URL` untouched.
- **No production write**, and no production statement of any kind. Every instrument refuses the
  production ref **positively** before issuing anything and prints
  `[db-target] project : wyixpgunnjmzguhggocz (staging)` to stderr with the credential masked.
  `.env.staging` was never echoed.
- **No wrapper conversions.** 152 `TENANT_KNOWN_UNSCOPED` statements counted and classified, **zero**
  converted — the user's decision, so the countdown stays the single tracker. It reads 475/479,
  unchanged.
- **No statement routed to `getAdminDb` that a tenant client can serve.** None routed there at all.
- **No bypass flag left on a routed path.** Neither `generateTicketNumber` has a `$transaction` any
  more.
- **Nothing installed. No guard weakened.** The allowlist rose by nothing and was not touched; no
  floor lowered; the countdown regenerated, never edited; the census refuses to write an artefact
  when its own checks fail.
- **Zero leftover fixtures on staging** — `SupportTicket` back to 0 rows, verified.
- **Nothing pushed.**

---

## Self-Check: PASSED

Every file this summary claims, checked on disk; every commit hash, checked in `git log`.

| artefact | |
|---|---|
| `evidence/01-census.json` · `01-census.md` · `01-walker-red-green.md` | FOUND |
| `evidence/02-routing.md` | FOUND |
| `evidence/03-proof.md` · `03-policy-capture.json` · `03-probe-cells.json` · `03-run-transcript.txt` | FOUND |
| `evidence/04-click-through.md` · `.json` · `04-server.log` · `04-arming-control.txt` · `04-prior-evidence-hashes.txt` | FOUND |
| `evidence/05-gates.md` · `05-bypass-policy-count.txt` | FOUND |
| `apps/web/scripts/audit/616-bypass-census.ts` · `616-census-classification.ts` · `616-audit211-transcription.json` · `616-routing-verify.ts` | FOUND |
| `apps/web/prisma/migrations/20260915180000_support_ticket_number_sequence/migration.sql` | FOUND |

| commit | |
|---|---|
| `e56fd1d0` chore(616-01) the census | FOUND |
| `2f92a25a` fix(616-02) B7 sequence | FOUND |
| `6260ad1d` test(616-03) the proof with the policy dropped | FOUND |
| `d5fda366` test(616-04) the click-through | FOUND |
| `a0c7049b` chore(616-05) the gates | FOUND |
