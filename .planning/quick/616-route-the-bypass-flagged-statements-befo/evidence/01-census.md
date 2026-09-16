# quick-616 Task 1 — the `app.bypass_rls` census

**Date:** 2026-09-15
**Scope:** `apps/web/src`, excluding test paths and `src/generated`.
**Instrument:** `apps/web/scripts/audit/616-bypass-census.ts` + `616-census-classification.ts`.
**Artefacts:** `01-census.json` (machine-readable, one record per statement),
`01-walker-red-green.md` (the anti-vacuity guard witnessed RED then GREEN).
**No application file was modified by this task step.**

---

## 1. The count reconciliation — the brief's `~20` against the measured population

The brief assumed **~20 statements**. The measured population is **177 statements across 87
files** — roughly nine times larger.

**The `~20` is `615-SUMMARY.md` §8's FIRST table row.** Verbatim:

> | **The bypass-flagged population** — B7's two `generateTicketNumber` copies, B8
> (`lib/auth/supabase.ts:164`), the 7 in `support-tickets.ts`, `evaluator.ts:95-96`,
> `workflow-digest`'s 8, the `api/track/[token]` GPS lookup | **~20 statements across 86 tables'
> worth of policies** | The **Phase 0 bypass programme**. …

That row enumerates only the statements **prior audits had NAMED individually**. It was never a
count of the population.

**The NEXT row of the same table gives the population.** Verbatim:

> | **`~211` bypass-exempt sites the tripwire cannot signal** | 211 | quick-602's stated cost,
> unchanged. Owned by the bypass programme |

Both numbers were in the source, one line apart. The source was not ambiguous; the first row was
simply the wrong row for the question "how big is the bypass population". Stated plainly because
softening it would invite the same mis-read next time.

**The named subset itself is 13 statements, not ~20** — see §7. §8's row overstates
`support-tickets.ts` (7 → 5 today) and `evaluator.ts` (`:95-96` → one statement at `:127`), and
`workflow-digest`'s "8" is 4. Those are line-number and count drift of exactly the kind quick-611
warned about; re-resolved by symbol in Task 2 and reported there.

---

## 2. Method, stated per count (quick-607)

| count | method |
|---|---|
| **177 statements / 87 files** | `ts.createSourceFile` per file, **no `Program`, no type checker**. A statement is the **innermost** `CallExpression` or `TaggedTemplateExpression` whose own literal children (`StringLiteral`, `NoSubstitutionTemplateLiteral`, `TemplateHead/Middle/Tail`) contain `app.bypass_rls`. Comments are not AST nodes, so prose is excluded **by construction**, not by a pattern. |
| **5 test statements / 2 files** | same parse, on paths matching `__tests__/`, `*.test.*`, `*.spec.*`. Excluded from the matrix, listed in §6. |
| **8 prose-only files** | files containing the literal with **zero** executable statements. Listed in §6. |
| **137 occurrences / 32 files outside `src/`** | raw textual occurrences under `prisma/`, `scripts/`, `tests/`, `tests-db/`. A count, not a parse — the point is only the size. **Out of the matrix**: none of it ships and none of it is on the cutover path. |
| **34 disappeared since the 211 audit** | per-file diff of today's parse against a self-checking transcription of `bypass-call-classification.md` §3/§4 (the transcription is refused unless it adds to exactly 211/103). Attribution by `git log -S "app.bypass_rls"` per file, plus `git blame` where a statement became prose rather than being deleted. |

### Why a parse and not the grep-plus-awk the prior audits used

The prior method was a `grep` plus an `awk` filter dropping any line whose first non-space
characters are `*`, `//` or `/*`. That is a **heuristic about comments**, and it is why two
measurements of the same tree disagreed. A line starting `*` inside a template literal is code; a
`$executeRaw` quoted in prose is not. Only a parse can tell them apart.

The parse also had to defeat a second over-count that the grep never has: a
`prisma.$transaction(async tx => { await tx.$executeRaw\`…\` })` is itself a `CallExpression` whose
argument subtree contains the literal. Counting every enclosing call gave **369**. Keeping only the
innermost candidate gives 177. The innermost filter is deliberately **method-agnostic** rather than
a `$executeRaw`-name match, so an unusual spelling cannot be silently dropped.

