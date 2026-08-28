# quick-565 — SUMMARY

**Date:** 2026-08-27 · **Branch:** `feature/document-import`
**Commits:** `c75f0381` (the footer), `e08a2e16` (the guard)
**Baseline:** `a093ea10` · **tsc:** 0 in both apps, **probed** · **Suite:** 1588 → 1600 passing, zero regressions

> **Numbering:** `gsd-tools init` computed 564; the task was named 565 and is
> filed as 565. 564 is an unused number, not a missing task.

---

## Step 1 — The filter path, and what cmdk exposes

`SearchableSelect` does not filter. Each option renders
`<CommandItem value={option.label}>`, and `<Command>` scores every item's `value`
against the typed search with `command-score`, hiding anything that scores 0.
That is why search matches the label only — the limitation quick-563 reported.

**Where a footer can live.** `CommandList` is `max-h-[300px] overflow-y-auto`. A
footer placed *inside* it scrolls away from the results it describes on any list
long enough to need one — which is every list long enough to need one. Placed
after `</CommandList>` but inside `<Command>`, it stays pinned below the scroll
area. That is quick-562's lesson applied: source adjacency is not screen
adjacency when one of the two scrolls.

**cmdk does expose what is needed.** It exports `useCommandState(selector)` over

```ts
declare type State = {
  search: string;
  value: string;
  filtered: { count: number; items: Map<string, number>; groups: Set<string> };
};
```

`search` and `filtered.count` are read from Command's own **context**, so the
consumer must render inside `<Command>` — which is precisely what keeps the
filter term from becoming a prop. The denominator is `options.length`, which
`SearchableSelect` already holds.

One thing I could not settle by reading the minified `cmdk` bundle: whether
`filtered.count` includes **disabled** items. If it excluded them, an empty
search on the truck picker would compute `hidden = 14 − 11 = 3` and show a
footer over an unfiltered list. Step 4's "clear the search" check is exactly the
observation that settles it, and it came back **ABSENT** at 14 items — so
disabled items are counted. Verified rather than assumed.

---

## Step 2 — The copy, approved before implementing

Two states that used to render identically:

| State | What renders now |
|---|---|
| **Options exist, search hid some or all** | footer: **`13 of 14 hidden by your search`** — one uniform shape, including `14 of 14` when everything is hidden |
| **No options exist at all** (`options.length === 0`) | **`Nothing to choose from.`** |
| *(unchanged)* search matched nothing, options exist | the caller's `emptyMessage` — "No drivers found." / "No trucks found." |

Both strings were put to the user and approved: the ratio form over a
count-plus-remedy phrasing, and the generic empty sentence over a new
caller-supplied prop.

`Nothing to choose from.` names **no noun**, and a test asserts that. The
component's options are drivers, trucks, trailers or trips depending on which of
seven call sites is rendering it; a generic component that guessed would be
wrong six times in seven.

Each sentence is **one whole string** returned from a function, never assembled
from JSX children — quick-517, where `<p>{n} stop{n===1?'':'s'} …</p>` rendered
"4 stopswill" on screen across two investigations that both blamed JSX trimming
and were both wrong.

---

## Step 3 — Every consumer this lands on

Seven sites, all pre-existing. No call site was edited; all seven inherit it.

| Consumer | Site | Verdict |
|---|---|---|
| `AssignmentScreen` | truck — 14 options, **3 blocked** | **Helps most.** The motivating case: "Ford" hides all three blocked trucks. |
| `AssignmentScreen` | driver — 7 options | **Helps.** No blocked drivers in the demo tenant, but the roster can produce them. |
| `AssignmentScreen` | trailer | **Dead.** `TRAILER_TYPES` is `new Set([])`, so `view.trailers` is always empty and the section never renders. |
| `DispatchLoadModal` | primary driver | **Helps.** Same silent omission; passes no `disabled` today, but a hidden driver is still hidden. |
| `DispatchLoadModal` | co-driver | **Helps.** The list already excludes the selected primary, so the total it reports is honest. |
| `DispatchLoadModal` | truck | **Helps.** |
| `DispatchLoadModal` | existing trips — a −30/+90 day window | **Helps.** Longest list of the seven. |

Nowhere is it wrong. The weakest case is a two- or three-option list where
"1 of 3 hidden by your search" is true but unremarkable — and it only appears
while a term is typed.

---

## Step 4 — Browser verification, Chromium at 1568×900, demo tenant

Server-side facts first: **14 trucks, 3 blocked** — `TRK-001 — Big red test`
(insurance expired), `TX-1001` (on a trip that day), `TX-1006` (inactive).

