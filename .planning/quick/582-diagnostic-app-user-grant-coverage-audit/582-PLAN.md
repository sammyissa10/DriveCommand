---
phase: quick-582
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/diagnostics/app-user-grant-coverage.md
  - CLAUDE.md
autonomous: true
executor: orchestrator            # NOT a gsd-executor subagent — needs Supabase MCP
must_haves:
  truths:
    - "The report names the CONNECTED role (current_user/session_user) explicitly, so a reader can tell whether class (c) tables were visible or invisible to the connection that produced it"
    - "The report states whether the app_user role exists and lists rolsuper/rolbypassrls/rolcanlogin for it"
    - "Every table in public carries a SELECT/INSERT/UPDATE/DELETE verdict for app_user, with missing-grant tables sorted first"
    - "Three grant counts (full CRUD / partial / zero) and three defect-class counts (a/b/c) are stated as numbers"
    - "Every sequence in public carries a USAGE verdict for app_user"
    - "The report states whether a newly created table would automatically grant to app_user (one-time fix vs ongoing defect)"
    - "Each silent-fallback site is reported with file, line, the table it reads, the fallback value, and which of the two shapes it is"
    - "Each silent-fallback site is cross-referenced to class (a)/(b)/(c) or explicitly to none"
    - "The report ends with a one-paragraph cutover assessment and names one highest-risk table"
    - "CLAUDE.md's DEC-17 entry states what apply_migration actually does, and no other CLAUDE.md entry is changed"
    - "No database object was granted, revoked, altered or created; no source file under apps/web/src was modified"
  artifacts:
    - path: "docs/diagnostics/app-user-grant-coverage.md"
      provides: "The full audit report — grant matrix, counts, defect classes, sequences, default privileges, silent-fallback inventory, cross-reference, DEC-17 diff, assessment"
      min_lines: 120
    - path: "CLAUDE.md"
      provides: "Corrected DEC-17 entry"
      contains: "DEC-17"
  key_links:
    - from: "docs/diagnostics/app-user-grant-coverage.md"
      to: "the class (a)/(b)/(c) tables"
      via: "the step-7 cross-reference table, one row per silent-fallback site"
      pattern: "class \\((a|b|c)\\)"
---

<objective>
Audit `app_user`'s grant coverage across the production database (Supabase project
`oqdhberkghtnszrkdvfm`) so the RLS Phase 2 cutover — flipping `DATABASE_URL` from the
postgres superuser to `app_user` — can be sized and sequenced. Today every missing grant is
invisible, because the app connects as an owner with BYPASSRLS.

Purpose: quick-581 §1.5 found `NotificationEmailConfig` has no `app_user` grant, which under
cutover makes `resolveSenderConfig` catch a permission error and **silently revert to env** —
the same shape quick-520 found on `route_matrix_cache`. Nobody knows how many tables are in
that state, nor how many code sites degrade quietly rather than failing loudly.

Output: `docs/diagnostics/app-user-grant-coverage.md`, plus a one-entry correction to
CLAUDE.md's DEC-17 (quick-581 §2.2 proved its second half false).

**This is a DIAGNOSTIC.** The only files written are the report, the DEC-17 entry, and these
planning docs.
</objective>

<execution_context>
**The orchestrator executes this plan directly. Do NOT dispatch a gsd-executor subagent** —
the work needs the Supabase MCP tools, which the executor does not have.

Treat the tasks below as an operator checklist. The SQL is given verbatim because the
correctness traps are in the SQL, not in the prose.
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/581-populate-notificationemailconfig-and-ver/581-SUMMARY.md
@apps/web/src/lib/email/sender-config.ts
@CLAUDE.md
</context>

<hard_constraints>
Violating any of these fails the task.

1. **Steps 1–7 are READ-ONLY.** No `GRANT`, `REVOKE`, `ALTER`, `CREATE`, `DROP`, `INSERT`,
   `UPDATE`, `DELETE`. Supabase MCP `apply_migration` must not be called at all. Use
   `execute_sql` only, and only with `SELECT`.
2. **Do not change `DATABASE_URL` or any env var**, and do not attempt to connect as
   `app_user` to "test" anything. The audit is answered from catalogue tables.
3. **Do not fix any silent-fallback site.** Not one line under `apps/web/src`,
   `apps/web/lib`, `apps/web/scripts`, `apps/mobile` or `packages`. `sender-config.ts` is
   evidence, not a work item.
4. **Step 8 rewrites the DEC-17 bullet in CLAUDE.md and nothing else.** No other bullet, no
   reflow of neighbours, no change to any script or migration behaviour.
