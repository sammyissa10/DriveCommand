---
phase: quick-294
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs-content/client/carrier-dashboard.mdx
  - docs-content/client/carrier-clients.mdx
  - docs-content/client/carrier-contracts.mdx
  - docs-content/client/carrier-templates.mdx
  - docs-content/client/carrier-loads.mdx
  - docs-content/client/carrier-messages.mdx
  - docs-content/client/carrier-fleet-drivers.mdx
  - docs-content/client/carrier-facilities.mdx
  - docs-content/client/carrier-stops.mdx
  - docs-content/client/carrier-reports-revenue.mdx
  - docs-content/client/carrier-reports-driver-pay.mdx
  - docs-content/client/carrier-reports-aging.mdx
  - docs-content/client/carrier-reports-performance.mdx
  - docs-content/sysadmin/carrier-dashboard.mdx
  - docs-content/sysadmin/carrier-clients.mdx
  - docs-content/sysadmin/carrier-contracts.mdx
  - docs-content/sysadmin/carrier-templates.mdx
  - docs-content/sysadmin/carrier-loads.mdx
  - docs-content/sysadmin/carrier-messages.mdx
  - docs-content/sysadmin/carrier-fleet-drivers.mdx
  - docs-content/sysadmin/carrier-fleet-trucks.mdx
  - docs-content/sysadmin/carrier-facilities.mdx
  - docs-content/sysadmin/carrier-stops.mdx
  - docs-content/sysadmin/carrier-reports-revenue.mdx
  - docs-content/sysadmin/carrier-reports-driver-pay.mdx
  - docs-content/sysadmin/carrier-reports-aging.mdx
  - docs-content/sysadmin/carrier-reports-performance.mdx
autonomous: true
must_haves:
  truths:
    - "All 13 Carrier Ops features have client MDX documentation"
    - "All 15 Carrier Ops features have sysadmin MDX documentation"
    - "MDX files follow Apple-style documentation principles"
  artifacts:
    - path: "docs-content/client/carrier-dashboard.mdx"
      provides: "Client documentation for Carrier Dashboard"
    - path: "docs-content/sysadmin/carrier-dashboard.mdx"
      provides: "Technical reference for Carrier Dashboard"
  key_links:
    - from: "docs-content/client/*.mdx"
      to: "apps/web/src/lib/docs/feature-registry.ts"
      via: "slug field matching"
      pattern: "slug: carrier-"
---

<objective>
Generate MDX documentation files for all Carrier Ops features (Owner Portal dispatch/fleet/reports)

Purpose: Complete client-facing Help Center and SysAdmin Knowledge Base documentation for the 15 Carrier Operations features
Output: 27 MDX files (13 client + 14 sysadmin, since carrier-fleet-trucks client already exists)
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/docs/feature-registry.ts
@docs-content/client/_template.mdx
@docs-content/sysadmin/_template.mdx
@docs-content/client/checklists.mdx (reference for client style)
@docs-content/sysadmin/tenant-management.mdx (reference for sysadmin style)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Generate Carrier Ops Client MDX files (13 files)</name>
  <files>
    docs-content/client/carrier-dashboard.mdx
    docs-content/client/carrier-clients.mdx
    docs-content/client/carrier-contracts.mdx
    docs-content/client/carrier-templates.mdx
    docs-content/client/carrier-loads.mdx
    docs-content/client/carrier-messages.mdx
    docs-content/client/carrier-fleet-drivers.mdx
    docs-content/client/carrier-facilities.mdx
    docs-content/client/carrier-stops.mdx
    docs-content/client/carrier-reports-revenue.mdx
    docs-content/client/carrier-reports-driver-pay.mdx
    docs-content/client/carrier-reports-aging.mdx
    docs-content/client/carrier-reports-performance.mdx
  </files>
  <action>
    Generate 13 client-facing MDX documentation files for Carrier Ops features.

    For each feature, create MDX following the Apple-style client template pattern:
    - Frontmatter: slug, title, summary (from registry), lastReviewed (2026-05-09), estimatedReadMinutes (5-8)
    - Opening Callout with one-sentence feature purpose
    - "What this is" section (2-3 sentences)
    - "How to use it" section with StepFlow component (3-5 steps)
    - "Good to know" section with tip Callout
    - "Related" section with FeatureCard links from registry relatedFeatureSlugs

    Word count target: 250-450 words per file.

    Features to document:
    1. carrier-dashboard - KPIs, load status, driver availability, fleet health metrics
    2. carrier-clients - Shippers/brokers management, contact info, load history
    3. carrier-contracts - Rate tables, templates, renewal tracking
    4. carrier-templates - Reusable dispatch and route templates
    5. carrier-loads - Load creation, status workflow, route assignment
    6. carrier-messages - iMessage-style fleet communication, broadcast messaging
    7. carrier-fleet-drivers - Driver list with compliance dots, invitations
    8. carrier-facilities - Yards, warehouses, terminals with geofencing
    9. carrier-stops - Route stops with pickup/delivery details
    10. carrier-reports-revenue - Revenue analytics by customer, lane, driver
    11. carrier-reports-driver-pay - Payroll summary with miles, loads, bonuses
    12. carrier-reports-aging - AR aging with 30/60/90 day buckets
    13. carrier-reports-performance - On-time delivery, utilization, cost-per-mile

    Do NOT fabricate specific UI screenshots or navigation paths that may not exist.
    If unsure about implementation details, add TODO callout.
  </action>
  <verify>
    All 13 files exist in docs-content/client/ with valid frontmatter.
    Each file has slug matching feature-registry.ts.
    No TypeScript/MDX syntax errors.
  </verify>
  <done>
    13 client MDX files created with consistent Apple-style documentation format.
  </done>
