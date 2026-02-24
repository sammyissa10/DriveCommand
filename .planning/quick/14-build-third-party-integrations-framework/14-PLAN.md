---
phase: quick-14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/app/(owner)/settings/integrations/page.tsx
  - src/app/(owner)/settings/integrations/integrations-manager.tsx
  - src/app/(owner)/actions/integrations.ts
  - src/components/navigation/sidebar.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can navigate to Settings > Integrations from sidebar"
    - "Integrations page shows toggle-based cards for ELD, accounting, factoring, and email categories"
    - "Each integration card shows name, description, category, enabled/disabled status, and a toggle to connect/disconnect"
    - "Enabling an integration stores a TenantIntegration row (provider, enabled=true, configJson={}) scoped to the tenant"
    - "Disabling an integration sets enabled=false on the existing row"
    - "QuickBooks and Samsara placeholder cards render with 'Coming Soon' callout when toggled (no real API call needed)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "TenantIntegration model"
      contains: "model TenantIntegration"
    - path: "src/app/(owner)/settings/integrations/page.tsx"
      provides: "Settings integrations page (server component)"
    - path: "src/app/(owner)/settings/integrations/integrations-manager.tsx"
      provides: "Client component: integration card grid with toggle"
    - path: "src/app/(owner)/actions/integrations.ts"
      provides: "Server actions: listIntegrations, toggleIntegration"
  key_links:
    - from: "integrations-manager.tsx"
      to: "/actions/integrations.ts"
      via: "toggleIntegration server action"
      pattern: "toggleIntegration"
    - from: "prisma/schema.prisma"
      to: "Tenant model"
      via: "tenantIntegrations relation"
      pattern: "tenantIntegrations"
---

<objective>
Build the third-party integrations framework: a TenantIntegration Prisma model plus a settings page
(/settings/integrations) with toggle-based integration cards for ELD, accounting, factoring, and
email provider categories.

Purpose: Gives fleet owners a single place to manage which external services their account is
connected to. v1 is the infrastructure only — real API calls are not needed; QuickBooks and Samsara
render as "Coming Soon" placeholders with the full card UI.

Output: TenantIntegration model in schema, RLS policy, listIntegrations/toggleIntegration server
actions, an IntegrationsManager client component with toggle cards, sidebar link under Settings.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md

Follow existing patterns from:
@src/app/(owner)/settings/expense-categories/page.tsx
@src/app/(owner)/actions/expense-categories.ts
@src/components/navigation/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: TenantIntegration Prisma model + migration</name>
  <files>prisma/schema.prisma</files>
  <action>
Add the following to prisma/schema.prisma:

1. New enum at the top with other enums:
```
enum IntegrationProvider {
  QUICKBOOKS
  SAMSARA
  KEEP_TRUCKIN
  TRIUMPH_FACTORING
  OTR_SOLUTIONS
  SENDGRID
  MAILGUN
}

enum IntegrationCategory {
  ACCOUNTING
  ELD
  FACTORING
  EMAIL
}
```

2. New model after Load model:
```
model TenantIntegration {
  id         String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String              @db.Uuid
  provider   IntegrationProvider
  category   IntegrationCategory
  enabled    Boolean             @default(false)
  configJson Json?               // JSONB: future API keys, webhook URLs, etc.
  createdAt  DateTime            @default(now()) @db.Timestamptz
  updatedAt  DateTime            @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, provider])
  @@index([tenantId])
}
```

3. Add `tenantIntegrations TenantIntegration[]` to the Tenant model relations list.

After editing schema, run:
```
npx prisma migrate dev --name add_tenant_integrations
```

If migration fails due to drift (shadow database error), run instead:
```
npx prisma db push
```

Then apply RLS policy via raw SQL in a migration or directly:
```sql
ALTER TABLE "TenantIntegration" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "TenantIntegration"
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);
```

Run this SQL with `npx prisma db execute --file ./prisma/rls-tenant-integrations.sql --schema prisma/schema.prisma`
(create the .sql file first). After migration, run `npx prisma generate` to regenerate the client.
  </action>
  <verify>
Run `npx prisma validate` — should output "Prisma schema validated successfully."
Run `npx prisma generate` — no errors.
Check DB: `npx prisma studio` (or psql) — TenantIntegration table exists with correct columns.
  </verify>
  <done>
TenantIntegration table exists in DB with tenantId, provider, category, enabled, configJson columns.
@@unique([tenantId, provider]) constraint in place. Prisma client regenerated.
  </done>
</task>

<task type="auto">
  <name>Task 2: Server actions and integrations settings page</name>
  <files>
    src/app/(owner)/actions/integrations.ts
    src/app/(owner)/settings/integrations/page.tsx
    src/app/(owner)/settings/integrations/integrations-manager.tsx
    src/components/navigation/sidebar.tsx
  </files>
  <action>
**File 1: `src/app/(owner)/actions/integrations.ts`**

Create server actions following the exact same pattern as expense-categories.ts:
- `'use server'` directive
- `requireRole([UserRole.OWNER, UserRole.MANAGER])` before every data access
- `getTenantPrisma()` and `requireTenantId()` from tenant-context
- `revalidatePath('/settings/integrations')` after mutations

Implement two actions:

