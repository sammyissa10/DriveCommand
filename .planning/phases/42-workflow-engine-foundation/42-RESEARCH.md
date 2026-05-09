# Phase 42: Workflow Engine Foundation — Research

**Researched:** 2026-04-23
**Domain:** tRPC v11 + Next.js App Router, @dnd-kit sortable, Prisma schema extension, Supabase auth context
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Use tRPC** — introduce it to the codebase for this feature
- The spec's Section 7 tRPC router surface is the target (`stepTemplate`, `playbook`, `trigger` routers)
- Service functions (`apps/web/src/server/services/workflows/`) are called from tRPC procedures, not directly from components
- tRPC auth context must read from the existing Supabase session (same session the rest of the app uses)
- Validation schemas live in `packages/validation/src/workflows/` (imported by both web tRPC and mobile API later)
- **Drag-and-drop with @dnd-kit** — `@dnd-kit/core` + `@dnd-kit/sortable` already in `apps/web/package.json`
- Steps are draggable within a phase section AND between phase sections (PRE_START, DAY_1, WEEK_1, ONGOING, NONE)
- Visual drop indicator while dragging
- On drop: calls `playbook.reorderSteps` tRPC procedure with new sequence
- **New "Workflows" group** — standalone section in the owner portal sidebar (AppSidebar in `apps/web/src/components/navigation/sidebar.tsx`)
- Nav label: "Checklists & Workflows" (user-facing name per Section 3 naming table)
- Route: `/owner/checklists` (inside `apps/web/src/app/(owner)/checklists/`)
- **All tenants on migration** — seed all 3 starter Playbooks to every existing tenant during Phase 42 migration deploy
- New tenants also get them on tenant create
- The 3 starters are defined in `apps/web/src/server/services/workflows/seedStarterPlaybooks.ts`
- **All 8 step types in Phase 1** — FORM_FILL gets full inline field editor, INSPECTION_ITEM gets instruction + photo toggle, others get simpler config UIs per spec Section 8.2
- Route group: `apps/web/src/app/(owner)/checklists/`
- tRPC routers: `apps/web/src/server/api/routers/workflows/`
- Services: `apps/web/src/server/services/workflows/`
- Validation: `packages/validation/src/workflows/`

### Claude's Discretion
- Exact tRPC provider setup and middleware wiring (read Supabase session, follow existing auth patterns)
- shadcn/ui component choices for the builder canvas rows
- Exact icon choices for PlaybookCategory tile grid
- Empty state illustration style on `/checklists` dashboard

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within Phase 42 scope.
</user_constraints>

---

## Summary

Phase 42 introduces tRPC v11 as the API layer for a new Checklists & Workflows feature. The phase builds only the template creation layer: StepTemplates, Playbooks, PlaybookSteps — no runtime instances, no triggers, no mobile. Three starter Playbooks are seeded for all tenants at migration time.

**What makes this phase technically distinct from all previous phases:** it introduces two new libraries (tRPC, already installed `@dnd-kit`) that have never been wired up in this codebase. Everything else — Prisma patterns, Supabase auth, validation, shadcn/ui — is established and well-understood.

The most important architectural decision is how tRPC's `createTRPCContext` reads the Supabase session. The existing `getSession()` function in `apps/web/src/lib/auth/supabase.ts` is a `cache()`-wrapped async function that reads from the Supabase cookie via `createSupabaseServerClient()`. The tRPC context must call this same function — no new auth mechanism.

**Primary recommendation:** Wire `createTRPCContext` to call `getSession()` directly. Expose `tenantMemberProcedure` (authenticated, any role) and `adminProcedure` (OWNER or MANAGER only) as the two procedure bases. All workflow procedures use one of these two — never `publicProcedure`.

---

## Standard Stack

### Core (new for this phase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@trpc/server` | 11.x | Server router + context | Current stable, App Router fetch adapter |
| `@trpc/client` | 11.x | Client-side typed calls | Paired with server |
| `@trpc/tanstack-react-query` | 11.x | React hooks + provider | Official App Router integration |
| `@tanstack/react-query` | 5.x | Query client | Already used on mobile; required by tRPC |
| `client-only` | latest | Guard server imports on client | Required by tRPC setup |
| `server-only` | latest | Guard client imports on server | Required by tRPC setup |

