---
phase: quick-333
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/globals.css
  - apps/web/src/components/Sidebar/SidebarItem.tsx
  - apps/web/src/components/Sidebar/index.tsx
autonomous: true

must_haves:
  truths:
    - "Active nav item has the highest visual prominence in the sidebar"
    - "Active text/icon contrast exceeds 7:1 against active background"
    - "Inactive nav items are comfortably readable at a glance"
    - "Section headers maintain 4.5:1 minimum contrast"
    - "Logo header shows only icon + DriveCommand wordmark (no subtitle)"
    - "Hover state is visually distinct from but less intense than active state"
  artifacts:
    - path: "apps/web/src/app/globals.css"
      provides: "Updated sidebar CSS variables for both light and dark mode"
      contains: "--sidebar-bg-active"
    - path: "apps/web/src/components/Sidebar/SidebarItem.tsx"
      provides: "Active state using correct elevated background"
    - path: "apps/web/src/components/Sidebar/index.tsx"
      provides: "Logo header without Fleet Management subtitle"
  key_links:
    - from: "SidebarItem.tsx"
      to: "globals.css"
      via: "CSS variable references"
      pattern: "sidebar-bg-active|sidebar-fg"
---

<objective>
Fix sidebar active state contrast inversion, bump inactive item readability, and simplify logo header.

Purpose: The active nav item is currently LESS readable than inactive items due to a CSS variable bug where light-mode foreground colors (dark text) are being applied to the always-dark sidebar. Active state needs a clearly visible elevated background and bright text. Inactive items need another contrast bump. Logo subtitle should be removed.

Output: Properly contrasted sidebar with clear visual hierarchy — active > inactive > section headers.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/globals.css (sidebar CSS variables lines 48-60, 191-203)
@apps/web/src/components/Sidebar/SidebarItem.tsx
@apps/web/src/components/Sidebar/index.tsx (header section lines 434-461)
@apps/web/src/components/Sidebar/SidebarGroup.tsx (section headers line 39)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix sidebar CSS variables for proper contrast hierarchy</name>
  <files>apps/web/src/app/globals.css</files>
  <action>
Update the sidebar CSS variables in BOTH :root (light mode) and .dark sections. The sidebar always uses a dark background regardless of theme, so sidebar-specific text variables must always be bright.

