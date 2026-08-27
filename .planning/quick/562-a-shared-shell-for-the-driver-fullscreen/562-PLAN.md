# quick-562 — A shared shell for the driver-fullscreen route group

**Date:** 2026-08-27 · **Branch:** `feature/document-import` · **Baseline:** `d0b47756`

---

## The problem, restated from evidence rather than from the brief

quick-560 found `flex min-h-dvh flex-col justify-between px-5 py-8` at **five call
sites across three files**, used nowhere else in the app. There is no shared
shell for `(driver-fullscreen)`, which is why it was pasted rather than
imported — the absence is the cause.

It is not cosmetic. `InspectionClient.tsx:137` still carries the quick-546 note
recording that this layout put an error banner roughly a screen-height from the
button that was tapped, reported at the time as "nothing happens".

**What the brief gets slightly wrong, and it matters.** The brief names the five
screens as intro / walkaround / sign / blocked / one other. The walkaround and
the sign screen do **not** carry the pasted string — they carry a *near-copy*,
`flex min-h-dvh flex-col`, with `justify-between` and the gutter dropped, and a
sticky header/footer instead. So there are two layout families here, not one,
and the honest answer to "one shell or stop?" is: **one shell module, two
arrangements, no variant flag.**

---

## Tasks

### Task 1 — Survey (steps 1–3)

Quote the five literal sites and the two near-copies byte-exactly. Report the
`(driver)` group's shell as the sibling to look like. Survey where transient
feedback renders on each screen relative to the control that caused it, and name
every screen where it can leave the viewport.

### Task 2 — Build the shell and move every screen onto it (steps 4–5)

`src/app/(driver-fullscreen)/TakeoverScreen.tsx`, a sibling of `layout.tsx`:

- `TakeoverScreen` — the statement layout. Owns `min-h-dvh`, `px-5 py-8`,
  `justify-between`, the `max-w-md` column, the top region and the action region.
- `TakeoverRunner` — the task layout. Owns the sticky header, the scrolling body,
  the sticky footer, and the same column inside each.
- `TakeoverAlert` — the one red banner, replacing three shapes.

**The rule, enforced structurally:** `feedback` is a prop on both shells and both
render it as the first child of the **action** region. A screen cannot put its
banner a viewport away from its button without leaving the shell.

### Task 3 — Verify (step 6) and guard

Measure the before/after vertical distance between each primary action and its
error, at 390×844, in real Chromium with the repo's own Tailwind build. Add a
source-scanning guard with a "was it actually found" assertion, a length floor
and CRLF normalisation (quick-546), proven red by reinstating the defect
(quick-549).

---

## Constraints honoured

No copy, validation, gate logic or server action changes. No touch target
changed. No design system, component library or token set introduced. No DDL,
no data changes.
