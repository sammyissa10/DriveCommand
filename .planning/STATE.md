# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Logistics owners can manage their entire operation — trucks, drivers, routes, and documents — from one platform, with each route showing the full picture on a single screen.
**Current focus:** Phase 15 - Tags, Groups & Polish (v2.0 Samsara-Inspired Fleet Intelligence)

## Current Position

Phase: 15 of 15 (Tags, Groups & Polish)
Plan: 2 of 3 in current phase
Status: In Progress
Last activity: 2026-02-16 — Completed 15-01 (tag data model and management UI)

Progress: [██████████████████████░░░] 93% (30 plans complete, 10 v1.0 phases shipped)

## Performance Metrics

**Velocity (from v1.0):**
- Total plans completed: 22
- Average duration: 4.3 min
- Total execution time: 1.54 hours

**v2.0 metrics:**

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 11    | 01   | 7m 3s    | 2     | 17    | 2026-02-15 |
| 11    | 02   | 3m 0s    | 2     | 2     | 2026-02-15 |
| 11    | 03   | 5m 3s    | 2     | 8     | 2026-02-15 |
| 12    | 01   | 4m 44s   | 2     | 9     | 2026-02-15 |
| 12    | 02   | 3m 52s   | 2     | 4     | 2026-02-15 |

| 13    | 01   | 4m 40s   | 2     | 9     | 2026-02-16 |
| 13    | 02   | 3m 23s   | 2     | 6     | 2026-02-16 |
| 14    | 01   | 2m 18s   | 2     | 2     | 2026-02-16 |
| 14    | 02   | 3m 17s   | 2     | 6     | 2026-02-16 |
| 15    | 01   | 7m 56s   | 2     | 12    | 2026-02-16 |

**v2.0 totals:** 10 plans completed, 45m 16s total time

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Key patterns established in v1.0:
- UUID primary keys, RLS tenant isolation, TIMESTAMPTZ timestamps
- Server component data fetching → client wrapper for interactivity
- TanStack Table for lists, Zod validation, repository pattern
- Lazy client initialization (S3, Resend) via Proxy for build-time safety
- @ts-ignore for Prisma 7 withTenantRLS extension type issues
- useOptimistic for instant UI feedback on mutations
- Defense-in-depth: DB-level RLS + server action auth checks + UI role guards

Recent v2.0 decisions:
- Mock data for v2.0 GPS/safety/fuel — Build UI first, design API contracts for future hardware integration
- Samsara-style sidebar navigation — Matches industry standard UX, replaces current navigation
- UI-first approach for safety/compliance — Build dashboard visuals with mock data, add real logic later
- shadcn/ui for component library (11-01) — Industry-standard library with built-in accessibility and responsive behavior
- Icon rail collapse mode (11-01) — Matches Samsara UX, maintains spatial memory for power users
- Role-based Fleet Intelligence visibility (11-01) — Only OWNER/MANAGER see Live Map, Safety, Fuel sections
- [Phase 11]: Used Decimal types for coordinates (latitude/longitude) with explicit precision for GPS accuracy
- [Phase 11]: Added composite indexes on [tenantId, timestamp] for efficient dashboard queries (time-series data pattern)
- [Phase 11]: Made driverId and routeId optional in SafetyEvent (events can occur when no driver assigned or outside active routes)
- [Phase 11]: Use Turf.js interpolation for GPS trails instead of random scatter — Creates realistic routes along US interstates
- [Phase 11]: Generate GPS points every 2 miles (not 1 mile) — Keeps total under 50K records for reasonable data volume
- [Phase 11]: Link safety events to actual GPS coordinates — Events appear on route path, not random locations
- [Phase 11]: Exclude prisma/seeds from Next.js build — Seed files use ESM imports, separate from app build
- [Phase 12-01]: Client component wrapper pattern for browser-only libraries — Encapsulate ssr: false dynamic import in client component to comply with Next.js 15 restrictions
- [Phase 12-01]: Use react-leaflet-cluster v4.x for React 19 compatibility — Latest version required for react-leaflet v5.x peer dependency
- [Phase 12-01]: DISTINCT ON raw SQL for per-truck latest GPS position — More efficient than GROUP BY for time-series "latest per entity" queries
- [Phase 12-01]: Router.refresh() polling for real-time updates — 30-second intervals sufficient for GPS tracking on serverless platform (no WebSockets needed)
- [Phase 12-02]: Polyline segment overlap for continuity — Last point of segment N becomes first point of segment N+1 when color changes
- [Phase 12-02]: Fuel level estimation using 6 MPG heuristic — Simplified calculation for truck diagnostics in absence of real-time fuel sensors
- [Phase 12-02]: Engine state derived from GPS speed — Running (>5 mph), idle (>0 mph), off (no speed data)
- [Phase 13-01]: Severity-weighted penalty system for safety scores — Exponential weights (LOW=1, MEDIUM=2, HIGH=4, CRITICAL=8) emphasize critical events over linear scaling
- [Phase 13-01]: Aggregate safety rankings by truck instead of driver — Seed data has driverId=null, truck-level aggregation provides meaningful metrics
- [Phase 13-01]: LEFT JOIN for zero-event trucks in rankings — Include trucks with no safety events (score=100) at top of rankings for complete fleet view
- [Phase 13-01]: Initialize all dates in trend queries — Days with no events show score=100, not missing from chart, for continuous timeline
- [Phase 13-02]: Badge variants for severity display — LOW=outline, MEDIUM=secondary, HIGH=orange destructive, CRITICAL=red destructive for visual hierarchy
- [Phase 13-02]: localStorage for threshold config persistence — Client-side settings for mock data context, no backend needed
- [Phase 13-02]: Empty state handling for all charts — Explicit checks prevent broken Recharts rendering when data is empty
- [Phase 13-02]: ChartContainer min-h pattern — All Recharts must have min-h-[300px] to prevent 0px height collapse
- [Phase 14-01]: EPA standard CO2 factor (8.887 kg/gallon) for emissions tracking — Industry-standard methodology for fleet carbon footprint
- [Phase 14-01]: Idle time derived from GPS speed data — Speed=0 for idle, speed>0 for moving, using 5-min GPS intervals for cost estimation
- [Phase 14-01]: Fleet truck MPG thresholds — >=7 excellent, >=5.5 good, >=4 below average, <4 poor (based on typical fleet ranges)
- [Phase 14-02]: Uniform bar color for idle time chart — Simplified approach instead of per-bar color coding for cleaner implementation
- [Phase 14-02]: Visual indicators in fuel leaderboard — Top 3 get Trophy, poor performers (<4 MPG) get AlertTriangle for quick identification
- [Phase 15-01]: 8 preset Tailwind colors for tag palette — Blue, green, red, yellow, purple, orange, pink, teal provide consistent color scheme for fleet organization
- [Phase 15-01]: Tabbed assignment interface for trucks vs drivers — Reduces UI clutter with large fleets, separates entity types logically
- [Phase 15-01]: Popover for tag assignment instead of dropdown — Better UX for selecting available tags, filters already-assigned tags per entity

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 15-01-PLAN.md (tag data model and management UI)
Resume file: None
