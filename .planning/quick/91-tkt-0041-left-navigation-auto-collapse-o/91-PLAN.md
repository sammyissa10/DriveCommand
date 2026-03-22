---
phase: quick-91
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/navigation/sidebar.tsx
autonomous: true
must_haves:
  truths:
    - "On mobile, tapping a sidebar nav item closes the sidebar and navigates to the page"
    - "On desktop, sidebar behavior is unchanged (no auto-close)"
  artifacts:
    - path: "src/components/navigation/sidebar.tsx"
      provides: "Mobile auto-close on nav click"
      contains: "setOpenMobile"
  key_links:
    - from: "src/components/navigation/sidebar.tsx"
      to: "useSidebar context"
      via: "useSidebar hook from sidebar UI"
      pattern: "setOpenMobile\\(false\\)"
---

<objective>
TKT-0041: Auto-close sidebar on mobile when a navigation item is clicked.

Purpose: On mobile, the sidebar renders as a Sheet overlay. Currently users must manually dismiss it after selecting a nav item, which is poor UX. Clicking any nav link should close the sidebar automatically.

Output: Updated sidebar.tsx that closes the mobile sheet on nav item click.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/navigation/sidebar.tsx
@src/components/ui/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Auto-close mobile sidebar on nav link click</name>
  <files>src/components/navigation/sidebar.tsx</files>
  <action>
    1. Import `useSidebar` from `@/components/ui/sidebar` (add to existing import).

    2. Inside the `AppSidebar` component, destructure `setOpenMobile` from `useSidebar()`:
       ```
       const { setOpenMobile } = useSidebar()
       ```

    3. Create a handler function:
       ```
       const handleNavClick = () => {
         setOpenMobile(false)
       }
       ```

    4. Add `onClick={handleNavClick}` to every `<Link>` element inside `SidebarMenuButton` components. This includes all nav links: Dashboard, Add Truck, Live Map, Safety, Fuel, Lane Profitability, Profit Predictor, Compliance, IFTA Reports, Loads, CRM, Invoices, Payroll, AI Documents, Trucks, Drivers, Routes, Tags, Team Permissions, Subscription, Expense Categories, Expense Templates, Integrations, My Tickets.

    Also add it to the header logo `<Link href="/dashboard">`.

    NOTE: `setOpenMobile(false)` is a no-op when on desktop (the mobile sheet is not rendered), so this is safe to call unconditionally — no need for an `isMobile` check.

    Do NOT change any other behavior — no changes to styling, routing, or sidebar structure.
  </action>
  <verify>
    - `npm run build` succeeds with no type errors
    - Visually verify: every `<Link>` inside the sidebar has an `onClick` handler
    - grep for `onClick={handleNavClick}` should match 20+ occurrences in sidebar.tsx
  </verify>
  <done>Every sidebar nav link calls setOpenMobile(false) on click. On mobile, tapping a nav item closes the sidebar sheet. On desktop, behavior is unchanged.</done>
</task>

</tasks>

<verification>
- Build passes: `npm run build`
- All Link elements in sidebar have onClick handler
- setOpenMobile is called from useSidebar context
</verification>

<success_criteria>
- Mobile: tapping any sidebar nav item closes the sidebar overlay and navigates
- Desktop: no change in sidebar behavior (sidebar remains expanded/collapsed as before)
- No regressions in navigation or sidebar rendering
</success_criteria>

<output>
After completion, create `.planning/quick/91-tkt-0041-left-navigation-auto-collapse-o/91-SUMMARY.md`
</output>
