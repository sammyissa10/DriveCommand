---
phase: quick-45
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/app/(owner)/routes/[id]/route-page-client.tsx
  - src/app/(owner)/routes/[id]/route-documents-section.tsx
  - src/app/(owner)/actions/routes.ts
  - src/components/routes/route-edit-section.tsx
  - src/components/routes/route-form.tsx
autonomous: false

must_haves:
  truths:
    - "Route page title shows a short ID (first 8 chars) not a full address"
    - "Uploaded documents appear in the list immediately after upload without a full page reload"
    - "A route can have one primary driver plus zero or more co-drivers assigned simultaneously"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "RouteDriver join model and optional Route.name field"
      contains: "model RouteDriver"
    - path: "src/app/(owner)/routes/[id]/route-documents-section.tsx"
      provides: "Documents list stays in sync with server after upload"
    - path: "src/app/(owner)/routes/[id]/route-page-client.tsx"
      provides: "Condensed page title rendering"
  key_links:
    - from: "src/app/(owner)/routes/[id]/route-documents-section.tsx"
      to: "initialDocuments prop"
      via: "useEffect sync"
      pattern: "useEffect.*initialDocuments"
    - from: "prisma/schema.prisma RouteDriver"
      to: "src/app/(owner)/actions/routes.ts"
      via: "prisma.routeDriver"
      pattern: "routeDriver\\.(create|delete|findMany)"
---

<objective>
Three targeted fixes for TKT-0011: condense the route page title, fix documents not appearing after upload, and add co-driver support (multiple drivers on one route simultaneously).

Purpose: Usability improvement — route UUIDs are unreadable as titles, uploaded documents vanish until hard reload, and dispatchers need to assign multiple drivers per route.
Output: Schema migration, updated route actions, updated UI components.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema — add Route.name field and RouteDriver join table</name>
  <files>prisma/schema.prisma</files>
  <action>
    1. In the `Route` model (line ~221), add an optional `name` field after the existing `notes` field:
       ```
       name           String?
       ```
       Also add a `coDrivers RouteDriver[]` relation field.

    2. After the `Route` model's closing brace, add a new join model:
       ```prisma
       model RouteDriver {
         id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
         routeId   String   @db.Uuid
         driverId  String   @db.Uuid
         role      String   @default("co-driver")
         createdAt DateTime @default(now()) @db.Timestamptz

         route  Route @relation(fields: [routeId], references: [id], onDelete: Cascade)
         driver User  @relation(name: "RouteCoDrivers", fields: [driverId], references: [id])

         @@unique([routeId, driverId])
         @@index([routeId])
         @@index([driverId])
       }
       ```

    3. On the `User` model, add the back-relation:
       ```
       routeCoDrivers RouteDriver[] @relation(name: "RouteCoDrivers")
       ```

    4. Run the migration:
       ```bash
       npx prisma migrate dev --name "add-route-name-and-co-drivers"
       ```
       Then regenerate the client:
       ```bash
       npx prisma generate
       ```
  </action>
  <verify>
    Run `npx prisma validate` — no errors.
    Run `npx prisma studio` (or check migrations folder) to confirm migration file was created.
    `grep -n "RouteDriver\|coDrivers\|routeCoDrivers" prisma/schema.prisma` shows all three additions.
  </verify>
  <done>Schema compiles, migration applied, Prisma client regenerated with RouteDriver model and Route.name field.</done>
</task>

<task type="auto">
  <name>Task 2: Fix document upload not persisting in the list + condense route title</name>
  <files>
    src/app/(owner)/routes/[id]/route-documents-section.tsx
    src/app/(owner)/routes/[id]/route-page-client.tsx
  </files>
  <action>
    **Fix A — Document list not refreshing after upload (route-documents-section.tsx):**

    The bug: `useState(initialDocuments)` initializes once on mount. `router.refresh()` causes the server to re-run and pass a new `initialDocuments` prop, but React does not re-initialize state from changed props — so the new document never appears.

    Fix: replace the unused `setDocuments` pattern with a `useEffect` that syncs local state whenever `initialDocuments` changes:

    ```tsx
    import { useState, useEffect } from 'react';

    // inside the component:
    const [documents, setDocuments] = useState<Document[]>(initialDocuments);

    useEffect(() => {
      setDocuments(initialDocuments);
    }, [initialDocuments]);
    ```

    Remove the existing `import { useState }` and replace with `import { useState, useEffect }`. Keep `handleRefresh` as-is (it calls `router.refresh()` which triggers the prop update, which now triggers the useEffect sync).

    **Fix B — Condense route page title (route-page-client.tsx):**

    Current title (line ~149):
    ```tsx
    {isEditMode ? 'Edit Route' : `${route.origin} to ${route.destination}`}
    ```

    Replace with a helper that renders: short ID badge + route name (or origin→destination as fallback):
    ```tsx
    {isEditMode
      ? 'Edit Route'
      : (
        <span className="flex items-center gap-3">
          <span className="font-mono text-base font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
            #{route.id.slice(0, 8)}
          </span>
          <span>{route.name ?? `${route.origin} → ${route.destination}`}</span>
        </span>
      )
    }
    ```

    Also add `name: string | null` to the `RoutePageClientProps` route interface (after `id: string`), and thread it through from `page.tsx` (the `getRoute` action will need to return it too — see Task 3).
  </action>
  <verify>
    - Upload a document on a route detail page — it should appear in the list immediately without a hard reload.
    - Route detail page title shows `#7db72171 Chicago → Dallas` style (short hex + name or addresses).
  </verify>
  <done>Documents appear after upload without page reload. Title shows condensed short ID + route name or origin/destination.</done>
