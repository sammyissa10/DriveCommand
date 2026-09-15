---
task: quick-604
title: Run staging as `app_user` end to end, and report everything that breaks
type: execute
wave: 1
depends_on: []
mode: MEASURE ONLY
autonomous: true
files_modified:
  - apps/web/src/lib/db/tripwire-arm.ts
  - apps/web/src/lib/db/prisma.ts
  - apps/web/scripts/seed-staging-auth.ts
  - apps/web/scripts/audit/604-survey.ts
  - apps/web/scripts/audit/604-click-through.ts
  - apps/web/scripts/audit/604-classify.ts
  - apps/web/tests/security/tripwire-arming-gate.test.ts
  - apps/web/tests/security/604-report-integrity.test.ts
  - docs/audits/staging-app-user-end-to-end.md
  - .planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/

must_haves:
  truths:
    - "Every one of the >=25 named surfaces and all 14 cron routes appears in the report with its OWN verdict line — pass / fail / not-reachable — never a summary row."
    - "Every failure carries exactly one of the five categories, and the category counts SUM to the failure count, asserted arithmetically by a committed test."
    - "Every failure is attributed IN_456 or OUTSIDE_456 by a lookup in wrapper-countdown.json, and every OUTSIDE_456 entry names a file and a line."
    - "At least one write path is reported as WROTE vs SILENT_NO_OP vs REFUSED, distinguished by a counter-read taken on a SEPARATE privileged connection."
    - "The arming code is proven inert against a production-shaped connection string, by a test that was first proven RED."
    - "Production's `_prisma_migrations` is 156 rows and `pg_policy` in public is 183 at OPEN and at CLOSE, and the production `DATABASE_URL` is byte-identical across the task."
    - "Staging is left armed, and the workflows that now need the privileged string are named."
  artifacts:
    - path: "docs/audits/staging-app-user-end-to-end.md"
      provides: "The deliverable — the failure list, house style"
      contains: "OUTSIDE_456"
    - path: "apps/web/src/lib/db/tripwire-arm.ts"
      provides: "The positive, ref-matching arming gate as a pure function"
      exports: ["shouldArmTripwire"]
    - path: "apps/web/scripts/seed-staging-auth.ts"
      provides: "auth.users + auth.identities seeder with production-ref refusal and teardown"
    - path: "apps/web/scripts/audit/604-click-through.ts"
      provides: "The HTTP click-through over a real session cookie"
    - path: "apps/web/scripts/audit/604-classify.ts"
      provides: "Classification + 456-membership attribution"
    - path: "apps/web/tests/security/tripwire-arming-gate.test.ts"
      provides: "Both directions of the arming gate"
    - path: "apps/web/tests/security/604-report-integrity.test.ts"
      provides: "The four finishing checks as assertions over the committed artefacts"
  key_links:
    - from: "apps/web/src/lib/db/prisma.ts"
      to: "apps/web/src/lib/db/tripwire-arm.ts"
      via: "shouldArmTripwire() inside pool.on('connect')"
      pattern: "shouldArmTripwire"
    - from: "apps/web/scripts/audit/604-click-through.ts"
      to: "/api/auth/login"
      via: "POST with Origin: http://localhost:3000, capture Set-Cookie"
      pattern: "api/auth/login"
    - from: "apps/web/scripts/audit/604-classify.ts"
      to: "apps/web/scripts/audit/wrapper-countdown.json"
      via: "files[relPath].names lookup for function:line membership"
      pattern: "wrapper-countdown\\.json"
---

<objective>
Run the application against STAGING as `app_user`, with the quick-602 tripwire armed, over real
HTTP with a real session, across >=25 named surfaces and all 14 cron routes — and produce the
failure list.

**This task MEASURES. It fixes nothing.** No policy is widened, no grant is added, no path is
routed to `getAdminDb`, no migration is written or applied, no call site is migrated. The only new
application-adjacent artefacts are the tripwire arming gate (which must be provably inert on
production) and the auth-user seeder.

Purpose: `unmigrated-path-tripwire.md` §7 condition 2 says a partial `withTenantContext` migration
cannot be validated against a `postgres` connection, because `rolbypassrls` makes every policy
inert. It also says (§10) that **no authenticated browser path has ever been measured** — the 602
sweep covered 24 session-free entry points touching 4 of 456 units, 0.88 %. This task closes that.

Output: `docs/audits/staging-app-user-end-to-end.md` — the per-surface verdict table, the
classification with its arithmetic check, and the OUTSIDE_456 list naming file and line.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@docs/audits/unmigrated-path-tripwire.md
@docs/audits/admin-connection.md
@docs/audits/staging-environment.md
@apps/web/src/lib/db/prisma.ts
@apps/web/scripts/seed-staging.ts
@apps/web/scripts/audit/601-provisioning-verify.ts
@apps/web/scripts/audit/602-execution-sweep.ts

Read as needed, not up front:
- `docs/audits/wrapper-migration-scope.md` — groups A/B/C, 456 units / 198 files
- `docs/audits/policy-satisfiability-sweep.md` §4.1 and §5.2 — the classification's evidence base
- `apps/web/scripts/audit/wrapper-countdown.json` — membership lookup, `files[relPath].names`
</context>

---

<given_do_not_re_derive>

Measured before this plan was written. Re-confirm cheaply where a task says so; **do not
rediscover.**

**Preconditions, all confirmed:**
- `STAGING_DATABASE_URL_APP_USER` authenticates. `current_user = app_user`, `rolbypassrls = false`.
  **Port 6543 is unreachable from this machine** — repoint to `:5432` and strip `?pgbouncer=true`,
  exactly as `601-provisioning-verify.ts:113` already does.
- `public.tenant_context_required` exists on staging.
- **PRODUCTION BASELINE, read-only:** `_prisma_migrations` = **156** rows · `pg_policy` in `public`
  = **183** · newest migration `20260914170000_activation_progress_congrats_shown_at`. Staging also
  has 156 ledger rows.
- Staging data at plan time: **0 rows** in `Tenant`, `User`, `loads`, `carrier_drivers`, and **0
  rows in `auth.users`**.

