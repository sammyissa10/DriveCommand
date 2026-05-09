---
phase: quick-126
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260329000001_add_load_sequence/migration.sql
  - apps/web/src/app/(owner)/routes/[id]/page.tsx
  - apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
  - apps/web/src/app/api/mobile/driver/route/route.ts
  - packages/api-client/src/driver.ts
  - apps/mobile/app/(driver)/loads/my-route.tsx
  - apps/mobile/components/driver/RouteLoadTimelineItem.tsx
autonomous: true
must_haves:
  truths:
    - "Loads on a route display in sequence order (Leg 1, Leg 2, Leg 3) on both web and mobile"
    - "Owner can reorder loads on a route via sequence numbers in the route detail page"
    - "Driver sees numbered legs (Leg 1, Leg 2, Leg 3) in their my-route screen"
    - "Loads without a sequence sort last (nulls last)"
    - "Continuity warning shows when load[n].destination differs from load[n+1].origin"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "sequence Int? field on Load model"
      contains: "sequence"
    - path: "apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx"
      provides: "Sequence editing UI + continuity warnings"
    - path: "apps/mobile/components/driver/RouteLoadTimelineItem.tsx"
      provides: "Leg N label on timeline items"
  key_links:
    - from: "apps/web/src/app/(owner)/routes/[id]/page.tsx"
      to: "prisma.load"
      via: "orderBy sequence asc nulls last"
      pattern: "orderBy.*sequence"
    - from: "apps/web/src/app/api/mobile/driver/route/route.ts"
      to: "prisma load select"
      via: "include sequence in select, orderBy sequence"
      pattern: "sequence"
---

<objective>
Add multi-leg load sequencing to routes so loads represent ordered legs of a journey (A->B, B->C, C->D).

Purpose: Routes go from origin to destination, and loads on that route are sequential legs. Without explicit ordering, drivers don't know which load to work first. Owners can't visualize the route progression.

Output: `sequence` field on Load model, sorted display on web route detail + mobile driver route screen, sequence editing for owners, continuity warnings.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (Load model at line 868)
@apps/web/src/app/(owner)/routes/[id]/page.tsx (linkedLoads query at line 83-98)
@apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx (linkedLoads rendering)
@apps/web/src/app/api/mobile/driver/route/route.ts (driver route API, loads select at line 48-56)
@packages/api-client/src/driver.ts (DriverRouteLoad interface at line 126)
@apps/mobile/components/driver/RouteLoadTimelineItem.tsx (timeline item component)
@apps/mobile/app/(driver)/loads/my-route.tsx (driver my-route screen)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration + API layer updates</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260329000001_add_load_sequence/migration.sql
    apps/web/src/app/(owner)/routes/[id]/page.tsx
    apps/web/src/app/api/mobile/driver/route/route.ts
    packages/api-client/src/driver.ts
  </files>
  <action>
    1. **Schema**: Add `sequence Int?` field to the `Load` model in `schema.prisma`, placed after `routeId` field. Add an index: `@@index([routeId, sequence])` for efficient ordering.

    2. **Migration**: Create migration `20260329000001_add_load_sequence`. SQL:
       ```sql
       ALTER TABLE "Load" ADD COLUMN "sequence" INTEGER;
       CREATE INDEX "Load_routeId_sequence_idx" ON "Load"("routeId", "sequence");
       ```
       Run `npx prisma generate` after creating migration to update the Prisma client.

    3. **Web route detail page** (`routes/[id]/page.tsx`): Update the `prisma.load.findMany` query (currently at line 83-98) to:
       - Add `sequence: true` to the `select` clause
       - Change `orderBy` from `{ pickupDate: 'asc' }` to `[{ sequence: 'asc' }, { pickupDate: 'asc' }]` — Prisma sorts nulls last by default for asc order on nullable Int fields.

    4. **Mobile driver route API** (`api/mobile/driver/route/route.ts`): Update the `loads` select (line 48-56) to:
       - Add `sequence: true` to the select
       - Add `orderBy: [{ sequence: 'asc' }, { pickupDate: 'asc' }]` to the loads relation query

    5. **API client type** (`packages/api-client/src/driver.ts`): Add `sequence: number | null` to the `DriverRouteLoad` interface.
  </action>
  <verify>
    - `npx prisma generate` succeeds without errors (run from apps/web)
    - `npx tsc --noEmit` passes in apps/web (no type errors from new field)
    - Migration SQL file exists at expected path
  </verify>
  <done>
    Load model has `sequence` field, all queries return loads sorted by sequence (nulls last), API types updated.
  </done>
</task>

