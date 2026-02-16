---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/webhooks/clerk/route.ts
  - src/components/routes/route-form.tsx
  - src/components/drivers/driver-invite-form.tsx
  - src/app/(owner)/actions/routes.ts
  - e2e/management-flows.spec.ts
autonomous: true
must_haves:
  truths:
    - "Driver invitation webhook creates User record and marks invitation ACCEPTED when invited driver signs up"
    - "Route creation form displays server-side validation errors and general error messages to user"
    - "Driver invite form shows success message and resets fields after successful submission"
    - "All management pages load without errors and forms submit correctly"
  artifacts:
    - path: "src/app/api/webhooks/clerk/route.ts"
      provides: "RLS-bypassed DriverInvitation queries in webhook handler"
      contains: "bypass_rls"
    - path: "src/components/routes/route-form.tsx"
      provides: "Proper general error display for route form"
      contains: "typeof state.error === 'string'"
    - path: "src/components/drivers/driver-invite-form.tsx"
      provides: "Form reset on successful invitation"
      contains: "key="
    - path: "e2e/management-flows.spec.ts"
      provides: "Playwright e2e tests for drivers, routes management pages"
  key_links:
    - from: "src/app/api/webhooks/clerk/route.ts"
      to: "prisma.driverInvitation"
      via: "RLS-bypassed transaction"
      pattern: "bypass_rls.*driverInvitation"
    - from: "src/components/routes/route-form.tsx"
      to: "src/app/(owner)/actions/routes.ts"
      via: "useActionState error display"
      pattern: "typeof.*error.*string"
---

<objective>
Fix three confirmed bugs in management pages: (1) webhook RLS bypass missing for driver invitation processing, (2) route form swallowing general server errors, (3) driver invite form not resetting after success. Add Playwright e2e tests for all management flows.

Purpose: User reported all three management flows (drivers, routes, users) have issues. Root cause analysis found specific bugs that need targeted fixes.
Output: Fixed webhook, forms, and new e2e test file.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/api/webhooks/clerk/route.ts
@src/app/(owner)/actions/drivers.ts
@src/app/(owner)/actions/routes.ts
@src/components/drivers/driver-invite-form.tsx
@src/components/routes/route-form.tsx
@src/lib/db/prisma.ts
@prisma/schema.prisma
@e2e/tags.spec.ts
@playwright.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix webhook RLS bypass and form error handling bugs</name>
  <files>
    src/app/api/webhooks/clerk/route.ts
    src/components/routes/route-form.tsx
    src/components/drivers/driver-invite-form.tsx
    src/app/(owner)/actions/routes.ts
  </files>
  <action>
**Bug 1 - CRITICAL: Webhook DriverInvitation queries blocked by RLS (lines 125-179 of webhook)**

The `DriverInvitation` table has `FORCE ROW LEVEL SECURITY`. The webhook handler uses the global `prisma` client without any RLS bypass when querying/updating DriverInvitation records. This means:
- `prisma.driverInvitation.findFirst()` at line 125 returns null (RLS blocks all rows)
- The webhook returns 400 "Driver accounts require an invitation"
- The driver User record is never created, invitation is never marked ACCEPTED

Fix: Wrap ALL DriverInvitation queries in the driver invitation flow (lines 119-204) in `$transaction` blocks with `set_config('app.bypass_rls', 'on', TRUE)`, matching the pattern already used for User queries in the same file (lines 85-91, 155-169).

Specifically:
1. The `findFirst` for pending invitation (line 125-129) must use a transaction with RLS bypass
2. The expiry check `update` to set EXPIRED status (line 144-147) must use a transaction with RLS bypass
3. The `update` to mark invitation ACCEPTED (line 172-179) must use a transaction with RLS bypass

Example pattern (already used in the same file):
```typescript
const invitation = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  return tx.driverInvitation.findFirst({
    where: { email, tenantId: inviteTenantId, status: 'PENDING' },
  });
});
```

Apply the same pattern to all three DriverInvitation operations in the driver invitation flow.

**Bug 2: Route form swallows general server errors**

In `src/components/routes/route-form.tsx` line 173, general errors are checked with `state?.error?.message` but server actions return errors as flat strings: `{ error: 'Failed to create route. Please try again.' }`. The `.message` property doesn't exist on a string, so the error is never displayed.

Fix: Add a check for `typeof state?.error === 'string'` to display flat string errors, matching the pattern already used in `driver-invite-form.tsx` (lines 32-36). Add this BEFORE the existing `state?.error?.message` check:

```tsx
{/* General Error - flat string from server action catch */}
{state?.error && typeof state.error === 'string' && (
  <div className="rounded-lg bg-red-50 border border-red-200 p-4">
    <p className="text-sm text-red-800">{state.error}</p>
  </div>
)}
```

Remove the existing `state?.error?.message` check (line 173-177) since it's dead code -- no server action returns that shape.

Also in `src/app/(owner)/actions/routes.ts`, the `createRoute` action's catch block (around where errors would be caught) should return a consistent error shape. Currently the `redirect()` call at line 116 throws NEXT_REDIRECT which Next.js handles internally -- this is correct behavior. No change needed to the redirect. But verify the catch block isn't accidentally catching the redirect error. The try/catch in `createRoute` wraps the entire prisma operation + redirect, but Next.js redirect throws a special error that should propagate. Add a re-throw for NEXT_REDIRECT errors if not already handled:

In `createRoute`, after the try block around the prisma operations, do NOT wrap the `redirect()` call in the try/catch. Move the `redirect()` call OUTSIDE the try/catch block to avoid the redirect being caught. Similarly for `updateRoute`.