**THE AUTH UNLOCK — proven end to end. `staging-environment.md` §9 says closing the auth gap
"needs the staging service-role key". IT DOES NOT.**
- Staging Supabase URL: `https://wyixpgunnjmzguhggocz.supabase.co`
- Staging anon key (legacy JWT, `disabled: false`):
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5aXhwZ3Vubmptemd1aGdnb2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5OTE1MzQsImV4cCI6MjEwNDU2NzUzNH0.KmTrJZtcJNIXwKlJ65-TZ2X7hVjrRG9EHNADBKCd7Zs`
  (modern publishable key also exists: `sb_publishable_NAlE3T43caxoQvzNvT75AQ_NOCO2ltu`)
- `/auth/v1/settings`: `disable_signup: false`, **`mailer_autoconfirm: false`**, email provider on,
  all OAuth off. **The app's own signup CANNOT yield a session** — it needs an email nobody can
  receive — and the built-in mailer returns **429 "email rate limit exceeded"** after three
  attempts. **Do not plan the click-through around signing up through the UI.**
- **The working path:** seed `auth.users` + `auth.identities` directly as `postgres` over
  `STAGING_DIRECT_URL`, then `POST /auth/v1/token?grant_type=password` with the anon key.
  Proven **HTTP 200 with `access_token`**, and `raw_app_meta_data` flows into the JWT's
  `app_metadata` — which is where this codebase reads `role` and `tenantId`.
- **THE GOTCHA, which cost three attempts.** GoTrue returns `500 "Database error querying schema"`
  when the token columns are NULL — its Go structs scan them into non-nullable strings.
  **`confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`,
  `email_change_token_current`, `phone_change`, `phone_change_token`, `reauthentication_token`
  must ALL be `''`, never NULL.** Also required: a matching `auth.identities` row (`provider_id` =
  the user id as **text**, `user_id` as **uuid**, `provider = 'email'`, `identity_data` carrying
  `sub` and `email`) and `email_confirmed_at = now()`. Hash with
  `crypt($pw, gen_salt('bf'))`; **pgcrypto is installed**.
- The probe cleaned up after itself — `auth.users` is back to **0**. Anything this task seeds must
  be torn down the same way, and the teardown asserted.
- **Not hooks, not privileges.** No `custom_access_token_hook`; `supabase_auth_admin` holds USAGE +
  SELECT; all 23 `auth.*` tables present. **Do not re-investigate those.**

**Tripwire arming.** `ALTER ROLE` / `ALTER DATABASE … SET` of the flag is **42501 for both
`postgres` and `app_user`**, and **Supavisor silently drops the connection-string `options`
parameter** (three spellings tried, all connect, all read `''`). **A session-level `SET` issued by
application code is the only mechanism.** quick-602 did it with a temporary, uncommitted
`TRIPWIRE_ARM`-guarded `pool.on('connect')` and reverted it. **This task builds that properly and
commits it, gated so it cannot arm against production.**

**Read off the codebase while planning, so the executor does not have to find it again:**
- `User.id` is `@default(dbgenerated("gen_random_uuid()")) @db.Uuid`, and
  `lib/auth/supabase.ts:getCurrentUser` looks up `prisma.user.findUnique({ where: { id:
  session.userId } })` where `session.userId` is the **Supabase Auth user id**. So the seeded
  `auth.users.id` **MUST equal the seeded `User.id`**, read back from the database — never minted
  independently.
- `/api/auth/login` (`src/app/api/auth/login/route.ts`) calls `signInWithPassword` through
  `@supabase/ssr`, so the **`Set-Cookie` headers on its response are the session cookie**. POSTing
  it is both easier and more honest than forging the chunked `sb-<ref>-auth-token` cookie.
- `authLimiter` in `src/lib/rate-limit.ts` is **`null` when `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` are unset**, and `applyRateLimit` is then a no-op. Leave both unset in
  the server shell or the click-through locks itself out after 5 logins.
- `validateOrigin` (`src/lib/security/csrf.ts`) always allows `http://localhost:3000`. Every
  non-GET request in the click-through must send `Origin: http://localhost:3000`.
- `verifyCronSecret` (`src/lib/security/cron-auth.ts`) returns false when `CRON_SECRET` is unset.
  The server shell must set one and the sweep must send `Authorization: Bearer <it>`.
- `SUPABASE_SERVICE_ROLE_KEY` is absent. `createAdminClient()` is reached by the login route **only**
  on the suspended-tenant and deactivated-user branches — both avoidable with active fixtures.
- `/api/v1/carrier/clients` has **POST**; `/api/v1/carrier/clients/[id]` has **PATCH** and
  **DELETE**. That is the INSERT / UPDATE / DELETE triple Task 5 needs.

</given_do_not_re_derive>

---

<hard_rules>

1. **MEASURE ONLY.** No policy created, dropped or widened. No grant. No migration file. No routing
   to `getAdminDb`. No call site migrated. If a fix is obvious, it is written down in the report as
   a finding and **not applied**.
2. **Production is NEVER written**, and `DATABASE_URL` in `.env` / `.env.local` is never changed.
   Hash both files at open and at close and assert byte-identity.
3. **Nothing is installed.** `pg`, `dotenv`, `tsx`, `typescript`, `vitest`, `@supabase/*` are all
   present, hoisted at the **REPO ROOT** `node_modules`, not `apps/web/node_modules`.
4. **Never import `scripts/_bootstrap-env`** from anything this task writes. It assigns
   `DATABASE_URL = DIRECT_URL` unconditionally and `DIRECT_URL` is **PRODUCTION** in every env file.
   Load `apps/web/.env.staging` explicitly, like `601-provisioning-verify.ts` does.
5. **Every instrument refuses on the production ref before opening a connection** — the
   `refuse()` shape from `601-provisioning-verify.ts:89-106`, checking both "does not contain
   `oqdhberkghtnszrkdvfm`" AND "does contain `wyixpgunnjmzguhggocz`".
6. **Nothing is swallowed.** Every probe records `{ok:true,…}` or `{error:{code,message}}` with the
   SQLSTATE and the full server message. A failure whose SQLSTATE could not be recovered is
   recorded as `SQLSTATE_UNRECOVERED`, never guessed at.
7. **Guards are proven RED before being accepted green** (quick-549). A guard asserted without a
   witnessed red is not evidence.