<task type="auto">
  <name>Task 2: Web UI sequence editing + continuity warnings</name>
  <files>
    apps/web/src/app/(owner)/routes/[id]/route-page-client.tsx
  </files>
  <action>
    Update the "Loads on this Route" section in `route-page-client.tsx` (appears twice — view mode ~line 238 and edit mode ~line 354). The `linkedLoads` type already has `sequence` from Task 1's query update.

    1. **Update the linkedLoads type** in the `RoutePageClientProps` interface to include `sequence: number | null`.

    2. **View mode** (first "Loads on this Route" block ~line 238):
       - Add a "Leg N" label before each load number. If `load.sequence` is not null, show `Leg {load.sequence}` in a muted badge/pill. If null, show no leg label.
       - After the load list, add a **continuity warning section**: iterate through sorted loads and check if `loads[i].destination !== loads[i+1].origin` for consecutive loads that both have sequences. Show a yellow/amber warning: "Gap: Load #{loadNumber1} delivers to {destination} but Load #{loadNumber2} picks up from {origin}". Use AlertTriangle icon from lucide-react. Only show if there are 2+ sequenced loads.

    3. **Edit mode** (second "Loads on this Route" block ~line 354):
       - Add a small numeric input (width ~16/w-16) next to each load showing `load.sequence ?? ''`. On change, call a server action or inline `fetch` to PATCH the load's sequence. Use a simple approach: add an `updateLoadSequence` server action that calls `prisma.load.update({ where: { id }, data: { sequence } })` — add this action to the existing routes actions file or create an inline API call.
       - Actually, simpler approach: use `revalidatePath` pattern. Create a small server action in `apps/web/src/app/(owner)/actions/loads.ts` (if it exists) or add to routes actions: `updateLoadSequence(loadId: string, sequence: number | null)`. Wire it to the input's onBlur or a small save button per row.
       - Include the same continuity warnings as view mode so the owner sees them while editing.

    4. **Sorting**: The loads come pre-sorted from the server query (Task 1). No client-side sorting needed.
  </action>
  <verify>
    - `npx tsc --noEmit` passes (no type errors)
    - Route detail page renders loads with "Leg N" labels when sequence is set
    - Continuity warnings appear when consecutive load destinations/origins don't match
    - Edit mode shows sequence number inputs
  </verify>
  <done>
    Owner sees numbered legs on route detail, can edit sequence numbers in edit mode, sees continuity warnings for mismatched stops.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mobile driver leg numbering</name>
  <files>
    apps/mobile/components/driver/RouteLoadTimelineItem.tsx
    apps/mobile/app/(driver)/loads/my-route.tsx
  </files>
  <action>
    1. **RouteLoadTimelineItem**: Update the component props — `DriverRouteLoad` already gets `sequence` from Task 1's type update. Add a `legNumber` prop (number, derived from index+1 or sequence) to keep the component flexible.
       - Replace the load number label (currently `{load.loadNumber}` at line 82) with a two-line display:
         - Line 1: `Leg {legNumber}` in a slightly larger/bolder style (text-sm font-bold text-sky-400)
         - Line 2: `#{load.loadNumber}` in the existing muted style below it
       - This makes the leg progression visually prominent for drivers.

    2. **my-route.tsx**: Update the `loadList.map` rendering (line 252-258) to pass `legNumber` to `RouteLoadTimelineItem`. Derive it from: if `load.sequence` is not null, use `load.sequence`; otherwise use `index + 1`. The loads come pre-sorted from the API (Task 1).
       - Update the section header from "Loads on this Route" to "Route Legs" for clarity.

    3. **Continuity display** (nice visual touch): In `my-route.tsx`, between each `RouteLoadTimelineItem`, the timeline connector line already exists. No additional wiring needed — the sequential display with "Leg 1", "Leg 2", "Leg 3" labels makes the progression clear.
  </action>
  <verify>
    - `npx tsc --noEmit` passes in apps/mobile (or the monorepo root)
    - RouteLoadTimelineItem shows "Leg N" label above load number
    - Loads display in sequence order on the my-route screen
  </verify>
  <done>
    Driver sees loads numbered as "Leg 1", "Leg 2", "Leg 3" in sequence order on their route screen, making it clear which load to work first.
  </done>
</task>

</tasks>

<verification>
1. Schema: `sequence` field exists on Load model, migration file created
2. Web: Route detail shows loads sorted by sequence with leg labels and continuity warnings
3. Web edit: Owner can set/change sequence numbers on loads
4. Mobile API: Driver route endpoint returns loads with sequence, sorted correctly
5. Mobile UI: Driver sees "Leg N" progression on my-route screen
6. TypeScript: `npx tsc --noEmit` passes across the monorepo
</verification>

<success_criteria>
- Load model has `sequence Int?` field with migration
- Web route detail shows "Leg N" labels on sequenced loads
- Continuity warnings display when load[n].destination != load[n+1].origin
- Owner can edit sequence numbers in route edit mode
- Driver mobile app shows "Leg 1", "Leg 2", "Leg 3" progression
- All queries sort by sequence ASC (nulls last), then pickupDate ASC
</success_criteria>

<output>
After completion, create `.planning/quick/126-add-multi-leg-load-sequencing-to-routes/126-SUMMARY.md`
</output>