---

## 3. Adjudicating 177/87 against 180/89

Three numbers were in play: **211** (the 2026-09-12 audit), **177/87** (planning's naive
line-grep), **180/89** (the orchestrator's brief).

**The parse says 177 statements / 87 files, and that is the answer.** The evidence:

| measurement | statements | files |
|---|---:|---:|
| raw grep, `apps/web/src`, all files | 195 | 97 |
| …minus the 5 test-file calls | 190 | 95 |
| …minus 13 comment lines (`awk`: strip `^[ \t]+`, reject `^(\*|//|/\*)`) | **177** | **87** |
| **the AST parse** | **177** | **87** |

The parse and the strict awk filter agree exactly, and they agree for a checkable reason: all 13
excluded lines really are prose (listed in §6), and **no** line starting with a comment marker is
in fact code in this tree.

**179/89 is reproducible and 180 is not.** Dropping the `//` clause from the awk filter — i.e.
rejecting only `^\*` — admits exactly two lines and yields **179 statements / 89 files**:

```
src/app/api/email-confirm/[token]/route.ts:53:  // `app.bypass_rls` with the tenant GUC, which `tenant_self_read` and
src/lib/email/sender-config.ts:134:    //   set_config('app.bypass_rls', 'on', TRUE)
```

Both are `//` prose, both are in files that carry **no** executable statement, which is why they
move the FILE count by exactly 2 — reproducing the brief's 89. The brief's 180th statement is **not
reproducible** by any comment-filter spelling tried (five variants, plus a spaces-only trim and a
no-filter run, all recorded in the shell transcript). It is reported as unreconciled rather than
averaged away: **177/87 is measured, 179/89 is explained, 180 is one statement no spelling produced.**

> **Neither 179 nor 180 is "safe because larger".** Both are wrong in the same direction and for
> the same reason — a comment heuristic admitting comments — and the two extra "statements" name
> files that contain none. A count that is two files too large sends a follow-up batch to two files
> with nothing to do in them.

---

## 4. The SURFACE rule

Assigned by path, **first match wins**, and the order below IS the precedence. The four the user
named come first so they win any overlap; everything else gets its **own named surface** rather
than a residue bucket.

| # | surface | path rule |
|---|---|---|
| 1 | `DRIVER_PORTAL` | `src/app/(driver)/**` |
| 2 | `OWNER_PORTAL` | `src/app/(owner)/**` |
| 3 | `MOBILE_API` | `src/app/api/mobile/**` |
| 4 | `LIB_SERVICES` | `src/lib/**`, `src/server/**`, `src/actions/**` |
| 5 | `ADMIN_PORTAL` | `src/app/(admin)/**` |
| 6 | `AUTH_PORTAL` | `src/app/(auth)/**` |
| 7 | `API_V1` | `src/app/api/v1/**` |
| 8 | `API_CRON` | `src/app/api/cron/**` |
| 9 | `API_DRIVER` | `src/app/api/driver/**` |
| 10 | `API_AUTH` | `src/app/api/auth/**` |
| 11 | `API_DRIVER_PAY` | `src/app/api/driver-pay/**` |
| 12 | `API_GPS` | `src/app/api/gps/**` |
| 13 | `API_TRACK` | `src/app/api/track/**` |
| 14 | `API_PUSH_TOKENS` | `src/app/api/push-tokens/**` |
| 15 | `API_INTEGRATIONS` | `src/app/api/integrations/**` |
| 16 | `API_EMAIL_CONFIRM` | `src/app/api/email-confirm/**` |
| 17 | `ONBOARDING_PAGES` | `src/app/onboarding/**` |
| — | `UNCLASSIFIED:<path>` | anything else — **would be a finding**; the census has none |

**The precedence is load-bearing in exactly one place.** `src/app/(driver)/**` and
`src/app/(owner)/**` contain route handlers as well as pages; rules 1 and 2 claim them before rules
5–17 could. `src/app/api/driver/**` is a DIFFERENT surface from `DRIVER_PORTAL` — the first is the
web REST API, the second is the React route group — and they are deliberately not merged.

### The residue is real and is named, not bucketed

The four surfaces the user named cover **142 of 177** statements (`MOBILE_API` 84 + `LIB_SERVICES`
45 + `OWNER_PORTAL` 7 + `DRIVER_PORTAL` 6). The remaining **35** are spread across nine further
surfaces, seven of which are a single route. Rules 11–17 each hold 1–2 statements. They are listed
individually because a follow-up batch has to be able to see them; collapsing them into one
`API_OTHER` row would make a two-minute job look like a survey.

**Three rules match nothing today and are kept anyway:** `ADMIN_PORTAL` (quick-600 emptied it — the
sysadmin surface was the whole of that task), `AUTH_PORTAL` and `ONBOARDING_PAGES` (quick-601).
A rule that has gone to zero is a fact worth keeping visible; deleting it makes a regression look
like a new surface.

---

## 5. The CATEGORY rule — definitions QUOTED, plus one new

### 5.1 The four, quoted from `docs/audits/bypass-replacement-design.md` §1

That document (2026-09-12) already classified the same 211 sites against the same question — *what
replaces the bypass* — with an explicit precedence. Verbatim:

> Precedence matters, because sites can satisfy more than one description. A site is assigned to the
> **first** category it matches:
>
> 1. **BOOTSTRAP** — at the moment of the query, is there *any* verified value in the request that
>    names a tenant? A JWT claim, a signed token payload, an argument the caller already validated all
>    count. If there is none, the site is BOOTSTRAP. This is a stricter test than "runs before auth":
>    several pre-auth paths hold a tenant and are not bootstrap.
> 2. **BROKEN_POLICY** — does at least one statement in the bypass scope address rows that **no policy
>    on that table could ever admit**, whatever the application sets? Quoted policy required.
> 3. **CROSS_TENANT** — does the statement deliberately span tenants: an all-tenant list, a sysadmin
>    acting on another tenant, a global sequence?
> 4. **DECORATIVE** — everything else. The tenant is in hand or reachable; the bypass was never the
>    isolation mechanism, the application `where` clause was.

This census uses **that** precedence, not the earlier `bypass-call-classification.md` §2 rules. The
two documents define DECORATIVE and CROSS_TENANT differently on purpose, and the design document
says why:

> An unscoped `findUnique({ where: { id } })` that *could* carry a tenant predicate is **DECORATIVE**
> under this axis, not CROSS_TENANT. The earlier audit's rule (d) grouped those with genuine
> cross-tenant reads because it was calibrated against a different question ("does this need a
> privileged connection").

The earlier audit's calibration is quoted here too, because it explains why its CROSS_TENANT count
was 50 and this one's is 2, and the bias is deliberate and correct for the question *it* was asked:

> A wrong DECORATIVE is a production outage at cutover; a wrong CROSS_TENANT is wasted effort.

### 5.2 THE FIFTH CATEGORY — `TENANT_KNOWN_UNSCOPED`

**The four do not fit, and the misfit is 86% of the population.**

The design document's own §1.4 splits its DECORATIVE bucket in a sentence and then does not carry
the split into a category:

> Thirteen of the 171 already work and keep working, because a `getTenantPrisma()` earlier in the
> same request left the GUC set on the `max: 1` pool …

The earlier audit measured the identical split and called it *"the number that actually matters"*:

> | GUC **is** set … → survives cutover | **15** |
> | GUC is **never** set for the request → returns zero rows on read, raises `new row violates
>   row-level security policy` on write | **145** |

Those are two different jobs with two different owners:

- the first needs **one line deleted** and touches nothing else;
- the second needs a **tenant client acquired where none is acquired today** — the
  wrapper-migration programme, 475 units, its own countdown, its own risk.

So DECORATIVE is narrowed and a fifth category is named:

| category | definition |
|---|---|
| **`DECORATIVE`** | The tenant is in hand **and** `app.current_tenant_id` is **already set** on the connection for that request. Receiver: **`DELETE_FLAG_ONLY`**. |
| **`TENANT_KNOWN_UNSCOPED`** *(new)* | The tenant is in hand from a **verified source** — a JWT claim, a session, a signed token payload, or a row already read under a tenant predicate — and the GUC is **never** set for that request. Receiver: **`getTenantPrismaForOrg(tenantId[, userId])`**, plus deleting the flag in the same edit. **This is the wrapper-migration population and it is CENSUS-ONLY in quick-616**, per the user's decision, so the countdown stays the single place tracking it. |

The worked case the plan anticipated is real. `api/mobile/driver/hos/route.ts:29`:

```ts
export const GET = withMobileAuth(async (req, { auth }) => {
  const { driverId, tenantId } = auth          // the tenant IS known, from the verified JWT
  const data = await prisma.$transaction(async (tx) => {            // on the BARE client
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`
    const rawEntries = await tx.driverHOSEntry.findMany({
      where: { driverId, tenantId, … },                            // and it is IN the where
```

It is not DECORATIVE in the sense that matters — it does not merely lack a need, it has a real need
the bare client cannot meet. It is not CROSS_TENANT, not BOOTSTRAP, not BROKEN_POLICY. Forcing it
into DECORATIVE because DECORATIVE is the nearest of four would have destroyed the census's whole
value: it would have reported "**165 DECORATIVE**" and implied 165 one-line deletions, when the
truth is 13 deletions and 152 client acquisitions.

---

## 6. THE MATRIX — per surface × per category, FILE and STATEMENT counts

Read `Nf / Ms` as *N files / M statements*. File counts are by **containment**, so a surface row's
TOTAL file count can be smaller than the sum of its cells (a file can hold two categories); the
grand-total row is over the whole census and is 87 files, not the column sum.

| surface | BOOTSTRAP | BROKEN POLICY | CROSS TENANT | DECORATIVE | TENANT KNOWN UNSCOPED | TOTAL |
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
| `ADMIN_PORTAL` | — | — | — | — | — | **0f / 0s** |
| `AUTH_PORTAL` | — | — | — | — | — | **0f / 0s** |
| `API_EMAIL_CONFIRM` | — | — | — | — | — | **0f / 0s** |
| `ONBOARDING_PAGES` | — | — | — | — | — | **0f / 0s** |
| **TOTAL** | **1f / 1s** | **6f / 9s** | **2f / 2s** | **6f / 13s** | **77f / 152s** | **87f / 177s** |

`1 + 9 + 2 + 13 + 152 = 177`.

### Per category: what routing it needs, and how many FILES it touches

| category | statements | **files** | what routing it needs | what a batch closing it looks like |
|---|---:|---:|---|---|
| **BOOTSTRAP** | 1 | **1** | Admin connection on one branch only, or a narrow `SECURITY DEFINER`. | One file — `lib/auth/supabase.ts` — but **nine call-chain units reach a transaction through it**, so it is a restructuring task, not an edit. Sized in §8. |
| **BROKEN_POLICY** | 9 | **6** | **DDL. A migration, never a bypass.** Three distinct gaps: `audit_log`'s cast (1), `SupportTicket`'s null-tenant rows (4), `stops` having zero policies on production (4). | Two of the three already have a designed remedy; `stops` needs only shipping staging's existing policy. One migration + a data-model decision on null-tenant tickets. |
| **CROSS_TENANT** | 2 | **2** | A real sequence. Not an admin connection — that would paper over a data-model problem and leave the race. | One migration + two ~6-line call-site edits. **Done in this task** (Task 2). |
| **DECORATIVE** | 13 | **6** | **Delete the line. Nothing else.** | One commit. 13 deletions across 6 files, each with a `getTenantPrisma()` already awaited earlier in the same request. Genuinely trivial — and it is 7% of the population, not 90%. |
| **TENANT_KNOWN_UNSCOPED** | **152** | **77** | `getTenantPrismaForOrg(tenantId[, userId])` acquired where none is acquired today, and the flag deleted in the same edit. Four of them also need a **missing tenant predicate added** (§7.3). | **The whole remaining programme.** 77 files, one task per surface. `MOBILE_API` alone is 83 statements in 47 files and needs splitting (owner 61 / driver 21, the split the surfaces already imply). |

**This is the answer to "a DECORATIVE count of 80 and a CROSS_TENANT count of 80 imply very
different remaining work".** The population is not 161 DECORATIVE + 50 CROSS_TENANT as the 2026-09-12
audit's axis reported, nor 172 DECORATIVE as the design document's. It is **13 one-line deletions,
152 client acquisitions, 9 migrations' worth of policy work, 2 sequence conversions and 1
restructuring**. Four of those five numbers are small.

---

## 7. Per-statement fields, the annotations, and the named subset

`01-census.json` carries one record per statement with all eleven fields: `file` · `line` ·
`enclosingFunction` · `surface` · `category` · `routingNeeded` · `receiver` · `annotationReason` ·
`annotationVerifies` · `annotationNote` · `alreadyAcquiresTenantClient` · `inNamedSubset`
(plus `shape`, `callee` and `inArrayForm`, which the walker records for its own witnesses).

### 7.1 The annotation is a CLAIM, and `no annotation` is a legitimate value

| annotation `reason:` as found | statements |
|---|---:|
| *(none)* | **76** |
| `mobile-api` | 79 |
| `server-side session-authed web route` | 10 |
| `cross-tenant` | 3 |
| `system-operation` | 3 |
| `pre-auth` | 3 |
| `driver-server-component` | 2 |
| `driver-api` | 1 |
| **total annotated** | **101** |

**43% of statements carry no annotation at all.** A census keyed on the annotations would have
missed 76 of 177.

### 7.2 The worked false annotation — same function, two copies, two annotations, one wrong

`src/app/api/mobile/support/ticket/route.ts:39`, read at source:

> `@bypass_rls reason: mobile-api` … `SCOPE: Accesses only data belonging to the authenticated
> user's tenant.` … `SAFETY: Gated by validateMobileToken() above.`

The statement is `supportTicket.findFirst({ orderBy: { ticketNumber: 'desc' } })` with **no tenant
predicate at all** — a cross-tenant maximum. The SCOPE line is false. The SAFETY line is false
twice over: `generateTicketNumber` is a module-level helper, and there is no `validateMobileToken()`
"above" it.

Its web twin at `src/actions/support-tickets.ts:99` is annotated `cross-tenant` and **verifies** —
the docblock says the read is deliberately global and the query is deliberately global.

This is quick-606's decorative-comment finding in a new place, and the inverse of it: quick-606
found comments claiming a bypass the file never set; here a comment claims a scope the query never
had.

### 7.3 Annotations measured FALSE, with the re-read

| statement | verdict | what the code actually says |
|---|---|---|
| `api/mobile/support/ticket/route.ts:39` | **FALSE** | §7.2. |
| `api/mobile/driver/messages/route.ts:109` | **FALSE** | `load.findFirst({ where: { id: resolvedLoadId, driverId } })` — `tenantId` omitted, unlike every sibling query in the same file. Re-read at source, not taken from the prior audit. |

**Two prior-audit claims were re-read and are CORRECTED rather than repeated:**

- `bypass-call-classification.md` §6 says of `mobile/owner/fleet-positions:40` and
  `mobile/owner/map/vehicles:44` that *"their `INNER JOIN "Truck"` / `LEFT JOIN "User"` carry no
  tenant predicate at all."* Re-read: `WHERE gps."tenantId" = $1::uuid` anchors `GPSLocation`; the
  `Load` join **does** carry `l."tenantId" = gps."tenantId"`; the `User` join reaches through `l`
  and is therefore anchored too. The one join stating no predicate of its own is `Truck`, and its
  rows are reached only through already-filtered `gps` rows. The annotation **holds transitively**.
  Recorded as `annotationVerifies: true` with the correction in `annotationNote` — overstating a
  finding is as damaging as missing one.
- `mobile/owner/loads/[id]/route.ts:206` (`invoice.count({ where: { loadId, status } })`, no tenant
  predicate) carries **no annotation at all**, so there is nothing to verify. The audit's note about
  it stands as a code finding; it is not an annotation finding.

### 7.4 `alreadyAcquiresTenantClient` — 13 files, 24 statements, and it is NOT the same as DECORATIVE

Re-derived: **13 files** contain a `getTenantPrisma`/`getTenantPrismaForOrg` **call expression**
somewhere, covering 24 bypass statements. The orchestrator measured 13 files; that reproduces.

**The field is file-level and must not be read as "the GUC is set for this statement."**
`(driver)/actions/driver-routes.ts` is the counter-example the prior audit already named: it
acquires a tenant client in four *other* functions, and `startTrip`'s bypass statement at `:202` is
not one of them. That is why DECORATIVE is 13 statements and not 24.

### 7.5 The named subset — 13 statements, all `inNamedSubset: true`

| statement | category | receiver | audit id |
|---|---|---|---|
| `actions/support-tickets.ts:99` `generateTicketNumber` | CROSS_TENANT | sequence (DDL) | **B7** |
| `api/mobile/support/ticket/route.ts:39` `generateTicketNumber` | CROSS_TENANT | sequence (DDL) | **B7** |
| `lib/auth/supabase.ts:164` `getCurrentUser` | BOOTSTRAP | STOP_AND_REPORT | **B8** |
| `actions/support-tickets.ts:170` `createSupportTicket` | BROKEN_POLICY | POLICY_FIX | design §3.1(5) |
| `actions/support-tickets.ts:218` `getMyTickets` | BROKEN_POLICY | POLICY_FIX | design §3.1(5) |
| `actions/support-tickets.ts:408` `getTicketById` | BROKEN_POLICY | POLICY_FIX | design §3.1(5) |
| `actions/support-tickets.ts:447` `addOwnerReply` | BROKEN_POLICY | POLICY_FIX | design §3.1(5) |
| `lib/automations/evaluator.ts:127` | TENANT_KNOWN_UNSCOPED | `getTenantPrismaForOrg` | admin-conn §9 |
| `api/cron/workflow-digest/route.ts:82` | TENANT_KNOWN_UNSCOPED | `getTenantPrismaForOrg` | admin-conn §9 |
| `api/cron/workflow-digest/route.ts:102` | TENANT_KNOWN_UNSCOPED | `getTenantPrismaForOrg` | admin-conn §9 |
| `api/cron/workflow-digest/route.ts:181` | TENANT_KNOWN_UNSCOPED | `getTenantPrismaForOrg` | admin-conn §9 |
| `api/cron/workflow-digest/route.ts:190` | TENANT_KNOWN_UNSCOPED | `getTenantPrismaForOrg` | admin-conn §9 |
| `api/track/[token]/route.ts:50` GPS lookup | TENANT_KNOWN_UNSCOPED | `getTenantPrismaForOrg` | admin-conn §9 |

**Six of the thirteen are wrapper-migration population and are therefore CENSUS-ONLY here**, per
the user's decision. That is a fact about the subset, not a shortfall in the routing.

---

## 8. Reconciliation against `bypass-call-classification.md`'s 211 / 103

**Transcription is self-checking.** The per-file map in
`scripts/audit/616-audit211-transcription.json` is a hand transcription of that document's §3 and
§4 tables; the census **refuses to run** unless it adds to exactly 211 statements / 103 files, so a
mis-typed row cannot silently explain away a real disappearance. It passes.

**34 statements disappeared. 0 appeared. All 34 are attributed.**

| file | 211-audit | today | gone | attributed to |
|---|---:|---:|---:|---|
| `src/actions/support-tickets.ts` | 8 | 5 | 3 | quick-600 `0c08a959` |
| `src/app/(admin)/actions/automations.ts` | 3 | 0 | 3 | quick-600 `0c08a959` |
| `src/app/(admin)/actions/tenants.ts` | 1 | 0 | 1 | quick-600 `0c08a959` |
| `src/app/(auth)/sign-up/actions.tsx` | 1 | 0 | 1 | quick-601 `a30de408` |
| `src/app/api/auth/accept-invitation/route.ts` | 4 | 2 | 2 | quick-600 `0c08a959` |
| `src/app/api/cron/auto-close-tickets/route.ts` | 1 | 0 | 1 | quick-600 `0c08a959` |
| `src/app/api/cron/automations/route.ts` | 1 | 0 | 1 | quick-600 `0c08a959` |
| `src/app/api/cron/digest-compliance-30day/route.ts` | 1 | 0 | 1 | quick-600 `0c08a959` |
| `src/app/api/cron/digest-daily-driver/route.ts` | 1 | 0 | 1 | quick-600 `0c08a959` |
| `src/app/api/cron/digest-weekly-owner/route.ts` | 1 | 0 | 1 | quick-600 `0c08a959` |
| `src/app/api/cron/send-reminders/route.ts` | 1 | 0 | 1 | quick-600 `0c08a959` |
| `src/app/api/cron/workflow-digest/route.ts` | 5 | 4 | 1 | quick-600 `0c08a959` |
| `src/app/api/cron/workflow-notifications/route.ts` | 4 | 0 | 4 | quick-600 `0c08a959` |
| `src/app/api/email-confirm/[token]/route.ts` | 1 | 0 | 1 | quick-601 `a30de408` — **code → prose** |
| `src/app/api/track/[token]/route.ts` | 2 | 1 | 1 | quick-600 `0c08a959` |
| `src/app/onboarding/welcome/page.tsx` | 3 | 0 | 3 | quick-601 `a30de408` |
| `src/lib/automations/evaluator.ts` | 2 | 1 | 1 | quick-600 `0c08a959` |
| `src/lib/db/repositories/tenant.repository.ts` | 3 | 0 | 3 | quick-600 `0c08a959` (2) + quick-601 `a30de408` (1) |
| `src/lib/email/sender-config.ts` | 1 | 0 | 1 | quick-596 `a7d52a8c` — **code → prose** |
| `src/lib/onboarding/hydrate-tenant.ts` | 2 | 0 | 2 | quick-601 `a30de408` |
| `src/lib/onboarding/provision-tenant.ts` | 1 | 0 | 1 | quick-601 `a30de408` |

**By task: quick-600 = 24 · quick-601 = 9 · quick-596 = 1. Total 34. Unaccounted: ZERO.**

### Two of the 34 needed a different instrument, and that is worth recording

`git log -S` counts **occurrences of the string**, so it is blind to a statement that became a
comment: the occurrence is still there. Two files came back attributed to the commit that *added*
the line rather than the one that retired it —
`api/email-confirm/[token]/route.ts` and `lib/email/sender-config.ts`. `git blame` on the comment
line named the real commits (quick-601 `a30de408`, quick-596 `a7d52a8c`). Both files are in today's
prose-only list, which is what corroborates it independently.

**`-S` alone would have left two statements "unaccounted" and invited the conclusion that the walker
was broken** — the exact failure mode this reconciliation exists to rule out.

### The design document's own arithmetic also reconciles

`bypass-replacement-design.md` §0 says: *"Today's live count is therefore **210 across 102 files**,
and 210 + 1 removed = the 211 the earlier audit enumerated."* That was 2026-09-12, before quick-600
and quick-601. 210 − 24 (quick-600) − 9 (quick-601) = **177**. Three independent accounts agree.

---

## 9. Outside the census — named, counted, deliberately OUT of the matrix

### 9.1 Test paths inside `src/` — 5 statements, 2 files

| file | lines |
|---|---|
| `src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` | 62, 419, 549 |
| `src/__tests__/security/inspection-route-guard.test.ts` | 93, 205 |

### 9.2 Prose-only files inside `src/` — 8 files, 0 statements

Each contains the literal and **no executable call**. Five of them are prose *about the removal*,
written by the task that did the removing — which is why a grep over-counts and a blame is needed.

| file | line | what it is |
|---|---:|---|
| `src/app/api/cron/carrier-auto-dispatch/route.ts` | 47 | a comment stating the file never set the flag (quick-606's finding) |
| `src/app/api/cron/carrier-compliance-alerts/route.ts` | 67 | same |
| `src/app/api/email-confirm/[token]/route.ts` | 53 | quick-601 replaced the bypass with the tenant GUC |
| `src/lib/auth/mobile-auth.ts` | 24 | the pattern documentation — **the census's negative witness** |
| `src/lib/carrier/fleet-trucks.ts` | 86 | states the file carries no flag |
| `src/lib/email/sender-config.ts` | 134 | quick-596 measured the bypass a no-op and removed it |
| `src/lib/onboarding/confirm-tenant-email.ts` | 19 | quick-601 |
| `src/lib/onboarding/onboarding-flags.ts` | 22 | quick-601 |

Five further comment lines live in files that DO carry statements
(`lib/auth/supabase.ts:150`, `lib/notifications/send-push.ts:28`, `lib/security/audit-log.ts:8` and
`:31`, `server/services/workflows/notifications.ts:318`). 8 + 5 = the 13 comment lines the awk
filter drops.

### 9.3 Outside `apps/web/src` entirely — 137 occurrences, 32 files

**None of it ships and none of it is on the `app_user` cutover path.** Counted and named so nobody
has to re-derive the number, and kept out of the matrix so it cannot inflate the remaining work.

| root | files | occurrences | what it is |
|---|---:|---:|---|
| `tests/` | 18 | 87 | the real-database suites. `tests/security/bypass-rls-flag-removal.test.ts` (8) is quick-587's **guard**, which pins retained-vs-removed flag counts across nine files — see the warning below. |
| `scripts/` | 12 | 32 | audit and backfill instruments, including this census itself (6) and quick-602's tripwire verifier (6) |
| `prisma/` | 1 | 15 | `seed.ts` |
| `tests-db/` | 1 | 3 | `rls-isolation/behaviour.test.ts` |

> **A warning for every follow-up batch.** `tests/security/bypass-rls-flag-removal.test.ts` asserts
> an exact `retainedFlags` count per file for nine named files, with `TOTAL_RETAINED = 15`. Deleting
> a flag in any of those nine fails that guard **by design** — rule 2 exists "to stop someone
> finishing the job". The nine are `(driver)/actions/driver-routes.ts`,
> `(owner)/carrier/stops/[id]/page.tsx`, `(owner)/carrier/trips/[id]/page.tsx`,
> `(owner)/carrier/trips/[id]/stops/page.tsx`, `api/driver/stops/[stopId]/documents/route.ts`,
> `api/driver/stops/[stopId]/messages/route.ts`,
> `api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts`,
> `api/mobile/carrier/driver/stops/[stopId]/documents/route.ts`,
> `api/v1/carrier/stops/[id]/messages/route.ts`. **TWELVE of the thirteen DECORATIVE statements are
> inside that guard** — all but `(driver)/actions/driver-dashboard.ts:74` — so the "trivial
> one-commit" DECORATIVE batch must update the guard's numbers deliberately and witness it red,
> not discover it. None of quick-616's own routed edits touches any of the nine.

---

## 10. The walker's anti-vacuity guard

Full red/green transcript in `01-walker-red-green.md`. Summary:

| check | green | what it rules out |
|---|---|---|
| **FLOOR statements** | 177 ≥ 150 | a walker that returns nothing |
| **FLOOR files** | 87 ≥ 80 | the same, by file |
| **POSITIVE WITNESS** `api/mobile/driver/hos/route.ts` | 2 at lines 29, 174 | a walker that finds *something* but not the dominant shape |
| **ARRAY-FORM WITNESS** `lib/auth/supabase.ts` | 1, `inArrayForm: true`, line 164 | a callback-only walker. `prisma.$transaction([ … ])` is the one shape such a walker silently drops, and this file is its only user |
| **COUNTER-ASSERTION — WAS READ** `lib/auth/mobile-auth.ts` | 3821 bytes, parsed, 1 prose occurrence located | a walker that **skipped the file**. Without this half, "yields zero" and "never opened it" are indistinguishable |
| **COUNTER-ASSERTION — YIELDS ZERO** | 0 statements | a walker that counts prose |
| **NO ORPHAN CLASSIFICATION OVERRIDE** | all 35 overrides matched a statement | a hand-written classification whose line number has drifted, silently stops applying, and lets the statement fall to the default |

**Witnessed RED** by `--break-visitor` (the AST visitor returns immediately): 5 of 7 checks fail,
exit **1**, and **nothing is written** — a failed run must not leave a poisoned `01-census.json`
behind, because every follow-up batch is driven from it.

**The two counter-assertions still PASS on the broken walker.** That is correct and is exactly why
they cannot stand alone: a walker returning nothing satisfies "yields zero" perfectly. The floor and
the two positive witnesses are what turn it red. Same shape as quick-563's green-badge
counter-assertion and quick-546's "the failure mode of a bad slice is green".
