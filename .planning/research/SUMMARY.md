# Project Research Summary

**Project:** DriveCommand v2.0 — Samsara-Inspired Fleet Intelligence
**Domain:** Fleet management telematics dashboard (GPS tracking, safety analytics, fuel monitoring)
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

DriveCommand v2.0 adds a Samsara-style intelligence layer to the existing fleet management platform (10 phases complete, covering Truck/Driver/Route CRUD, maintenance, documents). This milestone introduces live GPS map tracking, safety analytics dashboards, fuel efficiency monitoring, and sidebar navigation—all using **mock data** to simulate hardware telemetry. The approach is deliberate: validate product-market fit and UI patterns before investing in real hardware integration or telematics APIs.

The recommended technical approach leverages the existing Next.js 16 App Router + PostgreSQL 17 (RLS) + Prisma 7 stack without introducing new architectural patterns. All intelligence features follow established v1.0 patterns: Server Component pages fetch data via Server Actions, which query RLS-protected repositories. The only additions are client-only rendering for maps (Leaflet via dynamic import) and charts (Recharts with "use client" directive). New Prisma models (GPSLocation, SafetyEvent, FuelRecord) extend existing tenant isolation with row-level security policies identical to v1.0 patterns.

The critical risks center on maintaining multi-tenant security and performance at scale. GPS tracking generates time-series data (1 point/minute = 1,440 rows/day per truck), requiring careful indexing and query patterns to avoid sequential scans. RLS must be tested with restricted database users—not superuser connections that bypass policies. Map and chart libraries introduce 600KB+ of client-side JavaScript, requiring aggressive code splitting. Most critically, developers must resist shortcuts: all mock data must flow through RLS-protected APIs (not raw SQL inserts), and all client components must handle SSR constraints (maps via dynamic import, charts marked "use client").

## Key Findings

### Recommended Stack

**Core approach:** Extend existing stack with zero-cost, open-source tools optimized for mock data and rapid iteration.

The v1.0 stack (Next.js 16, React 19, PostgreSQL 17 with RLS, Prisma 7, Clerk, Tailwind/shadcn) remains unchanged. Four new libraries support intelligence features:

- **Leaflet + react-leaflet** (maps): Open-source 2D maps with zero API costs. Handles GPS trails and marker clustering for fleets <100 vehicles. Requires dynamic import (`ssr: false`) due to DOM dependencies. Alternative considered: Mapbox GL (WebGL-accelerated, better for 500+ vehicles, but $50-200/month API costs and vendor lock-in).

- **Recharts** (charts): React-native declarative charting with built-in TypeScript types. Composable components (LineChart, BarChart, PieChart) match established patterns. All charts marked "use client" to avoid hydration errors. 450KB bundle impact, mitigated via tree-shaking and route-based code splitting.

- **lucide-react** (icons): Tree-shakeable icon library (1,400+ icons, 1-2KB per imported icon). Fleet-specific icons (Truck, Gauge, Fuel, MapPin) with consistent design system. SSR-safe—works in both Server and Client Components.

- **@faker-js/faker** (mock data): Generates realistic GPS coordinates, timestamps, safety events, and fuel records for seed scripts. Mock data flows through Prisma repositories with RLS context (critical for validating tenant isolation).

**Why this stack over alternatives:** Zero incremental infrastructure cost (Leaflet vs. Mapbox saves $50+/month), composable React patterns (Recharts vs. Chart.js canvas API), and validation-first approach (Faker.js with Prisma vs. static JSON files that bypass RLS).

### Expected Features

**Must have (table stakes):**
Intelligence layer feels incomplete without these—competitors (Samsara, Geotab, Motive) all provide:

- **Live GPS map** with vehicle markers color-coded by status (moving/idle/offline)
- **Route breadcrumb trails** showing historical paths (polylines rendered from GPS telemetry)
- **Vehicle detail sidebar** (collapsible panel showing fuel level, speed, last update, DEF level, engine state)
- **Safety dashboard** with composite score (0-100), harsh braking/speeding/acceleration events, trend charts, and event distribution (donut/histogram)
- **Fuel & energy dashboard** with MPG trends, cost per mile, idle time percentage, CO2 emissions
- **Sidebar navigation** (icon-based, collapsible, with active states)—Samsara's signature UI pattern

**Should have (competitive):**
Differentiators that increase perceived value but not strictly required for v2.0 launch:

