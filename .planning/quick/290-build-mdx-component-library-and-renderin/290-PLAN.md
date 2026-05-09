---
phase: quick-290
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
  - apps/web/src/lib/docs/frontmatter-schema.ts
  - apps/web/src/lib/docs/render-mdx.ts
  - apps/web/src/components/docs/mdx-components.tsx
  - apps/web/src/components/docs/blocks/Callout.tsx
  - apps/web/src/components/docs/blocks/KeyboardShortcut.tsx
  - apps/web/src/components/docs/blocks/PlanBadge.tsx
  - apps/web/src/components/docs/blocks/StepFlow.tsx
  - apps/web/src/components/docs/blocks/ComparisonTable.tsx
  - apps/web/src/components/docs/blocks/Screenshot.tsx
  - apps/web/src/components/docs/blocks/VideoEmbed.tsx
  - apps/web/src/components/docs/blocks/ProcessDiagram.tsx
  - apps/web/src/components/docs/blocks/FeatureCard.tsx
  - apps/web/src/components/docs/blocks/sysadmin/ApiTable.tsx
  - apps/web/src/components/docs/blocks/sysadmin/RlsPolicyBox.tsx
  - apps/web/src/components/docs/blocks/sysadmin/PrismaModelRef.tsx
  - apps/web/src/components/docs/blocks/sysadmin/CodeBlock.tsx
  - apps/web/src/components/docs/blocks/sysadmin/CopyButton.tsx
  - docs-content/client/load-management.mdx
  - docs-content/client/_template.mdx
  - docs-content/sysadmin/load-management.mdx
  - docs-content/sysadmin/_template.mdx
autonomous: true
must_haves:
  truths:
    - "renderClientDoc(slug) returns frontmatter + rendered MDX content for client docs"
    - "renderSysadminDoc(slug) returns frontmatter + rendered MDX content with sysadmin-specific blocks"
    - "All blocks use shadcn CSS variables (text-foreground, bg-muted, etc.) for dark/light mode"
    - "FeatureCard auto-fills from feature registry or shows error placeholder"
    - "Screenshot requires alt and caption props, uses Next/Image"
    - "CodeBlock has copy button without client-side syntax highlighting library"
  artifacts:
    - path: "apps/web/src/lib/docs/render-mdx.ts"
      provides: "renderClientDoc and renderSysadminDoc server utilities"
      exports: ["renderClientDoc", "renderSysadminDoc"]
    - path: "apps/web/src/components/docs/mdx-components.tsx"
      provides: "Component maps for client and sysadmin docs"
      exports: ["clientComponents", "sysadminComponents"]
    - path: "apps/web/src/lib/docs/frontmatter-schema.ts"
      provides: "Zod schemas for client and sysadmin frontmatter"
      exports: ["clientFrontmatterSchema", "sysadminFrontmatterSchema"]
  key_links:
    - from: "apps/web/src/lib/docs/render-mdx.ts"
      to: "apps/web/src/components/docs/mdx-components.tsx"
      via: "imports clientComponents/sysadminComponents"
    - from: "apps/web/src/components/docs/blocks/FeatureCard.tsx"
      to: "apps/web/src/lib/docs/get-features.ts"
      via: "getFeatureBySlug lookup"
---

<objective>
Build MDX component library and rendering pipeline for client Help Center and SysAdmin knowledge base documentation.

Purpose: Create a shared visual block library with audience-specific extensions that both client docs (infographic-style) and sysadmin docs (code-friendly) will use. This enables rendering MDX content with custom components for the Help Center (Prompt 3) and SysAdmin knowledge base (Prompt 4).

Output: 14 MDX block components, 2 render utilities, 2 frontmatter schemas, 2 example docs, 2 templates.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/docs/feature-registry.ts
@apps/web/src/lib/docs/feature-registry-schema.ts
@apps/web/src/lib/docs/get-features.ts
@apps/web/src/components/ui/card.tsx
@apps/web/src/components/ui/badge.tsx
@apps/web/src/components/ui/alert.tsx
@apps/web/src/app/(owner)/actions/loads.ts
@apps/web/prisma/schema.prisma (Load model at line 984)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install dependencies, create frontmatter schemas and render utilities</name>
  <files>
    apps/web/package.json
    apps/web/src/lib/docs/frontmatter-schema.ts
    apps/web/src/lib/docs/render-mdx.ts
  </files>
  <action>
