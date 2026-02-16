# Phase 15: Tags/Groups & Polish - Research

**Researched:** 2026-02-15
**Domain:** UI polish, data filtering, bundle optimization, responsive design
**Confidence:** HIGH

## Summary

Phase 15 completes v2.0 by adding fleet organization through tags/groups and bringing all dashboards to production quality with loading states, error handling, mobile responsiveness, and optimized bundle size. This phase has four distinct technical domains: (1) tag data modeling and filtering, (2) loading/error state implementation, (3) responsive mobile design, and (4) bundle size optimization.

The tag system follows established patterns from the codebase (many-to-many with bridge table, Zod validation, server actions, shadcn components). Loading states use Next.js's built-in Suspense and error.js patterns. Responsive design leverages Tailwind's mobile-first approach with existing sidebar collapsible="icon" support. Bundle optimization uses Next.js's @next/bundle-analyzer with dynamic imports already proven for Leaflet and Recharts.

**Primary recommendation:** Build on existing patterns—tag assignment uses the same polymorphic many-to-many pattern as existing relations, filtering reuses TanStack Table patterns from truck/driver lists, loading states follow React Suspense conventions, and bundle analysis identifies opportunities for further code splitting without major refactoring.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.0.0 | App Router, Suspense, dynamic imports | Already in use, built-in loading/error patterns |
| Prisma | 7.4.0 | Tag models, many-to-many relations | Existing ORM, proven RLS patterns |
| Zod | 4.3.6 | Tag validation schemas | Established validation pattern |
| shadcn/ui | Latest | Popover, Checkbox, Badge, Tabs | Component library in use |
| Tailwind CSS | 3.4.1 | Responsive utilities, mobile-first | Design system foundation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @next/bundle-analyzer | Latest | Bundle size visualization | Verify <500KB first-load JS |
| React Suspense | Built-in | Loading boundaries | All async data fetching |
| Recharts | 2.15.4 | Already loaded for charts | No additional bundle cost |
| Leaflet | 1.9.4 | Already dynamically imported | Map filtering by tags |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma polymorphic | Generic taggable interface | More complex, no type safety benefit for 2 entity types |
| shadcn Popover | Custom dropdown | Reinventing accessibility, keyboard nav |
| @next/bundle-analyzer | webpack-bundle-analyzer directly | Less Next.js-aware, same underlying tool |

**Installation:**

No new dependencies required. Tag system uses existing stack. Bundle analyzer is dev dependency:

```bash
npm install --save-dev @next/bundle-analyzer
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/validations/
│   └── tag.schemas.ts          # Tag CRUD and assignment schemas
├── app/(owner)/
│   ├── actions/
│   │   └── tags.ts             # Tag server actions
│   ├── tags/
│   │   └── page.tsx            # Tag management page
│   ├── live-map/
│   │   ├── page.tsx            # Add tag filtering
│   │   └── loading.tsx         # NEW: Suspense fallback
│   ├── safety/
│   │   ├── page.tsx            # Add tag filtering
│   │   └── loading.tsx         # NEW: Suspense fallback
│   └── fuel/
│       ├── page.tsx            # Add tag filtering
│       └── loading.tsx         # NEW: Suspense fallback
├── components/
│   ├── tags/
│   │   ├── tag-manager.tsx     # Create/delete tags UI
│   │   ├── tag-assignment.tsx  # Assign tags to entities
│   │   └── tag-filter.tsx      # Multi-select filter popover
│   └── ui/
│       ├── popover.tsx         # NEW: shadcn component
│       └── checkbox.tsx        # NEW: shadcn component
prisma/
└── schema.prisma               # Tag and TagAssignment models
```

### Pattern 1: Polymorphic Tag Assignment (Many-to-Many)

**What:** Bridge table with nullable foreign keys for different entity types (truck, user)

**When to use:** Tagging system that applies to multiple entity types without creating separate junction tables per type

**Example:**

```prisma
// Source: Existing codebase pattern + PostgreSQL best practices
model Tag {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @db.Uuid
  name      String
  color     String   @default("#3b82f6")
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz

  tenant      Tenant          @relation(fields: [tenantId], references: [id])
  assignments TagAssignment[]

  @@unique([tenantId, name])
  @@index([tenantId])
}

model TagAssignment {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @db.Uuid
  tagId     String   @db.Uuid
  truckId   String?  @db.Uuid  // Nullable - one of truckId or userId must be set
  userId    String?  @db.Uuid  // Nullable - one of truckId or userId must be set
  createdAt DateTime @default(now()) @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)
  truck  Truck? @relation(fields: [truckId], references: [id], onDelete: Cascade)
  user   User?  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tagId, truckId])  // Prevent duplicate assignments
  @@unique([tagId, userId])
  @@index([tenantId])
  @@index([tagId])
  @@index([truckId])
  @@index([userId])
}
```

