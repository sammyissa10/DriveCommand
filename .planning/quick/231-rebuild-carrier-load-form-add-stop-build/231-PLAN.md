---
phase: quick-231
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/loads/LoadForm.tsx
  - apps/web/src/components/carrier/loads/LoadFinancials.tsx
  - apps/web/src/components/carrier/loads/LoadList.tsx
  - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/app/api/v1/carrier/loads/route.ts
  - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
  - apps/web/src/lib/carrier/loads.ts
autonomous: true
must_haves:
  truths:
    - "Load form shows 5 clean sections: Client & Contract, Freight Details, Stops, Rate & Financials, References"
    - "Client dropdown shows company names not database IDs"
    - "Rate label updates dynamically when rate type changes"
    - "Planned Miles field only visible when rate type is per_mile"
    - "Stop builder section present with add/remove/reorder in both create and edit modes"
    - "Saving a load with stops persists stop records when load has a dispatch"
    - "Financial Preview hides $0.00 rows"
    - "Rate Confirmation uploads to R2 successfully"
    - "PRO Number, Pallets, FSC Method/Rate editable fields, appointment placeholder section, and file upload placeholder note are removed"
  artifacts:
    - path: "apps/web/src/components/carrier/loads/LoadForm.tsx"
      provides: "Rebuilt 5-section load form with stop builder, R2 upload, dynamic labels"
    - path: "apps/web/src/components/carrier/loads/LoadFinancials.tsx"
      provides: "Financial preview that hides zero rows"
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "Stop CRUD on load create/update"
  key_links:
    - from: "LoadForm.tsx"
      to: "/api/v1/carrier/loads"
      via: "fetch POST/PATCH with stops array in payload"
      pattern: "stops.*StopBuilderStop"
    - from: "LoadForm.tsx"
      to: "/api/v1/carrier/documents"
      via: "FormData POST for rate confirmation upload"
      pattern: "carrier/documents"
---

<objective>
Rebuild the carrier load create/edit form: reorganize into 5 clean sections, remove pointless fields, fix client name display, add dynamic rate labels, wire stop builder persistence, wire R2 rate confirmation upload, and make Financial Preview hide zero rows.

Purpose: The current load form has dead fields, broken client display, and the stop builder is display-only. This makes the form production-ready.
Output: Fully functional load form with stop builder, R2 upload, clean sections.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/loads/LoadForm.tsx
@apps/web/src/components/carrier/loads/LoadFinancials.tsx
@apps/web/src/components/carrier/loads/LoadList.tsx
@apps/web/src/app/(owner)/carrier/loads/new/page.tsx
@apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
@apps/web/src/app/api/v1/carrier/loads/route.ts
@apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/components/carrier/stops/StopBuilder.tsx
@apps/web/src/components/carrier/stops/StopCard.tsx
@apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
@apps/web/src/app/api/v1/carrier/documents/route.ts
@apps/web/src/generated/prisma/schema.prisma (search for CarrierStop, CarrierLoad, CarrierClient models)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebuild LoadForm layout, remove dead fields, fix client display, add dynamic labels and R2 upload</name>
  <files>
    apps/web/src/components/carrier/loads/LoadForm.tsx
    apps/web/src/components/carrier/loads/LoadFinancials.tsx
    apps/web/src/components/carrier/loads/LoadList.tsx
    apps/web/src/app/(owner)/carrier/loads/new/page.tsx
    apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  </files>
  <action>
**LoadForm.tsx — complete rebuild of the form layout into 5 sections:**

Section 1 — Client and Contract (keep existing logic, already works):
- Client dropdown (required) — already shows `c.name`, but the `new/page.tsx` and `[id]/page.tsx` pass `{ id, name }` from `carrierClient.findMany({ select: { id: true, name: true } })`. The `name` field on CarrierClient IS the company name (column is literally `name`), so this is actually correct already. BUT the LoadList uses `clientMap[load.clientId]` which falls back to raw `load.clientId` if not in map — verify the list page query populates clientMap correctly.
- Contract dropdown filtered by client (keep existing logic, already works)
- When contract selected: auto-populate rate fields as editable overrides (keep existing)

