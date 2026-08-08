---
status: resolved
trigger: "doc-import-template-windows-and-standing-notes"
created: 2026-08-08T00:00:00.000Z
updated: 2026-08-08T00:00:00.000Z
mode: diagnose_only -> fixed in quick-515
task: quick-514
---

**Resolved in quick-515.** Standing notes now render as a twelfth, read-only
`FIELDS` entry on both surfaces, guarded by a disk-reading test with a passing
control. **Window materialisation is deferred to commit by decision** — not
patched to use a different anchor here — because the offsets belong to the
trip's start time, which is chosen on the Finish trip screen (Phase 8); the
review screen now shows the route's offsets as elapsed time instead of an
em-dash, stores no window, and `template-service.ts` carries the Phase 8
obligation to materialise them via the existing `trips.ts` arithmetic.
Deferral is **unconditional**: Phase 6 also wrote windows against the template's
own departure default when it happened to be set, which was the same defect
wearing a plausible clock.

## Current Focus

hypothesis: CONFIRMED — **two independent defects**, not one.
(1) Appointment windows are mapped but anchored to `route_templates.scheduled_departure_time`,
which is a *scheduling default for auto-generated dispatches*, not the trip's start
time. It is legitimately NULL on an `on_call` template, so `windowFromOffset`
short-circuits and no window is written. The authoritative consumer
(`trips.ts:321`) anchors to the **trip's** `scheduledDeparture`, and spec §4.1
draws that as the `Start 06:00` field on the Finish trip screen (Phase 8).
(2) Standing notes ARE selected, ARE mapped and ARE persisted — to
`consignment.templateStandingNotes` — but **no component on either surface
renders that field.** `FIELDS` in `StopDetailEditor.tsx:63` and
`StopReview.tsx:832` both list the same eleven Phase 5 fields and neither has a
twelfth.
test: read the whole application path plus the two consumers of the offsets that
predate this module; grepped `templateStandingNotes` across `apps/web/src`,
`apps/mobile` and `packages`.
expecting: confirmed by reading; no runtime test needed.
next_action: none — diagnose_only, report to orchestrator.

## Symptoms

expected: Applying template MKE-NORTH-2 puts its appointment windows (offsets
630/720) and its standing notes ('Dock 3 only') on the stops.
actual: Stop type and required documents (BOL/POD) landed. Windows and standing
notes did not appear on stop detail.
errors: none — nothing failed.
reproduction: Apply MKE-NORTH-2 to an import, open a matched stop's detail.
started: Phase 6 (`4e95b593`) — the first build with template application.
relevant data: template rows carry `appt_window_start_offset_min` / `_end_` (630
/ 720) and `special_instructions` ('Dock 3 only');
`route_templates.scheduled_departure_time` is **NULL** for this template.

## Eliminated

- **Not selected from the database.** `TEMPLATE_STOP_SELECT`
  (`template-lookup.ts:120-141`) selects `apptWindowStartOffsetMin`,
  `apptWindowEndOffsetMin` and `specialInstructions`, and
  `toLoadedTemplate` (`:262-278`) carries all three onto `TemplateStopRef`.
- **Not mapped.** Both are mapped in `mergeTemplateStop`
  (`template-matching.ts:535-536`, `:557`).
- **Overwritten by the import-wins merge.** Only `appointment` has an
  import-wins rule, and it did not fire here — `hasWindow` is false on these
  stops. `templateStandingNotes` has no import-wins rule at all; it is assigned
  unconditionally.
- **A validation or CHECK rejection.** Nothing throws; `applyTemplate` returned
  successfully, which is why stop type and required documents landed from the
  same object literal.

## Evidence

- checked: `apps/web/src/lib/document-import/template-matching.ts:547-559`
  found: all four supplies map in one object literal — `stopType` and
  `requiredDocuments` land, `appointment` is computed above and
  `templateStandingNotes` is assigned directly.
  implication: the mapping is not the fault for the standing note, and is only
  half the fault for the window.

