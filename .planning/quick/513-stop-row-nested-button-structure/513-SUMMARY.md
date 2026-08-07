# Quick 513 — Stop row nested button structure

**Date:** 2026-08-07 · **Type:** invalid HTML / a11y · **Files:** 2
**Introduced by:** Phase 5 (`2ff59a40`)

---

## What was wrong

### The nested button — confirmed

`StopReviewRow.tsx:112` opened `<button aria-label="Open …">` and at line 120
contained `<TruncatedText>`, which renders its own `<button>` expander.
`<button>` forbids interactive descendants, so the parser broke the nesting and
React flagged the hydration mismatch. The console error and its attribution to
`StopReviewRowItem` were both correct.

### "+ New" — the brief's causal claim was wrong

The brief said the open button wrapped "the + New facility button". **It did
not.** `+ New` is `<StopStatus stop={row} />` at **line 151** — a **sibling** of
the open button, rendering a `<Badge>`, which is a **`<div>`**.

**It did not respond to clicks because it was never a control.** I built it in
Phase 5 as a status indicator — colour + icon + text per Section 15. Fixing the
nesting would not have made it clickable, and shipping the nesting fix alone
would have left it just as dead. Recorded because acting on the wrong cause
silently is how a bug comes back.

The desired behaviour is still right, and is delivered — as a deliberate change.

### A second invalid nesting, found while reading

`StopReviewScreen.tsx:316` — `<ul>` → `<div key>` → `<li>`. `ul` admits only
`li` as a child. Same defect class, almost certainly among the 16 flagged issues.

---

## The fix

### 1 · The open target is an overlay button with no children

```
<div class="relative …">
  <button class="absolute inset-0" aria-label="Open X" />   <- NO children
  <button class="relative">grip</button>
  <span class="relative"><Checkbox/></span>
  <span>1</span>            <- not positioned: under the overlay
  <div>name · type · address</div>       <- under the overlay
  <span>5 · 2ref</span>                  <- under the overlay
  <button class="relative"><Badge/></button>
</div>
```

Painting order does the work. An absolutely-positioned element with `z-index:
auto` paints above in-flow **non-positioned** content, so the overlay covers the
text and clicking it opens the row. Interactive siblings carry `relative` and
come **later in DOM order**, so they paint above the overlay and take their own
clicks.

- **Zero nested interactive elements** — a button with no children cannot nest
  anything. Chosen over `div[role="button"] + tabIndex`, which would have left
  the expander a focusable descendant of a widget role: valid HTML, still an ARIA
  violation.
- **Real `<button>`** — Enter and Space work natively, no hand-rolled
  `onKeyDown`, focus ring on the whole row. `aria-label` retained verbatim.
- **No `stopPropagation` needed for the overlay** — it is a sibling, not an
  ancestor, so child clicks never bubble to it. The checkbox's existing
  `stopPropagation` stays; it guards dnd-kit, which is a different concern.
- **The whole row now opens**, including the quantity and reference columns,
  which were dead space before.

### 2 · The row's name is plain truncated text

`TruncatedText`'s expander is gone from the row, replaced by
`<span class="truncate" title={…}>`. Two reasons, and the second is the one that
decided it:

1. It was the nested button.
2. **Above the overlay it would steal the row click.** It is `block w-full`, so
   it covers the name — the most likely place a dispatcher clicks to open a stop.
   Keeping it would have traded one broken control for another.

The Phase 5 constraint still holds: opening the row **is** the tap that reveals
the full value. The detail editor's header and facility field both render it in
full, and the editor's own `TruncatedText` expander is untouched and still works.
`title` covers pointer users in the row.

### 3 · The status badge is a button when — and only when — it is actionable

`requiresHumanTap` (T3 PROPOSED / T4 NEW) wraps `StopStatus` in a real `<button>`
that opens the row. LINKED keeps the plain badge: a settled status is not a call
to action, an unresolved one is the reason the row wants attention. Facility
resolution stays in the detail editor — no second entry point invented.

### 4 · `ul > div > li` → `ul > li`

The row renders a `<div>`; the screen's per-row wrapper became the `<li>`. Two
tags, no logic.

---

## Verification

### Nested-interactive scan — with a control

A scanner over the six Phase 5 components, strippping comments first (the first
two attempts were wrong: one mis-read self-closing tags, the other counted
`<button>` inside prose comments — both fixed before the result below was
trusted). Validated by running it against the **pre-fix** file from git:

```
=== CONTROL: pre-fix row (git show HEAD:…/StopReviewRow.tsx) ===
  before.tsx               NESTED: TruncatedText@~96      <- finds the real defect

=== AFTER FIX ===
  StopReviewRow.tsx        clean
  StopReviewScreen.tsx     clean
  StopDetailEditor.tsx     clean
  StopBulkBar.tsx          clean
  TruncatedText.tsx        clean
  StopResolutionList.tsx   clean
```

The control matters: a scanner that reports "clean" without ever having caught
the known defect proves nothing.

### TypeScript — real output

```
$ cd apps/web && npx tsc --noEmit
WEB EXIT CODE: 0

$ cd apps/mobile && npx tsc --noEmit
MOBILE EXIT CODE: 0
```

### Tests — `npx vitest run src/lib/document-import`

```
 ✓ stop-review.test.ts                (32)
 ✓ address.test.ts                    (40)
 ✓ facility-ladder.test.ts            (18)
 ✓ hashing.test.ts                    (21)
 ✓ spreadsheet.test.ts                (17)
 ✓ extractor.test.ts                  (26)
 ✓ merge.test.ts                      (20)
 ✓ service.test.ts                    (22)
 ✓ lifecycle.test.ts                  (29)
 ✓ facility-commit.test.ts            (12)
 ✓ facility-effective-client.test.ts   (9)
 ✓ money.test.ts                       (7)
 ✓ matching.test.ts                   (16)
 ✓ profiles.test.ts                    (6)
 ✓ upload.test.ts                      (6)
 ✓ contract-create.test.ts             (9)
 ✓ rate-con-party.test.ts             (15)
 ✓ resumable.test.ts                   (5)
 ✓ document-date.test.ts               (8)
 ✓ materialise.test.ts                 (8)
 ✓ pdf-render.test.ts                  (7)

 Test Files  21 passed (21)
      Tests  333 passed (333)
```

Unchanged — these cover `src/lib`, and this change is markup. No test was added:
the honest test is a rendered DOM assertion, which needs the Playwright harness,
not vitest.

---

## Self-audit per step

| Step | Verdict |
|---|---|
| 1 — Restructure so inner controls are siblings, not descendants of a button; stopPropagation on inner controls | **DONE**, via the overlay option the brief offered. Overlay is a childless `<button>`, so keyboard semantics are native rather than `role`+`tabIndex`+manual keys. `stopPropagation` added to the badge; not needed for the overlay (sibling, nothing bubbles) and the existing checkbox one is kept for dnd-kit. |
| 2 — Confirm checkbox, drag handle and + New work with the bulk bar open and closed | **PARTIAL — structurally verified, not clicked.** All three are `relative` siblings painting above the overlay, and the bulk bar is a separate sticky element that never overlaps the list. **Not exercised in a browser** — see the caveat. |
| 3 — Nested-button error gone; address others from the same structure | **DONE for this structure** — scan clean with a working control, plus the `ul > div > li` defect found and fixed. **The other 15 issues cannot be enumerated from here** — I do not have the console output. |

### Constraints

| Constraint | Verdict |
|---|---|
| Section 15 holds; visual appearance unchanged | **HELD** — the overlay is transparent, every visible class is carried over, `relative` and the badge wrapper add no paint. Spacing untouched (`gap-3`, `px-3 py-3`). The one visible change is intentional: an actionable badge now takes a focus ring. |
| No new dependencies | **HELD** — diff is two files, no package change. |
| Don't touch list logic / bulk apply / drag / detail panel | **HELD, with one flagged exception** — `StopReviewScreen.tsx` changed by exactly two tags (`<div key>` → `<li key>`, `</div>` → `</li>`). No state, handler, prop or logic. Left alone, `ul > div > li` would still be invalid while this task claimed "zero nesting violations". |

---

## Caveat, stated plainly

**Nothing here was clicked in a browser.** No dev server was started. The nesting
is proven gone by a scanner with a passing control, and `tsc` and vitest are
green — but "the checkbox, drag handle and + New all work with the bulk bar open
and closed" is a claim about a rendered page, and it rests on the painting-order
argument above rather than on a click. The overlay pattern's usual failure mode is
exactly this: a sibling that needed `relative` and did not get one becomes
unclickable. I have checked each by eye against the DOM order; that is not the
same as using it.

## Also worth knowing

The overlay covers the name and address, so **text in the row is no longer
selectable** — clicking and dragging over it opens the row instead. That is
inherent to the overlay pattern and normal for a clickable row, but it is a real
behaviour change and not one the brief asked for. The full, selectable value is
in the detail editor.
