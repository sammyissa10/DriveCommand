# Pitfalls Research

**Domain:** Adding GPS mapping, safety dashboards, fuel analytics, and sidebar navigation to existing Next.js 16 multi-tenant fleet management app
**Researched:** 2026-02-15
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Map Libraries Failing SSR in Next.js App Router

**What goes wrong:**
Leaflet and react-leaflet crash during server-side rendering because they directly access `window` and `document` during module initialization. This causes "ReferenceError: window is not defined" errors that break the build or initial page load. The issue is exacerbated in Next.js 16 App Router where server components are the default.

**Why it happens:**
Map libraries were designed for browser-only environments and make DOM calls during construction. Next.js App Router pre-renders everything on the server by default, creating a mismatch. Developers often import map components directly without realizing they need special handling.

**How to avoid:**
1. **Always use dynamic imports with SSR disabled** for any map component:
```typescript
const MapComponent = dynamic(() => import('@/components/map/live-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-200" />
})
```
2. **Mark map containers as client components** with `'use client'` directive
3. **Lazy load Leaflet itself** - don't import it at module level, import it inside `useEffect`
4. **Custom marker icons require special handling** - L.Icon() instantiates window objects and cannot be loaded with dynamic(), so configure icons inside useEffect after map initialization

**Warning signs:**
- Build errors mentioning "window is not defined" or "document is not defined"
- Maps work in development but fail in production builds
- Custom marker icons don't appear after deployment
- Hydration mismatches between server and client

**Phase to address:**
Phase 1 (Live GPS Map Foundation) - Establish the dynamic import pattern immediately. Create a reusable MapWrapper component that handles SSR concerns so other developers don't repeat the mistake.

---

### Pitfall 2: Chart Libraries Causing Hydration Mismatches

**What goes wrong:**
Recharts and other visualization libraries generate different output on server vs. client due to ResponsiveContainer needing browser dimensions, random IDs, or time-based values. This causes React hydration errors: "Text content does not match server-rendered HTML" or "Hydration failed because the initial UI does not match." Charts may flash, render incorrectly, or display error overlays.

**Why it happens:**
ResponsiveContainer requires knowing DOM dimensions before rendering, which isn't available during SSR. Charts that use Date.now(), Math.random(), or measure DOM elements during render create mismatches. Next.js 16 aggressively pre-renders, making this worse than previous versions.

**How to avoid:**
1. **Mark all chart components as client components** with `'use client'` at the top of the file
2. **Use dynamic imports for chart containers** if they're in server component trees:
```typescript
const DashboardCharts = dynamic(() => import('@/components/charts/fuel-charts'), {
  ssr: false
})
```
3. **Initialize chart data in useEffect** to ensure consistent server/client rendering
4. **Provide static placeholder dimensions** during SSR instead of responsive containers
5. **Keep client components small** - wrap only the chart itself, not entire dashboard pages

**Warning signs:**
- React hydration errors in browser console
- Charts render twice (flash/re-render on load)
- Different chart dimensions on first render vs. subsequent renders
- Empty charts that appear after a delay
- Console warnings about useLayoutEffect

**Phase to address:**
Phase 3 (Safety Dashboard Core) and Phase 4 (Fuel & Energy Dashboard) - Establish client component pattern during Safety Dashboard implementation. Document the approach in a shared charts module that Fuel Dashboard reuses.

---

### Pitfall 3: RLS Bypass During Development Breaking Production Security

**What goes wrong:**
Seed scripts and development work using superuser database connections (postgres role) bypass Row-Level Security policies entirely. RLS appears to work during testing but actually isn't being enforced. When new GPS, Safety, or Fuel models are added, developers test with superuser credentials and mistakenly believe RLS is protecting tenant data. In production or with real user credentials, either (a) queries fail because RLS blocks everything, or (b) data leaks across tenants because policies were never actually tested.

**Why it happens:**
PostgreSQL's RLS explicitly bypasses enforcement for superusers and table owners (BYPASSRLS attribute). The Prisma connection string in .env.local often uses the postgres superuser for convenience. Developers run seed scripts, test features, and verify "tenant isolation" while RLS is silently disabled. The existing app has 10 phases with RLS working, but new models (GPSLocation, SafetyEvent, FuelTransaction) require new policies that go untested.

