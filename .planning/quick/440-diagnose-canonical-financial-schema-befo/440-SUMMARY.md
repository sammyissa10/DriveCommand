---
phase: quick-440
plan: 440
type: diagnostic
date: 2026-06-15
scope: read-only
builds_on: 439-SUMMARY.md
subsystem: financials
tags: [schema, rls, kpi, invoice, expenses, payments, carrier-financials]
key_links:
  - from: 440-SUMMARY.md
    to: 439-SUMMARY.md
    via: builds on prior model/code/UI audit — does not repeat its tables
---

# Quick Task 440 — Canonical Financial Schema Diagnostic

**Date:** 2026-06-15
**Scope:** Read-only investigation — 5 schema decisions that block the /carrier/financials build
**Builds on:** 439-SUMMARY.md (model/code/UI audit; two parallel systems identified)

---

## Background (from 439)

Quick Task 439 established that two financial systems exist in parallel:

- **Route-legacy:** `RouteExpense` / `RoutePayment` / `PayrollRecord` — tenant FK = `tenantId`, entity FK = `routeId`, no `loadId`. Full CRUD server actions, embedded in `/routes/[id]` UI.
- **Load-centric carrier system:** `CarrierLoad` / `CarrierExpense` / `DriverPayRecord` — tenant FK = `orgId`, entity FKs include `loadId?`. REST API routes, backs KPI dashboard and profit-per-load reports.
- **`Invoice`** has both `routeId?` and `loadId?` optional columns; Prisma `load` relation exists, no Prisma `route` relation — effectively Load-centric.

This task goes deeper on the five specific schema decisions that block the build.

---

## Q1 — Invoice Model: Actively Used and Load-Centric?

**Schema FKs (schema.prisma):**

| Column | Line | Optional? | Prisma Relation |
|--------|------|-----------|-----------------|
| `tenantId` | 1046 | No | `Tenant` |
| `routeId` | 1048 | Yes (`?`) | None — bare column, no Prisma relation object |
| `loadId` | 1049 | Yes (`?`) | `Load?` relation (line 1075) |
| `@@index([loadId])` | 1082 | — | — |
| `@@unique([tenantId, invoiceNumber])` | 1078 | — | — |

`routeId` is a bare nullable column with no Prisma `route` relation. `loadId` has both index and Prisma relation. This makes Invoice structurally Load-centric despite carrying a legacy `routeId` column.

**Invoice is actively used — citations:**

- Create action: `(owner)/actions/invoices.ts:80` — `prisma.invoice.create(...)`, scoped via `getTenantPrisma()` (line 58). Accepts both `routeId` (line 84) and `loadId` (line 85) from form; both are nullable. The create form sends whichever FK is filled in from the invoice new page.
- Update action: `(owner)/actions/invoices.ts:194` — `tx.invoiceItem.deleteMany(...)` + `tx.invoice.update(...)` inside `prisma.$transaction`.
- markPaid action: `(owner)/actions/invoices.ts:251–276` — checks `status === 'SENT'`, then sets `status = PAID` and `paidDate = new Date()`.
- Delete action: `(owner)/actions/invoices.ts:282–305` — soft-archives DRAFT invoices via `archivedAt: new Date()`.
- List UI: `(owner)/invoices/page.tsx:16–29` — `prisma.invoice.findMany({ where: { archivedAt: null } })`, `prisma.invoice.count(...)`, `prisma.invoice.groupBy({ by: ['status'], _count: true, _sum: { totalAmount: true } })`. All via `getTenantPrisma()` (line 7).
- Stats derived from `groupBy`: lines 36–44 treat `OVERDUE` + `SENT` as outstanding, `PAID` as paid total.

**Verdict:** Invoice is **actively used** and **Load-centric in practice**. The `load` Prisma relation (schema.prisma:1075) enables `include: { load: ... }` queries that Route-legacy tables cannot. The `routeId` column is legacy scaffolding with no live Prisma relation — it is never queried or filtered on in any current action or UI.

---

## Q2 — Expenses: RouteExpense vs CarrierExpense

**Side-by-side field comparison:**

