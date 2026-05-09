---
phase: quick-293
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/_doc-catalog.json
  - apps/web/src/lib/docs/feature-registry.ts
  - apps/web/src/lib/docs/feature-registry-schema.ts
  - docs-content/_ia.json
  - docs-content/client/*.mdx
  - docs-content/sysadmin/*.mdx
  - apps/web/src/app/(owner)/help/page.tsx
  - apps/web/src/app/(admin)/docs/page.tsx
autonomous: true

must_haves:
  truths:
    - "Feature registry contains all 45-55 shipped features across 4 portals"
    - "Every stable feature has both client MDX and sysadmin MDX documentation"
    - "Help Center home page displays features grouped by hub categories from _ia.json"
    - "SysAdmin docs page displays features grouped by hub categories from _ia.json"
    - "CI drift check passes with zero missing docs"
  artifacts:
    - path: "apps/web/scripts/_doc-catalog.json"
      provides: "Codebase reconnaissance output - temp file"
    - path: "apps/web/src/lib/docs/feature-registry.ts"
      provides: "Complete feature registry with 45-55 entries"
      contains: "rawFeatures"
    - path: "docs-content/_ia.json"
      provides: "Information architecture hub-and-spoke layout"
    - path: "docs-content/client/*.mdx"
      provides: "Client-facing MDX docs for all features"
    - path: "docs-content/sysadmin/*.mdx"
      provides: "Sysadmin technical MDX docs for all features"
  key_links:
    - from: "apps/web/src/lib/docs/feature-registry.ts"
      to: "docs-content/client/*.mdx"
      via: "slug matching"
      pattern: "slug.*requiresClientDoc"
    - from: "apps/web/src/lib/docs/feature-registry.ts"
      to: "docs-content/sysadmin/*.mdx"
      via: "slug matching"
      pattern: "slug.*requiresSysadminDoc"
    - from: "apps/web/src/app/(owner)/help/page.tsx"
      to: "docs-content/_ia.json"
      via: "JSON import for hub structure"
---

<objective>
Auto-generate complete feature registry and documentation across all DriveCommand surfaces.

Purpose: Populate the feature registry with every shipped feature (45-55 total across owner, driver, admin, and shared portals), then generate Apple-grade MDX documentation for both client Help Center and sysadmin Knowledge Base.

Output:
- Complete feature registry with all shipped features
- Client MDX docs for each feature requiring client docs
- Sysadmin MDX docs for each feature requiring sysadmin docs
- Information architecture JSON for hub-and-spoke navigation
- Updated home pages reading from _ia.json
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/docs/feature-registry.ts
@apps/web/src/lib/docs/feature-registry-schema.ts
@apps/web/docs/modules.md
@apps/web/src/components/navigation/sidebar.tsx
@docs-content/client/_template.mdx
@docs-content/sysadmin/_template.mdx
@apps/web/src/app/(owner)/help/page.tsx
@apps/web/src/app/(admin)/docs/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Codebase Reconnaissance — Build Feature Catalog</name>
  <files>apps/web/scripts/_doc-catalog.json</files>
  <action>
Walk the codebase to identify ALL shipped user-facing features. Read these sources:

1. **Owner Portal Routes** (`apps/web/src/app/(owner)/`):
   - dashboard, ai-documents, compliance, crm, drivers, fuel, help, ifta, invoices, lane-analytics, live-map, loads, payroll, profit-predictor, routes, safety, settings/*, subscription, support, tags, trucks
   - Carrier sub-routes (`carrier/`): dashboard, clients, contracts, dispatches, facilities, fleet/drivers, fleet/trucks, loads, messages, reports/revenue, reports/driver-pay, reports/aging, reports/performance, stops, templates

2. **Driver Portal Routes** (`apps/web/src/app/(driver)/`):
   - home, hours, incidents, messages, more, my-load, my-route, my-tickets, tasks

3. **Admin Portal Routes** (`apps/web/src/app/(admin)/`):
   - admin-dashboard, admin-support, automations, billing, docs, plans, promos, tenants

4. **Checklists/Workflows** (`apps/web/src/app/(owner)/checklists/`):
   - Main page, automation, analytics, instances, playbooks

5. **Sidebar Navigation** (`apps/web/src/components/navigation/sidebar.tsx`):
   - Use sidebar groups as category hints: Intelligence, Carrier Ops, Workflows, Business, Settings, Support

6. **Existing modules.md** (`apps/web/docs/modules.md`):
   - Cross-reference the 22 documented modules as a baseline

For each detected feature, record:
- `route`: The URL path (e.g., `/carrier/dispatches`)
- `files`: Key files (page.tsx, actions/, components)
- `name`: Human-readable name
- `category`: One of: fleet, dispatch, finance, crm, compliance, ai, reporting, integrations, admin, support, settings, workflows
- `portal`: One of: owner, driver, admin, shared
- `roleGuard`: Detected role requirements (OWNER, MANAGER, DRIVER)
- `prismaModels`: Models touched (infer from imports/actions)
- `mobileCounterpart`: If mobile app has matching screen
- `status`: stable (shipped and working)

Write output to `apps/web/scripts/_doc-catalog.json` (this is a temp file for the next task).
Add `_doc-catalog.json` to `.gitignore` if not already there.

Expected: 45-55 feature entries covering:
- ~25 owner portal features (including carrier ops and settings)
- ~8 driver portal features
- ~8 admin portal features
- ~5 shared/workflows features
  </action>
  <verify>
`cat apps/web/scripts/_doc-catalog.json | jq length` returns 45-55
File contains entries for key features: carrier-dispatches, carrier-loads, checklists, driver-hos, tenant-management
  </verify>
  <done>
Catalog JSON exists with 45-55 feature entries, each with route/name/category/portal/status
  </done>
</task>

<task type="auto">
  <name>Task 2: Expand Feature Registry Schema</name>
  <files>apps/web/src/lib/docs/feature-registry-schema.ts</files>
  <action>
Update the category schema to include 'workflows' category (for checklists/playbooks):

```typescript
export const categorySchema = z.enum([
  'fleet',
  'dispatch',
  'finance',
  'crm',
  'compliance',
  'ai',
  'reporting',
  'integrations',
  'admin',
  'support',
  'settings',
  'workflows',  // ADD THIS
]);
```

This ensures checklists, playbooks, and automation features have a proper category.
  </action>
  <verify>
`grep -c "workflows" apps/web/src/lib/docs/feature-registry-schema.ts` returns 1
TypeScript compiles: `cd apps/web && npx tsc --noEmit`
  </verify>
  <done>
Category schema includes 'workflows' enum value
  </done>
</task>

<task type="auto">
  <name>Task 3: Populate Complete Feature Registry</name>
  <files>apps/web/src/lib/docs/feature-registry.ts</files>
  <action>
Replace the `rawFeatures` array with ALL features from the catalog. Group features logically:

**OWNER PORTAL - Carrier Ops (~12 features):**
- carrier-dashboard: Carrier operations dashboard with KPIs
- carrier-clients: Client/shipper management
- carrier-contracts: Contract management with templates
- carrier-dispatches: Dispatch board with ready-to-dispatch workflow
- carrier-loads: Load management with status workflow
- carrier-fleet-drivers: Driver list with compliance tracking
- carrier-fleet-trucks: Truck fleet management
- carrier-facilities: Facility/yard management
- carrier-messages: Fleet messaging (iMessage-style)
- carrier-stops: Stop management
- carrier-templates: Dispatch and route templates
- carrier-reports: Revenue, driver pay, AR aging, performance reports

**OWNER PORTAL - Intelligence (~3 features):**
- live-map: Real-time GPS truck tracking
- lane-analytics: Profitability by route lane
- profit-predictor: AI-powered load profitability analysis

**OWNER PORTAL - Workflows (~4 features):**
- checklists: Checklist and workflow management
- playbook-builder: Visual playbook/checklist builder
- workflow-automation: Trigger-based automation rules
- workflow-analytics: Workflow completion analytics

**OWNER PORTAL - Business (~1 feature):**
- ai-document-reader: AI extraction from rate confirmations

**OWNER PORTAL - Finance (~3 features):**
- invoices: Trucking-standard invoicing with FSC
- payroll: Driver payroll management
- fuel-dashboard: Fuel economy tracking

**OWNER PORTAL - Compliance (~2 features):**
- compliance-dashboard: Document expiry tracking
- ifta-reporting: IFTA quarterly fuel tax

**OWNER PORTAL - Settings (~5 features):**
- team-permissions: RBAC team management
- subscription: Plan management
- expense-categories: Expense category configuration
- expense-templates: Recurring expense templates
- integrations: Third-party integrations (ELD, accounting)

**OWNER PORTAL - Legacy/CRM (~4 features):**
- trucks: Legacy truck management
- drivers: Legacy driver management with invites
- routes: Multi-stop route planning
- crm: Customer relationship management

**DRIVER PORTAL (~8 features):**
- driver-dashboard: Driver home with active load
- driver-my-load: Current load status management
- driver-my-route: Route view with stop timeline
- driver-hours: Hours of Service logging
- driver-incidents: Incident reporting with photos
- driver-messages: Driver-dispatcher messaging
- driver-tasks: Workflow task completion
- driver-documents: Document upload/view

**ADMIN PORTAL (~8 features):**
- tenant-management: Multi-tenant administration
- admin-support: Cross-tenant support queue
- admin-billing: SysAdmin invoicing to tenants
- admin-plans: Subscription plan management
- admin-promos: Promotional code management
- admin-automations: Platform-wide automation rules
- admin-docs: Technical knowledge base
- admin-dashboard: Platform metrics dashboard

**SHARED (~2 features):**
- support-tickets: In-app support with screenshots
- shipment-tracking: Public tracking page (/track/[token])

For each feature entry:
- `slug`: kebab-case unique identifier
- `name`: Human-readable title
- `shortDescription`: Max 160 chars, explains what user can do
- `portal`: owner | driver | admin | shared
- `category`: From schema enum
- `planTier`: free | starter | pro | business | enterprise
- `status`: stable
- `route`: Primary URL path
- `addedInVersion`: Use '1.0.0' for v1 features, '2.0.0' for mobile, etc.
- `lastDocReviewedAt`: Use today's date ISO string
- `relatedFeatureSlugs`: Array of related feature slugs
- `requiresClientDoc`: true unless admin-only
- `requiresSysadminDoc`: true for all
- `serverActionPaths`: Optional array of action file paths
- `prismaModels`: Optional array of Prisma model names
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` passes
`grep -c "slug:" apps/web/src/lib/docs/feature-registry.ts` returns 45-55
All relatedFeatureSlugs references are valid (build doesn't throw)
  </verify>
  <done>
Feature registry contains 45-55 complete feature entries with valid cross-references
  </done>
</task>

<task type="auto">
  <name>Task 4: Create Information Architecture JSON</name>
  <files>docs-content/_ia.json</files>
  <action>
Create `docs-content/_ia.json` with hub-and-spoke structure for documentation navigation.

Structure (Apple-style progressive disclosure):

```json
{
  "version": 1,
  "lastUpdated": "2026-05-09T00:00:00Z",
  "clientHubs": [
    {
      "id": "getting-started",
      "name": "Getting Started",
      "description": "Learn the basics of DriveCommand",
      "icon": "Rocket",
      "features": []
    },
    {
      "id": "dispatch-operations",
      "name": "Dispatch & Operations",
      "description": "Manage loads, routes, and dispatches",
      "icon": "Truck",
      "features": ["carrier-dispatches", "carrier-loads", "carrier-stops", "routes", "driver-my-load", "driver-my-route"]
    },
    {
      "id": "fleet-management",
      "name": "Fleet Management",
      "description": "Trucks, drivers, and facilities",
      "icon": "Users",
      "features": ["carrier-fleet-trucks", "carrier-fleet-drivers", "carrier-facilities", "trucks", "drivers"]
    },
    {
      "id": "workflows-automation",
      "name": "Workflows & Automation",
      "description": "Checklists, playbooks, and automated tasks",
      "icon": "ListChecks",
      "features": ["checklists", "playbook-builder", "workflow-automation", "driver-tasks"]
    },
    {
      "id": "finance-billing",
      "name": "Finance & Billing",
      "description": "Invoicing, payroll, and expenses",
      "icon": "DollarSign",
      "features": ["invoices", "payroll", "fuel-dashboard", "expense-categories", "expense-templates"]
    },
    {
      "id": "compliance-safety",
      "name": "Compliance & Safety",
      "description": "Documents, HOS, and safety tracking",
      "icon": "Shield",
      "features": ["compliance-dashboard", "ifta-reporting", "driver-hours", "driver-incidents", "driver-documents"]
    },
    {
      "id": "intelligence-ai",
      "name": "Intelligence & AI",
      "description": "Maps, analytics, and AI-powered tools",
      "icon": "Brain",
      "features": ["live-map", "lane-analytics", "profit-predictor", "ai-document-reader", "workflow-analytics"]
    },
    {
      "id": "communication",
      "name": "Communication",
      "description": "Messaging and customer tracking",
      "icon": "MessageSquare",
      "features": ["carrier-messages", "driver-messages", "shipment-tracking"]
    },
    {
      "id": "settings-integrations",
      "name": "Settings & Integrations",
      "description": "Configuration and third-party connections",
      "icon": "Settings",
      "features": ["team-permissions", "subscription", "integrations", "crm"]
    }
  ],
  "sysadminHubs": [
    {
      "id": "platform-admin",
      "name": "Platform Administration",
      "description": "Tenant and subscription management",
      "icon": "Server",
      "features": ["tenant-management", "admin-billing", "admin-plans", "admin-promos"]
    },
    {
      "id": "support-operations",
      "name": "Support Operations",
      "description": "Support tickets and platform health",
      "icon": "LifeBuoy",
      "features": ["admin-support", "admin-dashboard", "support-tickets"]
    },
    {
      "id": "feature-reference",
      "name": "Feature Reference",
      "description": "Technical docs for all features",
      "icon": "BookOpen",
      "features": ["*"]
    }
  ]
}
```

Adjust feature arrays to match actual slugs from the registry.
  </action>
  <verify>
`cat docs-content/_ia.json | jq '.clientHubs | length'` returns 9
`cat docs-content/_ia.json | jq '.sysadminHubs | length'` returns 3
JSON is valid: `cat docs-content/_ia.json | jq .`
  </verify>
  <done>
_ia.json exists with hub-and-spoke structure for both client and sysadmin portals
  </done>
</task>

<task type="auto">
  <name>Task 5: Generate Client MDX Documentation (Batch 1 - Dispatch/Fleet)</name>
  <files>docs-content/client/*.mdx</files>
  <action>
Generate client MDX files for dispatch and fleet features. Follow the template structure exactly.

For each feature, create `docs-content/client/{slug}.mdx` with:
- Frontmatter: slug, title, summary (max 300 chars), lastReviewed (today ISO), estimatedReadMinutes
- H1 matching title
- Callout with feature intro
- StepFlow for common workflows
- ProcessDiagram for status lifecycles (if applicable)
- ComparisonTable for options (if applicable)
- FeatureCard links to related features

**Write these MDX files:**
1. carrier-dispatches.mdx - Dispatch board, ready-to-dispatch workflow
2. carrier-loads.mdx - Load creation, status workflow, route assignment
3. carrier-stops.mdx - Stop management within routes
4. routes.mdx - Multi-stop route planning (already exists route-planning.mdx, may need update)
5. carrier-fleet-trucks.mdx - Truck management, status badges
6. carrier-fleet-drivers.mdx - Driver list, compliance dots
7. carrier-facilities.mdx - Facility/yard management
8. driver-my-load.mdx - Driver load status updates
9. driver-my-route.mdx - Driver route view with stops

Content principles (Apple-style):
- One idea per section
- Show before tell (screenshots described in alt text)
- Progressive disclosure (simple first, advanced later)
- Quiet hierarchy (no excessive bolding)
- Action-oriented headings ("Create a dispatch" not "Dispatch Creation")
  </action>
  <verify>
`ls -la docs-content/client/ | grep -c ".mdx"` returns at least 10 (including existing + new)
Each file has valid frontmatter with required fields
  </verify>
  <done>
9 new client MDX files created for dispatch and fleet features
  </done>
</task>

<task type="auto">
  <name>Task 6: Generate Client MDX Documentation (Batch 2 - Workflows/Finance/Compliance)</name>
  <files>docs-content/client/*.mdx</files>
  <action>
Generate client MDX files for workflows, finance, and compliance features.

**Write these MDX files:**
1. checklists.mdx - Checklist overview, creating/running checklists
2. playbook-builder.mdx - Building playbooks with phases and steps
3. workflow-automation.mdx - Setting up trigger-based automation
4. driver-tasks.mdx - Completing assigned workflow tasks
5. invoices.mdx - Creating trucking invoices with FSC
6. payroll.mdx - Managing driver payroll
7. fuel-dashboard.mdx - Tracking fuel economy
8. compliance-dashboard.mdx - Document expiry tracking
9. ifta-reporting.mdx - IFTA quarterly reporting
10. driver-hours.mdx - Hours of Service logging
11. driver-incidents.mdx - Incident reporting
12. driver-documents.mdx - Document upload/management

Use StepFlow for multi-step processes. Use ProcessDiagram for status workflows (e.g., invoice DRAFT → SENT → PAID).
  </action>
  <verify>
`ls -la docs-content/client/ | grep -c ".mdx"` returns at least 22
  </verify>
  <done>
12 new client MDX files created for workflows, finance, and compliance features
  </done>
</task>

<task type="auto">
  <name>Task 7: Generate Client MDX Documentation (Batch 3 - Intelligence/Settings/Shared)</name>
  <files>docs-content/client/*.mdx</files>
  <action>
Generate remaining client MDX files.

**Write these MDX files:**
1. live-map.mdx - Real-time fleet tracking
2. lane-analytics.mdx - Route profitability analysis
3. profit-predictor.mdx - AI load profitability
4. ai-document-reader.mdx - AI extraction from documents (exists, verify)
5. workflow-analytics.mdx - Workflow completion metrics
6. carrier-messages.mdx - Fleet messaging
7. driver-messages.mdx - Driver messaging
8. shipment-tracking.mdx - Public tracking page
9. team-permissions.mdx - RBAC management
10. subscription.mdx - Plan management
11. integrations.mdx - Third-party integrations
12. crm.mdx - Customer management
13. carrier-clients.mdx - Client/shipper management
14. carrier-contracts.mdx - Contract management
15. carrier-templates.mdx - Dispatch templates
16. carrier-reports.mdx - Financial reports
17. carrier-dashboard.mdx - Carrier ops dashboard
18. driver-dashboard.mdx - Driver home screen
19. support-tickets.mdx - Support system
20. trucks.mdx - Legacy truck management
21. drivers.mdx - Legacy driver management

Skip features already documented. Total client MDX should be ~35-40 files.
  </action>
  <verify>
`ls -la docs-content/client/ | grep -c ".mdx"` returns 35-45
  </verify>
  <done>
All client-facing features have MDX documentation
  </done>
</task>

<task type="auto">
  <name>Task 8: Generate Sysadmin MDX Documentation</name>
  <files>docs-content/sysadmin/*.mdx</files>
  <action>
Generate sysadmin technical MDX files for ALL features. Follow the sysadmin template.

For each feature, create `docs-content/sysadmin/{slug}.mdx` with:
- Frontmatter: slug, title (with "Technical Reference"), summary, lastReviewed, estimatedReadMinutes, engineeringOwner
- Overview section
- Server Actions section with ApiTable
- Database Schema with PrismaModelRef
- RLS Policy with RlsPolicyBox
- Code Examples with CodeBlock
- Security Considerations
- Mobile API Endpoints (if applicable)
- Cron Jobs (if applicable)

**Priority features for detailed docs:**
1. All carrier-* features (12 files)
2. All workflow features (4 files)
3. All admin features (8 files)
4. All driver-* features (8 files)
5. All remaining features

Admin-only features (requiresClientDoc: false) only need sysadmin docs:
- tenant-management
- admin-support
- admin-billing
- admin-plans
- admin-promos
- admin-automations
- admin-docs
- admin-dashboard

Total sysadmin MDX: ~50 files (one per feature)
  </action>
  <verify>
`ls -la docs-content/sysadmin/ | grep -c ".mdx"` returns 45-55
  </verify>
  <done>
All features have sysadmin technical documentation
  </done>
</task>

<task type="auto">
  <name>Task 9: Update Help Center and Docs Home Pages</name>
  <files>
    apps/web/src/app/(owner)/help/page.tsx
    apps/web/src/app/(admin)/docs/page.tsx
  </files>
  <action>
Update both home pages to read hub structure from `_ia.json` instead of hardcoded categories.

**Help Center page (`apps/web/src/app/(owner)/help/page.tsx`):**
1. Import _ia.json: `import ia from '@/../docs-content/_ia.json'`
2. Replace categoryMeta with dynamic hub rendering
3. Render clientHubs as sections with icon, name, description
4. For each hub, show FeatureCards for features in that hub
5. Keep the Quick Links section (What's New, Support, Video Tutorials)

**Admin Docs page (`apps/web/src/app/(admin)/docs/page.tsx`):**
1. Import _ia.json
2. Update cards to reflect sysadminHubs structure
3. Link to Feature Reference (all features) and Platform Administration

Add icon mapping for lucide icons referenced in _ia.json (Rocket, Truck, Users, ListChecks, DollarSign, Shield, Brain, MessageSquare, Settings, Server, LifeBuoy, BookOpen).
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` passes
Pages render without errors
  </verify>
  <done>
Help Center and Admin Docs pages read from _ia.json for hub structure
  </done>
</task>

<task type="auto">
  <name>Task 10: Verification and Cleanup</name>
  <files>apps/web/scripts/_doc-catalog.json</files>
  <action>
1. Run CI drift check: `cd apps/web && npx tsx scripts/check-doc-drift.ts`
   - Should report 0 missing docs
   - May report stale docs (that's OK for now)

2. Run TypeScript check: `cd apps/web && npx tsc --noEmit`
   - Must pass with no errors

3. Spot-check a few MDX renders:
   - Verify `docs-content/client/checklists.mdx` has valid frontmatter
   - Verify `docs-content/sysadmin/tenant-management.mdx` has valid frontmatter

4. Clean up temp file:
   - Remove `apps/web/scripts/_doc-catalog.json` (or leave gitignored)

5. Verify feature count:
   - `grep -c "slug:" apps/web/src/lib/docs/feature-registry.ts` should be 45-55
  </action>
  <verify>
`cd apps/web && npx tsx scripts/check-doc-drift.ts` exits 0
`cd apps/web && npx tsc --noEmit` exits 0
  </verify>
  <done>
CI drift check passes, TypeScript compiles, all documentation complete
  </done>
</task>

</tasks>

<verification>
1. Feature registry contains 45-55 entries: `grep -c "slug:" apps/web/src/lib/docs/feature-registry.ts`
2. Client MDX count: `ls docs-content/client/*.mdx | wc -l` (expect 35-45)
3. Sysadmin MDX count: `ls docs-content/sysadmin/*.mdx | wc -l` (expect 45-55)
4. _ia.json valid: `cat docs-content/_ia.json | jq .`
5. CI drift check: `cd apps/web && npx tsx scripts/check-doc-drift.ts` exits 0
6. TypeScript: `cd apps/web && npx tsc --noEmit` passes
</verification>

<success_criteria>
- Feature registry has 45-55 complete entries covering all 4 portals
- Every stable feature with requiresClientDoc=true has client MDX
- Every stable feature has sysadmin MDX
- _ia.json defines hub-and-spoke navigation structure
- Help Center page reads from _ia.json
- Admin Docs page reads from _ia.json
- CI drift check passes with 0 missing docs
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/293-auto-generate-complete-feature-registry-/293-SUMMARY.md`
</output>
