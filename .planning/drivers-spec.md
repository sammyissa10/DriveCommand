# Drivers Section Spec

**Version:** 1.0 (Proposal)
**Status:** AWAITING SIGN-OFF
**Pattern:** Mirrors Trucks section design system rebuild

---

## 1. Data Model

Drivers in DriveCommand are stored on the **User** model (role = `DRIVER`). Unlike Trucks which have a `documentMetadata` JSON field, driver compliance is tracked via:

1. **User model fields** — basic identity & license info
2. **Document model** — individual compliance documents with expiry dates

### 1.1 User Model Fields (Driver-Relevant)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | UUID | Yes | Primary key |
| `email` | String | Yes | Login/contact |
| `firstName` | String | Yes* | *Required for drivers |
| `lastName` | String | Yes* | *Required for drivers |
| `licenseNumber` | String | No | CDL number (encrypted at rest in DriverInvitation) |
| `isActive` | Boolean | Yes | Active/Deactivated status |
| `isDispatchReady` | Boolean | Yes | Can be assigned to loads |
| `role` | Enum | Yes | Must be `DRIVER` |
| `permissions` | JSON | No | RBAC permissions |

### 1.2 DriverInvitation Model Fields (Available at Invite Time)

These fields are set during invitation and should sync to User or be stored for reference:

| Field | Type | Required | Compliance Alert |
|-------|------|----------|------------------|
| `firstName` | String | Yes | — |
| `lastName` | String | Yes | — |
| `middleName` | String | No | — |
| `dateOfBirth` | Date | No | — |
| `phoneNumber` | String | No | — |
| `address` | String | No | — |
| `licenseNumber` | String | No | — |
| `licenseExpirationDate` | Date | No | **Yes** — triggers "License expires in X days" |

### 1.3 Document Model (Driver Compliance)

Documents linked to a driver via `driverId` FK. Compliance-relevant types:

| DocumentType | Purpose | Expiry Tracked |
|--------------|---------|----------------|
| `DRIVER_LICENSE` | CDL scan | via `expiryDate` |
| `MEDICAL_CARD` | DOT physical | via `expiryDate` |
| `CDL_SCAN` | License copy | via `expiryDate` |
| `SSN_CARD` | PII (restricted) | No |
| `W9`, `W4`, `I9` | Tax/employment | No |
| `VOIDED_CHECK` | Direct deposit | No |
| `PASSPORT` | Identification | via `expiryDate` |
| `DRIVER_APPLICATION` | Application form | No |

### 1.4 Compliance Alert Logic

**Alert conditions** (same 30-day threshold as Trucks):

1. **License Expiry** — `licenseExpirationDate` on User/Invitation
2. **Medical Card Expiry** — `expiryDate` on Document where `documentType = MEDICAL_CARD`
3. **CDL Expiry** — `expiryDate` on Document where `documentType = DRIVER_LICENSE` or `CDL_SCAN`

**Status derivation:**
- **Active** — `isActive = true`, no expired/expiring docs
- **Expiring Soon** — `isActive = true`, any doc expires within 30 days
- **Expired Docs** — `isActive = true`, any doc already expired
- **Deactivated** — `isActive = false`

---

## 2. Screen Specifications

### 2.1 Drivers Overview (`/drivers`)

**Pattern:** Mirrors `/trucks` exactly.

#### Header
- Title: "Drivers"
- Subtitle: "View and manage your drivers"
- Primary action: `+ Invite Driver` button → `/drivers/invite`

#### KPI Cards (4 cards)

| Card | Label | Metric | Icon |
|------|-------|--------|------|
| 1 | Total Drivers | Count all `role=DRIVER` | `Users` |
| 2 | Active & Compliant | `isActive=true` + no expired/expiring docs | `CheckCircle` |
| 3 | Expiring Soon | Docs expire within 30 days | `AlertTriangle` |
| 4 | Needs Action | `isActive=true` + expired docs OR `isActive=false` | `UserX` |

**Component:** `DriversKPICards` using `KPICardGrid` + `KPICard` from design system.

#### Status Tabs

| Tab | Value | Filter |
|-----|-------|--------|
| All | `all` | No filter |
| Active | `active` | `isActive=true`, no compliance issues |
| Expiring | `expiring` | Any doc expires within 30 days |
| Deactivated | `deactivated` | `isActive=false` |

