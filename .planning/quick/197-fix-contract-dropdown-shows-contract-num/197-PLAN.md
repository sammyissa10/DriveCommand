---
phase: quick-197
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
  - apps/web/src/components/carrier/loads/LoadForm.tsx
  - apps/web/src/components/carrier/templates/DispatchPreview.tsx
  - apps/web/src/lib/carrier/dispatches.ts
autonomous: true
must_haves:
  truths:
    - "Contract dropdown on route template form shows contract name as primary label with contract number as subtitle"
    - "Contract dropdown on load form shows contract name as primary label with contract number as subtitle"
    - "Dispatch preview table shows DC-YYYY-NNNNN dispatch number instead of truncated UUID"
    - "Dispatch preview table shows driver full name instead of truncated UUID"
    - "Dispatch preview table shows truck unit number instead of truncated UUID"
  artifacts:
    - path: "apps/web/src/components/carrier/templates/RouteTemplateForm.tsx"
      provides: "Contract dropdown with name + number display"
    - path: "apps/web/src/components/carrier/loads/LoadForm.tsx"
      provides: "Contract dropdown with name + number display"
    - path: "apps/web/src/components/carrier/templates/DispatchPreview.tsx"
      provides: "Dispatch preview with human-readable columns"
    - path: "apps/web/src/lib/carrier/dispatches.ts"
      provides: "listDispatches with driver/truck includes"
  key_links:
    - from: "DispatchPreview.tsx"
      to: "/api/v1/carrier/dispatches"
      via: "fetch"
      pattern: "primaryDriver.*firstName"
---

<objective>
Fix two display bugs in the carrier ops module: (1) contract dropdowns showing contract number instead of name, and (2) dispatch preview table showing truncated UUIDs instead of human-readable values.

Purpose: Improve usability of route template and load forms by showing meaningful labels.
Output: Updated components with correct display values.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
@apps/web/src/components/carrier/templates/DispatchPreview.tsx
@apps/web/src/components/carrier/loads/LoadForm.tsx
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/prisma/schema.prisma (CarrierContract, CarrierDispatch, CarrierDriver, CarrierTruck models)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix contract dropdowns to show name with number subtitle</name>
  <files>
    apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
    apps/web/src/components/carrier/loads/LoadForm.tsx
  </files>
  <action>
**RouteTemplateForm.tsx:**

1. Update the `ContractItem` interface (line ~55-58) to add `contractName`:
   ```
   interface ContractItem {
     id: string;
     contractNumber: string;
     contractName: string | null;
   }
   ```

2. Update the contract `<SelectItem>` rendering (line ~374-376). Replace `{c.contractNumber}` with a layout showing contract name as primary and number as subtitle:
   ```tsx
   <SelectItem key={c.id} value={c.id}>
     <span className="flex flex-col">
       <span>{c.contractName || c.contractNumber}</span>
       {c.contractName && (
         <span className="text-xs text-muted-foreground font-mono">{c.contractNumber}</span>
       )}
     </span>
   </SelectItem>
   ```

   Note: The API at `/api/v1/carrier/contracts` already returns `contractName` from the Prisma model -- no backend change needed.

**LoadForm.tsx:**

1. Update the `Contract` interface (line ~20-27) to add `contractName`:
   ```
   interface Contract {
     id: string;
     contractNumber: string | null;
     contractName: string | null;
     rateType: string | null;
     baseRate: string | null;
     fuelSurchargeMethod: string | null;
     fuelSurchargeRate: string | null;
   }
   ```

2. Update the contract `<option>` rendering (line ~344-346). Replace `{c.contractNumber ?? \`Contract ${c.id.slice(0, 8)}\`}` with:
   ```tsx
   <option key={c.id} value={c.id}>
     {c.contractName || c.contractNumber || `Contract ${c.id.slice(0, 8)}`}
   </option>
   ```
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors on the modified files.</verify>
  <done>Contract dropdowns in both RouteTemplateForm and LoadForm show contractName as primary label; contractNumber shown as subtitle (RouteTemplateForm) or fallback (LoadForm).</done>