1. Install dependencies in apps/web/:
   ```bash
   cd apps/web && npm install next-mdx-remote@^5 gray-matter rehype-slug rehype-autolink-headings
   ```
   Skip shiki (adds bundle weight, RSC complexity).

2. Create `apps/web/src/lib/docs/frontmatter-schema.ts`:
   - Import `z` from 'zod'
   - `clientFrontmatterSchema`: slug (kebab-case regex), title (string), summary (string max 300), lastReviewed (ISO date string), estimatedReadMinutes (number 1-60), videoUrl (optional URL string)
   - `sysadminFrontmatterSchema`: extends client schema with engineeringOwner (string), runbookUrl (optional string), securityNotes (optional string array)
   - Export both schemas and inferred types: `ClientFrontmatter`, `SysadminFrontmatter`

3. Create `apps/web/src/lib/docs/render-mdx.ts`:
   - Add 'server-only' import at top
   - Import `compileMDX` from 'next-mdx-remote/rsc'
   - Import `matter` from 'gray-matter'
   - Import `fs/promises` for reading files
   - Import `path` for joining paths
   - Import frontmatter schemas from './frontmatter-schema'
   - Import `clientComponents, sysadminComponents` from '@/components/docs/mdx-components'
   - Import `getFeatureBySlug` from './get-features'
   - Import rehypeSlug and rehypeAutolinkHeadings

   Define `DOCS_ROOT = path.join(process.cwd(), 'docs-content')`

   `renderClientDoc(slug: string)`:
   - Read file at `{DOCS_ROOT}/client/{slug}.mdx`
   - Parse with gray-matter
   - Validate frontmatter with clientFrontmatterSchema.safeParse - throw descriptive error if invalid
   - Cross-check: `getFeatureBySlug(frontmatter.slug)` - throw if slug not in registry
   - Compile MDX with `compileMDX({ source, components: clientComponents, options: { mdxOptions: { rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]] } } })`
   - Return `{ frontmatter, content, feature }`

   `renderSysadminDoc(slug: string)`:
   - Same pattern but reads from `{DOCS_ROOT}/sysadmin/{slug}.mdx`
   - Uses sysadminFrontmatterSchema
   - Uses sysadminComponents
   - Returns same shape

   Both functions throw clear errors:
   - "Doc file not found: {path}" for ENOENT
   - "Invalid frontmatter in {slug}: {zod errors}" for validation failures
   - "Feature slug '{slug}' not found in registry" for missing registry entry
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` - no type errors in new files.
    Verify dependencies added: `grep "next-mdx-remote" apps/web/package.json`
  </verify>
  <done>
    - next-mdx-remote, gray-matter, rehype-slug, rehype-autolink-headings installed
    - frontmatter-schema.ts exports clientFrontmatterSchema, sysadminFrontmatterSchema, types
    - render-mdx.ts exports renderClientDoc, renderSysadminDoc with proper error handling
  </done>
</task>

<task type="auto">
  <name>Task 2: Build all MDX block components and component map</name>
  <files>
    apps/web/src/components/docs/blocks/Callout.tsx
    apps/web/src/components/docs/blocks/KeyboardShortcut.tsx
    apps/web/src/components/docs/blocks/PlanBadge.tsx
    apps/web/src/components/docs/blocks/StepFlow.tsx
    apps/web/src/components/docs/blocks/ComparisonTable.tsx
    apps/web/src/components/docs/blocks/Screenshot.tsx
    apps/web/src/components/docs/blocks/VideoEmbed.tsx
    apps/web/src/components/docs/blocks/ProcessDiagram.tsx
    apps/web/src/components/docs/blocks/FeatureCard.tsx
    apps/web/src/components/docs/blocks/sysadmin/ApiTable.tsx
    apps/web/src/components/docs/blocks/sysadmin/RlsPolicyBox.tsx
    apps/web/src/components/docs/blocks/sysadmin/PrismaModelRef.tsx
    apps/web/src/components/docs/blocks/sysadmin/CodeBlock.tsx
    apps/web/src/components/docs/blocks/sysadmin/CopyButton.tsx
    apps/web/src/components/docs/mdx-components.tsx
  </files>
  <action>
Build blocks in order (simple to complex). ALL blocks are server components unless noted. Use shadcn CSS variables everywhere (text-foreground, bg-muted, bg-card, border-border, text-muted-foreground). No hardcoded colors.

**1. Callout.tsx** (server component)
- Props: `variant: 'info' | 'tip' | 'success' | 'warning' | 'danger'`, `children: React.ReactNode`, optional `title: string`
- Import lucide icons: Info, Lightbulb, CheckCircle2, AlertTriangle, AlertOctagon
- Variant styles (use shadcn variables):
  - info: bg-blue-500/10 border-blue-500/20 text-foreground, icon: Info text-blue-500
  - tip: bg-amber-500/10 border-amber-500/20, icon: Lightbulb text-amber-500
  - success: bg-green-500/10 border-green-500/20, icon: CheckCircle2 text-green-500
  - warning: bg-yellow-500/10 border-yellow-500/20, icon: AlertTriangle text-yellow-500
  - danger: bg-red-500/10 border-red-500/20, icon: AlertOctagon text-red-500
- Structure: rounded-lg border p-4 flex gap-3, icon at left (flex-shrink-0), content flex-1
- ARIA: role="alert" for warning/danger, role="note" for others

**2. KeyboardShortcut.tsx** (server component)
- Props: `keys: string` (e.g., "Cmd+K" or "Ctrl+Shift+P")
- Split by "+" and render each as `<kbd>` with: px-1.5 py-0.5 text-xs font-mono bg-muted border border-border rounded shadow-sm
- Join with "+" text between kbd elements

**3. PlanBadge.tsx** (server component)
- Props: `tier: 'free' | 'starter' | 'pro' | 'business' | 'enterprise'`
- Use existing Badge component from @/components/ui/badge
- Color mapping: free=secondary, starter=outline, pro=default, business=default (with bg-amber-500), enterprise=default (with bg-purple-500)
- Capitalize tier name

**4. StepFlow.tsx** (server component)
- Props: `children: React.ReactNode` (expects StepFlow.Step children)
- StepFlow.Step subcomponent: `{ title: string, children: React.ReactNode }`
- Auto-number steps using React.Children.map with index
- Render vertical connector line: absolute left-4 top-8 bottom-0 w-0.5 bg-border (skip on last item)
- Each step: relative pl-12, number circle (w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center absolute left-0)
- Mobile-friendly: no horizontal scroll needed

**5. ComparisonTable.tsx** (server component)
- Props: `headers: string[]`, `rows: string[][]`
- Wrapper: overflow-x-auto for mobile horizontal scroll INSIDE the component only
- Table: w-full border-collapse
- th: bg-muted text-left p-3 border-b border-border font-medium text-sm
- td: p-3 border-b border-border text-sm text-muted-foreground
- First column: font-medium text-foreground

**6. Screenshot.tsx** (server component)
- Props: `src: string` (required), `alt: string` (required), `caption: string` (required), `hotspots?: Array<{ x: number; y: number; label: string }>`
- Use Next/Image with fill, relative container with aspect-video
- Caption: text-sm text-muted-foreground mt-2 text-center
- Hotspots: position absolute, styled as numbered pins (w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center), positioned with `left: {x}%` and `top: {y}%` transform -translate-x-1/2 -translate-y-1/2
- Tooltip on hover showing label (use title attribute for simplicity, avoid client JS)

**7. VideoEmbed.tsx** (server component)
- Props: `url: string`, `title: string`, `captions?: string` (for accessibility description)
- Detect provider from URL: youtube.com/youtu.be -> YouTube embed, loom.com -> Loom embed, else assume MP4
- YouTube/Loom: lazy iframe with loading="lazy", no autoplay, aspect-video container
- MP4: native video element with controls, preload="metadata"
- Add sr-only span with captions text for screen readers

**8. ProcessDiagram.tsx** (server component)
- Props: `steps: Array<{ label: string; description?: string }>`
- CSS grid layout: auto-flow column, gap-4
- Each step: flex-col items-center, label in rounded bg-card border p-3 text-center
- Arrows between steps: SVG arrow (simple triangle pointing right), text-muted-foreground
- Mobile: wrap to vertical (grid-cols-1 on mobile, with downward arrows)
- Use @media (min-width: 640px) for horizontal layout via Tailwind sm: prefix

**9. FeatureCard.tsx** (server component)
- Props: `slug: string`
- Import `getFeatureBySlug` from '@/lib/docs/get-features'
- Lookup feature by slug
- If not found: render error placeholder - rounded border border-destructive/50 bg-destructive/10 p-4, text "Feature not found: {slug}"
- If found: use Card, CardHeader, CardContent from @/components/ui/card
  - CardHeader: feature.name as title, PlanBadge with feature.planTier
  - CardContent: feature.shortDescription
  - Footer: Link to feature.route with "Go to feature" text and arrow icon

**SYSADMIN BLOCKS** (in apps/web/src/components/docs/blocks/sysadmin/):

**10. CopyButton.tsx** (CLIENT component - 'use client')
- This is the ONLY client component - isolated for the copy functionality
- Props: `text: string`
- State: copied (boolean), resets after 2s
- Button with Copy icon, changes to Check icon when copied
- Uses navigator.clipboard.writeText

**11. CodeBlock.tsx** (server component)
- Props: `language?: string`, `children: string`, `copyable?: boolean` (default true)
- No client-side syntax highlighting - clean monospace pre/code
- Wrapper: relative rounded-lg bg-muted border border-border overflow-hidden
- Header bar: flex justify-between items-center px-4 py-2 border-b border-border bg-muted/50
  - Language badge: text-xs text-muted-foreground uppercase
  - CopyButton (client island) if copyable
- Code area: p-4 overflow-x-auto, pre with font-mono text-sm text-foreground whitespace-pre

**12. ApiTable.tsx** (server component)
- Props: `rows: Array<{ name: string; roleGuard: string; inputSchema: string; returnType: string }>`
- Table layout similar to ComparisonTable but with fixed columns: Action, Role Guard, Input Schema, Return Type
- name column: font-mono text-sm text-foreground
- Other columns: text-muted-foreground

**13. RlsPolicyBox.tsx** (server component)
- Props: `policy: string`, `name?: string`
- Wrapper: rounded-lg bg-muted border border-border overflow-hidden
- Optional header with policy name
- pre/code block with font-mono text-sm, subtle manual syntax tinting via Tailwind:
  - Keywords (CREATE, POLICY, ON, FOR, USING, WITH CHECK): text-blue-500 dark:text-blue-400
  - No actual parsing - just display as monospace, the SQL will be readable without highlighting

**14. PrismaModelRef.tsx** (server component)
- Props: `model: string`, `fields?: string[]` (optional subset of fields to show)
- Links to schema: "View in schema.prisma" (could link to GitHub or internal route)
- If fields provided, show as bullet list: ul with font-mono text-sm items
- Card-style display with model name as header

**15. mdx-components.tsx** (server component map)
- Import all block components
- Override base HTML elements with Tailwind prose-like styling:
  - h1: text-3xl font-bold tracking-tight text-foreground mt-8 mb-4
  - h2: text-2xl font-semibold tracking-tight text-foreground mt-8 mb-3
  - h3: text-xl font-semibold text-foreground mt-6 mb-2
  - h4: text-lg font-medium text-foreground mt-4 mb-2
  - p: text-base leading-7 text-muted-foreground mb-4 max-w-prose
  - ul: list-disc pl-6 mb-4 space-y-2 text-muted-foreground max-w-prose
  - ol: list-decimal pl-6 mb-4 space-y-2 text-muted-foreground max-w-prose
  - li: leading-7
  - a: text-primary underline underline-offset-4 hover:text-primary/80
  - code (inline): px-1.5 py-0.5 bg-muted rounded text-sm font-mono
  - pre: (handled by CodeBlock for sysadmin, basic styling for client)
  - blockquote: border-l-4 border-border pl-4 italic text-muted-foreground
  - img: (handled by Screenshot)
  - table/thead/tbody/tr/th/td: styled like ComparisonTable

- Export `clientComponents`: base elements + Callout, StepFlow, FeatureCard, ComparisonTable, Screenshot, VideoEmbed, PlanBadge, KeyboardShortcut, ProcessDiagram

- Export `sysadminComponents`: spread clientComponents + ApiTable, RlsPolicyBox, PrismaModelRef, CodeBlock (override pre to use CodeBlock)
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` - no type errors.
    Verify all component files exist: `ls apps/web/src/components/docs/blocks/`
    Verify sysadmin blocks: `ls apps/web/src/components/docs/blocks/sysadmin/`
  </verify>
  <done>
    - 14 block components created (10 shared, 4 sysadmin-only)
    - CopyButton is the only 'use client' component
    - mdx-components.tsx exports clientComponents and sysadminComponents
    - All components use shadcn CSS variables for theming
    - All components work at 375px without horizontal page scroll (except internal scroll in tables/code)
  </done>
