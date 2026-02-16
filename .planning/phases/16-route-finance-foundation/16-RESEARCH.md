# Phase 16: Route Finance Foundation - Research

**Researched:** 2026-02-16
**Domain:** Financial data tracking, expense management, profit calculation
**Confidence:** HIGH

## Summary

Phase 16 adds financial tracking to routes with line-item expenses, payment/revenue recording, and profit calculation. The project already has proven patterns for financial data (FuelRecord uses Decimal.js via Prisma.Decimal), multi-tenant RLS, server actions with Zod validation, and role-based authorization.

Research confirms that the existing stack is optimal for this phase: Prisma Decimal type with Decimal.js prevents floating-point errors, Zod 4.x supports currency validation via `.multipleOf(0.01)`, and Next.js 16 + React 19's useActionState handles form state with pending indicators. The key architectural decisions are already made in prior phases (use Decimal for money, soft delete for audit trail, optimistic locking for concurrent edits).

**Primary recommendation:** Extend existing patterns from FuelRecord to new RouteExpense and RoutePayment models. Use transaction isolation for multi-line operations, implement soft deletes for audit compliance, add version field for optimistic locking on Route updates, and leverage React 19's useOptimistic for instant UI feedback during financial operations.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma ORM | 7.4.0 | Database + Decimal type | Already in use; Decimal type is industry standard for money (prevents float errors) |
| Decimal.js | (via Prisma) | Arbitrary-precision math | Prisma's Decimal type uses this; prevents 0.1 + 0.2 = 0.30000000000000004 |
| Zod | 4.3.6 | Schema validation | Already in use; v4 supports `.multipleOf(0.01)` for currency |
| Next.js | 16.0.0 | Framework + Server Actions | Already in use; Server Actions are stable in production |
| React | 19.0.0 | UI + Forms | Already in use; useActionState + useOptimistic built-in |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React 19 useActionState | Built-in | Form state + pending | Every expense/payment form (tracks async action state) |
| React 19 useOptimistic | Built-in | Optimistic UI updates | Financial operations (show "Saving..." instantly while server confirms) |
| Prisma Transactions | Built-in | Atomic multi-line ops | Creating route + multiple expenses in one operation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Decimal.js | Store as integer cents | Simpler but loses semantic meaning; 12345 cents vs $123.45 Decimal |
| Prisma Decimal | Big.js or Dinero.js | Different API, no native Prisma integration |
| Soft delete (deletedAt) | Audit log table | More complex; soft delete simpler for financial compliance |
| Optimistic locking (version) | Pessimistic locking | Requires database locks; hurts concurrency in multi-user SaaS |

**Installation:**
```bash
# All dependencies already installed
# No new packages needed for Phase 16
```

## Architecture Patterns

### Recommended Database Schema
```
Route (existing)
├── id, tenantId, driverId, truckId
├── origin, destination, scheduledDate, status
├── version (NEW)          # Optimistic locking for concurrent edits
└── completedAt

RouteExpense (NEW)
├── id, tenantId, routeId
├── category (ENUM or FK to ExpenseCategory)
├── amount (Decimal @db.Decimal(10, 2))
├── description, notes
├── deletedAt              # Soft delete for audit trail
└── createdAt, updatedAt

ExpenseCategory (NEW)
├── id, tenantId
├── name (e.g., "Gas", "Tolls", "Driver Salary")
├── isSystemDefault (boolean)  # Gas, Tolls are built-in; custom are user-created
└── createdAt, updatedAt

ExpenseTemplate (NEW)
├── id, tenantId
├── name (e.g., "Standard Route", "Long Haul")
├── templateItems (JSON or separate table)
└── createdAt, updatedAt

RoutePayment (NEW)
├── id, tenantId, routeId
├── amount (Decimal @db.Decimal(10, 2))
├── status (ENUM: PENDING, PAID)
├── paidAt
├── deletedAt              # Soft delete for audit trail
└── createdAt, updatedAt
```

### Pattern 1: Decimal Type for All Currency Fields
**What:** Use Prisma Decimal type for amounts, NOT Float or JavaScript number
**When to use:** Every monetary field (expense amount, payment amount, profit)
**Example:**
```typescript
// Source: Existing FuelRecord pattern in schema.prisma
model RouteExpense {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  routeId     String   @db.Uuid
  category    String
  amount      Decimal  @db.Decimal(10, 2)  // Precision: 10 digits, 2 after decimal
  description String
  notes       String?
  deletedAt   DateTime? @db.Timestamptz
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  route  Route  @relation(fields: [routeId], references: [id])

  @@index([tenantId])
  @@index([routeId])
  @@index([deletedAt])  // Query non-deleted expenses efficiently
}
```

