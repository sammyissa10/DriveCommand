---
phase: quick-60
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/app/(owner)/actions/invoices.ts
  - src/app/(owner)/loads/[id]/page.tsx
  - src/app/(owner)/invoices/new/page.tsx
  - src/components/invoices/invoice-form.tsx
autonomous: true

must_haves:
  truths:
    - "Invoice model has optional loadId FK linking to Load"
    - "Load detail page shows Invoices section with linked invoices (number, status, amount, due date)"
    - "Load detail page shows Create Invoice button when status is DELIVERED or INVOICED"
    - "Create Invoice from load navigates to /invoices/new with pre-filled customer, rate, and load number"
    - "Existing invoices without loadId continue to work (nullable FK)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "loadId field on Invoice model with FK to Load, invoices relation on Load"
      contains: "loadId"
    - path: "src/app/(owner)/loads/[id]/page.tsx"
      provides: "Invoices section on load detail with create button"
    - path: "src/app/(owner)/invoices/new/page.tsx"
      provides: "Query param pre-fill support for loadId, customerId, amount, loadNumber"
    - path: "src/app/(owner)/actions/invoices.ts"
      provides: "loadId handling in createInvoice action"
  key_links:
    - from: "src/app/(owner)/loads/[id]/page.tsx"
      to: "/invoices/new"
      via: "Link with query params (loadId, customerId, amount, loadNumber)"
      pattern: "loadId.*customerId.*amount"
    - from: "src/app/(owner)/actions/invoices.ts"
      to: "prisma.invoice.create"
      via: "loadId field in create data"
      pattern: "loadId"
---

<objective>
Link invoices to loads by adding an optional loadId FK to the Invoice model, displaying linked invoices on the Load detail page, and enabling invoice creation directly from a load with pre-filled data.

Purpose: Closes the invoice-to-load traceability gap -- owners can see which loads have been invoiced and create invoices without re-entering load data.
Output: Schema updated, load detail page shows invoices section, create invoice pre-fills from load context.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma (Invoice model ~line 709, Load model ~line 853)
@src/app/(owner)/loads/[id]/page.tsx (load detail server component)
@src/app/(owner)/actions/invoices.ts (createInvoice server action)
@src/app/(owner)/invoices/new/page.tsx (new invoice page)
@src/components/invoices/invoice-form.tsx (InvoiceForm component with initialData prop)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add loadId FK to Invoice schema and push</name>
  <files>prisma/schema.prisma</files>
  <action>
    Add to the Invoice model (after the routeId field):
    - `loadId String? @db.Uuid` -- optional FK to Load
    - Add relation: `load Load? @relation(fields: [loadId], references: [id])`
    - Add index: add `loadId` to the existing indexes or add `@@index([loadId])`

    Add to the Load model (after the existing relations, before closing brace):
    - `invoices Invoice[]` -- reverse relation

    Run `npx prisma db push` to apply the schema change.
    Run `npx prisma generate` to regenerate the client.

    The loadId is nullable so existing invoices are unaffected.
  </action>
  <verify>
    `npx prisma db push` completes without error.
    `npx prisma generate` completes without error.
    Grep schema.prisma for "loadId" confirms field exists on Invoice model.
  </verify>
  <done>Invoice model has optional loadId FK to Load, Prisma client regenerated, database schema updated.</done>
</task>

