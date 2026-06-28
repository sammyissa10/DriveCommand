# Contracts Section Specification

**Version:** 1.0
**Status:** DRAFT — Awaiting Sign-off
**Created:** 2026-06-21

---

## 1. Overview

The Contracts section manages rate agreements between the carrier and their clients. Contracts define pricing terms (per-mile, flat rate, etc.), accessorial charges (detention, layover, TONU), fuel surcharge methods, and validity periods. Each contract is linked to a Client and can be used to pre-fill load pricing.

**Terminology note:** In the codebase, the entity is `CarrierContract` (Prisma model, existing at `schema.prisma:1935`). The UI uses "Contracts" as the user-facing term.

**Client relationship:** Every contract must be linked to exactly one `CarrierClient`. The client must be selected before saving. This enables:
- Filtering contracts by client
- Auto-populating client info on loads created under a contract
- Client-level reporting on contract performance

---

## 2. Data Model

### 2.1 Existing Prisma Model: `CarrierContract`

The model already exists at `prisma/schema.prisma:1935`. Key fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes (auto) | Primary key |
| `orgId` | UUID | Yes | Tenant FK |
| `clientId` | UUID | **Yes** | FK to CarrierClient |
| `contractNumber` | String | **Yes** (unique) | Human-readable contract identifier |
| `contractName` | String? | No | Friendly name for the contract |
| `contractType` | String | Yes (default: "spot") | Type: spot, dedicated, volume, broker |
| `effectiveDate` | Date? | No | Start date (triggers "Draft" if null or future) |
| `expirationDate` | Date? | No | End date (triggers "Expiring/Expired" alerts) |
| `rateType` | String | Yes (default: "per_mile") | How rate is calculated |
| `baseRate` | Decimal? | No | Base rate amount |
| `fuelSurchargeMethod` | String | Yes (default: "none") | FSC calculation method |
| `fuelSurchargeRate` | Decimal? | No | FSC rate (if percentage or flat) |
| `detentionFreeMinutes` | Int | Yes (default: 120) | Free time before detention charges |
| `detentionRatePerHour` | Decimal? | No | Detention rate |
| `tonuRate` | Decimal? | No | Truck Ordered Not Used rate |
| `layoverRatePerDay` | Decimal? | No | Layover rate |
| `paymentTermsOverride` | String? | No | Override client payment terms |
| `autoRenew` | Boolean | Yes (default: false) | Auto-renew flag |
| `status` | String | Yes (default: "active") | Contract status |
| `notes` | String? | No | Internal notes |
| `defaultFreeTimeMinutes` | Int? | No | Default driver pay free time |
| `createdById` | UUID? | No | Audit: who created |
| `updatedById` | UUID? | No | Audit: who updated |
| `deletedAt` | DateTime? | No | Soft delete timestamp |
| `deletedById` | UUID? | No | Who deleted |
| `createdAt` | DateTime | Yes (auto) | Created timestamp |
| `updatedAt` | DateTime | Yes (auto) | Updated timestamp |

**Relations:**
- `client` → `CarrierClient` (required)
- `routeTemplates` → `RouteTemplate[]`
- `carrierLoads` → `CarrierLoad[]`
- `documents` → `CarrierDocument[]`

### 2.2 Status Values and Computed Status

**Raw status field values:**
- `draft` — Contract is being drafted, not yet active
- `active` — Contract is in effect
- `expired` — Contract has passed its expiration date
- `terminated` — Contract was manually terminated early

**Computed status logic (for display and alerts):**

