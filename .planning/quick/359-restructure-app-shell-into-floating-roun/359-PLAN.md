---
phase: quick-359
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/navigation/owner-shell.tsx
  - apps/web/src/app/globals.css
  - apps/web/src/components/Sidebar/index.tsx
autonomous: true
must_haves:
  truths:
    - "Outer shell has dark background matching sidebar color with p-3 padding"
    - "Sidebar appears as floating rounded panel (rounded-2xl)"
    - "Main content panel is white/card-colored containing both topbar and page content"
    - "No sharp 90-degree corners visible in desktop layout"
  artifacts:
    - path: "apps/web/src/components/navigation/owner-shell.tsx"
      provides: "Restructured floating panel layout"
      contains: "gap-3"
    - path: "apps/web/src/app/globals.css"
      provides: "Shell background class"
      contains: "shell-bg"
---

<objective>
Restructure the owner shell desktop layout from fixed chrome + inset content panel to a floating panel design where:
1. Outer shell has dark background (matching sidebar color) with p-3 padding
2. Sidebar becomes a floating rounded panel (rounded-2xl)
3. Main content is a floating white panel that CONTAINS the topbar as its first child
4. No sharp 90-degree corners anywhere in the desktop layout

Purpose: Premium floating panel aesthetic matching modern app design
Output: Restructured owner-shell.tsx with floating panel layout
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/components/Sidebar/index.tsx
@apps/web/src/app/globals.css
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add shell background CSS class</name>
  <files>apps/web/src/app/globals.css</files>
  <action>
Add a new CSS class `.shell-bg` that uses the sidebar gradient colors for a unified dark background. Add this near the existing `.page-bg-fixed` class:

```css
/* Shell background for floating panel layout — matches sidebar dark chrome */
.shell-bg {
  background: linear-gradient(
    180deg,
    hsl(var(--sidebar-gradient-from)) 0%,
    hsl(var(--sidebar-gradient-to)) 100%
  );
}
```

This ensures the outer shell matches the sidebar color exactly.
  </action>
  <verify>grep "shell-bg" apps/web/src/app/globals.css</verify>
  <done>CSS class `.shell-bg` exists and uses sidebar gradient colors</done>
</task>

<task type="auto">
  <name>Task 2: Restructure owner-shell.tsx desktop layout to floating panels</name>
  <files>apps/web/src/components/navigation/owner-shell.tsx</files>
  <action>
Restructure the desktop layout (the `hidden lg:block` div) with these changes:

**Outer container changes:**
- Replace `min-h-screen page-bg-fixed` with `h-screen shell-bg p-3 flex gap-3`
- This creates the dark background with padding and flex layout

**Sidebar changes:**
- AnimatedSidebar renders a fixed element internally; we need the sidebar to participate in flex layout
- The sidebar container needs `rounded-2xl overflow-hidden` to create floating effect
- BUT since AnimatedSidebar uses `position: fixed` internally, we need to wrap it in a container that reserves space:
  ```jsx
  {/* Sidebar container - reserves space in flex layout */}
  <div
    className="shrink-0 sidebar-margin-transition"
    style={{ width: "var(--sidebar-width, 240px)" }}
  >
    <AnimatedSidebar />
  </div>
  ```

**Main content panel changes:**
- Create a single white panel that contains BOTH the topbar and content
- Remove `position: fixed` from both header and main
- Structure:
  ```jsx
  {/* Main content panel - contains topbar + content */}
  <div className="flex-1 flex flex-col bg-card rounded-2xl overflow-hidden shadow-lg">
    {/* TopBar - now inside white panel */}
    <header className="flex h-14 shrink-0 items-center gap-4 px-6 border-b border-border">
      {/* Tenant name - now uses card foreground colors */}
      <span className="text-[15px] font-medium text-foreground truncate ..." ... />

      {/* Search trigger */}
      <div className="flex-1 flex justify-center">
        <SearchTrigger />
      </div>

      {/* Right side actions - remove topbar-dark-context class */}
      <div className="flex items-center gap-3 shrink-0">
        ...
      </div>
    </header>

    {/* Scrollable content area */}
    <main className="flex-1 overflow-auto p-6">
      {children}
    </main>
  </div>
  ```

