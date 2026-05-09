---
phase: quick-139
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/hooks/useAuth.ts
  - apps/mobile/app/(driver)/_layout.tsx
autonomous: true
must_haves:
  truths:
    - "Stale/expired refresh token does not crash the app — user is gracefully redirected to login"
    - "SupportTicketFAB works on all driver screens without a context crash"
  artifacts:
    - path: "apps/mobile/hooks/useAuth.ts"
      provides: "Graceful handling of invalid refresh token errors"
      contains: "catch"
    - path: "apps/mobile/app/(driver)/_layout.tsx"
      provides: "SupportTicketProvider wrapping SupportTicketFAB"
      contains: "SupportTicketProvider"
  key_links:
    - from: "apps/mobile/hooks/useAuth.ts"
      to: "supabase.auth.getSession"
      via: "try/catch with signOut fallback"
      pattern: "catch.*signOut"
    - from: "apps/mobile/app/(driver)/_layout.tsx"
      to: "SupportTicketContext"
      via: "SupportTicketProvider wrapper"
      pattern: "SupportTicketProvider"
---

<objective>
Fix two mobile app crashes: (1) AuthApiError from stale refresh tokens causing unhandled rejection on app launch, and (2) SupportTicketFAB crashing in the driver layout because it lacks the required SupportTicketProvider context wrapper.

Purpose: Make the mobile app resilient to stale auth sessions and fix the driver portal context crash.
Output: Two patched files that resolve both errors.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/hooks/useAuth.ts
@apps/mobile/lib/supabase.ts
@apps/mobile/lib/auth.ts
@apps/mobile/app/(driver)/_layout.tsx
@apps/mobile/app/(owner)/_layout.tsx
@apps/mobile/components/shared/SupportTicketFAB.tsx
@apps/mobile/context/SupportTicketContext.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Handle invalid refresh token gracefully in useAuth</name>
  <files>apps/mobile/hooks/useAuth.ts</files>
  <action>
In `useAuth.ts`, the `supabase.auth.getSession()` call on line 32 can throw an `AuthApiError` with message "Invalid Refresh Token: Refresh Token Not Found" when a stale session is persisted in SecureStore. This unhandled rejection crashes the app.

Fix the `useEffect` that loads the persisted session (lines 31-38):

1. Wrap the `supabase.auth.getSession()` call in a try/catch block.
2. In the catch handler:
   - Log the error with `console.warn('Session recovery failed, clearing stale session:', error)` for debugging.
   - Call `supabase.auth.signOut()` to clear the corrupted session from SecureStore. This is a best-effort cleanup — wrap in its own try/catch so a signOut failure doesn't cascade.
   - Set `user` to `null` and `token` to `null` (they default to null so this is a no-op, but be explicit).
   - Still call `setIsLoading(false)` in a `finally` block so the app proceeds to the login screen instead of hanging on a loading spinner.

3. Also add error handling to the `onAuthStateChange` callback. The `TOKEN_REFRESHED` event handler itself doesn't throw, but add a guard: if `event === 'TOKEN_REFRESHED'` and `session` is null (edge case), treat it as a sign-out — set user/token to null.

The resulting flow: stale token -> getSession fails -> catch clears session -> isLoading=false -> app renders login screen (because user is null).
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/mobile to confirm no type errors. Review that the catch block properly calls signOut and sets isLoading to false.
  </verify>
  <done>Invalid refresh token error is caught, stale session is cleared, and the user sees the login screen instead of a crash.</done>
</task>

<task type="auto">
  <name>Task 2: Wrap driver layout SupportTicketFAB in SupportTicketProvider</name>
  <files>apps/mobile/app/(driver)/_layout.tsx</files>
  <action>
The driver layout (`apps/mobile/app/(driver)/_layout.tsx`) renders `SupportTicketFAB` on line 229 but does NOT wrap it in `SupportTicketProvider`. The owner layout already does this correctly (see `apps/mobile/app/(owner)/_layout.tsx` lines 15 and 82). The FAB calls `useSupportTicket()` which throws "must be used within SupportTicketProvider" when the provider is missing.

Fix:

1. Add import: `import { SupportTicketProvider } from '../../context/SupportTicketContext'`
2. Wrap the `SupportTicketFAB` component (and ideally the Tabs + FAB together, matching the owner layout pattern) inside `<SupportTicketProvider>...</SupportTicketProvider>`.

Follow the exact same pattern as the owner layout: `SupportTicketProvider` wraps the `Tabs` and `SupportTicketFAB` together (but NOT `AppHeader` or `SyncStatusBar` — those are above and don't need the support ticket context).

The structure should be:
```
<Fragment>
  <AppHeader />
  <SyncStatusBar ... />
  <SupportTicketProvider>
    <Tabs>...</Tabs>
    <NotificationPermissionModal ... />
    <SupportTicketFAB />
  </SupportTicketProvider>
</Fragment>
```

Note: `NotificationPermissionModal` can be inside or outside the provider — it does not use the support ticket context. Placing it inside keeps the structure clean.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/mobile to confirm no type errors. Grep for `SupportTicketProvider` in the driver layout to confirm it is present.
  </verify>
  <done>SupportTicketFAB renders without crashing in the driver portal because SupportTicketProvider is present in the component tree.</done>
</task>

</tasks>

<verification>
1. `cd apps/mobile && npx tsc --noEmit` — no TypeScript errors
2. `grep -n "SupportTicketProvider" apps/mobile/app/\(driver\)/_layout.tsx` — provider is imported and used
3. `grep -n "catch" apps/mobile/hooks/useAuth.ts` — error handling is present around getSession
</verification>

<success_criteria>
- App launches without crash when a stale/expired refresh token is stored — user sees login screen
- SupportTicketFAB renders and functions correctly on both driver and owner screens
- No TypeScript errors in the mobile app
</success_criteria>

<output>
After completion, create `.planning/quick/139-fix-mobile-auth-refresh-token-error-and-/139-SUMMARY.md`
</output>
