# quick-600 — baseline, before anything (staging only)

Captured `2026-09-14T18:22:11.876Z` against staging `wyixpgunnjmzguhggocz`, via a one-off
`pg.Client` on `STAGING_DIRECT_URL` (`postgres`, read-only). Raw JSON: `00-baseline.json`.

## `bypass_rls_policy`

- Total `pg_policy` rows: **183**
- `bypass_rls_policy` rows: **86**
- Sorted table list (86 entries) — see `00-baseline.json` → `bypassPolicyTables`. First/last for a
  quick sanity check: `ActivationProgress` … `route_templates`.

## Roles

| rolname | rolsuper | rolbypassrls | rolcanlogin | rolconnlimit |
| --- | --- | --- | --- | --- |
| app_user | false | false | true | -1 |
| postgres | false | true | true | -1 |

`app_admin` — **absent**, as expected.

## Newest `_prisma_migrations` row (before this task's migration)

| migration_name | applied_steps_count | checksum | started_at | finished_at |
| --- | --- | --- | --- | --- |
| `20260914120000_tenant_audit_automation_policy_closure` | 1 | `manual` | 2026-09-14T17:21:39.591Z | 2026-09-14T17:21:39.956Z |

This is quick-599's migration — confirms this task starts from that known-good state.

## Sequence check for the routed table set

`information_schema.columns.column_default LIKE 'nextval%'` over every table any `ROUTE` site
touches (`Tenant`, `User`, `PlaybookInstance`, `StepInstance`, `SupportTicket`, `TicketMessage`,
`AutomationRun`, `Subscription`, `AppEvent`, `DriverInvitation`, `Load`, `Truck`, `GPSLocation`,
`SysAdminInvoice`, `SysAdminInvoiceItem`) returned **zero rows** — every id is cuid/uuid, none is
a Postgres serial/identity column. No `GRANT USAGE, SELECT ON SEQUENCE` is needed anywhere in the
migration; the migration says so in a comment instead of granting one.
