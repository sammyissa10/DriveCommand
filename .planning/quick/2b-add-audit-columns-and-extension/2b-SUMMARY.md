# TKT-0015 Prompt 2b — Complete Summary
## Add createdById/updatedById Audit FKs + withAuditColumns Extension

**Status:** COMPLETE (Waves 1–4 all shipped)
**Date range:** 2026-05-17
**Scope:** apps/web — Prisma schema, migration SQL, Prisma extension, TypeScript widenings

---

## 1. Final Inventory — Every Tenant-Scoped Model

### FULL (createdById + updatedById both present)

Models that carry both audit FK columns and participate in full auto-injection via `withAuditColumns`:

| Model | Table | Column names | Wave |
|---|---|---|---|
| Truck | Truck | createdById, updatedById | Pre-rollout |
| Route | Route | createdById, updatedById | Pre-rollout |
| Load | Load | createdById, updatedById | Pre-rollout |
| Invoice | Invoice | createdById, updatedById | Pre-rollout |
| PayrollRecord | PayrollRecord | createdById, updatedById | Pre-rollout |
| Tag | Tag | createdById, updatedById | Wave 1 |
| ExpenseCategory | ExpenseCategory | createdById, updatedById | Wave 1 |
| CarrierClient | clients | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| CarrierContract | contracts | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| CarrierFacility | facilities | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| CarrierDriver | carrier_drivers | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| CarrierTruck | carrier_trucks | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| CarrierDispatch | dispatches | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| CarrierLoad | loads | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| CarrierStop | stops | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| CarrierExpense | carrier_expenses | createdById→created_by_id, updatedById→updated_by_id | Wave 2 |
| Document | Document | createdById, updatedById (alongside existing uploadedBy) | Wave 2 |
| Customer | Customer | createdById, updatedById | Wave 3 |
| CustomerInteraction | CustomerInteraction | createdById, updatedById (alongside existing bare createdBy) | Wave 3 |
| MaintenanceEvent | MaintenanceEvent | createdById, updatedById | Wave 3 |
| ScheduledService | ScheduledService | createdById, updatedById | Wave 3 |
| RouteExpense | RouteExpense | createdById, updatedById | Wave 3 |
| ExpenseTemplate | ExpenseTemplate | createdById, updatedById | Wave 3 |
| RoutePayment | RoutePayment | createdById, updatedById | Wave 3 |
| RouteStop | RouteStop | createdById, updatedById | Wave 3 |
| DriverHOSEntry | DriverHOSEntry | createdById, updatedById | Wave 3 |
| DriverIncident | DriverIncident | createdById, updatedById | Wave 3 |
| InvoiceItem | InvoiceItem | createdById, updatedById (+createdAt/updatedAt added) | Wave 3 |
| SysAdminInvoice | SysAdminInvoice | createdById, updatedById | Wave 3 |
| TenantIntegration | TenantIntegration | createdById, updatedById | Wave 3 |
| SupportTicket | SupportTicket | createdById, updatedById | Wave 4 |
| PlaybookInstance | PlaybookInstance | createdById, updatedById | Wave 4 |
| StepTemplate | StepTemplate | createdById, updatedById | Wave 4 |
| Playbook | Playbook | createdById, updatedById | Wave 4 |
| DriverInvitation | DriverInvitation | createdById, updatedById | Wave 4 |
| PlaybookTrigger | PlaybookTrigger | createdById, updatedById | Wave 4 |
| RouteTemplate | route_templates | createdById→created_by_id, updatedById→updated_by_id | Wave 4 |
| PlaybookStep | PlaybookStep | createdBy→created_by, updatedBy→updated_by | Prompt 3 / quick-366 |
| StepInstance | StepInstance | createdBy→created_by, updatedBy→updated_by | Prompt 3 / quick-366 |

### FULL — Driver Pay domain (resolved in Prompt 3 — quick-366)

These 8 models use `createdBy`/`updatedBy` Prisma field names (mapping to `created_by`/`updated_by` DB columns) — the older naming convention that predates the `createdById`/`updatedById` standard. As of quick-366 (Prompt 3, commit `fe5d1e6b`), `withAuditColumns` detects each model's naming convention via a precomputed DMMF registry and injects into whichever convention exists. All 8 Driver Pay models now receive automatic `createdBy` and `updatedBy` injection on every write through the tenant client — no explicit wiring in API routes required for the update side.