8. **Source-scanning guards normalise CRLF** (`.replace(/\r\n/g,'\n')`), carry a "was it actually
   found" assertion, and carry a length floor — **parameterised per file, never a blanket
   constant** (quick-562).
9. **No credential reaches git.** Passwords and connection strings live only in the gitignored
   `apps/web/.env.staging`. Every place a connection string is printed, the credential segment is
   masked and only the project ref is echoed.
10. **A verdict is never merged with another verdict.** `pass`, `fail`, `not-reachable` are three
    answers and the report prints three columns' worth of them, per surface, individually.

</hard_rules>

---

<tasks>

<task type="auto">
  <name>Task 1: Open the ledger — production baseline, staging preconditions, and the survey instrument</name>
  <files>
apps/web/scripts/audit/604-survey.ts
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/01-open.md
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/01-open.json
  </files>
  <action>
Write `apps/web/scripts/audit/604-survey.ts`, modelled on `scripts/audit/601-provisioning-verify.ts`
(same header discipline, same `refuse()`, same evidence shape). Two phases:
`--open` and `--close`.

It must NOT import `scripts/_bootstrap-env`. It loads `apps/web/.env.staging` with
`dotenv`, and refuses unless every connection string it is handed contains `wyixpgunnjmzguhggocz`
and does not contain `oqdhberkghtnszrkdvfm`. The production connection it reads is taken from the
repo-root `.env` `DIRECT_URL` and is opened **read-only** — the script must assert the statements it
issues against production are all `SELECT` by construction (a single frozen array of SELECT-only
SQL; no other production statement path exists in the file).

`--open` records, each as its own JSON field:

| reading | source | expected |
|---|---|---|
| production `_prisma_migrations` row count | production | **156** — assert, exit 1 on mismatch |
| production `pg_policy` count in `public` | production | **183** — assert, exit 1 on mismatch |
| production newest `migration_name` by `finished_at` | production | `20260914170000_activation_progress_congrats_shown_at` |
| sha256 of repo-root `.env` and of `apps/web/.env.local` | filesystem | recorded, compared at close |
| staging `current_user`, `current_database`, `rolbypassrls` over the app_user string at **:5432** | staging | `app_user` / `postgres` / **false** — assert |
| staging `_prisma_migrations` row count | staging | 156 |
| staging `pg_policy` count in `public` | staging | record (183 expected) |
| `public.tenant_context_required` present in `pg_proc` | staging | true — assert |
| `current_tenant_id()` body (`pg_get_functiondef`) | staging | records whether the tripwire arm is present |
| row counts for `Tenant`, `User`, `loads`, `carrier_drivers`, `auth.users` | staging | recorded, not asserted |
| `bypass_rls_policy` count | staging | 86 — recorded; this task never drops one |

The app_user connection string is derived as
`raw.replace(':6543/', ':5432/').replace('?pgbouncer=true','')`, and the script prints only the
project ref, never the string.

Write `evidence/01-open.json` (machine) and `evidence/01-open.md` (the table, house style, with the
three production numbers quoted verbatim).

**`--close` is written now and RUN in Task 7** — it re-reads the same production fields and the two
file hashes and asserts equality against `01-open.json`.
  </action>
  <verify>
`npx tsx scripts/audit/604-survey.ts --open` exits 0 and writes both evidence files.
`node -e` prints `prodLedgerRows`, `prodPolicies`, `appUserRoleCheck` from the JSON and they read
156, 183, `app_user/false`.
Deliberately point the production-ref check at the production string and confirm the script
**refuses before connecting** (witnessed red), then revert.
  </verify>
  <done>
`01-open.json` exists, carries 156 / 183 / `20260914170000_activation_progress_congrats_shown_at`
and the two file hashes, and the app_user role check reads `app_user` with `rolbypassrls=false`.
The refusal path has been seen to fire.
  </done>
</task>

<task type="auto">
  <name>Task 2: The arming gate — positive, ref-matching, committed, and proven inert on production</name>
  <files>
apps/web/src/lib/db/tripwire-arm.ts
apps/web/src/lib/db/prisma.ts
apps/web/tests/security/tripwire-arming-gate.test.ts
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/02-arming-gate.md
  </files>
  <action>
**This is the single highest-risk artefact in the task: it ships in `lib/db/prisma.ts`, which
production runs.**

Create `apps/web/src/lib/db/tripwire-arm.ts` exporting one pure function:

```ts
export function shouldArmTripwire(connectionString: string | undefined, flag: string | undefined): boolean
```

**State the gate in ONE sentence at the top of the file, and implement exactly that sentence:**
*"The tripwire arms only when the resolved connection string contains the staging project ref
`wyixpgunnjmzguhggocz` AND the environment variable `TENANT_CONTEXT_TRIPWIRE` is exactly `on`."*

The ref match is the **load-bearing half** and it is **positive**. Do not write a negative gate
("not the production ref") — a negative gate arms on any unrecognised string, including a future
database that does not exist yet. The env flag is belt and braces, not the control. Both refs are
module-level constants in this file; the production ref is present **only** so a second,
independent assertion can refuse it outright, and that refusal must be unreachable-by-default
rather than the mechanism.

Wire it into `prisma.ts`'s existing `pool.on('connect')` handler — the one that already writes
`app.current_tenant_id = ''` at line ~69. Add, guarded by `shouldArmTripwire(process.env.DATABASE_URL,
process.env.TENANT_CONTEXT_TRIPWIRE)` evaluated ONCE at module scope (not per connection), a second
fire-and-forget statement `SELECT set_config('app.tenant_context_tripwire','on',false)`. Session
scope (`false`), because Supavisor session mode holds the backend for the connection's life and the
flag must outlive each statement. Order: the existing tenant-GUC init first, the arm second.
`.catch()` it exactly as the existing statement is caught — an arm failure must never crash a
request.

Write `apps/web/tests/security/tripwire-arming-gate.test.ts` covering **both directions**:

| input | expected |
|---|---|
| staging-shaped string + `TENANT_CONTEXT_TRIPWIRE='on'` | **true** |
| **production-shaped string** (`…oqdhberkghtnszrkdvfm…`) + flag `'on'` | **false** |
| production-shaped string, flag unset | false |
| staging-shaped string, flag unset | false |
| staging-shaped string, flag `'off'` / `'ON'` / `'1'` / `'true'` | false — only the exact literal `on` arms |
| an unrecognised ref (`…someotherproject…`) + flag `'on'` | **false** — this is the case a negative gate would have got wrong |
| `undefined` connection string + flag `'on'` | false |