### Pattern 2: Decimal.js Arithmetic (Never Use Number)
**What:** Perform all financial calculations using Decimal methods
**When to use:** Profit calculation, cost-per-mile, fleet averages
**Example:**
```typescript
// Source: Context7 Prisma Decimal docs + src/lib/fuel/fuel-calculator.ts pattern
import { Decimal } from '@prisma/client/runtime/library';

// WRONG: Float arithmetic introduces rounding errors
const totalFloat = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
const profitFloat = revenue - totalFloat; // 0.1 + 0.2 = 0.30000000000000004

// CORRECT: Decimal.js preserves precision
const totalExpenses = expenses.reduce(
  (sum, expense) => sum.add(new Decimal(expense.amount)),
  new Decimal(0)
);
const profit = new Decimal(payment.amount).sub(totalExpenses);

// CORRECT: Division with explicit zero-check
function calculateCostPerMile(totalCost: Decimal, miles: number): Decimal {
  if (miles === 0) return new Decimal(0);
  return totalCost.div(miles).toDecimalPlaces(2); // Round to cents
}
```

### Pattern 3: Soft Delete for Financial Records
**What:** Use deletedAt timestamp instead of hard delete
**When to use:** All financial records (RouteExpense, RoutePayment)
**Example:**
```typescript
// Source: v3.0 research decision + industry best practice
// CRITICAL: Financial records must NEVER be hard-deleted for audit compliance

// Server action to "delete" expense
export async function deleteExpense(expenseId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  // Soft delete: set deletedAt instead of .delete()
  await prisma.routeExpense.update({
    where: { id: expenseId },
    data: { deletedAt: new Date() }
  });

  revalidatePath('/routes/[id]');
  return { success: true };
}

// Query non-deleted expenses
const expenses = await prisma.routeExpense.findMany({
  where: {
    routeId,
    deletedAt: null  // Filter out soft-deleted records
  }
});
```

### Pattern 4: Optimistic Locking for Route Updates
**What:** Add version field to Route model, increment on every update
**When to use:** Prevent concurrent edit conflicts (two managers editing same route)
**Example:**
```typescript
// Source: v3.0 research decision + Prisma transaction patterns
// Add to schema.prisma Route model:
// version Int @default(1)

export async function updateRouteWithExpenses(
  routeId: string,
  routeData: RouteUpdate,
  expenses: ExpenseCreate[]
) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      // Read current version
      const route = await tx.route.findUnique({ where: { id: routeId } });
      if (!route) throw new Error('Route not found');

      // Update with version check (Prisma will auto-increment version)
      await tx.route.update({
        where: {
          id: routeId,
          version: route.version  // Fails if another user updated first
        },
        data: {
          ...routeData,
          version: { increment: 1 }
        }
      });

      // Create expenses atomically in same transaction
      await tx.routeExpense.createMany({
        data: expenses.map(e => ({ ...e, routeId, tenantId: route.tenantId }))
      });
    });

    return { success: true };
  } catch (error) {
    if (error.code === 'P2025') {
      return { error: 'Route was updated by another user. Please refresh and try again.' };
    }
    throw error;
  }
}
```

### Pattern 5: Zod Currency Validation
**What:** Validate decimal amounts with min/max/precision constraints
**When to use:** All expense/payment form validation
**Example:**
```typescript
// Source: Zod 4.x docs + existing routeCreateSchema pattern
import { z } from 'zod';

export const expenseCreateSchema = z.object({
  routeId: z.string().uuid(),
  category: z.string().min(1).max(50),
  amount: z.coerce
    .number()
    .positive('Amount must be positive')
    .finite('Amount must be finite')
    .multipleOf(0.01, 'Amount must have at most 2 decimal places')
    .max(999999.99, 'Amount cannot exceed $999,999.99'),
  description: z.string().min(1).max(200),
  notes: z.string().max(1000).optional(),
});

export const paymentCreateSchema = z.object({
  routeId: z.string().uuid(),
  amount: z.coerce
    .number()
    .positive('Payment must be positive')
    .multipleOf(0.01)
    .max(9999999.99, 'Payment cannot exceed $9,999,999.99'),
  status: z.enum(['PENDING', 'PAID']),
  paidAt: z.string().datetime().optional(), // ISO timestamp from datetime-local input
});

// In server action, convert validated number to Decimal
const result = expenseCreateSchema.safeParse(rawData);
if (!result.success) return { error: result.error.flatten().fieldErrors };

await prisma.routeExpense.create({
  data: {
    ...result.data,
    amount: new Decimal(result.data.amount), // Convert to Decimal for Prisma
  }
});
```

