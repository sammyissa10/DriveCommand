---
phase: quick-292
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(admin)/docs/layout.tsx
  - apps/web/src/app/(admin)/docs/page.tsx
  - apps/web/src/app/(admin)/docs/features/page.tsx
  - apps/web/src/app/(admin)/docs/features/[slug]/page.tsx
  - apps/web/src/app/(admin)/docs/operations/page.tsx
  - apps/web/src/app/(admin)/docs/operations/[slug]/page.tsx
  - apps/web/src/lib/docs/render-operational-md.ts
  - apps/web/src/lib/docs/build-admin-search-index.ts
  - apps/web/src/app/(admin)/api/docs-index/route.ts
  - apps/web/src/components/docs/AdminDocSearch.tsx
  - apps/web/src/components/docs/DocDriftIndicator.tsx
  - apps/web/src/app/(admin)/layout.tsx
  - docs-content/sysadmin/route-planning.mdx
  - docs-content/sysadmin/ai-document-reader.mdx
autonomous: true
must_haves:
  truths:
    - "SysAdmin can access /admin/docs landing page with two section cards"
    - "SysAdmin can browse all features at /admin/docs/features with portal/category/status filters"
    - "SysAdmin can view feature detail at /admin/docs/features/[slug] with Overview/Server Actions/Database/Security/Runbook tabs"
    - "SysAdmin can browse operational docs at /admin/docs/operations"
    - "SysAdmin can view operational doc detail at /admin/docs/operations/[slug] rendered with MDX components"
    - "SysAdmin can search across features and operational docs via Command+K"
    - "DocDriftIndicator shows green/yellow/red status on landing page"
  artifacts:
    - path: "apps/web/src/app/(admin)/docs/layout.tsx"
      provides: "Admin docs sidebar layout with two sections"
    - path: "apps/web/src/app/(admin)/docs/page.tsx"
      provides: "Landing page with section cards and drift indicator"
    - path: "apps/web/src/app/(admin)/docs/features/[slug]/page.tsx"
      provides: "Tabbed sysadmin doc view"
    - path: "apps/web/src/lib/docs/render-operational-md.ts"
      provides: "Server util to read and render apps/web/docs/*.md"
    - path: "apps/web/src/app/(admin)/api/docs-index/route.ts"
      provides: "Gated GET endpoint for admin search index"
  key_links:
    - from: "apps/web/src/app/(admin)/docs/features/[slug]/page.tsx"
      to: "renderSysadminDoc"
      via: "import from @/lib/docs/render-mdx"
      pattern: "renderSysadminDoc"
    - from: "apps/web/src/app/(admin)/docs/operations/[slug]/page.tsx"
      to: "renderOperationalMd"
      via: "import from @/lib/docs/render-operational-md"
      pattern: "renderOperationalMd"
    - from: "apps/web/src/components/docs/AdminDocSearch.tsx"
      to: "/admin/api/docs-index"
      via: "fetch for authenticated admin search index"
      pattern: "fetch.*api/docs-index"
---

<objective>
Build the SysAdmin Technical Knowledge Base at `/admin/docs` within the existing `(admin)` route group.

