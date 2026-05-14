---
phase: 314-fix-bug-42-bug-43-template-form-navigati
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/facilities/FacilityForm.tsx
  - apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
  - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
autonomous: true

must_haves:
  truths:
    - "Clicking Cancel inside the New Facility sheet (opened from template StopBuilder) closes only the sheet and leaves the template form state intact"
    - "Clicking Cancel on the standalone Create/Edit Facility page still navigates to /carrier/facilities (no regression)"
    - "Saving an existing template via edit page redirects the user to /carrier/templates"
    - "Saving a new template still redirects to /carrier/templates/{id} (no regression on create path... unified to /carrier/templates per fix spec)"
    - "tsc --noEmit passes cleanly"
  artifacts:
    - path: "apps/web/src/components/carrier/facilities/FacilityForm.tsx"
      provides: "FacilityForm with optional onCancel prop"
      contains: "onCancel"
    - path: "apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx"
      provides: "StopBuilderAddModal passing onCancel to embedded FacilityForm"
      contains: "onCancel={() => setShowFacilitySheet(false)}"
    - path: "apps/web/src/components/carrier/templates/RouteTemplateForm.tsx"
      provides: "Template form that redirects to /carrier/templates after save"
      contains: "router.push('/carrier/templates')"
  key_links:
    - from: "StopBuilderAddModal.tsx"
      to: "FacilityForm.tsx"
      via: "onCancel prop"
      pattern: "onCancel=\\{\\(\\) => setShowFacilitySheet\\(false\\)\\}"
    - from: "RouteTemplateForm.tsx handleSubmit success branch"
      to: "/carrier/templates list page"
      via: "router.push"
      pattern: "router\\.push\\(['\"]/carrier/templates['\"]\\)"
---

<objective>
Fix two template form navigation bugs:
- Bug 42: Opening the New Facility modal from inside the template StopBuilder destroys template form state when Cancel is clicked, because FacilityForm's Cancel hard-navigates to /carrier/facilities.
- Bug 43: After saving an existing template (edit mode), the user is stranded on the edit page because the success path only calls router.refresh() instead of navigating to the template list.