</task>

<task type="auto">
  <name>Task 3: Create example MDX files and templates</name>
  <files>
    docs-content/client/load-management.mdx
    docs-content/client/_template.mdx
    docs-content/sysadmin/load-management.mdx
    docs-content/sysadmin/_template.mdx
  </files>
  <action>
Remove .gitkeep files first, then create real content.

**1. docs-content/client/load-management.mdx** (~500 words, plain English for non-technical fleet owners)

```mdx
---
slug: load-management
title: Managing Your Loads
summary: Learn how to create, assign, and track loads from pickup to delivery in DriveCommand.
lastReviewed: "2026-05-09T00:00:00Z"
estimatedReadMinutes: 5
---

# Managing Your Loads

<Callout variant="info">
Loads are the heart of your dispatch operation. Each load represents a shipment from origin to destination.
</Callout>

## What is a Load?

A load in DriveCommand represents a single shipment... [explain in fleet owner terms]

## Creating a New Load

<StepFlow>
  <StepFlow.Step title="Navigate to Loads">
    From the sidebar, click **Loads** to open the load management screen.
  </StepFlow.Step>
  <StepFlow.Step title="Click Create Load">
    Click the **+ New Load** button in the top right corner.
  </StepFlow.Step>
  <StepFlow.Step title="Enter Load Details">
    Fill in the customer, origin, destination, pickup date, and rate. [details]
  </StepFlow.Step>
  <StepFlow.Step title="Dispatch or Save">
    Click **Save as Pending** to save for later, or **Dispatch Now** to assign immediately.
  </StepFlow.Step>
</StepFlow>

## Load Status Workflow

<ProcessDiagram steps={[
  { label: "Pending", description: "Awaiting dispatch" },
  { label: "Dispatched", description: "Driver assigned" },
  { label: "In Transit", description: "On the road" },
  { label: "Delivered", description: "At destination" },
  { label: "Invoiced", description: "Billed to customer" }
]} />

## Dispatch Methods Comparison

<ComparisonTable
  headers={["Method", "Best For", "Time to Dispatch"]}
  rows={[
    ["Manual Dispatch", "One-off loads, special handling", "2-3 minutes"],
    ["Route Assignment", "Multi-stop trips, regular lanes", "30 seconds"],
    ["AI Suggested", "Optimized driver/truck matching", "Instant"]
  ]}
/>

## The Load Detail Screen

<Screenshot
  src="/docs/images/load-detail-screen.png"
  alt="Load detail screen showing status, route info, and action buttons"
  caption="The load detail screen gives you full visibility into shipment status"
  hotspots={[
    { x: 15, y: 20, label: "Load status badge" },
    { x: 85, y: 20, label: "Quick actions menu" },
    { x: 50, y: 60, label: "Route timeline" }
  ]}
/>

## Keyboard Shortcuts

Speed up your workflow with these shortcuts:

- <KeyboardShortcut keys="Cmd+N" /> - Create new load
- <KeyboardShortcut keys="Cmd+D" /> - Dispatch selected load

## Related Features

<FeatureCard slug="route-planning" />

<Callout variant="tip" title="Pro Tip">
Link loads to routes for automatic stop creation and optimized sequencing.
</Callout>

<PlanBadge tier="pro" /> This feature requires a Pro plan or higher.
```