Plus a **source-scanning guard** in the same file, reading `src/lib/db/prisma.ts` from disk with
`.replace(/\r\n/g,'\n')`, a "was the `pool.on('connect'` call actually found" assertion, and a
length floor sized to that file specifically (not a blanket constant):
- asserts `prisma.ts` references `shouldArmTripwire`;
- asserts `prisma.ts` contains **no** literal `tenant_context_tripwire` outside a line that also
  references the gate — i.e. there is no second, ungated arming path;
- asserts the existing `set_config('app.current_tenant_id', '', false)` call is still present
  (counter-assertion: the guard must not be satisfiable by deleting the connect handler).

**Prove the whole file RED before accepting it green:** temporarily invert the ref check to a
negative gate (`!includes(PRODUCTION_REF)`), confirm the production-shaped and unrecognised-ref
cases fail, revert, confirm green. Record the red output verbatim in `evidence/02-arming-gate.md`.

Run `npx tsc --noEmit` in `apps/web` afterwards, and **probe it** — inject `const x: number = 'y'`
into `tripwire-arm.ts`, confirm tsc reports THAT error, delete the probe, re-run. If the only
errors are syntax errors or sit in files you did not touch, the gate is blind: delete
`apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` and re-run.
  </action>
  <verify>
`npx vitest run tests/security/tripwire-arming-gate.test.ts` — all cases green, with the red run
recorded first. `npx tsc --noEmit` clean, with the probe having been seen to fire.
`grep -c shouldArmTripwire src/lib/db/prisma.ts` >= 1.
  </verify>
  <done>
The gate is one sentence, positive, ref-matching. A production-shaped string with the flag on is
proven not to arm, and the negative-gate inversion was seen to fail that exact case. `prisma.ts`
carries exactly one arming path and still carries its original tenant-GUC init.
  </done>
</task>

<task type="auto">
  <name>Task 3: Seed staging — reuse the data seeder, write the auth-user seeder, prove a real login</name>
  <files>
apps/web/scripts/seed-staging-auth.ts
apps/web/.env.staging (gitignored — add STAGING_SEED_PASSWORD)
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/03-seed.md
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/03-seed.json
  </files>
  <action>
**Do not write a second data seeder.** `apps/web/scripts/seed-staging.ts` already exists, is
idempotent, and produces two tenants each with owner / dispatcher(MANAGER) / two drivers / client /
truck / two facilities / trip / load / two stops / route template / document. Run it pointed at
staging:

```
DATABASE_URL="<STAGING_DIRECT_URL, :5432>" npx tsx scripts/seed-staging.ts
```

Record `created=` / `skipped=` and the resulting row counts.

Then write `apps/web/scripts/seed-staging-auth.ts` — the NEW artefact. Same production-ref refusal
as `601-provisioning-verify.ts`, same "never import `_bootstrap-env`" rule, loads
`apps/web/.env.staging`. It connects as **`postgres` over `STAGING_DIRECT_URL`** (`auth.*` is not
reachable as `app_user`). Phases `--seed`, `--verify`, `--teardown`.

`--seed`: read every `public."User"` row on staging (`id, email, role, tenantId, firstName,
lastName`). For each, upsert into `auth.users`:

- **`id` = the `User.id` read back from the database.** Never mint one —
  `getCurrentUser()` does `user.findUnique({ where: { id: session.userId } })` against the Supabase
  Auth user id, so a mismatch makes every surface fail on "Account setup incomplete" instead of on
  the thing this task measures.
- `instance_id` = `'00000000-0000-0000-0000-000000000000'`, `aud = 'authenticated'`,
  `role = 'authenticated'`, `email` = the `User.email`, `email_confirmed_at = now()`,
  `created_at`/`updated_at` = now().
- `encrypted_password = crypt($password, gen_salt('bf'))` — pgcrypto is installed.
- `raw_app_meta_data` = `{"provider":"email","providers":["email"],"role":<User.role>,
  "tenantId":<User.tenantId>}`. **This is the half that decides whether the click-through measures
  anything.** `lib/auth/supabase.ts:getSession` reads `role` and `tenantId` from `app_metadata`; get
  them wrong and every surface fails on authorisation, which is a false positive that would wreck
  the failure list.
- `raw_user_meta_data` = `{"firstName":…,"lastName":…}`.
- **ALL EIGHT token columns set to `''`, never NULL:** `confirmation_token`, `recovery_token`,
  `email_change_token_new`, `email_change`, `email_change_token_current`, `phone_change`,
  `phone_change_token`, `reauthentication_token`. GoTrue scans them into non-nullable Go strings
  and answers `500 "Database error querying schema"` on a NULL. This was measured; do not
  rediscover it.

And a matching `auth.identities` row per user: `provider_id` = the user id **as text**, `user_id`
**as uuid**, `provider = 'email'`, `identity_data` = `{"sub":"<id>","email":"<email>"}`,
`last_sign_in_at`/`created_at`/`updated_at` = now().

The password is **generated** (e.g. `randomBytes(18).toString('base64url')`) on first `--seed` and
written to `apps/web/.env.staging` as `STAGING_SEED_PASSWORD`, which is gitignored
(`git check-ignore -v apps/web/.env.staging` to confirm, not by reading `.gitignore`). It is never
a literal in the script and never printed.

`--verify`: for **one OWNER and one DRIVER on EACH of the two tenants** (four logins), `POST
https://wyixpgunnjmzguhggocz.supabase.co/auth/v1/token?grant_type=password` with the anon key from
the given-facts block, assert HTTP **200** with an `access_token`, decode the JWT payload, and
assert `app_metadata.role` and `app_metadata.tenantId` equal the `User` row's. Record all four.

`--teardown`: delete `auth.identities` then `auth.users` (FK order), then assert
`SELECT count(*) FROM auth.users` = **0**. Task 7 runs this only if the report says staging is being
left unseeded; **the default is to LEAVE the seed in place** (Task 7 decides and records which).
Write the teardown now regardless — the probe that established this path cleaned up after itself
and so must this.