```typescript
export function computeContractStatus(contract: ContractWithRelations): ContractStatusResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Manual termination takes precedence
  if (contract.status === 'terminated') {
    return { status: 'Terminated', variant: 'neutral', alert: null };
  }

  // Check expiration
  if (contract.expirationDate) {
    const expiry = new Date(contract.expirationDate);
    expiry.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return {
        status: 'Expired',
        variant: 'danger',
        alert: { variant: 'danger', message: `Expired ${Math.abs(daysUntilExpiry)} days ago` }
      };
    }

    if (daysUntilExpiry <= 30) {
      return {
        status: 'Expiring Soon',
        variant: 'warning',
        alert: { variant: 'warning', message: `Expires in ${daysUntilExpiry} days` }
      };
    }
  }

  // Check if not yet effective
  if (contract.effectiveDate) {
    const effective = new Date(contract.effectiveDate);
    effective.setHours(0, 0, 0, 0);
    if (effective > today) {
      const daysUntilEffective = Math.ceil((effective.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        status: 'Pending',
        variant: 'info',
        alert: { variant: 'info', message: `Starts in ${daysUntilEffective} days` }
      };
    }
  }

  // No dates set = draft
  if (!contract.effectiveDate && contract.status === 'draft') {
    return { status: 'Draft', variant: 'neutral', alert: null };
  }

  // Default: active
  return { status: 'Active', variant: 'success', alert: null };
}
```

### 2.3 Fields Driving Expiry/Renewal Alerts

| Field | Alert Trigger |
|-------|---------------|
| `expirationDate` | Expiring Soon (≤30 days), Expired (past date) |
| `effectiveDate` | Pending (future date), Draft (null) |
| `autoRenew` | Badge on contract card ("Auto-renews") |
| `status` | Manual override (terminated) |

### 2.4 Required vs Optional for Quick-Create

| Field | Quick-Create | Full Form |
|-------|--------------|-----------|
| `contractNumber` | **Required** (auto-generate option) | **Required** |
| `clientId` | **Required** | **Required** |
| `contractType` | Defaults to "spot" | Editable |
| `effectiveDate` | Optional | Optional |
| `expirationDate` | Optional | Optional |
| `rateType` | Defaults to "per_mile" | Editable |
| `baseRate` | Optional | Optional |
| All accessorial fields | Hidden (use defaults) | Editable |
| `notes` | Optional | Optional |

**Rationale:** A valid contract needs only a number and a client. Rate terms can be added later. This matches the "quick-create" philosophy.

---

## 3. Screen Specifications

### 3.1 Contracts Overview Page

**Route:** `/contracts`

**Pattern:** Mirrors Trucks/Drivers/Clients overview exactly.

#### Header
- **Title:** "Contracts"
- **Subtitle:** "Manage client rate agreements"
- **Primary action:** Button → "Add Contract" (links to `/contracts/new`)
- **Icon:** `FileText` from lucide-react

#### KPI Cards (4 cards in grid)

| Card | Metric | Icon | Color/Trend |
|------|--------|------|-------------|
| Total Contracts | Count of all non-deleted contracts | `FileText` | — |
| Active | Count where computed status = Active | `CheckCircle` | success |
| Expiring Soon | Count expiring within 30 days | `Clock` | warning |
| Expired | Count where computed status = Expired | `AlertTriangle` | danger |

**Design System Mapping:**
- `KPICardGrid` → container
- `KPICard` → individual cards

#### Status Tabs

| Tab | Filter | Count Badge |
|-----|--------|-------------|
| All | No filter | Total count |
| Active | Computed status = Active | Active count |
| Expiring | Computed status = Expiring Soon | Expiring count |
| Expired | Computed status = Expired | Expired count |
| Draft | status = "draft" | Draft count |

**Design System Mapping:** `StatusTabs`

#### Search Bar

- Placeholder: "Search by contract number, name, or client..."
- Filter button (opens filter panel)
- Filter count badge when filters active

**Design System Mapping:** `SearchBar`

#### Active Filters (Removable Pills)

Filter types available:

| Filter | Type | Options |
|--------|------|---------|
| Status | Multi-select | Active, Expiring Soon, Expired, Draft, Terminated |
| Client | Relation picker (searchable) | All clients |
| Contract Type | Multi-select | Spot, Dedicated, Volume, Broker |
| Rate Type | Multi-select | Per Mile, Flat, Percentage, Hourly |
| Effective Date | Date range | Start/End pickers |
| Expiration Date | Date range | Start/End pickers |

