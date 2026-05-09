---
phase: quick-290
plan: 01
subsystem: documentation-system
tags: [mdx, components, rendering, help-center, knowledge-base]
dependency-graph:
  requires: [feature-registry, shadcn-ui, next-mdx-remote]
  provides: [mdx-rendering-pipeline, doc-component-library]
  affects: [help-center, sysadmin-kb]
tech-stack:
  added:
    - next-mdx-remote: ^5.0.0 (RSC-native MDX compilation)
    - gray-matter: frontmatter parsing
    - rehype-slug: auto-generate heading IDs
    - rehype-autolink-headings: wrap headings in anchor links
  patterns:
    - Server-first component architecture (13 server components, 1 client island)
    - Compound components (StepFlow.Step pattern)
    - Frontmatter validation with Zod schemas
    - Feature registry cross-check on render
key-files:
  created:
    - apps/web/src/lib/docs/frontmatter-schema.ts: Zod schemas for client + sysadmin frontmatter
    - apps/web/src/lib/docs/render-mdx.ts: renderClientDoc + renderSysadminDoc utilities
    - apps/web/src/components/docs/mdx-components.tsx: Component maps (clientComponents, sysadminComponents)
    - apps/web/src/components/docs/blocks/Callout.tsx: 5 variants with icons + ARIA roles
    - apps/web/src/components/docs/blocks/KeyboardShortcut.tsx: Styled <kbd> elements
    - apps/web/src/components/docs/blocks/PlanBadge.tsx: Tier badges with shadcn Badge
    - apps/web/src/components/docs/blocks/StepFlow.tsx: Numbered steps with connector lines
    - apps/web/src/components/docs/blocks/ComparisonTable.tsx: Responsive table
    - apps/web/src/components/docs/blocks/Screenshot.tsx: Next/Image with numbered hotspots
    - apps/web/src/components/docs/blocks/VideoEmbed.tsx: YouTube/Loom/MP4 detection
    - apps/web/src/components/docs/blocks/ProcessDiagram.tsx: Horizontal/vertical flow
    - apps/web/src/components/docs/blocks/FeatureCard.tsx: Auto-fills from feature registry
    - apps/web/src/components/docs/blocks/sysadmin/CopyButton.tsx: Client component for clipboard
    - apps/web/src/components/docs/blocks/sysadmin/CodeBlock.tsx: Server wrapper with CopyButton island
    - apps/web/src/components/docs/blocks/sysadmin/ApiTable.tsx: 4-column server action table
    - apps/web/src/components/docs/blocks/sysadmin/RlsPolicyBox.tsx: SQL policy display
    - apps/web/src/components/docs/blocks/sysadmin/PrismaModelRef.tsx: Schema reference with GitHub link
    - docs-content/client/load-management.mdx: Real example (~500 words)
    - docs-content/client/_template.mdx: Annotated template
    - docs-content/sysadmin/load-management.mdx: Technical reference (~800 words)
    - docs-content/sysadmin/_template.mdx: Engineering template
  modified:
    - apps/web/package.json: Added 4 MDX dependencies
    - package-lock.json: Updated lockfile
decisions:
  - "Skip shiki/prism syntax highlighting to avoid bundle weight and RSC complexity — use simple monospace pre/code with copy button"
  - "Make CopyButton the only client component — isolated as island to keep everything else server-rendered"
  - "Use compound component pattern for StepFlow (StepFlow.Step) to enable clean JSX syntax in MDX"
  - "Override <pre> in sysadminComponents to auto-wrap with CodeBlock while keeping base behavior in clientComponents"
  - "Use shadcn CSS variables exclusively (no hardcoded colors) for automatic dark/light mode support"
  - "Cross-check slug against feature registry at render time to catch doc-feature mismatches early"
  - "Store docs in docs-content/ at project root (not apps/web/public) to keep source separate from build artifacts"
metrics:
  duration: 514s
  tasks-completed: 3
  components-created: 14
  mdx-examples-created: 4
  files-modified: 26
  commits: 3
  loc-added: ~3500
completed: 2026-05-09T01:01:37Z
---

# Quick Task 290: Build MDX Component Library and Rendering Pipeline

