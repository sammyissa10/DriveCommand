---
phase: quick-523
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/backfill-facility-coordinates.ts
autonomous: false

must_haves:
  truths:
    - "Running the script with no --org-id prints a usage message and exits non-zero, without opening a database connection."
    - "Running with --org-id and without --apply lists every facility in that org whose latitude OR longitude is NULL, and writes NOTHING to the database."
    - "Every listed row shows the EXACT address string submitted to the geocoder, untruncated."
    - "The confidence column reads 'n/a (not exposed by geocodeAddress)' on every row — no score is invented, approximated, or fetched by calling Nominatim directly."
    - "A facility the geocoder returns null for is printed as SKIPPED with a reason, never as a row carrying 0, blank, or a fallback coordinate."
    - "A facility whose five address fields are all null/blank is reported as SKIPPED (no address) and no geocoder call is made for it."
    - "Geocoder calls are serialised, with at least 1000ms between consecutive calls — no Promise.all, no concurrency."
    - "The --apply branch exists in the file and was NEVER executed during this task."
    - "lib/geo/geocode.ts, schema.prisma, all migrations, and everything under lib/document-import/ are byte-identical to before."
  artifacts:
    - path: "apps/web/scripts/backfill-facility-coordinates.ts"
      provides: "Dry-run-by-default facility coordinate backfill, org-scoped"
      contains: "geocodeAddress"
      min_lines: 100
  key_links:
    - from: "apps/web/scripts/backfill-facility-coordinates.ts"
      to: "apps/web/src/lib/geo/geocode.ts"
      via: "relative import of geocodeAddress, used as-is"
      pattern: "from '\\.\\./src/lib/geo/geocode'"
    - from: "apps/web/scripts/backfill-facility-coordinates.ts"
      to: "facilities table"
      via: "prisma.carrierFacility.findMany scoped by orgId with OR latitude/longitude null"
      pattern: "carrierFacility\\.findMany"
---

<objective>
Add a one-shot script that lists every facility in a given org with a missing
latitude or longitude, geocodes each one through the repo's existing geocoder,
and prints what it WOULD write. Dry run is the default and is the only thing
this task runs.

Purpose: quick-522 diagnosed the NULL-coordinate population read-only. This is
the write tool for it, built and proven safe, but not fired. Facilities with no
coordinates are invisible to the optimisation matrix and to every map surface.

Output: `apps/web/scripts/backfill-facility-coordinates.ts` plus the dry-run
table for org `7e9eca25-1f97-46ed-9365-e67be49436d5`, presented for approval.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/522-read-only-diagnostic-null-coordinate-han/522-SUMMARY.md

Read before writing (do not modify either):
@apps/web/src/lib/geo/geocode.ts
@apps/web/scripts/backfill-notification-html-cache.ts
</context>

<hard_constraints>

**THE SINGLE MOST IMPORTANT RULE: DO NOT RUN `--apply`.**
Not once, not "just to see", not against a single row. Every database in this
project is production Supabase. The apply run is a separate human approval gate
that happens after this plan is reviewed. The executor writes the `--apply`
branch and leaves it cold. If you catch yourself about to type `--apply` on a
command line, stop — that is the failure this whole plan is shaped around.

**Only ONE file may be created or changed:**
`apps/web/scripts/backfill-facility-coordinates.ts`

**Files that MUST NOT be touched:**
- `apps/web/src/lib/geo/geocode.ts` — use it exactly as exported. It returns
  `{lat, lng} | null` and nothing else. Do not widen it to expose Nominatim's
  `importance` / `place_rank` / `display_name`.
- anything under `apps/web/src/lib/document-import/` — including
  `optimisation-service.ts`, `optimisation-matrix.ts`, and any
  `route_matrix_cache` code.
- `apps/web/prisma/schema.prisma` and every file under `prisma/migrations/`.

**NO DDL. No schema change. No migration. No new table, column, or index.**

**Do NOT add geocoding to the document-import pipeline.** That is a Phase 8
obligation and is explicitly out of scope here.

</hard_constraints>

<verified_facts>

These were established by the orchestrator against the real files. Do not
re-derive them; build on them.

**The geocoder** — `apps/web/src/lib/geo/geocode.ts`:
```ts
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null>
```
- Provider is Nominatim / OpenStreetMap. **No API key is required and none
  exists in `.env.local`.** The task's "stop and report if a key is missing"
  branch does not trigger.
- It never throws. Every failure path — non-ok response, empty result array,
  timeout, network error — returns `null`.