Also record in `evidence/03-seed.md` the count of `User` rows seeded and the count of `auth.users`
rows created, and assert they are equal.
  </action>
  <verify>
`npx tsx scripts/seed-staging-auth.ts --seed` then `--verify` — four logins, all HTTP 200, all four
`app_metadata` pairs matching. `evidence/03-seed.json` carries the four results with status codes.
`git check-ignore -v apps/web/.env.staging` confirms the credential file is ignored.
`git status` shows no `.env.staging` in the index.
  </verify>
  <done>
Staging carries two fully-populated tenants; every `User` row has a matching `auth.users` +
`auth.identities` pair with the SAME id; four real logins return 200 with correct `app_metadata`;
teardown exists and asserts zero.
  </done>
</task>

<task type="auto">
  <name>Task 4: The click-through — >=25 named surfaces plus 14 cron routes, over real HTTP, under the triple guard</name>
  <files>
apps/web/scripts/audit/604-click-through.ts
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/04-click-through.md
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/04-click-through.json
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/04-server.log
  </files>
  <action>
**This is a real click-through, not a probe sweep.** Drive a running Next server over HTTP with a
real session cookie.

**Stand the server up**, in its own shell, with these variables EXPORTED (they win over
`.env.local`, which Next does not override — that precedence is the safety argument, and guard 2
verifies it rather than trusting it):

```
DATABASE_URL           = <STAGING_DATABASE_URL_APP_USER, repointed to :5432, ?pgbouncer=true stripped>
DIRECT_URL             = <STAGING_DIRECT_URL>          # postgres — migrations only, see Task 7
TENANT_CONTEXT_TRIPWIRE= on
NEXT_PUBLIC_SUPABASE_URL      = https://wyixpgunnjmzguhggocz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <the staging anon key from the given-facts block>
NEXT_PUBLIC_APP_URL           = http://localhost:3000
CRON_SECRET            = <generated for this run>
RESEND_API_KEY         = ''      # GUARD 3
GMAIL_USER             = ''      # GUARD 3
UPSTASH_REDIS_REST_URL / _TOKEN  — LEFT UNSET so authLimiter is null (5-per-15-min would lock the run out)
```

Stop any running `next dev` and **delete `apps/web/.next`** before starting (a bundler cache
poisoned by a file swap reports correct work as missing — CLAUDE.md's standing rule). Redirect the
server's stdout+stderr to `evidence/04-server.log`.

**THE TRIPLE GUARD, modelled on `602`'s `11-execution-http.md`, all three recorded:**
1. Print the resolved `DATABASE_URL`'s project **ref only** (extract via `new URL()`; never echo the
   string) in the server's shell before start. Must be `wyixpgunnjmzguhggocz`.
2. `pg_stat_activity` on **both** databases at three moments — server up / after the run / server
   stopped. Production must show **0 `app_user` connections at every reading**; staging must show a
   new one appear and go away. Production's *total* may move; that is other traffic and the
   measurement does not claim it.
3. Outbound delivery neutralised, echoed as `RESEND_API_KEY='' GMAIL_USER=''`.

**Write `apps/web/scripts/audit/604-click-through.ts`.** It obtains sessions by **POSTing the real
`/api/auth/login`** with `Origin: http://localhost:3000` and capturing the response's `Set-Cookie`
headers — the `@supabase/ssr` chunked `sb-<ref>-auth-token*` cookies. **Do not forge the cookie.**
Three sessions: OWNER of tenant A, DRIVER of tenant A, OWNER of tenant B (the third exists so a
cross-tenant read has a second identity available to Task 5).

**The surface list is a committed constant in the script**, asserted to have **>= 25** entries. It
is exercised with the role each surface belongs to.

OWNER session (21):
`/dashboard` · `/carrier/dashboard` · `/carrier/trips` · `/carrier/loads` · `/carrier/clients` ·
`/carrier/contracts` · `/carrier/facilities` · `/carrier/templates` · `/carrier/imports` ·
`/carrier/messages` · `/drivers` · `/trucks` · `/loads` · `/routes` · `/invoices` · `/payroll` ·
`/crm` · `/compliance` · `/live-map` · `/settings/operations` · `/support`

DRIVER session (5):
`/home` · `/my-load` · `/my-route` · `/documents` · `/hours`

Plus the **14 `/api/cron/*` routes**, enumerated **from the directory, not a hardcoded list**, and
asserted equal to 14, each with `Authorization: Bearer $CRON_SECRET`. (quick-603 also names
`/api/warmup` as a scheduled entry point that lives outside `/api/cron/` — include it, labelled, as
a 15th scheduled surface, and do not fold it into the 14.)

**Per-surface verdict, one row each, never a summary line:**