</task>

<task type="auto">
  <name>Task 3: Co-driver support — route actions + edit form</name>
  <files>
    src/app/(owner)/actions/routes.ts
    src/components/routes/route-edit-section.tsx
    src/components/routes/route-form.tsx
  </files>
  <action>
    **routes.ts:**

    1. Update `getRoute()` to include `coDrivers` and `name` in its Prisma query:
       ```ts
       coDrivers: {
         include: { driver: { select: { id: true, firstName: true, lastName: true, email: true } } }
       },
       name: true,
       ```
       Update the return type to include `name: string | null` and `coDrivers: Array<{ id: string; driver: {...} }>`.

    2. Add a `updateRouteCoDrivers(routeId: string, coDriverIds: string[])` server action:
       - Requires OWNER or MANAGER role.
       - Wraps in a transaction: delete all existing `RouteDriver` rows for this route, then insert the new set.
       - Revalidates `/routes/${routeId}`.
       - Returns `{ success: true }` or `{ error: string }`.

    3. Update `createRoute()` and `updateRoute()` to accept and save an optional `name` string field.

    **route-edit-section.tsx and route-form.tsx:**

    1. Add a "Route Name" text input field (optional, placeholder "e.g. Chicago Steel Run"). Appears above or below origin/destination. Bound to `name` field.

    2. Add a "Co-Drivers" multi-select section below the primary driver dropdown. Use a simple checkbox list of available drivers (filtered to exclude the primary driver). Label: "Co-Drivers (optional)". On save, call `updateRouteCoDrivers` with the selected IDs after the main route save.

    3. Pre-populate the co-driver checkboxes from `route.coDrivers` when editing an existing route.

    Pass `coDriverIds: string[]` through form state; on submit, after `updateRoute` succeeds, call `updateRouteCoDrivers(routeId, coDriverIds)`.
  </action>
  <verify>
    - Create a route and assign two co-drivers. Save. Reload. Both co-drivers appear checked.
    - Remove one co-driver. Save. Reload. Only one remains.
    - Route detail view shows co-driver names (add to `RouteDetail` component if it currently only shows primary driver).
    - `npx tsc --noEmit` passes.
  </verify>
  <done>Co-drivers can be assigned, saved, and updated on any route. Primary driver field unchanged. Route.name field saves and displays in title.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    1. Route page title condensed to short ID badge + route name or origin→destination
    2. Document upload immediately shows new documents without a page reload
    3. Co-driver multi-select on route edit form, persisted via RouteDriver join table
    4. Route name (optional) field on create/edit form
  </what-built>
  <how-to-verify>
    1. Open any route detail page — title should show "#7db72171" style badge + name or addresses, NOT a full address string.
    2. On the route detail page, upload a PDF in the Files section — it should appear in the list below without refreshing the page.
    3. Click "Edit Route" — confirm "Route Name" field and "Co-Drivers" checkbox list appear.
    4. Assign a co-driver, save — reload the page and confirm co-driver is still checked.
    5. View mode of route detail — confirm co-driver names are visible alongside primary driver.
    6. Run `npx tsc --noEmit` — no type errors.
  </how-to-verify>
  <resume-signal>Type "approved" or describe any issues found.</resume-signal>
</task>

</tasks>

<verification>
- `npx prisma validate` passes
- `npx tsc --noEmit` passes
- Document upload on route pages updates the list without page reload
- Route title is condensed (short ID + name/addresses)
- Co-drivers can be assigned and persisted on routes
</verification>

<success_criteria>
All three UX issues resolved: (1) route page title shows short ID + name, not full address; (2) document upload immediately reflects in the list; (3) multiple drivers can be assigned simultaneously to one route via the edit form.
</success_criteria>

<output>
After completion, create `.planning/quick/45-tkt-0011-routes-ux-condense-route-page-t/45-SUMMARY.md`
</output>
