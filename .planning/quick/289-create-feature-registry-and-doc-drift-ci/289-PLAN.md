---
phase: quick-289
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/docs/feature-registry-schema.ts
  - apps/web/src/lib/docs/feature-registry.ts
  - apps/web/src/lib/docs/get-features.ts
  - apps/web/scripts/check-doc-drift.ts
  - apps/web/package.json
  - docs-content/client/.gitkeep
  - docs-content/sysadmin/.gitkeep
  - .github/workflows/doc-drift.yml
autonomous: true
must_haves:
  truths:
    - "Zod schema validates feature entries at import time with clear error messages"
    - "Invalid slugs (capitals, spaces) are rejected with descriptive errors"
    - "Broken relatedFeatureSlugs references are caught in second-pass validation"
    - "check-doc-drift.ts exits 1 when required MDX files are missing"
    - "check-doc-drift.ts warns (but exits 0) for stale lastDocReviewedAt"
    - "GitHub Action runs on PRs touching relevant paths"
  artifacts:
    - path: "apps/web/src/lib/docs/feature-registry-schema.ts"
      provides: "Zod schema + Feature type"
      exports: ["FeatureSchema", "Feature", "portalSchema", "categorySchema", "planTierSchema", "statusSchema"]
    - path: "apps/web/src/lib/docs/feature-registry.ts"
      provides: "Validated feature array with 6 seed entries"
      exports: ["features"]
    - path: "apps/web/src/lib/docs/get-features.ts"
      provides: "Pure synchronous read helpers"
      exports: ["getAllFeatures", "getFeatureBySlug", "getFeaturesByPortal", "getFeaturesByCategory", "getFeaturesByPlan", "getRelatedFeatures"]
    - path: "apps/web/scripts/check-doc-drift.ts"
      provides: "CI script for doc coverage enforcement"
    - path: ".github/workflows/doc-drift.yml"
      provides: "PR workflow for doc-drift check"
  key_links:
    - from: "apps/web/src/lib/docs/feature-registry.ts"
      to: "apps/web/src/lib/docs/feature-registry-schema.ts"
      via: "z.array(FeatureSchema).parse()"
      pattern: "FeatureSchema"
    - from: "apps/web/scripts/check-doc-drift.ts"
      to: "apps/web/src/lib/docs/feature-registry.ts"
      via: "import { features }"
      pattern: "features"
---

<objective>
Create Feature Registry and Doc-Drift CI Check

Purpose: Foundation for in-app documentation system. Every user-facing feature registered here drives both client Help Center and SysAdmin knowledge base. CI fails if registered features lack required MDX docs.

Output: Zod-validated registry with 6 seed features, read helpers, CI script, GitHub Action
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/package.json
@packages/validation/src/index.ts
</context>

<reasoning>
We keep the registry as TypeScript code-as-data (not a Postgres table) because: (1) it's deployed with the app and validated at build-time via Zod, catching errors before runtime; (2) it requires no database migrations or RLS policies for what is fundamentally configuration data; (3) CI can enforce doc coverage without database access.

Client docs and sysadmin docs are split into two folders because they serve different audiences with different needs — clients need plain-English how-to guides while sysadmins need technical details (server actions, Prisma models, data flow) — and a single MDX with conditional sections would be harder to maintain and review.
</reasoning>

<tasks>

<task type="auto">
  <name>Task 1: Create Zod schema, registry with 6 seed features, and read helpers</name>
  <files>
    apps/web/src/lib/docs/feature-registry-schema.ts
    apps/web/src/lib/docs/feature-registry.ts
    apps/web/src/lib/docs/get-features.ts
  </files>
  <action>
1. Create `feature-registry-schema.ts`:
   - Define Zod enums: portalSchema ('owner' | 'driver' | 'admin' | 'shared'), categorySchema ('fleet' | 'dispatch' | 'finance' | 'crm' | 'compliance' | 'ai' | 'reporting' | 'integrations' | 'admin' | 'support' | 'settings'), planTierSchema ('free' | 'starter' | 'pro' | 'business' | 'enterprise'), statusSchema ('stable' | 'beta' | 'deprecated' | 'planned')
   - Define slugSchema as z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: "Slug must be lowercase kebab-case (e.g., 'load-management')" })
   - Define FeatureSchema with all required fields: slug, name, shortDescription (z.string().max(160)), portal, category, planTier, status, route (z.string().startsWith('/')), addedInVersion (semver string), lastDocReviewedAt (ISO date), relatedFeatureSlugs (z.array(z.string())), requiresClientDoc (z.boolean().default(true)), requiresSysadminDoc (z.boolean().default(true)), serverActionPaths (z.array(z.string()).optional()), prismaModels (z.array(z.string()).optional())
   - Export Feature type via z.infer

