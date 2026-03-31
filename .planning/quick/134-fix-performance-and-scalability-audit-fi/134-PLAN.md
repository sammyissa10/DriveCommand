---
phase: quick-134
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Wave 1 — Backend performance (API pagination, parallel queries, aggregates, cron batching)
  - apps/web/src/app/api/mobile/owner/loads/route.ts
  - apps/web/src/app/api/mobile/driver/loads/route.ts
  - apps/web/src/app/api/mobile/owner/crm/route.ts
  - apps/web/src/app/api/mobile/owner/trucks/route.ts
  - apps/web/src/app/api/mobile/owner/compliance/route.ts
  - apps/web/src/app/api/mobile/owner/dashboard/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  - apps/web/src/app/api/mobile/driver/messages/route.ts
  - apps/web/src/app/api/cron/send-reminders/route.ts
  - apps/web/src/app/api/mobile/owner/invoices/route.ts
  - apps/web/src/app/api/mobile/owner/payroll/route.ts
  # Wave 1 — Composite indexes
  - apps/web/prisma/schema.prisma
  # Wave 2 — Web pagination + Suspense + loading skeletons
  - apps/web/src/app/(owner)/loads/page.tsx
  - apps/web/src/app/(owner)/invoices/page.tsx
  - apps/web/src/app/(owner)/payroll/page.tsx
  - apps/web/src/app/(owner)/crm/page.tsx
  - apps/web/src/app/(owner)/loads/loading.tsx
  - apps/web/src/app/(owner)/invoices/loading.tsx
  - apps/web/src/app/(owner)/payroll/loading.tsx
  - apps/web/src/app/(owner)/drivers/loading.tsx
  # Wave 2 — Mobile FlashList + expo-image
  - apps/mobile/app/(driver)/incidents/index.tsx
  - apps/mobile/app/(owner)/more/compliance.tsx
  - apps/mobile/app/(owner)/more/invoices/index.tsx
  - apps/mobile/app/(owner)/more/trucks/index.tsx
  - apps/mobile/app/(owner)/more/payroll.tsx
  - apps/mobile/app/(owner)/more/crm/index.tsx
  - apps/mobile/context/SupportTicketContext.tsx
  - apps/mobile/components/driver/IncidentPhotoCapture.tsx
autonomous: true
must_haves:
  truths:
    - "Mobile API list endpoints accept page/limit params and return paginated results (default 50)"
    - "Fleet message endpoints support cursor-based pagination with nextCursor"
    - "Owner dashboard queries run in parallel via Promise.all, not sequentially"
    - "Invoice and payroll stats use groupBy aggregates instead of full-table scans"
    - "Composite indexes exist on high-traffic query paths (Load, Invoice, Document, FleetMessage)"
    - "Web list pages show take:50 with total counts and Suspense loading skeletons"
    - "Mobile list screens use FlashList instead of ScrollView+map"
    - "Mobile image components use expo-image with caching"
  artifacts:
    - path: "apps/web/prisma/migrations/*_add_composite_indexes/migration.sql"
      provides: "Composite index migration"
    - path: "apps/web/src/app/(owner)/loads/loading.tsx"
      provides: "Loads page skeleton"
    - path: "apps/web/src/app/(owner)/invoices/loading.tsx"
      provides: "Invoices page skeleton"
    - path: "apps/web/src/app/(owner)/payroll/loading.tsx"
      provides: "Payroll page skeleton"
    - path: "apps/web/src/app/(owner)/drivers/loading.tsx"
      provides: "Drivers page skeleton"
  key_links:
    - from: "mobile API routes"
      to: "Prisma queries"
      via: "take/skip pagination params"
      pattern: "skip.*page.*limit|take.*limit"
    - from: "fleet message routes"
      to: "Prisma queries"
      via: "cursor-based pagination"
      pattern: "cursor.*take.*orderBy"
---

<objective>
Fix 10 performance and scalability audit findings across web and mobile apps.

