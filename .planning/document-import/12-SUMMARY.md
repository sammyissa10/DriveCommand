# Phase 12 — In-app documentation

**Date:** 2026-08-26 · **Branch:** `feature/document-import` · **Pre-task commit:** `a04685b1`
**Scope:** documentation, plus two navigation wire-ups that were required to make it reachable.
**No DDL. No dependencies added. No production data written.**

---

## What this phase turned out to be

The prompt asked for documentation. Two thirds of the work was documentation. The
other third was the discovery, in Step 0, that **the customer-facing help system
had 57 written articles that nothing in the product linked to** — and that the
settings page owning both inspection settings had never been added to the
settings navigation.

Both were found the same way quick-552 found the orphaned sidebar: by enumerating
`a[href]` in a real browser rather than by reading the code that was supposed to
render the links.

---

## 1 · The orphaned help system — a finding in its own right

This is recorded separately from the nav work because it is a defect class, not a
task. Five separate pieces of a shipped feature, none of them reachable:

| What | State before this phase |
|---|---|
| `docs-content/client/*.mdx` — 57 written articles | Rendered correctly at `/help/{slug}`. **Zero inbound links anywhere in `src/`.** Reachable only by typing the URL |
| `/help/whats-new` | The one page that links every article to its registry entry. **No inbound link anywhere** |
| `HelpSidebar.tsx`, `HelpSearch.tsx`, `HelpButton.tsx`, `HelpSheet.tsx` | Four components, **zero importers** |
| `src/lib/docs/search-index.json` | A generated Fuse index read only by the two orphaned search components — so consumed by nothing rendered |
| `apps/web/docs-content/` | A decoy directory holding one stale copy of `load-management.mdx`. The live root is `<repo>/docs-content/`, resolved from `process.cwd()` |

And the part that makes it worse: `/help/{category}/{article}` — the URLs the
help index actually links to — is **hardcoded to render "Article content coming
soon."** ([page.tsx:59-66](../../apps/web/src/app/(owner)/help/[categoryOrSlug]/[article]/page.tsx#L59-L66)).
So every path a customer could click ended at a stub, and every path that had
writing on it had to be typed.

**How it survived:** the same way the orphaned sidebar did. Every individual
piece works. `renderClientDoc` works, the MDX compiles, the frontmatter
validates, the CI doc-drift gate passes, and the pages return 200. Nothing fails.
The only thing missing is the link, and no test in this repo — before or after
this phase — asserts that a page is reachable.

**Not fixed here (reported):** the four orphaned help components and the stub
article route. Deleting or wiring them is a decision, not a side effect of a
documentation phase. `search-index.json` now has a consumer again in principle
(the registry it is generated from is the same one `HelpGuides` walks) but the
two components that read it are still unmounted.

---

## 2 · Navigation wire-up — both deliverables, verified by DOM

### A. Operations settings

**File edited:** `apps/web/src/components/settings/settings.config.ts`

`SETTINGS_PAGE_META` already carried an `operations` entry — so the page rendered
its own header correctly and looked finished — while `SETTINGS_NAV_SECTIONS` did
not. `/settings/operations` owns `requirePreTripInspection` and
`blockTripStartOnFailedInspection`; the only route to either was a typed URL.

This takes the Configuration section to nine items against a stated cap of eight.
The cap exists to force the discussion, and the alternative was documenting a
settings page a customer cannot open. Recorded in the file itself.

**Click path:** sidebar **Settings** → **Operations**.

**Verified:** DOM query of `a[href^="/settings"]` on `/settings/workspace` returns
nine links, including `/settings/operations :: Operations`. Before the change it
returned eight and Operations was absent.

### B. The written articles

**Files edited:** `apps/web/src/app/(owner)/help/page.tsx` · new
`apps/web/src/components/help/HelpGuides.tsx` · `docs-content/_ia.json`