```
=== TRUCK picker (14 options, 3 blocked) ===
  empty search            items=14  footer=ABSENT
  search "Acadia 2021"    items= 2  footer="12 of 14 hidden by your search"
  search "Ford"           items= 1  footer="13 of 14 hidden by your search"
  search "zzzzz"          items= 0  footer="14 of 14 hidden by your search"   empty="No trucks found."
  search cleared          items=14  footer=ABSENT

=== DRIVER picker (7 options, 0 blocked) ===
  empty search            items= 7  footer=ABSENT
  search "Carlos"         items= 1  footer="6 of 7 hidden by your search"
  search "zzzzz"          items= 0  footer="7 of 7 hidden by your search"     empty="No drivers found."
  search cleared          items= 7  footer=ABSENT
```

- **A term that hides the blocked options** — `Ford` leaves one truck and reports
  **13 of 14 hidden by your search**. All three blocked trucks are among the
  thirteen. That is the gap this task existed to close.
- **A term matching nothing** — `zzzzz` shows **14 of 14 hidden by your search**
  *beneath* "No trucks found.". The pair is the point: the caller's sentence says
  the search found none, the footer says fourteen exist.
- **Cleared search** — footer **ABSENT**, not "14 of 14". The specific check
  asked for, and the one that proved `filtered.count` includes disabled items.

**The footer does not scroll away.** With the list scrolled 92px: footer top 732
= list bottom 732, `footerBelowList: true`, `footerVisible: true`, and
`elementFromPoint` at the footer's own centre returns the footer element rather
than something painted over it — the quick-562 occlusion check, applied here
rather than assumed.

---

## Step 5 — `CommandEmpty` still behaves

Confirmed above in both pickers: `zzzzz` renders **"No trucks found."** and
**"No drivers found."** exactly as before. The caller's `emptyMessage` is
untouched for the search-found-nothing case; only the never-had-anything case
was redirected, and on the assign screen that case is unreachable because
`AssignmentScreen` guards `view.drivers.length === 0` before rendering the
select at all. It is pinned by unit test instead.

---

## Diff summary

```
 apps/web/src/components/ui/command.tsx                                  |  +9 -2
 apps/web/src/components/ui/searchable-select.tsx                        | +104 -2
 apps/web/src/components/ui/__tests__/searchable-select-hidden-count.test.ts | +110 (new)
```

`command.tsx` gains only a re-export of `useCommandState`, so that file stays
the single door to `cmdk` as it already is for every other primitive.
`searchable-select.tsx` gains two exported pure functions, one 12-line
subcomponent, and one line in the JSX.

**Zero call sites changed.** Untouched, as constrained: filtering, sorting,
`sortPriority`, `disabled`/blockedness, and the assign screen.

---

## Gates

- **tsc web:** 0 errors — **probed** (TS2322 at `searchable-select.tsx:334`, removed; grep confirms none left).
- **tsc mobile:** 0 errors — **probed** (TS2322 at `app/_layout.tsx:155`, restored). Mobile untouched.
- **Suite:** baseline **1588 passed / 66 failed** at `a093ea10`; after **1600 / 66**. +12 = exactly the new file. Failing-file set **diff-identical in both directions**.
- **Guard proven red** by reinstating both defects: dropping the empty-search guard failed the four "says nothing" cases; collapsing the two empty states failed both distinction cases.

### A correction to how the baseline was measured

The first baseline run was **contaminated** — I launched it and then edited files
while it was still running, which is the quick-561 trap in a new form. It
reported 19 failed files / 1584 passed.

Re-measured with the tree stashed clean, `--silent` still reported 19 files /
1584 passed / 70 failed, while two consecutive `--reporter=json` runs both
reported **1588 passed / 66 failed** with byte-identical failing sets. So there
is genuine run-to-run variance of ±4 tests — the cold-cache flake quick-549
documented ("a cold vitest run in `apps/web` imports for ~82s, so a real-DB test
with a 30s timeout will flake") — and the stable figure agrees exactly with
quick-563's published baseline. **Before and after were then measured with the
same reporter**, which is the discipline that makes the +12 meaningful.

**Lint still not runnable** (recorded in quick-562): `next lint` no longer
accepts `--dir` and `apps/web` has no `eslint.config.js` for ESLint 9.

---

## Left open, deliberately

1. **The footer counts options, not blocked options.** It says "13 of 14 hidden",
   not "13 hidden, 3 of them unavailable". `SearchableSelect`'s vocabulary is
   `disabled`, and calling that "unavailable" is a semantic claim a generic
   component cannot back — `DispatchLoadModal` passes no `disabled` at all
   today. If the stronger sentence is wanted, it belongs behind an explicit
   opt-in prop, with its own review.
2. **`role="status"` announces on every keystroke.** Chatty for screen-reader
   users; the alternative was no announcement at all that the list is
   incomplete, which for the blocked-truck case is the worse trade. Worth
   revisiting if anyone actually uses this with a screen reader.
3. **Search still matches the label only** — unchanged from quick-563, and still
   the fix that would need cmdk's `keywords` forwarded.