- **Geofence visualization** (polygon-based boundaries for depots/customer sites)
- **Geofence entry/exit alerts** (email/SMS when vehicle crosses boundaries)
- **Driver safety leaderboard** (top/bottom performers with trend arrows, gamification)
- **Configurable safety thresholds** (g-force sensitivity per vehicle class: light/medium/heavy duty)
- **Check engine light / DTC codes** (P0XXX codes displayed in vehicle panel, trigger maintenance events)

**Defer (v2+):**
High-value but complex; wait until mock data validates patterns:

- **Trip replay with timeline scrubber** (playback vehicle path at any past moment with speed control)
- **Route compliance visualization** (blue/red overlay showing deviations from planned route)
- **Predictive maintenance** (use DTC frequency to predict component failures)
- **Driver coaching workflow** (manager assigns tasks when safety events occur, track completion)
- **Real-time ETA sharing** (public tracking links for customers via SMS)
- **Hardware integration** (replace mock data with Geotab/Samsara API or real OBD-II dongles)

### Architecture Approach

**Integration strategy:** All v2.0 features extend existing v1.0 architecture without introducing new patterns. New pages live in the existing `(owner)` route group, sharing authentication and RLS middleware.

**Major components:**

1. **New Prisma models** (GPSLocation, SafetyEvent, FuelRecord) with foreign keys to existing Truck/Driver/Route models. All tables include `tenantId` with RLS policies matching v1.0 pattern: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`.

2. **Time-series data repositories** (GPSRepository, SafetyEventRepository, FuelRecordRepository) extend existing TenantRepository base class. All queries use RLS-protected Prisma client extensions (no raw SQL without tenant context).

3. **Server Actions** (`actions/gps.ts`, `actions/safety.ts`, `actions/fuel.ts`) follow established pattern: auth check → getTenantPrisma() → repository query → return typed data. Parallel fetching with Promise.all() for dashboard pages.

4. **Client-only map component** (Leaflet) uses Next.js dynamic import with `ssr: false` to avoid "window is not defined" errors. MapWrapper component provides loading skeleton during JavaScript load.

5. **Client chart components** (Recharts) marked with "use client" directive to prevent hydration mismatches. Server Component pages fetch data and pass as props to chart components.

6. **Modified shared layout** (`(owner)/layout.tsx`) adds Sidebar component. Sidebar persists across all owner portal pages (new intelligence features + existing CRUD pages).

**Key architectural insight:** v2.0 doesn't change the architecture—it validates that established patterns (Server Components → Server Actions → Repositories → Prisma + RLS) scale to time-series GPS data and dashboard aggregations.

### Critical Pitfalls

1. **Map libraries failing SSR in Next.js App Router** — Leaflet crashes with "window is not defined" if imported normally. **Prevention:** Always use `dynamic(() => import('./map'), { ssr: false })` and mark map containers as client components. Custom marker icons must be initialized inside `useEffect`, not module-level.

2. **RLS bypass during development breaking production security** — Using superuser database connection (postgres role) bypasses RLS policies, creating false security confidence. **Prevention:** Create restricted database user for Prisma (`DATABASE_URL`), use separate admin connection only for migrations (`DATABASE_URL_ADMIN`). Test with restricted user. Add RLS verification to seed scripts (query as tenant1, verify no tenant2 data visible).

3. **Memory leaks from real-time map updates** — Every GPS update creates new marker instances without removing old ones, causing browser memory to grow from 100MB to 2GB+ over hours. **Prevention:** Track markers in Map, remove old markers before adding new ones, clean up event listeners in `useEffect` return, close EventSource/WebSocket connections on unmount.

4. **Dashboard aggregations killing database performance** — Aggregating 30 days of GPS/safety/fuel data without indexes or date filters causes 10-30s queries and 100% DB CPU. **Prevention:** Index all columns in GROUP BY and WHERE clauses (especially `tenant_id, timestamp`), always filter by date range before aggregating, use database aggregations (not in-memory JavaScript), mark RLS functions as LEAKPROOF to enable index usage.

5. **Client component proliferation exploding bundle size** — Adding Leaflet (150KB) + react-leaflet (20KB) + Recharts (100KB) + dependencies balloons first-load JS from 200KB to 800KB+, slowing page loads to 4-6s on 3G. **Prevention:** Use dynamic imports for all heavy components, keep client component boundaries small (wrap only interactive widgets, not entire pages), enable `optimizePackageImports` in next.config.js, set bundle size budgets (fail build if >500KB).

## Implications for Roadmap

Based on research, suggested phase structure for v2.0 milestone (phases numbered 11-15 to continue from v1.0's 10 phases):

### Phase 11: Live GPS Map Foundation
**Rationale:** GPS data model and map visualization establish patterns for all subsequent features. Must be built first because Safety and Fuel dashboards depend on understanding time-series data storage and querying. Addresses critical SSR pitfalls (dynamic import pattern) and RLS isolation patterns that phases 12-14 will reuse.

**Delivers:**
- GPSLocation Prisma model with RLS policies
- GPS telemetry seed scripts (realistic routes with interpolated waypoints)
- Live map page with Leaflet displaying latest truck positions
- MapWrapper component (reusable dynamic import pattern)
- Vehicle detail sidebar (click marker → see truck diagnostics)

**Addresses features:**
- Live GPS map with vehicle markers (table stakes)
- Route breadcrumb trails (polylines from GPS history)
- Vehicle detail sidebar with fuel/speed/last update (table stakes)

**Avoids pitfalls:**
- Map SSR failures (establish dynamic import pattern from start)
- RLS bypass (create restricted DB user, test with tenant isolation)
- Memory leaks (implement marker cleanup in useEffect)
- Mock data bypassing RLS (seed scripts use repository layer)

**Research flag:** Standard pattern (Leaflet integration well-documented). Skip `/gsd:research-phase`.

---

### Phase 12: Sidebar Navigation Foundation
**Rationale:** Navigation refactor must happen before adding more dashboard pages (Phases 13-14) to avoid rework. Existing 10 phases use header navigation; switching to sidebar requires testing all existing routes to prevent 404s or layout breaks. Can be built in parallel with Phase 11 (no data dependencies).

**Delivers:**
- Sidebar component (icon-based, collapsible, with active states)
- Modified `(owner)/layout.tsx` with Sidebar wrapper
- Navigation items for Dashboard, Live Map, Safety, Fuel, Trucks, Drivers, Routes
- Responsive mobile behavior (drawer on mobile, permanent on desktop)

**Addresses features:**
- Sidebar navigation (table stakes, Samsara UI pattern)
- Hierarchical menu structure with collapsible groups

**Avoids pitfalls:**
- Sidebar navigation breaking existing routes (incremental migration, test all 10 phases' routes)
- Layout shift between page navigations (scroll restoration, stable layout)

**Research flag:** Standard pattern (shadcn/ui Sidebar component). Skip `/gsd:research-phase`.

---

### Phase 13: Safety Dashboard Core
**Rationale:** Safety analytics introduce chart library and dashboard aggregation patterns that Fuel Dashboard (Phase 14) will reuse. Must come after GPS Map (Phase 11) to understand time-series data, but before Fuel to establish Recharts patterns.

**Delivers:**
- SafetyEvent Prisma model with RLS policies
- Safety event seed scripts (harsh braking/speeding linked to GPS locations)
- Safety dashboard page with composite score (0-100)
- Safety trend chart (LineChart showing 30-day scores)
- Event distribution charts (BarChart by type, PieChart for percentages)
- Configurable alert thresholds (g-force sensitivity per vehicle class)

**Addresses features:**
- Safety dashboard with composite score (table stakes)
- Harsh braking, speeding, rapid acceleration events (table stakes)
- Safety trend over time (line chart)
- Event histogram and donut chart (table stakes)
- Configurable alert thresholds (competitive)

**Avoids pitfalls:**
- Chart hydration mismatches (mark all charts "use client", establish pattern)
- Dashboard aggregation performance (index `tenant_id, timestamp`, filter by date before GROUP BY)

**Research flag:** Standard pattern (Recharts integration documented). Skip `/gsd:research-phase`.

---

### Phase 14: Fuel & Energy Dashboard
**Rationale:** Follows Safety Dashboard (Phase 13) to reuse established chart patterns. Similar aggregation logic (MPG = distance / gallons) but with window functions (LAG for odometer delta).

**Delivers:**
- FuelRecord Prisma model with RLS policies
- Fuel transaction seed scripts (progressive odometer readings)
- Fuel dashboard page with MPG trends
- Fuel efficiency chart (LineChart showing 30-day MPG)
- Cost per mile chart (BarChart by truck)
- Summary cards (total cost, average MPG, gallons consumed, CO2 emissions)

**Addresses features:**
- MPG / fuel efficiency metric (table stakes, "north star" metric)
- Total fuel consumed and estimated cost (table stakes)
- Carbon emissions (CO2) (table stakes, growing ESG requirement)
- Idle time percentage (competitive, high ROI coaching opportunity)
- Top/bottom performers by MPG (competitive)

**Avoids pitfalls:**
- Dashboard aggregations without date filters (same as Phase 13)
- Window function performance (index for LAG query on odometer)

**Research flag:** Standard pattern (Recharts established in Phase 13). Skip `/gsd:research-phase`.

---

### Phase 15: Intelligence Layer Polish
**Rationale:** Refinement after core features work. Optimization pass before milestone completion.

**Delivers:**
- Loading states (Suspense boundaries for dashboard sections)
- Error boundaries (handle no data gracefully, show empty states)
- Date range filters (7/30/90 day tabs for dashboards)
- Map marker clustering (for fleets >20 vehicles)
- Performance optimization (review EXPLAIN ANALYZE, optimize indexes)
- Mobile responsive testing (chart responsive containers, sidebar collapse)

**Addresses features:**
- Map clustering for large fleets (table stakes)
- Map controls and filters (table stakes)

**Avoids pitfalls:**
- Bundle size explosion (verify <500KB first-load JS)
- Missing loading/error states (polish UX)

**Research flag:** No new patterns. Skip `/gsd:research-phase`.

---

### Phase Ordering Rationale

**Dependency-driven sequencing:**
- Phase 11 first: GPS data model establishes time-series patterns
- Phase 12 parallel: Navigation has no data dependencies
- Phase 13 before 14: Safety establishes chart/aggregation patterns for Fuel
- Phase 15 last: Polish depends on features being complete

**Architecture alignment:**
- All phases follow established v1.0 patterns (Server Components → Repositories → RLS)
- Phases 11-14 each introduce one new model, avoiding overwhelming schema changes
- Phase 12 (Navigation) touches existing routes but not data layer

**Pitfall mitigation:**
- Phase 11 addresses SSR, RLS, memory leaks early (patterns carry forward)
- Phase 12 prevents navigation rework (do once before adding more pages)
- Phase 13 establishes chart hydration patterns (Phase 14 reuses)
- Phase 15 addresses bundle size after features stabilized

### Research Flags

**Phases with standard patterns (skip `/gsd:research-phase`):**
- **Phase 11:** Leaflet + Next.js integration well-documented
- **Phase 12:** shadcn/ui Sidebar component has official docs
- **Phase 13:** Recharts + Next.js patterns established
- **Phase 14:** Same patterns as Phase 13
- **Phase 15:** Polish and optimization (no new tech)

**No phases need deeper research.** All technologies (Leaflet, Recharts, Lucide, Faker.js) have:
- Official documentation with Next.js integration guides
- Active maintenance (published Feb 2026)
- Community patterns for SSR handling
- Established best practices for v2.0 use cases

**When to trigger `/gsd:research-phase` in future:**
- **Real-time updates (v2.1+):** If adding WebSocket/SSE for <5s GPS updates, research connection management patterns
- **Hardware integration (v2.2+):** If replacing mock data with Geotab/Samsara API, research authentication and rate limits
- **Advanced features (v2.2+):** Trip replay, route compliance, predictive maintenance

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries verified with official docs, version compatibility confirmed, Next.js 16 + React 19 support validated |
| Features | HIGH | Based on Samsara/Geotab/Motive 2026 patterns, official platform docs, fleet industry standards |
| Architecture | HIGH | All patterns already established in v1.0 (10 phases complete), no new architectural concepts introduced |
| Pitfalls | HIGH | Researched from official troubleshooting docs, GitHub issues, production incident reports, Next.js migration guides |

**Overall confidence:** HIGH

### Gaps to Address

**No major gaps identified.** Research provided clear recommendations for all areas. Minor clarifications needed during implementation:

- **PostGIS for spatial queries:** Phase 11 can start with simple DECIMAL(lat, lng) columns. If proximity queries are needed in Phase 15 or v2.1 (e.g., "vehicles within 10 miles"), migrate to PostGIS GEOMETRY type with GIST indexes. Decision deferred until use case emerges.

- **Real-time update frequency:** Phase 11 starts with 30-60s polling (acceptable for trucking, standard industry practice). If users request <5s updates, upgrade to Server-Sent Events (Phase 15 or v2.1). Research shows 30-60s sufficient for fleet management (vs. 1s for last-mile delivery).

- **Mock data realism:** Seed scripts generate interpolated GPS routes with realistic speeds (40-65 mph) and progressive odometer readings. If dashboards reveal unrealistic patterns during Phase 13-14, refine seed logic (e.g., add traffic delays, idle periods). Current approach sufficient for v2.0 validation.

- **Bundle size optimization:** Phase 11 establishes dynamic import pattern. If Phase 15 bundle analysis shows >500KB first-load JS, implement aggressive tree-shaking (import specific Recharts components, not full library) or consider lighter alternatives (CSS-based charts for simple metrics).

## Sources

### Primary (HIGH confidence)

**Stack:**
- [Next.js 16 Documentation](https://nextjs.org/docs) — App Router patterns, Server Components, dynamic imports
- [React Leaflet Official Documentation](https://react-leaflet.js.org/) — v5.x integration, React 19 compatibility
- [Recharts Official Documentation](https://recharts.github.io/) — v3.7.0 API, composition patterns
- [Prisma Documentation](https://www.prisma.io/docs/orm) — Prisma 7 RLS patterns, multi-tenant seeding
- [PostgreSQL 17 Release Notes](https://www.postgresql.org/docs/release/17.0/) — Performance improvements, RLS enhancements
- [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/radix/sidebar) — Official component documentation
- [Lucide React Documentation](https://lucide.dev/guide/packages/lucide-react) — Icon library integration
- [@faker-js/faker npm](https://www.npmjs.com/package/@faker-js/faker) — Version 10.3.0 API

**Features:**
- [Samsara GPS Fleet Tracking](https://www.samsara.com/products/telematics/gps-fleet-tracking) — Industry leader patterns
- [Driver Behavior Monitoring: Complete Fleet Safety Guide 2026](https://oxmaint.com/industries/fleet-management/driver-behavior-monitoring-complete-fleet-safety-guide-2026) — Safety metrics, scoring formulas
- [Top 10 Fleet Management KPIs to Track in 2026](https://oxmaint.com/industries/fleet-management/top-10-fleet-management-kpis-track-2026) — Fuel efficiency metrics
- [Harsh Event Detection - Samsara](https://kb.samsara.com/hc/en-us/articles/5321169919501-Harsh-Event-Detection) — G-force thresholds

**Architecture:**
- [How to Design Database for Fleet Management Systems - GeeksforGeeks](https://www.geeksforgeeks.org/dbms/how-to-design-database-for-fleet-management-systems/) — GPS data schema patterns
- [Securing Multi-Tenant Applications Using Row Level Security in PostgreSQL with Prisma ORM | Medium](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) — RLS seeding patterns

**Pitfalls:**
- [Making React-Leaflet work with NextJS | PlaceKit](https://placekit.io/blog/articles/making-react-leaflet-work-with-nextjs-493i) — SSR handling
- [Text content does not match server-rendered HTML | Next.js](https://nextjs.org/docs/messages/react-hydration-error) — Hydration error patterns
- [Common Postgres Row-Level-Security footguns](https://www.bytebase.com/blog/postgres-row-level-security-footguns/) — RLS bypass scenarios
- [Optimizing Postgres Row Level Security (RLS) for Performance | Scott Pierce](https://scottpierce.dev/posts/optimizing-postgres-rls/) — LEAKPROOF functions

### Secondary (MEDIUM confidence)

**Comparisons and patterns:**
- [Mapbox vs Leaflet Comparison](https://medium.com/visarsoft-blog/leaflet-or-mapbox-choosing-the-right-tool-for-interactive-maps-53dea7cc3c40) — Technology decision rationale
- [Best React Chart Libraries 2025 - LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/) — Recharts vs. alternatives
- [Speeding up GROUP BY in PostgreSQL | CYBERTEC](https://www.cybertec-postgresql.com/en/speeding-up-group-by-in-postgresql/) — Aggregation optimization
- [PostGIS Performance: Indexing and EXPLAIN | Crunchy Data](https://www.crunchydata.com/blog/postgis-performance-indexing-and-explain) — Spatial index patterns

### Tertiary (LOW confidence)

**Community patterns (needs validation during implementation):**
- [Streaming in Next.js 15: WebSockets vs Server-Sent Events | HackerNoon](https://hackernoon.com/streaming-in-nextjs-15-websockets-vs-server-sent-events) — Real-time update patterns (for v2.1+)
- [How To Debug Memory Leaks in React Native Applications](https://oneuptime.com/blog/post/2026-01-15-react-native-memory-leaks/view) — Memory profiling techniques

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*
*Phases suggested: 5 (numbered 11-15 to continue from v1.0's 10 phases)*
