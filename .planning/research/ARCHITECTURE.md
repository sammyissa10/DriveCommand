# Architecture Research

**Domain:** Route Finance Tracking, Unified View/Edit Pages, Driver Document Uploads
**Researched:** 2026-02-16
**Confidence:** HIGH

## Integration Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                    Presentation Layer (Next.js 16 App Router)     │
├───────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Unified Route   │  │ Driver Document  │  │ Finance         │  │
│  │ View/Edit Page  │  │ Upload Component │  │ Calculations    │  │
│  │ (searchParams)  │  │ (Reuse Pattern)  │  │ (Derived)       │  │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘  │
│           │                    │                     │            │
├───────────┴────────────────────┴─────────────────────┴────────────┤
│                    Server Actions Layer                           │
├───────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Route       │  │ Driver       │  │ RouteExpense/Payment   │   │
│  │ Actions     │  │ Actions      │  │ Actions                │   │
│  │ (Extended)  │  │ (Extended)   │  │ (NEW)                  │   │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────────────┘   │
│         │                │                  │                     │
├─────────┴────────────────┴──────────────────┴─────────────────────┤
│                  Repository Layer (Prisma 7 + RLS)                │
├───────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ RouteRepository  │  │ DocumentRepo     │  │ RouteExpense   │  │
│  │ (Modified)       │  │ (Extended)       │  │ Repository     │  │
│  │                  │  │ +findByDriverId  │  │ (NEW)          │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬───────┘  │
│           │                     │                     │           │
├───────────┴─────────────────────┴─────────────────────┴───────────┤
│              PostgreSQL 17 with Row Level Security                │
│  ┌──────────┐  ┌────────────────┐  ┌─────────────────────────┐   │
│  │ Route    │  │ RouteExpense   │  │ RoutePayment            │   │
│  │ (Exists) │  │ (NEW)          │  │ (NEW)                   │   │
│  │          │  │ - line items   │  │ - payments received     │   │
│  └──────────┘  └────────────────┘  └─────────────────────────┘   │
│  ┌──────────┐  ┌────────────────┐                                │
│  │ Document │  │ User           │                                │
│  │ (Modify) │  │ (Add driverId) │                                │
│  └──────────┘  └────────────────┘                                │
├───────────────────────────────────────────────────────────────────┤
│              File Storage Layer (Cloudflare R2)                   │
│  tenant-{tenantId}/drivers/{fileId}-{filename}  (NEW category)    │
└───────────────────────────────────────────────────────────────────┘
```

## New vs Modified Components

### NEW Components

| Component | Layer | Purpose | RLS Required |
|-----------|-------|---------|--------------|
| `RouteExpense` model | Database | Line-item expenses for routes | YES - tenantId |
| `RoutePayment` model | Database | Payments received for routes | YES - tenantId |
| `RouteExpenseRepository` | Repository | CRUD for expenses with profit calculation helpers | YES (via TenantRepository) |
| `RoutePaymentRepository` | Repository | CRUD for payments | YES (via TenantRepository) |
| `route-finance-actions.ts` | Server Actions | Expense/payment CRUD, profit calculation | YES (requireRole) |
| `RouteFinanceSection` component | UI | Displays expenses, payments, profit summary | Client component |
| `ExpenseLineItemForm` component | UI | Add/edit expense line items | Client component |
| `PaymentForm` component | UI | Record payments | Client component |

### MODIFIED Components

| Component | Current State | Modifications Needed |
|-----------|---------------|----------------------|
| `Route` model (schema.prisma) | Basic route fields | NO CHANGES (extends via relations) |
| `Document` model | `truckId`, `routeId` fields | Add `driverId` (nullable, for driver uploads) |
| `DocumentRepository` | `findByTruckId`, `findByRouteId` | Add `findByDriverId(driverId: string)` |
| `/routes/[id]/page.tsx` | Separate view and edit pages | Merge into unified page with searchParams |
| `route-detail.tsx` component | Read-only display | Make mode-aware (view vs edit) |
| `RouteForm` component | Standalone edit form | Embed into detail component conditionally |
| `documents.ts` actions | Truck/route uploads only | Support driver document category |
| `presigned.ts` storage helper | 'trucks', 'routes' categories | Add 'drivers' category type |

## Database Schema Changes

### New Tables

#### RouteExpense
```typescript
model RouteExpense {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  routeId     String   @db.Uuid
  category    String   // "FUEL", "TOLLS", "PARKING", "MAINTENANCE", "OTHER"
  description String?
  amount      Decimal  @db.Decimal(10, 2) // Always positive
  recordedAt  DateTime @db.Timestamptz
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  route  Route  @relation(fields: [routeId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([routeId])
  @@index([tenantId, recordedAt])
}
```

**RLS Policy:**
```sql
CREATE POLICY "tenant_isolation_route_expenses"
ON "RouteExpense"
USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

#### RoutePayment
```typescript
model RoutePayment {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  routeId     String   @db.Uuid
  amount      Decimal  @db.Decimal(10, 2) // Always positive
  method      String?  // "CASH", "CHECK", "WIRE", "OTHER"
  reference   String?  // Invoice number, check number, etc.
  receivedAt  DateTime @db.Timestamptz
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  route  Route  @relation(fields: [routeId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([routeId])
  @@index([tenantId, receivedAt])
}
```

**RLS Policy:**
```sql
CREATE POLICY "tenant_isolation_route_payments"
ON "RoutePayment"
USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Schema Modifications

#### Document Model Extension
```typescript
model Document {
  // ... existing fields ...
  driverId    String?  @db.Uuid  // NEW: For driver document uploads

  // ... existing relations ...
  driver      User?    @relation("DriverDocuments", fields: [driverId], references: [id])  // NEW

  @@index([driverId])  // NEW index
}
```

#### User Model Extension
```typescript
model User {
  // ... existing fields ...

  // ... existing relations ...
  driverDocuments   Document[] @relation("DriverDocuments")  // NEW relation
}
```

#### Route Model Extension
```typescript
model Route {
  // ... existing fields ...

  // ... existing relations ...
  expenses    RouteExpense[]   // NEW relation
  payments    RoutePayment[]   // NEW relation
}
```

#### Tenant Model Extension
```typescript
model Tenant {
  // ... existing fields ...

  // ... existing relations ...
  routeExpenses  RouteExpense[]  // NEW relation
  routePayments  RoutePayment[]  // NEW relation
}
```

## Architectural Patterns

### Pattern 1: Financial Line Items with Derived Profit

**What:** Expenses and payments stored as separate line items, profit calculated on-demand

**When to use:** When you need itemized tracking with flexible reporting and don't need real-time profit updates

**Trade-offs:**
- **PRO:** Simple schema, easy to add/edit individual items, no data synchronization issues
- **PRO:** Audit trail preserved (who entered what, when)
- **CON:** Profit calculation requires aggregation query (acceptable for <1000 line items per route)
- **CON:** No historical profit snapshots (recalculates from current data)

**Example:**
```typescript
// Server action: Calculate route profit
export async function getRouteFinancials(routeId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  // Aggregate expenses
  const expenseTotal = await prisma.routeExpense.aggregate({
    where: { routeId },
    _sum: { amount: true }
  });

  // Aggregate payments
  const paymentTotal = await prisma.routePayment.aggregate({
    where: { routeId },
    _sum: { amount: true }
  });

  const totalExpenses = expenseTotal._sum.amount || new Decimal(0);
  const totalPayments = paymentTotal._sum.amount || new Decimal(0);
  const profit = totalPayments.minus(totalExpenses);

  return {
    totalExpenses,
    totalPayments,
    profit,
    profitMargin: totalPayments.isZero() ? 0 : profit.div(totalPayments).times(100)
  };
}
```

**Why not denormalize profit onto Route?**
Because expenses/payments are updated frequently by different users. Maintaining denormalized profit would require triggers or transaction coordination. Current scale (dozens of line items per route) makes aggregation cheap.

### Pattern 2: Unified View/Edit via searchParams

**What:** Single page that toggles between view and edit modes using URL search parameters

**When to use:** When edit mode is modal-like state (not separate navigation) and you want bookmarkable/shareable edit links

**Trade-offs:**
- **PRO:** Single page reduces duplication, state stays in URL (bookmarkable)
- **PRO:** Browser back/forward works naturally
- **PRO:** Optimistic UI easier (no full page navigation)
- **CON:** Both view and edit components loaded (acceptable with lazy loading)
- **CON:** searchParams are client-side only (need useSearchParams hook)

**Implementation:**
```typescript
// app/(owner)/routes/[id]/page.tsx (Server Component)
export default async function RouteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  const route = await getRoute(id);

  if (!route) notFound();

  return (
    <div>
      {mode === 'edit' ? (
        <RouteEditSection route={route} />
      ) : (
        <RouteViewSection route={route} />
      )}
    </div>
  );
}

// Client component for mode switching
'use client';
function EditModeToggle({ routeId, currentMode }: { routeId: string, currentMode: string }) {
  const router = useRouter();

  const toggleMode = () => {
    const newMode = currentMode === 'edit' ? undefined : 'edit';
    router.push(`/routes/${routeId}${newMode ? '?mode=edit' : ''}`);
  };

  return <button onClick={toggleMode}>
    {currentMode === 'edit' ? 'Cancel' : 'Edit'}
  </button>;
}
```

**Alternative considered:** Separate `/routes/[id]/edit` page (current pattern)
**Why unified is better here:** Finance sections, documents, and route details all need editing. Unified page reduces cognitive load and allows inline editing per section.

### Pattern 3: Document Category Extension (Driver Uploads)

**What:** Extend existing Document model with optional driverId field instead of creating DriverDocument table

**When to use:** When new document type shares same upload flow, storage pattern, and security model

**Trade-offs:**
- **PRO:** Reuses entire upload infrastructure (presigned URLs, RLS, S3 client, validation)
- **PRO:** Single documents table simplifies queries and reporting
- **PRO:** Consistent API (listDocuments, deleteDocument work for all types)
- **CON:** Document always has one of truckId/routeId/driverId (enforced at application level, not DB constraint)

**Implementation:**
```typescript
// Extend DocumentCategory type
export type DocumentCategory = 'trucks' | 'routes' | 'drivers';  // Add 'drivers'

// Extend validation schema
const documentCreateSchema = z.object({
  fileName: z.string(),
  s3Key: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  truckId: z.string().uuid().optional(),
  routeId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),  // NEW
}).refine(
  data => [data.truckId, data.routeId, data.driverId].filter(Boolean).length === 1,
  { message: 'Document must belong to exactly one entity (truck, route, or driver)' }
);