- It has **zero imports**: plain `fetch` + `AbortSignal.timeout(5000)`. Safe to
  import from a bare tsx script with no Next.js runtime.
- **It exposes NO confidence or match-quality value.** Nominatim's raw response
  carries `importance`, `place_rank`, `class`, `type`, `display_name`,
  `boundingbox`; `geocodeAddress` discards all of it at lines 30-33 and returns
  `{lat, lng}` only. The task asks the table to print "whatever confidence the
  geocoder returns" — the truthful answer is that there isn't one. Render it as
  the literal string `n/a (not exposed by geocodeAddress)`. Do not invent a
  score, do not approximate one from distance or field completeness, and do NOT
  call Nominatim directly from the script to fish the field out — that would
  bypass "use the existing geocoder as-is".

**The columns** — `CarrierFacility` in `schema.prisma` (`@@map("facilities")`):
```prisma
  latitude   Float?
  longitude  Float?
```
Plain nullable Floats, no `@map`, so Prisma field name == Postgres column name.
There is no PostGIS geometry column, no combined point type, and no separate
coordinates table. The mapping is `lat -> latitude`, **`lng -> longitude`** —
note the name change on the second one. (Nominatim itself returns `lon`;
geocode.ts already renames it, so do not re-derive that.)

**Address source fields** (Prisma name -> column):
`addressLine1 -> address_line1`, `addressLine2 -> address_line2`, `city`,
`state`, `zip`. All five nullable.
`country` (NOT NULL, default `'US'`) also exists but is **deliberately
excluded** — the task named five fields and this plan stays inside that scope.
Record that exclusion in the script header so a reader knows it was a decision.

**Org scoping:** `orgId String @map("org_id") @db.Uuid`. Filter on `orgId`.

**Rate limiting is the script's job, not the geocoder's.** All three existing
callers apply none: `lib/geofencing/geofence-check.ts:26` (one lazy geocode) and
both mobile owner-loads routes via `geocodeLoadAddresses`, which fires two
geocodes **concurrently** through `Promise.all`. Each is a one-or-two-address
user action, so none ever needed a throttle. A backfill loop over N facilities
is precisely the volume Nominatim's public-instance policy (max 1 request per
second) targets, and geocode.ts's own header says "low-volume requests only".
So the script serialises and sleeps. That throttle lives in the script; it can
never go into geocode.ts.

**Environment:** `.env.local`'s `DATABASE_URL` is on the **`postgres`** role,
not `app_user` — so the known "no data locally = app_user + RLS filters to zero
rows" trap does not apply. If the script reports 0 facilities, that is a real 0.

**Script convention** (`scripts/backfill-notification-html-cache.ts:42-51`):
prefer `DIRECT_URL` over `DATABASE_URL` (bypasses pgbouncer), then
`new Pool({ connectionString, max: 1 })` -> `new PrismaPg(pool)` ->
`new PrismaClient({ adapter })`, with `PrismaClient` imported from
`../src/generated/prisma`. Follow it exactly.

**Shell is PowerShell.** `&&` and `||` are not valid statement separators. Every
command below is a single statement.

</verified_facts>

<tasks>

<task type="auto">
  <name>Task 1: Write the backfill script — dry run by default, apply behind a flag</name>
  <files>apps/web/scripts/backfill-facility-coordinates.ts</files>
  <action>
Create the file. Nothing else in the repo changes.

**Header comment** must state, in this order:
1. Usage: `npx tsx --env-file=.env.local scripts/backfill-facility-coordinates.ts --org-id <uuid>` (run from `apps/web`).
2. Dry run is the DEFAULT; `--apply` is the only thing that writes, and every database here is production Supabase.
3. Why the calls are serialised with a >= 1000ms sleep — Nominatim public-instance policy is max 1 req/s and geocode.ts is documented "low-volume requests only". **Say explicitly: do not "optimise" this into a `Promise.all`.**
4. That `geocodeAddress` exposes no confidence value, which is why the confidence column is a literal `n/a`.
5. That `country` exists on the model and was deliberately left out of the submitted address string, to stay inside the five fields the task named.

**Imports:**
```ts
import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { geocodeAddress } from '../src/lib/geo/geocode';
```
Use the relative path for the geocoder, not a `@/` alias — tsx path-alias
resolution is not something to gamble a production script on.

**Argument parsing**, before any DB connection is opened:
- `--org-id <uuid>` and `--org-id=<uuid>` both accepted. **REQUIRED.**
- `--apply` — optional boolean. Absent => dry run.
- If `--org-id` is missing or empty: print a usage message to `stderr` and
  `process.exit(1)`. Do not construct the Pool, do not import-time connect.