**How to avoid:**
1. **Create a restricted database user for Prisma** (not postgres superuser):
```sql
CREATE USER drivecommand_app WITH PASSWORD 'xxx';
GRANT USAGE ON SCHEMA public TO drivecommand_app;
-- Grant specific table permissions, NOT superuser
```
2. **Update DATABASE_URL to use restricted user** for all development/testing
3. **Use separate superuser connection only for migrations** via `DATABASE_URL_ADMIN`
4. **Test RLS from SDK/application code, never from SQL editor** which bypasses RLS
5. **Add RLS verification to seed scripts**:
```typescript
// After seeding, verify isolation works
const tenant1Data = await db.gpsLocation.findMany(); // with tenant1 context
const tenant2Data = await db.gpsLocation.findMany(); // with tenant2 context
if (tenant1Data.some(row => row.tenantId !== tenant1Id)) {
  throw new Error('RLS BYPASS DETECTED');
}
```
6. **Document RLS testing protocol** in .planning/verification/ for each phase

**Warning signs:**
- Queries work in development but fail in production with permission errors
- Tenant data visible across organizations during testing
- New models added without corresponding RLS policies
- Seed scripts succeed but app queries fail with RLS errors
- Performance is suspiciously good (RLS not adding overhead = RLS not running)

**Phase to address:**
Phase 1 (Live GPS Map Foundation) - Address immediately when creating first new model (GPSLocation). Establish restricted database user pattern and RLS testing protocol that subsequent phases follow.

---

### Pitfall 4: Memory Leaks from Real-Time Map Updates

**What goes wrong:**
GPS tracking with real-time updates creates memory leaks when map markers and event listeners accumulate without cleanup. Every vehicle location update creates new marker instances, event listeners, or GeoJSON features. Over hours of operation, browser memory grows from 100MB to 2GB+, causing tab crashes. Fleet managers monitoring 50+ vehicles experience degraded performance, frozen UI, or browser crashes during active tracking sessions.

**Why it happens:**
Leaflet uses DOM-based rendering where markers are actual DOM elements. Adding new markers without removing old ones leaks memory. Event listeners attached to markers persist even after visual elements are removed. React component unmounting doesn't automatically clean up Leaflet instances. WebSocket/SSE connections for real-time updates continue streaming data even after components unmount, creating retained closures.

**How to avoid:**
1. **Remove markers before adding new ones**:
```typescript
useEffect(() => {
  const markers = new Map();

  // Update vehicle position
  const updateVehicle = (vehicleId, position) => {
    // Remove old marker
    if (markers.has(vehicleId)) {
      markers.get(vehicleId).remove();
    }
    // Add new marker
    const marker = L.marker(position).addTo(map);
    markers.set(vehicleId, marker);
  };

  // Cleanup on unmount
  return () => {
    markers.forEach(marker => marker.remove());
    markers.clear();
  };
}, []);
```
2. **Remove all event listeners explicitly** before component unmount
3. **Clear custom marker properties** that hold references
4. **Use marker updates instead of replacements** when possible:
```typescript
marker.setLatLng(newPosition); // Update existing marker
// NOT: marker.remove(); L.marker(newPosition).addTo(map);
```
5. **Disconnect real-time data streams** in cleanup:
```typescript
useEffect(() => {
  const eventSource = new EventSource('/api/gps-stream');
  eventSource.onmessage = handleUpdate;

  return () => {
    eventSource.close(); // CRITICAL
  };
}, []);
```
6. **Implement periodic marker cleanup** for long-running sessions
7. **Consider marker clustering** for fleets >20 vehicles to reduce DOM nodes

**Warning signs:**
- Browser memory usage steadily climbing during live tracking
- Map performance degrading after 30+ minutes of operation
- Browser DevTools showing thousands of detached DOM nodes
- Tab crashes during extended monitoring sessions
- Sluggish marker animations after multiple updates

**Phase to address:**
Phase 1 (Live GPS Map Foundation) - Build cleanup patterns into initial map implementation. Create a `useMapMarkers` hook that handles lifecycle correctly so all future map features inherit proper cleanup.

---

### Pitfall 5: Sidebar Navigation Migration Breaking Existing Routes

**What goes wrong:**
Overhauling navigation from header-based to sidebar layout causes existing routes to break, lose their layouts, or display incorrectly. The app has 10 completed phases with routes under `(owner)`, `(driver)`, and `(admin)` route groups. Moving to sidebar navigation requires restructuring these groups, but incorrect implementation causes: (a) routes resolving to conflicting paths, (b) layouts not applying to existing pages, (c) scroll position and layout shifts between pages, or (d) authentication guards being bypassed.

