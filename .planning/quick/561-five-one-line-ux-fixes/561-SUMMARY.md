# quick-561 — SUMMARY

**Date:** 2026-08-27 · **Pre-task commit:** `74350e09` · **Branch:** feature/document-import

**Commits:** `fe0f7b06` (help) · `d0e3b8a0` (change-to-fail) · `e9361ae3` (assign)
· `42de3771` (trip card) · `c42da7d3` (notifications)

All five shipped. Two browser-verified, three source-only — the split is stated
per item because three of the five are driver-facing and there are no driver
credentials in this environment.

---

## 1 · `/help` — Guides above the stub cards

**Changed:** `<HelpGuides />` moved above `<HelpCategoryGrid />` in
`app/(owner)/help/page.tsx`, and the file's own layout list updated to match.
Ordering is the entire change — nothing here is new, it was below the fold.

**Verified in a browser** (1600×1100, `demo@drivecommand.com`), by DOM position
rather than by eye:

```
"Guides" heading            y = 372
first category-grid card    y = 440
GUIDES ABOVE THE GRID: true
guides above the fold (1100px viewport): true
```

And that the first guide link is real content, not another stub:

```
GET /help/carrier-operations -> 200
contains "Article content coming soon.": false
contains real article prose: true
```

The screenshot shows the first screen now filled with sixteen written guides
under Getting Started and Dispatch & Loads.

## 2 · "Change to fail" — the class

**Changed:** a fourth `AnswerButton` tone, `'correct'`, used only when
`answered`. The button was never styled louder on purpose: it is the same
component as Pass and Fail, and it looked louder because it is the **only one
rendered once an item is answered** — `flex-1` in a one-child row means full
width, so a solid red bar three times the width of the unanswered choices below
it sat against the item the driver had already dealt with.

`flex-1` moved out of the shared class string and into each tone, so the new one
can opt out:

```
before (all tones):  flex min-h-[56px] flex-1 items-center … bg-red-600 text-white
after  ('correct'):  flex min-h-[56px] items-center …
                     self-start bg-red-50 text-red-700 ring-1 ring-inset ring-red-200
                     hover:bg-red-100 active:bg-red-200
                     dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:hover:bg-red-950/60
```

`self-start` instead of `flex-1` so it sizes to its label; tinted-and-ringed
instead of solid fill. **Red stays** — the destination is still a failure and
Section 15 reserves red for exactly that. What changed is fill weight, not
meaning.

**`min-h-[56px]` is deliberately unchanged.** This is tapped with a glove on,
outdoors; 56 is already above the design system's 48 pt floor, and shrinking a
control to make it quieter is the wrong axis.

**Source-only** — driver-facing.

## 3 · Assign screen — blocked rows are no longer selectable

**Changed:** `disabled` on `PickerRow`, plus `cursor-not-allowed opacity-55` and
a neutralised hover.

**Not `disabled={blocked}`.** The guard is `blocked && !selected`, and the
reason is in this screen's own header: the pickers re-fetch on every change
because availability is a function of the planned day. So an option that was
legal when it was picked can become blocked when the start time moves.
Disabling it outright would leave that selection on screen and **unremovable**
— worse than the problem being fixed. A selected row stays live so it can always
be changed, or for the optional trailer toggled off.

**The refusal logic is untouched**, as instructed. `validateCommit` on the
server is still the only thing that decides. This stops the selection; it does
not re-derive the verdict.

**Source-only** — reaching this screen needs a live import in `NEEDS_REVIEW`
with stops, which is a multi-step setup rather than a page visit.

## 4 · Driver trip card — the copy

**Copy used:**

> **Day ends at** *{facility name}* · *{city}, {state}*

Muted, with a `Flag` icon, below the next-stop block.

**"Day ends at" rather than "Ends at"**, which is the assign screen's wording:
that one is a label in a labelled column where context is obvious. On a card
sitting directly under **Next stop**, "Ends at" alone could read as belonging to
that stop. One word buys the disambiguation.

**Nothing is fetched.** `getMyActiveDispatch` already selects the whole stops
array with `orderBy: { sequenceOrder: 'asc' }`, so the last element *is* the
last stop of the day — including the end stop Phase 7 materialises as a real
`CarrierStop` with `stop_type = 'layover'`, sequenced last.

Suppressed where it would be noise rather than information: a single-stop trip;
when the last stop **is** the next stop (the final leg — the card already says
it); and when there is no facility to name.

