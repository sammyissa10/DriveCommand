# quick-553 — Reports navigation, and the parent-with-children link

**Commits:** `5d27a289`, `cc6aa354`, `9ba5af68` (pre-task HEAD `8a1c4222`)

---

## 1. Which sidebar is mounted, and the orphan-scanner question

**Mounted:** `components/Sidebar/index.tsx` → `AnimatedSidebar`, imported by
`navigation/owner-shell.tsx:5`, rendered `hidden lg:block`. Four groups:
Intelligence, Operations, Resources, and an unlabelled Messages divider.

**`components/navigation/sidebar.tsx` no longer exists.** quick-552 deleted it in
`5952ad92`. **The orphan scanner DID catch it** — `no-orphaned-navigation-components.test.ts`
is quick-552's own guard, and the file it was written about went in the same commit.

The scanner is not the gap. It asks "does anything import this file". quick-552
lifted `Live Board` out (its subject) and **left the Reports group to die with the
file**. No guard in the repo asks "did a live destination just get deleted".
`navigation-reachability.spec.ts` is the one that would have, and Today's Trips
was never added to it — which is now fixed.

## 2. Reports audit

| Route | Page | Desktop sidebar (before) | Mobile More | Other inbound | Verdict (before) |
|---|---|---|---|---|---|
| `/carrier/reports/revenue` | yes | no | yes | `DashboardMobile:201` | mobile-only |
| `/carrier/reports/driver-pay` | yes | no | yes | `KPIStrip:79`, alerts, activity, notification-center | reachable via KPI tile |
| `/carrier/reports/performance` | yes | no | yes | none | **desktop-stranded** |
| `/carrier/reports/todays-trips` | yes | no | yes | none | **desktop-stranded** |
| `/carrier/reports/aging` | yes | no | no | none | **stranded everywhere** |
| `/carrier/driver-pay/reports` | yes | no | no | own child page | **stranded** |

The two named in the brief: **Performance is not stranded outright, it is
desktop-stranded** — `owner-more-menu.tsx:60` lists it, but that component mounts
inside `OwnerBottomNav`, which is `lg:hidden`. **Driver Pay is reachable on
desktop**, but by the dashboard KPI tile rather than by navigation.

All five now have a desktop sidebar link.

## 3. Reports navigation added

`AnimatedSidebar`, matching how Live Board was wired in quick-552 — mounted
component, per-item permission gate, DOM-verified:

| Item | href | permission |
|---|---|---|
| Revenue | `/carrier/reports/revenue` | `revenueReport` |
| Driver Pay | `/carrier/reports/driver-pay` | `driverPayReport` |
| AR Aging | `/carrier/reports/aging` | `arAgingReport` |
| Performance | `/carrier/reports/performance` | `performanceReport` |
| Today's Trips | `/carrier/reports/todays-trips` | `performanceReport` |

**Flat, not a parent with children** — even though this task just made a parent
with children clickable. `/carrier/reports` has **no `page.tsx`**; a parent item
would have no href to give. Today's Trips is gated in the same branch as
Performance so the two cannot drift apart.

## 4. The parent-with-children fix

The defect was worse than reported, in two ways found while reading it:

- The `<div>` at `SidebarGroup.tsx:82` also dropped `item.badge` — the Trips
  `DispatchBadge` had never rendered.
- **`SidebarFlyout.tsx:65` used a `<button>` as the popover trigger**, so on a
  collapsed rail `/carrier/trips` had no `<a href>` either. Fixing only the
  expanded branch would have left the page unreachable for anyone who collapses
  the sidebar — and would have left the new e2e test green while doing so.

**Approach: reuse `SidebarItem`, do not fork it.** It is already a `<Link>` with
the active pill, press feedback, badge slot and tooltip. The expanded parent now
renders through it; the indented children block is untouched. The flyout trigger
becomes `<Link href={item.href}>` — hover and focus still open the popover, a
click also navigates — and the focus ring moves onto the anchor, having been on
the inner non-focusable div where it never fired.

**Rejected:** a chevron disclosure toggle. It turns a currently-visible child link
into a click-to-reveal target — the same "one unreachable page for another" trade
in subtler form — and puts a second interactive element in a 36px row, the shape
`TruckRowExpanded` was deleted for in Phase 11. **Children were not removed.**

## 5. e2e coverage

`REQUIRED_SIDEBAR_HREFS` gains `/carrier/trips`, `/carrier/imports`, and all five
reports routes. Plus a **second test for the collapsed rail**, which the file did
not have and which is the only thing that can see the `SidebarFlyout` half. It
collapses via the `sidebar:state` cookie (`useSidebarState` reads it first and it
wins over localStorage); clicking the toggle would race the hydration effect.
Only the parent is asserted — the children are in a hover-mounted popover.