**Why it happens:**
Next.js 16 route groups create implicit URL structure. Renaming or restructuring groups changes which layouts apply to which pages. Multiple root layouts can create conflicting paths (e.g., `(marketing)/about` and `(shop)/about` both resolve to `/about`). Developers add sidebar to one route group but existing pages are in different groups, so they don't inherit the new layout. Layout component state (scroll position, sidebar collapsed state) doesn't persist between navigations if layouts aren't shared correctly.

**How to avoid:**
1. **Audit all existing routes before migration**:
```bash
# List all route files
find src/app -name "page.tsx" -o -name "layout.tsx"
```
2. **Create sidebar layout as wrapper, not replacement**:
```typescript
// src/app/(dashboard)/layout.tsx - NEW
export default function DashboardLayout({ children }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
```
3. **Move routes incrementally** - don't rename all route groups at once
4. **Preserve existing route group names** - add new layout inside existing structure
5. **Test every existing route** after navigation changes - automated link crawler
6. **Handle scroll restoration** for main content area:
```typescript
// Prevent layout shift between pages
<main className="flex-1 overflow-auto" key={pathname}>
  {children}
</main>
```
7. **Verify auth guards still apply** after layout restructuring

**Warning signs:**
- 404 errors on previously working routes
- Pages missing expected layout/sidebar
- Scroll position jumping between page navigations
- Layout shifts or flash of unstyled content
- Authentication not redirecting on protected routes
- Sidebar state not persisting between navigations

**Phase to address:**
Phase 2 (Sidebar Navigation Foundation) - Migrate incrementally, testing each route. Create a route testing checklist in verification docs. Don't proceed to Phase 3 until all 10 existing phases' routes work with new navigation.

---

### Pitfall 6: Client Component Proliferation Exploding Bundle Size

**What goes wrong:**
Adding maps (Leaflet + react-leaflet + dependencies) and charts (Recharts + d3 dependencies) creates massive client-side JavaScript bundles. The app's current bundle is ~200KB. After adding maps and charts, first-load JS balloons to 800KB-1.2MB. Page load times jump from 1.5s to 4-6s on 3G connections. Lighthouse performance scores drop from 95 to 60. Users on mobile networks experience significant delays before interactive content appears.

**Why it happens:**
Leaflet alone is ~150KB minified, plus react-leaflet wrapper (~20KB), plus tile layers and plugins. Recharts is ~100KB, plus d3 dependencies (~80KB for the components Recharts uses). These libraries must be client-side because they require browser APIs. Marking entire pages or layouts with `'use client'` pulls all imports into client bundle, including code that could be server-rendered. Next.js tree shaking doesn't work well when full libraries are imported.

**How to avoid:**
1. **Analyze bundle before and after each library addition**:
```bash
npm install @next/bundle-analyzer
# Run and review output before proceeding
npm run build
```
2. **Use dynamic imports for all heavy components**:
```typescript
// NOT: import { LineChart, BarChart } from 'recharts';
// INSTEAD:
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false });
```
3. **Optimize package imports** in next.config.js:
```javascript
// next.config.js
module.exports = {
  optimizePackageImports: ['recharts', 'leaflet']
}
```
4. **Keep client component boundaries small** - wrap only interactive widgets:
```typescript
// ✅ Good: Small client component
'use client';
export function FuelChart({ data }) {
  return <LineChart data={data} />; // Only chart is client
}

// ❌ Bad: Large client component
'use client';
export default function DashboardPage() {
  // Entire page becomes client bundle
  return <div>...<FuelChart />...</div>;
}
```
5. **Split map and chart code** into separate route chunks using route-based code splitting
6. **Consider lighter alternatives** for simple visualizations (CSS-based charts, SVG without libraries)
7. **Set bundle size budgets** - fail build if first-load JS >500KB

**Warning signs:**
- First-load JS >500KB in Next.js build output
- Page load time >3s on Fast 3G
- Lighthouse performance score dropping
- Time to Interactive (TTI) increasing significantly
- Users reporting slow dashboard loads
- Bundle analyzer showing duplicate dependencies

**Phase to address:**
Phase 1 (Live GPS Map Foundation) - Establish dynamic import patterns and bundle monitoring. Set up @next/bundle-analyzer and document max bundle size for each phase. Fail PR reviews if bundle grows >100KB without justification.

---

### Pitfall 7: Mock Data Not Flowing Through Real RLS-Protected APIs