**Note on superjson:** Optional. The spec has no Date serialization requirements for Phase 1 (only strings, numbers, booleans, JSON). Skip for now to reduce deps — can add in Phase 2 if needed.

### Already Installed (no new install needed)
| Library | Version in `package.json` | Purpose |
|---------|--------------------------|---------|
| `@dnd-kit/core` | ^6.3.1 | Drag context, sensors |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable hooks + context |
| `@dnd-kit/utilities` | ^3.2.2 | CSS transform utilities |
| `zod` | ^4.3.6 | Validation schemas |
| `@tanstack/react-table` | ^8.21.3 | (not needed for Phase 1) |

**Installation (new packages only):**
```bash
npm install @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query client-only server-only
```

**Zod v4 + tRPC compatibility:** CONFIRMED WORKING. A tRPC maintainer verified Zod v4 conforms to standard-schema and works without issues with tRPC 11. Source: https://github.com/trpc/trpc/discussions/6773

---

## Architecture Patterns

### Recommended Project Structure (Phase 42 additions only)

```
apps/web/src/
  app/(owner)/
    checklists/
      page.tsx                       # Dashboard: Playbook grid + empty state
      layout.tsx                     # (optional — no extra auth needed, (owner)/layout.tsx handles it)
      playbooks/
        new/
          page.tsx                   # Create new Playbook (redirects to edit)
        [id]/
          edit/
            page.tsx                 # Playbook Builder (3-column)
  server/
    api/
      trpc.ts                        # createTRPCContext + procedure bases (NEW)
      root.ts                        # appRouter merge (NEW)
      routers/
        workflows/
          stepTemplate.ts            # CRUD procedures
          playbook.ts                # CRUD + step management procedures
          index.ts                   # merge workflowsRouter
    services/
      workflows/
        seedStarterPlaybooks.ts      # seed function (called from migration + tenant create)

packages/validation/src/
  workflows/
    stepTemplate.ts                  # Zod schemas
    playbook.ts                      # Zod schemas
    index.ts                         # re-export

apps/web/src/
  trpc/
    client.tsx                       # TRPCReactProvider + useTRPC (client-only)
    server.ts                        # server-side caller (server-only)
    query-client.ts                  # makeQueryClient factory
```

**Why no `trpc/init.ts`:** The official pattern calls the init file whatever you like. Following DriveCommand conventions, `server/api/trpc.ts` is the init file — it co-locates with the routers it configures.

### Pattern 1: tRPC Context wired to Supabase session

**What:** `createTRPCContext` reads session via existing `getSession()`. All procedures access `ctx.session` and `ctx.tenantId`.

**When to use:** Every procedure that touches the database.

```typescript
// apps/web/src/server/api/trpc.ts
// Source: tRPC official docs https://trpc.io/docs/client/nextjs/app-router-setup
//         adapted to DriveCommand's existing auth pattern

import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import { getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { z } from 'zod';

export const createTRPCContext = cache(async (opts: { headers: Headers }) => {
  const session = await getSession();
  return { session, headers: opts.headers };
});

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// Requires auth (any role)
export const tenantMemberProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return opts.next({
    ctx: {
      ...ctx,
      session: ctx.session,
      tenantId: ctx.session.tenantId,
      userId: ctx.session.userId,
    },
  });
});

// Requires OWNER or MANAGER role (admin-level write operations)
export const adminProcedure = tenantMemberProcedure.use(async (opts) => {
  const role = opts.ctx.session.role;
  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return opts.next();
});
```

### Pattern 2: App Router fetch adapter (route handler)

**What:** The single tRPC HTTP endpoint. App Router requires `fetchRequestHandler`, not the Pages Router adapter.

```typescript
// apps/web/src/app/api/trpc/[trpc]/route.ts
// Source: https://trpc.io/docs/server/adapters/nextjs

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@/server/api/trpc';
import { appRouter } from '@/server/api/root';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
```

### Pattern 3: Client provider — scoped to (owner) layout, NOT root layout

**What:** `TRPCReactProvider` must wrap client components that use tRPC hooks. Rather than adding it to the root app layout (which would affect all portals), add it to the `(owner)` layout only.

**Critical detail:** The `(owner)/layout.tsx` is a **server component** (it calls `getSession()` and `getRole()`). The provider must be a separate `'use client'` component imported inside it.

