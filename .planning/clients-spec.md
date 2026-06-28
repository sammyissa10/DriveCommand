# Clients Section Specification

**Version:** 1.0
**Status:** DRAFT — Awaiting Sign-off
**Created:** 2026-06-21

---

## 1. Overview

The Clients section manages the business accounts (shippers, brokers, freight customers) that the carrier works with. This spec follows the established design system patterns from Trucks and Drivers.

**Terminology note:** In the codebase, the entity is `CarrierClient` (Prisma model, existing). The UI uses "Clients" as the user-facing term.

---

## 2. Data Model

### 2.1 Existing Prisma Model: `CarrierClient`

The model already exists at `prisma/schema.prisma:1885`. Key fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes (auto) | Primary key |
| `orgId` | UUID | Yes | Tenant FK (tenantId) |
| `name` | String | **Yes** | Company name |
| `dbaName` | String? | No | "Doing Business As" name |
| `mcNumber` | String? | No | Motor Carrier number |
| `dotNumber` | String? | No | DOT number |
| `taxId` | String? | No | Tax ID (EIN) |
| `primaryContact` | String? | No | Primary contact person name |
| `email` | String? | No | Email address |
| `phone` | String? | No | Phone number |
| `website` | String? | No | Website URL |
| `addressLine1` | String? | No | Street address line 1 |
| `addressLine2` | String? | No | Street address line 2 |
| `city` | String? | No | City |
| `state` | String? | No | State/Province |
| `zip` | String? | No | ZIP/Postal code |
| `country` | String | Yes (default: "US") | Country code |
| `status` | String | Yes (default: "active") | Account status |
| `portalAccess` | Boolean | Yes (default: false) | Customer tracking portal access |
| `portalEmail` | String? | No | Email for portal login |
| `paymentTerms` | Int | Yes (default: 30) | Payment terms in days |
| `creditLimit` | Decimal? | No | Credit limit amount |
| `notes` | String? | No | Internal notes |
| `isSample` | Boolean | Yes (default: false) | Sample data flag |
| `createdById` | UUID? | No | Audit: who created |
| `updatedById` | UUID? | No | Audit: who updated |
| `deletedAt` | DateTime? | No | Soft delete timestamp |
| `deletedById` | UUID? | No | Who deleted |
| `createdAt` | DateTime | Yes (auto) | Created timestamp |
| `updatedAt` | DateTime | Yes (auto) | Updated timestamp |

**Relations:**
- `contracts` → `CarrierContract[]`
- `routeTemplates` → `RouteTemplate[]`
- `stops` → `CarrierStop[]`
- `carrierDocuments` → `CarrierDocument[]`
- `expenses` → `CarrierExpense[]`
- `driverPayRecords` → `DriverPayRecord[]`
- `carrierLoads` → `CarrierLoad[]`

### 2.2 Proposed Additions

**Add enum for status (if not already exists):**
```prisma
enum ClientStatus {
  ACTIVE
  INACTIVE
  ON_HOLD
  PROSPECT
}
```

**Current status is a String** — recommend migrating to enum for type safety, but can defer to a later phase to avoid migration complexity.

### 2.3 Required vs Optional for Quick-Create

| Field | Quick-Create | Full Form |
|-------|--------------|-----------|
| `name` | **Required** | **Required** |
| `primaryContact` | Optional | Optional |
| `email` | Optional | Optional |
| `phone` | Optional | Optional |
| `addressLine1` | Optional | Optional |
| `city` | Optional | Optional |
| `state` | Optional | Optional |
| `zip` | Optional | Optional |
| `paymentTerms` | Defaults to 30 | Editable |
| `creditLimit` | Optional | Optional |
| `notes` | Optional | Optional |

**Rationale:** Only company name is strictly required. Users can add details later. This matches the "quick-create" philosophy — get the record in the system fast.

---

## 3. Screen Specifications

### 3.1 Clients Overview Page

**Route:** `/clients`

**Pattern:** Mirrors Trucks/Drivers overview exactly.

#### Header
- **Title:** "Clients"
- **Subtitle:** "View and manage your customers"
- **Primary action:** Button → "Add Client" (links to `/clients/new`)
- **Icon:** `Building2` from lucide-react

#### KPI Cards (4 cards in grid)

| Card | Metric | Icon | Color/Trend |
|------|--------|------|-------------|
| Total Clients | Count of all non-deleted clients | `Building2` | — |
| Active | Count where status = "active" | `CheckCircle` | success |
| On Hold | Count where status = "on_hold" | `Pause` | warning |
| Revenue (MTD) | Sum of invoiced revenue this month | `DollarSign` | trend up/down |

