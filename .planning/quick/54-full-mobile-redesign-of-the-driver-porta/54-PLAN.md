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
autonomous: false
must_haves:
  truths:
    - "On mobile (<lg), a fixed bottom navigation bar appears with icons for My Route, My Load, Messages, Hours, Report, Support"
    - "On mobile (<lg), the existing top horizontal DriverNav tabs are hidden"
    - "On desktop (lg+), the layout is completely unchanged — bottom nav hidden, top tabs visible"
    - "All tap targets on mobile are at least 44px minimum touch size"
    - "Typography on mobile is larger and high-contrast for older drivers"
    - "Cards on mobile are full-width with no horizontal margins, app-like feel"
    - "Page content has bottom padding to avoid being hidden behind the fixed bottom nav"
  artifacts:
    - path: "src/components/driver/driver-bottom-nav.tsx"
      provides: "Fixed bottom navigation bar for mobile"
      min_lines: 40
  key_links:
    - from: "src/app/(driver)/layout.tsx"
      to: "src/components/driver/driver-bottom-nav.tsx"
      via: "import and render"
      pattern: "DriverBottomNav"
---

<objective>
Full mobile redesign of the driver portal for thumb-friendly, app-like experience on phones.

Purpose: Drivers are older, non-tech-savvy users on phones in truck cabs. The current top-tab navigation and small text are not usable on mobile. A bottom nav bar, larger tap targets, bigger typography, and full-width cards will make the app feel like a native mobile app.

Output: Mobile-optimized driver portal with bottom nav, large touch targets, bigger text, full-width cards. Desktop completely untouched via Tailwind responsive prefixes (changes only apply below `lg` breakpoint).
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
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create bottom nav and update driver layout shell for mobile</name>
  <files>
    src/components/driver/driver-bottom-nav.tsx
    src/app/(driver)/layout.tsx
    src/components/driver/driver-nav.tsx
    src/components/driver/gps-tracker.tsx
  </files>
  <action>
    **1. Create `src/components/driver/driver-bottom-nav.tsx`** — a new client component:
    - Fixed to bottom of viewport: `fixed bottom-0 left-0 right-0 z-50`
    - Only visible on mobile: `lg:hidden`
    - Background: `bg-card border-t border-border` with a subtle shadow `shadow-[0_-2px_10px_rgba(0,0,0,0.1)]`
    - Safe area padding for notched phones: `pb-[env(safe-area-inset-bottom)]`
    - Contains the same 6 nav items as `driver-nav.tsx`: My Route (/my-route), My Load (/my-load), Messages (/messages), Hours (/hours), Report (/incidents), Support (/my-tickets)
    - Each nav item is a vertical stack: icon on top (h-6 w-6), label below (text-xs font-medium)
    - Active state: `text-primary` with a filled/bold icon appearance
    - Inactive state: `text-muted-foreground`
    - Each item has `min-h-[56px] min-w-[56px]` for large thumb targets
    - Use `usePathname()` for active detection (same logic as driver-nav)
    - Items arranged in a `flex justify-around` row
    - Add an unread badge dot on Messages icon (just the visual dot, no real count — use a `hidden` class for now, can be wired later)

    **2. Update `src/app/(driver)/layout.tsx`:**
    - Import and render `<DriverBottomNav />` after `</main>` but inside the root div
    - Add `pb-20 lg:pb-0` to the `<main>` element so content is not hidden behind the fixed bottom nav on mobile (20 = ~80px for the bottom nav height)
    - On the header: keep it as-is for desktop. For mobile, simplify: hide the subtitle/description area if any, keep logo + UserMenu compact
    - On the `<DriverNav />` wrapper: add `hidden lg:block` so the horizontal tab nav is hidden on mobile and only shows on desktop
    - On the `<GpsTracker />` wrapper: add `hidden lg:block` so GPS status bar is hidden from the header on mobile (it takes up space; GPS still tracks in background since the component is still mounted — actually, wrap it so it still mounts but the visual is hidden: use a wrapper div with `lg:block` but on mobile show a minimal indicator in the header instead, OR just keep it hidden on mobile since tracking happens regardless of visibility). Simplest approach: wrap GpsTracker in `<div className="hidden lg:block">` — the component still mounts and tracks GPS, just the UI is hidden on mobile.
    - Mobile header should be slimmer: reduce py from `py-3` to `py-2` on mobile. Current classes are `px-4 py-3 sm:px-6 sm:py-4` — change to `px-4 py-2 sm:px-6 sm:py-4` (saves vertical space on small screens).

    **3. Update `src/components/driver/driver-nav.tsx`:**
    - Add `hidden lg:flex` to the outer `<nav>` element so the horizontal tabs only show on desktop (lg+). Currently it's `flex gap-1 overflow-x-auto px-6 pb-2` — change to `hidden lg:flex gap-1 overflow-x-auto px-6 pb-2`.

    **CRITICAL RULES:**
    - Do NOT change any desktop styles. All mobile changes use unprefixed or `sm:` classes. Desktop is preserved via `lg:` prefixes.
    - The bottom nav must use the exact same href paths as the existing DriverNav.
    - The bottom nav is a client component ('use client') since it uses usePathname.
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no TypeScript errors.
    Run `npx next build 2>&1 | tail -20` to confirm the build succeeds.
    Visually inspect: on mobile viewport (Chrome DevTools, 375px width), bottom nav should appear and top tabs should be hidden. On desktop (1024px+), top tabs visible and no bottom nav.
  </verify>
  <done>
    Bottom navigation bar appears on mobile with 6 items, each having icon + label and 56px minimum touch targets. Top horizontal tabs hidden on mobile, visible on desktop. GPS tracker UI hidden on mobile (still tracking). Main content has bottom padding on mobile to avoid overlap with bottom nav. Desktop layout is pixel-identical to before.
  </done>
