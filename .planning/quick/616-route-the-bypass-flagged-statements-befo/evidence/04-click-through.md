# quick-616 Task 4 — the click-through harness. **IT RAN.**

quick-615 could not run it. That blocker is gone and is named below.

**Artefacts:** `04-click-through.json` (66 entries, byte offsets into this task's own log) ·
`04-server.log` · `04-arming-control.txt` · `04-prior-evidence-hashes.txt`

---

## 1. The blocker quick-615 reported is closed

615 §7, verbatim:

> `NEXT_PUBLIC_SUPABASE_URL` in `apps/web/.env.local` is
> `https://oqdhberkghtnszrkdvfm.supabase.co` — **PRODUCTION**. The harness needs a real signed-in
> session, which means authenticating against production auth and starting a server pointed at it.
> Both are refused by this task's limits.

`apps/web/.env.staging` now carries `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
for **`wyixpgunnjmzguhggocz`**. Asserted **before** the server was started, positively and by name:

```
NEXT_PUBLIC_SUPABASE_URL ref : wyixpgunnjmzguhggocz
is staging (wyixpgunnjmzguhggocz): true
is production (oqdhberkghtnszrkdvfm): false
anon key present : true | length 208 | MASKED eyJhbG...d7Zs
```

The server was launched through a guard that **refuses positively on all four target-deciding
values** and prints each to stderr with the credential masked:

```
[server-target] DATABASE_URL -> staging wyixpgunnjmzguhggocz (credential MASKED)
[server-target] DIRECT_URL -> staging wyixpgunnjmzguhggocz (credential MASKED)
[server-target] DATABASE_URL_ADMIN -> staging wyixpgunnjmzguhggocz (credential MASKED)
[server-target] NEXT_PUBLIC_SUPABASE_URL -> staging wyixpgunnjmzguhggocz (credential MASKED)
[server-target] TENANT_CONTEXT_TRIPWIRE=on
[server-target] DATABASE_URL role : app_user.wyixpgunnjmzguhggocz
```

`apps/web/.next` was deleted before the run — the tree changed under this task, and a restart alone
does not clear a poisoned Turbopack cache.

**The session was obtained, never forged.** `POST /api/auth/login` returned 200 and set
`sb-wyixpgunnjmzguhggocz-auth-token` — the cookie name itself names staging.

### One thing the harness needed that no env file carries

`CRON_SECRET` is not in `.env.local`, `.env.staging`, the repo root `.env`, or anywhere else on this
machine, and the harness **refuses to run without it**: *"the cron sweep would measure auth, not
RLS"*. A random 24-byte secret was generated for this run and exported to **both** the server and
the harness, so the 14 cron routes were exercised past their auth gate rather than 401'd. It was
never written to a tracked file and the temporary file was deleted at the end of the run. **Named
because the next person to run this will hit the same refusal.**

---

## 2. The result — 66 entries, pass 60 · fail 0 · not-reachable 6

Passes 1 and 2 shared the **same absolute `--out`**
(`…/616-…/evidence/04-click-through.json`) and the same `CLICK_THROUGH_LOG`
(`…/616-…/evidence/04-server.log`). Pass 2 reads what pass 1 wrote, so they must match; and without
`--out` both would have landed on quick-604's `04-click-through.json`, which carries byte offsets
into quick-604's own log — destructive by construction (quick-610).

| group | entries | pass | fail | not-reachable |
|---|---:|---:|---:|---:|
| OWNER surfaces (pass 1) | 21 | 21 | 0 | 0 |
| DRIVER surfaces (pass 1) | 5 | 5 | 0 | 0 |
| CRON routes (pass 1, asserted `=== 14`) | 14 | 14 | 0 | 0 |
| other scheduled (`/api/warmup`) | 1 | 1 | 0 | 0 |
| pass 2 — the brief-named surfaces | 25 | 19 | 0 | 6 |
| **total** | **66** | **60** | **0** | **6** |

`namedSurfaceCount = 26` (the script refuses below 25); `cronRouteCount = 14`, enumerated from
`src/app/api/cron/` and asserted.

### The six not-reachable, each with its reason

| status | surface | reason |
|---|---|---|
| 404 | `/carrier/driver-pay` | no index page — the directory holds only `pending/`, `reports/`, `settlements/`, **all three exercised above** |
| 404 | `/carrier/reports` | no index page — only `aging/`, `driver-pay/`, `performance/`, `revenue/`, `todays-trips/` |
| 404 | `/checklists/playbooks` | no index page — only `[id]/`; the list lives on `/checklists` |
| 404 | `/checklists/instances` | no index page — only `[id]/`, and staging carries **zero** `PlaybookInstance` rows, so there is no id to substitute |
| 404 | `/track/<probe>` | no seeded `Load` carries a `trackingToken` — the legacy `"Load"` table holds **0 rows** on staging |
| 307 | `/onboarding` | redirects to `/carrier/dashboard` — the seeded tenant is past this gate |

Identical to quick-604's six. None is a regression and none is a silent skip.

---

## 3. A 200 is NOT a pass — the correlated log slice

quick-602 measured `purge-deleted` raising `TC001` **seven times behind an HTTP 200 with
`success: true`**. The authority is the log slice, never the status code.

Each entry records `logByteRange` — the server log's byte offset immediately before and immediately
after its request — and `logTc001Mentions` over that slice.

```
entries with TC001 in their correlated log slice : 0  (of 66)
TC001 occurrences in the whole 20,829-byte server log : 0
"tenant context is required" occurrences in the log  : 0
"[prisma] tripwire arm failed" occurrences           : 0
HTTP 500 lines in the log                            : 0
```

**Zero, by the slice and by the whole-file scan, which are independent of each other.**

---

## 4. "Zero TC001" is exactly what a DISARMED tripwire looks like — the counter-assertion

The failure mode of this measurement is GREEN (quick-546). Four checks, each stated for what it does
and does not prove. Full output in `04-arming-control.txt`.

| check | result | proves |
|---|---|---|
| **1** `shouldArmTripwire(<the server's exact DATABASE_URL>, 'on')` | `true` — **PASS** | the arming CONDITION `prisma.ts` evaluates at module scope was satisfied. Does **not** prove the `set_config` reached the pool. |
| **1b** same string with the PRODUCTION ref | `false` — **PASS** | the gate is a gate. A function that says yes to everything would satisfy check 1 identically. |
| **1c** same string, flag `'off'` | `false` — **PASS** | the flag half is live too. |
| **2** tripwire GUC read back on a fresh `app_user` connection armed the way `prisma.ts` arms it | `"on"` — **PASS** | the session-scoped `set_config` takes on this database for this role. |
| **2b** unscoped `SELECT count(*) FROM "Truck"` with it armed | **`TC001`** — **PASS** | the MECHANISM is live on staging for `app_user` **at this moment**, so a surface that ran an unscoped statement WOULD have produced a `TC001` line. |
| **3** the same read with the tripwire `'off'` | silent, `count = 0` — **PASS** | the raise is caused by the **arming**, not by the statement. Without this half, "unscoped ⇒ TC001" could be a property of the read. |

Check 2b is meaningful **over an empty table on purpose**: `Truck` holds 0 rows on staging, and
quick-610 established that an empty table still raises `TC001` because the policy expression is
evaluated at scan setup, not per row.

Two further corroborations, each independent: the server log contains **no**
`[prisma] tripwire arm failed` line (the arm is `.catch`-logged, so a failure would be visible), and
`shouldArmTripwire` is evaluated **once at module scope**, so it cannot have been true for some
requests and false for others within the run.

**What this does not prove:** that every one of the 66 requests ran on a connection that had been
armed. The GUC is session scope on a `max: 1` pool and `pool.on('connect')` fires per physical
connection; nothing outside the process can read another session's GUC. The argument is
circumstantial in exactly that one respect, and it is stated rather than glossed.

---

## 5. Was anything PREVIOUSLY UNMEASURED? — the user's specific question

### No NEW surface was reached

The surface list is a committed constant. quick-604 and quick-616 ran the identical 66 entries:

```
604 entries 66   616 entries 66
only in 616: NONE
only in 604: NONE
```

### But THIRTEEN surfaces that previously FAILED now execute to completion

A 500 in a server component stops the fan-out. Everything downstream of these thirteen failures had
**never been exercised** by an authenticated request against `app_user` with the tripwire armed.
That is the previously-unmeasured part, and it is substantial — seven of the thirteen were raising
`TC001` in quick-604's own correlated slices.

| surface | role | quick-604 | quick-616 | 604 `TC001` in slice |
|---|---|---|---|---:|
| `/carrier/trips` | OWNER_A | 500 fail | **200 pass** | 2 |
| `/documents` | DRIVER_A | 500 fail | **200 pass** | 0 |
| `/carrier/driver-pay/settlements` | OWNER_A | 500 fail | **200 pass** | 0 |
| `/checklists/automation` | OWNER_A | 500 fail | **200 pass** | 0 |
| `/api/cron/carrier-auto-dispatch` | CRON | 500 fail | **200 pass** | 0 |
| `/api/cron/carrier-compliance-alerts` | CRON | 500 fail | **200 pass** | 0 |
| `/api/cron/digest-compliance-30day` | CRON | 500 fail | **200 pass** | 8 |
| `/api/cron/digest-daily-driver` | CRON | 500 fail | **200 pass** | 8 |
| `/api/cron/digest-weekly-owner` | CRON | 500 fail | **200 pass** | 8 |
| `/api/cron/purge-deleted` | CRON | 500 fail | **200 pass** | 28 |
| `/api/cron/send-reminders` | CRON | 500 fail | **200 pass** | 8 |
| `/api/cron/trip-reminders` | CRON | 500 fail | **200 pass** | 4 |
| `/api/cron/workflow-notifications` | CRON | 500 fail | **200 pass** | 0 |

**13 fails → 0, and 66 `TC001` mentions across quick-604's slices → 0.** No surface regressed: every other entry holds the
same status and verdict it held in quick-604.

This is the first rendered-surface measurement of quick-606, quick-610, quick-612, quick-613 and
**quick-615**'s routing. quick-615 shipped 47 routed statements and could not exercise a single one
through a browser path; this run does.

### A caveat that must travel with the number

**A 200 over an empty table proves less than it looks** — quick-606's own artefacts make this point
about `/api/cron/carrier-auto-dispatch` in as many words:

> HTTP 200 — but `route_templates with autoGenerateDaysAhead > 0` — the rows the route iterates = 0
> on staging, so the 2xx proves the raise is gone and **NOTHING about the scoping**

Staging is sparse. `Truck`, `Load`, `SupportTicket` and `PlaybookInstance` are all zero-row.
So the honest reading of "60 pass" is: **the routes no longer raise, and no scoping claim follows
for the ones whose row sets are empty.** quick-606 classified those individually as `LATENT`; that
classification is unchanged by this run and is not superseded by it.

---

## 6. Prior tasks' evidence — hashed at open and at close

**77 files** under `.planning/quick/604-*/evidence`, `605-*/evidence` and `606-*/evidence` were
SHA-256 hashed before this task touched anything and again at close.

```
ALL 77 PRIOR-TASK EVIDENCE FILES BYTE-IDENTICAL
```

`git status` over all three directories is empty. The hash list is committed as
`04-prior-evidence-hashes.txt`. quick-604's `04-click-through.json` — the one carrying byte offsets
into its own server log — is among them and is untouched.