**What goes wrong:**
Developers create realistic mock GPS coordinates, safety events, and fuel transactions but insert them directly into the database via raw SQL or bypassing the application's RLS-protected repository layer. During UI development, data appears correct. When switching to production-like flows where data must come through server actions and RLS-protected queries, everything breaks because: (a) RLS policies block the mock data, (b) data appears for wrong tenants, or (c) required fields are missing because mock data doesn't match validation schemas.

**Why it happens:**
It's faster to seed databases with raw SQL than building proper seed scripts that use the app's repository layer. Developers write `INSERT INTO gps_locations ...` directly, bypassing Prisma client extensions with RLS. Mock data doesn't go through Zod validation schemas, so it's missing required fields or has invalid foreign keys. The existing 10 phases established patterns (server components → repositories → Prisma with RLS), but new features skip these patterns during development to move faster.

**How to avoid:**
1. **All mock data must flow through repository layer**:
```typescript
// ❌ Bad: Direct insertion bypassing RLS
await prisma.$executeRaw`INSERT INTO gps_locations ...`;

// ✅ Good: Use repository with RLS
const db = await getTenantDb(tenantId);
await db.gpsLocation.create({ data: mockGPSData });
```
2. **Validate mock data against Zod schemas** before insertion:
```typescript
import { createGPSLocationSchema } from '@/lib/validations/gps.schemas';

const mockData = createGPSLocationSchema.parse({
  vehicleId: 'uuid',
  latitude: 37.7749,
  // ... must match production schema
});
```
3. **Create realistic seed scripts using existing patterns**:
```typescript
// prisma/seed-gps-data.ts
import { getTenantDb } from '@/lib/db/repositories/base.repository';

async function seedGPSData(tenantId: string) {
  const db = await getTenantDb(tenantId);

  // Generate realistic GPS trails
  for (const vehicle of vehicles) {
    await db.gpsLocation.createMany({
      data: generateVehicleRoute(vehicle.id)
    });
  }
}
```
4. **Test that mock data is tenant-isolated**:
```typescript
// Verify RLS works with mock data
const tenant1Db = await getTenantDb(tenant1Id);
const tenant2Db = await getTenantDb(tenant2Id);

const tenant1GPS = await tenant1Db.gpsLocation.findMany();
const tenant2GPS = await tenant2Db.gpsLocation.findMany();

// Should have zero overlap
assert(tenant1GPS.every(loc => loc.tenantId === tenant1Id));
```
5. **Document mock data generation** in each phase's planning docs
6. **Run seed scripts through same code paths as production** (server actions, API routes)

**Warning signs:**
- Mock data visible when it shouldn't be (wrong tenant)
- RLS errors when switching from seed data to real data flows
- Validation errors when using mock data in forms/actions
- Foreign key constraint violations in seed scripts
- Tests pass with mock data but fail with real user flows
- Different behavior in development vs. production databases

**Phase to address:**
Phase 1 (Live GPS Map Foundation) - Establish seed script pattern when creating first new models. Create `scripts/seed-gps-mock-data.ts` that uses repository layer, validates against schemas, and verifies RLS isolation. Subsequent phases copy this pattern.

---

### Pitfall 8: Dashboard Aggregations Killing Database Performance

**What goes wrong:**
Safety and fuel dashboards run aggregation queries like "show average fuel efficiency by vehicle for last 30 days" or "count harsh braking events per driver this month." With 1000+ vehicles generating GPS/safety/fuel events every minute, these queries take 10-30 seconds. Dashboards timeout. Database CPU spikes to 100%. Other tenants experience slow queries. The app becomes unusable during peak hours when multiple managers view dashboards simultaneously.

**Why it happens:**
Aggregation queries use GROUP BY on large datasets without proper indexing. RLS policies use non-LEAKPROOF functions that prevent index usage, forcing sequential scans. Queries retrieve all data and aggregate in-memory instead of using database aggregations. No filtering by date range before aggregating (scanning millions of rows instead of thousands). Dashboard refreshes every 30 seconds, multiplying query load.