2. Create `feature-registry.ts`:
   - Import FeatureSchema from schema file
   - Define rawFeatures array with 6 entries:
     a. load-management: owner, dispatch, pro, /loads, relatedFeatureSlugs: ['route-planning', 'driver-my-route'], serverActionPaths: ['src/actions/loads.ts'], prismaModels: ['Load', 'RouteStop']
     b. route-planning: owner, dispatch, pro, /routes, relatedFeatureSlugs: ['load-management'], serverActionPaths: ['src/actions/routes.ts'], prismaModels: ['Route', 'RouteStop']
     c. driver-my-route: driver, dispatch, pro, /my-route, relatedFeatureSlugs: ['load-management'], serverActionPaths: ['src/app/api/mobile/driver/routes/route.ts'], prismaModels: ['Route', 'Load']
     d. ai-document-reader: owner, ai, business, /ai-documents, relatedFeatureSlugs: ['load-management'], serverActionPaths: ['src/actions/documents/ai-reader.ts'], prismaModels: ['Document']
     e. tenant-management: admin, admin, enterprise, /admin/tenants, requiresClientDoc: false, relatedFeatureSlugs: [], serverActionPaths: ['src/actions/admin/tenants.ts'], prismaModels: ['Tenant', 'User']
     f. support-tickets: shared, support, free, /support, relatedFeatureSlugs: [], serverActionPaths: ['src/actions/support.ts'], prismaModels: ['SupportTicket']
   - Use realistic addedInVersion (e.g., '1.0.0', '2.0.0', '3.0.0') and lastDocReviewedAt dates
   - Run z.array(FeatureSchema).parse(rawFeatures) at module load
   - Then run second-pass validation: for each feature, check every slug in relatedFeatureSlugs exists in the parsed array. Throw descriptive error listing all broken references if any.
   - Export validated `features` array

3. Create `get-features.ts`:
   - Import features from registry
   - Implement pure synchronous functions (NO React, NO Next.js APIs):
     - getAllFeatures(): Feature[]
     - getFeatureBySlug(slug: string): Feature | undefined
     - getFeaturesByPortal(portal: Portal): Feature[]
     - getFeaturesByCategory(category: Category): Feature[]
     - getFeaturesByPlan(plan: PlanTier): Feature[] (returns features at or below that tier)
     - getRelatedFeatures(slug: string): Feature[] (returns Feature objects for relatedFeatureSlugs)
  </action>
  <verify>
    Run `cd /Users/ayazmohammed/DriveCommand/apps/web && npx tsc --noEmit` — no TypeScript errors.
    Run `cd /Users/ayazmohammed/DriveCommand/apps/web && npx tsx -e "import './src/lib/docs/feature-registry'; console.log('Registry loaded successfully')"` — no Zod errors.
    Test invalid slug rejection: `npx tsx -e "import { FeatureSchema } from './src/lib/docs/feature-registry-schema'; FeatureSchema.parse({ slug: 'Load Management', name: 'test', shortDescription: 'test', portal: 'owner', category: 'dispatch', planTier: 'pro', status: 'stable', route: '/test', addedInVersion: '1.0.0', lastDocReviewedAt: '2026-01-01', relatedFeatureSlugs: [] })"` — should throw with "lowercase kebab-case" message.
  </verify>
  <done>
    - FeatureSchema validates all 11+ fields with descriptive error messages
    - 6 seed features parse successfully with realistic metadata
    - Second-pass validation catches broken relatedFeatureSlugs references
    - All 6 read helpers work correctly
    - No TypeScript errors in strict mode
  </done>
</task>

<task type="auto">
  <name>Task 2: Create doc-drift CI script and placeholder directories</name>
  <files>
    apps/web/scripts/check-doc-drift.ts
    apps/web/package.json
    docs-content/client/.gitkeep
    docs-content/sysadmin/.gitkeep
  </files>
  <action>
1. Create `docs-content/client/.gitkeep` and `docs-content/sysadmin/.gitkeep` at repo root (empty files)

