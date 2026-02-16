# Pitfalls Research

**Domain:** Adding route finance tracking (line-item expenses, payments, profit), unified route view/edit page, and driver document uploads to existing Next.js 16 multi-tenant fleet management app
**Researched:** 2026-02-16
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Floating-Point Arithmetic Causing Financial Calculation Errors

**What goes wrong:**
Using JavaScript's `number` type or PostgreSQL's `FLOAT`/`DOUBLE` for money calculations causes rounding errors that accumulate over transactions. For example, `100.45 + 25.30` might equal `125.74999999999998` instead of `125.75`. In a route finance system tracking fuel costs, tolls, maintenance, and driver pay across thousands of routes, these micro-errors compound into significant discrepancies. A fleet with 100 routes per month could show profit/loss reports off by $50-500 due to accumulated floating-point errors. Tax calculations become incorrect, financial reports don't balance, and reconciliation fails.

**Why it happens:**
Floating-point numbers are represented in binary format, which cannot exactly represent decimal numbers like currency values. Developers use `number` in TypeScript or `FLOAT` in PostgreSQL because they're familiar and "easier" than Decimal types. As calculations chain together (line item costs → total expenses → profit = revenue - expenses), precision loss accumulates through additions, multiplications, divisions, and subtractions. The existing FuelRecord model uses `@db.Decimal(10, 2)` correctly, but developers may forget this pattern when adding RouteExpense and RoutePayment models.

**How to avoid:**
1. **Always use PostgreSQL DECIMAL type for currency**:
```prisma
model RouteExpense {
  amount       Decimal  @db.Decimal(10, 2)  // Up to $99,999,999.99
  unitCost     Decimal? @db.Decimal(10, 4)  // For per-unit costs (fuel per gallon)
  totalCost    Decimal  @db.Decimal(10, 2)
}
```
2. **Use JavaScript libraries for money arithmetic** - never perform calculations directly:
```typescript
import Decimal from 'decimal.js';

// ❌ Bad: Floating-point error
const profit = revenue - (fuelCost + tollCost + driverPay);

// ✅ Good: Precise decimal arithmetic
const totalExpenses = new Decimal(fuelCost)
  .plus(tollCost)
  .plus(driverPay);
const profit = new Decimal(revenue).minus(totalExpenses);
```
3. **Round only at final display**, never during intermediate calculations
4. **Validate all currency inputs** with Zod schemas enforcing max 2 decimal places:
```typescript
const expenseSchema = z.object({
  amount: z.number().refine(val => Number.isFinite(val) && /^\d+(\.\d{1,2})?$/.test(val.toString())),
});
```
5. **Store cents as integers** as alternative approach (multiply by 100, store as BigInt, divide for display)
6. **Test aggregations** with realistic transaction volumes to detect accumulation errors

**Warning signs:**
- Profit calculations off by a few cents or dollars
- Revenue - Expenses ≠ Profit in dashboard aggregations
- Different totals when summing in different orders
- Reports showing values like `$123.4500000001`
- Financial reconciliation failing to balance

**Phase to address:**
Phase 1 (Route Finance Foundation) - Establish Decimal type pattern immediately when creating RouteExpense, RoutePayment, and profit calculation models. Create shared `calculateProfit()` utility using Decimal.js that all financial features reuse. Add integration tests verifying calculations remain accurate across 1000+ transactions.

---

### Pitfall 2: Race Conditions in Concurrent Financial Updates Causing Data Corruption

**What goes wrong:**
Multiple users or processes updating the same route's financial data simultaneously creates race conditions where updates overwrite each other, causing lost data or incorrect totals. Scenario: Manager A adds a $500 fuel expense while Manager B adds a $200 toll expense to the same route at nearly the same time. Both read `totalExpenses = $1000`, calculate new totals separately (A: $1500, B: $1200), then both write their version to the database. Final `totalExpenses` is whichever write happened last ($1500 or $1200), losing one expense entirely. In financial systems, this causes double-spending vulnerabilities, bypassed transaction limits, inconsistent account balances, and data that doesn't match audit trails.

**Why it happens:**
Database transactions without proper locking allow Time-of-Check-Time-of-Use (TOCTOU) issues. Code reads current value (`SELECT totalExpenses FROM routes WHERE id = ?`), calculates new value in application memory, then writes back (`UPDATE routes SET totalExpenses = ?`) - but between SELECT and UPDATE, another transaction may have modified the value. PostgreSQL's default READ COMMITTED isolation level doesn't prevent this. Prisma's optimistic concurrency control via `@updatedAt` helps but isn't automatic - developers must explicitly check version conflicts. Server Actions running in parallel (user opens route in two browser tabs, saves both) create concurrent writes.

**How to avoid:**
1. **Use database-level aggregations instead of storing totals**:
```typescript
// ❌ Bad: Store and update calculated field
UPDATE routes SET totalExpenses = $1 WHERE id = $2;

// ✅ Good: Calculate on read from source data
SELECT route_id, SUM(amount) as total_expenses
FROM route_expenses
WHERE route_id = $1
GROUP BY route_id;
```
2. **Implement optimistic locking** with version field:
```prisma
model Route {
  id        String  @id
  version   Int     @default(0)  // Increment on every update
  updatedAt DateTime @updatedAt
}

// In update action
const route = await db.route.update({
  where: { id: routeId, version: currentVersion },
  data: { ...updates, version: { increment: 1 } }
});

if (!route) {
  throw new Error('Route was modified by another user. Refresh and try again.');
}
```
3. **Use database transactions** for multi-step financial operations:
```typescript
await prisma.$transaction(async (tx) => {
  const expense = await tx.routeExpense.create({ data: expenseData });
  await tx.route.update({
    where: { id: routeId },
    data: { updatedAt: new Date() }  // Trigger recalculation
  });
});
```
4. **Implement idempotency keys** for expense/payment creation to prevent duplicates:
```typescript
// Every financial transaction must have unique idempotency key
const idempotencyKey = `${userId}-${timestamp}-${nanoid()}`;

// Check if transaction already processed
const existing = await db.routeExpense.findUnique({
  where: { idempotencyKey }
});
if (existing) return existing;  // Return existing record, don't duplicate
```
5. **Use SELECT FOR UPDATE** for pessimistic locking in critical paths:
```sql
-- Lock row until transaction commits
SELECT * FROM routes WHERE id = $1 FOR UPDATE;
UPDATE routes SET ... WHERE id = $1;
```
6. **Add audit trail** to detect and recover from corruption:
```prisma
model FinancialAudit {
  id          String   @id
  routeId     String
  action      String   // 'expense_added', 'payment_received'
  amount      Decimal  @db.Decimal(10, 2)
  balanceBefore Decimal @db.Decimal(10, 2)
  balanceAfter  Decimal @db.Decimal(10, 2)
  userId      String
  timestamp   DateTime @default(now())
}
```

**Warning signs:**
- Expenses "disappear" after concurrent saves
- Profit totals don't match sum of line items
- Users report "my changes were overwritten"
- Audit logs show gaps in transaction sequence
- Multiple records with same timestamp and user

**Phase to address:**
Phase 1 (Route Finance Foundation) - Build optimistic locking and idempotency into RouteExpense and RoutePayment models from day one. Use database aggregations for all calculated fields (totalExpenses, totalRevenue, profit). Add comprehensive audit logging before Phase 2. Create integration tests simulating concurrent updates to verify race conditions are prevented.

---

### Pitfall 3: Unsaved Changes Lost When Toggling View/Edit Modes

**What goes wrong:**
When merging separate view and edit pages into a unified route page with toggle between modes, users lose unsaved form changes during mode switches, browser navigation, or accidental tab closes. User fills out expense form with 5 line items ($2000+ in data), browser auto-refreshes or user clicks browser back button → all data lost, form resets to empty. In multi-step workflows (add expenses → add payments → verify profit), losing progress between steps causes frustration and data entry errors as users rush to re-enter before losing it again. This is especially problematic for fleet managers entering 20+ routes with financial data.

**Why it happens:**
React component state is ephemeral - unmounting the component or navigating away destroys state. The existing app has separate `/routes/[id]/page.tsx` (view) and `/routes/[id]/edit/page.tsx` (edit) pages, so navigation between them is a full page load that resets state. When merging into a single page with edit mode toggle, developers often use simple `useState` for form data without persisting it. Single-page applications (SPAs) don't trigger browser `beforeunload` events on route changes (only on actual page unload), so navigation between SPA routes silently discards state. React Hook Form's `isDirty` state detection helps but requires explicit integration with navigation blocking.

