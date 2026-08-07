# Quick 512 — Line item description input width

**Date:** 2026-08-07 · **Commit:** see below · **Files:** 2
**Introduced by:** Phase 5 (`2ff59a40`) · **Type:** layout defect, CSS classes only

---

## What was wrong

The line item **edit** row in the stop detail editor rendered the description
input about one character wide. Values were intact; view mode was correct.

### Measured, not guessed

Container chain to the item card's content box:

```
  max-w-3xl                       768
  list row px-3                  -24  -> 744
  editor p-5                     -40  -> 704
  FieldBlock grid [9rem_1fr]    -160  -> 544
  item card p-3                  -24  -> 520
```

Hypothetical main sizes on that 520px flex line:

| item | size |
|---|---|
| SKU `w-28` | 112 |
| **Description `flex-1`** | **0** ← `flex: 1 1 0%` |
| Qty / UOM / Weight | 80 / 80 / 96 |
| Hazmat label | ~70 |
| Remove | 44 |
| 6 × `gap-2` | 48 |
| **total** | **530** > 520 |

530 exceeds 520, so `flex-wrap` fired and pushed the **last** item (Remove) to a
second line. Line 1 then measured 478, leaving **42px of free space** — and the
description, as the only `flex-grow` item, received all of it and nothing more.
The `Input` base is `px-4` plus 1px borders = **34px of chrome**, so the text box
was **~8px**. One clipped glyph.

### Root cause

**`flex-1` sets `flex-basis: 0`, so the description contributed nothing to flex
line-breaking.** The wrap algorithm could never give it a line of its own, and it
only ever received whatever scraps five fixed-width siblings left over. `min-w-0`
— added in Phase 5 to prevent overflow — removed the last floor that would have
stopped the collapse. A zero-basis growing item on a **wrapping** row crowded with
fixed siblings is the defect; either condition alone would have been harmless.

**It was broken at every viewport, not just narrow ones.** The screen is capped at
`max-w-3xl`, so 768px and 1280px produce the identical 520px line. At 360px the
grid collapses to one column, giving 272px and a different wrap that yielded ~64px.

Invisible to `tsc`, to vitest and to the type system — it is arithmetic between
four CSS values in three different files.

---

## The fix

### Web — `StopDetailEditor.tsx`

Split the one seven-control row into two, which is the structure the **mobile
screen already had**:

- **Row 1 (identity):** SKU `w-24 shrink-0` · Description `min-w-0 flex-1 basis-40`
  · Remove `shrink-0`
- **Row 2 (quantities):** Qty · UOM · Weight · Hazmat — all content-sized, so
  `flex-wrap` behaves correctly here (no item has a zero basis)

Two changes do the work: the description now grows against **two** fixed siblings
instead of five, and `basis-40` (10rem) gives it a **real flex-basis**, so it both
claims width and *participates in line-breaking* — meaning a narrow viewport now
wraps the row instead of crushing the field.

A comment on the row says why, and says not to merge them back or to use `flex-1`
without a basis.

### Mobile — `StopReview.tsx`

**No defect.** Row 1 there is already SKU · description · remove with **no
`flexWrap`**, so there is no wrap-vs-zero-basis interaction: the description is
the only grower against two fixed siblings and gets the genuine remainder (~154px
on a 360pt screen). Added `minWidth: 100` on the flexed input as a **guard, not a
fix** — 100 chosen so a 320pt device still fits the row (90 + 8 + 100 + 8 + 44 =
250 ≤ 264) rather than overflowing, since RN rows do not wrap.

---

## Verification

### Widths — re-derived against the new markup

| viewport | card content | row 1 fixed | **description** | vs next widest | behaviour |
|---|---|---|---|---|---|
| **1280px** | 520 (capped by `max-w-3xl`) | 156 | **364px** | 3.8× SKU (96) | one line |
| **768px** | 520 (identical — same cap) | 156 | **364px** | 3.8× SKU (96) | one line |
| **360px** | 272 | 156 | **168px** | 1.75× SKU (96) | Remove **wraps** to line 2; both inputs full size |

