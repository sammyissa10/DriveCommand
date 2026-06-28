# Quick Task 473: Design Clients Section Spec

**Date:** 2026-06-21
**Status:** COMPLETE (Pass 1 Only — Awaiting Sign-off)

---

## Objective

Design the Clients section specification following the established design system patterns from Trucks and Drivers. Propose data model, three screens (overview, quick-create, view/edit), and map to existing design system pieces.

---

## Tasks

### Task 1: Read Design System ✅
- Read `.planning/design-system.md`
- Identified all available components: FormField, FormSection, FormRow, StatusBadge, AlertBadge, StatusTabs, KPICard, KPICardGrid, SearchBar, ActiveFilters, RecordLayout, RecordHeader, RecordSection, RecordField, RecordFieldGrid, CompletenessIndicator

### Task 2: Analyze Existing Patterns ✅
- Read `trucks/page.tsx` — overview structure with Suspense, KPI computation
- Read `trucks/_components/TrucksPageClient.tsx` — optimistic update wrapper
- Read `trucks/_components/TrucksDataGrid.tsx` — tabs, search, table, mobile cards
- Read `trucks/[id]/_components/TruckRecord.tsx` — unified view/edit component
- Read `trucks/new/_components/TruckCreateForm.tsx` — sectioned create form
- Read `drivers/page.tsx` and `drivers/_components/DriversDataGrid.tsx` — confirmed same patterns

### Task 3: Analyze Data Model ✅
- Found existing `CarrierClient` model at `prisma/schema.prisma:1885`
- Model has all needed fields: name, contact, email, phone, address, paymentTerms, creditLimit, status, etc.
- No schema changes required for Phase 1

### Task 4: Write Specification ✅
- Created `.planning/clients-spec.md` with:
  - Data model documentation (required vs optional fields)
  - Overview page spec (KPIs, tabs, search, data grid, mobile cards)
  - Quick-create page spec (sectioned form with CompletenessIndicator)
  - View/edit page spec (unified RecordLayout with rail, unsaved-changes guard)
  - Design system mapping (all elements → existing components)
  - File structure
  - Server actions
  - Type definitions
  - Validation schema
  - Acceptance criteria

---

## Design System Gap Analysis

**Result: No gaps identified.**

All required UI elements map to existing design system components:
- KPI cards → `KPICard`, `KPICardGrid`
- Status filtering → `StatusTabs`
- Search → `SearchBar`, `ActiveFilters`
- Status display → `StatusBadge`
- Forms → `FormField`, `FormSection`, `FormRow`, `CompletenessIndicator`
- Detail pages → `RecordLayout`, `RecordHeader`, `RecordSection`, `RecordField`, `RecordFieldGrid`
- Audit info → `AuditTrailFooter`

---

## Output

**Spec file:** `.planning/clients-spec.md`

---

## Next Steps (After Sign-off)

1. Implement server actions (`listClients`, `getClient`, `createClient`, `updateClient`, `deleteClient`)
2. Implement `lib/clients/compute-client-status.ts`
3. Build overview page (`/clients`)
4. Build create page (`/clients/new`)
5. Build view/edit pages (`/clients/[id]`, `/clients/[id]/edit`)
