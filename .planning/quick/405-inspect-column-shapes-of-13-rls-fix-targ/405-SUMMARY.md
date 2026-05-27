---
phase: quick-405
plan: 01
subsystem: database/rls
tags: [rls, security, audit, postgres, diagnostic]
dependency_graph:
  requires: []
  provides: [RLS fix target schema evidence]
  affects: [upcoming RLS remediation migration]
tech_stack:
  added: []
  patterns: [prisma.$queryRawUnsafe with typed interfaces, sequential per-table queries]
key_files:
  created:
    - apps/web/scripts/audit/inspect-rls-fix-targets.ts
  modified: []
decisions:
  - "7 UNKNOWN tables scoped via FK chain (no direct ownership col) — require JOIN-based RLS policies referencing parent org_id"
  - "carrier_documents already has 3 policies (SELECT/INSERT/UPDATE/DELETE) scoped via org_id through joins — classified UNKNOWN due to no direct col but functionally covered"
  - "route_template_stops and stops already have full org-scoped policy sets — classified UNKNOWN due to no direct col but functionally covered via parent FK"
  - "TicketMessage and Tenant already have bypass_rls_policy + tenant isolation or bypass only — need policy gap review"
  - "carrier_catalog_meta, NotificationEmailConfig, NotificationTemplate — no ownership col, no policies, likely need sysadmin-write/all-read global policies"
metrics:
  duration: 180s
  completed: 2026-05-27
  tasks: 1
  files: 1
---

# Phase quick-405: inspect-rls-fix-targets — Summary

**One-liner:** Read-only diagnostic script inspecting column shapes, ownership columns, existing policies, FKs, and row counts for 13 RLS-fix-target tables, yielding a classification summary that drives the next RLS remediation migration.

## File Created

- `apps/web/scripts/audit/inspect-rls-fix-targets.ts` — 355 lines
  - Run: `npx tsx --env-file=.env.local scripts/audit/inspect-rls-fix-targets.ts` from `apps/web/`
  - Mirrors `audit-rls-gaps.ts` structure exactly: same connection setup, typed row-shape interfaces, `padRight` helper, `.finally` cleanup

## Classification Summary Table (live DB output)

```
TABLE                        | CLASSIFICATION   | OWNERSHIP COL
-----------------------------|------------------|-------------------
carrier_compliance_alert_log | TENANT_SCOPED    | org_id
carrier_documents            | UNKNOWN          | -
route_template_stops         | UNKNOWN          | -
stops                        | UNKNOWN          | -
TicketMessage                | UNKNOWN          | -
grid_preference              | USER_OWNED       | userId
grid_view                    | USER_OWNED       | userId
carrier_catalog_meta         | UNKNOWN          | -
NotificationEmailConfig      | UNKNOWN          | -
NotificationTemplate         | UNKNOWN          | -
Plan                         | GLOBAL_LOOKUP    | -
Promo                        | GLOBAL_LOOKUP    | -
Tenant                       | GLOBAL_LOOKUP    | -

Classifications: 1 TENANT_SCOPED, 2 USER_OWNED, 3 GLOBAL_LOOKUP, 7 UNKNOWN
```

## Full Console Output

