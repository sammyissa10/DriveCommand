# `_prisma_migrations` integrity audit

**Investigation only.** Nothing was written to production in this task. Every
production statement was a `SELECT`, and both database sessions opened with
`SET default_transaction_read_only = on` before any query ran. No migration was
applied, resolved or authored.

- **Date:** 2026-09-12
- **Production:** `drivecommand` — `oqdhberkghtnszrkdvfm`, 141 ledger rows
- **Reference rebuild:** `drivecommand-staging` — `wyixpgunnjmzguhggocz`, 147
  ledger rows, the chain replayed from zero by quick-593
- **Companions:** [`migration-chain-repair.md`](./migration-chain-repair.md),
  [`staging-environment.md`](./staging-environment.md)

> **quick-460's conclusions were re-derived from scratch and none were
> inherited. Two of its three headline claims are false.** It reported that
> every authored migration had a ledger row with `applied_steps_count = 1` and
> that the hook mechanism had applied all of them correctly. Production holds
> **20** rows with `applied_steps_count = 0`, and **9** of the rows it counted
> as sound describe work that never reached production.

---

## Summary

| Count | Value | Where it is derived |
|---|---|---|
| **False ledger claims** | **9** | [§2.2](#22-false-claims-among-the-steps--1-rows) — 9 migrations, every one `applied_steps_count = 1`, that create at least one object absent from production |
| **Ledger orphans** | **1** | [§3](#3-repo-against-ledger) — `20260611000001_fix_carrier_rls_jwt_policies`. In the opposite direction, **7** repo directories have no production ledger row |
| **Untracked production objects** | **55** | [§4](#4-ddl-in-production-that-no-migration-produces) — 1 table, 32 columns, 15 indexes, 7 constraints |
| **Reconciliation gaps** | **55** production-only · **349** rebuild-only | [§5](#5-reconciliation) — plus 43 type, 3 nullability, 38 default and 110 constraint-definition divergences on objects that exist on both sides |

Every number above is produced by a query quoted in the section it links to.

**The ledger cannot be trusted as a record of what ran.** The evidence is in
[§6](#6-verdict).

---

## 1. The ledger in full

```sql
SELECT count(*) AS total_rows,
  count(*) FILTER (WHERE applied_steps_count = 0) AS steps_zero,
  count(*) FILTER (WHERE applied_steps_count = 1) AS steps_one,
  count(*) FILTER (WHERE applied_steps_count > 1) AS steps_gt1,
  count(*) FILTER (WHERE date_trunc('second', started_at) = date_trunc('second', finished_at)) AS start_eq_finish_sec,
  count(*) FILTER (WHERE started_at = finished_at) AS start_eq_finish_exact,
  count(*) FILTER (WHERE logs IS NULL) AS logs_null,
  count(*) FILTER (WHERE logs = '') AS logs_empty,
  count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back,
  count(*) FILTER (WHERE finished_at IS NULL) AS unfinished,
  count(*) FILTER (WHERE checksum = 'manual') AS checksum_manual
FROM _prisma_migrations;
```

```
total_rows            : 141
steps_zero            : 20
steps_one             : 121
steps_gt1             : 0
start_eq_finish_sec   : 81
start_eq_finish_exact : 23
logs_null             : 121
logs_empty            : 20
rolled_back           : 0
unfinished            : 0
checksum_manual       : 47
```

**`applied_steps_count = 0`: 20 rows. `started_at = finished_at` to the second:
81 rows; exactly equal to the microsecond: 23 rows.** No row is rolled back and
no row is unfinished.

### 1.1 Three writers, three signatures

The counts above separate cleanly because three different mechanisms have
written to this table, and each leaves a distinct trace.

| Writer | `applied_steps_count` | `logs` | `checksum` | duration |
|---|---|---|---|---|
| `prisma migrate deploy` | 1 | `NULL` | real SHA-256 | real |
| `scripts/migrate.mjs` | 1 | `NULL` | literal `manual` | real |
| resolved-not-run marker | **0** | `''` | real SHA-256 | **zero** |

`scripts/migrate.mjs:66-69` writes the middle row verbatim:

```js
`INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "started_at", "applied_steps_count")
 VALUES ($1, $2, $3, $4, $5, 1)`,
[id, 'manual', dir, new Date(), startedAt]
```

The correlation is exact and was checked rather than assumed: all 20
`steps = 0` rows carry `logs = ''`, a real SHA-256 and microsecond-identical
timestamps; all 121 `steps = 1` rows carry `logs IS NULL`. That partition is
what makes the marker rows identifiable at all.

**The 23 exactly-equal timestamps are the 20 markers plus three `steps = 1`
rows** — `20260514100001_backfill_employment_type_snapshot_retry`,
`20260517000001_tkt0015_2a_cleanup_audit_fks` and
`20260517150001_tkt0015_2b_wave2_fleet_audit_columns`. Those three carry
`logs IS NULL` and a real SHA-256, so they are not markers by the signature
above, and a sub-microsecond real execution is not plausible. They are
**indeterminate** and are the one part of §1 no evidence here settles.

### 1.2 Checksums against the files they name

A resolved row's checksum is the SHA-256 of `migration.sql` over LF bytes. That
is testable against the repository. Of the 94 rows carrying a real hash (the
other 47 carry the literal `manual`):

| | |
|---|---|
| file hash matches the ledger | **91** |
| file hash differs | **2** |
| no file at all | **1** |

- `20260417100001_add_vehicle_id_display_name` — expected. quick-593 edited this
  file under a documented exemption; the mismatch is that edit.
- **`20260327000006_add_push_token` — not expected, and new.** The ledger holds
  `4a3e1d…853614`; the file hashes to `2d1c14…c920f`. Its immediate neighbour
  `20260327000007`, applied one second later in the same batch, matches
  perfectly, so the hashing convention is right and this file genuinely differs.
  `git log --follow` returns a single commit for the file, dated 2026-03-30,
  three days *after* the ledger says it was applied. **The content that ran is
  in no commit, and the ledger's checksum describes bytes that have never
  existed in this repository.**
- `20260611000001_fix_carrier_rls_jwt_policies` — the ledger orphan, §3.

The push-token mismatch is corroborated structurally. The file declares
uniqueness as a table constraint inside `CREATE TABLE`:

```sql
CONSTRAINT "PushToken_userId_platform_key" UNIQUE ("userId", "platform"),
```

A table constraint always produces a `pg_constraint` row. Production has none —
only a bare index:

```
PushToken_userId_platform_key: CREATE UNIQUE INDEX "PushToken_userId_platform_key" ON public."PushToken" USING btree ("userId", platform)
```

The rebuild, which ran the file, has **both** the constraint and its index. Two
independent measurements — the checksum and the object class — agree that the
SQL which ran in production was not the SQL in this file.

### 1.3 All 141 rows

Rendered directly from production. `started=finished` reads **exact** for
microsecond equality, `same sec` for equality only at second resolution.

| # | migration_name | steps | started_at (UTC) | finished_at (UTC) | rolled_back_at | logs | checksum | started=finished |
|---|---|---|---|---|---|---|---|---|
| 1 | `00000000000000_init` | 1 | 2026-03-26 00:31:44 | 2026-03-26 00:31:50 | NULL | NULL | sha-256 | differs |
| 2 | `20260214000001_add_truck_model` | 1 | 2026-03-26 00:31:50 | 2026-03-26 00:31:54 | NULL | NULL | sha-256 | differs |
| 3 | `20260214000002_add_driver_management` | 1 | 2026-03-26 00:31:55 | 2026-03-26 00:31:56 | NULL | NULL | sha-256 | differs |
| 4 | `20260214000003_add_route_model` | 1 | 2026-03-26 00:31:56 | 2026-03-26 00:32:01 | NULL | NULL | sha-256 | differs |
| 5 | `20260214000004_add_document_model` | 1 | 2026-03-26 00:32:02 | 2026-03-26 00:32:09 | NULL | NULL | sha-256 | differs |
| 6 | `20260214000005_add_maintenance_models` | 1 | 2026-03-26 00:32:09 | 2026-03-26 00:32:16 | NULL | NULL | sha-256 | differs |
| 7 | `20260214000006_add_notification_log` | 1 | 2026-03-26 00:32:17 | 2026-03-26 00:32:23 | NULL | NULL | sha-256 | differs |
| 8 | `20260215000001_add_fleet_intelligence_models` | 1 | 2026-03-26 00:32:23 | 2026-03-26 00:32:31 | NULL | NULL | sha-256 | differs |
| 9 | `20260215000002_add_tags` | 1 | 2026-03-26 00:32:31 | 2026-03-26 00:32:33 | NULL | NULL | sha-256 | differs |
| 10 | `20260216223252_add_route_finance_models` | 1 | 2026-03-26 00:32:33 | 2026-03-26 00:32:38 | NULL | NULL | sha-256 | differs |
| 11 | `20260218000001_remove_clerk_add_password_auth` | 1 | 2026-03-26 00:32:38 | 2026-03-26 00:32:39 | NULL | NULL | sha-256 | differs |
| 12 | `20260218000002_add_crm_invoice_payroll_models` | 1 | 2026-03-26 00:32:39 | 2026-03-26 00:32:49 | NULL | NULL | sha-256 | differs |
| 13 | `20260226000001_add_route_distance` | 1 | 2026-03-26 00:32:49 | 2026-03-26 00:32:50 | NULL | NULL | sha-256 | differs |
| 14 | `20260226000002_add_rls_missing_tables` | 1 | 2026-03-26 00:32:50 | 2026-03-26 00:32:50 | NULL | NULL | sha-256 | same sec |
| 15 | `20260226000003_add_route_stops` | 1 | 2026-03-26 00:32:50 | 2026-03-26 00:32:51 | NULL | NULL | sha-256 | differs |
| 16 | `20260303000001_add_support_ticket` | 1 | 2026-03-26 00:32:51 | 2026-03-26 00:32:51 | NULL | NULL | sha-256 | same sec |
| 17 | `20260304000001_add_role_to_driver_invitation` | 1 | 2026-03-26 00:32:51 | 2026-03-26 00:32:52 | NULL | NULL | sha-256 | differs |
| 18 | `20260309000001_extend_support_ticket_add_messages` | 1 | 2026-03-26 00:32:52 | 2026-03-26 00:32:52 | NULL | NULL | sha-256 | same sec |
| 19 | `20260311000001_add_sysadmin_invoices` | 1 | 2026-03-26 00:32:52 | 2026-03-26 00:32:54 | NULL | NULL | sha-256 | differs |
| 20 | `20260311000002_sysadmin_invoice_service_fields` | 1 | 2026-03-26 00:32:54 | 2026-03-26 00:32:54 | NULL | NULL | sha-256 | same sec |
| 21 | `20260314000001_add_fleet_message` | 1 | 2026-03-26 00:32:54 | 2026-03-26 00:32:57 | NULL | NULL | sha-256 | differs |
| 22 | `20260315000001_add_driver_route_join` | 1 | 2026-03-26 00:32:57 | 2026-03-26 00:32:57 | NULL | NULL | sha-256 | same sec |
| 23 | `20260319000001_add_load_audit_fields` | 1 | 2026-03-26 00:32:57 | 2026-03-26 00:32:58 | NULL | NULL | sha-256 | differs |
| 24 | `20260322000001_add_user_permissions` | 1 | 2026-03-26 00:32:58 | 2026-03-26 00:32:58 | NULL | NULL | sha-256 | same sec |
| 25 | `20260322000002_add_invitation_permissions` | 1 | 2026-03-26 00:32:58 | 2026-03-26 00:32:59 | NULL | NULL | sha-256 | differs |
| 26 | `20260324000001_make_fleet_message_route_optional` | 1 | 2026-03-26 00:32:59 | 2026-03-26 00:32:59 | NULL | NULL | sha-256 | same sec |
| 27 | `20260327000001_add_customer_email_notifications` | 1 | 2026-03-27 21:10:14 | 2026-03-27 21:10:14 | NULL | NULL | sha-256 | same sec |
| 28 | `20260327000002_add_route_driver_and_route_name` | 1 | 2026-03-27 21:40:00 | 2026-03-27 21:40:02 | NULL | NULL | sha-256 | differs |
| 29 | `20260327000003_add_invoice_audit_fields` | 1 | 2026-03-27 21:40:02 | 2026-03-27 21:40:03 | NULL | NULL | sha-256 | differs |
| 30 | `20260327000004_add_truck_fields` | 1 | 2026-03-27 21:40:04 | 2026-03-27 21:40:05 | NULL | NULL | sha-256 | differs |
| 31 | `20260327000005_add_driver_hos_and_incident` | 1 | 2026-03-27 21:40:05 | 2026-03-27 21:40:05 | NULL | NULL | sha-256 | same sec |
| 32 | `20260327000006_add_push_token` | 1 | 2026-03-27 21:40:05 | 2026-03-27 21:40:06 | NULL | NULL | sha-256 | differs |
| 33 | `20260327000007_add_sysadmin_charge_type` | 1 | 2026-03-27 21:40:06 | 2026-03-27 21:40:07 | NULL | NULL | sha-256 | differs |
| 34 | `20260327000008_add_rls_support_tickets` | 1 | 2026-03-27 21:40:07 | 2026-03-27 21:40:08 | NULL | NULL | sha-256 | differs |
| 35 | `20260328000001_enable_rls_prisma_migrations_and_tenant` | 1 | 2026-03-28 15:47:53 | 2026-03-28 15:47:53 | NULL | NULL | sha-256 | same sec |
| 36 | `20260328000002_nullable_tenant_support_ticket` | 1 | 2026-03-28 17:19:04 | 2026-03-28 17:19:04 | NULL | NULL | sha-256 | same sec |
| 37 | `20260329000001_add_load_sequence` | 0 | 2026-04-04 05:52:45 | 2026-04-04 05:52:45 | NULL | '' (empty) | sha-256 | **exact** |
| 38 | `20260331000000_add_composite_indexes` | 1 | 2026-04-04 05:52:52 | 2026-04-04 05:52:52 | NULL | NULL | sha-256 | same sec |
| 39 | `20260331000001_add_missing_composite_indexes` | 0 | 2026-03-31 06:58:18 | 2026-03-31 06:58:18 | NULL | '' (empty) | sha-256 | **exact** |
| 40 | `20260404000001_route_stop_load_links` | 1 | 2026-04-04 05:52:53 | 2026-04-04 05:52:54 | NULL | NULL | sha-256 | differs |
| 41 | `20260404000002_invoice_trucking_standard` | 1 | 2026-04-04 06:35:41 | 2026-04-04 06:35:42 | NULL | NULL | sha-256 | differs |
| 42 | `20260404100001_carrier_clients` | 1 | 2026-04-05 00:50:19 | 2026-04-05 00:50:20 | NULL | NULL | `manual` | differs |
| 43 | `20260404100002_carrier_contracts` | 1 | 2026-04-05 00:50:20 | 2026-04-05 00:50:20 | NULL | NULL | `manual` | same sec |
| 44 | `20260404100003_carrier_facilities` | 1 | 2026-04-05 00:50:20 | 2026-04-05 00:50:20 | NULL | NULL | `manual` | same sec |
| 45 | `20260404100004_carrier_drivers_trucks` | 1 | 2026-04-05 00:50:20 | 2026-04-05 00:50:21 | NULL | NULL | `manual` | differs |
| 46 | `20260404100005_carrier_route_templates` | 1 | 2026-04-05 00:57:40 | 2026-04-05 00:57:40 | NULL | NULL | `manual` | same sec |
| 47 | `20260404100006_carrier_route_template_stops` | 1 | 2026-04-05 00:57:41 | 2026-04-05 00:57:41 | NULL | NULL | `manual` | same sec |
| 48 | `20260404100007_carrier_dispatches` | 1 | 2026-04-05 01:02:40 | 2026-04-05 01:02:41 | NULL | NULL | `manual` | differs |
| 49 | `20260404100008_carrier_loads` | 1 | 2026-04-05 01:02:41 | 2026-04-05 01:02:41 | NULL | NULL | `manual` | same sec |
| 50 | `20260404100009_carrier_stops` | 1 | 2026-04-05 01:02:41 | 2026-04-05 01:02:41 | NULL | NULL | `manual` | same sec |
| 51 | `20260404100010_carrier_documents` | 1 | 2026-04-05 01:15:38 | 2026-04-05 01:15:38 | NULL | NULL | `manual` | same sec |
| 52 | `20260404100011_carrier_expenses` | 1 | 2026-04-05 01:15:38 | 2026-04-05 01:15:39 | NULL | NULL | `manual` | differs |
| 53 | `20260404100012_driver_pay_records` | 1 | 2026-04-05 01:15:39 | 2026-04-05 01:15:39 | NULL | NULL | `manual` | same sec |
| 54 | `20260404100013_carrier_rls_policies` | 1 | 2026-04-05 01:42:48 | 2026-04-05 01:42:49 | NULL | NULL | `manual` | differs |
| 55 | `20260404100014_carrier_seed_enums` | 1 | 2026-04-05 01:52:03 | 2026-04-05 01:52:04 | NULL | NULL | `manual` | differs |
| 56 | `20260405000001_carrier_stop_doc_required_flags` | 1 | 2026-04-05 17:35:19 | 2026-04-05 17:35:19 | NULL | NULL | sha-256 | same sec |
| 57 | `20260406000001_facility_lumper_appointment_contacts` | 0 | 2026-04-06 04:01:10 | 2026-04-06 04:01:10 | NULL | '' (empty) | sha-256 | **exact** |
| 58 | `20260407000001_carrier_clients_payment_fields` | 1 | 2026-04-06 04:01:16 | 2026-04-06 04:01:17 | NULL | NULL | sha-256 | differs |
| 59 | `20260408000001_contract_add_missing_fields` | 1 | 2026-04-06 04:01:17 | 2026-04-06 04:01:18 | NULL | NULL | sha-256 | differs |
| 60 | `20260416000001_in_app_notifications` | 1 | 2026-04-17 01:47:09 | 2026-04-17 01:47:11 | NULL | NULL | sha-256 | differs |
| 61 | `20260417_add_carrier_truck_id_to_gps_location` | 1 | 2026-04-17 23:25:21 | 2026-04-17 23:25:22 | NULL | NULL | sha-256 | differs |
| 62 | `20260417050216_align_rate_type_superset` | 1 | 2026-04-17 05:03:00 | 2026-04-17 05:03:01 | NULL | NULL | sha-256 | differs |
| 63 | `20260417100001_add_vehicle_id_display_name` | 0 | 2026-04-19 18:14:30 | 2026-04-19 18:14:30 | NULL | '' (empty) | sha-256 | **exact** |
| 64 | `20260419000001_add_stop_completed_notification_type` | 1 | 2026-04-19 18:14:37 | 2026-04-19 18:14:37 | NULL | NULL | sha-256 | same sec |
| 65 | `20260419000002_add_pending_stops_json` | 1 | 2026-04-19 19:49:43 | 2026-04-19 19:49:44 | NULL | NULL | sha-256 | differs |
| 66 | `20260419100001_add_dispatch_id_read_at_to_fleet_message` | 1 | 2026-04-20 17:23:39 | 2026-04-20 17:23:39 | NULL | NULL | sha-256 | same sec |
| 67 | `20260420000001_add_fleet_message_notification_type` | 1 | 2026-04-20 20:10:34 | 2026-04-20 20:10:34 | NULL | NULL | sha-256 | same sec |
| 68 | `20260420100001_add_dispatch_generated_notification_type` | 1 | 2026-04-20 20:10:34 | 2026-04-20 20:10:34 | NULL | NULL | sha-256 | same sec |
| 69 | `20260422000001_add_carrier_document_type_catalog` | 1 | 2026-04-22 02:15:53 | 2026-04-22 02:15:53 | NULL | NULL | sha-256 | same sec |
| 70 | `20260422100001_drop_carrier_documents_type_check` | 1 | 2026-04-22 04:35:44 | 2026-04-22 04:35:44 | NULL | NULL | sha-256 | same sec |
| 71 | `20260422200001_add_tenant_contact_email_plan` | 0 | 2026-04-22 20:42:14 | 2026-04-22 20:42:14 | NULL | '' (empty) | sha-256 | **exact** |
| 72 | `20260422300001_add_stop_id_to_fleet_message` | 1 | 2026-04-22 20:42:33 | 2026-04-22 20:42:33 | NULL | NULL | sha-256 | same sec |
| 73 | `20260423000001_add_audio_url_to_fleet_message` | 1 | 2026-04-23 20:24:26 | 2026-04-23 20:24:28 | NULL | NULL | sha-256 | differs |
| 74 | `20260423100001_add_workflow_engine_foundation` | 1 | 2026-04-24 02:21:59 | 2026-04-24 02:21:59 | NULL | NULL | `manual` | same sec |
| 75 | `20260423200001_workflow_engine_execution` | 1 | 2026-04-24 05:01:36 | 2026-04-24 05:01:36 | NULL | NULL | sha-256 | same sec |
| 76 | `20260424100001_workflow_engine_inspection_mode` | 1 | 2026-04-24 18:06:45 | 2026-04-24 18:06:45 | NULL | NULL | sha-256 | same sec |
| 77 | `20260424120001_workflow_engine_automation` | 1 | 2026-04-24 19:26:23 | 2026-04-24 19:26:24 | NULL | NULL | sha-256 | differs |
| 78 | `20260425030001_phase46_playbook_step_overdue_fields` | 1 | 2026-04-25 03:41:02 | 2026-04-25 03:41:02 | NULL | NULL | `manual` | same sec |
| 79 | `20260428100001_add_playbook_instance_triggered_by` | 1 | 2026-04-29 04:48:35 | 2026-04-29 04:48:35 | NULL | NULL | `manual` | same sec |
| 80 | `20260429000001_tenant_self_onboarding` | 1 | 2026-04-29 04:48:36 | 2026-04-29 04:48:36 | NULL | NULL | `manual` | same sec |
| 81 | `20260429000002_seed_plans_and_automations` | 1 | 2026-04-29 04:48:36 | 2026-04-29 04:48:36 | NULL | NULL | `manual` | same sec |
| 82 | `20260501000001_phase50_01_carrier_trucks_is_sample` | 1 | 2026-05-03 00:53:38 | 2026-05-03 00:53:39 | NULL | NULL | `manual` | differs |
| 83 | `20260501000002_phase50_02_clients_is_sample` | 1 | 2026-05-03 00:53:39 | 2026-05-03 00:53:39 | NULL | NULL | `manual` | same sec |
| 84 | `20260501000003_phase50_03_loads_is_sample` | 1 | 2026-05-03 00:53:39 | 2026-05-03 00:53:39 | NULL | NULL | `manual` | same sec |
| 85 | `20260501000004_phase50_04_carrier_drivers_is_sample` | 1 | 2026-05-03 00:53:39 | 2026-05-03 00:53:39 | NULL | NULL | `manual` | same sec |
| 86 | `20260503000001_phase52_01_automation_run_schema` | 1 | 2026-05-04 00:14:19 | 2026-05-04 00:14:20 | NULL | NULL | sha-256 | differs |
| 87 | `20260503000002_phase52_postscript_add_delay_seconds` | 1 | 2026-05-09 01:11:41 | 2026-05-09 01:11:42 | NULL | NULL | `manual` | differs |
| 88 | `20260508000001_driver_pay_phase1` | 1 | 2026-05-09 01:11:42 | 2026-05-09 01:11:44 | NULL | NULL | `manual` | differs |
| 89 | `20260509000001_doc_feedback` | 1 | 2026-05-10 19:35:07 | 2026-05-10 19:35:08 | NULL | NULL | `manual` | differs |
| 90 | `20260514000001_driver_settlements_partial_unique` | 1 | 2026-05-14 00:27:08 | 2026-05-14 00:27:08 | NULL | NULL | `manual` | same sec |
| 91 | `20260514000002_settlement_employment_type_snapshot` | 1 | 2026-05-14 05:11:04 | 2026-05-14 05:11:04 | NULL | NULL | sha-256 | same sec |
| 92 | `20260514100001_backfill_employment_type_snapshot_retry` | 1 | 2026-05-14 15:49:11 | 2026-05-14 15:49:11 | NULL | NULL | sha-256 | **exact** |
| 93 | `20260514200001_add_notification_system` | 1 | 2026-05-14 17:34:11 | 2026-05-14 17:34:16 | NULL | NULL | sha-256 | differs |
| 94 | `20260514200002_add_notification_send_status_idempotent` | 1 | 2026-05-14 18:08:58 | 2026-05-14 18:08:58 | NULL | NULL | `manual` | same sec |
| 95 | `20260515_pii_encryption_pr1` | 1 | 2026-05-15 05:59:41 | 2026-05-15 05:59:42 | NULL | NULL | sha-256 | differs |
| 96 | `20260515000001_db_security_standardization` | 1 | 2026-05-15 04:38:24 | 2026-05-15 04:38:25 | NULL | NULL | sha-256 | differs |
| 97 | `20260516000001_driver_invitation_pii_encryption` | 1 | 2026-05-16 17:44:11 | 2026-05-16 17:44:11 | NULL | NULL | `manual` | same sec |
| 98 | `20260516100001_restricted_documents` | 1 | 2026-05-16 18:58:18 | 2026-05-16 18:58:19 | NULL | NULL | sha-256 | differs |
| 99 | `20260516100002_restricted_documents_column` | 1 | 2026-05-16 18:58:19 | 2026-05-16 18:58:20 | NULL | NULL | sha-256 | differs |
| 100 | `20260517000001_tkt0015_2a_cleanup_audit_fks` | 1 | 2026-05-17 04:16:50 | 2026-05-17 04:16:50 | NULL | NULL | sha-256 | **exact** |
| 101 | `20260517100001_tkt0015_2b_wave1_smoke_audit_columns` | 1 | 2026-05-17 05:04:09 | 2026-05-17 05:04:09 | NULL | NULL | `manual` | same sec |
| 102 | `20260517150001_tkt0015_2b_wave2_fleet_audit_columns` | 1 | 2026-05-17 19:55:31 | 2026-05-17 19:55:31 | NULL | NULL | sha-256 | **exact** |
| 103 | `20260517200001_tkt0015_2b_wave3_finance_crm_audit_columns` | 1 | 2026-05-17 20:24:24 | 2026-05-17 20:24:24 | NULL | NULL | `manual` | same sec |
| 104 | `20260517250001_tkt0015_2b_wave4_driver_pay_audit_columns` | 1 | 2026-05-18 04:52:15 | 2026-05-18 04:52:15 | NULL | NULL | `manual` | same sec |
| 105 | `20260518000001_tkt0016_align_facility_type_catalog` | 1 | 2026-05-19 04:03:10 | 2026-05-19 04:03:11 | NULL | NULL | sha-256 | differs |
| 106 | `20260519000001_add_grid_view_model` | 1 | 2026-05-19 06:23:35 | 2026-05-19 06:23:35 | NULL | NULL | `manual` | same sec |
| 107 | `20260520000001_add_carrier_truck_photo_s3_key` | 1 | 2026-05-19 19:24:45 | 2026-05-19 19:24:45 | NULL | NULL | sha-256 | same sec |
| 108 | `20260521000001_backfill_activation_progress` | 1 | 2026-05-21 15:21:27 | 2026-05-21 15:21:27 | NULL | NULL | sha-256 | same sec |
| 109 | `20260524113337_rename_carrier_dispatch_to_trip_add_stop_checklist_fields` | 1 | 2026-05-24 16:33:59 | 2026-05-24 16:34:00 | NULL | NULL | sha-256 | differs |
| 110 | `20260527000001_quick410_advisor_rls_fix` | 1 | 2026-05-27 18:23:01 | 2026-05-27 18:23:01 | NULL | NULL | `manual` | same sec |
| 111 | `20260530000001_add_trip_deleted_at_deleted_by_id` | 1 | 2026-05-30 20:54:20 | 2026-05-30 20:54:21 | NULL | NULL | `manual` | differs |
| 112 | `20260530000002_add_soft_delete_columns_drift_fix` | 1 | 2026-06-02 22:26:56 | 2026-06-02 22:26:56 | NULL | NULL | `manual` | same sec |
| 113 | `20260602000001_phase1_grant_app_user_dml` | 1 | 2026-06-02 23:25:20 | 2026-06-02 23:25:21 | NULL | NULL | `manual` | differs |
| 114 | `20260611000001_fix_carrier_rls_jwt_policies` | 1 | 2026-06-12 00:08:55 | 2026-06-12 00:09:00 | NULL | NULL | sha-256 | differs |
| 115 | `20260717_route_carrier_truck` | 1 | 2026-07-18 04:05:31 | 2026-07-18 04:05:32 | NULL | NULL | sha-256 | differs |
| 116 | `20260717000001_fix_carrier_truck_type_check` | 1 | 2026-07-18 01:20:58 | 2026-07-18 01:20:58 | NULL | NULL | `manual` | same sec |
| 117 | `20260717000002_add_light_duty_truck_types` | 1 | 2026-07-18 02:35:25 | 2026-07-18 02:35:25 | NULL | NULL | `manual` | same sec |
| 118 | `20260717000003_fix_carrier_driver_pay_model_check` | 1 | 2026-07-18 03:36:28 | 2026-07-18 03:36:28 | NULL | NULL | `manual` | same sec |
| 119 | `20260717000004_fix_carrier_driver_cdl_class_and_status_checks` | 1 | 2026-07-18 03:36:28 | 2026-07-18 03:36:28 | NULL | NULL | `manual` | same sec |
| 120 | `20260717000005_fix_carrier_truck_status_check` | 1 | 2026-07-18 03:36:28 | 2026-07-18 03:36:28 | NULL | NULL | `manual` | same sec |
| 121 | `20260717000006_fix_driver_pay_records_pay_model_check` | 1 | 2026-07-18 03:36:28 | 2026-07-18 03:36:28 | NULL | NULL | `manual` | same sec |
| 122 | `20260717000007_fix_loads_load_type_check` | 1 | 2026-07-18 03:36:28 | 2026-07-18 03:36:29 | NULL | NULL | `manual` | differs |
| 123 | `20260722000001_add_user_onboarding_tour_seen` | 1 | 2026-07-22 19:15:46 | 2026-07-22 19:15:46 | NULL | NULL | `manual` | same sec |
| 124 | `20260722000002_add_tenant_truck_count` | 1 | 2026-07-22 19:15:46 | 2026-07-22 19:15:46 | NULL | NULL | `manual` | same sec |
| 125 | `20260722000003_add_tenant_heard_about` | 1 | 2026-07-22 19:15:46 | 2026-07-22 19:15:47 | NULL | NULL | `manual` | differs |
| 126 | `20260722000004_add_client_contacts` | 0 | 2026-07-22 19:10:36 | 2026-07-22 19:10:36 | NULL | '' (empty) | sha-256 | **exact** |
| 127 | `20260722000005_backfill_client_contacts` | 0 | 2026-07-22 19:10:57 | 2026-07-22 19:10:57 | NULL | '' (empty) | sha-256 | **exact** |
| 128 | `20260802120000_document_import_phase1` | 1 | 2026-08-02 19:39:10 | 2026-08-02 19:39:11 | NULL | NULL | sha-256 | differs |
| 129 | `20260802173535_widen_facility_type_check` | 0 | 2026-08-02 22:36:24 | 2026-08-02 22:36:24 | NULL | '' (empty) | sha-256 | **exact** |
| 130 | `20260802174618_add_push_notification_channel` | 0 | 2026-08-02 22:46:33 | 2026-08-02 22:46:33 | NULL | '' (empty) | sha-256 | **exact** |
| 131 | `20260802230853_add_appointment_is_firm` | 0 | 2026-08-03 04:09:28 | 2026-08-03 04:09:28 | NULL | '' (empty) | sha-256 | **exact** |
| 132 | `20260803115314_add_raw_response` | 0 | 2026-08-03 16:54:15 | 2026-08-03 16:54:15 | NULL | '' (empty) | sha-256 | **exact** |
| 133 | `20260806040500_add_resolution_provenance` | 0 | 2026-08-06 04:31:28 | 2026-08-06 04:31:28 | NULL | '' (empty) | sha-256 | **exact** |
| 134 | `20260811120000_end_stop_facility_and_matrix_cache` | 0 | 2026-08-11 18:17:08 | 2026-08-11 18:17:08 | NULL | '' (empty) | sha-256 | **exact** |
| 135 | `20260823120000_route_template_stops_relay_handoff` | 0 | 2026-08-24 04:18:42 | 2026-08-24 04:18:42 | NULL | '' (empty) | sha-256 | **exact** |
| 136 | `20260823120100_facilities_deleted_at` | 0 | 2026-08-24 04:18:42 | 2026-08-24 04:18:42 | NULL | '' (empty) | sha-256 | **exact** |
| 137 | `20260823120200_facilities_country_normalise` | 0 | 2026-08-24 04:18:42 | 2026-08-24 04:18:42 | NULL | '' (empty) | sha-256 | **exact** |
| 138 | `20260824120000_facilities_deleted_by_id` | 0 | 2026-08-25 00:03:09 | 2026-08-25 00:03:09 | NULL | '' (empty) | sha-256 | **exact** |
| 139 | `20260825120000_add_carrier_truck_defects` | 0 | 2026-08-25 07:43:38 | 2026-08-25 07:43:38 | NULL | '' (empty) | sha-256 | **exact** |
| 140 | `20260825140000_notification_push_channel_and_categories` | 0 | 2026-08-26 02:53:55 | 2026-08-26 02:53:55 | NULL | '' (empty) | sha-256 | **exact** |
| 141 | `20260902120000_seed_notification_email_config` | 0 | 2026-09-02 17:56:43 | 2026-09-02 17:56:43 | NULL | '' (empty) | sha-256 | **exact** |

---

## 2. Do the never-run markers describe real production state?

### 2.1 The 20 markers

For each of the 20 `applied_steps_count = 0` rows, the migration file was read
and every object it creates was looked for in production, by one query over
`information_schema.columns`, `pg_indexes`, `pg_tables`, `pg_constraint`,
`pg_enum` and — for the two data-only migrations — the affected rows.

| # | migration | claimed | objects checked | present | verdict |
|---|---|---|---|---|---|
| 1 | `20260329000001_add_load_sequence` | applied | `Load.sequence`, `Load_routeId_sequence_idx` | yes | true claim, other route |
| 2 | `20260331000001_add_missing_composite_indexes` | applied | 3 indexes | yes | true claim, other route |
| 3 | `20260406000001_facility_lumper_appointment_contacts` | applied | 3 `facilities` columns | yes | true claim, other route |
| 4 | `20260417100001_add_vehicle_id_display_name` | applied | 2 `carrier_trucks` columns, unique index, `NOT NULL` | yes | true claim, other route |
| 5 | `20260422200001_add_tenant_contact_email_plan` | applied | `Tenant.contactEmail`, `Tenant.plan` | yes | true claim, other route |
| 6 | `20260722000004_add_client_contacts` | applied | table, partial unique index, policy, grant | yes | true claim, other route |
| 7 | `20260722000005_backfill_client_contacts` | applied | 16 contact rows; 2 clients unbackfilled | yes | true claim, other route |
| 8 | `20260802173535_widen_facility_type_check` | applied | CHECK admits `driver_residence` | yes | true claim, other route |
| 9 | `20260802174618_add_push_notification_channel` | applied | `NotificationChannel` has `PUSH` | yes | true claim, other route |
| 10 | `20260802230853_add_appointment_is_firm` | applied | `stops.appointment_is_firm` | yes | true claim, other route |
| 11 | `20260803115314_add_raw_response` | applied | `document_import_pages.raw_response` | yes | true claim, other route |
| 12 | `20260806040500_add_resolution_provenance` | applied | `document_imports.resolution_provenance` | yes | true claim, other route |
| 13 | `20260811120000_end_stop_facility_and_matrix_cache` | applied | column, FK, table, 2 indexes | yes | true claim, other route |
| 14 | `20260823120000_route_template_stops_relay_handoff` | applied | CHECK admits `relay_handoff` | yes | true claim, other route |
| 15 | `20260823120100_facilities_deleted_at` | applied | `facilities.deleted_at` | yes | true claim, other route |
| 16 | `20260823120200_facilities_country_normalise` | applied | 0 rows spelled `United States` | yes | true claim, other route |
| 17 | `20260824120000_facilities_deleted_by_id` | applied | `facilities.deleted_by_id` | yes | true claim, other route |
| 18 | `20260825120000_add_carrier_truck_defects` | applied | table, unique index, policy, grant | yes | true claim, other route |
| 19 | `20260825140000_notification_push_channel_and_categories` | applied | 2 enum labels, 2 columns | yes | true claim, other route |
| 20 | `20260902120000_seed_notification_email_config` | applied | 1 `NotificationEmailConfig` row | yes | true claim, other route |

**Every object each marker claims is present in production: 0 false claims and
0 indeterminate among the 20.** These rows are honest about *state* and silent
about *execution* — which is what a resolved-not-run marker is for. Marker 4 is
the proof that the two are different questions: its file contains a window
function inside `UPDATE … SET`, which PostgreSQL rejects at parse-analysis, so
it has never executed anywhere, yet both its columns are live because a
separately-named Supabase migration created them.

One data-level note that is not a ledger fault. Marker 7's backfill leaves two
clients with legacy contact data and no `client_contacts` row — `Nike INC`
(created 2026-07-23) and `APEX FREIGHT BROKERAGE LLC` (created 2026-08-06).
Both were created *after* the backfill's timestamp of 2026-07-22 19:10:57, so
the backfill is complete as of when it ran; the gap is a write path that does
not create a contact row.

### 2.2 False claims among the `steps = 1` rows

The markers are clean. The rows quick-460 declared sound are not.

The rebuilt staging database is the oracle: it ran all 147 migrations and
nothing else, so **any object present there and absent from production is an
object the chain produces and production never received.** Each such object was
attributed to its creating migration by searching the chain for its name, and
that migration's production ledger row was then read.

Nine migrations qualify. **All nine carry `applied_steps_count = 1`:**

| migration | steps | at least one object absent from production |
|---|---|---|
| `20260303000001_add_support_ticket` | 1 | enum type `SupportTicketType`; `SupportTicket_submittedBy_fkey`; `SupportTicket_tenantId_fkey` |
| `20260309000001_extend_support_ticket_add_messages` | 1 | `TicketMessage_ticketId_fkey` |
| `20260327000002_add_route_driver_and_route_name` | 1 | `RouteDriver_routeId_driverId_key` (constraint) |
| `20260327000005_add_driver_hos_and_incident` | 1 | `DriverIncident_reportedAt_idx` |
| `20260327000006_add_push_token` | 1 | `PushToken_userId_platform_key` (constraint) |
| `20260508000001_driver_pay_phase1` | 1 | `lda_unique_load_driver` |
| `20260515_pii_encryption_pr1` | 1 | `audit_log_user_fk` |
| `20260515000001_db_security_standardization` | 1 | **90 named objects and 236 columns** |
| `20260530000001_add_trip_deleted_at_deleted_by_id` | 1 | `idx_dispatches_org_id_deleted_at` |

Two of these deserve their own paragraph.

**`20260303000001_add_support_ticket` creates an enum type production does not
have.** The statement is unconditional apart from a duplicate guard:

```sql
DO $$ BEGIN
  CREATE TYPE "SupportTicketType" AS ENUM ('BUG', 'FEATURE_REQUEST', 'QUESTION', 'ACCOUNT_ISSUE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

Production's enum types beginning `SupportTicket`:

```
SupportTicketCategory : BILLING,BUG,FEATURE,GENERAL
SupportTicketPriority : LOW,NORMAL,HIGH,URGENT
SupportTicketStatus   : OPEN,IN_PROGRESS,RESOLVED,CLOSED,WAITING_ON_CUSTOMER
```

`SupportTicketType` is not there. Nothing in the chain drops it — a repo-wide
search for `DROP TYPE` returns nothing — and the rebuild still has it. The same
migration declares `SupportTicket`'s foreign keys, and production has none of
them:

```
PROD SupportTicket foreign keys : SupportTicket_createdById_fkey, SupportTicket_updatedById_fkey
PROD TicketMessage foreign keys : (none)
```

Those two that do exist come from a later audit-column migration. **A ticket
message in production can therefore reference a ticket that does not exist**,
because the foreign key its creating migration declares was never created.

**`20260515000001_db_security_standardization` is the largest single false
claim.** Its ledger row says applied, `steps = 1`, with a checksum matching the
file byte-for-byte. It is a flat list of `ALTER TABLE` statements — 764 lines,
no loop, six exception handlers — and the rebuild shows it produces 90 named
objects and 236 audit columns that production does not have. Production carries
the full audit-column set on only six tables. Because the file is applied inside
a single transaction, a partial result cannot come from one execution of it:
the six tables that do have the columns got them some other way.

---

## 3. Repo against ledger

The repository holds 147 migration directories; production's ledger holds 141
rows.

```
comm -23 repo_names.txt ledger_names.txt      # in repo, no ledger row
comm -13 repo_names.txt ledger_names.txt      # ledger row, no repo directory
```

**Ledger rows with no repo directory — 1:**

| migration | note |
|---|---|
| `20260611000001_fix_carrier_rls_jwt_policies` | applied 2026-06-12, `steps = 1`, real SHA-256, 4.775 s |

**quick-460 named this one and it is still the only one.** No new orphan has
appeared since June 2026.

**Repo directories with no production ledger row — 7:**

```
20260330000001_repair_document_driver_id
20260419000001_repair_fleet_message_recipient_id
20260515000000_repair_carrier_compliance_alert_log
20260516100000_repair_document_type_enum
20260516100001a_repair_document_document_type_column
20260602000000_repair_ticketmessage_app_user_grant
20260909120000_reconcile_rls_policy_drift
```

All seven are expected and none is a defect: six are quick-593's chain repairs,
written to be no-ops against production, and the seventh is quick-591's policy
reconciliation. Production's ledger correctly does not contain them.

---

## 4. DDL in production that no migration produces

The test is stronger than a text search. **Staging ran every one of the 147
migrations; an object absent from staging is therefore an object no migration
creates.** A name search across the chain was run as corroboration and agrees.

An object counts as absent from a side only when neither its **name** nor its
**shape** appears there, so a renamed-but-identical object is never miscounted.

| class | production objects the rebuild does not produce |
|---|---|
| tables | **1** |
| columns | **32** |
| indexes | **15** |
| constraints | **7** |
| enum types | 0 |
| **total** | **55** |

19 of the 20 named objects (indexes and constraints) are mentioned by no
migration file at all. The twentieth, `route_matrix_cache_org_key_unique`, is
named by `20260811120000_end_stop_facility_and_matrix_cache`, but that file
declares it as `CREATE UNIQUE INDEX` while production holds it as a table
constraint — so production's object did not come from the file either.

### quick-460's two named items

**`in_app_notifications` unique constraint — CONFIRMED.** Present in production,
absent from the rebuild, created by no file, no ledger row of its own:

```
in_app_notifications_org_id_entity_id_type_key  UNIQUE public.in_app_notifications USING btree (org_id, entity_id, type)
```

**`carrier_compliance_alert_log` — half confirmed, and the half that changed
matters.** The table is in production and remains outside the chain's history,
but since 2026-09-11 a file *does* create it:
`20260515000000_repair_carrier_compliance_alert_log`, quick-593's repair, which
production's ledger does not contain. So "neither a file nor a ledger row" is no
longer literally true. Production's copy has exactly the seven original columns:

```
id, org_id, alert_type, entity_id, message, severity, created_at
```

`20260515000001_db_security_standardization` adds four audit columns to this
table and its production ledger row says `steps = 1`. They are not there. This
table is a single concrete instance of §2.2's largest false claim.

### The others

Everything else in the 55 is newly enumerated here.

**Table (1):** `grid_preference` — 11 columns, a primary key, a composite unique
index and one plain index. It appears in the repository only inside the
allowlist of `20260602000001_phase1_grant_app_user_dml`, which is a list of
names and so never required the table to exist.

**Columns (32):** `ActivationProgress.congratsShownAt` · `Document.description`,
`.expiryDate`, `.externalUrl`, `.loadId`, `.notes` · `DriverInvitation.address`,
`.dateOfBirth`, `.fullName`, `.licenseExpirationDate`, `.middleName`,
`.phoneNumber` · `FleetMessage.isBroadcast`, `.loadId` ·
`PayrollRecord.archivedAt`, `.createdById`, `.updatedById` ·
`SupportTicket.attachmentKey`, `.attachmentUrl`, `.platform`, `.screenshotKey` ·
plus `grid_preference`'s 11. This confirms and completes quick-593's list of 21
across six tables; the remaining 11 are the untracked table's own.

**Indexes (15):** `AutomationRun_eventId_ruleId_idx`, `Document_driverId_idx`,
`Document_expiryDate_idx`, `Document_loadId_idx`, `DriverIncident_severity_idx`,
`DriverIncident_tenantId_reportedAt_idx`, `FleetMessage_loadId_idx`,
`FleetMessage_senderId_idx`, `PayrollRecord_archivedAt_idx`,
`RouteDriver_tenantId_createdAt_idx`, `grid_preference_pkey`,
`grid_preference_userId_gridId_key`, `grid_preference_userId_idx`,
`in_app_notifications_org_id_entity_id_type_key`,
`load_driver_assignments_load_id_driver_id_active_unique`.

**Constraints (7):** `Document_loadId_fkey`, `PayrollRecord_createdById_fkey`,
`PayrollRecord_updatedById_fkey`, `audit_log_user_id_fkey`,
`grid_preference_pkey`, `in_app_notifications_org_id_entity_id_type_key`,
`route_matrix_cache_org_key_unique`.

---

## 5. Reconciliation

Compared by query on both sides, never by eye, using `pg_catalog` rather than
`information_schema` — the latter filters by the connecting role's privileges
and would make a privilege difference look like a schema one. Both sessions
connected as `postgres`, so nothing was filtered either way.

### 5.1 Present in production, absent from the rebuild — 55

Listed in full in §4. This set and the untracked-object set are **identical**,
and that is itself a finding: every object production holds that the chain does
not produce is also an object no migration file creates. There is no third
category of "in production, produced by a migration the ledger forgot".

### 5.2 Present in the rebuild, absent from production — 349

| class | count | what it is |
|---|---|---|
| tables | 1 | `policy_drop_audit` — quick-591's migration, correctly not in production's ledger |
| columns | 246 | 236 audit columns from `20260515000001`, plus `policy_drop_audit`'s own 10 |
| indexes | 93 | 90 from `20260515000001`, the rest attributed in §2.2 |
| constraints | 8 | listed below |
| enum types | 1 | `SupportTicketType` |

The 246 columns were classified rather than eyeballed: excluding
`policy_drop_audit`, **every one is `createdBy`, `updatedBy`, `deletedAt`,
`deletedBy` or a snake_case sibling** — a filter for anything else returns
nothing. A single migration adds them all.

The 93 indexes are dominated by one naming family,
`idx_<Table>_tenantId_createdAt` and `idx_<table>_org_id_deleted_at`, again from
`20260515000001`.

The 8 constraints: `PushToken_userId_platform_key`,
`RouteDriver_routeId_driverId_key`, `SupportTicket_submittedBy_fkey`,
`SupportTicket_tenantId_fkey`, `TicketMessage_ticketId_fkey`,
`audit_log_user_fk`, `lda_unique_load_driver`, `policy_drop_audit_pkey`. For the
first two the *uniqueness* is still enforced in production by an
identically-named unique index; only the constraint object is missing. For the
three on `SupportTicket` and `TicketMessage` nothing enforces them at all.

**This confirms quick-593 and completes it.** Its 21 columns across six tables
plus `grid_preference` are exactly reproduced. Its audit-column finding on
`carrier_compliance_alert_log` is reproduced and shown to be one instance of a
236-column pattern.

### 5.3 The category quick-593 did not measure: objects on both sides that differ

Comparing only presence and absence misses divergence. For the 1,558 columns and
the constraints present on both sides:

| divergence | count |
|---|---|
| column **type** differs | **43** |
| column **nullability** differs | **3** |
| column **default** differs | **38** |
| constraint **definition** differs | **110** |
| index/constraint present on both under **different names** | 83 indexes · 32 constraints |

Of the 110 constraint divergences, **87 differ only by production carrying
`ON UPDATE CASCADE`** where the chain writes no `ON UPDATE` clause at all. The
chain's own text, from `20260517200001`:

```sql
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
```

Production holds `FOREIGN KEY ("createdById") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL`.
Because the statement is wrapped in an `IF NOT EXISTS` guard, the file skipped a
constraint that was already there — created by something else.

The remaining 23 include six with different **referential actions**, which
change behaviour rather than metadata:

| constraint | production | rebuild |
|---|---|---|
| `DriverHOSEntry_tenantId_fkey` | `ON DELETE RESTRICT` | `ON DELETE CASCADE` |
| `DriverHOSEntry_driverId_fkey` | `ON DELETE RESTRICT` | `ON DELETE CASCADE` |
| `DriverIncident_tenantId_fkey` | `ON DELETE RESTRICT` | `ON DELETE CASCADE` |
| `DriverIncident_driverId_fkey` | `ON DELETE RESTRICT` | `ON DELETE CASCADE` |
| `in_app_notifications_org_id_fkey` | `ON DELETE RESTRICT` | `ON DELETE CASCADE` |
| `GPSLocation_truckId_fkey` | `ON DELETE SET NULL` | `ON DELETE RESTRICT` |

And one CHECK that production has widened out of band:
`carrier_documents_parent_type_check` admits `client` in production and does not
in the rebuild.

The 43 type differences matter more than they look. Seven are cosmetic —
`timestamp with time zone` against `timestamp(6) with time zone` is the same
type, since 6 is the default precision. The other 36 are real:

| column | production | rebuild |
|---|---|---|
| `driver_pay_records.bonuses` / `.tips` / `.deductions` / `.reimbursements` | `numeric(65,30)` | `numeric(8,2)` |
| `route_templates.scheduled_departure_time` | `text` | `time without time zone` |
| `audit_log.ip_address` | `text` | `inet` |
| `carrier_expenses.currency` | `text` | `character(3)` |
| 28 further `varchar(n)` columns — `stops.status`, `loads.status`, `dispatches.status`, `route_templates.template_name` and others | `text` | `character varying(n)` |

Production has lost every length limit the chain declares, and four money
columns are unconstrained `numeric(65,30)` rather than `numeric(8,2)`.

### 5.4 What matches exactly

Worth recording, because it narrows where the damage is:

| class | production | staging | difference |
|---|---|---|---|
| RLS policies | 179 | 179 | **0** |
| `app_user` table grants | 356 | 356 | **0** |
| functions | 190 | 191 | 1 — quick-591's `policy_drop_audit_fn()` |
| RLS enabled/forced flags | 98 | 98 | only the two known table differences |

---

## 6. Verdict

**No. The ledger cannot be trusted as a record of what ran.** It is a reasonable
record of *intent* and an unreliable record of *execution*. Four independent
lines of evidence, none of which depends on another:

1. **20 rows say applied and record no execution.** `applied_steps_count = 0`,
   empty logs, zero duration. They are resolved-not-run markers. Their *state*
   claims all hold (§2.1), but one of them —
   `20260417100001_add_vehicle_id_display_name` — contains SQL PostgreSQL cannot
   parse, so it has demonstrably never executed against any database while
   sitting in the ledger as applied.

2. **9 rows say applied, `steps = 1`, and the work is not in production**
   (§2.2). One of them is missing 90 named objects and 236 columns. Another is
   missing an enum type and the foreign keys that keep ticket messages attached
   to tickets. These are the rows quick-460 counted as sound.

3. **A checksum can describe bytes that have never existed here.**
   `20260327000006_add_push_token`'s recorded hash matches no version of the
   file in git history, and the object it creates is the wrong object class in
   production (§1.2). Where the ledger's own integrity field disagrees with the
   repository, the ledger is not self-checking.

4. **The shape of production's objects is not the shape the files produce**
   (§5.3). 87 foreign keys carry an `ON UPDATE CASCADE` the chain never writes;
   83 indexes and 32 constraints carry Prisma-style generated names against the
   chain's hand-written ones; 36 columns carry Prisma's unconstrained types
   where the chain declares `varchar(n)`, `time`, `inet` and `numeric(8,2)`.

Points 3 and 4 have one economical explanation, offered as the best-supported
reading rather than as something proved: **production's schema has been shaped
largely by Prisma's schema-sync path — `db push` or `migrate dev` against
`schema.prisma` — while the ledger recorded the authored files as applied.**
That single mechanism accounts for the generated constraint and index names, the
`ON UPDATE CASCADE` default, the `varchar → text` and `numeric(8,2) → numeric(65,30)`
widening, the missing `NOT NULL` and defaults, the disappearance of an orphaned
`SupportTicketType` enum that no longer appeared in `schema.prisma`, and the
`IF NOT EXISTS` guards throughout the chain quietly skipping objects that were
already present in a different form.

What can be relied on:

- **`migration_name` is trustworthy as a list of names that will not be
  re-run.** `scripts/migrate.mjs` skips on name alone, so the ledger does
  correctly prevent re-execution. That is the one guarantee it delivers, and it
  is what kept the 20 markers harmless.
- **Everything else — `applied_steps_count`, `checksum`, the timestamps —
  describes what somebody intended, not what the database received.**

The practical consequence for the next task: **production state must be read
from production, never inferred from the ledger.** DEC-14's rule for CHECK
constraints turns out to be the general case, not a special one.

---

## Method and limits

- Two databases, both read-only. Every session opened with
  `SET default_transaction_read_only = on`. Comparison scripts issue `SELECT`
  only, against `pg_catalog`.
- Repo-side hashes are computed over LF-normalised bytes, matching the
  convention the 91 matching checksums confirm. The working tree is CRLF
  (`core.autocrlf=true`, no `.gitattributes`), so normalising is required.
- The rebuild is treated as the authority on what the chain produces. It is a
  true replay: 147 rows, all `applied_steps_count = 1`, all checksum `manual`,
  zero unfinished — every one genuinely executed by `scripts/migrate.mjs`.
- **Limits, stated rather than hidden.** Three `steps = 1` rows with
  microsecond-identical timestamps are unresolved (§1.1). The false-claim count
  of 9 is a **lower bound**: it counts migrations whose *named* objects
  (indexes, constraints, enum types) or *audit columns* are missing. A migration
  whose only unapplied effect was a data change, a `NOT NULL`, a default or a
  type would not be caught by name attribution, and §5.3 shows all four
  categories diverge. Staging holds no rows, so no data-level claim was tested
  against it.
- quick-593's staging rebuild is six of six repairs plus one policy migration
  ahead of production. Those seven are accounted for in §3 and excluded from the
  gap counts wherever they would inflate them.