### Pattern 6: React 19 useActionState for Forms
**What:** Use useActionState to track async form submission state
**When to use:** Every expense/payment form (shows pending state, errors)
**Example:**
```typescript
// Source: Next.js 16 + React 19 docs + existing route form pattern
'use client';
import { useActionState } from 'react';
import { createExpense } from '@/app/(owner)/actions/expenses';

export function ExpenseForm({ routeId }: { routeId: string }) {
  const [state, formAction, isPending] = useActionState(createExpense, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="routeId" value={routeId} />

      <label>Category</label>
      <select name="category" disabled={isPending}>
        <option value="gas">Gas</option>
        <option value="tolls">Tolls</option>
        <option value="driver_salary">Driver Salary</option>
      </select>
      {state?.error?.category && <p className="text-red-600">{state.error.category[0]}</p>}

      <label>Amount</label>
      <input
        type="number"
        name="amount"
        step="0.01"
        min="0"
        max="999999.99"
        disabled={isPending}
      />
      {state?.error?.amount && <p className="text-red-600">{state.error.amount[0]}</p>}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Add Expense'}
      </button>
    </form>
  );
}
```

### Pattern 7: Transaction Isolation for Multi-Line Operations
**What:** Use Prisma transactions when creating/updating multiple related records
**When to use:** Apply expense template (creates multiple expenses), update route + payment status
**Example:**
```typescript
// Source: Prisma transaction docs + existing webhook pattern
export async function applyExpenseTemplate(routeId: string, templateId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  await prisma.$transaction(async (tx) => {
    // Read template items
    const template = await tx.expenseTemplate.findUnique({
      where: { id: templateId },
      include: { items: true }
    });
    if (!template) throw new Error('Template not found');

    // Create all expenses atomically
    await tx.routeExpense.createMany({
      data: template.items.map(item => ({
        routeId,
        tenantId: template.tenantId,
        category: item.category,
        amount: item.amount,
        description: item.description,
      }))
    });
  });

  revalidatePath(`/routes/${routeId}`);
  return { success: true };
}
```

### Anti-Patterns to Avoid

- **Never use JavaScript number for currency:** 0.1 + 0.2 = 0.30000000000000004 will cause financial errors
- **Never hard-delete financial records:** Soft delete with deletedAt preserves audit trail for tax/compliance
- **Never skip zero-division checks:** cost-per-mile calculation will throw if miles = 0; return 0 instead
- **Never allow negative amounts without validation:** Gas cost of -$50 breaks profit calculation; validate `.positive()` in Zod
- **Never update Route without version check:** Two managers editing simultaneously causes race condition; use optimistic locking
- **Never convert Decimal to number during calculation:** `totalCost.toNumber() + expense.amount.toNumber()` loses precision; use `.add()`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Financial precision | Custom decimal library | Prisma Decimal + Decimal.js | Handles edge cases (NaN, Infinity, precision), already integrated with Prisma |
| Optimistic locking | Manual version comparison logic | Prisma version + where clause | Prisma's update fails atomically if version changed; no custom retry logic |
| Soft delete filtering | Manual deletedAt checks everywhere | Prisma middleware or scoped extension | Easy to forget `deletedAt: null` in one query; centralized filter safer |
| Currency validation | Regex for decimal format | Zod `.multipleOf(0.01)` | Zod handles locale, scientific notation, edge cases; regex fragile |
| Profit alerts | Polling database for margin checks | Database trigger or scheduled cron | Real-time alerts need async job queue, not inline calculation |
| Duplicate expense detection | Manual uniqueness checks | Unique index + idempotency key | Race condition between read/write; database constraint is atomic |

