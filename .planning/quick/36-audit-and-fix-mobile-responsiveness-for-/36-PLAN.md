---
phase: quick-36
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/routes/route-form.tsx
  - src/components/routes/route-list.tsx
  - src/components/driver/route-detail-readonly.tsx
  - src/app/(driver)/my-route/page.tsx
  - src/app/(driver)/layout.tsx
autonomous: true

must_haves:
  truths:
    - "Route form stop editor renders without horizontal overflow on a 375px wide screen"
    - "Stop reorder/remove buttons meet 44px minimum touch target"
    - "Routes list table is scrollable horizontally on mobile (no content clipped)"
    - "Mark Departed button meets 44px minimum touch target on driver portal"
    - "Active stop panel status and Mark Departed button stack vertically on narrow screens"
    - "Driver portal uses semantic color tokens (not hardcoded gray-*) for dark mode"
  artifacts:
    - path: "src/components/routes/route-form.tsx"
      provides: "Mobile-responsive stop editor"
    - path: "src/components/routes/route-list.tsx"
      provides: "Horizontally scrollable routes table with stacked filter bar"
    - path: "src/components/driver/route-detail-readonly.tsx"
      provides: "Touch-friendly driver active stop panel with adequate tap targets"
    - path: "src/app/(driver)/my-route/page.tsx"
      provides: "Dark-mode-compatible driver route page"
    - path: "src/app/(driver)/layout.tsx"
      provides: "Tighter mobile padding on driver layout header"
  key_links:
    - from: "route-detail-readonly.tsx MarkDepartedButton"
      to: "driver/markStopDeparted action"
      via: "dynamic import — no layout change needed"
---

<objective>
Fix mobile responsiveness across Phase 19 new components and the existing routes list table.

Purpose: Drivers use the portal on phones. Dispatchers may use routes on tablets. Current issues cause horizontal overflow, undersized tap targets, and broken layouts on screens <640px.
Output: All listed files render correctly at 375px viewport width with 44px+ tap targets throughout.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix route-form.tsx stop editor mobile layout and touch targets</name>
  <files>src/components/routes/route-form.tsx</files>
  <action>
Fix three mobile issues in the stop editor section:

1. **Stop card position badge clipping** — The position badge uses `absolute -left-3 top-4` which clips outside the card on screens where the parent has no overflow-visible context. Change the stop card container from `relative rounded-lg border border-border bg-muted/20 p-4` to `relative rounded-lg border border-border bg-muted/20 p-4 pl-7` and move the badge to `-left-3.5` with `shrink-0` to ensure it stays visible. Alternative: replace absolute badge with a flex layout — make the stop card `flex gap-3 items-start` and place the badge as a flex child (not absolute), like the stop timeline in route-detail.tsx already does. Use this flex approach for consistency.

   Change stop card from:
   ```tsx
   <div key={stop.clientId} className="relative rounded-lg border border-border bg-muted/20 p-4">
     <div className="absolute -left-3 top-4 flex h-6 w-6 ...">
       {idx + 1}
     </div>
     <div className="ml-4 space-y-3">
   ```
   To:
   ```tsx
   <div key={stop.clientId} className="flex gap-3 items-start rounded-lg border border-border bg-muted/20 p-4">
     <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm mt-0.5">
       {idx + 1}
     </div>
     <div className="flex-1 min-w-0 space-y-3">
   ```

2. **Reorder/remove button tap targets too small** — Current buttons use `p-1` (24px). Change to `p-2 min-h-[44px] min-w-[44px]` (44px). Update all three buttons (moveStopUp, moveStopDown, removeStop) in the header row.

3. **"Add Stop" button too small** — Change from `px-3 py-1.5 text-xs` to `px-3 py-2.5 text-sm min-h-[44px]` so it meets the touch target minimum.

4. **Header row: type select + reorder buttons may not fit** — The `flex items-center gap-2` header row can overflow on narrow stops. Wrap the type select in `flex-1 min-w-0` so it shrinks, and keep the reorder group as `flex items-center gap-0.5 shrink-0`.

No other logic changes. Keep all existing state management, AddressAutocomplete usage, and form submission logic identical.
  </action>
  <verify>
Visual inspection: render the new/edit route page on a 375px viewport (Chrome DevTools mobile emulation). Add 2 stops. The stop cards should display with the numbered badge visible inside the card, not clipped. Reorder and remove buttons should be easily tappable (>=44px). The type select should not overflow its container.

TypeScript check: `npx tsc --noEmit` passes with no new errors.
  </verify>
  <done>
Stop cards use flex layout (no absolute badge). Reorder/remove buttons are min 44px. Add Stop button is min 44px. No horizontal overflow at 375px.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix route-list.tsx table mobile overflow and filter bar stacking</name>
  <files>src/components/routes/route-list.tsx</files>
  <action>
Fix two mobile issues in the routes list:

1. **Table horizontal overflow** — The table has 7 columns (Origin, Destination, Scheduled Date, Driver, Truck, Status, Actions) with `whitespace-nowrap px-6 py-4` on cells. On mobile this causes severe overflow with no scroll. Wrap the table in a horizontally scrollable container:

   Change:
   ```tsx
   <div className="overflow-hidden rounded-lg border border-gray-200 shadow">
     <table className="min-w-full divide-y divide-gray-200">
   ```
   To:
   ```tsx
   <div className="overflow-x-auto rounded-lg border border-border shadow">
     <table className="min-w-full divide-y divide-border">
   ```
   Also update `bg-gray-50` → `bg-muted/50`, `bg-white` → `bg-card`, `divide-gray-200` → `divide-border`, `text-gray-500` → `text-muted-foreground`, `text-gray-900` → `text-foreground`, `hover:bg-gray-50` → `hover:bg-muted/50` throughout the table for design token consistency.

2. **Filter bar side-by-side overflow** — The `flex items-center space-x-4` row with search input + status select sits side-by-side. On mobile the inputs are too narrow. Change to `flex flex-col gap-3 sm:flex-row sm:items-center`. Also change the hardcoded `border-gray-300`, `focus:border-blue-500`, `focus:ring-blue-500` classes on both inputs to use design tokens: `border-border focus:border-primary focus:ring-primary/20`.

3. **Cell padding** — `px-6 py-4` is large on mobile (wastes horizontal space). Change to `px-4 py-3 sm:px-6 sm:py-4` so mobile cells are tighter.

4. **Actions column tap targets** — "View" and "Delete" links are bare text with no padding (touch target is just text height ~20px). Change to `inline-flex items-center rounded px-2 py-1.5 text-sm text-primary hover:bg-muted transition-colors` and `inline-flex items-center rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors`.
  </action>
  <verify>
Visit /routes at 375px width in Chrome DevTools. The filter bar should stack vertically. The table should be horizontally scrollable (not clipped). View/Delete should be tappable.

TypeScript check: `npx tsc --noEmit` passes.
  </verify>
  <done>
Filter bar stacks on mobile. Table has overflow-x-auto wrapper. Cell padding is reduced on mobile. Action buttons are min ~36px and use design tokens.
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix driver portal mobile — active stop panel touch targets and dark mode tokens</name>
  <files>
    src/components/driver/route-detail-readonly.tsx
    src/app/(driver)/my-route/page.tsx
    src/app/(driver)/layout.tsx
  </files>
  <action>
Fix three driver portal mobile issues:

**route-detail-readonly.tsx:**

1. **MarkDepartedButton tap target** — Current: `px-3 py-1 text-xs` (~28px height). Change to `px-4 py-2.5 text-sm font-medium min-h-[44px]` so it meets the 44px minimum on mobile.

2. **Active stop panel: status badge + button may not fit side-by-side** — The `flex items-center gap-2` row works on wide screens but on narrow phones (<375px) status badge + button may squish. Change to `flex flex-wrap items-center gap-2` (already has flex-wrap via... check: it does NOT have flex-wrap). Add `flex-wrap` to the `mt-2 flex items-center gap-2` div.

3. **Hardcoded gray tokens** — Replace throughout the file:
   - `border-gray-200 bg-white` → `border-border bg-card`
   - `text-gray-900` → `text-foreground`
   - `text-gray-500` → `text-muted-foreground`
   - `bg-gray-100 text-gray-600` (stop position badge) → `bg-muted text-muted-foreground`
   - `text-gray-900` in stop list → `text-foreground`

**my-route/page.tsx:**

4. **Hardcoded gray tokens** — Replace:
   - `text-gray-900` (h1) → `text-foreground`
   - `text-gray-600` (subtitle) → `text-muted-foreground`
   - `border-gray-200 bg-white` (Route Documents card) → `border-border bg-card`
   - `text-gray-900` (h2 headings) → `text-foreground`

**layout.tsx (driver):**

5. **Header padding** — Change `px-6 py-4` to `px-4 py-3 sm:px-6 sm:py-4` so on very small phones there is more horizontal room for content. Change `p-6` on `<main>` to `p-4 sm:p-6`.

No logic changes in any file. Keep all imports, state, and action wiring identical.
  </action>
  <verify>
Visit /my-route at 375px in Chrome DevTools mobile emulation. The active stop panel should show the status badge and Mark Departed button side by side (or wrapped on very small screens). Mark Departed button should be easily tappable. Cards should respect dark mode (use card/foreground tokens not hardcoded white/gray).

TypeScript check: `npx tsc --noEmit` passes.
  </verify>
  <done>
Mark Departed button is min-h-[44px]. Active stop panel wraps on narrow screens. All three files use design token classes (border-border, bg-card, text-foreground, text-muted-foreground) instead of hardcoded gray-*.
  </done>
</task>

</tasks>

<verification>
After all three tasks:
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — successful build
3. Chrome DevTools: set viewport to 375px and verify:
   - /routes/new — stop editor cards use flex layout, buttons are comfortably tappable
   - /routes — filter bar stacks, table scrolls horizontally
   - /my-route — Mark Departed button is large enough, cards are dark-mode aware
</verification>

<success_criteria>
- Zero TypeScript errors after changes
- No horizontal overflow at 375px on: route form with stops, routes list, driver route page
- All interactive buttons/links in modified files meet 44px touch target
- No hardcoded `gray-*` color classes remain in route-detail-readonly.tsx or my-route/page.tsx
</success_criteria>

<output>
After completion, create `.planning/quick/36-audit-and-fix-mobile-responsiveness-for-/36-SUMMARY.md` using the summary template.
</output>
