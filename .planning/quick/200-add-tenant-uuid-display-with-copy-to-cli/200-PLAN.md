---
phase: quick-200
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(admin)/tenants/[id]/copy-tenant-id-button.tsx
  - apps/web/src/app/(admin)/tenants/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Sysadmin can see the tenant UUID on the tenant detail page"
    - "Sysadmin can copy the tenant UUID to clipboard with one click"
    - "A brief 'Copied!' confirmation appears after copying"
  artifacts:
    - path: "apps/web/src/app/(admin)/tenants/[id]/copy-tenant-id-button.tsx"
      provides: "Client component for copy-to-clipboard behavior"
    - path: "apps/web/src/app/(admin)/tenants/[id]/page.tsx"
      provides: "Tenant detail page with UUID display"
  key_links:
    - from: "page.tsx"
      to: "copy-tenant-id-button.tsx"
      via: "import and render with tenant.id prop"
      pattern: "CopyTenantIdButton.*tenant\\.id"
---

<objective>
Add a "Tenant ID" field displaying the full UUID with a copy-to-clipboard button to the sysadmin tenant detail page.

Purpose: Sysadmins need to reference tenant UUIDs for debugging, API calls, and database queries. Currently the UUID is not visible on the detail page.
Output: Updated tenant detail page with copyable UUID field.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(admin)/tenants/[id]/page.tsx
@apps/web/src/components/loads/copy-tracking-link.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create CopyTenantIdButton client component and add Tenant ID field to detail page</name>
  <files>
    apps/web/src/app/(admin)/tenants/[id]/copy-tenant-id-button.tsx
    apps/web/src/app/(admin)/tenants/[id]/page.tsx
  </files>
  <action>
1. Create `copy-tenant-id-button.tsx` as a 'use client' component:
   - Props: `{ tenantId: string }`
   - Renders a button with a Copy icon (use `Copy` and `Check` from lucide-react)
   - On click: copy `tenantId` to clipboard via `navigator.clipboard.writeText()`
   - After copy: swap icon to Check and show "Copied!" text for 2 seconds, then revert
   - Use `useState` for the copied state, `setTimeout` to reset
   - Use `toast.success('Tenant ID copied!')` from sonner as the confirmation (matches existing pattern from copy-tracking-link.tsx)
   - Style the button small and inline: `text-gray-400 hover:text-gray-600 transition-colors p-1 rounded`

2. In `page.tsx`, add a "Tenant ID" row in the "Read-only metadata" grid (lines 110-125), between the existing `TenantEditForm` and the Status/Created grid:
   - Add a new `div` with `border-t pt-4` before the existing grid
   - Label: `<p className="text-gray-500 text-sm">Tenant ID <span className="text-gray-400">(read-only)</span></p>`
   - Value: display `tenant.id` in a `font-mono text-sm text-gray-900` span
   - Place the `CopyTenantIdButton` inline next to the UUID
   - Import `CopyTenantIdButton` from `./copy-tenant-id-button`

Layout should be: label on top, then UUID + copy button on the same line below, using `flex items-center gap-2`.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web — must pass with zero errors. Visually confirm the Tenant ID field appears in the Tenant Info card between the editable name/slug form and the Status/Created metadata row.
  </verify>
  <done>
Tenant detail page shows the full UUID labeled "Tenant ID (read-only)" with a copy button. Clicking the button copies the UUID and shows a toast confirmation. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes
- Tenant detail page at `/admin/tenants/[id]` displays the tenant UUID in the Tenant Info card
- Copy button copies UUID to clipboard and shows toast
</verification>

<success_criteria>
- Tenant UUID is visible on the sysadmin tenant detail page
- One-click copy to clipboard works with "Copied!" toast feedback
- No TypeScript errors
- No other pages or components modified
- No new API routes added
</success_criteria>

<output>
After completion, create `.planning/quick/200-add-tenant-uuid-display-with-copy-to-cli/200-SUMMARY.md`
</output>
