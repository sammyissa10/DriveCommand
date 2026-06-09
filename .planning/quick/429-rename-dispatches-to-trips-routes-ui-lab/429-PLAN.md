---
phase: quick-429
plan: 429
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/trips/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/_grid/columns.tsx
  - apps/web/src/app/(owner)/carrier/trips/_grid/DispatchesGrid.tsx
  - apps/web/src/app/(owner)/carrier/trips/_grid/types.ts
  - apps/web/src/app/(owner)/carrier/dispatches/page.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
  - apps/web/src/components/navigation/sidebar.tsx
  - apps/web/src/components/Sidebar/index.tsx
  - apps/web/src/components/carrier/CarrierBreadcrumb.tsx
  - apps/web/next.config.ts
autonomous: true

must_haves:
  truths:
    - "Visiting /carrier/trips shows the real dispatches list (heading 'Trips')"
    - "Visiting /carrier/trips/[id] shows the real dispatch detail page"
    - "Visiting /carrier/trips/[id]/stops shows the real stops overview page"
    - "Visiting old /carrier/dispatches URLs permanently redirects to /carrier/trips equivalents"
    - "Sidebar 'Trips' link navigates to /carrier/trips and highlights as active there"
    - "Breadcrumb shows 'Trips' for the trips segment"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/trips/page.tsx"
      provides: "Real trips list page (was dispatches list)"
      contains: "DispatchesGrid"
    - path: "apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx"
      provides: "Real trip detail page"
      contains: "getTrip"
    - path: "apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx"
      provides: "Real trip stops overview page"
      contains: "getTrip"
    - path: "apps/web/src/app/(owner)/carrier/dispatches/page.tsx"
      provides: "Redirect stub to /carrier/trips"
      contains: "redirect"
    - path: "apps/web/next.config.ts"
      provides: "Permanent redirects dispatches -> trips"
      contains: "redirects"
  key_links:
    - from: "apps/web/src/components/navigation/sidebar.tsx"
      to: "/carrier/trips"
      via: "Link href + isActive startsWith"
      pattern: "carrier/trips"
    - from: "apps/web/next.config.ts"
      to: "/carrier/trips/:path*"
      via: "async redirects()"
      pattern: "carrier/trips"
---

<objective>
Rename the carrier "Dispatches" feature to "Trips" at the routing and UI layer only. Move the real list/detail/stops pages and their `_grid` files from `carrier/dispatches/` into `carrier/trips/` (overwriting the existing redirect stubs), convert the old `dispatches/` pages into redirect stubs, add permanent next.config redirects, and update sidebar + breadcrumb labels and user-facing strings.

No Prisma, DB, internal function names, component file names, API routes, or `trips/[id]/plan/page.tsx` are touched.

Purpose: Give the feature a user-friendly "Trips" name in URLs and UI while preserving all backend identifiers and existing bookmarks.
Output: Trips routes serve the real UI; dispatches routes redirect; nav/breadcrumb say "Trips".
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Real source pages currently under dispatches/ (to be migrated verbatim with string + path edits):
@apps/web/src/app/(owner)/carrier/dispatches/page.tsx
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
@apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
@apps/web/src/app/(owner)/carrier/dispatches/_grid/columns.tsx
@apps/web/src/app/(owner)/carrier/dispatches/_grid/DispatchesGrid.tsx
@apps/web/src/app/(owner)/carrier/dispatches/_grid/types.ts

Existing redirect stubs to overwrite:
@apps/web/src/app/(owner)/carrier/trips/page.tsx
@apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx

Nav + breadcrumb + config:
@apps/web/src/components/navigation/sidebar.tsx
@apps/web/src/components/Sidebar/index.tsx
@apps/web/src/components/carrier/CarrierBreadcrumb.tsx
@apps/web/next.config.ts

DO NOT TOUCH: apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx (already real).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate real pages + _grid into trips/, convert dispatches/ to redirect stubs</name>
  <files>
    apps/web/src/app/(owner)/carrier/trips/page.tsx
    apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx
    apps/web/src/app/(owner)/carrier/trips/_grid/columns.tsx
    apps/web/src/app/(owner)/carrier/trips/_grid/DispatchesGrid.tsx
    apps/web/src/app/(owner)/carrier/trips/_grid/types.ts
    apps/web/src/app/(owner)/carrier/dispatches/page.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
  </files>
  <action>