**How to avoid:**
1. **Index all columns used in GROUP BY and WHERE clauses**:
```sql
CREATE INDEX idx_fuel_transactions_tenant_vehicle_date
  ON fuel_transactions (tenant_id, vehicle_id, recorded_at);

CREATE INDEX idx_safety_events_tenant_driver_date
  ON safety_events (tenant_id, driver_id, event_date);
```
2. **Always filter by date range before aggregating**:
```sql
-- ❌ Bad: Aggregates all rows
SELECT vehicle_id, AVG(mpg) FROM fuel_transactions
  WHERE tenant_id = ? GROUP BY vehicle_id;

-- ✅ Good: Filters first
SELECT vehicle_id, AVG(mpg) FROM fuel_transactions
  WHERE tenant_id = ? AND recorded_at >= NOW() - INTERVAL '30 days'
  GROUP BY vehicle_id;
```
3. **Use LEAKPROOF functions in RLS policies** to enable index usage:
```sql
-- Mark custom functions as LEAKPROOF if they don't leak data
CREATE FUNCTION get_tenant_id() RETURNS uuid AS $$ ... $$ LANGUAGE plpgsql LEAKPROOF;
```
4. **Aggregate in database, not application**:
```typescript
// ✅ Good: Database aggregation
const stats = await db.$queryRaw`
  SELECT vehicle_id, COUNT(*) as event_count
  FROM safety_events
  WHERE tenant_id = ${tenantId} AND event_date >= ${startDate}
  GROUP BY vehicle_id
`;

// ❌ Bad: Application aggregation
const events = await db.safetyEvent.findMany({ where: { tenantId } });
const stats = events.reduce((acc, event) => { /* group logic */ }, {});
```
5. **Increase work_mem for hash aggregates**:
```sql
-- Per-session or per-query
SET work_mem = '256MB'; -- Allows larger hash tables
```
6. **Consider materialized views** for complex aggregations:
```sql
CREATE MATERIALIZED VIEW mv_daily_fuel_stats AS
  SELECT tenant_id, vehicle_id, DATE(recorded_at) as date,
         AVG(mpg) as avg_mpg, SUM(gallons) as total_gallons
  FROM fuel_transactions
  GROUP BY tenant_id, vehicle_id, DATE(recorded_at);

-- Refresh periodically (hourly/daily)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_fuel_stats;
```
7. **Cache dashboard aggregations** with short TTL (5 minutes)

**Warning signs:**
- Dashboard queries taking >5 seconds in logs
- Database CPU >80% when dashboards load
- EXPLAIN ANALYZE showing "Seq Scan" instead of "Index Scan"
- Query planner not using indexes on tenant_id columns
- work_mem warnings in PostgreSQL logs
- Multiple managers opening dashboards causes slowdown

