# quick-609 — Harden `scripts/cleanup-test-tenants.ts`

## What the script does today (Step 1)

365 lines. `main()` lists every tenant, filters by prefix, and deletes.

- **Connection:** `const pool = new Pool({ connectionString: process.env.DATABASE_URL });` (line 21)
  after `import 'dotenv/config'` (line 11). **No project-ref check anywhere** — grep for the
  production ref returns 0, for `_bootstrap-env` returns 0.
- **Guard:** `ALLOWED_PREFIXES = ['FI-Test-', 'MT-Test-']` + `name.startsWith(prefix)`. A record
  name check, not a database check. `FI-Test-Logistics` would be deleted.
- **Order:** 15 steps, a-o: driver_pay_records · carrier_expenses · carrier_documents (+Storage) ·
  stops · loads · dispatches · route_template_stops · route_templates · contracts · clients ·
  facilities · carrier_trucks · carrier_drivers · User (+Supabase Auth) · Tenant.
- **NOT transactional.** Each step is its own `try { … } catch { console.error(…) }` that LOGS AND
  CONTINUES. A blocked delete leaves a half-deleted tenant and the run still counts it as processed.
- **Always exits 0.** `main().finally(...)` — no exit code on failure.
- **No dry run.**

## Measured FK reality (Step 5)

81 inbound FKs on `Tenant`: **17 CASCADE, 64 RESTRICT** (the brief said 20/61 — measured differs,
reported). The script empties **11 of the 64**. Missing and present on the ZZ tenants:
`document_imports`, `document_import_pages`, `facility_external_references`,
`in_app_notifications`, `NotificationLog`, `StepInstance`.

So the current order is not merely wrong, it **cannot succeed** on the tenants it would next be
pointed at — and because it swallows each failure, it would report success having deleted a tenant's
children and left the tenant.

## Design

1. **Ref guard** — reuse quick-607's `scripts/_db-target.ts` (`projectRefOf`, `maskConnectionString`,
   `PRODUCTION_REF`). Banner first, refuse the production ref without `--allow-production`.
2. **Dry-run by default.** `--delete-for-real` is the destructive flag — a phrase, not `--force`.
   It additionally REQUIRES `--expect=<N>` matching the number of matched tenants exactly; a
   mismatch aborts. "How many did you think you were deleting" is the control that catches a
   pattern that matched more than intended.
3. **Pattern, not prefix.** The disposable generators all end in `Date.now()` — 13 digits. Require
   that. `FI-Test-Logistics` cannot match; `FI-Test-Tenant-1789503263285` can.
4. **Delete order derived AT RUNTIME** from `pg_constraint`, topologically sorted over blocking
   edges only (CASCADE children clean themselves up). A hardcoded list goes stale the next time the
   schema grows a table — which is exactly how the current list came to cover 11 of 64.
5. **One transaction.** All deletes plus the `Tenant` delete commit together or roll back. A
   half-deleted tenant is worse than none.
   *Deliberately the opposite of quick-608's teardown*, which avoided a transaction because the pool
   was exhausted and a partial delete was better than none. Different failure mode, different
   answer — recorded so the two are not read as contradictory.

## Tasks
1. Rewrite the script: guard, banner, dry-run, pattern, runtime order, transaction, exit codes.
2. Prove on staging: disposable tenant with children across 5+ tables → dry run → real run.
3. Prove the production refusal.

## Constraints
- No installs. No production writes, not even with the flag. No ZZ- tenant deleted anywhere.
- Only a tenant this task creates on staging may be deleted.