// Extend repository
class DocumentRepository extends TenantRepository {
  async findByDriverId(driverId: string) {
    return this.db.document.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      include: { uploader: { select: { firstName: true, lastName: true } } }
    });
  }
}

// S3 key structure remains consistent
// tenant-{tenantId}/drivers/{fileId}-{filename}
```

**Why not separate DriverDocument table?**
Because upload security, storage isolation, and CRUD operations are identical. Only difference is the entity relationship. Single table reduces code duplication and provides unified document search/reporting.

## Data Flow

### Request Flow: Add Expense Line Item

```
[Owner clicks "Add Expense"]
    ↓
[ExpenseLineItemForm client component] → [User enters amount, category]
    ↓
[form.submit()] → [Server Action: createRouteExpense]
    ↓
[Auth check: requireRole(OWNER/MANAGER)] → [Validate with expenseCreateSchema]
    ↓
[RouteExpenseRepository.create()] → [Prisma insert with tenantId]
    ↓
[RLS Policy enforces tenant_id match] → [Database insert]
    ↓
[revalidatePath('/routes/[id]')] → [Next.js cache invalidation]
    ↓
[Response: { success: true }] ← [Return to client]
    ↓
[RouteFinanceSection re-renders] → [Shows new expense, recalculated profit]
```

### Request Flow: Upload Driver Document

```
[Driver selects file]
    ↓
