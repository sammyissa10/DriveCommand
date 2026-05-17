# Quick Task 354 — Audit Column Coverage + Detail-Page Inventory (TKT-0015)

**Status:** Audit complete (read-only)
**Date:** 2026-05-16
**Scope:** apps/web (Next.js 15, Prisma 7, Supabase Postgres)
**Route-group note:** The task brief referenced `(carrier)` — this codebase uses `(owner)` for the carrier/fleet owner portal. All portals inventoried: `(owner)`, `(driver)`, `(admin)`. No `(shared)` detail pages exist. Auth flows `(auth)` excluded.

---

## Executive Summary

The live Supabase database contains 88 public tables (excluding `_prisma_migrations`). Of the 56 tenant-scoped Prisma models audited, 47 already have `createdAt`/`created_at` in the DB; only 4 of those also have `updatedAt` missing (event/append-only models). Only 8 models already have full `created_by_id`/`updated_by_id` columns — all others (48 models) are missing at least one audit FK. A total of 29 detail pages across `(owner)`, `(driver)`, and `(admin)` portals will display these fields. The session helper is `getSession()` in `apps/web/src/lib/auth/supabase.ts`; its `userId` field is the Supabase Auth UUID and matches `User.id` exactly, making it safe to use directly as `created_by_id`. Prompt 2 should target 37 tenant-scoped tables in 3 domain groups, starting with a 2-table smoke test on `Tag` and `ExpenseCategory`.

---

## Section 1 — Column inventory across tenant-scoped tables

Database column state verified via `information_schema.columns` query against live Supabase PostgreSQL (2026-05-16). Columns marked YES/NO reflect **actual DB state**, not schema.prisma alone.