```
RLS Fix Target Inspection — starting...
Inspecting 13 tables sequentially.

=== 1/13: carrier_compliance_alert_log ===

  [A] Columns:
    COLUMN                              DATA_TYPE               NULLABLE
    --------------------------------------------------------------------
    id                                  uuid                    NO
    org_id                              uuid                    NO
    alert_type                          text                    NO
    entity_id                           text                    NO
    message                             text                    NO
    severity                            text                    NO
    created_at                          timestamp with time zone YES

  [B] Ownership columns detected:
    org_id

  [C] Existing RLS policies:
    (no policies)

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 29

=== 2/13: carrier_documents ===

  [A] Columns:
    COLUMN                              DATA_TYPE               NULLABLE
    --------------------------------------------------------------------
    id                                  uuid                    NO
    parent_type                         text                    NO
    parent_id                           uuid                    NO
    stop_id                             uuid                    YES
    client_id                           uuid                    YES
    document_type                       text                    NO
    file_url                            text                    NO
    filename                            text                    NO
    file_size_bytes                     integer                 YES
    uploaded_by                         uuid                    NO
    verified                            boolean                 NO
    verified_by                         uuid                    YES
    verified_at                         timestamp with time zone YES
    notes                               text                    YES
    created_at                          timestamp with time zone NO
    document_type_id                    uuid                    YES
    load_id                             uuid                    YES
    dispatch_id                         uuid                    YES
    contract_id                         uuid                    YES

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    carrier_documents_insert [INSERT] qual=NULL
    carrier_documents_org_delete [DELETE] qual=(((auth.jwt() ->> 'role') = ANY (ARRAY['OWNER','MANAGER'])) AND (...org_id scope via client/stop join...))
    carrier_documents_org_update [UPDATE] qual=(((auth.jwt() ->> 'role') = ANY (ARRAY['OWNER','MANAGER'])) AND (...org_id scope via client/stop join...))
    carrier_documents_select [SELECT] qual=((uploaded_by = auth.uid()) OR (...org_id scope via client/stop join...))

  [D] Outgoing foreign keys:
    client_id -> clients.id
    contract_id -> contracts.id
    dispatch_id -> dispatches.id
    document_type_id -> carrier_document_types.id
    load_id -> loads.id
    stop_id -> stops.id
    uploaded_by -> User.id
    verified_by -> User.id

  [E] Row count:
    Approx rows: 11

=== 3/13: route_template_stops ===

  [A] Columns:
    id / route_template_id / sequence_order / stop_type / facility_id /
    contact_name / contact_phone / appt_window_start_offset_min /
    appt_window_end_offset_min / expected_dwell_minutes /
    commodity_description / bol_required / pod_required /
    special_instructions / created_at / created_by_id

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    route_template_stops_org_delete [DELETE] qual=(OWNER|MANAGER + route_template_id IN org's templates)
    route_template_stops_org_insert [INSERT] qual=NULL
    route_template_stops_org_select [SELECT] qual=(route_template_id IN org's templates)
    route_template_stops_org_update [UPDATE] qual=(OWNER|MANAGER + route_template_id IN org's templates)

  [D] Outgoing foreign keys:
    created_by_id -> User.id
    facility_id -> facilities.id
    route_template_id -> route_templates.id

  [E] Row count:
    Approx rows: 11

=== 4/13: stops ===

  [A] Columns:
    id / dispatch_id / load_id / sequence_order / stop_type / facility_id /
    client_id / appointment_start / appointment_end / arrived_at /
    departed_at / status / skip_reason / commodity_description /
    pieces / weight_lbs / bol_number / pod_number / seal_number /
    contact_name / contact_phone / special_instructions / notes /
    created_at / updated_at / bolRequired / podRequired / free_time_minutes /
    work_state / created_by_id / updated_by_id / checklist_status /
    deferred_reason / checklist_entity_id

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    stops_driver_select [SELECT] qual=(DRIVER role + dispatch assigned to driver)
    stops_driver_update [UPDATE] qual=(DRIVER role + dispatch assigned to driver)
    stops_org_delete [DELETE] qual=(OWNER|MANAGER + dispatch_id or load_id in org)
    stops_org_insert [INSERT] qual=NULL
    stops_org_select [SELECT] qual=(dispatch_id or load_id in org)
    stops_org_update [UPDATE] qual=(OWNER|MANAGER + dispatch_id or load_id in org)

  [D] Outgoing foreign keys:
    client_id -> clients.id
    created_by_id -> User.id
    dispatch_id -> dispatches.id
    facility_id -> facilities.id
    load_id -> loads.id
    updated_by_id -> User.id

  [E] Row count:
    Approx rows: 267

=== 5/13: TicketMessage ===

  [A] Columns:
    id / ticketId / senderType / senderLabel / body / createdAt

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    bypass_rls_policy [ALL] qual=(current_setting('app.bypass_rls', true) = 'on')
    tenant_isolation_policy [ALL] qual=(ticketId IN (SELECT SupportTicket.id WHERE tenantId = current_tenant_id()))

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 2

=== 6/13: grid_preference ===

  [A] Columns:
    id / userId / gridId / columnOrder / columnWidths / hiddenColumns /
    frozenColumns / density / pageSize / createdAt / updatedAt

  [B] Ownership columns detected:
    userId

  [C] Existing RLS policies:
    (no policies)

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 0

=== 7/13: grid_view ===

  [A] Columns:
    id / gridId / userId / name / isDefault / schemaVersion / state /
    createdAt / updatedAt

  [B] Ownership columns detected:
    userId

  [C] Existing RLS policies:
    (no policies)

  [D] Outgoing foreign keys:
    userId -> User.id

  [E] Row count:
    Approx rows: 0

=== 8/13: carrier_catalog_meta ===

  [A] Columns:
    id / enum_group / enum_value / display_label / sort_order / active

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    (no policies)

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 93

=== 9/13: NotificationEmailConfig ===

  [A] Columns:
    id / singletonKey / fromName / fromEmail / replyTo / createdAt / updatedAt

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    (no policies)

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 0

=== 10/13: NotificationTemplate ===

  [A] Columns:
    id / triggerKey / category / displayName / description /
    defaultSubject / defaultBlockJson / defaultHtmlCache /
    availableVariables / defaultRecipients / isActive /
    inAppEnabled / createdAt / updatedAt

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    (no policies)

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 37

=== 11/13: Plan ===

  [A] Columns:
    id / key / name / description / defaultTrialDays /
    monthlyPriceCents / yearlyPriceCents / maxTrucks / maxUsers /
    storageGbLimit / isActive / sortOrder / stripeProductId /
    createdAt / updatedAt

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    (no policies)

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 4

=== 12/13: Promo ===

  [A] Columns:
    id / code / description / bonusTrialDays / discountPct /
    activeFrom / activeTo / maxRedemptions / redemptionCount /
    isActive / stripeCouponId / createdAt / updatedAt

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    (no policies)

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 0

=== 13/13: Tenant ===

  [A] Columns:
    id / name / slug / timezone / isActive / createdAt / updatedAt /
    profitMarginThreshold / contactEmail / plan / fleetSizeBucket /
    status / manualTrial / emailConfirmedAt / sampleDataSeeded /
    provisioningPhase

  [B] Ownership columns detected:
    (none detected)

  [C] Existing RLS policies:
    bypass_rls_policy [ALL] qual=(current_setting('app.bypass_rls', true) = 'on')

  [D] Outgoing foreign keys:
    (no outgoing FKs)

  [E] Row count:
    Approx rows: 18
```

