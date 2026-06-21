# 442 — Diagnosis: Load `invoiced` Status vs Invoice Record

**Scope:** Read-only investigation. No source, schema, or data was modified.  
**Date:** 2026-06-15

---

## Critical Preliminary Finding: Two Separate Load Models

Before answering the five questions, one structural fact is essential to every answer:
DriveCommand has **two distinct load models** that share the name "load" in the UI but are
entirely separate in the database:

| Model | Prisma name | Physical table | Status type | Portal |
|-------|-------------|---------------|-------------|--------|
| Legacy Load | `Load` | `"Load"` | `LoadStatus` enum (PENDING / DISPATCHED / PICKED_UP / IN_TRANSIT / DELIVERED / INVOICED / CANCELLED) | Owner portal (`/loads`, `/owner/...`) |
| Carrier Load | `CarrierLoad` | `loads` (lowercase, `@@map("loads")`) | Plain `String` (pending / in_transit / delivered / cancelled / invoiced) | Carrier portal (`/carrier/loads`) |

The `Invoice` model (`"Invoice"` table) has a `loadId` FK that references the **legacy `Load`
model only** (`schema.prisma:1075 — load Load? @relation(...)`). There is **no Invoice FK to
CarrierLoad**.

The KPI "Open Invoices" on the carrier dashboard (`/api/v1/carrier/dashboard/kpi/route.ts`)
counts `Invoice` rows (SENT + OVERDUE) — which live in the legacy data layer. The `invoiced`
status on `CarrierLoad` is a separate concept entirely.

---

## 1. Spec Intent

**Finding: The spec is silent on coupling.**

All available specification documents were searched for "invoice", "invoiced", "billing",
"auto-create", "delivered", and "rate confirmation":

- `docs/specs/workflow-engine.md` — PDF binary (not searchable as text); no text content
  extractable. The PDF is a print of a URL-signed Supabase document.
- `docs/specs/DriveCommand_Workflow_Engine_v2.md` — PDF binary; same situation.
- `docs/specs/DriverPay_TechnicalSpec_v4.md` — no matches.
- `docs/specs/Notifications System Technical Documentation.md` — mentions `load.invoiced` as a
  notification trigger (line 169) and `invoice.created` as a separate finance trigger (line 173),
  but does not specify whether these two events are coupled or independent.

The Notifications spec (line 169):
> `| **Load** | load.created, load.assigned, ..., load.delivered, load.invoiced, load.cancelled, ... |`

The Notifications spec (line 173):
> `| **Finance** | invoice.created, invoice.paid, invoice.overdue, payroll.processed |`

These are treated as **separate trigger categories** (Load vs Finance), but the spec does not
state whether `load.invoiced` implies `invoice.created` has already fired, or whether they are
independent events.

The carrier dashboard KPI API (`/api/v1/carrier/dashboard/kpi/route.ts`, line 12) contains the
only inline spec reference: `"open" = SENT + OVERDUE per spec §5.8 outstanding-AR semantics`.
Section 5.8 of a spec is referenced but that spec document is the PDF and was not parseable.

**Conclusion:** No spec passage explicitly states whether CarrierLoad.status='invoiced' and the
existence of an Invoice row are coupled (one implies the other) or independent. The spec is
silent on this coupling.

---

## 2. Status Transitions to 'invoiced'

There are **three distinct code paths** that can set a load to `invoiced` status. They involve
two different models and have fundamentally different semantics.

### Path A — Legacy Load, web server action (COUPLED via guard)

**File:** `apps/web/src/app/(owner)/actions/loads.ts:564–734`  
**Trigger:** Owner clicks "Mark Invoiced" button in the legacy owner portal (`/loads/[id]`).

The function `updateLoadStatus(id, 'INVOICED')` (line 564) does the following:

1. **Checks for an existing Invoice** (line 591–597):
   ```typescript
   if (newStatus === 'INVOICED') {
     const invoiceCount = await prisma.invoice.count({
       where: { loadId: id, status: { not: 'CANCELLED' } },
     });
     if (invoiceCount === 0) {
       return { error: 'An invoice must be created and linked to this load before it can be marked as Invoiced.' };
     }
   }
   ```
   This guard **requires at least one Invoice row** linked to the Load before allowing the
   status flip. Invoice creation is a prerequisite, not a consequence.