`HelpGuides` walks the **feature registry**, keeps the entries that have an MDX
file on disk, and groups them by the hubs in `_ia.json`, with a *More guides*
bucket for anything filed nowhere. Registry-first rather than directory-first is
deliberate: `/help/{slug}` resolves through `renderClientDoc`, which looks the
slug up in the registry and throws when it is absent, so a link built from a
filename can still 404 — a link built from a registry entry that has a file
cannot.

**Click path:** top bar **?** (or sidebar **Help**) → **Guides** → the article.

**Verified:** DOM query of `a[href^="/help/"]` on `/help` returned **0** article
links before and **68** after, then every one of the eight new articles was
reached by *clicking the link on `/help`* — no typed URLs — and its rendered word
count read back. The fix is general: the 57 pre-existing articles are now
reachable too (`/help/carrier-loads`, `/help/invoices`, `/help/driver-hours`
spot-checked), and `/help/whats-new` has an inbound link for the first time.

---

## 3 · Build items

### Item 1 — Feature registry entries · IMPLEMENTED

Eight entries appended to `src/lib/docs/feature-registry.ts` (62 → 70). The six
the prompt named, plus two the articles needed a home for:

| Slug | Name | Portal | Governed by |
|---|---|---|---|
| `document-import` | Document Import | owner | — |
| `facility-matching` | Facility Matching | owner | — |
| `route-template-matching` | Route Template Matching | owner | `autoCreateRouteTemplatesFromImports` |
| `end-stop-policy` | End Stop Policy | owner | `defaultEndStopPolicy`, `homeBaseFacilityId` |
| `inspection-gate` | Pre-Trip Inspection Gate | shared | `requirePreTripInspection`, `blockTripStartOnFailedInspection` |
| `live-board-views` | Live Board | owner | — |
| `todays-trips-report` | Today's Trips Report | owner | — |
| `driver-trip-start` | Starting a Trip | driver | `requirePreTripInspection` |

`facility-matching` and `driver-trip-start` are additions to the prompt's list,
stated rather than slipped in: the prompt asks for an article on unrecognised
stop addresses and for driver-facing help, and this system is one-file-per-slug —
a file whose basename is not a registry slug is a `/help/*` link that 404s.
Both name real user-facing capabilities.

`requiresSysadminDoc: false` on all eight, with the reason in the file: this
module's technical documentation is `docs/technical-documentation.md` §11, and a
second technical home would drift from it. Two pre-existing entries already use
that flag.

**Also fixed, one line:** the pre-existing `route-templates` entry pointed at
`/carrier/route-templates`, which **404s**; the real route is `/carrier/templates`.
Found while checking a link I was about to document, confirmed in the browser
(404 vs 200).

**Verified:** the registry validates its own contents at module load (Zod, plus a
second pass over `relatedFeatureSlugs`), so it loading at all is the check — run
explicitly via `tsx`, 70 features, all eight present, all related slugs resolving.
`npx tsx scripts/check-doc-drift.ts` exits 0 with no missing docs.

### Item 2 — Help centre articles · IMPLEMENTED

Eight articles in `docs-content/client/`. Each renders through the real MDX
pipeline with `Callout`, `StepFlow`, `ProcessDiagram`, `ComparisonTable` and
`FeatureCard`; step lists wherever a flow exceeds three steps; no field names, no
table names, no status enums, no internal vocabulary.

| Article | Requested as |
|---|---|
| Importing your morning manifest | ✔ |
| What to do when a stop address is not recognised | ✔ |
| Using and updating route templates | ✔ |
| Setting where your trips end | ✔ |
| Turning the pre-trip inspection on or off | ✔ |
| Reading the Today's Trips report | ✔ |
| Reading the Live Board | needed so the registry entry's link resolves |
| Starting a trip and doing the walkaround | item 4 |

### Item 3 — Settings documentation · IMPLEMENTED

All five tenant settings, each with default, effect and who it affects: the
consolidated table is `docs/technical-documentation.md` §11, and each setting is
also explained in plain language in the article a dispatcher would be reading
when they hit it.