| Field | RouteExpense | CarrierExpense |
|-------|-------------|----------------|
| Tenant FK | `tenantId` String (line 836) | `orgId` String (line 2444) |
| Primary entity FK | `routeId` String — required, NOT NULL (line 837) | `loadId?` optional (line 2430), `dispatchId?` optional (line 2429) |
| Load linkage | None — no `loadId` column | Direct `loadId?` FK + `CarrierLoad` relation (line 2453) |
| Driver linkage | None | `driverId?` FK (line 2437) → `CarrierDriver` |
| Category | `categoryId` FK → `ExpenseCategory` (line 838) | `expenseType` String free-text (line 2433) |
| Money | `amount Decimal(10,2)` (line 839) | `amount Decimal(10,2)` (line 2434) + `currency String` (line 2435) |
| Approval fields | None | `approvedBy?` + `approvedAt?` (lines 2440–2441) |
| Receipt attachment | None | `receiptDocumentId?` FK → `CarrierDocument` (line 2438) |
| Reimbursable flag | None | `reimbursable Boolean` (line 2442) |
| Soft delete | `deletedAt DateTime?` (line 842) | None — hard delete only |
| Table name | `"RouteExpense"` (PascalCase, default) | `"carrier_expenses"` (snake_case, @map line 2465) |

**What each is MISSING for a load-centric financials UI:**

- `RouteExpense` is missing: `loadId` FK (cannot query by load), `orgId` (incompatible tenant FK), approval workflow, receipt attachments, currency, reimbursable flag. Cannot be queried in a load-centric page without a migration adding `loadId` — this is a Rule 4 architectural change.
- `CarrierExpense` is missing: a standalone owner-portal UI page. The API routes exist (`api/v1/carrier/expenses/route.ts:24–45` for GET, `:47–73` for POST) and the business logic is in `lib/carrier/expenses.ts:35–61` (`listExpenses`) and `:85–165` (`createExpense`). But no `/carrier/expenses` or `/carrier/financials` page exists.

**Canonical pick:** `CarrierExpense` is canonical for `/carrier/financials` expenses. All the backend infrastructure exists (API, business logic, orgId-scoped queries via `listExpenses(orgId, filters)` at `lib/carrier/expenses.ts:35`). The gap to close is building the UI only — no new model or API work required.

---

## Q3 — Payments: RoutePayment vs Invoice.paidDate

**RoutePayment (schema.prisma:895–918):**

- Tenant FK: `tenantId` (line 897)
- Entity FK: `routeId` String required NOT NULL (line 898) — no `loadId` column
- Money: `amount Decimal(10,2)` (line 899)
- Status: `PaymentStatus` enum — `PENDING` / `PAID` (line 900)
- Timestamps: `paidAt DateTime?` (line 901), `deletedAt DateTime?` (line 903)
- Read code: `(owner)/actions/payments.ts:76` (create), `:163` (update), `:236` (list)
- UI: embedded in `/routes/[id]` route detail page (`route-page-client.tsx:330`)

**Invoice payment approach (schema.prisma:1044–1085):**

- Columns: `status InvoiceStatus` (line 1054) + `paidDate DateTime?` (line 1057)
- `InvoiceStatus` enum: `DRAFT | SENT | PAID | OVERDUE | CANCELLED` (lines 1014–1020)
- Reachable via `loadId` FK (line 1049) — can JOIN or filter by load
- Read code: `markInvoicePaid` action at `(owner)/actions/invoices.ts:248` sets `status = PAID` + `paidDate = new Date()`

**Comparison:**

| Dimension | RoutePayment | Invoice.paidDate |
|-----------|-------------|-----------------|
| Load-queryable? | No — routeId only | Yes — `@@index([loadId])` at schema:1082 |
| Tenant FK | `tenantId` | `tenantId` |
| Payment tracking granularity | Separate record per payment | Single date + status on the invoice |
| Status tracking | `PENDING` / `PAID` enum | `DRAFT / SENT / PAID / OVERDUE / CANCELLED` |
| Amount tracked | Yes — `amount` field | Yes — `totalAmount` field |