2. Sets `Load.status = 'INVOICED'` (line 600–603).
3. Dispatches `load.invoiced` notification (line 688–698), pulling the first Invoice's number
   and amount for the notification payload.
4. Updates CRM customer stats (line 718–727).

**Does it also create an Invoice?** No. The Invoice must already exist. The status flip is the
_outcome_ of having invoiced, not the trigger for creating the Invoice.

**UI component:** `apps/web/src/components/loads/status-update-button.tsx:19`  
`DELIVERED: { status: 'INVOICED', label: 'Mark Invoiced' }` — renders "Mark Invoiced" button.

### Path B — Legacy Load, mobile owner PATCH (NO guard)

**File:** `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts:154–264`  
**Trigger:** Owner patches load status via mobile app (`PATCH /api/mobile/owner/loads/[id]`).

Valid statuses include `'INVOICED'` (line 154). The PATCH handler:
- Validates the status string is in the allowed list
- Updates `Load.status` directly via `tx.load.update(...)` (line 253)
- **Does not check for a linked Invoice** — the guard present in Path A is absent here
- **Does not create an Invoice** — it only flips the status

This is a **gap in the mobile path**: the web server action has a guard; the mobile API does not.

### Path C — CarrierLoad, carrier REST API (NO guard, NO Invoice link)

**File:** `apps/web/src/app/api/v1/carrier/loads/[id]/route.ts:47`  
**Data file:** `apps/web/src/lib/carrier/loads.ts:409,419`  
**Trigger:** Any PATCH to `/api/v1/carrier/loads/[id]` with `{ status: 'invoiced' }`.

The carrier load update function (`updateLoad` in `lib/carrier/loads.ts`):
- Accepts `'invoiced'` as a valid status (line 409: `...(data.status !== undefined ? { status: data.status } : {})`).
- When status transitions to 'invoiced', sends two notifications (lines 419–422):
  `sendInvoiceGeneratedNotification` and `sendClientInvoiceReadyNotification`.
- **Does not create an Invoice row.**
- **Does not check for a linked Invoice row.**
- The `CarrierLoad` model has no `loadId → Invoice` relationship in the schema.
  (`Invoice.loadId` references `Load`, not `CarrierLoad`.)

**Status enum:** The carrier load status is a plain `String`, not a Prisma enum. Valid values
used in code: `pending`, `in_transit`, `delivered`, `cancelled`, `invoiced`.

**UI:** The `LoadDetailActions` component (`apps/web/src/components/carrier/loads/LoadDetailActions.tsx`)
does not expose a "Mark Invoiced" button. The only status mutation UI for carrier loads is
dispatch assignment and cancellation. The `invoiced` status would currently need to be set via
direct API call.

---

## 3. Invoice Creation Paths

There are **two Invoice creation sites** (excluding `SysAdminInvoice` and generated client):

### Creation Site 1 — Web server action, manual owner creation

**File:** `apps/web/src/app/(owner)/actions/invoices.ts:80`  
**Trigger:** Owner submits the "Create Invoice" form in the legacy owner portal (`/invoices/new`).

```typescript
const invoice = await prisma.invoice.create({
  data: {
    tenantId,
    customerId: ...,
    routeId: ...,
    loadId: result.data.loadId || null,   // Optional FK to legacy Load
    ...
  },
});
```

- Optionally links to a legacy `Load` via `loadId`.
- **Does not set `Load.status = 'INVOICED'`** — the load status is not touched.
- Redirects to `/invoices/${createdId}`.

### Creation Site 2 — Mobile owner API, quick invoice creation

**File:** `apps/web/src/app/api/mobile/owner/invoices/route.ts:180`  
**Trigger:** Owner creates invoice from the mobile app (`POST /api/mobile/owner/invoices`).

