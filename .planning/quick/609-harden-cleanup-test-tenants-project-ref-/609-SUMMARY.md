# quick-609 — Harden `scripts/cleanup-test-tenants.ts`

## 1. What the script actually did

**Connection — no check of any kind.** Line 21, immediately after `import 'dotenv/config'`:

```ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

That is the whole ref-resolution path. Grep for the production ref: **0**. For `_bootstrap-env`: **0**.
Nothing anywhere in 365 lines asks which database it opened.

Worth adding, because it changes the risk picture: the header says *"Run with (from apps/web)"*, and
**`apps/web/.env` does not exist** — `dotenv/config` resolves `.env` from the cwd, so run exactly as
documented it loads nothing and `DATABASE_URL` comes from the ambient environment alone. Run from the
repo root, or with the variable exported, it is production.

**Guard:** `ALLOWED_PREFIXES = ['FI-Test-','MT-Test-']` with `name.startsWith(prefix)`. A check on the
name of the record being deleted, not on the database it lives in.

**Order — 15 steps, a–o:** `driver_pay_records` · `carrier_expenses` · `carrier_documents` (+Storage)
· `stops` · `loads` · `dispatches` · `route_template_stops` · `route_templates` · `contracts` ·
`clients` · `facilities` · `carrier_trucks` · `carrier_drivers` · `User` (+Supabase Auth) · `Tenant`.

**Not transactional.** Every step is its own `try { … } catch (err) { console.error(…) }` that logs
and **continues**. **On partial failure** it proceeds to the next table and still counts the tenant
under `Tenants processed`. **It always exits 0** — `main().finally(...)` sets no exit code. There was
**no dry run**.

## 2-3. Guard and dry run

- Project-ref guard reusing quick-607's `scripts/_db-target.ts`; banner printed **before anything
  else**, credentials masked; production refused unless `--allow-production`.
- **Dry run is the default.** The destructive flag is `--delete-for-real` — a phrase, not `--force`.
- `--delete-for-real` additionally **requires `--expect=<N>`** matching the matched count exactly. A
  confirmation prompt cannot do this: "yes" is the same keystroke for 1 tenant or 40. Stating the
  number first is what catches a pattern that matched more than intended. Proven:
  `REFUSING TO DELETE — --expect=3 but 1 tenant(s) matched.`

## 4. The prefix list — replaced, because a prefix is the wrong control

`FI-Test-Logistics` is a name a real customer could hold, and `startsWith('FI-Test-')` would have
deleted it and all its data. A prefix is a namespace claim that nothing enforces.

Every disposable tenant in this repo is generated with a `Date.now()` suffix, so the test is a known
generator prefix **AND a terminal 13-digit epoch** — a shape no human types into a company name:

```
DISPOSABLE_PREFIXES = ['ZZ-THROWAWAY-', 'FI-Test-Tenant-', 'MT-Test-Org']
EPOCH_STAMP         = /-\d{13}$/
```

Verified against the real names on production:

| left alone | matched |
|---|---|
| `ZZ-TEST-B3-0914` (quick-601 fixture, no stamp) | the 8 stamped `ZZ-THROWAWAY-…` |
| `FI-Test-Logistics`, `MT-Test-Org Holdings` (collision cases) | `FI-Test-Tenant-1789503263285` |
| `QA Test Org`, `Nadeem's Testing`, `Postscript Test Co`, `Test` | `MT-Test-OrgA-1789503263285` |

**Deliberately NOT widened to bare `ZZ-`** — that would match `ZZ-TEST-B3-0914` and make it a prefix
test again. The four real production rows that read like test data are **not** matched and must not
be; deciding those are disposable is a human judgement, not a regex's.

## 5. The delete order

**Measured: 81 inbound FKs on `Tenant` — 17 CASCADE, 64 RESTRICT.** (The brief said 20/61; the
measurement differs and is reported rather than reconciled.) The old list emptied **11 of the 64**.