Pattern:
```typescript
// Store the created route id
let createdRouteId: string;
try {
  const route = await prisma.route.create({ ... });
  createdRouteId = route.id;
} catch (error) {
  console.error('Failed to create route:', error);
  return { error: 'Failed to create route. Please try again.' };
}
revalidatePath('/routes');
redirect(`/routes/${createdRouteId}`);
```

Apply the same pattern to `updateRoute` -- move `redirect()` outside the implicit try scope.

**Bug 3: Driver invite form doesn't reset after success**

In `src/components/drivers/driver-invite-form.tsx`, after a successful invitation the success message shows but form fields retain their values (they use `defaultValue` which doesn't reset on re-render with same key).

Fix: Add a `key` prop to the `<form>` element that changes when submission succeeds, forcing React to remount the form and clear all uncontrolled inputs:

```tsx
// Inside DriverForm component, add a counter that increments on success
const formKey = state?.success ? Date.now() : 'form';

return (
  <form key={formKey} action={formAction} className="max-w-2xl space-y-5">
```

This works because when `state.success` becomes true, `formKey` changes, React unmounts the old form and mounts a new one with empty `defaultValue` fields.
  </action>
  <verify>
1. `npx tsc --noEmit` passes with no type errors in modified files
2. `npm run build` completes successfully (Next.js build catches server action issues)
3. Manual review: grep for `prisma.driverInvitation` in webhook -- all calls should be inside `$transaction` blocks with `bypass_rls`
4. Manual review: route-form.tsx should have `typeof state.error === 'string'` check
5. Manual review: driver-invite-form.tsx should have dynamic `key` on form element
  </verify>
  <done>
- Webhook handler wraps ALL DriverInvitation queries in RLS-bypassed transactions
- Route form displays both field-level and general string errors from server actions
- Driver invite form resets fields after successful submission
- Route server actions don't accidentally catch NEXT_REDIRECT errors
- Build passes with no type errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Playwright e2e tests for management page flows</name>
  <files>
    e2e/management-flows.spec.ts
  </files>
  <action>
Create a new Playwright e2e test file at `e2e/management-flows.spec.ts` following the same pattern as `e2e/tags.spec.ts` (auth-aware tests that skip if authentication is required).

The tests should cover:

**Driver Management Tests:**
1. `should load drivers page with title` - Navigate to `/drivers`, verify heading "Drivers" is visible
2. `should display drivers list or empty state` - Check for either the driver table or "No drivers yet" empty state
3. `should navigate to invite driver page` - Click "Invite Driver" button, verify navigation to `/drivers/invite` and form fields visible (email, firstName, lastName, licenseNumber, submit button)
4. `should show validation errors on empty invite form submit` - Submit the invite form empty, verify HTML5 validation prevents submission (check for `:invalid` pseudo-class on required inputs)
5. `should navigate to driver detail page` - If drivers exist in list, click "View" link, verify driver detail page loads with "Driver Information" heading

**Route Management Tests:**
1. `should load routes page with title` - Navigate to `/routes`, verify heading "Routes" is visible
2. `should display routes list or empty state` - Check for either the route table or "No routes found" empty state
3. `should navigate to create route page` - Click "Create Route" button, verify navigation to `/routes/new` and form fields visible (origin, destination, scheduledDate, driverId, truckId, submit button)
4. `should show driver/truck dropdowns on route form` - Verify the driverId and truckId select elements exist and have either options or "No drivers available" message
5. `should have status filter on routes list` - Verify the status filter select exists with options for "All Statuses", "Planned", "In Progress", "Completed"

**General Pattern for each test (matching tags.spec.ts):**
```typescript
test('test name', async ({ page }) => {
  await page.goto('/path');
  await page.waitForLoadState('networkidle');

  // Skip if auth redirect
  const url = page.url();
  if (url.includes('sign-in') || url.includes('auth')) {
    test.skip(true, 'Authentication required - skipping test');
  }

  // Assertions...
});
```

Use `test.describe` blocks to group driver and route tests separately. Use semantic selectors (`getByRole`, `getByText`, `getByPlaceholder`, `getByLabel`) over CSS selectors where possible.
  </action>
  <verify>
1. `npx playwright test e2e/management-flows.spec.ts --list` shows all tests discovered without errors
2. Test file has no TypeScript errors: `npx tsc --noEmit` (if playwright types are configured)
3. Test file follows same patterns as existing e2e/tags.spec.ts
  </verify>
  <done>
- e2e/management-flows.spec.ts exists with 10+ tests covering driver and route management flows
- Tests properly handle auth redirects (skip pattern)
- Tests cover page loading, navigation, form presence, validation, and list display
- Tests use semantic selectors and follow existing test patterns
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` -- no type errors across the codebase
2. `npm run build` -- Next.js build succeeds (validates server components, server actions, client components)
3. `npx playwright test e2e/management-flows.spec.ts --list` -- all tests are discovered
4. Grep verification: `grep -n "bypass_rls" src/app/api/webhooks/clerk/route.ts` shows RLS bypass in driver invitation flow
5. Grep verification: `grep -n "typeof.*error.*string" src/components/routes/route-form.tsx` shows general error display
</verification>

<success_criteria>
- Webhook handler correctly bypasses RLS for ALL DriverInvitation table operations (findFirst, update x2)
- Route form displays general server errors (not just field-level validation errors)
- Driver invite form resets input fields after successful submission
- Route create/update server actions don't accidentally catch NEXT_REDIRECT
- Playwright e2e tests cover both driver and route management page flows
- Build passes, no type errors
</success_criteria>

<output>
After completion, create `.planning/quick/1-audit-and-fix-all-management-pages-with-/1-SUMMARY.md`
</output>
