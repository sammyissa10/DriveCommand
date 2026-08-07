# Quick 512 — Line item description input width

**Type:** layout defect · **Surface:** web (mobile checked) · **Date:** 2026-08-07
**Introduced by:** Phase 5 (`feat: stop review screen with bulk apply`, `2ff59a40`)
**Files:** `apps/web/src/components/carrier/imports/StopDetailEditor.tsx` ·
`apps/mobile/components/imports/StopReview.tsx`

---

## Diagnosis

`StopDetailEditor.tsx:682` — the line item **edit** row:

```tsx
<div className="flex flex-wrap items-center gap-2 rounded-lg bg-background p-3">
  <Input className="h-11 w-28" placeholder="SKU" />
  <Input className="h-11 min-w-0 flex-1" placeholder="Description" />   <- collapses
  <Input className="h-11 w-20" placeholder="Qty" />
  <Input className="h-11 w-20" placeholder="UOM" />
  <Input className="h-11 w-24" placeholder="Weight" />
  <label …>Hazmat</label>
  <RemoveButton />
</div>
```

### Why it collapsed — measured, not guessed

Container chain to the flex row's content box:

```
  max-w-3xl                       768
  list row px-3                  -24  -> 744
  editor p-5                     -40  -> 704
  FieldBlock grid [9rem_1fr]    -160  -> 544   (144 label + 16 gap)
  item card p-3                  -24  -> 520
```

Hypothetical main sizes on that 520px line:

| item | size |
|---|---|
| SKU `w-28` | 112 |
| **Description `flex-1`** | **0** ← `flex: 1 1 0%` |
| Qty `w-20` | 80 |
| UOM `w-20` | 80 |
| Weight `w-24` | 96 |
| Hazmat label | ~70 |
| Remove `w-11` | 44 |
| 6 × `gap-2` | 48 |
| **total** | **530** > 520 |

530 > 520, so `flex-wrap` fires and pushes the **last** item (Remove, 44 + 8 gap)
to a second line. Line 1 now measures 478, leaving **42px of free space** — and
the description is the only `flex-grow` item, so it receives all 42 and nothing
more. The `Input` base is `px-4` + 1px borders = **34px of chrome**, leaving
**~8px of text box**. One clipped glyph. Exactly the report.

### Root cause, in one sentence

**`flex-1` sets `flex-basis: 0`, so the description contributes nothing to flex
line-breaking** — the wrap algorithm can never give it a line of its own, and it
only ever receives whatever scraps five fixed-width siblings leave over. `min-w-0`
(added in Phase 5 to prevent overflow) removed the last floor that would have
stopped the collapse. A zero-basis growing item on a **wrapping** row crowded with
fixed siblings is the defect; either alone would have been fine.

### Why view mode is fine

`StopDetailEditor.tsx:370` has no `flex-1` — the description is a content-sized
`<span>` with `break-words`, so it wraps normally. Confirms the report.

### Why it was not caught

Width-dependent and invisible to `tsc`, to vitest, and to the type system. The
screen is capped at `max-w-3xl`, so the 520px line is the **same at 768px and at
1280px viewports** — it is broken at every width, not just narrow ones. At 360px
the grid collapses to one column giving 272px, which wraps differently and yields
~64px. Broken everywhere, just by different amounts.

### Mobile — checked, no defect

`StopReview.tsx:1066-1130` already uses the two-row structure this fix adopts
(row 1 = SKU · description · remove; row 2 = qty · UOM · weight) and the rows
have **no `flexWrap`**, so there is no wrap-vs-zero-basis interaction: the
description is the only grower against two fixed siblings and receives the
genuine remainder (~154px at a 360px screen). No collapse. It has no explicit
floor, so a `minWidth` guard is added — a defensive minimum, not a fix.

---

## Tasks

### T1 — Web: split the line item card into two rows

Adopt the structure mobile already has. Description becomes the only grower on a
row with two fixed siblings instead of five, and gets a real `flex-basis` so it
participates in line-breaking.

- Row 1 (identity): SKU `w-24 shrink-0` · Description `min-w-0 flex-1 basis-40`
  · Remove `shrink-0`
- Row 2 (quantities): Qty · UOM · Weight · Hazmat — all content-sized, `flex-wrap`
  works correctly here because no item has a zero basis

Predicted widths:

| container | row 1 fixed | description |
|---|---|---|
| 520px (≥sm) | 96 + 8 + 8 + 44 = 156 | **364px** — widest field by 3.8× |
| 272px (360 viewport) | 156, sum 316 > 272 | Remove wraps to its own line; description **168px**, still widest |

Spacing stays on the Section 15 scale: `gap-2` = 8, `space-y-2` = 8, `p-3` = 12.

### T2 — Mobile: add a minimum to the description input

`minWidth: 120` on the flexed `SmallInput`. No structural change.

### T3 — Verify

`npx tsc --noEmit` in both apps · `npx vitest run src/lib/document-import` ·
re-derive the widths at 360 / 768 / 1280.

---

## Out of scope

- View-mode line items (render correctly). Noted while reading: that row uses
  `gap-y-0.5` (2px), which is off the Section 15 scale — **not fixed here**, as it
  is a spacing nit rather than this defect and changing it alters view spacing
  visibly. Recorded for a later pass.
- No logic, schema, API, or test changes. This is CSS class names only.
