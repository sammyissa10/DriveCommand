# Schema Reconciliation — PascalCase vs snake_case Tables

**Status:** Diagnostic only. No code or schema changes have been made.  
**Prepared for:** Phase C activation tracker design decision  
**Date:** 2026-04-29  

---

## Summary

- **Two completely independent data subsystems exist in the same database.** PascalCase tables (`Truck`, `Customer`, `Load`) are the Owner Portal architecture, introduced in Phase 47 via Prisma migrations. snake_case tables (`carrier_trucks`, `clients`, `loads`, `carrier_drivers`) are the Carrier Operations module, predating Phase 47. Neither syncs to the other — no triggers, no views, no FK bridges between the two systems' core records.
- **PascalCase tables are canonical for the Owner Portal.** Every owner portal page, server action, and mobile API route uses `prisma.truck`, `prisma.load`, `prisma.customer` exclusively. The activation tracker for Phase C must query PascalCase tables. The Phase B seed-data seeder already writes to PascalCase — sample records will appear in the owner portal as intended.
- **QA tenant data is all in snake_case** — a legacy artifact from being created before Phase 47. QA tenants show zero rows in `Truck`, `Customer`, and `Load`, and all their operational data lives in `carrier_trucks`, `clients`, and `loads`. This is expected and not a bug in the current system.
- **The snake_case tables are NOT orphaned raw SQL — they are also Prisma-managed** via `@@map` annotations on `CarrierTruck`, `CarrierDriver`, `CarrierClient`, `CarrierLoad` models. The Carrier Operations module is a fully-functional Prisma subsystem. It is not being deprecated by any current phase.
- **The driver framing in the task prompt is partially incorrect.** For the Owner Portal, drivers are `User` records with `role='DRIVER'`, not `CarrierDriver` records. `carrier_drivers` is the Carrier Operations module's driver entity (CDL, pay model, home terminal) and is a different concept. Sample drivers for owner portal activation tracking should be seeded as `User` rows with `role='DRIVER'`, not into `carrier_drivers`. The `User` table currently has no `isSample` column — that is the gap to fix.

---

## Findings Per Entity

### Trucks

**Canonical table for Owner Portal:** `"Truck"` (Prisma model `prisma.truck`)  
**Carrier Operations table:** `carrier_trucks` (Prisma model `prisma.carrierTruck`, `@@map("carrier_trucks")`)

**Production code using `prisma.truck` (Owner Portal):**
- `src/app/(owner)/actions/trucks.ts` — full CRUD (create, findMany, findUnique, update)
- `src/app/(owner)/loads/[id]/page.tsx`, `loads/new/page.tsx`, `loads/[id]/edit/page.tsx` — truck picker for load assignment
- `src/app/(owner)/actions/routes.ts`, `maintenance.ts`, `compliance.ts` — truck lookups
- `src/app/api/mobile/owner/trucks/route.ts` — mobile owner API
- Raw SQL on `"Truck"`: `src/app/(owner)/fuel/actions.ts`, `safety/actions.ts`, `live-map/actions.ts`, `api/v1/carrier/live-map/vehicles/route.ts`

**Production code using `carrier_trucks` (Carrier Operations):**
- `src/lib/carrier/fleet-trucks.ts` — vehicle_id ELD lookup
- `src/app/(owner)/live-map/actions.ts` — *fallback only* when `Truck` returns no GPS match ("Diagnostics fallback for carrier_trucks — not in Prisma's Truck model")
- `src/app/api/v1/carrier/live-map/vehicles/route.ts` — carrier live map vehicles list

**Schema comparison (selected columns):**

| Column concept | `Truck` | `carrier_trucks` |
|---|---|---|
| Tenant FK | `tenantId → Tenant.id` | `org_id → Tenant.id` |
| Make/model/year/VIN | ✓ | ✓ |
| Odometer | `odometer` (integer) | `current_odometer_miles` + `last_odometer_date` |
| Compliance dates | via `Document` records | `license_expiry`, `registration_expiry`, `insurance_expiry` (native columns) |
| Dispatch-readiness | `isDispatchReady` (bool) | via `dispatches` table |
| ELD vehicle ID | — | `vehicle_id` (varchar, ELD identifier) |
| Sample flag | `isSample` ✓ | — |
| Maintenance | `inMaintenance` (bool) | via separate maintenance tables |

