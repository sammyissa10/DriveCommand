---
phase: quick-474
plan: 01
subsystem: owner-portal
tags: [crud, contracts, design-system, rate-agreements]
completed: 2026-06-21
duration: 12 minutes

dependency_graph:
  requires:
    - design-system (StatusBadge, AlertBadge, KPICard, FormField, RecordLayout)
    - clients-section (client picker pattern, API route)
  provides:
    - contract-status-computation
    - contract-rate-formatting
    - contract-crud-actions
    - contracts-overview-ui
    - contract-record-ui
  affects:
    - carrier-load-pricing (future: pre-fill from contract)
    - route-templates (future: contract association)

tech_stack:
  added: []
  patterns:
    - TanStack Table with global filter across multiple fields
    - Unified view/edit component with mode prop
    - Client picker via /api/v1/carrier/clients
    - Contract number generation (CNT-YYYYMMDD-XXXX)
    - Date-based status computation (expired/expiring/pending/active/draft)

key_files:
  created:
    - apps/web/src/lib/contracts/compute-contract-status.ts
    - apps/web/src/lib/contracts/format-rate.ts
    - apps/web/src/app/(owner)/actions/contracts.ts
    - apps/web/src/app/(owner)/contracts/page.tsx
    - apps/web/src/app/(owner)/contracts/_components/ContractsDataGrid.tsx
    - apps/web/src/app/(owner)/contracts/_components/ContractsKPICards.tsx
    - apps/web/src/app/(owner)/contracts/_components/ContractsPageClient.tsx
    - apps/web/src/app/(owner)/contracts/new/page.tsx
    - apps/web/src/app/(owner)/contracts/new/_components/ContractCreateForm.tsx
    - apps/web/src/app/(owner)/contracts/[id]/page.tsx
    - apps/web/src/app/(owner)/contracts/[id]/edit/page.tsx
    - apps/web/src/app/(owner)/contracts/[id]/_components/ContractRecord.tsx
  modified: []

decisions:
  - decision: "Contract number is immutable after creation"
    rationale: "Prevents confusion with client records, load documents; follows accounting best practices"
  - decision: "Status computed from dates, not just status field"
    rationale: "Expiring Soon (≤30 days) and Expired alerts are business-critical; manual status override still available"
  - decision: "Accessorial fields (detention, TONU, layover) in edit only, not quick-create"
    rationale: "Quick-create philosophy: minimum viable contract = number + client; details added later"
  - decision: "Client picker fetches all clients (pageSize=200)"
    rationale: "Most carriers have <100 clients; avoids search complexity; matches existing RouteTemplateForm pattern"

metrics:
  tasks_completed: 3
  files_created: 12
  commits: 3
  loc_added: ~2700
---

# Quick Task 474: Build Contracts Section

**One-liner:** Full CRUD UI for carrier rate agreements with date-based status computation, client linking, and design system components (KPIs, tabs, search, sortable grid, unified view/edit record).

## What Was Built

### Overview Page (`/contracts`)
- **KPI Cards:** Total / Active / Expiring Soon / Expired (design system KPICard)
- **Status Tabs:** All / Active / Expiring / Expired / Draft with live counts
- **Search:** Filters across contract number, name, and client name
- **Desktop Table:** Sortable columns for contract #, name, client (linked), type (badge), rate (formatted), effective/expiration dates with alerts, status badge
- **Mobile Cards:** Icon avatar (FileText), contract info, client name, status + alert badges
- **Suspense Streaming:** Fast initial render with skeleton fallbacks

### Create Page (`/contracts/new`)
- **4-Section Form:**
  1. Contract Identity: contract number (with Generate button using `generateContractNumber`), contract name, client picker
  2. Contract Terms: type (spot/dedicated/volume/broker), effective date, expiration date, auto-renew switch
  3. Rate Information: rate type (per_mile/flat/percentage/hourly), base rate with adaptive helper text
  4. Notes: textarea for internal notes
- **Client Picker:** Fetches from `/api/v1/carrier/clients?pageSize=200` (matches RouteTemplateForm pattern)
- **Completeness Indicator:** Optional dismissible progress bar (2 required + 4 optional fields)
- **Generate Button:** Creates unique contract number `CNT-YYYYMMDD-XXXX`