5. **Supabase `execute_sql` returns ONLY the last statement's result set** (memory:
   `feedback_execute_sql_last_statement`). One `SELECT` per call. Never bundle a diagnostic
   query behind the query you actually want.
6. **If a query needs privileges the connection does not have, say so in the report** rather
   than working around it.
7. **Identifier discipline.** This database mixes PascalCase (older Prisma models, e.g.
   `"NotificationEmailConfig"`) and snake_case (carrier models, e.g. `carrier_documents`).
   Every query below joins `pg_class`/`pg_namespace` and never string-concatenates a name or
   casts a literal to `regclass`, so quoting cannot go wrong. Do not "simplify" one into a
   `'table_name'::regclass` — that is exactly what failed in quick-581 §1.1.
</hard_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Catalogue audit — role identity, grant matrix, RLS classes, sequences, default privileges (brief steps 0–5)</name>
  <files>scratchpad only — no repo file is written by this task</files>
  <action>
Run each query below as a separate `execute_sql` call against project
`oqdhberkghtnszrkdvfm`. Save every raw result set to the scratchpad
(`.../scratchpad/582-q{n}.json` or equivalent) — Task 2 formats them and must not re-run
them from memory.

**Q0a — the connected role. Run this FIRST and quote it verbatim in the report.**
An owner connection makes class (c) tables look healthy; the report is only interpretable
if the reader knows which role produced it.
```sql
SELECT current_user,
       session_user,
       current_database(),
       (SELECT rolsuper     FROM pg_roles WHERE rolname = current_user) AS conn_is_superuser,
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS conn_bypasses_rls;
```

**Q0b — does `app_user` exist, and what is it?**
A BYPASSRLS or superuser `app_user` invalidates every conclusion in the report — say so
loudly if that is what comes back. If `app_user` does NOT exist, stop the catalogue work,
record that finding, and skip to Task 2 reporting what was and was not knowable.
```sql
SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcanlogin, r.rolinherit,
       ARRAY(SELECT b.rolname
             FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid
             WHERE m.member = r.oid) AS member_of
FROM pg_roles r
WHERE r.rolname IN ('app_user','postgres','authenticator','anon','authenticated','service_role')
ORDER BY r.rolname;
```

**Q1 — the grant matrix (AUTHORITATIVE). Brief steps 1 + 3 in one pass.**
`has_table_privilege` is authoritative because it resolves grants reaching `app_user` by ANY
path — direct, via role membership, or via `PUBLIC` — and because it is not filtered by what
the *current* role happens to be able to see (which is exactly the blind spot in
`information_schema.role_table_grants`). RLS flags are read from `pg_class`, policy counts
from `pg_policy`. `relkind IN ('r','p')` covers ordinary and partitioned tables.
```sql
SELECT c.relname AS table_name,
       c.relkind,
       has_table_privilege('app_user', c.oid, 'SELECT') AS sel,
       has_table_privilege('app_user', c.oid, 'INSERT') AS ins,
       has_table_privilege('app_user', c.oid, 'UPDATE') AS upd,
       has_table_privilege('app_user', c.oid, 'DELETE') AS del,
       (has_table_privilege('app_user', c.oid, 'SELECT')::int
      + has_table_privilege('app_user', c.oid, 'INSERT')::int
      + has_table_privilege('app_user', c.oid, 'UPDATE')::int
      + has_table_privilege('app_user', c.oid, 'DELETE')::int) AS grant_count,
       c.relrowsecurity      AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
ORDER BY grant_count ASC, c.relname ASC;
```

**Q2 — reconciliation: where does a `true` actually come from?**
`has_table_privilege` cannot distinguish a direct grant from one inherited via `PUBLIC` or
role membership, and a grant that only exists via `PUBLIC` is a different (and more fragile)
fact. This lists the explicit ACL entries.
```sql
SELECT c.relname AS table_name,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
       string_agg(acl.privilege_type, ',' ORDER BY acl.privilege_type) AS privs
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND (acl.grantee = 0 OR pg_get_userbyid(acl.grantee) = 'app_user')
GROUP BY 1, 2
ORDER BY 1, 2;
```

**Q3 — the cross-check the brief named, run for reconciliation only, NOT as the source.**
Report any disagreement with Q1 and state that Q1 wins.
```sql
SELECT table_name,
       string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'app_user'
GROUP BY table_name
ORDER BY table_name;
```