**Design System Mapping:**
- `KPICardGrid` → container
- `KPICard` → individual cards

#### Status Tabs

| Tab | Filter | Count Badge |
|-----|--------|-------------|
| All | No filter | Total count |
| Active | `status = "active"` | Active count |
| On Hold | `status = "on_hold"` | On Hold count |
| Inactive | `status = "inactive"` | Inactive count |

**Design System Mapping:** `StatusTabs`

#### Search Bar

- Placeholder: "Search by company name, contact, email..."
- Filter button (opens filter panel — Phase 2)
- Filter count badge when filters active

**Design System Mapping:** `SearchBar`

#### Active Filters

- Removable pills showing active filters
- "Clear all" link

**Design System Mapping:** `ActiveFilters`

#### Data Grid (Desktop Table)

| Column | Sortable | Cell Content |
|--------|----------|--------------|
| ☐ (select) | No | Checkbox (quiet, 50% opacity) |
| Company | Yes | `name` + `SamplePill` if isSample |
| Contact | Yes | `primaryContact` or "—" |
| Email | No | `email` truncated |
| Phone | No | `phone` or "—" |
| Status | No | `StatusBadge` (Active/On Hold/Inactive) |
| Payment Terms | Yes | `{paymentTerms} days` |
| Actions | No | "Manage" link with Eye icon |

**Row click:** Navigates to `/clients/[id]`

**Design System Mapping:**
- TanStack Table for sorting/filtering
- `StatusBadge` for status column
- `Checkbox` from shadcn/ui
- `SamplePill` for sample data indicator

#### Mobile Cards

Same structure as Trucks/Drivers mobile cards:
- Checkbox (left)
- Icon avatar (`Building2` in rounded-xl bg-muted)
- Primary line: Company name + SamplePill
- Secondary line: StatusBadge + contact name or email
- ChevronRight (right)

**Design System Mapping:** Same card pattern

#### Empty State

- Icon: `Building2` (large, muted)
- Title: "No clients found"
- Subtitle: "Add your first client to get started."

---

### 3.2 Client Quick-Create Page

**Route:** `/clients/new`

**Pattern:** Mirrors `TruckCreateForm` — sectioned form, essential fields required, helper text.

#### Header
- Back link: "← Back to Clients" (links to `/clients`)
- Title: "Add Client"
- No subtitle needed

#### Form Sections

**Section 1: Company Information**
- Description: "Basic company details. Only the company name is required."

| Field | Name | Required | Helper Text | Input Type |
|-------|------|----------|-------------|------------|
| Company Name | `name` | **Yes** | — | Text |
| DBA Name | `dbaName` | No | "If different from company name" | Text |
| MC Number | `mcNumber` | No | "Motor Carrier number" | Text |
| DOT Number | `dotNumber` | No | "DOT registration number" | Text |

**Section 2: Contact Information** (divider)
- Description: "Primary contact for this account."

| Field | Name | Required | Helper Text | Input Type |
|-------|------|----------|-------------|------------|
| Contact Name | `primaryContact` | No | — | Text |
| Email | `email` | No | — | Email |
| Phone | `phone` | No | — | Tel |
| Website | `website` | No | "Include https://" | URL |

**Section 3: Billing Address** (divider)
- Description: "Where to send invoices."

| Field | Name | Required | Helper Text | Input Type |
|-------|------|----------|-------------|------------|
| Address Line 1 | `addressLine1` | No | — | Text |
| Address Line 2 | `addressLine2` | No | — | Text |
| City | `city` | No | — | Text |
| State | `state` | No | — | State select or text |
| ZIP | `zip` | No | — | Text |

**Section 4: Account Settings** (divider)
- Description: "Payment and credit terms."

| Field | Name | Required | Helper Text | Input Type |
|-------|------|----------|-------------|------------|
| Payment Terms | `paymentTerms` | No (default: 30) | "Days until payment due" | Number with preset buttons (Net 15, Net 30, Net 45, Net 60) |
| Credit Limit | `creditLimit` | No | "Leave blank for no limit" | Currency input |
| Notes | `notes` | No | "Internal notes, not visible to customer" | Textarea |

#### Submit Button
- Label: "Create Client"
- Loading state: "Creating Client..."

#### Completeness Indicator
- Optional/dismissible
- Shows filled vs total fields