**Validation pattern:**

```typescript
// src/lib/validations/tag.schemas.ts
import { z } from 'zod';

export const assignTagSchema = z.object({
  tagId: z.string().uuid(),
  truckId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
}).refine(
  (data) => (data.truckId && !data.userId) || (!data.truckId && data.userId),
  { message: 'Exactly one of truckId or userId must be provided' }
);
```

### Pattern 2: Next.js Loading States (Suspense Boundaries)

**What:** File-based loading.tsx for instant loading UI with React Suspense

**When to use:** All pages with async data fetching (parallel fetches, slow queries)

**Example:**

```typescript
// src/app/(owner)/fuel/loading.tsx
export default function FuelLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-48 lg:col-span-2" />
      </div>
    </div>
  );
}
```

**Why this works:** Next.js automatically wraps page.tsx in Suspense with loading.tsx as fallback. No manual Suspense component needed at route level.

### Pattern 3: Multi-Select Tag Filter with Popover

**What:** shadcn Popover + Command component with checkboxes for multi-select

**When to use:** Dashboard filtering where users can select multiple tags (AND/OR logic)

**Example:**

```typescript
// src/components/tags/tag-filter.tsx
'use client';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface TagFilterProps {
  tags: Array<{ id: string; name: string; color: string }>;
  selectedTagIds: string[];
  onSelectionChange: (tagIds: string[]) => void;
}

export function TagFilter({ tags, selectedTagIds, onSelectionChange }: TagFilterProps) {
  const toggleTag = (tagId: string) => {
    onSelectionChange(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter(id => id !== tagId)
        : [...selectedTagIds, tagId]
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2">
          Filter by Tags
          {selectedTagIds.length > 0 && (
            <Badge variant="secondary">{selectedTagIds.length}</Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-2">
          {tags.map(tag => (
            <div key={tag.id} className="flex items-center gap-2">
              <Checkbox
                checked={selectedTagIds.includes(tag.id)}
                onCheckedChange={() => toggleTag(tag.id)}
              />
              <Badge style={{ backgroundColor: tag.color }}>
                {tag.name}
              </Badge>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

### Pattern 4: URL State for Tag Filters

**What:** Store selected tag IDs in URL search params for shareable filtered views

**When to use:** Dashboard filtering where users may want to bookmark or share filtered state

**Example:**

```typescript
// src/app/(owner)/fuel/page.tsx
import { redirect } from 'next/navigation';

export default async function FuelPage({
  searchParams,
}: {
  searchParams: { tags?: string };
}) {
  const selectedTagIds = searchParams.tags?.split(',').filter(Boolean) || [];

  // Fetch data with tag filter
  const data = await getFuelData({ tagIds: selectedTagIds });

  return (
    <div>
      <TagFilter
        selectedTagIds={selectedTagIds}
        onSelectionChange={(ids) => {
          const url = new URL(window.location.href);
          if (ids.length > 0) {
            url.searchParams.set('tags', ids.join(','));
          } else {
            url.searchParams.delete('tags');
          }
          router.push(url.pathname + url.search);
        }}
      />
    </div>
  );
}
```

### Pattern 5: Responsive Chart Stacking

**What:** Tailwind grid with mobile-first breakpoints to stack charts vertically on mobile

**When to use:** Multi-column chart layouts that need to collapse on mobile

**Example:**

```typescript
// Existing pattern from fuel/page.tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <FuelSummaryCard {...summary} />
  <div className="lg:col-span-2">
    <MPGTrendChart data={trend} />
  </div>
</div>

<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <EmissionsCard {...emissions} />
  <IdleTimeCard data={idleTime} />
</div>
```

**Why this works:** `grid-cols-1` is mobile default (vertical stack), `lg:grid-cols-2` and `lg:grid-cols-3` apply at 1024px+ for horizontal layout. ChartContainer has `aspect-video` which maintains reasonable height on mobile.

### Pattern 6: Bundle Analysis with @next/bundle-analyzer

**What:** Webpack plugin that generates interactive HTML report of bundle composition

**When to use:** Before production deployment to verify <500KB first-load JS

**Example:**

```javascript
// next.config.ts
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  // existing config
};

export default withBundleAnalyzer(nextConfig);
```

```bash
# Generate bundle report
ANALYZE=true npm run build