```typescript
return tx.invoice.create({ data: invoiceData, select: { id: true, invoiceNumber: true } });
```

- Does NOT accept a `loadId` in the request body (the body only accepts `customerId`, `amount`,
  `description`, `dueDate`).
- **Does not set any Load.status.**
- Creates Invoice with status `'DRAFT'`.

**Summary of Invoice creation:**

| Site | File:line | Trigger | Sets loadId? | Sets Load.status? |
|------|-----------|---------|-------------|-------------------|
| Web form | `actions/invoices.ts:80` | Manual owner form | Optional | No |
| Mobile API | `api/mobile/owner/invoices/route.ts:180` | Mobile quick-create | No | No |

Neither Invoice creation path touches `Load.status`. Neither CarrierLoad path touches `Invoice`.

---

## 4. Data Check

**Method:** Read-only SELECTs via direct PostgreSQL connection (`DIRECT_URL`). No writes.

**Table identification:**
- `"Invoice"` — legacy Invoice records (PascalCase, no `@@map`).
- `"Load"` — legacy Load records (PascalCase, no `@@map`), status column is `LoadStatus` enum.
- `loads` — CarrierLoad records (`@@map("loads")`), status is plain string, soft-delete via `deleted_at`.

**Tenant identification:** `Tenant.sampleDataSeeded` is the only tenant-level sample flag.
There is no `Tenant.isSample` column. Individual rows use per-row `isSample`/`is_sample` columns.
"Sample" tenants (for this analysis) are those with `sampleDataSeeded = true`.

---

### 4a. Legacy Load model (`"Load"` table)

**Total rows:** 2  
**Archived (soft-deleted):** 0  
**Status distribution (non-archived):**

| status | count | tenant |
|--------|-------|--------|
| IN_TRANSIT | 1 | Postscript Test Co (sampleDataSeeded=true, isSample=true) |
| DELIVERED | 1 | Postscript Test Co (sampleDataSeeded=true, isSample=true) |
| **INVOICED** | **0** | — |

**Result:** Zero legacy Load rows have `status = 'INVOICED'`.

---

### 4b. CarrierLoad model (`loads` table)

**Total rows:** 191 (excluding deleted)  
**Status distribution (deleted_at IS NULL):**

| status | count | notes |
|--------|-------|-------|
| assigned | 136 | QA Test Org: 91, DriveCommand Demo: 45 |
| pending | 25 | across multiple tenants |
| delivered | 15 | mix of is_sample and real |
| in_transit | 14 | mix of is_sample and real |
| cancelled | 1 | DriveCommand Demo |
| **invoiced** | **0** | — |

**Result:** Zero CarrierLoad rows have `status = 'invoiced'`.

---

### 4c. Invoice table (`"Invoice"`)

**Total rows:** 0  
**Active (archivedAt IS NULL):** 0

**Result:** Zero Invoice records exist in the database.

---

### 4d. Gap calculation

| Metric | Legacy Load | CarrierLoad |
|--------|-------------|-------------|
| Rows with status = invoiced | 0 | 0 |
| Invoice rows linked via loadId | 0 (no invoiced loads exist) | N/A (no FK to Invoice) |
| Gap (invoiced load with no Invoice) | 0 (no invoiced loads) | N/A |

**Per-tenant breakdown (non-sample tenants only, i.e., sampleDataSeeded=false):**

| Tenant | Invoiced Legacy Loads | Invoiced CarrierLoads | Invoice rows |
|--------|----------------------|-----------------------|--------------|
| Nadeem's Testing (69443fd1) | 0 | 0 | 0 |
| Nadeem's Testing (eb3cd0f8) | 0 | 0 | 0 |
| Phase B Test Co 2 | 0 | 0 | 0 |
| SAMMY ISSA | 0 | 0 | 0 |
| DriveCommand Demo Member | 0 | 0 | 0 |
| System | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** |

There are no invoiced loads of any kind and no Invoice records in production. The premise of
the original question ("loads historically carry status='invoiced'") does not match the current
database state.

---

## 5. Verdict

