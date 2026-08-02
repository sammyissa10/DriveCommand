# Document Import — Phase 0 Repository Audit

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` (v1, read in full)
**Audited:** 2026-08-02
**Branch at audit:** `master` @ `7cf2301c`
**Scope:** read-only. No feature code, no migrations, no components, no installs.

Every model name, field name, enum value, file path, and package version below was read
from the repository. Anything proposed that does not exist today is marked **NEW**.

### Evidence and limits

Read this before acting on anything below. Claims here fall into three grades:

- **Read** — taken from a file or migration I opened. Model names, field lists, enum values,
  CHECK constraints, package versions, file paths. Treat as fact; the citation is the receipt.
- **Executed** — I ran the command and report its real output. Only two things: `tsc --noEmit`
  in both apps (exit 0, see Appendix), and the greps/counts behind the usage numbers.
- **Inferred** — reasoning across two or more sources without executing anything. Each is
  labelled inline. There are three: **B4** (the facility CHECK-constraint violation is read from
  code + constraint, never observed at runtime), **D5-A** (whether Claude returns reliable
  `pageNumbers` for a 16-page PDF), and **D2/D3** (matrix and optimiser behaviour, since neither
  exists yet).

**Nothing here was taken from prior-session memory or from the spec's own vocabulary.** An earlier
revision of this document asserted a pre-existing `tsc` error baseline that was carried over from
stale notes rather than measured; it was false, and the corrected result is in the Appendix. Two
further claims in that revision — that the tenant-scoped Prisma client cannot be used with
`$transaction`, and that `sharp` was unused — were also wrong and are corrected in B9 and D5.
If a claim below is not cited to a path, treat it as unverified and check it.

---

## 0. Executive orientation — the two naming universes

The spec asks (Section 0.8) whether more than one live schema universe exists. **It does,
and both are live.** Neither is dead code.

| Universe | Models | Usage refs in `apps/web/src` |
|---|---|---|
| **Carrier (current)** | `CarrierClient`, `CarrierContract`, `CarrierFacility`, `CarrierDriver`, `CarrierTruck`, `RouteTemplate`, `RouteTemplateStop`, `Trip`, `CarrierLoad`, `CarrierStop`, `CarrierDocument` | `carrierClient` 2326 · `carrierLoad` 2250 · `routeTemplate` 2463 · `carrierStop` 1162 |
| **Legacy (v1–v4)** | `Route`, `RouteStop`, `Load`, `Customer`, `Truck`, `Driver`-via-`User`, `Document` | `prisma.customer` 64 · `prisma.load.` 53 · `prisma.route.` 47 · `prisma.truck.` 32 · `prisma.routeStop` 23 · `prisma.document.` 24 |

**Resolution: Document Import targets the Carrier universe exclusively.** It is where
`Trip`, `RouteTemplate`, `CarrierFacility` and `CarrierStop` live, and it is what
`/carrier/*` pages and `/api/v1/carrier/*` routes serve. The legacy universe is still
wired to the older `/routes`, `/loads`, `/dashboard` pages and must not be touched.

A third naming layer sits *inside* the carrier universe and is the single largest source
of drift risk in this build:

```
  Prisma model      Postgres table     Relation field    API path        UI label
  ------------      --------------     --------------    --------        --------
  Trip           →  "dispatches"    →  .dispatch      →  /dispatches  →  "Trip"
  CarrierStop    →  "stops"         →  .stops         →  /stops       →  "Stop"
  CarrierLoad    →  "loads"         →  .carrierLoads  →  /loads       →  "Load"
  CarrierClient  →  "clients"       →  .client        →  /clients     →  "Client"
```

`Trip` and `dispatch` are the same thing. Both spellings are correct in different layers.
Code that writes `prisma.dispatch` or `tenantPrisma.trip` — only the second compiles.

---

## A. Name mapping — spec term → actual repo entity

### A.1 Prisma models

| Spec term | **Actual Prisma model** | **Actual table** | Tenant column | Soft delete |
|---|---|---|---|---|
| Client | `CarrierClient` | `clients` | `orgId` → `org_id` | `deletedAt` ✓ |
| Client contact | `CarrierClientContact` | `client_contacts` | `orgId` | ✗ |
| Contract | `CarrierContract` | `contracts` | `orgId` | `deletedAt` ✓ |
| Route template | `RouteTemplate` | `route_templates` | `orgId` | ✗ (`active` Boolean) |
| Route template stop | `RouteTemplateStop` | `route_template_stops` | *(none — via parent)* | ✗ |
| Trip / dispatch | `Trip` | `dispatches` | `orgId` | `deletedAt` ✓ |
| Stop | `CarrierStop` | `stops` | *(none — via `dispatch`)* | ✗ |
| Load | `CarrierLoad` | `loads` | `orgId` | `deletedAt` ✓ |
| Facility | `CarrierFacility` | `facilities` | `orgId` | ✗ **(see B4)** |
| Document | `CarrierDocument` | `carrier_documents` | *(none — via parent)* | ✗ |
| Document type | `CarrierDocumentType` | `carrier_document_types` | `orgId` | ✗ |
| Driver | `CarrierDriver` | `carrier_drivers` | `orgId` | `deletedAt` ✓ |
| Driver login | `User` (`role = DRIVER`) | `User` | `tenantId` | ✗ |
| Truck | `CarrierTruck` | `carrier_trucks` | `orgId` | `deletedAt` ✓ |
| Checklist definition | `Playbook` + `PlaybookStep` + `StepTemplate` | *(default names)* | `tenantId` | `deletedAt` ✓ |
| Checklist run | `PlaybookInstance` + `StepInstance` | *(default names)* | `tenantId` | `deletedAt` ✓ (StepInstance) |
| Checklist trigger | `PlaybookTrigger` | *(default)* | `tenantId` | ✗ |
| Inspection | *no model* — `StepType.INSPECTION_ITEM` on a `Playbook` with `PlaybookCategory.VEHICLE_INSPECTION` | — | — | — |
| Notification trigger | `NotificationTemplate.triggerKey` (global, no tenant) | *(default)* | *none* | ✗ |
| Notification subscription | `NotificationSubscription` | *(default)* | `tenantId` | ✗ |
| Notification prefs | `UserNotificationPreference` | *(default)* | `tenantId` | `deletedAt` ✓ |
| Notification audit | `NotificationSendLog` | *(default)* | `tenantId` | ✗ |
| In-app notification | `InAppNotification` | `in_app_notifications` | `orgId` | ✗ |
| **Tenant settings** | **✗ does not exist** — settings are loose columns on `Tenant` | `"Tenant"` | — | — |
| Tenant | `Tenant` | `"Tenant"` (quoted PascalCase) | — | `isActive` |
| Override audit | `DispatchOverrideAudit` | *(default)* | `tenantId` | ✗ |
| Grid prefs | `GridPreference`, `GridView` | `grid_preference`, `grid_view` | *none (per-user)* | ✗ |
| Audit log | `AuditLog` | `audit_log` | `tenantId` | append-only |

> **Tenant column is not uniform.** Carrier tables use `orgId` → `org_id`. Workflow-engine
> and notification tables use `tenantId` (no `@map`). New tables must pick per sibling
> convention, not per personal preference. See `20260722000004_add_client_contacts` which
> states this explicitly in its header comment.

### A.2 Key field names on the models Document Import touches

**`Trip`** (`apps/web/prisma/schema.prisma:2222`)
`id · orgId · routeTemplateId · primaryDriverId (NOT NULL) · coDriverId · truckId (NOT NULL) ·
trailerId · dispatcherId · scheduledDeparture (NOT NULL) · actualDeparture · scheduledArrival ·
actualArrival · status · relayHandoffStopId · plannedMiles · actualMiles · hosCycle · notes ·
createdById · updatedById · deletedAt · deletedById · createdAt · updatedAt`

**`CarrierStop`** (`:2342`)
`id · dispatchId · loadId · sequenceOrder · stopType · facilityId (NOT NULL) · clientId ·
appointmentStart · appointmentEnd · arrivedAt · departedAt · status · skipReason ·
commodityDescription · pieces · weightLbs · bolNumber · podNumber · sealNumber · bolRequired ·
podRequired · contactName · contactPhone · specialInstructions · notes · freeTimeMinutes ·
workState · checklistStatus · deferredReason · checklistEntityId · createdById · updatedById ·
createdAt · updatedAt`
Unique: `@@unique([dispatchId, sequenceOrder])`

**`CarrierFacility`** (`:2010`)
`id · orgId · name · facilityType · addressLine1 · addressLine2 · city · state · zip ·
country · latitude (Float?) · longitude (Float?) · contactName · contactPhone · contactEmail ·
lumperRequired · appointmentRequired · contacts (Json, default "[]") · notes · createdById ·
updatedById · createdAt · updatedAt`

**`RouteTemplate`** (`:2152`)
`id · orgId · templateName · clientId (NOT NULL) · contractId · scheduleType · recurrenceRule ·
recurrenceTimezone · scheduledDepartureTime · equipmentType · tempMinF · tempMaxF ·
maxWeightLbs · commodityDescription · estimatedMiles · defaultDriverId · defaultTruckId ·
autoGenerateDaysAhead · active · notes · createdAt · updatedAt · createdById · updatedById`

**`RouteTemplateStop`** (`:2195`)
`id · routeTemplateId · sequenceOrder · stopType · facilityId · contactName · contactPhone ·
apptWindowStartOffsetMin · apptWindowEndOffsetMin · expectedDwellMinutes ·
commodityDescription · bolRequired · podRequired · specialInstructions · createdAt · createdById`

**`CarrierDocument`** (`:2399`)
`id · parentType · parentId · stopId · clientId · documentTypeId · loadId · dispatchId ·
contractId · documentType · fileUrl · filename · fileSizeBytes · uploadedBy · verified ·
verifiedBy · verifiedAt · notes · createdAt`
Note: the storage pointer field is **`fileUrl`**, not `s3Key`. The legacy `Document` model
uses `s3Key`. Two different conventions.

### A.3 Enum / CHECK-constraint values (these are `String` columns with DB CHECK constraints, **not** Postgres enums)

| Column | Allowed values | Source |
|---|---|---|
| `facilities.facility_type` | `terminal`, `yard`, `warehouse`, `drop_yard`, `customer_site` | `20260404100003_carrier_facilities/migration.sql:37` |
| `stops.stop_type` | `pickup`, `delivery`, `fuel_stop`, `layover`, `relay_handoff` | `20260404100009_carrier_stops/migration.sql:64` |
| `stops.status` | `pending`, `arrived`, `completed`, `skipped` | `…:65` |
| `route_template_stops.stop_type` | `pickup`, `delivery`, `fuel_stop`, `layover` | `20260404100006_…:38` |
| `dispatches.status` | `planned`, `in_progress`, `completed`, `cancelled`, `tonu` | `20260404100007_…:56` |
| `loads.status` | `pending`, `assigned`, `in_transit`, `delivered`, `invoiced`, `paid`, `cancelled` | `20260404100008_…:66` |
| `clients.status` | `active`, `inactive`, `blocked` | `20260404100001_…:44` |
| `contracts.status` | `active`, `expired`, `cancelled`, `draft` | `20260404100002_…:38` |
| `carrier_drivers.status` | `active`, `inactive`, `on_leave`, `terminated` | `20260404100004_…:50` |
| `carrier_trucks.status` | `active`, `inactive`, `in_maintenance`, `out_of_service` | `20260404100004_…:102` |

Real Prisma enums relevant to this build:

- `StepType` = `DOCUMENT_UPLOAD · FORM_FILL · INSPECTION_ITEM · SIGNATURE · TRAINING_ACK · APPROVAL · THIRD_PARTY · CUSTOM_NOTE` (`:1606`)
- `AssigneeRole` = `DRIVER · DISPATCHER · MECHANIC · SAFETY_MANAGER · THIRD_PARTY` (`:1617`)
- `PlaybookEntityType` = `DRIVER · VEHICLE · PARTNER · DISPATCH · OTHER` (`:1542`)
- `PlaybookCategory` = `ONBOARDING · SAFETY · OPERATIONS · COMPLIANCE · PARTNER · CUSTOM · VEHICLE_INSPECTION` (`:1550`)
- `StepStatus` = `NOT_STARTED · IN_PROGRESS · COMPLETE · FAILED · SKIPPED` (`:1567`)
- `InstanceStatus` = `NOT_STARTED · IN_PROGRESS · COMPLETED · BLOCKED` (`:1560`)
- `TriggerEvent` = `ON_DRIVER_CREATE · ON_VEHICLE_CREATE · ON_DISPATCH_CREATE · ON_DISPATCH_DEPART · ON_DISPATCH_DELIVER · ON_PARTNER_CREATE · MANUAL_ONLY · RECURRING` (`:1625`)
- `NotificationChannel` = `EMAIL · IN_APP` **(no PUSH)** (`:3350`)
- `NotificationCategory` = `USER · LOAD · DRIVER · TRUCK · MESSAGE · FINANCE · ROUTE · CUSTOMER · DIGEST` (`:3338`)
- `NotifChannel` (workflow engine, separate) = `PUSH · SMS · IN_APP · EMAIL` (`:1591`)
- `DocumentType` (legacy `Document`) = `DRIVER_LICENSE · DRIVER_APPLICATION · GENERAL · RATE_CONFIRMATION · SSN_CARD · PASSPORT · CDL_SCAN · MEDICAL_CARD · VOIDED_CHECK · W9 · W4 · I9` (`:71`)

### A.4 Files the spec references → actual paths

| Spec reference | Actual file | Status |
|---|---|---|
| "existing AI document extraction feature" | `apps/web/src/app/(owner)/actions/ai-documents.ts` | exists, stateless |
| — its UI | `apps/web/src/app/(owner)/ai-documents/page.tsx` | exists |
| "the storage layer" | `apps/web/src/lib/storage/{presigned,multipart,attachments,restricted,validate,s3-client}.ts` | exists, complete |
| "presigned upload" | `presigned.ts:38 generateUploadUrl` | exists |
| "multipart upload" | `multipart.ts:33 initiateMultipartUpload` + `:71 getPartUploadUrl` + `:96 completeMultipartUpload` + `:122 abortMultipartUpload` | exists |
| "signed download" | `presigned.ts:71 generateDownloadUrl` | exists |
| "tenant key prefixing" | `presigned.ts:47` → `` `tenant-${tenantId}/${category}/${fileId}-${fileName}` `` | exists |
| "the geocoding utility" | `apps/web/src/lib/geo/geocode.ts` (`geocodeAddress`, `geocodeLoadAddresses`) | exists |
| "routing provider already wired" | `apps/web/src/lib/geo/osrm.ts` (`getOSRMDistanceMiles`, `getOSRMDirections`) + `/api/geocoding/{autocomplete,distance,directions}` | exists, **no matrix** |
| "address normalisation" | **✗ does not exist.** `apps/web/src/lib/utils/format-address.ts` is display formatting only | **NEW** |
| "facility creation" | `apps/web/src/lib/carrier/facilities.ts:102 createFacility` | exists |
| "the route template save path" | `apps/web/src/actions/carrier/save-route-template.ts:36 saveRouteTemplate` | exists, transactional |
| "the trip generation path" | `apps/web/src/lib/carrier/trips.ts:179 createTrip` | exists, **not transactional** |
| "the checklist and inspection system" | `apps/web/src/app/(owner)/checklists/**` + `apps/mobile/components/driver/workflows/**` | exists |
| "full-screen driver flow" | `apps/mobile/components/driver/workflows/InspectionModeScreen.tsx` | **already exists** |
| "existing signature component" | `apps/mobile/components/driver/workflows/SignatureScreen.tsx` | **already exists** |
| "existing offline queue" | `apps/mobile/lib/{offline-queue,api-with-queue,queue-flusher}.ts` | exists |
| "notification trigger catalogue" | `apps/web/src/lib/notifications/types.ts:4` (`TriggerKey`, 37 keys) + `apps/web/prisma/seeds/notification-template-data/*.ts` | exists |
| "how a new trigger gets registered" | add to `TriggerKey` union + `NotificationPayload` map + a seed file + `seed-notifications.ts` | documented below |
| "the live tracking dashboard" | `apps/web/src/app/(owner)/live-map/page.tsx` (legacy `GPSLocation` map) + `/api/v1/carrier/live-map/trips` | partial |
| "the DataGrid component" | `apps/web/src/components/data-grid/core/DataGrid.tsx` (headless) | exists |
| "feature registry" | `apps/web/src/lib/docs/feature-registry.ts` (62 entries) | exists |
| "help centre" | `apps/web/src/app/(owner)/help/**` + `docs-content/client/*.mdx` (56 articles + `_template.mdx`) + `docs-content/_ia.json` | exists |
| `requireRole` | `apps/web/src/lib/auth/supabase.ts:104` | exists |
| `requireTenantId` | `apps/web/src/lib/context/tenant-context.ts:20` | exists |
| "s3Key tenant validation" | **no shared helper** — inline `s3Key.startsWith(\`tenant-${tenantId}/\`)` in ~14 call sites | see C9 |

---

## B. Where the spec conflicts with the live schema

### B1. Facility types `shipper` and `receiver` do not exist and were deliberately deleted — **HIGH**

Spec Section 7: *"Facility types: reuse the existing set. Consignees to **receiver**. Origin to
**shipper**. Yard and parking to **terminal**."* Phase 4 prompt repeats it: *"Facility types from
the audit's real values — consignees take receiver, origin takes shipper."*

Reality:
- CHECK constraint `facilities_facility_type_check` allows only
  `terminal · yard · warehouse · drop_yard · customer_site`.
- `shipper` and `receiver` *were* in the original catalog seed
  (`20260404100014_carrier_seed_enums/migration.sql:175-176`) and were **explicitly removed** by
  `20260518000001_tkt0016_align_facility_type_catalog` — that migration's own comment reads
  *"Replaces stale (shipper, receiver, terminal, fuel_stop, other) with canonical (terminal, yard,
  warehouse, drop_yard, customer_site)."*
- The picker (`apps/web/src/lib/carrier/facility-type.ts:13 FACILITY_TYPE_OPTIONS`) offers exactly
  the five canonical values.

**Recommended resolution:** map consignees → `customer_site`, origin/shipper warehouse →
`warehouse`, yard/parking → `yard` (not `terminal` — `yard` exists and is more accurate),
home base/terminal → `terminal`, driver residence → `customer_site` + a **NEW**
`isDriverResidence` boolean.
**Why:** re-adding `shipper`/`receiver` means altering a CHECK constraint that a prior ticket
deliberately narrowed, and would reopen the catalog/constraint drift TKT-0016 closed. Writing
either value today throws a Postgres 23514.

### B2. There is no PUSH notification channel in the notification system — **HIGH**

Spec Section 13 requires Push for *Trip assigned · reminder* and *Inspection failed*.

Reality: `NotificationChannel` enum is `EMAIL | IN_APP` only (`schema.prisma:3350`).
`dispatchNotification` (`apps/web/src/lib/notifications/dispatcher.ts:43`) implements exactly
two channels — its own header documents "Per-recipient EMAIL … Per-recipient IN_APP". Push
exists as a **separate, unconnected** mechanism: `apps/web/src/lib/notifications/send-push.ts`
+ the `PushToken` model + `expo-server-sdk`. A third, also separate, channel enum
`NotifChannel` (`PUSH · SMS · IN_APP · EMAIL`) belongs to the workflow engine's
`PlaybookNotification` and is not used by `dispatchNotification`.

**Recommended resolution:** extend `NotificationChannel` with `PUSH` (additive enum value) and
add a third per-recipient branch in `dispatcher.ts` that calls the existing `send-push.ts`,
gated on a **NEW** `pushEnabled` column on `UserNotificationPreference`.
**Why:** the spec's Phase 10 constraint is "do not build a parallel mechanism", and today push
*is* the parallel mechanism. Consolidating is a small, additive change and is the only way
"each independently subscribable" holds for push.

### B3. There is no tenant settings table — **HIGH**

Spec Section 6 lists five tenant settings (`autoCreateRouteTemplatesFromImports`,
`defaultEndStopPolicy`, `homeBaseFacilityId`, `requirePreTripInspection`,
`blockTripStartOnFailedInspection`) as "EXTENSIONS" to "Tenant settings", implying a settings
table to extend.

Reality: no such table. `Tenant` (`:129`) carries settings as loose columns —
`timezone`, `profitMarginThreshold`, `fleetSizeBucket`, `manualTrial`, `sampleDataSeeded`,
`provisioningPhase`. There is a `TenantNotificationSettings` table but it is per-trigger
notification config only.

**Recommended resolution:** add the five as nullable columns on `Tenant`, matching the
existing precedent (`20260722000002_add_tenant_truck_count`, `…000003_add_tenant_heard_about`).
**Why:** it is genuinely additive, matches two migrations from ten days ago, and avoids
inventing a settings table that nothing else would use. A `TenantSettings` table would be the
better long-term shape but is a cross-cutting refactor this module should not own.

### B4. `CarrierFacility` has no soft delete, and the current workaround violates a CHECK constraint — **HIGH (live bug)**

`CarrierFacility` has no `deletedAt` and no `active` column. `softDeleteFacility`
(`apps/web/src/lib/carrier/facilities.ts:125`) works around this by writing
`` `inactive_${currentType}` `` into `facilityType` — its own comment says *"CarrierFacility
lacks an 'active' column. Soft-delete uses facilityType prefix convention. Migration 015 should
add an 'active' boolean column."* Migration 015 was never written.

`inactive_terminal` is not among the five values in `facilities_facility_type_check`. Read
together, the code and the constraint say a `softDeleteFacility` call must fail with Postgres
23514. **This is an inference from source, not an observed failure — I did not execute it against
a database.** Confirm with one query before acting on it. `updateFacility` (`:112`) already
filters `NOT: { facilityType: { startsWith: 'inactive_' } }`, so the intent behind the prefix
scheme is real either way.

**Recommended resolution:** flag to Ayaz. Phase 4 depends on facility lifecycle being sane
(a soft-deleted facility must not be a T1/T2 match target). Add a **NEW** `active Boolean
@default(true)` column on `CarrierFacility` inside Phase 4 and repoint `softDeleteFacility` at
it — additive, and it repairs a live defect rather than building on top of one.
**Why:** the facility external-reference table is the highest-value artifact in the module and
it points at `facilities.id`. Building it over a broken delete path guarantees rework.

### B5. `CarrierStop` has no `stopType` value for an end stop — **MEDIUM**

Spec Section 9 requires the end stop to be *"a real stop with a real sequence and geofence,
pinned last."* Allowed `stops.stop_type` values are `pickup · delivery · fuel_stop · layover ·
relay_handoff`. None means "return to base".

**Recommended resolution:** do **not** add a CHECK value in Phase 1. Model the end stop as
`stop_type = 'layover'` plus a **NEW** `isEndStop Boolean @default(false)` column on
`CarrierStop`, and derive the policy from a **NEW** `endStopPolicy` column on `Trip`.
**Why:** an end stop is not semantically a pickup or delivery, and `layover` is the closest
existing value (already meaning "non-freight stop"). A boolean is additive; a CHECK constraint
change is a `DROP CONSTRAINT` + `ADD CONSTRAINT`, which the spec's own Section 0.6 rule
("a `DROP`, a rename, or an `ALTER COLUMN TYPE` means stop") arguably forbids. Flag to Ayaz if
a first-class `end` stop type is wanted.

### B6. `CarrierStop` has none of `references[]`, `lineItems[]`, `pageNumbers[]` — **MEDIUM**

Spec Section 6 lists these as extensions to Stop. Reality: `CarrierStop` has scalar
`bolNumber`, `podNumber`, `sealNumber`, `pieces`, `weightLbs`, `commodityDescription`, and
`appointmentStart`/`appointmentEnd` (so "appointment" is already covered, under different names).
There are no array or JSON columns.

**Recommended resolution:** add three JSONB columns on `CarrierStop` — **NEW** `references`,
**NEW** `lineItems`, **NEW** `pageNumbers`, each `@default("[]")`. Precedent exists:
`CarrierFacility.contacts Json @default("[]")` (`:2028`).
**Why:** matches the spec's own reasoning for `reviewedExtraction` ("no second schema to keep in
sync") and avoids three new child tables for data that is never queried relationally. Keep the
scalar `bolNumber`/`proNumber` fields populated in parallel so existing invoicing/reports keep
working — those read scalars.

### B7. `CarrierContract.contractNumber` is globally unique, not per-tenant — **MEDIUM**

`contractNumber String @unique` (`:1968`) — a bare `@unique`, not `@@unique([orgId, contractNumber])`.
Phase 3 creates one-time spot contracts per rate confirmation. Any auto-generated scheme
(`SPOT-2026-0001`) will collide across tenants and surface as a P2002 to an unrelated carrier.

**Recommended resolution:** generate spot contract numbers with a tenant-unguessable suffix —
e.g. `SPOT-${yyyymmdd}-${nanoid(8)}` using the already-installed `nanoid`. Do **not** change the
constraint in this module.
**Why:** narrowing a global unique to a composite is a schema change with cross-module blast
radius and is not additive. A collision-resistant generator solves it inside Phase 3.

### B8. `Trip.primaryDriverId`, `Trip.truckId`, `Trip.scheduledDeparture` are NOT NULL — **MEDIUM**

A `Trip` row cannot exist before a driver and truck are chosen. This is consistent with the
spec (Section 4.2: driver/truck "Never" collapse — always explicit), but it constrains the
architecture: **all wizard state up to Phase 8 must live in the import record, not in a draft
Trip.** No partial trip may be written during review.

**Recommended resolution:** none needed — confirm the import record's `reviewedExtraction` JSONB
is the sole home for pre-commit state, exactly as spec Section 6 states. Call this out in the
Phase 1 summary so no later phase reaches for a draft `Trip`.

### B9. `createTrip` is not transactional — **MEDIUM for Phase 8**

`apps/web/src/lib/carrier/trips.ts:179 createTrip` performs sequential validation reads, then
**three unwrapped writes**: `tenantPrisma.trip.create` (`:271`), `tenantPrisma.dispatchOverrideAudit.create`
(`:297`), and `tenantPrisma.carrierStop.create` (`:342`). There is no `$transaction` around them,
so a failure partway leaves a trip with no stops. Spec Section 11 requires seven ordered writes in
one transaction.

**The tenant-scoped client composes with `$transaction` fine.** `tenantPrisma.$transaction(async (tx) => …)`
is a working, in-production pattern:

- `apps/web/src/lib/carrier/loads.ts:394` — `deleteMany` + `update` + `create` across `carrierStop`
- `apps/web/src/lib/carrier/clients.ts:324` — `deleteMany` + `createMany` + `update`
- `apps/web/src/actions/carrier/soft-delete.ts:56` — `updateMany` + per-user writes

`loads.ts:394` in particular is a multi-write `CarrierStop` transaction under RLS — structurally
the same thing Phase 8 needs.

The bare-client fallback is **not** universal. It appears in specific places, notably
`save-route-template.ts:5` (`import { prisma } … // kept for $transaction`, used at `:176` and
`:198`) and `reorderTripStops` (`trips.ts:910`). Those are the exception, not the rule, and the
reason is not recorded in either file.

**Recommended resolution:** Phase 8 writes a **NEW** `commitImport()` using
`tenantPrisma.$transaction(async (tx) => …)`, keeping RLS in force, modelled on `loads.ts:394`.
Still pass `orgId` explicitly on every write — belt and braces, and consistent with siblings. Do
not modify `createTrip`; call its validation helpers from the new path. If `save-route-template.ts`
is touched in Phase 6, find out *why* it uses the bare client before copying that choice.
**Why:** the safe pattern already exists here; the earlier framing of this as "the atomic commit
must run without RLS" was wrong.

### B10. Trip **start** has no *compliance* gate; the readiness gate is at trip **create** — **MEDIUM**

Spec Section 12 gates `[Start trip]`. Reality: `POST /api/v1/carrier/dispatches/[id]/start`
delegates to `transitionTripStatus(orgId, id, 'in_progress')` (`trips.ts:549`). That function is
**not** unguarded — it enforces a status state machine
(`planned → in_progress | cancelled | tonu`; `in_progress → completed`) and returns
`{ error: 'Invalid status transition' }` otherwise. What it has **no** notion of is inspection or
compliance: nothing blocks a start on a failed walkaround.

It already does three things Phase 9 and Phase 10 can build on directly (`trips.ts:588-620`):
sends a push via `sendPushToUser`, writes an `InAppNotification` via `createNotification`, and
**fires `ON_DISPATCH_DEPART` into the workflow engine** via `fireEvent`. So playbooks already
spawn on departure — the wiring Phase 9 needs is partly in place.

The readiness gate — `DRIVER_NOT_DISPATCH_READY` + `OVERRIDE_REQUIRES_ADMIN` + admin-only
override — lives in `createTrip` (`trips.ts:208-230`) and reads `User.isDispatchReady`
(`schema.prisma:253`), not `PlaybookInstance.isDispatchReady` (`:2670`).

**Recommended resolution:** Phase 9 adds the inspection gate to the `/start` route, reusing the
`createTrip` override shape (typed reason → `DispatchOverrideAudit`, which already exists at
`:2772` with `entityType` `"DRIVER" | "VEHICLE"`). Add **NEW** `entityType` value `"INSPECTION"`
— it is a plain `String`, no constraint.
**Why:** `DispatchOverrideAudit` already stores exactly what Section 12 asks for (dispatchId,
userId, reason, timestamp). Building a second override audit table would be the "parallel
mechanism" Phase 9 forbids.

### B11. Terminology: the spec says "Trip"; the API, table, and half the code say "dispatch" — **MEDIUM**

Not a schema conflict but the most likely source of invented names, exactly the drift Section
0.6 warns about. `page.tsx` files say `/carrier/trips`, the grid component is
`DispatchesGrid.tsx`, the API is `/api/v1/carrier/dispatches`, the table is `dispatches`, the
Prisma model is `Trip`, and `CarrierLoad.dispatch` is the relation to it.

**Recommended resolution:** every phase prompt after this one should carry the line
*"the Trip model maps to table `dispatches`; the relation field is `dispatch`; API paths are
`/api/v1/carrier/dispatches`"*. UI copy stays "Trip" per spec Section 3 naming discipline.

---

## C. What the spec assumes exists, but does not

| # | Spec assumes | Reality | What must be built |
|---|---|---|---|
| **C1** | An extraction service that persists | `analyzeDocument` (`ai-documents.ts:67`) is a stateless server action. It takes one `File` from a `FormData`, calls Claude, `JSON.parse`s the reply, returns it to the browser. **Nothing is written to the database.** No import record, no review step, no audit. | The entire import record lifecycle. Extraction is not "extendable" in the sense Phase 1 implies — `analyzeDocument` is 110 lines (`:67-176`) of single-shot glue with no persistence layer beneath it. |
| **C2** | Multi-page / multi-file extraction | Single `File` only. No page splitting, no ordering, no batching, no concurrency control, no assembly. | Page splitting, ordered ingest, bounded-concurrency batching, cross-page consignment merge. |
| **C3** | Per-field confidence + warnings | `ExtractedFreightData` (`ai-documents.ts:12`) is flat, has no confidence anywhere, and no warnings array. `max_tokens: 1024` — far too small for a 16-page manifest. | Canonical schema per spec Section 5, plus a prompt that actually returns confidence. |
| **C4** | Model/token/cost recording | Not captured. Model is hardcoded `'claude-haiku-4-5-20251001'` in two places (`:138`, `:152`). | Cost/token capture on the import record; model id in one constant. |
| **C5** | Human review before commit | The current UI shows extraction results and the user retypes into a form. There is no reviewed-vs-raw distinction. | `rawExtraction` / `reviewedExtraction` split and the review screens (Phases 3–5). |
| **C6** | Deduplication by content hash | Nothing. No hashing anywhere in the storage or AI path. | SHA-256 over source bytes + tenant + doc number + doc date, with a DB unique constraint. |
| **C7** | Address normalisation utility | **Does not exist.** `format-address.ts:6 formatAddress` collapses whitespace for display. No suffix/directional/suite/postal handling, no test fixture. | The whole Section 7 normaliser + its 30-pair fixture. This is Phase 4's foundation. |
| **C8** | Facility external references | No such table, no such column. | The external-reference table — the module's highest-value artifact. |
| **C9** | A reusable `s3Key` tenant validator | No shared helper. The check is copy-pasted inline as `` s3Key.startsWith(`tenant-${tenantId}/`) `` across 15 call sites (`(owner)/actions/documents.ts:88,159,203`, `driver-documents.ts:249,349`, `load-documents.ts:177`, `api/documents/complete-upload/route.ts:33`, `api/documents/download-url/[id]/route.ts:74`, `api/documents/multipart/{complete,part-url}/route.ts:64,40`, `api/mobile/driver/documents/route.ts:172`, `api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts:28`, …). | A **NEW** shared `assertTenantKey(s3Key, tenantId)` used by all new import/attachment code. Do not add a 16th copy. |
| **C10** | An `imports` storage category | `DocumentCategory` (`presigned.ts:25`) is a closed union: `'trucks' \| 'routes' \| 'drivers' \| 'support' \| 'messages' \| 'inspections'`. | Widen the union with `'imports'`. One-line, non-breaking. (`'inspections'` already exists — Phase 9 needs no storage change.) |
| **C11** | A distance matrix / optimiser | `osrm.ts` exposes `getOSRMDistanceMiles` (point-to-point) and `getOSRMDirections` (polyline). **No `/table` call, no matrix cache, no TSP solver, no library.** | See D2/D3. |
| **C12** | A live driver/truck board | No carrier live board exists. `/(owner)/live-map/page.tsx` is a Leaflet map over legacy `GPSLocation` rows, gated `requireRole([OWNER, MANAGER])`. `/api/v1/carrier/live-map/trips` exists as data. There is no drivers-vs-trucks table view and no Today's Trips report. Phase 11 is **not** "add a segmented toggle to an existing board" — it is building the board. | Both views, the shared row component, and the report. |
| **C13** | `Facility.isDriverResidence` + owning driver | Neither column exists. Driver home address: `CarrierDriver` has no address fields at all — only `homeTerminalId → CarrierFacility`. | **NEW** `isDriverResidence` + **NEW** `residentDriverId` on `CarrierFacility`, plus the server-side visibility filter (Section 9 hard requirement). Note there is **no** existing driver street address to seed it from. |
| **C14** | A spreadsheet parser | `papaparse@5.5.3` (CSV) ✓. **No XLSX library of any kind** — verified across `apps/*/package.json`, `packages/*/package.json`, and root. | See D1. |
| **C15** | Route template `endStopPolicy`, `sourceImportId`, `lastAppliedAt`, `applicationCount` | None exist on `RouteTemplate`. | Four **NEW** columns. |
| **C16** | Trip `sourceImportId`, `endStopPolicy`, `inspectionRequired`, `inspectionOverriddenBy/Reason` | None exist on `Trip`. | Five **NEW** columns (or reuse `DispatchOverrideAudit` for the override pair — preferred, see B10). |
| **C17** | An owner-facing help centre to extend | Exists and is healthy: `/(owner)/help/[categoryOrSlug]/[article]`, `docs-content/_ia.json`, `docs-content/client/*.mdx` (56 articles + `_template.mdx`, incl. `checklists.mdx`, `carrier-templates.mdx`, `ai-document-reader.mdx`), `docs-content/sysadmin/`, and `feature-registry.ts` (62 entries, with an explicit 4-step "HOW TO ADD A NEW FEATURE" comment at the top). Phase 12 has a real home. | Nothing structural — just entries. |

---

## D. Capabilities with no installed library — two options each, no installs

### Installed inventory relevant to this build

**`apps/web`** — `@anthropic-ai/sdk@^0.77.0` · `@aws-sdk/client-s3@^3.990.0` ·
`@aws-sdk/s3-request-presigner@^3.990.0` · `@dnd-kit/core@^6.3.1` · `@dnd-kit/sortable@^10.0.0` ·
`@dnd-kit/utilities@^3.2.2` · `@prisma/client@^7.4.0` · `@tanstack/react-table@^8.21.3` ·
`@tanstack/react-query@^5.100.1` · `@tanstack/react-virtual@^3.13.24` · `@turf/bbox@^7.3.4` ·
`@turf/helpers@^7.3.4` (+ `@turf/turf@^7.3.4` dev) · `archiver@^8.0.0` · `date-fns@^4.2.1` ·
`decimal.js@^10.6.0` · `file-type@^21.3.0` · `framer-motion@^12.40.0` · `fuse.js@^7.3.0` ·
`gray-matter@^4.0.3` · `happy-dom@^20.9.0` · `leaflet@^1.9.4` + `react-leaflet@^5.0.0` +
`react-leaflet-cluster@^4.0.0` · `nanoid@^5.1.6` · `next@^16.1.6` · `next-mdx-remote@^5.0.0` ·
`nuqs@^2.8.9` · `papaparse@^5.5.3` (+ `@types/papaparse` dev) · `pdfjs-dist@^5.7.284` ·
`@react-pdf/renderer@^4.3.2` · `recharts@^2.15.4` · `resend@^6.9.2` · `sharp@^0.34.5` ·
`sonner@^2.0.7` · `zod@^4.3.6` · `zustand@^5.0.13` · `vitest@^4.0.18` (dev) ·
`@playwright/test@^1.58.2` (dev) · `@faker-js/faker@^10.3.0` (dev)

**`apps/mobile`** — `expo@~55.0.9` · `expo-camera@~55.0.11` · `expo-document-picker@~55.0.9` ·
`expo-image-picker@~55.0.14` · `expo-image@~55.0.6` · `expo-file-system@~55.0.11` ·
`expo-notifications@~55.0.14` · `expo-router@~55.0.8` · `expo-task-manager@~55.0.10` ·
`@shopify/flash-list@2.0.2` · `@rnmapbox/maps@^10.3.0` · `@tanstack/react-query@^5.95.0` ·
`react-native@0.83.4` · `react-native-reanimated@4.2.1` + `react-native-worklets@0.7.2` ·
`react-native-mmkv@^3.3.3` · `react-native-svg@15.15.3` · `react-native-view-shot@4.0.3` ·
`nativewind@^4.2.3` · `jest@~29.7.0` + `jest-expo@^55.0.11` (dev)

**Notably absent from mobile: `react-native-gesture-handler`** — verified not in
`package.json` and not in `node_modules`. Nothing in `apps/mobile` imports it.

### D1. XLSX parsing (spec Section 5 + Phase 1 item 4) — **no library**

| Option | Approach | Trade-off |
|---|---|---|
| **A — CSV-only v1 (recommended)** | Ship the spreadsheet path with `papaparse@5.5.3` for `.csv` only. Reject `.xlsx` at upload with a plain-language message and a "Save as CSV" instruction. Column mapping, the document profile, and the canonical-shape mapper are all built and tested; only the container format is narrowed. | Users must export once. Zero risk. Everything except the file container is delivered, so `.xlsx` becomes a thin adapter later. |
| **B — Inflate the XLSX in-house** | `.xlsx` is a ZIP of XML. Read the central directory manually, `zlib.inflateRawSync` (Node built-in) the `xl/worksheets/sheet1.xml` and `xl/sharedStrings.xml` members, parse with `happy-dom@20.9.0`'s DOMParser (already a web dependency). | ~200 lines of ZIP/XML handling with real edge cases (ZIP64, shared-string indices, inline strings, dates-as-serials, multi-sheet). Testable, but it is a parser we would own forever. |

**Recommendation: A**, and raise `.xlsx` with Ayaz as a scope call before Phase 1 — spec
Section 0.8 lists "a phase truly needs a dependency that is not installed" as a message-worthy item.

### D2. Distance matrix (spec Section 9: *"Cache the matrix per ordered facility set"*) — **not implemented**

**First, a finding that changes this phase's framing.** The routing provider is not a provisioned
service. `apps/web/src/lib/geo/osrm.ts:23` hardcodes:

```ts
const OSRM_BASE_URL = 'http://router.project-osrm.org/route/v1/driving';
```

That is the **public OSRM demo server**, over plain `http`, with no API key and no configured
host. Its published usage policy is for demonstration and light use, and it rate-limits. Two
consequences: (a) the constant bakes `/route/v1/driving` into the base, so a `/table` call needs a
*separate* base string, not just a different path; (b) driving an N×N matrix per template against
a public demo endpoint is not something to ship without raising it. Spec Section 9's "cache the
matrix so it doesn't re-bill daily" implies a billed provider — there isn't one.

| Option | Approach | Trade-off |
|---|---|---|
| **A — Extend `osrm.ts` with a `/table` base (recommended)** | Add a second constant for `http://router.project-osrm.org/table/v1/driving` and one exported `getOSRMMatrix()` returning an N×N distance+duration matrix in one round trip. Cache keyed on the sorted facility-id list. | No new dependency. One HTTP call per template instead of N². Still points at the public demo server — see the escalation below. |
| **B — N² pairwise `/route` calls with a persistent cache** | Reuse `getOSRMDistanceMiles` unchanged; memoise each facility pair in a **NEW** cache table keyed on the ordered pair. | Zero new OSRM surface, and the cache survives restarts. But 12 stops = 66 calls on a cold cache against a rate-limited public host — worse on exactly the axis that matters. |

**Escalate to Ayaz before P7B either way:** whether to self-host OSRM or provision a routing
provider. This is spec Section 0.8's "a phase truly needs a dependency that is not installed", in
infrastructure form rather than npm form.

### D3. Route optimisation / TSP (spec Section 9 Part B) — **no solver, no library**

| Option | Approach | Trade-off |
|---|---|---|
| **A — In-house nearest-neighbour + 2-opt (recommended)** | ~120 lines over the D2 matrix. Exact brute force for n ≤ 8 (≤ 5040 permutations), NN + 2-opt above. Constraints as the spec states: pickups before their deliveries, firm windows hard, soft windows penalised, end stop pinned last. Fully unit-testable with a fixed matrix and no network. | Not globally optimal above n≈10. Irrelevant here — the output is a *suggestion* the human accepts or declines, and the spec already requires a savings floor below which nothing is offered. |
| **B — Sequence-improvement only** | Never re-solve. Detect only 2-opt-improving *adjacent* swaps against the current human order and surface the single best one. | Much smaller and safer; matches "optimisation is a suggestion" most literally. But rarely finds the 18-mile win in the spec's mock-up, so the feature under-delivers on its own promise. |

**Recommendation: A**, but see E7 — I would move this out of the critical path regardless.

### D4. Mobile drag-to-reorder (spec Phase 5: *"the existing gesture handler on mobile"*) — **not installed**

There is no `react-native-gesture-handler`. The spec's fallback assumes one exists.

| Option | Approach | Trade-off |
|---|---|---|
| **A — Move up / move down buttons (recommended)** | Two 44px icon buttons per row. No gestures. Meets the Section 15 touch-target rule outright, works with `@shopify/flash-list@2.0.2` with no interaction conflicts, and is fully accessible. | Slower for a 16-stop reorder. Warehouse-appropriate — a driver in gloves at 5:30am is not doing precise drags. |
| **B — `PanResponder` + `react-native-reanimated@4.2.1`** | Both are installed and this exact combination is already in production here: `SignatureScreen.tsx` uses `PanResponder` + `react-native-svg`, and `InspectionModeScreen.tsx` uses Reanimated shared values. Long-press to lift, translate on drag, animate neighbours. | Real work, and `PanResponder` inside a `FlashList` scroll container needs careful gesture arbitration. This is where drag-reorder bugs live. |

Web has **no** such gap — `@dnd-kit/*` is installed and already used for exactly this:
`apps/web/src/components/carrier/stops/StopBuilder.tsx` + `StopCard.tsx` implement drag-reordered
carrier stops today (`useSensors(PointerSensor, KeyboardSensor)`, `resequence()` on drop). Phase 5's
web list should extend `StopBuilder`, not rebuild it.

### D5. PDF page splitting (spec Phase 1: *"splits PDFs into pages, normalises images"*) — **partial**

`pdfjs-dist@5.7.284` is installed but used in exactly one place and defensively:
`apps/web/src/lib/storage/validate.ts:171-195 validatePdfPageCount` loads it via
`await import('pdfjs-dist' as any)` inside a try/catch, with the comments *"Skip validation during
build process (pdfjs-dist has Next.js compatibility issues)"* and *"Log but don't fail — pdfjs-dist
may not be available during build"*.

`sharp@0.34.5` **is** in use and proven in this exact server context —
`validate.ts:144` does `const sharp = (await import('sharp')).default;` inside
`validateImageDimensions`, and it is exercised by
`apps/web/src/__tests__/security/input-hardening.test.ts:270`. Image normalisation via `sharp`
carries no integration risk.

| Option | Approach | Trade-off |
|---|---|---|
| **A — Send the whole PDF to Claude (recommended for v1)** | The proven path. `ai-documents.ts:112-147` already sends a base64 PDF as a `document` content block via `anthropic.beta.messages.create({ betas: ['pdfs-2024-09-25'] })`. | Loses **per-page** hash caching — the cache key becomes the whole document. Spec Section 14's "re-shoot one page, bill for one page" still holds for the photo path, where each photo genuinely is one page, and photos are the primary 5:30am flow. Whether the model reliably returns correct `pageNumbers` is **unverified** — test it against the real 16-page manifest in Phase 1 before relying on it. |
| **B — `pdfjs-dist` render → `sharp` → per-page JPEG** | Rasterise each page, normalise with `sharp`, hash and cache each independently, then treat every page as an image (the path that already works). | Delivers true per-page caching, and the `sharp` half is already proven. The risk is isolated to `pdfjs-dist` rasterisation — the repo has documented Next.js compatibility problems with it, and it currently runs only in a swallow-errors try/catch, never on a hot path. |

**Recommendation: A for v1, B only if Verify check #5 of Phase 1 ("same document twice → far
fewer tokens") must pass for PDFs specifically.** Worth confirming with Ayaz which matters more.

### D6. Fuzzy matching (spec Section 7 Tier 3) — **covered, no gap**

`fuse.js@7.3.0` is installed and in production use (`AdminDocSearch.tsx`, `HelpSearch.tsx`,
`HelpSheet.tsx`). However, Section 7's scoring is *"name token overlap plus street number plus
postal code"* — a weighted composite, not a text-similarity search. Write that scorer in-house
(~40 lines, trivially unit-testable) and use `fuse.js` only for the human-facing candidate
*search box*, not for the T3 score itself. Using Fuse's internal score as the T3 threshold would
be the exact "fuzzy scoring implemented as string equality" drift Phase 4 warns about, inverted.

### D7. Signature capture — **covered, no gap**

`apps/mobile/components/driver/workflows/SignatureScreen.tsx` already implements it with
`PanResponder` → SVG `Path` (`react-native-svg@15.15.3`) → `captureRef`
(`react-native-view-shot@4.0.3`) → upload. Reuse it verbatim.

---

## E. Go / no-go per phase

| Phase | Verdict | Reasoning |
|---|---|---|
| **P0 — Audit** | ✅ **Complete** | This document. |
| **P1 — Data model + extraction service** | 🟡 **GO, with two carve-outs** | Schema work is clean and additive; the `client_contacts` migration is a perfect template (RLS + FORCE RLS + `tenant_isolation_policy` + `bypass_rls_policy` + `GRANT … TO app_user` + a self-validation `DO $$` block). Carve-outs: **XLSX is not possible** (D1 — ship CSV, escalate), and **per-page PDF caching is at risk** (D5). The "extend the existing AI extraction feature" instruction is misleading — `ai-documents.ts` has no persistence to extend (C1); the honest framing is *reuse its Anthropic call shape and `validateFileType` guard, build the service around it.* Say so in `01-SUMMARY.md`. |
| **P2 — Upload and intake** | ✅ **GO** | The storage layer is the strongest existing asset: presigned PUT (5-min), multipart (initiate/part-url/complete/abort), signed GET (1-hr, `inline`), magic-byte validation via `file-type`, PDF-bomb and image-dimension guards, and tenant key prefixing. Only change needed: widen `DocumentCategory` with `'imports'` (C10). Mobile has `expo-camera`, `expo-document-picker`, `expo-image-picker`. |
| **P3 — Client, contract, summary card** | ✅ **GO** | `CarrierClient`/`CarrierContract` CRUD, pickers, and `cmdk` are all present. One trap: `contractNumber` global unique (B7). `Decimal` is available and already the convention (`baseRate @db.Decimal(10,4)`, `rateAmount @db.Decimal(12,2)`). |
| **P4 — Facility resolution ladder** | ✅ **GO — highest value, and I agree** | Everything needed is buildable. Two hard prerequisites inside the phase: fix the facility soft-delete defect (B4) *before* writing external references, and use real facility types (B1), not `shipper`/`receiver`. The address normaliser is genuinely from scratch (C7). |
| **P5 — Stop review** | ✅ **GO** | Better positioned than the spec assumes on web: `StopBuilder.tsx` already does dnd-kit stop reorder with resequencing, and the headless `DataGrid` supplies selection, `BulkActionsBar`, filters, URL sync, and preference persistence. Mobile reorder needs a decision (D4). |
| **P6 — Route template matching** | ✅ **GO** | `saveRouteTemplate` is transactional and reusable. Watch `RouteTemplate.clientId` is **NOT NULL** — an auto-created template must carry a resolved client, so auto-create cannot run before Phase 3's client resolution succeeds. Scoring over `CarrierFacility.id` is exactly right and cheap. |
| **P7 — End stop + optimisation** | 🔴 **Part A GO · Part B NO-GO as written** | Part A (end stop policy, driver-residence privacy) is fine, modulo B5 and C13. Part B assumes a routing provider that does matrices and an optimiser that does not exist (C11). Both D2 and D3 are "write it yourself" options. This is the one phase where the spec's "use the routing provider already wired in" instruction does not describe reality. **See E-resequence below.** |
| **P8 — Assignment, validation, commit** | 🟡 **GO — genuinely the riskiest** | `createTrip` is not transactional (B9), and the tenant-scoped RLS client does not compose with `$transaction` in this codebase — every existing `$transaction` call site deliberately falls back to the bare client. That means the atomic commit runs **without RLS** and must carry explicit `orgId` on every statement. Existing assets are real though: `DispatchOverrideAudit`, the `DRIVER_NOT_DISPATCH_READY` + admin-override pattern, and `TX_OPTIONS`. |
| **P9 — Driver start + inspection gate** | ✅ **GO — cheaper than the spec assumes** | The answer to the spec's own question *"Does a full-screen driver flow already exist?"* is **yes**. `InspectionModeScreen.tsx` is a full-screen, section-paged inspection with pass/fail/N-A, fail-note capture, `MAX_PHOTOS = 3`, and — critically — `uploadInspectionPhoto` uploads **immediately** on capture and returns an `s3Key`, which is precisely the behaviour the phase's "most likely drift" warns about. `SignatureScreen.tsx` handles signing. `TaskActionDispatcher.tsx` routes step types. `StepType.INSPECTION_ITEM`, `PlaybookCategory.VEHICLE_INSPECTION`, `PlaybookStep.isDispatchBlocker`, and the `'inspections'` storage category all already exist. **The real work is the gate at `/start`, not the checklist** (B10). |
| **P10 — Notification triggers** | 🟡 **GO — one structural conflict** | Registering a trigger is well-trodden: add to the `TriggerKey` union (`types.ts:4`), add a payload to `NotificationPayload`, add a seed entry under `prisma/seeds/notification-template-data/`, re-run `seed-notifications.ts`. Per-user subscription (`NotificationSubscription`) and per-channel preference (`UserNotificationPreference`) already exist, so "each independently subscribable" is free. The conflict is **push is not a channel** (B2). Also: `NotificationCategory` has no value for trips/imports/inspections — closest existing are `ROUTE` and `TRUCK`; adding `TRIP` is an additive enum value. |
| **P11 — Live board + report** | 🟡 **GO — but scoped much larger than the prompt implies** | The prompt says "a segmented toggle at the top of the existing live tracking dashboard". There is no carrier live board to add a toggle to (C12). `/live-map` is a legacy-`GPSLocation` Leaflet map, not a table. This phase builds two board views, a shared row component, and the Today's Trips report from scratch. The `DataGrid` makes the tables tractable; `recharts`/`leaflet` are available. Budget accordingly. |
| **P12 — In-app documentation** | ✅ **GO** | The best-supported phase. `feature-registry.ts` has an explicit how-to-add comment and CI enforcement of required docs; `docs-content/_ia.json` organises 56 client articles into hubs; `/(owner)/help/**` renders them; `docs-content/sysadmin/` mirrors for admins; `DocDriftIndicator.tsx` already tracks staleness. |

### Resequencing recommendations

1. **Move P7 Part B (optimisation) to the end, after P12 — or out of v1.**
   It is the only phase with no installed capability *and* no product dependency on it. Nothing
   in the Section 16 acceptance test exercises it — step 18 ("photo → committed trip in under 90
   seconds") is delivered by P4 + P6, not by optimisation. Keeping it at position 7 puts the
   build's weakest-supported work directly in front of its riskiest (P8). Split: **P7a end stop
   policy** stays at position 7; **P7b optimisation** moves last.

2. **Pull P9 (inspection gate) forward, to run in parallel after P2.**
   P9 has almost no dependency on the import pipeline — it gates `Trip.start`, and trips already
   exist and are created today by `createTrip` and the auto-dispatch cron. Most of its UI is
   already built. Running it early converts the schedule's largest "unknown" (the spec's own
   Section 0.8 worry: *"the checklist system would need restructuring for the full-screen driver
   flow"*) into a known within days rather than weeks. It also gives P10 a real trigger to fire.

3. **Split P8 into P8a and P8b.**
   **P8a** = assignment screen + pre-commit validation (blocks/warns). **P8b** = the atomic
   transaction + rollback integration test. They fail for completely different reasons — P8a is
   product logic, P8b is the RLS/`$transaction` composition problem (B9) — and bundling them
   means one commit carries both risks. P8b should be the only thing in its commit.

4. **Move the five tenant settings into P1.**
   Spec Section 6 lists them under P1's "EXTENSIONS", but P6, P7, and P9 each read one. Adding
   five nullable columns to `Tenant` in P1's migration costs nothing and stops three later phases
   each shipping their own settings migration.

5. **Add a facility-lifecycle fix as the first task of P4.**
   B4 is a live defect on the exact table P4's highest-value artifact points at.

---

## F. Top five risks, ranked

### 1. The atomic commit is the largest new write path in the module
**Phase 8. Severity: high. Likelihood: medium.**
Seven ordered writes across five tables, with a hard "zero orphans" requirement. The pattern to
copy exists and is safe — `tenantPrisma.$transaction` under RLS, as in `lib/carrier/loads.ts:394`
— so this is ordinary work rather than novel work. The residual risk is that today's nearest
equivalent, `createTrip`, does **three** unwrapped writes (`trip`, `dispatchOverrideAudit`,
`carrierStop`) and so models the wrong behaviour; copying its shape reproduces the partial-write
bug at seven times the scale.
*Mitigation:* P8b as its own commit; model on `loads.ts:394`, not on `createTrip`; explicit `orgId`
on every statement; the rollback integration test asserts on **real rows** (`SELECT count(*)` after
each forced failure), never on mocks — the spec is right that this is the easiest test in the build
to fake.
*Note:* an earlier draft of this audit claimed the tenant-scoped client cannot be used with
`$transaction` and that the commit must therefore run without RLS. That was wrong; it is corrected
in B9.

### 2. Invented entity and enum names — the spec's own vocabulary is the trap
**All phases. Severity: high. Likelihood: high.**
The spec's vocabulary and this schema disagree in at least six places that will compile-and-fail
or write-and-throw: `shipper`/`receiver` facility types (deleted by TKT-0016, CHECK-constrained);
`Trip` vs `dispatches` vs `.dispatch`; `push` as a `NotificationChannel`; a tenant settings table;
`s3Key` vs `fileUrl` on `CarrierDocument`; an end-stop `stop_type`. The spec's Section 0.6 names
this as the #1 hallucination class and it is right. TypeScript catches the Prisma-model errors; it
catches **none** of the CHECK-constraint ones, which surface only as a Postgres 23514 at runtime.
*Mitigation:* run Verify check #1 (grep new field names against `schema.prisma`) after every
phase, **and** grep any new string literal destined for a constrained column against
`pg_constraint`. Carry the B11 naming line into every downstream prompt.

### 3. Facility-table pollution, permanently
**Phase 4. Severity: high. Likelihood: medium.**
The spec calls this unrecoverable and that is accurate — the external-reference table's entire
value is that `43775` maps to exactly one facility forever. Two failure modes: auto-creating on
T3/T4 without a human tap (the spec's stated worry), and the *un*stated one — B4's broken soft
delete means a "deleted" facility is currently still a live T1/T2 match target, so the ladder can
silently re-link to a facility a dispatcher believed was gone.
*Mitigation:* fix B4 first; T3/T4 creation only through an explicit user action with no
programmatic caller; a DB-level unique on `(orgId, clientId, sourceCode)`; and Verify check #4
(import a near-match, confirm no row appears without a tap) run against the **database**, not the
screen.

### 4. Phase 11 is a build, not an extension — and Phase 7B has no foundation
**Phases 7B and 11. Severity: medium. Likelihood: high.**
Two phases are written as "extend what's there" where nothing is there. P11's prompt says add a
toggle to the existing live tracking dashboard; there is no carrier board (C12). P7B says use the
routing provider already wired in; the wired provider does point-to-point routing only, with no
matrix and no solver (C11, D2, D3). Both will be estimated as small and are not. Left in sequence,
they push P8's risk later and compress P12.
*Mitigation:* the E-resequence above — P7b to last, and re-scope P11 explicitly before starting it.

### 5. Extraction accuracy on a real 16-page manifest
**Phases 1–4. Severity: medium. Likelihood: medium.**
The existing extractor is a single-shot Haiku call with `max_tokens: 1024` and a flat schema with
no confidence field. The spec's canonical shape is far richer, spans 16 pages, and requires
per-field confidence to drive the entire confidence-collapse UX in Section 4.2. If real confidence
comes back poorly calibrated, Section 4.2 degrades to "ask about everything" — which is the
40-minutes-of-typing status quo with extra steps. The spec flags this itself in Section 0.8
("real extraction accuracy comes in well below what the tests assume").
*Mitigation:* validate confidence calibration against the real test manifest during Phase 1,
before the Phase 3/4 UX is built on it. Consider a stronger model than Haiku for the vision pass —
`@anthropic-ai/sdk@0.77.0` supports the full model range, and the model id is a one-line constant.
If confidence is not usable, tell Ayaz in Phase 1, not Phase 4.

---

## Appendix — conventions any new code must follow

**New table migration** (template: `apps/web/prisma/migrations/20260722000004_add_client_contacts/migration.sql`)
`BEGIN` → `CREATE TABLE IF NOT EXISTS` with FK to `"Tenant"(id) ON DELETE RESTRICT` →
indexes → `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY` →
`CREATE POLICY tenant_isolation_policy … USING (org_id = current_tenant_id()) WITH CHECK (…)` →
`CREATE POLICY bypass_rls_policy … USING (current_setting('app.bypass_rls', TRUE)::text = 'on')` →
`GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO app_user` →
a self-validation `DO $$ … RAISE EXCEPTION` block → `COMMIT`.
Both policies wrapped in `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL; END $$`.

**Tenant column naming** — carrier siblings use `orgId String @map("org_id") @db.Uuid`;
workflow-engine and notification siblings use `tenantId String @db.Uuid` (no map).
Import tables sit next to carrier tables → use `orgId`.

**Data access** — `getTenantPrisma()` (`lib/context/tenant-context.ts:47`) for RLS-scoped reads
and writes, including multi-write `$transaction` (see B9).
`getTenantPrismaForOrg(tenantId, userId?)` (`:76`) takes an explicit tenant id rather than reading
the `x-tenant-id` header, so it is the one to use where no request header exists.
`withTenantRLS` exists for raw SQL — the Prisma RLS extension intercepts only model-level
operations, so `$queryRaw`/`$executeRaw` bypass it and return zero rows without that wrapper.

**Auth** — `requireRole([UserRole.OWNER, UserRole.MANAGER])` in server actions and pages;
`getSession()` + `session.tenantId` in `/api/v1/*` routes; `requirePermission(key)` for RBAC-gated
features. Role and tenant claims come from `app_metadata` (admin-only, tamper-proof); display
fields (`firstName`, `lastName`) come from `user_metadata` (`lib/auth/supabase.ts:48-49`).

**Money** — `Decimal` with `@db.Decimal(p,s)`; `decimal.js` in application code. Never `number`.

**Tests** — `vitest@4.0.18` in `apps/web` (co-located `__tests__/` folders);
`jest@29.7.0` + `jest-expo` in `apps/mobile` (`apps/mobile/tests/`).

**TypeScript gate** — `npx tsc --noEmit` is **clean in both apps** at the audit commit. Verified
by running it, not assumed:

```
$ cd apps/web    && npx tsc --noEmit   → EXIT CODE: 0   (no output)
$ cd apps/mobile && npx tsc --noEmit   → EXIT CODE: 0   (no output)
```

Spec Section 0.4 item 5 is satisfied. **The gate is zero errors in both apps at the end of every
phase** — not "no regressions". Any error introduced by this module is a failed phase.
