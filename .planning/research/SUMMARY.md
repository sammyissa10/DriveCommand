# Project Research Summary

**Project:** DriveCommand - Fleet Intelligence Layer (Milestone 2.0)
**Domain:** Fleet telematics and business intelligence overlay for existing fleet management system
**Researched:** 2026-02-15
**Confidence:** MEDIUM-HIGH

## Executive Summary

DriveCommand is extending from a basic CRUD fleet management app (v1.0) to a Samsara-style intelligence platform with live GPS tracking, safety analytics, and fuel monitoring. Research shows this type of feature set is table stakes for modern fleet management SaaS, with established patterns around GPS telemetry, event-based safety scoring, and fuel efficiency dashboards. The recommended approach uses mock data flowing through real database models and APIs, allowing UI-first development without hardware dependencies while maintaining production-ready data flows.

The critical technical foundation involves three new data models (GPS locations, safety events, fuel records) with strict RLS enforcement in a multi-tenant PostgreSQL database. Client-side rendering for maps (Leaflet with dynamic imports) and charts (Recharts) is mandatory but introduces bundle size and hydration risks. The existing v1.0 architecture (Next.js 16 App Router + PostgreSQL RLS + Clerk + Prisma) provides solid foundation, but integration requires careful navigation refactoring and performance-conscious aggregation queries.

Key risks center on SSR failures with map libraries, RLS bypass during mock data generation, memory leaks from real-time updates, and database performance with aggregation queries on time-series data. All are avoidable with proper dynamic imports, RLS-aware seed scripts, marker cleanup patterns, and indexed time-range queries. The mock data approach is validated for demos/MVPs but creates clear v2 pivot point when integrating real hardware telemetry.

## Key Findings

### Recommended Stack

**Foundation (existing, validated in v1.0):**
Next.js 16 with App Router provides server components for data fetching and RLS-protected queries. PostgreSQL 17 with Row-Level Security ensures tenant isolation at database level. Clerk handles authentication/organizations. Prisma 7 (pure TypeScript) offers excellent DX with client extensions for RLS context injection.

**New for intelligence layer:**
- **Leaflet + react-leaflet 5.0.0:** Open-source maps with zero API costs, perfect for 2D GPS trails and vehicle markers. Requires dynamic import (ssr: false) to avoid Next.js server rendering crashes.
- **Recharts 3.7.0:** React-native charting library for safety score trends, fuel efficiency visualizations. Built-in TypeScript types, composable components. Client-only rendering required for ResponsiveContainer.
- **Lucide React 0.564.0:** Tree-shakeable icon library with fleet-specific icons (Truck, MapPin, Gauge, Fuel). SSR-safe, works in both server and client components.
- **@faker-js/faker 10.3.0:** Mock data generation for GPS coordinates, safety events, fuel consumption. Must flow through Prisma seed scripts (not raw SQL) to validate RLS isolation.

**Critical version compatibility:**
- react-leaflet 5.0.0 requires React 19 (peer dependency)
- Recharts 3.7.0 works with React 19 (use --legacy-peer-deps during install)
- All libraries SSR-compatible except Leaflet (requires dynamic import)

### Expected Features

**Must have (table stakes for intelligence layer):**
- Live GPS map with vehicle markers color-coded by status (moving/idle/offline)
- Route breadcrumb trails showing historical vehicle paths
- Vehicle detail sidebar panel with current diagnostics (fuel, DEF, speed, engine state)
- Safety dashboard with composite scores (0-100), harsh braking/speeding/acceleration events
- Safety trend charts showing score improvements over time
- Fuel & energy dashboard with MPG, cost, CO2 emissions, idle time tracking
- Sidebar navigation organizing intelligence features separate from CRUD sections

**Should have (competitive differentiators):**
- Driver safety leaderboard with top/bottom performers
- Check engine light display with DTC codes (P0XXX)
- Fuel anomaly detection flagging suspicious drops (theft/leak)
- Event distribution charts (histogram + donut) for coaching insights
- Geofence visualization on map (foundation for route compliance)

**Defer to v2+ (validate MVP first):**
- Route compliance visualization (planned vs actual path blue/red overlay)
- Predictive maintenance from DTC frequency patterns
- Multi-vehicle route replay with timeline scrubber
- Driver coaching workflow with manager task assignments
- Real-time ETA sharing via public links
- Hardware integration replacing mock data (Geotab API, Samsara integration)

