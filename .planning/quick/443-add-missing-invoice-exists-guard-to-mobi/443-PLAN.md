# Quick Task 443 — PLAN

## Goal
Close the web/mobile parity gap for the `INVOICED` status transition on legacy Loads.
The web server action (`actions/loads.ts:591-597`) blocks `INVOICED` unless a non-CANCELLED
Invoice exists for the load. The mobile owner PATCH (`api/mobile/owner/loads/[id]/route.ts`)
has no equivalent guard, allowing mobile to set status=INVOICED with no Invoice record.

This is a latent-correctness fix. Per Diagnostic 442: 0 loads are currently INVOICED and
0 Invoices exist in production, so no data backfill is needed.

## Reference: Web Guard (mirror exactly)
File: `apps/web/src/app/(owner)/actions/loads.ts:591-597` — DO NOT EDIT
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

## Tasks

### Task 1 — Insert INVOICED guard into mobile owner PATCH
**File:** `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts`

**Where to insert:** After the 404 guard (existingLoad check at line 197-199),
before the geocoding block (line 201). This fails fast before any expensive I/O.

**What to insert:**
```typescript
// Guard: require at least one linked invoice before marking as INVOICED (mirrors web action)
if (body.status === 'INVOICED') {
  let invoiceCount: number;
  try {
    invoiceCount = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.invoice.count({
        where: { loadId: id, status: { not: 'CANCELLED' } },
      });
    }, TX_OPTIONS);
  } catch (err) {
    logger.error('[mobile/owner/loads/[id] PATCH] invoice guard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  if (invoiceCount === 0) {
    return NextResponse.json(
      { error: 'An invoice must be created and linked to this load before it can be marked as Invoiced.' },
      { status: 422 }
    );
  }
}
```

**Why this approach:**
- Matches the existing bypass_rls pattern already used in this file (not bare prisma)
- Returns 422 cleanly — no custom error class needed
- Mirrors the web action's exact error message and guard semantics
- Fails fast before geocoding (no wasted I/O on rejected requests)
- Touches only the INVOICED branch — all other transitions unchanged
- CarrierLoad code is entirely separate and NOT touched

## Constraints
- No schema changes, no migration
- CarrierLoad NOT touched
- Only `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts` changes
- `git diff` shows only this file
- Verify with `next build` (not tsc --noEmit)
