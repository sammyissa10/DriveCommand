# quick-606 · 04 — Task 2 verified on staging

`--surfaces606 --only 5,6,7,9`, same server, same log. Artefact: `04-task2-after.json`.

| # | surface | BEFORE (02-reverify) | AFTER (04-task2-after) |
|---|---|---|---|
| 5 | `digest-compliance-30day` | fail `TC001` ×8 | fail — **TC001 gone from the first tenant**; see below |
| 6 | `digest-daily-driver` | fail `TC001` ×8 | **pass** — 200, `processedTenants:2`, zero `TC001` |
| 7 | `digest-weekly-owner` | fail `TC001` ×8 | **pass** — 200, `processedTenants:2`, zero `TC001` |
| 9 | `send-reminders` | fail `TC001` ×8 | fail `42703` — a DIFFERENT failure; see below |

**The `TC001` the task set out to remove is gone from all four.** What is left is what it was masking.

## Row 9 — `send-reminders` now fails on the staging `Document` drift

```
at async findExpiringDriverDocuments (src\lib\notifications\check-expiring-driver-documents.ts:34:21)
originalCode: '42703'  originalMessage: 'column Document.loadId does not exist'
```

`loadId` is one of the five `Document` columns quick-604 §7e recorded as present on production and
missing on staging. **This is Task 4's migration, not a regression** — the statement now reaches the
database, which it never did before.

## Row 5 — `digest-compliance-30day`: two failures, and one is new information

The body names both:

```json
{"failed":2,"failures":[
 {"scope":"owner:00dc04fb-…","code":"P2022","message":"The column `(not available)` does not exist"},
 {"scope":"tenant:b5623cdd-…","message":"tenant context is required: app.current_tenant_id is the EMPTY STRING"}]}
```

1. **Tenant 1** — `column Document.expiryDate does not exist`. Same staging drift as row 9.
2. **Tenant 2** — `TC001` on `SELECT "public"."User"…`, i.e. the SECOND loop iteration, **after**
   `getTenantPrismaForOrg(tenant.id)` had just set the GUC for it. Tenant 1's raise appears to have
   cost the pooled connection, and the replacement came back with `app.current_tenant_id` empty (the
   `pool.on('connect')` initialiser sets it to `''`). **Measured, not yet explained** — carried to
   §8 of the report and re-measured after the drift is closed.

## The `Truck.unitNumber` defect this uncovered — fixed, and it is not an `app_user` problem

The first run after the fix showed a third thing:

```
PrismaClientValidationError: Unknown field `unitNumber` for select statement on model `Truck`
  at buildCompliance30DayPayload (compliance-30day-payload.ts:36)
```

`unitNumber` is a **`CarrierTruck`** column (`schema.prisma:2191`). `Document.truck` points at the
**legacy `Truck`**, which has no unit number of any kind. So
`digest.compliance_30day` has raised for every owner with an expiring truck document since it
shipped, on production as much as on staging — a Prisma-layer validation error that no connection
role and no policy could affect. It was invisible because `TC001` raised first, on the statement
before it.

Changed to `licensePlate` (NOT NULL on the legacy model, and the identifier a person reads off the
truck). Same family as `project_two_route_systems`: establish which model a field name belongs to
before trusting it.
