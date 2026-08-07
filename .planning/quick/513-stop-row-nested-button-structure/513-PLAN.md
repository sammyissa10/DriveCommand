# Quick 513 — Stop row nested button structure

**Type:** invalid HTML / a11y · **Surface:** web (mobile verified unaffected)
**Date:** 2026-08-07 · **Introduced by:** Phase 5 (`2ff59a40`)
**Files:** `apps/web/src/components/carrier/imports/StopReviewRow.tsx`
· `apps/web/src/components/carrier/imports/StopReviewScreen.tsx` (2 tags — see scope note)

---

## What is actually wrong — read from the source, not assumed

### Confirmed: the nested button is real

`StopReviewRow.tsx:112` opens `<button aria-label="Open …">` and at line 120
contains `<TruncatedText>`, which renders its own `<button>` (the expander).

```
<button aria-label="Open Russ Darrow Nissan">   line 112
  <span>
    <span>
      <button aria-label="… show in full">       <- TruncatedText, line 120
```

`<button>` has *interactive content* as a forbidden descendant, so the parser
breaks the nesting and React's hydration flags it. The console error and its
attribution to `StopReviewRowItem` are both correct.

### NOT confirmed: "+ New" is not inside that button, and nesting is not why it is dead

The brief says the open button wraps "the + New facility button". It does not.
The `+ New` a dispatcher sees is `<StopStatus stop={row} />` at **line 151** —
a **sibling** of the open button, and it renders a `<Badge>`, which is a
**`<div>`**.

**It does not respond to clicks because it has never been a control.** It is a
status indicator — colour + icon + text per Section 15 — and I built it that way
in Phase 5. Fixing the nesting would not have made it clickable. Stating this
because the brief's causal claim is wrong and acting on it silently would leave
the real reason unrecorded.

The desired behaviour ("+ New is a real working button") is still right, and is
handled below — but as a deliberate change, not as a side effect of the nesting
fix.

### Found while reading: a second invalid nesting, same class

`StopReviewScreen.tsx:316-351`:

```
<ul>                          line 316
  <div key={row.index}>       line 318   <- INVALID
    <li>…</li>                           (StopReviewRowItem)
```

`<ul>` permits only `<li>` (and script-supporting elements) as children. This is
almost certainly among the 16 devtools issues and is the same defect class, so it
is fixed here.

---

## Design

### The open target becomes an overlay button with zero children

```
<div class="relative …">                          <- was <li>, now <div> (see below)
  <button class="absolute inset-0" aria-label="Open X" />   <- NO children
  <button class="relative">grip</button>
  <span class="relative"><Checkbox/></span>
  <span>1</span>                                  <- not positioned: sits UNDER
  <div>name · type · address</div>                   the overlay, so clicking
  <span>5 · 2ref</span>                              it opens the row
  <button class="relative"><Badge/></button>       <- + New, when actionable
</div>
```

Painting order does the work: an absolutely-positioned element with `z-index:
auto` paints above in-flow **non-positioned** content, so the overlay covers the
text. Interactive siblings get `relative`, and because they come **after** the
overlay in DOM order they paint above it and receive their own clicks.

Consequences, all wanted:

- **Zero nested interactive elements** — the overlay has no children at all, so
  there is nothing to nest. Better than `div[role="button"] + tabIndex`, which
  would still leave the expander a focusable descendant of a widget role.
- **Real `<button>` semantics** — Enter and Space work natively, no manual
  `onKeyDown`, and the focus ring lands on the whole row.
- **The whole row opens**, not just the middle text block. Clicking the quantity
  or the reference count now opens the row, which it did not before.
- **Clicks on children never reach the overlay** — it is a sibling, not an
  ancestor, so nothing bubbles to it and no `stopPropagation` is needed for it.
  The existing checkbox `stopPropagation` stays: it guards dnd-kit, not this.

### The row's name becomes plain truncated text

`TruncatedText`'s expander is **removed from the row** and rendered as a
`<span class="truncate" title={…}>`.

Two reasons, and the second is the one that matters:

1. It is the nested button.
2. **Above the overlay it would steal the row click.** The expander is
   `block w-full`, so it covers the name — the single most likely place a
   dispatcher clicks to open a stop. Keeping it interactive trades one broken
   control for another.

The Phase 5 constraint ("long names truncate with the full value on tap") still
holds: tapping the row opens the detail editor, whose header and facility field
both render the full value, and the editor's own `TruncatedText` expander is
untouched and still works. `title` covers pointer users in the row.

### The status badge becomes a button when — and only when — it is actionable

`requiresHumanTap` (T3 PROPOSED / T4 NEW) wraps `StopStatus` in a `<button>` that
calls `onOpen`. A LINKED stop keeps the plain badge.

A settled status is not a call to action; an unresolved one is the whole reason
the row is on screen. This is the smallest change that makes the thing that looks
like a control behave like one, without inventing a second facility-resolution
entry point — the resolution UI stays in the detail editor, untouched.

---

## Tasks

- **T1** — `StopReviewRow.tsx`: overlay open button, plain truncated name,
  `relative` on interactive siblings, actionable badge, `<li>` → `<div>`.
- **T2** — `StopReviewScreen.tsx`: `<div key>` → `<li key>` so the list is
  `ul > li` again. **Two tag characters, no logic.**
- **T3** — Verify: `tsc` both apps, vitest, and re-read the row for any remaining
  interactive-in-interactive.

## Scope note

The brief says not to touch list logic. T2 changes **one opening and one closing
tag** in the list's markup and no logic, state, handler or prop. It is the same
invalid-nesting defect the task is about, and leaving `ul > div > li` in place
while claiming "zero nesting violations" would be false. Flagged rather than done
silently.

## Out of scope

- Detail panel, bulk apply, drag/reorder wiring, list logic — untouched.
- Mobile: **verified unaffected.** `StopRow` in `StopReview.tsx` has four
  `Pressable`s (checkbox, open, up, down), all siblings, and `StopBadge` is a
  `View`. RN has no HTML content model. No change needed and none made beyond
  nothing.
- **The other 15 devtools issues cannot be enumerated from here** — I do not have
  the console output. Everything traceable to this structure is fixed; the rest
  needs the actual list.
