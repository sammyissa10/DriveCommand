# quick-621 — PLAN

**Sweep layouts, templates, boundaries, middleware, instrumentation, providers and `after()` handlers for
unscoped queries the quick-616 census never covered; fix `(owner)/layout.tsx`.**

Target: staging (`wyixpgunnjmzguhggocz`) as `app_user`, tripwire armed. Production is read-only (`pg_policies`,
`pg_roles`, `pg_stat_activity`) and never written. Planned and executed inline by the orchestrator: every step
depends on what the previous one measured.

## Approach
Enumerate the request-time special files and trace their database access, including through what they render.
Measure the census's blind spot with an AST inventory that counts QUERIES on the bare client rather than FLAGS.
Scope the layout and remove its swallow, giving the thrown error a real boundary. Prove on staging by calling the
real layout and by loading real owner pages against a dev server with the in-process TC001 hook, with
`bypass_rls_policy` dropped on the layout's three tables.

## Steps
0. vitest baseline from the working tree; staging preconditions (`621-preconditions.ts`).
1. Enumerate the 35 special files plus the components/providers the layouts render and the `after()` sites.
2. Per querying site: client, tenant in scope, GUC, failure path, with file:line.
3. `621-bare-client-inventory.ts`: CENSUS_VISIBLE / GUC_SCOPED / BLIND_RLS / BLIND_NO_RLS / BLIND_UNRESOLVED
   by file kind, witnessed red with `--break-visitor`.
4. Fix `(owner)/layout.tsx`: one `getTenantPrismaForOrg(session.tenantId)` transaction with typed model reads
   (userId not passed, `tenantId` predicate kept); a missing row keeps its default; a failed query propagates to
   a new `src/app/error.tsx`.
5. Fix the rest of the swept class. Anything outside it is stop-and-report.
6. `621-layout-verify.ts`: throw-after-drop, then function cells, table cells and HTTP cells; restore compared
   to production.
7. Both click-throughs with the in-process hook; attribute any TC001 by byte range; compare to quick-620.
8. Gates: tsc (probed), build, vitest failing set vs step 0, wrapper countdown; census-method recommendation.

## Limits
No production writes · no permanent policy drop · no `tenantId` predicate removed · no `userId` passed · no error
suppressed to make a page render.
