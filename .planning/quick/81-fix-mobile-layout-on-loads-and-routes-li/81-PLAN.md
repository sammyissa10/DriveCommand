---
phase: quick-81
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/loads/load-list.tsx
  - src/components/routes/route-list.tsx
autonomous: true
must_haves:
  truths:
    - "Loads list tab bar is usable on mobile (horizontally scrollable, no overflow)"
    - "Loads mobile cards show origin-to-destination route info"
    - "Routes search input matches the polished pattern from trucks/drivers (icon, rounded-lg, bg-card)"
    - "Routes status badges render correctly in dark mode"
    - "Both pages visually match the card/table pattern of trucks and drivers list pages"
  artifacts:
    - path: "src/components/loads/load-list.tsx"
      provides: "Mobile-friendly tab bar + enhanced mobile cards"
    - path: "src/components/routes/route-list.tsx"
      provides: "Polished search input + dark mode badges + consistent styling"
  key_links: []
---

<objective>
Fix mobile layout on loads and routes list pages to match the card-based pattern established on trucks and drivers pages.

Purpose: The loads and routes list components have mobile card sections but with styling inconsistencies and usability issues compared to the reference pages (trucks, drivers). This plan brings them to parity.

Output: Both list components updated with consistent mobile-first styling.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Reference files (known-good mobile card pattern):
@src/components/trucks/truck-list.tsx
@src/components/drivers/driver-list.tsx

Files to fix:
@src/components/loads/load-list.tsx
@src/components/routes/route-list.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix loads list mobile layout</name>
  <files>src/components/loads/load-list.tsx</files>
  <action>
Fix the following issues in LoadList to match the trucks/drivers reference pattern:

1. **Tab bar mobile overflow** — Wrap the tab bar in a horizontally scrollable container for mobile. Add `overflow-x-auto` and `-webkit-overflow-scrolling: touch` to the tab container. Use `flex-nowrap whitespace-nowrap` on the inner flex. Reduce tab padding on mobile with `px-3 sm:px-4` and use `text-xs sm:text-sm` for tab text.

2. **Mobile cards: add route info** — The mobile card currently shows customer + rate + date but omits the origin/destination. Add a line showing `{origin} -> {destination}` (using the arrow entity like routes does) in a `text-sm text-muted-foreground` div with truncate, placed between the customer/rate line and the date line. This matches how routes mobile cards show the route.

3. **Desktop table container consistency** — Change the desktop table container from `rounded-lg` to `rounded-xl` and add `shadow-sm` to match trucks/drivers pattern. The full class should be: `hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-sm`.

4. **Empty state consistency** — Update the empty state container from `rounded-lg` to `rounded-xl` to match.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Visually inspect: on narrow viewport (375px), tab bar should scroll horizontally without breaking layout, cards should show route info.
  </verify>
  <done>Loads list tab bar scrolls on mobile without overflow, mobile cards show origin/destination, desktop table styling matches trucks/drivers reference.</done>
</task>

<task type="auto">
  <name>Task 2: Fix routes list mobile layout and styling</name>
  <files>src/components/routes/route-list.tsx</files>
  <action>
Fix the following issues in RouteList to match the trucks/drivers reference pattern:

1. **Search input polish** — Replace the plain search input with the polished pattern from trucks/drivers:
   - Import `Search` from lucide-react
   - Wrap in `relative max-w-sm` div
   - Add Search icon: `<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />`
   - Update input classes to: `w-full rounded-lg border border-input bg-card pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors`
   - Keep the status filter select, but update its classes to match: `rounded-lg border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors`

2. **Desktop table container consistency** — Change the desktop table wrapper from `hidden md:block overflow-x-auto rounded-lg border border-border shadow` to `hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-sm`. Move `overflow-x-auto` to an inner div wrapping just the table (like trucks/drivers do).

3. **Dark mode status badges** — Update `getRouteStatusClasses` to include dark mode variants:
   - IN_PROGRESS: `bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400` (matches trucks)
   - COMPLETED: `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400` (matches trucks green pattern)
   - Default (PLANNED): `bg-muted text-muted-foreground` (already works in dark mode)
   Also update the inline status badge in the columns definition (around line 113-134) to use the same `getRouteStatusClasses` function instead of duplicating logic.

4. **Empty state consistency** — Update from `rounded-lg bg-card p-8 text-center shadow` to match trucks/drivers: `rounded-xl border border-border bg-card p-16 text-center`. Add a route icon (import `MapPin` from lucide-react) with `mx-auto h-12 w-12 text-muted-foreground/30 mb-4`, and split text into title `text-lg font-medium text-muted-foreground` and subtitle `mt-1 text-sm text-muted-foreground/70`.

5. **Table body background** — Remove `bg-card` from tbody (line 279) since the outer wrapper now has `bg-card`.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Visually inspect: search input should have the search icon, status badges should look correct in dark mode, empty state should match trucks/drivers.
  </verify>
  <done>Routes list search input has icon and polished styling, status badges work in dark mode, desktop table and empty state containers match trucks/drivers reference pattern.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Both loads and routes list pages render mobile cards at 375px viewport width
- Loads tab bar scrolls horizontally on mobile
- Routes search has icon prefix matching trucks/drivers
- Routes status badges are readable in dark mode
- Desktop tables on both pages use `rounded-xl` + `shadow-sm` + `bg-card` container pattern
</verification>

<success_criteria>
Both loads and routes list pages visually match the mobile card pattern and desktop table styling established by trucks and drivers list pages. No regressions in functionality (filtering, sorting, navigation all still work).
</success_criteria>

<output>
After completion, create `.planning/quick/81-fix-mobile-layout-on-loads-and-routes-li/81-SUMMARY.md`
</output>
