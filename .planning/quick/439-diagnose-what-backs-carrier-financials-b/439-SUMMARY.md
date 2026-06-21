# Quick Task 439 — Carrier Financials Diagnostic Report

**Date:** 2026-06-15
**Scope:** Read-only investigation — what backs a /carrier/financials page before building it

---

## 1. Prisma Model Audit

| Model | Exists? | Key FK fields | Load-centric or Route-legacy? |
|---|---|---|---|
| **ExpenseCategory** | Yes — schema.prisma:814 | `tenantId` only (no load/route FK — lookup table) | Neither — pure config |
| **RouteExpense** | Yes — schema.prisma:834 | `routeId` FK (schema:849); NO `loadId` | Route-legacy |
| **ExpenseTemplate** / **ExpenseTemplateItem** | Yes — schema.prisma:860/878 | `tenantId` only; applied via `applyTemplate(routeId)` | Route-legacy (applied to routes, not loads) |
| **RoutePayment** | Yes — schema.prisma:895 | `routeId` FK (schema:910); NO `loadId` | Route-legacy |
| **Invoice** | Yes — schema.prisma:1044 | `routeId?` (schema:1048, optional) + `loadId?` (schema:1049, optional); `@@index([loadId])` at schema:1082 | Dual: both FKs; Prisma `load` relation exists (schema:1075); no Prisma `route` relation → effectively Load-centric |
| **InvoiceItem** | Yes — schema.prisma:1087 | `invoiceId` FK (schema:1102, cascade) | Dependent on Invoice |
| **PayrollRecord** | Yes — schema.prisma:1187 | `driverId` FK (schema:1209); NO `loadId`, NO `routeId` | Neither — driver-period-centric; superseded by DriverPayRecord |
| **CarrierLoad** | Yes — schema.prisma:2245 | `orgId`, `dispatchId?`, `totalRevenue`, `rateAmount`, `fuelSurcharge` | Load-centric (new carrier system) |
| **CarrierExpense** | Yes — schema.prisma:2427 | `loadId?` FK (schema:2430), `dispatchId?`, `driverId?` | Load-centric (new carrier system) |
| **DriverPayRecord** | Yes — schema.prisma:2468 | `loadId?` FK (schema:2472), `dispatchId?`, `driverId` | Load-centric (new carrier system) |

> **Key finding:** Two parallel financial systems exist. The **legacy system** (RouteExpense, RoutePayment, PayrollRecord) is Route-centric, uses `tenantId` as tenant FK. The **carrier system** (CarrierLoad, CarrierExpense, DriverPayRecord) is Load-centric, uses `orgId` as tenant FK.

---

## 2. Read Code Audit

| Model | Server Action (file:line) | API Route (file:line) | Tenant-scoped via getTenantPrisma? |
|---|---|---|---|
| **Invoice** | `(owner)/actions/invoices.ts:58` (create), `:171` (update), `:251` (markPaid), `:285` (delete) | None in `/api/v1/carrier/` | Yes |
| **InvoiceItem** | `(owner)/actions/invoices.ts:192` (deleteMany in tx), `:218` (create in tx) | None | Yes |
| **RouteExpense** | `(owner)/actions/expenses.ts:85` (create), `:197` (update), `:251` (delete), `:279` (list) | None in `/api/v1/carrier/` | Yes |
| **ExpenseCategory** | `(owner)/actions/expense-categories.ts:50` (create), `:123` (delete), `:147` (list) | None | Yes |
| **ExpenseTemplate** | `(owner)/actions/expense-templates.ts:67` (create), `:120` (delete), `:144` (list), `:198` (apply) | None | Yes |
| **RoutePayment** | `(owner)/actions/payments.ts:76` (create), `:163` (update), `:236` (list) | None in `/api/v1/carrier/` | Yes |
| **PayrollRecord** | `(owner)/actions/payroll.ts:52` (create), `:116` (update), `:200` (markPaid) | None | Yes |
| **CarrierLoad** | None in `(owner)/actions/` | `api/v1/carrier/dashboard/kpi/route.ts:33,46,54` (KPI counts + revenue sums) | Yes — uses `orgId` filter |
| **DriverPayRecord** | None in `(owner)/actions/` | `api/v1/carrier/pay-records/route.ts:38` (list); `pay-records/[id]/approve`, `mark-paid`, `void`, `recalculate` routes | Yes |
| **CarrierExpense** | None in `(owner)/actions/` | `api/v1/carrier/expenses/route.ts` (list/create); `expenses/[id]/route.ts`; `expenses/[id]/approve/route.ts` | Yes |

---

## 3. UI Audit