**Key insight:** Financial calculations have deceptively complex edge cases (division by zero, negative amounts, concurrent edits, precision loss). Leverage proven patterns from existing FuelRecord implementation and Prisma's built-in features rather than building custom solutions.

## Common Pitfalls

### Pitfall 1: Floating-Point Precision Loss
**What goes wrong:** Using JavaScript number for currency causes rounding errors (0.1 + 0.2 = 0.30000000000000004)
**Why it happens:** IEEE 754 floating-point can't represent decimal fractions exactly
**How to avoid:** ALWAYS use Prisma Decimal type and Decimal.js methods for financial calculations
**Warning signs:** Profit calculations off by 1 cent, cost-per-mile showing 0.399999998 instead of 0.40

### Pitfall 2: Division by Zero in Cost-Per-Mile
**What goes wrong:** Calculating cost-per-mile throws error when route has 0 miles (odometer not updated yet)
**Why it happens:** No validation before division; `totalCost.div(0)` throws
**How to avoid:** Explicit zero-check before division, return Decimal(0) or display "N/A" in UI
**Warning signs:** 500 errors on route detail page, "Infinity" displayed in metrics

### Pitfall 3: Race Condition on Concurrent Route Updates
**What goes wrong:** Manager A and Manager B both edit same route; last write wins, losing Manager A's changes
**Why it happens:** No optimistic locking; database UPDATE succeeds even if data changed between read/write
**How to avoid:** Add version field to Route model, include in WHERE clause during update
**Warning signs:** Users report "my changes disappeared," expense list reverts to old state

### Pitfall 4: Hard Delete Breaks Audit Trail
**What goes wrong:** Owner deletes expense, accountant can't reconcile end-of-month totals, IRS audit fails
**Why it happens:** Hard delete (`prisma.routeExpense.delete()`) removes record permanently
**How to avoid:** Use soft delete pattern (set deletedAt timestamp), filter queries with `deletedAt: null`
**Warning signs:** Missing expense records in historical reports, can't reproduce old profit calculations

### Pitfall 5: Negative Amounts Corrupt Profit Calculation
**What goes wrong:** Form allows -$50 gas cost, profit shows $150 instead of $50 (double counting)
**Why it happens:** No validation for positive amounts; user typo or malicious input
**How to avoid:** Zod schema with `.positive()` constraint, HTML input with `min="0"`
**Warning signs:** Profit higher than payment amount, negative total expenses

### Pitfall 6: Allowing Expense Edits After Route Completed
**What goes wrong:** Route marked COMPLETED, profit reported to customer, then driver adds forgotten expense
**Why it happens:** No status validation before expense create/update
**How to avoid:** Check route.status in server action, return error if status = COMPLETED
**Warning signs:** Historical profit changes, customer disputes invoice

### Pitfall 7: Missing Tenant Isolation on Cross-Route Queries
**What goes wrong:** Fleet average calculation includes expenses from other tenants
**Why it happens:** Forgot to filter by tenantId in raw SQL query
**How to avoid:** ALWAYS use getTenantPrisma() which enforces RLS; never use global prisma client
**Warning signs:** Fleet average changes when other tenant adds data, data leak in multi-tenant environment

### Pitfall 8: Not Revalidating After Financial Mutation
**What goes wrong:** User adds expense, navigates to route list, profit still shows old value (Next.js cache)
**Why it happens:** Forgot revalidatePath() after create/update/delete
**How to avoid:** Call revalidatePath() for both detail page and list page after every mutation
**Warning signs:** User refreshes page to see changes, metrics don't update after form submission

## Code Examples

Verified patterns from official sources and existing codebase:

### Calculate Total Operating Cost
```typescript
// Source: Prisma Decimal.js + existing fuel-calculator.ts pattern
import { Decimal } from '@prisma/client/runtime/library';

export async function calculateRouteOperatingCost(routeId: string): Promise<Decimal> {
  const prisma = await getTenantPrisma();

  const expenses = await prisma.routeExpense.findMany({
    where: {
      routeId,
      deletedAt: null  // Exclude soft-deleted expenses
    }
  });

  // Sum using Decimal.add() to prevent float errors
  const totalCost = expenses.reduce(
    (sum, expense) => sum.add(new Decimal(expense.amount)),
    new Decimal(0)
  );

  return totalCost;
}
```

