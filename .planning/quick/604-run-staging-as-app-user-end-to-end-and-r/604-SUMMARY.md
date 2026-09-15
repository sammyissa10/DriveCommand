# quick-604 — Run staging as `app_user` end to end, and report everything that breaks

**2026-09-15 · MEASURE ONLY · nothing fixed**

**The deliverable is `docs/audits/staging-app-user-end-to-end.md`.** This summary points at it and
records the commits, the before/after test counts, and what the run proved stale.

---

## What was measured

A running Next server against the STAGING Supabase project (`wyixpgunnjmzguhggocz`) with
`DATABASE_URL` on the **`app_user`** role (`rolbypassrls = false`), the quick-602 tripwire **armed**,
and three real browser sessions obtained from the application's own `/api/auth/login`.

**66 entries, each with its own verdict, no summary row — TWO sweeps:**

- **Pass 1 (41 rows)** — 26 named surfaces (OWNER ×21, DRIVER ×5), 14 cron routes enumerated from the
  directory, `/api/warmup` labelled separately.
- **Pass 2 (25 rows), added after review** — the brief-named surfaces pass 1 had substituted away:
  Settlements, Driver Pay, Reports, Checklists, Workflows, Automations, Notifications, the whole
  SysAdmin portal, the public tracking page, Signup, Onboarding. Same harness, same server env, same
  pass criterion, same evidence shape.

**pass 47 · fail 13 · not-reachable 6.** `not-reachable` is a verdict, never a merge into pass or
fail, and every one of the six carries a stated reason.

Plus four write paths measured against a counter-read on a **separate privileged connection**.

**Production was read twice, read-only, and never written:** 156 `_prisma_migrations` rows, 183
`pg_policy` rows in `public`, head `20260914170000_activation_progress_congrats_shown_at` — identical
at open and at close, with both env files byte-identical by sha256.

---

## The classification

Re-derived over the **merged** artefact, not patched.

| category | pass 1 only | both passes |
|---|---|---|
| `TRIPWIRE_TC001` | 7 | **7** |
| `MISSING_GRANT` | 2 | **2** |
| `RLS_DENIAL_SATISFIABLE` | 0 | **0** |
| `RLS_DENIAL_NO_POLICY` | 0 | **0** |
| `SOMETHING_ELSE` | 2 | **4** |
| **SUM** | 11 | **13** = the independently derived failure count |

**IN_456: 0 · IN_456_FILE_ONLY: 2 · OUTSIDE_456: 11.**

## The headline findings

1. **`/carrier/trips` — the trips list page issues a tenant-scoped read on the BARE Prisma client**
   (`prisma.carrierDriver.findMany({ where: { orgId } })`, `page.tsx:19`). No `getTenantPrisma`, no
   bypass flag, no marker. **OUTSIDE_456** — the countdown knows `[id]/page.tsx`, `[id]/stops` and
   `new`, but not the list page. The `generateVehicleIds` shape, on one of the portal's busiest
   screens. It is the only named surface of 26 that cannot run as `app_user`.
2. **`withTenantRLS` is a third tenant mechanism and it does not satisfy the tripwire.** Three digest
   cron routes do `prisma.$extends(withTenantRLS(tenant.id))` and all three raise `TC001`. The AST
   countdown counts it as neither migrated nor unmigrated; all three files are outside the 456.
3. **`carrier-compliance-alerts` asks a runtime connection to run DDL** —
   `42501 permission denied for schema public` from a `$executeRawUnsafe` that creates its own log
   table. No policy change can fix that.
4. **`workflow-notifications` has no `app_user` grant on `PlaybookNotification`** — `42501`.
5. **`Document` schema drift is five columns wider than `staging-environment.md` §2 recorded.**
   `expiryDate`, `externalUrl`, `loadId`, `notes`, `description` all exist on **production** and in
   `schema.prisma` and are **absent from staging**, with both databases on the same 156 ledger rows.
   `expiryDate` and `externalUrl` appear in **zero** migration files. The driver documents page orders
   by `expiryDate` and 500s.
6. **No `SILENT_NO_OP`, and path 4 is why that matters.** `/settings/operations` →
   `Tenant.update` is `policy-satisfiability-sweep.md` §5.2 row 1, the statement quick-599's
   `tenant_self_update` was created to admit. **WROTE**, end to end through the real screen.
7. **quick-603's failure reporting works, measured.** Five cron routes that quick-602 saw return 200
   while raising now return 500 with the raise visible. The failures did not appear; the reporting
   did.
8. **Two live owner pages 500 on RENDER, for a reason no connection role can affect** — `NuqsAdapter`
   is mounted in **exactly one layout in the repo**, `(dev)/layout.tsx`, so
   `/carrier/driver-pay/settlements` and `/checklists/automation` both throw at
   `src/components/data-grid/core/useGridUrlState.ts:43`. **`OUTSIDE_456`**, found by pass 2, and the
   clearest argument for pass 2 existing: pass 1 never visited those screens.