**How to avoid:**
1. **Detect unsaved changes and block navigation** - Next.js App Router requires two approaches:
```typescript
'use client';
import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';  // For SPA navigation
import { useFormState } from 'react-hook-form';

function UnifiedRoutePage() {
  const { isDirty } = useFormState();  // Track form changes

  // Block SPA route navigation when form is dirty
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  // Block browser navigation (back/forward/close/refresh)
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';  // Chrome requires returnValue
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Show custom confirmation modal when navigation blocked
  if (blocker.state === 'blocked') {
    return <ConfirmLeaveModal
      onConfirm={() => blocker.proceed()}
      onCancel={() => blocker.reset()}
    />;
  }

  return <RouteForm />;
}
```
2. **Persist form state to localStorage** for recovery:
```typescript
// Auto-save draft every 2 seconds
useEffect(() => {
  if (!isDirty) return;

  const timeoutId = setTimeout(() => {
    localStorage.setItem(`route-draft-${routeId}`, JSON.stringify(formValues));
  }, 2000);

  return () => clearTimeout(timeoutId);
}, [formValues, isDirty, routeId]);

// Restore draft on mount
useEffect(() => {
  const draft = localStorage.getItem(`route-draft-${routeId}`);
  if (draft) {
    const shouldRestore = confirm('Found unsaved changes. Restore draft?');
    if (shouldRestore) {
      const parsed = JSON.parse(draft);
      form.reset(parsed);
    } else {
      localStorage.removeItem(`route-draft-${routeId}`);
    }
  }
}, []);

// Clear draft after successful save
async function handleSave() {
  await saveRoute(formValues);
  localStorage.removeItem(`route-draft-${routeId}`);
}
```
3. **Use server state management** with React Query for optimistic updates:
```typescript
const { mutate } = useMutation({
  mutationFn: saveRouteExpense,
  onMutate: async (newExpense) => {
    // Cancel outbound queries so they don't overwrite optimistic update
    await queryClient.cancelQueries({ queryKey: ['route', routeId] });

    // Snapshot current value
    const previous = queryClient.getQueryData(['route', routeId]);

    // Optimistically update UI
    queryClient.setQueryData(['route', routeId], (old) => ({
      ...old,
      expenses: [...old.expenses, newExpense]
    }));

    return { previous };  // Return context for rollback
  },
  onError: (err, newExpense, context) => {
    // Rollback on error
    queryClient.setQueryData(['route', routeId], context.previous);
  },
});
```
4. **Keep form state separate from edit mode toggle**:
```typescript
// ❌ Bad: Mode toggle resets form
function RoutePageBad() {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  return mode === 'view'
    ? <RouteView />   // Unmounts RouteEdit, loses state
    : <RouteEdit />;  // New mount, fresh state
}

// ✅ Good: Both modes mount, visibility controlled by CSS
function RoutePageGood() {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const form = useForm();  // Persists across mode changes

  return (
    <>
      <div className={mode === 'view' ? 'block' : 'hidden'}>
        <RouteView data={form.getValues()} />
      </div>
      <div className={mode === 'edit' ? 'block' : 'hidden'}>
        <RouteForm form={form} />
      </div>
    </>
  );
}
```
5. **Show visual indicators for unsaved state**:
```typescript
{isDirty && (
  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
    <p className="text-sm text-yellow-800">
      You have unsaved changes
    </p>
  </div>
)}
```

**Warning signs:**
- Users complaining about lost data
- High bounce rate on edit pages
- Repeated data entry sessions (user enters same data multiple times)
- Support tickets about "form cleared itself"
- No confirmation dialogs when navigating away from dirty forms

**Phase to address:**
Phase 2 (Unified Route View/Edit Page) - Implement unsaved changes detection and localStorage persistence immediately when merging pages. Create reusable `useUnsavedChanges` hook that all forms use. Add E2E tests verifying navigation blocking works for both browser back button and SPA route navigation. Document pattern for future page consolidations.

---

### Pitfall 4: Orphaned Files from Failed Upload Transactions

**What goes wrong:**
Files uploaded to Cloudflare R2 but not saved to database (due to errors, network failures, or user abandonment) become "orphaned" - they consume storage, inflate costs, and create security risks because their content and ownership are unknown. Scenario: User uploads driver's license PDF to R2 (presigned URL upload succeeds), but then network fails before `completeUpload()` server action runs → file exists in R2 with no database record. Over months, hundreds of orphaned files accumulate. When adding driver documents on top of existing truck/route document uploads, the orphan problem multiplies across three entity types. Orphaned files are difficult to identify because there's no mapping to users/tenants, making cleanup risky (might delete legitimate files still being uploaded).

**Why it happens:**
The existing document upload flow is two-phase: (1) client uploads directly to R2 via presigned URL, (2) client calls server action to save metadata. If step 2 fails (network timeout, server error, validation failure, user closes tab), the file from step 1 remains in R2 forever. There's no rollback mechanism - S3/R2 doesn't support transactions. The presigned URL has no "commitment" period - once generated, the upload slot is available until the URL expires (usually 1 hour), but the file persists forever once uploaded. Cloudflare R2 doesn't have automatic lifecycle policies enabled by default - developers must explicitly configure retention rules. Multi-part uploads (for files >5MB) compound this - incomplete multi-part uploads also orphan data.

**How to avoid:**
1. **Enable R2 lifecycle policy to auto-delete incomplete uploads**:
```typescript
// Configure via Cloudflare API or dashboard
{
  "lifecycle": {
    "rules": [
      {
        "id": "delete-incomplete-multipart-uploads",
        "status": "Enabled",
        "abortIncompleteMultipartUpload": {
          "daysAfterInitiation": 7
        }
      }
    ]
  }
}
```
2. **Track pending uploads in database** before generating presigned URL:
```prisma
model PendingUpload {
  id          String   @id @default(uuid())
  tenantId    String
  s3Key       String
  userId      String
  entityType  String   // 'truck', 'route', 'driver'
  entityId    String
  createdAt   DateTime @default(now())
  expiresAt   DateTime  // Match presigned URL expiry (1 hour)
  completed   Boolean  @default(false)

  @@index([tenantId, completed, expiresAt])
}

// Before generating presigned URL
const pending = await db.pendingUpload.create({
  data: {
    tenantId,
    s3Key: generateS3Key(),
    userId,
    entityType,
    entityId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)  // 1 hour
  }
});

// After completeUpload succeeds
await db.pendingUpload.update({
  where: { id: pending.id },
  data: { completed: true }
});
```
3. **Run daily cleanup job** to delete orphaned files:
```typescript
// Cron job: scripts/cleanup-orphaned-uploads.ts
async function cleanupOrphanedUploads() {
  // Find pending uploads older than expiry time and not completed
  const orphaned = await db.pendingUpload.findMany({
    where: {
      completed: false,
      expiresAt: { lt: new Date() }
    }
  });

  for (const upload of orphaned) {
    try {
      // Delete from R2
      await deleteS3Object(upload.s3Key);

      // Delete pending record
      await db.pendingUpload.delete({ where: { id: upload.id } });

      console.log(`Cleaned up orphaned file: ${upload.s3Key}`);
    } catch (error) {
      console.error(`Failed to clean up ${upload.s3Key}:`, error);
    }
  }
}

// Schedule: every 6 hours via Vercel Cron or GitHub Actions
```
4. **Add upload timeout on client** to fail fast rather than leave hanging:
```typescript
const uploadResponse = await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  signal: AbortSignal.timeout(120000)  // 2 minute timeout
});
```
5. **Log all upload operations** for audit trail:
```typescript
await db.uploadAuditLog.create({
  data: {
    tenantId,
    userId,
    s3Key,
    fileName,
    operation: 'upload_initiated',  // 'upload_completed', 'upload_failed'
    timestamp: new Date()
  }
});
```
6. **Show upload progress** to prevent user from closing tab mid-upload:
```typescript
// Use XMLHttpRequest for progress tracking
const xhr = new XMLHttpRequest();
xhr.upload.addEventListener('progress', (e) => {
  if (e.lengthComputable) {
    const percentComplete = (e.loaded / e.total) * 100;
    setUploadProgress(percentComplete);
  }
});
```
7. **Implement circuit breaker** for R2 operations to prevent cascade failures:
```typescript
// If 5 consecutive uploads fail, stop generating presigned URLs
// Prevents creating many orphans during R2 outage
```

**Warning signs:**
- R2 storage costs growing faster than Document table rows
- Storage usage doesn't match database document count
- Missing `completeUpload` calls in server logs after `requestUploadUrl`
- High percentage of presigned URLs generated but never used
- Database has fewer documents than S3 list-objects returns

**Phase to address:**
Phase 3 (Driver Document Uploads) - Add PendingUpload tracking and cleanup job when implementing driver documents, since this is a new upload flow (drivers are new entity type for documents). Test upload failure scenarios (network disconnect, server error, timeout) to verify orphans are cleaned up. Configure R2 lifecycle policy in deployment checklist. Add monitoring alert if orphan ratio >5%.

---

