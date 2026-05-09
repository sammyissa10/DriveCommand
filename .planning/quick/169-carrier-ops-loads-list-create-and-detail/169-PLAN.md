---
phase: quick-169
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/loads/page.tsx
  - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/components/carrier/loads/LoadList.tsx
  - apps/web/src/components/carrier/loads/LoadForm.tsx
  - apps/web/src/components/carrier/loads/LoadFinancials.tsx
autonomous: true
must_haves:
  truths:
    - "User sees paginated loads list with client name, dispatch link, load_type badge, status badge, invoice_total"
    - "User can filter loads by client, status multi-select, and date range"
    - "User can create a load with required client_id validation and contract rate auto-population"
    - "User sees live-computed financial preview (base + FSC + detention + accessorials = invoice_total)"
    - "User can view/edit an existing load with all form sections populated"
  artifacts:
    - path: "apps/web/src/components/carrier/loads/LoadList.tsx"
      provides: "Client-side load list with filters and skeleton loading"
    - path: "apps/web/src/components/carrier/loads/LoadForm.tsx"
      provides: "Create/edit form with 8 sections including contract auto-populate and StopBuilder"
    - path: "apps/web/src/components/carrier/loads/LoadFinancials.tsx"
      provides: "Read-only computed financial preview using revenue-calculator formulas"
  key_links:
    - from: "LoadList.tsx"
      to: "/api/v1/carrier/loads"
      via: "fetch with query params"
    - from: "LoadForm.tsx"
      to: "/api/v1/carrier/contracts?client_id=X"
      via: "fetch when client selected"
    - from: "LoadForm.tsx"
      to: "/api/v1/carrier/loads"
      via: "POST on create, PATCH on edit"
    - from: "LoadFinancials.tsx"
      to: "revenue-calculator.ts formulas"
      via: "client-side calculateRevenue logic (inline, no import — server module)"
---

<objective>
Build the Carrier Ops Loads pages: list with filters, create/edit form with contract rate auto-population, and load detail with computed financials.

Purpose: Loads are the core revenue unit — this completes the load lifecycle UI for the carrier ops module.
Output: 3 pages (list, new, detail/edit) and 3 components (LoadList, LoadForm, LoadFinancials).
</objective>

<context>
@.planning/STATE.md
@apps/web/src/app/(owner)/carrier/dispatches/page.tsx
@apps/web/src/components/carrier/dispatches/DispatchList.tsx
@apps/web/src/app/api/v1/carrier/loads/route.ts
@apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/lib/carrier/revenue-calculator.ts
@apps/web/src/components/carrier/stops/StopBuilder.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: LoadList component and list page</name>
  <files>
    apps/web/src/components/carrier/loads/LoadList.tsx
    apps/web/src/app/(owner)/carrier/loads/page.tsx
  </files>
  <action>
Create LoadList.tsx as a 'use client' component. Follow the same pattern as DispatchList.tsx (client-side fetch with useEffect, skeleton loading state).

**Props:** `clientMap: Record<string, string>` (id->name, passed from server page).

**State:** loads array, loading boolean, pagination (page, total), filters (clientId, statuses array, dateFrom, dateTo).

**Fetch:** GET /api/v1/carrier/loads with query params: client_id, status (comma-join for multi), date_from, date_to, page, pageSize=25. Re-fetch on filter or page change.

**Skeleton:** While loading, render 6 rows of animate-pulse placeholder bars matching column widths.

**Filters row (flex-wrap gap-3):**
- Client select: `<select>` with "All Clients" default + clientMap entries.
- Status multi-select: Render status options as toggle badges (like DispatchList pattern). Statuses: pending, in_transit, delivered, cancelled, invoiced. Clicking toggles inclusion. Use same STATUS_BADGE_CLASSES pattern from DispatchList (color per status).
- Date range: two `<input type="date">` for From / To.
- "New Load" Link button (Plus icon) → /carrier/loads/new. Positioned right via ml-auto.