| verdict | meaning |
|---|---|
| `pass` | HTTP 2xx/3xx AND no `TC001` in the correlated server log window AND no error banner in the body |
| `fail` | HTTP 5xx, OR `TC001` anywhere in the correlated log window, OR a 2xx whose body carries a swallowed-failure marker (quick-603's `failure-report.ts` shape, or a `-1` count, or `failed: N>0`) |
| `not-reachable` | 3xx to `/sign-in` or `/unauthorized`, or 404 — recorded with which, never counted as a pass |

**Failure capture — the SQLSTATE is not optional.** For every `fail`, recover:
1. the HTTP status and the first 2 kB of the body;
2. the correlated server-log window — the script writes a unique marker request header
   (`x-604-probe: <n>`) and, because Next does not echo it, correlates instead by **timestamping the
   log file offset before and after each request** and slicing that range. Record the byte range in
   the JSON so the correlation is auditable.
3. the **SQLSTATE**, from the log slice: `TC001`, or a Postgres code in a `logger.error` payload
   (quick-603's arity sweep means these now carry real `{name,message,code}` rather than
   `[object Object]`), or the `code:` field Prisma surfaces. If none can be recovered, record
   `SQLSTATE_UNRECOVERED` — **never guess one**.

**Note before you start, so a 200 is not over-read:** quick-602 measured `purge-deleted` raising
`TC001` **seven times** behind an HTTP 200 with `success:true`. quick-603 fixed twelve cron routes'
reporting; whether it fixed all of them is one of the things this run measures. Treat the log slice,
not the status code, as the authority for the cron rows.

Emit `evidence/04-click-through.json`: one object per surface with
`{ surface, role, method, status, verdict, sqlstate, logByteRange, bodyExcerpt }`, and
`evidence/04-click-through.md` with the full per-surface table.
  </action>
  <verify>
`evidence/04-click-through.json` holds >= 40 entries (>=25 surfaces + 14 cron + warmup), every one
with a non-null `verdict` drawn from exactly three literals.
`node -e` prints the count of entries whose verdict is unset — must be 0.
Guard 2's three production readings all show 0 `app_user` connections.
The surface-count assertion (`>= 25`) and the cron-count assertion (`=== 14`) both live in the
script and both were seen to run.
  </verify>
  <done>
Every named surface and every cron route has its own verdict row. Every `fail` row carries a
SQLSTATE or the explicit literal `SQLSTATE_UNRECOVERED`. The triple guard is recorded, and
production showed zero `app_user` connections at every reading.
  </done>
</task>

<task type="auto">
  <name>Task 5: The write-path check — distinguish "wrote" from "silently wrote nothing"</name>
  <files>
apps/web/scripts/audit/604-click-through.ts (the --writes phase)
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/05-writes.md
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/05-writes.json
  </files>
  <action>
**Without this, the pass list is worth much less than it looks.** `policy-satisfiability-sweep.md`
§4.1's correction: an INSERT refused by RLS is `42501 new row violates row-level security policy`,
but an **UPDATE or DELETE refused by RLS is a SILENT 0 ROWS with no error at all**. A surface can
answer 200 and have written nothing.

Add a `--writes` phase driving **four** write paths over the same OWNER session cookie, each with a
**counter-read taken on a SEPARATE privileged connection** (`postgres` over `STAGING_DIRECT_URL`),
never through the surface under test — a counter-read on the same RLS-filtered connection cannot
tell "no row" from "no permission".

| # | path | command | why this one |
|---|---|---|---|
| 1 | `POST /api/v1/carrier/clients` | INSERT | the loud case — a refusal is `42501`, which proves the instrument can see a raise |
| 2 | `PATCH /api/v1/carrier/clients/[id]` on the row #1 created | UPDATE | **the silent case** — the whole reason this task exists |
| 3 | `DELETE /api/v1/carrier/clients/[id]` on the row #1 created | DELETE | silent case, and it cleans up after #1 |
| 4 | `/settings/operations` server action → `Tenant.update` | UPDATE | `policy-satisfiability-sweep.md` §5.2 row 1 — quick-599's `tenant_self_update` was supposed to close this; measure whether it did, end to end, through the real screen rather than through a replayed statement |

For each: read the target's **row count AND the specific field's value** on the privileged
connection immediately before and immediately after the request, in that order, and emit one of:

| verdict | condition |
|---|---|
| `WROTE` | the field changed (or the row appeared/disappeared) as the request claimed |
| `SILENT_NO_OP` | **HTTP 2xx and the field did not change** — the finding this check exists for |
| `REFUSED` | non-2xx, with the SQLSTATE recovered from the log slice |

Path 4 restores whatever it changed (read the original value first, set it back afterwards, and
assert the restore landed). Paths 1–3 are self-cleaning by construction; assert zero leftover
`clients` rows carrying the probe's marker name at the end.

**`SILENT_NO_OP` is the headline row of the whole report if it occurs.** Put it in the report's
first table, not in an appendix.
  </action>
  <verify>
`evidence/05-writes.json` has exactly four entries, each with `before`, `after`, `verdict`, and for
`REFUSED` a `sqlstate`. The privileged counter-read connection is visibly a different connection
string from the one the server uses — assert in the script that the counter-read's `current_user` is
NOT `app_user`.
Probe-created rows: `SELECT count(*) FROM clients WHERE name LIKE '604-probe%'` = 0 at the end.
Path 4's restore is asserted, not assumed.
  </verify>
  <done>
Four write paths measured. Each is WROTE, SILENT_NO_OP or REFUSED on the evidence of a counter-read
on a privileged connection. Nothing the probe wrote survives.
  </done>
</task>

<task type="auto">
  <name>Task 6: Classify every failure, and attribute it inside or outside the 456</name>
  <files>
apps/web/scripts/audit/604-classify.ts
apps/web/tests/security/604-report-integrity.test.ts
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/06-classification.md
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/06-classification.json
  </files>
  <action>
**The classification is a decision procedure, not a judgement call.** Write
`scripts/audit/604-classify.ts` to read `04-click-through.json` + `05-writes.json` and apply, in
order:

| # | category | test |
|---|---|---|
| 1 | `TRIPWIRE_TC001` | SQLSTATE is `TC001`. **Detect by CODE, never by message prose** (`unmigrated-path-tripwire.md` §3.3). |
| 2 | `MISSING_GRANT` | SQLSTATE `42501` AND the message matches `permission denied for (table\|relation\|sequence) X`. Record X. |
| 3 | `RLS_DENIAL_SATISFIABLE` | 0 rows affected, or `42501 new row violates row-level security policy`, **AND** `policy-satisfiability-sweep.md` records a live non-bypass policy for that table+command |
| 4 | `RLS_DENIAL_NO_POLICY` | same symptom, but the sweep says the command is **dark** on that table. The sweep's §4.1 names exactly two: `Tenant` INSERT/UPDATE/DELETE — **partly closed since, by quick-599 (`tenant_bootstrap_insert`, `tenant_self_update`) and quick-601** — and `_prisma_migrations` (all four commands, and it has no `app_user` grant either, so it is also category 2). Re-read the live policy set on staging rather than trusting the sweep's 2026-09-13 table; record any disagreement as a finding. |
| 5 | `SOMETHING_ELSE` | everything else, including `SQLSTATE_UNRECOVERED` — recorded with its raw message, counted, and **never silently folded into another bucket** |

Categories 3 and 4 differ only in what the live policy set says, so the script must **query staging
for the applicable policies at classification time** (`pg_policy` joined to `pg_class`, filtered to
the table and to `cmd IN ('ALL', <the command>)`, excluding `bypass_rls_policy`) and record the
policy names it found. That query is what makes the distinction reproducible instead of asserted.

**Remember §4.1's correction while reading Task 5's output:** an UPDATE/DELETE refused by RLS is a
silent 0 rows, so a `SILENT_NO_OP` verdict from Task 5 enters classification as a **failure**, with
its category decided by rows 3 vs 4 — not as a pass.

**Attribution — membership is a LOOKUP, not a judgement.** `apps/web/scripts/audit/wrapper-countdown.json`
already names all 456 units keyed by path relative to `src`, each with a `names: ["fn:line", …]`
array. For every failure, resolve the offending source site from the log slice's stack frame, then:

- `IN_456` — the file appears in `files` and the `function:line` is in its `names`;
- `IN_456_FILE_ONLY` — the file appears but the function does not (record both, do not round up);
- `OUTSIDE_456` — the file does not appear at all.

**The OUTSIDE_456 list is step 5's actual finding and must not be crowded out.** The shape to hunt
is a global read with no tenant predicate, no bypass flag and no marker — `generateVehicleIds`
(quick-601) is the exemplar: invisible to the 211-site bypass grep AND to the 456-unit AST pass
alike, because it calls neither `getTenantPrisma` nor sets `app.bypass_rls`. Also worth checking
against, as already-named candidates from prior audits (`admin-connection.md` §9): both
`generateTicketNumber` copies, `api/cron/automations`'s four `candidateQuery()` reads, and
`api/track/[token]`'s GPS lookup. **Every OUTSIDE_456 entry names a file and a line.**

Write `apps/web/tests/security/604-report-integrity.test.ts` asserting, over the **committed
artefacts on disk** (CRLF-normalised, with a found-assertion and a per-file length floor):

1. every entry in `04-click-through.json` has a verdict from exactly `{pass, fail, not-reachable}`,
   and the entry count is >= 40;
2. **the five category counts SUM to the failure count** — an arithmetic assertion, with the
   failure count derived independently as `entries.filter(v === 'fail').length + writes.filter(v ===
   'SILENT_NO_OP' || v === 'REFUSED').length`;
3. every `OUTSIDE_456` entry has a non-empty `file` and an integer `line`;
4. the surface list in `604-click-through.ts` has >= 25 entries and the cron enumeration is 14
   (source scan, CRLF-normalised, with the "was it found" assertion).

**Prove this test RED before accepting it green**, three ways, each reverted and re-confirmed:
decrement one category count in the JSON (check 2 fires); blank one `OUTSIDE_456` file field (check
3 fires); truncate the surface list (check 4 fires). Record the red output in
`evidence/06-classification.md`.
  </action>
  <verify>
`npx tsx scripts/audit/604-classify.ts` writes both evidence files.
`npx vitest run tests/security/604-report-integrity.test.ts` green, with the three red runs recorded
first.
`node -e` prints the five category counts and the independently-derived failure count and they are
equal.
  </verify>
  <done>
Every failure carries exactly one category, decided by a recorded procedure including a live policy
query. The counts sum, and the sum is asserted by a test that was seen to fail. Every OUTSIDE_456
entry names a file and a line.
  </done>
</task>

<task type="auto">
  <name>Task 7: Leave staging armed, close the production read, and write the report</name>
  <files>
docs/audits/staging-app-user-end-to-end.md
apps/web/.env.staging (gitignored)
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/07-close.md
.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence/07-close.json
  </files>
  <action>
**Leave staging armed, and name what that costs.**

Record in the report, and set in the gitignored `apps/web/.env.staging`:

| key | value | why |
|---|---|---|
| `TENANT_CONTEXT_TRIPWIRE` | `on` | the flag half of the gate. Inert without the staging ref in `DATABASE_URL`, by Task 2's construction. |
| `STAGING_SEED_PASSWORD` | generated in Task 3 | the four fixture logins |
| `STAGING_DATABASE_URL_APP_USER` | unchanged | the runtime route |
| `STAGING_DIRECT_URL` | unchanged, **`postgres`** | see below |

**The cost, stated rather than buried:** `scripts/migrate.mjs:108` resolves
`DIRECT_URL || DATABASE_URL`, and `_prisma_migrations` has RLS enabled with **zero policies and no
`app_user` grant** (`policy-satisfiability-sweep.md` §5.1). **Migrations therefore CANNOT be applied
to staging as `app_user`** — `STAGING_DIRECT_URL` must stay on `postgres`, and any workflow that
runs `migrate.mjs`, `prisma db push`, `seed-starter-playbooks.ts` or `seed-staging-auth.ts` against
staging needs the privileged string, not the app_user one. Name every such workflow in the report.
Also name that `apps/web/.env.staging` is the only place these values live, that it is gitignored
(confirmed with `git check-ignore -v`), and that a fresh machine therefore cannot reproduce this run
without a human re-minting the credentials.

**Decide and record** whether the seeded tenants and `auth.users` rows stay. Default: **they stay**
— the value of an armed staging environment is that the next task does not repeat Task 3. If they
are torn down instead, run `seed-staging-auth.ts --teardown` and assert `auth.users` = 0, and say so.

**Close the production read.** Run `npx tsx scripts/audit/604-survey.ts --close`. It must assert,
against `01-open.json`:
- `_prisma_migrations` = **156**
- `pg_policy` in `public` = **183**
- newest migration name unchanged
- sha256 of repo-root `.env` and `apps/web/.env.local` unchanged (production `DATABASE_URL` never
  touched)

Any mismatch exits 1 and is the headline of the report rather than a footnote.

**Write `docs/audits/staging-app-user-end-to-end.md`**, house style (a dated header naming the
target and what was never written; every number citing the evidence file it came from). Sections:

0. What this task measured and what it deliberately did not. State that nothing was fixed.
1. Production, read at open and at close, field by field — the 156 / 183 table, both readings.
2. How staging was armed: the one-sentence gate, both directions of its test, and the triple guard
   from Task 4 with the `pg_stat_activity` matrix.
3. How a real session was obtained — the auth unlock, including the eight-NULL-token GoTrue gotcha,
   written down so the next task does not spend three attempts on it, and the correction to
   `staging-environment.md` §9's "needs the staging service-role key" (it does not).
4. **The per-surface table.** Every one of the >=25 surfaces, all 14 cron routes and `/api/warmup`,
   individually, with verdict and SQLSTATE. Not a summary.
5. The four write paths, with WROTE / SILENT_NO_OP / REFUSED and the counter-read either side.
   If any `SILENT_NO_OP` occurred, it leads this section.
6. **The classification**, five categories, with the counts and the arithmetic check quoted.
7. **THE FINDING — everything OUTSIDE the 456**, by file and line, with the shape of each
   (`generateVehicleIds`-class global read / raw `$queryRaw` with no tenant predicate / something
   else). This section is the point of the task; it does not get an appendix.
8. What is now known that was not, and what remains unmeasured — including everything
   `unmigrated-path-tripwire.md` §8 lists as invisible to the tripwire (the 86 bypass policies /
   ~211 sites, every `getAdminDb` path, the 4 "neither" policies, `after()`-deferred work, swallowed
   raises, the pool-leak inheritance case) and anything this run adds to that list.
9. What is left running on staging and what it costs — the table above.

Finally, correct in place any document this run proved stale, with a dated note rather than a silent
edit: at minimum `staging-environment.md` §9 (the auth gap is closable without the service-role key)
and §5/§8 (`.env.staging` now exists and is complete).
  </action>
  <verify>
`npx tsx scripts/audit/604-survey.ts --close` exits 0 with 156 / 183 / unchanged head / both file
hashes equal.
`git status` shows no `.env.staging`, no `.env`, no `.env.local` staged.
`git diff --stat` on `.env` and `apps/web/.env.local` is empty.
The report's per-surface table row count equals `04-click-through.json`'s entry count — assert it
with a one-liner rather than by eye.
`npx vitest run tests/security/` green, and the full `apps/web` suite measured before and after with
the **same reporter** (quick-565) — and measured AFTER the last commit, not before it (quick-561).
  </verify>
  <done>
Staging is left armed with the cost written down; production reads 156 / 183 at close exactly as at
open and its `DATABASE_URL` is byte-identical; `docs/audits/staging-app-user-end-to-end.md` exists
with all nine sections, the per-surface table is complete and individual, and section 7 names file
and line for every failure outside the 456.
  </done>
</task>

</tasks>

---

<verification>

**Finishing checks — all four are artefact-backed, not assertions in prose:**

1. **Step 3 lists EVERY surface individually with a verdict.**
   `04-click-through.json` has >= 40 entries; zero entries have an unset verdict; every verdict is
   one of exactly three literals. Asserted by `604-report-integrity.test.ts` check 1, and the
   report's table row count is asserted equal to the JSON's entry count.

2. **Step 4's category counts SUM to the failure count.**
   An arithmetic assertion in `604-report-integrity.test.ts` check 2, with the failure count derived
   **independently** from the verdict fields rather than read from the classification's own header.
   Proven RED by decrementing one count.

3. **Step 5 names sites with file and line.**
   Every `OUTSIDE_456` entry has a non-empty `file` and an integer `line`. Check 3. Proven RED by
   blanking one.

4. **Production untouched.**
   `604-survey.ts --close` asserts `_prisma_migrations` = 156, `pg_policy` = 183, newest migration
   name unchanged, and sha256 of repo-root `.env` and `apps/web/.env.local` unchanged. Exits 1 on
   any mismatch.

**Standing gates:**
- `npx tsc --noEmit` in `apps/web`, **probed** (inject `const x: number = 'y'` into a file you
  actually edited, confirm tsc reports THAT error, delete the probe). If the only errors are syntax
  errors, or all sit in files you did not touch, the gate is BLIND, not green — delete
  `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` and re-run.
- Full `apps/web` vitest suite, before and after, **same reporter both times**, measured **after the
  last commit**. `--reporter=basic` does not exist in vitest 4 and exits 0 having run zero tests; a
  run whose output carries no `Test Files … | Tests …` summary is not a green run.
- `npx eslint` has no working entry point in `apps/web` — report that rather than claiming lint
  passed.

**Anti-vacuity, per task:**
Task 2, Task 6 and every source-scanning guard must have been seen RED before being accepted green,
with the red output quoted in the evidence file. A guard asserted without a witnessed red is the
quick-549 shape and does not count.

</verification>

<success_criteria>

- [ ] Production read at open AND at close: 156 ledger rows, 183 policies, same head migration, and
      `DATABASE_URL` byte-identical in both env files.
- [ ] The arming gate ships in `prisma.ts`, is stated in one sentence, is **positive and
      ref-matching**, and is proven not to arm against a production-shaped string with the flag on.
- [ ] `auth.users` + `auth.identities` seeded with ids matching the seeded `User` rows, four real
      logins returning 200 with correct `app_metadata`, teardown written and asserting zero.
- [ ] >= 25 named surfaces + 14 cron routes + `/api/warmup`, each with its own pass / fail /
      not-reachable verdict, over real HTTP with a real session cookie obtained from
      `/api/auth/login`.
- [ ] Every `fail` carries a SQLSTATE or the explicit literal `SQLSTATE_UNRECOVERED`.
- [ ] Four write paths measured WROTE / SILENT_NO_OP / REFUSED against a counter-read on a separate
      privileged connection.
- [ ] Five-category classification, counts summing to the failure count, asserted arithmetically.
- [ ] Every failure attributed IN_456 / IN_456_FILE_ONLY / OUTSIDE_456 by lookup in
      `wrapper-countdown.json`; every OUTSIDE_456 entry names file and line.
- [ ] `docs/audits/staging-app-user-end-to-end.md` written, nine sections, per-surface table
      complete.
- [ ] Staging left armed, with the config that persists, where it lives, and what it costs named —
      including that migrations cannot run as `app_user`.
- [ ] **NOTHING FIXED.** No policy, no grant, no migration, no `getAdminDb` routing, no migrated
      call site. `git diff` contains only: the arming gate, the auth seeder, the three audit
      scripts, the two tests, the report, the evidence directory, and the doc corrections.

</success_criteria>

<output>
After completion, create
`.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/604-SUMMARY.md`.

The report at `docs/audits/staging-app-user-end-to-end.md` is the deliverable; the summary points at
it and records the commit list, the before/after test counts (same reporter, measured after the last
commit), and anything the run proved stale in a prior audit.
</output>
</content>
</invoke>