### Pitfall 5: Cascading Deletes Destroying Financial Audit Trail

**What goes wrong:**
Deleting a route with `ON DELETE CASCADE` foreign keys automatically deletes all associated RouteExpense, RoutePayment, and FinancialAudit records, permanently destroying the audit trail required for tax compliance, disputes, and accounting reconciliation. Finance regulations often require retaining transaction records for 7+ years. Scenario: Manager accidentally deletes completed route from 6 months ago → all expense receipts, payment records, and profit calculations vanish → accountant can't reconcile books, IRS audit fails because records are missing, customer disputes invoice but no payment proof exists. The existing schema has `Route -> Document` with no cascade protection, so adding financial models with cascades multiplies the risk.

**Why it happens:**
Developers use `onDelete: Cascade` in Prisma schema because it simplifies code - deleting parent automatically cleans up children. It seems logical: "if route is deleted, its expenses should be deleted too." But financial data has different lifecycle requirements than operational data. Prisma's default is `onDelete: Cascade` for required relations unless explicitly overridden. When users request "delete route," they usually mean "hide from active list," not "permanently erase all history." Business logic confusion arises: should deleting a route delete its financial records (for accounting) vs. just mark route inactive (for operations)?

**How to avoid:**
1. **Never hard-delete financial records** - use soft delete pattern:
```prisma
model RouteExpense {
  id          String   @id
  routeId     String
  amount      Decimal  @db.Decimal(10, 2)
  deletedAt   DateTime?  // NULL = active, non-NULL = soft deleted
  deletedBy   String?    // Who deleted it (for audit)

  route       Route    @relation(fields: [routeId], references: [id], onDelete: Restrict)

  @@index([deletedAt])  // Filter out soft-deleted in queries
}

// Query pattern: always filter by deletedAt
const activeExpenses = await db.routeExpense.findMany({
  where: {
    routeId,
    deletedAt: null  // CRITICAL: Must add to every query
  }
});

// Soft delete instead of hard delete
await db.routeExpense.update({
  where: { id: expenseId },
  data: {
    deletedAt: new Date(),
    deletedBy: userId
  }
});
```
2. **Use onDelete: Restrict for financial models** to prevent accidental cascades:
```prisma
model Route {
  id        String  @id
  // ... other fields

  expenses  RouteExpense[]
  payments  RoutePayment[]
}

model RouteExpense {
  id       String  @id
  routeId  String
  route    Route   @relation(fields: [routeId], references: [id], onDelete: Restrict)
  // onDelete: Restrict = DELETE route fails if expenses exist
}

// Attempting to delete route with expenses throws error
await db.route.delete({ where: { id } });
// Error: Foreign key constraint failed. Cannot delete route with existing expenses.
```
3. **Implement archive pattern** instead of delete for completed routes:
```prisma
model Route {
  id          String      @id
  status      RouteStatus  // PLANNED, IN_PROGRESS, COMPLETED, ARCHIVED
  archivedAt  DateTime?
  archivedBy  String?
}

// Instead of deleting, archive
await db.route.update({
  where: { id },
  data: {
    status: 'ARCHIVED',
    archivedAt: new Date(),
    archivedBy: userId
  }
});

// UI filters out archived routes
const activeRoutes = await db.route.findMany({
  where: {
    status: { in: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] }
  }
});
```
4. **Create append-only audit log** that's immutable:
```prisma
model FinancialAuditLog {
  id            String   @id @default(uuid())
  tenantId      String
  routeId       String
  action        String   // 'expense_created', 'payment_received', 'route_deleted'
  entityType    String   // 'RouteExpense', 'RoutePayment'
  entityId      String
  beforeState   Json?    // Snapshot before change
  afterState    Json?    // Snapshot after change
  userId        String
  timestamp     DateTime @default(now())

  // NO foreign keys = can't cascade delete
  // NO updatedAt = immutable
  // NO delete operations allowed in code

  @@index([tenantId, timestamp])
  @@index([routeId])
}

// Every financial operation logs to audit trail
async function createExpense(data) {
  const expense = await db.routeExpense.create({ data });

  await db.financialAuditLog.create({
    data: {
      tenantId: expense.tenantId,
      routeId: expense.routeId,
      action: 'expense_created',
      entityType: 'RouteExpense',
      entityId: expense.id,
      afterState: expense,
      userId: currentUserId,
    }
  });

  return expense;
}
```
5. **Require explicit confirmation** before route deletion:
```typescript
// Server action for route deletion
export async function deleteRoute(routeId: string, confirmation: {
  understoodFinancialImpact: boolean;
  confirmationText: string;  // Must type "DELETE ROUTE"
}) {
  if (!confirmation.understoodFinancialImpact) {
    throw new Error('Must acknowledge financial impact');
  }
  if (confirmation.confirmationText !== 'DELETE ROUTE') {
    throw new Error('Incorrect confirmation text');
  }

  // Check for financial records
  const expenseCount = await db.routeExpense.count({ where: { routeId } });
  const paymentCount = await db.routePayment.count({ where: { routeId } });

  if (expenseCount > 0 || paymentCount > 0) {
    throw new Error(
      `Cannot delete route with ${expenseCount} expenses and ${paymentCount} payments. ` +
      'Archive the route instead to preserve financial records.'
    );
  }

  await db.route.delete({ where: { id: routeId } });
}
```
6. **Separate operational and financial data models**:
```prisma
// Operational data: can be deleted
model Route {
  id             String       @id
  status         RouteStatus
  operationalNotes String?
}

// Financial data: never deleted, loosely coupled
model RouteFinancialRecord {
  id           String   @id
  routeId      String   // NO foreign key = can't cascade
  routeNumber  String   // Denormalized for audit trail
  routeDate    DateTime // Snapshot at time of transaction
  totalExpenses Decimal @db.Decimal(10, 2)
  totalRevenue  Decimal @db.Decimal(10, 2)

  @@index([routeId])
}
```

**Warning signs:**
- Schema has `onDelete: Cascade` on financial models
- No soft delete pattern or deletedAt timestamps
- No explicit confirmation required before route deletion
- Database logs showing CASCADE deletes on expense/payment tables
- Missing financial records that users report existed
- Accountant unable to reconcile books due to missing transactions

**Phase to address:**
Phase 1 (Route Finance Foundation) - Design RouteExpense and RoutePayment models with soft delete and `onDelete: Restrict` from the start. Add immutable FinancialAuditLog model that logs every create/update/delete operation. Document that financial records are NEVER hard-deleted in schema comments and repository patterns. Add database migration to set `ALTER TABLE route_expenses ADD COLUMN deleted_at TIMESTAMPTZ`.

---

### Pitfall 6: Multi-Tenant Data Isolation Bypass in File Storage Paths

**What goes wrong:**
Path traversal vulnerabilities or missing tenant validation in file storage operations allow users to access or overwrite other tenants' documents. Scenario: Malicious user manipulates file upload to use s3Key like `../../tenant-other-uuid/drivers/license.pdf` instead of `tenant-own-uuid/drivers/license.pdf` → uploads overwrite another tenant's driver license. Or, user crafts download URL with different tenant's s3Key → downloads confidential financial documents from competitor using same platform. In multi-tenant SaaS, a single tenant isolation breach exposes all tenants' data, causing catastrophic security incident, regulatory violations (GDPR, HIPAA), and loss of customer trust.

**Why it happens:**
Client-provided file paths or s3Keys are trusted without validation. The existing `completeUpload()` action has defense-in-depth check `if (!data.s3Key.startsWith(\`tenant-${tenantId}/\`))` but this pattern might not be copied to new driver document flow. Developers assume presigned URL generation already scoped to tenant so downstream validation isn't needed. Path traversal characters like `../` in filenames aren't sanitized before building storage keys. S3/R2 doesn't have row-level security - access control is purely application-layer, so any bug that bypasses tenant checks grants full access. When adding driver documents, new code paths might skip existing validation patterns.

