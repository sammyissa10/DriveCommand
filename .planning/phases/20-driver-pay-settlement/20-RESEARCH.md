# Phase 20: Driver Pay Settlement - Research

**Researched:** 2026-02-27
**Domain:** Driver compensation calculation, settlement data models, PDF generation, Prisma schema extension
**Confidence:** HIGH

## Summary

Phase 20 adds automated driver pay settlement on top of an existing, mature payroll module. The codebase already has `PayrollRecord`, `Load` (with `DELIVERED` status and `rate` field), `User` (drivers), and a well-established Decimal.js pattern via `Prisma.Decimal` for financial calculations. The new models — `DriverPayConfig`, `DriverSettlement`, and `SettlementLine` — follow the exact same patterns already present in `Invoice`/`InvoiceItem` (parent record + line items with tenantId on both, cascade delete, RLS with `tenant_isolation_policy` + `bypass_rls_policy`).

The settlement engine (`calculateSettlement` server action) queries loads with `status: 'DELIVERED'` for a driver in a date range, applies one of three pay types (PER_MILE, PERCENTAGE, FLAT), and writes results in a Prisma `$transaction`. The Load model has `rate: Decimal`, `origin`, `destination`, and `driverId` — all needed fields are present. The missing piece is a `miles` field: the Load model currently has no miles column (Route has `distanceMiles: Float?`, but Load has no such field). The plan must decide whether to source miles from Route.distanceMiles or add a miles column to Load itself.

The PDF layer uses `@react-pdf/renderer` v4.3.2, already installed. For a Next.js App Router setup, the correct pattern is a Route Handler at `GET /api/settlements/[id]/pdf` that calls `renderToBuffer()` server-side and returns a `Response` with `Content-Type: application/pdf`. The `PDFDownloadLink` component is client-only and unsuitable for server components; the download button on the settlement detail page must be a plain `<a href="/api/settlements/[id]/pdf" download>` or a small Client Component wrapping the link.

**Primary recommendation:** Model `DriverSettlement`/`SettlementLine` exactly after `Invoice`/`InvoiceItem` (tenantId on both, cascade delete, bypass-RLS migration pattern). Use `renderToBuffer()` in a Route Handler for PDF — never `PDFDownloadLink` in a server component. Decide upfront whether miles comes from `Load.distanceMiles` (new column) or `load.route.distanceMiles`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-pdf/renderer` | 4.3.2 (installed) | Server-side PDF generation | Already in package.json; `renderToBuffer()` works in Node/Edge route handlers |
| `Prisma.Decimal` | (via `@prisma/client` 7.4) | Financial arithmetic | Project-wide standard — never use JS floats for money |
| `zod` | 4.3.6 (installed) | Input validation for settlement actions | Project-wide standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | 4.1.0 (installed) | Date formatting in PDF / period labels | Already used for date work in codebase |
| `Prisma.$transaction` | (Prisma 7) | Atomic settlement creation | Required: create DriverSettlement + all SettlementLines in one transaction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `renderToBuffer()` in Route Handler | `PDFDownloadLink` client component | `PDFDownloadLink` is browser-only; can't be used in server components or API routes |
| Prisma nested `create` in transaction | Sequential inserts | Nested create is cleaner but Prisma 7 supports both; either works |

**Installation:**
```bash
# All dependencies already installed — no new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(owner)/
│   ├── actions/
│   │   └── settlements.ts       # calculateSettlement, approveSettlement, markSettlementPaid
│   ├── payroll/
│   │   └── settlements/
│   │       ├── page.tsx         # Settlement list at /payroll/settlements
│   │       └── [id]/
│   │           └── page.tsx     # Settlement detail with line items + download button
│   └── api/
│       └── settlements/
│           └── [id]/
│               └── pdf/
│                   └── route.ts # GET handler returning PDF buffer
├── components/
│   └── settlements/
│       ├── settlement-list.tsx
│       └── settlement-pdf.tsx   # React-PDF Document component (server-safe)
├── lib/
│   └── settlements/
│       └── pay-calculator.ts    # Pure calculation logic (no DB), testable
└── prisma/
    ├── schema.prisma            # Add 3 new models + 2 enums
    └── migrations/
        └── 20260227000001_add_driver_settlement/
            └── migration.sql