```typescript
// apps/web/src/trpc/client.tsx
'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext as createContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { makeQueryClient } from './query-client';
import type { AppRouter } from '@/server/api/root';

export const { TRPCProvider, useTRPC } = createContext<AppRouter>();

// ... (standard getUrl + getQueryClient helpers)
```

**In `(owner)/layout.tsx`:** import `TRPCReactProvider` client component, wrap `<OwnerShell>` with it. The server auth check runs first (before any client component renders), so there is no issue.

### Pattern 4: @dnd-kit multi-container sortable

**What:** Steps drag within a phase section AND between phase sections. Use multiple `SortableContext` instances (one per PhaseType), all nested inside a single `DndContext`.

**Key detail:** `onDragOver` is used to update item order as the drag crosses container boundaries — this keeps the visual state correct while dragging. `onDragEnd` commits the final state via `playbook.reorderSteps` tRPC call.

```typescript
// Source: https://deepwiki.com/clauderic/dnd-kit/4.4-multiple-containers
// Pattern: multiple SortableContext containers inside one DndContext

<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragOver={handleDragOver}   // moves item between phase arrays optimistically
  onDragEnd={handleDragEnd}     // commits to DB via tRPC
>
  {PHASE_TYPES.map((phase) => (
    <SortableContext
      key={phase}
      id={phase}
      items={stepsByPhase[phase].map(s => s.id)}
      strategy={verticalListSortingStrategy}
    >
      <PhaseSection phase={phase} steps={stepsByPhase[phase]} />
    </SortableContext>
  ))}
  <DragOverlay>
    {activeStep ? <StepRowDragOverlay step={activeStep} /> : null}
  </DragOverlay>
</DndContext>
```

`handleDragOver` must check `active.data.current?.sortable.containerId` vs `over.data.current?.sortable.containerId` to detect cross-phase drops.

### Pattern 5: Prisma schema conventions for new models

**What:** All new models must follow the existing UUID/tenant/timestamps pattern exactly.

The spec uses `@default(uuid())` but the codebase uses `@default(dbgenerated("gen_random_uuid()")) @db.Uuid`. Use the codebase pattern.

```prisma
model StepTemplate {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String    @db.Uuid
  deletedAt DateTime? @db.Timestamptz   // soft delete (spec calls it deletedAt)
  createdAt DateTime  @default(now()) @db.Timestamptz
  updatedAt DateTime  @updatedAt @db.Timestamptz
  // ...
}
```

**Spec uses `isActive` for soft delete; codebase uses `deletedAt`:** The spec defines both `isActive Boolean @default(true)` and `deletedAt DateTime?`. Keep both — `isActive` is the fast filter (indexed), `deletedAt` records the timestamp.

### Pattern 6: tRPC tenant scoping on every query

**Critical — spec Section 16.3 and Phase 1 CI check:** Every database query must include `WHERE tenantId = ctx.tenantId`. A Vitest test greps for queries that are missing this scope.

```typescript
// Every query in every router procedure must look like this:
const templates = await prisma.stepTemplate.findMany({
  where: {
    tenantId: ctx.tenantId,  // REQUIRED — never omit
    isActive: true,
  },
  orderBy: { createdAt: 'desc' },
});
```

### Anti-Patterns to Avoid
- **Calling `getSession()` inside a tRPC procedure:** `createTRPCContext` already calls it. Access via `ctx.session` — no duplicate session reads.
- **Putting the tRPC client provider in root layout:** Scopes tRPC to `(owner)` only, keeping the mobile/driver/sysadmin portals clean.
- **Using `@default(uuid())` in Prisma schema:** The existing codebase uses `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` — follow this consistently.
- **Using internal names in JSX text nodes:** `PlaybookInstance`, `StepInstance`, `StepTemplate`, `PlaybookTrigger` must never appear in rendered text. Lint test will fail CI.
- **Writing the seeder as a Prisma migration SQL file:** The seeder is a TypeScript function `seedStarterPlaybooks(tenantId)` called from the migration deploy script — not raw SQL.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop sortable list | Custom mousedown/mousemove handler | `@dnd-kit/sortable` (already installed) | Accessibility, keyboard nav, touch, pointer capture, scroll during drag |
| Cross-container drag | Separate drop zones with custom hit testing | `DndContext` `onDragOver` + multiple `SortableContext` | dnd-kit handles pointer events and coordinate math |
| tRPC auth guard | Custom middleware in each procedure | `tenantMemberProcedure` and `adminProcedure` chains | Middleware composition is first-class in tRPC |
| UUID generation | `crypto.randomUUID()` in app code | `@default(dbgenerated("gen_random_uuid()"))` in schema | DB-side generation is atomic with INSERT |
| Form field ordering in FORM_FILL | Custom array sort | Re-use the `sequence` pattern from PlaybookStep | Same pattern, same drag library |
| Tenant-scoped queries | Application-level filter utility | Explicit `where: { tenantId: ctx.tenantId }` in every query | Explicit is safer than implicit middleware |