**How to avoid:**
1. **Always validate s3Key matches tenant** in every operation:
```typescript
// In completeUpload, getDownloadUrl, deleteDocument
const tenantId = await requireTenantId();

// CRITICAL: Verify s3Key starts with tenant prefix
if (!s3Key.startsWith(`tenant-${tenantId}/`)) {
  throw new Error('Unauthorized: S3 key does not match tenant');
}

// ALSO verify entity belongs to tenant (defense in depth)
const driver = await db.user.findUnique({ where: { id: driverId } });
if (!driver || driver.tenantId !== tenantId) {
  throw new Error('Unauthorized: Driver does not belong to tenant');
}
```
2. **Sanitize filenames** to prevent path traversal:
```typescript
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, '')      // Remove '..'
    .replace(/[/\\]/g, '-')    // Replace path separators with dash
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Only allow safe chars
    .substring(0, 255);        // Limit length
}

// Use sanitized filename in s3Key generation
const s3Key = `tenant-${tenantId}/${category}/${fileId}/${sanitizeFilename(filename)}`;
```
3. **Never trust client-provided s3Keys** - always regenerate server-side:
```typescript
// ❌ Bad: Client provides full s3Key
const s3Key = formData.get('s3Key');  // Attacker controls this!
const url = await generateDownloadUrl(s3Key);

// ✅ Good: Client provides documentId, server looks up s3Key
const documentId = formData.get('documentId');
const doc = await db.document.findUnique({ where: { id: documentId } });

// Verify document belongs to tenant
if (doc.tenantId !== currentTenantId) {
  throw new Error('Unauthorized');
}

const url = await generateDownloadUrl(doc.s3Key);
```
4. **Use separate R2 buckets per tenant** (strongest isolation):
```typescript
// Instead of: tenant-{id} prefix in same bucket
// Use: separate bucket per tenant
const bucketName = `drivecommand-${tenantId}`;

// Pros: Complete isolation, can set bucket-level permissions
// Cons: More complex infrastructure, potential bucket limits
```
5. **Implement access control at presigned URL generation**:
```typescript
export async function generateDownloadUrl(s3Key: string, tenantId: string) {
  // Verify tenant owns this s3Key
  const expectedPrefix = `tenant-${tenantId}/`;
  if (!s3Key.startsWith(expectedPrefix)) {
    throw new Error('Access denied: S3 key does not belong to tenant');
  }

  // Generate presigned URL with short expiry (5 minutes)
  const url = await s3Client.getSignedUrl('getObject', {
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Expires: 300  // 5 minutes
  });

  return url;
}
```
6. **Log all file access** for security audit:
```prisma
model FileAccessLog {
  id          String   @id @default(uuid())
  tenantId    String
  userId      String
  s3Key       String
  operation   String   // 'upload', 'download', 'delete'
  ipAddress   String
  userAgent   String
  timestamp   DateTime @default(now())

  @@index([tenantId, timestamp])
  @@index([s3Key])
}
```
7. **Add integration tests** verifying tenant isolation:
```typescript
test('prevents cross-tenant document access', async () => {
  const tenant1Doc = await createDocument(tenant1Id, 'license.pdf');

  // Attempt to download tenant1's doc while authenticated as tenant2
  const result = await getDownloadUrl.call(tenant2Context, tenant1Doc.id);

  expect(result.error).toBe('Unauthorized');
  expect(result.downloadUrl).toBeUndefined();
});
```

**Warning signs:**
- S3 keys don't include tenant prefix
- No tenant validation in download/delete operations
- Filenames contain `../` or absolute paths
- Same s3Key accessible by multiple tenants
- Security scanner flags path traversal vulnerabilities
- R2 access logs show unexpected cross-tenant access patterns

**Phase to address:**
Phase 3 (Driver Document Uploads) - Copy existing defense-in-depth validation pattern from truck/route documents when implementing driver documents. Add `sanitizeFilename()` utility to lib/storage and use in all upload paths. Create security test suite verifying tenant isolation for all file operations (upload, download, delete) across all entity types (truck, route, driver). Run penetration testing focused on file storage before production launch.

---

### Pitfall 7: Missing Indexes on Financial Aggregation Queries

**What goes wrong:**
Dashboard queries calculating route profitability, total expenses by driver, or monthly revenue perform sequential scans across millions of expense/payment records, causing 10-30 second query times, database CPU spikes to 100%, and timeout errors for other tenants. With 100 fleets tracking 1000+ routes per month with 5-10 line-item expenses each, the RouteExpense table grows to millions of rows. Queries like "show profit for all routes in December 2025" scan every row instead of using indexes, making dashboards unusable. Multi-tenant performance amplifies the problem - one tenant's expensive query slows down all other tenants on shared database.

**Why it happens:**
Aggregation queries use GROUP BY on columns without indexes. Developers add indexes to primary keys and foreign keys but forget composite indexes for common query patterns. RLS policies add `WHERE tenant_id = current_setting('app.tenant_id')` to every query, but if `tenant_id` isn't the first column in a composite index, PostgreSQL can't use it efficiently. Date range filters (`WHERE created_at >= ? AND created_at <= ?`) trigger sequential scans if no index exists on `(tenant_id, created_at)`. Dashboard widgets run multiple aggregation queries in parallel, multiplying load. Query planner chooses sequential scan instead of index scan when table statistics are outdated.

**How to avoid:**
1. **Create composite indexes matching query patterns**:
```prisma
model RouteExpense {
  id          String   @id
  tenantId    String
  routeId     String
  category    String   // 'fuel', 'tolls', 'maintenance'
  amount      Decimal  @db.Decimal(10, 2)
  expenseDate DateTime
  createdAt   DateTime @default(now())

  // Index for: "total expenses by tenant and route"
  @@index([tenantId, routeId])

  // Index for: "expenses by tenant in date range"
  @@index([tenantId, expenseDate])

  // Index for: "expenses by category for analytics"
  @@index([tenantId, category, expenseDate])

  // Index for: RLS queries (tenant_id is always first)
  @@index([tenantId, createdAt])
}

model RoutePayment {
  id          String   @id
  tenantId    String
  routeId     String
  amount      Decimal  @db.Decimal(10, 2)
  paymentDate DateTime

  @@index([tenantId, routeId])
  @@index([tenantId, paymentDate])
}
```
2. **Always filter by date range** before aggregating:
```typescript
// ❌ Bad: Aggregates ALL rows for tenant (millions)
const totalExpenses = await db.routeExpense.aggregate({
  where: { tenantId },
  _sum: { amount: true }
});

// ✅ Good: Filter to recent date range first (thousands)
const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const totalExpenses = await db.routeExpense.aggregate({
  where: {
    tenantId,
    expenseDate: { gte: last30Days }
  },
  _sum: { amount: true }
});
```
3. **Use database aggregations, not application**:
```typescript
// ❌ Bad: Fetch all rows, aggregate in JavaScript
const expenses = await db.routeExpense.findMany({
  where: { tenantId, routeId }
});
const total = expenses.reduce((sum, e) => sum + e.amount, 0);

// ✅ Good: Aggregate in database
const result = await db.routeExpense.aggregate({
  where: { tenantId, routeId },
  _sum: { amount: true }
});
const total = result._sum.amount;
```
4. **Verify indexes are used** with EXPLAIN ANALYZE:
```sql
-- Run on development database with realistic data volume
EXPLAIN ANALYZE
SELECT route_id, SUM(amount) as total_expenses
FROM route_expenses
WHERE tenant_id = 'uuid' AND expense_date >= '2025-12-01'
GROUP BY route_id;

-- Output should show:
--   "Index Scan using route_expenses_tenant_id_expense_date_idx"
-- NOT:
--   "Seq Scan on route_expenses"
```
5. **Consider materialized views** for complex aggregations:
```sql
-- Pre-aggregate daily totals
CREATE MATERIALIZED VIEW mv_daily_route_financials AS
SELECT
  tenant_id,
  route_id,
  DATE(expense_date) as date,
  SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses,
  SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_revenue
FROM (
  SELECT tenant_id, route_id, expense_date as date, amount, 'expense' as type
  FROM route_expenses
  UNION ALL
  SELECT tenant_id, route_id, payment_date as date, amount, 'payment' as type
  FROM route_payments
) combined
GROUP BY tenant_id, route_id, DATE(expense_date);

CREATE INDEX ON mv_daily_route_financials (tenant_id, date);

-- Refresh hourly via cron job
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_route_financials;
```
6. **Add query performance budgets**:
```typescript
// Middleware: Log slow queries
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();

  const duration = after - before;

  if (duration > 2000) {  // >2 seconds
    console.error('SLOW QUERY', {
      model: params.model,
      action: params.action,
      duration,
      args: params.args
    });
  }

  return result;
});
```
7. **Paginate large result sets**:
```typescript
// Dashboard: Show top 20 routes by profit, paginated
const routes = await db.route.findMany({
  where: { tenantId },
  select: {
    id: true,
    origin: true,
    destination: true,
    _count: {
      select: { expenses: true, payments: true }
    }
  },
  take: 20,
  skip: page * 20,
  orderBy: { scheduledDate: 'desc' }
});
```

**Warning signs:**
- Dashboard queries taking >5 seconds
- Database CPU >80% during business hours
- EXPLAIN ANALYZE showing "Seq Scan" on large tables
- Timeout errors on financial reports
- Queries not using tenant_id indexes
- PostgreSQL logs showing "work_mem exceeded" warnings

**Phase to address:**
Phase 1 (Route Finance Foundation) - Design indexes during schema creation for RouteExpense and RoutePayment models. Run EXPLAIN ANALYZE on all dashboard queries during development with 10K+ sample records. Set query performance budget: all aggregations <2s with 1000 routes, 10 expenses each. Add slow query logging middleware before Phase 2. Test with realistic data volumes (seed 100K expenses across multiple tenants).