**Component:** `StatusTabs` from design system.

#### Search & Filters

- **SearchBar:** Placeholder "Search by name, email, license..."
- **FilterConfig button:** Opens filter panel (future)
- **ActiveFilters:** Removable filter pills

**Components:** `SearchBar`, `ActiveFilters` from design system.

#### Data Grid (Desktop Table)

| Column | Sortable | Content |
|--------|----------|---------|
| ☐ | No | Bulk select checkbox |
| Name | Yes | `firstName lastName` + SamplePill if `isSample` |
| Email | Yes | Email address |
| License | No | `licenseNumber` (mono font) or "—" |
| Phone | No | Phone number or "—" |
| Status | No | StatusBadge (Active/Deactivated) |
| Compliance | No | AlertBadge if any doc expiring/expired |
| Actions | No | "Manage" link |

**Row click:** Navigates to `/drivers/[id]`

#### Mobile Cards

Each card shows:
1. **AlertBadge** (most prominent) — if compliance issue
2. **Name** + SamplePill
3. **StatusBadge** (Active/Deactivated)
4. **Email** (muted)
5. **ChevronRight** affordance

**Component:** `DriversDataGrid` — new component following `TrucksDataGrid` pattern.

---

### 2.2 Driver Quick-Create (`/drivers/invite`)

**Pattern:** Mirrors `/trucks/new` with sectioned form, but for invitation flow.

**Note:** The existing invite page uses a legacy form. The rebuild uses design system components.

#### Sections

**Section 1: Basic Information**
- `email` — Required (invite-only)
- `firstName` — Required
- `lastName` — Required
- `middleName` — Optional
- Full name preview (computed)

**Section 2: Contact & Personal**
- `phoneNumber` — Optional
- `dateOfBirth` — Optional
- `address` — Optional (AddressAutocomplete)

**Section 3: License & Compliance**
- `licenseNumber` — Optional (uppercase, mono font)
- `licenseExpirationDate` — Optional (date picker)

#### Components Used
- `FormSection` — For each section
- `FormField` — For each field
- `FormRow` — For side-by-side fields
- `CompletenessIndicator` — Optional progress (dismissible)
- `Button` — Submit

**Action:** `inviteDriver` server action (existing).

---

### 2.3 Driver View/Edit (`/drivers/[id]` and `/drivers/[id]/edit`)

**Pattern:** Single `DriverRecord` component, two routes, two modes (view/edit).

#### Header
- **Back link:** "Back to Drivers" → `/drivers`
- **Title:** `{firstName} {lastName}`
- **Subtitle:** Email address
- **Badge:** StatusBadge (Active/Deactivated)
- **Actions (view mode):**
  - "Edit" button → `/drivers/[id]/edit`
  - "Deactivate" / "Reactivate" toggle button
- **Actions (edit mode):**
  - "Unsaved changes" indicator (if dirty)
  - "Cancel" button
  - "Save Changes" button (disabled if not dirty)

#### Main Content (RecordLayout with rail)

**Section 1: Personal Information**
- First Name
- Last Name
- Middle Name
- Date of Birth
- Phone Number
- Email (read-only in edit mode)
- Address

**Section 2: License & Compliance**
- License Number
- License Expiration Date

**View mode:** Uses `RecordFieldGrid` + `RecordField`
**Edit mode:** Uses `FormSection` + `FormRow` + `FormField`

#### Right Rail

**Compliance Health**
- License Expiry: AlertBadge with days until expiry
- Medical Card Expiry: AlertBadge (from documents)
- CDL Expiry: AlertBadge (from documents)

**Current Assignment**
- If on active route: "On active route" with link
- If has active loads: "X active load(s)"
- Else: "Available"

**Documents Quick View**
- Count of uploaded documents
- "View Documents" link to documents section

#### Audit Trail Footer
- `AuditTrailFooter` component (existing)

#### Components Used
- `RecordHeader`
- `RecordLayout` (with rail)
- `RecordSection`
- `RecordField` / `RecordFieldGrid`
- `FormSection` / `FormField` / `FormRow` (edit mode)
- `StatusBadge`
- `AlertBadge`
- `Button`

---

## 3. Design System Mapping

### 3.1 Existing Components (No Changes Needed)

