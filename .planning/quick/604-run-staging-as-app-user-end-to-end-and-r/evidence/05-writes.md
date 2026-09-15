# quick-604 · 05 — the write-path check: WROTE vs SILENT_NO_OP vs REFUSED

`policy-satisfiability-sweep.md` §4.1, as corrected by quick-599: an INSERT refused by RLS is a loud
`42501`, but **an UPDATE or DELETE refused by RLS is a silent 0 rows with no error at all**. A
surface can answer HTTP 200 having written nothing. Without this check the 30-row pass list from
`04-click-through.md` is worth much less than it looks.

Every verdict below rests on a **counter-read taken on a separate privileged connection**
(`STAGING_DIRECT_URL`, `postgres`), never through the surface under test. The script asserts that
connection's `current_user` is **not** `app_user` and refuses otherwise — a counter-read on the same
RLS-filtered connection cannot tell "no row" from "no permission".

## The four paths

| # | path | command | HTTP | before | after | **verdict** |
|---|---|---|---|---|---|---|
| 1 | `POST /api/v1/carrier/clients` | INSERT | **201** | `probeClients: 0` | `probeClients: 1` | **WROTE** |
| 2 | `PATCH /api/v1/carrier/clients/[id]` | UPDATE | **200** | `city: "Probeville"` | `city: "604-probe-updated"` | **WROTE** |
| 3 | `DELETE /api/v1/carrier/clients/[id]` | DELETE | **200** | `status: "active"` | `status: "inactive"` | **WROTE** |
| 4 | `/settings/operations` server action → `Tenant.update` | UPDATE | **200** | `requirePreTripInspection: false`, `blockTripStartOnFailedInspection: true` | `true`, `false` | **WROTE** |

**There is no `SILENT_NO_OP` in this run.** That is the headline, and it is a positive result: path 4
is `policy-satisfiability-sweep.md` §5.2 row 1 — the statement quick-599's `tenant_self_update`
policy was created to admit — and it is now measured **end to end through the real screen**, over a
real session, on an `app_user` connection with `rolbypassrls = false`, rather than as a replayed
statement. quick-599 proved the policy; this proves the path.

## The false `SILENT_NO_OP` that the first run produced, and why it is written down

Run 1 reported **#3 DELETE → SILENT_NO_OP**. It was wrong, and it was the instrument's fault.

`DELETE /api/v1/carrier/clients/[id]` is a **soft** delete: `softDeleteClient` does
`update({ data: { status: 'inactive' } })` and the response body says `{"status":"inactive"}`. The
counter-read was watching **`deleted_at`** — a column this path never touches — so it saw no change
and concluded the write had silently done nothing.

A false `SILENT_NO_OP` poisons the report exactly as badly as a missed one: the verdict that exists
to be believed is the one that must not be cheap. The rule that falls out: **the counter-read watches
the field the endpoint claims to change**, read off the handler, not the field a name suggests. The
corrected read watches `status`, and path 3 is `WROTE`.

## The Server Action id, and the anchor that actually works

Path 4 is a Server Action, so it needs the `Next-Action` header. Run 1 recorded
`ACTION_ID_UNRECOVERED` — honestly, rather than skipping the path.

The anchor the plan implies, `createServerReference("<id>", …, "<actionName>")`, is **not usable under
Turbopack**: the call is split across several hundred characters of mangled module identifiers, so the
id and the name are never close enough for a bounded regex. The anchor that works is the compiler's
own marker comment, which keeps them adjacent:

```
/* __next_internal_action_entry_do_not_use__ [{"4019f599fccbb80ca9948378f58b9c51807d28930a":{"name":"saveOperationsSettings"}},"apps/web/src/app/(owner)/settings/operations/actions.ts",""] */
```

Second trap: Turbopack loads the page's action chunk **lazily**, so it is not in the page's initial
`<script src>` list and fetching every served script finds nothing. The recovery falls back to
`.next/dev/static/chunks` on disk.

`page/server-reference-manifest.json` lists **five** ids for this page, all pointing at the same
actions module — it does not say which id is which action. Only the client chunk's marker does.

## Cleanup

- Path 4 read the original flag values first, flipped them, and **restored them on the privileged
  connection with the restore asserted** (`path 4 restore asserted: flags back to their original
  values`). A failed restore exits 1.
- Paths 1–3 leave a soft-deleted row (`status = 'inactive'`, `deleted_at IS NULL`), so the probe's
  final sweep found it and hard-deleted it — `leftoverNeededForcedCleanup: true`, then
  `leftoverProbeClientsAtEnd: 0`, asserted.

```
SELECT count(*) FROM clients WHERE name LIKE '604-probe%'   →  0
```
