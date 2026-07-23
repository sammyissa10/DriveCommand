---
phase: quick-496
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/onboarding/tour/OnboardingTour.tsx
  - apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts
  - apps/web/src/components/data-grid/core/useGridPreferences.ts
autonomous: true

must_haves:
  truths:
    - "Advancing/finishing the onboarding tour no longer emits the React 'Cannot update a component (Router) while rendering a different component' console error"
    - "GET /api/user/grid-preferences/[gridId] for an authenticated user with no saved prefs returns 200 (no red 404 in the Network tab)"
    - "After an authenticated user customizes a grid, the change persists to the DB via PUT; a subsequent GET returns 200 with the saved prefs"
    - "Unauthenticated users still fall back to localStorage (401 path unchanged)"
    - "tsc --noEmit stays at 0 errors"
  artifacts:
    - path: "apps/web/src/components/onboarding/tour/OnboardingTour.tsx"
      provides: "next() with branch decision moved out of the setIndex updater"
      contains: "if (index + 1 >= steps.length)"
    - path: "apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts"
      provides: "GET returns 200 with a null-prefs signal for authenticated-no-prefs (not 404)"
    - path: "apps/web/src/components/data-grid/core/useGridPreferences.ts"
      provides: "fetchPreferencesFromApi returns a discriminated {authed, prefs} result; load() sets isAuthenticatedRef from authed"
  key_links:
    - from: "useGridPreferences.load()"
      to: "isAuthenticatedRef.current"
      via: "authed flag from fetchPreferencesFromApi (200 => true even when prefs are null)"
      pattern: "isAuthenticatedRef.current = "
    - from: "savePreferences debounce"
      to: "PUT /api/user/grid-preferences"
      via: "isAuthenticatedRef.current true routes save to DB (upsert creates row on first save)"
      pattern: "savePreferencesToApi"
---

<objective>
Fix two pre-existing carrier bugs surfaced during quick-495 browser verification.

1. Onboarding tour fires a React side-effect (server action + setState) from inside a `setIndex` state-updater, so it runs during the render phase and logs "Cannot update a component (`Router`) while rendering a different component (`OnboardingTourProvider`)".
2. Grid preferences: the GET route returns 404 for authenticated users with no saved prefs, which (a) shows an alarming red 404 for every grid on first load and (b) makes the hook treat the user as unauthenticated, so customizations save to localStorage instead of the DB and the DB row is never created — server-side grid-pref persistence never engages.

Root causes are pre-diagnosed (verified against current source). This plan applies the surgical fixes only.

Purpose: Clean console + working authenticated grid-pref persistence with no behavior change for anonymous users.
Output: 3 files modified across 2 atomic commits.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/components/onboarding/tour/OnboardingTour.tsx
@apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts
@apps/web/src/components/data-grid/core/useGridPreferences.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix onboarding-tour setState-during-render warning</name>
  <files>apps/web/src/components/onboarding/tour/OnboardingTour.tsx</files>
  <action>
In `OnboardingTourProvider`, refactor `next` (currently lines ~104-112) so the branch decision happens in the event-handler body using the `index` state value from the closure (already available: `const step = steps[index]`), NOT inside the `setIndex` updater.

Replace:
```
const next = useCallback(() => {
  setIndex((i) => {
    if (i + 1 >= steps.length) {
      finish();
      return i;
    }
    return i + 1;
  });
}, [steps.length, finish]);
```
With:
```
const next = useCallback(() => {
  if (index + 1 >= steps.length) {
    finish();
  } else {
    setIndex((i) => i + 1);
  }
}, [index, steps.length, finish]);
```

Add `index` to the dependency array (shown above). This ensures `finish()` — which calls the `markTourSeen` server action (Router update) and `setActive(false)` — runs only in an event handler, never during render.

Do NOT change `prev`, `finish`, `begin`, the `step` derivation, the overlay, or anything else in the file. `finish()` remains called from `onSkip` (line ~129) and now from the last-step branch above — both are event handlers, which is correct.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — must report 0 errors (unchanged from clean quick-495 baseline; ignore the ~35 known pre-existing @types errors per project baseline, only flag NEW errors or errors in this file). Confirm by reading the diff that the branch check uses `index + 1 >= steps.length` in the handler body and `index` is in the deps array. Note for the orchestrator/user: browser-verify that advancing to the last step and finishing the tour on a mobile viewport no longer logs "Cannot update a component (`Router`) while rendering".
  </verify>
  <done>`next()` decides finish-vs-advance in the handler body; `setIndex` only ever returns `i + 1`; `index` is in the dependency array; tsc clean. No other logic touched.</done>
</task>

<task type="auto">
  <name>Task 2: Grid-preferences — 200 for authed-no-prefs + DB persistence</name>
  <files>apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts, apps/web/src/components/data-grid/core/useGridPreferences.ts</files>
  <action>