**Design System Mapping:**
- `FormSection` for each section
- `FormField` for each field
- `FormRow` for side-by-side fields (City | State | ZIP)
- `CompletenessIndicator`
- `Button` from shadcn/ui

---

### 3.3 Client View/Edit Page

**Routes:**
- View: `/clients/[id]`
- Edit: `/clients/[id]/edit`

**Pattern:** One component (`ClientRecord`), two modes. Mirrors `TruckRecord`.

#### Header

**View Mode:**
- Back link: "← Back to Clients"
- Title: Company name
- Subtitle: Primary contact name or "—"
- Badge: `StatusBadge` showing status
- Actions:
  - "Edit" button → navigates to `/clients/[id]/edit`
  - (Future: "Create Load" quick action)

**Edit Mode:**
- Same header structure
- Actions:
  - "Unsaved changes" indicator (if dirty)
  - "Cancel" button → returns to view with confirmation if dirty
  - "Save Changes" button → submits form

#### Main Content (RecordLayout with Rail)

**Sections (same in view and edit):**

**Section 1: Company Information**
- Company Name (name) — read-only in edit mode? No, editable.
- DBA Name (dbaName)
- MC Number (mcNumber)
- DOT Number (dotNumber)
- Tax ID (taxId) — masked display in view mode

**Section 2: Contact Information**
- Contact Name (primaryContact)
- Email (email)
- Phone (phone)
- Website (website) — link in view mode

**Section 3: Billing Address**
- Full address block (formatted in view mode)

**Section 4: Account Settings**
- Status (status) — dropdown in edit mode
- Payment Terms (paymentTerms)
- Credit Limit (creditLimit)
- Portal Access (portalAccess) — toggle
- Portal Email (portalEmail) — only if portalAccess is true
- Notes (notes)

#### Right Rail

**Title:** "Account Summary"

**Content:**
1. **Account Status** — StatusBadge
2. **Payment Terms** — "{X} days"
3. **Credit Limit** — "${amount}" or "No limit"
4. **Recent Activity** (if data exists):
   - Last load date
   - Total loads count
   - Total revenue (if tracked)

**Design System Mapping:**
- `RecordHeader`
- `RecordLayout` with `rail` prop
- `RecordSection`
- `RecordFieldGrid` for field layout
- `RecordField` for view-mode display
- `FormField`, `FormRow` for edit-mode inputs
- `AuditTrailFooter` for created/updated info

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
| `StatusBadge` | Status display (Active/Inactive/On Hold) |
| `FormField`, `FormSection`, `FormRow` | Create and edit forms |
| `CompletenessIndicator` | Create form progress |
| `RecordLayout`, `RecordHeader`, `RecordSection`, `RecordField`, `RecordFieldGrid` | View/edit detail page |
| `AuditTrailFooter` | Created/updated info |
| `Skeleton` | Loading states |

### Patterns to Reuse

| Pattern | Source | Target |
|---------|--------|--------|
| Overview page structure | `trucks/page.tsx` | `clients/page.tsx` |
| KPI computation | `TrucksKPICards` | `ClientsKPICards` |
| DataGrid with tabs/search | `TrucksDataGrid` | `ClientsDataGrid` |
| PageClient with optimistic updates | `TrucksPageClient` | `ClientsPageClient` |
| Create form with sections | `TruckCreateForm` | `ClientCreateForm` |
| Record view/edit component | `TruckRecord` | `ClientRecord` |

### Gaps Identified

**None.** All required components exist in the design system.

---

## 5. File Structure

```
apps/web/src/app/(owner)/clients/
├── page.tsx                      # Overview page (server component + Suspense)
├── loading.tsx                   # Loading skeleton
├── _components/
│   ├── ClientsKPICards.tsx       # KPI card grid
│   ├── ClientsDataGrid.tsx       # Table/card grid with tabs/search
│   └── ClientsPageClient.tsx     # Client wrapper for optimistic updates
├── new/
│   ├── page.tsx                  # Create page
│   └── _components/
│       └── ClientCreateForm.tsx  # Create form
└── [id]/
    ├── page.tsx                  # View page (loads ClientRecord in view mode)
    ├── _components/
    │   └── ClientRecord.tsx      # Unified view/edit component
    └── edit/
        └── page.tsx              # Edit page (loads ClientRecord in edit mode)

apps/web/src/app/(owner)/actions/
└── clients.ts                    # Server actions: listClients, getClient, createClient, updateClient, deleteClient

apps/web/src/lib/clients/
└── compute-client-status.ts      # Status computation logic, types
```

---