**Assessment:** Superset/different purposes. `carrier_trucks` is richer for compliance (native expiry dates) and ELD integration. `Truck` is richer for Prisma-managed fleet ops (dispatch-readiness, sample flag, FK to Document/Invoice/Route).

---

### Drivers

**Owner Portal:** There is no `Driver` Prisma model. Owner portal drivers are **`User` records** with `role='DRIVER'` scoped to `tenantId`.

**Carrier Operations:** `carrier_drivers` (Prisma model `prisma.carrierDriver`, `@@map("carrier_drivers")`) — a separate entity with CDL details, pay model, home terminal, and FK to `User.id` via `user_id`.

**Production code using `User WHERE role='DRIVER'` (Owner Portal):**
- `src/app/api/mobile/owner/drivers/route.ts` — `tx.user.findMany({ where: { tenantId, role: 'DRIVER', isActive: true } })`
- `src/app/(owner)/actions/drivers.ts` — driver invitations, which create `User` records
- Owner dashboard driver status chips query `User WHERE role='DRIVER'`

**Production code using `prisma.carrierDriver` (Carrier Operations):**
- `src/app/api/v1/carrier/dashboard/drivers-status/route.ts` — `prisma.carrierDriver.findMany()`
- `src/app/api/v1/carrier/dashboard/alerts/route.ts` — `prisma.carrierDriver.count()`
- `src/app/api/auth/accept-invitation/route.ts` — `tx.carrierDriver.updateMany()` on driver invite accept

**The relationship between the two:** `carrier_drivers.user_id → User.id` — a Carrier Operations driver can be linked to a DriveCommand user account, but they are different records. Not all `User WHERE role='DRIVER'` records have a corresponding `CarrierDriver`. Not all `CarrierDriver` records have a linked `User`.

**Key carrier_drivers columns:**
`id, org_id, user_id (nullable), first_name, last_name, email, phone, cdl_number, cdl_state, cdl_class, cdl_expiry, home_terminal_id, pay_model, pay_rate, pay_period, status, notes, created_at, updated_at` — **no `isSample` column, no `tenantId` column (uses `org_id`).**

---

### Customers / Clients

**Canonical table for Owner Portal:** `"Customer"` (Prisma model `prisma.customer`)  
**Carrier Operations table:** `clients` (Prisma model `prisma.carrierClient`, `@@map("clients")`)

**Production code using `prisma.customer` (Owner Portal):**
- `src/app/(owner)/actions/customers.ts` — full CRUD
- `src/app/(owner)/actions/loads.ts`, `notifications.ts` — customer lookups on load events
- All CRM pages (`/crm`, `/crm/[id]`, `/crm/[id]/edit`)
- All invoice pages, load create/edit pages
- `src/app/api/mobile/owner/customers/route.ts`
- `src/server/services/workflows/`, `src/server/api/routers/workflows/` — workflow automation

**No production code reads from `clients` in owner portal pages.** The `clients` table is used exclusively by Carrier Operations (`src/lib/carrier/reports.ts`, dispatch flows, `carrier_expenses`, `driver_pay_records`, `route_templates`, `contracts`, `stops`).

**Schema comparison (selected columns):**

| Column concept | `Customer` | `clients` |
|---|---|---|
| Tenant FK | `tenantId → Tenant.id` | `org_id → Tenant.id` |
| Name | `companyName` | `name` + `dba_name` |
| Contact | `contactName` | `primary_contact` |
| Freight IDs | — | `mc_number`, `dot_number`, `tax_id` |
| Financial | `totalLoads`, `totalRevenue` (cached aggregates) | `credit_limit`, `payment_terms` |
| Portal access | — | `portal_access`, `portal_email` |
| Sample flag | `isSample` ✓ | — |