<task type="auto">
  <name>Task 2: Wire loadId through invoice creation and pre-fill from load</name>
  <files>
    src/app/(owner)/actions/invoices.ts
    src/app/(owner)/invoices/new/page.tsx
    src/components/invoices/invoice-form.tsx
  </files>
  <action>
    **Server action (actions/invoices.ts):**
    - In createInvoice, read `loadId` from formData: `const loadId = (formData.get('loadId') as string) || '';`
    - Add `loadId: result.data.loadId || null` to the prisma.invoice.create data object (same pattern as routeId).
    - Update the rawData object to include `loadId`.
    - In the invoice validation schema file (src/lib/validations/invoice.schemas.ts), add `loadId: z.string().uuid().optional().or(z.literal(''))` to invoiceCreateSchema (same pattern as routeId).

    **New invoice page (invoices/new/page.tsx):**
    - Accept searchParams prop: `{ searchParams }: { searchParams: Promise<{ loadId?: string; customerId?: string; amount?: string; loadNumber?: string }> }`
    - Await searchParams and extract query params.
    - Pass pre-fill data to InvoiceForm via initialData prop:
      - `customerId` from query param
      - Add a single line item with description "Freight - Load #[loadNumber]", quantity 1, unitPrice from amount param
    - Pass loadId as a new prop to InvoiceForm.

    **InvoiceForm component (invoice-form.tsx):**
    - Add optional `loadId?: string` prop to InvoiceFormProps.
    - Render a hidden input: `<input type="hidden" name="loadId" value={loadId || ''} />` inside the form, near the existing hidden fields.
    - If loadId is present, show a small info banner above the form: "Creating invoice for Load #[loadNumber]" with a link back to the load. Accept optional `loadNumber?: string` prop for this.

    Also revalidate the load detail path after invoice creation:
    - In createInvoice action, after `revalidatePath('/invoices')`, add `revalidatePath('/loads')` so the load detail page reflects the new invoice.
  </action>
  <verify>
    `npx next build` (or `npx tsc --noEmit`) passes without type errors.
    Navigate to /invoices/new?loadId=test&customerId=test&amount=1500&loadNumber=LD-0001 and confirm the form pre-fills.
  </verify>
  <done>
    Creating an invoice with a loadId persists the FK to the database.
    /invoices/new accepts loadId, customerId, amount, loadNumber query params and pre-fills the form.
    Hidden loadId field submitted with form data.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Invoices section to Load detail page</name>
  <files>src/app/(owner)/loads/[id]/page.tsx</files>
  <action>
    In the Load detail page server component:

    1. After fetching the load, query linked invoices:
       ```
       const invoices = await prisma.invoice.findMany({
         where: { loadId: id },
         select: { id: true, invoiceNumber: true, status: true, totalAmount: true, dueDate: true },
         orderBy: { createdAt: 'desc' },
       });
       ```

    2. Add an "Invoices" section after the info grid and before the Audit Trail section. Use a card layout matching the existing design (rounded-lg border border-border bg-card p-5):

       - Section header: "Invoices" with FileText icon from lucide-react
       - If invoices exist, render a compact table/list showing for each:
         - Invoice number (linked to /invoices/[id])
         - Status badge (use inline colored badge: DRAFT=gray, SENT=blue, PAID=green, OVERDUE=red, CANCELLED=gray)
         - Total amount (formatted as currency)
         - Due date (formatted)
       - If no invoices, show empty state text: "No invoices linked to this load"

    3. Add "Create Invoice" button visible only when load.status is 'DELIVERED' or 'INVOICED':
       - Link to `/invoices/new?loadId=${id}&customerId=${load.customerId}&amount=${Number(load.rate)}&loadNumber=${load.loadNumber}`
       - Style: primary button with Plus icon, placed in the section header area
       - Use the same button styling pattern as elsewhere on the page

    4. Import FileText and Plus from lucide-react (add to existing import).
  </action>
  <verify>
    `npx tsc --noEmit` passes.
    Load detail page renders without errors.
    When load status is DELIVERED, the Create Invoice button appears and links to the correct pre-filled URL.
    When load has linked invoices, they appear in the Invoices section with number, status, amount, due date.
  </verify>
  <done>
    Load detail page shows Invoices section listing linked invoices.
    Create Invoice button appears for DELIVERED and INVOICED loads.
    Button navigates to /invoices/new with correct query params pre-filling the form.
  </done>
</task>

</tasks>

<verification>
1. Schema: `loadId` field exists on Invoice model, nullable, FK to Load
2. Load detail page: Invoices section visible with linked invoices listed
3. Load detail page: Create Invoice button appears only for DELIVERED/INVOICED loads
4. Create Invoice from load: form pre-fills customer, rate as line item, load number in description
5. Submitting the pre-filled invoice persists the loadId FK
6. Existing invoices (without loadId) continue to display and function normally
7. `npx tsc --noEmit` and `npx next build` pass
</verification>

<success_criteria>
- Invoice model has optional loadId FK; existing data unaffected
- Load detail page shows invoices section with create button (DELIVERED/INVOICED only)
- Creating invoice from load pre-fills customer, amount, load number and saves loadId FK
- All type checks pass
</success_criteria>

<output>
After completion, create `.planning/quick/60-tkt-0019-link-invoices-to-loads/60-SUMMARY.md`
</output>
