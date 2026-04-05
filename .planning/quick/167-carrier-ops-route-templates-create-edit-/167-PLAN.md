---
phase: quick-167
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/templates/page.tsx
  - apps/web/src/app/(owner)/carrier/templates/new/page.tsx
  - apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx
  - apps/web/src/components/carrier/templates/RouteTemplateList.tsx
  - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
  - apps/web/src/components/carrier/templates/DispatchPreview.tsx
autonomous: true
must_haves:
  truths:
    - "User can view a list of route templates with all spec 5.5 columns"
    - "User can toggle a template active/inactive inline from the list"
    - "User can create a new route template with metadata + stops"
    - "User can edit an existing route template and see the yellow warning banner"
    - "User sees a dispatch preview table after saving a template"
    - "recurrence_rule validates that it starts with FREQ="
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/templates/page.tsx"
      provides: "List page server component"
    - path: "apps/web/src/components/carrier/templates/RouteTemplateList.tsx"
      provides: "Client list component with columns, active toggle, filters"
    - path: "apps/web/src/app/(owner)/carrier/templates/new/page.tsx"
      provides: "Create page shell"
    - path: "apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx"
      provides: "Edit page shell with server-side data fetch"
    - path: "apps/web/src/components/carrier/templates/RouteTemplateForm.tsx"
      provides: "Two-panel form with metadata left + StopBuilder right"
    - path: "apps/web/src/components/carrier/templates/DispatchPreview.tsx"
      provides: "Dispatch preview table below form"
  key_links:
    - from: "RouteTemplateForm.tsx"
      to: "/api/v1/carrier/route-templates"
      via: "fetch POST/PATCH"
      pattern: "fetch.*route-templates"
    - from: "RouteTemplateForm.tsx"
      to: "StopBuilder"
      via: "import and render with stops state"
      pattern: "import.*StopBuilder"
    - from: "RouteTemplateList.tsx"
      to: "/api/v1/carrier/route-templates/[id]"
      via: "PATCH active toggle"
      pattern: "fetch.*route-templates.*active"
    - from: "DispatchPreview.tsx"
      to: "/api/v1/carrier/route-templates/[id]/generate"
      via: "POST with generate_through_date"
      pattern: "fetch.*generate"
---

<objective>
Build the Route Templates list page and create/edit pages for the Carrier Ops module, wiring the existing StopBuilder component into a two-panel form layout.

Purpose: Enable carriers to manage recurring route templates with stops, schedule rules, and dispatch preview.
Output: 6 new files — 3 page routes + 3 components.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/carrier/facilities/page.tsx (list page pattern)
@apps/web/src/components/carrier/facilities/FacilityList.tsx (client list pattern)
@apps/web/src/components/carrier/facilities/FacilityForm.tsx (form pattern)
@apps/web/src/app/(owner)/carrier/contracts/new/page.tsx (new page shell pattern)
@apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx (edit page shell pattern)
@apps/web/src/components/carrier/stops/StopBuilder.tsx (StopBuilder — DO NOT MODIFY)
@apps/web/src/components/carrier/stops/StopCard.tsx (StopBuilderStop type — DO NOT MODIFY)
@apps/web/src/app/api/v1/carrier/route-templates/route.ts (GET list + POST create)
@apps/web/src/app/api/v1/carrier/route-templates/[id]/route.ts (GET detail + PATCH + DELETE)
@apps/web/src/app/api/v1/carrier/route-templates/[id]/generate/route.ts (POST generate dispatches)
@apps/web/src/lib/carrier/route-templates.ts (lib: list, get, create, update + computeNextOccurrence)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Route Templates list page + RouteTemplateList component</name>
  <files>
    apps/web/src/app/(owner)/carrier/templates/page.tsx
    apps/web/src/components/carrier/templates/RouteTemplateList.tsx
  </files>
  <action>
