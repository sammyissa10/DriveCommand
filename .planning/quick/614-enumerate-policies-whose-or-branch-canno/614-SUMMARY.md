---
phase: quick-614
plan: 01
subsystem: security / RLS / app_user cutover
tags: [rls, tripwire, TC001, policy, app_user, cutover, audit, investigation]
requires:
  - quick-602 (the unmigrated-path tripwire, TC001, decision D2)
  - quick-612 (the AutomationRule per-command policy split)
  - quick-613 (the sysadmin AutomationRule routing)
  - docs/audits/admin-connection.md section 9
provides:
  - docs/audits/policy-or-shortcircuit.md
  - the measured plan-time finding for TC001
  - the 12-file / 48-statement cutover blocker list
  - the state correction that production is no longer awaiting deploy
affects:
  - the app_user cutover plan
  - docs/audits/admin-connection.md section 9 (four corrections)
  - quick-612 section 9 item 1, quick-613 section 12 items 1 and 7 (now stale)
tech-stack:
  added: []
  patterns:
    - "a probe matrix with one transaction PER CELL, so a TC001 cannot cascade as 25P02"
    - "EXPLAIN without ANALYZE as the plan-time / execute-time discriminator"
    - "a four-state statement context model (ADMIN_CONN / TENANT_GUC / BYPASS / UNFLAGGED)"
key-files:
  created:
    - docs/audits/policy-or-shortcircuit.md
    - .planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/ (12 artefacts)
  modified: []
decisions:
  - "Keep the tripwire exactly as it is; close the 48 unflagged statements by routing them to getAdminDb (option d). Rejected: returning NULL inside policies, which converts every raise into a silent zero-row under-read."
metrics:
  duration: ~2h
  completed: 2026-09-15
---

# quick-614: enumerate the policies whose OR branch cannot save them from the tripwire — Summary

**Nothing can save any statement from the `TC001` tripwire, because the raise happens at PLAN TIME.**
`EXPLAIN` *without* `ANALYZE` — which produces a plan and executes nothing — raises, and it raises on
a table with **RLS switched off**. PostgreSQL's planner evaluates `current_tenant_id()` while
estimating the selectivity of `Var = <stable expression>`, before a single row is touched. OR
branches, empty tables, empty subqueries, correlated versus uncorrelated — all irrelevant.

**Deliverable:** `docs/audits/policy-or-shortcircuit.md` (610 lines, eight sections).
**Three commits**, none pushed. **No write reached either database. No code file was touched.**

---

## 1. What was measured

| instrument | where | result |
|---|---|---|
| catalog enumeration | PRODUCTION + STAGING, read-only `pg` | 186 policies / 86 `bypass_rls_policy` / 96 naming `current_tenant_id` on **both**, byte-identical |
| 31-cell probe matrix | STAGING as `app_user`, tripwire armed and read back | **15 RAISES · 16 RETURNS**, one transaction per cell |
| finding-F probe (13 cells) | same | `EXPLAIN` without `ANALYZE` **raises** |
| mechanism probe (8 cells) | same, on RLS-**OFF** relations | `Var = fn()` raises at plan time; `fn() IS NOT NULL` with no Var does **not** |
| source analysis | `apps/web/src`, 31 files statement-by-statement | **48 UNFLAGGED statements across 12 files** |

---

## 2. The headline findings

1. **Plan-time raise.** Cells `M1` (RLS-off table, `Var = current_tenant_id()`, plain `EXPLAIN`) →
   **RAISES**; `M2` (no relation, `current_tenant_id() IS NOT NULL`, plain `EXPLAIN`) → **returns a
   plan**; `M3` (the same statement executed) → **RAISES**. The `M1`/`M2` pair is the discriminator
   and it is what makes this a measurement rather than an argument. `M4` adds an empty relation and
   still raises. Server: PostgreSQL 17.6.

2. **The counts, effective number leading.** Literal `OR` = **1** policy. **Effective OR = 86
   tables**, because PostgreSQL ORs permissive policies at the top level and 86 tables carry a
   separate `bypass_rls_policy`. `CASE` = 0. `COALESCE` = 0. Subquery = 4. Bare equality = 91.
   **11 distinct tables measured in the EMPTY lane, 11 / 11 RAISE.**