</task>

<task type="auto">
  <name>Task 2: Mobile-optimize all driver page screens for app-like feel</name>
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
    Apply mobile-first optimizations across all driver screens. Every change uses Tailwind responsive prefixes so desktop (lg+) is UNTOUCHED.

    **Global patterns to apply on ALL page files:**
    - Page headings: `text-2xl` becomes `text-xl lg:text-2xl` (slightly smaller on mobile but still bold and readable)
    - Subtitle/description text: keep `text-muted-foreground` but bump to `text-base lg:text-sm` on mobile for readability
    - Card containers with `p-6`: change to `p-4 lg:p-6` for tighter mobile padding
    - Card containers with `p-5`: change to `p-4 lg:p-5`
    - Cards with `rounded-lg border`: on mobile, make full-bleed by changing to `rounded-none border-x-0 lg:rounded-lg lg:border-x` (edge-to-edge cards on mobile, rounded on desktop)
    - `space-y-6` on page wrappers: change to `space-y-4 lg:space-y-6` (tighter vertical rhythm on mobile)

    **Per-file specifics:**

    **my-route/page.tsx + route-detail-readonly.tsx:**
    - Active stop panel: increase padding, make the "Mark Departed" button full-width on mobile: add `w-full lg:w-auto` to the button in MarkDepartedButton
    - Route details dl grid `sm:grid-cols-2`: change to `grid-cols-1 lg:grid-cols-2` (single column on mobile, two on desktop)
    - Document sections: `p-6` to `p-4 lg:p-6`
    - Section headings `text-xl`: change to `text-lg lg:text-xl`

    **my-load/page.tsx:**
    - Load details card: apply card pattern above
    - `text-sm` on dt/dd pairs: bump to `text-base lg:text-sm` for readability on mobile
    - Status timeline: the horizontal timeline can overflow on mobile. Wrap it in a scrollable container. The existing `overflow-x-auto` handles this. Increase the min-w on each step from `min-w-[72px]` to `min-w-[64px]` (slightly smaller to fit more). Also make the status circles bigger on mobile: `h-10 w-10 lg:h-8 lg:w-8` with `text-sm lg:text-xs` for the number inside.
    - "Update Status" section: make the LoadStatusButton full-width on mobile

    **load-status-button.tsx:**
    - The button already has `w-full sm:w-auto` — change to `w-full lg:w-auto` so it stays full-width until desktop
    - Increase min-h from `min-h-[44px]` to `min-h-[52px] lg:min-h-[44px]` for bigger thumb target on mobile
    - Increase font size: `text-lg lg:text-base`

    **hours/page.tsx + hos-dashboard.tsx:**
    - HOS grid `sm:grid-cols-3`: change to `grid-cols-1 lg:grid-cols-3` (stack cards vertically on mobile)
    - Hours values `text-2xl`: change to `text-3xl lg:text-2xl` (bigger numbers on mobile — drivers need to see hours at a glance)
    - Progress bars `h-2`: change to `h-3 lg:h-2` (thicker on mobile for visibility)
    - Status change buttons: increase padding to `px-5 py-3 lg:px-4 lg:py-2` and font `text-base lg:text-sm` for bigger tap targets
    - Break reminder box: increase text sizes slightly for mobile

    **messages/page.tsx + messaging-panel.tsx:**
    - Message area height: `h-[400px]` to `h-[300px] lg:h-[400px]` (less height on mobile to leave room for keyboard)
    - Compose input: increase to `py-3 lg:py-2.5` and `text-base lg:text-sm` for easier typing
    - Send button: increase to `h-12 w-12 lg:h-10 lg:w-10` for bigger tap target
    - Card container: apply full-bleed pattern

    **incidents/page.tsx + incident-report-form.tsx:**
    - Form container `max-w-2xl`: change to `max-w-none lg:max-w-2xl` (full width on mobile)
    - All inputs: increase to `py-3 lg:py-2.5` and `text-base lg:text-sm`
    - Labels: `text-sm` to `text-base lg:text-sm`
    - Select dropdown: same size increase
    - Textarea: rows stay at 4 but add `text-base lg:text-sm`
    - Submit button: increase height with `py-3 lg:py-2.5`, `text-base lg:text-sm`
    - Photo upload placeholder: increase height from `h-24` to `h-28 lg:h-24`

    **my-tickets/page.tsx:**
    - Ticket cards: apply full-bleed card pattern
    - Ticket title: `font-semibold` stays, but add `text-base lg:text-sm` (since the default is inherited)
    - Badge text and spacing should be fine as-is (already small, works on mobile)
    - Resolution box: `text-sm` to `text-base lg:text-sm`

    **page.tsx (driver home/landing):**
    - Empty state: `py-16` to `py-10 lg:py-16` (less vertical padding on mobile)
    - Icon: `h-12 w-12` to `h-14 w-14 lg:h-12 lg:w-12` (bigger on mobile)
    - Heading: `text-2xl` to `text-xl lg:text-2xl`

    **document-list-readonly.tsx:**
    - Download button: increase to `px-4 py-2.5 lg:px-3 lg:py-1.5` and `text-base lg:text-sm` for bigger tap target (min 44px)
    - File info: `text-sm` to `text-base lg:text-sm`
    - Each list item padding: `p-4` to `p-4 lg:p-4` (fine as-is, but ensure tap targets)
    - Make the entire row more spacious on mobile: add `min-h-[60px] lg:min-h-0` to each `<li>`

    **CRITICAL RULES:**
    - Every single change MUST use responsive prefix pattern. Unprefixed = mobile, `lg:` = desktop restoration.
    - Do NOT remove any existing classes that affect desktop. Only ADD mobile-first classes or modify the unprefixed value while adding `lg:` to preserve desktop.
    - Do NOT change any component logic, data fetching, server actions, or functionality. This is purely visual/CSS.
    - Do NOT touch any files outside the (driver) route group or driver components directory.
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no TypeScript errors.
    Run `npx next build 2>&1 | tail -20` to confirm build succeeds.
  </verify>
  <done>
    All driver screens have mobile-optimized typography (larger text), full-width edge-to-edge cards, bigger touch targets (52px+ buttons), stacked single-column layouts, and thicker progress bars. Desktop layouts are pixel-identical to before — verified by lg: prefix preservation on every change.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Complete mobile redesign of the driver portal: bottom navigation bar, larger typography, full-width cards, bigger tap targets, app-like feel. Desktop is completely untouched.</what-built>
  <how-to-verify>
    1. Start dev server: `npm run dev`
    2. Open Chrome DevTools, toggle device toolbar (Ctrl+Shift+M)
    3. Set viewport to iPhone 14 (390x844) or similar mobile size
    4. Log in as a driver user
    5. Verify:
       - Bottom navigation bar appears with 6 icons (Route, Load, Messages, Hours, Report, Support)
       - Top horizontal tab navigation is HIDDEN
       - GPS tracker status bar is HIDDEN (but still tracking)
       - Tap each bottom nav item — active state highlights correctly
       - All cards are full-width (edge-to-edge, no rounded corners on mobile)
       - Text is noticeably larger than before (headings, labels, values)
       - Buttons are large and easy to tap (52px+ height)
       - HOS hours grid is single-column stacked
       - Load status timeline circles are larger
       - Content does not get hidden behind the bottom nav bar
    6. Switch to desktop viewport (1280px+):
       - Bottom nav is GONE
       - Top horizontal tabs are visible
       - GPS tracker status is visible
       - Cards are rounded with borders
       - Typography is normal size
       - Everything looks exactly like before the change
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues to fix</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- `npx next build` completes successfully
- Mobile viewport shows bottom nav, hides top tabs, shows larger text and full-width cards
- Desktop viewport is completely unchanged from before
- No files outside `src/app/(driver)/` and `src/components/driver/` were modified
</verification>

<success_criteria>
- Fixed bottom navigation bar on mobile with 6 thumb-friendly items (56px+ tap targets)
- Top horizontal DriverNav hidden on mobile, visible on desktop (lg+)
- All driver page content has larger typography on mobile (text-base vs text-sm, text-xl vs text-2xl headings)
- Cards are full-bleed (edge-to-edge) on mobile, rounded on desktop
- Form inputs and buttons are larger on mobile (52px+ height, text-base)
- HOS grid stacks single-column on mobile
- Main content has bottom padding to clear the fixed bottom nav
- Desktop portal is pixel-identical to before — zero visual regressions
</success_criteria>

<output>
After completion, create `.planning/quick/54-full-mobile-redesign-of-the-driver-porta/54-SUMMARY.md`
</output>