### Architecture Approach

The existing `(owner)` route group extends with new pages (`/live-map`, `/safety`, `/fuel`) without requiring new route groups. Sidebar navigation refactor modifies `(owner)/layout.tsx` to add persistent navigation across all pages. The server component / client component boundary is critical: pages and data fetching remain server components using server actions, while maps and charts are isolated client components with dynamic imports.

**Major components:**
1. **GPS Repository (new):** Time-series data access with RLS tenant isolation. Queries always bounded by date range (last 24 hours, last 30 days) to prevent unbounded scans. Uses composite indexes on `[tenantId, timestamp]`.
2. **SafetyEvent Repository (new):** Event tracking with aggregation patterns for safety scoring. Implements weighted formula (base 100 - event penalties per 1000 miles). Uses Prisma groupBy for simple aggregations, raw SQL for complex weighted scoring.
3. **FuelRecord Repository (new):** Consumption tracking with MPG calculations using window functions (LAG) for odometer deltas. Filters by `isEstimated` flag to separate actual fill-ups from calculated consumption.
4. **Map Components (Leaflet):** Client-only rendering with dynamic import (ssr: false). Wrapper component (MapWrapper) handles loading state, actual map component loads Leaflet in useEffect to avoid SSR crashes.
5. **Chart Components (Recharts):** Client components with `'use client'` directive. Server components fetch/aggregate data, pass props to client chart wrappers. Keeps client bundle boundaries small.
6. **Sidebar Navigation:** Client component using `usePathname` for active state tracking, rendered in server component layout. Persists across navigation without re-rendering.

**Data flow pattern:**
Server Component (page.tsx) → Server Action (data aggregation with RLS) → Repository (Prisma + tenant context) → PostgreSQL RLS policies → Return aggregated data → Pass as props to Client Component (map/chart) → Interactive rendering

### Critical Pitfalls

1. **Map libraries failing SSR in Next.js App Router:** Leaflet crashes with "window is not defined" during server rendering. Solution: Always use `dynamic(() => import('./map'), { ssr: false })` and configure Leaflet inside `useEffect` after component mounts. Custom marker icons require special handling (initialize inside useEffect, not module level).

2. **RLS bypass during development breaking production security:** Seed scripts using postgres superuser bypass RLS entirely, creating false confidence. Solution: Create restricted database user for application, set tenant context in seed scripts via `set_config('app.current_tenant_id', ...)`, verify isolation with integration tests using non-superuser credentials.

3. **Memory leaks from real-time map updates:** Adding markers without removing old ones leaks memory (100MB → 2GB+ over hours). Solution: Store marker references in Map/WeakMap, remove old markers before adding new ones (`marker.remove()`), cleanup all markers in useEffect return, disconnect EventSource/WebSocket connections on unmount.

4. **Dashboard aggregations killing database performance:** GROUP BY queries on millions of GPS/safety/fuel records without date filters cause 10-30 second queries. Solution: Always filter by date range before aggregating, create composite indexes on `[tenantId, timestamp]`, use LEAKPROOF functions in RLS policies to enable index usage, consider materialized views for complex daily/weekly aggregations.