**Canonical pick:** `Invoice.paidDate` + `status = PAID` is the canonical payment-tracking approach for a load-centric financials UI. `RoutePayment` is blocked by its `routeId` FK — it cannot be queried by load. `Invoice` already has `@@index([loadId])` and a proven `markInvoicePaid` action. The financials page should surface `Invoice` records with `status IN (SENT, OVERDUE)` as outstanding and `status = PAID` as collected — consistent with how `/invoices/page.tsx:39–44` already computes these stats.

---

## Q4 — KPI Reconciliation Spec

**Current `openInvoices` query in kpi/route.ts:46–51:**

```
tenantPrisma.carrierLoad.count({
  where: {
    orgId,
    isSample: false,
    status: 'invoiced',
  },
})
```

This counts `CarrierLoad` rows with `status = 'invoiced'` — it never touches the `Invoice` model. It is counting loads that have been marked invoiced in the carrier dispatch system, not actual Invoice records created by owners.

**What the Invoice model provides instead:**

The `InvoiceStatus` enum (schema.prisma:1014–1020) has five values: `DRAFT`, `SENT`, `PAID`, `OVERDUE`, `CANCELLED`. "Open" in accounts-receivable terms means sent-but-unpaid: `SENT` + `OVERDUE`. `DRAFT` = not yet sent (excluded). `PAID` = collected (excluded). `CANCELLED` = voided (excluded).

**Exact query shape to adopt (no code written — spec only):**

The `prisma.invoice.groupBy` pattern in `(owner)/invoices/page.tsx:23–28` is the proven query shape:

```
prisma.invoice.groupBy({
  by: ['status'],
  where: { archivedAt: null },
  _count: true,
  _sum: { totalAmount: true },
})
```

From the groupBy result: Open Invoice **count** = `SENT._count + OVERDUE._count`. Open Invoice **amount** = `SENT._sum.totalAmount + OVERDUE._sum.totalAmount`. The KPI could expose either or both — count alone suffices for the dashboard tile.

**The orgId-vs-tenantId prerequisite (hard blocker):**

`kpi/route.ts` extracts the tenant as `orgId = session.tenantId` (line 19) and passes it to `tenantPrisma.carrierLoad.count({ where: { orgId, ... } })` (line 33). `CarrierLoad` uses `orgId` as its tenant column (schema.prisma:2444 equivalent for CarrierLoad).

`Invoice` uses `tenantId` as its tenant column (schema.prisma:1046). The `getTenantPrisma()` call at `kpi/route.ts:31` sets `app.current_tenant_id` via GUC (tenant-context.ts:54–56), which is what the RLS `tenant_isolation_policy` on `Invoice` reads via `current_tenant_id()`. This means **RLS automatically enforces tenant isolation on Invoice queries through getTenantPrisma** — the GUC mechanism provides the scoping.

However, the explicit `where: { orgId, ... }` application-level filter used for CarrierLoad queries **does not exist on Invoice** (Invoice has `tenantId` not `orgId`). When the KPI route queries Invoice, it must NOT pass `orgId` in the where clause — it must rely solely on the GUC-backed RLS policy. This is safe only if `getTenantPrisma()` has already set `app.current_tenant_id` before the Invoice query runs.

**Prerequisite to resolve before the KPI swap:**

The `session.tenantId` value used as `orgId` in `kpi/route.ts:19` is the same UUID that gets set as `app.current_tenant_id` in `getTenantPrisma()`. Both `CarrierLoad.orgId` and `Invoice.tenantId` reference `Tenant.id` — they are the same UUID for any given tenant. The values are identical; only the column name differs. The KPI route already calls `getTenantPrisma()` at line 31 which sets the GUC. Therefore: a query against `Invoice` without an explicit `tenantId` where clause will be correctly scoped by RLS — **as long as it runs on the same Prisma client returned by `getTenantPrisma()`**, which it will.

**The swap is safe with one explicit guard:** use `where: { archivedAt: null }` (not `tenantId`) in the Invoice query inside the KPI route, exactly as the invoices page does. Do NOT add `where: { tenantId: orgId }` — the RLS policy handles it, and mixing column-name conventions would add fragility.

