---
phase: quick-124
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/context/SupportTicketContext.tsx
  - apps/mobile/components/shared/SupportTicketFAB.tsx
  - apps/mobile/app/(owner)/_layout.tsx
  - apps/mobile/app/(owner)/index.tsx
autonomous: true
must_haves:
  truths:
    - "Support ticket form opens from the dashboard speed dial 'Get Support' item"
    - "Support ticket form still opens from the FAB on all non-dashboard owner screens"
    - "FAB is hidden on the dashboard screen (speed dial replaces it)"
    - "FAB is positioned on the right side (right: 20), not left"
    - "Speed dial shows a visual separator line above the Get Support item"
    - "All existing support ticket functionality preserved: screenshot prompt, S3 upload, form validation, toast feedback"
  artifacts:
    - path: "apps/mobile/context/SupportTicketContext.tsx"
      provides: "SupportTicketProvider + useSupportTicket hook"
      exports: ["SupportTicketProvider", "useSupportTicket"]
    - path: "apps/mobile/components/shared/SupportTicketFAB.tsx"
      provides: "Slim FAB button that calls context.open(), hidden on dashboard"
    - path: "apps/mobile/app/(owner)/_layout.tsx"
      provides: "Wraps children in SupportTicketProvider"
    - path: "apps/mobile/app/(owner)/index.tsx"
      provides: "Get Support item in speed dial with separator"
  key_links:
    - from: "apps/mobile/app/(owner)/index.tsx"
      to: "apps/mobile/context/SupportTicketContext.tsx"
      via: "useSupportTicket().open()"
      pattern: "useSupportTicket.*open"
    - from: "apps/mobile/components/shared/SupportTicketFAB.tsx"
      to: "apps/mobile/context/SupportTicketContext.tsx"
      via: "useSupportTicket().open()"
      pattern: "useSupportTicket.*open"
    - from: "apps/mobile/app/(owner)/_layout.tsx"
      to: "apps/mobile/context/SupportTicketContext.tsx"
      via: "SupportTicketProvider wrapping layout"
      pattern: "SupportTicketProvider"
---

<objective>
Extract support ticket form into a shared context provider so both the FAB button and the dashboard speed dial can open it. Add a "Get Support" item to the dashboard Quick Create speed dial with a separator line. Hide the FAB on the dashboard (since the speed dial replaces it). Revert FAB positioning to right side.

Purpose: Consolidate support ticket access into the dashboard's primary action menu while keeping the FAB available on all other screens.
Output: SupportTicketContext provider, updated FAB, updated layout, updated dashboard speed dial.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/components/shared/SupportTicketFAB.tsx
@apps/mobile/app/(owner)/_layout.tsx
@apps/mobile/app/(owner)/index.tsx
@apps/mobile/context/AuthContext.tsx
@apps/mobile/components/ui/BottomSheet.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SupportTicketContext and slim down FAB</name>
  <files>
    apps/mobile/context/SupportTicketContext.tsx
    apps/mobile/components/shared/SupportTicketFAB.tsx
    apps/mobile/app/(owner)/_layout.tsx
  </files>
  <action>
Create `apps/mobile/context/SupportTicketContext.tsx`:
- Create a React context with `open()` function exposed via `useSupportTicket()` hook
- Move ALL form state, mutation logic, S3 upload helper, types (Category, Priority, FormState, CATEGORIES, PRIORITIES, DEFAULT_FORM), ROUTE_MAP, getPageLabel, getBaseUrl, uploadScreenshot from SupportTicketFAB into this file
- The provider renders the BottomSheet + entire form JSX (everything inside the `<>...</>` fragment of current SupportTicketFAB EXCEPT the FAB Pressable button)
- `open()` should trigger the same screenshot Alert.alert flow currently in `handleFabPress` — prompt "Screenshot this screen?", capture on Yes, then set visible
- Export `SupportTicketProvider` (the provider component) and `useSupportTicket` (the hook)
- Keep all existing imports: useMutation, react-native-toast-message, expo-file-system, BottomSheet, createSupportTicket, useAuthContext, usePathname, react-native-view-shot (lazy require)

