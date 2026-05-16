---
phase: quick-331
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/Sidebar/index.tsx
  - apps/web/src/components/Sidebar/SidebarItem.tsx
  - apps/web/src/components/Sidebar/SidebarGroup.tsx
  - apps/web/src/components/Sidebar/SidebarFlyout.tsx
  - apps/web/src/components/Sidebar/SidebarFooter.tsx
  - apps/web/src/components/Sidebar/SidebarSearch.tsx
  - apps/web/src/components/Sidebar/useSidebarState.ts
  - apps/web/src/components/Sidebar/sidebar.config.ts
  - apps/web/src/components/Sidebar/motion.ts
  - apps/web/src/components/navigation/owner-shell.tsx
autonomous: true
must_haves:
  truths:
    - "Sidebar animates width with spring physics (stiffness: 400, damping: 35)"
    - "Labels fade+slide as width animates with ~20ms stagger per item"
    - "Collapsed state shows flyout menus on hover for groups with children"
    - "Footer shows support card (full when expanded, icon when collapsed) + toggle button"
    - "Search input at top (icon-only when collapsed, full input when expanded)"
    - "State persists via localStorage (existing cookie persistence also kept)"
    - "Arrow keys navigate items, Enter activates, Esc closes flyouts"
    - "prefers-reduced-motion disables spring animations"
    - "Dark and light themes both work correctly"
  artifacts:
    - path: "apps/web/src/components/Sidebar/index.tsx"
      provides: "Main AnimatedSidebar component with Framer Motion"
      exports: ["AnimatedSidebar"]
    - path: "apps/web/src/components/Sidebar/useSidebarState.ts"
      provides: "Custom hook for sidebar state + localStorage persistence"
      exports: ["useSidebarState"]
    - path: "apps/web/src/components/Sidebar/SidebarFlyout.tsx"
      provides: "Radix Popover flyout for collapsed submenu hover"
      exports: ["SidebarFlyout"]
    - path: "apps/web/src/components/Sidebar/motion.ts"
      provides: "Shared spring configs and motion variants"
      exports: ["springConfig", "labelVariants", "sidebarVariants"]
  key_links:
    - from: "apps/web/src/components/navigation/owner-shell.tsx"
      to: "apps/web/src/components/Sidebar/index.tsx"
      via: "Import AnimatedSidebar to replace AppSidebar"
      pattern: "AnimatedSidebar"
    - from: "apps/web/src/components/Sidebar/index.tsx"
      to: "apps/web/src/components/Sidebar/useSidebarState.ts"
      via: "Uses custom hook for state management"
      pattern: "useSidebarState"
---

<objective>
Redesign Left Sidebar Navigation with Collapsible Full-Height Bar

Purpose: Replace CSS transitions with Emil Kowalski-style Framer Motion spring animations, add flyout submenus when collapsed, improve footer with support card and toggle, add search input, enhance keyboard navigation, and respect reduced motion preferences.

