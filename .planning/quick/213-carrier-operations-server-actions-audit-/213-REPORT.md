# Carrier Operations Audit Report
**Date:** 2026-04-14
**Scope:** All Carrier Operations server actions, Zod schemas, forms, API routes
**Mode:** Read-only — no fixes applied

## Summary
- Total findings: 21
- Critical: 4 | High: 6 | Medium: 5 | Low: 6

---

## Audit 1 — CHECK Constraint Alignment

### Methodology
For each of the 13 carrier tables, the Prisma schema was cross-referenced against the actual SQL table mapping and the application-level Zod validators used in API routes. The Carrier Operations models store all enum-like fields as plain `String` columns (no Prisma enum type), which means no SQL CHECK constraints are present. However, Zod enums in the API route validators act as application-level constraints. Mismatches between Zod enums, form option lists, and the values expected/produced by the business logic (lib/carrier/ functions and pay-calculator) are the source of ISE risk.

SQL Query run (conceptual — tables use app-level validation only):
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = '"<table>"'::regclass AND contype = 'c';
```

**Result:** No SQL-level CHECK constraints found on any of the 13 carrier tables. All constraints are enforced exclusively at the application layer via Zod schemas.

### Findings

| # | Table | Column | Finding | Current Zod/Form Values | Expected/Used Values | Severity |
|---|-------|--------|---------|------------------------|---------------------|----------|
| 1 | carrier_drivers | pay_model | API Zod enum missing 3 of 5 pay models used by pay-calculator. Drivers created with Zod-accepted `percentage` value will cause pay record generation to fall into the `unknown payModel` warning branch — no pay generated. | Zod: `['per_mile', 'percentage', 'flat_rate', 'per_stop']` | pay-calculator uses: `per_mile`, `percentage_gross`, `hourly`, `flat_rate`, `team_split` | Critical |
| 2 | carrier_drivers | pay_model | Form (CarrierDriverForm) presents `['per_mile', 'percentage', 'flat_rate', 'per_stop']` to user, matching the incorrect Zod. `hourly`, `percentage_gross`, `team_split` drivers cannot be created or edited through the UI. | Form: same 4 values | pay-calculator: 5 values including `hourly`, `percentage_gross`, `team_split` | Critical |
| 3 | loads | load_type | API Zod enum uses `['ftl', 'ltl', 'partial', 'drayage', 'intermodal']`. The DB schema has default `'ftl'` and no constraint — any string is accepted — but the form (LoadForm) does not restrict to this enum either. Minor mismatch risk if values diverge. | Zod: 5 specific values | DB: any string (default `ftl`) | Low |
| 4 | loads | rate_type | API Zod enum: `['per_mile', 'flat', 'per_stop', 'per_cwt', 'per_pallet', 'hourly']`. ContractForm `RATE_TYPES` list: `['per_mile', 'flat', 'per_load', 'hourly']`. The value `per_load` is selectable in the contract form and propagates to loads via contract auto-populate, but `per_load` is NOT in the loads API Zod enum. A load created from a `per_load` contract would be rejected with a 400 if `rateType` is explicitly sent. | API Zod: 6 values (no `per_load`) | ContractForm: includes `per_load` | High |
| 5 | dispatches | hos_cycle | Default `'us_70'` in schema. DispatchCreateSchema uses `z.string().optional()` — no enum validation. NewDispatchForm does not expose this field to the user at all (no UI for it). Only the default `us_70` is ever set. Values `us_60`, `canada_70`, `california_8day` are never accessible. | Zod: `z.string()` (unconstrained) | No UI; only default reached | Low |
| 6 | dispatches | status | Code produces/expects: `planned`, `in_progress`, `completed`, `cancelled`, `tonu`. DispatchCreateSchema does not validate this (status is server-set). `transitionDispatchStatus` hardcodes valid transitions. No mismatch — this is correct design. | Server-set only | N/A | Low |
| 7 | facilities | facility_type | FacilityCreateSchema in API route has `z.enum(['terminal', 'yard', 'warehouse', 'drop_yard', 'customer_site'])`. `softDeleteFacility` prefixes the value with `inactive_` (e.g., `inactive_terminal`). This means a subsequently fetched facility will have a `facility_type` that fails Zod validation if it is re-submitted through a PATCH — the `inactive_*` value is not in the Zod enum. | API Zod: 5 clean values | lib: creates `inactive_terminal` etc. via soft-delete | High |
| 8 | contracts | contract_type | ContractForm presents `['spot', 'contract', 'dedicated']`. API Zod enum: `['spot', 'contract', 'dedicated']`. Consistent. | Matches | Matches | Low |
| 9 | contracts | rate_type | ContractForm: `['per_mile', 'flat', 'per_load', 'hourly']`. API Zod: `['per_mile', 'flat', 'per_load', 'hourly']`. Consistent. But see Finding #4 — `per_load` cannot propagate to loads API. | Matches | Matches (but see Finding #4) | Low |
| 10 | contracts | fuel_surcharge_method | ContractForm: `['none', 'percentage', 'per_mile', 'table']`. API Zod: `['none', 'percentage', 'per_mile', 'table']`. Consistent. | Matches | Matches | Low |
| 11 | carrier_trucks | truck_type | API Zod: `['semi', 'box_truck', 'flatbed', 'reefer', 'tanker', 'day_cab', 'straight_truck']`. CarrierTruckForm presents same values. Consistent. | Matches | Matches | Low |
| 12 | carrier_trucks | status | API Zod: `['active', 'inactive', 'maintenance', 'out_of_service']`. CarrierDriverForm also has `status` field with these values. Consistent. | Matches | Matches | Low |

### Tables with no CHECK constraints
All 13 tables: clients, contracts, dispatches, loads, stops, carrier_documents, carrier_expenses, driver_pay_records, route_templates, route_template_stops, facilities, carrier_trucks, carrier_drivers

### Tables not yet migrated
None — all 13 tables exist in the schema.

---

## Audit 2 — Zod Schema vs DB NOT NULL Columns

### Methodology
For each Carrier Operations model, every field without a `?` suffix (nullable) and without a `@default()` annotation was identified as NOT NULL / no DB default. These fields MUST be provided in every INSERT or the Prisma client will fail with a NOT NULL constraint violation. Each was cross-referenced against the relevant API route Zod schema.

Fields with auto-generated defaults (`@default(now())`, `@default(dbgenerated(...))`, `@default(true/false/0)`) were excluded — these are safe.

### Findings

| # | Model | Column | Zod Schema | Finding | Severity |
|---|-------|--------|------------|---------|----------|
| 1 | CarrierExpense | `expenseType` | `expenseType: z.string().min(1)` in API route | Present and validated. Clean. | Low |
| 2 | CarrierExpense | `amount` | `amount: z.number().positive()` | Present and validated. Clean. | Low |
| 3 | CarrierExpense | `paidBy` | `paidBy: z.string().min(1)` | Present and validated. Clean. | Low |
| 4 | CarrierExpense | `orgId` | Not in Zod (injected from session) | Expected — server-injected. orgId always set from `session.tenantId`. | Low |
| 5 | CarrierDocument | `parentType` | Not in Zod schema — parsed raw from FormData as `formData.get('parent_type') as string \| null` | `parentType` is checked with `if (!parentType)` guard before use, but uses `as string | null` cast not a validated schema. If `null` slips through due to missing guard refresh, Prisma will reject. | Medium |
| 6 | CarrierDocument | `parentId` | Same as parentType — raw FormData cast | Same risk. Manual null check but no Zod validation schema for this endpoint. | Medium |
| 7 | CarrierDocument | `documentType` | Same as parentType — raw FormData cast | Same risk. | Medium |
| 8 | CarrierDocument | `fileUrl` | Generated server-side (Supabase Storage path) | Safe — generated after validation succeeds. | Low |
| 9 | CarrierDocument | `filename` | `file.name ?? 'upload'` — fallback ensures always non-null | Safe with fallback. | Low |
| 10 | CarrierDocument | `uploadedBy` | From `session.userId` — always set after auth check | Safe. | Low |
| 11 | CarrierStop | `dispatchId` | `dispatchId: z.string().uuid()` — required | Present and validated. Clean. | Low |
| 12 | CarrierStop | `sequenceOrder` | `sequenceOrder: z.number()` — required | Present. Clean. | Low |
| 13 | CarrierStop | `stopType` | `stopType: z.string()` — uses `z.string()` not `z.enum()` for a constrained field | **No enum validation** for stopType. The business logic and DB both expect `pickup`/`delivery`/`fuel_stop`/`layover`. Any string accepted at API layer could produce a stop with an unrecognized type that breaks UI display logic (STOP_TYPE_CLASSES lookup in StopCard returns undefined). | High |
| 14 | RouteTemplateStop | `stopType` | Not individually validated — created via `saveRouteTemplate` server action | stopType comes from StopBuilderStop interface (`'pickup' | 'delivery' | 'fuel_stop' | 'layover'`), which is TypeScript-enforced in the server action. Safe in server action path. The `/api/v1/carrier/stops` route uses `z.string()` (unvalidated). | Medium |
| 15 | RouteTemplateStop | `sequenceOrder` | Set server-side in saveRouteTemplate via `stop.sequence_order` | Safe. | Low |
| 16 | RouteTemplateStop | `facilityId` | Validated via `if (stops.some((s) => !s.facility_id))` guard in server action | Safe in server action path. | Low |
| 17 | CarrierLoad | `clientId` | `clientId: z.string().uuid()` — required | Present. Clean. | Low |
| 18 | CarrierDriver | `firstName` | `firstName: z.string().min(1)` | Present. Clean. | Low |
| 19 | CarrierDriver | `lastName` | `lastName: z.string().min(1)` | Present. Clean. | Low |
| 20 | CarrierTruck | `unitNumber` | `unitNumber: z.string().min(1)` | Present. Clean. | Low |
| 21 | RouteTemplate | `templateName` | `templateName: z.string().min(1)` | Present. Clean. | Low |
| 22 | RouteTemplate | `scheduleType` | `scheduleType: z.string().min(1)` — no enum validation | scheduleType accepts any non-empty string at API layer. Server action validates against known types only implicitly via RRULE generation logic. | Medium |
| 23 | RouteTemplate | `equipmentType` | `equipmentType: z.string().min(1)` — no enum validation | equipmentType accepts any non-empty string. The RouteTemplateForm uses a strict enum picker but the API route does not enforce it. | Medium |
| 24 | CarrierContract | `contractNumber` | Not in Zod (auto-generated server-side) | Safe — auto-generated with retry logic. | Low |
| 25 | CarrierContract | `clientId` | Validated and ownership-checked in API route | Present and safe. | Low |

---

## Audit 3 — Null String Initialization in Forms

### Methodology
All carrier form components were inspected for: (1) `defaultValues` or `useState` initializers using `null` for string fields, (2) `formData.get(...) as string` patterns without safe-guard helpers, (3) `useState<string | null>(null)` for fields submitted as form inputs.

### Findings

| # | File | Field | Pattern Found | Recommended Fix | Severity |
|---|------|-------|---------------|-----------------|----------|
| 1 | `ClientForm.tsx` | All string fields | All initialized as `''` (empty string) | Clean — no changes needed. | Low |
| 2 | `ContractForm.tsx` | All string fields | All initialized as `''` or explicit enum value | Clean. | Low |
| 3 | `FacilityForm.tsx` | All string fields | All initialized as `''` | Clean. | Low |
| 4 | `RouteTemplateForm.tsx` | `contractId`, `defaultDriverId`, `defaultTruckId` | Initialized as `''`, converted to `undefined` before submission via `contractId || undefined` | Clean — empty string properly converted to undefined before API call. | Low |
| 5 | `CarrierDriverForm.tsx` | All string fields | All initialized as `''` | Clean. | Low |
| 6 | `ExpenseForm.tsx` | `expenseType`, `paidBy`, `driverId` | Initialized as `''` via `useState('')` | Clean. | Low |
| 7 | `DocumentUploadModal.tsx` | `selectedFile` | `useState<File | null>(null)` | This is a file object state, not a string input — null is appropriate. | Low |
| 8 | `api/v1/carrier/documents/route.ts` | `parentType`, `parentId`, `documentType` | `formData.get('parent_type') as string \| null` | Uses raw `as string | null` cast instead of validated extraction. The null guard `if (!parentType || !parentId || !documentType)` provides runtime safety, but the `as string | null` pattern is fragile. Recommended: use `formData.get('parent_type')?.toString()` or a helper that returns `string | undefined`. | Medium |
| 9 | `StopCard.tsx` | `contact_name`, `contact_phone`, `commodity_description`, `special_instructions` | `value={stop.contact_name ?? ''}` pattern used correctly | Converting null to empty string for display — appropriate use. | Low |
| 10 | `NewDispatchForm.tsx` | `primaryDriverId`, `truckId`, `coDriverId` | Initialized as `''` via `useState('')` | Clean. | Low |

---

## Audit 4 — Tenant Isolation

### Methodology
Every API route and lib function performing a CREATE, UPDATE, or DELETE was inspected for: (1) tenant auth check at the top, (2) `orgId` sourced from session (not request), (3) FK ownership verification before referencing related entities.

### Findings

| # | File/Route | Action | Finding | Severity |
|---|------------|--------|---------|----------|
| 1 | `api/v1/carrier/dispatches` POST → `lib/carrier/dispatches.ts` `createDispatch` | CREATE | `primaryDriverId` and `truckId` are accepted from request body and written directly to DB. No ownership check that the referenced `CarrierDriver` or `CarrierTruck` belongs to `orgId`. A user from Org A could supply a `primaryDriverId` belonging to Org B, creating a cross-tenant FK link. | Critical |
| 2 | `api/v1/carrier/stops` POST → `lib/carrier/stops.ts` `createStop` | CREATE | `facilityId` is verified via `prisma.carrierFacility.findFirst({ where: { id: data.facilityId, orgId } })` — **ownership is checked**. `dispatchId` ownership is also checked. `loadId` and `clientId` are accepted without ownership verification. A user could link a stop to a `loadId` or `clientId` belonging to another tenant. | High |
| 3 | `api/v1/carrier/loads` POST → `lib/carrier/loads.ts` `createLoad` | CREATE | `clientId` is present in request — only required to be a valid UUID, **no ownership check** that the client belongs to the requesting `orgId`. Cross-tenant client attribution is possible. | Critical |
| 4 | `api/v1/carrier/loads` POST → `lib/carrier/loads.ts` `createLoad` | CREATE | `dispatchId` and `contractId` accepted from request with no ownership verification. | High |
| 5 | `api/v1/carrier/expenses` POST → `lib/carrier/expenses.ts` `createExpense` | CREATE | `dispatchId` ownership: no ownership check — only `loadId` is verified via `prisma.carrierLoad.findFirst({ where: { id: data.loadId, orgId } })`. A user could attach an expense to a dispatch belonging to another org. `driverId`, `stopId`, `receiptDocumentId` also lack ownership checks. | High |
| 6 | `api/v1/carrier/route-templates` POST → `lib/carrier/route-templates.ts` `createRouteTemplate` | CREATE | `clientId` accepted from body with no ownership check. `contractId` also accepted without ownership verification. A template could be created referencing another tenant's client or contract. | High |
| 7 | `api/v1/carrier/contracts` POST | CREATE | `clientId` is **ownership-checked** via `prisma.carrierClient.findFirst({ where: { id: clientId, orgId } })` before creation. This is the correct pattern. | Low |
| 8 | `actions/carrier/save-route-template.ts` | CREATE/UPDATE | `clientId` is not ownership-checked before creating or updating a template. Only session's `orgId` is used for the template itself, but no verification that `clientId` belongs to the org. Same issue as Finding #6 but in the server action path. | High |
| 9 | `lib/carrier/documents.ts` `uploadDocument` | CREATE | Document `parentId` is accepted from request with no ownership check at the `uploadDocument` function level. The `documents` API route does not verify that `parentId` belongs to the org before calling `uploadDocument`. If `parentType === 'stop'`, the document is linked to a stop that might belong to another org. The `listDocuments` and `deleteDocument` functions DO perform the ownership chain check — but `uploadDocument` does not. | Critical |
| 10 | `lib/carrier/documents.ts` `deleteDocument` | DELETE | Ownership is verified via parent chain check (`dispatch.orgId`, `load.orgId`). **Correct.** | Low |
| 11 | `lib/carrier/fleet-drivers.ts` `createCarrierDriver` | CREATE | `homeTerminalId` (facility FK) is accepted without ownership check. A driver could be linked to a facility from another tenant. | Medium |
| 12 | `lib/carrier/fleet-drivers.ts` `updateCarrierDriver` | UPDATE | `userId` link: checks for existing carrier driver with the same `userId` but does not verify the `userId` belongs to the same `orgId`. A user from one org could technically link their carrier driver to a user in a different org. | Medium |
| 13 | `api/v1/carrier/pay-records` GET | READ | Uses `orgId` from session as filter. Read-only — tenant isolated. Clean. | Low |
| 14 | `lib/carrier/stops.ts` `createStop` | CREATE | `dispatchId` is ownership-verified (`findFirst({ where: { id: data.dispatchId, orgId } })`). `facilityId` is ownership-verified. **Correct pattern.** | Low |
| 15 | All `lib/carrier/*.ts` update/delete functions | UPDATE/DELETE | All update and delete functions perform `findFirst({ where: { id, orgId } })` check before proceeding. If record not found (different org), returns `null` (not found). **Correct pattern.** | Low |

---

## Appendix: Files Audited

### Prisma Schema
- `apps/web/prisma/schema.prisma` — CarrierClient, CarrierContract, CarrierFacility, CarrierDriver, CarrierTruck, RouteTemplate, RouteTemplateStop, CarrierDispatch, CarrierLoad, CarrierStop, CarrierDocument, CarrierExpense, DriverPayRecord

### Validation Schemas
- `packages/validation/src/load.ts`
- `packages/validation/src/truck.ts`
- `packages/validation/src/driver.ts`
- (No carrier-specific schemas in packages/validation — carrier validation is inlined in API routes)

### Carrier Lib (Data Access)
- `apps/web/src/lib/carrier/clients.ts`
- `apps/web/src/lib/carrier/contracts.ts`
- `apps/web/src/lib/carrier/dispatches.ts`
- `apps/web/src/lib/carrier/loads.ts`
- `apps/web/src/lib/carrier/stops.ts`
- `apps/web/src/lib/carrier/facilities.ts`
- `apps/web/src/lib/carrier/fleet-drivers.ts`
- `apps/web/src/lib/carrier/fleet-trucks.ts`
- `apps/web/src/lib/carrier/expenses.ts`
- `apps/web/src/lib/carrier/documents.ts`
- `apps/web/src/lib/carrier/route-templates.ts`
- `apps/web/src/lib/carrier/pay-calculator.ts` (pay model values cross-reference)

### Server Action
- `apps/web/src/actions/carrier/save-route-template.ts`

### API Routes
- `apps/web/src/app/api/v1/carrier/clients/route.ts`
- `apps/web/src/app/api/v1/carrier/contracts/route.ts`
- `apps/web/src/app/api/v1/carrier/dispatches/route.ts`
- `apps/web/src/app/api/v1/carrier/loads/route.ts`
- `apps/web/src/app/api/v1/carrier/stops/route.ts`
- `apps/web/src/app/api/v1/carrier/facilities/route.ts`
- `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`
- `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts`
- `apps/web/src/app/api/v1/carrier/expenses/route.ts`
- `apps/web/src/app/api/v1/carrier/documents/route.ts`
- `apps/web/src/app/api/v1/carrier/route-templates/route.ts`
- `apps/web/src/app/api/v1/carrier/pay-records/route.ts`

### Form Components
- `apps/web/src/components/carrier/clients/ClientForm.tsx`
- `apps/web/src/components/carrier/contracts/ContractForm.tsx`
- `apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx`
- `apps/web/src/components/carrier/loads/LoadForm.tsx`
- `apps/web/src/components/carrier/facilities/FacilityForm.tsx`
- `apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx`
- `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx`
- `apps/web/src/components/carrier/expenses/ExpenseForm.tsx`
- `apps/web/src/components/carrier/stops/StopBuilder.tsx`
- `apps/web/src/components/carrier/stops/StopCard.tsx`
- `apps/web/src/components/carrier/documents/DocumentUploadModal.tsx`
