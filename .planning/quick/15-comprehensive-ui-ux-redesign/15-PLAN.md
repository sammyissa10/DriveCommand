---
phase: quick-15
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/globals.css
  - tailwind.config.ts
  - src/components/ui/card.tsx
  - src/components/dashboard/stat-card.tsx
  - src/components/ui/empty-state.tsx
  - src/components/navigation/sidebar.tsx
  - src/app/(owner)/dashboard/page.tsx
  - src/components/dashboard/upcoming-maintenance-widget.tsx
  - src/components/dashboard/expiring-documents-widget.tsx
  - src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
  - src/app/(auth)/layout.tsx
  - src/app/(owner)/trucks/page.tsx
  - src/app/(owner)/drivers/page.tsx
  - src/app/(owner)/routes/page.tsx
  - src/app/(owner)/loads/page.tsx
  - src/app/(owner)/crm/page.tsx
  - src/app/(owner)/invoices/page.tsx
  - src/app/(owner)/payroll/page.tsx
autonomous: true
must_haves:
  truths:
    - "All stat value colors work correctly in both light and dark mode"
    - "Cards have glassmorphism hover effects with smooth transitions"
    - "Sidebar nav items have smooth active/hover transitions and focus-visible states"
    - "Dashboard uses consistent spacing and responsive breakpoints including md"
    - "Auth pages use theme tokens instead of hardcoded blue colors"
    - "All list pages use dark-mode-safe color tokens for stat values"
    - "Empty state component exists and can be reused across pages"
  artifacts:
    - path: "src/app/globals.css"
      provides: "CSS variables for semantic status colors, glassmorphism utilities, transitions"
      contains: "--status-success"
    - path: "src/components/ui/empty-state.tsx"
      provides: "Reusable empty state component with icon and message"
      exports: ["EmptyState"]
    - path: "src/components/dashboard/stat-card.tsx"
      provides: "Dark-mode-safe stat cards with hover effects"
      contains: "dark:"
    - path: "src/components/ui/card.tsx"
      provides: "Interactive card variant with hover effect"
      contains: "card-interactive"
  key_links:
    - from: "src/app/globals.css"
      to: "all components"
      via: "CSS custom properties"
      pattern: "--status-(success|warning|danger|info)"
    - from: "src/components/dashboard/stat-card.tsx"
      to: "src/app/globals.css"
      via: "semantic color variables"
      pattern: "hsl\\(var\\(--status"
---

<objective>
Comprehensive UI/UX redesign of DriveCommand addressing 40+ design audit findings. Fix all hardcoded colors that break in dark mode, add glassmorphism accents, standardize spacing, improve transitions, and create reusable components.

Purpose: Transform the app from light-mode-only with inconsistent styling into a polished, dark-mode-ready interface with professional glassmorphism design language.
Output: Updated globals.css with semantic tokens, enhanced card/stat-card components, new empty-state component, fixed dashboard/sidebar/auth/list pages.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/app/globals.css
@tailwind.config.ts
@src/components/ui/card.tsx
@src/components/ui/button.tsx
@src/components/ui/skeleton.tsx
@src/components/dashboard/stat-card.tsx
@src/components/navigation/sidebar.tsx
@src/app/(owner)/dashboard/page.tsx
@src/components/dashboard/upcoming-maintenance-widget.tsx
@src/components/dashboard/expiring-documents-widget.tsx
@src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
@src/app/(auth)/layout.tsx
@src/app/(owner)/trucks/page.tsx
@src/app/(owner)/drivers/page.tsx
@src/app/(owner)/routes/page.tsx
@src/app/(owner)/loads/page.tsx
@src/app/(owner)/crm/page.tsx
@src/app/(owner)/invoices/page.tsx
@src/app/(owner)/payroll/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Design Foundation + Shared Components</name>
  <files>
    src/app/globals.css
    tailwind.config.ts
    src/components/ui/card.tsx
    src/components/dashboard/stat-card.tsx
    src/components/ui/empty-state.tsx
  </files>
  <action>
**1. globals.css - Add semantic status color tokens and utility classes:**

In the `:root` block, add these CSS variables AFTER the existing chart variables:

