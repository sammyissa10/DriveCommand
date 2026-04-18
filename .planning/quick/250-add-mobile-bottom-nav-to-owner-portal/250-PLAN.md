---
phase: quick-250
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/navigation/owner-bottom-nav.tsx
  - apps/web/src/components/navigation/owner-more-menu.tsx
  - apps/web/src/components/navigation/owner-shell.tsx
autonomous: true
must_haves:
  truths:
    - "On mobile (<768px), owner sees 5-tab bottom nav: Dispatches, Loads, Dashboard, Live Map, More"
    - "Dashboard tab (center) has slightly larger icon creating visual hierarchy"
    - "Tapping More opens full-screen overlay with categorized menu items"
    - "More overlay has Log Out button at bottom"
    - "Desktop sidebar remains completely unchanged"
    - "Active tab is highlighted based on current pathname"
    - "Page content does not overlap with bottom nav"
  artifacts:
    - path: "apps/web/src/components/navigation/owner-bottom-nav.tsx"
      provides: "5-tab mobile bottom nav with dark bg-slate-900 styling"
    - path: "apps/web/src/components/navigation/owner-more-menu.tsx"
      provides: "Full-screen More overlay with sections and logout"
  key_links:
    - from: "owner-bottom-nav.tsx"
      to: "owner-more-menu.tsx"
      via: "isMoreOpen state toggle"
    - from: "owner-shell.tsx"
      to: "owner-bottom-nav.tsx"
      via: "JSX render inside SidebarProvider"
---

<objective>
Replace the existing owner bottom nav with a new 5-tab design (Dispatches, Loads, Carrier Dashboard, Live Map, More) and add a full-screen More overlay menu with categorized navigation items.

Purpose: Give mobile owner users quick access to their most-used pages via bottom nav, with all remaining pages accessible through the More menu overlay.
Output: Updated owner-bottom-nav.tsx, new owner-more-menu.tsx, minor update to owner-shell.tsx.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/navigation/owner-bottom-nav.tsx
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/components/navigation/sidebar.tsx
@apps/web/src/components/navigation/user-menu.tsx
@apps/web/src/components/driver/driver-bottom-nav.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create the OwnerMoreMenu full-screen overlay component</name>
  <files>apps/web/src/components/navigation/owner-more-menu.tsx</files>
  <action>
Create a new client component `OwnerMoreMenu` that renders a full-screen overlay menu.

Props: `isOpen: boolean`, `onClose: () => void`

Structure:
- Fixed overlay covering entire screen (z-[60] to sit above bottom nav z-50)
- Dark header bar with "More" title on the left and an X (lucide `X` icon) close button on the right
- Scrollable body with sections, each having a bold uppercase section header label

Sections and items (each item is a full-width tappable row with the item label on left and a `ChevronRight` icon on right):

**Carrier Ops:**
- Clients -> /carrier/clients (Users2 icon)
- Contracts -> /carrier/contracts (FileText icon)
- Templates -> /carrier/templates (CalendarDays icon)

**Fleet:**
- Carrier Drivers -> /carrier/fleet/drivers (Users2 icon)
- Carrier Trucks -> /carrier/fleet/trucks (Truck icon)
- Facilities -> /carrier/facilities (Boxes icon)

**Reports:**
- Revenue -> /carrier/reports/revenue (BarChart3 icon)
- Driver Pay -> /carrier/reports/driver-pay (BarChart3 icon)
- AR Aging -> /carrier/reports/aging (BarChart3 icon)
- Performance -> /carrier/reports/performance (BarChart3 icon)

**Other:**
- AI Documents -> /ai-documents (FileSearch icon)
- Settings -> /settings/team-permissions (Settings icon)
- Support -> /support (LifeBuoy icon)

**Log Out button** at the bottom: full-width button styled with red text, calls `fetch("/api/auth/logout", { method: "POST" })` then `window.location.href = "/sign-in"` (same pattern as UserMenu).