---

## Q5 — Tenant Scoping and RLS Coverage

**Load-centric tables — getTenantPrisma correctness:**

- `CarrierExpense`: `lib/carrier/expenses.ts:35–61` (`listExpenses`) builds `where: { orgId, ... }` (line 40–46) and calls `tenantPrisma.carrierExpense.findMany({ where })` (line 49). The `getTenantPrisma()` call is at line 36. Explicit `orgId` filter + RLS GUC = double-scoped.
- `DriverPayRecord`: `api/v1/carrier/pay-records/route.ts:22–34` builds `where: { orgId, ... }` (line 23) and calls `tenantPrisma.driverPayRecord.findMany({ where })` (line 38). The `getTenantPrisma()` call is at line 36. Same double-scoped pattern.
- `CarrierLoad` KPI queries: `kpi/route.ts:31–51` — `getTenantPrisma()` at line 31, explicit `orgId` filter at lines 35, 42, 48.

All three Load-centric tables are correctly double-scoped: explicit `orgId` application-level filter plus RLS GUC enforcement from `getTenantPrisma()`.

**Legacy tenantId-scoped tables — Phase 1 grant migration coverage:**

Migration `20260602000001_phase1_grant_app_user_dml/migration.sql` grants `SELECT, INSERT, UPDATE, DELETE` to `app_user` on:

- `"Invoice"` — line 50 of migration
- `"InvoiceItem"` — line 51 of migration
- `"RouteExpense"` — line 64 of migration
- `"RoutePayment"` — line 65 of migration
- `"PayrollRecord"` — line 59 of migration

All five legacy financial tables have full DML grants in the Phase 1 migration.

**RLS policy coverage for legacy tables:**

