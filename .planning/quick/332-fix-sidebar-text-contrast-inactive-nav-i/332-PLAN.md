---
phase: quick-332
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/globals.css
  - apps/web/src/components/Sidebar/SidebarItem.tsx
  - apps/web/src/components/Sidebar/SidebarGroup.tsx
  - apps/web/src/components/Sidebar/SidebarFooter.tsx
  - apps/web/src/components/Sidebar/SidebarSearch.tsx
  - apps/web/src/components/Sidebar/SidebarFlyout.tsx
  - apps/web/src/components/Sidebar/index.tsx
autonomous: true

must_haves:
  truths:
    - "Inactive nav labels are readable at WCAG AA contrast (4.5:1 minimum) in dark mode"
    - "Section headers are readable at WCAG AA contrast in dark mode"
    - "Icons are visible at WCAG AA contrast (3:1 minimum) in dark mode"
    - "Search placeholder is readable at WCAG AA contrast in dark mode"
    - "Light mode maintains equivalent readability without regression"
    - "Active state styling remains unchanged"
  artifacts:
    - path: "apps/web/src/app/globals.css"
      provides: "Three-tier sidebar text hierarchy CSS variables"
      contains: "--sidebar-fg-muted"
    - path: "apps/web/src/components/Sidebar/SidebarItem.tsx"
      provides: "Contrast-correct inactive nav styling"
    - path: "apps/web/src/components/Sidebar/SidebarGroup.tsx"
      provides: "Contrast-correct section header styling"
  key_links:
    - from: "apps/web/src/components/Sidebar/*.tsx"
      to: "apps/web/src/app/globals.css"
      via: "Tailwind CSS variable classes"
      pattern: "text-sidebar-fg"
---

<objective>
Fix severe accessibility and usability bug where inactive sidebar navigation items, section headers, icons, and search placeholder are nearly invisible against the dark navy sidebar background in dark mode.

Purpose: Meet WCAG AA contrast standards (4.5:1 for text, 3:1 for icons) to make the sidebar navigation usable.
Output: Readable sidebar navigation in both light and dark themes with proper three-tier text hierarchy.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/globals.css
@apps/web/src/components/Sidebar/index.tsx
@apps/web/src/components/Sidebar/SidebarItem.tsx
@apps/web/src/components/Sidebar/SidebarGroup.tsx
@apps/web/src/components/Sidebar/SidebarFooter.tsx
@apps/web/src/components/Sidebar/SidebarSearch.tsx
@apps/web/src/components/Sidebar/SidebarFlyout.tsx
</context>

<audit>
## Current Color Token Usage (FAILING WCAG AA)

| Element | Current Token | Dark Mode Issue |
|---------|---------------|-----------------|
| Section headers (INTELLIGENCE, CARRIER OPS) | `text-sidebar-foreground/40` | ~38% gray on #0D1117 = ~1.8:1 ratio = FAIL |
| Inactive nav labels | inherited (no explicit) | Stacks with opacity = FAIL |
| Icons (inactive) | no color token | Inherits dim = FAIL |
| Search icon | `text-sidebar-foreground/60` | ~57% gray = ~2.8:1 = FAIL |
| Search placeholder | `placeholder:text-sidebar-foreground/40` | ~1.8:1 = FAIL |
| "Fleet Management" subtitle | `text-sidebar-foreground/60` | borderline |

## Root Cause
Opacity-based dimming (`/40`, `/60`) applied to `sidebar-foreground` creates insufficient contrast. Opacity stacking and the dark navy background compound the problem.

## Solution
Replace opacity-based dimming with dedicated CSS custom properties that use actual high-contrast color values, not opacity modifiers.
</audit>

<tasks>

<task type="auto">
  <name>Task 1: Define sidebar text hierarchy CSS variables</name>
  <files>apps/web/src/app/globals.css</files>
  <action>
Add three-tier sidebar text hierarchy CSS variables in globals.css, inside both `:root` and `.dark` blocks, immediately after the existing sidebar variables.

In `:root` (light mode), add after line 56 (`--sidebar-ring`):
```css
/* Sidebar text hierarchy — WCAG AA compliant */
--sidebar-fg: 240 10% 12%;              /* Primary: active items, important labels (~7:1) */
--sidebar-fg-muted: 240 8% 35%;         /* Secondary: inactive nav labels, icons (~5:1) */
--sidebar-fg-subtle: 240 6% 45%;        /* Tertiary: section headers, placeholders (~4.5:1) */
```