### Calculate Profit (Payment - Expenses)
```typescript
// Source: Prisma Decimal.js + financial calculation best practices
import { Decimal } from '@prisma/client/runtime/library';

export async function calculateRouteProfit(routeId: string): Promise<{
  payment: Decimal;
  expenses: Decimal;
  profit: Decimal;
  marginPercent: number;
}> {
  const prisma = await getTenantPrisma();

  // Fetch payment and expenses in parallel
  const [payment, expenses] = await Promise.all([
    prisma.routePayment.findFirst({
      where: { routeId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.routeExpense.findMany({
      where: { routeId, deletedAt: null }
    })
  ]);

  const paymentAmount = payment ? new Decimal(payment.amount) : new Decimal(0);
  const totalExpenses = expenses.reduce(
    (sum, e) => sum.add(new Decimal(e.amount)),
    new Decimal(0)
  );

  const profit = paymentAmount.sub(totalExpenses);

  // Calculate margin: (profit / payment) * 100
  // Handle zero-division edge case
  const marginPercent = paymentAmount.isZero()
    ? 0
    : profit.div(paymentAmount).mul(100).toNumber();

  return {
    payment: paymentAmount,
    expenses: totalExpenses,
    profit,
    marginPercent: Number(marginPercent.toFixed(2))
  };
}
```

### Calculate Cost Per Mile with Fleet Average
```typescript
// Source: Existing fuel-calculator.ts pattern + trucking industry research
import { Decimal } from '@prisma/client/runtime/library';

export async function calculateCostPerMile(routeId: string): Promise<{
  routeCostPerMile: Decimal;
  fleetAverage: Decimal;
  comparison: 'above' | 'below' | 'equal';
}> {
  const prisma = await getTenantPrisma();

  // Get route distance (from odometer or calculated)
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: {
      truck: { select: { odometer: true } }
    }
  });
  if (!route) throw new Error('Route not found');

  // For this example, assume distance stored in route or calculated from GPS
  // Real implementation would track start/end odometer
  const miles = 250; // TODO: Calculate from actual data

  // Calculate route cost per mile
  const totalCost = await calculateRouteOperatingCost(routeId);
  const routeCostPerMile = miles === 0
    ? new Decimal(0)
    : totalCost.div(miles).toDecimalPlaces(2);

  // Calculate fleet average cost per mile (last 30 days)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const tenantId = await requireTenantId();

  const fleetData = await tenantRawQuery((tx) =>
    tx.$queryRaw`
      SELECT
        COALESCE(SUM(re.amount), 0)::float as "totalCost",
        COUNT(DISTINCT re."routeId")::int as "routeCount"
      FROM "RouteExpense" re
      INNER JOIN "Route" r ON re."routeId" = r.id
      WHERE re."tenantId" = ${tenantId}::uuid
        AND re."deletedAt" IS NULL
        AND r."completedAt" >= ${cutoff}
        AND r."completedAt" IS NOT NULL
    `
  );

  const avgCostPerRoute = fleetData[0].routeCount === 0
    ? new Decimal(0)
    : new Decimal(fleetData[0].totalCost).div(fleetData[0].routeCount).toDecimalPlaces(2);

  // Compare route to fleet average
  let comparison: 'above' | 'below' | 'equal' = 'equal';
  if (routeCostPerMile.greaterThan(avgCostPerRoute)) comparison = 'above';
  if (routeCostPerMile.lessThan(avgCostPerRoute)) comparison = 'below';

  return {
    routeCostPerMile,
    fleetAverage: avgCostPerRoute,
    comparison
  };
}
```

### Profit Margin Alert Check
```typescript
// Source: SaaS threshold monitoring patterns + existing notification system
export async function checkProfitMarginAlert(routeId: string): Promise<{
  shouldAlert: boolean;
  marginPercent: number;
  threshold: number;
}> {
  const prisma = await getTenantPrisma();
  const tenantId = await requireTenantId();

  // Get tenant's configured threshold (default: 10%)
  // In real implementation, store threshold in Tenant table
  const MARGIN_THRESHOLD = 10; // 10%

  const { marginPercent } = await calculateRouteProfit(routeId);

  const shouldAlert = marginPercent < MARGIN_THRESHOLD;

  // If alert triggered, create notification
  if (shouldAlert) {
    await prisma.notificationLog.create({
      data: {
        tenantId,
        idempotencyKey: `profit-alert-${routeId}-${Date.now()}`,
        notificationType: 'PROFIT_ALERT',
        entityType: 'Route',
        entityId: routeId,
        recipientEmail: 'owner@example.com', // TODO: Get from tenant owner
        emailSubject: `Low profit margin alert: Route ${routeId}`,
        status: 'PENDING'
      }
    });
  }

  return {
    shouldAlert,
    marginPercent,
    threshold: MARGIN_THRESHOLD
  };
}
```