**Phase to address:**
Phase 3 (Safety Dashboard Core) and Phase 4 (Fuel & Energy Dashboard) - Create aggregation patterns during Safety Dashboard. Run EXPLAIN ANALYZE on all queries. Set query performance budget: all aggregations <2s with 1000 vehicles, 30 days of data.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using SSR for maps/charts | Simpler code, no dynamic imports | Build failures, hydration errors, production crashes | Never - always use dynamic imports |
| Marking entire pages as client components | Everything works, less thinking | Massive bundle sizes, poor performance, SEO loss | Never - keep client boundaries small |
| Seeding data with raw SQL | Fast development, no schema validation | RLS bypass, tenant data leaks, production failures | Never in multi-tenant apps |
| Skipping map marker cleanup | Maps work initially | Memory leaks, browser crashes after 30+ minutes | Only for static maps with <5 markers |
| Using window object in modules | Easy access to browser APIs | SSR crashes, Next.js build failures | Never - always check `typeof window !== 'undefined'` |
| Superuser database connection | Convenient, no permission issues | RLS bypassed, false security confidence | Only for migrations, never application code |
| Full library imports | Simple import statements | Bundle bloat, slow page loads | Never for heavy libraries (maps, charts) |
| Hardcoded tenant context | Faster than middleware lookups | Tenant data leaks, security vulnerabilities | Never - always use context from middleware |
| Aggregating without date filters | Shows "all time" data | Slow queries, database overload | Only for tenants with <100 vehicles and <1 month of data |
| Client-side real-time updates | Easy to implement with polling | Excessive API calls, poor performance | Only for dashboards with <10 concurrent users |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Leaflet in Next.js | Import at module level | Dynamic import with `ssr: false`, configure in useEffect |
| Recharts ResponsiveContainer | Render on server | Mark component `'use client'`, provide static height fallback |
| PostgreSQL RLS with Prisma | Use superuser for app connection | Create restricted user, use client extension for set_config |
| Real-time GPS via SSE | Not closing EventSource on unmount | Store reference and close in useEffect cleanup |
| Custom Leaflet markers | Import L.Icon at module level | Initialize icons inside useEffect after map loads |
| Route groups in Next.js 16 | Rename groups without testing | Keep existing groups, add layouts inside them incrementally |
| Mock seed data | Direct SQL inserts | Flow through repository layer with RLS context |
| Map tile providers | Use free tier without limits | Implement request caching, set max zoom levels |
| Dashboard aggregations | No date range filters | Always filter by date before GROUP BY, use indexes |
| WebSocket/SSE connections | Create new connection per component | Singleton connection manager, share across components |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded GPS location queries | Dashboard slow to load, high DB CPU | Add date range filters, paginate results, create indexes on timestamp columns | >10K GPS points per vehicle |
| Missing RLS policy indexes | 10-100x slower queries, sequential scans | Index all columns in RLS policies (tenantId, userId) | >1K rows per tenant |
| Chart re-renders on every GPS update | UI freezes during live tracking | Batch updates, throttle re-renders, memoize chart components | >5 updates/second |
| Loading full map bundle on non-map pages | Slow initial page load | Route-based code splitting, lazy load map only on map page | Bundle >500KB |
| N+1 queries for dashboard aggregations | Slow dashboard load, high query count | Use GROUP BY aggregations, create materialized views for complex metrics | >100 vehicles per tenant |
| DOM-based map markers | Memory leaks, browser crashes | Use marker clustering for >20 vehicles, clean up markers in useEffect | >50 active markers |
| Hydration mismatches from charts | Flash of incorrect content, console errors | Disable SSR for charts, use `'use client'` directive | Any responsive chart |
| Unoptimized aggregations with GROUP BY | Dashboard queries >5s | Index GROUP BY columns, filter with WHERE before grouping, increase work_mem | >100K rows aggregated |
| Real-time updates without throttling | Excessive re-renders, UI lag | Throttle updates to 1/second, batch marker updates | >10 vehicles streaming |
| Non-LEAKPROOF RLS functions | Indexes not used, sequential scans | Mark safe functions LEAKPROOF, verify with EXPLAIN ANALYZE | >10K rows per tenant |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Testing RLS with superuser | False security confidence, tenant data leaks in production | Use restricted database user, verify RLS in integration tests |
| Bypassing repository layer | RLS not applied, direct tenant access | Always use getTenantDb(), never direct Prisma access |
| Client-side tenant filtering | Tenant data exposed to wrong users | Enforce RLS at database level, never filter in React components |
| Missing tenantId in new models | Cross-tenant data visibility | Add tenantId to all new tables (GPSLocation, SafetyEvent, FuelTransaction) |
| Hardcoded tenant IDs in seed scripts | Test data in production tenant | Parameterize seed scripts, use separate test tenants |
| Exposing GPS coordinates without authorization | Privacy violations, competitor intel leaks | Verify user has access to vehicle before returning GPS data |
| Not forcing RLS for table owners | Developers bypass RLS without knowing | Use `ALTER TABLE ... FORCE ROW LEVEL SECURITY` |
| Real-time data endpoints without auth | Anyone can access GPS stream | Verify tenant context and vehicle ownership before streaming |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Loading full map immediately | 4-6s blank screen on mobile | Show loading skeleton, lazy load map after critical content |
| Real-time updates causing map jumps | Disorienting when panning/zooming | Pause updates when user is interacting with map |
| No offline handling for live GPS | Dashboard breaks when connection drops | Show last known position, indicate staleness |
| Overloaded dashboards with 20+ charts | Overwhelming, slow to render | Use tabs/sections, load charts on-demand |
| Sidebar covering content on mobile | Unusable on small screens | Responsive sidebar (drawer on mobile, permanent on desktop) |
| No empty states for new tenants | Confusion when no vehicles tracked yet | Show helpful onboarding, sample data, or setup instructions |
| Chart animations on every data update | Distracting during live tracking | Disable animations for real-time updates, keep for initial load |
| Map markers all same color | Can't distinguish vehicle types/status | Color-code by vehicle type, status, fuel level, safety score |
| Sidebar navigation with no active state | Users lost, don't know current page | Highlight active route, show breadcrumbs for nested pages |
| Dashboard auto-refresh without indicator | Confusing when data changes unexpectedly | Show "Updated 30s ago" or refresh indicator |

## "Looks Done But Isn't" Checklist