</task>

<task type="auto">
  <name>Task 2: Generate Carrier Ops Sysadmin MDX files (14 files)</name>
  <files>
    docs-content/sysadmin/carrier-dashboard.mdx
    docs-content/sysadmin/carrier-clients.mdx
    docs-content/sysadmin/carrier-contracts.mdx
    docs-content/sysadmin/carrier-templates.mdx
    docs-content/sysadmin/carrier-loads.mdx
    docs-content/sysadmin/carrier-messages.mdx
    docs-content/sysadmin/carrier-fleet-drivers.mdx
    docs-content/sysadmin/carrier-fleet-trucks.mdx
    docs-content/sysadmin/carrier-facilities.mdx
    docs-content/sysadmin/carrier-stops.mdx
    docs-content/sysadmin/carrier-reports-revenue.mdx
    docs-content/sysadmin/carrier-reports-driver-pay.mdx
    docs-content/sysadmin/carrier-reports-aging.mdx
    docs-content/sysadmin/carrier-reports-performance.mdx
  </files>
  <action>
    Generate 14 sysadmin technical reference MDX files for Carrier Ops features.

    For each feature, create MDX following the sysadmin template pattern:
    - Frontmatter: slug, title (with "Technical Reference"), summary, lastReviewed, estimatedReadMinutes (8-15), engineeringOwner ("Platform Team")
    - Warning Callout about internal documentation
    - "Overview" section with portal, route, roles, plan tier info
    - "Server Actions" section with ApiTable component listing actions from serverActionPaths
    - "Database Schema" section with PrismaModelRef from registry prismaModels
    - "Security Considerations" section with RLS/auth notes
    - "Related Features" section with FeatureCard links

    Word count target: 300-700 words per file.

    Reference the feature registry for:
    - serverActionPaths: Use to document which server actions exist
    - prismaModels: Use for PrismaModelRef components
    - route: Document the actual route path
    - planTier: Note in overview section

    Add TODO callouts for any implementation details that need verification.
  </action>
  <verify>
    All 14 files exist in docs-content/sysadmin/ with valid frontmatter.
    Each file has slug matching feature-registry.ts.
    ApiTable and PrismaModelRef components used correctly.
  </verify>
  <done>
    14 sysadmin MDX files created with technical reference format.
  </done>
</task>

<task type="auto">
  <name>Task 3: Generate Intelligence + Workflows MDX files (14 files)</name>
  <files>
    docs-content/client/live-map.mdx
    docs-content/client/lane-analytics.mdx
    docs-content/client/profit-predictor.mdx
    docs-content/client/playbook-builder.mdx
    docs-content/client/workflow-automation.mdx
    docs-content/client/workflow-analytics.mdx
    docs-content/client/ai-document-reader.mdx
    docs-content/sysadmin/live-map.mdx
    docs-content/sysadmin/lane-analytics.mdx
    docs-content/sysadmin/profit-predictor.mdx
    docs-content/sysadmin/playbook-builder.mdx
    docs-content/sysadmin/workflow-automation.mdx
    docs-content/sysadmin/workflow-analytics.mdx
    docs-content/sysadmin/checklists.mdx
  </files>
  <action>
    Generate MDX documentation for Intelligence (3) and Workflows (4) features.

    Client MDX (7 files):
    1. live-map - Real-time GPS tracking, truck status indicators
    2. lane-analytics - Profitability by origin-destination lane
    3. profit-predictor - AI load profitability with Accept/Caution/Reject
    4. playbook-builder - Visual editor with drag-and-drop phases
    5. workflow-automation - Trigger-based auto-start rules
    6. workflow-analytics - Completion metrics, bottleneck detection
    7. ai-document-reader - Claude-powered extraction from rate confirmations

    Sysadmin MDX (7 files - same features + checklists):
    - Same 7 features with technical implementation details
    - Include tRPC router references for workflow features
    - Note Anthropic Claude integration for AI features

    For AI features, note the integration with Anthropic Claude API.
    For workflow features, reference the workflow engine spec from CLAUDE.md.
  </action>
  <verify>
    All 14 files exist with valid MDX syntax.
    AI features document Claude API integration.
    Workflow features reference tRPC routers.
  </verify>
  <done>
    Intelligence and Workflows documentation complete (7 client + 7 sysadmin files).
  </done>
</task>

</tasks>

<verification>
1. Run `ls docs-content/client/*.mdx | wc -l` - should show 17+ files (4 existing + 13 new)
2. Run `ls docs-content/sysadmin/*.mdx | wc -l` - should show 19+ files (5 existing + 14 new)
3. Verify frontmatter slugs match feature-registry.ts slugs
4. Build passes: `cd apps/web && npm run build` (no MDX errors)
</verification>

<success_criteria>
- 27 new MDX files created in docs-content/client/ and docs-content/sysadmin/
- All files follow template structure with required frontmatter
- Slugs match feature-registry.ts entries
- No fabricated content - TODOs added where verification needed
- Consistent Apple-style documentation voice
</success_criteria>

<output>
After completion, create `.planning/quick/294-generate-remaining-mdx-documentation-fil/294-SUMMARY.md`
</output>