| Component | Usage |
|-----------|-------|
| `KPICard` + `KPICardGrid` | Overview KPIs |
| `StatusTabs` | Tab filtering |
| `SearchBar` | Search field |
| `ActiveFilters` | Filter pills |
| `StatusBadge` | Active/Deactivated status |
| `AlertBadge` | Compliance warnings |
| `FormField` | Form input wrapper |
| `FormSection` | Form section grouping |
| `FormRow` | Side-by-side fields |
| `CompletenessIndicator` | Form progress |
| `RecordLayout` | Detail page layout |
| `RecordSection` | Detail section |
| `RecordField` | Single field display |
| `RecordFieldGrid` | Grid of fields |
| `RecordHeader` | Page header |

### 3.2 New Components Required

**None.** All UI can be built with existing design system pieces.

### 3.3 Utility Functions Needed

| Function | Purpose | Location |
|----------|---------|----------|
| `computeDriverStatus` | Derive status + variant from driver + docs | `lib/drivers/compute-driver-status.ts` |
| `getDriverComplianceAlerts` | Extract expiring docs | `lib/drivers/compute-driver-status.ts` |

Pattern follows `lib/trucks/compute-truck-status.ts`.

---

## 4. File Structure

```
apps/web/src/app/(owner)/drivers/
├── page.tsx                           # Overview page (server component)
├── loading.tsx                        # Skeleton fallback (exists)
├── _components/
│   ├── DriversPageClient.tsx          # Client wrapper for optimistic updates
│   ├── DriversKPICards.tsx            # KPI cards component
│   └── DriversDataGrid.tsx            # Table + mobile cards
├── invite/
│   └── page.tsx                       # Quick-create page (rebuild)
│   └── _components/
│       └── DriverInviteForm.tsx       # Sectioned form
└── [id]/
    ├── page.tsx                       # View page (server)
    ├── edit/
    │   └── page.tsx                   # Edit page (server)
    └── _components/
        └── DriverRecord.tsx           # Unified view/edit component

apps/web/src/lib/drivers/
└── compute-driver-status.ts           # Status computation utility
```

---

## 5. Data Fetching

### 5.1 listDrivers (Existing)
Already exists at `app/(owner)/actions/drivers.ts`. May need enhancement to include:
- Document count
- Nearest expiry date for compliance KPIs

### 5.2 getDriver (Existing)
May need enhancement to include:
- Related documents with expiry dates
- Current route/load assignments

---

## 6. Migration Notes

### 6.1 Legacy Code to Replace

| File | Replacement |
|------|-------------|
| `components/drivers/driver-list.tsx` | `DriversDataGrid` in `_components/` |
| `components/drivers/driver-invite-form.tsx` | `DriverInviteForm` using design system |
| `drivers/[id]/edit/edit-driver-client.tsx` | `DriverRecord` component |
| `drivers/driver-list-wrapper.tsx` | `DriversPageClient` |

### 6.2 Preserved Functionality
- `inviteDriver` action — no changes
- `updateDriver` action — no changes
- `deactivateDriver` / `reactivateDriver` actions — no changes
- AddressAutocomplete integration — preserved

---

## 7. Checklist Before Implementation

- [ ] Confirm design system has all needed components (verified above)
- [ ] Confirm data model supports compliance alerts (verified — uses Document.expiryDate)
- [ ] Confirm existing actions are sufficient (may need listDrivers enhancement)
- [ ] User sign-off on this spec

---

## 8. Questions / Decisions Needed

1. **License Class Field** — The DriverInvitation model doesn't have a `licenseClass` field (e.g., Class A, B, C CDL). Should we add this? It's standard for trucking companies.
   - **Recommendation:** Add as optional field on DriverInvitation and display in UI.

2. **Medical Card Tracking** — Currently relies on Document uploads. Should we add an explicit `medicalCardExpiry` date field to make it more prominent (like trucks have `documentMetadata.insuranceExpiry`)?
   - **Recommendation:** Use Document model for now. Owners can upload medical card with expiry date.

3. **Assigned Truck Display** — Should the driver detail page show their currently assigned truck (if any)?
   - **Recommendation:** Yes, show in the right rail under "Current Assignment" alongside route/load info.

---

**END OF SPEC — AWAITING SIGN-OFF**