---

### Pitfall 8: View/Edit Mode State Desync with Server Data

**What goes wrong:**
When unified route page allows toggling between view and edit modes, the form state becomes desynchronized with server data when other users make concurrent edits. User A opens route in edit mode, User B updates the same route's expenses, User A toggles to view mode → sees stale data (pre-User B's changes). User A toggles back to edit, makes changes, saves → overwrites User B's changes with stale data. This "last write wins" problem causes lost updates, data corruption, and user frustration. Financial data is especially critical - losing an expense entry or payment record has audit and accounting consequences.

**Why it happens:**
View mode displays cached data from initial page load, not real-time server state. Edit mode initializes form with cached data, not latest from database. When toggling between modes, no refetch occurs. Multiple browser tabs open to same route each have independent state. React Query or SWR cache prevents refetching. Server Components cache responses in Next.js App Router RSC layer. No optimistic concurrency control (version field) to detect conflicts. Users expect "edit in place" UX where view→edit toggle is instant, but instant toggle requires cached data which gets stale.

**How to avoid:**
1. **Refetch on mode transition** to view mode:
```typescript
function UnifiedRoutePage({ routeId }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const { data: route, refetch } = useQuery({
    queryKey: ['route', routeId],
    queryFn: () => fetchRoute(routeId),
    staleTime: 0  // Always consider stale
  });

  const handleModeChange = async (newMode: 'view' | 'edit') => {
    if (newMode === 'view') {
      // Refetch latest data when switching to view mode
      await refetch();
    }
    setMode(newMode);
  };

  return (
    <>
      <button onClick={() => handleModeChange('view')}>View</button>
      <button onClick={() => handleModeChange('edit')}>Edit</button>

      {mode === 'view' ? (
        <RouteView route={route} />
      ) : (
        <RouteEdit initialData={route} />
      )}
    </>
  );
}
```
2. **Show staleness indicator** in edit mode:
```typescript
function RouteEdit({ routeId }: Props) {
  const { data, dataUpdatedAt } = useQuery(['route', routeId], fetchRoute);

  const staleness = Date.now() - dataUpdatedAt;
  const isStale = staleness > 60000;  // >1 minute old

  return (
    <>
      {isStale && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-800">
            This data is {Math.floor(staleness / 60000)} minutes old.
            <button onClick={() => refetch()}>Refresh</button>
          </p>
        </div>
      )}

      <RouteForm initialValues={data} />
    </>
  );
}
```
3. **Implement optimistic locking** with version field:
```prisma
model Route {
  id      String @id
  version Int    @default(0)  // Increment on every update
  // ... other fields
}

// Update action checks version
export async function updateRoute(id: string, data: any, expectedVersion: number) {
  const result = await db.route.updateMany({
    where: {
      id,
      version: expectedVersion  // Only update if version matches
    },
    data: {
      ...data,
      version: { increment: 1 }
    }
  });

  if (result.count === 0) {
    throw new Error(
      'Route was modified by another user. Please refresh and try again.'
    );
  }
}
```
4. **Use real-time updates** with polling or WebSockets:
```typescript
// Poll for changes every 30 seconds while page is open
const { data } = useQuery({
  queryKey: ['route', routeId],
  queryFn: () => fetchRoute(routeId),
  refetchInterval: 30000,  // 30 seconds
  refetchIntervalInBackground: true
});

// Show notification when data changes
const previousData = usePrevious(data);
useEffect(() => {
  if (previousData && data && previousData.updatedAt !== data.updatedAt) {
    toast.info('Route was updated by another user. Refresh to see changes.');
  }
}, [data]);
```
5. **Lock editing** when route is being edited by another user:
```prisma
model RouteEditLock {
  routeId   String   @id
  userId    String
  lockedAt  DateTime @default(now())
  expiresAt DateTime  // 30 minutes from lock
}

// Acquire lock before entering edit mode
export async function acquireEditLock(routeId: string) {
  const existing = await db.routeEditLock.findUnique({
    where: { routeId }
  });

  if (existing && existing.expiresAt > new Date()) {
    const user = await db.user.findUnique({ where: { id: existing.userId } });
    throw new Error(`Route is being edited by ${user.firstName} ${user.lastName}`);
  }

  await db.routeEditLock.upsert({
    where: { routeId },
    create: {
      routeId,
      userId: currentUserId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    },
    update: {
      userId: currentUserId,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
}

// Release lock on mode switch or page unload
```
6. **Diff detection** before save:
```typescript
async function handleSave(formData: RouteData) {
  // Fetch latest from server
  const latest = await fetchRoute(routeId);

  // Check if server data changed since form loaded
  if (latest.updatedAt > initialData.updatedAt) {
    // Show diff modal
    setShowConflictModal(true);
    setConflict({ local: formData, server: latest });
    return;
  }

  // No conflict, safe to save
  await updateRoute(routeId, formData);
}
```

**Warning signs:**
- Users reporting "my changes disappeared"
- Concurrent edits overwriting each other
- No version field or updatedAt checks in update operations
- Edit mode data doesn't match view mode data
- Stale data errors in server logs
- No refetch on mode transitions

**Phase to address:**
Phase 2 (Unified Route View/Edit Page) - Implement optimistic locking (version field) when merging view/edit pages. Add refetch on view mode transition. Show staleness indicator if data >1 minute old. Consider edit locking for high-conflict tenants (multiple managers). Test concurrent editing scenarios with 2+ users in different browser tabs.

---

### Pitfall 9: File Upload Size Limits Silently Failing for Large Documents

**What goes wrong:**
Driver's licenses, insurance documents, or route manifests >10MB fail to upload without clear error messages, leaving users confused why uploads don't complete. Cloudflare R2 has different size limits for single PUT (5GB) vs. multipart uploads (5TB), but application code only implements single PUT via presigned URLs. Users uploading high-resolution scanned PDFs (15-50MB) experience silent failures - upload appears to progress but never completes, or completes to R2 but `completeUpload` fails validation. Mobile users on slow connections especially affected as uploads timeout before completing. No retry mechanism, so users must re-upload entire file.

**Why it happens:**
The existing `MAX_FILE_SIZE = 10 * 1024 * 1024` (10MB) in documents.ts is arbitrary - chosen without considering real-world document sizes. Validation happens client-side and server-side independently, creating inconsistency. Presigned URLs expire after 1 hour, but 50MB upload on 3G connection (download ~7Mbps, upload ~1Mbps) takes 6-7 minutes - just barely fits, with no retry tolerance. R2 requires multipart upload API for files >5MB to be robust, but current code uses simple PUT which loads entire file into memory. Browser `fetch()` doesn't support upload progress for PUT requests without XMLHttpRequest. Timeout errors from R2 or Vercel (30s function limit) don't reach client with actionable message.

**How to avoid:**
1. **Use multipart upload for files >5MB**:
```typescript
// Generate multipart upload for large files
export async function initiateMultipartUpload(
  tenantId: string,
  filename: string,
  fileSize: number
) {
  const s3Key = generateS3Key(tenantId, filename);

  // Initiate multipart upload
  const multipart = await r2Client.createMultipartUpload({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: mimeType
  });

  // Calculate part size (5MB-5GB, R2 requirement)
  const partSize = 10 * 1024 * 1024;  // 10MB per part
  const partCount = Math.ceil(fileSize / partSize);

  return {
    uploadId: multipart.UploadId,
    s3Key,
    partSize,
    partCount
  };
}

// Client uploads in chunks
async function uploadLargeFile(file: File, uploadId: string, partSize: number) {
  const parts = [];

  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const chunk = file.slice(start, end);

    // Get presigned URL for this part
    const { url } = await getMultipartUploadUrl(uploadId, partNumber);

    // Upload part with retry
    const response = await uploadWithRetry(url, chunk);

    parts.push({
      PartNumber: partNumber,
      ETag: response.headers.get('ETag')
    });

    // Update progress
    const progress = (partNumber / partCount) * 100;
    setUploadProgress(progress);
  }

  // Complete multipart upload
  await completeMultipartUpload(uploadId, parts);
}
```
2. **Increase file size limit** to realistic value:
```typescript
// Allow up to 100MB for document uploads
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Different limits per document type
const SIZE_LIMITS = {
  'driver_license': 10 * 1024 * 1024,      // 10MB
  'insurance': 20 * 1024 * 1024,            // 20MB
  'route_manifest': 50 * 1024 * 1024,       // 50MB
  'video_evidence': 500 * 1024 * 1024       // 500MB (dashcam footage)
};
```
3. **Add upload timeout and retry logic**:
```typescript
async function uploadWithRetry(url: string, file: Blob, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);  // 5 min

      const response = await fetch(url, {
        method: 'PUT',
        body: file,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return response;

    } catch (error) {
      lastError = error;
      console.warn(`Upload attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  throw new Error(`Upload failed after ${maxRetries} attempts: ${lastError}`);
}
```
4. **Show detailed upload progress**:
```typescript
function DocumentUpload() {
  const [progress, setProgress] = useState({
    phase: 'idle',  // 'validating', 'uploading', 'saving'
    percent: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    speed: 0  // bytes per second
  });

  // Use XMLHttpRequest for progress tracking
  async function uploadWithProgress(url: string, file: File) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      let startTime = Date.now();
      let startBytes = 0;

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;  // seconds
          const speed = (e.loaded - startBytes) / elapsed;

          setProgress({
            phase: 'uploading',
            percent: (e.loaded / e.total) * 100,
            bytesUploaded: e.loaded,
            totalBytes: e.total,
            speed
          });

          startTime = now;
          startBytes = e.loaded;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      xhr.open('PUT', url);
      xhr.send(file);
    });
  }

  return (
    <div>
      {progress.phase === 'uploading' && (
        <div>
          <ProgressBar value={progress.percent} />
          <p>
            {formatBytes(progress.bytesUploaded)} / {formatBytes(progress.totalBytes)}
            ({formatBytes(progress.speed)}/s)
          </p>
          <p>
            Estimated time remaining: {calculateETA(progress)}
          </p>
        </div>
      )}
    </div>
  );
}
```
5. **Validate file size before upload** with clear error:
```typescript
// Client-side validation
if (file.size > MAX_FILE_SIZE) {
  setError(
    `File size (${formatBytes(file.size)}) exceeds maximum allowed size ` +
    `(${formatBytes(MAX_FILE_SIZE)}). Please compress the file or contact support.`
  );
  return;
}

