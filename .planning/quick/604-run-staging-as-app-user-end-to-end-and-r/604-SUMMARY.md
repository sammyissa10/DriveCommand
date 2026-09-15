# quick-604 — Run staging as `app_user` end to end, and report everything that breaks

**2026-09-15 · MEASURE ONLY · nothing fixed**

**The deliverable is `docs/audits/staging-app-user-end-to-end.md`.** This summary points at it and
records the commits, the before/after test counts, and what the run proved stale.

---

## What was measured

A running Next server against the STAGING Supabase project (`wyixpgunnjmzguhggocz`) with
`DATABASE_URL` on the **`app_user`** role (`rolbypassrls = false`), the quick-602 tripwire **armed**,
and three real browser sessions obtained from the application's own `/api/auth/login`.

**41 entries, each with its own verdict, no summary row:** 26 named surfaces (OWNER ×21, DRIVER ×5),
14 cron routes enumerated from the directory, and `/api/warmup` labelled separately.
**pass 30 · fail 11 · not-reachable 0.**

Plus four write paths measured against a counter-read on a **separate privileged connection**.

**Production was read twice, read-only, and never written:** 156 `_prisma_migrations` rows, 183
`pg_policy` rows in `public`, head `20260914170000_activation_progress_congrats_shown_at` — identical
at open and at close, with both env files byte-identical by sha256.

---

## The classification

| category | count |
|---|---|
| `TRIPWIRE_TC001` | 7 |
| `MISSING_GRANT` | 2 |
| `RLS_DENIAL_SATISFIABLE` | 0 |
| `RLS_DENIAL_NO_POLICY` | 0 |
| `SOMETHING_ELSE` | 2 |
| **SUM** | **11** = the independently derived failure count |

**IN_456: 0 · IN_456_FILE_ONLY: 2 · OUTSIDE_456: 9.**

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
| `tsc --noEmit` (`apps/web`) | **0**, **probed twice** (TS2322 injected into `tripwire-arm.ts` and into `604-classify.ts`, each seen, each deleted, each followed by a clean re-run) |
| full `apps/web` vitest suite, same reporter, measured **after** the last code commit | **before 2047 / 64 failed / 18 failing files · after 2082 / 64 / 18** |
| delta | **+35 tests = exactly this task's own** (19 + 16). **0 newly failing, 0 newly passing.** Failing-file sets compared **by name in both directions** — identical. |
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

All five reverted and re-confirmed green.

---

## What is left running on staging

Staging is **armed and seeded** so the next task does not repeat the auth work: 2 tenants, 8 `User`
rows, **8 `auth.users` + 8 `auth.identities`**, 2 clients, 4 carrier drivers, 2 dispatches, 2 loads.
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