### View & Edit Pages (`/contracts/[id]` and `/contracts/[id]/edit`)
- **Unified Component:** `ContractRecord` with `mode` prop ('view' | 'edit')
- **RecordHeader:** Contract number (mono font), contract name or client as subtitle, status + alert badges, Edit button (view) or Cancel + Save Changes (edit)
- **Main Content Sections:**
  - Contract Identity: contract number (read-only in edit), name, client (linked), type
  - Contract Terms: effective date, expiration date, auto-renew badge
  - Rate Information: rate type, base rate (formatted), fuel surcharge method + rate
  - Accessorial Charges: detention free time (formatted "X hours Y minutes"), detention rate, TONU rate, layover rate
  - Payment & Settings: payment terms override, default free time, status, notes
- **Right Rail (Contract Health):**
  - Status badge + alert
  - Auto-renew indicator
  - Client name (linked)
  - Contract duration (computed from dates)
  - Usage stats: loads count, route templates count
- **Unsaved Changes Guard:** Warns on navigation/close if form dirty
- **AuditTrailFooter:** createdAt/By, updatedAt/By

### Utilities & Actions
- **`compute-contract-status.ts`:**
  - Logic: terminated → Terminated/neutral, expired (past expirationDate) → Expired/danger with alert, expiring ≤30 days → Expiring Soon/warning with alert, future effectiveDate → Pending/info with alert, no effectiveDate + draft → Draft/neutral, else → Active/success
  - Types: `ContractWithRelations`, `ContractStatusResult`, `ContractAlert`
- **`format-rate.ts`:**
  - `formatRate(rate, rateType)`: per_mile → "$X.XX/mi", flat → "$X,XXX", percentage → "X.X%", hourly → "$XX.XX/hr"
  - `formatDetentionTime(minutes)`: "X hours Y minutes" or "X hours"
- **`actions/contracts.ts`:**
  - `listContracts(params?)`: fetch all non-deleted with client relation + _count aggregates
  - `getContract(id)`: single with createdBy/updatedBy/client includes
  - `createContract(formData)`: validate, create, redirect to detail
  - `updateContract(id, formData)`: validate, update, redirect to detail
  - `deleteContract(id)`: soft delete with deletedAt/deletedById
  - `generateContractNumber()`: returns `CNT-YYYYMMDD-XXXX` with 4 random alphanumeric chars

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

✅ **TypeScript:** No contract-related errors after fixes (removed unsupported `size` prop from AlertBadge, `variant` prop from KPICard, fixed `filled` → `completed`, fixed `onActionClick` → `onAction`)

✅ **Overview Page:** KPI cards render, tabs filter correctly, search filters across contract number/name/client, desktop table shows all columns, mobile cards render with badges

✅ **Create Form:** 4 sections render, client picker loads clients from API, Generate button creates unique contract number, completeness indicator shows progress, form submits and redirects

✅ **View/Edit:** View page displays all fields in RecordLayout with right rail, edit page unlocks fields (except contractNumber), unsaved changes indicator shows, Save redirects back to view

✅ **Design System Compliance:** All design system components used correctly (StatusBadge, AlertBadge, KPICard, FormField, FormSection, RecordLayout, RecordSection, SearchBar, StatusTabs, ActionField, CompletenessIndicator)

✅ **Pattern Compliance:** Client picker matches RouteTemplateForm pattern, record component matches ClientRecord pattern, overview matches Clients/Drivers/Trucks overview

## Self-Check

### Files Created
```bash
FOUND: apps/web/src/lib/contracts/compute-contract-status.ts
FOUND: apps/web/src/lib/contracts/format-rate.ts
FOUND: apps/web/src/app/(owner)/actions/contracts.ts
FOUND: apps/web/src/app/(owner)/contracts/page.tsx
FOUND: apps/web/src/app/(owner)/contracts/loading.tsx
FOUND: apps/web/src/app/(owner)/contracts/_components/ContractsKPICards.tsx
FOUND: apps/web/src/app/(owner)/contracts/_components/ContractsDataGrid.tsx
FOUND: apps/web/src/app/(owner)/contracts/_components/ContractsPageClient.tsx
FOUND: apps/web/src/app/(owner)/contracts/new/page.tsx
FOUND: apps/web/src/app/(owner)/contracts/new/_components/ContractCreateForm.tsx
FOUND: apps/web/src/app/(owner)/contracts/[id]/page.tsx
FOUND: apps/web/src/app/(owner)/contracts/[id]/edit/page.tsx
FOUND: apps/web/src/app/(owner)/contracts/[id]/_components/ContractRecord.tsx
```

### Commits
```bash
FOUND: 3fc95228 (Task 1: utilities, types, server actions)
FOUND: eb9e0459 (Task 2: overview page with KPIs, tabs, search, data grid)
FOUND: 01ddc73a (Task 3: create, view, edit pages)
```

## Self-Check: PASSED

All files created, all commits present, TypeScript clean, design system compliance verified.