// Server-side validation (defense in depth)
if (fileSize > MAX_FILE_SIZE) {
  return {
    error: `File size ${formatBytes(fileSize)} exceeds limit ${formatBytes(MAX_FILE_SIZE)}. ` +
          'For files larger than 100MB, please contact support@drivecommand.com'
  };
}
```
6. **Configure R2 multipart lifecycle**:
```javascript
// Cleanup incomplete multipart uploads after 7 days
{
  "lifecycle": {
    "rules": [{
      "id": "cleanup-incomplete-multipart",
      "status": "Enabled",
      "abortIncompleteMultipartUpload": {
        "daysAfterInitiation": 7
      }
    }]
  }
}
```

**Warning signs:**
- Upload failures for files >10MB
- No upload progress indicator
- Timeouts on large file uploads
- Upload succeeds but `completeUpload` fails
- Mobile users unable to upload documents
- Error messages: "Request timeout" or "Body exceeded limit"

**Phase to address:**
Phase 3 (Driver Document Uploads) - Implement multipart upload for files >5MB before launching driver documents (licenses/certifications often high-res scans). Increase MAX_FILE_SIZE to 100MB. Add upload progress with XMLHttpRequest. Test with 50MB+ files on simulated 3G connection to verify retry logic works. Document multipart upload pattern for future features (dashcam videos).

---

### Pitfall 10: Missing Validation on Line-Item Expense Categories

**What goes wrong:**
Allowing free-text expense categories creates data quality problems: misspellings ("feul" vs "fuel"), inconsistent naming ("tolls" vs "toll roads" vs "highway fees"), and inability to aggregate or report accurately. Finance dashboard showing "Expenses by Category" becomes useless with 50+ category variations for what should be 5-10 standard categories. Users can't compare routes ("which route had highest fuel cost?") because fuel expenses are categorized inconsistently. Accounting export for tax preparation requires manual cleanup to consolidate categories. No validation allows nonsense values ("asdfg", "test", "12345") that corrupt financial reports.

**Why it happens:**
Schema uses `String` type for category field without enum or validation. Developers prioritize flexibility ("users can categorize however they want") over consistency. No autocomplete or dropdown forces users to type freely. Copy-paste from other systems introduces variations. Different team members use different terminology. No validation in Zod schema allows any non-empty string. Historical data migrated with inconsistent categories. Users abbreviate ("maint" vs "maintenance") or use slang ("smokes" for brake wear).

**How to avoid:**
1. **Use Prisma enum for standard categories**:
```prisma
enum ExpenseCategory {
  FUEL
  TOLLS
  MAINTENANCE
  PARKING
  LODGING
  MEALS
  PERMITS
  INSURANCE
  DEPRECIATION
  OTHER
}

model RouteExpense {
  id          String          @id
  category    ExpenseCategory
  description String?         // Free text for details
  amount      Decimal         @db.Decimal(10, 2)
}
```
2. **Allow custom categories with validation**:
```prisma
// Two-tier approach: standard categories + custom
model RouteExpense {
  id               String   @id
  standardCategory String   // From predefined list
  customCategory   String?  // User-defined, optional
  amount           Decimal  @db.Decimal(10, 2)
}

// Validation schema
const expenseSchema = z.object({
  standardCategory: z.enum([
    'FUEL', 'TOLLS', 'MAINTENANCE', 'PARKING',
    'LODGING', 'MEALS', 'PERMITS', 'OTHER'
  ]),
  customCategory: z.string()
    .max(50)
    .regex(/^[a-zA-Z0-9\s-]+$/, 'Only letters, numbers, spaces, and hyphens')
    .optional(),
  amount: z.number().positive()
});
```
3. **Provide autocomplete UI** with fuzzy matching:
```typescript
function ExpenseCategoryInput({ value, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Fetch previously used categories
  const { data: categories } = useQuery(['expense-categories'], async () => {
    return await db.routeExpense.groupBy({
      by: ['category'],
      where: { tenantId }
    });
  });

  // Fuzzy match on user input
  const handleInputChange = (input: string) => {
    const matches = categories
      .filter(cat => cat.toLowerCase().includes(input.toLowerCase()))
      .slice(0, 5);
    setSuggestions(matches);
  };

  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      onInputChange={handleInputChange}
      options={suggestions}
      freeSolo  // Allow custom values
    />
  );
}
```
4. **Normalize legacy data** before migration:
```typescript
// Script: scripts/normalize-expense-categories.ts
const CATEGORY_MAPPING = {
  'fuel': 'FUEL',
  'feul': 'FUEL',
  'gas': 'FUEL',
  'diesel': 'FUEL',
  'tolls': 'TOLLS',
  'toll roads': 'TOLLS',
  'highway fees': 'TOLLS',
  'maint': 'MAINTENANCE',
  'maintenance': 'MAINTENANCE',
  'repair': 'MAINTENANCE',
  // ... more mappings
};

async function normalizeCategories() {
  const expenses = await db.routeExpense.findMany();

  for (const expense of expenses) {
    const normalized = CATEGORY_MAPPING[expense.category.toLowerCase()];

    if (normalized && normalized !== expense.category) {
      await db.routeExpense.update({
        where: { id: expense.id },
        data: { category: normalized }
      });
      console.log(`Normalized: ${expense.category} → ${normalized}`);
    }
  }
}
```
5. **Add admin UI** to manage custom categories:
```typescript
// Owner can define tenant-specific categories
model TenantExpenseCategory {
  id       String @id
  tenantId String
  name     String
  icon     String?
  color    String?

  @@unique([tenantId, name])
}

// Dropdown shows: Standard categories + Tenant custom categories
const allCategories = [
  ...STANDARD_CATEGORIES,
  ...tenantCustomCategories
];
```
6. **Validate on save** with clear error:
```typescript
const result = expenseSchema.safeParse(formData);

if (!result.success) {
  const categoryError = result.error.flatten().fieldErrors.category;

  if (categoryError) {
    setError(
      `Invalid category. Please select from: ${STANDARD_CATEGORIES.join(', ')} ` +
      'or contact support to add a custom category.'
    );
  }
}
```
7. **Add reports** showing category distribution:
```typescript
// Admin dashboard: Show category usage
const categoryStats = await db.routeExpense.groupBy({
  by: ['category'],
  where: { tenantId },
  _count: true,
  _sum: { amount: true }
});

// Flag suspicious categories (low usage, typos)
const suspicious = categoryStats
  .filter(stat => stat._count < 5)  // Used <5 times
  .filter(stat => !STANDARD_CATEGORIES.includes(stat.category));