**2. docs-content/client/_template.mdx**

Template with comments explaining each block:

```mdx
---
# Required frontmatter fields
slug: feature-slug-here  # Must match feature registry slug
title: Feature Title
summary: One-sentence summary for search results (max 300 chars)
lastReviewed: "2026-01-01T00:00:00Z"  # ISO date
estimatedReadMinutes: 5  # 1-60

# Optional
videoUrl: https://www.loom.com/share/...
---

# {title}

{/* Use Callout for important notices */}
<Callout variant="info">
Introductory context about this feature.
</Callout>

## Section Heading

{/* Use StepFlow for multi-step processes */}
<StepFlow>
  <StepFlow.Step title="Step 1 Title">
    Step 1 description...
  </StepFlow.Step>
  <StepFlow.Step title="Step 2 Title">
    Step 2 description...
  </StepFlow.Step>
</StepFlow>

{/* Use ProcessDiagram for workflows/lifecycles */}
<ProcessDiagram steps={[
  { label: "State 1" },
  { label: "State 2" }
]} />

{/* Use ComparisonTable for comparing options */}
<ComparisonTable
  headers={["Option", "Pros", "Cons"]}
  rows={[
    ["Option A", "Pro", "Con"],
    ["Option B", "Pro", "Con"]
  ]}
/>

{/* Use Screenshot with required alt and caption */}
<Screenshot
  src="/docs/images/screenshot.png"
  alt="Descriptive alt text for accessibility"
  caption="Caption shown below the image"
  hotspots={[
    { x: 50, y: 50, label: "Callout label" }
  ]}
/>

{/* Use VideoEmbed for tutorials */}
<VideoEmbed
  url="https://www.loom.com/share/..."
  title="Video title"
  captions="Description of video content for screen readers"
/>

{/* Use KeyboardShortcut for hotkeys */}
<KeyboardShortcut keys="Cmd+K" />

{/* Use FeatureCard to link related features */}
<FeatureCard slug="related-feature-slug" />

{/* Use PlanBadge to show plan requirements */}
<PlanBadge tier="pro" />

{/* Callout variants: info, tip, success, warning, danger */}
<Callout variant="warning" title="Warning Title">
Warning message content.
</Callout>
```

