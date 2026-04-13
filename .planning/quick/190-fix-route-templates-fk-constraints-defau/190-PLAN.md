---
phase: quick-190
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
autonomous: true
must_haves:
  truths:
    - "Default Driver field shows a dropdown of active carrier drivers, not a raw UUID text input"
    - "Default Truck field shows a dropdown of active carrier trucks, not a raw UUID text input"
    - "Both dropdowns include a None option since these fields are optional"
    - "Editing a template with existing driver/truck selections pre-selects the correct values"
  artifacts:
    - path: "apps/web/src/components/carrier/templates/RouteTemplateForm.tsx"
      provides: "Select dropdowns for defaultDriverId and defaultTruckId"
      contains: "carrier/fleet/drivers"
  key_links:
    - from: "RouteTemplateForm.tsx"
      to: "/api/v1/carrier/fleet/drivers"
      via: "fetch in useEffect"
      pattern: "carrier/fleet/drivers"
    - from: "RouteTemplateForm.tsx"
      to: "/api/v1/carrier/fleet/trucks"
      via: "fetch in useEffect"
      pattern: "carrier/fleet/trucks"
---

<objective>
Replace free-text UUID inputs for Default Driver and Default Truck in RouteTemplateForm with proper Select dropdowns fetching from existing fleet API endpoints.

Purpose: Prevent FK constraint violations caused by users pasting incorrect UUIDs.
Output: Updated RouteTemplateForm.tsx with driver/truck Select dropdowns.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace free-text driver/truck inputs with Select dropdowns</name>
  <files>apps/web/src/components/carrier/templates/RouteTemplateForm.tsx</files>
  <action>
1. Add two new interfaces near the existing ClientItem/ContractItem interfaces (around line 50):

```ts
interface DriverItem {
  id: string;
  firstName: string;
  lastName: string;
}

interface TruckItem {
  id: string;
  unitNumber: string;
}
```

2. Add two new state variables in the "Remote data" section (after line 134):

```ts
const [drivers, setDrivers] = useState<DriverItem[]>([]);
const [trucks, setTrucks] = useState<TruckItem[]>([]);
```

3. Add two new useEffect hooks after the existing client/contract fetch effects (after the contract fetch useEffect). Follow the exact same pattern as `loadClients`:

```ts
// Fetch active drivers
useEffect(() => {
  async function loadDrivers() {
    try {
      const res = await fetch('/api/v1/carrier/fleet/drivers?status=active&pageSize=200');
      if (!res.ok) return;
      const data = await res.json();
      setDrivers((data.data?.drivers ?? []) as DriverItem[]);
    } catch {
      // Ignore
    }
  }
  loadDrivers();
}, []);

// Fetch active trucks
useEffect(() => {
  async function loadTrucks() {
    try {
      const res = await fetch('/api/v1/carrier/fleet/trucks?status=active&pageSize=200');
      if (!res.ok) return;
      const data = await res.json();
      setTrucks((data.data?.trucks ?? []) as TruckItem[]);
    } catch {
      // Ignore
    }
  }
  loadTrucks();
}, []);
```

4. Replace the entire block from line 515 to 542 (the grid with free-text driver/truck inputs, including the stale TODO comment) with proper Select dropdowns. Use the shadcn Select component already imported. Use "__none__" as a sentinel value for the "None" option since shadcn Select does not allow empty string values.

The replacement JSX for the driver/truck grid:

```tsx
{/* Default driver / truck */}
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-foreground" htmlFor="defaultDriverId">
      Default Driver <span className="text-muted-foreground text-xs">(optional)</span>
    </label>
    <Select
      value={defaultDriverId || '__none__'}
      onValueChange={(val) => setDefaultDriverId(val === '__none__' ? '' : val)}
    >
      <SelectTrigger id="defaultDriverId">
        <SelectValue placeholder={drivers.length === 0 ? 'Loading...' : 'None'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">None</SelectItem>
        {drivers.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.firstName} {d.lastName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-foreground" htmlFor="defaultTruckId">
      Default Truck <span className="text-muted-foreground text-xs">(optional)</span>
    </label>
    <Select
      value={defaultTruckId || '__none__'}
      onValueChange={(val) => setDefaultTruckId(val === '__none__' ? '' : val)}
    >
      <SelectTrigger id="defaultTruckId">
        <SelectValue placeholder={trucks.length === 0 ? 'Loading...' : 'None'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">None</SelectItem>
        {trucks.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.unitNumber}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
</div>
```

5. Remove the stale TODO comment on lines 515-516.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web to confirm no type errors. Visually confirm the form renders with dropdown selects instead of text inputs by navigating to the route template create/edit page.
  </verify>
  <done>
Default Driver and Default Truck fields are proper Select dropdowns fetching from fleet API endpoints. Both show "None" as first option. Pre-existing values are selected correctly on edit. No free-text UUID input remains.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Route template create page shows driver/truck dropdowns (not text inputs)
- Route template edit page pre-selects existing driver/truck values
- Selecting "None" clears the field (sends null to server action)
</verification>

<success_criteria>
- Free-text UUID inputs for defaultDriverId and defaultTruckId are replaced with Select dropdowns
- Dropdowns fetch active drivers and trucks from existing fleet API endpoints
- Both fields include a "None" option and are optional
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/190-fix-route-templates-fk-constraints-defau/190-SUMMARY.md`
</output>
