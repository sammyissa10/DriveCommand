---
phase: quick-177
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts
  - apps/mobile/app/(driver)/carrier/dispatch/[id]/expenses.tsx
  - apps/mobile/components/carrier/ExpenseLogForm.tsx
  - apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx
  - packages/api-client/src/carrier-driver.ts
autonomous: true
must_haves:
  truths:
    - "Driver can see list of existing expenses for a dispatch"
    - "Driver can submit a new expense with type, amount, paid_by, and optional notes"
    - "Reimbursable badge is auto-computed based on paid_by selection"
    - "Expense Log button on stop detail navigates to expenses screen with stopId param"
    - "Receipt photo is optional and uses camera/gallery picker"
  artifacts:
    - path: "apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts"
      provides: "POST endpoint for creating carrier expenses"
      exports: ["POST"]
    - path: "apps/mobile/app/(driver)/carrier/dispatch/[id]/expenses.tsx"
      provides: "Expense log screen with form and expense list"
    - path: "apps/mobile/components/carrier/ExpenseLogForm.tsx"
      provides: "Expense form component with chip selects, amount input, receipt photo"
  key_links:
    - from: "apps/mobile/components/carrier/ExpenseLogForm.tsx"
      to: "carrierDriverApi.logExpense"
      via: "form submit handler"
      pattern: "carrierDriverApi\\.logExpense"
    - from: "apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx"
      to: "expenses.tsx"
      via: "router.push with stopId query param"
      pattern: "router\\.push.*expenses"
---

<objective>
Create the expense log screen for carrier driver dispatches. This is the final carrier mobile screen.

Purpose: Drivers need to log expenses (fuel, tolls, lumper, etc.) against dispatches, with optional receipt photo capture. The stop detail "Expense Log" button currently shows a placeholder alert.
Output: Working expense log screen with form + existing expense list, API endpoint for creating expenses, and wired stop detail button.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts (dispatch detail API - pattern for auth, bypass_rls, driver lookup)
@apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts (document upload API - pattern for R2 upload + FormData)
@packages/api-client/src/carrier-driver.ts (API client with logExpense stub + types)
@apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx (stop detail - wire Expense Log button)
@apps/mobile/components/carrier/StopDocumentUpload.tsx (photo capture pattern - camera/gallery/document pickers)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create expense POST API endpoint</name>
  <files>apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts</files>
  <action>
Create POST /api/mobile/carrier/driver/dispatches/[id]/expenses route following the exact pattern from the dispatch detail GET route (validateMobileToken, DRIVER role check, applyRateLimit, bypass_rls transaction, carrierDriver lookup).

Request body (JSON): `{ expenseType: string, amount: number, paidBy: string, stopId?: string, reimbursable: boolean, notes?: string }`.

Validation:
- expenseType must be one of: fuel, tolls, scales, lumper, parking, maintenance_emergency, driver_advance, other
- amount must be a positive number
- paidBy must be one of: driver_cash, company_card, fuel_card, driver_advance

Inside the bypass_rls transaction:
1. Find carrierDriver by userId + orgId (same as dispatch detail route)
2. Verify dispatch exists and belongs to driver (same WHERE as dispatch detail: primaryDriverId or coDriverId)
3. If stopId provided, verify the stop belongs to this dispatch
4. Create CarrierExpense record with: dispatchId, expenseType, amount (as Decimal), currency "USD", paidBy, driverId (carrierDriver.id), reimbursable, notes, stopId (if provided), orgId, submittedAt: new Date()
5. Return the created expense as JSON (id, expenseType, amount, currency, notes, createdAt, reimbursable) with status 201

Note: Receipt upload is NOT handled by this endpoint. For MVP, receipt photo capture will be handled as a future enhancement (the form allows photo selection but the actual upload to R2 + receiptDocumentId linking is deferred). The form will only submit the JSON fields.

Also update `packages/api-client/src/carrier-driver.ts`: The `ExpenseInput` interface needs a `reimbursable: boolean` field added to match the API contract. Currently it has expenseType, amount, paidBy, notes, stopId but is missing reimbursable.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no type errors in the new route. Verify the file exists at apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts.</verify>
  <done>POST endpoint creates CarrierExpense records with proper auth, validation, and bypass_rls. ExpenseInput type includes reimbursable field.</done>
</task>

<task type="auto">
  <name>Task 2: Create ExpenseLogForm component and expenses screen</name>
  <files>
    apps/mobile/components/carrier/ExpenseLogForm.tsx
    apps/mobile/app/(driver)/carrier/dispatch/[id]/expenses.tsx
  </files>
  <action>
**ExpenseLogForm.tsx** - Create a self-contained form component.

Props: `{ dispatchId: string, stopId?: string, token: string, onSuccess: () => void }`

State: expenseType (string, default empty), amount (string for input, default ''), paidBy (string, default empty), notes (string, default ''), submitting (boolean).

Expense type chips: horizontal ScrollView with chips for: fuel, tolls, scales, lumper, parking, maintenance_emergency, driver_advance, other. Each chip: min 44px height, rounded pill shape, tappable with Haptics.selectionAsync(). Selected chip gets brand background + white text, unselected gets surfaceCard background + textSecondary. Display labels: "Fuel", "Tolls", "Scales", "Lumper", "Parking", "Emergency Maint.", "Driver Advance", "Other".