- [ ] **Live GPS Map:** Map renders - verify marker cleanup prevents memory leaks (run for 1+ hour)
- [ ] **GPS Tracking:** Mock data displays - verify data flows through RLS-protected repositories
- [ ] **Safety Dashboard:** Charts render - verify no hydration mismatches in production build
- [ ] **Fuel Analytics:** Aggregations work - verify queries <2s with realistic data volume (1000+ vehicles)
- [ ] **Sidebar Navigation:** Routes work in dev - verify all existing routes work in production with new layout
- [ ] **Real-time Updates:** WebSocket/SSE connected - verify cleanup on unmount, no zombie connections
- [ ] **New Models (GPS, Safety, Fuel):** Database tables exist - verify RLS policies block cross-tenant access
- [ ] **Chart Components:** Display on localhost - verify bundle size <500KB first-load JS
- [ ] **Mock Data:** Seeds successfully - verify data accessible only via proper tenant context
- [ ] **Map Interactions:** Pan/zoom work - verify no memory leaks, no global namespace pollution
- [ ] **Dashboard Aggregations:** Show correct totals - verify indexed, verify GROUP BY performance
- [ ] **Client Components:** Interactive features work - verify not marking entire pages client-side
- [ ] **Route Migration:** All pages load - verify no 404s, layouts apply correctly, auth guards work
- [ ] **EventSource/WebSocket:** Streams data - verify closed on cleanup, no connection leaks
- [ ] **Responsive Charts:** Resize correctly - verify no hydration errors, consistent dimensions

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Map SSR failures in production | **MEDIUM** | 1. Add dynamic import wrapper, 2. Redeploy, 3. Add SSR check to pre-deployment tests |
| RLS bypassed during development | **HIGH** | 1. Create restricted DB user, 2. Audit all queries for tenant isolation, 3. Add RLS integration tests, 4. Re-seed with proper isolation |
| Memory leaks from markers | **LOW** | 1. Add cleanup in useEffect returns, 2. Implement marker pooling/reuse, 3. Add memory profiling to QA checklist |
| Bundle size explosion | **MEDIUM** | 1. Run bundle analyzer, 2. Convert full imports to dynamic, 3. Split heavy features to separate routes, 4. Add bundle size CI check |
| Hydration mismatches | **LOW** | 1. Add `'use client'` to chart components, 2. Use dynamic import with ssr: false, 3. Document pattern |
| Broken routes after nav migration | **MEDIUM** | 1. Restore route group structure, 2. Test each route manually, 3. Add route regression tests |
| Missing RLS policies on new models | **HIGH** | 1. Add policies to schema, 2. Run migration, 3. Verify with restricted user, 4. Audit seed data for leaks |
| Slow dashboard aggregations | **MEDIUM** | 1. Add indexes on GROUP BY columns, 2. Add WHERE filters before aggregation, 3. Consider materialized views for complex metrics |
| EventSource not closed | **LOW** | 1. Add cleanup to useEffect return, 2. Create connection manager singleton, 3. Document pattern |
| Non-LEAKPROOF RLS functions | **MEDIUM** | 1. Mark safe functions LEAKPROOF, 2. Run EXPLAIN ANALYZE, 3. Verify indexes used, 4. Document RLS function requirements |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Map SSR failures | Phase 1: Live GPS Map Foundation | Build succeeds, map renders in production, no window/document errors |
| Chart hydration mismatches | Phase 3: Safety Dashboard Core | No hydration errors in console, charts render consistently |
| RLS bypass with superuser | Phase 1: Live GPS Map Foundation | Integration tests with restricted user pass, cross-tenant queries blocked |
| Memory leaks from real-time updates | Phase 1: Live GPS Map Foundation | Memory usage stable after 1 hour of tracking 50 vehicles |
| Navigation breaking existing routes | Phase 2: Sidebar Navigation Foundation | All 10 existing phases' routes accessible and render correctly |
| Bundle size explosion | Phase 1: Live GPS Map Foundation | First-load JS <500KB, Lighthouse performance >90 |
| Mock data bypassing RLS | Phase 1: Live GPS Map Foundation | Seed scripts use repository layer, data isolated by tenant |
| Aggregation performance | Phase 3: Safety Dashboard Core | Dashboard queries <2s with 1000 vehicles, indexes on GROUP BY columns |
| Missing new model RLS policies | Phase 1: Live GPS Map Foundation | GPSLocation policy blocks cross-tenant access |
| Sidebar scroll/layout shift | Phase 2: Sidebar Navigation Foundation | No layout shift when navigating, scroll position stable |
| EventSource/WebSocket not cleaned up | Phase 1: Live GPS Map Foundation | No active connections after unmounting components |
| Non-LEAKPROOF functions in RLS | Phase 1: Live GPS Map Foundation | EXPLAIN ANALYZE shows index usage on tenant queries |

## Sources

