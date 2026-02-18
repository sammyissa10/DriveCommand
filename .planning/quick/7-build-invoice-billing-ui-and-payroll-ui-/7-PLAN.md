---
phase: quick-7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/migrations/20260218000002_add_invoice_payroll_models/migration.sql
  - src/lib/validations/invoice.schemas.ts
  - src/lib/validations/payroll.schemas.ts
  - src/app/(owner)/actions/invoices.ts
  - src/app/(owner)/actions/payroll.ts
  - src/app/(owner)/invoices/page.tsx
  - src/app/(owner)/invoices/new/page.tsx
  - src/app/(owner)/invoices/[id]/page.tsx
  - src/app/(owner)/invoices/[id]/edit/page.tsx
  - src/app/(owner)/payroll/page.tsx
  - src/app/(owner)/payroll/new/page.tsx
  - src/app/(owner)/payroll/[id]/page.tsx
  - src/app/(owner)/payroll/[id]/edit/page.tsx
  - src/components/invoices/invoice-form.tsx
  - src/components/invoices/invoice-list.tsx
  - src/components/invoices/invoice-items-editor.tsx
  - src/components/invoices/delete-invoice-button.tsx
  - src/components/payroll/payroll-form.tsx
  - src/components/payroll/payroll-list.tsx
  - src/components/payroll/delete-payroll-button.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can see a list of all invoices with status badges and totals"
    - "Owner can create a new invoice with line items that auto-calculate amounts"
    - "Owner can edit an existing invoice and update its status"
    - "Owner can delete a draft invoice"
    - "Owner can see a list of all payroll records with driver names and status"
    - "Owner can create a new payroll record for a driver"
    - "Owner can edit a payroll record and mark it as approved/paid"
    - "Owner can delete a draft payroll record"
    - "Sidebar navigation links work for Invoices and Payroll"
    - "All money calculations use Decimal.js (never floating point)"
  artifacts:
    - path: "prisma/migrations/20260218000002_add_invoice_payroll_models/migration.sql"
      provides: "Database tables with RLS for Invoice, InvoiceItem, PayrollRecord"
    - path: "src/app/(owner)/actions/invoices.ts"
      provides: "CRUD server actions for invoices"
      exports: ["createInvoice", "updateInvoice", "deleteInvoice"]
    - path: "src/app/(owner)/actions/payroll.ts"
      provides: "CRUD server actions for payroll"
      exports: ["createPayrollRecord", "updatePayrollRecord", "deletePayrollRecord"]
  key_links:
    - from: "src/app/(owner)/invoices/page.tsx"
      to: "prisma.invoice"
      via: "getTenantPrisma query"
      pattern: "prisma\\.invoice\\.findMany"
    - from: "src/components/invoices/invoice-form.tsx"
      to: "src/app/(owner)/actions/invoices.ts"
      via: "useActionState"
      pattern: "useActionState"
    - from: "src/app/(owner)/payroll/page.tsx"
      to: "prisma.payrollRecord"
      via: "getTenantPrisma query"
      pattern: "prisma\\.payrollRecord\\.findMany"
---

<objective>
Build complete Invoice/Billing and Payroll UI modules with database migration, server actions, Zod validation, and full CRUD pages.