**3. docs-content/sysadmin/load-management.mdx** (technical depth)

```mdx
---
slug: load-management
title: Load Management — Technical Reference
summary: Server actions, database schema, and RLS policies for the load management subsystem.
lastReviewed: "2026-05-09T00:00:00Z"
estimatedReadMinutes: 8
engineeringOwner: "Platform Team"
securityNotes:
  - "All load queries are tenant-scoped via RLS"
  - "bypass_rls only used in cron jobs with explicit tenant context"
---

# Load Management — Technical Reference

<Callout variant="warning">
This documentation is for internal engineering use. For user-facing docs, see the client Help Center.
</Callout>

## Server Actions

The load management feature is implemented via server actions in `src/app/(owner)/actions/loads.ts`.

<ApiTable rows={[
  { name: "createLoad", roleGuard: "OWNER | MANAGER", inputSchema: "loadCreateSchema", returnType: "ActionState" },
  { name: "updateLoad", roleGuard: "OWNER | MANAGER", inputSchema: "loadUpdateSchema", returnType: "ActionState" },
  { name: "updateLoadStatus", roleGuard: "OWNER | MANAGER", inputSchema: "string (status)", returnType: "ActionState" },
  { name: "dispatchLoad", roleGuard: "OWNER | MANAGER", inputSchema: "dispatchLoadSchema", returnType: "ActionState" },
  { name: "deleteLoad", roleGuard: "OWNER | MANAGER", inputSchema: "string (id)", returnType: "ActionState" },
  { name: "revertLoadStatus", roleGuard: "OWNER | MANAGER", inputSchema: "string (id)", returnType: "ActionState" }
]} />

## Database Schema

<PrismaModelRef model="Load" fields={[
  "id: UUID (primary key)",
  "tenantId: UUID (foreign key)",
  "loadNumber: String (LD-NNNN format)",
  "status: LoadStatus enum",
  "origin / destination: String",
  "pickupLat/Lng, deliveryLat/Lng: Decimal",
  "routeId: UUID (optional FK to Route)",
  "driverId: UUID (optional FK to Driver)",
  "truckId: UUID (optional FK to Truck)"
]} />

## Status Workflow

<ProcessDiagram steps={[
  { label: "PENDING", description: "Initial state" },
  { label: "DISPATCHED", description: "Driver + truck assigned" },
  { label: "PICKED_UP", description: "Driver confirmed pickup" },
  { label: "IN_TRANSIT", description: "En route to destination" },
  { label: "DELIVERED", description: "Delivery confirmed" },
  { label: "INVOICED", description: "Invoice linked" }
]} />

## RLS Policy

<RlsPolicyBox name="tenant_isolation_policy" policy={`
CREATE POLICY tenant_isolation_policy ON "Load"
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  );
`} />

## Example: Creating a Load

<CodeBlock language="typescript">
{`// Server action signature
export async function createLoad(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Validation, creation, RouteStop sync...
}`}
</CodeBlock>

<Callout variant="danger" title="Security Note">
Never use `bypass_rls` in user-facing code paths. It is reserved for system cron jobs that explicitly set tenant context.
</Callout>

## Related Models

- <PrismaModelRef model="RouteStop" /> — Pickup/delivery stops auto-synced when load assigned to route
- <PrismaModelRef model="Invoice" /> — Must exist before load can transition to INVOICED
```