---

## Common Pitfalls

### Pitfall 1: tRPC provider placement breaks SSR
**What goes wrong:** If `TRPCReactProvider` is added to the root `app/layout.tsx`, it causes hydration issues with the server-rendered driver and sysadmin portals (they don't need tRPC and have different auth flows).
**Why it happens:** Root layout wraps everything; QueryClient initialization differs between server/client rendering.
**How to avoid:** Add `TRPCReactProvider` only to `apps/web/src/app/(owner)/layout.tsx` — wrap `<OwnerShell>` with it as a client wrapper component.
**Warning signs:** Hydration mismatch errors on non-owner routes after adding the provider.

### Pitfall 2: Spec's Prisma schema conflicts with codebase conventions
**What goes wrong:** The spec's schema blocks use `@default(uuid())` (Prisma-side generation) not `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` (PostgreSQL-side). The spec also omits `@db.Uuid` on FK fields.
**Why it happens:** Spec was written generically, not against this specific codebase.
**How to avoid:** For every model in the spec's Section 5, translate to codebase convention: `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` on PK, `@db.Uuid` on every FK, `@db.Timestamptz` on every DateTime.
**Warning signs:** `prisma migrate dev` produces different SQL than expected; Supabase shows UUIDs without correct type.

### Pitfall 3: @dnd-kit/sortable version mismatch
**What goes wrong:** `@dnd-kit/sortable` is at v10 while `@dnd-kit/core` is at v6. This is intentional — sortable v10 targets core v6. The API for `arrayMove`, `SortableContext`, and `useSortable` is stable in these versions.
**Why it happens:** dnd-kit uses independent versioning per package.
**How to avoid:** Use the v10 sortable API (not the "legacy" docs at docs.dndkit.com, which are pre-v10). The current docs are at dndkit.com/concepts/sortable.
**Warning signs:** TypeScript errors on `strategy` prop; `arrayMove` not found.

### Pitfall 4: Seeder runs during migration without Prisma context
**What goes wrong:** The migration hook that calls `prisma migrate deploy` also needs to call `seedStarterPlaybooks(tenantId)` for all existing tenants. But inside a migration SQL file, you cannot call TypeScript functions.
**Why it happens:** The migration and seed are different steps.
**How to avoid:** The seeder is called from the **post-migration hook** in `apps/web/scripts/migrate.mjs` (the file that runs `prisma migrate deploy` on `next start`). After migrate, query all tenantIds and call `seedStarterPlaybooks` in a loop — but only if they don't already have starter playbooks (idempotent check by name+tenantId).
**Warning signs:** Duplicate starter playbooks on repeated deployments.

### Pitfall 5: naming lint test false positives
**What goes wrong:** Vitest grep for `PlaybookInstance|StepInstance|StepTemplate|PlaybookTrigger` in `.tsx` rendered text — TypeScript import statements also contain these names, triggering false failures.
**Why it happens:** The grep must exclude import/type lines.
**How to avoid:** The lint test should grep for these tokens inside JSX (between `>` and `<`, or in string literals in JSX attributes) — not in import or type declaration lines. Use a regex pattern that targets JSX text nodes specifically.

### Pitfall 6: Zod v4 import path change
**What goes wrong:** tRPC docs use `z.object()`, `z.string()` etc. — these work fine in Zod v4. But some Zod v3 patterns like `z.infer<typeof schema>` have moved to `z.infer` which still works. The main breaking change is `z.ZodError` is now `ZodError` imported separately.
**Why it happens:** Zod v4 is a breaking release; existing validation files use v3 patterns.
**How to avoid:** The existing codebase already runs Zod v4 (`^4.3.6` in package.json) — check existing schema files like `packages/validation/src/route.ts` as reference. New schemas in `packages/validation/src/workflows/` should follow the same import style already used.

---

## Code Examples

### tRPC context creation (adapted for DriveCommand)
```typescript
// apps/web/src/server/api/trpc.ts
// Source: https://trpc.io/docs/client/nextjs/app-router-setup (adapted)

import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import { getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';

export const createTRPCContext = cache(async (opts: { headers: Headers }) => {
  const session = await getSession();
  return { session, headers: opts.headers };
});

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create();

export const { router, procedure: publicProcedure, createCallerFactory } = t;

export const tenantMemberProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return opts.next({
    ctx: {
      ...opts.ctx,
      session: opts.ctx.session,
      tenantId: opts.ctx.session.tenantId,
      userId: opts.ctx.session.userId,
    },
  });
});

export const adminProcedure = tenantMemberProcedure.use(async (opts) => {
  const { role } = opts.ctx.session;
  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return opts.next();
});
```

### stepTemplate router (canonical procedure pattern)
```typescript
// apps/web/src/server/api/routers/workflows/stepTemplate.ts

import { router, adminProcedure, tenantMemberProcedure } from '@/server/api/trpc';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  createStepTemplateSchema,
  updateStepTemplateSchema,
} from '@drivecommand/validation/workflows/stepTemplate';

export const stepTemplateRouter = router({
  list: tenantMemberProcedure
    .input(z.object({
      stepType: z.string().optional(),
      assigneeRole: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return prisma.stepTemplate.findMany({
        where: {
          tenantId: ctx.tenantId,  // ALWAYS scope by tenant
          isActive: true,
          ...(input.stepType ? { stepType: input.stepType as any } : {}),
          ...(input.assigneeRole ? { assigneeRole: input.assigneeRole as any } : {}),
        },
        orderBy: { name: 'asc' },
      });
    }),

  create: adminProcedure
    .input(createStepTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      return prisma.stepTemplate.create({
        data: { ...input, tenantId: ctx.tenantId },
      });
    }),
  // ...
});
```

### dnd-kit multi-container setup (PhaseSection pattern)
```typescript
// Source: https://deepwiki.com/clauderic/dnd-kit/4.4-multiple-containers

const [stepsByPhase, setStepsByPhase] = useState<Record<PhaseType, PlaybookStepRow[]>>(
  groupStepsByPhase(steps)
);
const [activeId, setActiveId] = useState<string | null>(null);

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
);

function handleDragOver(event: DragOverEvent) {
  const { active, over } = event;
  if (!over) return;
  const activeContainer = active.data.current?.sortable.containerId as PhaseType;
  const overContainer = (over.data.current?.sortable.containerId ?? over.id) as PhaseType;
  if (activeContainer !== overContainer) {
    setStepsByPhase(prev => moveItemBetweenContainers(prev, active.id, activeContainer, overContainer));
  }
}

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  // Build new flat ordered array and call reorderSteps mutation
  const flatReordered = buildFlatReorderedList(stepsByPhase);
  reorderStepsMutation.mutate({ playbookId, steps: flatReordered });
}
```

### Playbook card grid (spec Section 8.1)
```typescript
// "Create New Playbook" is always first card — dashed border, plus icon, never filtered
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  <CreatePlaybookCard />  {/* always first, never in filter */}
  {playbooks
    .filter(p => filter === 'all' || p.entityType === filter)
    .map(p => <PlaybookCard key={p.id} playbook={p} />)}
</div>
```

### Seeder function (idempotent)
```typescript
// apps/web/src/server/services/workflows/seedStarterPlaybooks.ts

export async function seedStarterPlaybooks(tenantId: string): Promise<void> {
  // Idempotent: skip if any starter already exists for this tenant
  const existing = await prisma.playbook.findFirst({
    where: { tenantId, name: 'CDL Driver Onboarding' },
  });
  if (existing) return;

  // Create all 3 starters in a transaction
  await prisma.$transaction(async (tx) => {
    await createCDLDriverOnboarding(tx, tenantId);
    await createPreTripInspection(tx, tenantId);
    await createNewPartnerSetup(tx, tenantId);
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@trpc/next` adapter for Pages Router | `fetchRequestHandler` for App Router | tRPC v11 | Route handler is `app/api/trpc/[trpc]/route.ts`, not `pages/api/trpc/[...trpc].ts` |
| `withTRPC` HOC wrapping pages | `TRPCReactProvider` + `useTRPC()` hook | tRPC v11 | Provider wraps just the portal layout, not the entire app |
| `trpc.xxx.useQuery()` | `useQuery(trpc.xxx.queryOptions(...))` | tRPC v11 | Standard React Query hook + tRPC `queryOptions` helper |
| `t.procedure` (one base) | Multiple typed procedure bases via `.use()` | tRPC v10+ | `adminProcedure`, `tenantMemberProcedure` etc. as re-usable auth guards |
| `@dnd-kit/sortable` legacy docs | New dndkit.com docs (Sortable Lists) | dnd-kit sortable v10 | API surface updated; legacy docs at docs.dndkit.com for pre-v10 |

**Deprecated/outdated:**
- `createNextApiHandler` from `@trpc/next`: Pages Router only, do not use for App Router.
- `trpc.xxx.useQuery()` (v10 style): In v11, use `useQuery(trpc.xxx.queryOptions(...))`.

---

## Open Questions

1. **Where does the migration deploy hook live?**
   - What we know: `apps/web/scripts/migrate.mjs` runs `prisma migrate deploy` at `next start`.
   - What's unclear: Does it already have a post-migrate hook pattern, or does the seeder need to be added inline?
   - Recommendation: Read `migrate.mjs` before writing the seeder integration. The seeder call should be: after `migrate deploy` succeeds, query all tenant IDs, call `seedStarterPlaybooks` for each.

2. **Where is tenant create logic to hook into for new tenant seeding?**
   - What we know: `apps/web/prisma/seed.ts` creates demo tenants. The actual production new-tenant flow is not yet confirmed (could be Supabase sign-up webhook, server action, or admin script).
   - What's unclear: The exact file/function that creates a new Tenant record in production.
   - Recommendation: Search for `Tenant` create in server actions and API routes before Phase 43+. For Phase 42, the migration-based seeding for existing tenants is sufficient.

3. **Does `(owner)/layout.tsx` support being wrapped in a client provider?**
   - What we know: The layout is a server component that calls `getSession()` and `getRole()`. It returns `<OwnerShell>`.
   - What's unclear: Whether wrapping `OwnerShell` in a client component provider causes any streaming/RSC issues.
   - Recommendation: Create `WorkflowsProvider` as a thin `'use client'` wrapper around `TRPCReactProvider`. Add it to `(owner)/layout.tsx` inside the return, wrapping `children` inside `OwnerShell`. This is the standard pattern for introducing client context in an RSC layout.

---

## Sources

### Primary (HIGH confidence)
- tRPC official App Router setup — https://trpc.io/docs/client/nextjs/app-router-setup
- tRPC Next.js adapter — https://trpc.io/docs/server/adapters/nextjs
- `apps/web/package.json` — confirmed `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `zod` 4.3.6 already installed
- `apps/web/src/lib/auth/supabase.ts` — `getSession()` returns `SessionData` with `userId`, `tenantId`, `role`
- `apps/web/src/lib/auth/roles.ts` — `UserRole.OWNER`, `UserRole.MANAGER` are the admin roles
- `docs/specs/DriveCommand_Workflow_Engine_v2.md` — full spec, sections 5, 7, 8, 12, 14, 16 read in full
- `apps/web/prisma/schema.prisma` — confirmed codebase UUID/timestamp conventions

### Secondary (MEDIUM confidence)
- DEV Community tRPC 11 + App Router guide (2025) — https://dev.to/matowang/trpc-11-setup-for-nextjs-app-router-2025-33fo — verified against official docs
- dnd-kit multiple containers pattern — https://deepwiki.com/clauderic/dnd-kit/4.4-multiple-containers — verified against dndkit.com docs

### Tertiary (LOW confidence)
- tRPC + Zod v4 compatibility — https://github.com/trpc/trpc/discussions/6773 — single maintainer comment; should be independently tested in a spike before assuming full compatibility

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages confirmed installed, tRPC v11 official docs verified
- Architecture: HIGH — existing codebase patterns (auth, Prisma, route groups) fully understood; tRPC setup verified
- @dnd-kit multi-container: MEDIUM — pattern is documented and well-understood, but the exact `handleDragOver` implementation for phase-to-phase moves will need iterative testing
- Seeder integration: MEDIUM — migrate.mjs not yet read; the hook pattern needs verification before writing

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (tRPC and dnd-kit are stable; Supabase/Prisma patterns are codebase-internal)