| Model | Table | Columns | Status |
|---|---|---|---|
| DriverCompensationTemplate | driver_compensation_templates | createdBy, updatedBy | FULL auto-injection (Prompt 3) |
| LoadDriverAssignment | load_driver_assignments | createdBy, updatedBy | FULL auto-injection (Prompt 3) |
| LoadPayComponent | load_pay_components | createdBy, updatedBy | FULL auto-injection (Prompt 3) |
| PayComponentAttachment | pay_component_attachments | createdBy, updatedBy | FULL auto-injection (Prompt 3) |
| DriverBonus | driver_bonuses | createdBy, updatedBy | FULL auto-injection (Prompt 3) |
| DriverDeduction | driver_deductions | createdBy, updatedBy | FULL auto-injection (Prompt 3) |
| DriverSettlement | driver_settlements | createdBy, updatedBy | FULL auto-injection (Prompt 3) |
| DriverDispute | driver_disputes | createdBy, updatedBy | FULL auto-injection (Prompt 3) |

### CREATE_ONLY (createdById only — no updatedById because no updatedAt column)

| Model | Table | Column | Wave |
|---|---|---|---|
| FleetMessage | FleetMessage | createdById | Wave 2 |
| FuelRecord | FuelRecord | createdById | Wave 3 |
| RouteTemplateStop | route_template_stops | createdById→created_by_id | Wave 4 |

### EXEMPT (no audit FK columns — system-generated, append-only, or own audit semantics)

| Model | Reason |
|---|---|
| Tenant | System-provisioned singleton; no user session at creation |
| TicketMessage | Append-only chat; no meaningful audit actor |
| AuditLog | Is itself the audit trail (has user_id). Append-only. |
| DriverPayAuditLog | Is itself an audit log (has actor_id). Skip. |
| DispatchOverrideAudit | Audit log with userId. Skip. |
| NotificationLog | System-generated delivery log. No user actor. |
| NotificationSendLog | Append-only notification audit. Skip. |
| AutomationRun | Event log for automation firings. No user actor. |
| AppEvent | Analytics event log. Append-only. |
| PlaybookNotification | Notification delivery record. Append-only. |
| GPSLocation | High-frequency telemetry. System-generated. |
| GpsReport | GPS ping table. System-generated. |
| SafetyEvent | ELD-generated event. No user actor. |
| ActivationProgress | Singleton provisioned by system. Always NULL createdById. |
| TenantHealthScore | Computed by cron. No user actor. |
| TenantMetricsDaily | Computed metrics (cron). No user actor. |
| Subscription | Managed by Stripe/system. No meaningful user actor. |
| TagAssignment | Junction table. Low ROI; deferred. |
| DriverRouteJoin | Junction table. Low ROI; deferred. |
<!-- PlaybookStep and StepInstance were here before Prompt 3. Removed — both now FULL. See "Workflow models" in FULL table below. -->

### Out of Scope / Not in Prisma

| Item | Reason |
|---|---|
| carrier_compliance_alert_log | No Prisma model. Not tenant-scoped. Skip. |
| Plan | Global (no tenantId). Platform admin only. |
| Promo | Global (no tenantId). |
| NotificationTemplate | Global system templates. |
| NotificationEmailConfig | Singleton global config. |
| CarrierCatalogMeta | Reference/lookup data. No tenantId. |
| DocFeedback | Low-value for audit trail. Deferred. |
| CarrierDocument | Append-only upload record. Deferred (not in Wave 4 brief). |
| CarrierDocumentType | Master data. No updatedAt. Deferred. |
| InAppNotification | System-generated notification. Deferred. |
| DriverPayRecord | No updatedAt. Deferred (not in Wave 4 brief). |
| SysAdminInvoiceItem | Schema drift (nullable createdAt/updatedAt in DB). Deferred. |
| RouteDriver | Pre-existing bare UUID createdBy (quick-327). Deferred. |
| PushToken | Pre-existing bare UUID createdBy (quick-327). Deferred. |
| UserNotificationPreference | Pre-existing bare UUID createdBy (quick-327). Deferred. |