Update `apps/mobile/components/shared/SupportTicketFAB.tsx`:
- Strip out ALL form state, mutation, BottomSheet, S3 upload, types, ROUTE_MAP, getPageLabel — all moved to context
- Keep ONLY: the FAB Pressable button that calls `useSupportTicket().open()`
- Add auto-hide logic: use `usePathname()` and hide when pathname matches `/(owner)` or `/(owner)/index` (dashboard routes). Return `null` when on dashboard.
- REVERT positioning to right side: change `left: 20` to `right: 20` in the fab style
- Keep `bottom: 88`, keep the sky-blue background (#0ea5e9), keep LifeBuoy icon import and rendering
- Import `useSupportTicket` from `../../context/SupportTicketContext`

Update `apps/mobile/app/(owner)/_layout.tsx`:
- Import `SupportTicketProvider` from `../../context/SupportTicketContext`
- Wrap the Fragment's children in `<SupportTicketProvider>` — the provider goes INSIDE the Fragment, wrapping both Tabs and SupportTicketFAB
- Keep `<SupportTicketFAB />` rendered in the layout (it just renders the button now, hidden on dashboard)
  </action>
  <verify>
Run `cd apps/mobile && npx tsc --noEmit` — no type errors. Verify SupportTicketContext.tsx exports SupportTicketProvider and useSupportTicket. Verify SupportTicketFAB.tsx no longer contains BottomSheet, useMutation, or form state. Verify _layout.tsx wraps in SupportTicketProvider.
  </verify>
  <done>
SupportTicketContext owns all form/mutation/BottomSheet logic. SupportTicketFAB is a thin button that calls context.open(). FAB hidden on dashboard, positioned right:20. Layout wraps in provider.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Get Support to dashboard speed dial</name>
  <files>
    apps/mobile/app/(owner)/index.tsx
  </files>
  <action>
Update `apps/mobile/app/(owner)/index.tsx`:

1. Import `LifeBuoy` from `lucide-react-native` (add to existing import)
2. Import `useSupportTicket` from `../../context/SupportTicketContext`
3. Call `const { open: openSupport } = useSupportTicket()` inside OwnerDashboard component

4. In the speed-dial action items section (the Animated.View at bottom:88, right:20), AFTER mapping CREATE_ACTIONS, render a separator + Support item:
   - Before the Support item, render a `<View>` separator: 1px height, backgroundColor '#475569' (slate-600), width 160, alignSelf 'flex-end', marginVertical: 2
   - Then render a Support Pressable matching the existing action item pattern:
     - flexDirection: 'row', alignItems: 'center', gap: 10
     - Label pill: backgroundColor '#1e293b', borderRadius 8, paddingHorizontal 14, paddingVertical 8, borderWidth 1, borderColor '#334155'
     - Label text: "Get Support", color '#f1f5f9', fontWeight '600', fontSize 14
     - Icon circle: width 42, height 42, borderRadius 21, backgroundColor '#f59e0b22', borderWidth 1, borderColor '#f59e0b55'
     - LifeBuoy icon: color '#f59e0b', size 18
   - onPress: call `closeMenu()`, then `haptic.light()`, then `openSupport()` (no setTimeout needed since it's not navigating)

5. The Support item renders ABOVE the other items visually (it's the first item in the list since the speed dial renders bottom-up). Actually — the speed dial items render in array order from top to bottom in the Animated.View. The current CREATE_ACTIONS map renders New Load at top, Add Truck at bottom. The Support item should appear BELOW Add Truck (closest to the FAB button). So render the separator and Support item AFTER the CREATE_ACTIONS.map() block.
  </action>
  <verify>
Run `cd apps/mobile && npx tsc --noEmit` — no type errors. Visually inspect: open the speed dial on dashboard, confirm "Get Support" appears at bottom with amber icon, separator line above it, and tapping it opens the support ticket BottomSheet.
  </verify>
  <done>
Dashboard speed dial shows all 5 create actions, then a separator line, then "Get Support" with amber LifeBuoy icon. Tapping it opens the support ticket form via context. FAB is hidden on dashboard. FAB still visible and functional on all other owner screens, positioned on right side.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/mobile && npx tsc --noEmit` passes with no errors
2. On dashboard: FAB is NOT visible, speed dial shows "Get Support" with separator
3. On any other owner screen: FAB is visible on right side (right: 20, bottom: 88)
4. Tapping "Get Support" in speed dial opens support ticket BottomSheet with screenshot prompt
5. Tapping FAB on non-dashboard screens opens same support ticket BottomSheet with screenshot prompt
6. Submitting a ticket from either entry point works (screenshot upload, form validation, toast)
</verification>

<success_criteria>
- SupportTicketContext.tsx exists with provider + hook
- SupportTicketFAB.tsx is a thin button component (~30 lines)
- FAB hidden on dashboard, visible elsewhere, right-aligned
- Dashboard speed dial includes "Get Support" with amber styling and separator
- All support ticket functionality preserved end-to-end
</success_criteria>

<output>
After completion, create `.planning/quick/124-move-support-button-into-dashboard-quick/124-SUMMARY.md`
</output>