**Design System Mapping:** `ActiveFilters`

#### Data Grid (Desktop Table)

| Column | Sortable | Filterable | Cell Content |
|--------|----------|------------|--------------|
| ☐ (select) | No | No | Checkbox (quiet, 50% opacity) |
| Contract # | Yes | Text search | `contractNumber` (mono font) |
| Name | Yes | Text search | `contractName` or "—" |
| Client | Yes | Relation filter | Client name (linked) |
| Type | Yes | Multi-select | `contractType` badge |
| Rate | Yes | Range filter | `baseRate` formatted by `rateType` |
| Effective | Yes | Date range | `effectiveDate` or "—" |
| Expires | Yes | Date range | `expirationDate` with AlertBadge if ≤30 days |
| Status | Yes | Multi-select | `StatusBadge` (computed status) |
| Actions | No | No | "Manage" link with Eye icon |

**Row click:** Navigates to `/contracts/[id]`

**Special column behaviors:**
- **Client column:** Shows client name, clicking navigates to `/clients/[clientId]`
- **Expires column:** Shows date + AlertBadge if expiring/expired
- **Rate column:** Formatted based on rateType:
  - `per_mile`: "$X.XX/mi"
  - `flat`: "$X,XXX"
  - `percentage`: "X.X%"
  - `hourly`: "$XX.XX/hr"

**Design System Mapping:**
- TanStack Table for sorting/filtering
- `StatusBadge` for status column
- `AlertBadge` for expiry warnings
- `Checkbox` from shadcn/ui
- Relation filter for Client column (searchable select)

#### Mobile Cards

Same structure as Clients mobile cards:
- Checkbox (left)
- Icon avatar (`FileText` in rounded-xl bg-muted)
- Primary line: Contract number + contract name
- Secondary line: Client name
- Tertiary line: StatusBadge + expiry AlertBadge (if applicable)
- ChevronRight (right)

#### Empty State

- Icon: `FileText` (large, muted)
- Title: "No contracts found"
- Subtitle: "Create your first contract to define rate agreements with clients."

---

### 3.2 Contract Quick-Create Page

**Route:** `/contracts/new`

**Pattern:** Mirrors Clients/Trucks create forms — sectioned form, essential fields required, helper text.

#### Header
- Back link: "← Back to Contracts" (links to `/contracts`)
- Title: "Add Contract"
- No subtitle needed

#### Form Sections

**Section 1: Contract Identity**
- Description: "Basic contract information. Contract number must be unique."

| Field | Name | Required | Helper Text | Input Type |
|-------|------|----------|-------------|------------|
| Contract Number | `contractNumber` | **Yes** | "Auto-generate or enter manually" | Text + "Generate" button |
| Contract Name | `contractName` | No | "Optional friendly name" | Text |
| Client | `clientId` | **Yes** | — | Searchable Select (ComboboxPopover) |

**Client Picker Pattern:**
- Uses `Popover` + `Command` from shadcn/ui (combobox pattern)
- Loads clients via `/api/v1/carrier/clients?pageSize=200`
- Shows client name + status badge
- Search filters list client-side
- Selected client shows name in trigger

**Section 2: Contract Terms** (divider)
- Description: "Define when this contract is in effect."

| Field | Name | Required | Helper Text | Input Type |
|-------|------|----------|-------------|------------|
| Contract Type | `contractType` | No (default: spot) | — | Select: Spot, Dedicated, Volume, Broker |
| Effective Date | `effectiveDate` | No | "When the contract starts" | Date picker |
| Expiration Date | `expirationDate` | No | "Leave blank for no expiration" | Date picker |
| Auto-Renew | `autoRenew` | No (default: false) | "Automatically renew when expired" | Switch |

**Section 3: Rate Information** (divider)
- Description: "Primary rate terms. Accessorial charges can be added after creation."