**Assessment:** Different models serving different product surfaces. `clients` is a freight-industry broker/shipper record. `Customer` is a CRM contact record. Different purposes; not interchangeable.

---

### Loads

**Canonical table for Owner Portal:** `"Load"` (Prisma model `prisma.load`)  
**Carrier Operations table:** `loads` (Prisma model `prisma.carrierLoad`, `@@map("loads")`)

**Production code using `prisma.load` (Owner Portal):**
- `src/app/(owner)/actions/loads.ts` — full CRUD (create, findMany, findFirst, update, status transitions)
- All owner portal load pages, invoice pages, route pages, CRM aggregate queries
- `src/app/api/mobile/owner/loads/route.ts`, `driver/loads/route.ts`
- `src/app/(driver)/actions/driver-dashboard.ts`
- `src/app/api/track/[token]/route.ts` — customer tracking public page
- `src/app/(admin)/actions/tenants.ts` — sysadmin load count
- Raw SQL on `"Load"`: `live-map/actions.ts`, `api/v1/carrier/live-map/vehicles/route.ts`

**Production code using `loads` (Carrier Operations):**
- `src/lib/carrier/reports.ts` — carrier revenue/expense reports
- `src/app/api/v1/carrier/live-map/vehicles/route.ts` — carrier live map load status
- Foreign keys from `dispatches`, `carrier_expenses`, `driver_pay_records`, `carrier_documents`, `stops`

**Schema comparison (selected columns):**

| Column concept | `Load` | `loads` |
|---|---|---|
| Tenant FK | `tenantId → Tenant.id` | `org_id → Tenant.id` |
| Freight IDs | `loadNumber` | `bol_number`, `pro_number`, `po_number`, `reference_number` |
| Dispatch link | `routeId → Route` | `dispatch_id → dispatches` |
| Customer link | `customerId → Customer` | `client_id → clients` |
| Hazmat | — | `hazmat`, `hazmat_class` |
| Financials | `rate` (single field) | `rate_amount`, `carrier_cost`, `fuel_surcharge`, `detention_amount`, `other_charges`, `total_revenue` |
| Geo tracking | `pickupLat/Lng`, `deliveryLat/Lng`, `geofenceFlags`, `trackingToken` | — |
| Sample flag | `isSample` ✓ | — |

**Assessment:** Different models for different use cases. `loads` (Carrier Operations) is a freight-industry TMS load record with full financial breakdown and hazmat fields. `Load` (Owner Portal) is simpler, has tracking/geofencing, and is FK-linked to the Owner Portal's Truck/Customer/Route graph.

---

## Data State in QA Tenants

All queries run 2026-04-29 against production database.

### qa-test-org

| Table | Count | Notes |
|---|---|---|
| `"Truck"` | **0** | PascalCase (Owner Portal) |
| `carrier_trucks` | **1** | snake_case (Carrier Ops) |
| `"Customer"` | **0** | PascalCase (Owner Portal) |
| `clients` | **4** | snake_case (Carrier Ops) |
| `"Load"` | **0** | PascalCase (Owner Portal) |
| `loads` | **40** | snake_case (Carrier Ops) |
| `carrier_drivers` | **1** | Carrier Ops driver |
| `User WHERE role='DRIVER'` | **1** | Owner Portal driver (User record) |

### drivecommand-demo

| Table | Count | Notes |
|---|---|---|
| `"Truck"` | **0** | PascalCase (Owner Portal) |
| `carrier_trucks` | **1** | snake_case (Carrier Ops) |
| `"Customer"` | **0** | PascalCase (Owner Portal) |
| `clients` | **4** | snake_case (Carrier Ops) |
| `"Load"` | **0** | PascalCase (Owner Portal) |
| `loads` | **28** | snake_case (Carrier Ops) |
| `carrier_drivers` | **2** | Carrier Ops drivers |
| `User WHERE role='DRIVER'` | **5** | Owner Portal drivers (User records) |

**Interpretation:** Both QA tenants were created before Phase 47. They have never used the Owner Portal's PascalCase tables — all operational data is in Carrier Operations tables. This is a legacy data state, not a bug. Any activation tracking that reads PascalCase tables will show zero progress for these tenants, which is technically correct (they never used the owner portal CRUD flows).