`listIntegrations()` — returns all TenantIntegration rows for the tenant, ordered by category then provider. No error handling needed beyond auth check (it's a read with RLS).

`toggleIntegration(provider: IntegrationProvider, category: IntegrationCategory, enabled: boolean)` — upserts a TenantIntegration row using `prisma.tenantIntegration.upsert`:
- `where: { tenantId_provider: { tenantId, provider } }`
- `update: { enabled }`
- `create: { tenantId, provider, category, enabled, configJson: {} }`
- Returns `{ success: true }` or `{ error: string }`

**File 2: `src/app/(owner)/settings/integrations/page.tsx`**

Server component, same shape as expense-categories/page.tsx:
```tsx
import { listIntegrations } from '@/app/(owner)/actions/integrations';
import { IntegrationsManager } from './integrations-manager';

export default async function IntegrationsPage() {
  const integrations = await listIntegrations();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect DriveCommand to external services like ELDs, accounting software, and factoring companies.
        </p>
      </div>
      <IntegrationsManager initialIntegrations={integrations} />
    </div>
  );
}
```

**File 3: `src/app/(owner)/settings/integrations/integrations-manager.tsx`**

`'use client'` component. Define a static CATALOG array of integration definitions with shape:
```ts
type IntegrationDef = {
  provider: IntegrationProvider;
  category: IntegrationCategory;
  name: string;
  description: string;
  logoPlaceholder: string; // 2-letter abbrev, e.g. "QB"
  comingSoon: boolean;
};
```

CATALOG entries:
- { provider: 'QUICKBOOKS', category: 'ACCOUNTING', name: 'QuickBooks', description: 'Sync invoices, expenses, and payroll with QuickBooks Online.', logoPlaceholder: 'QB', comingSoon: true }
- { provider: 'SAMSARA', category: 'ELD', name: 'Samsara', description: 'Import GPS tracking, HOS logs, and safety events from Samsara.', logoPlaceholder: 'SA', comingSoon: true }
- { provider: 'KEEP_TRUCKIN', category: 'ELD', name: 'KeepTruckin', description: 'Sync driver HOS and vehicle tracking from KeepTruckin ELD.', logoPlaceholder: 'KT', comingSoon: true }
- { provider: 'TRIUMPH_FACTORING', category: 'FACTORING', name: 'Triumph Business Capital', description: 'Submit invoices for factoring and track funding status.', logoPlaceholder: 'TB', comingSoon: true }
- { provider: 'OTR_SOLUTIONS', category: 'FACTORING', name: 'OTR Solutions', description: 'Connect invoice factoring with OTR Solutions.', logoPlaceholder: 'OT', comingSoon: true }
- { provider: 'SENDGRID', category: 'EMAIL', name: 'SendGrid', description: 'Send transactional emails via SendGrid for load notifications and customer communications.', logoPlaceholder: 'SG', comingSoon: false }
- { provider: 'MAILGUN', category: 'EMAIL', name: 'Mailgun', description: 'Reliable email delivery for automated customer communications.', logoPlaceholder: 'MG', comingSoon: false }

Component logic:
- Use `useState` to track optimistic enabled state (initialize from `initialIntegrations` — map provider -> enabled)
- Group CATALOG by category, render each group as a section with a heading
- Each integration renders as a Card (use shadcn Card components) with:
  - Left: colored circle with logoPlaceholder initials (bg-blue-100 text-blue-700)
  - Middle: name (font-semibold), description (text-sm text-muted-foreground)
  - Right: if comingSoon → Badge variant="secondary" with text "Coming Soon"; else → Switch component (shadcn) bound to enabled state
- On Switch change: call `toggleIntegration(provider, category, newEnabled)` (import from actions). Show no loading state — fire-and-forget is fine for v1.
- If comingSoon is true and user clicks anywhere on the card, show a toast (use `sonner` toast): "Coming Soon — {name} integration is not yet available. Check back soon."

Category section headings use `text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3`.

**File 4: `src/components/navigation/sidebar.tsx`**

Add a Settings section at the bottom of SidebarContent (before SidebarFooter), visible only to OWNER (not MANAGER — settings are owner-only). Import `Settings` icon from lucide-react. Add:

```tsx
{userRole === UserRole.OWNER && (
  <SidebarGroup>
    <SidebarGroupLabel ...>Settings</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.startsWith('/settings/integrations')} tooltip="Integrations">
            <Link href="/settings/integrations"><Settings /><span>Integrations</span></Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)}
```
  </action>
  <verify>
Run `npx tsc --noEmit` — no TypeScript errors.
Visit http://localhost:3000/settings/integrations — page renders with grouped integration cards.
Toggle a non-comingSoon integration (SendGrid) — network request fires, DB row upserted (check via Prisma Studio or psql).
Click a "Coming Soon" card — sonner toast appears.
  </verify>
  <done>
/settings/integrations loads without errors. Integration cards show in 4 categories (ELD, Accounting, Factoring, Email). Non-comingSoon integrations have functional Switch toggles backed by TenantIntegration upsert. Coming Soon cards show badge and toast on click. Sidebar has Settings > Integrations link for OWNER role.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npx prisma validate` passes
3. Navigate to /settings/integrations — page loads, 7 integration cards across 4 categories render
4. Toggle SendGrid or Mailgun — row appears/updates in TenantIntegration table
5. Click QuickBooks card — "Coming Soon" toast appears
6. Sidebar shows Integrations link under Settings for OWNER user
7. MANAGER user does NOT see the sidebar Settings link
</verification>

<success_criteria>
TenantIntegration model in DB with RLS, toggle-based settings UI at /settings/integrations with 7
integration cards in 4 categories, upsert server action for enabling/disabling, sidebar navigation
for OWNER, and "Coming Soon" placeholders with toast for integrations not yet implemented.
</success_criteria>

<output>
After completion, create `.planning/quick/14-build-third-party-integrations-framework/14-SUMMARY.md`
following the summary template.
</output>
