---
phase: quick-474
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/contracts/compute-contract-status.ts
  - apps/web/src/lib/contracts/format-rate.ts
  - apps/web/src/app/(owner)/actions/contracts.ts
  - apps/web/src/app/(owner)/contracts/page.tsx
  - apps/web/src/app/(owner)/contracts/loading.tsx
  - apps/web/src/app/(owner)/contracts/_components/ContractsKPICards.tsx
  - apps/web/src/app/(owner)/contracts/_components/ContractsDataGrid.tsx
  - apps/web/src/app/(owner)/contracts/_components/ContractsPageClient.tsx
  - apps/web/src/app/(owner)/contracts/new/page.tsx
  - apps/web/src/app/(owner)/contracts/new/_components/ContractCreateForm.tsx
  - apps/web/src/app/(owner)/contracts/[id]/page.tsx
  - apps/web/src/app/(owner)/contracts/[id]/_components/ContractRecord.tsx
  - apps/web/src/app/(owner)/contracts/[id]/edit/page.tsx
autonomous: true

must_haves:
  truths:
    - "User can see list of contracts with computed status badges"
    - "User can create a new contract with client picker"
    - "User can view contract details with all fields displayed"
    - "User can edit contract and save changes"
    - "User can filter contracts by status tabs (All/Active/Expiring/Expired/Draft)"
  artifacts:
    - path: "apps/web/src/lib/contracts/compute-contract-status.ts"
      provides: "Status computation logic and types"
      exports: ["computeContractStatus", "ContractWithRelations", "ContractStatusResult"]
    - path: "apps/web/src/app/(owner)/actions/contracts.ts"
      provides: "Server actions for CRUD"
      exports: ["listContracts", "getContract", "createContract", "updateContract", "deleteContract", "generateContractNumber"]
    - path: "apps/web/src/app/(owner)/contracts/page.tsx"
      provides: "Overview page with Suspense streaming"
    - path: "apps/web/src/app/(owner)/contracts/[id]/_components/ContractRecord.tsx"
      provides: "Unified view/edit component"
  key_links:
    - from: "ContractsDataGrid"
      to: "computeContractStatus"
      via: "imports status computation"
      pattern: "computeContractStatus\\(contract\\)"
    - from: "ContractRecord"
      to: "updateContract action"
      via: "form submit"
      pattern: "updateAction"
    - from: "ContractCreateForm"
      to: "/api/v1/carrier/clients"
      via: "fetch for client picker"
      pattern: "fetch.*carrier/clients"
---

<objective>
Build the Contracts section per approved spec: overview page (KPIs, status tabs, search, data grid), quick-create page (sectioned form with client picker), and unified view/edit pages.

Purpose: Enable carriers to manage rate agreements with clients.
Output: Full CRUD UI for CarrierContract entity.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/contracts-spec.md
@.planning/design-system.md
@apps/web/src/app/(owner)/clients/page.tsx
@apps/web/src/app/(owner)/clients/_components/ClientsDataGrid.tsx
@apps/web/src/app/(owner)/clients/_components/ClientsPageClient.tsx
@apps/web/src/app/(owner)/clients/[id]/_components/ClientRecord.tsx
@apps/web/src/app/(owner)/actions/clients.ts
@apps/web/src/lib/clients/compute-client-status.ts
@apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Contract utilities, types, and server actions</name>
  <files>
    apps/web/src/lib/contracts/compute-contract-status.ts
    apps/web/src/lib/contracts/format-rate.ts
    apps/web/src/app/(owner)/actions/contracts.ts
  </files>
  <action>
Create lib/contracts/ directory with two files:

**compute-contract-status.ts:**
- Define `ContractWithRelations` interface matching spec section 7 (includes client relation, _count for loads/templates, audit fields)
- Define `ContractStatusVariant` type: 'success' | 'warning' | 'danger' | 'neutral' | 'info'
- Define `ContractAlert` interface: { variant, message }
- Define `ContractStatusResult` interface: { status, variant, alert }
- Export `computeContractStatus(contract)` function implementing spec section 2.2 logic:
  - terminated -> Terminated/neutral
  - expired (expirationDate < today) -> Expired/danger with alert
  - expiring soon (<=30 days) -> Expiring Soon/warning with alert
  - future effectiveDate -> Pending/info with alert
  - no effectiveDate + draft -> Draft/neutral
  - else -> Active/success
- Export `getStatusTabValue(contract)` -> 'all' | 'active' | 'expiring' | 'expired' | 'draft'
- Export `ContractStatusTabValue` type

**format-rate.ts:**
- Export `formatRate(rate: Decimal | number | null, rateType: string)` returning formatted string:
  - per_mile: "$X.XX/mi"
  - flat: "$X,XXX"
  - percentage: "X.X%"
  - hourly: "$XX.XX/hr"
  - default: "$X.XX"