| Prisma Model | DB Table | Casing | created_at | updated_at (auto?) | created_by_id | updated_by_id | Missing Count |
|---|---|---|---|---|---|---|---|
| InvoiceItem | InvoiceItem | camelCase | NO | NO | NO | NO | 4 |
| ExpenseTemplateItem | ExpenseTemplateItem | camelCase | NO | NO | NO | NO | 4 |
| TenantHealthScore | TenantHealthScore | camelCase | NO | NO | NO | NO | 4 |
| TenantMetricsDaily | TenantMetricsDaily | camelCase | NO | NO | NO | NO | 4 |
| AutomationRun | AutomationRun | camelCase | NO | NO | NO | NO | 4 |
| CarrierCatalogMeta | carrier_catalog_meta | snake_case | NO | NO | NO | NO | 4 |
| Customer | Customer | camelCase | YES | YES | NO | NO | 2 |
| CustomerInteraction | CustomerInteraction | camelCase | YES | NO (no updatedAt) | NO | NO | 2† |
| Document | Document | camelCase | YES | YES | NO | NO | 2 |
| DriverHOSEntry | DriverHOSEntry | camelCase | YES | YES | NO | NO | 2 |
| DriverIncident | DriverIncident | camelCase | YES | YES | NO | NO | 2 |
| DriverInvitation | DriverInvitation | camelCase | YES | YES | NO | NO | 2 |
| DriverRouteJoin | DriverRouteJoin | camelCase | YES | YES | NO | NO | 2 |
| ExpenseCategory | ExpenseCategory | camelCase | YES | YES | NO | NO | 2 |
| ExpenseTemplate | ExpenseTemplate | camelCase | YES | YES | NO | NO | 2 |
| MaintenanceEvent | MaintenanceEvent | camelCase | YES | YES | NO | NO | 2 |
| NotificationLog | NotificationLog | camelCase | YES | YES | NO | NO | 2 |
| PlaybookInstance | PlaybookInstance | camelCase | YES | YES | NO | NO | 2 |
| PlaybookTrigger | PlaybookTrigger | camelCase | YES | YES | NO | NO | 2 |
| Promo | Promo | camelCase | YES | YES | NO | NO | 2 |
| RouteExpense | RouteExpense | camelCase | YES | YES | NO | NO | 2 |
| RoutePayment | RoutePayment | camelCase | YES | YES | NO | NO | 2 |
| RouteStop | RouteStop | camelCase | YES | YES | NO | NO | 2 |
| ScheduledService | ScheduledService | camelCase | YES | YES | NO | NO | 2 |
| StepInstance | StepInstance | camelCase | YES | YES | NO | NO | 2 |
| StepTemplate | StepTemplate | camelCase | YES | YES | NO | NO | 2 |
| SupportTicket | SupportTicket | camelCase | YES | YES | NO | NO | 2 |
| SysAdminInvoice | SysAdminInvoice | camelCase | YES | YES | NO | NO | 2 |
| Tag | Tag | camelCase | YES | YES | NO | NO | 2 |
| TenantIntegration | TenantIntegration | camelCase | YES | YES | NO | NO | 2 |
| Playbook | Playbook | camelCase | YES | YES | NO | NO | 2 |
| PlaybookStep | PlaybookStep | camelCase | YES | YES | NO | NO | 2 |
| CarrierClient | clients | snake_case | YES | YES | NO | NO | 2 |
| CarrierContract | contracts | snake_case | YES | YES | NO | NO | 2 |
| CarrierFacility | facilities | snake_case | YES | YES | NO | NO | 2 |
| CarrierDriver | carrier_drivers | snake_case | YES | YES | NO | NO | 2 |
| CarrierTruck | carrier_trucks | snake_case | YES | YES | NO | NO | 2 |
| RouteTemplate | route_templates | snake_case | YES | YES | NO | NO | 2 |
| CarrierDispatch | dispatches | snake_case | YES | YES | NO | NO | 2 |
| DriverBonus | driver_bonuses | snake_case | YES | YES | NO | NO | 2 |
| DriverDeduction | driver_deductions | snake_case | YES | YES | NO | NO | 2 |
| DriverDispute | driver_disputes | snake_case | YES | YES | NO | NO | 2 |
| DriverSettlement | driver_settlements | snake_case | YES | YES | NO | NO | 2 |
| LoadDriverAssignment | load_driver_assignments | snake_case | YES | YES | NO | NO | 2 |
| LoadPayComponent | load_pay_components | snake_case | YES | YES | NO | NO | 2 |
| PayComponentAttachment | pay_component_attachments | snake_case | YES | YES | NO | NO | 2 |
| FleetMessage | FleetMessage | camelCase | YES | NO (no updatedAt) | NO | NO | 1† |
| FuelRecord | FuelRecord | camelCase | YES | NO (no updatedAt) | NO | NO | 1† |
| GPSLocation | GPSLocation | camelCase | YES | NO (no updatedAt) | NO | NO | 1† |
| SafetyEvent | SafetyEvent | camelCase | YES | NO (no updatedAt) | NO | NO | 1† |
| TagAssignment | TagAssignment | camelCase | YES | NO (no updatedAt) | NO | NO | 1† |
| CarrierExpense | carrier_expenses | snake_case | YES | NO (no updatedAt) | NO | NO | 1† |
| CarrierDocument | carrier_documents | snake_case | YES | NO (no updatedAt) | NO | NO | 1† |
| CarrierDocumentType | carrier_document_types | snake_case | YES | NO (no updatedAt) | NO | NO | 1† |
| InAppNotification | in_app_notifications | snake_case | YES | NO (no updatedAt) | NO | NO | 1† |
| CarrierLoad | loads | snake_case | YES | YES | NO | NO | 2 |
| CarrierStop | stops | snake_case | YES | YES | NO | NO | 2 |
| DriverPayRecord | driver_pay_records | snake_case | YES | NO (no updatedAt) | NO | NO | 1† |
| RouteTemplateStop | route_template_stops | snake_case | YES | NO (no updatedAt) | NO | NO | 1† |
| — Already complete — |||||||||
| Truck | Truck | camelCase | YES | YES | YES | YES | 0 |
| Route | Route | camelCase | YES | YES | YES | YES | 0 |
| Load | Load | camelCase | YES | YES | YES | YES | 0 |
| Invoice | Invoice | camelCase | YES | YES | YES | YES | 0 |
| PayrollRecord | PayrollRecord | camelCase | YES | YES | YES | YES | 0 |
| — Skip: not tenant-scoped — |||||||||
| Plan | Plan | camelCase | YES | YES | — | — | skip |
| Promo | Promo | camelCase | YES | YES | — | — | skip |
| NotificationTemplate | NotificationTemplate | camelCase | YES | YES | — | — | skip |
| NotificationEmailConfig | NotificationEmailConfig | camelCase | YES | YES | — | — | skip |
| CarrierCatalogMeta | carrier_catalog_meta | snake_case | NO | NO | — | — | skip |
| — Skip: append-only / own audit semantics — |||||||||
| NotificationLog | NotificationLog | camelCase | YES | YES | — | — | skip |
| NotificationSendLog | NotificationSendLog | camelCase | YES | YES | — | — | skip |
| DispatchOverrideAudit | DispatchOverrideAudit | camelCase | YES | NO | — | — | skip |
| AuditLog | audit_log | snake_case | YES (created_at) | NO | — | — | skip |
| AppEvent | AppEvent | camelCase | YES | NO | — | — | skip |
| AutomationRun | AutomationRun | camelCase | NO | NO | — | — | skip |
| DriverPayAuditLog | driver_pay_audit_logs | snake_case | YES | YES | — | — | skip |
| PlaybookNotification | PlaybookNotification | camelCase | YES | NO | — | — | skip |
| — Skip: system-only (no tenantId) — |||||||||
| Plan | Plan | camelCase | YES | YES | — | — | skip |
| Promo | Promo | camelCase | YES | YES | — | — | skip |