**page.tsx** — Server component following the facilities/page.tsx pattern:
- Import `getSession` from `@/lib/auth/supabase`, redirect if no session.
- Import `listRouteTemplates` from `@/lib/carrier/route-templates`.
- Fetch all templates (active=undefined or omit to get both active+inactive — BUT the API defaults to active=true, so call twice: once active=true, once active=false, then merge. OR better: add an `active: undefined` option — but we must NOT modify API routes. Instead, pass both sets to the client component and let it handle filtering). Actually, the simplest approach: the list page fetches with no active filter. Looking at `listRouteTemplates`, active defaults to `true`. Since the list should show all templates with an active toggle, the server component should just pass the org context and let the client component fetch via API with `active=` param as needed. Make page.tsx a thin shell that validates session and renders `<RouteTemplateList />`.
- Header: "Route Templates" title with subtitle showing count.
- "New Template" button linking to `/carrier/templates/new`.

**RouteTemplateList.tsx** — Client component ('use client'):
- On mount, fetch `GET /api/v1/carrier/route-templates` (default active=true). Add a toggle/filter to also show inactive.
- Render a table (use shadcn Table components if available, otherwise a styled HTML table) with columns:
  1. **Template Name** — link to `/carrier/templates/[id]`
  2. **Client** — display client name (the API response includes client relation data — check what `listRouteTemplates` returns; it returns the raw Prisma object which includes `clientId` but not client name. The lib includes `{ _count: { select: { stops: true } } }` but NOT client include. So we need the client name. Two options: (a) add client include to the lib function — but that modifies lib files not in scope. (b) Show clientId for now, OR fetch client list separately and join client-side. Use approach (b): fetch `/api/v1/carrier/clients` on mount, build a `clientMap: Record<id, name>`, display name from map.)
  3. **Contract** — show contract number if set (similarly, fetch contracts or just show contractId — keep it simple, show contractId or "—" if null)
  4. **Schedule** — human-readable from `recurrenceRule`. Write a `formatRecurrenceRule(rule: string, time?: string, tz?: string): string` helper that parses FREQ/BYDAY/BYMONTHDAY and renders e.g. "MWF 06:00 CT", "Daily 08:00 ET", "Monthly 1st,15th". Handle null → "—".
  5. **Equipment** — Badge component with equipmentType (e.g. "dry_van" → "Dry Van")
  6. **Stops** — show `_count.stops` number
  7. **Active** — inline Switch/toggle. On change, PATCH `/api/v1/carrier/route-templates/[id]` with `{ active: !current }`. Optimistically update UI. Use sonner toast on success/error.
  8. **Next Dispatch** — show `nextDispatchDate` (already computed by lib). Format as readable date or "—".
- Include a search input filtering by template name (client-side filter on fetched data).
- Include a "Show inactive" checkbox that refetches with `active=false` appended or fetches all.
- Style following existing FacilityList patterns: rounded-lg border cards, Badge for equipment type, consistent spacing.
  </action>
  <verify>
Run `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30` — no errors in the new files.
Navigate to `/carrier/templates` in browser — page loads without crash.
  </verify>
  <done>
List page renders with all 8 columns. Active toggle PATCHes the API. Search filters by name. "New Template" button links to create page.
  </done>
</task>

<task type="auto">
  <name>Task 2: RouteTemplateForm + DispatchPreview + create/edit pages</name>
  <files>
    apps/web/src/app/(owner)/carrier/templates/new/page.tsx
    apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx
    apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
    apps/web/src/components/carrier/templates/DispatchPreview.tsx
  </files>
  <action>
**RouteTemplateForm.tsx** — Client component ('use client'). Two-panel layout:

Props: `{ initialData?: RouteTemplateData; templateId?: string }` where `RouteTemplateData` includes all template fields + stops array.

