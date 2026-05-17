# Quick Task 355 — TKT-0015 Prompt 2 Decision Flags (from quick-354 Section 5)

**Status:** Complete (read-only surface)
**Source:** `.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md`
**Date:** 2026-05-17

---

## Section 5 — Edge cases to flag (verbatim from quick-354)

### Skip — Not tenant-scoped (system/global tables)
- `Plan` — global, no tenantId FK. Managed by platform admins only. Skip.
- `Promo` — global, no tenantId FK. Skip.
- `NotificationTemplate` — global system templates, no tenantId. Skip.
- `NotificationEmailConfig` — singleton global config row, no tenantId. Skip.
- `CarrierCatalogMeta` — reference/lookup data (`enum_group`/`enum_value`), no tenantId. Skip.
- `carrier_compliance_alert_log` — exists in DB but has NO Prisma model. Not tenant-scoped via FK (no `org_id` or `tenant_id` column visible). Skip entirely; investigate drift origin.
- `_prisma_migrations` — system table. Skip.

### Skip — Append-only / own audit semantics
- `AuditLog` (table: `audit_log`) — is itself the audit trail for PII access. Adding `created_by_id` would be redundant (it already has `user_id`). Append-only (RLS revokes UPDATE/DELETE). Skip.
- `DriverPayAuditLog` (table: `driver_pay_audit_logs`) — is itself an audit log with `actor_id`. Skip.
- `DispatchOverrideAudit` — audit log for dispatch override approvals. Has `userId` for the approver. Skip.
- `NotificationLog` — system-generated notification delivery log. No meaningful "created_by" user. Skip.
- `NotificationSendLog` — append-only notification delivery audit. Skip.
- `AutomationRun` — event log for automation firings. Uses `firedAt` not `createdAt`. Skip (and note: `createdAt`/`updatedAt` are missing from this table — add them only if needed for management queries, not as part of audit rollout).
- `AppEvent` — analytics event log (append-only). Skip.
- `PlaybookNotification` — notification delivery record (append-only). Skip.
- `GPSLocation` — high-frequency append-only telemetry. Already has `createdAt`. No user actor for GPS pings (system-generated). Skip.
- `SafetyEvent` — ELD-generated event (system). Skip.
- `FuelRecord` — logged by system/driver but no meaningful update actor. Skip.

### Skip — System-provisioned singletons
- `ActivationProgress` — one-per-tenant, created during provisioning by the system, never by a user action. `created_by_id` would always be NULL. Skip.
- `TenantHealthScore` — computed by cron, no user actor. Skip.
- `TenantMetricsDaily` — computed metrics (cron). Skip.
- `Subscription` — managed by Stripe webhook + system logic. No meaningful user actor. Skip.

### Skip — Join tables with no meaningful audit context
- `TagAssignment` — junction table (tag ↔ truck/user). Has `createdAt` but no `updatedAt` (correct for append-only join). `created_by_id` is reasonable but low-value. Defer.
- `DriverRouteJoin` — junction table. Has `createdAt`/`updatedAt`. Could add audit FKs but low ROI.

### Ambiguous `created_by_id` situations
- `FleetMessage` — has `senderId` (who sent the message) and no `updatedAt` (messages are immutable). `created_by_id` would be redundant with `senderId`. **Recommendation: skip FleetMessage** — use `senderId` for attribution.
- `CustomerInteraction` — has `createdBy String? @db.Uuid` as a bare UUID (no Prisma FK relation). This is an existing "proto-audit" pattern. It should be normalized to a proper `created_by_id` FK in Prompt 2, but it also means this column already exists functionally.
- `Document` — has `uploadedBy String @db.Uuid` (non-null) as a FK to `User` via the `uploader` relation. This is the creation actor. Adding `created_by_id` would be redundant. **Recommendation: skip Document** — `uploadedBy` already serves as `created_by_id`.
- `SysAdminInvoiceItem` — `createdAt`/`updatedAt` are **nullable** in the live DB (`is_nullable: YES`) despite Prisma declaring them NOT NULL. This is schema drift. Prompt 2 must fix this drift before adding audit FKs.
- `DriverCompensationTemplate`, `LoadDriverAssignment`, `LoadPayComponent`, `DriverBonus`, `DriverDeduction`, `DriverSettlement`, `DriverDispute`, `PayComponentAttachment` — all Driver Pay snake_case models have `created_by` as a bare `String @map("created_by") @db.Uuid` field with **no Prisma relation**. They are NOT NULL. For audit FK rollout, these need: (a) upgrade to FK with proper relation name, (b) add `updated_by` where missing, (c) both should reference `User.id`. This is the single biggest architectural decision in Prompt 2.

### Casing convention per table
Two distinct casing conventions exist — Prompt 2 must match the per-table convention:

- **camelCase tables** (Prisma model name = DB table name, PascalCase, no `@@map`): Use `createdById`/`updatedById` as field names in Prisma, which map to column names `createdById`/`updatedById` in Postgres. Examples: `Load`, `Truck`, `Route`, `Invoice`, `PayrollRecord`.
- **snake_case tables** (have `@@map("snake_case_name")` and field `@map("snake_case_col")`): Use `createdBy`/`updatedBy` as Prisma field names with `@map("created_by")`/`@map("updated_by")`, mapping to `created_by`/`updated_by` in Postgres. Examples: `clients`, `carrier_drivers`, `driver_settlements`. Note: Driver Pay models already use `created_by` (no `updated_by`).