2. Create `apps/web/scripts/check-doc-drift.ts`:
   - Use only Node built-ins: `node:fs`, `node:path`
   - Import features from '../src/lib/docs/feature-registry'
   - Define DOCS_ROOT as path.resolve(process.cwd(), '../../docs-content') (relative to apps/web)
   - For each feature where status is 'stable' or 'beta':
     - If requiresClientDoc is true, check if `${DOCS_ROOT}/client/${feature.slug}.mdx` exists
     - If requiresSysadminDoc is true, check if `${DOCS_ROOT}/sysadmin/${feature.slug}.mdx` exists
   - Track missingDocs array (with feature slug and doc type)
   - For each feature, check if lastDocReviewedAt is older than 90 days. Track staleDocs array (warnings only).
   - Output format:
     ```
     Doc-Drift Check
     ===============

     [If errors:]
     ERRORS (X missing docs):
     - client/load-management.mdx (feature: load-management)
     - sysadmin/ai-document-reader.mdx (feature: ai-document-reader)

     [If warnings:]
     WARNINGS (X stale docs):
     - load-management: last reviewed 120 days ago

     [If all good:]
     All X features have required documentation.
     ```
   - Exit code 1 if any missing docs, exit code 0 if only warnings or all good

3. Add npm script to apps/web/package.json:
   - "check:docs": "tsx scripts/check-doc-drift.ts"
  </action>
  <verify>
    Run `cd /Users/ayazmohammed/DriveCommand/apps/web && npm run check:docs` — should exit 1 and report expected missing MDX files for the 6 seeded features (5 client docs missing since tenant-management has requiresClientDoc: false, and 6 sysadmin docs missing).
    Verify docs-content directories exist: `ls -la /Users/ayazmohammed/DriveCommand/docs-content/client/.gitkeep` and `ls -la /Users/ayazmohammed/DriveCommand/docs-content/sysadmin/.gitkeep`
  </verify>
  <done>
    - check-doc-drift.ts runs successfully via tsx
    - Reports 11 missing MDX files (5 client + 6 sysadmin)
    - Exits with code 1 (missing docs)
    - docs-content/client and docs-content/sysadmin directories created with .gitkeep
    - npm script "check:docs" works
  </done>
</task>

<task type="auto">
  <name>Task 3: Create GitHub Action workflow for doc-drift CI</name>
  <files>
    .github/workflows/doc-drift.yml
  </files>
  <action>
1. Create `.github/workflows/doc-drift.yml`:
   ```yaml
   name: Doc Drift Check

   on:
     pull_request:
       paths:
         - 'apps/web/src/lib/docs/**'
         - 'docs-content/**'
         - 'apps/web/src/app/**'

   jobs:
     check-docs:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4

         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '20'
             cache: 'npm'

         - name: Install dependencies
           run: npm ci

         - name: Run doc-drift check
           working-directory: apps/web
           run: npx tsx scripts/check-doc-drift.ts
   ```

2. Add README block comment at top of feature-registry.ts explaining how to add a new feature:
   ```typescript
   /**
    * Feature Registry — Single source of truth for user-facing features
    *
    * HOW TO ADD A NEW FEATURE:
    * 1. Append entry to `rawFeatures` array below with all required fields
    * 2. Create docs-content/client/{slug}.mdx (unless requiresClientDoc: false)
    * 3. Create docs-content/sysadmin/{slug}.mdx (unless requiresSysadminDoc: false)
    * 4. Open PR — CI will block if required docs are missing
    */
   ```
  </action>
  <verify>
    Verify workflow file syntax: `cd /Users/ayazmohammed/DriveCommand && cat .github/workflows/doc-drift.yml` — should be valid YAML
    Verify README block exists in feature-registry.ts
  </verify>
  <done>
    - GitHub Action workflow created with correct path triggers
    - Workflow runs check-doc-drift.ts from apps/web directory
    - README block added to feature-registry.ts with 4-step instructions
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles with no errors: `cd apps/web && npx tsc --noEmit`
2. Registry loads without Zod errors: `cd apps/web && npx tsx -e "import './src/lib/docs/feature-registry'"`
3. check:docs reports expected missing files: `cd apps/web && npm run check:docs` (should exit 1)
4. Invalid slug rejected: Test FeatureSchema.parse with "Load Management" slug — should throw
5. Broken reference rejected: Temporarily add invalid relatedFeatureSlugs and verify error
</verification>

<success_criteria>
- No TypeScript errors in strict mode
- Zod validates all feature entries at import time
- Invalid slugs (capitals, spaces) rejected with clear "lowercase kebab-case" message
- Broken relatedFeatureSlugs caught in second-pass validation
- check-doc-drift.ts exits 1 with list of 11 missing MDX files
- GitHub Action configured for relevant PR paths
- README block documents the 4-step add-feature workflow
</success_criteria>

<output>
After completion, create `.planning/quick/289-create-feature-registry-and-doc-drift-ci/289-SUMMARY.md`
</output>