**† "Missing Count" for models that intentionally have no `updatedAt` (append-only / immutable records) counts only the missing FK columns.**

### Drift findings

- **`carrier_compliance_alert_log`** — exists in the live database with `created_at` column but has NO corresponding Prisma model in `schema.prisma`. This table was likely created directly via SQL migration and was never added to Prisma. It is not tenant-scoped via FK and should be excluded from the rollout.
- **`_prisma_migrations`** — system table, excluded.
- **`DocFeedback`** — present in both Prisma and DB with `createdAt` (no `updatedAt`). Tenant-scoped but low-value for audit trail. Recommend skip.
- **`SysAdminInvoiceItem`** — DB shows `createdAt`/`updatedAt` as **nullable** (`is_nullable: YES`) — the only camelCase table where these are nullable. Prisma schema declares them as non-nullable. This is a drift: DB schema diverged from Prisma declaration. Flag for review.
- **`ActivationProgress`** — tenant-scoped (one-per-tenant singleton). DB has `createdAt`/`updatedAt` only. Low value for `created_by_id` (created by system during tenant provisioning, not by a user action).
- **`Subscription`** — tenant-scoped but managed by Stripe/system logic. `created_by_id` would be meaningless here (system-created).
- **`AutomationRun`** — has no `createdAt` or `updatedAt` in the DB (only `firedAt`). This is an event log table; skip.
- **`TenantMetricsDaily`** and **`TenantHealthScore`** — no audit columns in DB. System-computed, not user-driven. Skip.

---

## Section 2 — User reference shape

- **Users table:** `User` (Prisma model) — no `@@map`, so Postgres table name is also `"User"` (PascalCase, quoted). DB confirmed: table `User` exists in `information_schema`.
- **PK:** `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` — UUID, generated by Postgres `gen_random_uuid()`.
- **FK declaration style (concrete examples from existing models):**

  ```prisma
  // Example 1 — from Truck model (full audit FK pattern — use this as template)
  createdById String?   @db.Uuid
  updatedById String?   @db.Uuid
  createdBy   User?     @relation(name: "TruckCreatedBy", fields: [createdById], references: [id])
  updatedBy   User?     @relation(name: "TruckUpdatedBy", fields: [updatedById], references: [id])

  // Example 2 — from Load model (same pattern, different relation names)
  createdById String?   @db.Uuid
  updatedById String?   @db.Uuid
  createdBy   User?     @relation(name: "LoadCreatedBy", fields: [createdById], references: [id])
  updatedBy   User?     @relation(name: "LoadUpdatedBy", fields: [updatedById], references: [id])

  // Example 3 — from Document model (uses uploadedBy, not createdById — different convention)
  uploadedBy  String    @db.Uuid              // NOT NULL
  uploader    User      @relation(fields: [uploadedBy], references: [id])
  ```

