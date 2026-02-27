---
phase: quick-37
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/navigation/sidebar.tsx
  - src/app/(owner)/invoices/[id]/page.tsx
  - src/app/(owner)/actions/invoices.ts
  - src/components/invoices/mark-as-paid-button.tsx
autonomous: true
must_haves:
  truths:
    - "Sidebar Settings section shows Expense Categories and Expense Templates links"
    - "Sidebar Management section no longer shows duplicate Maintenance link"
    - "Invoice detail page hides Edit button when status is PAID or CANCELLED"
    - "Invoice detail page shows Mark as Paid button only when status is SENT"
    - "Clicking Mark as Paid transitions invoice from SENT to PAID with paidDate set"
  artifacts:
    - path: "src/components/navigation/sidebar.tsx"
      provides: "Updated sidebar with expense settings links, no Maintenance duplicate"
    - path: "src/app/(owner)/invoices/[id]/page.tsx"
      provides: "Conditional Edit button and Mark as Paid button"
    - path: "src/app/(owner)/actions/invoices.ts"
      provides: "markInvoicePaid server action"
    - path: "src/components/invoices/mark-as-paid-button.tsx"
      provides: "Client component for Mark as Paid with confirmation"
  key_links:
    - from: "src/components/invoices/mark-as-paid-button.tsx"
      to: "src/app/(owner)/actions/invoices.ts"
      via: "markInvoicePaid server action import"
      pattern: "markInvoicePaid"
    - from: "src/app/(owner)/invoices/[id]/page.tsx"
      to: "src/components/invoices/mark-as-paid-button.tsx"
      via: "component import"
      pattern: "MarkAsPaidButton"
---

<objective>
Fix four audit issues: add missing sidebar links for expense settings pages, remove the duplicate Maintenance nav item, hide Edit on paid/cancelled invoices, and add a Mark as Paid quick action button.

Purpose: Clean up navigation inconsistencies and add missing invoice workflow action.
Output: Updated sidebar, invoice detail page with conditional buttons, new markInvoicePaid server action.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/navigation/sidebar.tsx
@src/app/(owner)/invoices/[id]/page.tsx
@src/app/(owner)/actions/invoices.ts
@src/components/invoices/delete-invoice-button.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix sidebar — add expense settings links, remove Maintenance duplicate</name>
  <files>src/components/navigation/sidebar.tsx</files>
  <action>
    1. In the Settings section (OWNER-only, lines 358-381), add two new SidebarMenuItem entries BEFORE the existing Integrations link:
       - Expense Categories: href="/settings/expense-categories", icon=Tag (already imported), tooltip="Expense Categories", isActive=pathname.startsWith('/settings/expense-categories')
       - Expense Templates: href="/settings/expense-templates", icon=FileSpreadsheet (already imported), tooltip="Expense Templates", isActive=pathname.startsWith('/settings/expense-templates')

    2. In the Management section, REMOVE the entire Maintenance SidebarMenuItem (lines 340-354) — the one with Wrench icon that links to /trucks. There is no fleet-wide maintenance page; per-truck maintenance is accessed via /trucks/[id]/maintenance from the truck detail page.

    3. Also remove the complex isActive condition on the Trucks link (line 295: `&& !pathname.includes("/maintenance")`) since there is no longer a Maintenance nav item to disambiguate. Simplify to just `pathname.startsWith("/trucks")`.

    4. Remove the Wrench import from lucide-react since it is no longer used.
  </action>
  <verify>Run `npx tsc --noEmit 2>&1 | head -20` to confirm no TypeScript errors in sidebar.</verify>
  <done>Settings section has 3 links (Expense Categories, Expense Templates, Integrations). Management section has Trucks, Drivers, Routes, Tags (no Maintenance). No unused imports.</done>
</task>

<task type="auto">
  <name>Task 2: Invoice detail — conditional Edit button and Mark as Paid action</name>
  <files>
    src/app/(owner)/invoices/[id]/page.tsx
    src/app/(owner)/actions/invoices.ts
    src/components/invoices/mark-as-paid-button.tsx
  </files>
  <action>
    **Server action (actions/invoices.ts):**
    Add a new `markInvoicePaid` server action:
    - Signature: `export async function markInvoicePaid(id: string)`
    - requireRole([UserRole.OWNER, UserRole.MANAGER])
    - Fetch invoice, verify status === 'SENT' (return error if not)
    - Update: `status: 'PAID', paidDate: new Date()`
    - revalidatePath('/invoices')
    - redirect(`/invoices/${id}`)
    - Wrap in try/catch, handle P2025 (not found)

    **Client component (mark-as-paid-button.tsx):**
    Create a client component `MarkAsPaidButton` that:
    - Props: `{ invoiceId: string, markPaidAction: (id: string) => Promise<any> }`
    - Renders a green-styled button with DollarSign icon and "Mark as Paid" text
    - Uses useTransition for pending state (disable button, show "Processing..." text)
    - Calls markPaidAction(invoiceId) on click
    - Style: `bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm` (consistent with existing button styling on the page)
    - Pattern: follow the same prop-passing pattern as DeleteInvoiceButton (pass server action as prop from server component)

    **Invoice detail page (invoices/[id]/page.tsx):**
    - Import MarkAsPaidButton and markInvoicePaid
    - Wrap the Edit link in a conditional: only render when `invoice.status !== 'PAID' && invoice.status !== 'CANCELLED'`
    - Add MarkAsPaidButton next to the Edit/Delete buttons, only render when `invoice.status === 'SENT'`
    - Pass markInvoicePaid as the markPaidAction prop
  </action>
  <verify>Run `npx tsc --noEmit 2>&1 | head -20` to confirm no TypeScript errors across all three files.</verify>
  <done>Edit button hidden on PAID/CANCELLED invoices. Mark as Paid button visible only on SENT invoices. markInvoicePaid server action transitions SENT to PAID with paidDate. TypeScript compiles clean.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Sidebar renders Settings section with Expense Categories, Expense Templates, Integrations
- Sidebar Management section has no Maintenance item
- Invoice detail for DRAFT invoice: shows Edit, no Mark as Paid
- Invoice detail for SENT invoice: shows Edit + Mark as Paid
- Invoice detail for PAID invoice: no Edit, no Mark as Paid
- Invoice detail for CANCELLED invoice: no Edit, no Mark as Paid
</verification>

<success_criteria>
All four audit issues resolved: expense settings reachable from sidebar, no duplicate Maintenance link, Edit hidden on terminal invoices, Mark as Paid available on SENT invoices.
</success_criteria>

<output>
After completion, create `.planning/quick/37-fix-audit-issues-sidebar-links-for-expen/37-SUMMARY.md`
</output>
