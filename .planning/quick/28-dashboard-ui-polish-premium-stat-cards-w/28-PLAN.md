---
phase: quick-28
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/dashboard/stat-card.tsx
  - src/components/dashboard/notifications-panel.tsx
  - src/app/(owner)/dashboard/page.tsx
autonomous: true
must_haves:
  truths:
    - "Stat cards have a colored top-border accent matching their variant (danger=red, warning=amber, default=per-card color)"
    - "Stat card icon area has a subtle gradient background instead of flat color"
    - "Notification alert rows have colored left-border accent (red/yellow/blue by severity)"
    - "Page header shows current date and fleet health summary badge"
    - "All styling works in both light and dark mode"
  artifacts:
    - path: "src/components/dashboard/stat-card.tsx"
      provides: "Premium stat card with top-border accent and gradient icon area"
    - path: "src/components/dashboard/notifications-panel.tsx"
      provides: "Alert rows with left-border accent by severity"
    - path: "src/app/(owner)/dashboard/page.tsx"
      provides: "Enhanced page header with date and fleet health badge"
---

<objective>
Polish dashboard UI with premium stat cards, left-accent alert rows, and an enhanced page header with fleet health summary.

Purpose: Elevate the dashboard from functional to visually polished — making key numbers pop and alerts scannable at a glance.
Output: Updated stat-card.tsx, notifications-panel.tsx, and dashboard page.tsx.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/dashboard/stat-card.tsx
@src/components/dashboard/notifications-panel.tsx
@src/app/(owner)/dashboard/page.tsx
@src/components/dashboard/upcoming-maintenance-widget.tsx
@src/components/dashboard/expiring-documents-widget.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Premium stat cards with top-border accent and gradient icon area</name>
  <files>src/components/dashboard/stat-card.tsx</files>
  <action>
Upgrade the StatCard component with these visual enhancements:

1. **Colored top-border accent** — Add a 3px colored top border to each card using `border-t-[3px]`. The color should match the card's identity:
   - For `variant='danger'`: `border-t-status-danger-foreground`
   - For `variant='warning'`: `border-t-status-warning-foreground`
   - For `variant='default'`: derive from the existing `colorMap` — add a `border` key to each colorMap entry:
     - Total Trucks: `border-t-status-info-foreground`
     - Active Drivers: `border-t-status-success-foreground`
     - Active Routes: `border-t-status-purple-foreground`
     - Maintenance Alerts: `border-t-status-warning-foreground`
     - Unpaid Invoices: `border-t-status-danger-foreground`
     - Active Loads: `border-t-status-info-foreground`
     - Revenue / Mile: `border-t-status-success-foreground`
   - When variant is danger/warning, use the variant color for the top border (overriding the colorMap value).

2. **Gradient icon area** — Replace the flat bg class on the icon container with a subtle gradient. Use inline style for the gradient since Tailwind doesn't do multi-stop gradients easily. The gradient goes from the existing bg color at ~60% opacity to transparent:
   - Keep the existing `colors.bg` class as a fallback
   - Add a subtle `bg-gradient-to-br` approach: use the colorMap bg class but layer it. Simplest approach: keep the bg class and add `ring-1 ring-inset ring-black/5 dark:ring-white/5` to give it depth, plus `shadow-sm` on the icon circle.

3. **Typography bump** — Change the value from `text-3xl` to `text-4xl` on larger screens: `text-3xl sm:text-4xl`. Keep `font-bold tracking-tight`.

4. **Improved spacing** — Bump card padding from `p-6` to `p-5 pt-4` (tighter top since the colored border provides visual weight). Add `gap-4` between the content and icon areas instead of relying on `ml-4`.

Keep the card as a Link. Keep all existing props and functionality. Keep dark mode compatible.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Visually inspect that cards render with colored top borders.</verify>
  <done>Stat cards display with colored top-border accent per card type, icon area has subtle depth treatment, value text is larger, spacing is refined.</done>
</task>

<task type="auto">
  <name>Task 2: Left-accent alert rows and enhanced page header</name>
  <files>src/components/dashboard/notifications-panel.tsx, src/app/(owner)/dashboard/page.tsx</files>
  <action>
**A. Notifications panel — left-border accent rows** (notifications-panel.tsx):

1. Replace the uniform `border border-border` on each alert row Link with a left-border accent style:
   - Remove the full border. Instead use: `border-l-[3px] rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50`
   - For critical severity: `border-l-status-danger-foreground`
   - For warning severity: `border-l-status-warning-foreground`
   - For info severity: `border-l-status-info-foreground`
   - Compute the border class based on `alert.severity` inline or via a small helper map.

2. Typography improvements:
   - Alert title: keep `text-sm font-medium` but ensure it's `text-card-foreground`
   - Alert description: change from `text-xs` to `text-[13px]` for slightly better readability
   - Time stamp: keep `text-xs text-muted-foreground`

3. Increase row spacing from `space-y-2` to `space-y-2.5`.

**B. Enhanced page header** (dashboard page.tsx):

1. Replace the simple h1/subtitle with a richer header block:
   - Show the current date formatted as "Tuesday, February 24, 2026" using `new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })` in muted text above the h1.
   - Keep the h1 "Dashboard" with existing sizing.
   - Replace the static subtitle "Your fleet at a glance" with a dynamic Fleet Health badge:
     - Compute `criticalCount` from `notificationAlerts.filter(a => a.severity === 'critical').length`
     - If criticalCount > 0: show a badge with `bg-status-danger-bg text-status-danger-foreground` reading "{criticalCount} critical alert(s)"
     - If alerts exist but none critical: show `bg-status-warning-bg text-status-warning-foreground` reading "{alerts.length} active alert(s)"
     - If no alerts: show `bg-status-success-bg text-status-success-foreground` reading "All systems clear"
   - The badge should be an inline-flex pill: `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold`
   - Add a small dot indicator before the text in the badge (a `<span className="h-1.5 w-1.5 rounded-full bg-current" />`)
   - Place the badge on the same line as the subtitle area, below the h1.

2. Wrap the header in a flex layout: `flex flex-col gap-1` to keep tight vertical spacing.

Keep all existing data fetching and error handling unchanged. The page is a server component so Date() runs server-side (which is fine).
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Check the dashboard page renders at localhost:3000/dashboard with the new header and notification styling.</verify>
  <done>Alert rows have colored left-border accents by severity. Page header shows current date, "Dashboard" title, and a fleet health status badge computed from alert data.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors
- Dashboard page at /dashboard renders:
  - Stat cards with colored top borders matching each card's identity
  - Larger stat values (text-4xl on sm+)
  - Notification rows with red/yellow/blue left accents
  - Page header with date line, title, and fleet health badge
- All components work in dark mode (use existing Tailwind tokens only)
</verification>

<success_criteria>
- Stat cards have visible colored top-border accent and depth-treated icon areas
- Notification alert rows are visually differentiated by severity via left-border color
- Page header displays dynamic date and fleet health summary badge
- No TypeScript errors, no visual regressions in dark mode
</success_criteria>

<output>
After completion, create `.planning/quick/28-dashboard-ui-polish-premium-stat-cards-w/28-SUMMARY.md`
</output>