LEFT PANEL (metadata form in a `div` with `w-full lg:w-1/2`):
- `template_name` — Input, required
- `client_id` — searchable Select. Fetch clients from `GET /api/v1/carrier/clients` on mount. Required.
- `contract_id` — Select filtered to selected client. When client changes, fetch `GET /api/v1/carrier/contracts?client_id=X`. Optional. Reset when client changes.
- `schedule_type` — Select with options: "recurring", "on_demand", "seasonal"
- `recurrence_rule` — Input with helper text: "RRULE format, e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR". Validate on blur: must start with "FREQ=" or show inline red error "Must start with FREQ=". Only show when schedule_type = "recurring".
- `recurrence_timezone` — Select with common IANA timezones: America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Phoenix, America/Anchorage, Pacific/Honolulu, UTC
- `scheduled_departure_time` — time Input (type="time")
- `equipment_type` — Select: dry_van, reefer, flatbed, step_deck, tanker, intermodal, power_only
- `temp_min_f` + `temp_max_f` — two number Inputs, only shown when equipment_type = "reefer"
- `max_weight_lbs` — number Input
- `commodity_description` — Input
- `default_driver_id` — Select. Fetch from `GET /api/v1/carrier/clients` — WRONG. There is no /api/v1/carrier/drivers endpoint. Check if drivers are available elsewhere. Since no carrier drivers API exists in the v1 routes, use a simple Input for driver ID for now, or skip and leave as optional empty. Actually look — the schema has `CarrierDriver` model and `defaultDriverId`. We should try listing them. Check if there's a `/api/v1/carrier/` drivers route — there isn't per earlier ls. So for now, omit the driver/truck selects and show text inputs with placeholder "Driver ID (UUID)" — mark with a TODO comment. Better approach: create a minimal fetch to the existing web API. Looking at the existing codebase, there might be driver data accessible. For simplicity, just leave these as optional text inputs labeled "Default Driver ID" and "Default Truck ID" with UUID format hint. These are optional fields anyway.
- `default_truck_id` — same as above, text Input with UUID hint
- `auto_generate_days_ahead` — number Input, default 7

RIGHT PANEL (`div` with `w-full lg:w-1/2`):
- Import `StopBuilder` and `StopBuilderStop` from `@/components/carrier/stops/StopBuilder`.
- Maintain `stops: StopBuilderStop[]` state. Initialize from `initialData.stops` mapped to StopBuilderStop format (map DB fields: `facilityId` → `facility_id`, `sequenceOrder` → `sequence_order`, `stopType` → `stop_type`, etc. Also map `facility.name` → `facility_name`, `facility.city` → `facility_city`, `facility.state` → `facility_state`).
- Render `<StopBuilder stops={stops} onChange={setStops} mode="template" />`.
- DO NOT modify StopBuilder components.

EDIT MODE banner:
- If `templateId` is set (edit mode), show a yellow banner at top: "Changes to this template will only apply to future auto-generated dispatches. Existing dispatches are not affected." Use `bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200` classes with an AlertTriangle icon.

SAVE BEHAVIOR:
- Create mode (no templateId): POST `/api/v1/carrier/route-templates` with form data. On success, save stops: for each stop, need to save RouteTemplateStop records. Since there's no dedicated stops API for templates, we need to handle this. Check if the route-templates API accepts stops in the create payload — looking at the schema, `createRouteTemplate` in the lib only creates the template record, not stops. So after creating the template, we need to create stops. There's no route-template-stops API endpoint. We have two options: (a) create a server action, or (b) use prisma directly from a new API helper. Since we should NOT create new API routes (not in scope), use a different approach: create stops via the existing Prisma lib by adding a helper function. BUT the constraint says "Files NOT to touch: existing API routes." The lib file `route-templates.ts` is NOT an API route — it's a lib file. However, to keep scope tight, the RouteTemplateForm should POST to the template API, get back the template ID, then for stops, make individual calls. Actually the cleanest approach given constraints: after POST creates the template, call a batch endpoint. Since no batch endpoint exists, we'll need to do it differently.

  REVISED APPROACH for stops: Add a `saveRouteTemplateStops` server action in a new file `apps/web/src/actions/carrier/route-template-stops.ts`. This server action:
  - Accepts `{ templateId: string, stops: StopBuilderStop[] }`
  - Validates session
  - Deletes existing RouteTemplateStop records for that template (for edit mode)
  - Creates new ones from the stops array
  - Uses prisma directly

  Actually, to avoid scope creep, use a simpler approach: POST stops data as part of the template create/update by extending the form to make direct fetch calls. The simplest: create one new server action file that handles the full save (template + stops) in a transaction. Add file: `apps/web/src/actions/carrier/save-route-template.ts`.

  **NEW FILE: apps/web/src/actions/carrier/save-route-template.ts**
  - 'use server' action
  - `saveRouteTemplate(data: { template fields, stops: array, templateId?: string })`
  - Validates session via getSession()
  - If templateId: PATCH template via `updateRouteTemplate`, then delete+recreate stops via prisma
  - If no templateId: create template via `createRouteTemplate`, then create stops via prisma
  - Use `prisma.$transaction` for atomicity
  - Return `{ success: true, templateId: string }` or `{ success: false, error: string }`

  The form calls this server action on submit. On success:
  - Create mode: redirect to `/carrier/templates/[newId]`
  - Edit mode: show success toast, refresh DispatchPreview

