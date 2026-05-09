---
phase: quick-165
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/clients/page.tsx
  - apps/web/src/app/(owner)/carrier/clients/new/page.tsx
  - apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/contracts/page.tsx
  - apps/web/src/app/(owner)/carrier/contracts/new/page.tsx
  - apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx
  - apps/web/src/components/carrier/clients/ClientList.tsx
  - apps/web/src/components/carrier/clients/ClientForm.tsx
  - apps/web/src/components/carrier/clients/ClientFinancials.tsx
  - apps/web/src/components/carrier/contracts/ContractList.tsx
  - apps/web/src/components/carrier/contracts/ContractForm.tsx
autonomous: true
must_haves:
  truths:
    - "Client list page renders with name, status badge, and search/filter controls"
    - "Client detail page has four working tabs: Overview, Contracts, Loads, Financials"
    - "Contract list page renders with client name links, rate info, status badges, and amber expiry highlight"
    - "Contract detail page shows all contract fields organized in sections with inline edit"
    - "New Client and New Contract forms submit to existing API endpoints"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/clients/page.tsx"
      provides: "Client list server page"
    - path: "apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx"
      provides: "Client detail with 4-tab layout"
    - path: "apps/web/src/app/(owner)/carrier/contracts/page.tsx"
      provides: "Contract list server page"
    - path: "apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx"
      provides: "Contract detail with inline edit"
    - path: "apps/web/src/components/carrier/clients/ClientList.tsx"
      provides: "Client list table with search, status filter, badges"
    - path: "apps/web/src/components/carrier/contracts/ContractList.tsx"
      provides: "Contract list table with expiry amber highlight"
  key_links:
    - from: "ClientList.tsx"
      to: "/api/v1/carrier/clients"
      via: "Server page fetches via listClients(), passes props"
      pattern: "listClients"
    - from: "ContractList.tsx"
      to: "/api/v1/carrier/contracts"
      via: "Server page fetches via listContracts(), passes props"
      pattern: "listContracts"
    - from: "ClientFinancials.tsx"
      to: "/api/v1/carrier/reports/aging"
      via: "Client-side fetch filtered by clientId"
      pattern: "fetch.*reports/aging"
---

<objective>
Create client and contract list, detail, and form pages for the Carrier Ops module.