- `RouteExpense`: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `tenant_isolation_policy` + `bypass_rls_policy` — migration `20260216223252_add_route_finance_models/migration.sql:167–175`.
- `RoutePayment`: same RLS stack — migration `20260216223252_add_route_finance_models/migration.sql:199–207`.
- `Invoice`: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `tenant_isolation_policy` + `bypass_rls_policy` — migration `20260218000002_add_crm_invoice_payroll_models/migration.sql:218–226`.
- `PayrollRecord`: same RLS stack — migration `20260218000002_add_crm_invoice_payroll_models/migration.sql:234–242`.
- `InvoiceItem`: RLS + FORCE RLS + policies added in migration `20260226000002_add_rls_missing_tables/migration.sql` (that migration's comment: "Add missing RLS policies to NotificationLog, InvoiceItem, and ExpenseTemplateItem").

**RLS allowlist (Section 4.12) — not a gap:**

The Phase 1 migration comment (lines 15–23) explicitly lists the Section 4.12 allowlist: `Plan`, `Promo`, `carrier_catalog_meta`, `NotificationTemplate`, `NotificationEmailConfig`, `grid_preference`, `grid_view`. None of the financial tables appear on this allowlist — they are all FORCE-RLS protected.

**Gap status:**

No unprotected gap exists for the five legacy financial tables. All have FORCE RLS + tenant policies + Phase 1 DML grants. The Load-centric tables have `orgId` application-layer filtering + GUC RLS.

**Is the orgId vs tenantId split a blocker for a unified query layer?**

Yes, but only at the application-filter level, not the RLS level. Both `Invoice.tenantId` and `CarrierLoad.orgId` hold the same UUID (`Tenant.id`). The `getTenantPrisma()` GUC sets `app.current_tenant_id` to this value, which the RLS policies on all tables read. A single financials page can query both systems through the same `getTenantPrisma()` client safely.

The blocker is that code currently applies explicit `where: { orgId }` filters to CarrierLoad/CarrierExpense/DriverPayRecord queries (correct for those tables) but must NOT apply `where: { orgId }` to Invoice/RouteExpense/RoutePayment queries (which have `tenantId` column, not `orgId`). Any financials aggregation route that mixes both systems must use the correct column name per model — or rely solely on RLS without explicit tenant filter. This is a code discipline issue, not a schema blocker.

---

## CANONICAL DECISION

**The canonical financial data layer for `/carrier/financials` is:**

`CarrierLoad` + `CarrierExpense` + `DriverPayRecord` + `Invoice` (via `loadId` FK)

**Load-centric system is canonical** because:
1. The KPI dashboard, profit-per-load reports, and driver pay approval are all already load-centric.
2. `CarrierExpense` has approval workflow, receipt attachments, reimbursable tracking — feature superset of RouteExpense.
3. `Invoice.loadId` with `@@index([loadId])` enables load-level invoice aggregation.
4. `DriverPayRecord` supersedes `PayrollRecord` — it has `loadId`, `dispatchId`, `grossRevenue`, detailed pay model fields; PayrollRecord has none of these.
5. RouteExpense and RoutePayment are blocked by their `routeId` FK — they are structurally incompatible with a load-centric page.

**The single hard blocker to resolve first:**

The `orgId` vs `tenantId` column naming split across the two systems. Both hold the same UUID, but mixing them in queries requires knowing which column name to use per model. This is not a schema change — it is a code discipline rule that must be documented and enforced before the build phase writes a multi-model financials query.

---

## Ordered Pre-Build Checklist (before writing any /carrier/financials UI)

1. **Document the column-name rule** (no code change required): `CarrierLoad`, `CarrierExpense`, `DriverPayRecord` use `orgId` in explicit where clauses. `Invoice`, `InvoiceItem`, `RouteExpense`, `RoutePayment`, `PayrollRecord` do NOT get an explicit tenant filter in application code — they rely on `getTenantPrisma()` GUC + RLS. Write this as a comment at the top of the financials server action or route file.

2. **Fix the Open Invoices KPI** (single query swap, one file): Replace `tenantPrisma.carrierLoad.count({ where: { orgId, isSample: false, status: 'invoiced' } })` in `kpi/route.ts:46` with `tenantPrisma.invoice.groupBy({ by: ['status'], where: { archivedAt: null }, _count: true, _sum: { totalAmount: true } })` and derive open count as `SENT._count + OVERDUE._count`. Do NOT add `tenantId` or `orgId` to the Invoice where clause — RLS handles it. This is one quick task, estimated 15 minutes.

3. **Build the CarrierExpense standalone UI** (new page, no model/API work): `CarrierExpense` API is complete (`api/v1/carrier/expenses` + `lib/carrier/expenses.ts`). Missing: a `/carrier/financials` or `/carrier/expenses` page with list + create form. Estimated: 1 quick task (1–2 hours, UI only).

4. **Build the DriverPayRecord financials view**: The API and compute layer exist. The existing `/carrier/driver-pay/reports` page has the LoadProfitabilityReport component. The financials page can embed or link to it. No new API work.

5. **Defer RouteExpense migration**: Converting RouteExpense to be load-queryable requires a new `loadId` column, a migration, and a data backfill — Rule 4 architectural change. Not needed for the initial `/carrier/financials` build. Keep RouteExpense embedded in `/routes/[id]` where it lives today.

6. **Defer invoice email delivery**: `Invoice.status = SENT` exists but no `sendInvoice` action with email delivery is wired. The email templates exist (`emails/carrier/client-invoice-ready.tsx`, `emails/carrier/invoice-generated.tsx`). Estimated 1 quick task.

---

## Recommendation

Build `/carrier/financials` in two quick tasks: (1) swap the Open Invoices KPI to read `Invoice` — one query change in `kpi/route.ts`, zero schema changes; (2) scaffold the financials page as a server component that queries `Invoice` for outstanding/paid totals (reusing the `groupBy` from `invoices/page.tsx:23–28`), queries `DriverPayRecord` for pending pay approvals (reusing `kpi/route.ts:40–44`), and embeds or links to `LoadProfitabilityReport`. The CarrierExpense standalone expense-entry UI is a third quick task. All three use existing APIs and models with no schema changes, migrations, or architectural decisions outstanding. The orgId/tenantId column-name split is fully understood and handled by GUC RLS — it requires code discipline, not a schema fix.
