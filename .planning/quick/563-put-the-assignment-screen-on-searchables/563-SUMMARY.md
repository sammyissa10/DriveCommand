# quick-563 — SUMMARY

**Date:** 2026-08-27 · **Branch:** `feature/document-import`
**Commits:** `a60c3f38` (the pickers), `a64bc31e` (the guard)
**Baseline:** `e68216b2` · **tsc:** 0 in both apps, **probed** · **Suite:** 128 → 129 files, 1566 → 1588 tests, zero regressions

---

## Step 1 — The API, quoted, before using it

`src/components/ui/searchable-select.tsx`:

```ts
export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Optional status for display - e.g., 'available', 'on_trip', 'off_duty' */
  status?: string;
  /** Optional secondary label - e.g., truck make/model */
  secondaryLabel?: string;
  /** Whether this option should be disabled */
  disabled?: boolean;
  /** Sort priority - higher numbers appear first */
  sortPriority?: number;
}
```

**A disabled option** — `disabled` is forwarded straight to cmdk's `CommandItem`,
whose shared class string is
`... data-[disabled=true]:pointer-events-none ... data-[disabled=true]:opacity-50`.
So it is dimmed to 50% and cannot be clicked. Measured in the browser, not
inferred: `data-disabled="true"`, `opacity: 0.5`, `pointer-events: none`.

**A badge** — only when `showStatus`, and only through `getStatusConfig`:

```ts
function getStatusConfig(status: string | undefined) {
  if (!status) return null;
  const normalized = status.toLowerCase().replace(/\s+/g, '_');
  return STATUS_CONFIG[normalized] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-600 …',
    priority: 0,
  };
}
```

**`sortByStatus` expects** a descending sort on an explicit priority, falling
back to the badge's:

```ts
return [...options].sort((a, b) => {
  const priorityA = a.sortPriority ?? getStatusConfig(a.status)?.priority ?? 0;
  const priorityB = b.sortPriority ?? getStatusConfig(b.status)?.priority ?? 0;
  return priorityB - priorityA;
});
```

### Three things it cannot do, reported before building

1. **The trigger renders `label` and nothing else.**
   `<span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>`
   — no badge, no `secondaryLabel`. Collapsing a list therefore **deletes** the
   availability, hours and compliance text for the option a dispatcher has
   actually chosen. **This is what made the summary in step 5 mandatory rather
   than optional.**

2. **`showStatus` is only presentable for the eight keys in `STATUS_CONFIG`.**
   The fallback prints the raw string in grey. Passing a carrier truck's own
   `status` would have rendered the literal **`out_of_service` in grey** — a
   snake_case identifier on screen, in a neutral colour, for a truck that must
   not roll. Every status is mapped to a known key; none is passed through.

3. **Search matches `label` only.** `<CommandItem value={option.label}>` is what
   cmdk filters on, and `SearchableSelect` does not forward cmdk's `keywords`.
   A dispatcher can search "Webb" or "Cascadia", not "expired". **Stated as a
   limit, not worked around** — the fix is a prop on a shared component that has
   another consumer, and the brief forbids a new component and a workaround
   both.

Nothing else the screen needs is missing, so it fits and the build went ahead.

---

## Step 2 — The established usage, and a correction to the brief

**The brief names three pickers, and two of them do not use this component.**
Grep for `SearchableSelect` across `src/` returns exactly two files: the
component, and **`DispatchLoadModal.tsx`** — the same "exactly ONE consumer"
quick-560 reported.

| Picker the brief names | What it actually is |
|---|---|
| New Trip's driver picker | a plain native `<select>` in `NewDispatchForm.tsx` (`<option value="">Select driver...</option>`) — **not** SearchableSelect |
| the client picker | no such component; clients are chosen elsewhere |
| the facility picker | **`FacilitySearchModal`** — a modal with server-side search. A defensible different choice: facilities are a large, server-queried set, not a bounded roster |

So the established usage is `DispatchLoadModal`, four times, and it is matched
exactly:

```tsx
<SearchableSelect
  options={driverOptions}
  value={primaryDriverId}
  onValueChange={handlePrimaryDriverChange}
  placeholder="Search drivers..."
  searchPlaceholder="Search by name..."
  emptyMessage="No drivers found."
  disabled={submitting}
  showStatus
  sortByStatus
/>
```

Every prop on the two new pickers is one of these, in the same order, with the
same `showStatus sortByStatus` pair. No variant was invented.

---

## Step 3 — Every inline fact preserved

`driverMeta` and `truckMeta` reproduce `PickerRow`'s `meta` **character for
character**, and are used for BOTH the option's `secondaryLabel` and the summary
line, so the open list and the closed picker cannot describe the same option two
different ways (a test asserts this).

| Fact | Where it is now |
|---|---|
| availability ("Available" / "On a trip that day") | badge **and** the meta string |
| hours ("6h 30m left" / "No HOS log") | meta string |
| compliance flags ("CDL expired", "CDL expiring soon") | meta string, and drive the badge colour |
| insurance / registration expiry | meta string; badge → red "Expired Docs" |
| on a trip that day | badge → "On Trip" / "In Use" |
| inactive, out of service, in the shop | badge → "Inactive" / "Maintenance" |

**Badges are derived from what the server states as data** — `assignedToday`,
`status`, `blocked` — never by re-reading flag text to work out which flag
blocks. `validateCommit` still owns that.

One imprecision, stated rather than hidden: a driver who is **both** on a trip
and CDL-expired shows "On Trip", not "Expired Docs", because the server sends one
`blocked` boolean and two independent facts. Nothing is lost — the meta reads
"On a trip that day · No HOS log · CDL expired" in full — and the option is
disabled either way.

---