**Casing rule:** Never mix conventions within a table. New columns on camelCase tables → `createdById`/`updatedById`. New columns on snake_case tables → `@map("created_by_id")`/`@map("updated_by_id")`.

---

## Decision flags — items needing user input before Prompt 2

- [ ] **Flag 1 — `onDelete` behavior for audit FKs**
  Tables/columns: `createdById`/`updatedById` on ALL new tables; existing `Truck.createdById`, `Route.createdById`, `Load.createdById`, `Invoice.createdById`, `PayrollRecord.createdById`
  Existing models (`Truck`, `Route`, `Load`, `Invoice`, `PayrollRecord`) use NO `onDelete` on `createdById`/`updatedById` (defaults to Restrict — users cannot be deleted if they created/updated records). Should new audit FKs also use Restrict, or switch to `onDelete: SetNull` (safer for user offboarding)?
  Recommend: `SetNull` for all new FKs for consistency with user lifecycle management.

- [ ] **Flag 2 — `Document.uploadedBy` vs `created_by_id`**
  Tables/columns: `Document.uploadedBy` (existing), `Document.createdById` (proposed)
  The `Document` model already has `uploadedBy String @db.Uuid` (NOT NULL) as the creation actor FK. Add a redundant `createdById`/`updatedById` pair, OR accept `uploadedBy` as the canonical audit column for this model?
  Recommend: skip `Document` for the FK rollout — `uploadedBy` already fills this role.

- [ ] **Flag 3 — `FleetMessage.senderId` vs `created_by_id`**
  Tables/columns: `FleetMessage.senderId` (existing), `FleetMessage.createdById` (proposed)
  `FleetMessage` already has `senderId String @db.Uuid` (NOT NULL) as the author. Add redundant `created_by_id`, OR skip?
  Recommend: skip.

- [ ] **Flag 4 — Driver Pay `created_by` NOT NULL constraint + FK integrity**
  Tables/columns: `driver_compensation_templates.created_by`, `load_driver_assignments.created_by`, `load_pay_components.created_by`, `driver_bonuses.created_by`, `driver_deductions.created_by`, `driver_settlements.created_by`, `driver_disputes.created_by`, `pay_component_attachments.created_by`
  All Driver Pay models have `created_by STRING NOT NULL @db.Uuid` — a bare UUID with no FK constraint. Prompt 2 will add the FK `REFERENCES "User"(id)` as a new constraint. This requires all existing `created_by` values to be valid `User.id` values, or the migration will fail. Verify data integrity first: `SELECT DISTINCT created_by FROM driver_compensation_templates WHERE created_by NOT IN (SELECT id FROM "User")`.

- [ ] **Flag 5 — `SysAdminInvoiceItem` nullable drift**
  Tables/columns: `SysAdminInvoiceItem.createdAt`, `SysAdminInvoiceItem.updatedAt`
  DB shows `createdAt`/`updatedAt` are `is_nullable: YES` for this table, but Prisma schema declares them NOT NULL. Fix drift direction: (a) `ALTER TABLE "SysAdminInvoiceItem" ALTER COLUMN "createdAt" SET NOT NULL` + `ALTER COLUMN "updatedAt" SET NOT NULL` (requires all rows to have values), or (b) update Prisma schema to match DB as nullable. Resolve before adding audit FKs.

- [ ] **Flag 6 — `Tenant` model**
  Tables/columns: `Tenant.createdById`, `Tenant.updatedById` (proposed)
  Should `Tenant` itself get `createdById`/`updatedById`? The creation actor would be the system (no user session at provisioning time). `created_by_id` would always be NULL.
  Recommend: skip for now.

- [ ] **Flag 7 — Audit FK injection via extension vs explicit writes**
  Tables/columns: N/A (architectural decision)
  Should `createdById`/`updatedById` be auto-injected by extending `withTenantRLS` (centralized, automatic), or should each server action write them explicitly (transparent, debuggable)? Centralized injection requires the extension to receive `userId` as a parameter alongside `tenantId`.
  Recommend: extend `withAuditColumns(userId)` as a separate composable extension that composes with `withTenantRLS`.

- [ ] **Flag 8 — bare `createdBy`/`updatedBy` UUID fields from quick-327**
  Tables/columns: `PlaybookStep.createdBy`, `StepInstance.createdBy`, `RouteDriver.createdBy`, `PushToken.createdBy`, `UserNotificationPreference.createdBy`, `SysAdminInvoiceItem.createdBy`/`updatedBy` (all bare UUIDs, no FK relation, added in quick-327)
  These were added in quick-327 as bare UUIDs with no FK relation. Prompt 2 should upgrade these to proper FK relations. Confirm this is desired scope.

---

## Self-Check: PASSED
- No source files modified
- No migrations created
- No DB writes
- Section 5 quoted verbatim from 354-SUMMARY.md
- All 8 flags listed with tables/columns explicitly named