Purpose: These are the commercial identity (clients) and rate agreement (contracts) layers of Carrier Ops, building on the existing API routes and data layer.
Output: 11 files — 6 server pages + 5 client components.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/carrier/facilities/page.tsx — pattern for server page (getSession, listX, pass to component)
@apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx — pattern for detail page
@apps/web/src/app/(owner)/carrier/facilities/new/page.tsx — pattern for new page
@apps/web/src/components/carrier/facilities/FacilityList.tsx — pattern for list component (search, filter, table, badges)
@apps/web/src/components/carrier/facilities/FacilityForm.tsx — pattern for form component (useState, validation, fetch POST/PATCH, toast, router)
@apps/web/src/lib/carrier/clients.ts — listClients, getClient, createClient, updateClient
@apps/web/src/lib/carrier/contracts.ts — listContracts, getContract, createContract, updateContract, getContractLoadsSummary
@apps/web/src/app/api/v1/carrier/reports/aging/route.ts — aging report endpoint
@apps/web/prisma/schema.prisma — CarrierClient (lines 1249-1285), CarrierContract (lines 1288-1314), CarrierLoad (lines 1521-1551)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Client pages and components (list, detail with 4 tabs, new, form)</name>
  <files>
    apps/web/src/app/(owner)/carrier/clients/page.tsx
    apps/web/src/app/(owner)/carrier/clients/new/page.tsx
    apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
    apps/web/src/components/carrier/clients/ClientList.tsx
    apps/web/src/components/carrier/clients/ClientForm.tsx
    apps/web/src/components/carrier/clients/ClientFinancials.tsx
  </files>
  <action>
    Follow the facilities page patterns exactly for styling and structure.

    **ClientList.tsx** (client component):
    - Props: array of client objects (id, name, status, email, phone, primaryContact, city, state, portalAccess)
    - Search input filtering by name (case-insensitive)
    - Status filter dropdown: All, Active, Inactive, Blocked
    - "New Client" button linking to /carrier/clients/new
    - Table columns: Name (linked to /carrier/clients/[id]), Status badge (green=active, yellow=inactive, red=blocked — use Badge variant="outline" with colored borders like FacilityList), Primary Contact, Email, City/State
    - Empty state with Users icon when no results
    - NOTE: The spec mentions "open loads count", "invoiced YTD", "outstanding AR", "payment terms" columns but the CarrierClient schema does NOT have payment_terms_days or credit_limit fields and listClients() does not return financial aggregates. For now, show only the columns that exist in the schema. The detail page getClient() does return openLoadsCount and outstandingAR, but computing those per-row in the list would be expensive — omit from list table.

    **clients/page.tsx** (server component):
    - Same pattern as facilities/page.tsx: getSession, redirect if no session, call listClients(orgId), count by status, render stat chips + ClientList
    - Pass serialized client data as props to ClientList

    **ClientForm.tsx** (client component):
    - Same pattern as FacilityForm.tsx: useState for all fields, validate, handleSubmit with fetch POST/PATCH
    - Props: optional initialData for edit mode
    - Fields matching CarrierClient schema: name (required), dbaName, mcNumber, dotNumber, taxId, primaryContact, email, phone, website, addressLine1, addressLine2, city, state (2 char max), zip, country (default "US"), portalAccess (toggle/checkbox), portalEmail, notes
    - Group into sections: Basic Info, Address, Contact, Portal Access, Notes
    - POST to /api/v1/carrier/clients or PATCH to /api/v1/carrier/clients/[id]
    - On success: toast + router.push('/carrier/clients')
    - Validation: name required, email format if provided, state max 2 chars

    **clients/new/page.tsx** (server component):
    - Same pattern as facilities/new/page.tsx: back link, heading, ClientForm in a card

    **clients/[id]/page.tsx** (server component with client sub-components):
    - Server component: getSession, call getClient(orgId, id), notFound if missing
    - Render a tab navigation with 4 tabs using a client-side TabSwitcher component embedded in the same file (or use useState with 'use client' wrapper)
    - Since the page needs server data AND client interactivity (tabs), use this pattern: server page fetches all data, passes to a 'use client' ClientDetail component that handles tab switching

    **Tab 1 — Overview:**
    - Display all client fields in a read-only grid: name, dbaName, MC#, DOT#, Tax ID, address (full), primaryContact, email, phone, website, portalAccess toggle (on change: PATCH to /api/v1/carrier/clients/[id] with { portalAccess: newValue } then toast), notes
    - "Edit" button links to the same page but renders ClientForm with initialData (OR just link to a hypothetical edit mode — simplest: put an "Edit Client" button that navigates to the same URL with ?edit=true query param, and conditionally render ClientForm vs read-only view)

    **Tab 2 — Contracts:**
    - Fetch client's contracts via /api/v1/carrier/contracts?client_id={clientId} on mount (useEffect + useState)
    - Table: contractNumber, contractType badge, rateType + baseRate display (e.g., "$2.50/mi"), status badge (green=active, amber=pending, red=terminated), effectiveDate, expirationDate
    - Each row links to /carrier/contracts/[contractId]
    - "New Contract" button linking to /carrier/contracts/new?clientId={id}

    **Tab 3 — Loads:**
    - Fetch loads from /api/v1/carrier/contracts/[contractId]/loads is per-contract, not per-client. Instead, for client loads, use client-side fetch to /api/v1/carrier/loads?client_id={clientId} (check if this endpoint accepts client_id filter — if not, show a placeholder "Loads tab coming soon" message rather than breaking)
    - If loads data is available: table with referenceNumber, status badge, totalRevenue (locale formatted), createdAt

    **Tab 4 — Financials (ClientFinancials.tsx):**
    - Fetch /api/v1/carrier/reports/aging on mount, filter results to rows where client_id === current client id
    - Display summary cards: Total Billed (from getClient outstandingAR), Outstanding AR
    - Aging buckets table: columns 0-30, 31-60, 61-90, 90+ days, Total Outstanding
    - The spec says "highlight row red if outstanding > credit_limit" but credit_limit does NOT exist on CarrierClient schema. Skip this highlight — add a TODO comment noting it requires a schema migration to add credit_limit field
    - All money values: use toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  </action>
  <verify>
    Run `npx tsc --noEmit -p apps/web/tsconfig.json` — no type errors in the new files.
    Manually confirm: /carrier/clients renders without crash, /carrier/clients/new renders form, clicking a client navigates to detail with 4 tabs.
  </verify>
  <done>
    Client list page shows table with status badges, search, filter. Client detail has 4 functioning tabs. New client form submits to API. Financials tab shows aging data filtered to the client.
  </done>
</task>