**Q4 — sequences (brief step 4).** A missing sequence grant fails inserts on tables whose
table grants look correct, so this is reported even where Q1 is clean. The `owning_table`
column is what makes a bare sequence name actionable.
```sql
SELECT c.relname AS sequence_name,
       has_sequence_privilege('app_user', c.oid, 'USAGE')  AS usage_priv,
       has_sequence_privilege('app_user', c.oid, 'SELECT') AS select_priv,
       has_sequence_privilege('app_user', c.oid, 'UPDATE') AS update_priv,
       (SELECT t.relname
        FROM pg_depend d
        JOIN pg_class t ON t.oid = d.refobjid
        WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass
          AND d.deptype IN ('a','i')
        LIMIT 1) AS owning_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'S'
ORDER BY usage_priv ASC, c.relname ASC;
```
If this returns zero rows, say so explicitly — a Prisma schema on `uuid`/`gen_random_uuid()`
primary keys legitimately has no sequences, and "no sequences" is a materially different
finding from "no sequence grants".

**Q5 — default privileges (brief step 5). This is the one-time-vs-ongoing question.**
```sql
SELECT pg_get_userbyid(d.defaclrole) AS granting_role,
       COALESCE(n.nspname, '<ALL SCHEMAS>') AS schema_name,
       CASE d.defaclobjtype WHEN 'r' THEN 'table' WHEN 'S' THEN 'sequence'
                            WHEN 'f' THEN 'function' WHEN 'T' THEN 'type'
                            WHEN 'n' THEN 'schema' ELSE d.defaclobjtype::text END AS obj_type,
       d.defaclacl::text AS default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY 1, 2, 3;
```
Interpretation to record: if no row grants to `app_user` for `table` in `public`, then **every
new table created from now on acquires this defect by default** and the fix is ongoing, not
one-time. Also record whether `anon`/`authenticated`/`service_role` DO appear — the contrast
is the evidence that default privileges are configured here at all and `app_user` was simply
left out.

**Derivation (no further queries — compute from Q1):**
- Step 2 counts: `full = grant_count 4`, `partial = grant_count 1..3`, `zero = grant_count 0`.
- Class (a): `grant_count < 4`.
- Class (b): `rls_forced AND policy_count = 0`. `carrier_documents` is the known instance —
  if it is absent from your (b) list, your query is wrong, not the database.
- Class (c): `rls_enabled AND NOT rls_forced AND policy_count = 0`. `_prisma_migrations` is
  the known instance (quick-581 §7) — same check.
- Compute (b) and (c) over **all** tables, not only the partial-grant ones. A table can be in
  more than one class; list it in each. Where a (b)/(c) table has full CRUD grants, note that
  explicitly — a grant does not rescue a policy-less FORCE.

Sanity-check two named rows by hand and quote them in the report:
`"NotificationEmailConfig"` (expect: no `app_user` grant, per quick-581 §1.5) and
`route_matrix_cache` (expect: RLS on, no `app_user` grant, per quick-520).
  </action>
  <verify>
Q0a, Q0b, Q1, Q2, Q3, Q4, Q5 have each returned a result set (or an explicit, recorded
error). Q1's row count equals the number of tables in `public`. `carrier_documents` appears
in the derived class (b) list and `_prisma_migrations` in class (c). No statement executed
was anything other than `SELECT`.
  </verify>
  <done>
Seven raw result sets saved to the scratchpad; the three grant counts and three defect-class
counts derived; the connected role and `app_user`'s attributes recorded verbatim.
  </done>
</task>

<task type="auto">
  <name>Task 2: Silent-fallback inventory, cross-reference, and write the report (brief steps 6, 7 + Output)</name>
  <files>docs/diagnostics/app-user-grant-coverage.md</files>
  <action>
**Part A — grep-driven inventory (step 6).**

Two shapes count as the same defect, and the second is the one that is easy to miss:
- **Shape 1 — caught exception falls back.** A permission error on a class (a) table.
  Anchor instance: `apps/web/src/lib/email/sender-config.ts:158-167` → falls back to
  `resolveFromEnv()`, `source: 'env'`.
- **Shape 2 — empty result treated as a legitimate empty.** A class (c) table does **not**
  throw; it returns zero rows to a non-owner, so the site never enters a catch block at all.
  Anchor instance: quick-520's `route_matrix_cache` (`apps/web/src/lib/document-import/
  optimisation-matrix.ts` / `optimisation-service.ts`) → an L2 miss, degrading silently to a
  provider call.

Search roots: `apps/web/src`, `apps/web/lib`, `apps/web/scripts`, `packages/`. (`apps/mobile`
does not hold a database connection — state that you checked and why it is excluded.)

Run at least these, and record the exact command and hit count for each so coverage is
auditable:
```
rg -n --glob '!**/__tests__/**' --glob '!**/*.test.ts' -U --multiline \
   'catch\s*\([^)]*\)\s*\{[\s\S]{0,500}?return\s+(\[\]|null|undefined|\{\}|false|0|env)' \
   apps/web/src apps/web/lib packages