- checked: `template-matching.ts:374-394` (`windowFromOffset`)
  found: `if (!documentDate || !departureTime || offsetMinutes == null) return null;`
  implication: with `scheduled_departure_time` NULL, both `earliest` and
  `latest` are null, so `mergeTemplateStop:538-541` falls to
  `source.appointment` — which is the document's window, i.e. nothing.

- checked: `template-service.ts:415-424`
  found: the anchor passed in is `scheduledDepartureTime: template.scheduledDepartureTime`.
  implication: the anchor is a *template* column, chosen by me in Phase 6.

- checked: `apps/web/src/lib/carrier/trips.ts:317-328` — the pre-existing,
  authoritative consumer of these same offsets.
  found: `const depTime = dispatch.scheduledDeparture;` then
  `new Date(depTime.getTime() + ts.apptWindowStartOffsetMin * 60000)`.
  Identical at `:491` and `:760`.
  implication: **the offsets anchor to the TRIP's scheduled departure**, not to
  the template's column. Three call sites agree and all three predate this
  module.

- checked: `apps/web/src/lib/carrier/dispatch-generator.ts:328`
  found: `const scheduledDeparture = applyTimeToDate(dateStr, template.scheduledDepartureTime);`
  implication: `route_templates.scheduled_departure_time` is the **seed** that
  computes a trip's departure when auto-generating on a recurrence date. It is a
  scheduling default, not an anchor. An `on_call` template has no recurrence and
  therefore no reason to carry one — NULL is correct data, not missing data.
  (Phase 6's own auto-created templates are written `on_call`, so they will all
  have this shape.)