## Step 4 — quick-561 survives, and matters more

`disabled: blocked && !selected`, unchanged. It matters **more** on this
component than on the old rows: `SearchableSelect` routes every change through
`onSelect` on the option itself, and a disabled `CommandItem` carries
`pointer-events-none` — so disabling the current selection would make the picker
a **one-way door**, not merely an odd-looking row. Two tests pin it, and
reinstating a blanket `disabled` fails one by name.

---

## Step 5 — What the screen looks like collapsed, and the summary decision

Two full-height stacked lists became two rows. Measured at 1568×900:
**document height 900 against a 900px viewport — the entire screen fits with no
scrolling**, driver picker at y 234, truck picker at y 342, Create trip at y 822,
all three in view.

**A summary was added: one line under each picker**, reading the same
`driverMeta` / `truckMeta` string. It is not an addition beyond the brief — it is
how step 3 survives step 4. `SearchableSelect`'s trigger shows the label only, so
without it, choosing a driver would hide the availability, hours and compliance
text that the flat rows showed inline, and Section 11's requirement is that the
picker shows availability inline "so no second screen is needed".

It shows:
- **nothing selected** — "Nobody assigned yet." / "No truck assigned yet."
- **selected and clear** — `Available · 6h 30m left`
- **selected and blocked** — a red warning triangle and `Not available — {meta}`.
  This is the visible half of quick-561: the option stays selectable so it can be
  changed, and this is where a dispatcher sees that it needs to be.

Nothing else was added. The `max-w-2xl` page width was **left alone** — quick-560
noted `OwnerShell` sets no max-width, but the brief asked for the summary and
nothing beyond it. The Driver and Truck sections were merged into one card, which
is what "both choices on screen at once" required.

---

## Step 6 — Browser verification, Chromium at 1568×900, demo tenant

Roster the server actually returned: **7 drivers (0 blocked), 14 trucks
(3 blocked)**.

| Check | Result |
|---|---|
| **Click path — driver** | trigger reads "Choose a driver…" → **1 click** opens, listing all 7 → **1 click** selects. Trigger then reads "Carlos Rivera". |
| **Click path — truck** | identical, 14 options. |
| **Search filters** | typed `Carlos` → **1 of 7** options remain. Typed `zzzzz` → **0 options and the empty message is visible**. |
| **Blocked visibly marked** | the 3 blocked trucks render **last** (indexes 11–13 of 14) with `data-disabled="true"`, `opacity: 0.5`, `pointer-events: none`, and badges **In Use** (blue), **Expired Docs** (red), **Inactive** (red) — each beside its own words: "On a trip that day", "Available · Insurance expired", "Available · Inactive". |
| **Blocked unselectable** | a `{ force: true }` click on a blocked truck left the trigger **unchanged**. |
| **Both selections visible at once** | yes — `docHeight: 900`, `viewport: [1568, 900]`, `scrollY: 0`, both comboboxes `inView: true`, Create trip `inView: true` and **enabled** once both are chosen. |

**Sorting is doing real work**: "In Use" carries status priority 50, above
"Ready"'s… no — above "Not Ready"'s 20, and it still sank below every green
"Ready" truck, because `sortPriority` puts pickability first.

**Not verified in the browser: a blocked DRIVER.** This tenant has none — all 7
drivers are clear. The driver blocked path is covered by the unit guard (8 shapes
across drivers and trucks) and by the shared `optionFor`, which both lists use.
Said plainly rather than implied by the truck result.

---

## Diff summary

```
 apps/web/src/lib/document-import/assignment-options.ts             | +234  (new)
 apps/web/src/components/carrier/imports/AssignmentScreen.tsx       | +148 -130
 apps/web/src/lib/document-import/__tests__/assignment-options.test.ts | +215  (new)
```

`AssignmentScreen` lost `PickerRow` and `TruckPickerRow` (76 lines) and gained
`SelectionLine`. The header's ASCII drawing was updated to what ships — the file
no longer disagrees with itself.

Untouched, as constrained: `validateCommit` and every other server action, the
blocks under Create trip, the warnings summary, the refresh/debounce contract,
what makes an option blocked, and `searchable-select.tsx` itself.

---

## Gates

- **tsc web:** 0 errors — **probed** (TS2322 at `assignment-options.ts:230`, then removed; grep confirms none left).
- **tsc mobile:** 0 errors — **probed** (TS2322 at `app/_layout.tsx:155`, restored). Mobile untouched.
- **Suite:** baseline **128 files / 1566 tests** at `e68216b2`; after **129 / 1588**. +1 file, +22 tests = exactly the new suite. 18 failed files / 66 failed tests **identical either side**, all pre-existing.
- **Guard proven red**, not reasoned red: a blanket `disabled` and a green badge on a blocked truck were both reinstated; 4 tests failed and named the decisions.

**Lint still not runnable** (recorded in quick-562): `next lint` no longer accepts
`--dir` and `apps/web` has no `eslint.config.js` for ESLint 9.

---

## Left open, deliberately

1. **Search cannot match a status or a compliance flag.** cmdk filters on
   `CommandItem value`, which is the label; `SearchableSelect` does not forward
   `keywords`. Closing it is a prop on the shared component, which
   `DispatchLoadModal` also consumes — its own change, with its own review.
2. **`NewDispatchForm`'s driver and truck pickers are still native `<select>`s.**
   That is the same convention-exists-and-is-not-adopted finding, one screen
   over, and this brief did not cover it. It would be the fifth instance.
3. **The trailer picker is unreachable** — `TRAILER_TYPES` is `new Set([])`, a
   pre-existing reported gap. Its code path was moved onto `SearchableSelect`
   with the other two so it is not left behind when a real trailer signal
   arrives.