Header rewritten: failure mode 2 moved to past tense now the components are
fixed, and a third mode added for a destination dying with the orphaned file that
described it.

## 6. DOM proof (real browser, owner session, 1440x900, `/carrier/dashboard`)

**Before** — groups `[Intelligence, Operations, Resources]`; `/carrier/imports`
present, `/carrier/trips` absent; no `/carrier/reports/*` at all.

**After, expanded** — groups `[Intelligence, Operations, Resources, Reports]`.
`aside.querySelectorAll('a[href="..."]')`:

```
1 x  <a href="/carrier/trips">                  text="Trips"
1 x  <a href="/carrier/imports">                text="Document Imports"
1 x  <a href="/carrier/reports/revenue">        text="Revenue"
1 x  <a href="/carrier/reports/driver-pay">     text="Driver Pay"
1 x  <a href="/carrier/reports/aging">          text="AR Aging"
1 x  <a href="/carrier/reports/performance">    text="Performance"
1 x  <a href="/carrier/reports/todays-trips">   text="Today's Trips"
```

**After, collapsed rail** (`aside` computed width `56px`) — `/carrier/trips` is
`<a href="/carrier/trips">`. `/carrier/imports` correctly absent at rest: it is in
the hover popover, which is the flyout working.

**Interaction, not just presence:**
- collapsed: hover -> child link appears (flyout still opens); click -> navigates to `/carrier/trips`
- expanded: click -> `/carrier/trips`; active pill `rgb(22,25,34)` on the parent, child transparent
- Today's Trips link -> `/carrier/reports/todays-trips`, heading visible

**Proven not vacuous:** with both component commits reverted, the spec failed
naming exactly `/carrier/trips, /carrier/reports/revenue, /carrier/reports/driver-pay,
/carrier/reports/aging, /carrier/reports/performance, /carrier/reports/todays-trips`,
and the collapsed test failed separately.

## Gates

- **tsc apps/web: 0 errors — PROBED.** Injected `const __probe553: number = "not a number"`
  into `SidebarGroup.tsx`; tsc reported `(143,7): error TS2322` on that file. Removed.
- **tsc apps/mobile: 0 errors — PROBED.** Same probe in `lib/api-with-queue.ts`;
  reported `(31,7): error TS2322`. Removed. (The probe left a trailing blank line
  in both files; the diffstat caught it and both were reverted.)
- **vitest, diffed against `8a1c4222`:** identical both sides —
  `18 failed | 121 passed | 8 skipped (147 files)`, `66 failed | 1465 passed | 61 skipped | 3 todo (1595 tests)`.
  Zero regression. All 18 pre-existing failures are E251 header-scope and driver-pay
  exporter suites, none of which import anything this task touched.
- **Playwright** `navigation-reachability.spec.ts`: **2 passed.**
  (The default config's `setup` project fails on driver/sysadmin credentials —
  pre-existing, unrelated; the owner setup passes. Runs were done through a
  scratch config with no setup dependency, since only the owner session is needed.)

## Files

```
apps/web/src/components/Sidebar/SidebarGroup.tsx   | 43 +++++-----
apps/web/src/components/Sidebar/SidebarFlyout.tsx  | 28 +++++-
apps/web/src/components/Sidebar/index.tsx          | 75 ++++++++++++++
apps/web/e2e/owner/navigation-reachability.spec.ts | 82 ++++++++++++--
```

No DDL, no data changes, no dependency added, no report/board/data source touched.

## Found, reported, NOT changed

1. **`/carrier/driver-pay` has no `page.tsx`**, yet `driver-pay/reports/page.tsx:137`
   and `reports/[driverId]/page.tsx:78` both render a breadcrumb `<Link href="/carrier/driver-pay">`.
   That is a 404 shipped as a breadcrumb, and the whole `driver-pay` hub subtree
   (`/reports`, `/settlements`, `/pending`) has no nav entry — only
   `assignment-card.tsx:225` reaches into it.
2. **The mobile More menu's Reports section is permission-ungated** — a flat
   `const` with no `PermissionGuard`, unlike every other reports surface.
3. **`/carrier/reports` has no index page**, which is why the sidebar group is flat.
4. **`PERMISSION_GATED_PATHS` has no `/carrier/reports/todays-trips` entry**, so the
   report is `requireRole`-gated only. The sidebar entry now gates on
   `performanceReport`; the middleware does not.
5. **`isManager` in `Sidebar/index.tsx` and `NavItem` in `SidebarGroup.tsx` are
   unused**, both pre-existing. Left alone as unrelated churn.
