# What should we do next — a survey

**quick-569** · **2026-08-30** · branch `master`, HEAD `056713fb`
**READ-ONLY.** No source file changed, no DDL, no production write. Twelve
production `SELECT`s, all read-only. One full vitest run (see §4 for the one
caveat that carries).

---

## Headline

Three things, in order of how much they change the picture.

**1. The most serious item on the deferred list is understated, and the second
is misstated in a way that makes it sound worse than it is and hides what is
actually wrong.** Geocoding is not a degradation risk — **98.7% of trips in
production touch a facility with no coordinates**, so the optimiser is not
degraded, it is off. The signature gap is not "a DVIR with no signatory" —
per-item attribution exists and is complete — it is "a DVIR with no
attestation", and **100% of inspections ever answered in production went down
that path**.

**2. The list is missing a larger class than anything on it.** Eight complete,
shipped owner features — CRM, Compliance, IFTA, Fuel, Lane Analytics, Profit
Predictor, Tags, Subscription — have **no navigation entry on any surface**, and
Phase 12's Help Centre now advertises all eight with written articles. And one
driver-facing server action, `submitIncidentReport`, is a **silent stub**: it
validates, stores nothing, notifies nobody, and returns *"Incident report
submitted successfully. Dispatch has been notified."*

**3. The test and lint gates are stacked but not connected.** All 66 failures
are traceable to four dated events, none of them real broken behaviour — but
**61 further tests, every one of them a security or tenant-isolation test, skip
on every run**, because `vitest.config.ts` never loads `DATABASE_URL`. CI runs
`on: pull_request` only, against a dummy database, and has no lint step at all.

---

# Step 1 — The deferred list, item by item

**ANSWERED.** All 36 items in `12-SUMMARY.md` §7 checked against current source
and production. **Three are closed and should be struck. One is closed in fact
but has left a stale comment behind. Two need their wording corrected. The
other thirty stand.**

## Closed — strike these

| # | Item as written | Current truth |
|---|---|---|
| **7** | *"No Suggested templates section on the Templates screen; the columns exist."* | **CLOSED.** `components/carrier/templates/SuggestedTemplates.tsx` exists and is imported by `app/(owner)/carrier/templates/page.tsx:5`, rendered at `:36`. Its own header says Phase 8 wired it. `isSuggested` + the `(orgId, isSuggested)` index are live in `schema.prisma:2317,2342`. The list was stale before Phase 12 wrote it down. |
| **26** | *"`/carrier/trips` has no sidebar link: a parent with children renders as a `<div>`, not a link."* | **CLOSED by quick-553.** `components/Sidebar/index.tsx:347` carries `href: "/carrier/trips"`. **But `:261` still carries the comment asserting the opposite** — *"so `/carrier/trips` has no sidebar link either. Pre-existing, not…"* — which is the quick-547/548 class exactly: a comment asserting an invariant that has since stopped holding. |
| **23** | *"A facility 'deleted' before quick-530/533 may still be a live match target."* | **Not closed, but unrealised.** `SELECT count(*) FROM facilities WHERE deleted_at IS NOT NULL` returns **0** across all tenants. The code path is still there; there is nothing for it to hit. Reclassify from defect to latent. |

## Needs its wording corrected

| # | Correction |
|---|---|
| **1** | "route optimisation silently degrades" understates it by a wide margin. See §2A: it is not degraded, it declines. |
| **2** | "That is a DVIR with no signatory" is wrong. Every answered item carries `completedByUserId` and `completedAt`. What is missing is the attestation, not the attribution. See §2B. |

## Confirmed still true — evidence

| # | Verified how |
|---|---|
| 1 | 38 of 59 facilities null-coordinate; `createFacility` has no geocode step. §2A |
| 2 | 8 of 24 inspection playbooks have no SIGNATURE step; zero signature rows exist. §2B |
| 3 | `schema.prisma:2677` says *"subject to a retention window"*; no window is implemented. **17 imports currently hold `raw_extraction`, oldest 2026-08-03** — 27 days of third-party PII and counting |
| 4, 5 | `intake.ts` unchanged |
| 6 | `settings/operations/actions.ts:23` names `autoCreateRouteTemplatesFromImports` as still having no screen; `defaultEndStopPolicy` and `homeBaseFacilityId` appear nowhere under `app/(owner)/settings` or `components/settings` |
| 8, 9, 10, 11 | unchanged |
| 12, 13 | board code unchanged |
| 14 | `filterVisibleFacilities` — `grep` returns **one hit, its own `export`**. Still zero callers |
| 15 | mobile `TripInspectionScreen` unchanged |
| 16 | `apps/web/vercel.json:58` — `/api/cron/trip-reminders`, `0 13 * * *`, daily |
| 17 | `DocumentProfile.defaultEndStopPolicy` still unwired |
| 18 | `/help` still inside `(owner)` |
| 19–22 | unchanged |
| 24 | **15** VEHICLE-scoped `PlaybookInstance` rows, of 29 total. Exactly the reported figure |
| 25 | See §3B — the real number is larger and the list names one component that is not orphaned |
| 27 | **7** active inspection playbooks have zero blocking `INSPECTION_ITEM` steps |
| 28 | `apps/web/docs-content/client/` still present |
| 29–36 | unchanged; 31 verified below |

**#31, verified verbatim** — `lib/geo/osrm.ts:23` and `:42`:

```
const OSRM_BASE_URL  = 'http://router.project-osrm.org/route/v1/driving';
const OSRM_TABLE_URL = 'http://router.project-osrm.org/table/v1/driving';
```