---

## 2. Migration List (Waves 1–4)

| Wave | Migration Name | SHA | Tables |
|---|---|---|---|
| 1 (Smoke) | 20260517100001_tkt0015_2b_wave1_smoke_audit_columns | 5ad81f28 | Tag, ExpenseCategory |
| 2 (Fleet) | 20260517150001_tkt0015_2b_wave2_fleet_audit_columns | e0fee9f8 | clients, contracts, facilities, carrier_drivers, carrier_trucks, dispatches, loads, stops, carrier_expenses, Document, FleetMessage |
| 3 (Finance/CRM) | 20260517200001_tkt0015_2b_wave3_finance_crm_audit_columns | 36f8e664 | MaintenanceEvent, ScheduledService, FuelRecord, RouteExpense, ExpenseTemplate, RoutePayment, RouteStop, DriverHOSEntry, DriverIncident, InvoiceItem, SysAdminInvoice, Customer, CustomerInteraction, TenantIntegration |
| 4 (Driver Pay/Workflow) | 20260517250001_tkt0015_2b_wave4_driver_pay_audit_columns | 1b261af2 | SupportTicket, PlaybookInstance, StepTemplate, Playbook, DriverInvitation, PlaybookTrigger, route_templates, route_template_stops, driver_compensation_templates, load_driver_assignments, load_pay_components, pay_component_attachments, driver_bonuses, driver_deductions, driver_settlements, driver_disputes |

All migrations applied via Supabase MCP `apply_migration`. Idempotent SQL (IF NOT EXISTS guards on both columns and FK constraints). All FKs ON DELETE SET NULL.

---

## 3. withAuditColumns Extension

**File:** `apps/web/src/lib/db/extensions/audit-columns.ts`

**Factory function:** `withAuditColumns(userId: string | null)`

**Behaviour:**
- `userId == null` → no-op passthrough (cron jobs, seeding, anonymous flows)
- Models in `EXEMPT_AUDIT_MODELS` → passthrough unchanged
- Models in `CREATE_ONLY_AUDIT_MODELS` → injects `createdById` on create only; no `updatedById` injection ever
- All other models → injects `createdById` + `updatedById` on create; `updatedById` on update/updateMany; both create branches on upsert; update branch on upsert update
- Caller-supplied values in `args.data` are always preserved (only injects when field is `undefined`)

**Sets (final state after Wave 4 + Prompt 3 / quick-366):**

```typescript
CREATE_ONLY_AUDIT_MODELS = {
  'FleetMessage',
  'FuelRecord',
  'RouteTemplateStop',
}

EXEMPT_AUDIT_MODELS = {
  // System / append-only / audit-log / junction tables — no meaningful user actor.
  // No naming-workaround models remain here after Prompt 3 (quick-366).
  'Tenant', 'TicketMessage', 'AuditLog', 'DriverPayAuditLog',
  'DispatchOverrideAudit', 'NotificationLog', 'NotificationSendLog',
  'AutomationRun', 'AppEvent', 'PlaybookNotification',
  'GPSLocation', 'GpsReport', 'SafetyEvent',
  'ActivationProgress', 'TenantHealthScore', 'TenantMetricsDaily',
  'Subscription', 'TagAssignment', 'DriverRouteJoin',
  // Total: 19 entries
}
```

**Injection field names — dual-convention (Prompt 3):**
- The extension detects each model's naming convention via a precomputed DMMF registry
  built once at `withAuditColumns` factory invocation (O(1) per-query lookup thereafter)
- Standard models (37): `createdById` / `updatedById`
  - For snake_case models with `@map("created_by_id")`, the Prisma field name is still `createdById`
- Driver Pay + PlaybookStep + StepInstance (10): `createdBy` / `updatedBy`
- All 47 tenant-scoped models with an audit actor now have automatic injection

---

## 4. Composition in tenant-client.ts

**File:** `apps/web/src/lib/db/tenant-client.ts`