# Opens three HTML files:
# - client.html (browser bundle - THIS is what we check against 500KB)
# - edge.html (edge runtime bundle)
# - nodejs.html (server bundle)
```

### Anti-Patterns to Avoid

- **Tag filtering in component state:** Use URL search params for shareability and back-button support
- **Separate junction tables per entity:** Use single TagAssignment table with nullable FKs for 2-3 entity types
- **Manual Suspense wrapping at route level:** Use Next.js loading.tsx file convention instead
- **Inline loading spinners:** Skeleton UI matches layout structure, prevents content shift
- **Generic "Loading..." text:** Show structural placeholders (cards, charts) to set expectations
- **Forgetting empty states:** Charts should render helpful "No data" messages, not crash
- **Hardcoded breakpoints:** Use Tailwind's responsive prefixes (sm:, md:, lg:) for consistency

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-select dropdown | Custom checkbox tree | shadcn Popover + Checkbox | Accessibility (keyboard nav, screen readers), focus management, portal positioning |
| Bundle analysis | Manual webpack config inspection | @next/bundle-analyzer | Interactive visualization, gzip size calculation, module dependencies |
| Loading skeletons | Spinners with setTimeout | Suspense + loading.tsx | Framework-integrated, instant feedback, layout shift prevention |
| Responsive grid | Custom media queries in JS | Tailwind responsive utilities | SSR-safe, mobile-first, design system consistency |
| Tag color picker | Full color wheel | Preset color palette (8 colors) | Faster UX, brand consistency, accessibility (contrast) |
| URL state management | Manual URLSearchParams parsing | Next.js searchParams prop | Type-safe, server component compatible, no useState needed |

**Key insight:** UI polish problems (loading, errors, responsive) have framework-blessed solutions in Next.js. Don't fight the framework—use loading.tsx for Suspense, Tailwind for responsive, @next/bundle-analyzer for optimization. Custom solutions add complexity without benefit.

## Common Pitfalls

### Pitfall 1: Tag Filter Breaking SSR

**What goes wrong:** Client-only tag filter causes hydration mismatch or undefined errors

**Why it happens:** Mixing client state (selected tags) with server component patterns

**How to avoid:** Use URL search params as source of truth, make filter component client-only with 'use client', pass initial state from server

**Warning signs:** "Text content did not match" errors, filters reset on page navigation

### Pitfall 2: Empty States Crashing Recharts

**What goes wrong:** Charts render with 0px height or throw errors when data array is empty

**Why it happens:** Recharts doesn't gracefully handle empty datasets

**How to avoid:** Always check `data.length === 0` and return Card with empty state message. Use `min-h-[300px]` on ChartContainer.

**Warning signs:** Blank white space where chart should be, console errors about missing data

**Example:**

```typescript
// Every chart component needs this pattern
if (data.length === 0) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chart Title</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">No data available</p>
      </CardContent>
    </Card>
  );
}
```

### Pitfall 3: Missing Indexes on Tag Filtering

**What goes wrong:** Dashboard queries with tag filtering become slow (>2s) as data grows

**Why it happens:** Tag filtering adds JOIN to TagAssignment without proper indexes

**How to avoid:** Add indexes on TagAssignment(tagId, truckId) and TagAssignment(tagId, userId) in migration

**Warning signs:** Queries fast with no tag filter, slow when filtering by tags

### Pitfall 4: Sidebar Not Responsive on Mobile

**What goes wrong:** Sidebar obscures content on mobile, no way to dismiss it

**Why it happens:** Forgetting that shadcn sidebar with `collapsible="icon"` needs mobile drawer behavior

**How to avoid:** Sidebar component already has built-in mobile drawer via SidebarProvider. Verify it works with small viewport testing.

**Warning signs:** Sidebar fixed open on mobile, content unreachable, horizontal scroll

### Pitfall 5: Bundle Size Regression from Naive Imports

**What goes wrong:** First-load JS jumps from 300KB to 800KB after adding tag features

**Why it happens:** Importing entire libraries instead of tree-shakeable submodules (e.g., `import _ from 'lodash'` vs `import { debounce } from 'lodash-es'`)

**How to avoid:** Run bundle analyzer before and after tag implementation. Check for unexpected large modules in client.html report.

**Warning signs:** Build shows "First Load JS shared by all" increasing significantly

### Pitfall 6: Polymorphic Tag Assignment Without Constraint

**What goes wrong:** TagAssignment created with both truckId AND userId, or neither

**Why it happens:** Database-level constraint missing, relying only on Zod validation (which can be bypassed)

**How to avoid:** Add CHECK constraint in migration:

```sql
ALTER TABLE "TagAssignment" ADD CONSTRAINT "one_entity_per_assignment"
  CHECK (
    (("truckId" IS NOT NULL)::int + ("userId" IS NOT NULL)::int) = 1
  );