**Defaults verified against the live database, not the schema** (DEC-17):
`information_schema.columns` on production returns `false`, `true`, `'NONE'::text`,
`null`, `false` — matching `schema.prisma` exactly. The demo tenant's own values
(`HOME_BASE` with a home base facility set) were read back too, which is what
made "Ends at 112" on the summary card explicable rather than mysterious.

**Three of the five have no settings screen** — `autoCreateRouteTemplatesFromImports`,
`defaultEndStopPolicy`, `homeBaseFacilityId` are database-only. The articles say
so and tell the reader to ask support, rather than describing a screen that does
not exist.

### Item 4 — Driver-facing help · IMPLEMENTED, with the verification method stated

`driver-trip-start.mdx`, kept short: starting a trip, getting through the
walkaround, and what to do when it fails.

**How it was verified:** from the copy constants and gate logic that render
literally — `inspectionCopy` in `inspection-handlers.ts`, the `copy` object in
`InspectionRunner.tsx`, the begin screen in `InspectionClient.tsx`, and
`blocked/page.tsx` — plus the outcome branches in `inspection-gate.ts` and its 47
tests. **Not observed in a driver session.** There are no driver credentials in
this environment and guessing a password on a real account was not on the table.
The user reports having driven the blocked screen, the fail form and the sign
screen this session; the article was written to agree with what those render.

Two claims were deliberately weakened after reading the code: the sign step says
*most checklists ask you to sign with your finger; some ask only for your printed
name*, because both variants exist; and it does **not** say the typed name is
recorded, because on that variant nothing is persisted (quick-550).

One structural limitation worth knowing: `/help` lives in the owner route group
and a driver is redirected to `/unauthorized`. **Drivers cannot read the driver
help.** It is written for the dispatcher briefing them. That is pre-existing —
eight `driver-*.mdx` articles were already in that position — and is on the
deferred list rather than fixed here.

### Item 5 — `docs/technical-documentation.md` · IMPLEMENTED

New §11 Document Import, following §10's shape: overview, entity flow diagram,
lifecycle, new and extended tables, the tenant settings table, 23 API route
groups (49 route files, both surfaces from one handler module), 12 microflows,
and 17 architectural rules that should not be broken. Header date updated.

### Item 6 — Spec corrections · IMPLEMENTED

`docs/specs/DocumentImport_TechnicalSpec_v1.md` now opens with a **v1.1 changelog**
of 20 divergences: what was specified, what was built, and why. Eight in-body
corrections are marked `[v1.1 — as built]` at the point where the original wording
would mislead — Sections 5, 7, 8, 9, 11, 12, 15 and 16.

Two entries are marked as open items rather than decisions, per the ruling:

- **§15 retention window on `rawExtraction` — NOT BUILT.** Nothing purges it, on
  any schedule. The schema comment says it is "subject to a retention window",
  which no code enforces. It holds third-party PII.
- **§16 acceptance test — NOT RUN.** Never executed end to end; step 18's
  "under 90 seconds, 3 taps" has never been timed.

### Ruling 4 — stale phase summaries corrected

`07-SUMMARY.md` items 2 and 3 are struck through in place, each with a dated
correction naming quick-520 as what closed it, and the original text kept beneath
so the correction is visible rather than silent. Both claimed a column did not
exist; **both columns are in production** (`route_templates.end_stop_facility_id`,
`route_matrix_cache`), verified against `information_schema`. The matching stale
bullet in `CLAUDE.md` is rewritten.

---

## 4 · How each documented behaviour was verified

Everything below was driven in Chromium against the running dev server as the
demo owner, on real production data in the DriveCommand Demo tenant, unless the
row says otherwise.

