# quick-606 · 06 — Task 4 verified on staging

## The migration was CONDITIONAL on a production read, and the condition held

`606-document-drift.ts` read `information_schema.columns` on BOTH databases (production READ-ONLY,
one SELECT, asserted to be a SELECT at runtime). `06-document-drift.json`:

| reading | value |
|---|---|
| production `"Document"` columns | **21** |
| staging `"Document"` columns | **20** |
| missing on staging | `description`, `expiryDate`, `externalUrl`, `loadId`, `notes` |
| extra on staging | `createdBy`, `deletedAt`, `deletedBy`, `updatedBy` |
| `safeToWriteMigration` | **true** |

All five are **nullable with no default** on production, with one unambiguous type each:

```
description    text                       nullable=YES default=NULL
expiryDate     timestamp with time zone   nullable=YES default=NULL
externalUrl    text                       nullable=YES default=NULL
loadId         uuid                       nullable=YES default=NULL
notes          text                       nullable=YES default=NULL
```

The plan's stop condition — "if ANY column differs in type, nullability or precision, write no
migration" — was therefore not triggered. Had any been NOT NULL with no default, `ADD COLUMN` could
not have been written at all against a populated table, and the row would have stayed `NOT_MEASURED`.

`pg_indexes` / `pg_constraint` were read too: production also carries
`Document_expiryDate_idx`, `Document_loadId_idx` and `Document_loadId_fkey`, none of which can exist
on staging without the columns. All three are in the migration, all `IF NOT EXISTS` or guarded on
`pg_constraint`, so all three are no-ops on production.

**Deliberately NOT in the migration:** `Document_driverId_idx`, which production has and staging does
not even though the column exists on both; and the four columns staging has and production does not.
Drift in the other direction, on a table whose Prisma model declares none of them. §8, not here —
dropping a column is irreversible and nothing measured needs it.

## DEC-17 — the ledger row, hand-written and read back

`06-ledger-20260915120000_document_column_drift_staging_parity.txt`:

```
SENTINEL 20260914170000_activation_progress_congrats_shown_at visible: YES
ledger row INSERTed BY HAND — no MCP tool and no DDL writes this (DEC-17)
READ BACK — newest 3 ledger rows:
  20260915120000_document_column_drift_staging_parity | steps=0 | logs="" | started=finished:true | checksum=095c615e…
  20260914180000_tenant_context_tripwire              | steps=0 | logs="" | started=finished:true | checksum=ad2f6892…
  20260914170000_activation_progress_congrats_shown_at| steps=1 | logs=null| started=finished:false| checksum=manual
HEAD IS OURS: true
checksum is a real SHA-256, not 'manual': true
applied_steps_count is 0: true
staging _prisma_migrations rows AFTER: 157
```

The sentinel is checked **before** the write, because `_prisma_migrations` has RLS on, zero policies
and no `app_user` grant: an empty read from a non-owner role is indistinguishable from "never
written", and the natural response to that is a duplicate.

Production ledger re-read immediately after: **156 / 183 / `20260914170000_…`** — unchanged.

## The re-run

| # | surface | BEFORE | AFTER |
|---|---|---|---|
| 1 | `/carrier/trips` | fail `TC001` ×2 | **pass** — 200, 0 `TC001`, data gate 3 carrier_drivers |
| 2 | `/documents` | fail `P2022` | 200, 0 `TC001` — **`LATENT` by the harness**, and SCOPED by the probe below |
| 5 | `digest-compliance-30day` | fail `TC001` ×8 | **pass** — `processedTenants:2 failed:0` |
| 9 | `send-reminders` | fail `TC001` ×8 | 200, `processedTenants:2 tenantsFound:2 failed:0` — **`LATENT`** |

Row 5's second-iteration `TC001` (04-task2-after.md) is **gone**. It was a consequence of the drift
error costing the pooled connection, not an independent defect — which is why it is reported as
resolved rather than as still open.

Rows 2 and 9 are `LATENT` and not `pass`, on the harness's own rule: their data gates read **0**
(`Document` rows for the fixture driver; legacy `Truck` rows). A 200 over an empty table proves the
raise is gone and nothing about the scoping. That is R3, and quick-605's
`/carrier/driver-pay/reports` is the precedent.

## Row 2's scoping, closed separately — `06-documents-scoping.json`

Since the harness could only ever call row 2 `LATENT`, the scoping was proven on its own:

```
seeded probe Document 66bf812f-… for driver1@alpha.staging.test (staging-alpha)
tenant A driver1@alpha.staging.test: HTTP 200  sees probe: true
tenant B driver1@beta.staging.test:  HTTP 200  sees probe: false
cleanup: deleted 1 row(s); surviving 606-probe rows: 0
VERDICT: SCOPED — tenant A sees its probe, tenant B does not
```

**Step 3 is the one that matters.** Tenant A seeing its own document would pass identically on an
unscoped read; only tenant B's blindness distinguishes them. The probe row was hard-deleted and the
counter-read asserts zero `606-probe%` rows survive.