Move the REAL content (not the redirect stubs) from dispatches/ into trips/, then leave dispatches/ as redirect stubs. Keep ALL internal logic, getTenantPrisma/prisma calls, getTrip imports, component imports (@/components/carrier/dispatches/*), prop names (dispatchId), and the DC-/DISPATCH_NUMBER format EXACTLY as-is. Only change route hrefs and user-facing strings.

1. **Create `trips/_grid/types.ts`** — copy verbatim from `dispatches/_grid/types.ts`. Keep interface name `DispatchRow` (internal name, leave it). Comment can stay "Types for Dispatches DataGrid" or update to "Trips" (cosmetic, your call).

2. **Create `trips/_grid/columns.tsx`** — copy from `dispatches/_grid/columns.tsx`. Change only:
   - Link href `/carrier/dispatches/${row.original.id}` → `/carrier/trips/${row.original.id}`
   - Keep `header: 'Dispatch #'` (the DC- number column) — per task scope the DC prefix and dispatch-number concept stay. Leave header as 'Dispatch #'.
   - Keep export name `dispatchesColumns`, type `DispatchRow`, helper `extractDispatchNumber`, and the `/carrier/fleet/drivers|trucks/` links unchanged.

3. **Create `trips/_grid/DispatchesGrid.tsx`** — copy from `dispatches/_grid/DispatchesGrid.tsx`. Change only the user-facing strings and route hrefs:
   - `router.push(\`/carrier/dispatches/${row.id}\`)` (the renderQuickActions 'view' action) → `/carrier/trips/${row.id}`
   - `router.push(\`/carrier/dispatches/${row.id}/edit\`)` ('edit' action) → `/carrier/trips/${row.id}/edit`
   - `onRowDoubleClick={(row) => router.push(\`/carrier/dispatches/${row.id}\`)}` → `/carrier/trips/${row.id}`
   - `onNew={... router.push('/carrier/dispatches/new')}` → `/carrier/trips/new`
   - `searchPlaceholder="Search dispatches..."` → `"Search trips..."`
   - `recordName="Dispatch"` → `recordName="Trip"`
   - Keep the `/api/v1/carrier/dispatches?...` fetch URL UNCHANGED (API route stays). Keep `entityType: 'Trip'` in useSoftDelete as-is, keep export name `DispatchesGrid`, keep `gridId="dispatches-overview"`, keep import `{ dispatchesColumns } from './columns'` and `{ DispatchRow } from './types'`.

4. **Overwrite `trips/page.tsx`** (currently a redirect stub) — replace its entire contents with the real list-page content from `dispatches/page.tsx`. Rename the function `DispatchesPage` → `TripsPage`. Import `DispatchesGrid` from `./_grid/DispatchesGrid` (now local to trips). Change heading `Dispatches` → `Trips`. Change sub-heading `Dispatcher&apos;s daily view &mdash; showing today and tomorrow by default.` → `Daily trips view &mdash; showing today and tomorrow by default.` Keep prisma queries and props unchanged.

5. **Overwrite `trips/[id]/page.tsx`** (currently a redirect stub) — replace its entire contents with the real detail-page content from `dispatches/[id]/page.tsx`. Keep function name (rename `DispatchDetailPage` is optional/cosmetic; keep it to minimize churn). Keep ALL imports including `@/components/carrier/dispatches/*` component imports, `getTrip`, prisma. Change only route hrefs:
   - Back link `href="/carrier/dispatches"` → `href="/carrier/trips"` (text already says "Back to Trips" — leave the text)
   - `href={\`/carrier/dispatches/${id}/stops\`}` (View All Stops link) → `/carrier/trips/${id}/stops`
   - Leave all dispatchId props, dispatchNumber/DC- logic, DispatchHeader/StopTimeline/etc. unchanged.

6. **Create `trips/[id]/stops/page.tsx`** — copy from `dispatches/[id]/stops/page.tsx`. Keep `export const dynamic = 'force-dynamic'`, getTrip, prisma, all status/type badge maps and helpers. Change:
   - Back link `href={\`/carrier/dispatches/${id}\`}` → `/carrier/trips/${id}`
   - Back link text `Back to Dispatch` → `Back to Trip`
   - Empty-state text `No stops added to this dispatch yet.` → `No stops added to this trip yet.`
   - Keep `/carrier/stops/${stop.id}` View links unchanged (stops routes are separate). Keep dispatchNumber extraction unchanged.

7. **Convert `dispatches/page.tsx` to a redirect stub** — replace entire file with:
   ```tsx
   import { redirect } from 'next/navigation';

   export default function DispatchesPage() {
     redirect('/carrier/trips');
   }
   ```

8. **Convert `dispatches/[id]/page.tsx` to a redirect stub** — replace entire file with:
   ```tsx
   import { redirect } from 'next/navigation';

   interface Props {
     params: Promise<{ id: string }>;
   }

   export default async function DispatchDetailPage({ params }: Props) {
     const { id } = await params;
     redirect(`/carrier/trips/${id}`);
   }
   ```

9. **Convert `dispatches/[id]/stops/page.tsx` to a redirect stub** — replace entire file with:
   ```tsx
   import { redirect } from 'next/navigation';

   interface Props {
     params: Promise<{ id: string }>;
   }

   export default async function StopsRedirectPage({ params }: Props) {
     const { id } = await params;
     redirect(`/carrier/trips/${id}/stops`);
   }
   ```

10. **Delete the now-orphaned `dispatches/_grid/` files** (columns.tsx, DispatchesGrid.tsx, types.ts) since the dispatches stubs no longer import them. Use the Bash tool to remove the directory. If deletion is not possible cleanly, leaving them is acceptable (they are simply unused) — but prefer removal to avoid duplicate-source confusion.
  </action>
  <verify>
From repo root: `cd apps/web && npx tsc --noEmit` shows no NEW errors in the touched files (baseline ~35 pre-existing errors is acceptable; only flag regressions). Confirm via Grep that `apps/web/src/app/(owner)/carrier/trips/` no longer contains any `/carrier/dispatches/` route hrefs (the API fetch `/api/v1/carrier/dispatches` is the only allowed `dispatches` string in trips/). Confirm `dispatches/page.tsx`, `dispatches/[id]/page.tsx`, `dispatches/[id]/stops/page.tsx` each contain only a `redirect(...)` call.
  </verify>
  <done>
trips/ holds the real list, detail, and stops pages plus local _grid files; trips/page.tsx heading reads "Trips" and grid recordName is "Trip"; dispatches/ pages are 3 redirect stubs pointing to trips equivalents; trips/[id]/plan/page.tsx is unchanged; tsc shows no new errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update sidebars, breadcrumb, and add next.config redirects</name>
  <files>
    apps/web/src/components/navigation/sidebar.tsx
    apps/web/src/components/Sidebar/index.tsx
    apps/web/src/components/carrier/CarrierBreadcrumb.tsx
    apps/web/next.config.ts
  </files>
  <action>
1. **`sidebar.tsx`** (around lines 209-220): in the Trips `PermissionGuard`:
   - `isActive={pathname.startsWith("/carrier/dispatches")}` → `isActive={pathname.startsWith("/carrier/trips")}`
   - `<Link href="/carrier/dispatches" ...>` → `href="/carrier/trips"`
   - Leave `permission="dispatches"`, `tooltip="Trips"`, the `<span>Trips</span>` label, and `<DispatchBadge />` unchanged (label is already "Trips"; permission key is internal).

2. **`Sidebar/index.tsx`** (around lines 311-317): in the `managerHasPermission(perms, "dispatches")` block:
   - `href: "/carrier/dispatches"` → `href: "/carrier/trips"`
   - Leave `label: "Trips"` (already correct), the `"dispatches"` permission key, and `<DispatchBadge />` unchanged.

3. **`CarrierBreadcrumb.tsx`** (SEGMENT_LABELS object, ~line 11): add a `trips: "Trips"` entry and keep the existing `dispatches: "Dispatches"` entry for safety (so old redirected URLs still render a label if ever shown mid-redirect). Place `trips: "Trips",` adjacent to the dispatches line.

4. **`next.config.ts`**: add an `async redirects()` method to the `nextConfig` object (it does not currently exist). Return permanent redirects. Order matters — list the more specific `:path*` rule and the exact rule; Next.js matches both fine but keep the exact one first:
   ```ts
   async redirects() {
     return [
       {
         source: '/carrier/dispatches',
         destination: '/carrier/trips',
         permanent: true,
       },
       {
         source: '/carrier/dispatches/:path*',
         destination: '/carrier/trips/:path*',
         permanent: true,
       },
     ];
   },
   ```
   Add this alongside the existing `experimental` and `headers()` keys; do not remove or alter `headers()`, `experimental`, or the `withSentryConfig` wrapping.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` shows no new errors. Grep confirms `next.config.ts` contains `async redirects()` and both `/carrier/trips` destinations. Grep confirms neither sidebar file contains `href="/carrier/dispatches"` / `href: "/carrier/dispatches"` anymore. Grep confirms `CarrierBreadcrumb.tsx` contains `trips: "Trips"`.
  </verify>
  <done>
Both sidebars link to /carrier/trips and mark it active; breadcrumb maps the trips segment to "Trips"; next.config permanently redirects /carrier/dispatches and /carrier/dispatches/:path* to the trips equivalents. Internal permission keys ("dispatches") and DispatchBadge remain untouched.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — no new TypeScript errors versus baseline.
- Manual (post-deploy or dev): visit `/carrier/trips` → real list with "Trips" heading and "Add New Trip"-style button; visit `/carrier/dispatches` → 308 redirect to `/carrier/trips`; visit `/carrier/trips/<id>` → detail page; `/carrier/trips/<id>/stops` → stops page; sidebar "Trips" link active on trips routes.
- `/carrier/trips/<id>/plan` still renders the untouched plan page.
</verification>

<success_criteria>
- Trips routes (list, [id], [id]/stops) serve the real UI, with `_grid` files local to trips/.
- Old dispatches routes redirect (stub pages + next.config permanent redirects).
- User-facing strings say Trips/Trip; sidebar + breadcrumb labels say Trips.
- No DB, Prisma, API route, internal function/prop name, component file name, or `trips/[id]/plan/page.tsx` changes.
- No new tsc errors.
</success_criteria>

<output>
After completion, create `.planning/quick/429-rename-dispatches-to-trips-routes-ui-lab/429-SUMMARY.md`
</output>