Purpose: Enable fleet owners to create and manage invoices with line items for billing customers, and create payroll records for paying drivers.
Output: Working /invoices and /payroll sections with list, create, detail, and edit pages. Sidebar already has navigation links.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma
@src/app/(owner)/actions/customers.ts
@src/lib/validations/customer.schemas.ts
@src/app/(owner)/crm/page.tsx
@src/components/crm/customer-form.tsx
@src/components/crm/customer-list.tsx
@src/components/crm/delete-customer-button.tsx
@src/app/(owner)/crm/[id]/page.tsx
@src/app/(owner)/crm/[id]/edit/page.tsx
@src/app/(owner)/crm/new/page.tsx
@src/components/navigation/sidebar.tsx
@prisma/migrations/20260216223252_add_route_finance_models/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Database migration + Zod schemas + server actions for Invoice and Payroll</name>
  <files>
    prisma/migrations/20260218000002_add_invoice_payroll_models/migration.sql
    src/lib/validations/invoice.schemas.ts
    src/lib/validations/payroll.schemas.ts
    src/app/(owner)/actions/invoices.ts
    src/app/(owner)/actions/payroll.ts
  </files>
  <action>
    **1. Create migration SQL** at `prisma/migrations/20260218000002_add_invoice_payroll_models/migration.sql`:

    The Prisma schema already has the models defined (Customer, CustomerInteraction, Invoice, InvoiceItem, PayrollRecord with enums). The CRM tables (Customer, CustomerInteraction) and enums (CustomerPriority, CustomerStatus, InteractionType) also need migration since they are in schema.prisma but have no migration yet. Create migration that adds:

    - `CREATE TYPE "CustomerPriority"` enum (LOW, MEDIUM, HIGH, VIP)
    - `CREATE TYPE "CustomerStatus"` enum (ACTIVE, INACTIVE, PROSPECT)
    - `CREATE TYPE "InteractionType"` enum (EMAIL, PHONE, MEETING, NOTE, LOAD_UPDATE, ETA_NOTIFICATION)
    - `CREATE TYPE "InvoiceStatus"` enum (DRAFT, SENT, PAID, OVERDUE, CANCELLED)
    - `CREATE TYPE "PayrollStatus"` enum (DRAFT, APPROVED, PAID)
    - `CREATE TABLE "Customer"` with all fields from schema
    - `CREATE TABLE "CustomerInteraction"` with all fields from schema
    - `CREATE TABLE "Invoice"` with all fields from schema (amount Decimal(12,2), tax Decimal(10,2), totalAmount Decimal(12,2))
    - `CREATE TABLE "InvoiceItem"` with fields (quantity Decimal(10,2), unitPrice Decimal(10,2), amount Decimal(12,2))
    - `CREATE TABLE "PayrollRecord"` with fields (basePay, bonuses, deductions, totalPay all Decimal(10,2))
    - All indexes matching @@index directives in schema
    - All unique constraints matching @@unique directives
    - All foreign keys matching @relation directives
    - RLS policies for: Customer, CustomerInteraction, Invoice, PayrollRecord (same pattern as RouteExpense migration: ENABLE + FORCE + tenant_isolation_policy using current_tenant_id() + bypass_rls_policy)
    - InvoiceItem does NOT get RLS (inherits through Invoice, same pattern as ExpenseTemplateItem)

    Run: `npx prisma migrate deploy` to apply the migration (the schema.prisma is already correct, so no `prisma migrate dev` needed -- use `--create-only` approach: write the SQL file, then `npx prisma migrate resolve --applied "20260218000002_add_invoice_payroll_models"` after verifying, OR use `prisma db execute` to run the SQL then mark applied). Actually, the simplest approach: run `npx prisma migrate dev --name add_invoice_payroll_models` which will auto-generate and apply. But since the CRM models also lack a migration, do `npx prisma migrate dev --name add_crm_invoice_payroll_models` to let Prisma detect ALL missing tables and generate the migration. Then inspect the generated SQL and APPEND the RLS policy blocks for Customer, CustomerInteraction, Invoice, and PayrollRecord tables. After appending, re-apply with `npx prisma migrate deploy` or just `npx prisma generate`.

    IMPORTANT: The safest approach is:
    1. Run `npx prisma migrate dev --create-only --name add_crm_invoice_payroll_models` to create migration SQL without applying
    2. Open the generated migration file and append RLS blocks for Customer, CustomerInteraction, Invoice, PayrollRecord
    3. Run `npx prisma migrate dev` to apply the migration
    4. Run `npx prisma generate` to regenerate the client

    **2. Create Zod schemas** at `src/lib/validations/invoice.schemas.ts`:

    ```typescript
    import { z } from 'zod';

    export const invoiceItemSchema = z.object({
      description: z.string().min(1, 'Description is required').max(200),
      quantity: z.coerce.number().positive('Quantity must be positive'),
      unitPrice: z.coerce.number().min(0, 'Unit price must be non-negative'),
    });

    export const invoiceCreateSchema = z.object({
      customerId: z.string().uuid('Invalid customer').optional().or(z.literal('')),
      routeId: z.string().uuid('Invalid route').optional().or(z.literal('')),
      invoiceNumber: z.string().min(1, 'Invoice number is required').max(50),
      tax: z.coerce.number().min(0, 'Tax must be non-negative').default(0),
      status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).default('DRAFT'),
      issueDate: z.string().min(1, 'Issue date is required'),
      dueDate: z.string().min(1, 'Due date is required'),
      notes: z.string().max(2000).optional().or(z.literal('')),
      items: z.array(invoiceItemSchema).min(1, 'At least one line item is required'),
    });

    export const invoiceUpdateSchema = invoiceCreateSchema;

    export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;
    export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
    ```

    Create `src/lib/validations/payroll.schemas.ts`:

    ```typescript
    import { z } from 'zod';

    export const payrollCreateSchema = z.object({
      driverId: z.string().uuid('Driver is required'),
      periodStart: z.string().min(1, 'Period start is required'),
      periodEnd: z.string().min(1, 'Period end is required'),
      basePay: z.coerce.number().min(0, 'Base pay must be non-negative'),
      bonuses: z.coerce.number().min(0).default(0),
      deductions: z.coerce.number().min(0).default(0),
      milesLogged: z.coerce.number().int().min(0).default(0),
      loadsCompleted: z.coerce.number().int().min(0).default(0),
      status: z.enum(['DRAFT', 'APPROVED', 'PAID']).default('DRAFT'),
      notes: z.string().max(2000).optional().or(z.literal('')),
    });

    export const payrollUpdateSchema = payrollCreateSchema;

    export type PayrollCreate = z.infer<typeof payrollCreateSchema>;
    ```

    **3. Create invoice server actions** at `src/app/(owner)/actions/invoices.ts`:

    Follow the EXACT pattern from `customers.ts`:
    - `'use server'` directive
    - Import `requireRole`, `UserRole`, `getTenantPrisma`, `requireTenantId`
    - Import Zod schemas from `@/lib/validations/invoice.schemas`
    - Import `Decimal` from `@/generated/prisma` for money calculations
    - Import `revalidatePath` and `redirect` from next

    Actions to create:
    - `createInvoice(prevState: any, formData: FormData)`: Parse items from `formData.get('itemsJson')` (JSON string in hidden field, same pattern as expense templates). Calculate `amount` as sum of item amounts (quantity * unitPrice) using Decimal.js. Calculate `totalAmount` as amount + tax using Decimal.js. Create invoice with nested `items: { create: [...] }`. Redirect to `/invoices/{id}`.
    - `updateInvoice(id: string, prevState: any, formData: FormData)`: Same pattern. Update invoice and delete+recreate items in a transaction. If status changes to PAID, set paidDate to now. Redirect to `/invoices/{id}`.
    - `deleteInvoice(id: string)`: Only allow deletion of DRAFT invoices. Delete cascades to items. Redirect to `/invoices`.

    CRITICAL: All money math MUST use `new Decimal(value)` from `@/generated/prisma`. Never use JavaScript `+` or `*` on money values.
    CRITICAL: `redirect()` and `revalidatePath()` OUTSIDE try/catch (NEXT_REDIRECT pattern).
    CRITICAL: Handle P2002 (duplicate invoice number) and P2025 (not found) errors.

    **4. Create payroll server actions** at `src/app/(owner)/actions/payroll.ts`:

    Same pattern:
    - `createPayrollRecord(prevState: any, formData: FormData)`: Calculate `totalPay = basePay + bonuses - deductions` using Decimal.js. Create record. Redirect to `/payroll/{id}`.
    - `updatePayrollRecord(id: string, prevState: any, formData: FormData)`: Update record. If status changes to PAID, set paidAt to now. Redirect to `/payroll/{id}`.
    - `deletePayrollRecord(id: string)`: Only allow deletion of DRAFT records. Redirect to `/payroll`.
  </action>
  <verify>
    - `npx prisma migrate status` shows no pending migrations
    - `npx prisma generate` succeeds
    - `npx tsc --noEmit` passes for the new action and schema files (run from project root)
    - Verify the migration SQL file includes RLS policies for Customer, CustomerInteraction, Invoice, PayrollRecord
  </verify>
  <done>
    Migration applied with Invoice, InvoiceItem, PayrollRecord, Customer, CustomerInteraction tables. RLS enabled on all tables with tenantId. Zod schemas validate invoice items (description, quantity, unitPrice) and payroll fields (driverId, period dates, pay fields). Server actions handle full CRUD with Decimal.js money math, proper error handling (P2002, P2025), and NEXT_REDIRECT-safe redirect() placement.
  </done>