Two coordinated edits. The route must let the hook distinguish three cases: has-prefs / authenticated-no-prefs / unauthenticated.

ROUTE (`route.ts`) — GET handler only:
- Keep the 401 for `!session` (unauthenticated) exactly as-is.
- Change the no-preference branch (currently lines ~57-59) from a 404 to a 200 that signals "authenticated, no saved prefs". Return:
  ```
  if (!preference) {
    return NextResponse.json({ preferences: null }, { status: 200 });
  }
  ```
- Leave the has-prefs 200 response (lines ~61-69) and the entire PUT handler unchanged.
- Update the JSDoc at the top (line ~5-6): the GET no-longer-404s comment should read that it returns 200 with `{ preferences: null }` when authenticated with no saved prefs, 401 when unauthenticated.

HOOK (`useGridPreferences.ts`) — refactor `fetchPreferencesFromApi` (lines ~94-121) to return a discriminated result instead of `GridPreferences | null`:
- New return type: `{ authed: true; prefs: GridPreferences | null } | { authed: false }`.
- HTTP 200: `authed: true`. Parse the body. The has-prefs response is a flat object with `columnOrder`/`columnWidths`/etc.; the authed-no-prefs response is `{ preferences: null }`. Detect "no prefs" by checking whether the body has the expected pref fields (e.g. `data.preferences === null`, or absence of `columnOrder` AND the other pref keys). When prefs are present, build the `GridPreferences` object exactly as today (each field `?? DEFAULT_GRID_PREFERENCES.x`) and return `{ authed: true, prefs }`. When no prefs, return `{ authed: true, prefs: null }`.
- HTTP 401: return `{ authed: false }`.
- Any other non-ok status: return `{ authed: false }` (safe fallback to localStorage).
- Network error in the catch: return `{ authed: false }`.

Then update `load()` (lines ~161-182) to consume the discriminated result:
```
async function load() {
  const result = await fetchPreferencesFromApi(gridId);
  if (!isMounted) return;

  if (result.authed) {
    isAuthenticatedRef.current = true;
    if (result.prefs) {
      setPreferences(result.prefs);
    }
    // else: leave DEFAULT_GRID_PREFERENCES; future saves go to DB (PUT upserts the row)
    setLocalIsLoading(false);
    return;
  }

  // Unauthenticated — fall back to localStorage (existing behavior)
  isAuthenticatedRef.current = false;
  const localPrefs = loadFromLocalStorage(gridId);
  if (localPrefs && isMounted) {
    setPreferences(localPrefs);
  }
  if (isMounted) {
    setLocalIsLoading(false);
  }
}
```

Preserve the `isMounted` guard, the `enabled` short-circuit (lines ~154-157), and all `setLocalIsLoading` calls exactly. Do NOT change `savePreferences`, the debounce, `savePreferencesToApi`, the setters, `handleResetPreferences`, or the zustand store factory. `savePreferences` already routes to the DB when `isAuthenticatedRef.current` is truthy, which now becomes true for authenticated users — no change needed there.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — 0 new errors; confirm the discriminated union types check (the `result.authed`/`result.prefs` access must be type-safe). Read the diffs to confirm: (1) GET returns 200 `{ preferences: null }` instead of 404 for authed-no-prefs and still 401 for no session; (2) `fetchPreferencesFromApi` returns the discriminated shape and `load()` sets `isAuthenticatedRef.current = true` on the 200 path even when prefs are null. Note for orchestrator/user browser-verify: first load of a grid with no saved prefs shows a 200 (no red 404); after customizing a grid an authenticated user issues a PUT, and a subsequent GET returns 200 with the saved prefs; anonymous users still use localStorage.
  </verify>
  <done>GET returns 200 for authenticated-no-prefs (401 for unauthenticated); `fetchPreferencesFromApi` returns a discriminated `{authed, prefs}` union; `load()` marks the user authenticated on any 200 so saves persist to the DB; anonymous localStorage fallback preserved; tsc clean.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` reports 0 errors beyond the documented ~35 pre-existing @types baseline; no new errors and none in the three touched files.
- Each task committed atomically (Task 1 = onboarding tour; Task 2 = route + hook together).
- Executor does NOT push and does NOT deploy — the orchestrator handles the single final push.
</verification>

<success_criteria>
- OnboardingTour `next()` no longer performs side effects inside the `setIndex` updater; `index` is in its deps.
- Grid-preferences GET returns 200 (with a null-prefs signal) for authenticated users lacking saved prefs, and 401 for unauthenticated.
- `useGridPreferences` distinguishes authed-no-prefs from unauthenticated, so authenticated customizations persist to the DB (PUT upsert creates the row) while anonymous users keep localStorage.
- tsc clean; two atomic commits; no push, no deploy.
</success_criteria>

<output>
After completion, create `.planning/quick/496-fix-two-pre-existing-carrier-issues-from/496-SUMMARY.md`
</output>