## 6. Server Actions

```typescript
// actions/clients.ts

export async function listClients(): Promise<ClientWithRelations[]>
export async function getClient(id: string): Promise<ClientWithRelations | null>
export async function createClient(prevState: ActionState | null, formData: FormData): Promise<ActionState>
export async function updateClient(id: string, prevState: ActionState | null, formData: FormData): Promise<ActionState>
export async function deleteClient(id: string): Promise<{ success: boolean }>
```

---

## 7. Type Definitions

```typescript
// lib/clients/compute-client-status.ts

export interface ClientWithRelations {
  id: string;
  orgId: string;
  name: string;
  dbaName: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  taxId: string | null;
  primaryContact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  status: string;
  portalAccess: boolean;
  portalEmail: string | null;
  paymentTerms: number;
  creditLimit: Decimal | null;
  notes: string | null;
  isSample: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  updatedBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  // Computed aggregates (optional, for KPIs)
  _count?: {
    carrierLoads: number;
  };
}

export type ClientStatusVariant = 'success' | 'warning' | 'neutral' | 'danger';

export interface ClientStatusResult {
  status: 'Active' | 'On Hold' | 'Inactive' | 'Prospect';
  variant: ClientStatusVariant;
}

export function computeClientStatus(client: ClientWithRelations): ClientStatusResult {
  switch (client.status) {
    case 'active':
      return { status: 'Active', variant: 'success' };
    case 'on_hold':
      return { status: 'On Hold', variant: 'warning' };
    case 'inactive':
      return { status: 'Inactive', variant: 'neutral' };
    case 'prospect':
      return { status: 'Prospect', variant: 'info' };
    default:
      return { status: 'Active', variant: 'success' };
  }
}
```

---

## 8. Validation Schema

```typescript
// packages/validation/src/client.ts (or inline in actions)

import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255),
  dbaName: z.string().max(255).optional().nullable(),
  mcNumber: z.string().max(20).optional().nullable(),
  dotNumber: z.string().max(20).optional().nullable(),
  taxId: z.string().max(20).optional().nullable(),
  primaryContact: z.string().max(255).optional().nullable(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  phone: z.string().max(30).optional().nullable(),
  website: z.string().url('Invalid URL').optional().nullable().or(z.literal('')),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  zip: z.string().max(20).optional().nullable(),
  paymentTerms: z.coerce.number().int().min(0).max(365).default(30),
  creditLimit: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateClientSchema = createClientSchema.extend({
  status: z.enum(['active', 'inactive', 'on_hold', 'prospect']).default('active'),
  portalAccess: z.coerce.boolean().default(false),
  portalEmail: z.string().email().optional().nullable(),
});
```

---

## 9. Implementation Phases

### Phase 1: Core CRUD (This Build)
- [ ] Overview page with KPIs, tabs, search, data grid
- [ ] Create page with sectioned form
- [ ] View page with RecordLayout
- [ ] Edit page with unsaved-changes guard
- [ ] Server actions
- [ ] Mobile card view

### Phase 2: Enhancements (Future)
- [ ] Filter panel with column-specific filters
- [ ] Bulk actions (delete, change status)
- [ ] Customer portal integration (portalAccess toggle)
- [ ] Import/export functionality
- [ ] Quick-add from other screens (Loads, Invoices)

---

## 10. Acceptance Criteria

- [ ] Overview page loads with Suspense streaming
- [ ] KPI cards show correct counts
- [ ] Status tabs filter correctly and show counts
- [ ] Search filters across company name, contact, email
- [ ] Table is sortable by Company, Contact, Payment Terms
- [ ] Row click navigates to detail page
- [ ] Mobile cards display correctly below md breakpoint
- [ ] Create form validates required field (name only)
- [ ] Create form shows completeness indicator
- [ ] View page shows all fields in RecordLayout
- [ ] Edit page pre-fills form with current values
- [ ] Edit page shows "Unsaved changes" indicator when dirty
- [ ] Edit page prompts on Cancel if dirty
- [ ] Edit page navigates back to view after successful save
- [ ] Audit trail shows created/updated info
- [ ] Sample data banner appears if tenant has sample data
- [ ] All text truncates or wraps properly (no overflow)
- [ ] Touch targets are 44px+ on mobile

---

## 11. Sign-off

**Awaiting approval before implementation.**

- [ ] Data model confirmed
- [ ] Screen specs approved
- [ ] File structure approved
- [ ] No design system gaps

---

*Spec Author: Claude (GSD Quick Task 473)*