```

### Pattern 1: Settlement Engine Server Action
**What:** `calculateSettlement(driverId, periodStart, periodEnd)` server action that queries DELIVERED loads, looks up the driver's pay config, computes per-load pay, and persists a `DriverSettlement` with `SettlementLine` records.
**When to use:** Called from a "Generate Settlement" button on the settlement creation UI.
**Example:**
```typescript
// Source: Codebase pattern from src/app/(owner)/actions/invoices.ts + payroll.ts
'use server';

import { Prisma } from '@/generated/prisma';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { revalidatePath } from 'next/cache';

const Decimal = Prisma.Decimal;

export async function calculateSettlement(
  driverId: string,
  periodStart: string,
  periodEnd: string
) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // 1. Fetch pay config for driver
  const payConfig = await prisma.driverPayConfig.findFirst({
    where: { driverId, effectiveFrom: { lte: new Date(periodEnd) } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!payConfig) return { error: 'No pay configuration found for driver.' };

  // 2. Fetch DELIVERED loads in period
  const loads = await prisma.load.findMany({
    where: {
      driverId,
      status: 'DELIVERED',
      deliveryDate: {
        gte: new Date(periodStart),
        lte: new Date(periodEnd),
      },
    },
  });

  // 3. Calculate per-line pay using Decimal (NEVER JS floats)
  const lines = loads.map((load) => {
    const grossRate = new Decimal(load.rate);
    const miles = new Decimal(load.distanceMiles ?? 0); // resolved from load or route
    let payAmount: Prisma.Decimal;

    if (payConfig.payType === 'PER_MILE') {
      payAmount = miles.mul(new Decimal(payConfig.rateValue));
    } else if (payConfig.payType === 'PERCENTAGE') {
      payAmount = grossRate.mul(new Decimal(payConfig.rateValue)).div(100);
    } else {
      // FLAT
      payAmount = new Decimal(payConfig.rateValue);
    }
    return { loadId: load.id, description: `${load.origin} -> ${load.destination}`, miles, grossRate, payAmount };
  });

  const totalPay = lines.reduce((sum, l) => sum.add(l.payAmount), new Decimal(0));

  // 4. Persist in transaction
  let createdId: string;
  try {
    const settlement = await prisma.$transaction(async (tx) => {
      const s = await (tx as any).driverSettlement.create({
        data: {
          tenantId,
          driverId,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          totalPay,
          status: 'DRAFT',
          lines: {
            create: lines.map((l) => ({
              tenantId,
              loadId: l.loadId,
              description: l.description,
              miles: l.miles,
              grossRate: l.grossRate,
              payAmount: l.payAmount,
            })),
          },
        },
      });
      return s;
    }, TX_OPTIONS);
    createdId = settlement.id;
  } catch (e: any) {
    return { error: 'Failed to create settlement.' };
  }

  revalidatePath('/payroll/settlements');
  return { settlementId: createdId };
}
```

### Pattern 2: PDF Route Handler (server-side)
**What:** Next.js App Router Route Handler that renders `DriverSettlement` to a PDF buffer and streams it back.
**When to use:** Called from `<a href="/api/settlements/[id]/pdf" download>` on the settlement detail page.
**Example:**
```typescript
// Source: @react-pdf/renderer v4 type definitions — renderToBuffer() is a Node-platform export
// File: src/app/api/settlements/[id]/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { SettlementPDF } from '@/components/settlements/settlement-pdf';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { getSession } from '@/lib/auth/session';
import React from 'react';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const prisma = await getTenantPrisma();
  const settlement = await prisma.driverSettlement.findUnique({
    where: { id },
    include: { driver: { select: { firstName: true, lastName: true } }, lines: true },
  });
  if (!settlement) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = await renderToBuffer(
    React.createElement(SettlementPDF, { settlement })
  );

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="settlement-${id}.pdf"`,
    },
  });
}
```

### Pattern 3: React-PDF Document Component
**What:** A pure React component using `@react-pdf/renderer` primitives (no HTML/Tailwind). Styles via `StyleSheet.create()`.
**When to use:** Imported by the Route Handler above. Never rendered in a browser React tree directly (though it could be with `BlobProvider`).
**Example:**
```typescript
// Source: @react-pdf/renderer v4 type definitions
// File: src/components/settlements/settlement-pdf.tsx
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10 },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 6 },
  cell: { flex: 1 },
  cellRight: { flex: 1, textAlign: 'right' },
  totalRow: { flexDirection: 'row', paddingTop: 8, borderTopWidth: 2, borderTopColor: '#111827' },
  signatureLine: { marginTop: 40, borderTopWidth: 1, borderTopColor: '#111827', width: 200 },
});

export function SettlementPDF({ settlement }: { settlement: any }) {
  return (
    <Document title={`Settlement Statement`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Driver Settlement Statement</Text>
          <Text>{settlement.driver.firstName} {settlement.driver.lastName}</Text>
          <Text>
            Period: {new Date(settlement.periodStart).toLocaleDateString()} -{' '}
            {new Date(settlement.periodEnd).toLocaleDateString()}
          </Text>
        </View>

        {/* Table header */}
        <View style={[styles.row, { backgroundColor: '#f3f4f6' }]}>
          <Text style={styles.cell}>Load / Route</Text>
          <Text style={styles.cellRight}>Miles</Text>
          <Text style={styles.cellRight}>Gross Rate</Text>
          <Text style={styles.cellRight}>Pay</Text>
        </View>

        {/* Line items */}
        {settlement.lines.map((line: any) => (
          <View key={line.id} style={styles.row}>
            <Text style={styles.cell}>{line.description}</Text>
            <Text style={styles.cellRight}>{Number(line.miles).toLocaleString()}</Text>
            <Text style={styles.cellRight}>${Number(line.grossRate).toFixed(2)}</Text>
            <Text style={styles.cellRight}>${Number(line.payAmount).toFixed(2)}</Text>
          </View>
        ))}

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={[styles.cell, { fontWeight: 'bold' }]}>Total Pay</Text>
          <Text style={[styles.cellRight, { fontWeight: 'bold' }]}>
            ${Number(settlement.totalPay).toFixed(2)}
          </Text>
        </View>

        {/* Signature line */}
        <View style={{ marginTop: 60 }}>
          <View style={styles.signatureLine} />
          <Text style={{ marginTop: 4 }}>Driver Signature</Text>
        </View>
      </Page>
    </Document>
  );
}
```

### Pattern 4: Migration SQL Structure
**What:** Migration follows exact project conventions — `CREATE TYPE ... AS ENUM`, `CREATE TABLE`, indexes, FKs, then RLS block.
**When to use:** Every new model in this project uses this pattern.
**Example:**
```sql
-- Enums first
CREATE TYPE "DriverPayType" AS ENUM ('PER_MILE', 'PERCENTAGE', 'FLAT');
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- DriverPayConfig table
CREATE TABLE "DriverPayConfig" (
    "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"      UUID          NOT NULL,
    "driverId"      UUID          NOT NULL,
    "payType"       "DriverPayType" NOT NULL,
    "rateValue"     DECIMAL(10,4) NOT NULL,
    "effectiveFrom" TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverPayConfig_pkey" PRIMARY KEY ("id")
);

-- DriverSettlement table
CREATE TABLE "DriverSettlement" (
    "id"          UUID               NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"    UUID               NOT NULL,
    "driverId"    UUID               NOT NULL,
    "periodStart" TIMESTAMPTZ        NOT NULL,
    "periodEnd"   TIMESTAMPTZ        NOT NULL,
    "status"      "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPay"    DECIMAL(10,2)      NOT NULL,
    "paidAt"      TIMESTAMPTZ,
    "notes"       TEXT,
    "createdAt"   TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverSettlement_pkey" PRIMARY KEY ("id")
);

-- SettlementLine table
CREATE TABLE "SettlementLine" (
    "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
    "settlementId" UUID          NOT NULL,
    "tenantId"     UUID          NOT NULL,
    "loadId"       UUID          NOT NULL,
    "description"  TEXT          NOT NULL,
    "miles"        DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grossRate"    DECIMAL(12,2) NOT NULL,
    "payAmount"    DECIMAL(10,2) NOT NULL,
    "createdAt"    TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- Indexes + FKs + RLS per table (see Architecture Patterns section)
```

### Pattern 5: Linking DriverSettlement to PayrollRecord
**What:** Add a `settlementId` foreign key column to `PayrollRecord` so payroll records can reference their source settlement.
**When to use:** Plan 20-03 links the two modules.
**Example (migration fragment):**
```sql
ALTER TABLE "PayrollRecord" ADD COLUMN IF NOT EXISTS "settlementId" UUID;
ALTER TABLE "PayrollRecord"
  ADD CONSTRAINT "PayrollRecord_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "DriverSettlement"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "PayrollRecord_settlementId_idx" ON "PayrollRecord"("settlementId");
```
And in schema.prisma:
```prisma
model PayrollRecord {
  // ... existing fields ...
  settlementId  String?          @db.Uuid
  settlement    DriverSettlement? @relation(fields: [settlementId], references: [id])
}
```

### Anti-Patterns to Avoid
- **Using JS number arithmetic for pay calculations:** Always use `Prisma.Decimal` (or `new Decimal(x)` from the same import). A `0.1 + 0.2` error in driver pay is a real payroll bug.
- **Rendering `PDFDownloadLink` in server components:** This component requires browser APIs. Use `renderToBuffer()` in a Route Handler instead.
- **Using `renderToStream()` and piping:** Overly complex for this use case. `renderToBuffer()` returns a `Promise<Buffer>`, which is simpler to use in a Next.js Route Handler.
- **Creating SettlementLine without tenantId:** Every child model in this project has `tenantId` for RLS. `SettlementLine` must follow the same pattern as `InvoiceItem` (tenantId present, RLS enabled).
- **Not wrapping DriverSettlement + SettlementLine creation in a transaction:** Partial settlement creation (header without lines) leaves data inconsistent. Always use `prisma.$transaction(..., TX_OPTIONS)`.
- **Querying loads without tenant scoping:** When using `getTenantPrisma()`, RLS handles this automatically. But raw queries must use `tenantRawQuery()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decimal arithmetic for pay | Custom rounding functions | `Prisma.Decimal` (already `new Decimal(x).mul()` etc.) | IEEE-754 float errors in money calculations; Decimal handles banker's rounding |
| PDF generation | HTML-to-PDF converters, puppeteer | `@react-pdf/renderer` v4 (`renderToBuffer`) | Already installed; no extra deps; works in Node route handlers |
| Date range formatting | Manual string concat | `date-fns` `format()` already in project | Consistent formatting, timezone handling |
| Status workflow guard | Ad-hoc status checks | Mirror existing `PayrollStatus` pattern: DRAFT → APPROVED → PAID | Already established in `deletePayrollRecord` (only DRAFT deletable) |

**Key insight:** This phase is data model + calculation logic + a PDF button. The hardest problem (financial precision) is already solved by the Prisma.Decimal pattern the codebase uses everywhere. Don't deviate from it.

## Common Pitfalls

### Pitfall 1: Miles Data Gap in Load Model
**What goes wrong:** The `Load` model has `origin`, `destination`, and `rate` — but no `distanceMiles` column. The `Route` model has `distanceMiles: Float?`, but many loads may not have a linked route. PER_MILE pay type requires miles per load.
**Why it happens:** Loads were designed as a dispatch concept (origin/destination strings); mileage was computed on routes.
**How to avoid:** Plan 20-01 must explicitly add a `distanceMiles` column to the `Load` model, or document that loads without a route use `route.distanceMiles` (nullable). The safest path: add `distanceMiles Decimal? @db.Decimal(10,2)` to `Load` with a migration column, and let the settlement engine fall back to `0` if null (SettlementLine shows `0` miles with a note).
**Warning signs:** If `calculateSettlement` is called for a PER_MILE config driver with no route-linked loads, all line items show $0 pay.

### Pitfall 2: Enum Name Collision with Existing `PayrollStatus`
**What goes wrong:** The existing `PayrollStatus` enum already has `DRAFT | APPROVED | PAID`. The new `SettlementStatus` needs the same values. If named identically, the migration fails.
**Why it happens:** PostgreSQL enums are global to the schema.
**How to avoid:** Name the new enum `SettlementStatus` (not `PayrollStatus`). The migration already creates `PayrollStatus`; a second `CREATE TYPE "PayrollStatus"` would error.
**Warning signs:** Migration error: `type "PayrollStatus" already exists`.

### Pitfall 3: SettlementLine Missing tenantId (RLS Lockout)
**What goes wrong:** If `SettlementLine` has no `tenantId` column and RLS is enabled (even via `current_tenant_id()`), all queries return empty results because the RLS policy can't match.
**Why it happens:** `InvoiceItem` had this bug initially and was fixed in migration `20260226000002_add_rls_missing_tables`. SettlementLine must be designed correctly from the start.
**How to avoid:** Include `tenantId UUID NOT NULL` in `SettlementLine` from the beginning. The Prisma schema must have `tenantId String @db.Uuid` with the Tenant relation. The migration must include RLS policies.
**Warning signs:** Settlement detail page shows empty line items even though DB has rows.

### Pitfall 4: react-pdf `'use client'` Boundary Violation
**What goes wrong:** Importing `@react-pdf/renderer` in a server component file (`.tsx` without `'use client'`) can cause build errors or runtime crashes because some react-pdf internals reference browser globals.
**Why it happens:** react-pdf ships both a browser and Node bundle; the import path matters.
**How to avoid:** The `settlement-pdf.tsx` component can be a plain module (no `'use client'` directive) because it is only imported by the Route Handler (a server-side Node context). Never import it into a Next.js page/layout that gets tree-shaken into the browser bundle. If a live preview is ever needed, use `BlobProvider` in a dedicated `'use client'` component.
**Warning signs:** Build error: `Cannot read properties of undefined (reading 'createContext')` or similar browser-global errors during `next build`.

### Pitfall 5: Duplicate Settlement Creation
**What goes wrong:** If a user clicks "Generate Settlement" twice, two `DriverSettlement` records may be created for the same driver and period, both in DRAFT status.
**Why it happens:** No uniqueness constraint on `(driverId, periodStart, periodEnd)`.
**How to avoid:** Add a unique index: `CREATE UNIQUE INDEX "DriverSettlement_driverId_periodStart_periodEnd_key" ON "DriverSettlement"("driverId", "periodStart", "periodEnd");` and handle Prisma error code `P2002` in the action.
**Warning signs:** Settlement list shows duplicate entries for same driver and period.

### Pitfall 6: Mixing `renderToBuffer` and `renderToStream` in Route Handler
**What goes wrong:** `renderToStream` returns a `NodeJS.ReadableStream`, which requires piping. `Response` constructor accepts `ReadableStream` but the Node stream type is not a Web `ReadableStream`.
**Why it happens:** Confusing the Node.js stream API with the Web Streams API.
**How to avoid:** Use `renderToBuffer()` — it returns `Promise<Buffer>`, which can be passed directly to `new Response(buffer, { headers: {...} })`. This is simpler and correct.
**Warning signs:** TypeScript error: `Type 'NodeJS.ReadableStream' is not assignable to type 'BodyInit'`.

## Code Examples

Verified patterns from official sources and codebase inspection:

### Decimal arithmetic for pay calculation
```typescript
// Source: codebase — src/app/(owner)/actions/invoices.ts (Prisma.Decimal pattern)
// Source: codebase — src/lib/finance/route-calculator.ts
import { Prisma } from '@/generated/prisma';
const Decimal = Prisma.Decimal;

// PER_MILE: rate * miles
const payAmount = new Decimal(payConfig.rateValue).mul(new Decimal(load.distanceMiles ?? 0));

// PERCENTAGE: grossRate * (percent / 100)
const payAmount = new Decimal(load.rate).mul(new Decimal(payConfig.rateValue)).div(100);

// FLAT: just the flat rate
const payAmount = new Decimal(payConfig.rateValue);

// Sum total
const totalPay = lines.reduce((sum, l) => sum.add(l.payAmount), new Decimal(0));

// Serialize for display (always toFixed(2) to avoid trailing decimals)
totalPay.toFixed(2); // "1234.56"
```

### Prisma schema for new models
```prisma
// Source: Codebase schema.prisma patterns
enum DriverPayType {
  PER_MILE
  PERCENTAGE
  FLAT
}

enum SettlementStatus {
  DRAFT
  APPROVED
  PAID
}

model DriverPayConfig {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String       @db.Uuid
  driverId      String       @db.Uuid
  payType       DriverPayType
  rateValue     Decimal      @db.Decimal(10, 4)  // 4 decimal places for rate per mile
  effectiveFrom DateTime     @default(now()) @db.Timestamptz
  createdAt     DateTime     @default(now()) @db.Timestamptz
  updatedAt     DateTime     @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  driver User   @relation(fields: [driverId], references: [id])

  @@index([tenantId])
  @@index([driverId])
  @@index([effectiveFrom])
}

model DriverSettlement {
  id          String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String           @db.Uuid
  driverId    String           @db.Uuid
  periodStart DateTime         @db.Timestamptz
  periodEnd   DateTime         @db.Timestamptz
  status      SettlementStatus @default(DRAFT)
  totalPay    Decimal          @db.Decimal(10, 2)
  paidAt      DateTime?        @db.Timestamptz
  notes       String?
  createdAt   DateTime         @default(now()) @db.Timestamptz
  updatedAt   DateTime         @updatedAt @db.Timestamptz

  tenant         Tenant           @relation(fields: [tenantId], references: [id])
  driver         User             @relation(name: "DriverSettlements", fields: [driverId], references: [id])
  lines          SettlementLine[]
  payrollRecords PayrollRecord[]

  @@unique([driverId, periodStart, periodEnd])
  @@index([tenantId])
  @@index([driverId])
  @@index([status])
  @@index([periodStart])
}

model SettlementLine {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  settlementId String   @db.Uuid
  tenantId     String   @db.Uuid
  loadId       String   @db.Uuid
  description  String
  miles        Decimal  @default(0) @db.Decimal(10, 2)
  grossRate    Decimal  @db.Decimal(12, 2)
  payAmount    Decimal  @db.Decimal(10, 2)
  createdAt    DateTime @default(now()) @db.Timestamptz

  settlement DriverSettlement @relation(fields: [settlementId], references: [id], onDelete: Cascade)
  tenant     Tenant           @relation(fields: [tenantId], references: [id])

  @@index([settlementId])
  @@index([tenantId])
}
```

### RLS migration block (template for all 3 new tables)
```sql
-- Source: codebase — prisma/migrations/20260218000002_add_crm_invoice_payroll_models/migration.sql

ALTER TABLE "DriverPayConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DriverPayConfig" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "DriverPayConfig"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "DriverPayConfig"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- Repeat for DriverSettlement and SettlementLine
```

### renderToBuffer in a Next.js Route Handler
```typescript
// Source: @react-pdf/renderer v4 type defs (lib/react-pdf.d.ts line 689)
// renderToBuffer is Node-platform only — correct for App Router Route Handlers

import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';

// In GET handler:
const buffer = await renderToBuffer(
  React.createElement(SettlementPDF, { settlement })
);

return new Response(buffer, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="settlement-${id}.pdf"`,
    'Cache-Control': 'no-store',
  },
});
```

### User relation naming conflict resolution
```prisma
// Source: codebase schema.prisma — User model uses named relations
// (e.g., "DriverLoads" for Load, "DriverDocuments" for Document)
// New relations to User must use named relations to avoid ambiguity:

model User {
  // existing...
  driverPayConfigs    DriverPayConfig[]
  driverSettlements   DriverSettlement[] @relation(name: "DriverSettlements")
}

model DriverSettlement {
  driver User @relation(name: "DriverSettlements", fields: [driverId], references: [id])
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `renderToString` | `renderToBuffer` | react-pdf v3+ | `renderToString` is marked deprecated in v4 type defs; use `renderToBuffer` |
| Float arithmetic for money | `Prisma.Decimal` / Decimal.js | Project convention since Phase 16 | Prevents penny-rounding errors in payroll |
| Manual RLS bypass with raw SQL | `withTenantRLS` extension | Phase 1 | Automated via `getTenantPrisma()` |

**Deprecated/outdated:**
- `renderToString`: Deprecated in react-pdf v4 (type def says `@deprecated use the renderToBuffer method`)
- `PDFDownloadLink` for server rendering: Browser-only component; useless in Route Handlers

## Open Questions

1. **Miles source for Load model**
   - What we know: `Load` has no `distanceMiles` column; `Route` has `distanceMiles: Float?` (nullable); Load has optional `routeId`
   - What's unclear: Should miles be stored on Load directly (added in this migration), or should the settlement engine join through `load.route.distanceMiles`?
   - Recommendation: Add `distanceMiles Decimal? @db.Decimal(10, 2)` to `Load` in the Plan 20-01 migration. This makes each load self-contained for pay calculation and avoids JOIN complexity. If null, default to 0 and note it on the settlement line.

2. **DriverPayConfig — one config or multiple over time?**
   - What we know: The plan spec includes `effectiveFrom` for time-based configs
   - What's unclear: Does the UI need to show config history, or just the active config?
   - Recommendation: Store full history (the `effectiveFrom` + `orderBy desc + take: 1` pattern retrieves the most recent). No UI for history needed in this phase.

3. **Tenant relation back-references**
   - What we know: `Tenant` model lists every relation explicitly; new models must add back-references
   - What's unclear: The schema.prisma `Tenant` model block must be updated
   - Recommendation: In Plan 20-01, add `driverPayConfigs DriverPayConfig[]`, `driverSettlements DriverSettlement[]`, and `settlementLines SettlementLine[]` to the Tenant model block in schema.prisma.

4. **Settlement-to-PayrollRecord FK direction**
   - What we know: Plan spec says "link Payroll records to settlement via settlementId FK" on PayrollRecord
   - What's unclear: This means PayrollRecord gets a new optional `settlementId` column, altering an existing table
   - Recommendation: Yes — add `settlementId UUID` nullable column to PayrollRecord with `ON DELETE SET NULL`. This is Plan 20-03 territory and requires an `ALTER TABLE` migration alongside the new tables.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `prisma/schema.prisma` — all existing model patterns, field types, relation naming
- Codebase inspection: `prisma/migrations/20260218000002_add_crm_invoice_payroll_models/migration.sql` — RLS + enum + FK migration pattern
- Codebase inspection: `src/app/(owner)/actions/invoices.ts` — transaction pattern with line items + Decimal.js
- Codebase inspection: `src/app/(owner)/actions/payroll.ts` — Prisma.Decimal import pattern
- Codebase inspection: `src/lib/finance/route-calculator.ts` — Decimal accumulate + toFixed(2) pattern
- Codebase inspection: `src/lib/db/prisma.ts` — TX_OPTIONS for all transactions
- Codebase inspection: `package.json` — `@react-pdf/renderer` 4.3.2 confirmed installed
- Direct type inspection: `node_modules/@react-pdf/renderer/lib/react-pdf.d.ts` — `renderToBuffer`, `PDFDownloadLink`, `Document`, `Page`, `View`, `Text`, `StyleSheet.create` APIs confirmed

### Secondary (MEDIUM confidence)
- Codebase inspection: `src/app/(owner)/invoices/[id]/page.tsx` — line-item detail page pattern (parallel for settlement detail)
- Codebase inspection: `prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql` — confirms `InvoiceItem` had the missing-tenantId bug; SettlementLine must have tenantId from the start

### Tertiary (LOW confidence)
- None — all findings verified from installed package type definitions and codebase source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from package.json and installed type definitions
- Architecture: HIGH — patterns derived directly from existing codebase (Invoice/InvoiceItem, payroll actions, migration conventions)
- Pitfalls: HIGH — most derived from actual past bugs in this codebase (InvoiceItem tenantId fix, existing migration patterns)
- PDF API: HIGH — verified from installed `@react-pdf/renderer` 4.3.2 type definitions; `renderToBuffer` confirmed, `renderToString` confirmed deprecated

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable stack; react-pdf and Prisma APIs are stable)