**4. docs-content/sysadmin/_template.mdx**

```mdx
---
# Required frontmatter (same as client)
slug: feature-slug-here
title: Feature Title — Technical Reference
summary: Technical summary for engineering search
lastReviewed: "2026-01-01T00:00:00Z"
estimatedReadMinutes: 8

# Sysadmin-specific fields
engineeringOwner: "Team Name"
runbookUrl: https://notion.so/runbook/...  # Optional
securityNotes:  # Optional
  - "Security consideration 1"
  - "Security consideration 2"
---

# {title} — Technical Reference

<Callout variant="warning">
Internal engineering documentation.
</Callout>

## Server Actions

{/* Document all server actions for this feature */}
<ApiTable rows={[
  { name: "actionName", roleGuard: "ROLE", inputSchema: "schemaName", returnType: "ReturnType" }
]} />

## Database Schema

{/* Reference relevant Prisma models */}
<PrismaModelRef model="ModelName" fields={[
  "field1: Type",
  "field2: Type"
]} />

## RLS Policy

{/* Document tenant isolation policy */}
<RlsPolicyBox name="policy_name" policy={`
CREATE POLICY policy_name ON "Table"
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
`} />

## Code Examples

{/* Include relevant code snippets */}
<CodeBlock language="typescript">
{`// Example code
const example = 'code';`}
</CodeBlock>

{/* Security warnings */}
<Callout variant="danger" title="Security">
Security-critical information here.
</Callout>

{/* All client blocks also available: StepFlow, ProcessDiagram, ComparisonTable, etc. */}
```
  </action>
  <verify>
    Verify files exist and are valid MDX:
    ```bash
    ls -la docs-content/client/
    ls -la docs-content/sysadmin/
    head -20 docs-content/client/load-management.mdx
    ```
    Run tsc to ensure no import errors: `cd apps/web && npx tsc --noEmit`
  </verify>
  <done>
    - docs-content/client/load-management.mdx: Real example with ~500 words demonstrating all client blocks
    - docs-content/client/_template.mdx: Template with comments for each block type
    - docs-content/sysadmin/load-management.mdx: Technical reference with ApiTable, RlsPolicyBox, PrismaModelRef, CodeBlock
    - docs-content/sysadmin/_template.mdx: Sysadmin template with all block types documented
    - .gitkeep files removed
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `cd apps/web && npx tsc --noEmit` - zero type errors
2. All 14 block components exist in apps/web/src/components/docs/blocks/
3. mdx-components.tsx exports clientComponents and sysadminComponents
4. render-mdx.ts exports renderClientDoc and renderSysadminDoc
5. Both example MDX files have valid frontmatter matching their schemas
6. Feature registry cross-check works (load-management slug exists in registry)
</verification>

<success_criteria>
- next-mdx-remote ^5, gray-matter, rehype-slug, rehype-autolink-headings installed
- 14 MDX block components created with proper TypeScript types
- All blocks use shadcn CSS variables (no hardcoded colors)
- CopyButton is the only client component
- mdx-components.tsx exports two component maps
- renderClientDoc and renderSysadminDoc work with proper error handling
- Both example MDX files demonstrate realistic DriveCommand content
- Both templates include inline documentation
- All files pass TypeScript checking
</success_criteria>

<output>
After completion, create `.planning/quick/290-build-mdx-component-library-and-renderin/290-SUMMARY.md`
</output>