```

**Warning signs:** Invalid tag assignments in database, filtering returns duplicates

## Code Examples

Verified patterns from official sources and existing codebase:

### 1. Server Action: List Tags with Assignment Counts

```typescript
// src/app/(owner)/actions/tags.ts
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/prisma/tenant-client';

export async function listTagsWithCounts() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  const tags = await prisma.tag.findMany({
    include: {
      _count: {
        select: {
          assignments: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    assignmentCount: tag._count.assignments,
  }));
}
```

### 2. Server Action: Get Filtered Vehicles by Tags

```typescript
// src/app/(owner)/actions/tags.ts
export async function getVehiclesByTags(tagIds: string[]) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  if (tagIds.length === 0) {
    // No filter - return all vehicles
    return prisma.truck.findMany({
      orderBy: { licensePlate: 'asc' },
    });
  }

  const prisma = await getTenantPrisma();

  // Vehicles that have ALL selected tags (AND logic)
  const vehicles = await prisma.truck.findMany({
    where: {
      tagAssignments: {
        some: {
          tagId: { in: tagIds },
        },
      },
    },
    include: {
      tagAssignments: {
        include: { tag: true },
      },
    },
    orderBy: { licensePlate: 'asc' },
  });

  return vehicles;
}
```

### 3. Loading State with Skeleton

```typescript
// src/app/(owner)/live-map/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function LiveMapLoading() {
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-4 space-y-3">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </div>
        <div className="flex items-center gap-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <Skeleton className="flex-1 rounded-lg" />
    </div>
  );
}
```

### 4. Tag Assignment Client Component

```typescript
// src/components/tags/tag-assignment.tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { assignTag, unassignTag } from '@/app/(owner)/actions/tags';
import { useRouter } from 'next/navigation';

interface TagAssignmentProps {
  tags: Array<{ id: string; name: string; color: string }>;
  trucks: Array<{ id: string; name: string; licensePlate: string }>;
  assignments: Array<{ id: string; tagId: string; truckId?: string; userId?: string }>;
}

export function TagAssignment({ tags, trucks, assignments }: TagAssignmentProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const getTruckTags = (truckId: string) => {
    return assignments
      .filter(a => a.truckId === truckId)
      .map(a => tags.find(t => t.id === a.tagId))
      .filter(Boolean);
  };

  const handleAssign = async (tagId: string, truckId: string) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.set('tagId', tagId);
    formData.set('truckId', truckId);
    await assignTag(formData);
    router.refresh();
    setIsLoading(false);
  };

  return (
    <Tabs defaultValue="trucks">
      <TabsList>
        <TabsTrigger value="trucks">Trucks</TabsTrigger>
        <TabsTrigger value="drivers">Drivers</TabsTrigger>
      </TabsList>
      <TabsContent value="trucks" className="space-y-2">
        {trucks.map(truck => (
          <div key={truck.id} className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium">{truck.name}</div>
              <div className="text-sm text-muted-foreground">{truck.licensePlate}</div>
            </div>
            <div className="flex items-center gap-2">
              {getTruckTags(truck.id).map(tag => (
                <Badge key={tag.id} style={{ backgroundColor: tag.color }}>
                  {tag.name}
                </Badge>
              ))}
              {/* Add tag dropdown here */}
            </div>
          </div>
        ))}
      </TabsContent>
    </Tabs>
  );
}
```

### 5. Bundle Analyzer Configuration

```typescript
// next.config.ts
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default withBundleAnalyzer(nextConfig);
```

```bash
# Usage
ANALYZE=true npm run build

# Check client.html "Stat size" vs "Parsed size" vs "Gzipped size"
# First Load JS = Shared chunks (framework, common code)
# Page-specific = Only for that route
# Target: First Load JS < 500KB (gzipped)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Component-level loading spinners | Next.js loading.tsx + Suspense | Next.js 13+ (2023) | Instant loading UI, no layout shift, streaming |
| Client-side skeleton state | Server-rendered skeleton in loading.tsx | Next.js 13+ App Router | Faster perceived load, works without JS |
| Manual bundle analysis | @next/bundle-analyzer plugin | Long-standing, updated for Next.js 15 | Interactive tree map, gzip calculation |
| Class-based responsive | Tailwind responsive utilities | Tailwind 2.0+ (2020) | Mobile-first, SSR-safe, design tokens |
| Separate error pages | error.tsx file convention | Next.js 13+ (2023) | Error boundaries per route segment |
| Generic tag tables per entity | Polymorphic bridge table | PostgreSQL standard | Single source of truth, easier queries |