**Table columns:**
1. Load # (load.referenceNumber) — plain text
2. Client — Link to /carrier/clients/[clientId], text = client name from clientMap
3. Dispatch — if load.dispatchId: Link to /carrier/dispatches/[dispatchId], text = dispatch.notes or dispatch ID truncated. Else: Badge variant="outline" with "Unassigned"
4. Type — Badge with load.loadType uppercased (ftl→FTL, ltl→LTL, etc)
5. Status — Badge with colored variant per status (same color scheme as dispatches: pending=slate, in_transit=blue, delivered=green, cancelled=red, invoiced=purple)
6. Total — formatted as currency ($X,XXX.XX) from load.totalRevenue, or "—" if null

Each row is a Link wrapping the entire `<tr>` to /carrier/loads/[id].

**Pagination:** Simple prev/next below table, showing "Page X of Y".

**Page (page.tsx):** Server component. Auth check (getSession, redirect if no session). Fetch all clients via prisma.carrierClient.findMany (orgId, select id+name, orderBy name asc). Build clientMap. Render heading "Loads" with subtitle, then `<LoadList clientMap={clientMap} />`.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30` — no errors in the new files.</verify>
  <done>Loads list page renders at /carrier/loads with skeleton loading, filters (client, status toggles, date range), paginated table with linked client/dispatch columns, and New Load button.</done>
</task>

<task type="auto">
  <name>Task 2: LoadForm and LoadFinancials components, create and detail pages</name>
  <files>
    apps/web/src/components/carrier/loads/LoadForm.tsx
    apps/web/src/components/carrier/loads/LoadFinancials.tsx
    apps/web/src/app/(owner)/carrier/loads/new/page.tsx
    apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  </files>
  <action>
**LoadFinancials.tsx** — 'use client' component.

Props: `rateType: string, rateAmount: number, weightLbs: number, pallets: number, otherCharges: number, fuelSurchargeMethod: string, fuelSurchargeRate: number, brokerFlag: boolean, carrierCost: number`. All optional with defaults of 0/empty.

Implement the calculateRevenue formula CLIENT-SIDE (cannot import revenue-calculator.ts — it imports prisma). Replicate the logic from `apps/web/src/lib/carrier/revenue-calculator.ts`:
- baseRevenue: switch on rateType (flat=rateAmount, per_cwt=rateAmount*weightLbs/100, per_pallet=rateAmount*pallets, hourly=rateAmount*8, per_mile/per_stop show baseRevenue=rateAmount with note "miles/stops needed for exact calc")
- fuelSurcharge: if fuelSurchargeMethod=percent_of_linehaul → baseRevenue*fuelSurchargeRate; if per_mile → show "per-mile FSC (miles needed)"
- detentionAmount: 0 (no column exists)
- totalRevenue = baseRevenue + fuelSurcharge + 0 + otherCharges
- If brokerFlag: grossMargin = totalRevenue - carrierCost

Render as a card (border rounded-lg p-4 bg-muted/30) with title "Financial Preview". Show each line item as a row: label left, value right, formatted as currency. Total line bold with top border. If brokerFlag, show gross margin line below total (green if positive, red if negative).

**LoadForm.tsx** — 'use client' component.

Props: `mode: 'create' | 'edit', initialData?: LoadData, clients: {id,name}[], loadId?: string`.

State: form fields matching CarrierLoad columns. Also: contracts array (fetched when client changes), selectedContract object, submitting boolean, errors record.

**Section 1 — Client and Contract:**
- client_id: searchable select (use a text input with filtered dropdown, or a simple `<select>` with search — keep it simple, use `<select>` with all clients). Show red asterisk on label. If form submitted without client_id, show red "Client is required" text below.
- contract_id: `<select>` — hidden until client_id selected. On client_id change: fetch GET /api/v1/carrier/contracts?client_id=X&status=active. Populate select with contractNumber options.
- On contract select: auto-fill rateType, rateAmount (from baseRate), fuelSurchargeMethod, fuelSurchargeRate. Show `<span className="text-xs text-muted-foreground ml-2">from contract</span>` next to each auto-populated field.

**Section 2 — Freight Details:**
- loadType: select (ftl, ltl, partial, drayage, intermodal)
- commodityDescription: text input (required, red asterisk)
- commodityWeightLbs: number input
- commodityPieces: number input
- commodityClass: text input (note: not in DB schema — skip this field, it doesn't exist in CarrierLoad model)
- commodityPallets: number input

**Section 3 — Rate:**
- rateType: select with options per_mile, flat, per_cwt, per_pallet, per_stop, hourly
- rateAmount: number input with dynamic label based on rateType:
  - per_mile → "Rate per Mile ($)"
  - flat → "Flat Rate ($)"
  - per_cwt → "Rate per CWT ($)"
  - per_pallet → "Rate per Pallet ($)"
  - per_stop → "Rate per Delivery Stop ($)"
  - hourly → "Hourly Rate ($/hr)"
- otherCharges: number input labeled "Accessorial / Other Charges ($)"
- Render `<LoadFinancials .../>` below with current form values, updating live as user types.

**Section 4 — Appointments:**
- pickupApptStart, pickupApptEnd, deliveryApptStart, deliveryApptEnd: `<input type="datetime-local">`. Note: these fields don't exist on CarrierLoad model directly — they are stop-level fields. Include them in the form UI but store them as notes or skip DB persistence for now. Add a comment: `// TODO: appointment fields are stop-level, not load-level — wire to stops when stop creation is integrated`.