### Map Library Pitfalls
- [How to use react-leaflet in Nextjs with TypeScript (Surviving it) | Medium](https://andresmpa.medium.com/how-to-use-react-leaflet-in-nextjs-with-typescript-surviving-it-21a3379d4d18)
- [Making React-Leaflet work with NextJS | PlaceKit](https://placekit.io/blog/articles/making-react-leaflet-work-with-nextjs-493i)
- [React Leaflet on Next.js 15 (App router) | XXL Steve](https://xxlsteve.net/blog/react-leaflet-on-next-15/)
- [Understand memory leak prevention](https://app.studyraid.com/en/read/11881/378250/memory-leak-prevention)
- [Memory Leak after map.remove() · Issue #4862 · mapbox/mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js/issues/4862)

### Chart Library and Hydration Issues
- [Text content does not match server-rendered HTML | Next.js](https://nextjs.org/docs/messages/react-hydration-error)
- [Mastering SSR and CSR in Next.js: Data Visualizations](https://dzone.com/articles/mastering-ssr-and-csr-in-nextjs)
- [Next.js Charts with Recharts - A Useful Guide](https://app-generator.dev/docs/technologies/nextjs/integrate-recharts.html)
- [Responsive Container doesnt support Server Side Rendering · Issue #531 · recharts/recharts](https://github.com/recharts/recharts/issues/531)

### PostgreSQL RLS Performance and Security
- [RLS Performance and Best Practices · supabase · Discussion #14576](https://github.com/orgs/supabase/discussions/14576)
- [Optimizing Postgres Row Level Security (RLS) for Performance | Scott Pierce](https://scottpierce.dev/posts/optimizing-postgres-rls/)
- [Common Postgres Row-Level-Security footguns](https://www.bytebase.com/blog/postgres-row-level-security-footguns/)
- [Postgres RLS Implementation Guide - Best Practices, and Common Pitfalls](https://www.permit.io/blog/postgres-rls-implementation-guide)
- [Securing Multi-Tenant Applications Using Row Level Security in PostgreSQL with Prisma ORM | Medium](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35)

### Next.js Bundle Size and Performance
- [Guides: Package Bundling | Next.js](https://nextjs.org/docs/app/guides/package-bundling)
- [Optimizing Next.js Performance: Bundles, Lazy Loading, and Images | Catch Metrics](https://www.catchmetrics.io/blog/optimizing-nextjs-performance-bundles-lazy-loading-and-images)
- [How to Reduce Next.js Bundle Size | NE Digital](https://medium.com/ne-digital/how-to-reduce-next-js-bundle-size-68f7ac70c375)

### Next.js Navigation and Layout Migration
- [Layout shift when routing to different page · Issue #43418 · vercel/next.js](https://github.com/vercel/next.js/issues/43418)
- [File-system conventions: Route Groups | Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [Upgrading: Version 15 | Next.js](https://nextjs.org/docs/app/guides/upgrading/version-15)

### Real-Time Data and Fleet Management
- [Next.js Real-Time Chat: The Right Way to Use WebSocket and SSE · BetterLink Blog](https://eastondev.com/blog/en/posts/dev/20260107-nextjs-realtime-chat/)
- [Streaming in Next.js 15: WebSockets vs Server-Sent Events | HackerNoon](https://hackernoon.com/streaming-in-nextjs-15-websockets-vs-server-sent-events)
- [How To Debug Memory Leaks in React Native Applications](https://oneuptime.com/blog/post/2026-01-15-react-native-memory-leaks/view)

### Dashboard and Aggregation Performance
- [Speeding up GROUP BY in PostgreSQL | CYBERTEC](https://www.cybertec-postgresql.com/en/speeding-up-group-by-in-postgresql/)
- [PostgreSQL slow with million row aggregation (how to debug)](https://code.krister.ee/postgresql-slow-with-million-row-aggregation-how-to-debug/)
- [Fleet Management Dashboards Explained for 2026](https://www.fanruan.com/en/blog/fleet-management-dashboard)
- [Driver Behavior Monitoring: Complete Fleet Safety Guide 2026](https://oxmaint.com/industries/fleet-management/driver-behavior-monitoring-complete-fleet-safety-guide-2026)

### Mock Data and Testing
- [Supabase Row Level Security (RLS): Complete Guide (2026) | DesignRevision](https://designrevision.com/blog/supabase-row-level-security)
- [Multi-tenant data isolation with PostgreSQL Row Level Security | Amazon Web Services](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)

---
*Pitfalls research for: Adding GPS mapping, dashboards, and navigation to existing Next.js 16 multi-tenant fleet management app*
*Researched: 2026-02-15*
