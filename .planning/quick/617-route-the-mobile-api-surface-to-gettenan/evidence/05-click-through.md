# quick-617 — Task 5: the click-through. It ran, and it found a blocker on the surface that matters.

**Two harnesses, two different answers, and the difference is the point of this section.**

| harness | what it exercises | entries | pass | fail | not-reachable | TC001 |
|---|---|---:|---:|---:|---:|---:|
| `604-click-through.ts` passes 1+2 | web session-cookie surfaces | **66** | **60** | **0** | **6** | **0** |
| `617-mobile-click-through.ts` (new) | the 28 routed `/api/mobile/*` GET routes | 30 | **0** | 29 | 0 | 0 |

quick-616's figures were **66 / 60 / 0 / 0** — identical, entry for entry.

---

## 1. The server

`apps/web/scripts/audit/617-start-staging-server.js` — committed this time; quick-616's launcher was
ad hoc and left only its banner in a log file. It refuses **POSITIVELY** on all four target-deciding
values (a negative-only "not production" check passes on a third, unknown database) and prints each
with the credential masked:

```
[server-target] DATABASE_URL -> staging wyixpgunnjmzguhggocz (credential MASKED)
[server-target] DIRECT_URL -> staging wyixpgunnjmzguhggocz (credential MASKED)
[server-target] DATABASE_URL_ADMIN -> staging wyixpgunnjmzguhggocz (credential MASKED)
[server-target] NEXT_PUBLIC_SUPABASE_URL -> staging wyixpgunnjmzguhggocz (credential MASKED)
[server-target] TENANT_CONTEXT_TRIPWIRE=on
[server-target] DATABASE_URL role : app_user.wyixpgunnjmzguhggocz
[server-target] anon key present : true | length 208 | MASKED eyJhbG...d7Zs
[server-target] CRON_SECRET generated for this run (MASKED, never written to a tracked file)
▲ Next.js 16.2.1 (Turbopack)   ✓ Ready in 6.7s
```