**Current contrast analysis (dark mode sidebar bg hsl(228, 20%, 6%) = ~#0D1117):**
- --sidebar-fg: 0 0% 98% = #FAFAFA — contrast ~15:1 (good, keep)
- --sidebar-fg-muted: 220 10% 75% = ~#B8BCC5 — contrast ~7:1 (needs bump to ~8:1)
- --sidebar-fg-subtle: 220 8% 60% = ~#929AA6 — contrast ~4.5:1 (borderline, needs slight bump)

**Light mode BUG:** --sidebar-fg is set to 240 10% 12% (DARK text) but sidebar bg is dark. This causes active items to have dark text on dark background = invisible.

**Changes to :root (light mode) sidebar section (around line 48-60):**
```css
/* Sidebar — Premium dark navy (sidebar is ALWAYS dark regardless of theme) */
--sidebar-background: 228 40% 8%;
--sidebar-foreground: 0 0% 95%;
--sidebar-primary: 210 100% 50%;
--sidebar-primary-foreground: 0 0% 100%;
--sidebar-accent: 228 30% 15%;
--sidebar-accent-foreground: 0 0% 95%;
--sidebar-border: 228 25% 18%;
--sidebar-ring: 210 100% 50%;

/* Sidebar text hierarchy — WCAG AA compliant (sidebar is always dark) */
--sidebar-fg: 0 0% 98%;                   /* Primary: active items, wordmark (~15:1) */
--sidebar-fg-muted: 220 12% 82%;          /* Secondary: inactive nav labels, icons (~9:1) */
--sidebar-fg-subtle: 220 10% 65%;         /* Tertiary: section headers (~5.5:1) */

/* Sidebar active state — elevated pill background */
--sidebar-bg-active: 228 25% 14%;         /* Visible tint, ~8-10% lighter than sidebar-bg */
--sidebar-bg-hover: 228 20% 11%;          /* Subtle hover, ~50% of active intensity */
```

**Changes to .dark sidebar section (around line 191-203):**
```css
/* Sidebar — Deeper dark mode */
--sidebar-background: 228 20% 6%;
--sidebar-foreground: 0 0% 95%;
--sidebar-primary: 199 100% 68%;
--sidebar-primary-foreground: 228 15% 10%;
--sidebar-accent: 228 15% 14%;
--sidebar-accent-foreground: 0 0% 95%;
--sidebar-border: 228 12% 20%;
--sidebar-ring: 199 100% 68%;

/* Sidebar text hierarchy — WCAG AA compliant */
--sidebar-fg: 0 0% 98%;                   /* Primary: active items (~15:1 on #0D1117) */
--sidebar-fg-muted: 220 12% 82%;          /* Secondary: inactive labels, icons (~9:1) */
--sidebar-fg-subtle: 220 10% 65%;         /* Tertiary: section headers (~5.5:1) */

/* Sidebar active state — elevated pill background */
--sidebar-bg-active: 228 20% 14%;         /* Clear elevation, deliberate pill */
--sidebar-bg-hover: 228 15% 10%;          /* Subtle hover, less intense than active */
```

Key points:
- --sidebar-fg must be BRIGHT (0 0% 98%) in BOTH light and dark mode because sidebar bg is always dark
- --sidebar-fg-muted bumped from 75% to 82% lightness for better inactive readability
- --sidebar-fg-subtle bumped from 60% to 65% lightness for section headers
- NEW --sidebar-bg-active: elevated background for active items (14% lightness vs 6-8% base)
- NEW --sidebar-bg-hover: subtle hover state (10-11% lightness), less intense than active
  </action>
  <verify>
Run `grep -n "sidebar-bg-active\|sidebar-bg-hover\|sidebar-fg:" apps/web/src/app/globals.css` — should show the new variables in both :root and .dark sections.
  </verify>
  <done>
CSS variables define proper contrast hierarchy: active bg (14% L) > hover bg (10% L) > sidebar bg (6-8% L), and sidebar-fg is bright (98% L) in both theme modes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update SidebarItem to use new active background variable</name>
  <files>apps/web/src/components/Sidebar/SidebarItem.tsx</files>
  <action>
Update SidebarItem.tsx to use the new --sidebar-bg-active variable for active state background and --sidebar-bg-hover for hover state.

**Current code (lines 44-50):**
```tsx
className={cn(
  "group flex items-center gap-3 p-2 rounded-lg transition-colors duration-150",
  "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
  isActive && "bg-sidebar-accent",
  !isExpanded && "justify-center"
)}
```

**Updated code:**
```tsx
className={cn(
  "group flex items-center gap-3 p-2 rounded-lg transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
  isActive
    ? "bg-[hsl(var(--sidebar-bg-active))]"
    : "hover:bg-[hsl(var(--sidebar-bg-hover))]",
  !isExpanded && "justify-center"
)}
```

This ensures:
- Active items get the elevated --sidebar-bg-active (clearly visible pill)
- Inactive items get --sidebar-bg-hover on hover (subtle, less than active)
- Active items do NOT show hover effect (already at max prominence)

The icon and text color logic (lines 55-63, 75-79) is already correct — it uses --sidebar-fg for active and --sidebar-fg-muted for inactive. The fix in Task 1 ensures --sidebar-fg is bright in both modes.
  </action>
  <verify>
Run `grep -n "sidebar-bg-active\|sidebar-bg-hover" apps/web/src/components/Sidebar/SidebarItem.tsx` — should show both variables being used in the className.
  </verify>
  <done>
Active state uses elevated background, hover state uses subtle background, and active items do not show additional hover effect.
  </done>
</task>

<task type="auto">
  <name>Task 3: Remove Fleet Management subtitle from logo header</name>
  <files>apps/web/src/components/Sidebar/index.tsx</files>
  <action>
Update the logo header section (lines 434-461) to remove the "Fleet Management" subtitle.

**Current code (lines 443-458):**
```tsx
<AppLogo size={32} variant="light" />
<AnimatePresence mode="wait">
  {isExpanded && (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="grid text-left text-sm leading-tight"
    >
      <DriveCommandWordmark size="sm" />
      <span className="truncate text-xs text-[hsl(var(--sidebar-fg-subtle))]">
        Fleet Management
      </span>
    </motion.div>
  )}
</AnimatePresence>
```

**Updated code:**
```tsx
<AppLogo size={32} variant="light" />
<AnimatePresence mode="wait">
  {isExpanded && (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="flex items-center"
    >
      <DriveCommandWordmark size="sm" />
    </motion.div>
  )}
</AnimatePresence>
```

Changes:
- Remove the "Fleet Management" subtitle span entirely
- Change className from "grid text-left text-sm leading-tight" to "flex items-center" for proper vertical centering
- The DriveCommandWordmark component handles its own styling (font-semibold, proper size)

When collapsed, only the AppLogo icon shows — this behavior is unchanged since the AnimatePresence already handles the expanded/collapsed transition.
  </action>
  <verify>
Run `grep -n "Fleet Management" apps/web/src/components/Sidebar/index.tsx` — should return no matches.
  </verify>
  <done>
Logo header displays only the icon and "DriveCommand" wordmark, with proper vertical alignment. No subtitle visible.
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. Start dev server: `cd apps/web && npm run dev`
2. Navigate to any sidebar page in dark mode
3. Verify active nav item has clearly visible elevated background (deliberate pill, not smudge)
4. Verify active nav item text is BRIGHTER than inactive items (near-white vs light gray)
5. Verify inactive nav items are comfortable to read at a glance
6. Verify hover on inactive items shows subtle bg less intense than active
7. Verify section headers ("INTELLIGENCE", "CARRIER OPS") are readable
8. Verify logo header shows only icon + "DriveCommand" wordmark (no "Fleet Management")
9. Toggle to light mode — sidebar should still have dark bg with bright text (unchanged behavior)
</verification>

<success_criteria>
- Active state is the most prominent element in sidebar: elevated bg + brightest text
- Inactive items readable at ~9:1 contrast ratio
- Section headers readable at ~5.5:1 contrast ratio
- Hover state distinct from but less intense than active state
- Logo header simplified to icon + wordmark only
- No visual regression in collapsed sidebar state
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/333-fix-sidebar-active-state-contrast-bump-i/333-SUMMARY.md`
</output>