If QA testing for Phase C requires these tenants to have PascalCase records, a one-time data migration is needed for QA purposes only — or new test tenants should be created via the Phase 48 signup flow.

---

## Schema Relationships and RLS State

### Relationship type

The PascalCase and snake_case systems are **completely independent (option a)**. Confirmed by:
- **Zero triggers** between any of these tables (`information_schema.triggers` returned empty for all six tables)
- **Zero views** — none of the entity table names are views
- **No FK cross-references** between core records of the two systems, with two exceptions:
  - `GPSLocation` has FKs to BOTH `Truck.id` (PascalCase) and `carrier_trucks.id` (snake_case) — the live map bridges both systems for GPS display
  - `carrier_drivers.user_id → User.id` — a Carrier Operations driver can optionally be linked to a DriveCommand user account

The two systems share `Tenant.id` as the common anchor (both `tenantId` and `org_id` point to `Tenant.id`), but their entity records are independent.

### RLS state

| Table | `relrowsecurity` | `relforcerowsecurity` | Notes |
|---|---|---|---|
| `"Truck"` | true | **true** | Phase A hardening — forced for all roles including service_role |
| `"Customer"` | true | **true** | Phase A hardening |
| `"Load"` | true | **true** | Phase A hardening |
| `carrier_trucks` | true | false | RLS enabled but NOT forced — service_role bypasses without set_config |
| `clients` | true | false | RLS enabled but NOT forced |
| `loads` | true | false | RLS enabled but NOT forced |
| `carrier_drivers` | true | false | RLS enabled but NOT forced |

**Implication for Phase C:** The activation tracker will query PascalCase tables using `bypass_rls=on` (same pattern as `hydrateTenant` and `provisionTenant`). No RLS complications for PascalCase tables. snake_case tables are irrelevant to Phase C.

---

## Phase B seed-sample-data Analysis

**File:** `src/lib/onboarding/seed-sample-data.ts`

**Tables written:**
1. `tx.truck.create()` → `"Truck"` table ✓
2. `tx.customer.create()` → `"Customer"` table ✓
3. `tx.load.create()` → `"Load"` table ✓

**Driver seeding:** Intentionally skipped. The TODO comment added in the Phase 47-48 boundary states: _"drivers cannot be sample-flagged because carrier_drivers has no isSample column."_ However, as documented above, this framing is incorrect — owner portal drivers are `User` records, not `CarrierDriver` records. The correct fix is not to add `isSample` to `carrier_drivers` but to add `isSample` to `User` and seed sample `User` rows with `role='DRIVER'`. See Driver-Specific Recommendation below.

**Will samples appear in the owner portal UI?** Yes. Every owner portal dashboard, load page, truck page, and CRM page reads from `"Truck"`, `"Customer"`, and `"Load"`. The seeder writes to exactly those tables. Samples will appear with the `isSample=true` flag for banner/pill rendering. The live map, fuel actions, safety actions, and compliance pages also query these tables. ✓

**Will samples appear in Carrier Operations dashboards?** No. Carrier Operations reads from `carrier_trucks`, `clients`, `loads`, `carrier_drivers`. The seeder does not write to those tables. This is correct behavior — sample data is scoped to the owner portal onboarding experience.

---

## Recommended Path Forward

**Recommendation: Option (d) — PascalCase IS canonical for the Owner Portal. No migration of existing production code is needed. The activation tracker queries PascalCase tables.**

Rationale:

1. **PascalCase tables are what owner portal code already reads and writes.** 100% of owner portal server actions, pages, and mobile API routes use `prisma.truck`, `prisma.load`, `prisma.customer`. Changing this would require touching ~40+ files.

2. **snake_case tables serve a different product module** (Carrier Operations), not the Owner Portal. They will continue to exist and be used by `src/lib/carrier/` and `src/app/api/v1/carrier/`. They should not be treated as the canonical source for activation tracking.