**On the residence mask** — quick-560 flagged this as unchecked and it has now
been checked. `getMyActiveDispatch` does not apply `maskFacilityForViewer`, and
that is correct rather than an oversight: Phase 7's mask keeps a driver's home
address from **staff**. This is the driver's own trip on their own dashboard,
and hiding their own address from them would be the mask pointed the wrong way.

**Source-only** — driver-facing.

## 5 · Notifications — unread first

**Changed:** `orderBy: [{ read: 'asc' }, { createdAt: 'desc' }]` — one line, in
two files.

**A correction to the framing this task inherited.** The API did *not* already
support this. `?unread=true` is a **filter**, and it is what the bell calls for
its badge count; nothing before this could **sort**. `orderBy` was
`createdAt: 'desc'` alone. This is a new capability, not a flag being switched
on.

**Scope addition, flagged rather than slipped in:** both endpoints, not one.
`/api/driver/notifications` carried the identical query shape and the identical
defect. Fixing the owner bell and leaving the driver bell would have been
arbitrary — same shape, same defect, same one-line remedy.

**The cap is unchanged at 20**, as instructed. It was never the problem; a
smaller window would have hidden the same items slightly faster.

**Verified in a browser**, at the API and in the rendered panel.

API, `?limit=20`:

```
first READ row at index : 2
last UNREAD row at index: 1
unread strictly before read: true
 [0] UNREAD 2026-08-27  Trip blocked — inspection failed
 [1] UNREAD 2026-08-26  Trip blocked — TX-1001 failed Check brakes and brake…
 [2] read   2026-06-16  Dispatch Generated
 [3] read   2026-06-15  Dispatch Generated
```

Panel as rendered:

> Trip blocked — inspection failed · **13h ago** | Trip blocked — TX-1001 failed
> Check brakes and brake lights · **21h ago** | Dispatch Generated · **2mo ago**

The two safety items now lead; the two-month-old auto-generated notices follow.

**One number worth correcting from quick-560:** that survey reported 5 unread
tenant-wide. The panel shows **2**, because the list is scoped to
`userId: null OR userId = session.userId` and the demo user is not the addressee
of the other three. The survey's tenant-wide count was right; the per-user count
is what a person actually sees.

---

## Verification

- **tsc probed in both apps.** `apps/web` 0 errors; probe (`const x: number =
  'y'`) placed in `driver-dispatch-card.tsx` — a file this task actually edited —
  reported `TS2322` there, so the gate is not blind; probe deleted, re-run clean.
  `apps/mobile` 0 errors, probed the same way.
- **Suite diffed against the pre-task commit, measured rather than recalled.**
  `git stash` → run → `git stash pop`:

  | | files | tests |
  |---|---|---|
  | baseline @ `74350e09` | 18 failed / 127 passed / 8 skipped | 66 failed / 1560 passed |
  | after | 18 failed / 127 passed / 8 skipped | 66 failed / 1560 passed |

  Zero delta; failing-file sets `diff`-identical. No tests were added this task,
  so zero delta is the correct result.

  **This also corrects quick-559's summary.** That task recorded its "after" as
  126 files / 1553 tests — a number taken *before* it wrote its own guard file.
  With the guard included the real figure is 127 / 1560, which is what both rows
  above show.

- **The dev server died mid-verification** and was restarted with a clean
  `.next` per the standing rule. The `/help` and notification measurements above
  are from after that restart, so neither is a stale-bundler reading.

## Not touched, as constrained

The five copies of `flex min-h-dvh flex-col justify-between px-5 py-8`;
`SearchableSelect` on the assign screen; the FAB; the Quick Action carousel
peek; the duty status block; the notification cap. No DDL, no data changes.

## Per-item audit

| Step | Status |
|---|---|
| 1 · `/help` Guides above stubs | **IMPLEMENTED** — browser-verified by DOM y-position, and the first guide link proved to be real content |
| 2 · "Change to fail" weight | **IMPLEMENTED** — new `'correct'` tone, class reported, touch target deliberately unchanged. Source-only |
| 3 · `disabled` on blocked rows | **IMPLEMENTED** — guarded as `blocked && !selected` so a selection cannot be stranded; refusal logic untouched. Source-only |
| 4 · Where the day ends | **IMPLEMENTED** — copy reported, no new query, three suppression cases, residence-mask question resolved. Source-only |
| 5 · Unread first | **IMPLEMENTED** — browser-verified at the API and in the panel; inherited premise corrected; second endpoint flagged as a scope addition; cap unchanged |