Purpose: Give sysadmins ONE place for all technical documentation — feature reference (registry-driven with server actions, DB schemas, RLS policies) and architecture/operations docs (existing apps/web/docs/*.md files).

Output:
- Admin docs layout with sidebar navigation
- Landing page with DocDriftIndicator and two section cards
- Features list page with filters
- Feature detail page with 5 tabs (Overview/Server Actions/Database/Security/Runbook)
- Operations list and detail pages (render existing markdown docs)
- Gated admin search index endpoint
- AdminDocSearch component (Command+K)
- Two additional sysadmin MDX examples (route-planning, ai-document-reader)
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(admin)/layout.tsx
@apps/web/src/lib/docs/feature-registry.ts
@apps/web/src/lib/docs/render-mdx.ts
@apps/web/src/lib/docs/frontmatter-schema.ts
@apps/web/src/components/docs/mdx-components.tsx
@apps/web/src/components/help/HelpSearch.tsx
@apps/web/scripts/check-doc-drift.ts
@docs-content/sysadmin/load-management.mdx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Admin Docs Pages and Layout</name>
  <files>
    apps/web/src/app/(admin)/docs/layout.tsx
    apps/web/src/app/(admin)/docs/page.tsx
    apps/web/src/app/(admin)/docs/features/page.tsx
    apps/web/src/app/(admin)/docs/features/[slug]/page.tsx
    apps/web/src/app/(admin)/docs/operations/page.tsx
    apps/web/src/app/(admin)/docs/operations/[slug]/page.tsx
    apps/web/src/lib/docs/render-operational-md.ts
    apps/web/src/components/docs/DocDriftIndicator.tsx
    apps/web/src/app/(admin)/layout.tsx
  </files>
  <action>
    1. Create `apps/web/src/app/(admin)/docs/layout.tsx`:
       - Admin-styled sidebar listing two sections:
         - "Feature Reference" (link to /admin/docs/features)
         - "Architecture & Operations" (link to /admin/docs/operations with sub-links to each existing doc: architecture, auth, database, stack, modules, setup, deployment, email, troubleshooting)
       - Use dark bg-gray-800/900 styling consistent with existing admin header
       - Include slot for {children}

    2. Create `apps/web/src/app/(admin)/docs/page.tsx`:
       - Landing page with two large cards (shadcn Card):
         - "Feature Reference" card linking to /admin/docs/features with description "Technical deep-dive into every user-facing feature"
         - "Architecture & Operations" card linking to /admin/docs/operations with description "System design docs, auth, database, deployment"
       - Import and render `<DocDriftIndicator />` at top showing current drift status
       - Show count of features and operations docs

    3. Create `apps/web/src/components/docs/DocDriftIndicator.tsx` (server component):
       - Run same logic as scripts/check-doc-drift.ts:
         - Import features from @/lib/docs/feature-registry
         - Check for missing MDX files (stable/beta features)
         - Check for staleness (>90 days since lastDocReviewedAt)
       - Render badge: green "All docs in sync" / yellow "X stale docs" / red "X missing docs"
       - Use shadcn Badge with appropriate variant (default/secondary/destructive)

    4. Create `apps/web/src/app/(admin)/docs/features/page.tsx`:
       - List ALL features from registry (including admin portal ones)
       - Filter controls: portal dropdown (all/owner/driver/admin/shared), category dropdown, status dropdown
       - Table columns: name (link), slug, portal, category, planTier, status, lastDocReviewedAt
       - Yellow dot badge on features stale >90 days
       - Use shadcn Table, Select components

    5. Create `apps/web/src/app/(admin)/docs/features/[slug]/page.tsx`:
       - Call renderSysadminDoc(slug) from @/lib/docs/render-mdx
       - If doc not found, show "No sysadmin doc yet" with link to _template.mdx
       - Implement 5 tabs using shadcn Tabs:
         - **Overview tab**: render the MDX content (feature.content)
         - **Server Actions tab**: For each path in feature.serverActionPaths, read file source with fs.readFileSync, extract exports via regex `/export\s+(async\s+)?function\s+(\w+)/g`, show in ApiTable. If regex fails, show file path as a link instead of crashing.
         - **Database tab**: For each model in feature.prismaModels, render PrismaModelRef with link to schema.prisma (line number lookup via grep if possible, else just link to file)
         - **Security tab**: Render securityNotes array from frontmatter as Callout items
         - **Runbook tab**: If frontmatter.runbookUrl exists, show iframe or external link; else show "No runbook yet - add runbookUrl to frontmatter"

    6. Create `apps/web/src/lib/docs/render-operational-md.ts`:
       - Server-only util that reads `apps/web/docs/{slug}.md`
       - Parse with gray-matter (frontmatter if any, or generate from first H1 and paragraph)
       - Compile with compileMDX using sysadminComponents from mdx-components.tsx (markdown is valid MDX subset)
       - Return { title, summary, content }
       - Export helper `getOperationalDocs()` that lists all .md files in apps/web/docs/ (excluding qa/ subdirectory)

    7. Create `apps/web/src/app/(admin)/docs/operations/page.tsx`:
       - Call getOperationalDocs() to list all markdown files
       - Show card grid with title (from first H1), first paragraph as summary
       - Link each to /admin/docs/operations/[slug]

    8. Create `apps/web/src/app/(admin)/docs/operations/[slug]/page.tsx`:
       - Call renderOperationalMd(slug)
       - Render with consistent MDX styling (same component map as sysadmin docs)
       - Show breadcrumb back to /admin/docs/operations

    9. Update `apps/web/src/app/(admin)/layout.tsx`:
       - Add "Docs" nav link in the header nav (between Promos and UserMenu)
       - Link to /admin/docs
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - Navigate to /admin/docs and see landing page with drift indicator
    - Navigate to /admin/docs/features and see filterable feature list
    - Navigate to /admin/docs/features/load-management and see 5 tabs
    - Navigate to /admin/docs/operations and see list of operational docs
    - Navigate to /admin/docs/operations/architecture and see rendered markdown
  </verify>
  <done>
    Admin docs routes render correctly: landing page shows drift status and two section cards, features list is filterable, feature detail shows 5 tabs with rendered sysadmin MDX, operations list shows all apps/web/docs/*.md files, operations detail renders markdown with MDX component styling.
  </done>
</task>

<task type="auto">
  <name>Task 2: Admin Search and Gated Index</name>
  <files>
    apps/web/src/lib/docs/build-admin-search-index.ts
    apps/web/src/app/(admin)/api/docs-index/route.ts
    apps/web/src/components/docs/AdminDocSearch.tsx
    apps/web/src/app/(admin)/docs/layout.tsx
  </files>
  <action>
    1. Create `apps/web/src/lib/docs/build-admin-search-index.ts`:
       - Script that builds `.docs-data/admin-docs-search-index.json` (NOT in public/)
       - Include:
         - All features from registry: slug, name, shortDescription, category, portal, planTier, route, type: 'feature'
         - All sysadmin MDX frontmatter: slug, title, summary (from frontmatter), type: 'sysadmin-doc'
         - All operational docs: slug (filename without .md), title (first H1), summary (first paragraph), type: 'operations-doc'
       - Export function buildAdminSearchIndex() for build-time use
       - Add npm script "build:admin-search" in package.json that runs this

    2. Create `apps/web/src/app/(admin)/api/docs-index/route.ts`:
       - GET endpoint that returns the admin search index JSON
       - Gate with isSystemAdmin() check from @/lib/auth/supabase — return 401 if not admin
       - Read .docs-data/admin-docs-search-index.json with fs.readFileSync
       - If file doesn't exist, call buildAdminSearchIndex() to generate it dynamically
       - Return JSON response

    3. Create `apps/web/src/components/docs/AdminDocSearch.tsx`:
       - Client component with Command+K shortcut (similar to HelpSearch)
       - Fetch index from /admin/api/docs-index on mount (with SWR or simple useEffect)
       - Use Fuse.js for fuzzy search across name/title/summary
       - Group results by type (Feature Reference / Sysadmin Docs / Operations Docs)
       - On select, navigate to appropriate route:
         - feature: /admin/docs/features/{slug}
         - sysadmin-doc: /admin/docs/features/{slug} (same as feature)
         - operations-doc: /admin/docs/operations/{slug}
       - Style consistent with existing HelpSearch (CommandDialog, CommandGroup, etc.)

    4. Update `apps/web/src/app/(admin)/docs/layout.tsx`:
       - Add AdminDocSearch component in the header area (top-right or top with search bar)
       - Show keyboard hint "Cmd+K to search"
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - Run `npx tsx src/lib/docs/build-admin-search-index.ts` (or the npm script) and confirm .docs-data/admin-docs-search-index.json is created
    - While logged in as sysadmin, press Cmd+K on /admin/docs and search works
    - While NOT logged in, GET /admin/api/docs-index returns 401
  </verify>
  <done>
    Admin search index is built at .docs-data/admin-docs-search-index.json, gated API endpoint serves it only to authenticated admins, AdminDocSearch component provides Command+K search across all admin docs with proper navigation.
  </done>
</task>

<task type="auto">
  <name>Task 3: Additional Sysadmin MDX Examples</name>
  <files>
    docs-content/sysadmin/route-planning.mdx
    docs-content/sysadmin/ai-document-reader.mdx
  </files>
  <action>
    1. Create `docs-content/sysadmin/route-planning.mdx`:
       - Full technical reference following the _template.mdx structure
       - Frontmatter: slug: route-planning, title, summary, lastReviewed (today), estimatedReadMinutes: 10, engineeringOwner: "Platform Team", securityNotes array
       - Sections:
         - Overview: Multi-stop route planning with leg sequencing, driver/truck assignment
         - Server Actions: Document actions from src/actions/routes.ts (createRoute, updateRoute, deleteRoute, assignDriver, etc.) with ApiTable
         - Database Schema: PrismaModelRef for Route, RouteStop with key fields
         - RouteStop sequencing: ProcessDiagram showing stop order, continuity warnings logic
         - RLS Policy: RlsPolicyBox with tenant isolation
         - Code Examples: CodeBlock showing route creation with stops
         - Mobile API Endpoints: /api/mobile/driver/routes/*
         - Security Considerations: Callouts for tenant isolation, driver assignment validation

    2. Create `docs-content/sysadmin/ai-document-reader.mdx`:
       - Full technical reference
       - Frontmatter: slug: ai-document-reader, title, summary, lastReviewed (today), estimatedReadMinutes: 12, engineeringOwner: "Platform Team", securityNotes array (critical - handles user uploads and external API)
       - Sections:
         - Overview: Anthropic Claude-powered extraction from rate confirmations and BOLs
         - Server Actions: Document AI reader action with ApiTable
         - Data Flow: ProcessDiagram showing Upload -> R2 -> Claude API -> Parsed Data -> Load/Invoice creation
         - Security Considerations (critical section):
           - Callout variant="danger": User-uploaded PDFs are sanitized before processing
           - Callout variant="danger": ANTHROPIC_API_KEY stored in env, never exposed to client
           - Callout variant="warning": Rate limiting on AI extraction to prevent abuse
           - Note on PII handling in extracted data
         - Database Schema: PrismaModelRef for Document
         - Code Examples: CodeBlock showing extraction flow
         - Error Handling: Common failure modes and recovery
         - Cost Considerations: Note about Claude API costs, batch processing
  </action>
  <verify>
    - Both MDX files pass frontmatter validation (run check-doc-drift.ts)
    - Navigate to /admin/docs/features/route-planning and see rendered content
    - Navigate to /admin/docs/features/ai-document-reader and see rendered content with security callouts
    - `cd apps/web && npx tsc --noEmit` passes
  </verify>
  <done>
    Two additional sysadmin MDX examples demonstrate the depth of technical documentation: route-planning covers multi-stop sequencing and RouteStop model, ai-document-reader covers external API integration with critical security notes for handling user uploads and API keys.
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. Full TypeScript check: `cd apps/web && npx tsc --noEmit`
2. Navigate to /admin/docs as sysadmin and verify:
   - Landing page shows DocDriftIndicator (should be green or yellow depending on staleness)
   - Two section cards link correctly
3. /admin/docs/features shows filterable list with all 6 features
4. /admin/docs/features/load-management shows 5 tabs, Server Actions tab extracts from source
5. /admin/docs/features/route-planning shows new MDX content
6. /admin/docs/features/ai-document-reader shows new MDX with security callouts
7. /admin/docs/operations shows 9 operational docs
8. /admin/docs/operations/architecture renders existing markdown
9. Command+K opens admin search, results navigate correctly
10. GET /admin/api/docs-index returns 401 when not logged in as admin
</verification>

<success_criteria>
- SysAdmin Technical Knowledge Base is fully functional at /admin/docs
- All features from registry are browsable with 5-tab detail view
- All existing apps/web/docs/*.md files are accessible and rendered
- Admin search indexes all three doc types and is gated behind auth
- DocDriftIndicator shows real-time sync status
- Two new sysadmin MDX examples prove the system handles depth
- No TypeScript errors, build passes
</success_criteria>

<output>
After completion, create `.planning/quick/292-build-sysadmin-technical-knowledge-base-/292-SUMMARY.md`
</output>
