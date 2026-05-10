---
phase: quick-297
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/help/HelpSidebar.tsx
  - apps/web/src/app/(owner)/help/[slug]/page.tsx
  - .planning/DOCS-IMPROVEMENT-GUIDE.md
  - docs-content/client/carrier-templates.mdx
autonomous: true
must_haves:
  truths:
    - "Help sidebar stays visible while scrolling article content"
    - "No plan tier badges or upgrade banners appear on help articles"
    - "DOCS-IMPROVEMENT-GUIDE.md exists with actionable writing guidelines"
    - "carrier-templates.mdx accurately describes the Playbook/Checklist system"
  artifacts:
    - path: "apps/web/src/components/help/HelpSidebar.tsx"
      provides: "Sticky sidebar positioning"
      contains: "sticky top-0"
    - path: "apps/web/src/app/(owner)/help/[slug]/page.tsx"
      provides: "Clean article layout without pricing"
      min_lines: 60
    - path: ".planning/DOCS-IMPROVEMENT-GUIDE.md"
      provides: "Documentation writing guidelines"
      min_lines: 100
    - path: "docs-content/client/carrier-templates.mdx"
      provides: "Accurate Dispatch Checklists documentation"
      min_lines: 40
  key_links:
    - from: "apps/web/src/components/help/HelpSidebar.tsx"
      to: "layout.tsx"
      via: "CSS sticky positioning"
      pattern: "sticky.*top-0"
---

<objective>
Improve Help Center documentation quality by fixing the sticky sidebar, removing plan tier pricing UI, creating a documentation style guide, and rewriting an inaccurate doc as a reference example.

Purpose: The help center sidebar scrolls away, pricing badges clutter docs, and carrier-templates.mdx describes a feature that doesn't exist (Dispatch Templates) instead of the actual Playbook/Checklist workflow system.

Output: Sticky nav, clean article UI, DOCS-IMPROVEMENT-GUIDE.md, and corrected carrier-templates.mdx
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/help/HelpSidebar.tsx
@apps/web/src/app/(owner)/help/[slug]/page.tsx
@apps/web/src/app/(owner)/help/layout.tsx
@docs-content/client/carrier-templates.mdx
@docs-content/client/checklists.mdx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix sticky sidebar and remove pricing UI</name>
  <files>
    apps/web/src/components/help/HelpSidebar.tsx
    apps/web/src/app/(owner)/help/[slug]/page.tsx
  </files>
  <action>
    **HelpSidebar.tsx:**
    Line 65 (`<aside className="...">`) - Add sticky positioning:
    - Change: `className="w-64 border-r bg-card shrink-0 hidden lg:block"`
    - To: `className="w-64 border-r bg-card shrink-0 hidden lg:block sticky top-0 h-screen overflow-y-auto"`

    This makes the sidebar stay fixed while the main content scrolls.

    **[slug]/page.tsx:**
    Remove all plan tier / pricing logic and UI:

    1. Remove imports (lines 9-11):
       - Delete: `import { Badge } from '@/components/ui/badge';`
       - Delete: `import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';`
       - Delete: `import { Clock, Sparkles } from 'lucide-react';`
       (Keep Clock import if used elsewhere, but Sparkles is only for upgrade banner)

    2. Remove tenant plan query (lines 38-50):
       - Delete the entire block that queries `tenantPlan` from `Tenant` table
       - Delete variables: `tenantPlan`, `tenantPlanIndex`, `featurePlanIndex`, `needsUpgrade`

    3. Remove plan tier Badge (lines 77-79):
       - Delete the conditional Badge rendering: `{feature && feature.planTier !== 'free' && ...}`

    4. Remove upgrade banner (lines 90-102):
       - Delete the entire `{needsUpgrade && (...)}` Alert block

    Keep: Breadcrumbs, title, summary, read time, MDX content, feedback widget, related articles.
  </action>
  <verify>
    - `grep -r "sticky top-0" apps/web/src/components/help/HelpSidebar.tsx` returns match
    - `grep -r "planTier\|needsUpgrade\|Sparkles" apps/web/src/app/(owner)/help/[slug]/page.tsx` returns NO matches
    - `npm run build` passes (no TypeScript errors from removed code)
  </verify>
  <done>
    Help sidebar stays visible while scrolling. Article pages show no plan tier badges or upgrade banners.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create DOCS-IMPROVEMENT-GUIDE.md</name>
  <files>.planning/DOCS-IMPROVEMENT-GUIDE.md</files>
  <action>
    Create a comprehensive documentation style guide for non-technical end-user docs. Include:

    **Structure:**
    1. Purpose statement - why this guide exists
    2. Audience - who reads DriveCommand help docs (trucking company owners, dispatchers, drivers)
    3. Core principles:
       - User-task oriented (what can they DO, not what the feature IS)
       - Scannable (headers, bullets, callouts)
       - Accurate (matches actual UI and codebase)
       - Actionable (step-by-step instructions)

    **Writing guidelines:**
    - Voice: Second person ("You can..."), active voice, present tense
    - Vocabulary: Avoid jargon, use trucking-industry terms users know
    - Sentence length: Max 20 words, one idea per sentence
    - Headers: Action-oriented (e.g., "Create a checklist" not "Checklist creation")

    **Doc structure template:**
    - Frontmatter requirements (slug, title, summary, lastReviewed, estimatedReadMinutes)
    - Required sections: Callout intro, "What this is", "How to use it", "Good to know", "Related"
    - StepFlow usage for multi-step procedures
    - ComparisonTable for feature comparisons
    - FeatureCard for related feature links

    **Quality checklist:**
    - [ ] Title matches UI navigation label
    - [ ] Summary is under 160 characters
    - [ ] Screenshots show current UI (if any)
    - [ ] Steps match actual UI buttons/labels
    - [ ] All FeatureCard slugs exist
    - [ ] No fictional features described

    **Anti-patterns to avoid:**
    - Describing features that don't exist
    - Using internal code names instead of UI labels
    - Passive voice ("The checklist can be created by...")
    - Wall-of-text paragraphs
    - Technical implementation details
  </action>
  <verify>
    - File exists at `.planning/DOCS-IMPROVEMENT-GUIDE.md`
    - File is at least 100 lines
    - Contains sections: Purpose, Audience, Principles, Writing Guidelines, Structure Template, Quality Checklist
  </verify>
  <done>
    DOCS-IMPROVEMENT-GUIDE.md exists with actionable guidelines for writing and reviewing help docs.
  </done>