Plain HTTP, public demo host, no key, both services. Customer stop addresses go
over that link in cleartext.

**One item the list should record but does not:** `route_matrix_cache` now holds
**1 row**, so quick-520/529's L2 write path has fired at least once in
production. That was open at Phase 7 and is now demonstrated.

**And a good-news correction to quick-548's finding:** `carrier_truck_defects`
held **zero rows across all tenants** when quick-548 diagnosed the bypass. It
now holds **2**. quick-549's fix works, verified by rows and not by reasoning.

---

# Step 2A — Facilities created by import are never geocoded

**ANSWERED.**

## The numbers, from production

```sql
SELECT count(*), count(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)
FROM facilities;
```

| | |
|---|---|
| Facilities, total | **59** |
| With null `latitude` **or** null `longitude` | **38** |
| **Percentage** | **64.4%** |
| Soft-deleted | 0 — so the live percentage is the same 64.4% |

That is the number the brief asked for. It is not the number that matters. This
is:

| | |
|---|---|
| Coordinate-less facilities that are actually on a stop | **18** of 38 |
| Stops sitting on one | **590** of 726 — **81.3%** |
| **Trips touching at least one** | **300** of 304 — **98.7%** |

## What specifically degrades — traced, not assumed

Nothing degrades. It declines. `pointsFor()` in
[optimisation-service.ts:125-146](../../../apps/web/src/lib/document-import/optimisation-service.ts#L125-L146)
is **all-or-nothing**:

```ts
for (const row of rows) {
  if (row.latitude == null || row.longitude == null) return null;
  ...
}
```

One coordinate-less facility in the set returns `null` for the **entire** set —
it does not `continue`, does not substitute, does not geocode on demand. The
ternary at `:483-489` then short-circuits so `getDistanceMatrix` is never
called, `matrix` is `null`, and the view returns `declineReason: 'NO_MATRIX'`.
**The OSRM provider is never contacted.**

The driver-facing consequence is one sentence, from
[optimisation-copy.ts:81-87](../../../apps/web/src/lib/document-import/optimisation-copy.ts#L81-L87):

> *"Driving distances are not available right now. Try again shortly."*

**That sentence is false in both halves.** Nothing is temporarily unavailable and
trying again shortly will never help; the facility has no coordinates and
nothing on any code path will ever give it any. This is the same defect class as
quick-546's *"Please try again"* on a permanent CONFLICT — **an instruction
guaranteed never to succeed**. Route optimisation, the whole of Phase 7's
suggestion half, is unreachable for 98.7% of trips and reports itself as a
transient hiccup.

## The gap is wider than "import-created"

`createFacility` at
[facilities.ts:137-147](../../../apps/web/src/lib/carrier/facilities.ts#L137-L147)
is a bare `prisma.carrierFacility.create`. **`grep geocode` over
`lib/carrier/facilities.ts`, the facilities API route and
`facility-resolution.ts` returns nothing.** The T4 create input built at
[facility-resolution.ts:513-525](../../../apps/web/src/lib/document-import/facility-resolution.ts#L513-L525)
lists eleven fields and neither coordinate. The T4 form's address field
(`StopResolutionList.tsx:376`) is a plain text input.

The **manual** facilities form is the one place coordinates can arrive:
`FacilityForm.tsx:298-313` populates lat/lng from `AddressAutocomplete` when the
user picks a suggestion, and offers two manual number fields. So the honest
statement is: **one of two creation paths can produce coordinates, and only if
the user uses the autocomplete rather than typing.**

## Corroborated by the created-at distribution

| Created | n | null coords | has external ref (import-created) |
|---|---|---|---|
| 2026-08-06 | 7 | **0** | 7 |
| 2026-08-07 | 2 | **0** | 2 |
| 2026-08-28 | 1 | **1** | 1 |
| **2026-08-30** | **5** | **5** | **5** |

Nine import-created facilities from 6–7 August carry coordinates; every
import-created facility since does not. **Five were created today** — real
Milwaukee dealership names, at 19:16–19:17 UTC, three and a half hours before
this survey began and by ordinary user activity, not by anything run here — and
all five have null coordinates. This is live and reproducing, not historical
debt.

> **Stated as ambiguity, not inferred:** I could not establish from the repo how
> the 6–7 August nine got their coordinates. `scripts/backfill-facility-coordinates.ts`
> exists (quick-523, commits `5f27dfc7`/`69c1badd`, 2026-08-15) and its `--apply`
> is recorded as never run — but it was written *after* those rows already had
> coordinates, so it is not the explanation. The most likely account is that
> those addresses matched existing geocoded facilities at T2 rather than being
> created at T4, but the external-reference row is written on T2 backfill too,
> so the reference alone cannot distinguish them. **The backfill script remains
> unrun, and running it would close the 38 rows that exist but nothing about
> the 39th.**

---

# Step 2B — A typed-name inspection signature persists nothing

**ANSWERED**, and the item needs rewording.

## What a typed-name DVIR *does* contain

One `StepInstance` row per checklist item. Verified against production for
every answered inspection item in the database:

| `status` | rows | with `completedByUserId` | with `completedAt` |
|---|---|---|---|
| `NOT_STARTED` | 77 | 0 | 0 |
| `COMPLETE` | 13 | **13** | **13** |
| `FAILED` | 5 | **5** | **5** |

**Every answered item — 18 of 18 — carries who answered it and when.** Plus
`result` (the required note on a fail, and the photo `s3Key`s uploaded at
capture), a `carrier_truck_defects` row per critical failure,
`Trip.inspectionOverridden{ById,Reason,At}` if overridden, and the verdict's
notification side effects.

So the deferred list's *"That is a DVIR with no signatory"* is **not accurate**.
Per-item attribution is complete and is stored at the moment of the answer.

## What it does not contain

There is no record of the **attestation** — the single act of certifying the
vehicle as inspected. Specifically:

- no signature image, and no `s3Key` pointing at one
- no `signedByName` — the driver types their name and it is discarded
- no `signedAt`
- **no row that represents "the DVIR" at all.** There is a bag of per-item rows
  and no header.

The mechanism is visible in one line.
[`signInspection`](<../../../apps/web/src/app/(driver-fullscreen)/inspection/actions.ts#L333>)
takes `{ stepInstanceId, s3Key, signedByName, signedAt }` — it **requires a
SIGNATURE step to write to**. On a playbook with no SIGNATURE step there is no
`stepInstanceId`, and `InspectionRunner.tsx:1152` says so in as many words:
*"null, so the whole grant/PUT/`signInspection` block is skipped"*. There is no
other column on `Trip`, `PlaybookInstance` or `StepInstance` that could hold it.

## How live this is — the number that settles it

| | |
|---|---|
| Active playbooks with ≥1 `INSPECTION_ITEM` | **24**, across **23 tenants** |
| …with **no** SIGNATURE step | **8**, across **7 tenants** (30% of tenants) |
| …with a SIGNATURE step | 16 |
| **Playbook instances with any answered inspection item** | **4** |
| …of those, on a **no-signature** playbook | **4** |
| …on a playbook **with** a signature step | **0** |
| Signature rows anywhere carrying a `signatureUrl` | **0** |
| Signature rows anywhere carrying a `signedByName` | **0** |

**Every inspection ever answered in this database went down the typed-name
path.** Not 30% — all of it. And the corollary matters as much: **the signature
upload path has never once executed against a real tenant**, so quick-550's fix
to it, and quick-533's before that, are unexercised in production.

## Is that defensible for a compliance record?

Two separate answers, and they differ.

**As an internal maintenance record: yes, and it is better than it looks.**
Per-item results with per-item author and timestamp, defect rows, required
failure notes and photos are a fuller record than a signed PDF.

**As a DVIR: no.** The federal driver vehicle inspection report rule requires
the report to be *signed by the driver*. A record with no signature, no typed
name and no signing timestamp does not have the thing the rule names, and the
per-item `completedByUserId` is not a substitute — it records who pressed a
button, not who certified a vehicle. quick-550 was right to change the on-screen
copy from *"Your name and the time below are recorded against it"* to an
attestation, because the old sentence was false. **It remains true that the
product presents a screen headed "Review & sign" whose output contains no
signing event.**

> **Ambiguity, stated:** whether this exposes the tenant is a legal question, not
> an engineering one, and depends on whether they are relying on DriveCommand as
> their DVIR of record or keeping paper. Nothing in the product asks them which.
> That question is itself worth answering before launch.

**Closing it needs a column** — the deferred list is right about that. There is
no DDL-free place to put a name and a timestamp for a checklist that has no
SIGNATURE step.

---

# Step 3 — What the list is missing

**ANSWERED** for four of the five categories, **PARTIALLY ANSWERED** for one
(marked). All five categories produced a real defect during this module. **Three
still have live instances.**

## 3A · Routes with no navigation entry — the largest omission on this page

Method: enumerate every `page.tsx`, strip route groups to get the URL, and check
it against `Sidebar/index.tsx`, `sidebar.config.ts`, `SidebarFooter`,
`SidebarSettingsNav`, `owner-more-menu`, `owner-bottom-nav`, `user-menu`,
`owner-shell` and `settings.config.ts`. Then, for each miss, grep for a real
`href=` anywhere in `src`.

**169 `page.tsx` routes; 112 static.** After discarding `/…/new` create pages
(reached from buttons by design), driver and admin routes (own navs), and hub
children, this is what is left:

| Route | `href=` references anywhere in `src` |
|---|---|
| `/compliance` | **0** |
| `/profit-predictor` | **0** |
| `/fuel` | **0** |
| `/tags` | **0** |
| `/subscription` | **0** |
| `/expenses` | **0** |
| `/carrier/recently-deleted` | **0** — no reference of any kind |
| `/carrier/templates/document-types` | **0** — no reference of any kind |
| `/lane-analytics` | 1 |
| `/ifta` | 2 |
| `/crm` | 6, all `revalidatePath` — **no `href`** |
| `/safety` | conditional, from a dashboard alert only |

`/compliance`, `/ifta`, `/profit-predictor`, `/fuel`, `/lane-analytics`,
`/subscription` appear only in `middleware.ts` (an access allowlist) and
`lib/docs/feature-registry.ts` (documentation). **Neither is a link.**

**This is not a Document Import regression.** The mounted sidebar
(`AnimatedSidebar`, introduced by quick-331) was carrier-first from its first
commit — `git show 6a280742:…/Sidebar/index.tsx` contains no `/crm`, no
`/compliance`, no `/ifta`. What it *did* contain and has since lost:
`/subscription`, `/settings/expense-categories`, `/settings/expense-templates`,
`/ai-documents`, `/carrier/driver-pay`. So this is a **two-generations problem**:
v1–v4 owner features and carrier-model features coexist, and the navigation
exposes only the second.

**What makes it urgent rather than merely untidy is Phase 12.** `HelpGuides`
walks the feature registry and renders every entry that has a `.mdx` file on
disk. All eight of these have one:

```
crm.mdx  compliance-dashboard.mdx  ifta-reporting.mdx  fuel-dashboard.mdx
profit-predictor.mdx  lane-analytics.mdx  tags.mdx  subscription.mdx
```

**`/help` now advertises eight features an owner cannot reach.** That is exactly
the failure quick-566 named — *"when you remove a nav entry, grep the help
articles for the path it described"* — at eight-fold scale, and it arrived by
the opposite route: the articles were surfaced, not the nav removed.

> **Ambiguity, stated loudly:** I cannot tell from the repo whether these eight
> are **deliberately retired** or **accidentally orphaned**, and that distinction
> decides whether the fix is "add nav entries" or "delete the routes and the
> articles". quick-567 established the convention for the first case — *record an
> intentional unlink loudly, because an orphan scanner cannot tell the two
> apart* — and there is no such record for any of these eight. **That is the one
> question in this survey a human has to answer.**

## 3B · Components with no importers

Transitive scan of all 469 files under `src/components`, three rounds:

**21 transitively unreachable.** The deferred list (#25) names eight. The full
set:

```
r1  carrier/documents/DocumentList        r1  dashboard/stat-card
r1  carrier/expenses/ExpenseForm          r1  dashboard/upcoming-maintenance-widget
r1  carrier/fleet/ResendInvitationButton  r1  data-grid/shell/useGridKeyboardNav
r1  dashboard/expiring-documents-widget   r1  driver/completed-route-history
r1  dashboard/notifications-panel         r1  driver/document-list-readonly
r1  driver/gps-tracker                    r1  driver/load-status-button
r1  help/HelpButton                       r1  help/HelpSidebar
r1  maps/vehicle-filter-bar               r1  tracking/ExceptionFlag
r1  tracking/RouteTimeline                r1  ui/sidebar
r1  ui/table                              r2  help/HelpSheet
r2  tracking/RouteStop
```

**The scanner under-reports and I confirmed two cases by hand.** It matches on
basename, so `tracking/StatusPill.tsx` is masked by the live, different
`ui/ds/StatusPill` — the exact collision `CLAUDE.md` already warns about — and
`help/HelpSearch.tsx` is masked by `HelpSearchInline`. Both are genuinely
orphaned. **True figure: at least 23.**

Note `driver/gps-tracker` in that list: an unmounted GPS component sitting
beside a live `driver-gps-ping`. Worth a look before deleting, not because it
is reachable but because two GPS components is a question.

## 3C · API routes with no permission check — **clean, and this is good news**

271 `route.ts` files scanned for any of 28 identity markers. **8 have none, and
all 8 are unauthenticated by design:**

```
auth/callback  auth/login  auth/logout  auth/me
email-confirm/[token]   health   track/[token]   trpc/[trpc]
```

`track/[token]` is explicitly public with IP rate limiting against token
enumeration; `trpc/[trpc]` authenticates in its context. **Every other route
consults identity.** After quick-554 this is the healthiest category on the page.

> **Limit of this scan, stated:** it proves a marker is *present*, not that the
> check is *correct* or gates the right permission. quick-554 found reports APIs
> that had a layer and still let the wrong people through. A marker scan cannot
> find that class.

## 3D · UI whose server half does not exist — **one, and it is serious**

[`app/(driver)/actions/driver-incidents.ts:11-25`](<../../../apps/web/src/app/(driver)/actions/driver-incidents.ts#L11-L25>),
quoted in full:

```ts
export async function submitIncidentReport(prevState, formData) {
  await requireRole([UserRole.DRIVER]);
  const type = formData.get('type') as string;
  const description = formData.get('description') as string;
  ...
  // In production, this would create a safety event record with optional photo uploads
  return { success: true, message: 'Incident report submitted successfully. Dispatch has been notified.' };
}
```

**It validates, writes nothing, notifies nobody, and reports success.**
`getMyIncidentReports` below it returns `[]` with the comment *"Feature scaffold"*.

It is **live and reachable**: `app/(driver)/incidents/page.tsx` renders
`IncidentReportForm`, which calls it via `useActionState`; the route is linked
from `(driver)/more/page.tsx:33` and from `driver-quick-actions.tsx:55` — a
**quick action**, i.e. one of the first things a driver sees.

Production: **`DriverIncident` holds 0 rows.** Consistent with a write path that
has never fired. (The mobile app has a real incident API against the same
model — so the two surfaces disagree, and only the web one lies.)

This is strictly worse than the `dispatchNotified` sentence quick-549 spent a
task fixing. There, the record existed and only the delivery claim was
unfounded. Here **neither exists**, and the subject is a driver reporting a
collision, an injury or a spill.

A repo-wide scan for the same shape found no second instance. Every other
unfinished surface announces itself — *"Full messaging coming soon"*, *"Photo
upload coming soon"*, *"Filters coming soon"*, *"Article content coming soon."*
**`submitIncidentReport` is the only one that claims success.**

## 3E · Copy that asserts what the system cannot know — **still live, six places**

Beyond §3D, the `dispatchNotified` pattern quick-549 fixed on the blocked
screen survives verbatim elsewhere:

| Where | Sentence | Guarded on |
|---|---|---|
| `TripSuccessBanner.tsx:92` | *"Trip {n} started! {driver} has been notified."* | nothing |
| `TripDetailMobile.tsx:491` | *"Driver has been notified."* | `isInProgress` |
| `DispatchLoadsPanel.tsx:152,175` | *"Driver has been notified of the change / of the new load."* | `isInProgress` |
| `StopEditModal.tsx:128` | *"Driver has been notified of the change."* | `isInProgress` |
| `TripAddStopModal.tsx:138` | *"Driver has been notified."* | `isInProgress` |

`isInProgress` is a trip status. **It is not a delivery result.** None of these
inspects whether a notification was dispatched, let alone delivered — and Phase
10 established that the dispatcher can short-circuit to a FAILED audit row on a
null `defaultHtmlCache`, and that the PUSH branch depends on a token that may
not exist. Note `TripSuccessBanner.tsx:218` gets it right one line away:
*"{driverName} **will be** notified"* — future tense, a claim about intent,
which the system can make.

And one more, a different shape: `TemplateOfferCard.tsx:105-106` tells the user
a template *"is in Suggested templates until someone confirms it."* That screen
section **does** exist (see §1), so the sentence is true — worth recording
because the deferred list says otherwise.

**Also found, trivial:** a stray `apps/web/.planning/quick/557-…` directory —
a misplaced artifact from quick-557 sitting inside the app.

---

# Step 4 — The test suite, honestly

**ANSWERED.**

## The run

```
Test files: 600 suites (48 failed)
Tests:      1730 total · 1600 passed · 66 failed · 61 pending
```

Identical to quick-567's published figure (`1730 → 1730, identical 66-test
failing set`), so the suite is stable and my baseline agrees with the last
recorded one. Failures span **18 files**.

> **The one caveat I owe you:** running the suite is not strictly read-only. Four
> `tests/carrier/*` files create a disposable tenant against production and
> delete it in teardown (quick-549's convention). I ran the suite because step 4
> cannot be answered without it. Production was checked afterwards: **zero
> tenants created in the last six hours** (so nothing the run made survived),
> **zero `in_app_notifications` rows with an `org_id` not in `Tenant`**, and
> facility and defect counts unchanged at 59 and 2.

## All 66, classified by root cause

| n | Cause | Ever passing? |
|---|---|---|
| **45** | `` `headers` was called outside a request scope `` → `getTenantId` | **Yes, until 2026-07-17** |
| **8** | `mockGetSession.mockResolvedValue is not a function` | **Yes, until Phase 37.6** |
| **5** | Golden CSV mismatch, driver-pay exporters | **Never, on Windows. Always, on Linux** |
| **3** | `No "REPLY_TO_EMAIL" export is defined on the … mock` | Yes, until the export was added |
| **2** | `validate-mobile-token` — `driverId` undefined | **Yes, until Phase 37.6** |
| **2** | `settlements-paid` void — args mismatch | Yes, until void gained a behaviour |
| **1** | `routeCreateSchema` rejects a valid-looking route | Yes, until `carrierTruckId` became required |

**None of the 66 is real broken behaviour.** Every one is a stale harness or a
local artifact. Detail on the four that matter:

### The 45 — broken by a dated commit, and this is the expensive one

The error is literally `` `headers` was called outside a request scope … at
getTenantId ``. `getTenantId` is reachable only through `getTenantPrisma()`, and
`git log -S getTenantPrisma -- …/fireEvent.ts` dates its arrival precisely:

```
2026-07-17  bdbb547c  refactor(rls): Phase 2 tenant-scoped prisma sweep (Quick-423/424/425/426)
```

Before that commit these modules used the `@/lib/db/prisma` client the tests
mock. After it they resolve a client from a request header that does not exist
under vitest. **The sweep did not update the harnesses, and 45 tests have been
dead ever since.**

**What those 45 cover is the cost:**

```
workflows-complete-step (9)      workflows-dispatch-enforcement (5)
workflows-fail-inspection (5)    workflows-fire-event (5)
workflows-instance (2)           workflows-trigger-router (5)
workflows/playbook router (9)    workflows/stepTemplate router (5)
```

Dispatch-readiness enforcement, the mechanic sign-off on a failed inspection
item, auto-start firing, snapshot immutability, and **cross-tenant `NOT_FOUND`
on the playbook and stepTemplate routers**. That is the Workflow Engine's
guardrail set — the subsystem Phases 9 through 12 were built on top of, and
quick-545 and quick-546 reasoned about at length **with no working tests
underneath them**.

### The 5 golden CSVs — a Windows checkout artifact, not a defect

The diffs show every visible character identical, with the mismatch marker at
end-of-line. `git ls-files --eol` settles it:

```
i/lf  w/crlf   …/exporters/__fixtures__/adp.golden.csv
i/lf  w/crlf   …/exporters/__fixtures__/generic-csv.golden.csv
i/lf  w/crlf   …/exporters/__fixtures__/gusto.1099.golden.csv
i/lf  w/crlf   …/exporters/__fixtures__/gusto.w2.golden.csv
i/lf  w/crlf   …/exporters/__fixtures__/quickbooks.golden.csv
```

LF in the index, **CRLF in the working tree** — the repo has no `.gitattributes`
and `core.autocrlf=true`. The exporters emit LF; `readFileSync` returns CRLF.
**These five pass on CI and on any Linux checkout and have never once passed on
this machine.** Same family as quick-546's source-scanning guard, in a different
tool. Payroll export output is correct.

### The 8 auth mocks + the 2 token tests — Phase 37.6, and one of them asserts the *insecure* shape

`require-auth.test.ts:4` does `vi.mock('@/lib/auth/session', …)` and then imports
from `@/lib/auth/supabase`. **`lib/auth/session.ts` does not exist** — Phase 37.6
consolidated it. The mock binds nothing, `getSession` is the real function, and
`.mockResolvedValue` is not a method on it.

`validate-mobile-token.test.ts` is worse than stale. Its fixture puts claims in
`user_metadata`; `mobile-auth.ts:66` reads `app_metadata`, and its own comment at
`:8-9` says why — *"app_metadata (admin-only, tamper-proof) — not user_metadata,
which is user-writable via updateUser()"*. **The test asserts the pre-hardening,
user-forgeable shape. Making it green by changing the source would re-open the
vulnerability Phase 37.6 closed.**

### The remaining 6

- **dispatcher (3):** the `vi.mock` factory for `@/lib/email/resend-client` is
  missing a `REPLY_TO_EMAIL` export the module later added. The mocked send
  throws; the "email was sent" assertion fails. Real dispatcher unaffected.
- **settlements void (2):** the route now writes `payStatus: 'APPROVED'`
  alongside `settlementId: null` — the assignment is returned to approved rather
  than left marked paid. That is a correct behaviour added without updating the
  assertion.
- **routeCreateSchema (1):** `carrierTruckId` became required; the fixture omits
  it.

## The bigger number: 61 skipped, and every one is a security test

| n | File |
|---|---|
| 15 | `tests/security/restricted-documents.test.ts` |
| 12 | `src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` |
| 6 | `src/__tests__/security/inspection-route-guard.test.ts` |
| 5 | `tests/isolation/cross-tenant.test.ts` |
| 5 | `tests/isolation/dropdowns.test.ts` |
| 5 | `tests/security/audit-log-isolation.test.ts` |
| 4 | `tests/carrier/multi-tenancy.test.ts` |
| 4 | `tests/carrier/financial-integrity.test.ts` |
| 3 | `tests/security/carrier-driver-pii.test.ts` |
| 3 | `src/__tests__/security/input-hardening.test.ts` |
| 1 each | `settlements-concurrent`, `contracted-route-journey` |

Every one gates on `const hasDatabase = !!process.env.DATABASE_URL`.
**`vitest.config.ts` has no `setupFiles` and no dotenv loading**, and the `test`
script is a bare `vitest run` with no `--env-file`. So `DATABASE_URL` is never
populated and **the entire tenant-isolation and security surface skips on every
local run**, silently, reported as "pending".

The newer carrier tests do not have this problem because a later task
**hand-parsed `.env.local` inside the test file** rather than fixing the config
(`document-import-commit-rollback.test.ts:80-95` explains why at length). The
workaround exists; it was never lifted to where all twelve files would benefit.

**And CI makes it worse, not better** (`.github/workflows/ci.yml:39`):

```yaml
# Vitest needs a DATABASE_URL even if tests are mocked; use a dummy value
DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
```

On CI `hasDatabase` is **true**, so all 61 un-skip and run against a database
that does not exist. Combined with the 66 known failures, the Vitest step
cannot pass. The workflow triggers `on: pull_request` to `master`/`develop`
only — and the recorded practice is direct commits to `master` with Vercel
deploys — **so this gate almost certainly never runs.**

> **Ambiguity, stated:** `gh` is not authenticated in this environment, so I
> could not read the workflow's run history. The trigger configuration is a
> fact; "it never runs" is an inference from it plus the commit pattern.

---

# Step 5 — Lint

**ANSWERED.**

## What is actually broken

| | |
|---|---|
| `npm run lint` → `next lint` | `Invalid project directory provided, no such directory: …\apps\web\lint` — Next 16 removed the subcommand and parses `lint` as a path |
| `npx eslint …` | `ESLint couldn't find an eslint.config.(js\|mjs\|cjs) file` |
| Installed | eslint **9.39.2**, flat config mandatory since 9.0 |
| Present | `apps/web/.eslintrc.json` — legacy format only. Same in `apps/mobile`, which has no `lint` script at all |
| Lint during `next build` | **Gone.** `next/dist/build/index.js` contains the string `eslint` exactly **once**, in a source comment (`eslint-disable-next-line`), and `runLintCheck` does not exist anywhere in `next/dist`. `eslint.ignoreDuringBuilds` is moot |
| Lint in CI | **No step.** `ci.yml` runs tsc ×2, vitest, and the raw-prisma audit |

**There is no path by which any lint rule has run on this codebase for the whole
of the Document Import module.** tsc is the only gate that executes.

## What it would take

Small. `eslint-config-next@16.1.6` already ships flat-config entry points
(`./core-web-vitals`, `./typescript`), and both `@eslint/eslintrc` and
`eslint-config-next` are already installed. One new file:

```js
// apps/web/eslint.config.mjs
import coreWebVitals from 'eslint-config-next/core-web-vitals';
export default [
  ...coreWebVitals,
  { rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'error',
      'no-unused-vars': 'off',
  }},
  { ignores: ['.next/**', 'src/generated/**'] },
];
```

plus `"lint": "eslint ."` in `package.json`. No dependency installs. **Expect a
large first-run backlog** — the rules in `.eslintrc.json` have not been enforced
for months and `no-explicit-any` is only a warning, so it should be introduced
with the intent to triage, not to gate immediately.

## What it is currently not catching

Ranked by what has actually bitten this repo:

1. **`react-hooks/exhaustive-deps`** — the single highest-value rule here. Stale
   closures in polling and refresh effects are the exact family quick-547,
   quick-558 and quick-559 all spent tasks on.
2. **`@typescript-eslint/no-unused-vars`** — configured as `error`, enforced
   nowhere. It would have flagged `filterVisibleFacilities` having no caller
   (deferred #14) and the dead-code residue of every deleted component.
3. **`@next/next/no-html-link-for-pages`** and the a11y rules from
   `core-web-vitals` — the surface this product's Section 15 cares about, and
   the one three UX tasks in a row inspected by hand in a browser.
4. **`react/jsx-no-target-blank`**, `no-nested-ternary`, `no-console` — hygiene.
   Note the repo already replaced 222 `console.*` calls by hand once; a rule
   would keep it there.

**What lint would *not* have caught, and it is worth saying:** nothing in §2, §3
or §4 of this survey. Every finding here is a wiring, data or copy problem.
Lint is worth fixing, and it is not where the risk is.

---

# Step 6 — Ranking

**ANSWERED.** Ranked on user impact and risk. Effort is noted only where it
changes the order.

## DO NEXT

| # | What | Why it is first |
|---|---|---|
| **1** | **`submitIncidentReport` — make it write, or take the screen down.** | A driver reports a collision and the product says *"submitted successfully. Dispatch has been notified."* Nothing is stored, nobody is told, `DriverIncident` has 0 rows. It is on a quick action. This is the only place in the codebase that claims success for work it did not do, and the subject is safety. If the real implementation is not a small job, **removing the screen today is better than leaving it**, because a driver who believes they reported something stops trying to report it. |
| **2** | **Decide the fate of the eight unreachable owner features — and act on the decision.** | CRM, Compliance, IFTA, Fuel, Lane Analytics, Profit Predictor, Tags, Subscription. Eight complete features with no link on any surface, and `/help` now advertises all eight. Either wire them or retire them and delete the articles. **This needs a human answer, not an engineering one** — and until it comes, `/help` is the product's most misleading page. |
| **3** | **Give geocoding to `createFacility`.** | 98.7% of trips touch a coordinate-less facility, so Phase 7's optimiser is off, not degraded — and it reports itself as *"try again shortly"*, an instruction guaranteed never to succeed. Fix the create path first (the 39th facility), then run quick-523's backfill for the 38 that exist. `AddressAutocomplete`'s geocoder is already in the repo. |
| **4** | **Load `DATABASE_URL` in `vitest.config.ts`.** | One line. It un-skips 61 tests, every one of them a security or tenant-isolation test, on a multi-tenant SaaS about to launch. **Expect them to fail at first** — that is the point; you currently cannot tell whether tenant isolation holds, and "we don't know" is the finding. The `.env.local` parser those files need already exists inside `document-import-commit-rollback.test.ts`; lift it. |

## DO BEFORE LAUNCH

| # | What | Why |
|---|---|---|
| 5 | **Revive the 45 dead workflow tests.** | Dispatch enforcement, mechanic sign-off, auto-start, and cross-tenant `NOT_FOUND` on two routers have been unasserted since `bdbb547c` (2026-07-17) — the whole period Phases 9–12 were built on top of them. Fix is per-file: inject a tenant client rather than mocking the bare prisma. |
| 6 | **A column for the inspection attestation.** | 100% of production inspections take the driver's typed name and discard it. A "Review & sign" screen whose output contains no signing event. Needs DDL; it is the only item here that does. |
| 7 | **RLS Phase 2 cutover** (deferred #29, #30). | Known to break `carrier_documents` (RLS forced, zero policies) and to silently stop `route_matrix_cache` caching (RLS off, no grant). The GUC pool leak is empirically confirmed. This is a launch blocker with a known blast radius, which is the good kind. |
| 8 | **HTTPS and a real host for OSRM.** | `http://router.project-osrm.org` — plain HTTP, public demo, no key, no SLA. Customer stop addresses in cleartext, and a third party can see and stop your routing. |
| 9 | **A retention window on `raw_extraction`.** | The schema comment promises one; there is none. 17 imports holding third-party PII, oldest 27 days. A promise in a schema comment is not a control. |
| 10 | **Section 16's 18-step acceptance test, run once end to end** (deferred #34). | It has never been run. Step 18 — photo to committed trip in 3 taps under 90 seconds — is the module's headline claim and has never been timed. |
| 11 | **The six "has been notified" sentences.** | Same class quick-549 fixed on one screen and left on six. `isInProgress` is a trip status, not a delivery result. Cheapest correct fix is quick-549's: change the tense. `TripSuccessBanner.tsx:218` already shows the right wording one line away. |
| 12 | **Browser-test Phase 10's subscribe and preference controls** (deferred #33). | `UserNotificationPreference` still holds **0 rows** in production. Phase 10 fixed a create path that had never once succeeded; there is no evidence it now does. Ambiguous — could be a working feature nobody has used — and that ambiguity is precisely the reason to check. |

## DO EVENTUALLY

| # | What | Why not sooner |
|---|---|---|
| 13 | Restore lint (§5). | Real value, but nothing in this survey would have been caught by it. Expect a triage backlog. |
| 14 | Delete or wire the 23 orphaned components. | Dead code, not wrong code. Do it in the same pass as item 2, which will settle several of them. |
| 15 | `.gitattributes` with `*.csv text eol=lf`. | Removes 5 permanent false failures from every Windows checkout. Small, and the tests are right. |
| 16 | Repair the 21 remaining stale fixtures (auth mocks, token shape, schema, dispatcher, settlements). | Each is a small correct edit. **Do not "fix" `validate-mobile-token` by touching the source** — the test asserts the pre-hardening `user_metadata` shape and the source is right. |
| 17 | Fix `ci.yml`: real trigger, real database or no database, add lint. | Follows items 4, 5 and 13; fixing the workflow before the tests pass just makes it red. |
| 18 | Screens for the three headless tenant settings (deferred #6). | Documented as database-only, which is honest. Needed when a second tenant needs a different answer. |
| 19 | Driver access to `/help` (deferred #18). | Nine articles written for drivers that only owners can read. |
| 20 | The two performance items (deferred #21, #22). | Every facility and client per keystroke; one HOS query per driver. Real, currently invisible at this data volume. |
| 21 | The stale comment at `Sidebar/index.tsx:261`, and the stray `apps/web/.planning/` directory. | Ten minutes, and the comment asserts a false invariant, which is the class that has cost this repo three tasks. |

## DO NOT DO

| What | Why not |
|---|---|
| **Chase the 66 test failures as bugs.** | Every one is a stale harness or a CRLF artifact. Not one is broken product behaviour. The 61 *skipped* tests are where the risk is; the 66 are noise that has been mistaken for a debt. |
| **Delete the 15 orphaned VEHICLE-scoped playbook instances** (deferred #24). | quick-546 already settled this and the reasoning holds: no `deletedAt`, no CANCELLED status, so the only options are an irreversible delete or DDL. They block nothing, are unreachable from `findTripInspection`, and the newest answered one is far outside the validity window. Marking them COMPLETED would be a lie in a DVIR audit trail. |
| **Act on deferred #23** (facilities deleted before quick-530/533). | Zero soft-deleted facilities exist in production. There is nothing to fix. Leave it recorded as latent. |
| **Build `.xlsx` upload** (deferred #4). | No library may be installed, CSV covers the format, and nothing in production has asked for it. It is on the list because it was deferred, not because it is wanted. |
| **Build a binary offline queue for inspection photos** (deferred #10). | `CLAUDE.md` already forbids it and the reason is sound: upload-at-capture is correct, the note stays required, and the offline case is reported to the driver by name. |
| **Deduplicate the two blocked-inspection notifications** (deferred #19). | Deliberate. The guaranteed path backs a sentence on the driver's blocked screen; removing it turns that sentence into a lie for any tenant with no subscribers. |
| **Unify `findTripInspection` and `findValidPriorInspection`** shapes. | quick-546 established these answer different questions and must stay apart. Recorded here because it looks like duplication and will be proposed again. |
| **A repo-wide polling-interval ladder.** | quick-559 recommended against it and was right: the six intervals are individually defensible, and collapsing them means picking one endpoint's answer for all six. `/vehicles` at 15s and `/live-board` at 30s are *correctly* different. |
| **Any redesign, design system pass, or rewrite.** | Out of scope by the brief, and nothing found here argues for one. Every finding is a wiring, data, or copy problem in code that is otherwise sound. |

---

# Per-item audit

| Step | Asked for | Status | Note |
|---|---|---|---|
| **1** | Read the deferred list in full; state whether each item is still true; report what is already fixed | **ANSWERED** | All 36 checked. 2 closed (#7, #26), 1 unrealised (#23), 2 reworded (#1, #2), 31 confirmed. Two positive corrections added (`route_matrix_cache`, `carrier_truck_defects`) |
| **2a** | Facility geocoding: how many null, what %, what degrades | **ANSWERED** | 38/59 = 64.4%; 590/726 stops; **300/304 trips**. Degradation traced to `pointsFor()` returning null for the whole set → `NO_MATRIX` → OSRM never called. Gap is wider than import-created. One ambiguity stated: how the 6–7 Aug nine got coordinates |
| **2b** | Typed-name signature: what a DVIR contains and does not, and whether that is defensible | **ANSWERED** | Contains per-item status, author, timestamp, note, photos — 18/18 complete. Missing: signature, typed name, signing timestamp, any DVIR header row. 8/24 playbooks, 7/23 tenants, **4 of 4 answered instances**, 0 signature rows anywhere. Defensible as maintenance record, not as a DVIR. Legal exposure flagged as a question for a human |
| **3** | Routes with no nav; components with no importers; API routes with no permission check; UI/server halves; copy asserting the unknowable | **PARTIALLY ANSWERED** | Four of five fully answered with scans. **The UI/server-half category is answered by one confirmed instance plus a repo-wide scan for the same shape, which found no second — but that scan keys on comment phrasing, so a stub written without a comment would be invisible to it.** All five categories still have live instances except API permissions, which is clean |
| **4** | Test suite: what the 66 are, were they passing, real or stale | **ANSWERED** | 1730/1600/66/61. All 66 classified to four dated causes, none real behaviour. 45 broken by `bdbb547c` on 2026-07-17; 10 by Phase 37.6; 5 never passed on Windows and always pass on Linux; 6 by later correct behaviour changes. **Plus the larger finding: 61 skipped, all security/isolation, on every run** |
| **5** | Lint: what it would take, what it is not catching | **ANSWERED** | `next lint` removed in Next 16; ESLint 9 needs flat config; **`next build` no longer lints at all** (verified in `next/dist`); no CI lint step. Fix is one new file, zero installs. Not-catching list ranked; stated plainly that lint would not have caught anything else in this survey |
| **6** | Rank into do next / before launch / eventually / do not do, with reasons for "do not do" | **ANSWERED** | 4 / 8 / 9 / 9. Every "do not do" carries its reason; five of them cite a prior task that already settled the question |

---

## Method notes

- Production figures come from twelve read-only `SELECT`s against
  `oqdhberkghtnszrkdvfm`. Nothing was written.
- Source claims are quoted with file and line. Where a claim rests on absence
  (no geocoder, no lint step), the absence was established by a scan whose
  scope is stated.
- Scan scripts were written to the session scratchpad, not to the repo.
- `npx tsc --noEmit` in `apps/web`: **0 errors**, and `git status` shows no
  untracked source, so the blind-gate trap is not active. **I did not inject a
  probe**, because the brief forbids writes — that is a stated weakening of the
  usual evidence, not an oversight.
- Suite counts read from the `Test Files … | Tests …` summary and a JSON report,
  per quick-557's rule. Both agree.
- `gh` is unauthenticated here, so CI *run history* is unverified. The
  workflow's trigger and env are quoted from the file.