`apps/web/.next` was deleted first — the tree changed under this task, and a restart alone does not
clear a poisoned Turbopack cache (Phase 12's finding).

**`CRON_SECRET` is in no env file on this machine** and the harness refuses without it ("the cron
sweep would measure auth, not RLS"). A random one is generated per run, exported to the server and
the harness, and never written to a tracked file. quick-616 hit the same refusal; the launcher now
handles it so the next person does not rediscover it.

---

## 2. Pass 1 + pass 2 — 66 / 60 / 0 / 6, identical to quick-616

Both passes shared the **same absolute `--out`** (`…/617-…/evidence/05-click-through.json`) and the
same `CLICK_THROUGH_LOG` (`…/617-…/evidence/05-server.log`). Pass 2 reads what pass 1 wrote, so they
must match; and without `--out` both would have landed on quick-604's `04-click-through.json`, which
carries byte offsets into quick-604's own log — destructive by construction (quick-610).

```
pass 1:  41 entries — pass 41 · fail 0 · not-reachable 0
           21 OWNER surfaces · 5 DRIVER surfaces · 14 CRON (asserted === 14) · /api/warmup
pass 2:  25 entries — 19 pass · 0 fail · 6 not-reachable
merged:  66 entries — pass 60 · fail 0 · not-reachable 6
```

The six not-reachable are quick-604's and quick-616's same six — four directories with no index page,
one `/track/<probe>` with no seeded token, one `/onboarding` 307 for a tenant past the gate. None is
a regression and none is a silent skip.

**A 200 is not a pass.** `purge-deleted` raised `TC001` seven times behind a 200 in quick-602, so the
correlated log slice is the authority:

```
entries with TC001 in their correlated slice   : 0  (of 66)
TC001 across the whole 24,181-byte server log  : 0
"tenant context is required"                   : 0
"[prisma] tripwire arm failed"                 : 0
HTTP 500 lines                                 : 0
POSITIVE CONTROL — "GET /" lines in the log    : 98   (the log IS being read)
```

Two independent measurements — the slices and the whole-file scan — and a positive control so the
zeros are not the signature of an unread file.

---

## 3. THE FINDING: the web click-through exercises NONE of this task's surface

All 66 entries are **session-cookie** surfaces. Not one of them is `/api/mobile/*`. So the 60/0/0
above is a genuine **regression** result — nothing this task did broke any web surface — and it says
**nothing whatsoever about the 67 statements that were actually routed.**

That gap is worth closing rather than reporting, so `617-mobile-click-through.ts` was built for it.
`validateMobileToken` calls `admin.auth.getUser(token)`, so the mobile Bearer token **is** a Supabase
access token, obtainable from the staging password grant with the seeded credentials — obtained,
never forged.

### It ran, and every one of the 28 routes returned 401

```
ROUTED mobile GET routes (derived from the pinned inventory): 28
  401  fail  DRIVER /api/mobile/driver/dashboard
  401  fail  DRIVER /api/mobile/driver/documents
  …all 28…
  401  fail  OWNER  /api/mobile/owner/trucks

30 entries — pass 0 · fail 29 · not-reachable 0 · TC001 0
```

### The cause, MEASURED and not inferred

```
is SUPABASE_SERVICE_ROLE_KEY set ANYWHERE?
  apps/web/.env.staging : 0
  apps/web/.env.local   : 0
  .env                  : 0
  .env.local            : 0
  POSITIVE CONTROL — NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.staging : 1   (the grep works)

is the TOKEN itself valid?
  POST /auth/v1/token?grant_type=password  -> 200, access_token 920 chars
  GET  /auth/v1/user with THAT token       -> 200, id d606784c-…,
       app_metadata {"role":"DRIVER","tenantId":"b5623cdd-…"}
  => the token is VALID against staging Supabase
```

`createAdminClient()` is `createClient(NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)`. With
the key `undefined`, `admin.auth.getUser(token)` fails, `validateMobileToken` returns null, and
**every `/api/mobile/*` route on this machine returns 401 — for staging and for production config
alike.** This has nothing to do with anything this task changed; the same 401 is returned by the five
files quick-588 routed and by the eight this task stopped on.

This is the mobile analogue of the blocker quick-615 reported and quick-616 closed
(`NEXT_PUBLIC_SUPABASE_URL` pointing at production). **The remedy is one line:
`SUPABASE_SERVICE_ROLE_KEY` for `wyixpgunnjmzguhggocz` in `apps/web/.env.staging`.**

### The harness's own anti-vacuity is what makes the result readable

```
  PASS  FLOOR — at least 20 routed GET routes exercised — 28 >= 20
  PASS  AUTH CONTROL — /api/mobile/driver/dashboard with NO Authorization returns 401
  FAIL  TENANT CONTROL — the same route with a tenant-B driver token — status 401, not 200
  PASS  ZERO TC001 across the correlated slices AND the whole log — slices 0, whole log 0
```

The AUTH CONTROL passing is exactly what tells you the run is uninformative: a tokened request and an
untokened one are **indistinguishable**, so the 401s cannot be read as "the routes are gated". The
harness reported `fail`, never `pass`, and **nothing weaker was substituted**. A click-through that
did not happen is a known gap; one that is claimed is a lie in the record.

**`TC001 = 0` here is worth nothing** and is labelled as such — no routed statement executed, so
there was nothing to raise.

---

## 4. The arming counter-assertion — four parts, all passing

Zero TC001 is exactly what a **disarmed** tripwire looks like. Full output in `05-arming-control.txt`:

| part | result | proves |
|---|---|---|
| **1** `shouldArmTripwire(<the server's exact DATABASE_URL>, 'on')` | `true` — PASS | the arming CONDITION `prisma.ts` evaluates at module scope was satisfied. Does **not** prove the `set_config` reached the pool |
| **2** the same string with the PRODUCTION ref | `false` — PASS | the gate is a gate. A function that says yes to everything satisfies 1 identically |
| **3** the same string, flag `'off'` | `false` — PASS | the flag half is live too |
| **4** tripwire GUC read back on a fresh `app_user` connection | `"on"` — PASS | the session-scoped `set_config` takes on this database for this role |
| **4b** unscoped `SELECT count(*) FROM "Truck"` with it armed | **`TC001`** — PASS | the MECHANISM is live on staging for `app_user` at this moment, so a surface that ran an unscoped statement WOULD have produced a `TC001` line |
| **4c** the same read with the tripwire `'off'` | silent, `count = 0` — PASS | the raise is caused by the **arming**, not by the statement |

4b is meaningful over an **empty** table on purpose: `Truck` holds 0 rows in the probed shape, and the
policy expression is evaluated at scan setup, not per row (quick-610).

Corroborated independently by the server log carrying **no** `[prisma] tripwire arm failed` line (the
arm is `.catch`-logged, so a failure would be visible), and by `shouldArmTripwire` being evaluated
once at module scope, so it cannot have been true for some requests and false for others.

**What this does not prove:** that every one of the 66 requests ran on a connection that had been
armed. The GUC is session scope on a `max: 1` pool and `pool.on('connect')` fires per physical
connection; nothing outside the process can read another session's GUC. The argument is circumstantial
in exactly that one respect, and it is stated rather than glossed.

---

## 5. Prior tasks' evidence — hashed at open and at close

**92 files** under `.planning/quick/604-*/evidence`, `605-*/evidence`, `606-*/evidence` and
`616-*/evidence` were SHA-256 hashed before this task touched anything, recorded in
`05-prior-evidence-hashes.txt`, and re-hashed at close. Both passes shared the same `--out`, pointed
at **this** task's evidence directory, so quick-604's `04-click-through.json` — the one carrying byte
offsets into its own server log — was never a candidate for being overwritten.

See `06-gates.md` §6 for the close-hash verdict.