**Constants:**
```ts
const THROTTLE_MS = 1100; // > Nominatim's 1 req/s ceiling, with headroom
const NO_CONFIDENCE = 'n/a (not exposed by geocodeAddress)';
```

**Query** — exactly this shape:
```ts
prisma.carrierFacility.findMany({
  where: { orgId, OR: [{ latitude: null }, { longitude: null }] },
  select: { id: true, name: true, addressLine1: true, addressLine2: true,
            city: true, state: true, zip: true },
  orderBy: { name: 'asc' },
})
```

**Address assembly:** join the five fields in declaration order
(addressLine1, addressLine2, city, state, zip), dropping null/undefined and
whitespace-only values, `.trim()` each, join with `', '`. If the result is
empty, the facility is `SKIPPED (no address)` — **do not call the geocoder**
for it and do not let it consume a throttle slot.

**The loop** — strictly sequential `for...of`, `await` inside:
- `await sleep(THROTTLE_MS)` before every geocode call except the first.
- `const hit = await geocodeAddress(addr);`
- `hit === null` => status `SKIPPED (geocoder returned null)`, latitude and
  longitude columns printed as `-`. **Never 0, never blank, never a fallback.**
- `hit !== null` => status `OK`, print `hit.lat` and `hit.lng`.

**Output.** A header line, then one line per facility, pipe-delimited:
`id | name | address submitted | latitude | longitude | confidence | status`.
Pad the short columns for readability but **never truncate the address column** —
seeing exactly what was submitted is the entire point of the dry run, and a
`console.table` that elides it defeats the exercise. Follow with a summary:
total found, OK, skipped-null, skipped-no-address.

In dry-run mode print a leading banner: `DRY RUN — no database writes` and a
trailing `DRY RUN COMPLETE — 0 rows written`.

**The `--apply` branch** (written, not run): print a loud banner naming the org
and stating it writes to production. Then, for OK rows only:
```ts
await prisma.carrierFacility.update({
  where: { id: row.id },
  data: { latitude: hit.lat, longitude: hit.lng },
});
```
Never `create`, never `upsert`, never `updateMany`. Skipped rows are logged as
`SKIPPED — no write` so a null result is visible, not silently swallowed.

Add a comment directly above that `update` recording the caveat:
`CarrierFacility` declares `updatedAt DateTime @updatedAt`, so Prisma stamps
`updated_at` on every `update()`. A Prisma `--apply` therefore cannot literally
touch latitude and longitude alone. This is unavoidable through the ORM and
would need raw SQL to prevent. **Do not switch to raw SQL to dodge it** — it is
surfaced at the approval gate in Task 3 for the user to rule on.

Close with `await prisma.$disconnect()` then `await pool.end()`, and
`main().catch((err) => { console.error(err); process.exit(1); });`.
  </action>
  <verify>
From `apps/web`, run `npx tsc --noEmit` and confirm 0 errors.