| Field | Name | Required | Helper Text | Input Type |
|-------|------|----------|-------------|------------|
| Rate Type | `rateType` | No (default: per_mile) | — | Select: Per Mile, Flat, Percentage, Hourly |
| Base Rate | `baseRate` | No | "Primary rate for loads under this contract" | Currency input (adapts to rate type) |

**Section 4: Notes** (divider)
- Description: "Internal notes about this contract."

| Field | Name | Required | Helper Text | Input Type |
|-------|------|----------|-------------|------------|
| Notes | `notes` | No | "Not visible to customers" | Textarea |

#### Submit Button
- Label: "Create Contract"
- Loading state: "Creating Contract..."

#### Completeness Indicator
- Optional/dismissible
- Shows filled vs total fields (count non-accessorial fields only)

**Design System Mapping:**
- `FormSection` for each section
- `FormField` for each field
- `FormRow` for side-by-side fields (Effective | Expiration)
- `CompletenessIndicator`
- `ActionField` for Contract Number with Generate button
- `Button` from shadcn/ui

#### Auto-Generate Contract Number

Pattern: `CNT-{YYYYMMDD}-{XXXX}`
- `YYYYMMDD` = current date
- `XXXX` = 4-digit random alphanumeric

Example: `CNT-20260621-A3F7`

---

### 3.3 Contract View/Edit Page

**Routes:**
- View: `/contracts/[id]`
- Edit: `/contracts/[id]/edit`

**Pattern:** One component (`ContractRecord`), two modes. Mirrors `TruckRecord`/`ClientRecord`.

#### Header

**View Mode:**
- Back link: "← Back to Contracts"
- Title: Contract number (mono font)
- Subtitle: Contract name or Client name
- Badge: `StatusBadge` showing computed status
- Alert: `AlertBadge` if expiring/expired
- Actions:
  - "Edit" button → navigates to `/contracts/[id]/edit`
  - (Future: "Create Load" quick action)

**Edit Mode:**
- Same header structure
- Actions:
  - "Unsaved changes" indicator (if dirty)
  - "Cancel" button → returns to view with confirmation if dirty
  - "Save Changes" button → submits form

#### Main Content (RecordLayout with Rail)

**Sections (same in view and edit):**

**Section 1: Contract Identity**
- Contract Number (contractNumber) — **read-only in edit mode** (immutable identifier)
- Contract Name (contractName)
- Client (clientId) — read-only link in view, picker in edit
- Contract Type (contractType)

**Section 2: Contract Terms**
- Effective Date (effectiveDate)
- Expiration Date (expirationDate)
- Auto-Renew (autoRenew) — switch in edit, badge in view

**Section 3: Rate Information**
- Rate Type (rateType)
- Base Rate (baseRate) — formatted by rate type in view
- Fuel Surcharge Method (fuelSurchargeMethod)
- Fuel Surcharge Rate (fuelSurchargeRate) — if method != "none"

**Section 4: Accessorial Charges**
- Detention Free Time (detentionFreeMinutes) — formatted as "X hours Y minutes"
- Detention Rate (detentionRatePerHour) — currency
- TONU Rate (tonuRate) — currency
- Layover Rate (layoverRatePerDay) — currency

**Section 5: Payment & Settings**
- Payment Terms Override (paymentTermsOverride) — or "Uses client default (X days)"
- Default Free Time (defaultFreeTimeMinutes)
- Status (status) — dropdown in edit mode (draft/active/terminated)
- Notes (notes)

#### Right Rail

**Title:** "Contract Health"

**Content:**
1. **Status** — StatusBadge (computed)
2. **Expiry Alert** — AlertBadge if applicable
3. **Auto-Renew** — Badge if enabled
4. **Client** — Client name (linked to `/clients/[clientId]`)
5. **Contract Duration** — "X months" or "No end date"
6. **Quick Stats** (if data exists):
   - Loads under this contract (count)
   - Total revenue (sum)
   - Route templates using this contract (count)