Section 2 — Freight Details:
- Load Type (FTL/LTL/Partial/Drayage/Intermodal) — keep
- Commodity Description (required) — keep
- Weight (lbs) — keep
- Pieces — keep
- Hazmat toggle — keep
- BOL Number — keep
- PO Number — keep
- **REMOVE:** PRO Number field and `proNumber` state entirely
- **REMOVE:** Pallets field and `commodityPallets` state entirely
- **REMOVE:** Do NOT send `proNumber` or `commodityPallets` in the submit payload

Section 3 — Stops:
- Show StopBuilder in BOTH create and edit modes (currently only shown in create mode without dispatchId)
- Remove the restriction `mode === 'create' && !initialData?.dispatchId`
- For edit mode: load existing stops from the load data and pass as initial stops to StopBuilder
- Update `LoadData` interface to include `stops?: StopBuilderStop[]`
- In `[id]/page.tsx`, map `load.stops` from Prisma format to `StopBuilderStop` format and pass in `initialData.stops`
- Remove the placeholder text "Stop data is for planning purposes..." and "stops will be linked to the load in a future update"

Section 4 — Rate and Financials:
- Rate Type dropdown — keep
- Rate Amount with dynamic label from `RATE_TYPE_LABELS` — already implemented, keep
- Planned Miles — already conditionally shown for per_mile only, keep
- Accessorial / Other Charges — keep
- Broker Mode toggle + Carrier Cost field — keep (move from separate section into this one)
- **REMOVE:** FSC Method dropdown and FSC Rate input fields entirely. FSC is inherited from contract and computed in LoadFinancials — not editable on the load form. Remove `fuelSurchargeMethod` and `fuelSurchargeRate` state variables. Do NOT send them in the payload. The LoadFinancials component will still receive FSC data from the contract (passed as read-only props).
- Financial Preview (LoadFinancials component) — keep inline at bottom of this section

- **REMOVE:** The entire "Appointments" section (Section 4 in old layout). Appointment times are stop-level fields, handled in the StopBuilder/StopCard. Remove `pickupApptStart`, `pickupApptEnd`, `deliveryApptStart`, `deliveryApptEnd` state variables.

Section 5 — References:
- Rate Confirmation Upload — wire to R2 using the existing `/api/v1/carrier/documents` endpoint:
  - When file selected, POST FormData to `/api/v1/carrier/documents` with `parent_type=load`, `parent_id=loadId` (edit mode) or save loadId after creation then upload (create mode), `document_type=rate_confirmation`
  - For create mode: save the load first, get the returned ID, then upload the file as a second step
  - Show upload progress state (uploading... / uploaded filename)
  - For edit mode: fetch existing documents for this load (`GET /api/v1/carrier/documents?parent_type=load&parent_id={loadId}`) and show any existing rate confirmation with a download link
  - **REMOVE** the placeholder text "File upload will be wired to R2 storage in a future update."
- Special/Driver Instructions textarea — keep