**So the old order was not merely wrong — it could not have succeeded** on the tenants it would next
be pointed at. Six RESTRICT children it never touched hold rows for the nine ZZ tenants:
`document_imports`, `document_import_pages`, `facility_external_references`, `in_app_notifications`,
`NotificationLog`, `StepInstance`. And because each failure was swallowed, it would have deleted a
tenant's children, failed on `DELETE FROM "Tenant"`, and reported success.

Order is now **derived from `pg_constraint` at runtime**, topologically sorted over blocking edges
only. CASCADE children need no statement and impose no ordering. A hardcoded list is exactly how the
old one came to cover a sixth of what it needed.

**The production order — 64 tables, dependents first:**

1. `"Load"` · 2. `"Customer"` · 3. `"CustomerInteraction"` · 4. `"Document"` · 5. `"DriverHOSEntry"`
· 6. `"DriverIncident"` · 7. `"DriverInvitation"` · 8. `"DriverRouteJoin"` · 9. `"RouteExpense"` ·
10. `"ExpenseTemplateItem"` · 11. `"ExpenseCategory"` · 12. `"ExpenseTemplate"` · 13. `"FuelRecord"`
· 14. `"GPSLocation"` · 15. `"Invoice"` · 16. `"InvoiceItem"` · 17. `"MaintenanceEvent"` ·
18. `"NotificationLog"` · 19. `"PayrollRecord"` · 20. `"PlaybookStep"` · 21. `"PushToken"` ·
22. `"RoutePayment"` · 23. `"Route"` · 24. `"RouteDriver"` · 25. `"RouteStop"` · 26. `"SafetyEvent"`
· 27. `"ScheduledService"` · 28. `"StepInstance"` · 29. `"SupportTicket"` · 30. `"SysAdminInvoice"` ·
31. `"SysAdminInvoiceItem"` · 32. `"Tag"` · 33. `"TagAssignment"` · 34. `"TenantIntegration"` ·
35. `"Truck"` · 36. `audit_log` · 37. `"User"` · 38. `"UserNotificationPreference"` ·
39. `carrier_document_types` · 40. `dispatches` · 41. `driver_pay_records` ·
42. `pay_component_attachments` · 43. `driver_disputes` · 44. `load_pay_components` ·
45. `load_driver_assignments` · 46. `driver_compensation_templates` · 47. `driver_bonuses` ·
48. `driver_deductions` · 49. `driver_settlements` · 50. `carrier_drivers` · 51. `carrier_expenses`
· 52. `carrier_trucks` · 53. `client_contacts` · 54. `contracts` · 55. `route_templates` ·
56. `loads` · 57. `clients` · 58. `document_import_pages` · 59. `document_imports` ·
60. `document_profiles` · 61. `driver_pay_audit_logs` · 62. `facilities` ·
63. `facility_external_references` · 64. `in_app_notifications` · **then `DELETE FROM "Tenant"`.**

All 64 are `ON DELETE RESTRICT` on `Tenant`. The 17 CASCADE children are deliberately absent:
`ActivationProgress`, `AppEvent`, `AutomationRule`, `AutomationRun`, `DispatchOverrideAudit`,
`DocFeedback`, `NotificationSubscription`, `Playbook`, `PlaybookInstance`, `PlaybookNotification`,
`PlaybookTrigger`, `StepTemplate`, `Subscription`, `TenantHealthScore`, `TenantMetricsDaily`,
`TenantNotificationSettings`, `carrier_truck_defects`.

**The order differs per database, which is why deriving it beats writing it down.** Staging yields
**61**, not 64 — `in_app_notifications → Tenant` is **CASCADE on staging and RESTRICT on production**.
A hardcoded list would be wrong on one of the two.

Everything now runs in **ONE transaction**, tenant row included: all or nothing.
*Deliberately the opposite of quick-608's teardown*, which avoids a transaction because its pool is
exhausted and a partial delete beats none. Here the connection is quiet and a half-deleted tenant
reported as success is the exact failure mode being removed. Different failure mode, different answer.

## 6. Staging proof

Fixture: `ZZ-THROWAWAY-QUICK609-1789507302779`, 9 child rows across 6 tables.