```
/* Semantic status colors — light mode */
--status-success: 142 71% 45%;
--status-success-foreground: 144 61% 20%;
--status-success-bg: 138 76% 97%;
--status-warning: 38 92% 50%;
--status-warning-foreground: 32 95% 44%;
--status-warning-bg: 48 96% 95%;
--status-danger: 0 84% 60%;
--status-danger-foreground: 0 74% 42%;
--status-danger-bg: 0 86% 97%;
--status-info: 221 83% 53%;
--status-info-foreground: 224 76% 48%;
--status-info-bg: 214 95% 97%;
--status-purple: 270 60% 52%;
--status-purple-foreground: 272 51% 42%;
--status-purple-bg: 270 70% 96%;

/* Glassmorphism */
--glass-bg: 0 0% 100% / 0.7;
--glass-border: 0 0% 100% / 0.2;
--glass-shadow: 0 0% 0% / 0.05;

/* Transitions */
--transition-fast: 150ms;
--transition-base: 200ms;
--transition-slow: 300ms;
```

In the `.dark` block, add AFTER the existing chart variables:

```
/* Semantic status colors — dark mode */
--status-success: 142 70% 45%;
--status-success-foreground: 142 70% 70%;
--status-success-bg: 144 50% 12%;
--status-warning: 38 92% 50%;
--status-warning-foreground: 45 93% 58%;
--status-warning-bg: 32 60% 12%;
--status-danger: 0 84% 60%;
--status-danger-foreground: 0 90% 70%;
--status-danger-bg: 0 50% 12%;
--status-info: 217 91% 60%;
--status-info-foreground: 213 94% 68%;
--status-info-bg: 224 50% 14%;
--status-purple: 270 60% 62%;
--status-purple-foreground: 270 70% 75%;
--status-purple-bg: 270 40% 14%;

/* Glassmorphism — dark */
--glass-bg: 222 47% 11% / 0.6;
--glass-border: 210 40% 98% / 0.1;
--glass-shadow: 0 0% 0% / 0.3;
```

Add AFTER the existing `@layer base` block (the one with body styles), a new utilities layer:

```css
@layer utilities {
  /* Glassmorphism card */
  .glass {
    background: hsl(var(--glass-bg));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid hsl(var(--glass-border));
  }

  /* Card interactive hover */
  .card-interactive {
    transition: all var(--transition-base) ease;
  }
  .card-interactive:hover {
    box-shadow: 0 8px 25px -5px hsl(var(--glass-shadow)),
                0 4px 10px -6px hsl(var(--glass-shadow));
    transform: translateY(-2px);
  }

  /* Smooth dark mode transition */
  .theme-transition {
    transition: background-color var(--transition-slow) ease,
                color var(--transition-slow) ease,
                border-color var(--transition-slow) ease;
  }
}
```

Also add `@media (prefers-reduced-motion: reduce)` block after the utilities:

```css
@media (prefers-reduced-motion: reduce) {
  .card-interactive,
  .theme-transition {
    transition: none !important;
    transform: none !important;
  }
  .animate-marquee {
    animation: none !important;
  }
}
```

**2. tailwind.config.ts - Extend theme with semantic status colors:**

In `theme.extend.colors`, add after the existing `sidebar` block:

```typescript
status: {
  success: {
    DEFAULT: 'hsl(var(--status-success))',
    foreground: 'hsl(var(--status-success-foreground))',
    bg: 'hsl(var(--status-success-bg))',
  },
  warning: {
    DEFAULT: 'hsl(var(--status-warning))',
    foreground: 'hsl(var(--status-warning-foreground))',
    bg: 'hsl(var(--status-warning-bg))',
  },
  danger: {
    DEFAULT: 'hsl(var(--status-danger))',
    foreground: 'hsl(var(--status-danger-foreground))',
    bg: 'hsl(var(--status-danger-bg))',
  },
  info: {
    DEFAULT: 'hsl(var(--status-info))',
    foreground: 'hsl(var(--status-info-foreground))',
    bg: 'hsl(var(--status-info-bg))',
  },
  purple: {
    DEFAULT: 'hsl(var(--status-purple))',
    foreground: 'hsl(var(--status-purple-foreground))',
    bg: 'hsl(var(--status-purple-bg))',
  },
},
```

Also add a `transitionDuration` entry inside `theme.extend`:

```typescript
transitionDuration: {
  fast: 'var(--transition-fast)',
  base: 'var(--transition-base)',
  slow: 'var(--transition-slow)',
},
```

**3. card.tsx - Add interactive variant class:**

Keep the existing Card component unchanged. Add a `cardVariants` helper object after the Card definition and before the exports:

```typescript
/** Utility class sets for card variants */
const cardVariants = {
  interactive: "card-interactive cursor-pointer hover:border-primary/20",
  glass: "glass",
} as const;
```

Export it alongside the existing exports: add `cardVariants` to the export statement.

**4. stat-card.tsx - Complete dark-mode-safe rewrite:**

Replace the hardcoded colorMap with semantic status token classes:

```typescript
const colorMap: Record<string, { bg: string; icon: string }> = {
  'Total Trucks': {
    bg: 'bg-status-info-bg',
    icon: 'text-status-info-foreground',
  },
  'Active Drivers': {
    bg: 'bg-status-success-bg',
    icon: 'text-status-success-foreground',
  },
  'Active Routes': {
    bg: 'bg-status-purple-bg',
    icon: 'text-status-purple-foreground',
  },
  'Maintenance Alerts': {
    bg: 'bg-status-warning-bg',
    icon: 'text-status-warning-foreground',
  },
};
```

Update the StatCard JSX:
- Replace `shadow-sm` with `shadow-sm card-interactive` on the Link
- Replace the warning variant border from `border-amber-200 ring-1 ring-amber-100` to `border-status-warning/30 ring-1 ring-status-warning/10`
- Add `transition-all duration-base` to replace inline transition-all
- Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to the Link for keyboard accessibility

**5. empty-state.tsx - Create new reusable empty state component:**

Create `src/components/ui/empty-state.tsx`:

```tsx
import { type LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted mb-4">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">{description}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
```
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no TypeScript errors. Verify the new Tailwind classes resolve correctly by checking that `status-success`, `status-warning`, `status-danger`, `status-info`, `status-purple` and their sub-tokens are present in tailwind config. Check `src/components/ui/empty-state.tsx` exists and exports EmptyState.
  </verify>
  <done>
globals.css has semantic status color tokens for both light and dark mode, glassmorphism utility classes, and prefers-reduced-motion support. tailwind.config.ts extends the theme with status color utilities. card.tsx exports a cardVariants helper with interactive and glass variants. stat-card.tsx uses semantic tokens instead of hardcoded colors. empty-state.tsx exists as a reusable component.
  </done>
</task>

<task type="auto">
  <name>Task 2: Dashboard + Sidebar + Auth Pages</name>
  <files>
    src/app/(owner)/dashboard/page.tsx
    src/components/dashboard/upcoming-maintenance-widget.tsx
    src/components/dashboard/expiring-documents-widget.tsx
    src/components/navigation/sidebar.tsx
    src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    src/app/(auth)/layout.tsx
  </files>
  <action>
**1. dashboard/page.tsx - Fix responsive grid and spacing:**

Change the stat cards grid from:
```
grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4
```
to:
```
grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4
```

Change the page heading `text-3xl` to `text-2xl sm:text-3xl` for responsive sizing.

Standardize spacing: change `space-y-8` to `space-y-6` and the widget grid `gap-6` stays as-is (consistent with stats `gap-4` scaling up to `gap-6` for larger widget cards).

**2. upcoming-maintenance-widget.tsx - Fix hardcoded colors for dark mode:**

Replace ALL hardcoded urgency colors with semantic tokens:

- `bg-amber-50` (icon bg) -> `bg-status-warning-bg`
- `text-amber-600` (icon) -> `text-status-warning-foreground`
- Overdue urgencyClass `border-red-200 bg-red-50` -> `border-status-danger/30 bg-status-danger-bg`
- Warning urgencyClass `border-amber-200 bg-amber-50` -> `border-status-warning/30 bg-status-warning-bg`
- Overdue badge `bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700` -> `bg-status-danger-bg px-2 py-0.5 text-xs font-bold text-status-danger-foreground`
- Count badge (overdue) `bg-red-100 text-red-700` -> `bg-status-danger-bg text-status-danger-foreground`

**3. expiring-documents-widget.tsx - Fix hardcoded colors for dark mode:**

Same pattern as maintenance widget:

- `bg-blue-50` (icon bg) -> `bg-status-info-bg`
- `text-blue-600` (icon) -> `text-status-info-foreground`
- Expired urgencyClass `border-red-200 bg-red-50` -> `border-status-danger/30 bg-status-danger-bg`
- Warning urgencyClass `border-amber-200 bg-amber-50` -> `border-status-warning/30 bg-status-warning-bg`
- Expired badge `bg-red-100 ... text-red-700` -> `bg-status-danger-bg ... text-status-danger-foreground`
- Count badge (expired) `bg-red-100 text-red-700` -> `bg-status-danger-bg text-status-danger-foreground`

**4. sidebar.tsx - Add transitions and focus-visible states:**

On EVERY `SidebarMenuButton` component in the file, verify they use the shadcn sidebar component (which handles active state internally). The issue is transitions between states. Add to the sidebar CSS customizations:

In the `SidebarContent`, add a className wrapper or use the existing one. The simplest approach: modify the main `<Sidebar>` tag className. Add `className="[&_[data-sidebar=menu-button]]:transition-all [&_[data-sidebar=menu-button]]:duration-150 [&_[data-sidebar=menu-button]]:focus-visible:ring-2 [&_[data-sidebar=menu-button]]:focus-visible:ring-sidebar-ring [&_[data-sidebar=menu-button]]:focus-visible:ring-offset-1 [&_[data-sidebar=menu-button]]:focus-visible:outline-none"` to the `<Sidebar>` element.

This adds:
- `transition-all duration-150` to all menu buttons for smooth hover/active transitions
- `focus-visible:ring-2` with sidebar ring color for keyboard navigation
- `focus-visible:outline-none` to replace browser default

**5. sign-in page - Fix hardcoded demo credentials box colors:**

Replace the demo credentials box (lines 102-110):
```
<div className="w-full rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
  <p className="mb-2 font-semibold text-blue-800">Demo Credentials</p>
  <p className="text-blue-700">
```

With semantic token classes:
```
<div className="w-full rounded-lg border border-status-info/30 bg-status-info-bg p-4 text-sm">
  <p className="mb-2 font-semibold text-status-info-foreground">Demo Credentials</p>
  <p className="text-status-info-foreground/80">
```

Both occurrences of `text-blue-700` -> `text-status-info-foreground/80`.

**6. auth layout.tsx - Add subtle glass effect to auth container:**

Change the outer div to add a subtle transition class:
```
<div className="min-h-screen flex flex-col items-center justify-center bg-background theme-transition">
```

This ensures smooth background transition when switching themes.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no TypeScript errors. Visually verify that no hardcoded blue/red/amber/green color classes remain in the modified files by searching: `grep -r "bg-blue-50\|bg-amber-50\|bg-red-50\|text-blue-600\|text-amber-600\|text-red-700\|text-blue-700\|text-blue-800\|border-blue-200\|border-red-200\|border-amber-200" src/components/dashboard/ src/app/\(auth\)/`. Only files NOT in this task's scope should show matches.
  </verify>
  <done>
Dashboard page has responsive heading and md breakpoint in stat grid. Both dashboard widgets use semantic status tokens instead of hardcoded colors. Sidebar has smooth transitions and focus-visible states on all nav items. Sign-in demo credentials box uses theme-safe tokens. Auth layout has theme transition class.
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix All List Pages - Dark Mode Colors and Consistency</name>
  <files>
    src/app/(owner)/loads/page.tsx
    src/app/(owner)/crm/page.tsx
    src/app/(owner)/invoices/page.tsx
    src/app/(owner)/payroll/page.tsx
    src/app/(owner)/trucks/page.tsx
    src/app/(owner)/drivers/page.tsx
    src/app/(owner)/routes/page.tsx
  </files>
  <action>
**For ALL list pages (trucks, drivers, routes, loads, crm, invoices, payroll):**

Make heading responsive: change `text-3xl` to `text-2xl sm:text-3xl` in every h1 tag.

**loads/page.tsx - Fix stat card colors (lines 50-80):**

Replace hardcoded stat value colors:
- `text-yellow-600` (Pending) -> `text-status-warning-foreground`
- `text-purple-600` (In Transit) -> `text-status-purple-foreground`
- `text-green-600` (Total Revenue) -> `text-status-success-foreground`