9. **The whole SysAdmin portal runs clean as `app_user`** — six routes, all `pass`, with a real
   `isSystemAdmin` session. It had never been exercised at all.
10. **`/track/[token]` is UNMEASURED, not clean.** The legacy `"Load"` table is empty on staging —
    `seed-staging.ts` populates the *carrier* `loads` table — so no `trackingToken` exists to drive
    it. The page does `prisma.load.findUnique({ where: { trackingToken } })` on the **bare** client
    with no tenant context, which is exactly the finding shape above; it is the most likely remaining
    `OUTSIDE_456` site.

---

## Corrections to prior audits, made in place and dated

- **`staging-environment.md` §9 — "closing the auth gap needs the staging service-role key" is
  FALSE.** It needs the **anon** key plus direct `auth.users` + `auth.identities` rows. Four real
  logins proven at HTTP 200 with correct `app_metadata`. `scripts/seed-staging-auth.ts` is the recipe.
  The eight-NULL-token GoTrue gotcha is written up so nobody spends three attempts on it again.
- **`staging-environment.md` §8 — `.env.staging` now exists and is complete**, and carries a fifth
  key the planned table never anticipated (`STAGING_DATABASE_URL_ADMIN`).
- **`staging-environment.md` §2 — the `Document` drift is five columns wider.**

## Corrections to this task's own plan, recorded rather than reconciled

- **The plan's worked example for the arming gate's red run is wrong.** Inverting to a negative gate
  does **not** break the production-shaped case — refusing the production ref is a negative gate's
  entire content. The row that catches it is `UNRECOGNISED ref + flag "on"`, and that row exists for
  no other reason.
- **Staging's `_prisma_migrations` cannot be read as `app_user` at all** — `42501 permission denied`.
  The plan's expected 156 was measured on the privileged string.

## Two instrument bugs caught and recorded rather than buried

- **A false `SILENT_NO_OP`.** Run 1 reported the clients DELETE as silently doing nothing. The
  endpoint **soft** deletes (`status → 'inactive'`); the counter-read was watching `deleted_at`. A
  false `SILENT_NO_OP` poisons the report exactly as badly as a missed one. Rule: the counter-read
  watches the field the endpoint claims to change, read off the handler.
- **A whole run thrown away.** Pass 1 ran with `DATABASE_URL_ADMIN` unset, so six cron routes failed
  `ECONNREFUSED` in the admin pool — failures of the shell, not the application. The variable was set
  to staging's `app_admin` string and everything re-run. The discarded log is committed as
  `evidence/04-server-run1-no-admin-url.log`. Also corrected: the SQLSTATE recogniser matched
  `[0-9A-Z]{5}` unanchored and recovered `ECONN` out of `ECONNREFUSED`.

---

## Gates

| gate | result |
|---|---|
| `tsc --noEmit` (`apps/web`) | **0**, **probed three times** (TS2322 injected into `tripwire-arm.ts`, `604-classify.ts` and `604-click-through.ts` — each seen at the injected line, each deleted, each followed by a clean re-run) |
| full `apps/web` vitest suite, same reporter, measured **after** the last code commit | **before 2047 / 64 failed / 18 failing files · after 2086 / 64 / 18** |
| delta | **+39 tests = exactly this task's own** (19 in `tripwire-arming-gate.test.ts` + 20 in `604-report-integrity.test.ts`, the latter grown from 16 by pass 2's check-5 block). **0 newly failing, 0 newly passing.** Failing-file sets compared **by name in both directions** — empty difference both ways. |
| `npx eslint` | **NOT RUN, NOT CLAIMED** — `apps/web` has no working lint entry point (quick-562) |

The BEFORE figure was taken in the **main tree** (remove this task's three new files, check
`prisma.ts` and `wrapper-countdown.json` out at `afd1c7c5`), never in a `git worktree`, which does not
carry the untracked `.env.local` and therefore measures a different tree (quick-567).

**`rls-policy-replay.test.ts` fails before and after** (`expected 434 to be 403`) and this task
touched **zero** of its inputs — `git diff --name-only afd1c7c5..HEAD` over `prisma/migrations`,
`rls-policy-canonical.json` and the test itself returns nothing. **Reported, not fixed.**

**`wrapper-countdown.json` was regenerated.** One new file in `src` moved `filesScanned` 1690 → 1691.
The whole diff is that number and the timestamp; all four protected counts are byte-identical
(456 / 459 / 0 / 202). Inspected before committing, per quick-603's rule.

---

## Anti-vacuity — every guard was seen RED first