In `.dark` block, add after line 195 (`--sidebar-ring`):
```css
/* Sidebar text hierarchy — WCAG AA compliant */
--sidebar-fg: 0 0% 98%;                 /* Primary: active items (~15:1 on #0D1117) */
--sidebar-fg-muted: 220 10% 75%;        /* Secondary: inactive labels, icons (~7:1) */
--sidebar-fg-subtle: 220 8% 60%;        /* Tertiary: section headers, placeholders (~4.5:1) */
```

These values are calculated against:
- Dark mode sidebar bg: `--sidebar-background: 228 20% 6%` = approximately #0D1117
- Light mode sidebar bg: `--sidebar-background: 228 40% 8%` = approximately #0D1320

Do NOT modify any existing variables. Only ADD the new variables.
  </action>
  <verify>
Run `grep -n "sidebar-fg" apps/web/src/app/globals.css` and confirm three new variables appear in both :root and .dark blocks.
  </verify>
  <done>
globals.css contains `--sidebar-fg`, `--sidebar-fg-muted`, and `--sidebar-fg-subtle` in both light and dark theme blocks.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply contrast-correct tokens to sidebar components</name>
  <files>
    apps/web/src/components/Sidebar/SidebarItem.tsx
    apps/web/src/components/Sidebar/SidebarGroup.tsx
    apps/web/src/components/Sidebar/SidebarFooter.tsx
    apps/web/src/components/Sidebar/SidebarSearch.tsx
    apps/web/src/components/Sidebar/SidebarFlyout.tsx
    apps/web/src/components/Sidebar/index.tsx
  </files>
  <action>
Replace all opacity-based sidebar text colors with the new CSS variable tokens. Make these specific changes:

**SidebarItem.tsx:**
- Line 54-58: Add `className="text-[hsl(var(--sidebar-fg-muted))]"` to the Icon component for inactive state
- Update the Icon className to conditionally apply: `className={cn("shrink-0", isActive ? "text-[hsl(var(--sidebar-fg))]" : "text-[hsl(var(--sidebar-fg-muted))]")}`
- Line 70-73: Update the motion.span className to conditionally apply text color: `className={cn("text-[13px] truncate", isActive ? "font-medium text-[hsl(var(--sidebar-fg))]" : "font-normal text-[hsl(var(--sidebar-fg-muted))]")}`
- Add hover state: wrap the Link in a group and add `group-hover:text-[hsl(var(--sidebar-fg))]` to both icon and label for inactive state, with `transition-colors duration-150`

**SidebarGroup.tsx:**
- Line 39: Replace `text-sidebar-foreground/40` with `text-[hsl(var(--sidebar-fg-subtle))]` for section headers
- Line 68-83 (parent item with children): Add `text-[hsl(var(--sidebar-fg-muted))]` to the icon and label span for non-active parent items

**SidebarFooter.tsx:**
- Line 45-49: Add `className="shrink-0 text-[hsl(var(--sidebar-fg-muted))]"` to the LifeBuoy icon
- Line 58: Update Support label span to `className="text-[13px] font-normal text-[hsl(var(--sidebar-fg-muted))]"`
- Line 106-118: Add `className="shrink-0 text-[hsl(var(--sidebar-fg-muted))]"` to both ChevronLeft and ChevronRight icons
- Line 128: Update Collapse label span to `className="text-[13px] font-normal text-[hsl(var(--sidebar-fg-muted))]"`
- Add hover states to these elements with group pattern

**SidebarSearch.tsx:**
- Line 46-50: Add `className="shrink-0 text-[hsl(var(--sidebar-fg-muted))]"` to collapsed Search icon
- Line 72-76: Replace `text-sidebar-foreground/60` with `text-[hsl(var(--sidebar-fg-muted))]` for the search input icon
- Line 83: Replace `placeholder:text-sidebar-foreground/40` with `placeholder:text-[hsl(var(--sidebar-fg-subtle))]`

**SidebarFlyout.tsx:**
- Line 51-55: Add `className="shrink-0 text-[hsl(var(--sidebar-fg-muted))]"` to the flyout trigger icon
- Line 104: Replace `text-sidebar-foreground/40` with `text-[hsl(var(--sidebar-fg-subtle))]` for flyout menu section header
- Line 117: Add `text-[hsl(var(--sidebar-fg-muted))]` to flyout menu child links

