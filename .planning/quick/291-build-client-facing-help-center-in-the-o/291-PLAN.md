---
phase: quick-291
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260509000001_doc_feedback/migration.sql
  - apps/web/src/actions/doc-feedback.ts
  - apps/web/scripts/build-search-index.ts
  - apps/web/package.json
  - apps/web/docs-content/client/load-management.mdx
  - apps/web/src/lib/docs/search-index.json
  - apps/web/src/components/help/HelpSearch.tsx
  - apps/web/src/app/(owner)/help/layout.tsx
  - apps/web/src/app/(owner)/help/page.tsx
  - apps/web/src/app/(owner)/help/[slug]/page.tsx
  - apps/web/src/app/(owner)/help/whats-new/page.tsx
  - apps/web/src/components/help/HelpButton.tsx
  - apps/web/src/components/help/HelpSheet.tsx
  - apps/web/src/components/help/FeedbackWidget.tsx
  - apps/web/src/components/ui/command.tsx
autonomous: true
must_haves:
  truths:
    - "User can open Help Center from /owner/help"
    - "User can search docs via Command+K shortcut or search input"
    - "User can read rendered MDX documentation"
    - "User can submit helpful/not helpful feedback on docs"
    - "User sees soft upgrade banner for plan-gated features"
    - "HelpButton opens HelpSheet with contextual search"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "DocFeedback model"
      contains: "model DocFeedback"
    - path: "apps/web/src/actions/doc-feedback.ts"
      provides: "submitDocFeedback server action"
      exports: ["submitDocFeedback"]
    - path: "apps/web/src/lib/docs/search-index.json"
      provides: "Build-time search index"
      min_lines: 5
    - path: "apps/web/src/components/help/HelpSearch.tsx"
      provides: "Fuse.js search with Command+K"
      min_lines: 50
    - path: "apps/web/src/app/(owner)/help/page.tsx"
      provides: "Help Center home page"
      min_lines: 30
  key_links:
    - from: "apps/web/src/components/help/HelpSearch.tsx"
      to: "search-index.json"
      via: "import and Fuse.js"
      pattern: "import.*search-index"
    - from: "apps/web/src/app/(owner)/help/[slug]/page.tsx"
      to: "apps/web/src/lib/docs/render-mdx.ts"
      via: "renderClientDoc"
      pattern: "renderClientDoc"
    - from: "apps/web/src/components/help/FeedbackWidget.tsx"
      to: "apps/web/src/actions/doc-feedback.ts"
      via: "server action"
      pattern: "submitDocFeedback"
---

<objective>
Build a client-facing Help Center in the Owner Portal with search, MDX rendering, and feedback collection.

Purpose: Give fleet owners self-service access to feature documentation, searchable via Command+K or sidebar, with feedback collection to improve docs quality.

Output: Fully functional Help Center at /owner/help with search, MDX doc rendering, plan-tier banners, and feedback widget.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/docs/feature-registry.ts — Feature registry with slug, name, category, planTier
@apps/web/src/lib/docs/render-mdx.ts — renderClientDoc function for MDX rendering
@apps/web/src/lib/docs/frontmatter-schema.ts — clientFrontmatterSchema validation
@apps/web/src/lib/docs/get-features.ts — getAllFeatures, getFeatureBySlug helpers
@apps/web/src/actions/support-tickets.ts — Server action pattern reference
@apps/web/prisma/migrations/20260429000001_tenant_self_onboarding/migration.sql — Migration pattern reference
@apps/web/src/app/(owner)/layout.tsx — Owner portal layout with auth
@apps/web/src/components/ui/sheet.tsx — Sheet component for HelpSheet
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add DocFeedback model and raw SQL migration</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260509000001_doc_feedback/migration.sql
  </files>
  <action>
1. Add DocFeedback model to schema.prisma after existing models:

```prisma
model DocFeedback {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @db.Uuid
  userId    String   @db.Uuid
  docSlug   String
  helpful   Boolean
  comment   String?
  createdAt DateTime @default(now()) @db.Timestamptz

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([docSlug])
}
```

2. Add reverse relation to Tenant model:
```prisma
docFeedback         DocFeedback[]
```