### Server Action: Create Expense with Validation
```typescript
// Source: Existing createRoute pattern + Zod validation
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { expenseCreateSchema } from '@/lib/validations/expense.schemas';
import { revalidatePath } from 'next/cache';
import { Decimal } from '@prisma/client/runtime/library';

export async function createExpense(prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    routeId: formData.get('routeId') as string,
    category: formData.get('category') as string,
    amount: formData.get('amount') as string,
    description: formData.get('description') as string,
    notes: formData.get('notes') as string || undefined,
  };

  const result = expenseCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    // Verify route exists and is not COMPLETED
    const route = await prisma.route.findUnique({
      where: { id: result.data.routeId }
    });

    if (!route) {
      return { error: { routeId: ['Route not found'] } };
    }

    if (route.status === 'COMPLETED') {
      return { error: 'Cannot add expenses to completed route' };
    }

    // Create expense with Decimal amount
    await prisma.routeExpense.create({
      data: {
        tenantId,
        routeId: result.data.routeId,
        category: result.data.category,
        amount: new Decimal(result.data.amount),
        description: result.data.description,
        notes: result.data.notes,
      }
    });

    revalidatePath(`/routes/${result.data.routeId}`);
    revalidatePath('/routes');

    return { success: true };
  } catch (error) {
    console.error('Failed to create expense:', error);
    return { error: 'Failed to create expense. Please try again.' };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Float for currency | Decimal type + Decimal.js | 2020+ (Prisma 2.x) | Eliminates floating-point errors in financial calculations |
| Hard delete | Soft delete (deletedAt) | Industry standard 2015+ | Preserves audit trail for tax/compliance |
| Pessimistic locking | Optimistic locking (version field) | Multi-tenant SaaS standard 2018+ | Better concurrency in web apps |
| Store cents as integer | Store dollars as Decimal | Debated; both valid in 2026 | Decimal more semantic ($123.45 vs 12345), better for reporting |
| Form validation in client only | Zod schema on server + client | Next.js 13+ (2022) | Security: never trust client validation |
| useState for forms | useActionState (React 19) | React 19 stable (Dec 2024) | Built-in pending state, cleaner API |
| Manual optimistic UI | useOptimistic (React 19) | React 19 stable (Dec 2024) | Framework handles rollback on error |

**Deprecated/outdated:**
- **Storing money as Float:** Causes precision errors; use Decimal
- **Manual form state management:** React 19's useActionState is now standard
- **Separate loading state for forms:** useActionState provides isPending built-in
- **Client-only validation:** Always validate on server with Zod for security

## Open Questions

1. **Distance/Mileage Tracking for Cost-Per-Mile**
   - What we know: FuelRecord has odometer field; Route does not yet track start/end odometer
   - What's unclear: Should cost-per-mile use GPS distance calculation or odometer difference?
   - Recommendation: Add startOdometer and endOdometer fields to Route model for accuracy; GPS distance as fallback

2. **Profit Margin Threshold Configuration**
   - What we know: Requirement FIN-10 says "alert when profit margin falls below configured threshold"
   - What's unclear: Where to store threshold? Global tenant setting or per-route?
   - Recommendation: Add profitMarginThreshold (Decimal, default 10) to Tenant table; allows per-tenant configuration

3. **Multiple Payments Per Route**
   - What we know: Requirement says "record payment/revenue for a route"
   - What's unclear: Can a route have multiple payments (partial payments, deposits)?
   - Recommendation: Allow multiple RoutePayment records; sum them for total revenue in profit calculation

4. **Expense Categories: Enum vs Database Table**
   - What we know: Need system defaults (Gas, Tolls) + custom user categories
   - What's unclear: Use Prisma enum + custom table, or single ExpenseCategory table with isSystemDefault flag?
   - Recommendation: Use ExpenseCategory table with isSystemDefault boolean; simpler schema, easier to add categories

5. **When to Lock Route Finances**
   - What we know: Common pitfall is editing expenses after route completed
   - What's unclear: Should COMPLETED routes be fully locked, or allow corrections with audit log?
   - Recommendation: Lock COMPLETED routes from UI edits; if correction needed, soft-delete old expense + create new one with note

## Sources

### Primary (HIGH confidence)
- Prisma Schema (C:/Users/sammy/Projects/DriveCommand/prisma/schema.prisma) - Current FuelRecord Decimal pattern, existing Route model
- FuelRecord Calculator (src/lib/fuel/fuel-calculator.ts) - Proven Decimal.js arithmetic patterns
- Route Actions (src/app/(owner)/actions/routes.ts) - Existing server action patterns, role auth, validation
- Package.json - Stack versions (Next.js 16, React 19, Prisma 7.4, Zod 4.3.6)
- [Prisma Decimal Type Documentation](https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types) - Official Decimal field usage
- [Prisma Transaction Documentation](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) - Atomic operations, isolation levels

### Secondary (MEDIUM confidence)
- [API with NestJS #147: Data types to store money](https://wanago.io/2024/03/04/api-nestjs-money-postgresql-prisma/) - Prisma Decimal best practices for financial data
- [Avoiding Problems with Decimal Math in JavaScript](https://adripofjavascript.com/blog/drips/avoiding-problems-with-decimal-math-in-javascript.html) - Why Decimal.js needed
- [Decimal.js API Documentation](https://mikemcl.github.io/decimal.js/) - Official Decimal.js methods
- [Optimistic Locking with Version Column](https://medium.com/@sumit-s/optimistic-locking-concurrency-control-with-a-version-column-2e3db2a8120d) - Version field pattern
- [How to Implement Optimistic Locking in SQLAlchemy](https://oneuptime.com/blog/post/2026-01-25-optimistic-locking-sqlalchemy/view) - 2026 best practices
- [Soft delete vs hard delete](https://appmaster.io/blog/soft-delete-vs-hard-delete) - Audit trail patterns
- [Rails Soft Delete & Audit Logging Guide](https://sulmanweb.com/rails-soft-delete-audit-logging-implementation) - Financial record retention
- [Next.js Server Actions Guide (2026)](https://makerkit.dev/blog/tutorials/nextjs-server-actions) - useActionState patterns
- [Next.js Forms with Server Actions](https://www.robinwieruch.de/next-forms/) - Form validation with Zod
- [React 19 Official Release](https://react.dev/blog/2024/12/05/react-19) - useActionState and useOptimistic hooks
- [useOptimistic React Documentation](https://react.dev/reference/react/useOptimistic) - Optimistic UI patterns for financial data
- [Zod Currency Validation GitHub Gist](https://gist.github.com/shawncarr/a3819d4a7f98e8f185bc192e89b13de0) - Decimal schema pattern
- [Zod Documentation](https://zod.dev/) - Number validation with multipleOf

### Tertiary (LOW confidence)
- [Multi-tenant SaaS Patterns (Azure)](https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql) - General patterns, not Prisma-specific
- [SaaS Gross Margin Benchmarks (2026)](https://www.cloudzero.com/blog/saas-gross-margin-benchmarks/) - Industry thresholds
- [Trucking Cost Per Mile (2026)](https://www.tcsfuel.com/blog/cost-per-mile-guide/) - Industry averages ($2.26-$2.90/mile)
- [Invoice Payment Status Tracking](https://www.billdu.com/features/invoice-tracking/) - Payment status patterns
- [Common Expense Tracking Mistakes](https://zerocrat.com/5-common-expense-tracking-mistakes-and-how-to-avoid-them/) - General advice, not code-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, versions confirmed from package.json and existing code
- Architecture patterns: HIGH - Directly based on existing FuelRecord/Route patterns in codebase
- Decimal.js usage: HIGH - Official Prisma docs + verified working code in fuel-calculator.ts
- Soft delete: MEDIUM - Industry best practice but not yet implemented in codebase (first financial records)
- Optimistic locking: MEDIUM - v3.0 research decision but not yet implemented in codebase
- Pitfalls: HIGH - Derived from official docs, industry research, and existing codebase patterns
- Cost-per-mile calculations: MEDIUM - Industry averages from 2026 sources, but formula needs project-specific odometer implementation

**Research date:** 2026-02-16
**Valid until:** March 2026 (30 days - stack is stable, financial patterns don't change rapidly)