- **Named relation requirement:** Every additional `User` relation on a model MUST use a unique `name:` string to disambiguate. Failing to name the relation causes a Prisma schema validation error.
- **`onDelete` convention:** Existing audit FKs use NO `onDelete` clause (defaults to `Restrict` in Postgres but is handled by Prisma as `NoAction`). The pattern for optional user FKs that should survive user deletion is `onDelete: SetNull` — but the existing Truck/Route/Load/Invoice/PayrollRecord audit columns use no `onDelete` (which means Restrict). **Prompt 2 must decide**: keep Restrict (user can't be deleted if they created/updated records) or switch to SetNull (safer for user offboarding). This is a **decision flag** (see below).
- **Driver vs User:** `CarrierDriver` is a profile model linked to `User` via `userId String? @unique @map("user_id")`. For the audit trail "who performed the action", the canonical FK target is always `User.id` (the auth identity), not `CarrierDriver.id`. The 5 existing models with `created_by_id`/`updated_by_id` all FK to `User.id` — this is the established convention.
- **Multiple user tables:** Only `User` exists. `CarrierDriver` and the legacy `DriverInvitation` are not user identity tables. No `CarrierUser` or `ExternalUser` table exists.
- **Snake_case models note:** The Carrier Operations models (mapped via `@@map`) and Driver Pay models use `created_by` (raw UUID String, no FK relation declared in Prisma — just a bare `@db.Uuid` field). These should be upgraded to proper FK relations in Prompt 2.

---

## Section 3 — Detail-page inventory

Pages under `(owner)`, `(driver)`, `(admin)` with a dynamic segment (`[id]`, `[slug]`, etc.) that display a single application record. Documentation pages (`/admin/docs/**`) and public pages excluded.

| Route | File Path | Prisma Model | Timestamps Shown? | Component Type |
|---|---|---|---|---|
| /owner/loads/[id] | apps/web/src/app/(owner)/loads/[id]/page.tsx | Load | YES — createdAt displayed; "Created by" label present | Server |
| /owner/routes/[id] | apps/web/src/app/(owner)/routes/[id]/page.tsx | Route | YES — createdAt + updatedAt displayed; "Created by" label present | Server |
| /owner/trucks/[id] | apps/web/src/app/(owner)/trucks/[id]/page.tsx | Truck | YES — createdAt + updatedAt displayed | Server |
| /owner/invoices/[id] | apps/web/src/app/(owner)/invoices/[id]/page.tsx | Invoice | YES — createdAt displayed; "Created by" label present | Server |
| /owner/payroll/[id] | apps/web/src/app/(owner)/payroll/[id]/page.tsx | PayrollRecord | YES — createdAt + updatedAt displayed; "Created by" label present | Server |
| /owner/crm/[id] | apps/web/src/app/(owner)/crm/[id]/page.tsx | Customer | NO — no row-level created/updated shown | Server |
| /owner/support/[id] | apps/web/src/app/(owner)/support/[id]/page.tsx | SupportTicket | YES — ticket.createdAt displayed | Server |
| /owner/carrier/clients/[id] | apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx | CarrierClient | NO — no audit timestamps shown | Server (thin wrapper, client component inside) |
| /owner/carrier/contracts/[id] | apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx | CarrierContract | NO | Server (thin wrapper) |
| /owner/carrier/facilities/[id] | apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx | CarrierFacility | NO | Server |
| /owner/carrier/templates/[id] | apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx | RouteTemplate | NO | Server |
| /owner/carrier/fleet/trucks/[id] | apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx | CarrierTruck | NO — shows license/insurance expiry dates, not audit timestamps | Server |
| /owner/carrier/fleet/drivers/[id] | apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx | CarrierDriver | NO — shows CDL expiry only | Server |
| /owner/carrier/dispatches/[id] | apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx | CarrierDispatch | PARTIAL — createdAt serialized to ISO string for client, not displayed prominently | Server |
| /owner/carrier/stops/[id] | apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx | CarrierStop | NO — shows appointment times, not audit timestamps | Server |
| /owner/carrier/loads/[id] | apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx | CarrierLoad | PARTIAL — createdAt serialized, not prominently displayed | Server |
| /owner/carrier/driver-pay/settlements/[settlementId] | apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx | DriverSettlement | PARTIAL — createdAt serialized, not displayed in UI | Server |
| /owner/carrier/driver-pay/reports/[driverId] | apps/web/src/app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx | CarrierDriver (driver summary) | NO | Server |
| /owner/checklists/instances/[id] | apps/web/src/app/(owner)/checklists/instances/[id]/page.tsx | PlaybookInstance | UNKNOWN — thin server shell, delegates to `ChecklistDetailClient` (Client Component) | Hybrid (Server shell + Client) |
| /owner/help/[slug] | apps/web/src/app/(owner)/help/[slug]/page.tsx | Not a DB record — static help content | N/A — exclude | Server |
| /driver/my-tickets/[id] | apps/web/src/app/(driver)/my-tickets/[id]/page.tsx | SupportTicket | YES — ticket.createdAt displayed | Server |
| /driver/tasks/[id] | apps/web/src/app/(driver)/tasks/[id]/page.tsx | StepInstance | NO — shows dueDate, not audit timestamps | Server |
| /driver/pay/settlements/[id] | apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx | DriverSettlement | PARTIAL — delegates to DriverSettlementDetailView client component | Hybrid |
| /admin/billing/[id] | apps/web/src/app/(admin)/billing/[id]/page.tsx | SysAdminInvoice | NO — no audit timestamps shown | Server |
| /admin/tenants/[id] | apps/web/src/app/(admin)/tenants/[id]/page.tsx | Tenant | YES — tenant.createdAt + ownerUser.createdAt displayed | Server |
| /admin/automations/[ruleId] | apps/web/src/app/(admin)/automations/[ruleId]/page.tsx | AutomationRule | NO | Server |
| /admin/plans/[id] | apps/web/src/app/(admin)/plans/[id]/page.tsx | Plan | NO | Server |
| /admin/docs/features/[slug] | apps/web/src/app/(admin)/docs/features/[slug]/page.tsx | Not a DB record — MDX docs | EXCLUDE | Server |
| /admin/docs/operations/[slug] | apps/web/src/app/(admin)/docs/operations/[slug]/page.tsx | Not a DB record — MDX docs | EXCLUDE | Server |
| /admin/docs/database/[model] | apps/web/src/app/(admin)/docs/database/[model]/page.tsx | Not a DB record — schema introspection | EXCLUDE | Server |

**Total application record detail pages: 27 (excluding 3 doc/help pages)**
- Owner portal: 19 (including 1 help page excluded = 18 real record pages)
- Driver portal: 3
- Admin portal: 4 (excluding 3 doc pages = 4 real record pages)
- No `(shared)` detail pages exist.

---

## Section 4 — Session / current-user availability in server context

- **Server helper:** `getSession()` — exported from `apps/web/src/lib/auth/supabase.ts`
- **Returned shape:**
  ```ts
  interface SessionData {
    userId: string;       // ← Supabase Auth UUID — matches User.id directly
    email: string;
    role: string;         // 'OWNER' | 'MANAGER' | 'DRIVER'
    tenantId: string;     // UUID string
    firstName?: string;
    lastName?: string;
    isSystemAdmin?: boolean;
    permissions?: UserPermissions;
  }
  ```
- **`user.id` ↔ `User.id` match:** YES — `getSession()` returns `userId: user.id` where `user` is the Supabase Auth user. The `User` model in Prisma uses `@default(dbgenerated("gen_random_uuid()"))` but the ID is set during auth signup to match the Supabase Auth UUID. All existing audit FK writes (e.g. `Truck.createdById = session.userId`) confirm this match is already relied upon in production.
- **`getSession()` is cached:** Uses `React.cache()` — all callers within the same server request share the same result. Zero extra database calls needed to get `userId` for audit FK writes.
- **Additional helpers:**
  - `requireAuth()` — calls `getSession()`, throws if not authenticated, returns `session.userId` directly. Safe to use as `createdById` value.
  - `getCurrentUser()` — performs a DB lookup (Prisma `user.findUnique`). Avoid in hot paths; prefer `getSession().userId` for audit FK writes.
- **Security claim location:** Role, tenantId, isSystemAdmin, and permissions are read from `app_metadata` (admin-only, tamper-proof). Display fields (firstName, lastName) from `user_metadata`. Migrated to `app_metadata` in Phase 37.6.
- **Existing Prisma extensions / middleware:**
  - `withTenantRLS(tenantId)` — defined in `apps/web/src/lib/db/extensions/tenant-rls.ts`. This is a `Prisma.defineExtension` that intercepts all queries via `$extends` and injects `tenantId` into every write/read operation. This is the primary tenant isolation mechanism.
  - **Important for Prompt 2:** The tenant RLS extension does NOT currently inject `createdById` or `updatedById`. Prompt 2 will need to add audit FK injection here — either by extending `withTenantRLS` to also accept `userId` and inject it on `create`/`update` operations, OR by adding a separate `withAuditColumns(userId)` extension that composes with `withTenantRLS`.
  - `getTenantPrisma()` — defined in `apps/web/src/lib/context/tenant-context.ts`. Creates the extended Prisma client with tenant scoping. Prompt 2's audit-column middleware should be wired at this level.
  - No Prisma middleware (old-style `$use()`) in use — only the newer `$extends()` pattern. 

---

## Section 5 — Edge cases to flag

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

**Casing rule:** Never mix conventions within a table. New columns on camelCase tables → `createdById`/`updatedById`. New columns on snake_case tables → `@map("created_by")`/`@map("updated_by")`.

---

## Section 6 — Recommended migration ordering

### Grouping strategy
**3 grouped migrations by domain** (not one mega-migration) to reduce DDL lock surface and enable independent rollback. Each migration is `ADD COLUMN IF NOT EXISTS ... DEFAULT NULL` (no NOT NULL constraint, no backfill — per the locked Option B1 decision).

### Group 1: Core fleet domain (start here — lowest risk, highest visibility)
Smoke test first on 2 small low-write tables:

**Smoke test (2 tables):**
1. `Tag` — 0 rows (empty in prod). camelCase. Add `createdById`/`updatedById`.
2. `ExpenseCategory` — ~5 rows (seed data). camelCase. Add `createdById`/`updatedById`.

**Full Group 1 after smoke test passes:**
- `Truck` — already complete (0 changes needed)
- `Route` — already complete (0 changes needed)
- `Load` — already complete (0 changes needed)
- `RouteStop` — add `createdById`/`updatedById` (camelCase)
- `DriverRouteJoin` — add `createdById`/`updatedById` (camelCase)
- `MaintenanceEvent` — add `createdById`/`updatedById` (camelCase)
- `ScheduledService` — add `createdById`/`updatedById` (camelCase)
- `DriverHOSEntry` — add `createdById`/`updatedById` (camelCase)
- `DriverIncident` — add `createdById`/`updatedById` (camelCase)
- `Document` — decision needed: skip (uploadedBy exists) or add redundant audit cols
- `RouteExpense` — add `createdById`/`updatedById` (camelCase)
- `RoutePayment` — add `createdById`/`updatedById` (camelCase)
- `ExpenseTemplate` — add `createdById`/`updatedById` (camelCase)
- `ExpenseTemplateItem` — add `createdAt`/`updatedAt`/`createdById`/`updatedById` (camelCase; missing all 4)

### Group 2: Finance + CRM domain
- `Invoice` — already complete (0 changes needed)
- `InvoiceItem` — add `createdAt`/`updatedAt`/`createdById`/`updatedById` (camelCase; missing all 4)
- `PayrollRecord` — already complete (0 changes needed)
- `SysAdminInvoice` — add `createdById`/`updatedById` (camelCase); fix nullable drift first
- `SysAdminInvoiceItem` — fix nullable createdAt/updatedAt → NOT NULL; add `createdById`/`updatedById`
- `Customer` — add `createdById`/`updatedById` (camelCase)
- `CustomerInteraction` — normalize existing `createdBy` bare UUID to FK; add `updatedAt`/`updatedById`
- `TenantIntegration` — add `createdById`/`updatedById` (camelCase)
- `Tag` — add `createdById`/`updatedById` (smoke test table)

### Group 3: Carrier Operations + Driver Pay domain (snake_case tables)
This group is the largest and most complex due to the bare-UUID `created_by` pattern already in place on Driver Pay models.

**Carrier Operations (add `created_by_id`/`updated_by_id` FK + relation):**
- `clients` (CarrierClient) — add `created_by` UUID + relation `@map("created_by_id")`
- `contracts` (CarrierContract)
- `facilities` (CarrierFacility)
- `carrier_drivers` (CarrierDriver) — add `updated_by` (created_by exists as bare UUID in Prisma already)
- `carrier_trucks` (CarrierTruck)
- `route_templates` (RouteTemplate)
- `dispatches` (CarrierDispatch)
- `loads` (CarrierLoad)
- `stops` (CarrierStop)

**Driver Pay (upgrade existing bare `created_by` to FK + add `updated_by`):**
- `driver_compensation_templates` — already has `created_by` (NOT NULL), add `updated_by`
- `load_driver_assignments` — already has `created_by`, add `updated_by`
- `load_pay_components` — already has `created_by`, add `updated_by`
- `driver_bonuses` — already has `created_by`, add `updated_by`
- `driver_deductions` — already has `created_by`, add `updated_by`
- `driver_settlements` — already has `created_by`, add `updated_by`
- `driver_disputes` — already has `created_by`, add `updated_by`
- `pay_component_attachments` — already has `created_by`, add `updated_by`

### Largest tables (row counts from pg_stat_user_tables, 2026-05-16)

| Table | Estimated Rows | Backfill Concern? |
|---|---|---|
| PlaybookStep | 349 | No — legacy NULL per B1 |
| StepTemplate | 341 | No |
| GPSLocation | 267 | Skip — append-only |
| stops (CarrierStop) | 224 | No |
| loads (CarrierLoad) | 123 | No |
| in_app_notifications | 121 | Skip — append-only |
| TenantNotificationSettings | 114 | Not in scope |
| dispatches (CarrierDispatch) | 101 | No |
| NotificationLog | 54 | Skip — append-only |
| Playbook | 51 | No |

Row counts are very low (max 349) — DDL lock duration is negligible. No batching required. All migrations can run as standard `ALTER TABLE ADD COLUMN IF NOT EXISTS ... DEFAULT NULL`.

Per the locked decision (option B1): legacy rows stay NULL — no backfill. Row counts are informational only for DDL lock estimation.

---

## Recommended scope for Prompt 2

Add the following columns to the 37 tables listed below, in the order specified, in three grouped migrations. For camelCase tables: add `createdById UUID NULL REFERENCES "User"(id) ON DELETE RESTRICT` and `updatedById UUID NULL REFERENCES "User"(id) ON DELETE RESTRICT`, plus corresponding Prisma relation fields using the existing named-relation pattern (e.g. `@relation(name: "TagCreatedBy", fields: [createdById], references: [id])`). For snake_case tables: add `created_by_id UUID NULL REFERENCES "User"(id) ON DELETE RESTRICT` and `updated_by_id UUID NULL REFERENCES "User"(id) ON DELETE RESTRICT` using `@map("created_by_id")`/`@map("updated_by_id")` in Prisma (exception: Driver Pay models already have a non-null `created_by` column — for these, add only `updated_by UUID NULL` and upgrade the existing `created_by` field to a proper Prisma FK relation without a new migration column). For tables missing `createdAt`/`updatedAt` entirely (`InvoiceItem`, `ExpenseTemplateItem`), add `createdAt TIMESTAMPTZ NOT NULL DEFAULT now()` and `updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()` before the FK columns. Execute in this order: **(1) Smoke test:** `Tag`, `ExpenseCategory`; **(2) Group 1 fleet:** `RouteStop`, `DriverRouteJoin`, `MaintenanceEvent`, `ScheduledService`, `DriverHOSEntry`, `DriverIncident`, `RouteExpense`, `RoutePayment`, `ExpenseTemplate`, `ExpenseTemplateItem`; **(3) Group 2 finance/CRM:** `InvoiceItem`, `SysAdminInvoice`, `SysAdminInvoiceItem`, `Customer`, `CustomerInteraction`, `TenantIntegration`; **(4) Group 3 carrier/driver-pay:** `clients`, `contracts`, `facilities`, `carrier_drivers`, `carrier_trucks`, `route_templates`, `dispatches`, `loads` (carrier), `stops` (carrier), `driver_compensation_templates`, `load_driver_assignments`, `load_pay_components`, `driver_bonuses`, `driver_deductions`, `driver_settlements`, `driver_disputes`, `pay_component_attachments`. After migration: extend `withTenantRLS` (or add a composing `withAuditColumns(userId)` extension) in `apps/web/src/lib/db/extensions/tenant-rls.ts` to inject `createdById`/`updatedById` on `create` operations and `updatedById` on `update` operations, reading `userId` from the authenticated session.

---

## Decision flags — items needing user input before Prompt 2

- [ ] **Flag 1 — `onDelete` behavior for audit FKs:** Existing models (`Truck`, `Route`, `Load`, `Invoice`, `PayrollRecord`) use NO `onDelete` on `createdById`/`updatedById` (defaults to Restrict — users cannot be deleted if they created/updated records). Should new audit FKs also use Restrict, or switch to `onDelete: SetNull` (safer for user offboarding)? Recommend `SetNull` for all new FKs for consistency with user lifecycle management.
- [ ] **Flag 2 — `Document.uploadedBy` vs `created_by_id`:** The `Document` model already has `uploadedBy String @db.Uuid` (NOT NULL) as the creation actor FK. Add a redundant `createdById`/`updatedById` pair, OR accept `uploadedBy` as the canonical audit column for this model? Recommend: skip `Document` for the FK rollout — `uploadedBy` already fills this role.
- [ ] **Flag 3 — `FleetMessage.senderId` vs `created_by_id`:** `FleetMessage` already has `senderId String @db.Uuid` (NOT NULL) as the author. Add redundant `created_by_id`, OR skip? Recommend: skip.
- [ ] **Flag 4 — Driver Pay `created_by` NOT NULL constraint:** All Driver Pay models (`driver_compensation_templates`, `load_driver_assignments`, etc.) have `created_by STRING NOT NULL @db.Uuid` — a bare UUID with no FK constraint. Prompt 2 will add the FK `REFERENCES "User"(id)` as a new constraint. This requires all existing `created_by` values to be valid `User.id` values, or the migration will fail. Verify data integrity first: `SELECT DISTINCT created_by FROM driver_compensation_templates WHERE created_by NOT IN (SELECT id FROM "User")`.
- [ ] **Flag 5 — `SysAdminInvoiceItem` nullable drift:** DB shows `createdAt`/`updatedAt` are `is_nullable: YES` for this table, but Prisma schema declares them NOT NULL. Fix drift direction: (a) `ALTER TABLE "SysAdminInvoiceItem" ALTER COLUMN "createdAt" SET NOT NULL` + `ALTER COLUMN "updatedAt" SET NOT NULL` (requires all rows to have values), or (b) update Prisma schema to match DB as nullable. Resolve before adding audit FKs.
- [ ] **Flag 6 — `Tenant` model:** Should `Tenant` itself get `createdById`/`updatedById`? The creation actor would be the system (no user session at provisioning time). Recommend: skip for now.
- [ ] **Flag 7 — Audit FK injection via extension vs explicit writes:** Should `createdById`/`updatedById` be auto-injected by extending `withTenantRLS` (centralized, automatic), or should each server action write them explicitly (transparent, debuggable)? Centralized injection is cleaner but requires the extension to receive `userId` as a parameter alongside `tenantId`. Recommend: extend `withAuditColumns(userId)` as a separate composable extension that composes with `withTenantRLS`.
- [ ] **Flag 8 — `PlaybookStep`, `StepInstance`, `RouteDriver`, `PushToken`, `UserNotificationPreference`, `SysAdminInvoiceItem` already have bare `createdBy`/`updatedBy` UUID fields (snake_case raw):** These were added in quick-327 as bare UUIDs with no FK relation. Prompt 2 should upgrade these to proper FK relations. Confirm this is desired scope.

---

## Self-Check: PASSED

- SUMMARY.md exists at `.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md`
- All six sections present and populated
- Section 1 sorted by missing-column count (descending: 4 → 2 → 1 → 0)
- Section 3 contains all 27 real-record detail pages found via Glob
- Section 4 names `getSession()` with exact return type shape
- Section 6 contains concrete table-by-table grouping
- Live DB queried via `information_schema.columns` (not schema.prisma alone)
- No application source files modified; no migrations created; no DDL executed
- Route-group mismatch (brief said `(carrier)`, codebase uses `(owner)`) explicitly noted