**Key changes summary:**
1. Outer: `h-screen shell-bg p-3 flex gap-3`
2. Sidebar wrapper: `shrink-0` with dynamic width to reserve space for fixed sidebar
3. Content panel: `flex-1 flex flex-col bg-card rounded-2xl overflow-hidden shadow-lg`
4. Header: Remove `fixed`, `top-0`, `right-0`, `z-[45]`, `left: var(...)`, `topbar-solid`, `sidebar-margin-transition`
5. Header: Add `border-b border-border` for subtle separation
6. Header text: Change `text-[hsl(var(--sidebar-fg))]` to `text-foreground`
7. Header actions: Remove `topbar-dark-context` class (no longer needed since on white)
8. Main: Remove `fixed`, `top-[72px]`, `right-4`, `bottom-4`, `left: calc(...)`, `rounded-xl`, `shadow-sm`, `sidebar-margin-transition`
9. Main: Keep only `flex-1 overflow-auto` (rounding on parent panel now)
10. Main inner: Keep `p-6` for content padding
  </action>
  <verify>
cd /Users/ayazmohammed/DriveCommand && npm run build --workspace=apps/web 2>&1 | head -50
  </verify>
  <done>Desktop layout uses floating panel design with no 90-degree corners, topbar inside white content panel</done>
</task>

<task type="auto">
  <name>Task 3: Update AnimatedSidebar for rounded floating appearance</name>
  <files>apps/web/src/components/Sidebar/index.tsx</files>
  <action>
The AnimatedSidebar uses `position: fixed` directly. To achieve the floating rounded appearance:

1. On the main `motion.aside` element (around line 501-516), add `rounded-2xl` to the className:
   - Current: `"fixed left-0 top-0 h-screen sidebar-solid hidden lg:flex flex-col z-40"`
   - Updated: `"fixed left-3 top-3 h-[calc(100vh-24px)] sidebar-solid hidden lg:flex flex-col z-40 rounded-2xl overflow-hidden"`

   Note: Changed from `left-0 top-0 h-screen` to `left-3 top-3 h-[calc(100vh-24px)]` to account for the p-3 padding on the shell

2. On the peek overlay `motion.div` element (around line 525-541), add matching rounded corners:
   - Add `rounded-2xl overflow-hidden` to className
   - Update positioning: `left-3 top-3 h-[calc(100vh-24px)]` (same as main sidebar)

This makes the sidebar itself rounded to match the floating panel aesthetic.
  </action>
  <verify>
grep -A 3 "fixed left-3" /Users/ayazmohammed/DriveCommand/apps/web/src/components/Sidebar/index.tsx | head -10
  </verify>
  <done>Sidebar has rounded-2xl corners and is positioned with 12px (p-3) offset from edges</done>
</task>

</tasks>

<verification>
1. Build passes: `npm run build --workspace=apps/web`
2. Visual: Desktop layout shows dark shell background with floating sidebar and content panels
3. Visual: No sharp 90-degree corners anywhere in desktop layout
4. Functional: Topbar is inside the white content panel (not dark chrome)
5. Functional: Sidebar collapse/expand still works
6. Functional: Content scrolling works within the white panel
</verification>

<success_criteria>
- Desktop layout displays floating panel design with rounded corners
- Dark shell background visible around all edges (12px padding)
- Sidebar appears as rounded floating panel
- Content panel is white/card-colored containing topbar at top
- All existing functionality preserved (sidebar toggle, scroll, navigation)
</success_criteria>

<output>
After completion, create `.planning/quick/359-restructure-app-shell-into-floating-roun/359-SUMMARY.md`
</output>