| Model | UI Page (route path) | File Path | Create UI? | View/List UI? |
|---|---|---|---|---|
| **Invoice** | `/invoices` | `(owner)/invoices/page.tsx` | No | Yes — list with 4 stat cards |
| **Invoice** | `/invoices/new` | `(owner)/invoices/new/page.tsx` | Yes | No |
| **Invoice** | `/invoices/[id]` | `(owner)/invoices/[id]/page.tsx` | No | Yes — detail, mark paid, delete |
| **Invoice** | `/invoices/[id]/edit` | `(owner)/invoices/[id]/edit/page.tsx` | No | Yes — edit form |
| **ExpenseCategory** | `/settings/expense-categories` | `(owner)/settings/expense-categories/page.tsx` | Yes | Yes |
| **ExpenseTemplate** | `/settings/expense-templates` | `(owner)/settings/expense-templates/page.tsx` | Yes | Yes |
| **RouteExpense** | `/routes/[id]` (embedded) | `(owner)/routes/[id]/route-page-client.tsx:319` | Yes | Yes |
| **RoutePayment** | `/routes/[id]` (embedded) | `(owner)/routes/[id]/route-page-client.tsx:330` | Yes | Yes |
| **PayrollRecord** | `/payroll`, `/payroll/new`, `/payroll/[id]` | `(owner)/payroll/page.tsx`, `new/page.tsx`, `[id]/page.tsx` | Yes | Yes |
| **DriverPayRecord** (profit-per-load) | `/carrier/driver-pay/reports` | `(owner)/carrier/driver-pay/reports/page.tsx` | No | Yes — tabbed reports + LoadProfitabilityReport |
| `/carrier/financials` | **DOES NOT EXIST** | — | — | — |
| `/settings/financial` | **Stub only** | `(owner)/settings/financial/page.tsx` | No | Hardcoded placeholder cards, no live data |

---

## 4. KPI Dashboard Backing

| Metric | Backing model | Exact query | File:line |
|---|---|---|---|
| `loadsThisWeek` | `CarrierLoad` | `count({ where: { orgId, isSample: false, createdAt: { gte: monday } } })` | `kpi/route.ts:33` |
| `pendingPayApprovals` | `DriverPayRecord` | `count({ where: { orgId, status: 'pending' } })` | `kpi/route.ts:40` |
| `openInvoices` | **`CarrierLoad`** (NOT Invoice model) | `count({ where: { orgId, isSample: false, status: 'invoiced' } })` | `kpi/route.ts:46` |
| `revenueThisWeek` | `CarrierLoad` | `findMany` on this week's loads, summing `totalRevenue` (fallback: `rateAmount + fuelSurcharge + detentionAmount + otherCharges`) | `kpi/route.ts:54–83` |

> **Critical gotcha:** The "Open Invoices" KPI counts `CarrierLoad` records with `status='invoiced'` — it never touches the `Invoice` model.

---

## 5. Feature Classification Table

| Feature | Status | Model evidence | Read-code evidence | UI evidence |
|---|---|---|---|---|
| **Financials dashboard (profit at a glance)** | **B** | `CarrierLoad.totalRevenue` (schema:2270); `DriverPayRecord.netPay` (schema:2489); `LoadProfitabilityRow` computed in `lib/driver-pay/reports/load-profitability.ts:55` | KPI: `kpi/route.ts:31–86`; profit-per-load: `api/driver-pay/reports/load-profitability/route.ts:27` | Profit-per-load grid exists at `/carrier/driver-pay/reports`. **No aggregate financials summary page.** |
| **Logging expenses** | **A** | `RouteExpense` (schema:834, routeId FK); `CarrierExpense` (schema:2427, loadId? FK) | `actions/expenses.ts:85` (create), `:279` (list); `api/v1/carrier/expenses/route.ts` | RouteExpense: embedded in `/routes/[id]` (`route-page-client.tsx:319`). CarrierExpense: API exists, **no standalone carrier portal UI page**. |
| **Sending an invoice** | **B** | `Invoice` (schema:1044); `status` enum includes `SENT` (schema:1016); email templates at `emails/carrier/client-invoice-ready.tsx`, `emails/carrier/invoice-generated.tsx` | `actions/invoices.ts:80` (create, status settable to SENT via form dropdown); **no dedicated sendInvoice action** | `/invoices/[id]` has Edit + Mark as Paid + Delete only. **No "Send to customer" button.** Status can be set to SENT via edit form but no email delivery is wired. |
| **Customizing invoice templates** | **C** | No `InvoiceTemplate` model exists. `ExpenseTemplate` (schema:860) is for route expenses only. | No read code for invoice templates. | No UI exists. |
| **Tracking payments** | **A** | `RoutePayment` (schema:895, routeId FK, PaymentStatus PENDING/PAID); `Invoice.paidDate` + `status=PAID` | `actions/payments.ts:76` (create), `:163` (update), `:236` (list); `actions/invoices.ts:261` (markInvoicePaid) | RoutePayment: embedded in `/routes/[id]` (`route-page-client.tsx:330`). Invoice payment: `/invoices/[id]` has `MarkAsPaidButton` (`invoices/[id]/page.tsx:128`). |
| **Profit-per-load** | **A** | `CarrierLoad.totalRevenue` (schema:2270) minus `DriverPayRecord.netPay` (schema:2489) + `LoadPayComponent.grossAmount` — computed in `lib/driver-pay/reports/load-profitability.ts:55` | `api/driver-pay/reports/load-profitability/route.ts:27` (paginated + CSV export); `lib/driver-pay/reports/load-profitability.ts` (core computation) | `(owner)/carrier/driver-pay/reports/page.tsx` + `_components/LoadProfitabilityReport.tsx` — full grid, sortable columns, BigNumberHero, CSV export |