**One-liner:** RSC-native MDX rendering pipeline with 14 reusable blocks (9 shared, 5 sysadmin-only) for Help Center and SysAdmin knowledge base, using next-mdx-remote, Zod frontmatter validation, and feature registry cross-checks.

## Summary

Built a complete MDX documentation system with two audiences: client-facing Help Center (infographic style, plain English) and SysAdmin knowledge base (technical depth, code-friendly). The system includes:

- **Rendering pipeline**: `renderClientDoc()` and `renderSysadminDoc()` server utilities that read MDX files, validate frontmatter against Zod schemas, cross-check slugs with the feature registry, and compile with rehype plugins for heading anchors
- **Component library**: 14 custom MDX blocks — 9 shared blocks (Callout, StepFlow, ComparisonTable, Screenshot, VideoEmbed, ProcessDiagram, FeatureCard, KeyboardShortcut, PlanBadge) and 5 sysadmin-specific blocks (CodeBlock, ApiTable, RlsPolicyBox, PrismaModelRef, CopyButton)
- **Component maps**: `clientComponents` and `sysadminComponents` that override base HTML elements with Tailwind-styled equivalents and inject custom blocks
- **Example docs**: Real load-management articles for both client (~500 words) and sysadmin (~800 words) audiences demonstrating all block types
- **Templates**: Fully annotated `_template.mdx` files for both audiences with inline documentation

All components are server-rendered except `CopyButton` (client island for clipboard interaction). All styling uses shadcn CSS variables for automatic dark/light mode support. The system validates frontmatter structure and enforces feature registry alignment at render time.

## Deviations from Plan

None — plan executed exactly as written.

## Task Breakdown

### Task 1: Install dependencies, create frontmatter schemas and render utilities
- **Duration**: ~180s
- **Commit**: `037e38e9`
- **Files modified**: 4 (package.json, package-lock.json, frontmatter-schema.ts, render-mdx.ts)
- **What was built**:
  - Installed next-mdx-remote ^5.0.0, gray-matter, rehype-slug, rehype-autolink-headings
  - Created `clientFrontmatterSchema` with 6 fields (slug with kebab-case regex, title, summary max 300 chars, ISO date, estimated read minutes 1-60, optional video URL)
  - Created `sysadminFrontmatterSchema` extending client schema with 3 engineering fields (engineeringOwner, runbookUrl, securityNotes array)
  - Implemented `renderClientDoc(slug)` and `renderSysadminDoc(slug)` with:
    - File reading from `docs-content/client/` and `docs-content/sysadmin/`
    - gray-matter frontmatter parsing
    - Zod validation with descriptive error messages (e.g., "Invalid frontmatter in load-management: slug: Slug must be kebab-case")
    - Feature registry cross-check (throws if slug not found)
    - MDX compilation with rehype plugins for `id` attributes and wrapped heading links
- **Key decision**: Throw clear errors at render time rather than fail silently — helps catch doc-feature mismatches during development

### Task 2: Build all MDX block components and component map
- **Duration**: ~240s
- **Commit**: `8b9150f8`
- **Files created**: 15 (14 blocks + mdx-components.tsx)
- **What was built**:

**Shared blocks (client + sysadmin)**:
1. **Callout**: 5 variants (info/tip/success/warning/danger) with Lucide icons, color-coded borders/backgrounds using Tailwind opacity classes (e.g., `bg-blue-500/10 border-blue-500/20`), and ARIA `role="alert"` for warning/danger
2. **KeyboardShortcut**: Splits on "+" and renders each key in styled `<kbd>` with font-mono, bg-muted, shadow-sm
3. **PlanBadge**: Maps tier to shadcn Badge variant + custom classes for business (amber) and enterprise (purple)
4. **StepFlow**: Compound component pattern (`StepFlow.Step`), auto-numbers steps, vertical connector line with `absolute` positioning, mobile-friendly no-scroll design
5. **ComparisonTable**: First column bold text-foreground, other columns text-muted-foreground, overflow-x-auto wrapper for mobile horizontal scroll INSIDE component
6. **Screenshot**: Next/Image with `fill` in aspect-video container, optional hotspots array rendered as numbered circles with `title` attribute (no client JS), caption below
7. **VideoEmbed**: Detects provider from URL (YouTube/Loom/MP4), lazy iframe for embeds, native `<video controls>` for MP4, sr-only captions text
8. **ProcessDiagram**: CSS grid auto-flow, horizontal on desktop (`sm:flex`) with ChevronRight arrows, vertical on mobile with ChevronDown arrows
9. **FeatureCard**: Async server component, calls `getFeatureBySlug()`, renders error placeholder if not found, uses shadcn Card + PlanBadge + Link to feature.route