</task>

<task type="auto">
  <name>Task 2: Invoice UI - list page, form with line items editor, detail page, edit page</name>
  <files>
    src/components/invoices/invoice-form.tsx
    src/components/invoices/invoice-list.tsx
    src/components/invoices/invoice-items-editor.tsx
    src/components/invoices/delete-invoice-button.tsx
    src/app/(owner)/invoices/page.tsx
    src/app/(owner)/invoices/new/page.tsx
    src/app/(owner)/invoices/[id]/page.tsx
    src/app/(owner)/invoices/[id]/edit/page.tsx
  </files>
  <action>
    Follow the CRM module patterns EXACTLY for page structure, styling, and component patterns.

    **1. `src/components/invoices/invoice-list.tsx`** (client component):
    - Same table pattern as `customer-list.tsx`
    - Columns: Invoice #, Customer (if linked), Amount, Tax, Total, Status, Issue Date, Due Date
    - Status badges: DRAFT=gray, SENT=blue, PAID=green, OVERDUE=red, CANCELLED=gray-strikethrough
    - Link invoice number to `/invoices/{id}`
    - Empty state with Receipt icon and "No invoices yet" message
    - Format money with `$${Number(val).toLocaleString()}` (display only, not calculations)

    **2. `src/components/invoices/invoice-items-editor.tsx`** (client component):
    - `'use client'` with `useState` for managing items array
    - Props: `initialItems?: Array<{description, quantity, unitPrice, amount}>`, `onChange?: (itemsJson: string) => void`
    - Each item row: description input, quantity input (type="number" step="0.01"), unitPrice input (type="number" step="0.01"), calculated amount display, remove button
    - "Add Line Item" button appends empty item
    - Calculate item amount as `quantity * unitPrice` (using parseFloat for DISPLAY only)
    - Calculate subtotal as sum of all item amounts
    - Serialize items array to JSON string and store in a hidden input named `itemsJson`
    - Use the same inputClass styling pattern from customer-form

    **3. `src/components/invoices/invoice-form.tsx`** (client component):
    - `useActionState` pattern from customer-form
    - Sections: Invoice Details (invoiceNumber, status, issueDate, dueDate), Customer (optional select dropdown), Line Items (InvoiceItemsEditor), Tax, Notes
    - Pass `customers` prop for customer dropdown (optional field)
    - Hidden input `itemsJson` populated by InvoiceItemsEditor
    - Tax input (type="number" step="0.01")
    - Show calculated subtotal and total (subtotal + tax) at bottom
    - Error display: field-level errors from Zod + global error string

    **4. `src/components/invoices/delete-invoice-button.tsx`**:
    - Same pattern as `delete-customer-button.tsx` with confirm/cancel flow
    - Only show for DRAFT invoices

    **5. `src/app/(owner)/invoices/page.tsx`** (server component):
    - Query `prisma.invoice.findMany({ orderBy: { createdAt: 'desc' }, include: { items: true } })`
    - Stats cards: Total Invoices, Draft, Outstanding (SENT+OVERDUE total), Paid total
    - "New Invoice" button linking to `/invoices/new`
    - Render `<InvoiceList invoices={invoices} />`

    **6. `src/app/(owner)/invoices/new/page.tsx`**:
    - Fetch customers for dropdown: `prisma.customer.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: 'asc' } })`
    - Wrap in try/catch, default to empty array on failure
    - Auto-generate next invoice number: query latest invoice, parse number, increment (format: INV-0001, INV-0002, etc.). If no invoices exist, default to "INV-0001"
    - Render `<InvoiceForm action={createInvoice} customers={customers} nextInvoiceNumber={nextNumber} submitLabel="Create Invoice" />`

    **7. `src/app/(owner)/invoices/[id]/page.tsx`**:
    - Same layout as customer detail: back link, title (invoice number), status badge, edit/delete buttons
    - Info card: Customer, Issue Date, Due Date, Status, Notes
    - Line items table: Description, Qty, Unit Price, Amount
    - Summary: Subtotal, Tax, Total (bold)
    - `params: Promise<{ id: string }>` pattern (Next.js 16)

    **8. `src/app/(owner)/invoices/[id]/edit/page.tsx`**:
    - Same pattern as customer edit: fetch invoice with items, bind updateInvoice, render InvoiceForm with initialData
    - Pass items as initialItems to form
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Navigate to `/invoices` shows list page (may be empty)
    - Navigate to `/invoices/new` shows form with line items editor
    - All components follow existing Tailwind patterns (no custom CSS)
  </verify>
  <done>
    Complete Invoice UI: list page with stats and status filter badges, create page with dynamic line items editor (add/remove items, auto-calculate amounts), detail page showing invoice breakdown, edit page pre-populated with existing data. All money displayed with `$` formatting. DRAFT invoices can be deleted, non-DRAFT cannot.
  </done>