### Summary by status
- **A (model + code + UI):** Logging expenses, Tracking payments, Profit-per-load
- **B (model + code, no UI):** Financials dashboard, Sending an invoice
- **C (model, no code, no UI):** Customizing invoice templates
- **D (no model):** — none

---

## 6. Architecture Statement

The financial layer is **split across two parallel systems with incompatible tenant FK conventions**:

**Route-legacy system** (`RouteExpense.routeId`, `RoutePayment.routeId`, `PayrollRecord`) uses `tenantId` as the tenant FK and scopes all data to `Route` records. These tables have no `loadId` FK — they cannot be queried by load. Full CRUD server actions exist, and UI is embedded in `/routes/[id]`. This system is architecturally blocked from being used in a load-centric financials page without migration.

**Load-centric carrier system** (`CarrierLoad`, `CarrierExpense.loadId?`, `DriverPayRecord.loadId?`) uses `orgId` as the tenant FK and maps to snake_case tables (`"loads"`, `"carrier_expenses"`, `"driver_pay_records"`). This is the active system: it backs the KPI dashboard and profit-per-load reports. It has REST API routes but minimal CRUD UI in the owner portal.

**`Invoice`** sits between both — it has optional `routeId?` and `loadId?` columns (schema:1048–1049), a Prisma `load` relation (schema:1075), but no Prisma `route` relation object. In practice it behaves as Load-centric when `loadId` is set.

**`PayrollRecord`** is superseded by `DriverPayRecord` — it has `driverId` but no `loadId`/`routeId`/`orgId`, using `tenantId`. Its UI at `/payroll` is active but belongs to the legacy system.

> **For any new /carrier/financials page: use CarrierLoad + CarrierExpense + DriverPayRecord + Invoice (via loadId). Do NOT use RouteExpense, RoutePayment, or PayrollRecord — they are Route-legacy.**

---

## 7. Shippability Recommendation

The smallest shippable `/carrier/financials` page by July 27 can be built entirely from **Status A and B features** using four data sources already queryable via `getTenantPrisma()`: (1) `Invoice` — for outstanding/paid totals, already aggregated at `(owner)/invoices/page.tsx:23–45` using `prisma.invoice.groupBy`; (2) `CarrierLoad` — for open-invoices count and revenue this week, already computed at `api/v1/carrier/dashboard/kpi/route.ts:46,54`; (3) `DriverPayRecord` — for pending pay approvals, already queried at `kpi/route.ts:40`; and (4) the `LoadProfitabilityReport` component at `(owner)/carrier/driver-pay/reports/_components/LoadProfitabilityReport.tsx` which is a fully-functional, sortable, paginated grid. The page should render: a 4-metric summary bar (revenue this week, outstanding invoices amount, pending pay approvals count, open-invoice count — all B-status, data exists with no new API work), a link to the existing `/invoices` list, and a direct embed of `LoadProfitabilityReport`. Register it under `(owner)/carrier/financials/page.tsx` to match the existing carrier portal pattern. What must be **deferred past July 27**: invoice email delivery (B-status — model and email templates exist but no send action is wired; estimated 1 quick task); expense logging from within `/carrier/financials` rather than the route detail page (requires either migrating RouteExpense→CarrierExpense or building a CarrierExpense standalone UI — estimated 1 phase); invoice template customization (C-status, no model — estimated 1 full phase). The July 27 page ships real data with zero model additions and approximately 3 new files (page.tsx, a KPI API extension or direct server action, and optional CSS).