rg -n '\.catch\(\s*\(\s*\)\s*=>' apps/web/src apps/web/lib packages
rg -n 'catch' -A 6 apps/web/src/lib | rg -n 'FALLBACK|process\.env|default|\?\?|\|\|'
rg -n 'await (prisma|tx|db)\.[A-Za-z]+\.(findFirst|findUnique|findMany|count|aggregate)' -A 4 \
   apps/web/src | rg -n '\?\?|\|\|\s*(\[\]|0|null|FALLBACK)|if \(!'
rg -n '\$queryRaw|\$queryRawUnsafe' -A 6 apps/web/src apps/web/lib
rg -n 'length === 0|\.length\s*\?|isEmpty|rows\[0\] \?\?' apps/web/src/lib
```
Add any further passes you judge necessary and record them too. Then triage the raw hits: a
site only qualifies if the fallback masks a **database read**. Discard pure input-validation
and network-fetch catches, and say how many you discarded and on what rule.

For every qualifying site record: `file:line` · the table/model read · the shape (1 or 2) ·
the exact fallback value · what a user or operator would observe (which is the part that
makes it a defect rather than a design choice).

**Do NOT fix any of them.** Not even an added comment.

**Part B — cross-reference (step 7).**
Map each site's Prisma model to its physical table name before looking it up: a model with no
`@@map` in `apps/web/prisma/schema.prisma` is **PascalCase quoted** (quick-581 §1.1), carrier
models are snake_case. Then mark each site class (a) / (b) / (c) / none, using Task 1's lists.
Sites landing in (a) or (c) are the ones that **degrade silently on cutover day rather than
failing loudly** — call that subset out as its own list, because it is the operative output of
the whole report.

**Part C — write `docs/diagnostics/app-user-grant-coverage.md`.**
The directory exists (it holds `email-rendering-inventory.md`); match that file's register.
Required sections, in order:

1. **Connected role** — Q0a verbatim, plus the one-line consequence: an owner connection is
   exactly what makes class (c) tables look healthy, so this report can see defects the
   application currently cannot.
2. **The `app_user` role** — Q0b. State plainly whether it exists and whether it is superuser
   or BYPASSRLS.
3. **Grant matrix** — the full Q1 table, missing-grant tables first. Then the Q2/Q3
   reconciliation, naming Q1 as authoritative and explaining in one sentence why
   (`information_schema.role_table_grants` shows only grants the current role can see and
   misses grants reaching `app_user` through role membership or `PUBLIC`).
4. **Counts** — full CRUD / partial / zero.
5. **Defect classes** — (a), (b), (c) with a count and a table list each, and a note on any
   table appearing in more than one.
6. **Sequences** — Q4, or an explicit "there are no sequences in `public`" with the
   consequence stated.
7. **Default privileges** — Q5, ending with a plain verdict: one-time fix or ongoing defect.
8. **Silent-fallback inventory** — the commands run, the hit/discard counts, then the table of
   qualifying sites with file:line and fallback value.
9. **Cross-reference** — per-site class, then the "will degrade silently on cutover" subset.
10. **DEC-17 diff** — the before and after text of the CLAUDE.md bullet (fill this in after
    Task 3, or write Task 3 first and paste; either order, but the report must contain it).
11. **Assessment** — one paragraph: is the cutover a single migration or a multi-session
    effort, and why — grounded in the counts, in whether default privileges make it ongoing,
    and in the number of silent-degradation sites. Name the **single highest-risk table** and
    justify the choice in one sentence.

Anything the connection could not determine goes in the report as a stated limit, never as an
omission.
  </action>
  <verify>
`docs/diagnostics/app-user-grant-coverage.md` exists with all eleven sections. Every
silent-fallback row carries a `file:line`. Both anchor instances (`sender-config.ts`,
`route_matrix_cache`) appear in the inventory. `git status` shows **no** modified file under
`apps/web/src`, `apps/web/lib`, `apps/web/scripts`, `apps/mobile` or `packages`.
  </verify>
  <done>
The report is written, the counts are numbers rather than adjectives, the cutover subset is a
named list, and the assessment names one table.
  </done>
</task>

<task type="auto">
  <name>Task 3: Correct the DEC-17 entry in CLAUDE.md (brief step 8) and commit</name>
  <files>CLAUDE.md</files>
  <action>
Edit exactly one bullet — the line beginning `- **DEC-17 —` (currently at CLAUDE.md:398).
Touch no other line in the file.

What is wrong: it claims *"`execute_sql` applies DDL but does NOT write the
`_prisma_migrations` row; `apply_migration` does both."* quick-581 §2.2 disproved the second
half — after a successful `apply_migration`, the newest `_prisma_migrations` row was still
Phase 10's. `apply_migration` writes **Supabase's own migration ledger, a different table**.

The rewritten entry must state, in the file's existing voice:
- What actually happens: **neither** `execute_sql` nor `apply_migration` writes
  `_prisma_migrations`. `apply_migration` records into Supabase's ledger only. The Prisma row
  must still be written by hand as a resolved-not-run entry.
- Keep the procedural rule that caught it, unchanged in force: **"the columns are live" is
  evidence of the half that was never in doubt — query `_prisma_migrations` and read the
  newest row back.**
- Keep the resolved-row convention: real SHA-256 of `migration.sql` over **LF** bytes,
  `logs=''`, `started_at = finished_at`, **`applied_steps_count = 0`** — the signature that
  distinguishes a mirrored row from one `migrate.mjs` executed, which writes `1`. quick-581
  confirmed this holds across all 140 rows (19 count-0 rows, all SHA-256, none `'manual'`).
- Consequence 1: **a seed `INSERT` applied without a mirrored row will re-run and duplicate.**
  Phase 10 escaped only because its SQL was entirely `IF NOT EXISTS`; quick-581's `INSERT` is
  exactly the shape that duplicates, and its `WHERE NOT EXISTS` is a second line of defence,
  not the mechanism.
- Consequence 2: **`_prisma_migrations` is itself a class (c) table** — RLS enabled, zero
  policies, never FORCED (migration `20260328000001_enable_rls_prisma_migrations_and_tenant`).
  The owner bypasses it; any non-owner role gets **zero rows with no error**, which is
  indistinguishable from "the row was never written" — and that reading prompts a duplicate
  write. So before believing an empty read-back, confirm the read is sighted: check
  `current_user` and that a known sentinel row is visible.
- Reference `quick-581 §2.2` and `§7`, and `docs/diagnostics/app-user-grant-coverage.md` for
  the class-(c) definition.

Keep it one bullet. Then commit:
```
git add CLAUDE.md docs/diagnostics/app-user-grant-coverage.md .planning/quick/582-diagnostic-app-user-grant-coverage-audit
git commit -m "docs(quick-582): app_user grant coverage audit + DEC-17 correction"
```
Do NOT push — the user pushes (memory: `feedback_git_push`).
  </action>
  <verify>
`git diff HEAD~1 -- CLAUDE.md` touches exactly one bullet, the DEC-17 line. The new text
contains no claim that `apply_migration` writes `_prisma_migrations`. `git status` is clean
apart from the intended files, and shows nothing under `apps/`.
  </verify>
  <done>
DEC-17 states what actually happens, keeps the read-back rule and the resolved-row
convention, and names both consequences. One commit, no push, no source file touched.
  </done>
</task>

</tasks>

<verification>
- `git status --short` lists only: `docs/diagnostics/app-user-grant-coverage.md`, `CLAUDE.md`,
  and `.planning/quick/582-.../`. Nothing under `apps/` or `packages/`.
- No Supabase MCP `apply_migration` call was made; every `execute_sql` call was a single
  `SELECT`.
- The report's connected-role section is present and is the first thing in the file — without
  it, a reader cannot tell whether class (c) tables were visible.
- Q1's authority over Q3 is stated, not assumed.
</verification>

<success_criteria>
- Every table and every sequence in `public` has an `app_user` verdict.
- Six numbers are stated: full/partial/zero grants, and class (a)/(b)/(c) counts.
- The default-privilege finding resolves to "one-time" or "ongoing" in words.
- Every silent-fallback site has file:line, fallback value, and a class verdict.
- The cutover-degradation subset is a named list, not a description.
- One paragraph of assessment, one named highest-risk table.
- DEC-17 corrected; no other CLAUDE.md entry changed; no source-file fix attempted.
</success_criteria>

<output>
After completion, create
`.planning/quick/582-diagnostic-app-user-grant-coverage-audit/582-SUMMARY.md`.

It must record: the connected role, the six counts, the highest-risk table, anything the
connection could not determine, and any finding worth promoting into CLAUDE.md beyond the
DEC-17 correction (e.g. if class (b) or (c) turns out to be large, that is a rule, not a
report line).
</output>