3. Create migration file at `prisma/migrations/20260509000001_doc_feedback/migration.sql`:

```sql
-- ============================================================
-- Migration: 20260509000001_doc_feedback
--
-- Purpose: Add DocFeedback table for Help Center feedback collection
-- ============================================================

-- Create DocFeedback table
CREATE TABLE IF NOT EXISTS "DocFeedback" (
    "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"  UUID        NOT NULL,
    "userId"    UUID        NOT NULL,
    "docSlug"   TEXT        NOT NULL,
    "helpful"   BOOLEAN     NOT NULL,
    "comment"   TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "DocFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocFeedback_tenantId_idx" ON "DocFeedback"("tenantId");
CREATE INDEX IF NOT EXISTS "DocFeedback_docSlug_idx" ON "DocFeedback"("docSlug");

DO $$ BEGIN
  ALTER TABLE "DocFeedback" ADD CONSTRAINT "DocFeedback_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies (tenant-scoped)
ALTER TABLE "DocFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocFeedback" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "DocFeedback"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "DocFeedback"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```
  </action>
  <verify>Run `cd apps/web && npx prisma validate` to confirm schema is valid. Check migration file exists.</verify>
  <done>DocFeedback model exists in schema.prisma with tenant relation, migration file follows idempotent RLS pattern.</done>
</task>

<task type="auto">
  <name>Task 2: Create submitDocFeedback server action</name>
  <files>apps/web/src/actions/doc-feedback.ts</files>
  <action>
Create server action following support-tickets.ts pattern:

```typescript
'use server';

import { requireAuth } from '@/lib/auth/supabase';
import { requireTenantId } from '@/lib/context/tenant-context';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const feedbackSchema = z.object({
  docSlug: z.string().min(1).max(100),
  helpful: z.boolean(),
  comment: z.string().max(1000).optional(),
});

export async function submitDocFeedback(data: {
  docSlug: string;
  helpful: boolean;
  comment?: string;
}): Promise<{ success: boolean; error?: string }> {
  const userId = await requireAuth();
  const tenantId = await requireTenantId();

  const validation = feedbackSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const { docSlug, helpful, comment } = validation.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.docFeedback.create({
        data: {
          tenantId,
          userId,
          docSlug,
          helpful,
          comment: comment ?? null,
        },
      });
    }, TX_OPTIONS);

    return { success: true };
  } catch (error) {
    logger.error('[submitDocFeedback] error:', error);
    return { success: false, error: 'Failed to submit feedback. Please try again.' };
  }
}
```
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` to confirm no type errors.</verify>
  <done>Server action exports submitDocFeedback with Zod validation and RLS bypass pattern.</done>
</task>

<task type="auto">
  <name>Task 3: Create search index build script and wire to package.json</name>
  <files>
    apps/web/scripts/build-search-index.ts
    apps/web/package.json
    apps/web/src/lib/docs/search-index.json
  </files>
  <action>
1. Create `apps/web/scripts/build-search-index.ts`:

```typescript
/**
 * Build-time script to generate search index from feature registry.
 * Indexes only: slug, name, shortDescription, category — NOT full MDX content.
 * Run via: npm run build:search-index
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

// Import features directly (raw array, no Zod overhead at build time)
import { features } from '../src/lib/docs/feature-registry';

interface SearchEntry {
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  portal: string;
  planTier: string;
  route: string;
}

const searchIndex: SearchEntry[] = features
  .filter((f) => f.requiresClientDoc && f.portal !== 'admin')
  .map((f) => ({
    slug: f.slug,
    name: f.name,
    shortDescription: f.shortDescription,
    category: f.category,
    portal: f.portal,
    planTier: f.planTier,
    route: f.route,
  }));

const outputPath = join(__dirname, '../src/lib/docs/search-index.json');
writeFileSync(outputPath, JSON.stringify(searchIndex, null, 2));

console.log(`Search index built: ${searchIndex.length} entries -> ${outputPath}`);
```

2. Update `apps/web/package.json` scripts:
   - Add: `"build:search-index": "tsx scripts/build-search-index.ts"`
   - Modify build script to: `"build": "npm run build:search-index && prisma generate && next build"`

3. Run the script to generate initial search-index.json:
   `cd apps/web && npm run build:search-index`
  </action>
  <verify>Run `cd apps/web && npm run build:search-index` and confirm `src/lib/docs/search-index.json` exists with feature entries.</verify>
  <done>Build script exists, package.json build includes search index generation, JSON file generated.</done>
</task>

<task type="auto">
  <name>Task 4: Install shadcn Command component and add Fuse.js</name>
  <files>
    apps/web/src/components/ui/command.tsx
    apps/web/package.json
  </files>
  <action>
1. Install shadcn Command component:
   `cd apps/web && npx shadcn@latest add command`
   (This adds cmdk dependency and creates command.tsx)

2. Install Fuse.js for fuzzy search:
   `cd apps/web && npm install fuse.js`

3. Verify command.tsx was created at `src/components/ui/command.tsx`
  </action>
  <verify>Confirm `src/components/ui/command.tsx` exists and `fuse.js` is in package.json dependencies.</verify>
  <done>Command component installed, Fuse.js added to dependencies.</done>
</task>

<task type="auto">
  <name>Task 5: Create docs-content/client directory with sample MDX</name>
  <files>apps/web/docs-content/client/load-management.mdx</files>
  <action>
1. Create directory: `mkdir -p apps/web/docs-content/client`

2. Create `apps/web/docs-content/client/load-management.mdx`:

```mdx
---
slug: load-management
title: Load Management
summary: Create, assign, and track loads with pickup/delivery stops, status workflow, and route assignment.
lastReviewed: "2026-05-09T00:00:00Z"
estimatedReadMinutes: 5
---

# Load Management

Manage your freight loads from creation to delivery with DriveCommand's load management system.

<FeatureVideo url="https://www.youtube.com/watch?v=example" />

## Overview

Load management is the core of your dispatch operations. Each load represents a shipment with:

- **Pickup and delivery stops** with addresses, contacts, and scheduling
- **Status workflow** tracking from Pending through Delivered
- **Route assignment** to organize multi-stop trips
- **Driver and truck assignment** for dispatch

<Callout type="info">
Loads can exist independently or be grouped into routes for multi-stop planning.
</Callout>

## Creating a Load

1. Navigate to **Loads** in the sidebar
2. Click **New Load**
3. Fill in the required fields:
   - Customer (from your CRM)
   - Pickup address and date
   - Delivery address and date
   - Rate and reference numbers

<Steps>
  <Step title="Select Customer">
    Choose from your existing customers or create a new one inline.
  </Step>
  <Step title="Add Pickup Stop">
    Enter the pickup address, contact name, phone, and scheduled date/time.
  </Step>
  <Step title="Add Delivery Stop">
    Enter the delivery address, contact info, and expected delivery window.
  </Step>
  <Step title="Set Rate">
    Enter the line haul rate. FSC and accessorials can be added later.
  </Step>
</Steps>

## Load Status Workflow

Loads progress through these statuses:

| Status | Meaning |
|--------|---------|
| Pending | Created but not yet dispatched |
| Dispatched | Assigned to driver, ready to start |
| In Transit | Driver has departed pickup |
| Delivered | Completed and ready for invoicing |
| Cancelled | Load was cancelled |

<RelatedFeatures slugs={["route-planning", "driver-my-route"]} />

## FAQ

<Accordion title="Can I edit a load after it's dispatched?">
Yes, you can edit load details until it's marked Delivered. Some fields like pickup address may require notifying the driver.
</Accordion>

<Accordion title="How do I assign a load to a route?">
When creating or editing a load, use the Route dropdown to assign it to an existing route or create a new one.
</Accordion>
```
  </action>
  <verify>Confirm `apps/web/docs-content/client/load-management.mdx` exists with valid frontmatter.</verify>
  <done>docs-content/client directory created with sample MDX file matching frontmatter schema.</done>
</task>

<task type="auto">
  <name>Task 6: Build HelpSearch component with Fuse.js and Command+K</name>
  <files>apps/web/src/components/help/HelpSearch.tsx</files>
  <action>
Create `apps/web/src/components/help/HelpSearch.tsx`:

```typescript
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Search, FileText, ArrowRight } from 'lucide-react';
import searchIndex from '@/lib/docs/search-index.json';

interface SearchEntry {
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  portal: string;
  planTier: string;
  route: string;
}

const fuseOptions = {
  keys: ['name', 'shortDescription', 'category'],
  threshold: 0.3,
  includeScore: true,
};

export function HelpSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  const fuse = useMemo(() => new Fuse(searchIndex as SearchEntry[], fuseOptions), []);

  const results = useMemo(() => {
    if (!query.trim()) return searchIndex as SearchEntry[];
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse]);

  // Command+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (slug: string) => {
    setOpen(false);
    setQuery('');
    router.push(`/owner/help/${slug}`);
  };

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchEntry[]> = {};
    for (const entry of results) {
      if (!groups[entry.category]) groups[entry.category] = [];
      groups[entry.category].push(entry);
    }
    return groups;
  }, [results]);

  const categoryLabels: Record<string, string> = {
    fleet: 'Fleet',
    dispatch: 'Dispatch',
    finance: 'Finance',
    crm: 'CRM',
    compliance: 'Compliance',
    ai: 'AI Tools',
    reporting: 'Reporting',
    integrations: 'Integrations',
    admin: 'Admin',
    support: 'Support',
    settings: 'Settings',
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full max-w-md px-3 py-2 text-sm text-muted-foreground bg-muted/50 border rounded-lg hover:bg-muted transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search documentation...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search help articles..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(groupedResults).map(([category, entries]) => (
            <CommandGroup key={category} heading={categoryLabels[category] || category}>
              {entries.map((entry) => (
                <CommandItem
                  key={entry.slug}
                  value={entry.slug}
                  onSelect={() => handleSelect(entry.slug)}
                  className="flex items-center gap-3"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.shortDescription}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
```
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` to confirm no type errors.</verify>
  <done>HelpSearch component with Fuse.js fuzzy search, Command+K shortcut, grouped results by category.</done>
</task>

<task type="auto">
  <name>Task 7: Build Help Center routes (layout, home, [slug], whats-new)</name>
  <files>
    apps/web/src/app/(owner)/help/layout.tsx
    apps/web/src/app/(owner)/help/page.tsx
    apps/web/src/app/(owner)/help/[slug]/page.tsx
    apps/web/src/app/(owner)/help/whats-new/page.tsx
  </files>
  <action>
1. Create `apps/web/src/app/(owner)/help/layout.tsx`:

```typescript
import { HelpSearch } from '@/components/help/HelpSearch';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Help Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Learn how to use DriveCommand features
          </p>
        </div>
        <div className="w-full sm:w-72">
          <HelpSearch />
        </div>
      </div>
      {children}
    </div>
  );
}
```

2. Create `apps/web/src/app/(owner)/help/page.tsx`:

```typescript
import Link from 'next/link';
import { getAllFeatures, getFeaturesByCategory } from '@/lib/docs/get-features';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Sparkles, FileText, Clock } from 'lucide-react';

const categoryMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  dispatch: { label: 'Dispatch', icon: <FileText className="h-5 w-5" /> },
  fleet: { label: 'Fleet', icon: <FileText className="h-5 w-5" /> },
  finance: { label: 'Finance', icon: <FileText className="h-5 w-5" /> },
  crm: { label: 'CRM', icon: <FileText className="h-5 w-5" /> },
  compliance: { label: 'Compliance', icon: <FileText className="h-5 w-5" /> },
  ai: { label: 'AI Tools', icon: <Sparkles className="h-5 w-5" /> },
  reporting: { label: 'Reporting', icon: <FileText className="h-5 w-5" /> },
  integrations: { label: 'Integrations', icon: <FileText className="h-5 w-5" /> },
  support: { label: 'Support', icon: <FileText className="h-5 w-5" /> },
  settings: { label: 'Settings', icon: <FileText className="h-5 w-5" /> },
};

export default function HelpHomePage() {
  const allFeatures = getAllFeatures();
  const clientFeatures = allFeatures.filter((f) => f.requiresClientDoc && f.portal !== 'admin');

  // Group by category
  const categories = [...new Set(clientFeatures.map((f) => f.category))];

  return (
    <div className="space-y-8">
      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/owner/help/whats-new">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">What's New</CardTitle>
                <CardDescription className="text-xs">Latest features and updates</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/support">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <BookOpen className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Support</CardTitle>
                <CardDescription className="text-xs">Contact our team</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Card className="opacity-60">
          <CardHeader className="flex flex-row items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Video Tutorials</CardTitle>
              <CardDescription className="text-xs">Coming soon</CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Categories */}
      {categories.map((category) => {
        const features = getFeaturesByCategory(category).filter(
          (f) => f.requiresClientDoc && f.portal !== 'admin'
        );
        if (features.length === 0) return null;
        const meta = categoryMeta[category] || { label: category, icon: <FileText className="h-5 w-5" /> };

        return (
          <section key={category}>
            <div className="flex items-center gap-2 mb-4">
              {meta.icon}
              <h2 className="text-lg font-semibold">{meta.label}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((feature) => (
                <Link key={feature.slug} href={`/owner/help/${feature.slug}`}>
                  <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardHeader className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{feature.name}</CardTitle>
                        {feature.planTier !== 'free' && feature.planTier !== 'starter' && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {feature.planTier}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm line-clamp-2">
                        {feature.shortDescription}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

3. Create `apps/web/src/app/(owner)/help/[slug]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { renderClientDoc } from '@/lib/docs/render-mdx';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { FeedbackWidget } from '@/components/help/FeedbackWidget';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Clock, Sparkles } from 'lucide-react';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params;

  let doc;
  try {
    doc = await renderClientDoc(slug);
  } catch {
    notFound();
  }

  // Get tenant plan for upgrade banner
  const session = await getSession();
  let tenantPlan = 'starter';
  if (session?.tenantId) {
    try {
      const rows = await prisma.$queryRaw<{ plan: string }[]>`
        SELECT plan FROM "Tenant" WHERE id = ${session.tenantId}::uuid LIMIT 1
      `;
      tenantPlan = rows[0]?.plan ?? 'starter';
    } catch {
      // Non-fatal
    }
  }

  const { frontmatter, content, feature } = doc;
  const featurePlanTier = feature?.planTier ?? 'free';

  // Plan tier hierarchy for comparison
  const planHierarchy = ['free', 'starter', 'pro', 'business', 'enterprise'];
  const tenantPlanIndex = planHierarchy.indexOf(tenantPlan);
  const featurePlanIndex = planHierarchy.indexOf(featurePlanTier);
  const needsUpgrade = featurePlanIndex > tenantPlanIndex;

  return (
    <div className="max-w-4xl">
      {/* Back link */}
      <Link
        href="/owner/help"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Help Center
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">{frontmatter.title}</h1>
          {feature && feature.planTier !== 'free' && feature.planTier !== 'starter' && (
            <Badge variant="secondary">{feature.planTier}</Badge>
          )}
        </div>
        <p className="text-muted-foreground">{frontmatter.summary}</p>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {frontmatter.estimatedReadMinutes} min read
          </span>
        </div>
      </div>

      {/* Upgrade banner (soft - not blocking) */}
      {needsUpgrade && (
        <Alert className="mb-6 border-primary/50 bg-primary/5">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertTitle>Upgrade to {featurePlanTier}</AlertTitle>
          <AlertDescription>
            This feature requires the {featurePlanTier} plan.{' '}
            <Link href="/owner/subscription" className="font-medium text-primary hover:underline">
              View plans
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* MDX Content */}
      <article className="prose prose-slate dark:prose-invert max-w-none">
        {content}
      </article>

      {/* Feedback Widget */}
      <div className="mt-12 pt-6 border-t">
        <FeedbackWidget docSlug={slug} />
      </div>
    </div>
  );
}
```

4. Create `apps/web/src/app/(owner)/help/whats-new/page.tsx`:

```typescript
import { getAllFeatures } from '@/lib/docs/get-features';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function WhatsNewPage() {
  // Get features sorted by addedInVersion (newest first)
  const features = getAllFeatures()
    .filter((f) => f.requiresClientDoc && f.portal !== 'admin')
    .sort((a, b) => {
      // Compare semantic versions
      const [aMajor, aMinor, aPatch] = a.addedInVersion.split('.').map(Number);
      const [bMajor, bMinor, bPatch] = b.addedInVersion.split('.').map(Number);
      if (bMajor !== aMajor) return bMajor - aMajor;
      if (bMinor !== aMinor) return bMinor - aMinor;
      return bPatch - aPatch;
    });

  // Group by version
  const byVersion: Record<string, typeof features> = {};
  for (const f of features) {
    if (!byVersion[f.addedInVersion]) byVersion[f.addedInVersion] = [];
    byVersion[f.addedInVersion].push(f);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-2">What's New</h2>
        <p className="text-muted-foreground">
          Recent features and improvements added to DriveCommand.
        </p>
      </div>

      {Object.entries(byVersion).map(([version, versionFeatures]) => (
        <section key={version}>
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Badge variant="outline">v{version}</Badge>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {versionFeatures.map((feature) => (
              <Link key={feature.slug} href={`/owner/help/${feature.slug}`}>
                <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader className="p-4">
                    <CardTitle className="text-base">{feature.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {feature.shortDescription}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` and navigate to `/owner/help` in browser (after dev server).</verify>
  <done>Help Center routes created: layout with search, home with category grid, [slug] with MDX + upgrade banner, whats-new with version grouping.</done>
</task>

<task type="auto">
  <name>Task 8: Build HelpButton and HelpSheet components</name>
  <files>
    apps/web/src/components/help/HelpButton.tsx
    apps/web/src/components/help/HelpSheet.tsx
  </files>
  <action>
1. Create `apps/web/src/components/help/HelpButton.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HelpSheet } from './HelpSheet';

interface HelpButtonProps {
  /** Optional pre-filled search query based on current page context */
  contextQuery?: string;
  className?: string;
}

export function HelpButton({ contextQuery, className }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={className}
        aria-label="Open help"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>
      <HelpSheet open={open} onOpenChange={setOpen} initialQuery={contextQuery} />
    </>
  );
}
```

2. Create `apps/web/src/components/help/HelpSheet.tsx`:

```typescript
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText, ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import searchIndex from '@/lib/docs/search-index.json';

interface SearchEntry {
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  portal: string;
  planTier: string;
  route: string;
}

interface HelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
}

const fuseOptions = {
  keys: ['name', 'shortDescription', 'category'],
  threshold: 0.3,
  includeScore: true,
};

export function HelpSheet({ open, onOpenChange, initialQuery = '' }: HelpSheetProps) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  const fuse = useMemo(() => new Fuse(searchIndex as SearchEntry[], fuseOptions), []);

  // Reset query when sheet opens with new initialQuery
  useEffect(() => {
    if (open && initialQuery) {
      setQuery(initialQuery);
    }
  }, [open, initialQuery]);

  const results = useMemo(() => {
    if (!query.trim()) return (searchIndex as SearchEntry[]).slice(0, 8);
    return fuse.search(query).slice(0, 8).map((r) => r.item);
  }, [query, fuse]);

  const handleSelect = (slug: string) => {
    onOpenChange(false);
    setQuery('');
    router.push(`/owner/help/${slug}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Help Center
          </SheetTitle>
          <SheetDescription>
            Search documentation or browse help articles
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search help articles..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Results */}
          <ScrollArea className="h-[calc(100vh-220px)]">
            <div className="space-y-1">
              {results.map((entry) => (
                <button
                  key={entry.slug}
                  onClick={() => handleSelect(entry.slug)}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-lg hover:bg-muted transition-colors"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{entry.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.shortDescription}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* Footer link */}
          <div className="pt-4 border-t">
            <Link
              href="/owner/help"
              onClick={() => onOpenChange(false)}
              className="text-sm text-primary hover:underline"
            >
              Browse all help articles
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` to confirm no type errors.</verify>
  <done>HelpButton triggers HelpSheet slide-over with search input, results list, and browse link.</done>
</task>

<task type="auto">
  <name>Task 9: Build FeedbackWidget component</name>
  <files>apps/web/src/components/help/FeedbackWidget.tsx</files>
  <action>
Create `apps/web/src/components/help/FeedbackWidget.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { submitDocFeedback } from '@/actions/doc-feedback';
import { toast } from 'sonner';

interface FeedbackWidgetProps {
  docSlug: string;
}

type FeedbackState = 'initial' | 'comment' | 'submitted';

export function FeedbackWidget({ docSlug }: FeedbackWidgetProps) {
  const [state, setState] = useState<FeedbackState>('initial');
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVote = async (isHelpful: boolean) => {
    setHelpful(isHelpful);

    // If helpful, submit immediately
    if (isHelpful) {
      setIsSubmitting(true);
      const result = await submitDocFeedback({ docSlug, helpful: true });
      setIsSubmitting(false);

      if (result.success) {
        setState('submitted');
      } else {
        toast.error(result.error || 'Failed to submit feedback');
      }
    } else {
      // If not helpful, show comment form
      setState('comment');
    }
  };

  const handleSubmitWithComment = async () => {
    if (helpful === null) return;

    setIsSubmitting(true);
    const result = await submitDocFeedback({
      docSlug,
      helpful,
      comment: comment.trim() || undefined,
    });
    setIsSubmitting(false);

    if (result.success) {
      setState('submitted');
    } else {
      toast.error(result.error || 'Failed to submit feedback');
    }
  };

  if (state === 'submitted') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-green-500" />
        Thanks for your feedback!
      </div>
    );
  }

  if (state === 'comment') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">What could we improve?</p>
        <Textarea
          placeholder="Tell us how we can make this article better..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSubmitWithComment}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              'Sending...'
            ) : (
              <>
                <Send className="h-3 w-3 mr-1" />
                Send Feedback
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setState('initial');
              setComment('');
              setHelpful(null);
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-muted-foreground">Was this article helpful?</span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleVote(true)}
          disabled={isSubmitting}
          className="gap-1"
        >
          <ThumbsUp className="h-4 w-4" />
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleVote(false)}
          disabled={isSubmitting}
          className="gap-1"
        >
          <ThumbsDown className="h-4 w-4" />
          No
        </Button>
      </div>
    </div>
  );
}
```
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` to confirm no type errors.</verify>
  <done>FeedbackWidget with Yes/No voting, comment form for negative feedback, submitted confirmation.</done>
</task>

<task type="auto">
  <name>Task 10: Run migrations and verify full stack</name>
  <files>N/A - verification only</files>
  <action>
1. Generate Prisma client:
   `cd apps/web && npx prisma generate`

2. Apply migration (if using local DB):
   `cd apps/web && npx prisma migrate deploy`

   OR for development:
   `cd apps/web && npx prisma db push`

3. Build search index:
   `cd apps/web && npm run build:search-index`

4. Run TypeScript check:
   `cd apps/web && npx tsc --noEmit`

5. Start dev server and verify:
   - Navigate to `/owner/help` - should see Help Center home
   - Test Command+K shortcut - should open search dialog
   - Click on load-management article - should render MDX
   - Test feedback widget - should submit and show confirmation
   - Check HelpButton component can be added to any page

6. If any errors, fix them before marking complete.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - `src/lib/docs/search-index.json` exists with entries
    - Dev server runs without errors
    - `/owner/help` renders category grid
    - `/owner/help/load-management` renders MDX content
  </verify>
  <done>Full Help Center stack working: DB model, server action, search index, routes, components.</done>
</task>

</tasks>

<verification>
1. Prisma schema valid with DocFeedback model
2. Migration file follows idempotent RLS pattern
3. Server action has Zod validation and proper auth
4. Search index builds from feature registry
5. Help Center routes render without errors
6. Command+K shortcut opens search dialog
7. MDX content renders with all block components
8. Plan-tier banner shows for gated features
9. Feedback widget submits to database
10. TypeScript compiles without errors
</verification>

<success_criteria>
- User can access Help Center at /owner/help
- User can search docs via Command+K or search input
- User can read rendered MDX documentation with all components
- User sees soft upgrade banner for plan-gated features (not blocking)
- User can submit helpful/not helpful feedback on any doc
- HelpButton/HelpSheet provide contextual help access from any page
- Search index regenerates on build
- All TypeScript types valid, no compile errors
</success_criteria>

<output>
After completion, create `.planning/quick/291-build-client-facing-help-center-in-the-o/291-SUMMARY.md`
</output>