**Dry run (the default):**
```
[cleanup-test-tenants] project  : wyixpgunnjmzguhggocz (staging)
[cleanup-test-tenants] mode     : DRY RUN (default)
Blocking child tables derived from pg_constraint: 61
Tenants on this database: 3     Matched as disposable: 1     Left alone: 2

  "ZZ-THROWAWAY-QUICK609-1789507302779" (003a8d37-04f9-4fd8-a71c-2ee43ed35982)
     8 child row(s) across 5 table(s)
       "User": 1 · carrier_drivers: 1 · carrier_trucks: 1 · clients: 2 · facilities: 3

DRY RUN — nothing was deleted.
```
Re-counted afterwards, every row still present: `User 1, clients 2, carrier_drivers 1,
carrier_trucks 1, facilities 3, in_app_notifications 1, Tenant 1`.

**Real run:**
```
[cleanup-test-tenants] mode     : DELETE FOR REAL
DELETED "ZZ-THROWAWAY-QUICK609-1789507302779" (003a8d37-…) — 8 child row(s) + the tenant row

=== Summary ===
  deleted: 1     failed:  0
```
Re-counted afterwards: **all zero**, `in_app_notifications` included (removed by CASCADE, which is
why it is correctly absent from the explicit order). Staging back to its 2 real tenants.

## 7. Refusal proof

```
$ DATABASE_URL="<production>" npx tsx scripts/cleanup-test-tenants.ts
[cleanup-test-tenants] project  : oqdhberkghtnszrkdvfm (PRODUCTION)
[cleanup-test-tenants] host     : aws-1-us-west-1.pooler.supabase.com:5432
[cleanup-test-tenants] role     : postgres
[cleanup-test-tenants] url      : postgresql://postgres.oqdhberkghtnszrkdvfm:***@aws-1-us-west-1.pooler.supabase.com:5432/postgres
[cleanup-test-tenants] mode     : DRY RUN (default)

cleanup-test-tenants REFUSING TO RUN — DATABASE_URL names the PRODUCTION project (oqdhberkghtnszrkdvfm).
  This script DELETES tenants and every row beneath them, and it cascades into
  Supabase Auth users and object storage.
```
**exit code 1**, and it refuses at module scope — before the pool is used, so no tenant list is ever
read.

## A defect I introduced and fixed

The first draft of this rewrite **dropped the Supabase Auth deletion** the original performed, while
printing `(Supabase Auth users for this tenant were removed with the User rows)` — a line claiming
work that no longer happened. That is precisely the class of false claim
`docs/audits/production-test-writes.md` was written about, introduced while fixing it. Restored:
logins are collected **before** the transaction (afterwards the rows naming them are gone), deleted
**after** the commit (a rolled-back tenant must never lose its logins), and skipped ones are listed
by name. If the service-role key is absent it says so and gives the count rather than staying quiet.

## Is it now safe for a human to run against production with the flag?

**Safer, and not automatic.** `--allow-production --delete-for-real --expect=8` matches **8 of the 9**
ZZ tenants; `ZZ-TEST-B3-0914` is not matched.

**Check first, in this order:**
1. Run the **dry run** with `--allow-production` and read the list and row counts. It deletes nothing.
2. Confirm the count is 8 and every name carries a 13-digit stamp you recognise.
3. Confirm nothing in the "left alone" set should have been matched, and nothing in the matched set
   is real.
4. Take a `Tenant` count first, and re-run `604-survey.ts --close` after — it now asserts that count.
5. Know that Supabase Auth deletion happens **after** commit and is not transactional: a crash
   between the two leaves logins without tenants. Reported, but real.

**This task deleted no ZZ- tenant and made no production write.** The only production access was
SELECT-only catalogue reads plus the refusal proof, which connects nothing.

## Gates

| gate | result |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| staging dry run | matched 1, deleted 0, all 9 rows verified present afterwards |
| staging real run | tenant + all child rows verified gone; staging back to 2 tenants |
| production refusal | exit 1, before any read |
| ZZ- tenants deleted | **none, on any database** |