3. **The OR saves nothing — and what does save a bypass-flagged statement is a different mechanism at
   a different layer.** `carrier_trucks` with an empty tenant GUC and bypass **off** raises; the same
   table, same lane, bypass **on** returns 3 rows. That rescue is the
   `IF … app.bypass_rls = 'on' THEN RETURN NULL` arm inside `tenant_context_required()`, not the
   policy-level OR — which quick-602 measured failing to suppress the raise six times out of six.
   Anyone reasoning "it has a bypass policy, so it is fine" is right by accident.

4. **Finding F is MEASURED, not partial.** `TicketMessage` raised in the EMPTY lane with a **0-row
   outer AND a 0-row inner**, while its REAL-lane plan reports the SubPlan `(never executed)` — a
   contradiction that resolved into the plan-time finding. The plan's variant (a) (a real outer row
   with an empty correlated inner) could not be constructed, and the reason is better than "absent":
   all four correlated key columns are **`NOT NULL` with foreign keys**, and staging carries **0
   NULLs and 0 orphans**, so that state is **structurally impossible**. No orphan row was created.

5. **Finding D.** `carrier_documents`, `route_template_stops` and `stops` carry **no
   `bypass_rls_policy`** — no escape hatch of any kind.

6. **State correction.** Production carries all three migrations with
   `applied_steps_count = 1, checksum = 'manual'` — the `migrate.mjs`-actually-ran signature — while
   staging carries `0` + a real SHA-256, the hand-mirrored convention. **quick-612 §9 item 1 and
   quick-613 §12 items 1 and 7 are now stale.**

---

## 3. The blockers — 12 files, 48 statements

Sysadmin: `actions/notifications.ts` (9), `actions/tenants.ts` (14), `actions/users.ts` (5),
`actions/sysadmin-invoices.ts` (1), `admin-support/page.tsx` (1), `tenants/[id]/` ×3 (1 each),
`actions/support-tickets.ts` (3 raw). Cron: `auto-close-tickets` (1 raw),
`cron/automations/route.ts` (7), `lib/automations/evaluator.ts` (4).

**Five of those statements are named by NO existing audit** — `cron/automations/route.ts` :187 and
:198, and `evaluator.ts` :64, :80, :131.