- checked: spec §4.1 (`DocumentImport_TechnicalSpec_v1.md:402-412`)
  found: the Finish trip screen draws `| Start     06:00    > |` as an explicit
  field alongside End stop, Driver and Truck.
  implication: **the intended anchor is the trip's start time, chosen by the
  dispatcher on the Finish trip screen — which is Phase 8.** Section 8 never
  names an anchor; §4.1 is where it is drawn, and §9 confirms the windows are
  consumed as trip-relative constraints ("firm windows are hard, soft windows
  are penalties").

- checked: `grep -rn "templateStandingNotes" apps/web/src apps/mobile packages`
  found: 8 hits — `stop-review.ts` (type + populate), `template-matching.ts`
  (write ×2, read-back ×1), the test file ×2, `packages/api-client`
  (`owner-imports.ts:483`) and `packages/validation`.
  **Zero hits in any `.tsx` file.**
  implication: the value is written, stored, typed and mirrored to mobile — and
  rendered nowhere.

- checked: `StopDetailEditor.tsx:63-91` and `StopReview.tsx:832-844`
  found: both `FIELDS` arrays are the same eleven Phase 5 fields —
  facility · sequence · type · references · lineItems · rollups · appointment ·
  requiredDocuments · contact · notes · pages. No twelfth entry.
  implication: Phase 5's stated structural property — *"field order identical
  between view and edit is structural, not a convention: `FIELDS` is ONE array
  and both modes are a `.map` over it"* — is exactly why the field is invisible
  in **both** modes on **both** surfaces. Adding data to the row type without
  adding a `FIELDS` entry renders it nowhere, silently.

- checked: `__tests__/template-matching.test.ts:546`
  found: `const context = { documentDate: '2026-07-27', scheduledDepartureTime: '06:00' };`
  — every application test supplies a departure time the real template does not
  have.
  implication: the window tests exercise a configuration that does not occur on
  this template.

- checked: `__tests__/template-matching.test.ts:624-632`
  found: `it('reports rather than invents when the template has offsets but no
  departure time')` asserts `appointment` is **null** and `windowsUnavailable` is
  **true** — i.e. it encodes the observed behaviour as the intended one.
  implication: the suite is green *because* it agrees with the defect. This is
  not a missing test; it is a test asserting the wrong intent.

## Answers to the five questions

### 1 — Where each of the four supplies maps

`apps/web/src/lib/document-import/template-matching.ts:528-559`:

```ts
function mergeTemplateStop(
  source: CanonicalConsignment,
  template: TemplateStopRef,
  context: TemplateApplyContext,
): CanonicalConsignment {
  const hasWindow = Boolean(source.appointment?.earliest || source.appointment?.latest);

  const earliest = windowFromOffset(context.documentDate, context.scheduledDepartureTime, template.apptWindowStartOffsetMin);
  const latest = windowFromOffset(context.documentDate, context.scheduledDepartureTime, template.apptWindowEndOffsetMin);

  const appointment =
    hasWindow || (!earliest && !latest)
      ? source.appointment
      : { earliest, latest, isFirm: source.appointment?.isFirm ?? false };

  const required: ('BOL' | 'POD')[] = [];
  if (template.bolRequired) required.push('BOL');
  if (template.podRequired) required.push('POD');

  return {
    ...source,
    templateOrigin: 'MATCHED',
    skipped: false,
    appointment,                                                      // <- 2. WINDOWS
    requiredDocuments: source.requiredDocuments?.length ? source.requiredDocuments : required,  // <- 3. DOCS  (landed)
    stopType: source.stopType ?? stopTypeForTemplate(template.stopType),                        // <- 4. TYPE  (landed)
    templateStandingNotes: template.specialInstructions ?? null,      // <- 1. STANDING NOTES
    contact: source.contact ?? contactFrom(template),
  };
}
```

Order is the fourth supply and is handled outside this function, by
`buildTemplateDiff` + the `for (const row of diff.rows)` loop at `:501-522`.

**All four are mapped.** The two that landed and the two that did not come out of
the same object literal, which is why this is two separate downstream faults
rather than a missing mapping.

### 2 — Windows: exactly how offsets are converted

They anchor to `route_templates.scheduled_departure_time`, and they **skip when
it is NULL** — stated plainly, because that is the defect.

`template-service.ts:415-424` passes the anchor:

```ts
{
  documentDate: committed.documentDate ? committed.documentDate.toISOString().slice(0, 10) : null,
  scheduledDepartureTime: template.scheduledDepartureTime,      // <- NULL for MKE-NORTH-2
}
```

`template-matching.ts:379` short-circuits on it:

```ts
if (!documentDate || !departureTime || offsetMinutes == null) return null;
```

Both `earliest` and `latest` come back null, `(!earliest && !latest)` is true, and
`mergeTemplateStop` keeps `source.appointment` — which on these stops is nothing.
`windowsUnavailable` is set true and surfaced in the post-apply notice
("the template has no departure time, so its windows were not applied"), but that
line is transient client state on the summary card and is gone on reload.

**The intended anchor is the trip's start time, not the template's column.**
Two independent authorities:

- **Code.** `trips.ts:321`, `:491`, `:760` and `dispatch-generator.ts:399` all
  anchor to `dispatch.scheduledDeparture` / `scheduledDeparture` — a real
  datetime on the trip row. `route_templates.scheduled_departure_time` is the
  *seed* the generator uses to compute that departure on a recurrence date
  (`dispatch-generator.ts:328`), not the anchor itself.
- **Spec.** §4.1's Finish trip screen draws `Start 06:00` as an explicit field
  beside End stop / Driver / Truck. §9 then treats the resulting windows as
  hard-or-soft constraints on the trip. Section 8 never names an anchor.

`on_call` templates have no recurrence and therefore no reason to carry a
departure time, so NULL is **correct data**. Worse, Phase 6's own auto-created
templates are written `scheduleType: 'on_call'`
(`template-service.ts` via `TEMPLATE_DEFAULT_SCHEDULE_TYPE`), so every template
this feature creates will reproduce the bug.

Second-order consequence: the trip start time does not exist at the moment
`applyTemplate` runs. It is chosen on the Finish trip screen, which is Phase 8.
So this is not only a wrong anchor — it is an anchor that **cannot** be resolved
at application time. That shapes the fix and is why it is flagged rather than
guessed at here.

### 3 — Standing notes: where it is dropped

It is not dropped in the pipeline. It is **mapped to a field the detail view does
not render** — the third of the four options in the brief.

```
route_template_stops.special_instructions
  -> TEMPLATE_STOP_SELECT           template-lookup.ts:131      selected      OK
  -> TemplateStopRef.specialInstructions
                                    template-lookup.ts:275      carried       OK
  -> mergeTemplateStop              template-matching.ts:557    mapped        OK
       templateStandingNotes: template.specialInstructions ?? null
  -> consignmentSchema.templateStandingNotes
                                    validation:342              persisted     OK
  -> StopReviewRow.templateStandingNotes
                                    stop-review.ts:343          on the row    OK
  -> packages/api-client            owner-imports.ts:483        mirrored      OK
  -> StopDetailEditor FIELDS        StopDetailEditor.tsx:63     ** ABSENT **
  -> mobile detail sheet FIELDS     StopReview.tsx:832          ** ABSENT **
```

`grep -rn "templateStandingNotes"` returns **zero hits in any `.tsx` file**. The
data is on the wire and in the database; nothing draws it.

It is also read back correctly when saving a template out
(`template-matching.ts:703`), so a round trip preserves it — the value is intact
and invisible, which is why nothing errored.

**Why this slipped through:** Phase 5 made field order structural — one `FIELDS`
array driving both view and edit, on both surfaces, so the two modes cannot
disagree. That property has a matching failure mode nobody stated: a field added
to the row type but not to `FIELDS` is invisible in *both* modes on *both*
surfaces, and nothing type-errors, because `FIELDS` is a hand-written literal
rather than derived from the row type.

### 4 — What the tests cover, and the gap

Both supplies have passing tests. Neither test would fail on this bug.

**Standing notes** — `template-matching.test.ts:571-583` asserts
`result.consignments[0].templateStandingNotes === 'Back dock only'`. That is
true, and it is true in production too. The test asserts the **mapping**; the
defect is in the **render**. There are no component tests in this module at all
(05-SUMMARY: *"the honest test is a rendered DOM assertion, which needs the
Playwright harness, not vitest"*), so nothing anywhere asserts that a stop's
fields reach the screen.

**Windows** — every application test uses
`const context = { documentDate: '2026-07-27', scheduledDepartureTime: '06:00' }`
(`:546`), a configuration MKE-NORTH-2 does not have. And the one test that does
exercise the NULL case (`:624`) asserts `appointment` is null and
`windowsUnavailable` is true — **it encodes the defect as the specification.**

So the gap is not "mocked mapping" and not "scorer-only". It is:
1. **No test asserts a field reaches the UI** — the whole render layer is
   untested, which is where the standing note dies.
2. **The window test's fixture picks the working anchor**, and the test for the
   broken anchor asserts the broken behaviour is correct. A test written from
   the implementation rather than from the spec cannot fail when the
   implementation is wrong — and I wrote both from the implementation.

The verify-table entry in 06-SUMMARY ("Apply a template → order kept, quantities
correct — ✅ Covered by tests. Not run end to end") is the honest signal that was
already there: no live import had ever been applied.

### 5 — Root cause, plain English

**Two independent defects that happen to surface together.** The appointment
windows anchor to the template's `scheduled_departure_time`, which is a
scheduling default for auto-generated dispatches and is correctly NULL on an
`on_call` template like MKE-NORTH-2 — so the conversion short-circuits and
writes nothing, when the anchor should have been the trip's start time
(spec §4.1's `Start 06:00`, which is what `trips.ts` has always used and which
Phase 8 will collect). The standing note has no conversion problem at all: it is
selected, mapped and persisted correctly to `consignment.templateStandingNotes`,
but no component renders that field, because the eleven-entry `FIELDS` array
that drives both the view and the edit modes on both surfaces was never given a
twelfth entry. Stop type and required documents landed from the same object
literal precisely because they map onto fields Phase 5 already drew.

## Not fixed

diagnose_only. No code changed, no files edited outside this record.

**Note for whoever fixes it:** the window half is not a one-line change. The
correct anchor does not exist when `applyTemplate` runs — the trip's start time
is chosen on the Finish trip screen, which Phase 8 has not built. The options are
to defer window materialisation to commit (where `trips.ts` already does exactly
this arithmetic and would need no new code), or to collect a start time earlier.
That is a design decision, not a bug fix, and it should be taken deliberately.
The standing-note half *is* a small change: one `FIELDS` entry and one read-only
row per surface.