5. **Sidebar navigation migration breaking existing routes:** Restructuring route groups changes which layouts apply to existing pages from 10 completed v1.0 phases. Solution: Add sidebar to existing `(owner)` route group (don't rename groups), test all existing routes after navigation changes, handle scroll restoration in main content area to prevent layout shifts.

## Implications for Roadmap

Based on research, suggested phase structure prioritizes data foundation first, then builds UI features with increasing complexity while validating mock data patterns early.

### Phase 1: Live GPS Map Foundation
**Rationale:** Establishes all three new data models (GPS, safety, fuel) with RLS policies and seed scripts using proper tenant isolation. Creates reusable patterns (dynamic imports, marker cleanup, RLS-aware seeding) that subsequent phases copy. Validates that mock data flows through real APIs and repositories, not raw SQL bypassing security.

**Delivers:**
- GPSLocation, SafetyEvent, FuelRecord Prisma models with RLS policies
- Repository classes with tenant-scoped queries
- Seed scripts generating realistic mock data via repository layer
- Live GPS map with vehicle markers (color-coded by status)
- MapWrapper pattern with dynamic import and cleanup
- Bundle size baseline (<500KB first-load JS)

**Addresses:**
- Table stakes: Live GPS map, vehicle markers, route breadcrumbs
- Stack: Leaflet + react-leaflet integration, @faker-js/faker seeding
- Architecture: GPS Repository, time-series querying patterns

**Avoids:**
- Pitfall 1: Map SSR failures (dynamic import pattern from start)
- Pitfall 3: RLS bypass (restricted DB user, seed via repositories)
- Pitfall 4: Memory leaks (marker cleanup in useEffect returns)
- Pitfall 7: Mock data bypassing APIs (repository layer validation)

**Research flag:** Standard patterns, well-documented Leaflet + Next.js integration. Skip `/gsd:research-phase`.

---

### Phase 2: Sidebar Navigation Foundation
**Rationale:** Refactors shared layout before building more intelligence features. Ensures all existing v1.0 routes (10 phases) continue working with new navigation structure. Low-risk change (UI-only, no data layer) but blocks all subsequent phases because they need navigation links to access new pages.

**Delivers:**
- Sidebar component (client component with usePathname)
- Updated `(owner)/layout.tsx` with sidebar integration
- Navigation links to Dashboard, Live Map, Safety, Fuel, existing v1.0 pages
- Responsive behavior (drawer on mobile, persistent on desktop)
- Active state highlighting with scroll restoration

**Addresses:**
- Table stakes: Sidebar navigation with hierarchical menu
- Stack: Lucide React icons (tree-shakeable, SSR-safe)
- Architecture: Shared layout pattern preserving auth guards

**Avoids:**
- Pitfall 5: Route breakage (test all existing routes, incremental migration)
- Layout shifts between pages (scroll restoration with key={pathname})

**Research flag:** Standard Next.js layout patterns. Skip `/gsd:research-phase`.

---

### Phase 3: Safety Dashboard Core
**Rationale:** First dashboard using charts, establishes Recharts integration pattern with client component boundaries. Safety scoring is well-documented (industry formulas available), simpler than fuel MPG calculations (which need window functions for odometer deltas). Validates aggregation query patterns with realistic data volumes.

**Delivers:**
- Safety score calculation (weighted formula: base 100 - event penalties)
- Server actions: getSafetyScoreTrend(), getEventsByType(), getTopDriverIssues()
- Chart components: SafetyScoreTrendChart (LineChart), EventsByTypeChart (BarChart)
- Safety dashboard page with parallel data fetching (Promise.all)
- Query performance validation (<2s with 1000 vehicles, 30 days data)

**Addresses:**
- Table stakes: Safety dashboard, composite scores, harsh braking/speeding events
- Stack: Recharts integration, client component patterns
- Architecture: SafetyEvent Repository, aggregation with Prisma groupBy

**Avoids:**
- Pitfall 2: Chart hydration mismatches ('use client' directive, ssr: false)
- Pitfall 8: Slow aggregations (indexed GROUP BY, date range filters, EXPLAIN ANALYZE validation)
- Pitfall 6: Bundle bloat (small client boundaries, dynamic imports for charts)

**Research flag:** Standard patterns for event tracking and scoring. Skip `/gsd:research-phase`.

---

### Phase 4: Fuel & Energy Dashboard
**Rationale:** Similar pattern to Safety Dashboard, reuses Recharts components and aggregation approaches. Fuel calculations more complex (window functions for odometer deltas, idle time from engine state), but patterns established in Phase 3. Final dashboard completes intelligence layer MVP.

**Delivers:**
- Fuel efficiency calculations (MPG = distance / fuel consumed)
- Server actions: getFuelEfficiencyTrend(), getFuelCostPerMile(), getFuelByTruck()
- Chart components: FuelTrendChart (LineChart), CostPerMileChart (BarChart)
- Fuel dashboard page with CO2 emissions, idle time percentage
- Window function queries (LAG for odometer deltas)

**Addresses:**
- Table stakes: Fuel dashboard, MPG tracking, cost analysis, emissions
- Architecture: FuelRecord Repository, window function aggregations
- Stack: Recharts reuse, date-fns for time calculations

**Avoids:**
- Same pitfalls as Phase 3 (hydration, performance, bundle size)
- Already validated patterns, lower risk

**Research flag:** Skip `/gsd:research-phase`. Copy patterns from Phase 3.

---

### Phase 5: Vehicle Detail Panel & Diagnostics
**Rationale:** Depends on GPS map (Phase 1) existing. Adds interactivity to map with click → sidebar detail panel. Displays real-time diagnostics (fuel level, DEF, engine hours, DTC codes) by extending Truck model or creating TruckDiagnostics join table.

**Delivers:**
- Click handler on map markers → slide-out panel
- Current diagnostics display (fuel, DEF, speed, odometer, engine state)
- Last reported timestamp ("2 minutes ago" freshness indicator)
- Check engine light indicator with DTC code list (if present)

**Addresses:**
- Table stakes: Vehicle detail sidebar, current diagnostics display
- Architecture: Extend Truck model or create TruckDiagnostics table
- UX: Real-time feedback on data freshness

**Avoids:**
- N+1 queries (fetch diagnostics in initial map data query, not per marker click)

**Research flag:** Skip `/gsd:research-phase`. Standard UI pattern.

---

### Phase 6: Polish & Enhancement
**Rationale:** After core intelligence features work, add polish that improves UX without changing data models. Optimizes performance based on profiling from Phases 3-4.

**Delivers:**
- Loading states (Suspense boundaries for async server components)
- Error boundaries for map/chart components
- Date range filters on dashboards (last 7/30/90 days)
- Export functionality (CSV downloads for safety/fuel reports)
- Mobile responsive testing and fixes
- Performance optimizations based on bundle analysis

**Addresses:**
- UX pitfalls: Loading states, empty states for new tenants
- Performance: Bundle optimization, query optimization based on profiling
- Production readiness: Error handling, responsive design

**Avoids:**
- Premature optimization (do this after features work)

**Research flag:** Skip `/gsd:research-phase`. Standard polish work.

---

### Phase Ordering Rationale

**Why Phase 1 first:**
- Creates data foundation (all three models + RLS policies + seed patterns)
- Establishes reusable patterns (dynamic imports, cleanup, RLS seeding)
- Validates mock data approach early (before building more dashboards)
- High-risk integrations (Leaflet SSR, RLS, memory leaks) addressed immediately
- Blocks nothing (can proceed in parallel with Phase 2)

**Why Phase 2 before Phase 3-4:**
- Navigation refactor affects all existing routes (risky, need to test thoroughly)
- Low complexity (UI-only, no data layer), safe to do early
- Blocks Phase 3-4 (they need navigation links to new dashboard pages)
- Can validate with existing v1.0 pages before intelligence features exist

**Why Safety (Phase 3) before Fuel (Phase 4):**
- Safety scoring simpler than fuel MPG (no window functions needed)
- Establishes Recharts + aggregation patterns that Fuel copies
- Lower complexity, validates chart integration before more complex queries

**Why Vehicle Detail (Phase 5) after dashboards:**
- Depends on map existing (Phase 1), but not urgent for MVP
- Dashboards provide more value (fleet-wide insights > individual vehicle details)
- Can be deferred if timeline pressure, dashboards are table stakes

**Why Polish (Phase 6) last:**
- Only after features work, avoid premature optimization
- Performance insights come from profiling Phases 3-4 under load
- Error boundaries need real error scenarios from integration testing

### Research Flags

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (GPS Map):** Well-documented Leaflet + Next.js patterns, RLS patterns established in v1.0
- **Phase 2 (Sidebar):** Standard Next.js layout refactoring
- **Phase 3 (Safety):** Industry-standard safety scoring formulas, Recharts docs clear
- **Phase 4 (Fuel):** Copy Phase 3 patterns, window functions well-documented
- **Phase 5 (Detail Panel):** Standard UI pattern (click → sidebar)
- **Phase 6 (Polish):** Standard optimization work

**No phases need `/gsd:research-phase`:** All patterns well-documented, research complete.

**When to trigger deeper research:**
- If switching from mock data to real hardware (Geotab API, OBD-II dongles) → research hardware integration
- If adding route compliance (geofence detection) → research PostGIS spatial queries
- If real-time updates needed (WebSocket/SSE) → research streaming architectures

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Leaflet, Recharts, Lucide widely used with Next.js 16. Version compatibility verified via npm, GitHub issues, community reports. Mock data approach validated in similar projects. |
| Features | MEDIUM | Based on Samsara/Geotab/Motive patterns (industry leaders), but mock data simulation has assumptions (GPS frequency, event distribution) that need validation with real users. |
| Architecture | HIGH | Next.js 16 App Router patterns well-established. RLS with Prisma validated in v1.0 (10 phases). Dynamic imports and client boundaries documented extensively. Time-series querying standard PostgreSQL. |
| Pitfalls | HIGH | SSR failures, RLS bypass, memory leaks, aggregation performance all well-documented with proven solutions. Community has solved these repeatedly in production. |

**Overall confidence:** MEDIUM-HIGH

Research is strong on technical implementation (stack, architecture, pitfalls), with clear patterns and solutions. Moderate uncertainty on feature prioritization (which safety metrics matter most to users) and mock data realism (do simulated patterns match real hardware telemetry). Both resolved through user validation during Phase 1-3 execution.

### Gaps to Address

**Mock data realism:**
- GPS frequency (30-60s intervals) and route interpolation algorithms are estimates. Validate with fleet managers during Phase 1 demo. If feedback suggests routes look "too geometric," refine interpolation with noise/variance.
- Safety event distribution (harsh braking 70%, speeding 20%) based on industry averages. May not match customer's fleet behavior. Make event probabilities configurable in seed scripts.

**Aggregation performance at scale:**
- Query performance validated with "1000 vehicles, 30 days data" benchmark, but actual production loads unknown. Phase 3 should include load testing with 10x data (10K vehicles, 90 days) to validate index strategy holds.

**Hardware integration assumptions:**
- v2 pivot assumes switching from mock data to real telemetry via API (Geotab, Samsara) or OBD-II dongles. Research assumes clean API integration, but real hardware has data quality issues (GPS drift, missing signals, delayed updates). Address when v2 integration begins, not now.

**Real-time update frequency:**
- MVP uses polling (30-60s refresh), not true real-time (WebSocket/SSE). Acceptable for most fleet management (not emergency services), but validate with users. If demand for <5s updates, research streaming architecture in v2.

## Sources

### Primary (HIGH confidence)
**Official documentation:**
- Next.js 16 documentation (Turbopack, App Router, server components)
- React 19.2 release notes (Server Components, Activity component)
- PostgreSQL 17 release notes (performance, logical replication)
- Prisma 7 documentation (pure TypeScript, client extensions)
- Tailwind CSS v4 announcement (performance, CSS-first config)
- React Leaflet documentation (version 5.0.0)
- Recharts npm package (version 3.7.0 verification)
- Lucide React documentation (tree-shakeable icons)
- Prisma seeding documentation (official patterns)

**Technology comparisons:**
- Clerk vs Auth0 for Next.js (technical comparison, 2026)
- Cloudflare R2 vs AWS S3 (pricing, feature parity)
- Prisma vs Drizzle ORM 2026 (DX vs performance tradeoffs)

### Secondary (MEDIUM-HIGH confidence)
**Fleet management domain research:**
- Samsara GPS Fleet Tracking (1-second updates, live map, traffic overlays)
- Geotab Driver Scorecards (scorecard patterns, leaderboards)
- Motive (KeepTruckin) safety features (AI safety score, video integration)
- Fleet management KPIs 2026 (safety metrics, coaching patterns)
- EPA emission factors (10.21 kg CO2/gallon diesel standard)

**Integration patterns:**
- Leaflet with Next.js App Router (dynamic import patterns, SSR handling)
- Recharts React 19 compatibility (GitHub issues, community testing)
- PostgreSQL RLS with Prisma (multi-tenant isolation, performance optimization)
- Next.js hydration error handling (SSR/CSR mismatches)

**Performance and pitfalls:**
- React Leaflet memory leak prevention (marker cleanup patterns)
- PostgreSQL RLS performance best practices (LEAKPROOF functions, index usage)
- Next.js bundle optimization (package bundling, lazy loading)
- GROUP BY performance in PostgreSQL (work_mem, hash aggregates)

### Tertiary (LOW confidence, needs validation)
**Mock data patterns:**
- GPS breadcrumb generation algorithms (interpolation between waypoints)
- Safety event distribution probabilities (harsh braking 70%, speeding 20%)
- Fuel consumption formulas (6-8 MPG loaded, idle 0.8 gal/hour)

These are industry averages and estimates. Validate during Phase 1 execution with fleet manager feedback.

---
*Research completed: 2026-02-15*
*Ready for roadmap: yes*