**Section 5 — Broker Toggle:**
- brokerFlag: Switch component. When enabled, show carrierCost number input. Show computed gross_margin = invoice_total - carrierCost (from LoadFinancials).

**Section 6 — Rate Confirmation:**
- File input (`<input type="file">`). On submit, skip file upload for now — add comment `// TODO: wire file upload to R2 presigned URL endpoint`.

**Section 7 — Driver Instructions:**
- specialInstructions: textarea

**Section 8 — Stop Builder (conditional):**
- Only show when mode='create' AND no dispatchId. Import StopBuilder from '@/components/carrier/stops/StopBuilder'. Render in mode='load'. Manage stops state array, pass onChange. Add comment `// TODO: persist stops on save — currently display-only`.

**Submit button:** "Create Load" or "Save Changes". On click: validate client_id required. POST /api/v1/carrier/loads (create) or PATCH /api/v1/carrier/loads/[id] (edit). On success: toast.success, router.push to /carrier/loads/[id] (create) or /carrier/loads (edit). On error: toast.error with message.

**new/page.tsx:** Server component. Auth check. Fetch clients list (prisma.carrierClient.findMany orgId, select id+name, orderBy name). Render heading "New Load", then `<LoadForm mode="create" clients={clients} />`.

**[id]/page.tsx:** Server component. Auth check. Fetch load via getLoad(orgId, id) from '@/lib/carrier/loads'. If not found, notFound(). Fetch clients list. Transform load data to match LoadForm initialData shape (convert Decimals to numbers). Render heading "Load {referenceNumber}", then `<LoadForm mode="edit" initialData={data} clients={clients} loadId={id} />`.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30` — no errors in new files. Manually verify /carrier/loads/new renders the form with all 8 sections.</verify>
  <done>Create and detail pages render LoadForm with all sections. Contract auto-populates rate fields with "from contract" label. LoadFinancials shows live-computed preview. Client_id validation prevents submission without client. StopBuilder renders in load mode on create.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/web/tsconfig.json` passes with no errors in new files
- /carrier/loads renders list with filters and pagination
- /carrier/loads/new renders form with all 8 sections
- /carrier/loads/[id] renders form in edit mode with pre-populated data
- LoadFinancials updates live as rate fields change
- Client select shows red error when form submitted without selection
- Contract select appears and auto-populates rate fields when client chosen
</verification>

<success_criteria>
- 6 new files created, 0 existing files modified
- List page shows loads with client links, dispatch links, type/status badges, currency total
- Filters: client select, status multi-toggle, date range — all functional
- Form enforces client_id required with inline error
- Contract selection auto-fills rate_type, rate_amount, FSC fields with "from contract" labels
- LoadFinancials computes and displays base_rate + FSC + detention + accessorials = invoice_total
- Broker toggle shows carrier_cost input and gross_margin
- StopBuilder renders in load mode on create page (no dispatch)
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/169-carrier-ops-loads-list-create-and-detail/169-SUMMARY.md`
</output>