Amount input: View with $ prefix Text + TextInput. keyboardType="decimal-pad". On blur, format to 2 decimal places (parseFloat then toFixed(2)). If NaN on blur, clear to ''.

Paid by chips: same horizontal ScrollView pattern. Chips: driver_cash ("Driver Cash"), company_card ("Company Card"), fuel_card ("Fuel Card"), driver_advance ("Driver Advance"). Min 44px height.

Reimbursable badge: computed from paidBy. If paidBy === 'driver_cash' show green "Reimbursable" badge, otherwise gray "Non-reimbursable" badge. Read-only, not tappable.

Notes: optional TextInput, multiline, placeholder "Add notes (optional)".

Submit button: branded background, white text "Log Expense". Disabled if expenseType or amount or paidBy is empty, or submitting is true. On press:
1. Call carrierDriverApi.logExpense(token, dispatchId, { expense_type: expenseType, amount: parseFloat(amount), paid_by: paidBy, stop_id: stopId, reimbursable: paidBy === 'driver_cash', notes: notes || undefined })
2. On success: Haptics.notificationAsync(SUCCESS), reset all fields, call onSuccess()
3. On error: Toast.show with error message

Note: The ExpenseInput type in api-client uses camelCase (expenseType, paidBy, stopId) so use those field names when calling logExpense. Check the actual ExpenseInput interface and match it exactly.

Use useThemeColors() for all colors. StyleSheet.create for styles.

**expenses.tsx** - Full screen with header, form, and expense list.

Use useLocalSearchParams to get `id` (dispatch ID) and optionally `stopId` from query params.
Use useAuthContext() for token.
Use TanStack Query with queryKey ['carrier-dispatch', id] to fetch dispatch detail (reuses cached data from dispatch detail screen).

Header: SafeAreaView with back button (ChevronLeft), title "Log Expense", subtitle showing dispatch number (dispatch?.dispatchNumber || `DSP-${id.slice(0,8).toUpperCase()}`).

Layout: ScrollView with RefreshControl for pull-to-refresh (invalidates the dispatch query).

Top section: ExpenseLogForm component. Pass onSuccess that scrolls to the expense list and invalidates the query.

Bottom section: "Expenses" section label + count badge. Map over dispatch.expenses array. Each expense row in a card:
- Left: expense_type badge (pill, surfaceCard bg, textSecondary text, capitalize and replace underscores with spaces)
- Center: formatted amount ($X.XX in textPrimary, bold)
- Right column: paidBy badge (small pill), reimbursable badge (green if true, gray if false, small text)
- Bottom: createdAt formatted as "Mon DD, YYYY h:mm AM/PM"

If no expenses, show empty state text "No expenses logged yet."

Use AnimatedScreen wrapper. SafeAreaView with background color. useThemeColors() throughout.
  </action>
  <verify>Run `cd apps/mobile && npx tsc --noEmit` to confirm no type errors. Verify both files exist.</verify>
  <done>ExpenseLogForm renders chip selects for expense type and paid by, decimal amount input, auto-computed reimbursable badge, notes field, and submit button. Expenses screen shows form + existing expense list with pull-to-refresh.</done>
</task>

<task type="auto">
  <name>Task 3: Wire stop detail Expense Log button</name>
  <files>apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx</files>
  <action>
In StopDetailScreen, replace the `handleLogExpense` function. Currently it shows an Alert "Coming Soon". Change it to:

```typescript
const handleLogExpense = () => {
  router.push(`/carrier/dispatch/${id}/expenses?stopId=${stopId}` as Parameters<typeof router.push>[0])
}
```

Remove the Alert import if it's no longer used elsewhere in the file (check first - it IS imported but only used by handleLogExpense, so remove it from the import).
  </action>
  <verify>Run `cd apps/mobile && npx tsc --noEmit` to confirm no type errors. Grep for "Coming Soon" in the file to confirm placeholder is removed.</verify>
  <done>Expense Log button on stop detail navigates to /carrier/dispatch/[id]/expenses with stopId query parameter. No more placeholder alert.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in both apps/web and apps/mobile
2. POST /api/mobile/carrier/driver/dispatches/[id]/expenses route exists and exports POST
3. expenses.tsx screen renders with form and list sections
4. ExpenseLogForm has chip selects with min 44px height
5. Stop detail Expense Log button navigates (no Alert.alert)
6. No "Coming Soon" text remains in stop detail
</verification>

<success_criteria>
- Driver can navigate from stop detail to expense log screen via Expense Log button
- Expense log screen shows form with expense type chips, amount input, paid by chips, auto-computed reimbursable badge, notes, and submit button
- Existing expenses display in a list below the form with type, amount, paid by, reimbursable, and timestamp
- API endpoint validates input and creates CarrierExpense records
- Pull-to-refresh reloads expense data
- TypeScript compiles cleanly in both apps
</success_criteria>

<output>
After completion, create `.planning/quick/177-carrier-ops-mobile-expense-log-screen-fo/177-SUMMARY.md`
</output>