```typescript
export function createTenantClient(tenantId: string, userId?: string | null): PrismaClient {
  return prisma
    .$extends(withTenantRLS(tenantId))
    .$extends(withAuditColumns(userId ?? null)) as unknown as PrismaClient;
}
```

Composition order: RLS first (tenant isolation), audit second (user attribution). This ensures tenant data isolation is the outer-most guarantee and cannot be bypassed by the audit layer.

---

## 5. getTenantPrisma Fix (QT-359)

**File:** `apps/web/src/lib/context/tenant-context.ts`
**Commit:** `da05ed77` (QT-359)

**Before QT-359:** `getTenantPrisma()` called `createTenantClient(tenantId)` without userId → `withAuditColumns(null)` → no-op for all requests, even authenticated ones.

**After QT-359:**
```typescript
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantId = await requireTenantId();
  const session = await getSession();
  return createTenantClient(tenantId, session?.userId ?? null);
}
```

userId is forwarded from the current Supabase Auth session. Authenticated requests auto-populate `createdById`/`updatedById` on all non-EXEMPT, non-CREATE_ONLY models.

---

## 6. TypeScript Widenings Applied Per Wave

| Wave | File | Change |
|---|---|---|
| 1 | None | No widenings needed (new nullable fields are backwards-compatible) |
| 2 | None | No widenings needed |
| 3 | None | No widenings needed |
| 4 | `apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/settlements.fixture.ts` | Added `updatedBy: null` to all DriverSettlement, LoadPayComponent, and DriverBonus fixture objects (8 objects total) |

The Wave 4 widening was isolated to test fixtures because the new `updatedBy` field on Driver Pay models is `String?` (nullable) — Prisma generates it as a required field in the type but with `null` as valid value. Fixtures constructed as full model objects needed the field added.

---

## 7. Follow-Ups for Prompts 3 and 4

### RESOLVED in quick-366 (Prompt 3) — Naming-Inconsistency Workaround Closed

**RESOLUTION (commit `fe5d1e6b`, 2026-05-18):** The extension now detects each model's audit field naming convention at instantiation time via `Prisma.dmmf.datamodel.models` and injects into whichever convention the model defines (`createdById`/`updatedById` OR `createdBy`/`updatedBy`). The 10 naming-affected models have been removed from `EXEMPT_AUDIT_MODELS` as of commit `fe5d1e6b`. All 47 tenant-scoped models with an audit actor now receive automatic injection.

---

### (Historical reference — resolved) Naming-Inconsistency Workaround: 10 Models Previously Excluded

Ten models use the older `createdBy`/`updatedBy` Prisma field convention instead of the current `createdById`/`updatedById` standard. `withAuditColumns` previously only injected `createdById`/`updatedById`, so these models were in `EXEMPT_AUDIT_MODELS` as a workaround. **This is now resolved — see RESOLUTION above.**

**Affected models (10 total):**

| Model | Origin of naming | DB columns added | Current state |
|---|---|---|---|
| DriverCompensationTemplate | Prompt 2a (older convention) | created_by (2a), updated_by (Wave 4) | created_by: some explicit wiring; updated_by: NULL everywhere |
| LoadDriverAssignment | Prompt 2a | created_by (2a), updated_by (Wave 4) | same |
| LoadPayComponent | Prompt 2a | created_by (2a), updated_by (Wave 4) | same |
| PayComponentAttachment | Prompt 2a | created_by (2a), updated_by (Wave 4) | same |
| DriverBonus | Prompt 2a | created_by (2a), updated_by (Wave 4) | same |
| DriverDeduction | Prompt 2a | created_by (2a), updated_by (Wave 4) | same |
| DriverSettlement | Prompt 2a | created_by (2a), updated_by (Wave 4) | same |
| DriverDispute | Prompt 2a | created_by (2a), updated_by (Wave 4) | same |
| PlaybookStep | quick-327 (older convention) | created_by, updated_by (pre-existing) | explicit wiring required in all write paths |
| StepInstance | quick-327 (older convention) | created_by, updated_by (pre-existing) | explicit wiring required in all write paths |