**Design System Mapping:**
- `RecordHeader`
- `RecordLayout` with `rail` prop
- `RecordSection`
- `RecordFieldGrid` for field layout
- `RecordField` for view-mode display
- `FormField`, `FormRow` for edit-mode inputs
- `AuditTrailFooter` for created/updated info
- `StatusBadge`, `AlertBadge` for status/alerts

#### Unsaved Changes Guard

- Track dirty state with `useEffect` comparing form values to original
- `beforeunload` event listener when dirty + edit mode
- Confirmation dialog on Cancel if dirty

---

## 4. Design System Mapping Summary

### Existing Components (Use As-Is)

| Component | Usage |
|-----------|-------|
| `KPICard`, `KPICardGrid` | Overview KPI cards |
| `StatusTabs` | Overview status filtering |
| `SearchBar` | Overview search |
| `ActiveFilters` | Overview filter pills |
| `StatusBadge` | Status display (Active/Expiring/Expired/Draft/Terminated) |
| `AlertBadge` | Expiry warnings |
| `FormField`, `FormSection`, `FormRow` | Create and edit forms |
| `ActionField` | Contract number with Generate button |
| `CompletenessIndicator` | Create form progress |
| `RecordLayout`, `RecordHeader`, `RecordSection`, `RecordField`, `RecordFieldGrid` | View/edit detail page |
| `AuditTrailFooter` | Created/updated info |
| `Skeleton` | Loading states |

### Patterns to Reuse

| Pattern | Source | Target |
|---------|--------|--------|
| Overview page structure | `clients/page.tsx` | `contracts/page.tsx` |
| KPI computation | `ClientsKPICards` | `ContractsKPICards` |
| DataGrid with tabs/search | `ClientsDataGrid` | `ContractsDataGrid` |
| PageClient with optimistic updates | `ClientsPageClient` | `ContractsPageClient` |
| Create form with sections | `ClientCreateForm` | `ContractCreateForm` |
| Record view/edit component | `ClientRecord` | `ContractRecord` |
| Client picker (cascading) | `RouteTemplateForm` | Contract forms |

### Gaps Identified

**Gap 1: Client Relation Filter for DataGrid**

The Clients overview uses text search. Contracts need a **relation filter** for the Client column — a searchable dropdown that filters by client FK.

**Proposed addition to design system:**

```tsx
// components/design-system/RelationFilter.tsx

interface RelationFilterProps<T> {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: T[];
  getOptionLabel: (option: T) => string;
  getOptionValue: (option: T) => string;
  placeholder?: string;
  searchPlaceholder?: string;
  loading?: boolean;
}

export function RelationFilter<T>({ ... }: RelationFilterProps<T>) {
  // Uses Popover + Command (combobox pattern from shadcn/ui)
  // Renders as a filter dropdown in the ActiveFilters area
  // Can be cleared (null = no filter)
}
```

**This component should be added to the design system before building Contracts.**

---

## 5. File Structure

```
apps/web/src/app/(owner)/contracts/
├── page.tsx                        # Overview page (server component + Suspense)
├── loading.tsx                     # Loading skeleton
├── _components/
│   ├── ContractsKPICards.tsx       # KPI card grid
│   ├── ContractsDataGrid.tsx       # Table/card grid with tabs/search
│   └── ContractsPageClient.tsx     # Client wrapper for optimistic updates
├── new/
│   ├── page.tsx                    # Create page
│   └── _components/
│       └── ContractCreateForm.tsx  # Create form
└── [id]/
    ├── page.tsx                    # View page (loads ContractRecord in view mode)
    ├── _components/
    │   └── ContractRecord.tsx      # Unified view/edit component
    └── edit/
        └── page.tsx                # Edit page (loads ContractRecord in edit mode)

apps/web/src/app/(owner)/actions/
└── contracts.ts                    # Server actions

apps/web/src/lib/contracts/
├── compute-contract-status.ts      # Status computation logic, types
└── format-rate.ts                  # Rate formatting helpers

apps/web/src/components/design-system/
└── RelationFilter.tsx              # NEW: Relation filter component (Gap 1)
```