</task>

<task type="auto">
  <name>Task 3: Rewrite carrier-templates.mdx as Dispatch Checklists</name>
  <files>docs-content/client/carrier-templates.mdx</files>
  <action>
    Completely rewrite this doc to describe the actual Playbook workflow system for dispatch operations.
    The current doc describes fictional "Dispatch Templates" for saving routes/lanes - this feature DOES NOT EXIST.

    The ACTUAL feature: Playbooks at `/checklists/` with entityType: DISPATCH that create step-by-step operational checklists.

    **New doc content:**

    Frontmatter:
    - slug: carrier-templates (keep for URL stability)
    - title: Dispatch Checklists
    - summary: Step-by-step checklists that auto-start when loads are dispatched to ensure consistent dispatch procedures.
    - lastReviewed: today's date
    - estimatedReadMinutes: 5

    Sections:
    1. **Callout intro** - Dispatch Checklists automate dispatch procedures with step-by-step verification

    2. **What this is** - Pre-configured checklist workflows that trigger when loads are dispatched. Ensure drivers complete required steps (document verification, truck inspection, load acceptance) before departing.

    3. **How to use it** (StepFlow):
       - Step 1: Navigate to Workflows > Checklists & Workflows
       - Step 2: Click New Checklist, select DISPATCH as the entity type
       - Step 3: Add phases (e.g., "Pre-Departure", "Load Verification", "Safety Check")
       - Step 4: Add steps with types: Simple, Photo Required, Signature Required, Text Entry
       - Step 5: Enable auto-start rule: "On Load Dispatch"
       - Step 6: Save and publish

    4. **Step types** - Reference the ComparisonTable from checklists.mdx

    5. **Good to know** (Callout tip) - Link dispatch checklists to truck-specific requirements (e.g., hazmat loads require additional inspection steps)

    6. **Related** - FeatureCard links to: checklists, workflow-automation, carrier-dispatches

    Apply DOCS-IMPROVEMENT-GUIDE.md principles: active voice, user-task oriented, matches actual UI.
  </action>
  <verify>
    - `grep "Dispatch Templates" docs-content/client/carrier-templates.mdx` returns NO matches (old content removed)
    - `grep "Dispatch Checklists" docs-content/client/carrier-templates.mdx` returns match (new title)
    - `grep "entityType\|DISPATCH\|checklists" docs-content/client/carrier-templates.mdx` returns matches (references real feature)
  </verify>
  <done>
    carrier-templates.mdx accurately describes the Dispatch Checklists feature backed by the actual Playbook/Checklist system in the codebase. No fictional features described.
  </done>
</task>

</tasks>

<verification>
1. Visit `/help/checklists` - sidebar stays visible while scrolling long article
2. Visit any help article - no plan tier badges or upgrade banners visible
3. `.planning/DOCS-IMPROVEMENT-GUIDE.md` exists with complete writing guidelines
4. `docs-content/client/carrier-templates.mdx` describes actual Dispatch Checklists feature
5. `npm run build` passes with no errors
</verification>

<success_criteria>
- Help sidebar uses `sticky top-0 h-screen overflow-y-auto` classes
- No `planTier`, `needsUpgrade`, `Sparkles` references in [slug]/page.tsx
- DOCS-IMPROVEMENT-GUIDE.md is 100+ lines with all required sections
- carrier-templates.mdx title is "Dispatch Checklists" and describes real Playbook workflow system
- Build passes, no TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/297-help-center-docs-quality-sticky-nav-remo/297-SUMMARY.md`
</output>
