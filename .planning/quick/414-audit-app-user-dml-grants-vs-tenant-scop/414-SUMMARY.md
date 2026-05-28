# Quick Task 414 — SUMMARY

**Task:** Audit app_user DML grants vs tenant-scoped table list
**Date:** 2026-05-28
**Status:** COMPLETE

## What was built

Created `apps/web/scripts/audit/app-user-grant-audit.ts` — a read-only TypeScript audit script
that checks whether the `app_user` Postgres role holds all four DML privileges (SELECT, INSERT,
UPDATE, DELETE) on every tenant-scoped (FORCE RLS) table in the public schema.

## Run command

```bash
cd apps/web && npx tsx --env-file=.env.local scripts/audit/app-user-grant-audit.ts
```

## Audit results

**83 tenant-scoped tables checked. 51 have at least one missing grant.**

### Summary counts

| Metric | Count |
|--------|-------|
| Total tenant-scoped tables (FORCE RLS = true) | 83 |
| Tables with ALL four grants | 32 |
| Tables with at least one missing grant | 51 |
| Tables with ZERO grants (CRITICAL) | 49 |
| Tables with partial grants | 2 |

### Partial grants (non-zero but incomplete)

| Table | Missing |
|-------|---------|
| Tenant | INSERT, UPDATE, DELETE (has SELECT only) |
| audit_log | UPDATE, DELETE (has SELECT + INSERT only) |

### 49 CRITICAL tables (app_user has zero grants — full bypass of tenant isolation)

ActivationProgress, AppEvent, AutomationRule, AutomationRun, Customer, CustomerInteraction,
DocFeedback, Document, driver_bonuses, driver_compensation_templates, driver_deductions,
driver_disputes, driver_pay_audit_logs, driver_settlements, DriverInvitation, DriverRouteJoin,
ExpenseCategory, ExpenseTemplate, ExpenseTemplateItem, FleetMessage, FuelRecord, GPSLocation,
Invoice, InvoiceItem, Load, load_driver_assignments, load_pay_components, MaintenanceEvent,
NotificationLog, NotificationSubscription, pay_component_attachments, PayrollRecord, Playbook,
PlaybookInstance, PlaybookNotification, Route, RouteExpense, RoutePayment, RouteStop,
SafetyEvent, ScheduledService, StepTemplate, Subscription, TenantHealthScore, TenantIntegration,
TenantMetricsDaily, TenantNotificationSettings, Truck, User

## Interpretation

Quick-410 only granted app_user on **32 of 83** tables. The remaining 49 core business tables
(loads, trucks, drivers, routes, invoices, etc.) have zero grants. Under FORCE RLS, any query
against these tables using `DATABASE_URL_APP_USER` will either fail or silently fall back to
the postgres superuser role — bypassing tenant isolation for the majority of the application.

The 32 tables with complete grants are all recently added tables (carrier_*, PlaybookStep,
PlaybookTrigger, RouteDriver, StepInstance, stops, etc.) that received grants as part of
individual Quick tasks. The core domain tables inherited FORCE RLS from Quick-410 but never
received matching grants.

## Next step

A remediation migration must GRANT SELECT, INSERT, UPDATE, DELETE ON each of the 49 CRITICAL
tables (and INSERT, UPDATE, DELETE on `Tenant`, and UPDATE, DELETE on `audit_log`) to app_user.
This is a pure grant migration — no schema changes, no policy changes.

## Files created

- `apps/web/scripts/audit/app-user-grant-audit.ts`