| guard | red run |
|---|---|
| `604-survey.ts`'s production-ref refusal | fired on a production-shaped string **and** on an unrecognised ref, before opening a connection, exit 1 |
| `tripwire-arming-gate.test.ts` | gate inverted to a negative — `× UNRECOGNISED ref + flag "on"`, `AssertionError: expected true to be false`, 2 failed / 14 passed |
| `604-report-integrity.test.ts` check 2 | one category count decremented — `expected 10 to be 11` |
| `604-report-integrity.test.ts` check 3 | one `OUTSIDE_456` `file` blanked — `expected 0 to be greater than 0` |
| `604-report-integrity.test.ts` check 4 | `OWNER_SURFACES` truncated — `expected 6 to be greater than or equal to 25` |
| `604-report-integrity.test.ts` check 5 (pass 2) | every `pass2:SysAdmin` row dropped — `expected 19 to be 25`, `to include 'SysAdmin'`, and the SYSADMIN-session assertion, 3 failed |
| `604-report-integrity.test.ts` check 5 (pass 2) | one `not-reachable` reason blanked — `expected 0 to be greater than 0` |

All seven reverted and re-confirmed green.

---

## What is left running on staging

Staging is **armed and seeded** so the next task does not repeat the auth work: 2 tenants, **9
`User` rows** (8 from `seed-staging.ts` + the pass-2 SYSADMIN), **9 `auth.users` + 9
`auth.identities`**, 2 clients, 4 carrier drivers, 2 dispatches, 2 loads. The sysadmin is
`sysadmin@staging.test`, `User.isSystemAdmin = true`, `app_metadata.isSystemAdmin = true`, on the
same `STAGING_SEED_PASSWORD`.
No probe rows survive (asserted 0). `seed-staging-auth.ts --teardown` exists and asserts
`auth.users` = 0; it was **not** run.

Costs, named in §9 of the report:

- **Migrations cannot be applied to staging as `app_user`** — `_prisma_migrations` has RLS on, zero
  policies and no `app_user` grant, confirmed directly. `STAGING_DIRECT_URL` must stay on `postgres`,
  and `migrate.mjs`, `npm start`, `prisma db push`, `seed-starter-playbooks.ts`, `seed-staging.ts` and
  `seed-staging-auth.ts` all need the privileged string.
- **`DATABASE_URL_ADMIN` must be exported** when the server runs against staging, or six cron routes
  fail `ECONNREFUSED` in a way that reads like an application defect.
- **`apps/web/.env.staging` is gitignored and is the only place these values live**, so a fresh
  machine cannot reproduce this run without a human re-minting the credentials. The pooled `:6543`
  strings are **not reachable from this machine**; every instrument repoints to `:5432`.

---

## Commits

| hash | message |
|---|---|
| `da4697c7` | `chore(604-01)` open the ledger — production 156/183 read-only, staging `app_user` preconditions |
| `8b0105ce` | `feat(604-02)` positive ref-matching tripwire arming gate, proven inert on production |
| `15899a17` | `feat(604-03)` seed staging and prove a real login — the service-role key is not needed |
| `f9c81a38` | `test(604-04)` 41 surfaces over real HTTP as `app_user` with the tripwire armed |
| `328cae2c` | `test(604-05)` four write paths measured against a privileged counter-read |
| `513bbbf1` | `test(604-06)` classify all 11 failures and attribute each inside or outside the 456 |
| `af653c9a` | `docs(604-06)` restore the witnessed-RED section the classifier rerun overwrote |
| `a3fc1dbb` | `docs(604-07)` the failure list, the production close, and the doc corrections |
| `573b3cb4` | `chore(604-07)` re-run `--close` after the last commit |
| `cacd7c66` | `test(604-08)` **pass 2** — the 25 brief-named surfaces pass 1 substituted away |

## Files

- **Report:** `docs/audits/staging-app-user-end-to-end.md`
- **Evidence:** `.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/`
  (`01-open`, `02-arming-gate`, `03-seed`, `04-click-through` + `04-server.log` +
  `04-server-run1-no-admin-url.log` + `04-pgstat`, `05-writes`, `06-classification`, `07-close`)
- **Code:** `apps/web/src/lib/db/tripwire-arm.ts`, `apps/web/src/lib/db/prisma.ts` (18 lines),
  `apps/web/scripts/seed-staging-auth.ts`, `apps/web/scripts/audit/604-survey.ts`,
  `apps/web/scripts/audit/604-click-through.ts`, `apps/web/scripts/audit/604-classify.ts`
- **Tests:** `apps/web/tests/security/tripwire-arming-gate.test.ts`,
  `apps/web/tests/security/604-report-integrity.test.ts`

**No policy. No grant. No migration. No `getAdminDb` routing. No migrated call site.**

---

## Pass 2 — what it was, and why the first sweep was short