**Deprecated/outdated:**

- `getStaticProps` + `getServerSideProps` for loading states: Use React Suspense with App Router instead
- Pages Router loading patterns: App Router has first-class loading.tsx support
- Manual React.lazy for route splitting: Next.js does this automatically per route
- webpack-bundle-analyzer direct config: Use @next/bundle-analyzer wrapper for Next.js integration

## Open Questions

1. **Tag filtering logic: AND vs OR?**
   - What we know: Multiple tags can be selected
   - What's unclear: Does filtering show entities with ANY selected tag (OR) or ALL selected tags (AND)?
   - Recommendation: Start with OR (more results), add AND toggle if users request it. Most fleet filtering is "show me Long Haul OR Local Delivery", not "show me vehicles tagged with BOTH".

2. **Tag limit per entity?**
   - What we know: Many-to-many allows unlimited assignments
   - What's unclear: Should there be a UI/business limit (e.g., max 5 tags per vehicle)?
   - Recommendation: No hard limit for v2.0. Monitor for UX issues with excessive tags (badge overflow). Add limit if users report confusion.

3. **Tag color accessibility?**
   - What we know: Tags have color field for visual distinction
   - What's unclear: Are preset colors guaranteed to meet WCAG contrast requirements?
   - Recommendation: Use Tailwind's 500-shade colors for text/backgrounds, always include text label (don't rely on color alone). Test with color blindness simulator.

4. **Bundle target: 500KB gzipped or parsed?**
   - What we know: Success criteria says "under 500KB"
   - What's unclear: Gzipped (network transfer) or parsed (browser evaluation)?
   - Recommendation: Success criteria likely means first-load JS gzipped (what users download). Parsed size is typically 2-3x larger. Verify with bundle analyzer that client.html shows <500KB gzipped.

## Sources

### Primary (HIGH confidence)

- [Next.js Package Bundling Guide](https://nextjs.org/docs/app/guides/package-bundling) - Official dynamic import and code splitting docs (updated Feb 2026)
- [@next/bundle-analyzer npm](https://www.npmjs.com/package/@next/bundle-analyzer) - Official plugin for bundle analysis
- [React Suspense Reference](https://react.dev/reference/react/Suspense) - Official React docs on Suspense boundaries
- [Next.js loading.js Convention](https://nextjs.org/docs/app/api-reference/file-conventions/loading) - File-based loading states
- [shadcn/ui Popover Multi-Select Pattern](https://www.shadcn.io/patterns/combobox-multi-select-4) - Checkbox multi-select pattern
- Existing codebase: `src/app/(owner)/fuel/page.tsx`, `src/components/fuel/mpg-trend-chart.tsx`, `src/components/navigation/sidebar.tsx`

### Secondary (MEDIUM confidence)

- [LogRocket: Dynamic Imports Code Splitting Next.js](https://blog.logrocket.com/dynamic-imports-code-splitting-next-js/) - Practical examples of code splitting
- [Best Practices for Loading States in Next.js](https://www.getfishtank.com/insights/best-practices-for-loading-states-in-nextjs) - Loading skeleton patterns
- [Medium: Code Splitting in Next.js (Jan 2026)](https://medium.com/dev-proto/code-splitting-in-next-js-76a8b4aa3dc3) - Recent real-world patterns
- [Bruno Scheufler: Modeling Polymorphic Relations in Postgres](https://brunoscheufler.com/blog/2022-05-22-modeling-polymorphic-relations-in-postgres) - Polymorphic bridge table design
- [Flowbite: Tailwind Sidebar](https://flowbite.com/docs/components/sidebar/) - Responsive sidebar patterns

### Tertiary (LOW confidence - examples only)

- [Recharts Examples](https://recharts.github.io/en-US/examples/StackedBarChart/) - Chart library docs (no 2026-specific updates needed)
- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design) - Core framework docs (stable patterns)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies except dev-only bundle analyzer
- Architecture: HIGH - Patterns proven in existing codebase (polymorphic relations exist, shadcn components in use, Suspense is framework standard)
- Pitfalls: MEDIUM - Empty state handling is established pattern, but tag filtering performance needs validation with production data volumes

**Research date:** 2026-02-15
**Valid until:** 45 days (March 2026) - Stable patterns, Next.js 16 just released, no major framework changes expected