| Documented | Method |
|---|---|
| Import list, statuses (Needs review / Trip created / Failed) | Walked `/carrier/imports` |
| Wizard: Take photos · Upload file · Choose recent · Read document | Walked `/carrier/imports/new` |
| Summary card: client, contract, template, end stop, date, stop counts, "why" affordances, extraction warnings | Walked three real imports (6-stop manifest, 7-stop manifest, rate confirmation) |
| One-time spot contract, labelled and priced | Seen on a real rate-confirmation import: *One-time — RC AFB-2026-11482 (2026-08-04) · $1,992.00 flat* |
| Template matched, with "6 matched · 1 not on today's manifest" and **Use this template** | Seen on the 6-stop manifest |
| Template below threshold: *Nothing saved looks like today's run* + **Continue without a template** | Seen on the rate confirmation |
| Stop review: linked stops, quantities, references, warning summary, blocking count | Walked `/carrier/imports/{id}/stops` |
| The 11-field stop editor | Opened a stop |
| **T4** — *Nothing matched. This creates a new facility from what the document says*, pre-filled, **Create and link** | Opened **Resolve** on an unresolved stop |
| **T3** — the proposal list with differences, score and **Link** | **Not produced by the demo data.** Same component, one branch away from the T4 form I watched render; copy read from source. Stated as a limit |
| End stop: **Ends at 112**, the five policy options, **Use my company default** | Opened the **Change end stop** control |
| End stop resolving from the tenant default | Cross-checked the rendered value against the tenant row (`HOME_BASE` + home base facility) |
| Assign screen: driver and truck availability, expiry warnings, planned start, warning summary, **Create trip** | Walked `/carrier/imports/{id}/assign` |
| Post-commit **Save this run as a route template** | Seen on the committed import |
| Live Board: Drivers/Trucks toggle swapping the leading column and the facts | Clicked the toggle; Drivers shows *Current or next stop · Stops · Window closes*, Trucks shows *Current location · On duty today · Next due / Insurance due* |
| Today's Trips: 13 columns, attention sort (Not started above On track), four filters, Columns, Export | Walked the report |
| "No windows set" as the on-time state | Seen on every trip in the tenant — which is the point of DEC-18 |
| Operations settings copy and the "nothing can block a trip" warning | Walked `/settings/operations` |
| Inspection override lives on the trip, not the board | Opened a real trip: the **Pre-trip inspection** section renders the gate state |
| The override dialog's own wording and the minimum-length reason | **Read from `TripInspectionPanel.tsx`.** The control is conditional on an outcome this tenant cannot produce with inspections off, and flipping a production tenant setting to see it was not acceptable |
| Driver walkaround, blocked screen, signature | **Source only** — see item 4 |
| Duplicate upload: **Open the existing import** / **Import as a correction** | **Source only** (`ImportWizard.tsx`, `intake.ts`). Producing it needs a real upload |
| Excel refusal and the 25MB cap | **Source only** (`intake.ts`, `upload.ts`) |
| Mobile surfaces | **Not verified.** Emulator, out of scope for this phase |

---

## 5 · Gates

| Gate | Result |
|---|---|
| tsc probe (`apps/web`) | Deliberate `TS2322` injected into `HelpGuides.tsx`; tsc reported **exactly one error, mine**. Gate confirmed live, not blind |
| Probe removed | Verified by grep — 0 occurrences of the marker |
| `npx tsc --noEmit` `apps/web` | **0 errors** (re-run after deleting `.next` and `tsconfig.tsbuildinfo`) |
| `npx tsc --noEmit` `apps/mobile` | **0 errors** |
| `npx tsx scripts/check-doc-drift.ts` | **exit 0**, no missing docs |
| Full suite, after | 18 files / 66 tests failing · 121 files / 1465 tests passing |
| Full suite, baseline (`a04685b1` versions of the four changed source files) | 18 files / 66 tests failing · 121 files / 1465 tests passing |
| Diff | **Identical failing-file sets. Zero regressions.** No test in this repo references the feature registry, the settings config or `HelpGuides` |
| Dependencies | None added. `git diff` on `package.json` / lockfiles is empty |
| DDL | None |