3. **Phase B seeder already writes to the right tables.** Samples written to PascalCase tables will appear in the owner portal UI immediately. No additional seeder changes are needed for Trucks, Customers, and Loads.

4. **The QA tenant data gap is a legacy issue, not an architecture issue.** QA tenants created before Phase 47 have no PascalCase data. For Phase C QA, use new tenants created via the Phase 48 signup flow.

5. **Blast radius of this recommendation:** Zero changes to existing Carrier Operations code. Zero changes to owner portal pages. The only additions needed are: (a) `isSample` column on `User` table for sample driver tracking, and (b) seed sample `User` driver records in `seed-sample-data.ts`.

### What the activation tracker (Phase C) should query

| Entity | Table | Filter for "real" records |
|---|---|---|
| Trucks | `"Truck"` | `WHERE tenantId=X AND isSample=false AND archivedAt IS NULL` |
| Customers | `"Customer"` | `WHERE tenantId=X AND isSample=false` |
| Loads | `"Load"` | `WHERE tenantId=X AND isSample=false AND archivedAt IS NULL` |
| Drivers | `"User"` | `WHERE tenantId=X AND role='DRIVER' AND isSample=false AND isActive=true` |

---

## Driver-Specific Recommendation

**The task prompt's framing is incorrect.** `carrier_drivers` is not "the owner portal driver table" — it is the Carrier Operations module's driver entity (CDL tracking, pay model, home terminal, ELD dispatch). Owner portal drivers are `User` records with `role='DRIVER'`.

For sample driver seeding and activation tracking, the correct target is `User`, not `carrier_drivers`.

**Evaluating the options as reframed for `User`:**

### Option (a) — Add `isSample` column to `User`

This is the correct approach. `User` is a PascalCase Prisma-managed table, consistent with the pattern used for `Truck`, `Customer`, and `Load`. The column would be:
```prisma
isSample  Boolean  @default(false)
```
Migration is straightforward (`ALTER TABLE "User" ADD COLUMN "isSample" boolean NOT NULL DEFAULT false`). The Phase B seeder would then create sample `User` records with `role='DRIVER'` and `isSample=true`.

**Pros:** Consistent with the three other entity tables. Easy to query. Idempotent seeding easy to enforce (check `isSample=true` before re-seeding). Activation tracker query is uniform.  
**Cons:** Requires a migration. Sample users are real auth-bypassed `User` rows — need to ensure they don't appear in invite flows, login flows, or driver-facing mobile screens. A `isActive=false` or `isSample=true` guard must be added to those flows.

### Option (b) — Separate `sample_drivers` table

**Not recommended.** Over-engineered. Adds a table that serves no purpose beyond seeding. The activation tracker would need a LEFT JOIN. No upside over option (a).

### Option (c) — Tag/marker pattern (e.g., `notes` column prefix or naming convention)

**Not acceptable for this codebase for three reasons:**
1. `User` has no `notes` column. A naming convention on `email` or `firstName` (e.g., `"sample.driver@drivecommand.test"`) is fragile — business logic coupled to string patterns is a maintenance hazard.
2. Inconsistency: `Truck`, `Customer`, and `Load` all use a proper boolean `isSample` column. Using a different pattern for `User` would create a permanent inconsistency in how "real vs sample" is determined.
3. Phase C activation tracker would need special-case query logic for drivers vs all other entities.

**Recommendation: Option (a) — add `isSample` to `User`.**

**Additional notes on `carrier_drivers`:** Do not add `isSample` to `carrier_drivers`. That table is the Carrier Operations module's driver profile, scoped to a different product surface. Adding owner-portal-semantics columns to it would couple two independent systems. If the Carrier Operations module ever needs sample data seeding, it should add its own `isSample` column independently.

---

## Migration / Refactor Work Required

### For Phase C activation tracker (minimum viable)

1. **Migration:** `ALTER TABLE "User" ADD COLUMN "isSample" boolean NOT NULL DEFAULT false;`  
   Add to Prisma schema: `isSample Boolean @default(false)` on the `User` model.