**Four corrections to `admin-connection.md` §9**, the most important being that **B7 (both
`generateTicketNumber` copies) and B8 (`getCurrentUser`'s sysadmin branch) are BYPASS-FLAGGED** and
therefore **exempt from the tripwire and invisible to it**. §9's prediction for them remains exactly
right; it lands at the bypass-policy drop, not at the `app_user` cutover.

---

## 4. The instrument question, answered committally

**Keep the tripwire exactly as it is, and close the 48 statements by routing them to `getAdminDb`
(option d).**

- **(b) return NULL inside policies — REJECTED.** It converts every raise into a **silent zero-row
  under-read**, the exact failure the tripwire exists to end (quick-599 D3; §9's `TKT-0001` worked
  example), 48 times over. On `Tenant.tenant_self_read` that means a login saying "Account not
  found" and a sysadmin list rendering "no tenants". It also cannot be scoped "to policies only"
  without a second function, i.e. a rule an edit can drop. And §4 measured that the under-read mode
  **does not currently exist** — (b) would manufacture it.
- **(c) `SECURITY DEFINER` escapes — REJECTED on the measurement.** There is exactly **one** literal
  tenant-independent branch in the whole database, already routed. (c) is therefore not one function
  per branch but one per statement: 48 new privilege grants to replace a mechanism that exists.
- **Costs of (d), named:** allowlist 23 → ~33 entries and 48 → ~96 calls; `app_admin` grants must be
  extended per site and discovered by running the matrix, not by reading code (quick-600 §5); four
  MIXED files need statement-level care; two statements are not (d)'s to fix; and the ~86
  bypass-flagged sites including B7/B8 stay invisible by construction.
- **A new cost of keeping (a), discovered here:** because the raise is at plan time, **`EXPLAIN`
  raises too** on an unscoped armed connection. Query-plan tooling will fail rather than return a
  plan.

---

## 5. Corrections to my own method, reported rather than hidden

1. **The plan's hard limit 3 is wrong.** It asserted a scratchpad `.cjs` run from `apps/web` would
   resolve `require('pg')`/`require('dotenv')`, "VERIFIED" with `node -e`. `require` in a CommonJS
   FILE resolves from the FILE's directory, never from `process.cwd()`; `node -e` resolves from cwd.
   The first run threw `MODULE_NOT_FOUND`. Fixed with explicit `require.resolve(m, { paths })` —
   still in the scratchpad, still installing nothing.
2. **The Supabase MCP `execute_sql` tool the plan named is not available in this session.** The
   production enumeration used the same read-only `pg` instrument as staging — one instrument across
   both databases, which is better evidence than two.
3. **My v1 source detector required the specifier `@/lib/db/prisma`** and so reported the entire
   `lib/auth/**` category as **zero files** — the single most important file in the brief imports
   `from '../db/prisma'`. The quick-607 class, hit by my own tooling.
4. **My v1 statement classifier produced three false-positive classes**, all corrected by reading the
   source: a `tx` from `adminDb.$transaction` is not the tenant connection (4 false blockers); a
   block calling `setTransactionTenantId` has a tenant context (21 false blockers across all five
   `lib/onboarding/*` files and `api/auth/login`); and a `set_config` raw statement touches no
   relation (3 false blockers in the tenant-acquisition helper itself).
5. **The orchestrator's "`ADMIN_ALLOWLIST` is 24 entries after 613" is wrong.** The file asserts 23 /
   48 and parsing its literal independently gives 23 / 48. quick-613 §6 says the entry count stays 23.

---

## 6. Artefacts

| file | what |
|---|---|
| `docs/audits/policy-or-shortcircuit.md` | the deliverable — 8 sections, 610 lines |
| `evidence/01-enumeration.md` + `01-enumeration-{prod,staging}.json` | both databases, full expressions, class counts, the ledger |
| `evidence/02-matrix.json` · `03-matrix-verbatim.md` | the 31-cell matrix, every cell verbatim |
| `evidence/04-explain.md` | EXPLAIN plans, the finding-F cells, the mechanism probe |
| `evidence/05-source-search.md` | the file-by-file trace, methods stated per count |
| `evidence/06-finding-f.json` · `07-mechanism.json` | raw probe output |
| `evidence/08-source-search.json` · `09-statements.json` | machine-readable source analysis |
| `evidence/10,11,12-*.txt` | run transcripts, `[db-target]` banners included |

**Commits:** `c9cc1ca8`, `3c0c8b36`, `51f683eb`. **Nothing pushed** — 3 ahead of `origin/master`.

---

## Self-Check: PASSED

Asserted individually, each by a command run after the final commit:

- **No file outside `docs/audits/policy-or-shortcircuit.md` and the GSD artefacts was created or
  modified.** `git status --porcelain` filtered to `apps/|scripts/|prisma/|packages/` returns **0**
  at every checkpoint; the final `git status --porcelain` is **empty**; the three commits touch only
  `docs/audits/policy-or-shortcircuit.md` and `.planning/quick/614-*`.
- **No write reached either database.** Every statement issued was a `SELECT` (catalog or table) or a
  `set_config`, inside `BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK`. A READ ONLY transaction turns
  any accidental write into `25006`; none occurred. The only mutation of any kind was a **session
  GUC on the probe's own connection**, which persists no row and dies with the connection.
- **The tripwire was not disarmed.** `TENANT_CONTEXT_TRIPWIRE=on` in `apps/web/.env.staging`;
  `git status --porcelain apps/web/.env.staging` returns **0 lines**; the probe read its armed
  session GUC back as `"on"` before every cell and reported both values.
- **No package was installed.** `git diff --stat package-lock.json package.json` is **0 lines**.
- **Nothing was pushed.** `git rev-list --count origin/master..master` = **3**.
- **The probe scripts live in the scratchpad.** `find . -name "614-policy-probe*"` outside
  `node_modules` returns **0**. All five scripts (`614-enumerate`, `614-recon`, `614-recon2`,
  `614-policy-probe`, `614-findingF`, `614-mechanism`, `614-source-search2`, `614-statements2`,
  `614-render`) are under the session scratchpad only.
- **Files asserted present on disk:** `docs/audits/policy-or-shortcircuit.md` and evidence `01`
  (md + 2 json), `02`, `03`, `04`, `05`, `06`, `07`, `08`, `09`, `10`, `11`, `12`.
- **Commits asserted present in `git log`:** `c9cc1ca8`, `3c0c8b36`, `51f683eb`.
- **Nothing found was fixed.** Twelve blocker files are named, not closed.