**Baseline method, stated because it is not the usual one.** No worktree: the
binding patterns forbid symlinking `node_modules` into one, and a worktree with
no `node_modules` cannot run vitest. Instead the four changed source files were
copied aside, replaced with `git show a04685b1:<path>`, the suite run, and the
files copied back — the working tree only ever seeing ordinary file writes.

**Cost of that, recorded:** momentarily deleting `HelpGuides.tsx` poisoned the
running dev server's Turbopack cache, exactly as `CLAUDE.md` warns, and the next
browser check reported everything unreachable. The files on disk were correct the
whole time. Remedy per the same note: stop the server, delete `.next`, restart —
after which every check passed again. **A red browser check after a file swap is
a stale bundler before it is a regression**, but it must be re-run rather than
assumed, which is what happened here.

---

## 6 · Per-item audit

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Feature registry entries, one per capability, with roles and governing settings | **IMPLEMENTED** | 8 entries, registry loads and self-validates, drift gate exits 0 |
| 2 | Six help centre articles for a dispatcher | **IMPLEMENTED** | 8 articles; all six requested titles present; each reached by clicking from `/help` |
| 3 | Settings documentation for every new tenant setting | **IMPLEMENTED** | 5 of 5; defaults read from `information_schema` on production; the three with no screen say so |
| 4 | Driver-facing help | **IMPLEMENTED**, verification method stated | Written from copy constants and gate logic; not observed in a driver session |
| 5 | `docs/technical-documentation.md` Document Import section | **IMPLEMENTED** | §11: entity flow, 23 route groups, 12 microflows, 17 rules |
| 6 | Spec corrected + changelog | **IMPLEMENTED** | v1.1 changelog of 20 divergences, 8 in-body corrections |
| — | Nav wire-up (ruling 1) | **IMPLEMENTED** | Both, verified by DOM query and by clicking through |
| — | Orphaned help system recorded (ruling 2) | **IMPLEMENTED** | §1 above |
| — | Phase summaries corrected (ruling 4) | **IMPLEMENTED** | 07-SUMMARY items 2 and 3, plus CLAUDE.md |
| — | Deferred list whole, three groups (ruling 6) | **IMPLEMENTED** | §7 below |

---

## 7 · Deferred across all twelve phases

Two items are flagged as more serious than their neighbours, per ruling 6.

### Product gaps — the thing does not exist

1. **⚠ Created facilities are never geocoded.** A facility created at T4 has no
   coordinates, and route optimisation silently degrades — no error, no warning,
   just worse suggestions or none. **The failure is invisible**, which is what
   makes this the most serious gap on the list. Diagnosed in quick-522, a backfill
   script was written in quick-523 and its `--apply` has never been run.
2. **⚠ A typed-name signature persists nothing.** On a checklist with no
   signature step, the driver's attestation is taken and stored nowhere: no record
   of who attested or when. **That is a DVIR with no signatory**, which is exactly
   what a roadside inspection asks for. Closing it needs a column. The on-screen
   copy was corrected in quick-550 so it no longer claims otherwise.
3. No retention window on `rawExtraction`, despite the spec and the schema comment
   both saying there is one. It holds third-party PII.
4. `.xlsx` upload — CSV only.
5. Per-page caching does not apply to PDFs; a PDF is one cache unit.
6. Three of five tenant settings have no screen: `autoCreateRouteTemplatesFromImports`,
   `defaultEndStopPolicy`, `homeBaseFacilityId`.
7. No *Suggested templates* section on the Templates screen; the columns exist.
8. No drag-to-reorder on mobile (arrows instead) — needs a gesture handler.
9. No date or time pickers on either surface — typed fields.
10. No offline capture for inspections, on either surface.
11. One load per committed import; a manifest split across two clients is not modelled.
12. No reverse geocoder on the board — location is derived from stop state.
13. No maintenance source for `CarrierTruck`; the board shows the nearest expiry date instead.
14. `filterVisibleFacilities` has no caller — there is no facility export yet.
15. Mobile `TripInspectionScreen` has no typed-name variant: on a checklist with
    no signature step the driver draws a signature that is then discarded.