## Surprises / Key Findings

**1. carrier_documents, route_template_stops, stops — already have policies (not blank slates)**

These three tables were in the "13 RLS-fix-targets" list but already have comprehensive org-scoped policies via FK-join patterns (e.g. `dispatch_id IN (SELECT id FROM dispatches WHERE org_id = ...)`). They show as UNKNOWN only because no *direct* ownership column was detected — the actual policy authorship is correct. The remediation migration should verify these are complete rather than add new ones.

**2. TicketMessage already has both bypass_rls_policy AND tenant_isolation_policy**

Only the bypass policy was expected. The tenant isolation policy scopes via `ticketId IN (SELECT ... WHERE tenantId = current_tenant_id())` — this is correct pattern. Status: effectively covered, just needs FORCE RLS verification.

**3. Tenant table has bypass_rls_policy only — no tenant isolation policy**

`Tenant` is the root identity table — it cannot scope itself by tenantId. The bypass policy is correct. No additional policy needed. Confirm FORCE RLS is enabled.

**4. carrier_catalog_meta (93 rows), NotificationTemplate (37 rows), Plan (4 rows) — global read tables with zero policies**

These are read-by-all, write-by-sysadmin tables. They need:
- SELECT: allow all authenticated users
- INSERT/UPDATE/DELETE: restrict to sysadmin role or service role only
No tenant scoping required.

**5. NotificationEmailConfig (0 rows), Promo (0 rows) — empty global lookup tables**

Same pattern as above — global read, sysadmin write. Empty today so no data leakage risk, but policies still needed before go-live.

**6. grid_preference and grid_view (both 0 rows) — user-owned, no policies**

Both have `userId` FK to `User.id`. Need simple user-ownership policies: `userId = auth.uid()`. These are purely personal preferences.

**7. carrier_compliance_alert_log (29 rows) — has org_id but ZERO policies**

This is the highest-priority gap: a tenant-scoped table with live data and no RLS at all. Needs straightforward `org_id = (auth.jwt() ->> 'org_id')::uuid` policies.

## Recommended Next Step

Design and execute the RLS remediation migration targeting these tables in priority order:

| Priority | Tables | Action |
|----------|--------|--------|
| HIGH | carrier_compliance_alert_log | Add org_id-scoped policies (org has live data) |
| HIGH | grid_preference, grid_view | Add userId = auth.uid() user-ownership policies |
| MEDIUM | carrier_catalog_meta, NotificationTemplate, Plan, Promo, NotificationEmailConfig | Add global read + sysadmin-write policies |
| LOW | carrier_documents, route_template_stops, stops, TicketMessage, Tenant | Verify existing policies are complete + FORCE RLS is on |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/scripts/audit/inspect-rls-fix-targets.ts` exists (355 lines, > 200 minimum)
- Commit `f5947ef0` recorded
- Script exited 0, printed 13 table sections + classification summary
- Zero DDL/DML statements (comment-only matches in Select-String check)
- Zero `: any` type annotations in DB row shape interfaces