**LoadFinancials.tsx — hide zero rows:**
- Only render a row if its value is non-zero or has a meaningful note
- Specifically: hide "Fuel Surcharge" row if fuelSurcharge === 0 AND no fscNote, hide "Detention" row always (it's hardcoded to $0.00), hide "Accessorial / Other" row if other === 0
- Always show Base Revenue and Invoice Total rows
- Always show Gross Margin row when brokerFlag is true

**LoadList.tsx — verify client name display:**
- The list already uses `clientMap[load.clientId] ?? load.clientId` as fallback. Check that the loads list page passes a proper clientMap. The API returns `load.client.name` via the include. Update the LoadList to read client name from `load.client?.name` instead of relying on a separate clientMap prop, OR ensure the parent page builds clientMap correctly. The simpler fix: the API `listLoads` already includes `client: { select: { name: true } }`, so the response items have `client.name`. Update LoadItem interface to include `client: { name: string } | null` and display `load.client?.name ?? 'Unknown'` instead of `clientMap[load.clientId] ?? load.clientId`. Then LoadListProps no longer needs clientMap — or keep it as fallback. Whichever is cleaner.
- Also update the loads list page.tsx that renders LoadList to pass client data appropriately.

**new/page.tsx and [id]/page.tsx:**
- In `[id]/page.tsx`: map `load.stops` to `StopBuilderStop[]` format and include in `initialData`. The Prisma CarrierStop fields map to StopBuilderStop as:
  - `id` -> `id`
  - `facilityId` -> `facility_id`
  - facility name/city/state need to be included in the getLoad query (add `facility: { select: { name: true, city: true, state: true } }` to the stops include)
  - `sequenceOrder` -> `sequence_order`
  - `stopType` -> `stop_type`
  - `contactName` -> `contact_name`
  - `contactPhone` -> `contact_phone`
  - `commodityDescription` -> `commodity_description`
  - `bolRequired` -> `bol_required`
  - `podRequired` -> `pod_required`
  - `specialInstructions` -> `special_instructions`
  - `appointmentStart` -> `appointment_start` (as ISO string)
  - `appointmentEnd` -> `appointment_end` (as ISO string)
  - `appt_window_start_offset_min` -> null (not applicable to load mode)
  - `appt_window_end_offset_min` -> null
  - `expected_dwell_minutes` -> null (not on CarrierStop model)

- In `lib/carrier/loads.ts` `getLoad`: update the stops include to add facility select: `stops: { orderBy: { sequenceOrder: 'asc' }, include: { facility: { select: { name: true, city: true, state: true } } } }`
  </action>
  <verify>
- `npx tsc --noEmit` passes with no errors in apps/web
- Load form at `/carrier/loads/new` shows 5 sections in order: Client & Contract, Freight Details, Stops, Rate & Financials, References
- No PRO Number, Pallets, FSC Method, FSC Rate editable fields, or Appointment section visible
- Rate label changes when rate type dropdown changes
- Planned Miles field only visible when rate type = per_mile
- Client name shows in load list table (not raw ID)
- Financial Preview hides zero-value rows (no "$0.00" detention row)
  </verify>
  <done>
- Form has exactly 5 sections with clean layout
- Dead fields removed (PRO Number, Pallets, FSC Method/Rate, Appointments placeholder)
- Dynamic rate label works for all 7 rate types
- Planned Miles conditionally shown
- Client displays company name everywhere
- Financial Preview hides meaningless zero rows
- Stop builder visible in both create and edit modes
- Rate confirmation upload wired to R2
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire stop persistence in load create/update API</name>
  <files>
    apps/web/src/app/api/v1/carrier/loads/route.ts
    apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    apps/web/src/lib/carrier/loads.ts
    apps/web/src/components/carrier/loads/LoadForm.tsx
  </files>
  <action>
**CRITICAL SCHEMA CONSTRAINT:** `CarrierStop.dispatchId` is REQUIRED (not nullable) in the Prisma schema, and there is a unique constraint on `[dispatchId, sequenceOrder]`. This means stops CANNOT be created in the database without a dispatch. The task description says "do not modify database schema." Therefore:

- When a load has a `dispatchId` (either provided at creation or already assigned): create/update/delete stops in the `CarrierStop` table linked to that dispatch
- When a load has NO `dispatchId`: the stop builder data is saved as JSON in the `notes` field (temporary storage) with a `[STOPS_JSON=...]` marker, similar to how dispatch numbers are stored. When the load later gets assigned to a dispatch, the stops should be materialized. OR — simpler approach — only persist stops when dispatchId exists, and show a clear info message in the UI: "Stops will be saved when this load is assigned to a dispatch."

**Chosen approach: persist stops when dispatchId exists, info banner when not.**

**LoadForm.tsx submit changes:**
- Include `stops` array in the POST/PATCH payload (serialize StopBuilderStop[] to API format)
- Each stop in payload: `{ facility_id, stop_type, sequence_order, contact_name, contact_phone, commodity_description, bol_required, pod_required, special_instructions, appointment_start, appointment_end, pieces, weight_lbs }`
- Add stop validation before submit: if stops exist, every stop must have `facility_id` selected

**API route schema changes:**
- In `LoadCreateSchema` and `LoadUpdateSchema` (in both route.ts files), add optional `stops` array field:
  ```
  stops: z.array(z.object({
    id: z.string().uuid().optional(),
    facility_id: z.string().uuid(),
    stop_type: z.enum(['pickup', 'delivery', 'fuel_stop', 'layover']),
    sequence_order: z.number().int(),
    contact_name: z.string().nullable().optional(),
    contact_phone: z.string().nullable().optional(),
    commodity_description: z.string().nullable().optional(),
    pieces: z.number().int().nullable().optional(),
    weight_lbs: z.number().nullable().optional(),
    bol_required: z.boolean().optional(),
    pod_required: z.boolean().optional(),
    special_instructions: z.string().nullable().optional(),
    appointment_start: z.string().nullable().optional(),
    appointment_end: z.string().nullable().optional(),
  })).optional()
  ```
- Pass `parsed.data` (including stops) through to `createLoad` / `updateLoad`

**lib/carrier/loads.ts `createLoad` changes:**
- Accept `stops` in `LoadCreateInput`
- After creating the load, if `data.stops` exists AND the load has a `dispatchId`:
  - Verify each stop's `facility_id` belongs to `orgId` (tenant isolation): `prisma.carrierFacility.findFirst({ where: { id: facilityId, orgId } })`
  - Create `CarrierStop` records: `prisma.carrierStop.createMany({ data: stops.map(s => ({ dispatchId: load.dispatchId, loadId: load.id, facilityId: s.facility_id, stopType: s.stop_type, sequenceOrder: s.sequence_order, contactName: s.contact_name, contactPhone: s.contact_phone, commodityDescription: s.commodity_description, pieces: s.pieces, weightLbs: s.weight_lbs, bolRequired: s.bol_required ?? true, podRequired: s.pod_required ?? true, specialInstructions: s.special_instructions, appointmentStart: s.appointment_start ? new Date(s.appointment_start) : null, appointmentEnd: s.appointment_end ? new Date(s.appointment_end) : null })) })`

**lib/carrier/loads.ts `updateLoad` changes:**
- Accept `stops` in `LoadUpdateInput`
- If `data.stops` is provided AND the load has a `dispatchId` (either existing or newly assigned):
  - Fetch existing stops for this load: `prisma.carrierStop.findMany({ where: { loadId: id } })`
  - Diff: stops with matching `id` -> update, stops without `id` -> create, existing stops not in payload -> delete ONLY if status is 'pending'
  - Verify facility ownership for all new/updated facilities
  - Use a transaction for the diff operations

**LoadForm.tsx UI info banner:**
- If the load has no dispatchId, show an info banner above the stop builder: "Stops added here will be saved when this load is assigned to a dispatch." using a blue info-style banner.
- If load has a dispatchId, no banner needed — stops save normally.

**Tenant isolation enforcement:**
- All facility IDs in stop data must be verified to belong to session orgId before creating stop records
- orgId comes from session, never from form payload
  </action>
  <verify>
- `npx tsc --noEmit` passes
- Create a load with a dispatchId and 2 stops (1 pickup, 1 delivery) -> verify stops appear in database: `SELECT * FROM stops WHERE load_id = '{id}'`
- Edit that load, add a third stop -> verify 3 stops exist
- Edit that load, remove a pending stop -> verify it's deleted
- Load without dispatch shows info banner about stops saving later
- Attempting to use a facility_id from another org returns error
  </verify>
  <done>
- Stops persist to CarrierStop table when load has a dispatch
- Stop CRUD on update: create new, update changed, delete removed pending stops
- Facility ownership verified (tenant isolation)
- Info banner shown for loads without dispatch
- No TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. Load form at `/carrier/loads/new` renders all 5 sections cleanly with no dead fields
2. Client dropdown shows company names, not IDs — both in form and load list
3. Rate label dynamically updates for all 7 rate types
4. Planned Miles field hides for non-per-mile rate types
5. Stop builder visible and functional in both create and edit modes
6. Saving a load with stops (when dispatch exists) creates stop records
7. Editing stops diffs correctly (add/update/delete)
8. Rate Confirmation file uploads to R2 via `/api/v1/carrier/documents`
9. Financial Preview hides zero-value rows
10. `npx tsc --noEmit` passes
11. Load list shows client names properly
</verification>

<success_criteria>
- All 5 form sections render in order with no dead fields
- Client name displays correctly in form dropdown AND load list table
- Rate label is dynamic, planned miles conditional
- Stop builder works in create + edit, persists when dispatch exists
- R2 upload functional for rate confirmation
- Financial Preview clean (no zero rows)
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/231-rebuild-carrier-load-form-add-stop-build/231-SUMMARY.md`
</output>
