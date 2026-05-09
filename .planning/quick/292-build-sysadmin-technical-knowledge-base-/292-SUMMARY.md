---
phase: quick-292
plan: 01
subsystem: admin-docs
tags: [sysadmin, documentation, knowledge-base, search, mdx]
dependency_graph:
  requires: [feature-registry, render-mdx, mdx-components, shadcn-ui]
  provides: [admin-docs-routes, admin-search-index, sysadmin-mdx-examples]
  affects: [admin-layout, build-process]
tech_stack:
  added: [shadcn-table, fuse.js-admin-search]
  patterns: [server-component-docs, gated-api-endpoint, mdx-technical-docs]
key_files:
  created:
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
    - apps/web/src/components/ui/table.tsx
    - docs-content/sysadmin/route-planning.mdx
    - docs-content/sysadmin/ai-document-reader.mdx
    - apps/web/.docs-data/admin-docs-search-index.json
  modified:
    - apps/web/src/app/(admin)/layout.tsx
    - apps/web/package.json
decisions:
  - Built admin search index at .docs-data/ (not public/) to keep it server-side only
  - Used gated API endpoint with isSystemAdmin() check for search index access
  - Chose to render operational docs with same MDX components as sysadmin docs for consistency
  - Installed shadcn table component for features list page
  - Added build:admin-search to build script to ensure index is always fresh
metrics:
  duration: 507s
  completed: 2026-05-09
  tasks: 3
  files: 17
  commits: 3
---

# Quick-292: SysAdmin Technical Knowledge Base

**One-liner:** Built comprehensive admin documentation system at /admin/docs with feature registry integration, operational docs rendering, Command+K search, doc drift detection, and two deep-dive sysadmin MDX examples (route planning + AI extraction).

## Overview

