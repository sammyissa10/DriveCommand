---
phase: quick-465
plan: 465
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/loads/LoadForm.tsx
autonomous: true

must_haves:
  truths:
    - "The dispatch toggle label reads 'Add to Trip immediately' instead of 'Dispatch immediately'"
    - "When dispatch fails with DRIVER_NOT_DISPATCH_READY, the user sees a friendly explanation about driver onboarding, not the raw error code"
    - "When dispatch fails for any other reason, the user sees a generic friendly fallback message"
    - "The load is still created and the user is redirected to /carrier/loads on dispatch failure"
  artifacts:
    - path: "apps/web/src/components/carrier/loads/LoadForm.tsx"
      provides: "Renamed label + branched dispatch-failure toast UX"
      contains: "Add to Trip immediately"
  key_links:
    - from: "dispatch-failure handler"
      to: "toast.error"
      via: "branch on dispatchJson.error === 'DRIVER_NOT_DISPATCH_READY'"
      pattern: "DRIVER_NOT_DISPATCH_READY"
---

<objective>
Rename the dispatch toggle label and improve the dispatch-failure error UX in the carrier LoadForm so users see human-readable guidance instead of raw error codes.

Purpose: The visible "Dispatch immediately" wording is being aligned to "Add to Trip immediately", and the current toast surfaces raw API error strings (including the code DRIVER_NOT_DISPATCH_READY) directly to users — which is confusing and unprofessional.
Output: Updated apps/web/src/components/carrier/loads/LoadForm.tsx (visible label text + dispatch-failure toast branch).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/components/carrier/loads/LoadForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename visible label to "Add to Trip immediately"</name>
  <files>apps/web/src/components/carrier/loads/LoadForm.tsx</files>
  <action>
    At line ~732, inside the `<label htmlFor="dispatch-toggle" ...>` element, change ONLY the visible text node from `Dispatch immediately` to `Add to Trip immediately`.

    Do NOT change:
    - `htmlFor="dispatch-toggle"` or the label's `className`
    - The `<Switch>` component (checked={dispatchImmediately}, onCheckedChange={setDispatchImmediately}, id="dispatch-toggle")
    - The `dispatchImmediately` state variable name or any handlers
    - The submit button label logic at line ~1073-1074 ('Create & Dispatch') — leave as-is; it is not the target text node

    The dev comments at line ~182 (`// Dispatch immediately state (create mode only)`) and line ~471 (`// Dispatch immediately path (create mode only)`) are internal — leave them unchanged. No functional change.
  </action>
  <verify>
    Grep the file for `Add to Trip immediately` (must appear once in the label). Grep for `Dispatch immediately` and confirm it only remains in the two internal dev comments (lines ~182, ~471), not in any JSX text node.
  </verify>
  <done>The dispatch toggle label renders "Add to Trip immediately"; Switch, htmlFor, className, state name, and handlers are unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Branch dispatch-failure toast on error code</name>
  <files>apps/web/src/components/carrier/loads/LoadForm.tsx</files>
  <action>
    At lines ~488-493, the current block is:
    ```ts
    if (!dispatchRes.ok) {
      const dispatchJson = await dispatchRes.json().catch(() => ({}));
      toast.error(dispatchJson.error ?? 'Load created but dispatch failed');
      router.push('/carrier/loads');
      return;
    }
    ```

    Replace ONLY the single `toast.error(...)` line with a branch on `dispatchJson.error`:
    - If `dispatchJson.error === 'DRIVER_NOT_DISPATCH_READY'`:
      `toast.error("The load was created, but the selected driver isn't dispatch-ready yet (onboarding steps incomplete). The trip wasn't started. You can assign this load to a trip later once the driver completes onboarding.", { duration: 6000 });`
    - Else:
      `toast.error('The load was created, but the trip could not be started. You can assign it to a trip later.');`

    Keep `const dispatchJson = await dispatchRes.json().catch(() => ({}));`, `router.push('/carrier/loads');`, and the early `return;` unchanged.

    Do NOT surface the raw `dispatchJson.error` code string to the user in either branch.
    Do NOT add any imports — `toast` from 'sonner' is already imported at line 5 (supports the `{ duration }` option).
    Use a typed-safe comparison; if TS complains about `dispatchJson` being `any`/`{}`, keep the comparison as `dispatchJson.error === 'DRIVER_NOT_DISPATCH_READY'` (the existing `?? ` usage already accesses `.error`, so no new type narrowing is required).
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` and confirm no NEW TypeScript errors introduced in LoadForm.tsx (baseline pre-existing errors are acceptable). Grep the file for `DRIVER_NOT_DISPATCH_READY` to confirm the branch exists. Confirm the raw `dispatchJson.error` is no longer passed directly into a toast message.
  </verify>
  <done>Dispatch failure with DRIVER_NOT_DISPATCH_READY shows the onboarding-specific 6000ms message; any other failure shows the generic fallback; load still created and user redirected to /carrier/loads; no raw error code shown; tsc clean (no new errors).</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` (in apps/web) introduces no new errors in LoadForm.tsx
- Visible label reads "Add to Trip immediately"
- DRIVER_NOT_DISPATCH_READY produces the onboarding-specific toast (6000ms); all other dispatch failures produce the generic fallback toast
- Raw error code string is never shown to the user
- router.push('/carrier/loads') and early return preserved
</verification>

<success_criteria>
- Single file changed: apps/web/src/components/carrier/loads/LoadForm.tsx
- No new dependencies, no gate-logic/API/workflow-engine changes
- All existing Tailwind classes preserved
- TypeScript strict mode stays clean (no new errors)
</success_criteria>

<output>
After completion, create `.planning/quick/465-fix-dispatch-immediately-label-rename-an/465-SUMMARY.md`
</output>