---

## 6. Server Actions

```typescript
// actions/contracts.ts

export async function listContracts(params?: {
  status?: string[];
  clientId?: string;
  contractType?: string[];
  search?: string;
}): Promise<ContractWithRelations[]>

export async function getContract(id: string): Promise<ContractWithRelations | null>

export async function createContract(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState>

export async function updateContract(
  id: string,
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState>

export async function deleteContract(id: string): Promise<{ success: boolean }>

export async function generateContractNumber(): Promise<string>
```

---

## 7. Type Definitions

```typescript
// lib/contracts/compute-contract-status.ts

import type { Decimal } from '@prisma/client/runtime/library';

export interface ContractWithRelations {
  id: string;
  orgId: string;
  clientId: string;
  contractNumber: string;
  contractName: string | null;
  contractType: string;
  effectiveDate: Date | null;
  expirationDate: Date | null;
  rateType: string;
  baseRate: Decimal | null;
  fuelSurchargeMethod: string;
  fuelSurchargeRate: Decimal | null;
  detentionFreeMinutes: number;
  detentionRatePerHour: Decimal | null;
  tonuRate: Decimal | null;
  layoverRatePerDay: Decimal | null;
  paymentTermsOverride: string | null;
  autoRenew: boolean;
  status: string;
  notes: string | null;
  defaultFreeTimeMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // Relations
  client: {
    id: string;
    name: string;
    status: string;
  };
  createdBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  updatedBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  // Computed aggregates (optional, for KPIs/rail)
  _count?: {
    carrierLoads: number;
    routeTemplates: number;
  };
}

export type ContractStatusVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export interface ContractAlert {
  variant: 'warning' | 'danger' | 'info';
  message: string;
}

export interface ContractStatusResult {
  status: 'Active' | 'Expiring Soon' | 'Expired' | 'Draft' | 'Pending' | 'Terminated';
  variant: ContractStatusVariant;
  alert: ContractAlert | null;
}

export function computeContractStatus(contract: ContractWithRelations): ContractStatusResult;
```

```typescript
// lib/contracts/format-rate.ts

export type RateType = 'per_mile' | 'flat' | 'percentage' | 'hourly';

export function formatRate(rate: Decimal | number | null, rateType: string): string {
  if (rate === null) return '—';
  const value = typeof rate === 'number' ? rate : Number(rate);

  switch (rateType) {
    case 'per_mile':
      return `$${value.toFixed(2)}/mi`;
    case 'flat':
      return `$${value.toLocaleString()}`;
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'hourly':
      return `$${value.toFixed(2)}/hr`;
    default:
      return `$${value.toFixed(2)}`;
  }
}

export function formatDetentionTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${hours}h ${mins}m`;
}
```

---

## 8. Validation Schema

```typescript
// packages/validation/src/contract.ts (or inline in actions)

import { z } from 'zod';

export const createContractSchema = z.object({
  contractNumber: z.string().min(1, 'Contract number is required').max(50),
  contractName: z.string().max(255).optional().nullable(),
  clientId: z.string().uuid('Client is required'),
  contractType: z.enum(['spot', 'dedicated', 'volume', 'broker']).default('spot'),
  effectiveDate: z.coerce.date().optional().nullable(),
  expirationDate: z.coerce.date().optional().nullable(),
  rateType: z.enum(['per_mile', 'flat', 'percentage', 'hourly']).default('per_mile'),
  baseRate: z.coerce.number().min(0).optional().nullable(),
  autoRenew: z.coerce.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
}).refine(
  (data) => {
    if (data.effectiveDate && data.expirationDate) {
      return data.expirationDate >= data.effectiveDate;
    }
    return true;
  },
  { message: 'Expiration date must be after effective date', path: ['expirationDate'] }
);