Add icon bg containers to stat cards for visual consistency with dashboard. Each stat card div should get a subtle `card-interactive` class. Update the stat card structure within loads to be more consistent:

For each stat card `<div className="rounded-lg border border-border bg-card p-4">`, add `card-interactive` so it becomes `<div className="rounded-lg border border-border bg-card p-4 card-interactive">`.

**crm/page.tsx - Fix stat card colors (lines 44-61):**

Replace hardcoded stat value colors:
- `text-green-600` (Active) -> `text-status-success-foreground`
- `text-amber-600` (VIP) -> `text-status-warning-foreground`

Add `card-interactive` to each stat card div.

**invoices/page.tsx - Fix stat card colors (lines 46-67):**

Replace hardcoded stat value colors:
- `text-muted-foreground` for Draft is fine (already using theme token)
- `text-amber-600` (Outstanding) -> `text-status-warning-foreground`
- `text-green-600` (Total Paid) -> `text-status-success-foreground`

Add `card-interactive` to each stat card div.

**payroll/page.tsx - Fix stat card colors (lines 47-66):**

Replace hardcoded stat value colors:
- `text-muted-foreground` for Draft is fine (already using theme token)
- `text-blue-600` (Approved) -> `text-status-info-foreground`
- `text-green-600` (Total Paid) -> `text-status-success-foreground`

Add `card-interactive` to each stat card div.

**trucks/page.tsx, drivers/page.tsx, routes/page.tsx:**

These pages do not have inline stat cards with hardcoded colors, but DO need the responsive heading fix (`text-2xl sm:text-3xl`). Apply that change only.

The CTA buttons in trucks/drivers/routes/loads/crm/invoices/payroll pages are already using `bg-primary text-primary-foreground` which is correct. No changes needed there — they follow the theme system properly. Do NOT convert these to Button components as it would require additional import changes and testing for form/Link compatibility.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no TypeScript errors. Search for remaining hardcoded color classes in list page files: `grep -r "text-yellow-600\|text-purple-600\|text-green-600\|text-amber-600\|text-blue-600" src/app/\(owner\)/loads/page.tsx src/app/\(owner\)/crm/page.tsx src/app/\(owner\)/invoices/page.tsx src/app/\(owner\)/payroll/page.tsx` should return zero matches. Verify all h1 tags in list pages use `text-2xl sm:text-3xl`.
  </verify>
  <done>
All list pages (loads, crm, invoices, payroll) use semantic status tokens instead of hardcoded colors. All seven list pages have responsive headings. Stat card divs have card-interactive hover effects. No hardcoded color classes remain in any modified list page stat sections.
  </done>
</task>

</tasks>

<verification>
After all three tasks are complete:

1. `npx tsc --noEmit` passes with zero errors
2. `npx next build` completes successfully (or at minimum, `next lint` passes)
3. Search for remaining hardcoded status colors in modified files returns zero matches:
   - No `text-yellow-600`, `text-purple-600`, `text-green-600`, `text-amber-600`, `text-blue-600` in list page stat sections
   - No `bg-blue-50`, `bg-amber-50`, `bg-red-50`, `bg-emerald-50`, `bg-violet-50` in stat-card.tsx or dashboard widgets
   - No `border-blue-200`, `border-red-200`, `border-amber-200` in dashboard widgets or auth pages
4. globals.css contains `--status-success`, `--status-warning`, `--status-danger`, `--status-info`, `--status-purple` in both `:root` and `.dark` blocks
5. `src/components/ui/empty-state.tsx` exists and exports EmptyState component
6. tailwind.config.ts has `status` color block in theme.extend.colors
</verification>

<success_criteria>
- All 40+ audit findings addressed: hardcoded colors replaced with semantic tokens, glassmorphism utilities added, spacing standardized, transitions added, accessibility improved
- Zero hardcoded color classes in stat-card, dashboard widgets, auth pages, or list page stat sections
- Dark mode works correctly across all modified components via CSS variable system
- prefers-reduced-motion respected for all animations and transitions
- Keyboard navigation has visible focus states on sidebar items
- New empty-state component available for reuse
- TypeScript compilation passes
</success_criteria>

<output>
After completion, create `.planning/quick/15-comprehensive-ui-ux-redesign/15-SUMMARY.md`
</output>
