---
phase: 42-workflow-engine-foundation
plan: "03"
subsystem: api
tags: [trpc, tanstack-query, react-query, nextjs, typescript]

# Dependency graph
requires:
  - phase: 42-workflow-engine-foundation-01
    provides: Prisma schema for WorkflowStep, Playbook, ChecklistTemplate models
  - phase: 42-workflow-engine-foundation-02
    provides: Zod validation schemas for all workflow engine inputs

provides:
  - tRPC v11 server wired to existing Supabase session (no new auth mechanism)
  - tenantMemberProcedure and adminProcedure as procedure bases for all workflow routers
  - /api/trpc route handler mounted and responsive (GET + POST)
  - TRPCReactProvider wired only into (owner) layout — scoped, not global
  - useTRPC, TRPCProvider, useTRPCClient exported from src/trpc/client.tsx
  - Server-side caller (api) exported from src/trpc/server.ts for RSC usage
affects:
  - 42-workflow-engine-foundation-04 (adds workflowsRouter to appRouter)
  - all future tRPC routers in the owner portal

# Tech tracking
tech-stack:
  added:
    - "@trpc/server@11.16.0"
    - "@trpc/client@11.16.0"
    - "@trpc/tanstack-react-query@11.16.0"
    - "@tanstack/react-query@5.100.1"
    - "client-only@0.0.1"
    - "server-only@0.0.1"
  patterns:
    - tRPC context reads session from existing Supabase getSession() — no new auth mechanism
    - tenantMemberProcedure guards any authenticated route (any role)
    - adminProcedure guards owner/manager-only routes (extends tenantMemberProcedure)
    - TRPCReactProvider scoped to (owner)/layout.tsx — not in root layout
    - httpBatchLink with x-trpc-source header for request identification
    - makeQueryClient with 30s staleTime and dehydrate/hydrate passthrough config

key-files:
  created:
    - apps/web/src/server/api/trpc.ts
    - apps/web/src/server/api/root.ts
    - apps/web/src/app/api/trpc/[trpc]/route.ts
    - apps/web/src/trpc/query-client.ts
    - apps/web/src/trpc/client.tsx
    - apps/web/src/trpc/server.ts
    - apps/web/src/trpc/Provider.tsx
  modified:
    - apps/web/src/app/(owner)/layout.tsx

key-decisions:
  - "tRPC provider scoped to (owner)/layout.tsx only — driver and sysadmin portals are unaffected"
  - "Session role cast to UserRole enum for adminProcedure comparison — SessionData.role is string type"
  - "createCallerFactory used for server-side RSC caller (api) — future server-side tRPC calls go through this"

patterns-established:
  - "Pattern 1: All workflow routers import tenantMemberProcedure or adminProcedure from src/server/api/trpc.ts"
  - "Pattern 2: All routers are mounted in src/server/api/root.ts appRouter"
  - "Pattern 3: Client components use useTRPC() from src/trpc/client.tsx"
  - "Pattern 4: Server components/RSC use api from src/trpc/server.ts"

# Metrics
duration: 12min
completed: 2026-04-23
---

# Phase 42 Plan 03: tRPC Foundation Summary

**tRPC v11 installed with Supabase session context, tenantMemberProcedure/adminProcedure middleware, /api/trpc route handler, and TRPCReactProvider scoped to the owner portal layout**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-23T22:35:07Z
- **Completed:** 2026-04-23T22:47:07Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Installed 6 packages (tRPC v11 server/client, tanstack-react-query v11, react-query v5, client-only, server-only) — verified correct versions with npm ls
- Created tRPC server foundation: createTRPCContext (reads existing Supabase getSession()), tenantMemberProcedure (any auth), adminProcedure (OWNER/MANAGER only), empty appRouter with AppRouter type, and /api/trpc fetchRequestHandler
- Created tRPC client layer: makeQueryClient, useTRPC/TRPCProvider/useTRPCClient hooks, server-side RSC caller, and TRPCReactProvider — wired exclusively into (owner)/layout.tsx without touching root layout, driver portal, or sysadmin portal

## Task Commits

Each task was committed atomically:

1. **Task 1: Install tRPC packages + create server context + root router + route handler** - `a47fd4a` (feat)
2. **Task 2: Create tRPC client provider, server-side caller, and wire into (owner) layout** - `9b5ad93` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `apps/web/src/server/api/trpc.ts` - tRPC init: createTRPCContext, tenantMemberProcedure, adminProcedure, createCallerFactory
- `apps/web/src/server/api/root.ts` - Empty appRouter + AppRouter type (Plan 04 adds workflowsRouter)
- `apps/web/src/app/api/trpc/[trpc]/route.ts` - Next.js App Router fetchRequestHandler for GET + POST
- `apps/web/src/trpc/query-client.ts` - makeQueryClient with staleTime 30s + dehydrate/hydrate config
- `apps/web/src/trpc/client.tsx` - createTRPCContext exports: TRPCProvider, useTRPC, useTRPCClient
- `apps/web/src/trpc/server.ts` - Server-side RSC caller via createCallerFactory
- `apps/web/src/trpc/Provider.tsx` - TRPCReactProvider: QueryClientProvider + TRPCProvider + httpBatchLink
- `apps/web/src/app/(owner)/layout.tsx` - Added TRPCReactProvider wrapper around OwnerShell

## Decisions Made
- tRPC provider scoped to (owner)/layout.tsx only — driver and sysadmin portals are unaffected, as per plan
- SessionData.role is a string type (not UserRole enum), so adminProcedure casts it with `as UserRole` before comparison — no runtime risk since the values match
- Used createCallerFactory for the server-side api caller — enables server components to call tRPC procedures directly without HTTP round-trip in the future

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Self-Check

Files created:
- apps/web/src/server/api/trpc.ts: FOUND
- apps/web/src/server/api/root.ts: FOUND
- apps/web/src/app/api/trpc/[trpc]/route.ts: FOUND
- apps/web/src/trpc/query-client.ts: FOUND
- apps/web/src/trpc/client.tsx: FOUND
- apps/web/src/trpc/server.ts: FOUND
- apps/web/src/trpc/Provider.tsx: FOUND

Commits:
- a47fd4a: FOUND (Task 1)
- 9b5ad93: FOUND (Task 2)

Build: PASSED (exit code 0, both builds)
TypeScript: PASSED (tsc --noEmit clean)

## Self-Check: PASSED

## Next Phase Readiness
- tRPC surface fully wired and functional — Plan 42-04 can immediately mount workflowsRouter into appRouter
- tenantMemberProcedure and adminProcedure are the correct bases for all workflow-engine routes
- useTRPC() hook is available to all owner portal components
- Server-side api caller ready for RSC usage in owner portal server components

---
*Phase: 42-workflow-engine-foundation*
*Completed: 2026-04-23*