At 364px the text box is ~330px ≈ 41 characters — "Run-flat 245/40R19" (18) fits
with room to spare. At 168px it is ~134px ≈ 16 characters, and the input scrolls,
so nothing clips. **Description is the widest field in the row at all three
widths**, and the narrow case wraps rather than crushing.

Row 2: 350px of content fits 520 on one line; at 272 the Hazmat toggle wraps to a
second line, which is correct reflow of content-sized items.

`basis-40` confirmed present in Tailwind 3.4.19's default `flexBasis` scale
(= 10rem), no project override, and the literal appears in a `className` string
under `./src/components/**` so JIT emits it.

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
 ✓ spreadsheet.test.ts                (17)
 ✓ extractor.test.ts                  (26)
 ✓ service.test.ts                    (22)
 ✓ merge.test.ts                      (20)
 ✓ lifecycle.test.ts                  (29)
 ✓ facility-effective-client.test.ts   (9)
 ✓ hashing.test.ts                    (21)
 ✓ facility-commit.test.ts            (12)
 ✓ matching.test.ts                   (16)
 ✓ money.test.ts                       (7)
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

Unchanged from the Phase 5 close — as expected. **No test covers this defect and
none was added**: it is arithmetic across four CSS values in three files, and the
only honest test is a rendered measurement, which needs the Playwright harness
rather than vitest. Named rather than papered over with a test that would assert
class strings and prove nothing.

---

## Self-audit per step

| Step | Verdict |
|---|---|
| 1 — Identify the layout mechanism and why the description lost its width | **DONE.** Wrapping flex row; `flex-1` → `flex-basis: 0` → contributes nothing to line-breaking → receives only leftover free space (42px of 520), with `min-w-0` removing the last floor. Arithmetic shown above. |
| 2 — Fix so description grows and others stay content-sized; verify at 360 / 768 / 1280 | **DONE.** Two-row split + `basis-40`. Widths re-derived at all three: 364 / 364 / 168px, widest field in its row every time, wraps at 360. **Derived, not rendered** — see the caveat below. |
| 3 — Check the mobile RN row; fix if present | **DONE — no defect present.** Structure already correct (no `flexWrap`, two fixed siblings). Added a `minWidth: 100` guard, labelled as a guard. |

### Constraints

| Constraint | Verdict |
|---|---|
| Section 15 spacing (8/12/16/20/24) | **HELD** — `gap-2` = 8, `space-y-2` = 8, `p-3` = 12. Field widths (`w-24`, `basis-40`) are control sizing, not spacing rhythm. |
| No new dependencies | **HELD** — dependency diff empty. |
| No logic / schema / API changes | **HELD** — web change is JSX nesting and class names; every `value`, `onChange` and `aria-label` is byte-identical. Mobile change is one style property. |
| Nothing outside the line item row layout | **HELD** — two rows in two files. |
| Text never clips | **HELD** — the input scrolls its own value at every width, and the field is never below ~134px of text box. |

---

## Caveat, stated plainly

**The widths are derived, not rendered.** I computed them from the container chain
and the Tailwind scale rather than measuring a browser — no dev server was started
in this session. The arithmetic is shown above so it can be checked, and the fix
removes the *class* of defect (a zero-basis grower starved by fixed siblings)
rather than tuning a number until it looked right. But the honest verification is
opening the editor at the three widths, and that has not been done.

## Noticed, not fixed

The **view**-mode line item row (`StopDetailEditor.tsx:370`) uses `gap-y-0.5` =
2px, which is off the Section 15 scale (8/12/16/20/24). It renders correctly and
is not this defect; changing it alters view spacing visibly, which is beyond a
width fix. Recorded for a later pass.
