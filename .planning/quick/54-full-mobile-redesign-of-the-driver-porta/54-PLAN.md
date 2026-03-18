---
phase: quick-54
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(driver)/layout.tsx
  - src/components/driver/driver-nav.tsx
  - src/components/driver/driver-bottom-nav.tsx
  - src/components/driver/gps-tracker.tsx
  - src/app/(driver)/my-route/page.tsx
  - src/app/(driver)/my-load/page.tsx
  - src/app/(driver)/hours/page.tsx
  - src/app/(driver)/messages/page.tsx
  - src/app/(driver)/incidents/page.tsx
  - src/app/(driver)/my-tickets/page.tsx
  - src/app/(driver)/page.tsx
  - src/components/driver/hos-dashboard.tsx
  - src/components/driver/messaging-panel.tsx
  - src/components/driver/incident-report-form.tsx
  - src/components/driver/route-detail-readonly.tsx
  - src/components/driver/document-list-readonly.tsx
  - src/components/driver/load-status-button.tsx
  - src/components/navigation/owner-bottom-nav.tsx
  - src/components/navigation/owner-shell.tsx
  - src/app/(owner)/dashboard/page.tsx
  - src/app/(owner)/loads/page.tsx
  - src/app/(owner)/trucks/page.tsx
  - src/app/(owner)/drivers/page.tsx
  - src/app/(owner)/routes/page.tsx
autonomous: false
must_haves:
  truths:
    - "On mobile (<lg), driver portal shows fixed bottom navigation bar with 6 items (Route, Load, Messages, Hours, Report, Support)"
    - "On mobile (<lg), owner portal shows fixed bottom navigation bar with key items (Dashboard, Loads, Trucks, Drivers, More)"
    - "On mobile (<lg), the existing top horizontal DriverNav tabs are hidden"
    - "On desktop (lg+), both portals are completely unchanged — bottom nav hidden, existing nav visible"
    - "All tap targets on mobile are at least 44px minimum touch size"
    - "Typography on mobile is larger and high-contrast for readability"
    - "Cards on mobile are full-width with no horizontal margins, app-like feel"
    - "Page content has bottom padding to avoid being hidden behind the fixed bottom nav"
  artifacts:
    - path: "src/components/driver/driver-bottom-nav.tsx"
      provides: "Fixed bottom navigation bar for driver portal mobile"
      min_lines: 40
    - path: "src/components/navigation/owner-bottom-nav.tsx"
      provides: "Fixed bottom navigation bar for owner portal mobile"
      min_lines: 40
---

<objective>
Full mobile redesign of BOTH the driver portal AND the owner portal for a thumb-friendly, app-like experience on phones.

Purpose: Both drivers (older, non-tech-savvy) and owners/managers use the app on mobile. The current sidebar navigation and small text are not usable on phones. Bottom nav bars, larger tap targets, bigger typography, and full-width cards will make both portals feel like native mobile apps.

