---
phase: quick-43
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(admin)/actions/tenants.ts
  - src/app/(admin)/tenants/tenant-list-client.tsx
autonomous: true
must_haves:
  truths:
    - "Newly created tenants show as Pending in the admin tenant list"
    - "Tenants whose owner has accepted the invitation show as Active"
    - "Suspended tenants still show as Suspended regardless of owner status"
  artifacts:
    - path: "src/app/(admin)/actions/tenants.ts"
      provides: "getAllTenants returns ownerSetupComplete boolean per tenant"
    - path: "src/app/(admin)/tenants/tenant-list-client.tsx"
      provides: "Three-state status badge: Pending / Active / Suspended"
  key_links:
    - from: "src/app/(admin)/actions/tenants.ts"
      to: "prisma.user"
      via: "check for OWNER-role user in tenant"
      pattern: "role.*OWNER"
---

<objective>
Show tenants as "Pending" until the owner accepts their invitation and completes account setup (sets password), then show "Active". Suspended tenants remain "Suspended".

Purpose: Admin can see at a glance which tenants have completed onboarding vs which are still waiting for owner setup.
Output: Updated tenant list with three-state status display.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(admin)/actions/tenants.ts
@src/app/(admin)/tenants/tenant-list-client.tsx
@src/app/(admin)/tenants/page.tsx
@src/app/api/auth/accept-invitation/route.ts
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add owner setup status to getAllTenants query</name>
  <files>src/app/(admin)/actions/tenants.ts</files>
  <action>
Modify the `getAllTenants` function to also query whether each tenant has an OWNER-role user (indicating the owner has completed setup).

In the `select` clause of `prisma.tenant.findMany`, add a nested select on `users`:

```ts
users: {
  where: { role: 'OWNER' },
  select: { id: true },
  take: 1,
},
```

Then map the results to add a computed `ownerSetupComplete: boolean` field:

```ts
return tenants.map(({ users: ownerUsers, ...rest }) => ({
  ...rest,
  ownerSetupComplete: ownerUsers.length > 0,
}));
```

This avoids any schema changes. The logic: if a User with role OWNER exists for the tenant, the owner has accepted the invitation and completed setup. If not, the tenant is still pending.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors in the modified file.</verify>
  <done>getAllTenants returns an ownerSetupComplete boolean for each tenant.</done>
</task>

<task type="auto">
  <name>Task 2: Update tenant list to show Pending / Active / Suspended status</name>
  <files>src/app/(admin)/tenants/tenant-list-client.tsx</files>
  <action>
Update the `Tenant` type to include `ownerSetupComplete: boolean`.

Replace the Status column cell renderer (currently lines 96-109) with three-state logic:

```ts
{
  accessorKey: 'isActive',
  header: 'Status',
  cell: ({ row }) => {
    const tenant = row.original;
    let label: string;
    let classes: string;

    if (!tenant.isActive) {
      label = 'Suspended';
      classes = 'bg-red-100 text-red-800';
    } else if (!tenant.ownerSetupComplete) {
      label = 'Pending';
      classes = 'bg-yellow-100 text-yellow-800';
    } else {
      label = 'Active';
      classes = 'bg-green-100 text-green-800';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
        {label}
      </span>
    );
  },
},
```

Priority order: Suspended (isActive=false) takes precedence over Pending. This ensures an admin who suspends a pending tenant sees "Suspended", not "Pending".
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Then run `npm run build` to verify the page compiles and renders correctly.</verify>
  <done>Tenant list shows three statuses: Pending (yellow badge) for tenants without an owner user, Active (green badge) for tenants with an owner user, Suspended (red badge) for deactivated tenants.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- `npm run build` succeeds
- Newly created tenants (no owner user yet) display "Pending" yellow badge
- Tenants where owner accepted invitation display "Active" green badge
- Suspended tenants display "Suspended" red badge regardless of owner status
</verification>

<success_criteria>
Admin tenant management page shows three-state status: Pending (owner has not yet accepted invitation), Active (owner setup complete), Suspended (admin disabled). No database migration required.
</success_criteria>

<output>
After completion, create `.planning/quick/43-change-tenant-status-to-pending-until-ow/43-SUMMARY.md`
</output>
