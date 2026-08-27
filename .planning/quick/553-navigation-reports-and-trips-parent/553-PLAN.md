# quick-553 — Reports navigation, and the parent-with-children link

## Problem

Two defects, both found by DOM query in a real browser as an OWNER, both invisible
to `tsc` and to reading the diff.

**1. No Reports section exists in the mounted sidebar.** Five report pages ship
under `/carrier/reports/*`. The desktop sidebar links none of them. The group that
used to describe them lived in `components/navigation/sidebar.tsx`, which quick-552
DELETED (commit 5952ad92) after its orphan scanner flagged it. quick-552 lifted
`Live Board` into the mounted `AnimatedSidebar` and left the Reports group behind.
The scanner is not at fault — it asks "does anything import this file", not "did a
destination die with it". `navigation-reachability.spec.ts` is the guard for that,
and Today's Trips was never in its list.

**2. A sidebar parent that has children is not a link — in EITHER state.**
- Expanded: `SidebarGroup.tsx:82` renders the parent as a plain `<div>`. It also
  silently drops `item.badge`, so the Trips `DispatchBadge` never renders.
- Collapsed: `SidebarFlyout.tsx:65` makes the trigger a `<button>`.

Because Document Imports is a child of Trips, `/carrier/trips` has no sidebar link
in either state. Confirmed in the baseline DOM: `/carrier/imports` present,
`/carrier/trips` absent.

## Baseline (real browser, 1440x900, owner session, /carrier/dashboard)

groups: Intelligence, Operations, Resources
hrefs:  /carrier/dashboard, /live-map, /live-map?view=board, /carrier/dashboard,
        /carrier/clients, /carrier/contracts, /routes, /carrier/loads,
        /carrier/imports, /carrier/fleet/drivers, /carrier/fleet/trucks,
        /carrier/facilities, /checklists, /carrier/templates, /carrier/messages,
        /settings, /help

No `/carrier/reports/*`. No `/carrier/trips`.

## Tasks

### Task 1 — Make a parent with children a real link, in both sidebar states

`SidebarGroup.tsx` expanded branch: render the parent through the existing
`SidebarItem` (already a `<Link>`, already carries the active pill, press feedback,
badge slot and tooltip) instead of the hand-rolled `<div>`. Keep the indented
children block exactly as it is — children stay inline and always visible.

`SidebarFlyout.tsx`: `Popover.Trigger asChild` wraps a `<Link href={item.href}>`
instead of a `<button>`. Hover/focus still open the popover; a click navigates.

DO NOT add a chevron disclosure toggle. That turns a currently-visible child link
into a click-to-reveal target — the same "one unreachable page for another" trade
in a subtler form, and it puts a second interactive element inside a 36px row,
which is the nested-interactive shape `TruckRowExpanded` was deleted for.

DO NOT fix this by removing the children.

### Task 2 — Restore the Reports group in the mounted sidebar

A flat top-level group in `AnimatedSidebar`, NOT a parent-with-children:
`/carrier/reports` has no `page.tsx`, so a parent item would have no href to give
even with Task 1 landed.

Items and gates, matching the deleted group and the report pages' own stated intent:

| Item          | href                            | permission        |
|---------------|---------------------------------|-------------------|
| Revenue       | /carrier/reports/revenue        | revenueReport     |
| Driver Pay    | /carrier/reports/driver-pay     | driverPayReport   |
| AR Aging      | /carrier/reports/aging          | arAgingReport     |
| Performance   | /carrier/reports/performance    | performanceReport |
| Today's Trips | /carrier/reports/todays-trips   | performanceReport |

Today's Trips shares `performanceReport` deliberately — its page header says why,
and DEC-16 records what adding a value to a hand-maintained vocabulary costs.
Group renders only if at least one item survives its gate.

### Task 3 — Extend navigation-reachability.spec.ts

Add every destination this task touches: `/carrier/trips` and all five reports
hrefs. One line each. That spec is the mechanical gate for this whole class.

## Verification

- Real-browser DOM query showing each href present. Not a diff read.
- Both sidebar states — expanded AND collapsed rail.
- `tsc --noEmit` in apps/web and apps/mobile, each with an injected probe error
  to prove the gate is not blind.
- vitest suite diffed against pre-task commit 8a1c4222.

## Out of scope (found, reported, not changed)

- `/carrier/driver-pay` has no page.tsx, yet two breadcrumbs link to it.
- The mobile More menu's Reports section is permission-ungated.
- `/carrier/reports` has no index page.