**Verdict: (B) — Independent by design in the CarrierLoad system; (A) coupled in the legacy Load system; no data gap exists.**

### Full characterization:

The two load models have fundamentally different semantics for `invoiced`:

**Legacy Load system (owner portal `/loads`):**  
Verdict **(A) — Coupled by design AND coupled in code.**  
The `updateLoadStatus` server action (line 591–597) enforces a hard guard: you cannot set
`Load.status = 'INVOICED'` unless at least one `Invoice` row with `loadId = <this load>` already
exists. The Invoice is a prerequisite for the status. This is coupling-by-guard: an Invoice must
exist before the status flip is allowed. The legacy system is coherent.

**Exception:** The mobile PATCH path (`/api/mobile/owner/loads/[id]`) allows setting
`status = 'INVOICED'` without any Invoice guard. This is a real inconsistency: the web path is
guarded, the mobile path is not. However, since zero invoiced loads exist in production, this
inconsistency has not been exercised.

**CarrierLoad system (carrier portal `/carrier/loads`):**  
Verdict **(B) — Independent by design.**  
The `CarrierLoad` model has no `loadId → Invoice` FK. The `Invoice` model's `loadId` references
the legacy `Load`, not `CarrierLoad`. There is no schema coupling between CarrierLoad and Invoice.
Setting `CarrierLoad.status = 'invoiced'` sends carrier notifications but does not interact with
Invoice records. The carrier system treats `invoiced` as an operational state flag (the load has
been invoiced externally / in the factoring workflow) rather than a trigger for creating Invoice
rows. This is consistent with the carrier portal being a separate, newer workflow.

### Why the Demo tenant shows Open Invoices = 0 and /invoices = 0:

The KPI strips count `Invoice` rows with `status IN ('SENT', 'OVERDUE')`. There are zero `Invoice`
rows in the database. The carrier portal loads in the DriveCommand Demo tenant have never reached
`status = 'invoiced'` (the highest real status is `delivered`). There is no data anomaly — the
database is in a consistent state where:
- CarrierLoad invoicing has not yet been used (no loads are invoiced)
- The legacy Invoice UI at `/invoices` has not been used (0 Invoice rows)
- The system has never exercised the DELIVERED → INVOICED transition

### Smallest fix (for the mobile path inconsistency):

If the decision is that the legacy Load system requires coupling (a load cannot be `INVOICED`
without an Invoice), then the mobile PATCH handler at
`apps/web/src/app/api/mobile/owner/loads/[id]/route.ts` needs the same guard added before the
`tx.load.update(...)` call:

```
if (body.status === 'INVOICED') {
  const count = await tx.invoice.count({ where: { loadId: id, status: { not: 'CANCELLED' } } });
  if (count === 0) return 400 error 'An invoice must exist before marking as Invoiced';
}
```

This is a 4-line addition inside the existing transaction. No schema change needed.

The CarrierLoad path (`/api/v1/carrier/loads/[id]`) does not need this fix — the CarrierLoad
model has no Invoice FK by design, so `status = 'invoiced'` on a CarrierLoad is a free-standing
operational flag, independent of Invoice rows. If the carrier portal eventually needs Invoice
coupling, that requires adding a `carrierLoadId` FK to the Invoice model (architectural change,
Rule 4).

---

## Summary of Findings

| Question | Finding |
|----------|---------|
| Q1 Spec intent | Spec is silent. No spec document states whether these are coupled or independent. |
| Q2 Status→'invoiced' paths | 3 paths: (A) web server action — guarded, requires Invoice; (B) mobile PATCH — no guard; (C) carrier REST — no guard, no FK. |
| Q3 Invoice.create paths | 2 paths: web form (optional loadId, no status side-effect) and mobile API (no loadId, no status side-effect). |
| Q4 Data counts | 0 invoiced loads, 0 Invoice rows, across all tenants. No gap exists in current data. |
| Q5 Verdict | (A) for legacy Load system (coupled, guarded); (B) for CarrierLoad system (independent by design). One real inconsistency: mobile PATCH lacks the Invoice guard that the web action has. |
