---
phase: quick-118
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/validation/src/load.ts
  - apps/web/src/app/(owner)/actions/loads.ts
  - apps/web/src/components/loads/load-form.tsx
  - apps/web/src/app/(owner)/loads/new/page.tsx
  - apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
  - apps/web/src/app/api/mobile/owner/loads/route.ts
autonomous: true
must_haves:
  truths:
    - "Owner can assign a load to a route when creating a load via web"
    - "Owner can assign/change a load's route when editing a load via web"
    - "Owner can create a load via mobile API with an optional routeId"
    - "Route detail page already shows linked loads (already works, no change needed)"
    - "Driver my-route screen already shows linked loads in timeline (already works, no change needed)"
  artifacts:
    - path: "packages/validation/src/load.ts"
      provides: "routeId optional field in loadCreateSchema and loadUpdateSchema"
      contains: "routeId"
    - path: "apps/web/src/components/loads/load-form.tsx"
      provides: "Route dropdown in load create/edit form"
      contains: "routeId"
    - path: "apps/web/src/app/(owner)/actions/loads.ts"
      provides: "routeId persisted in createLoad and updateLoad"
      contains: "routeId"
  key_links:
    - from: "apps/web/src/components/loads/load-form.tsx"
      to: "apps/web/src/app/(owner)/actions/loads.ts"
      via: "formData routeId field"
      pattern: "formData.get\\('routeId'\\)"
    - from: "apps/web/src/app/(owner)/loads/new/page.tsx"
      to: "apps/web/src/components/loads/load-form.tsx"
      via: "routes prop"
      pattern: "routes="
---

<objective>
Add route assignment to the load create/edit flow so owners can link a load to a route.

Purpose: The routeId FK already exists on the Load model and the Route/Driver detail screens already display linked loads. The missing piece is allowing owners to actually SET routeId when creating or editing a load --- both on web (form dropdown) and mobile (API field). This closes the loop so loads appear on routes.

Output: Updated validation schema, server actions, load form with route dropdown, mobile API accepting routeId.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/validation/src/load.ts
@apps/web/src/app/(owner)/actions/loads.ts
@apps/web/src/components/loads/load-form.tsx
@apps/web/src/app/(owner)/loads/new/page.tsx
@apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
@apps/web/src/app/api/mobile/owner/loads/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add routeId to validation schema, server actions, and mobile API</name>
  <files>
    packages/validation/src/load.ts
    apps/web/src/app/(owner)/actions/loads.ts
    apps/web/src/app/api/mobile/owner/loads/route.ts
  </files>
  <action>
1. In `packages/validation/src/load.ts`:
   - Add `routeId: z.string().uuid().optional().or(z.literal(''))` to `loadCreateSchema` (same pattern as `driverId`/`truckId`).
   - `loadUpdateSchema` is already `= loadCreateSchema` so it gets it automatically.

2. In `apps/web/src/app/(owner)/actions/loads.ts`:
   - In `createLoad()`: extract `routeId` from formData (`(formData.get('routeId') as string) || ''`), add it to `rawData`, and persist `routeId: result.data.routeId || null` in the `prisma.load.create` data object.
   - In `updateLoad()`: same pattern --- extract routeId from formData, add to rawData, persist in `prisma.load.update` data object.

3. In `apps/web/src/app/api/mobile/owner/loads/route.ts` (POST handler):
   - Add `routeId?: string` to the body type.
   - Destructure `routeId` from body.
   - If routeId is provided, validate it belongs to the tenant: `tx.route.findFirst({ where: { id: routeId, tenantId, archivedAt: null } })`. Throw if not found.
   - Include `routeId: routeId ?? null` in the `tx.load.create` data object.
  </action>
  <verify>
    Run `cd packages/validation && npx tsc --noEmit` to confirm schema compiles.
    Run `cd apps/web && npx tsc --noEmit` to confirm server actions and API compile.
  </verify>
  <done>
    - loadCreateSchema and loadUpdateSchema accept optional routeId
    - createLoad and updateLoad server actions persist routeId from form data
    - Mobile POST /api/mobile/owner/loads accepts and validates optional routeId
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Route dropdown to web load form and wire up data fetching</name>
  <files>
    apps/web/src/components/loads/load-form.tsx
    apps/web/src/app/(owner)/loads/new/page.tsx
    apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
  </files>
  <action>
1. In `apps/web/src/components/loads/load-form.tsx`:
   - Add `routes?: Array<{ id: string; name: string | null; origin: string; destination: string }>` to `LoadFormProps`.
   - Add `routeId?: string | null` to `initialData`.
   - In the form, after the Truck dropdown (around line 125), add a Route dropdown:
     ```
     <div>
       <label htmlFor="routeId">Route <span>(optional)</span></label>
       <select id="routeId" name="routeId" defaultValue={initialData?.routeId || ''}>
         <option value="">No route assigned</option>
         {routes.map(r => (
           <option key={r.id} value={r.id}>
             {r.name || `${r.origin} -> ${r.destination}`}
           </option>
         ))}
       </select>
     </div>
     ```
   - Use the same `inputClass`, `labelClass` styling as the existing dropdowns.

2. In `apps/web/src/app/(owner)/loads/new/page.tsx`:
   - Import `listRoutes` from `@/app/(owner)/actions/routes` (already exported).
   - Add routes fetch to the existing `Promise.all`: `listRoutes().catch(() => [] as any[])`.
   - Map routes to `{ id, name, origin, destination }` shape.
   - Pass `routes={routes}` prop to `<LoadForm>`.

3. In `apps/web/src/app/(owner)/loads/[id]/edit/page.tsx`:
   - Same as above: import listRoutes, fetch in Promise.all, pass to LoadForm.
   - Also pass `routeId: load.routeId` in `initialData` so the dropdown shows the current route.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` to confirm no type errors.
    Run `cd apps/web && npx next build` (or just tsc) to verify pages compile.
  </verify>
  <done>
    - Load create form shows a Route dropdown with all active routes
    - Load edit form shows Route dropdown pre-selected with the load's current route
    - Selecting a route and saving persists the routeId on the load
    - Leaving "No route assigned" sets routeId to null
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with no errors
2. `cd packages/validation && npx tsc --noEmit` passes with no errors
3. Web: Navigate to /loads/new --- Route dropdown appears after Truck with list of routes
4. Web: Create a load with a route selected --- load detail page shows route link, and route detail page shows the load in "Loads on this Route" section
5. Web: Edit a load --- Route dropdown pre-selects the current route, can be changed or cleared
6. Mobile API: POST /api/mobile/owner/loads with routeId in body creates load linked to route
7. Driver my-route screen: loads linked via routeId already appear in timeline (no changes needed --- this is existing behavior)
</verification>

<success_criteria>
- Owners can assign loads to routes from the web load form (create and edit)
- Mobile API accepts routeId when creating loads
- Route detail pages (web and mobile) show linked loads (already working, just needs data)
- No TypeScript errors across the monorepo
</success_criteria>

<output>
After completion, create `.planning/quick/118-add-routeid-fk-to-load-model-so-loads-ca/118-SUMMARY.md`
</output>