**Sysadmin-only blocks**:
10. **CopyButton**: ONLY client component ('use client'), useState for 2s copied state, navigator.clipboard.writeText, Copy/Check icon toggle
11. **CodeBlock**: Server component wrapper, header bar with language badge and CopyButton island, no syntax highlighting (just monospace), copyable prop defaults true
12. **ApiTable**: Fixed 4-column layout (Action/Role Guard/Input Schema/Return Type), first column font-mono for action names
13. **RlsPolicyBox**: Optional name header, pre/code block for SQL, no syntax highlighting
14. **PrismaModelRef**: Card with model name header, GitHub link to schema.prisma, optional fields array rendered as `<ul>` with font-mono

**Component map** (mdx-components.tsx):
- `baseComponents`: Overrides for all standard HTML elements (h1-h4, p, ul, ol, li, a, code, pre, blockquote, table) with Tailwind prose-like styling using shadcn variables
- `clientComponents`: Spreads baseComponents + adds 9 shared blocks
- `sysadminComponents`: Spreads clientComponents + adds 4 sysadmin blocks + overrides `pre` to auto-wrap with CodeBlock

**Key decisions**:
- Only CopyButton is client-side — isolated as island to keep 13 other components server-rendered for performance
- No shiki/prism syntax highlighting — adds bundle weight and RSC complexity, monospace is readable enough for sysadmin docs
- Used compound component pattern for StepFlow to enable `<StepFlow><StepFlow.Step title="...">` syntax in MDX
- Override `pre` in sysadminComponents to auto-wrap code blocks while keeping simple `pre` in clientComponents

### Task 3: Create example MDX files and templates
- **Duration**: ~94s
- **Commit**: `aeaf36af`
- **Files created**: 4 MDX files
- **What was built**:

**Client docs** (docs-content/client/):
- `load-management.mdx`: Real example (~500 words, plain English for fleet owners)
  - Uses all shared blocks: Callout (info variant), StepFlow (4 steps), ProcessDiagram (5-state workflow), ComparisonTable (3 dispatch methods), Screenshot (with 3 hotspots), KeyboardShortcut (3 shortcuts), FeatureCard (route-planning), PlanBadge (free tier)
  - Demonstrates infographic style: visual hierarchy, scannable content, action-oriented language
  - Frontmatter validates: slug matches registry, 5 min read time, lastReviewed today
- `_template.mdx`: Annotated template showing usage of all 9 shared blocks with inline comments explaining props, variants, and best practices

**Sysadmin docs** (docs-content/sysadmin/):
- `load-management.mdx`: Technical reference (~800 words, engineering depth)
  - Uses all sysadmin blocks: ApiTable (6 server actions), PrismaModelRef (Load model with 20 fields), ProcessDiagram (status workflow), RlsPolicyBox (tenant isolation policy), CodeBlock (TypeScript examples with createLoad action)
  - Security callouts: RLS bypass warning (danger variant), driver access control (warning variant)
  - Documents mobile API endpoints, rate confirmation PDF, RouteStop integration
  - Frontmatter includes engineeringOwner: "Platform Team", securityNotes array with 3 items
- `_template.mdx`: Comprehensive engineering template with sections for server actions, schema, workflows, RLS policies, code examples, security, mobile APIs, cron jobs, troubleshooting, performance, testing

Both examples use `slug: load-management` which exists in the feature registry (verified at line 16 of feature-registry.ts).

**Key decision**: Removed .gitkeep files and created substantive examples (not stubs) to serve as real documentation that can ship with the Help Center and SysAdmin KB.

## Self-Check: PASSED

All created files verified:

```bash
# Dependencies installed
✓ next-mdx-remote: ^5.0.0 in package.json
✓ gray-matter, rehype-slug, rehype-autolink-headings installed

# Core utilities
✓ apps/web/src/lib/docs/frontmatter-schema.ts (exists, exports clientFrontmatterSchema + sysadminFrontmatterSchema)
✓ apps/web/src/lib/docs/render-mdx.ts (exists, exports renderClientDoc + renderSysadminDoc)

# Block components
✓ apps/web/src/components/docs/blocks/Callout.tsx
✓ apps/web/src/components/docs/blocks/KeyboardShortcut.tsx
✓ apps/web/src/components/docs/blocks/PlanBadge.tsx
✓ apps/web/src/components/docs/blocks/StepFlow.tsx
✓ apps/web/src/components/docs/blocks/ComparisonTable.tsx
✓ apps/web/src/components/docs/blocks/Screenshot.tsx
✓ apps/web/src/components/docs/blocks/VideoEmbed.tsx
✓ apps/web/src/components/docs/blocks/ProcessDiagram.tsx
✓ apps/web/src/components/docs/blocks/FeatureCard.tsx
✓ apps/web/src/components/docs/blocks/sysadmin/CopyButton.tsx
✓ apps/web/src/components/docs/blocks/sysadmin/CodeBlock.tsx
✓ apps/web/src/components/docs/blocks/sysadmin/ApiTable.tsx
✓ apps/web/src/components/docs/blocks/sysadmin/RlsPolicyBox.tsx
✓ apps/web/src/components/docs/blocks/sysadmin/PrismaModelRef.tsx

# Component map
✓ apps/web/src/components/docs/mdx-components.tsx (exports clientComponents + sysadminComponents)

# MDX content
✓ docs-content/client/load-management.mdx (500+ words, valid frontmatter)
✓ docs-content/client/_template.mdx (annotated template)
✓ docs-content/sysadmin/load-management.mdx (800+ words, valid frontmatter with engineeringOwner)
✓ docs-content/sysadmin/_template.mdx (comprehensive template)

# Commits
✓ 037e38e9 (Task 1: MDX dependencies + render utilities)
✓ 8b9150f8 (Task 2: 14 block components + component maps)
✓ aeaf36af (Task 3: Example MDX docs + templates)

# TypeScript
✓ No type errors in any new files (verified: cd apps/web && npx tsc --noEmit)
```

## Technical Highlights

1. **Server-first architecture**: 13 of 14 components are server-rendered, only CopyButton is client for clipboard interaction. Keeps bundle small and initial paint fast.

2. **Feature registry integration**: `renderClientDoc` and `renderSysadminDoc` cross-check slugs against the feature registry at compile time, ensuring docs stay in sync with actual features.

3. **Zod frontmatter validation**: Strict validation catches mistakes early (e.g., invalid date format, missing required fields, summary >300 chars). Error messages include field path and reason.

4. **Responsive design**: All blocks work at 375px width without horizontal page scroll. Tables/code blocks use internal overflow-x-auto, ProcessDiagram switches to vertical layout on mobile, StepFlow is naturally mobile-friendly.

5. **Dark mode support**: Every component uses shadcn CSS variables (text-foreground, bg-muted, border-border, etc.) so they automatically adapt to light/dark theme without additional code.

6. **Accessibility**: Callout uses proper ARIA roles (alert for warning/danger, note for others), Screenshot has required alt text, VideoEmbed includes sr-only captions, KeyboardShortcut uses semantic `<kbd>`.

7. **Rehype plugins**: Auto-generate heading IDs and wrap headings in anchor links for deep-linking to sections.

## Next Steps

This MDX component library and rendering pipeline is ready for integration into:

1. **Quick 291**: Build Help Center UI (client-facing article list, search, categories, breadcrumbs)
2. **Quick 292**: Build SysAdmin Knowledge Base UI (technical article list, search, engineering sidebar)

Both can now import `renderClientDoc` and `renderSysadminDoc` to render MDX content with the full component library. The example load-management articles can ship as real documentation.

## Related

- Feature Registry: apps/web/src/lib/docs/feature-registry.ts (6 features seeded, load-management at line 16)
- Shadcn UI: apps/web/src/components/ui/ (Card, Badge, Alert used by blocks)
- Next.js: Apps Router with RSC support for server-only rendering