16. `trip.reminder` fires once daily, not hours before departure (Vercel Hobby plan).
17. `DocumentProfile.defaultEndStopPolicy` exists and is deliberately unwired.
18. Drivers cannot reach the Help Centre — `/help` is owner-only, so all nine
    driver articles are readable only by owners and managers.

### Known defects and accepted limits

19. A subscriber who is also the named dispatcher gets two notifications for a
    blocked inspection. Deliberate: the guaranteed path backs a sentence on the
    driver's blocked screen.
20. Two dispatchers editing one import is last-write-wins over the whole reviewed
    document.
21. The resolution view loads every facility and every client in the tenant on
    each keystroke of the client picker.
22. `getCommitPreview` issues one hours-of-service query per driver.
23. A facility "deleted" before quick-530/533 may still be a live match target.
24. Fifteen orphaned vehicle-scoped inspection instances are left in place — no
    honest cleanup exists (no soft delete, no cancelled state).
25. Four orphaned tracking components (`RouteTimeline`, `RouteStop`,
    `ExceptionFlag`, `StatusPill`), plus the four orphaned help components and the
    stub article route found in this phase.
26. `/carrier/trips` has no sidebar link: a parent with children renders as a
    `<div>`, not a link.
27. A tenant whose checklist marks nothing dispatch-blocking is warned on the
    Operations page. The identical gap in driver **onboarding** has no toggle and
    no warning surface — 7 of 23 active onboarding checklists are affected.
28. `apps/web/docs-content/` is a decoy directory that shadows nothing but will
    mislead the next person who greps for an article.

### Pre-launch and infrastructure

29. The RLS Phase 2 cutover to `app_user`. It will break `carrier_documents`
    (RLS forced, zero policies — DEC-13) and silently stop `route_matrix_cache`
    caching (RLS off, no grant — quick-520).
30. The `set_config` GUC pool leak on the Supabase session pooler.
31. OSRM points at the public demo host, over plain HTTP, with no key.
32. The driver-residence privacy rule has never been exercised against a live
    server with two driver accounts — a unit test is evidence about a function,
    not about a deployment.
33. Phase 10's subscribe and push controls were never browser-tested.
34. **Section 16's 18-step acceptance test has never been run end to end**, and
    step 18 — *photo to committed trip in under 90 seconds, 3 taps* — has never
    been timed. Unverified, not passed.
35. No mobile screen in this module has been run on an emulator, in any phase.
36. Confidence calibration on a real multi-page manifest was never validated
    (open since Phase 1; the collapse behaviour is built on top of it).

---

## 8 · Files

**New (9)**
```
docs-content/client/document-import.mdx           facility-matching.mdx
docs-content/client/route-template-matching.mdx   end-stop-policy.mdx
docs-content/client/inspection-gate.mdx           live-board-views.mdx
docs-content/client/todays-trips-report.mdx       driver-trip-start.mdx
apps/web/src/components/help/HelpGuides.tsx
```

**Modified (7)**
```
apps/web/src/lib/docs/feature-registry.ts          (+8 entries, 1 route fix)
apps/web/src/components/settings/settings.config.ts (+Operations nav item)
apps/web/src/app/(owner)/help/page.tsx              (+HelpGuides)
docs-content/_ia.json                               (8 slugs filed into 3 hubs)
docs/technical-documentation.md                     (+§11)
docs/specs/DocumentImport_TechnicalSpec_v1.md       (v1.1 changelog + 8 corrections)
.planning/document-import/07-SUMMARY.md             (items 2 and 3 corrected)
CLAUDE.md                                           (stale Phase 7 bullet rewritten)
```