**Check the gate is not lying.** If the only errors reported sit under `.next/`,
or are all syntax errors, or are all in files you did not touch, tsc has skipped
semantic checking of everything. In that case delete
`apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then
re-run. Then PROBE: temporarily insert `const __probe: number = 'x';` into
`scripts/backfill-facility-coordinates.ts`, confirm tsc reports THAT error, and
delete the probe. A clean run you have not probed is not evidence.

Then confirm the required-arg guard, which touches no database:
`npx tsx --env-file=.env.local scripts/backfill-facility-coordinates.ts`
Expect a usage message and exit code 1. Check with `$LASTEXITCODE`.
  </verify>
  <done>
The file exists, typechecks under a probed-clean tsc, and exits 1 with usage
when `--org-id` is absent. No other file in the repo has changed —
`git status --short` lists exactly one untracked path.
  </done>
</task>

<task type="auto">
  <name>Task 2: Execute the DRY RUN and capture the table</name>
  <files>(no files modified — this task runs the script)</files>
  <action>
From `apps/web`, run the dry run against the target org. **Exactly this command,
with NO `--apply` anywhere on the line:**

```
npx tsx --env-file=.env.local scripts/backfill-facility-coordinates.ts --org-id 7e9eca25-1f97-46ed-9365-e67be49436d5
```

Capture the complete output verbatim — every row, not a sample.

Expect the run to take roughly `1.1s x (facilities with an address)` because of
the throttle. That slowness is the feature working. Do not add `--apply`, do not
lower `THROTTLE_MS` to speed it up, and do not parallelise it.

Interpreting the result:
- **0 facilities found** is a real 0, not an RLS artifact — `.env.local` is on
  the `postgres` role, not `app_user`. Report it as a genuine finding and
  cross-check it against quick-522's diagnostic count before concluding the
  query is wrong.
- A high **SKIPPED (geocoder returned null)** count is itself the finding the
  user needs; it means the addresses on file are not resolvable and a backfill
  would not fix those rows. Do not retry them with a reworded address string —
  that is inventing input the database does not contain.
- **SKIPPED (no address)** rows are facilities that can never be backfilled from
  this data. Count them separately.

Verify no write occurred: the dry-run path contains no `update` call at all, and
the trailing banner must read `DRY RUN COMPLETE — 0 rows written`. If that
banner is absent, treat the run as suspect and stop.
  </action>
  <verify>
The captured output contains the `DRY RUN — no database writes` banner, one row
per facility with all seven columns present, the confidence column reading
`n/a (not exposed by geocodeAddress)` on every single row, and the
`0 rows written` trailer. The shell history for this task contains no
occurrence of `--apply`.
  </verify>
  <done>
The full dry-run table is captured, with counts for OK / skipped-null /
skipped-no-address. The database is unchanged.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
`apps/web/scripts/backfill-facility-coordinates.ts` — a dry-run-by-default,
org-scoped coordinate backfill built on the repo's existing Nominatim geocoder,
serialised at 1 request per 1.1s. The `--apply` branch is written but has NOT
been run. Nothing has been written to the database.
  </what-built>
  <how-to-verify>
1. Read the dry-run table above. For each `OK` row, sanity-check that the
   resolved latitude/longitude land in the right region for the address string
   shown — Nominatim will happily return a plausible-looking point for a
   partial address, and the geocoder exposes no confidence value to catch that.
   This eyeball is the ONLY quality signal available.
2. Confirm the `SKIPPED` rows are ones you are content to leave with NULL
   coordinates.
3. **Rule on the `updated_at` question.** `CarrierFacility` has
   `@updatedAt`, so a Prisma `--apply` will move `facilities.updated_at` on
   every row it writes, in addition to latitude/longitude. The task said "must
   not touch any other column". Options: (a) accept it — an audit timestamp is
   not business data; (b) require raw SQL for the apply run so `updated_at` is
   left alone, which is a follow-up change to the script.
4. Decide whether the apply run happens at all, and against which rows.
   `--apply` writes to production Supabase.

Nothing else in the repo was modified: `lib/geo/geocode.ts`, `schema.prisma`,
the migrations, and everything under `lib/document-import/` are untouched.
  </how-to-verify>
  <resume-signal>
Reply with the `updated_at` decision (accept / require raw SQL) and either
"approved to apply" or "hold". **The executor must not run `--apply` under any
circumstance during this plan** — approval starts a separate task.
  </resume-signal>
</task>

</tasks>

<verification>
- `git status --short` from the repo root shows exactly one new path,
  `apps/web/scripts/backfill-facility-coordinates.ts`, and no modifications.
- `apps/web/src/lib/geo/geocode.ts`, `apps/web/prisma/schema.prisma`,
  `prisma/migrations/**`, and `apps/web/src/lib/document-import/**` are
  unmodified.
- `npx tsc --noEmit` from `apps/web` is 0 errors, and the gate was probed.
- No `--apply` invocation appears anywhere in this task's command history.
- `grep -c "n/a (not exposed" ` over the captured output equals the row count.
</verification>

<success_criteria>
- The script exists, requires `--org-id`, and defaults to dry run.
- The dry-run table for org `7e9eca25-1f97-46ed-9365-e67be49436d5` is captured
  in full, with the exact submitted address string on every row.
- Every null geocode result is visibly reported as SKIPPED — no zero, blank, or
  fallback coordinate anywhere in the output or in the apply branch.
- Geocode calls are serialised at >= 1000ms apart.
- The database is byte-for-byte unchanged by this plan.
- The `updated_at` caveat is surfaced to the user rather than silently accepted
  or silently worked around.
</success_criteria>

<output>
After completion, create
`.planning/quick/523-backfill-null-facility-coordinates-using/523-SUMMARY.md`.

It must record: the dry-run counts (found / OK / skipped-null /
skipped-no-address), the fact that `geocodeAddress` exposes no confidence value
and therefore the column is a literal `n/a`, the Nominatim 1-req/s reason the
throttle lives in the script and not in `geocode.ts`, the `@updatedAt` caveat on
any future Prisma-based apply, and — prominently — that `--apply` was never run.
</output>
