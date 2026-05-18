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

### FULL — Driver Pay domain (createdBy/updatedBy naming, explicit writes only)

These models use `createdBy`/`updatedBy` Prisma field names (mapping to `created_by`/`updated_by` DB columns) rather than `createdById`/`updatedById`. They are in `EXEMPT_AUDIT_MODELS` — the extension does not inject; API routes set these explicitly.

| Model | Table | Columns | Status |
|---|---|---|---|
| DriverCompensationTemplate | driver_compensation_templates | createdBy (Prompt 2a), updatedBy (Wave 4) | FULL — explicit writes |
| LoadDriverAssignment | load_driver_assignments | createdBy (Prompt 2a), updatedBy (Wave 4) | FULL — explicit writes |
| LoadPayComponent | load_pay_components | createdBy (Prompt 2a), updatedBy (Wave 4) | FULL — explicit writes |
| PayComponentAttachment | pay_component_attachments | createdBy (Prompt 2a), updatedBy (Wave 4) | FULL — explicit writes |
| DriverBonus | driver_bonuses | createdBy (Prompt 2a), updatedBy (Wave 4) | FULL — explicit writes |
| DriverDeduction | driver_deductions | createdBy (Prompt 2a), updatedBy (Wave 4) | FULL — explicit writes |
| DriverSettlement | driver_settlements | createdBy (Prompt 2a), updatedBy (Wave 4) | FULL — explicit writes |
| DriverDispute | driver_disputes | createdBy (Prompt 2a), updatedBy (Wave 4) | FULL — explicit writes |

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
| PlaybookStep | Pre-existing createdBy/updatedBy (quick-327). Explicit writes. |
| StepInstance | Pre-existing createdBy/updatedBy (quick-327). Explicit writes. |

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

**Sets (final state after Wave 4):**

```typescript
CREATE_ONLY_AUDIT_MODELS = {
  'FleetMessage',
  'FuelRecord',
  'RouteTemplateStop',
}

EXEMPT_AUDIT_MODELS = {
  // System / append-only
  'Tenant', 'TicketMessage', 'AuditLog', 'DriverPayAuditLog',
  'DispatchOverrideAudit', 'NotificationLog', 'NotificationSendLog',
  'AutomationRun', 'AppEvent', 'PlaybookNotification',
  'GPSLocation', 'GpsReport', 'SafetyEvent',
  'ActivationProgress', 'TenantHealthScore', 'TenantMetricsDaily',
  'Subscription', 'TagAssignment', 'DriverRouteJoin',
  // Driver Pay (use createdBy/updatedBy, not createdById/updatedById — explicit writes)
  'DriverCompensationTemplate', 'LoadDriverAssignment', 'LoadPayComponent',
  'PayComponentAttachment', 'DriverBonus', 'DriverDeduction',
  'DriverSettlement', 'DriverDispute',
  // Workflow models with pre-existing createdBy/updatedBy (quick-327 — explicit writes)
  'PlaybookStep', 'StepInstance',
}
```

**Injection field names:**
- Standard models (camelCase and snake_case carrier ops): `createdById` / `updatedById`
  - For snake_case models with `@map("created_by_id")`, the Prisma field name is still `createdById`; the DB column mapping is transparent to the extension
- Driver Pay / quick-327 models: `createdBy` / `updatedBy` — these models are in EXEMPT, so injection does NOT run on them; their API routes set the fields explicitly

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

## 7. Outstanding Follow-Ups for Prompts 3 and 4

### Prompt 3 — Auto-capture middleware integration

The `withAuditColumns` extension is wired but the columns are not yet populated in production writes because:
1. Many API routes do not call `getTenantPrisma()` — they use `prisma` directly or via custom clients
2. Server actions use `getTenantPrisma()` but older ones predate QT-359 and may need review
3. Driver Pay API routes correctly use `getTenantPrisma()` but their models are EXEMPT — they need explicit `updatedBy: session.userId` wiring in their PUT/PATCH handlers

**Prompt 3 tasks:**
- Audit all API routes that write to FULL-injection models — confirm they use `getTenantPrisma()` not raw `prisma`
- Wire `updatedBy: session.userId` explicitly in Driver Pay update paths (8 models × N update routes)
- Wire `createdBy`/`updatedBy` for `PlaybookStep`/`StepInstance` EXEMPT models in their write paths
- Verify `createdById`/`updatedById` are being populated for newly created records in production (spot check via DB query post-deploy)

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
- 37 tenant-scoped models covered (FULL or CREATE_ONLY or FULL-explicit)
- 21 models in EXEMPT (system/append-only/pre-existing convention)
- withAuditColumns extension correctly handles all 3 categories
- getTenantPrisma fix (QT-359) ensures authenticated userId is forwarded
- 4 migration files, all idempotent, all ON DELETE SET NULL
- TypeScript: no new errors introduced; Wave 4 widenings isolated to test fixtures
- GitHub: master branch up to date (1b261af2)