```

**Warning signs:**
- Expense reports show 20+ category variations
- Inability to compare routes by expense type
- Free-text category input without validation
- Users complaining "can't find my category"
- Financial exports need manual cleanup
- Database shows categories: "test", "asdf", "123"

**Phase to address:**
Phase 1 (Route Finance Foundation) - Define ExpenseCategory enum during schema design. Provide dropdown UI with standard categories + "Other (specify)" option. Add category validation to Zod schema. Document standard categories in planning/conventions. Optionally allow tenant admins to define custom categories in Phase 2+.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using JavaScript `number` for money | Simpler code, familiar type | Floating-point errors, financial inaccuracies, audit failures | Never - always use Decimal |
| Storing calculated totals (totalExpenses) | Faster reads, no aggregation needed | Race conditions, data corruption, desync from source data | Never - always calculate from line items |
| Skipping optimistic locking (version field) | Simpler update logic | Lost updates, overwritten changes, data inconsistency | Only for non-critical fields (notes, tags) |
| Hard-deleting financial records | Cleaner database, no soft-delete complexity | Lost audit trail, regulatory violations, no dispute resolution | Never - financial data requires retention |
| Trusting client-provided s3Keys | Less server-side validation code | Path traversal, tenant isolation bypass, security breach | Never - always validate server-side |
| Single PUT uploads only (no multipart) | Simpler implementation | Large file upload failures, poor mobile UX | Only if files guaranteed <5MB |
| Free-text expense categories | More flexible for users | Inconsistent data, unusable reports, manual cleanup | Only for prototypes, not production |
| No unsaved changes detection | Simpler page architecture | Lost user data, frustration, re-entry errors | Never for forms with >3 fields |
| Polling instead of optimistic locking | Easier to implement | Higher server load, stale data warnings, not reliable | Only for low-traffic dashboards |
| Skipping composite indexes | Faster schema iteration | Slow queries, database overload, timeouts | Only in development, never production |
| No idempotency keys | Less request complexity | Duplicate transactions, double charges | Never for financial operations |
| Letting users delete routes with finances | Simpler permissions logic | Destroyed audit trail, accounting gaps | Never - force archive instead |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Decimal.js arithmetic | Mixing Decimal and number types | Always convert to Decimal before operations: `new Decimal(value)` |
| Prisma financial updates | Updating calculated totals in transaction | Calculate aggregates on-demand from source tables |
| React Query caching | Not refetching on mode transitions | Set `staleTime: 0` or refetch on view mode entry |
| File upload presigned URLs | Generating URL without tenant validation | Verify entity ownership before URL generation |
| Multi-part R2 uploads | Using simple PUT for large files | Use createMultipartUpload for files >5MB |
| Form state persistence | Only using component useState | Combine localStorage + React Query for draft recovery |
| Expense category validation | Allowing any string value | Use Prisma enum or validated string with autocomplete |
| Route deletion | Direct `db.route.delete()` call | Check for financial records, require confirmation, prefer archive |
| S3 key validation | Checking prefix string only | Verify tenant ownership + sanitize filename + validate entity |
| Concurrent edits | No conflict detection | Add version field + optimistic locking checks |
| Financial audit logs | Storing only current state | Log before/after snapshots + never allow updates/deletes |
| Upload error handling | Generic "upload failed" message | Specific errors with file size, type, and retry guidance |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Missing composite indexes on finances | Dashboard queries >10s, DB CPU spikes | Add `(tenant_id, expense_date)` indexes before production | >10K expenses per tenant |
| Calculating profit in application | Slow dashboard load, high memory usage | Use database SUM aggregations, not `reduce()` | >1K routes with expenses |
| Refetching entire route on every toggle | Slow view/edit transitions, high bandwidth | Use React Query cache, partial updates | Routes with >20 expenses |
| No pagination on expense lists | Page crashes with large datasets | Limit to 50 items, load more on scroll | >100 expenses per route |
| Sequential file uploads | Uploading 10 files takes 10x time | Use parallel uploads with `Promise.all()` | >5 files per upload session |
| Unindexed category aggregations | Slow "Expenses by Category" reports | Index `(tenant_id, category, expense_date)` | >50K expense records |
| No query result caching | Same aggregations recalculated constantly | Cache with 5-minute TTL for dashboards | >10 concurrent users |
| Large transaction scopes | Lock timeouts, deadlocks | Keep transactions small, specific | Transactions spanning >3 tables |
| Fetching all routes for dropdown | Slow form rendering | Limit dropdown to 100 most recent, add search | Tenants with >500 routes |
| No materialized views for complex analytics | 30s+ query times on financial reports | Pre-aggregate daily/weekly, refresh hourly | >100K transactions, complex JOINs |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No tenant validation on s3Key | Cross-tenant document access | Always verify `s3Key.startsWith(\`tenant-${tenantId}/\`)` |
| Trusting client-provided amount values | Fraudulent expense amounts | Validate all Decimal fields server-side with Zod |
| No audit trail on financial changes | Undetectable fraud, compliance failures | Log every create/update/delete to immutable audit table |
| Hard-deleting financial records | Lost evidence for disputes/audits | Use soft delete (deletedAt) or archive pattern only |
| Missing idempotency keys | Duplicate charges from retries | Generate unique key per transaction, check before insert |
| No file content validation | Malware uploads, XSS via SVG | Validate magic bytes, sanitize filenames, scan uploads |
| Allowing negative expense amounts | Fraudulent refunds, accounting errors | Add `z.number().positive()` validation |
| No rate limiting on uploads | DoS via large file spam | Limit uploads per user/tenant per hour |
| Exposing s3Keys in client state | Path traversal attempts | Use document IDs client-side, map to s3Keys server-side |
| Missing RBAC on financial operations | Drivers editing expenses, unauthorized access | Require OWNER/MANAGER for expense/payment create/update/delete |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No save confirmation for financial data | Users unsure if expense saved | Show success toast + update list immediately |
| Modal forms losing data on accidental close | Re-entry frustration | Confirm before close if form is dirty |
| No loading states during aggregations | Dashboard appears broken during 5s query | Show skeleton loaders or "Calculating..." |
| Free-text category input | Typos, inconsistent data entry | Dropdown with autocomplete + "Other" option |
| No visual distinction between view/edit modes | Users accidentally edit or think they can't | Clear mode indicator, different background colors |
| Hidden file size limits | Upload failure without explanation | Show "Max 100MB" in upload UI, validate before upload |
| No upload progress for large files | Users think upload hung, close tab | XMLHttpRequest progress bar with MB/s and ETA |
| Generic "Error updating route" message | Users don't know what went wrong | Specific errors: "Amount must be positive" |
| No way to recover deleted expense | Accidental delete is permanent | Require confirmation, allow undo within 10 seconds |
| Showing profit to drivers | Privacy concerns, competitive info leak | Hide financial data from DRIVER role, show only to OWNER/MANAGER |
| No empty state for new routes | Blank expense list looks broken | "No expenses yet. Click 'Add Expense' to get started." |
| Edit form doesn't scroll to first error | User doesn't see validation message | Scroll to first invalid field on submit |

## "Looks Done But Isn't" Checklist

- [ ] **Route Finance Model:** Tables created - verify Decimal type used, not Float
- [ ] **Expense Creation:** Form accepts input - verify Zod validation prevents negative/zero amounts
- [ ] **Profit Calculation:** Shows correct value - verify uses Decimal.js, not JavaScript math
- [ ] **Financial Audit Trail:** Expenses logged - verify audit records are append-only (no updates/deletes)
- [ ] **Concurrent Expense Edits:** Multiple users can edit - verify optimistic locking prevents lost updates
- [ ] **Route Deletion Protection:** Delete button works - verify prevents deletion if financial records exist
- [ ] **View/Edit Mode Toggle:** Switches instantly - verify no unsaved data lost, refetch on view mode
- [ ] **Unsaved Changes Warning:** Browser back shows prompt - verify works for both SPA and browser navigation
- [ ] **Driver Documents Upload:** Upload succeeds - verify multipart used for >5MB, progress shown
- [ ] **Orphaned File Cleanup:** Uploads can fail - verify PendingUpload tracking + daily cleanup job exists
- [ ] **File Tenant Isolation:** Documents visible - verify s3Key validation prevents cross-tenant access
- [ ] **Category Validation:** Dropdown populated - verify enum or autocomplete, not free text
- [ ] **Financial Indexes:** Queries return fast - verify composite indexes on (tenant_id, expense_date)
- [ ] **Aggregation Performance:** Dashboard loads - verify queries <2s with 10K expenses using EXPLAIN ANALYZE
- [ ] **Soft Delete Pattern:** Deleted expenses hidden - verify deletedAt filter in all queries, not hard delete
- [ ] **Upload Size Limits:** Large file uploads - verify >10MB uses multipart, shows clear error if exceeded
- [ ] **Mode State Persistence:** Form data survives refresh - verify localStorage draft + recovery prompt
- [ ] **S3 Key Sanitization:** Filenames with ../ rejected - verify sanitizeFilename removes path traversal

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Floating-point errors in financial calculations | **HIGH** | 1. Add Decimal.js library, 2. Create migration to recalculate all profits from source data, 3. Add regression tests, 4. Audit differences and notify affected tenants |
| Lost updates from race conditions | **CRITICAL** | 1. Add version field to schema, 2. Implement optimistic locking in all updates, 3. Review audit logs to identify lost updates, 4. Manual data recovery from backups |
| Orphaned files accumulating | **MEDIUM** | 1. Create PendingUpload table, 2. Write cleanup script to identify orphans, 3. Compare S3 list vs DB records, 4. Delete after verification, 5. Set up cron job |
| Hard-deleted financial records | **CRITICAL** | 1. Restore from database backups, 2. Add soft delete pattern, 3. Migrate existing deletes to deletedAt, 4. Notify compliance team of gap |
| Path traversal vulnerability | **CRITICAL** | 1. Immediately add s3Key validation to all routes, 2. Audit access logs for suspicious patterns, 3. Notify affected tenants if breach detected, 4. Run penetration test |
| Missing indexes causing slow queries | **MEDIUM** | 1. Run EXPLAIN ANALYZE to identify missing indexes, 2. Create composite indexes on hot paths, 3. VACUUM ANALYZE to update statistics, 4. Monitor query times |
| Inconsistent expense categories | **LOW** | 1. Write normalization script with fuzzy matching, 2. Migrate to enum or validated string, 3. Add dropdown UI, 4. Document standard categories |
| Unsaved changes lost | **MEDIUM** | 1. Add useUnsavedChanges hook, 2. Implement localStorage persistence, 3. Add beforeunload handler, 4. Test navigation blocking |
| View/edit state desync | **MEDIUM** | 1. Add version field, 2. Refetch on mode transition, 3. Show staleness indicator, 4. Add conflict resolution UI |
| Large file upload failures | **MEDIUM** | 1. Implement multipart upload API, 2. Add upload progress with XMLHttpRequest, 3. Increase MAX_FILE_SIZE, 4. Add retry logic with exponential backoff |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Floating-point arithmetic errors | Phase 1: Route Finance Foundation | All currency fields use Decimal type, profit calculations use Decimal.js, tests verify accuracy |
| Race conditions in financial updates | Phase 1: Route Finance Foundation | Version field exists, optimistic locking in update actions, concurrent edit tests pass |
| Unsaved changes lost on mode toggle | Phase 2: Unified Route View/Edit Page | useUnsavedChanges hook prevents navigation, localStorage persists drafts, browser back shows prompt |
| Orphaned files from failed uploads | Phase 3: Driver Document Uploads | PendingUpload table tracking, daily cleanup job running, orphan rate <5% |
| Cascading deletes destroying audit trail | Phase 1: Route Finance Foundation | RouteExpense uses onDelete: Restrict, soft delete pattern implemented, FinancialAuditLog immutable |
| Multi-tenant file storage isolation bypass | Phase 3: Driver Document Uploads | s3Key validation in all operations, sanitizeFilename utility, security tests verify isolation |
| Missing indexes on financial queries | Phase 1: Route Finance Foundation | Composite indexes on (tenant_id, expense_date, category), EXPLAIN ANALYZE shows index usage |
| View/edit state desync with server | Phase 2: Unified Route View/Edit Page | Refetch on view mode, version field for conflict detection, staleness indicator shown |
| File upload size limits failing | Phase 3: Driver Document Uploads | Multipart upload for >5MB, progress indicator, retry logic, MAX_FILE_SIZE = 100MB |
| Missing validation on expense categories | Phase 1: Route Finance Foundation | ExpenseCategory enum or validated string, dropdown UI, autocomplete suggestions |

## Sources

### Financial Calculations and Rounding
- [Rounding Error: Rounding Off: The Ripple Effect of Rounding Errors in Financial Reports](https://fastercapital.com/content/Rounding-Error--Rounding-Off--The-Ripple-Effect-of-Rounding-Errors-in-Financial-Reports.html)
- [Handling Precision in Financial Calculations in .NET: A Deep Dive into Decimal and Common Pitfalls](https://medium.com/@stanislavbabenko/handling-precision-in-financial-calculations-in-net-a-deep-dive-into-decimal-and-common-pitfalls-1211cc5edd3b)
- [Avoid Common Pitfalls: The Dos and Don'ts of Handling Currency Data in Fintech](https://bitcat.dev/avoid-common-pitfalls-fintech-currency-handling/)
- [Different strategies for storing currency values in MySQL](https://accreditly.io/articles/different-strategies-for-storing-currency-values-in-mysql)
- [Floating Point Numbers & Currency Rounding Errors](https://spin.atomicobject.com/currency-rounding-errors/)

### Race Conditions and Concurrency
- [Race Condition Vulnerabilities in Financial Transaction Processing Systems](https://www.sourcery.ai/vulnerabilities/race-condition-financial-transactions)
- [Concurrency: Financial Transaction Systems](https://dzone.com/articles/concurrency-in-financial-transaction-systems)
- [Race Condition and Double Spending in Money Transfer Systems](https://medium.com/@moeinkolivand97/race-condition-and-double-spending-in-money-transfer-systems-7b5547c5d0de)
- [A Race to the Bottom - Database Transactions Undermining Your AppSec](https://blog.doyensec.com/2024/07/11/database-race-conditions.html)
- [Race Conditions/Concurrency Defects in Databases: A Catalogue](https://www.ketanbhatt.com/p/db-concurrency-defects)

### React Forms and Unsaved Changes
- [Display Warning for Unsaved Form Data on Page Exit](https://claritydev.net/blog/display-warning-for-unsaved-form-data-on-page-exit)
- [How to Create a Custom Hook for Unsaved Changes Alerts in React](https://medium.com/@ignatovich.dm/how-to-create-a-custom-hook-for-unsaved-changes-alerts-in-react-b1441f0ae712)
- [Building a Robust Unsaved Changes Prompt with React and React Router DOM](https://medium.com/@serifcolakel/building-a-robust-unsaved-changes-prompt-with-react-and-react-router-dom-24f9157307ca)
- [How to Protect Unsaved Form Data in React Forms](https://medium.com/technogise/how-to-protect-unsaved-form-data-in-react-forms-87f902a8e1bd)
- [Form State Management in React: From Messy to Elegant](https://medium.com/@gecno/form-state-management-in-react-from-messy-to-elegant-e0bc6859c269)

### File Upload and Storage
- [Multipart upload · Cloudflare R2 docs](https://developers.cloudflare.com/r2/objects/multipart-objects/)
- [Limits · Cloudflare R2 docs](https://developers.cloudflare.com/r2/platform/limits/)
- [Is Cleaning Up Orphaned Uploaded Files Necessary?](https://open.vanillaforums.com/discussion/32016/is-cleaning-up-orphaned-uploaded-files-necessary)
- [Preventing "orphaned" files - How would you handle it?](https://forum.bubble.io/t/solved-preventing-orphaned-files-how-would-you-handle-it/63664)
- [Storing file references, avoiding orphaned files](https://community.uploadcare.com/t/storing-file-references-avoiding-orphaned-files-etc/2155)

### Multi-Tenant Security
- [Multi Tenant Security - OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [Tenant isolation in multi-tenant systems: What you need to know](https://workos.com/blog/tenant-isolation-in-multi-tenant-systems)
- [Architecting Secure Multi-Tenant Data Isolation](https://medium.com/@justhamade/architecting-secure-multi-tenant-data-isolation-d8f36cb0d25e)
- [Tenant Data Isolation: Patterns and Anti-Patterns](https://propelius.ai/blogs/tenant-data-isolation-patterns-and-anti-patterns)

### Database and Audit Trails
- [Soft delete vs hard delete: choose the right data lifecycle](https://appmaster.io/blog/soft-delete-vs-hard-delete)
- [The Ultimate Guide to Immutable Audit Trails](https://www.hubifi.com/blog/immutable-audit-log-basics)
- [SQL Server 2022 Ledger: Immutable Audit Trails](https://dzone.com/articles/sql-server-ledger-tamper-evident-audit-trails)
- [Implementing Cascading Updates and Deletes in T-SQL Safely](https://moldstud.com/articles/p-implementing-cascading-updates-and-deletes-in-t-sql-safely-a-comprehensive-guide)
- [Entity Framework Pitfalls: Cascade Deletes](https://weblogs.asp.net/ricardoperes/entity-framework-pitfalls-cascade-deletes/)

### State Management and View/Edit Patterns
- [State Management | React Router](https://reactrouter.com/explanation/state-management)
- [Build and Handle Editable Form with React.JS](https://medium.com/dev-genius/reactjs-form-editable-473e48fb6c9e)
- [Top State Management Pitfalls in Modern UI and How to Avoid Them](https://logicloom.in/state-management-gone-wrong-avoiding-common-pitfalls-in-modern-ui-development/)

---
*Pitfalls research for: Adding route finance tracking, unified route view/edit page, and driver document uploads to existing Next.js 16 multi-tenant fleet management app*
*Researched: 2026-02-16*