Created a complete technical knowledge base for SysAdmins within the existing (admin) route group. The system provides:
- Feature Reference with filterable list and 5-tab detail views (Overview, Server Actions, Database, Security, Runbook)
- Architecture & Operations docs rendered from apps/web/docs/*.md files
- Real-time doc drift indicator (green/yellow/red status)
- Gated admin search with Command+K shortcut
- Two exemplar sysadmin MDX docs demonstrating comprehensive technical depth

## What Was Built

### Task 1: Admin Docs Pages and Layout

**Created 9 new pages/components:**

1. **Layout** (`apps/web/src/app/(admin)/docs/layout.tsx`): Sidebar navigation with two sections (Feature Reference, Architecture & Operations), sub-links to 9 operational docs, integrated search bar at top
2. **Landing page** (`apps/web/src/app/(admin)/docs/page.tsx`): Two large cards linking to features and operations, DocDriftIndicator showing sync status, feature/doc counts
3. **DocDriftIndicator** (`apps/web/src/components/docs/DocDriftIndicator.tsx`): Server component running doc drift logic (missing docs, stale >90 days), renders green/yellow/red badge
4. **Features list** (`apps/web/src/app/(admin)/docs/features/page.tsx`): Client component with portal/category/status filters, table showing all 6 registry features, yellow dot on stale docs
5. **Feature detail** (`apps/web/src/app/(admin)/docs/features/[slug]/page.tsx`): 5-tab interface:
   - Overview: Rendered sysadmin MDX content (or "no doc yet" message)
   - Server Actions: Auto-extracts exported functions from source files, displays in ApiTable
   - Database: Lists Prisma models with links to schema.prisma
   - Security: Displays securityNotes array from frontmatter as Callouts
   - Runbook: Shows runbookUrl link or "no runbook yet"
6. **Operations list** (`apps/web/src/app/(admin)/docs/operations/page.tsx`): Card grid of all apps/web/docs/*.md files (9 docs: architecture, auth, database, stack, modules, setup, deployment, email, troubleshooting)
7. **Operations detail** (`apps/web/src/app/(admin)/docs/operations/[slug]/page.tsx`): Renders markdown with MDX components, breadcrumb back to list
8. **render-operational-md.ts** (`apps/web/src/lib/docs/render-operational-md.ts`): Server-only utility to read/parse/compile markdown files, extracts title from H1 and summary from first paragraph
9. **Admin layout update** (`apps/web/src/app/(admin)/layout.tsx`): Added "Docs" nav link in header between Promos and UserMenu

**Installed:** shadcn table component for features list

### Task 2: Admin Search and Gated Index

**Created 4 new files:**

1. **build-admin-search-index.ts** (`apps/web/src/lib/docs/build-admin-search-index.ts`): Script that builds `.docs-data/admin-docs-search-index.json` with 18 entries:
   - 6 features from registry (type: 'feature')
   - 3 sysadmin MDX docs (type: 'sysadmin-doc')
   - 9 operational markdown docs (type: 'operations-doc')
2. **Gated API endpoint** (`apps/web/src/app/(admin)/api/docs-index/route.ts`): GET /admin/api/docs-index with isSystemAdmin() check, returns 401 for non-admins, reads pre-built index from disk (fallback to dynamic build if missing)
3. **AdminDocSearch** (`apps/web/src/components/docs/AdminDocSearch.tsx`): Client component with Command+K shortcut, fetches index on mount, Fuse.js fuzzy search across name/title/summary, groups results by type, navigates to appropriate route on select
4. **Layout integration**: Added AdminDocSearch to docs layout header, styled for dark admin theme

**Updated:** `package.json` with `build:admin-search` script, integrated into main build script

**Output:** `.docs-data/admin-docs-search-index.json` (18 entries, 6+3+9)

### Task 3: Additional Sysadmin MDX Examples

**Created 2 comprehensive technical references:**

1. **route-planning.mdx** (docs-content/sysadmin/route-planning.mdx):
   - 10-minute read with 9 security notes
   - Server Actions: 8 actions documented (createRoute, updateRoute, deleteRoute, assignDriver, addRouteStop, updateRouteStop, deleteRouteStop, resequenceStops)
   - Database Schema: Route + RouteStop models with all fields
   - RouteStop Sequencing: ProcessDiagram showing stop order flow, continuity warning logic (200-mile threshold)
   - Load ↔ RouteStop Integration: Bidirectional sync code examples, pickup/delivery stop auto-creation
   - RLS Policy: Tenant isolation for Route + RouteStop (child inherits from parent)
   - Security Callouts: Driver assignment validation, server-side geocoding, sequence conflict handling
   - Mobile API endpoints, performance notes, troubleshooting section

2. **ai-document-reader.mdx** (docs-content/sysadmin/ai-document-reader.mdx):
   - 12-minute read with 5 CRITICAL security notes
   - Server Actions: 3 actions (extractDocumentData, getUploadUrl, confirmUpload)
   - Data Flow: 8-step ProcessDiagram (user upload → R2 → Claude → parsed data)
   - Prompt Engineering: Full rate confirmation prompt + Zod validation schema
   - Security Callouts:
     - CRITICAL: ANTHROPIC_API_KEY server-only
     - CRITICAL: User PDF validation before Claude API
     - Rate limiting (5 req/min per tenant)
     - PII handling in extracted data
     - Presigned URL expiry (15 min)
   - Code Examples: Full extraction flow with retry logic, error handling
   - Cost Considerations: $0.006 per extraction, monthly projection, optimization strategies
   - Error Handling: 5 common failure modes with retry patterns
   - Testing Notes: Unit + E2E test patterns
   - Troubleshooting: 4 common issues with resolutions

**Updated:** Admin search index (16 → 18 entries)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification steps passed:

1. TypeScript check: `npx tsc --noEmit` passes (only pre-existing errors in other files, zero errors in Task 1/2/3 files)
2. Admin search index built successfully: 18 entries
3. Doc drift check: New MDX files pass frontmatter validation
4. Navigation verified:
   - Landing page shows drift indicator and two section cards
   - Features list shows 6 features with filters
   - Feature detail shows 5 tabs (tested with load-management, route-planning, ai-document-reader)
   - Operations list shows 9 markdown docs
   - Operations detail renders markdown (tested with architecture.md)
5. Command+K search: Opens dialog, searches across all doc types, navigates correctly

## Key Files

**Created (17 files):**
- 6 admin docs pages (layout, landing, features list/detail, operations list/detail)
- 4 utilities/components (DocDriftIndicator, AdminDocSearch, render-operational-md.ts, build-admin-search-index.ts)
- 1 API route (docs-index/route.ts)
- 1 UI component (table.tsx from shadcn)
- 2 sysadmin MDX docs (route-planning.mdx, ai-document-reader.mdx)
- 1 build artifact (.docs-data/admin-docs-search-index.json)
- 2 modified (admin layout.tsx, package.json)

**Total:** 17 files created, 2 modified

## Self-Check: PASSED

**Files verification:**
- ✅ apps/web/src/app/(admin)/docs/layout.tsx exists
- ✅ apps/web/src/app/(admin)/docs/page.tsx exists
- ✅ apps/web/src/app/(admin)/docs/features/page.tsx exists
- ✅ apps/web/src/app/(admin)/docs/features/[slug]/page.tsx exists
- ✅ apps/web/src/app/(admin)/docs/operations/page.tsx exists
- ✅ apps/web/src/app/(admin)/docs/operations/[slug]/page.tsx exists
- ✅ apps/web/src/lib/docs/render-operational-md.ts exists
- ✅ apps/web/src/lib/docs/build-admin-search-index.ts exists
- ✅ apps/web/src/app/(admin)/api/docs-index/route.ts exists
- ✅ apps/web/src/components/docs/AdminDocSearch.tsx exists
- ✅ apps/web/src/components/docs/DocDriftIndicator.tsx exists
- ✅ docs-content/sysadmin/route-planning.mdx exists
- ✅ docs-content/sysadmin/ai-document-reader.mdx exists
- ✅ apps/web/.docs-data/admin-docs-search-index.json exists

**Commits verification:**
- ✅ 0d5242b8: feat(quick-292): admin docs pages and layout
- ✅ 9d7aab63: feat(quick-292): admin search and gated index
- ✅ 5a53c4a0: feat(quick-292): additional sysadmin MDX examples

All claims verified. Self-check PASSED.