<task type="auto">
  <name>Task 2: Contract pages and components (list with expiry highlight, detail with inline edit, new, form)</name>
  <files>
    apps/web/src/app/(owner)/carrier/contracts/page.tsx
    apps/web/src/app/(owner)/carrier/contracts/new/page.tsx
    apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx
    apps/web/src/components/carrier/contracts/ContractList.tsx
    apps/web/src/components/carrier/contracts/ContractForm.tsx
  </files>
  <action>
    Follow the same facilities page patterns for styling and structure.

    **ContractList.tsx** (client component):
    - Props: array of contract objects (id, contractNumber, contractType, rateType, baseRate, fuelSurchargeMethod, fuelSurchargeRate, status, effectiveDate, expirationDate, client: { name: string })
    - Table columns: Contract # (linked to /carrier/contracts/[id]), Client Name (linked to /carrier/clients/[clientId]), Contract Type badge (spot=slate, dedicated=blue, volume=purple), Rate display (format based on rateType: "per_mile" -> "$X.XX/mi", "flat" -> "$X,XXX flat", "per_hour" -> "$X.XX/hr"), Status badge (active=green, pending=yellow, expired=red, terminated=gray), Expiration Date
    - CRITICAL: Amber background highlight on rows where expirationDate is within 30 days of today AND status is not terminated/expired. Compute: `const isExpiringSoon = expirationDate && new Date(expirationDate) <= addDays(new Date(), 30) && new Date(expirationDate) > new Date()`. Use `className="bg-amber-50 dark:bg-amber-950/30"` on the tr.
    - Search input filtering by contractNumber or client name
    - Status filter dropdown: All, Active, Pending, Expired, Terminated
    - "New Contract" button linking to /carrier/contracts/new

    **contracts/page.tsx** (server component):
    - getSession, redirect if not, call listContracts(orgId), count by status, render stat chips + ContractList
    - Serialize Decimal fields (baseRate, fuelSurchargeRate) to string before passing as props

    **ContractForm.tsx** (client component):
    - Props: optional initialData for edit mode, optional defaultClientId (from query param)
    - Fields matching CarrierContract schema: clientId (required — searchable select that fetches /api/v1/carrier/clients and shows name dropdown, pre-selected if defaultClientId provided), contractType select (spot, dedicated, volume, brokerage), rateType select (per_mile, flat, per_hour, per_load, percentage), baseRate (number input), fuelSurchargeMethod select (none, percentage, flat_rate, doe_index — show fuelSurchargeRate input only when method != "none"), effectiveDate (date input), expirationDate (date input), status select (active, pending, expired, terminated), notes (textarea)
    - NOTE: The spec mentions detention_free_minutes, detention_rate_per_hour, tonu_rate, layover_rate_per_day, auto_renew, contract_name, payment_terms_override — these fields do NOT exist on the CarrierContract schema. Do NOT add form fields for them. Add a TODO comment at the top of the form noting these fields require a schema migration.
    - POST to /api/v1/carrier/contracts (body includes clientId) or PATCH to /api/v1/carrier/contracts/[id]
    - Validation: clientId required, baseRate must be a positive number if provided
    - On success: toast + router.push('/carrier/contracts')

    **contracts/new/page.tsx** (server component):
    - Same pattern as facilities/new/page.tsx
    - Read searchParams for ?clientId to pre-select client in form
    - Pass defaultClientId to ContractForm

    **contracts/[id]/page.tsx** (server component + client wrapper):
    - Server: getSession, getContract(orgId, id), notFound if missing
    - Also fetch getContractLoadsSummary(orgId, id) for the loads section stats
    - Pass all data to a 'use client' ContractDetail component
    - ContractDetail renders sections:
      1. **Header**: contractNumber, client name (linked), status badge, edit button
      2. **Basic Info section**: contractType, effectiveDate, expirationDate, status, notes
      3. **Rate & Accessorials section**: rateType, baseRate (formatted), fuelSurchargeMethod, fuelSurchargeRate (only if method != none). Note: detention/TONU/layover fields don't exist in schema — omit them.
      4. **Linked Route Templates section**: show count from routeTemplateCount. If 0, show "No linked route templates" placeholder.
      5. **Loads Summary section**: totalLoads, totalRevenue, totalInvoiced, totalPaid, avgRate — all from getContractLoadsSummary. Format all money with toLocaleString.
    - "Edit" button toggles inline edit mode: replaces read-only fields with ContractForm pre-filled with initialData. On save or cancel, toggle back to read-only.
    - All money values: use toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  </action>
  <verify>
    Run `npx tsc --noEmit -p apps/web/tsconfig.json` — no type errors.
    Confirm: /carrier/contracts renders list with amber highlight on contracts expiring within 30 days. /carrier/contracts/new renders form with client selector. /carrier/contracts/[id] shows detail sections with edit toggle.
  </verify>
  <done>
    Contract list shows table with client links, rate display, status badges, and amber expiry highlight. Contract detail renders all sections with inline edit toggle. New contract form pre-selects client from query param. All money formatted with locale string.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/web/tsconfig.json` passes with no errors in new files
- Navigate to /carrier/clients — table renders with status badges, search works, filter works
- Navigate to /carrier/clients/new — form renders, submit creates client via API
- Navigate to /carrier/clients/[id] — 4 tabs render, Overview shows client data, Contracts tab lists contracts, Financials shows aging data
- Navigate to /carrier/contracts — table renders with amber highlight on expiring rows
- Navigate to /carrier/contracts/new — form renders with client searchable select
- Navigate to /carrier/contracts/[id] — detail sections render, edit button toggles to inline form
- All money values display with $ formatting (toLocaleString), not raw decimals
</verification>

<success_criteria>
11 files created. Client list with search/filter/badges. Client detail with 4 working tabs (Overview, Contracts, Loads, Financials). Contract list with expiry amber highlight. Contract detail with inline edit. All forms POST/PATCH to existing API routes. TypeScript compiles clean.
</success_criteria>

<output>
After completion, create `.planning/quick/165-carrier-ops-clients-and-contracts-pages/165-SUMMARY.md`
</output>