Purpose: Restore correct navigation flow for template creation/editing so users do not lose work or get stuck on edit pages.
Output: Surgical edits to three files (FacilityForm, StopBuilderAddModal, RouteTemplateForm) — no logic changes elsewhere, no schema changes, no rewrites.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Files being modified
@apps/web/src/components/carrier/facilities/FacilityForm.tsx
@apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
@apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Bug 42 — Make FacilityForm Cancel context-aware via onCancel prop</name>
  <files>
    apps/web/src/components/carrier/facilities/FacilityForm.tsx
    apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
  </files>
  <action>
    Two surgical edits.

    EDIT 1 — `apps/web/src/components/carrier/facilities/FacilityForm.tsx`:

    1. In the `FacilityFormProps` interface (around line 80), add a new optional prop:
       ```ts
       onCancel?: () => void;
       ```
       Place it immediately after the existing `onSuccess?` prop.

    2. Update the function signature destructure (around line 131) from:
       ```ts
       export function FacilityForm({ initialData, onSuccess }: FacilityFormProps) {
       ```
       to:
       ```ts
       export function FacilityForm({ initialData, onSuccess, onCancel }: FacilityFormProps) {
       ```

    3. Change the Cancel button `onClick` (around line 550) from:
       ```tsx
       onClick={() => router.push('/carrier/facilities')}
       ```
       to:
       ```tsx
       onClick={() => {
         if (onCancel) {
           onCancel();
         } else {
           router.push('/carrier/facilities');
         }
       }}
       ```

    EDIT 2 — `apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx`:

    Around lines 145–150, the `<FacilityForm>` is rendered with only `onSuccess`. Add an `onCancel` prop that closes the sheet:
    ```tsx
    <FacilityForm
      onSuccess={(created) => {
        setShowFacilitySheet(false);
        handleFacilitySelect(created);
      }}
      onCancel={() => setShowFacilitySheet(false)}
    />
    ```

    DO NOT change any other behavior in either file. Do not touch facility creation logic, schema validation, success handlers, or unrelated styling.

    Why this fix: FacilityForm is reused in two contexts (standalone /carrier/facilities/new page AND embedded in the StopBuilder sheet from the template form). The hard-coded `router.push('/carrier/facilities')` on Cancel destroys template form state when used inside the sheet. Adding an optional `onCancel` callback lets the parent override the navigation. Standalone usage (no onCancel passed) preserves the original behavior — zero regression risk.
  </action>
  <verify>
    1. `pnpm --filter @drivecommand/web exec tsc --noEmit` exits 0
    2. Grep confirms onCancel wired up:
       - `grep -n "onCancel" apps/web/src/components/carrier/facilities/FacilityForm.tsx` shows the prop in interface, destructure, and Cancel handler
       - `grep -n "onCancel={() => setShowFacilitySheet(false)}" apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx` returns one match
    3. Manual test (after deploy): On `/carrier/templates/new`, click "Add Stop" → "Create New Facility" → fill nothing → click Cancel. Sheet closes, template form fields (template name, stops added previously) are still populated.
    4. Regression check: Visit `/carrier/facilities/new` directly, click Cancel — still navigates to `/carrier/facilities` list.
  </verify>
  <done>
    - `FacilityFormProps` has optional `onCancel?: () => void`
    - Cancel button calls `onCancel()` if provided, otherwise falls back to `router.push('/carrier/facilities')`
    - StopBuilderAddModal passes `onCancel={() => setShowFacilitySheet(false)}` to embedded FacilityForm
    - tsc --noEmit clean
    - No other lines modified in either file
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix Bug 43 — Redirect to /carrier/templates after template save (create AND edit)</name>
  <files>apps/web/src/components/carrier/templates/RouteTemplateForm.tsx</files>
  <action>
    Single surgical edit to `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx`.

    In `handleSubmit` (around lines 316–321), replace the post-success navigation block:

    BEFORE:
    ```ts
    toast.success(isEdit ? 'Template updated' : 'Template created');
    if (!isEdit && result.templateId) {
      router.push(`/carrier/templates/${result.templateId}`);
    } else {
      router.refresh();
    }
    ```

    AFTER:
    ```ts
    toast.success(isEdit ? 'Template updated' : 'Template created');
    router.push('/carrier/templates');
    ```

    DO NOT modify:
    - The `await` save call or its result handling
    - The `!result.success` early-return error toast
    - The try/catch/finally structure
    - The `setIsSubmitting(false)` in finally
    - Any other field, validation, or form logic anywhere else in the file

    Why this fix: The existing edit-mode branch only calls `router.refresh()`, leaving the user stuck on the edit page. Per spec, both create and edit should land on `/carrier/templates`. `router.push` on App Router client components automatically re-fetches the destination — no separate `router.refresh()` needed.
  </action>
  <verify>
    1. `pnpm --filter @drivecommand/web exec tsc --noEmit` exits 0
    2. Grep confirms the change:
       - `grep -n "router.push('/carrier/templates')" apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` returns exactly one match in handleSubmit success path
       - `grep -n "router.refresh()" apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` does NOT return a match in handleSubmit (the line was removed)
       - `grep -n "router.push(\`/carrier/templates/\${result.templateId}\`)" apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` does NOT return a match (old create-only redirect removed)
    3. Manual test (after deploy):
       - Edit an existing template, change a field, click Save Changes → user lands on `/carrier/templates` with updated template visible in list, toast says "Template updated"
       - Create a new template, click Create → user lands on `/carrier/templates` with new template visible in list, toast says "Template created"
  </verify>
  <done>
    - Both create and edit success paths call `router.push('/carrier/templates')`
    - No `router.refresh()` left in handleSubmit
    - No `/carrier/templates/${result.templateId}` redirect left in handleSubmit
    - tsc --noEmit clean
    - File diff is minimal (only the 5-line success block replaced)
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && pnpm exec tsc --noEmit` exits 0 with no new errors
- All three modified files compile and lint clean
- Manual smoke test plan:
  1. Bug 42 regression: `/carrier/templates/new` → Add Stop → Create New Facility → Cancel → template form state preserved
  2. Bug 42 non-regression: `/carrier/facilities/new` → Cancel → navigates to `/carrier/facilities`
  3. Bug 43 fix: Edit existing template → Save → lands on `/carrier/templates`
  4. Bug 43 non-regression: Create new template → Create → lands on `/carrier/templates` with new entry visible
</verification>

<success_criteria>
- FacilityForm exposes optional `onCancel` callback and prefers it over hard navigation
- StopBuilderAddModal wires `onCancel` to close its own sheet without leaving the template page
- RouteTemplateForm redirects to `/carrier/templates` on both create and edit success
- TypeScript clean (`tsc --noEmit`)
- No unrelated edits, no schema changes, no rewrites
- Both bug fixes verifiable via grep + manual flow
</success_criteria>

<output>
After completion, create `.planning/quick/314-fix-bug-42-bug-43-template-form-navigati/314-SUMMARY.md`
</output>