- Export `formatDetentionTime(minutes: number)` returning "X hours Y minutes" or "X hours"
- Export `RateType` type

**actions/contracts.ts:**
- Copy pattern from actions/clients.ts exactly
- Import requireRole, requireAuth, getTenantPrisma, requireTenantId
- Define Zod schemas:
  - createContractSchema (contractNumber required, clientId required, defaults for contractType/rateType)
  - updateContractSchema (extends create, adds accessorial fields, omits contractNumber as immutable)
- Server actions:
  - `listContracts(params?)` - query carrierContract with deletedAt:null, include client relation, _count for carrierLoads/routeTemplates
  - `getContract(id)` - findUnique with createdBy/updatedBy/client includes
  - `createContract(prevState, formData)` - validate, create, revalidatePath, redirect to detail
  - `updateContract(id, prevState, formData)` - validate, update, revalidatePath, redirect to detail
  - `deleteContract(id)` - soft delete with deletedAt/deletedById
  - `generateContractNumber()` - return `CNT-{YYYYMMDD}-{XXXX}` (4 random alphanumeric)

Use formString/formStringOrNull helpers. Auth check FIRST in every action.
  </action>
  <verify>
`tsc --noEmit` passes with no errors in the new files.
  </verify>
  <done>
Contract status computation matches spec logic, rate formatting works for all types, and all 6 server actions are implemented with proper auth and validation.
  </done>
</task>

<task type="auto">
  <name>Task 2: Contracts overview page with KPIs, tabs, search, data grid</name>
  <files>
    apps/web/src/app/(owner)/contracts/page.tsx
    apps/web/src/app/(owner)/contracts/loading.tsx
    apps/web/src/app/(owner)/contracts/_components/ContractsKPICards.tsx
    apps/web/src/app/(owner)/contracts/_components/ContractsDataGrid.tsx
    apps/web/src/app/(owner)/contracts/_components/ContractsPageClient.tsx
  </files>
  <action>
Create contracts/ directory structure. Mirror clients/ implementation exactly.

**page.tsx (server component):**
- Import Suspense, listContracts, deleteContract
- Define computeKPIData function counting total/active/expiring/expired using computeContractStatus
- Async ContractsContent component:
  - Await listContracts
  - Compute KPI data
  - Render ContractsKPICards + ContractsPageClient
- ContractsContentSkeleton: 4 KPI skeletons + tabs skeleton + search skeleton + table skeleton
- Default export: header (title "Contracts", subtitle "Manage client rate agreements", Add Contract button linking to /contracts/new) + Suspense wrapper

**loading.tsx:**
- Export default skeleton (same as ContractsContentSkeleton)

**ContractsKPICards.tsx:**
- Props: ContractKPIData { total, active, expiring, expired }
- Use KPICardGrid with 4 KPICards:
  - Total Contracts (FileText icon)
  - Active (CheckCircle icon, success variant)
  - Expiring Soon (Clock icon, warning variant)
  - Expired (AlertTriangle icon, danger variant)

**ContractsPageClient.tsx:**
- Client component with useOptimistic for optimistic deletes
- Passes optimistic list to ContractsDataGrid

**ContractsDataGrid.tsx:**
- Copy ClientsDataGrid structure exactly, adapt for contracts:
- State: sorting, globalFilter, activeTab, selectedIds, activeFilters
- Tab counts: all/active/expiring/expired/draft (use getStatusTabValue)
- StatusTabs with 5 tabs
- SearchBar with placeholder "Search by contract number, name, or client..."
- TanStack Table columns:
  - select (checkbox)
  - contractNumber (sortable, mono font)
  - contractName (sortable, truncate)
  - client (sortable, show client.name, link to /clients/[clientId])
  - contractType (badge: Spot/Dedicated/Volume/Broker)
  - rate (formatted with formatRate)
  - effectiveDate (sortable, formatted date or em dash)
  - expirationDate (sortable, formatted date + AlertBadge if expiring/expired)
  - status (StatusBadge from computeContractStatus)
  - actions (Manage link with Eye icon)
- Row click -> router.push(/contracts/[id])
- Mobile cards: FileText icon avatar, contract number + name, client name, StatusBadge + AlertBadge
- Empty state: FileText icon, "No contracts found"

Import design system: SearchBar, ActiveFilters, StatusTabs, StatusBadge, AlertBadge, KPICard, KPICardGrid
  </action>
  <verify>
Navigate to /contracts in browser. Page renders with KPI cards, tabs, search, empty state or data grid. Tabs filter correctly. Search filters across contract number, name, client.
  </verify>
  <done>
Overview page matches spec section 3.1 - KPI cards show counts, status tabs filter, search works, desktop table and mobile cards render correctly with all columns.
  </done>
</task>