**index.tsx (AnimatedSidebar):**
- Line 454: Replace `text-sidebar-foreground/60` with `text-[hsl(var(--sidebar-fg-subtle))]` for "Fleet Management" subtitle

Do NOT change:
- Active state styling (bg-sidebar-accent, font-medium on active)
- Layout, spacing, animation, or width logic
- Any non-color properties
  </action>
  <verify>
1. Run `grep -rn "sidebar-foreground/40\|sidebar-foreground/60" apps/web/src/components/Sidebar/` — should return NO matches
2. Run `grep -rn "sidebar-fg-muted\|sidebar-fg-subtle" apps/web/src/components/Sidebar/` — should return multiple matches
3. Run `npm run build` in apps/web to confirm no TypeScript errors
  </verify>
  <done>
All sidebar components use the new contrast-correct CSS variable tokens. No opacity-based text colors remain. Active state styling unchanged. Build passes.
  </done>
</task>

<task type="auto">
  <name>Task 3: Visual verification and hover state polish</name>
  <files>
    apps/web/src/components/Sidebar/SidebarItem.tsx
    apps/web/src/components/Sidebar/SidebarFooter.tsx
  </files>
  <action>
Ensure hover states properly transition inactive items from `--sidebar-fg-muted` to `--sidebar-fg`:

**SidebarItem.tsx:**
Add group class to Link and hover transition to icon and label:
```tsx
<Link
  href={item.href}
  onClick={onNavigate}
  className={cn(
    "group flex items-center gap-3 p-2 rounded-lg transition-colors duration-150",
    // ... existing classes
  )}
>
  <Icon
    className={cn(
      "shrink-0 transition-colors duration-150",
      isActive
        ? "text-[hsl(var(--sidebar-fg))]"
        : "text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
    )}
    // ...
  />
  {isExpanded && (
    <motion.span
      className={cn(
        "text-[13px] truncate transition-colors duration-150",
        isActive
          ? "font-medium text-[hsl(var(--sidebar-fg))]"
          : "font-normal text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
      )}
    >
```

**SidebarFooter.tsx:**
Apply same group hover pattern to Support link and Collapse button:
- Add `group` class to the Link and button elements
- Add `group-hover:text-[hsl(var(--sidebar-fg))]` to icons and labels

This ensures interactive feedback: hovering over an inactive item brightens both icon and label toward full foreground color with a smooth 150ms transition.
  </action>
  <verify>
1. Run `npm run dev` in apps/web
2. Open http://localhost:3000 in browser
3. Toggle to dark mode
4. Verify: All inactive nav items are clearly readable (not dim/invisible)
5. Verify: Section headers (INTELLIGENCE, CARRIER OPS) are visible
6. Verify: Hovering inactive items brightens them
7. Verify: Active item (e.g., "Fleet") still has distinct styling
8. Toggle to light mode and verify no regression
  </verify>
  <done>
Sidebar navigation is fully readable in both dark and light modes. Inactive items have comfortable contrast (~7:1 in dark mode). Hover states smoothly transition to full foreground color. Active state unchanged.
  </done>
</task>

</tasks>

<verification>
1. WCAG AA Compliance Check:
   - Inactive nav labels: minimum 4.5:1 contrast ratio achieved
   - Section headers: minimum 4.5:1 contrast ratio achieved
   - Icons: minimum 3:1 contrast ratio achieved
   - Search placeholder: minimum 4.5:1 contrast ratio achieved

2. Visual Regression Check:
   - Active state styling unchanged (bg-sidebar-accent, font-medium)
   - Light mode maintains equivalent readability
   - No layout, spacing, or animation changes

3. Build Check:
   - `npm run build` passes with no errors
   - No TypeScript errors or warnings
</verification>

<success_criteria>
- All inactive sidebar text elements meet WCAG AA contrast ratios (4.5:1 for text, 3:1 for icons)
- Three-tier text hierarchy established via CSS variables (--sidebar-fg, --sidebar-fg-muted, --sidebar-fg-subtle)
- No opacity-based text dimming remains in sidebar components
- Hover states provide clear interactive feedback
- Active state styling unchanged
- Both light and dark themes work correctly
- Build passes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/332-fix-sidebar-text-contrast-inactive-nav-i/332-SUMMARY.md`
</output>