2. **Seed-sample-data.ts:** Add sample `User` creation for drivers (per bucket: 1 for OWNER_OPERATOR, 2-3 for SMALL/MEDIUM/LARGE). Use `tx.user.create()` with `role: 'DRIVER', isSample: true, isActive: true, tenantId`. Set `passwordHash: null` (sample drivers do not log in).

3. **Owner portal driver list:** Add `isSample=false` filter to any driver list query that does not already have one. Audit: `src/app/(owner)/actions/drivers.ts`, `src/app/api/mobile/owner/drivers/route.ts`.

4. **DriverInvitation flow:** Confirm that `prisma.driverInvitation.create()` cannot be called for `isSample=true` users (the invitation form should exclude sample drivers from the selectable list). This is a UI guard, not a schema constraint.

5. **Phase C activation tracker queries:** Add `AND isSample=false` predicate to all four entity counts. Use bypass_rls pattern (same as hydrateTenant).

6. **Reset logic (hydrateTenant idempotency):** When re-seeding (provisioningPhase reset to MINIMAL), the cleanup must also `DELETE FROM "User" WHERE tenantId=X AND isSample=true AND role='DRIVER'`. Currently the reset SQL in the test instructions does not include User cleanup.

### No changes needed to

- All owner portal pages (already read from PascalCase, already correct)
- `seed-sample-data.ts` Truck/Customer/Load seeding (already writes to correct tables)
- Carrier Operations module (`src/lib/carrier/`, `src/app/api/v1/carrier/`) — unaffected
- `carrier_drivers` table — no changes needed

### Blast radius

**Files to touch:** `seed-sample-data.ts`, `src/app/(owner)/actions/drivers.ts`, `src/app/api/mobile/owner/drivers/route.ts`, Prisma schema, one new migration file.  
**Files NOT to touch:** All 40+ owner portal pages that use `prisma.truck/load/customer`, all Carrier Operations files, `hydrate-tenant.ts` (except cleanup logic), `provision-tenant.ts`.

**QA risk:** Low. Adding `isSample` to `User` is an additive migration (default false). Existing User records are unaffected. The only regression risk is if a driver list query forgets the `isSample=false` filter and sample drivers appear in production UI — addressable with a test.

---

## Open Questions for Sammy

1. **Do the QA tenants (qa-test-org, drivecommand-demo) need to work with Phase C activation tracking?** If yes, new test accounts created via the Phase 48 signup flow should be used, since those tenants have zero PascalCase data. A one-time `INSERT INTO "Truck"/"Customer"/"Load"` for those tenants could be done as a QA data fixture, but it's probably cleaner to just create new test tenants.

2. **Are the Carrier Operations snake_case tables in active use by any paying tenant?** The presence of 40 loads and 4 clients in qa-test-org's snake_case tables suggests this module was actively developed and tested. Is there a production tenant using `/api/v1/carrier/` routes? This affects whether Phase D or later phases need to address the snake_case → PascalCase convergence.

3. **Is the Carrier Operations module planned to be merged with the Owner Portal module, or are they intended to remain separate products?** If they will eventually converge, a migration plan is needed. If they are permanently separate, the two-system reality should be documented more explicitly in CLAUDE.md.

4. **The live map bridges both systems** via fallback logic in `src/app/(owner)/live-map/actions.ts`. Is this intentional long-term (owner portal trucks + Carrier Operations trucks shown on same map), or is it a temporary shim that should be removed once all tenants migrate to PascalCase trucks?

5. **Should sample driver `User` records be marked `isActive: false`?** This would prevent them from appearing in any "active driver" list without needing explicit `isSample` checks everywhere. However, it may complicate scenarios where sample drivers need to be shown as "active" in the sample dashboard for demo purposes. Sammy should decide whether sample drivers should look active or be hidden.

6. **For spec section 6.3 (sample driver count per fleet size bucket):** The spec references seeding drivers. With `User`-based driver seeding, each sample driver needs a unique email and no password (they cannot log in). Confirm the email pattern — suggested: `sampledriver{n}@{tenantSlug}.sample.drivecommand.test` — and confirm these addresses should never receive real emails.

---

*End of diagnostic report. No code or schema changes were made.*