Purpose: Prevent unbounded queries, reduce dashboard latency, add proper loading states, and use performant list/image components on mobile.
Output: Paginated APIs, parallel dashboard queries, composite DB indexes, Suspense skeletons, FlashList migrations, expo-image adoption.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/loads/page.tsx
@apps/web/src/app/(owner)/dashboard/loading.tsx
@apps/web/src/app/api/mobile/owner/dashboard/route.ts
@apps/web/src/app/api/mobile/owner/loads/route.ts
@apps/web/src/app/api/mobile/owner/invoices/route.ts
@apps/web/src/app/api/cron/send-reminders/route.ts
@apps/web/prisma/schema.prisma
@apps/mobile/app/(driver)/incidents/index.tsx
@apps/mobile/app/(owner)/more/compliance.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend API pagination, parallel queries, aggregates, cron batching, and composite indexes</name>
  <files>
    apps/web/src/app/api/mobile/owner/loads/route.ts
    apps/web/src/app/api/mobile/driver/loads/route.ts
    apps/web/src/app/api/mobile/owner/crm/route.ts
    apps/web/src/app/api/mobile/owner/trucks/route.ts
    apps/web/src/app/api/mobile/owner/compliance/route.ts
    apps/web/src/app/api/mobile/owner/dashboard/route.ts
    apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    apps/web/src/app/api/mobile/driver/messages/route.ts
    apps/web/src/app/api/cron/send-reminders/route.ts
    apps/web/src/app/api/mobile/owner/invoices/route.ts
    apps/web/src/app/api/mobile/owner/payroll/route.ts
    apps/web/prisma/schema.prisma
  </files>
  <action>
    **1. Add offset pagination to 5 mobile API routes** (backward compatible):
    In each of these routes, parse `page` (default 1) and `limit` (default 50, max 100) from searchParams. Add `take: limit` and `skip: (page - 1) * limit` to the findMany query. Also run a parallel `count()` with the same where clause. Return existing response shape PLUS `pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }` at the top level. Files:
    - `apps/web/src/app/api/mobile/owner/loads/route.ts`
    - `apps/web/src/app/api/mobile/driver/loads/route.ts`
    - `apps/web/src/app/api/mobile/owner/crm/route.ts`
    - `apps/web/src/app/api/mobile/owner/trucks/route.ts`
    - `apps/web/src/app/api/mobile/owner/compliance/route.ts`

    **2. Parallelize owner dashboard queries:**
    In `apps/web/src/app/api/mobile/owner/dashboard/route.ts`, the 8 sequential awaits inside the transaction (activeLoadsCount, driversOnDuty, revenueResult, expiringDocsCount, trucksInMaintenance, activeLoads, drivers, latestHOSEntries) should be grouped into Promise.all calls. Group into two Promise.all batches:
    - Batch 1: `[activeLoadsCount, driversOnDuty, revenueResult, expiringDocsCount, trucksInMaintenance]`
    - Batch 2 (needs driverIds from batch 1's drivers query): `[activeLoads, drivers]` first, then `[latestHOSEntries, driverActiveLoads]`
    Actually, looking at the code more carefully: `drivers` query does NOT depend on earlier results, and `latestHOSEntries` and `driverActiveLoads` depend on `drivers` (for driverIds). So the optimal grouping is:
    - Batch 1 (all independent): `Promise.all([activeLoadsCount, driversOnDuty, revenueResult, expiringDocsCount, trucksInMaintenance, activeLoads, drivers])`
    - Batch 2 (needs driverIds): `Promise.all([latestHOSEntries, driverActiveLoads])`

    **3. Add cursor-based pagination to fleet messages:**
    In `apps/web/src/app/api/mobile/owner/fleet/messages/route.ts` and `apps/web/src/app/api/mobile/driver/messages/route.ts`:
    - Parse `cursor` (message ID, optional) and `limit` (default 50, max 100) from searchParams.
    - Use Prisma cursor-based pagination: `{ take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { createdAt: 'desc' } }`.
    - If results.length > limit, pop the last item and set `nextCursor = lastItem.id`. Otherwise `nextCursor = null`.
    - Return `{ messages: [...], nextCursor }`.

    **4. Batch cron deduplication queries:**
    In `apps/web/src/app/api/cron/send-reminders/route.ts`:
    - Instead of calling `wasNotificationAlreadySent()` one-by-one per reminder, collect all idempotency keys for a tenant upfront, then do a single query: `tx.notificationLog.findMany({ where: { idempotencyKey: { in: allKeys }, tenantId } })` to get all already-sent keys in one round-trip. Build a Set from the results and check membership in-memory.
    - Wrap each email send call in `Promise.race([sendFn(), new Promise((_, reject) => setTimeout(() => reject(new Error('Email send timeout')), 10_000))])`.

    **5. Replace full-table stats scans with aggregates:**
    In `apps/web/src/app/api/mobile/owner/invoices/route.ts`: Replace the second `findMany` (line ~67, `allInvoices`) with `tx.invoice.groupBy({ by: ['status'], where: { tenantId, archivedAt: null }, _count: true, _sum: { totalAmount: true } })`. Compute stats from the groupBy result instead of filtering arrays.
    In `apps/web/src/app/api/mobile/owner/payroll/route.ts`: Apply the same pattern — replace any findMany used purely for stats with `groupBy` + `_count` + `_sum`.

    **6. Add composite indexes to Prisma schema:**
    In `apps/web/prisma/schema.prisma`, add these composite indexes (do NOT remove existing single-column indexes):
    - On `Load` model: `@@index([tenantId, status, archivedAt])`
    - On `Invoice` model: `@@index([tenantId, status])` — already exists as separate indexes, but composite is needed for combined queries
    - On `Document` model: `@@index([tenantId, driverId])`
    - On `FleetMessage` model: `@@index([tenantId, createdAt])`

    After editing schema.prisma, generate the migration:
    ```
    cd apps/web && npx prisma migrate dev --name add_composite_indexes --create-only
    ```
    Then apply it: `npx prisma migrate deploy`
  </action>
  <verify>
    - `cd apps/web && npx prisma validate` passes
    - `cd apps/web && npx prisma migrate status` shows no pending migrations
    - `cd apps/web && npx tsc --noEmit` passes (no type errors from API changes)
    - Spot-check: grep for `take:` or `take ` in modified mobile API routes to confirm pagination added
  </verify>
  <done>
    All 5 mobile list APIs accept page/limit and return pagination metadata. Dashboard queries run in 2 Promise.all batches instead of 8 sequential awaits. Fleet message endpoints support cursor pagination. Cron dedup is batched. Invoice/payroll stats use groupBy. 4 composite indexes exist in schema and are migrated.
  </done>
</task>

<task type="auto">
  <name>Task 2: Web pagination + Suspense boundaries + loading skeletons</name>
  <files>
    apps/web/src/app/(owner)/loads/page.tsx
    apps/web/src/app/(owner)/invoices/page.tsx
    apps/web/src/app/(owner)/payroll/page.tsx
    apps/web/src/app/(owner)/crm/page.tsx
    apps/web/src/app/(owner)/loads/loading.tsx
    apps/web/src/app/(owner)/invoices/loading.tsx
    apps/web/src/app/(owner)/payroll/loading.tsx
    apps/web/src/app/(owner)/drivers/loading.tsx
  </files>
  <action>
    **1. Add `take: 50` to web server component pages:**
    In each of these 4 pages, add `take: 50` to the Prisma `findMany` call. Also add a parallel `count()` query with the same `where` clause. Display total count in the page subtitle (e.g., "Showing 50 of 234 loads"). Files:
    - `apps/web/src/app/(owner)/loads/page.tsx` — add `take: 50` to `prisma.load.findMany`, add count query, update subtitle
    - `apps/web/src/app/(owner)/invoices/page.tsx` — same pattern
    - `apps/web/src/app/(owner)/payroll/page.tsx` — same pattern
    - `apps/web/src/app/(owner)/crm/page.tsx` — same pattern

    For stats computation in loads/page.tsx: currently stats are computed from the full `loads` array. After adding `take: 50`, the stats will only reflect 50 items, which is wrong. Instead, add separate `count()` queries for each stat category (or use `groupBy` on status). For example:
    ```ts
    const [loads, totalCount, statusCounts] = await Promise.all([
      prisma.load.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 50, include: { ... } }),
      prisma.load.count({ where: { archivedAt: null } }),
      prisma.load.groupBy({ by: ['status'], where: { archivedAt: null }, _count: true, _sum: { rate: true } }),
    ]);
    ```
    Then derive stats from statusCounts groupBy result. Apply same pattern to invoices/payroll/crm pages that compute stats.

    **2. Add Suspense boundaries:**
    Follow the dashboard pattern. Each page should extract the async data-fetching portion into an async server component (e.g., `async function LoadsContent()`) and wrap it in `<Suspense fallback={<LoadingSkeleton />}>` in the default export. Import the loading skeleton from the sibling `loading.tsx` file OR inline the Suspense fallback. The simpler approach: Next.js automatically uses `loading.tsx` as the Suspense boundary for the route segment, so just creating the `loading.tsx` files is sufficient. However, for inner Suspense boundaries (data-dependent sections), extract the data-fetching into a separate async component and wrap with `<Suspense>`.

    Recommended approach: Since Next.js already uses `loading.tsx` as the route-level Suspense boundary, the main value is creating the `loading.tsx` files. For the pages themselves, just ensure the async work is in the default export (which it already is as server components).

    **3. Create loading.tsx skeleton files:**
    Create 4 new loading.tsx files following the pattern from `apps/web/src/app/(owner)/dashboard/loading.tsx`:
    - `apps/web/src/app/(owner)/loads/loading.tsx` — skeleton with: header bar (h-8 w-36), 4 stat card skeletons in a 2x2/4-col grid, then 6-8 table row skeletons (h-14 full width)
    - `apps/web/src/app/(owner)/invoices/loading.tsx` — skeleton with: header bar, 3-4 stat cards, table row skeletons
    - `apps/web/src/app/(owner)/payroll/loading.tsx` — skeleton with: header bar, stat cards, table row skeletons
    - `apps/web/src/app/(owner)/drivers/loading.tsx` — skeleton with: header bar, driver card grid skeletons (3-col grid of card-shaped placeholders)

    Use the exact same Tailwind pattern: `animate-pulse`, `rounded`, `bg-muted` for skeleton blocks. Export default function named `{Page}Loading`.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - All 4 loading.tsx files exist and export a default function
    - `grep -r "take: 50" apps/web/src/app/\(owner\)/loads/page.tsx` confirms pagination
    - `grep -r "groupBy\|_count\|_sum" apps/web/src/app/\(owner\)/loads/page.tsx` confirms aggregate stats
  </verify>
  <done>
    All 4 web list pages query at most 50 records with total count displayed. Stats are computed from aggregates, not from the paginated subset. 4 loading.tsx skeleton files provide instant visual feedback during page loads.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mobile FlashList migration + expo-image adoption + final typecheck</name>
  <files>
    apps/mobile/app/(driver)/incidents/index.tsx
    apps/mobile/app/(owner)/more/compliance.tsx
    apps/mobile/app/(owner)/more/invoices/index.tsx
    apps/mobile/app/(owner)/more/trucks/index.tsx
    apps/mobile/app/(owner)/more/payroll.tsx
    apps/mobile/app/(owner)/more/crm/index.tsx
    apps/mobile/context/SupportTicketContext.tsx
    apps/mobile/components/driver/IncidentPhotoCapture.tsx
  </files>
  <action>
    **1. Replace ScrollView + .map() with FlashList in 6 mobile screens:**
    Follow the existing pattern from `apps/mobile/app/(driver)/documents.tsx` and `apps/mobile/app/(owner)/loads/index.tsx` which already use FlashList correctly.

    For each file:
    - Import `{ FlashList }` from `@shopify/flash-list`
    - Remove `ScrollView` from react-native imports (keep other imports like View, Text, Pressable, RefreshControl)
    - Find the `<ScrollView>` that wraps a `.map()` call rendering list items
    - Replace with `<FlashList data={items} renderItem={renderItem} keyExtractor={(item) => item.id} estimatedItemSize={80} />` (adjust estimatedItemSize per content: ~80 for compact rows, ~120 for cards with more detail)
    - Extract the `.map()` callback into a `const renderItem = useCallback(({ item }) => (...), [dependencies])` — wrap with useCallback to prevent re-renders
    - If the ScrollView had `refreshControl`, pass it as a prop to FlashList: `refreshControl={<RefreshControl refreshing={...} onRefresh={...} />}`
    - If there's an empty state, use `ListEmptyComponent` prop

    Files to convert:
    - `apps/mobile/app/(driver)/incidents/index.tsx` — incident list
    - `apps/mobile/app/(owner)/more/compliance.tsx` — compliance documents list
    - `apps/mobile/app/(owner)/more/invoices/index.tsx` — invoices list
    - `apps/mobile/app/(owner)/more/trucks/index.tsx` — trucks list
    - `apps/mobile/app/(owner)/more/payroll.tsx` — payroll records list
    - `apps/mobile/app/(owner)/more/crm/index.tsx` — CRM contacts list

    **2. Replace react-native Image with expo-image in 2 files:**
    - `apps/mobile/context/SupportTicketContext.tsx`: Find any `Image` import from `react-native`. Change to `import { Image } from 'expo-image'`. Add `cachePolicy="memory-disk"` and `contentFit="cover"` props to all `<Image>` usages. Note: expo-image's `Image` uses `contentFit` instead of `resizeMode`, and `source` accepts string URI directly (no `{ uri: ... }` wrapper needed, but the wrapper also works).
    - `apps/mobile/components/driver/IncidentPhotoCapture.tsx`: Same conversion. Replace `Image` from `react-native` with `Image` from `expo-image`. Add `cachePolicy="memory-disk"` and `contentFit="cover"`.

    **3. Final TypeScript check:**
    Run `cd apps/web && npx tsc --noEmit` to verify no type errors across the web app.
    Run `cd apps/mobile && npx tsc --noEmit` to verify no type errors across the mobile app.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - `cd apps/mobile && npx tsc --noEmit` passes
    - `grep -r "FlashList" apps/mobile/app/\(driver\)/incidents/index.tsx` confirms conversion
    - `grep -r "expo-image" apps/mobile/components/driver/IncidentPhotoCapture.tsx` confirms conversion
    - No remaining `ScrollView` + `.map()` pattern in the 6 converted files
  </verify>
  <done>
    6 mobile screens use FlashList with keyExtractor, estimatedItemSize, and useCallback renderItem. 2 files use expo-image with memory-disk caching. TypeScript compiles cleanly across both apps.
  </done>
</task>

</tasks>

<verification>
- All mobile API list endpoints return `pagination` object with `{ page, limit, total, totalPages }`
- Fleet message endpoints return `{ messages, nextCursor }`
- Owner dashboard route uses Promise.all batching (grep for `Promise.all`)
- Invoice/payroll stats routes use `groupBy` instead of full findMany
- Cron route batches idempotency checks (grep for `IN` or `in:`)
- 4 composite indexes in schema.prisma, migration applied
- 4 web pages use `take: 50` with aggregate stats
- 4 loading.tsx files exist with animate-pulse skeletons
- 6 mobile screens use FlashList
- 2 mobile files use expo-image
- `tsc --noEmit` passes for both apps
</verification>

<success_criteria>
All 10 audit findings are resolved: unbounded queries are paginated, dashboard queries parallelized, stats use aggregates, cron is batched, indexes are created, loading states exist, and mobile uses performant list/image components. TypeScript compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/134-fix-performance-and-scalability-audit-fi/134-SUMMARY.md`
</output>