Output: Mobile-optimized driver and owner portals with bottom navs, large touch targets, bigger text, full-width cards. Desktop completely untouched via Tailwind responsive prefixes (all changes apply below `lg` breakpoint only).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(driver)/layout.tsx
@src/components/driver/driver-nav.tsx
@src/components/driver/gps-tracker.tsx
@src/app/(driver)/my-route/page.tsx
@src/app/(driver)/my-load/page.tsx
@src/app/(driver)/hours/page.tsx
@src/app/(driver)/messages/page.tsx
@src/app/(driver)/incidents/page.tsx
@src/app/(driver)/my-tickets/page.tsx
@src/app/(driver)/page.tsx
@src/components/driver/hos-dashboard.tsx
@src/components/driver/messaging-panel.tsx
@src/components/driver/incident-report-form.tsx
@src/components/driver/route-detail-readonly.tsx
@src/components/driver/document-list-readonly.tsx
@src/components/driver/load-status-button.tsx
@src/components/navigation/owner-shell.tsx
@src/components/navigation/sidebar.tsx
@src/app/(owner)/dashboard/page.tsx
@src/app/(owner)/loads/page.tsx
@src/app/(owner)/trucks/page.tsx
@src/app/(owner)/drivers/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create driver bottom nav and update driver layout shell for mobile</name>
  <files>
    src/components/driver/driver-bottom-nav.tsx
    src/app/(driver)/layout.tsx
    src/components/driver/driver-nav.tsx
    src/components/driver/gps-tracker.tsx
  </files>
  <action>
    **1. Create `src/components/driver/driver-bottom-nav.tsx`** — a new 'use client' component:
    - Fixed to bottom of viewport: `fixed bottom-0 left-0 right-0 z-50`
    - Only visible on mobile: `lg:hidden`
    - Background: `bg-card border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)]`
    - Safe area padding for notched phones: `pb-[env(safe-area-inset-bottom)]`
    - Contains 6 nav items: My Route (/my-route), My Load (/my-load), Messages (/messages), Hours (/hours), Report (/incidents), Support (/my-tickets)
    - Each item: vertical stack — Lucide icon (h-5 w-5) on top, label below (text-[10px] font-medium)
    - Active state: `text-primary font-semibold`
    - Inactive state: `text-muted-foreground`
    - Each item: `flex flex-col items-center justify-center min-h-[56px] flex-1 gap-0.5`
    - Container: `flex items-stretch`
    - Use `usePathname()` for active detection
    - Icons to use from lucide-react: MapPin (My Route), Package (My Load), MessageSquare (Messages), Clock (Hours), AlertTriangle (Report), LifeBuoy (Support)

    **2. Update `src/app/(driver)/layout.tsx`:**
    - Import and render `<DriverBottomNav />` inside the layout after the main content area
    - Add `pb-20 lg:pb-0` to the `<main>` element so content clears the fixed bottom nav on mobile
    - Wrap `<DriverNav />` in `<div className="hidden lg:block">` so tabs only show on desktop
    - Wrap `<GpsTracker />` in `<div className="hidden lg:block">` — GPS component still mounts and tracks, only the visual is hidden on mobile

    **3. Update `src/components/driver/driver-nav.tsx`:**
    - This is the horizontal top tab bar. Add `hidden lg:flex` to the outermost nav/div element so it is hidden on mobile and only shows on desktop.

    **CRITICAL RULES:**
    - Do NOT change any desktop styles. All mobile changes use unprefixed classes. Desktop preserved via `lg:` prefixes.
    - The bottom nav must use exact same href paths as DriverNav.
    - GPS tracker still mounts (tracking continues) — only the visual div is hidden on mobile.
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no TypeScript errors.
  </verify>
  <done>
    Driver bottom navigation bar visible on mobile with 6 icon+label items (56px tap targets). Top tabs hidden on mobile, visible on desktop. GPS still tracking. Content clears bottom nav.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create owner portal bottom nav and update owner shell for mobile</name>
  <files>
    src/components/navigation/owner-bottom-nav.tsx
    src/components/navigation/owner-shell.tsx
  </files>
  <action>
    **1. Create `src/components/navigation/owner-bottom-nav.tsx`** — a new 'use client' component:
    - Fixed to bottom of viewport: `fixed bottom-0 left-0 right-0 z-50`
    - Only visible on mobile: `lg:hidden`
    - Background: `bg-card border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)]`
    - Safe area padding: `pb-[env(safe-area-inset-bottom)]`
    - Contains 5 nav items for the most important owner actions:
      1. Dashboard → /dashboard (icon: LayoutDashboard)
      2. Loads → /loads (icon: Package)
      3. Drivers → /drivers (icon: Users)
      4. Trucks → /trucks (icon: Truck)
      5. More → opens sidebar trigger OR links to /settings/integrations (icon: Menu or Grid3x3)
         Actually for "More" — since the sidebar has ALL nav items, link to /dashboard as a placeholder for now and label it "Menu" with a Menu icon. NOTE: The sidebar hamburger trigger is already in the header — so "Menu" in the bottom nav is redundant. Instead use the 5th slot for: Routes → /routes (icon: RouteIcon from lucide)
    - So 5 items: Dashboard, Loads, Drivers, Trucks, Routes
    - Same styling as driver bottom nav: vertical icon+label, active = `text-primary`, inactive = `text-muted-foreground`, `min-h-[56px] flex-1`
    - Use `usePathname()` for active state — item is active if `pathname.startsWith(href)`, except dashboard uses `pathname === '/dashboard'`
    - Import from lucide-react: LayoutDashboard, Package, Users, Truck, Route as RouteIcon

    **2. Update `src/components/navigation/owner-shell.tsx`:**
    - Import `OwnerBottomNav` from `@/components/navigation/owner-bottom-nav`
    - Render `<OwnerBottomNav />` inside the component, after `</SidebarInset>`
    - Add `pb-20 lg:pb-0` to the `<main>` element inside `SidebarInset` so content clears the bottom nav on mobile
    - The existing AppSidebar (collapsible="icon") already handles desktop navigation — keep it exactly as-is
    - On mobile, the sidebar collapses. The bottom nav provides primary navigation. The sidebar hamburger trigger in the header remains available for accessing all the other menu items.

    **CRITICAL RULES:**
    - Do NOT modify the AppSidebar or sidebar.tsx at all
    - Do NOT modify the owner portal layout.tsx
    - Do NOT modify any owner portal page files in this task
    - Only create owner-bottom-nav.tsx and update owner-shell.tsx
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no TypeScript errors.
  </verify>
  <done>
    Owner portal has a bottom nav on mobile with 5 items (Dashboard, Loads, Drivers, Trucks, Routes). Desktop sidebar completely untouched. Main content clears bottom nav on mobile.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mobile-optimize all driver page screens for app-like feel</name>
  <files>
    src/app/(driver)/my-route/page.tsx
    src/app/(driver)/my-load/page.tsx
    src/app/(driver)/hours/page.tsx
    src/app/(driver)/messages/page.tsx
    src/app/(driver)/incidents/page.tsx
    src/app/(driver)/my-tickets/page.tsx
    src/app/(driver)/page.tsx
    src/components/driver/hos-dashboard.tsx
    src/components/driver/messaging-panel.tsx
    src/components/driver/incident-report-form.tsx
    src/components/driver/route-detail-readonly.tsx
    src/components/driver/document-list-readonly.tsx
    src/components/driver/load-status-button.tsx
  </files>
  <action>
    Apply mobile-first optimizations across all driver screens. Every change uses Tailwind responsive prefixes — desktop (lg+) is UNTOUCHED.

    **Global patterns to apply on ALL page files:**
    - Page outer wrapper `space-y-6` → `space-y-4 lg:space-y-6`
    - Page headings `text-2xl` → `text-xl lg:text-2xl`
    - Card padding `p-6` → `p-4 lg:p-6`
    - Cards: add `rounded-none border-x-0 lg:rounded-lg lg:border-x` for full-bleed on mobile (only on Card components that currently have rounded-lg — check existing classes first and only add if needed)

    **my-load/page.tsx + load-status-button.tsx:**
    - LoadStatusButton: ensure button has `w-full lg:w-auto` and `min-h-[52px] lg:min-h-[44px]` and `text-lg lg:text-base`
    - Status timeline circles: `h-8 w-8 lg:h-8 lg:w-8` → make `h-10 w-10 lg:h-8 lg:w-8` if they exist

    **hours/page.tsx + hos-dashboard.tsx:**
    - HOS grid: any `sm:grid-cols-3` or `grid-cols-3` → `grid-cols-1 lg:grid-cols-3`
    - Hours values `text-2xl` → `text-3xl lg:text-2xl` (bigger at a glance on mobile)
    - Progress bars `h-2` → `h-3 lg:h-2`
    - Status change buttons: add `py-3 lg:py-2` and `text-base lg:text-sm`

    **messages/page.tsx + messaging-panel.tsx:**
    - Compose input: `text-base lg:text-sm` and `py-3 lg:py-2.5`
    - Send button: `h-12 w-12 lg:h-10 lg:w-10`
    - Message area: `h-[300px] lg:h-[400px]` if fixed height exists

    **incidents/page.tsx + incident-report-form.tsx:**
    - Form max-width: `max-w-none lg:max-w-2xl`
    - All input/select/textarea: add `text-base lg:text-sm` and `py-3 lg:py-2.5`
    - Labels: `text-base lg:text-sm font-medium`
    - Submit button: `py-3 lg:py-2.5 text-base lg:text-sm w-full lg:w-auto`

    **my-tickets/page.tsx:**
    - Apply global card patterns

    **route-detail-readonly.tsx:**
    - Details grid `grid-cols-2` → `grid-cols-1 lg:grid-cols-2`

    **document-list-readonly.tsx:**
    - Download button: `px-4 py-2.5 lg:px-3 lg:py-1.5 text-base lg:text-sm`
    - List items: add `min-h-[56px] lg:min-h-0`

    **CRITICAL RULES:**
    - Every change MUST use responsive prefix pattern. Unprefixed = mobile default, `lg:` = desktop restoration.
    - Do NOT remove existing desktop classes — only ADD mobile-first values or change the base value while adding `lg:` to preserve desktop.
    - Do NOT change any component logic, data fetching, server actions, or functionality. Purely visual/CSS.
    - Read each file before editing it to understand current classes.
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no TypeScript errors.
    Run `npx next build 2>&1 | tail -30` to confirm build succeeds.
  </verify>
  <done>
    All driver screens have mobile-optimized typography, full-width cards, bigger touch targets, stacked layouts. Desktop layouts pixel-identical to before.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Complete mobile redesign of BOTH portals:
    - Driver portal: bottom nav (6 items), larger text, full-width cards, bigger tap targets
    - Owner portal: bottom nav (5 items: Dashboard, Loads, Drivers, Trucks, Routes), main content clears bottom nav
    - Desktop on both portals: completely unchanged
  </what-built>
  <how-to-verify>
    1. Deploy or run `npm run dev`
    2. Open Chrome DevTools → device toolbar → iPhone 14 (390x844)
    3. Log in as a driver → verify:
       - Bottom nav appears with 6 items (Route, Load, Messages, Hours, Report, Support)
       - Top tab nav is gone on mobile
       - Text is noticeably larger
       - Cards are edge-to-edge
       - Buttons are large and easy to tap
    4. Log in as an owner → verify:
       - Bottom nav appears with 5 items (Dashboard, Loads, Drivers, Trucks, Routes)
       - Sidebar hamburger is still available in header for full menu
       - Content doesn't hide behind bottom nav
    5. Switch to desktop (1280px+) for BOTH portals → verify:
       - Bottom nav is gone
       - Driver top tabs are visible
       - Owner sidebar is visible
       - Everything looks exactly like before
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues to fix</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- `npx next build` completes successfully
- Mobile viewport shows bottom nav on both portals, hides existing nav, shows larger text and full-width cards
- Desktop viewport is completely unchanged from before
</verification>

<success_criteria>
- Driver bottom nav: 6 items, 56px+ tap targets, icon+label, active state
- Owner bottom nav: 5 items (Dashboard, Loads, Drivers, Trucks, Routes), 56px+ tap targets
- Both bottom navs: lg:hidden, fixed to bottom, safe-area padding
- Driver top tabs: hidden on mobile (hidden lg:flex)
- Owner sidebar: untouched, still collapses on mobile as before, hamburger in header available
- Main content: pb-20 lg:pb-0 on both portals to clear bottom nav
- Driver pages: larger text, full-width cards, bigger buttons on mobile
- Desktop: pixel-identical to before on both portals
</success_criteria>

<output>
After completion, create `.planning/quick/54-full-mobile-redesign-of-the-driver-porta/54-SUMMARY.md`
</output>