Pass 1 shipped 26 named surfaces, **but not the 26 the brief named**: `/crm`, `/compliance`,
`/support` and `/routes` were substituted in, and **ten brief-named surfaces had no verdict
anywhere** — not even in §8's unmeasured list. That is an omission, not a judgement, and it was
caught in review rather than by this executor. Pass 2 closes it with **25 rows**.

Unchanged: the harness, the server environment, the pass criterion (2xx/3xx **and** no `TC001` in the
correlated log window), the evidence shape, the triple guard. Staging was still armed and still
seeded, so the §3 auth work was not repeated.

### The one new fixture, and the three facts it needed

`(admin)/layout.tsx` gates on `isSystemAdmin()`, which reads `app_metadata.isSystemAdmin` off the
JWT. No seeded OWNER carries it, so without a sysadmin the whole SysAdmin portal would have been six
redirects to `/sign-in` — a whole portal with no verdict, which is the weakest thing this report could
contain. `seed-staging-auth.ts --seed-sysadmin` creates one, and each of these produces a login that
succeeds beside a portal that still redirects, which reads like an application defect and is not one:

- **`UserRole` in the database has no `SYSTEM_ADMIN` member** (`OWNER | MANAGER | DRIVER`), even
  though `lib/auth/roles.ts` declares one. A sysadmin is a row carrying `isSystemAdmin = true`, a
  separate boolean column, **not a role**.
- **`User.tenantId` is NOT NULL**, so a sysadmin still belongs to a tenant.
- **`User.updatedAt` is Prisma's `@updatedAt` — application-side**, so the column carries no database
  default and a raw `INSERT` that omits it is a `23502`. (It was, on the first attempt.)

`--seed-sysadmin` asserts `app_metadata.isSystemAdmin === true` **and** `jwt.sub === User.id`, and
exits 1 otherwise.

### The new finding

**Two live owner pages 500 on render, and no connection role can affect it.** `NuqsAdapter` is
mounted in **exactly one layout in the repo** — `src/app/(dev)/layout.tsx` — so any page outside the
`(dev)` route group that renders a `useDataGrid` table with URL state enabled throws
`[nuqs] nuqs requires an adapter` at `src/components/data-grid/core/useGridUrlState.ts:43`.
`/carrier/driver-pay/settlements` and `/checklists/automation` both do. **`OUTSIDE_456`**, category
`SOMETHING_ELSE`, `SQLSTATE_UNRECOVERED` — correctly, since no statement was refused. **Reported, not
fixed.**

### Three `not-reachable` verdicts, each with a stated reason

- **`/track/[token]`** — public, needs no session, but needs a real `Load.trackingToken`. **The
  legacy `"Load"` table holds zero rows on staging**: `seed-staging.ts` populates the *carrier*
  `loads` table, a different model. Nothing to hand the page, so it 404s by design. It stays
  **unmeasured, not clean** — the page does `prisma.load.findUnique({ where: { trackingToken } })` on
  the bare client with no tenant context.
- **`/carrier/driver-pay`, `/carrier/reports`, `/checklists/playbooks`, `/checklists/instances`** —
  **no index page**; each directory holds only children. A 404 cannot tell "no such route" from "no
  index page", so the reasons are a committed constant on each list entry, checked with `ls` before
  the list was written. `/checklists/instances` has a second reason: staging carries **zero
  `PlaybookInstance` rows**, so there is no `[id]` to substitute.
- **`/onboarding`** — 307 to `/carrier/dashboard`; the seeded tenant is past the gate.

**`/sign-up` renders (200) and is a `pass` for the page.** The signup **flow** cannot complete on
staging at all (`mailer_autoconfirm: false`, mailer 429s after ~3 sends) — the same fact the §3 auth
unlock exists to work around. Page and flow are two claims and only the first is measured.

### One harness property worth keeping

**`--surfaces2` is idempotent**: it drops every existing `pass2:` row before appending. A sweep that
silently duplicates rows inflates every downstream count while every assertion still passes — the
quietest way this report could have become wrong. It was re-run once to prove it: identical 25 rows,
merged total still 66.

### Everything downstream was re-derived, not patched

The entry count, the pass/fail/not-reachable totals, §6's five category counts, the `13 === 13`
arithmetic check and the IN_456 / IN_456_FILE_ONLY / OUTSIDE_456 attribution all come from
`604-classify.ts` run over the merged artefact. `04-click-through.md` was regenerated. The report's
§4 table row count is asserted equal to the JSON's entry count: **66 === 66**.

**Production re-read at close after pass 2:** 156 / 183 / `20260914170000_…`, both env-file sha256
byte-identical. Guard 2 took four more `pg_stat_activity` readings across the two pass-2 runs —
**production `app_user` = 0 at every one.**