FORM VALIDATION:
- template_name required (non-empty)
- client_id required
- equipment_type required
- schedule_type required
- recurrence_rule: if provided, must start with "FREQ=" — show inline error
- At least 1 stop required

**DispatchPreview.tsx** — Client component:
- Props: `{ templateId: string }`
- On mount (and on "Regenerate" button click), POST to `/api/v1/carrier/route-templates/[templateId]/generate` with `{ generate_through_date: <today + 7 days ISO> }`.
- Note: this API actually CREATES dispatches, it doesn't just preview. So the preview should display already-created dispatches. Check the generate endpoint response — it returns `{ dispatches_created, skipped_existing, errors }` counts, not the actual dispatch records.
- REVISED: After calling generate, fetch the dispatches via `GET /api/v1/carrier/dispatches?route_template_id=[templateId]` to get the actual dispatch list. Display in a table with columns: date, day-of-week, dispatch_number (or ID), driver, truck.
- Check if dispatches API exists: there IS `/api/v1/carrier/dispatches/` based on ls output. Fetch from there.
- Show skeleton (4 rows of gray pulse bars) while loading.
- Show a "Regenerate" button that re-calls generate then re-fetches.
- Show summary: "N dispatches created, M skipped (already exist)".

**new/page.tsx** — Simple shell:
- Back link to `/carrier/templates`
- "New Route Template" heading
- Render `<RouteTemplateForm />`

**[id]/page.tsx** — Server component:
- Validate session, fetch template via `getRouteTemplate(orgId, id)` from lib
- If not found, call `notFound()`
- Serialize template data (convert Date fields to ISO strings)
- Map stops from DB format to `StopBuilderStop` format for initialData
- Back link to `/carrier/templates`
- "Edit Route Template" heading
- Render `<RouteTemplateForm initialData={serialized} templateId={id} />`
- Render `<DispatchPreview templateId={id} />` below the form
  </action>
  <verify>
Run `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30` — no errors.
Navigate to `/carrier/templates/new` — form renders with left+right panels.
Fill in required fields, add a stop via StopBuilder, submit — template is created and redirects to edit page.
Edit page shows yellow banner and DispatchPreview below.
  </verify>
  <done>
Create page renders two-panel form (metadata left, StopBuilder right). Edit page shows yellow warning banner. Form validates recurrence_rule starts with "FREQ=". Save creates/updates template + stops atomically. DispatchPreview generates and displays upcoming dispatches after save. StopBuilder components are NOT modified.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/web/tsconfig.json` passes with no errors in new files
- `/carrier/templates` list page shows all columns per spec
- `/carrier/templates/new` renders two-panel form
- `/carrier/templates/[id]` loads existing template data into form + shows yellow banner + dispatch preview
- Active toggle on list page PATCHes API and updates UI
- recurrence_rule shows inline error if it doesn't start with "FREQ="
- StopBuilder components (StopBuilder.tsx, StopCard.tsx, StopBuilderAddModal.tsx) are unchanged
</verification>

<success_criteria>
All 6 component/page files created. List page has all 8 columns including inline active toggle. Create/edit form has two-panel layout with StopBuilder. Edit page shows yellow warning banner. DispatchPreview generates and displays dispatches. Form validation enforces FREQ= prefix on recurrence rules. No modifications to StopBuilder components or existing API routes.
</success_criteria>

<output>
After completion, create `.planning/quick/167-carrier-ops-route-templates-create-edit-/167-SUMMARY.md`
</output>