</task>

<task type="auto">
  <name>Task 3: Payroll UI - list page, form, detail page, edit page</name>
  <files>
    src/components/payroll/payroll-form.tsx
    src/components/payroll/payroll-list.tsx
    src/components/payroll/delete-payroll-button.tsx
    src/app/(owner)/payroll/page.tsx
    src/app/(owner)/payroll/new/page.tsx
    src/app/(owner)/payroll/[id]/page.tsx
    src/app/(owner)/payroll/[id]/edit/page.tsx
  </files>
  <action>
    Follow the same CRM/Invoice patterns for consistency.

    **1. `src/components/payroll/payroll-list.tsx`** (client component):
    - Table with columns: Driver Name, Period (Start - End), Base Pay, Bonuses, Deductions, Total Pay, Status
    - Status badges: DRAFT=gray, APPROVED=blue, PAID=green
    - Link driver name or period to `/payroll/{id}`
    - Empty state with DollarSign icon and "No payroll records yet" message
    - Format money with `$${Number(val).toLocaleString()}`

    **2. `src/components/payroll/payroll-form.tsx`** (client component):
    - `useActionState` pattern
    - Sections: Driver (required select dropdown), Pay Period (periodStart date, periodEnd date), Compensation (basePay, bonuses, deductions -- all type="number" step="0.01"), Performance (milesLogged integer, loadsCompleted integer), Status, Notes
    - Show calculated totalPay at bottom: basePay + bonuses - deductions (display calculation only)
    - Props: `action`, `initialData?`, `submitLabel`, `drivers` (array of {id, firstName, lastName})
    - Error display: field-level + global

    **3. `src/components/payroll/delete-payroll-button.tsx`**:
    - Same pattern as delete-customer-button, only for DRAFT status

    **4. `src/app/(owner)/payroll/page.tsx`** (server component):
    - Query `prisma.payrollRecord.findMany({ orderBy: { periodStart: 'desc' }, include: { driver: { select: { id: true, firstName: true, lastName: true } } } })`
    - Stats cards: Total Records, Draft, Approved, Total Paid (sum of PAID records totalPay)
    - "New Payroll Record" button linking to `/payroll/new`
    - Render `<PayrollList records={records} />`

    **5. `src/app/(owner)/payroll/new/page.tsx`**:
    - Fetch active drivers: `prisma.user.findMany({ where: { role: 'DRIVER', isActive: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } })`
    - Wrap in try/catch
    - Render `<PayrollForm action={createPayrollRecord} drivers={drivers} submitLabel="Create Payroll Record" />`

    **6. `src/app/(owner)/payroll/[id]/page.tsx`**:
    - Same layout pattern as invoice detail
    - Back link to `/payroll`
    - Driver name, period dates, status badge, edit/delete buttons
    - Pay breakdown card: Base Pay, + Bonuses, - Deductions, = Total Pay (bold)
    - Performance card: Miles Logged, Loads Completed
    - Notes if present
    - `params: Promise<{ id: string }>` pattern

    **7. `src/app/(owner)/payroll/[id]/edit/page.tsx`**:
    - Fetch record with driver include, fetch drivers list
    - Bind updatePayrollRecord, render PayrollForm with initialData
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Navigate to `/payroll` shows list page
    - Navigate to `/payroll/new` shows form with driver dropdown
    - All components use Tailwind classes consistent with CRM module
  </verify>
  <done>
    Complete Payroll UI: list page with driver names and pay period display, create page with driver selection and compensation breakdown, detail page showing full pay breakdown and performance metrics, edit page pre-populated. DRAFT records deletable, APPROVED/PAID not. Total pay auto-calculated from basePay + bonuses - deductions.
  </done>
</task>

</tasks>

<verification>
1. `npx prisma migrate status` -- no pending migrations
2. `npx tsc --noEmit` -- full project type-checks
3. Navigate to `/invoices` -- sees list page, can create/view/edit/delete DRAFT invoices
4. Navigate to `/payroll` -- sees list page, can create/view/edit/delete DRAFT payroll records
5. Sidebar links for Invoices and Payroll are active and highlighted correctly (already in sidebar.tsx)
6. All money fields display with $ formatting and Decimal.js used in server actions
</verification>

<success_criteria>
- Invoice CRUD fully functional: list with stats, create with dynamic line items, detail view, edit, delete (DRAFT only)
- Payroll CRUD fully functional: list with stats, create with driver selection, detail with pay breakdown, edit, delete (DRAFT only)
- Database migration applied with RLS on Invoice, PayrollRecord, Customer, CustomerInteraction tables
- All money math in server actions uses Decimal.js
- TypeScript compiles without errors
- UI consistent with existing CRM module patterns (same Tailwind classes, same page layouts, same component patterns)
</success_criteria>

<output>
After completion, create `.planning/quick/7-build-invoice-billing-ui-and-payroll-ui-/7-SUMMARY.md`
</output>
