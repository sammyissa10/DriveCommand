---
phase: quick-145
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/navigation/sidebar.tsx
  - apps/web/src/components/navigation/owner-shell.tsx
autonomous: true
must_haves:
  truths:
    - "Sign-out button is NOT in the bottom-left sidebar footer on the owner portal"
    - "Sign-out button IS in the top-right header area on the owner portal"
    - "Driver and admin portals are unaffected (they already have UserMenu in header)"
  artifacts:
    - path: "apps/web/src/components/navigation/owner-shell.tsx"
      provides: "Header with UserMenu sign-out in top-right"
      contains: "UserMenu"
    - path: "apps/web/src/components/navigation/sidebar.tsx"
      provides: "Sidebar without UserMenu in footer"
  key_links:
    - from: "apps/web/src/components/navigation/owner-shell.tsx"
      to: "apps/web/src/components/navigation/user-menu.tsx"
      via: "import and render in header"
      pattern: "UserMenu"
---

<objective>
Move the sign-out button from the bottom-left sidebar footer to the top-right header in the owner portal.

Purpose: The driver and admin portals already have UserMenu (with sign-out) in their headers. The owner portal is the only one that has it buried in the sidebar footer. This makes the UX consistent across all portals.

Output: Owner portal header shows user menu with sign-out on the right side; sidebar footer no longer contains a user menu.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/components/navigation/sidebar.tsx
@apps/web/src/components/navigation/user-menu.tsx
@apps/web/src/app/(driver)/layout.tsx (reference - driver portal already has UserMenu in header)
@apps/web/src/app/(admin)/layout.tsx (reference - admin portal already has UserMenu in header)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove UserMenu from sidebar footer</name>
  <files>apps/web/src/components/navigation/sidebar.tsx</files>
  <action>
In `apps/web/src/components/navigation/sidebar.tsx`:

1. Remove the entire `SidebarFooter` section (lines 474-481) that wraps the `UserMenu` component.
2. Remove the `UserMenu` import from `@/components/navigation/user-menu` (line 42).
3. Keep all other sidebar content exactly as-is.

The sidebar should end after the closing `</SidebarContent>` tag, with just the closing `</Sidebar>` tag after it (no footer).
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no type errors. Grep the file for "UserMenu" to confirm it is fully removed.</verify>
  <done>sidebar.tsx has no UserMenu import and no SidebarFooter section.</done>
</task>

<task type="auto">
  <name>Task 2: Add UserMenu to owner portal header</name>
  <files>apps/web/src/components/navigation/owner-shell.tsx</files>
  <action>
In `apps/web/src/components/navigation/owner-shell.tsx`:

1. Add import: `import { UserMenu } from "@/components/navigation/user-menu"`
2. In the `<header>` element, add a right-aligned section after the tenant name. The header currently has `SidebarTrigger`, a `Separator`, and an optional tenant name. Add a flex spacer and the `UserMenu` to push it to the right:

Change the header to:
```tsx
<header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur-sm px-6">
  <SidebarTrigger className="-ml-1" />
  <Separator orientation="vertical" className="mr-2 h-4" />
  {tenantName && (
    <span className="text-sm font-semibold text-foreground truncate">{tenantName}</span>
  )}
  <div className="ml-auto">
    <UserMenu />
  </div>
</header>
```

This uses `ml-auto` to push the UserMenu to the far right of the header, consistent with how the driver portal (`<UserMenu compactOnMobile />`) and admin portal (`<UserMenu />`) position it.

Note: Do NOT use `compactOnMobile` here since the owner portal has a sidebar that collapses on mobile (different from the driver portal's simpler header).
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no type errors. Visually confirm the header renders the user avatar/menu on the right side.</verify>
  <done>Owner portal header shows UserMenu on the far right. Sign-out is accessible from the header dropdown, not the sidebar.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with no errors
2. Owner portal: sign-out button appears in top-right header area
3. Owner portal: sidebar footer no longer shows user info or sign-out
4. Driver portal: unchanged (UserMenu already in header)
5. Admin portal: unchanged (UserMenu already in header)
</verification>

<success_criteria>
- All three portals (owner, driver, admin) now have the sign-out button in the top-right header
- No portal has a sign-out button in the sidebar footer
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/145-move-sign-out-button-from-bottom-left-si/145-SUMMARY.md`
</output>