</task>

<task type="auto">
  <name>Task 2: Fix dispatch preview table to show human-readable values</name>
  <files>
    apps/web/src/lib/carrier/dispatches.ts
    apps/web/src/components/carrier/templates/DispatchPreview.tsx
  </files>
  <action>
**dispatches.ts — Update `listDispatches` function:**

Add `include` relations to the `prisma.carrierDispatch.findMany` call (line ~97-107) to join the driver and truck records:

```ts
prisma.carrierDispatch.findMany({
  where,
  skip,
  take: pageSize,
  orderBy: { scheduledDeparture: 'asc' },
  include: {
    primaryDriver: {
      select: { firstName: true, lastName: true },
    },
    truck: {
      select: { unitNumber: true },
    },
    _count: {
      select: { stops: true },
    },
  },
}),
```

Check the Prisma schema for the relation names on CarrierDispatch. The model has:
- `primaryDriver CarrierDriver @relation(name: "PrimaryDriverDispatches", ...)`
- `truck CarrierTruck @relation(...)`

Use whatever relation names are defined. Verify by checking the schema around line 1510-1530.

**DispatchPreview.tsx — Update interface and rendering:**

1. Update the `DispatchItem` interface to include the joined data:
   ```ts
   interface DispatchItem {
     id: string;
     scheduledDeparture: string;
     primaryDriverId: string;
     truckId: string;
     notes: string | null;
     primaryDriver: { firstName: string; lastName: string } | null;
     truck: { unitNumber: string } | null;
   }
   ```

2. Add a helper to extract dispatch number from notes (same pattern used elsewhere in the codebase):
   ```ts
   function extractDispatchNumber(notes: string | null): string | null {
     if (!notes) return null;
     const match = notes.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
     return match ? match[1] : null;
   }
   ```

3. Update the table body rendering (lines ~228-236) to replace truncated UUIDs:

   - **Dispatch ID column:** Replace `{d.id.slice(0, 8)}...` with:
     ```tsx
     {extractDispatchNumber(d.notes) ?? d.id.slice(0, 8)}
     ```
     Remove the `font-mono text-xs` classes and use regular text styling for the dispatch number. Keep font-mono only as a fallback styling.

   - **Driver column:** Replace `{d.primaryDriverId.slice(0, 8)}...` with:
     ```tsx
     {d.primaryDriver ? `${d.primaryDriver.firstName} ${d.primaryDriver.lastName}` : d.primaryDriverId.slice(0, 8)}
     ```
     Remove font-mono text-xs classes; use normal text styling.

   - **Truck column:** Replace `{d.truckId.slice(0, 8)}...` with:
     ```tsx
     {d.truck?.unitNumber ?? d.truckId.slice(0, 8)}
     ```
     Remove font-mono text-xs classes; use normal text styling.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors. Visually confirm dispatch preview shows dispatch numbers, driver names, and truck unit numbers instead of truncated UUIDs.</verify>
  <done>Dispatch preview table shows DC-YYYY-NNNNN dispatch numbers, driver full names (firstName + lastName), and truck unit numbers. Truncated UUIDs only shown as fallback when joined data is unavailable.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. Route template edit page (`/carrier/templates/[id]`) shows contract name in dropdown with number subtitle
3. Load form (`/carrier/loads/new`) shows contract name in dropdown
4. Dispatch preview table on route template detail page shows human-readable dispatch IDs, driver names, and truck unit numbers
</verification>

<success_criteria>
- Contract dropdowns across carrier ops module show contractName as primary display with contractNumber as secondary
- Dispatch preview table shows dispatch number (DC-YYYY-NNNNN), driver full name, and truck unit number
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/197-fix-contract-dropdown-shows-contract-num/197-SUMMARY.md`
</output>