Output: New Sidebar component system in `/apps/web/src/components/Sidebar/` with spring physics animations, Radix Popover flyouts, localStorage persistence, full keyboard nav, and proper theming.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/navigation/sidebar.tsx (existing AppSidebar - navigation config to preserve)
@apps/web/src/components/ui/sidebar.tsx (shadcn sidebar primitives - reference only)
@apps/web/src/components/navigation/owner-shell.tsx (integration point)
@apps/web/src/components/navigation/app-logo.tsx (logo components to reuse)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Sidebar Infrastructure (state, motion, config)</name>
  <files>
    apps/web/src/components/Sidebar/useSidebarState.ts
    apps/web/src/components/Sidebar/motion.ts
    apps/web/src/components/Sidebar/sidebar.config.ts
  </files>
  <action>
    Create three foundational files:

    **useSidebarState.ts:**
    - Custom hook managing `isExpanded` boolean state
    - Initialize from localStorage key `sidebar:expanded` (default: true)
    - Also read existing cookie `sidebar:state` for backwards compat (cookie wins if both exist)
    - `toggle()` function updates both localStorage and sets cookie
    - `setExpanded(boolean)` for programmatic control
    - Return `{ isExpanded, toggle, setExpanded }`
    - Use `useEffect` for hydration-safe localStorage access (avoid SSR mismatch)

    **motion.ts:**
    - Export `springConfig = { type: "spring", stiffness: 400, damping: 35 }` for width transitions
    - Export `labelVariants` for staggered fade+slide: `{ visible: { opacity: 1, x: 0 }, hidden: { opacity: 0, x: -8 } }`
    - Export `sidebarVariants` for width: `{ expanded: { width: 256 }, collapsed: { width: 48 } }`
    - Export `reducedMotionConfig = { type: "tween", duration: 0 }` for prefers-reduced-motion fallback
    - Export `useMotionConfig()` hook that returns `reducedMotionConfig` if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, else `springConfig`

    **sidebar.config.ts:**
    - Export `SIDEBAR_WIDTH_EXPANDED = 256` (16rem)
    - Export `SIDEBAR_WIDTH_COLLAPSED = 48` (3rem)
    - Export `SIDEBAR_ITEM_HEIGHT = 36` (8px + 20px + 8px padding)
    - Export `FLYOUT_BORDER_RADIUS = 12`
    - Export `ITEM_BORDER_RADIUS = 8`
    - Export navigation structure type `NavItem = { label: string; href: string; icon: LucideIcon; badge?: ReactNode; children?: NavItem[]; permission?: string }`
    - Export `NavGroup = { label: string; items: NavItem[] }`
  </action>
  <verify>
    - `tsc --noEmit` passes for all three files
    - Files export the documented types and constants
  </verify>
  <done>
    Infrastructure files exist with correct exports: springConfig, labelVariants, useSidebarState hook, navigation types, and design constants.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Sidebar Components (Item, Group, Flyout, Footer, Search)</name>
  <files>
    apps/web/src/components/Sidebar/SidebarItem.tsx
    apps/web/src/components/Sidebar/SidebarGroup.tsx
    apps/web/src/components/Sidebar/SidebarFlyout.tsx
    apps/web/src/components/Sidebar/SidebarFooter.tsx
    apps/web/src/components/Sidebar/SidebarSearch.tsx
  </files>
  <action>
    Create five component files:

    **SidebarItem.tsx:**
    - Props: `{ item: NavItem; isExpanded: boolean; isActive: boolean; index: number; onNavigate: () => void }`
    - Use `motion.div` for the label with `labelVariants` and stagger delay `index * 0.02` (20ms)
    - Icon always visible (16px, stroke-width 1.75)
    - When expanded: show icon + animated label
    - When collapsed: show icon only, tooltip on hover (use Radix Tooltip)
    - Active state: `bg-sidebar-accent` background tint (no accent bar per design spec)
    - Hover: 150-200ms ease-out for background color
    - Focus-visible: `ring-2 ring-sidebar-ring ring-offset-1`
    - Typography: 13px label, font-medium when active, font-normal otherwise
    - Spacing: 8px padding all sides, 8px border radius
    - Handle badge rendering (DispatchBadge, MessagesBadge, etc.)

    **SidebarGroup.tsx:**
    - Props: `{ group: NavGroup; isExpanded: boolean; children?: NavItem[]; onNavigate: () => void }`
    - Group label: uppercase, 11px, font-semibold, tracking-wider, text-sidebar-foreground/40
    - When collapsed: hide group labels with opacity animation
    - For items with children: when expanded, show inline submenu (existing behavior)
    - When collapsed AND has children: render `SidebarFlyout` instead

    **SidebarFlyout.tsx:**
    - Use Radix `Popover` (already in deps as @radix-ui/react-popover)
    - Trigger: the parent item's icon (hover trigger, not click)
    - Content: positioned to the right with 8px offset
    - Border radius: 12px per design spec
    - Shadow: `shadow-[0_1px_2px_rgba(0,0,0,0.04),_0_8px_24px_rgba(0,0,0,0.08)]`
    - Background: `bg-popover` for theme support
    - Render child NavItems as submenu links
    - Close on click or Escape
    - Arrow keys navigate within flyout

    **SidebarFooter.tsx:**
    - Props: `{ isExpanded: boolean; onToggle: () => void; supportBadge?: ReactNode }`
    - When expanded: show support card with icon + "Support" label + badge count
    - When collapsed: show icon only with tooltip
    - Toggle button: chevron icon (ChevronLeft when expanded, ChevronRight when collapsed)
    - Toggle button at bottom, clickable, with hover state
    - Border-top separator

    **SidebarSearch.tsx:**
    - Props: `{ isExpanded: boolean }`
    - When expanded: full search input with Search icon, placeholder "Search..."
    - When collapsed: Search icon button only, expands sidebar on click
    - Use shadcn Input component base styling
    - Focus ring: `ring-sidebar-ring`
  </action>
  <verify>
    - `tsc --noEmit` passes for all five files
    - Each component handles both expanded/collapsed states
    - Flyout uses Radix Popover with hover trigger
  </verify>
  <done>
    All five sub-components exist with proper TypeScript types, Framer Motion animations on labels, Radix Popover flyout, and correct styling for both states.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Main AnimatedSidebar and Integrate into OwnerShell</name>
  <files>
    apps/web/src/components/Sidebar/index.tsx
    apps/web/src/components/navigation/owner-shell.tsx
  </files>
  <action>
    **apps/web/src/components/Sidebar/index.tsx:**
    - Import all sub-components and hooks
    - Use `motion.aside` for the sidebar container with `sidebarVariants` for width animation
    - Apply `useMotionConfig()` to get spring or reduced-motion transition
    - Structure: Header (logo) -> Search -> ScrollArea (groups/items) -> Footer
    - Header: `AppLogo` + `DriveCommandWordmark` (wordmark animates out when collapsed)
    - Keyboard navigation:
      - Arrow Up/Down to navigate items (manage focusedIndex state)
      - Enter to activate focused item
      - Escape to close any open flyout
      - Ctrl/Cmd+B to toggle sidebar (keep existing shortcut)
    - Expose `data-state="expanded"|"collapsed"` on root for CSS hooks
    - Use `useSidebar()` context OR create standalone (prefer standalone with `useSidebarState` for cleaner implementation)
    - Port all navigation items from existing `sidebar.tsx`:
      - Intelligence group (Live Map)
      - Carrier Ops group (Dashboard, Clients, Contracts, Templates, Dispatches, Loads, Messages, Fleet with sub-items, Driver Pay with sub-items, Reports with sub-items)
      - Workflows group (Checklists)
      - Business group (AI Documents)
      - Settings group (Team Permissions, Subscription, Notifications, Expense Categories, Expense Templates, Integrations)
      - Account group (My Notifications)
      - Support group (My Tickets, Help Center)
    - Preserve all PermissionGuard wrapping for role-based visibility
    - Preserve all badge components (DispatchBadge, MessagesBadge, PendingPayBadge, supportBadge)
    - Full height: `h-screen` with flex column layout
    - Background: `bg-sidebar`
    - Border: `border-r border-sidebar-border`
    - Fixed position on desktop, hidden on mobile (existing mobile nav stays)

    **apps/web/src/components/navigation/owner-shell.tsx:**
    - Replace `AppSidebar` import with `AnimatedSidebar` from `@/components/Sidebar`
    - Keep `SidebarProvider` wrapper (AnimatedSidebar will use its context OR manage own state)
    - If AnimatedSidebar manages own state, remove `SidebarProvider` dependency (cleaner)
    - Keep `SidebarInset` for main content area
    - Keep `SidebarTrigger` in header OR wire to AnimatedSidebar's toggle
    - Pass `supportBadge` prop through to new sidebar

    **Design quality verification (Emil Kowalski style):**
    - Spacing: all padding/margins in 4px multiples (p-2 = 8px, gap-1 = 4px)
    - Border radii: items 8px (`rounded-lg`), flyout 12px (`rounded-xl`)
    - Shadows: flyout uses multi-layer soft shadow
    - Transitions: spring for width/transform, 150-200ms ease-out for colors
    - Icons: 16-18px, stroke-width 1.75 (add `[&>svg]:size-4` and custom stroke)
    - Typography: 13-14px for labels
    - Active: subtle bg tint only, no accent bar
  </action>
  <verify>
    - `tsc --noEmit` passes
    - `npm run build` succeeds
    - Visit `/carrier/dashboard` in browser:
      - Sidebar expands/collapses with spring animation
      - Labels stagger fade in/out
      - Collapsed hover on Fleet/Reports/Driver Pay shows flyout
      - Footer toggle button works
      - Search shows/hides correctly
      - Arrow keys navigate items
      - Ctrl+B toggles sidebar
      - Dark mode toggle works correctly
      - Refresh page: state persists from localStorage
  </verify>
  <done>
    AnimatedSidebar renders in OwnerShell with spring physics animations, flyout submenus when collapsed, search input, footer with toggle, keyboard navigation, reduced motion support, and localStorage persistence. All existing navigation items and permission guards preserved.
  </done>
</task>

</tasks>

<verification>
1. `tsc --noEmit` passes with no errors
2. `npm run build` succeeds
3. Visual verification at `/carrier/dashboard`:
   - Sidebar animates smoothly when toggling
   - Labels stagger animate
   - Flyout appears on collapsed hover for groups with children
   - Footer toggle works
   - Search input transitions
   - Keyboard nav works (arrows, Enter, Esc, Ctrl+B)
   - State persists after refresh
   - Dark/light mode both work
4. With `prefers-reduced-motion: reduce` in dev tools, animations are instant
</verification>

<success_criteria>
- Spring physics animation on sidebar width (stiffness 400, damping 35)
- Staggered label fade+slide (~20ms per item)
- Flyout submenus on collapsed hover (Radix Popover)
- Footer with support card and toggle button
- Search input (icon-only when collapsed)
- localStorage persistence (plus existing cookie compat)
- Full keyboard navigation (arrows, Enter, Esc)
- prefers-reduced-motion respected
- Dark and light themes work
- All existing navigation items and permissions preserved
</success_criteria>

<output>
After completion, create `.planning/quick/331-redesign-left-sidebar-navigation-with-co/331-SUMMARY.md`
</output>