export const updateContractSchema = createContractSchema.extend({
  fuelSurchargeMethod: z.enum(['none', 'percentage', 'flat', 'doe_index']).default('none'),
  fuelSurchargeRate: z.coerce.number().min(0).optional().nullable(),
  detentionFreeMinutes: z.coerce.number().int().min(0).max(1440).default(120),
  detentionRatePerHour: z.coerce.number().min(0).optional().nullable(),
  tonuRate: z.coerce.number().min(0).optional().nullable(),
  layoverRatePerDay: z.coerce.number().min(0).optional().nullable(),
  paymentTermsOverride: z.string().max(100).optional().nullable(),
  defaultFreeTimeMinutes: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).default('active'),
}).omit({ contractNumber: true }); // Contract number is immutable after creation
```

---

## 9. Implementation Phases

### Phase 1: Core CRUD (This Build)
- [ ] Add `RelationFilter` component to design system
- [ ] Overview page with KPIs, tabs, search, data grid
- [ ] Create page with sectioned form + client picker
- [ ] View page with RecordLayout + rail
- [ ] Edit page with unsaved-changes guard
- [ ] Server actions
- [ ] Mobile card view
- [ ] Contract number auto-generation

### Phase 2: Enhancements (Future)
- [ ] Filter panel with all column-specific filters
- [ ] Bulk actions (delete, change status)
- [ ] Document attachments (link to CarrierDocument)
- [ ] Contract cloning/templating
- [ ] Expiry notification email/cron
- [ ] Rate calculator/comparison tool

### Phase 3: Load Integration (Future)
- [ ] Quick-create load from contract
- [ ] Auto-populate load rates from contract
- [ ] Contract revenue reporting

---

## 10. Acceptance Criteria

### Overview Page
- [ ] Overview page loads with Suspense streaming
- [ ] KPI cards show correct counts (Total, Active, Expiring Soon, Expired)
- [ ] Status tabs filter correctly and show counts
- [ ] Search filters across contract number, name, client name
- [ ] Table is sortable by Contract #, Name, Client, Type, Rate, Effective, Expires, Status
- [ ] Client column shows relation filter (searchable dropdown)
- [ ] Date columns show date-range pickers in filter
- [ ] Expires column shows AlertBadge for contracts expiring ≤30 days
- [ ] Row click navigates to detail page
- [ ] Mobile cards display correctly below md breakpoint
- [ ] Empty state shows when no contracts exist

### Create Page
- [ ] Create form validates required fields (contractNumber, clientId)
- [ ] Contract number can be auto-generated
- [ ] Client picker is searchable and shows all active clients
- [ ] Date validation prevents expiration before effective date
- [ ] Create form shows completeness indicator
- [ ] Successful create navigates to view page with toast

### View/Edit Page
- [ ] View page shows all fields in RecordLayout
- [ ] Client name links to client detail page
- [ ] Rail shows contract health (status, expiry alert, auto-renew, stats)
- [ ] Edit page pre-fills form with current values
- [ ] Contract number is read-only in edit mode
- [ ] Edit page shows "Unsaved changes" indicator when dirty
- [ ] Edit page prompts on Cancel if dirty
- [ ] Edit page navigates back to view after successful save
- [ ] Audit trail shows created/updated info

### Design System Compliance
- [ ] All text truncates or wraps properly (no overflow)
- [ ] Touch targets are 44px+ on mobile
- [ ] Status indicators use StatusBadge, expiry alerts use AlertBadge
- [ ] Red is only used for errors/destructive actions and expired status
- [ ] All forms use FormField, FormSection, FormRow

---

## 11. Sign-off

**Awaiting approval before implementation.**

- [ ] Data model confirmed (existing `CarrierContract` model)
- [ ] Screen specs approved (overview, create, view/edit)
- [ ] File structure approved
- [ ] Gap 1 approved: Add `RelationFilter` to design system
- [ ] Client picker pattern approved (combobox from RouteTemplateForm)

---

*Spec Author: Claude (GSD Quick Task)*