<task type="auto">
  <name>Task 3: Contract create, view, and edit pages</name>
  <files>
    apps/web/src/app/(owner)/contracts/new/page.tsx
    apps/web/src/app/(owner)/contracts/new/_components/ContractCreateForm.tsx
    apps/web/src/app/(owner)/contracts/[id]/page.tsx
    apps/web/src/app/(owner)/contracts/[id]/_components/ContractRecord.tsx
    apps/web/src/app/(owner)/contracts/[id]/edit/page.tsx
  </files>
  <action>
**new/page.tsx:**
- Back link to /contracts
- Title "Add Contract"
- Render ContractCreateForm with createContract action

**new/_components/ContractCreateForm.tsx:**
- Client component with useActionState for createContract
- State: clients array fetched from /api/v1/carrier/clients?pageSize=200 on mount
- Sectioned form per spec 3.2:
  - Section 1 "Contract Identity": contractNumber (ActionField with Generate button using generateContractNumber), contractName, clientId (Select with clients, shows client name)
  - Section 2 "Contract Terms": contractType (Select: spot/dedicated/volume/broker), effectiveDate (date input), expirationDate (date input), autoRenew (Switch)
  - Section 3 "Rate Information": rateType (Select: per_mile/flat/percentage/hourly), baseRate (currency input, adapts prefix/suffix based on rateType)
  - Section 4 "Notes": notes (Textarea)
- Submit button "Create Contract" / "Creating Contract..."
- Optional CompletenessIndicator
- Handle field errors from action state

**[id]/page.tsx:**
- Await params, getContract(id)
- notFound() if not found
- Render ContractRecord with mode="view"

**[id]/edit/page.tsx:**
- Same as view page but mode="edit"
- Pass updateContract action bound with id

**[id]/_components/ContractRecord.tsx:**
- Mirror ClientRecord.tsx exactly, adapt for contract fields
- Props: contract, mode ('view'|'edit'), updateAction?
- Form state tracking all editable fields
- isDirty detection via useEffect
- beforeunload guard when dirty + edit mode
- RecordHeader: contract number (mono), contract name or client name as subtitle, StatusBadge, AlertBadge if expiring
- Actions: Edit button (view mode), Cancel + Save Changes (edit mode), unsaved changes indicator

**View Content sections:**
- Contract Identity: contractNumber (mono), contractName, client (link to /clients/[clientId]), contractType
- Contract Terms: effectiveDate, expirationDate, autoRenew badge
- Rate Information: rateType, baseRate (formatted), fuelSurchargeMethod, fuelSurchargeRate
- Accessorial Charges: detentionFreeMinutes (formatted), detentionRatePerHour, tonuRate, layoverRatePerDay
- Payment & Settings: paymentTermsOverride, defaultFreeTimeMinutes, status, notes

**Edit Content:**
- Same sections with FormField inputs
- contractNumber is read-only (disabled input)
- clientId uses Select picker (same as create form)
- status uses Select (draft/active/expired/terminated)

**Right Rail "Contract Health":**
- StatusBadge
- AlertBadge if applicable
- Auto-renew badge if enabled
- Client name (linked)
- Contract duration computed from dates
- Quick stats: _count.carrierLoads loads, _count.routeTemplates templates

**AuditTrailFooter** at bottom
  </action>
  <verify>
1. Navigate to /contracts/new - form renders with all sections, client picker loads clients, Generate button creates contract number
2. Create a contract - redirects to /contracts/[id] view page
3. View page shows all fields in RecordLayout with rail
4. Click Edit - edit page allows changes, unsaved indicator shows, Save redirects back
5. Cancel with changes prompts confirmation
  </verify>
  <done>
Create form matches spec 3.2, view/edit matches spec 3.3. Client picker works. Unsaved changes guard works. All fields display correctly in view mode and are editable in edit mode.
  </done>
</task>

</tasks>

<verification>
1. `tsc --noEmit` passes
2. Navigate to /contracts - KPI cards, tabs, search, grid all render
3. Create a contract with required fields only - success
4. View contract detail - all sections visible
5. Edit contract - save works, unsaved indicator works
6. Delete contract (soft delete) - removed from list
7. Mobile view - cards render correctly
8. Status computation - expired/expiring/active/draft statuses show correct badges and alerts
</verification>

<success_criteria>
- Contracts overview page renders with streaming/Suspense
- KPI cards show correct counts for total/active/expiring/expired
- Status tabs filter contracts correctly
- Search filters across contract number, name, client name
- Data grid shows all columns per spec (sortable where specified)
- Mobile cards render with icon avatar, status badge, alert badge
- Create form has 4 sections, client picker works, contract number generation works
- View page displays all contract fields in RecordLayout
- Edit page allows updating all mutable fields (not contractNumber)
- Unsaved changes guard prevents accidental navigation
- All design system components used correctly (StatusBadge, AlertBadge, FormField, etc.)
</success_criteria>

<output>
After completion, create `.planning/quick/474-build-contracts-section-per-approved-spe/474-SUMMARY.md`
</output>