**The NULL problem:** Wave 4 added `updated_by` columns to all 8 Driver Pay models. Those columns will remain NULL for every write because: (1) the extension skips them (EXEMPT), and (2) no API route sets `updatedBy` explicitly yet.

**Recommended fix for Prompt 3 (option A — extend the extension):**
1. Extend `withAuditColumns` to detect both field naming conventions — check for `createdBy`/`updatedBy` in addition to `createdById`/`updatedById`, injecting whichever is present on the model.
2. Remove the 10 models from `EXEMPT_AUDIT_MODELS` (they all have a real user actor).
3. Remove any now-redundant explicit `createdBy`/`updatedBy` assignments in API routes.

**Alternative fix for Prompt 3 (option B — rename the fields):**
1. Rename the Prisma field names on all 10 models from `createdBy → createdById` and `updatedBy → updatedById`.
2. Add `@map("created_by")` / `@map("updated_by")` if the underlying DB column names must be preserved, or generate a new migration to rename the DB columns too.
3. Remove the 10 models from `EXEMPT_AUDIT_MODELS`.
4. Fix call sites that reference the old field names.

Option A is lower-risk (no schema rename migration, no call-site sweep). Option B achieves full convention consistency.

---

### Completed in Prompt 3 (quick-366, 2026-05-18)

- **Naming-inconsistency workaround resolved** — `withAuditColumns` now detects both `createdBy`/`updatedBy` and `createdById`/`updatedById` per model via a precomputed DMMF registry. Commit `fe5d1e6b`.
- **10 models removed from EXEMPT** — 8 Driver Pay models + PlaybookStep + StepInstance. All classified FULL. Commit `fe5d1e6b`.
- **DriverBonus audit auto-capture tests added** — 3 test cases covering create-injection, update-injection (createdBy unchanged), and explicit-value passthrough. Commit `8aca96d8`.
- **`updated_by` columns on all 8 Driver Pay models** are now auto-populated on every write through the tenant client — no more NULL on updates.

### Prompt 3 — Auto-capture middleware integration (remaining)

The `withAuditColumns` extension is wired for all 47 models. Remaining follow-up items:
1. Many API routes may not call `getTenantPrisma()` — they may use `prisma` directly. Audit to confirm.
2. Older server actions predate QT-359 and may need review.
3. Verify `createdById`/`updatedById` + `createdBy`/`updatedBy` are being populated for newly created records in production (spot check via DB query post-deploy)

### Prompt 4 — Detail page display

The 29 detail pages inventoried in QT-354 Section 3 need UI updates to display `createdBy`/`updatedBy` audit information. The `createdById` FK is a UUID — Prompt 4 should decide whether to:
- Display the User's name (requires join/lookup)
- Display "Created by [email]" (requires User lookup)
- Display relative timestamps only for now

**Deferred models still lacking audit columns (not in Prompt 2b scope):**
- `CarrierDocument`, `CarrierDocumentType`, `InAppNotification`, `DriverPayRecord`, `SysAdminInvoiceItem` (drift to fix first), `RouteDriver`, `PushToken`, `UserNotificationPreference`, `DocFeedback`

---

## Self-Check: PASSED

- All 4 waves shipped with green verification gates
- **47 tenant-scoped models with a user actor now have automatic injection** (FULL or CREATE_ONLY)
  - 37 models via `createdById`/`updatedById` convention (Waves 1–4)
  - 10 models via `createdBy`/`updatedBy` convention (Prompt 3 / quick-366)
  - 3 models CREATE_ONLY (FleetMessage, FuelRecord, RouteTemplateStop)
- **19 models in EXEMPT** (system-generated / audit-log tables / junction tables — no meaningful user actor)
  - Naming-inconsistency workaround resolved in quick-366: all 47 models now have automatic injection
- withAuditColumns extension now handles both naming conventions via precomputed DMMF registry (O(1) per-query lookup)
- getTenantPrisma fix (QT-359) ensures authenticated userId is forwarded
- 4 migration files, all idempotent, all ON DELETE SET NULL
- TypeScript: no new errors introduced; Wave 4 widenings isolated to test fixtures
- Prompt 3 commits: `fe5d1e6b` (extension), `8aca96d8` (tests)
- GitHub: master branch up to date