Styling:
- Background: bg-slate-900 for header, bg-slate-950 for body (or bg-background with dark feel)
- Text: white/slate-200
- Section headers: text-xs uppercase tracking-wider text-slate-400 font-semibold
- Menu items: py-3 px-4 border-b border-slate-800, hover:bg-slate-800 transition
- Active item (matching current pathname via usePathname): text-blue-400 or brand color highlight
- Close on item click (call onClose after navigation via Next.js Link onClick)
- Animate: simple transition — when isOpen is false, render null or use opacity/translate transition
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit 2>&1 | head -30` — no type errors in owner-more-menu.tsx</verify>
  <done>OwnerMoreMenu component exists with all 4 sections, all menu items with correct routes, log out button, and close functionality</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite OwnerBottomNav with new 5-tab design and More integration</name>
  <files>apps/web/src/components/navigation/owner-bottom-nav.tsx, apps/web/src/components/navigation/owner-shell.tsx</files>
  <action>
**Rewrite owner-bottom-nav.tsx** with the following changes:

Replace the existing navItems array with 5 new tabs in this exact order:

1. Dispatches — Truck icon (lucide) — href: /carrier/dispatches
2. Loads — Package icon (lucide) — href: /carrier/loads
3. Carrier Dashboard — Home icon (lucide) — href: /carrier/dashboard — CENTER TAB, special styling
4. Live Map — Map icon (lucide) — href: /live-map
5. More — LayoutGrid icon (lucide) — NO href, triggers More overlay

Implementation details:
- Add `useState` for `isMoreOpen` boolean, default false
- Import and render `OwnerMoreMenu` component, passing `isOpen={isMoreOpen}` and `onClose={() => setIsMoreOpen(false)}`
- The More tab should be a button (not a Link), calling `setIsMoreOpen(true)` on click
- The center Dashboard tab icon should be h-6 w-6 (24px) while all other icons are h-5 w-5 (20px) — creating visual hierarchy
- When More overlay is open, the More tab should show as active (highlighted)

Styling updates:
- Change nav background from `bg-card border-t border-border` to `bg-slate-900` (dark background matching DriveCommand header)
- Change text colors: inactive tabs = `text-slate-400`, active tab = `text-blue-400` (brand blue)
- Keep min-h-[60px], keep the `lg:hidden` responsive class (only shows on mobile)
- Keep `pb-[env(safe-area-inset-bottom)]` for iOS safe area
- Active tab detection: use `pathname.startsWith(href)` for all tabs except Dashboard which uses exact match

Tab label font: keep text-[10px] font-medium

**Minor update to owner-shell.tsx:**
- The existing `pb-20 lg:pb-6` on the main element is already correct for bottom nav padding — verify it stays in place. No other changes needed to owner-shell.tsx unless something breaks.

Do NOT modify the AppSidebar component or any desktop sidebar behavior. The `lg:hidden` class on the bottom nav ensures it only appears on mobile.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit 2>&1 | head -30` — zero TypeScript errors
2. `cd apps/web && npx next build 2>&1 | tail -20` — build succeeds
  </verify>
  <done>
- Bottom nav shows 5 tabs: Dispatches, Loads, Dashboard (center, larger icon), Live Map, More
- Bottom nav uses bg-slate-900 dark styling with blue active state
- More tab opens full-screen overlay menu
- Desktop sidebar is completely unchanged (lg:hidden on bottom nav)
- Main content has padding-bottom to avoid overlap
- Zero TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. `npx next build` succeeds
3. Visual check: on mobile viewport (<768px), bottom nav appears with 5 correct tabs
4. Visual check: on desktop (>=768px), sidebar appears, no bottom nav visible
5. Tapping More opens full-screen overlay with all sections
6. Active tab highlights correctly based on current page
7. Log Out in More menu works (redirects to /sign-in)
</verification>

<success_criteria>
- Owner portal has a 5-tab mobile bottom nav (Dispatches, Loads, Dashboard, Live Map, More)
- More tab opens full-screen overlay with Carrier Ops, Fleet, Reports, Other sections + Log Out
- Desktop sidebar completely unchanged
- Zero TypeScript errors, build passes
</success_criteria>

<output>
After completion, create `.planning/quick/250-add-mobile-bottom-nav-to-owner-portal/250-SUMMARY.md`
</output>
