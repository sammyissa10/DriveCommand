---
phase: quick-82
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/invoices/invoice-items-editor.tsx
autonomous: true
must_haves:
  truths:
    - "Selecting a predefined line item description auto-fills the unit price"
    - "User can type a custom description if predefined options don't fit"
    - "User can still manually override the auto-filled unit price"
    - "Existing edit invoice flow still works with pre-populated items"
  artifacts:
    - path: "src/components/invoices/invoice-items-editor.tsx"
      provides: "Line items editor with predefined descriptions and auto-fill unit price"
  key_links:
    - from: "predefined description selection"
      to: "unitPrice field"
      via: "onChange handler auto-fills default price"
      pattern: "updateItem.*unitPrice"
---

<objective>
Fix TKT-0032: Improve invoice line items editor with predefined description dropdown and unit price auto-population.

Purpose: Currently the description field is a plain text input with no suggestions, and users must manually type descriptions and unit prices for every line item. Common items like freight charges, fuel surcharge, and detention should be selectable from a dropdown with default prices that auto-fill.

Output: Updated invoice-items-editor.tsx with predefined item dropdown + custom entry support + unit price auto-fill.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/invoices/invoice-items-editor.tsx
@src/components/invoices/invoice-form.tsx
@src/app/(owner)/invoices/new/page.tsx
@src/lib/validations/invoice.schemas.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add predefined line item descriptions with unit price auto-fill</name>
  <files>src/components/invoices/invoice-items-editor.tsx</files>
  <action>
Replace the plain text description `<input>` in each line item row with a combo-style control that offers predefined options but also allows custom text entry.

**Implementation approach — use a custom dropdown + input hybrid:**

1. Define a `PREDEFINED_LINE_ITEMS` constant array at the top of the file with common trucking/freight invoice items and their default unit prices:
   ```
   { label: 'Freight Charges', defaultPrice: '' }        // varies per load
   { label: 'Fuel Surcharge', defaultPrice: '' }          // varies
   { label: 'Detention', defaultPrice: '75.00' }          // per hour typical
   { label: 'Layover', defaultPrice: '250.00' }
   { label: 'Lumper Fee', defaultPrice: '' }               // varies
   { label: 'TONU (Truck Ordered Not Used)', defaultPrice: '250.00' }
   { label: 'Accessorial Charges', defaultPrice: '' }
   { label: 'Stop-Off Charge', defaultPrice: '50.00' }
   { label: 'Deadhead Miles', defaultPrice: '' }
   { label: 'Hazmat Fee', defaultPrice: '150.00' }
   ```
   Items with empty defaultPrice won't auto-fill the price (user enters manually). Items with a defaultPrice will auto-fill ONLY if the current unitPrice field is empty or "0".

2. Replace the description `<input type="text">` with a wrapper div containing:
   - A text input (same styling as current) that shows the current description value and allows free typing
   - A small dropdown toggle button (ChevronDown icon from lucide-react) on the right side of the input
   - When the dropdown is open, show a floating list (absolute positioned, z-10, bg-popover border rounded-lg shadow-md) of predefined items below the input
   - Clicking a predefined item: sets the description to that item's label, and if the item has a defaultPrice AND the current unitPrice is empty or "0", auto-fills the unitPrice
   - The dropdown should also filter predefined items as the user types in the input (case-insensitive match on label)
   - Include a "Custom" option at the bottom of the dropdown that just closes the dropdown and lets the user type freely
   - Clicking outside the dropdown closes it (use a useRef + useEffect with mousedown listener)

3. The combo control should:
   - Accept the same `value` and `onChange` pattern as the current input
   - Keep the same `required` attribute
   - Use the same `inputClass` styling for the text input portion
   - Add `pr-8` to the input to make room for the chevron button
   - The chevron button should be positioned absolutely inside the wrapper (right-2, top-1/2 -translate-y-1/2)

4. When a predefined item is selected and it has a `defaultPrice`:
   - Call `updateItem(index, 'description', item.label)`
   - Then check: if `items[index].unitPrice` is `''` or `'0'`, also call `updateItem(index, 'unitPrice', item.defaultPrice)`
   - If the unitPrice already has a non-zero value, do NOT overwrite it (user may have set it intentionally)

5. Keep quantity defaulting to '1' for new items (existing behavior is fine — empty string with placeholder "1").

6. When the description input is focused and empty, auto-open the dropdown to show all predefined options.

**Styling notes:**
- Dropdown list: `absolute left-0 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-md z-10`
- Each option: `px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors`
- If item has a defaultPrice, show it as muted text on the right: `<span className="text-muted-foreground ml-auto">$XX.XX</span>` inside a flex row
- Active/highlighted option styling consistent with other selects in the app
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no TypeScript errors. Run `npm run build` or `npx next build` to confirm no build errors. Visually verify at /invoices/new:
- Description field shows a dropdown chevron
- Clicking chevron shows predefined items
- Selecting "Detention" fills description with "Detention" and unit price with "75.00"
- Selecting "Freight Charges" fills description but leaves unit price empty (no default)
- Typing filters the predefined list
- Can type a fully custom description
- Existing edit invoice page still works with pre-filled items
  </verify>
  <done>
Description field is a combo input with predefined trucking line items. Selecting a predefined item auto-fills the description and (when available) the default unit price. Users can still type custom descriptions. Unit price is never overwritten if already set to a non-zero value.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Build succeeds
- New invoice page at /invoices/new loads correctly
- Predefined dropdown shows all common line items
- Auto-fill works: selecting an item with a default price populates the unit price field
- Auto-fill does NOT overwrite existing non-zero unit prices
- Custom typing still works — user can ignore dropdown entirely
- Edit invoice page still renders existing items correctly
- Line item serialization (itemsJson hidden input) still works correctly
- Subtotal calculation still updates reactively
</verification>

<success_criteria>
- Predefined line item descriptions available via dropdown on each line item row
- Unit price auto-populates when selecting a predefined item with a default price
- Custom descriptions still supported via free text entry
- No regressions to invoice creation or editing flows
</success_criteria>

<output>
After completion, create `.planning/quick/82-tkt-0032-fix-invoice-line-items-unit-pri/82-SUMMARY.md`
</output>