[requestUploadUrl() server action]
    ↓
[Validate file type via magic bytes] → [Generate presigned URL with category='drivers']
    ↓
[Return: { uploadUrl, s3Key: 'tenant-X/drivers/abc-file.pdf' }]
    ↓
[Client: PUT file to uploadUrl] → [Direct upload to Cloudflare R2]
    ↓
[Upload success] → [completeUpload() server action]
    ↓
[DocumentRepository.create({ driverId, s3Key, ... })] → [Database insert]
    ↓
[RLS enforces tenantId match] → [Document record created]
    ↓
[revalidatePath('/drivers/[id]')] → [Cache invalidation]
```

### Profit Calculation Flow

```
[Load route detail page]
    ↓
[Server component: getRouteFinancials(routeId)]
    ↓
[Parallel aggregation queries:]
    ├─→ [SUM(RouteExpense.amount WHERE routeId)]
    └─→ [SUM(RoutePayment.amount WHERE routeId)]
    ↓
[Calculate: profit = totalPayments - totalExpenses]
[Calculate: margin = (profit / totalPayments) * 100]
    ↓
[Return: { totalExpenses, totalPayments, profit, profitMargin }]
    ↓
[RouteFinanceSection displays formatted values]
```

## Integration Points

### Route Detail Page Integration

**Current state:** Separate view (`/routes/[id]`) and edit (`/routes/[id]/edit`) pages

**New structure:**
```
/routes/[id]?mode=view (default)
  ├─ RouteDetailSection (editable via mode=edit)
  ├─ RouteFinanceSection (NEW - shows expenses, payments, profit)
  ├─ RouteDocumentsSection (existing - route documents)
  └─ DriverDocumentsSection (NEW - driver's personal docs for this route)

/routes/[id]?mode=edit
  ├─ RouteEditForm (inline edit of origin, destination, dates)
  ├─ RouteFinanceSection (expense/payment forms visible)
  ├─ RouteDocumentsSection (upload enabled)
  └─ DriverDocumentsSection (read-only from owner view)
```

**Integration approach:**
1. Add `searchParams.mode` to existing page
2. Conditionally render RouteDetail vs RouteForm based on mode
3. Add RouteFinanceSection below route details (always visible, edit controls shown when mode=edit)
4. Extend documents section to show driver docs if route has assigned driver

### Document Upload Reuse

**Existing pattern (truck/route documents):**
```typescript
requestUploadUrl(formData) → presigned URL → client upload → completeUpload(metadata)
```

**Extension for driver documents:**
```typescript
// Same flow, different category
const category = entityType === 'driver' ? 'drivers' :
                 entityType === 'truck' ? 'trucks' : 'routes';

// S3 key includes category
const s3Key = `tenant-${tenantId}/${category}/${fileId}-${fileName}`;

// Document record includes driverId
await DocumentRepository.create({ driverId, s3Key, ... });
```

**No changes needed to:**
- S3 client configuration
- Presigned URL generation logic
- File validation (magic bytes)
- RLS policies (already tenant-scoped)

**Minimal changes:**
- Add 'drivers' to DocumentCategory type
- Add driverId field to Document model
- Add findByDriverId to DocumentRepository
- Update requestUploadUrl to handle entityType='driver'

### Repository Pattern Extension

**Base pattern (existing):**
```typescript
class TenantRepository {
  protected db: ReturnType<typeof prisma.$extends>;

  constructor(tenantId: string) {
    this.db = prisma.$extends(withTenantRLS(tenantId));
  }
}
```

**New repositories follow same pattern:**
```typescript
class RouteExpenseRepository extends TenantRepository {
  async create(data: RouteExpenseCreateInput) {
    return this.db.routeExpense.create({ data });
  }

  async findByRouteId(routeId: string) {
    return this.db.routeExpense.findMany({
      where: { routeId },
      orderBy: { recordedAt: 'desc' }
    });
  }

  async getTotalByRouteId(routeId: string): Promise<Decimal> {
    const result = await this.db.routeExpense.aggregate({
      where: { routeId },
      _sum: { amount: true }
    });
    return result._sum.amount || new Decimal(0);
  }
}
```

**Security enforced at:**
1. Repository constructor (tenant-scoped Prisma client)
2. RLS policies (database-level WHERE clause injection)
3. Server actions (requireRole before repository access)

## Build Order Recommendation

### Phase A: Database & Repository Foundation
**Why first:** Schema changes require migration, repositories needed for actions

1. Create migration for RouteExpense, RoutePayment tables with RLS policies
2. Extend Document model with driverId field
3. Create RouteExpenseRepository, RoutePaymentRepository
4. Extend DocumentRepository with findByDriverId method
5. Write repository unit tests

**Dependencies:** None (extends existing patterns)
**Risk:** Low (follows established RLS pattern)

### Phase B: Finance Server Actions
**Why second:** UI needs actions before it can function

1. Create `route-finance-actions.ts` with expense/payment CRUD
2. Add getRouteFinancials aggregation helper
3. Extend route actions with finance-aware queries (include relations)
4. Write action integration tests

**Dependencies:** Phase A (repositories)
**Risk:** Low (follows existing server action patterns)

### Phase C: Driver Document Upload
**Why third:** Independent of finance features, reuses infrastructure

1. Extend DocumentCategory type to include 'drivers'
2. Modify requestUploadUrl to handle driver category
3. Modify completeUpload to save driverId
4. Update presigned.ts to support 'drivers' category
5. Test driver document upload flow

**Dependencies:** Phase A (Document model extended)
**Risk:** Very Low (pure extension of existing code)

### Phase D: Finance UI Components
**Why fourth:** Needs actions from Phase B

1. Create ExpenseLineItemForm component
2. Create PaymentForm component
3. Create RouteFinanceSection component (displays + forms)
4. Add profit calculation display with formatting
5. Wire up to server actions

**Dependencies:** Phase B (server actions)
**Risk:** Low (standard client component patterns)

### Phase E: Unified Route Page
**Why last:** Touches most components, highest integration risk

1. Modify `/routes/[id]/page.tsx` to use searchParams.mode
2. Make RouteDetail component mode-aware
3. Conditionally render view vs edit sections
4. Add EditModeToggle component
5. Integrate RouteFinanceSection into layout
6. Add driver documents section
7. Remove old `/routes/[id]/edit` page
8. Update navigation links

**Dependencies:** Phases A-D (all features ready)
**Risk:** Medium (integration testing needed)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Denormalizing Profit onto Route Table

**What people do:** Add `totalExpenses`, `totalPayments`, `profit` columns to Route and update them via triggers or application logic

**Why it's wrong:**
- Trigger-based: Complex to debug, can get out of sync, hard to audit
- Application-based: Requires transactions, race conditions possible, error-prone
- Creates dual source of truth (line items AND totals)
- Historical changes to expenses don't reflect in old profit calculations

**Do this instead:** Calculate profit on-demand using aggregation queries. For typical route with <100 line items, aggregation is <10ms. Cache at application level if needed (React Server Components handle this automatically).

### Anti-Pattern 2: Creating Separate DriverDocument Table

**What people do:** Create a new table `DriverDocument { id, driverId, fileName, s3Key, ... }` with duplicate upload logic

**Why it's wrong:**
- Duplicates entire upload infrastructure (presigned URLs, validation, S3 client)
- Makes cross-entity document queries harder (UNION needed)
- Breaks unified document management UI
- No shared security policies or audit logic

**Do this instead:** Add optional `driverId` field to existing Document table. Validate that exactly one of `truckId`, `routeId`, `driverId` is set. Reuse all infrastructure. Query flexibility improved.

### Anti-Pattern 3: Client-Side Profit Calculation

**What people do:** Fetch all expenses/payments to client, calculate profit in React component

**Why it's wrong:**
- Sends unnecessary data over network (line item details not always needed)
- Client-side Decimal math is error-prone (floating point issues)
- Security risk (client can manipulate calculation)
- Breaks server-side filtering/pagination

**Do this instead:** Calculate profit in server action or server component. Return aggregated totals only. Client displays formatted values. Line item details fetched separately if user expands section.

### Anti-Pattern 4: Mixing View and Edit State in Single Component

**What people do:** Use React state to toggle between view/edit mode inside component

**Why it's wrong:**
- State lost on navigation or refresh
- Can't share "edit mode" links with other users
- Browser back button doesn't work as expected
- Makes testing mode transitions harder

**Do this instead:** Use URL searchParams for mode. Server component reads `mode` param and conditionally renders view or edit components. Client components update URL via router.push(). State in URL = bookmarkable, shareable, back-button friendly.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k routes | Current design optimal. In-memory aggregation fine. |
| 1k-10k routes | Add database indexes on `(tenantId, recordedAt)` for expenses/payments. Consider materialized view for profit calculations if reports slow. |
| 10k+ routes | Partition RouteExpense/RoutePayment tables by tenantId. Add Redis cache for frequently accessed route financials. Consider read replicas for reporting queries. |

### Scaling Priorities

1. **First bottleneck:** Profit calculation for dashboard (showing all routes' profits)
   - **Fix:** Materialized view `route_financials_summary` refreshed nightly or on-demand
   - **Alternative:** Denormalize profit with background job recalculation

2. **Second bottleneck:** Document listing for drivers with 1000+ uploads
   - **Fix:** Pagination (limit 50 per page, cursor-based)
   - **Already handled:** Indexes on `driverId` support fast filtering

3. **Third bottleneck:** S3 presigned URL generation for bulk document downloads
   - **Fix:** Batch presigned URL generation endpoint
   - **Alternative:** ZIP archive generation with single download URL

## Sources

### Architecture Patterns
- [Next.js App Router Documentation](https://nextjs.org/docs/app) - App Router patterns, searchParams usage
- [Next.js useSearchParams Hook](https://nextjs.org/docs/app/api-reference/functions/use-search-params) - Client-side search param access
- [Search Params in Next.js for URL State](https://www.robinwieruch.de/next-search-params/) - URL state management patterns

### Database Schema Design
- [PostgreSQL Database Design Best Practices](https://www.tigerdata.com/learn/guide-to-postgresql-database-design) - General schema design principles
- [Accounting Ledger Database Structure](https://databasesample.com/database/accounting-ledger-database) - Line item patterns
- [Double-Entry Accounting for Software Engineers](https://www.balanced.software/double-entry-bookkeeping-for-programmers/) - Financial data modeling
- [An Elegant DB Schema for Double-Entry Accounting](https://blog.journalize.io/posts/an-elegant-db-schema-for-double-entry-accounting/) - Journal entry patterns

### Profit Calculation Patterns
- [Income Statement Line Items](https://corporatefinanceinstitute.com/resources/financial-modeling/projecting-income-statement-line-items/) - Revenue/expense structure
- [Operating Profit Formula](https://www.wallstreetprep.com/knowledge/operating-profit/) - Profit calculation methods

---
*Architecture research for: Route Finance Tracking, Unified View/Edit Pages, Driver Document Uploads*
*Researched: 2026-02-16*
