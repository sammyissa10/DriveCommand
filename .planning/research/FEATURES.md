# Feature Landscape

**Domain:** Fleet Intelligence Platform (Samsara-inspired telematics layer)
**Researched:** 2026-02-15
**Confidence:** MEDIUM

**Context:** DriveCommand v1.0 complete (Truck/Driver/Route CRUD, Maintenance, Documents). This research focuses ONLY on the new intelligence layer: live GPS map, vehicle diagnostics, safety dashboard, fuel/energy dashboard, and navigation.

Research based on Samsara patterns, competitor analysis (Geotab, Motive), and fleet telematics industry standards. Mock data implementation requires realistic simulation of hardware telemetry (GPS, OBD-II diagnostics).

## Table Stakes (Intelligence Layer)

Features users expect in a Samsara-style fleet intelligence platform. Missing these = intelligence layer feels incomplete.

### Live GPS Tracking & Map

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time vehicle location on map | Industry standard; Samsara updates every 1 second, but 30-60s acceptable for most fleets | MEDIUM | Mock: Generate GPS points every 30-60s for IN_PROGRESS routes; store in time-series pattern (JSONB or separate table) |
| Vehicle markers with status indicators | At-a-glance view of moving vs idle vs offline vehicles | LOW | Color-coded icons: green=moving, yellow=idle >5min, gray=offline/no recent telemetry |
| Route breadcrumb trails / polylines | Historical path visualization; universal GPS tracking feature | MEDIUM | Mock: Generate polyline coordinates from route origin→destination with realistic waypoints (25-50 points per route) |
| Map controls (zoom, pan, satellite/terrain layers) | Table stakes for any map interface | LOW | Use Mapbox/Google Maps standard controls; traffic/weather overlays leverage provider APIs |
| Vehicle detail sidebar panel | Click marker → see truck details; universal pattern in fleet systems | MEDIUM | Slide-out panel shows current diagnostics (fuel, DEF, engine state, speed) + route info from v1.0 Route model |
| Live vehicle filtering (by driver, truck, status) | Essential for managing fleets >10 vehicles | LOW | Client-side filter map markers by tenantId, driverId, truckId, or engine state |
| Last reported timestamp | Shows data freshness; users distrust stale data | LOW | Display "Last update: 2 minutes ago" per vehicle |

**Dependencies:** Requires v1.0 Truck, Route (existing), User models. New: GPS Telemetry data model (time-series).

### Vehicle Diagnostics Panel

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Current location & speed | Most basic telemetry data point | LOW | Mock: Derive from GPS telemetry (lat/lng/speed) |
| Fuel level (percentage or gallons) | Critical for operational planning; OBD-II standard metric | LOW | Mock: Start 80-100%, decrease ~0.15% per mile (6.67 MPG avg HGV). Display as percentage + gallons remaining |
| Odometer reading | Already in v1.0 Truck model; telematics updates it in real-time | LOW | Update existing `Truck.odometer` field with mock increments based on route distance |
| Engine hours | Standard heavy-duty truck metric; separate from odometer | LOW | Mock: Increment by route IN_PROGRESS duration (hours). Store in diagnostics model |
| DEF (Diesel Exhaust Fluid) level | Required for modern diesel trucks (EPA compliance); industry standard | LOW | Mock: Percentage (0-100%), decreases slower than fuel (~2.5% DEF per fuel tank). Critical for 2026 EPA regulations |
| Check engine light / DTC codes | OBD-II standard; triggers maintenance alerts | MEDIUM | Mock: 5% chance per route to generate random P0XXX code (P0171, P0420 common). Display code + severity (low/medium/high) |
| Engine state (running/idle/off) | Affects idle time KPIs and safety metrics | LOW | Mock: "running" when Route.status=IN_PROGRESS + speed >0, "idle" when speed=0 >5min, "off" otherwise |

**Dependencies:** Requires v1.0 Truck model. New: Truck Diagnostics data model (fuel, DEF, engine hours, DTC codes).

### Safety Dashboard

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Composite safety score (0-100) | Industry standard; single number users recognize | MEDIUM | Mock: Weighted formula: Base 100 - (harsh events × weight per 1000 miles). Example: harsh braking -2pts, speeding -5pts, crash -50pts |
| Harsh braking events | Core safety metric; tracked by all fleet telematics | LOW | Mock: Random 0-2 events per route, threshold >0.4g deceleration. Store timestamp, location, g-force |
| Speeding violations | Most common safety concern for fleet managers | LOW | Mock: 0-1 events per route, speed 10-20 mph over limit. Store actual speed, speed limit, duration |
| Rapid acceleration events | Paired with harsh braking; fuel efficiency + safety concern | LOW | Mock: 0-1 events per route, threshold >0.3g acceleration |
| Rolling stop violations | Common coaching opportunity; lower severity | LOW | Mock: Rare events (10% of routes), low severity |
| Crash/collision detection | High-severity events; requires accelerometer data | MEDIUM | Mock: Very rare (0.1% of routes), high impact. Triggers maintenance workflow from v1.0 |
| Driver safety leaderboard | Gamification; Samsara pattern for engagement | MEDIUM | Sort drivers by safety score, show top 5 / bottom 5 performers with trend arrows (↑↓) |
| Safety trend over time (line chart) | Shows if coaching is working; management reports this | MEDIUM | Mock: Weekly/monthly aggregated scores with slight improvement trend (+2-5 points per month) |
| Event histogram (by type) | Visual breakdown of which behaviors to coach | LOW | Bar chart: harsh braking count, speeding count, acceleration count for selected time period |
| Event distribution donut chart | Pie chart showing % of each violation type | LOW | Donut with center metric (e.g., "247 total events") |

**Dependencies:** Requires v1.0 Route, User (driver) models. New: Safety Events data model.

**Safety Score Calculation (Mock Formula):**
```
Base score = 100
Events per 1000 miles = (total events / total route miles) × 1000

Deductions per 1000 miles:
- Harsh braking: -2 points each
- Speeding: -5 points each
- Rapid acceleration: -2 points each
- Rolling stop: -1 point each
- Crash: -50 points each

Final score = max(0, Base - total deductions)
```

### Fuel & Energy Dashboard

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| MPG / Fuel efficiency metric | Primary cost KPI for fleet managers | MEDIUM | Mock: Calculate (route distance / fuel consumed). Realistic HGV range: 6-8 MPG loaded, 8-10 MPG empty |
| Total fuel consumed (gallons) | Direct cost tracking | LOW | Mock: Aggregate from route-level consumption. Distance / 6.8 MPG (±10% variance per truck for realism) |
| Estimated fuel cost | Requires fuel price per gallon (user input or default) | LOW | Mock: Gallons × $3.50/gal (default, configurable per tenant). Display "Last 30 days: $4,250" |
| Distance traveled | Already calculable from v1.0 routes; telematics adds precision | LOW | Aggregate route distances for selected time period |
| Carbon emissions (CO2) | Samsara standard; EPA emission factors public | LOW | Mock: Gallons diesel × 10.21 kg CO2/gallon (EPA standard). Display in kg or tons |
| Idle time percentage | Wasted fuel; coaching opportunity | MEDIUM | Mock: % of engine-on time spent at speed=0. Store idle minutes per route. Industry avg: 5-15% idle time |
| Top/bottom performers (vehicles or drivers) | Identifies coaching needs and best practices | MEDIUM | Rank by MPG; show top 3 (green) and bottom 3 (red) with variance from fleet average |
| Fuel efficiency trends (line chart) | Month-over-month or week-over-week trends | MEDIUM | Mock: Time-series with slight variance (±0.3 MPG per week). Show if improving or declining |
| Benchmark comparison | Samsara's "compare to similar fleets" feature | LOW | Mock: Show fleet avg (e.g., 6.8 MPG) vs industry avg (7.2 MPG for Class 8 trucks). Static benchmark for MVP |

**Dependencies:** Requires v1.0 Route, Truck models. New: Fuel Consumption data model (gallons, cost, emissions, idle time per route).

### Sidebar Navigation

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hierarchical menu structure | Modern SaaS pattern; group related features | LOW | Sections: Dashboard, Fleet (Trucks, Drivers, Routes), Intelligence (Map, Safety, Fuel), Documents, Maintenance |
| Icon-based navigation | Reduces cognitive load; industry standard | LOW | Use Lucide icons: Map, Truck, Users, ShieldAlert, Droplet, FileText, Wrench. Consistent sizes/colors |
| Active state indicators | Shows current page | LOW | Highlight active nav item with bg color or left border accent |
| Collapsible groups | Keep nav compact for large feature sets | LOW | Expand/collapse "Fleet" and "Intelligence" sections; persist state in localStorage |
| Role-based visibility | Drivers shouldn't see fuel cost or safety dashboards | MEDIUM | Filter nav items by v1.0 `UserRole` enum (OWNER/MANAGER see all, DRIVER sees limited) |
| Responsive mobile behavior | Hamburger menu on mobile | MEDIUM | Use Shadcn Sheet component for mobile overlay; keep sidebar visible on desktop |

**Dependencies:** Requires v1.0 UserRole enum. UI refactor of existing navigation.

## Differentiators (Intelligence Layer)

Features that set DriveCommand apart from basic fleet intelligence. Not required for MVP, but high value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Route compliance visualization | Show planned route vs actual path; blue=compliant, red=deviated | HIGH | Requires geofence/corridor detection logic. Flag deviations >0.5mi from planned route. Samsara offers this; many don't |
| Predictive maintenance from telemetry | Use DTC frequency + engine hours to predict failures | HIGH | Example: P0420 (catalytic converter) occurring 3x in 30 days → predict replacement needed. ML or rule-based heuristics |
| Driver coaching workflow integration | Link safety events → coaching tasks with manager accountability | MEDIUM | When harsh braking occurs, auto-create coaching task for manager. Track completion. Increases safety score impact |
| Multi-vehicle route replay | Scrub timeline to see where all trucks were at specific time | HIGH | Powerful for incident investigation. Requires time-series GPS storage with efficient querying |
| Fuel anomaly detection | Flag suspicious fuel drops (theft or leak) | MEDIUM | Compare expected consumption (distance / avg MPG) vs actual. Alert if >20% variance. "Truck #5 lost 15 gallons unexpectedly" |
| Real-time ETA sharing with customers | Share driver location + ETA via public link (no login) | MEDIUM | Public route tracking page. Common in delivery, rare in general fleet. Differentiation for DriveCommand |
| Emissions reporting for sustainability (PDF) | ESG compliance; CO2 by fleet/driver/route with export | LOW | Generate PDF with CO2 totals, trends, benchmarks. Growing corporate requirement for 2026 sustainability goals |

## Anti-Features (Intelligence Layer)

Features that seem good for intelligence layer but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| 1-second GPS updates | "Real-time" sounds good; Samsara does it | Database bloat (1 truck = 86,400 records/day), marginal value over 30s for trucking, battery drain | 30-60s updates with on-demand 10s refresh when user actively watches map |
| Live dashcam video in map panel | "See what driver sees" for safety | Massive bandwidth/storage costs, privacy concerns, regulatory (consent, retention) | Link to external dashcam provider (Samsara Camera, Lytx) instead of embedding |
| Automatic speeding tickets/fines | "Automate enforcement" | Legal liability (not law enforcement), driver relations nightmare, union issues | Coaching alerts only; managers decide disciplinary action offline |
| Real-time route re-optimization | "AI adjusts routes on the fly" | Drivers ignore constant reroutes, requires live traffic API (cost), undermines planned logistics | Manual route updates by managers with driver notification |
| Social features (driver comments, likes) | "Gamification improves engagement" | Turns safety dashboard into social network, moderation burden, unprofessional | Leaderboards + private 1:1 coaching only |
| OBD-II hardware sales | "Bundle hardware with software" | Inventory management, shipping logistics, hardware support burden, margins thin | Mock data for MVP; later integrate with existing telematics providers (Geotab API) vs selling hardware |

## Feature Dependencies

```
[Live GPS Map]
    └──requires──> [GPS Telemetry Data Model] (time-series: lat/lng/speed/heading/timestamp)
                       └──requires──> [Mock Data Seeder] (generate points for IN_PROGRESS routes)
    └──requires──> [v1.0 Truck, Route, User models]

[Vehicle Detail Panel]
    └──requires──> [Truck Diagnostics Data Model] (fuel, DEF, engine hours, DTC codes)
    └──requires──> [Live GPS Map] (triggered by marker click)
    └──enhances──> [v1.0 Maintenance Events] (DTC codes trigger maintenance)

[Safety Dashboard]
    └──requires──> [Safety Events Data Model] (harsh braking, speeding, acceleration, crash)
    └──requires──> [v1.0 Route model] (calculate events per 1000 miles)
    └──enhances──> [v1.0 User/Driver management] (driver safety scores)

[Fuel & Energy Dashboard]
    └──requires──> [Fuel Consumption Data Model] (gallons, cost, emissions, idle time)
    └──requires──> [v1.0 Route model] (distance for MPG calculation)
    └──requires──> [Truck Diagnostics Data Model] (idle time from engine state)

[Sidebar Navigation]
    └──requires──> [v1.0 UserRole enum] (OWNER/MANAGER/DRIVER for visibility rules)
    └──organizes──> [All intelligence features]

[Route Compliance Visualization] (differentiator)
    └──requires──> [Live GPS Map]
    └──requires──> [Geofence/Corridor Data Model]
    └──conflicts──> [Real-time Route Re-optimization] (anti-feature)

[Predictive Maintenance from Telemetry] (differentiator)
    └──requires──> [Truck Diagnostics Data Model] (DTC history)
    └──requires──> [v1.0 Maintenance Events] (historical maintenance)
    └──enhances──> [v1.0 Scheduled Services]
```

### Dependency Notes

- **Live GPS Map requires v1.0 Route model:** Only generate GPS points when Route.status = IN_PROGRESS
- **Safety Dashboard requires v1.0 Route for normalization:** Calculate harsh events per 1000 miles = (total events / sum(route distances)) × 1000
- **Fuel Dashboard requires v1.0 Truck.odometer:** Validate mock fuel consumption matches odometer increments
- **Vehicle Diagnostics enhances v1.0 Maintenance:** DTC codes should create Maintenance Events when check engine light triggers
- **All features require v1.0 Tenant isolation:** GPS telemetry, safety events, diagnostics must be scoped by tenantId

## MVP Definition (Intelligence Layer Milestone)

### Launch With (Milestone v1.0 - Intelligence Layer)

Minimum viable intelligence layer to demonstrate "Samsara-inspired" capabilities with mock data.

- [x] **Live GPS Map with vehicle markers** — Core visualization; color-coded by status (moving/idle/offline)
- [x] **Route breadcrumb trails (polylines)** — Show historical path for completed + in-progress routes
- [x] **Vehicle detail sidebar panel** — Click marker → see fuel, DEF, odometer, engine state, speed, last update
- [x] **Safety Dashboard with composite score** — Driver safety scores (0-100), harsh braking/speeding/acceleration events
- [x] **Safety event trend chart** — Line chart showing safety scores over last 30 days (weekly aggregation)
- [x] **Fuel & Energy Dashboard** — MPG, gallons consumed, cost, CO2 emissions, idle time percentage
- [x] **Fuel efficiency trend chart** — Line chart showing fleet MPG over last 30 days
- [x] **Sidebar navigation refactor** — Add "Intelligence" section with Map, Safety, Fuel links
- [x] **Mock data seeder** — GPS telemetry, diagnostics, safety events, fuel consumption for realistic demo

**Why this MVP:**
- Validates mock data approach (realistic telemetry without hardware)
- Demonstrates Samsara-tier features with existing v1.0 foundation (Truck/Driver/Route CRUD)
- User can see "live" map + dashboards with simulated data
- Foundation for v1.1 enhancements (coaching, alerts, anomalies)

### Add After Validation (v1.1)

Enhance core intelligence features once mock data validated.

- [ ] **Check engine light / DTC codes** — Display P0XXX codes in vehicle detail panel; trigger v1.0 Maintenance Events
- [ ] **Driver safety leaderboard** — Rank drivers by safety score; top 5 / bottom 5 with trend arrows
- [ ] **Geofence visualization on map** — Draw geofence boundaries; sets up route compliance for v1.2
- [ ] **Fuel anomaly detection alerts** — Flag >20% variance from expected consumption; fraud prevention
- [ ] **Event histogram + donut charts** — Bar chart of event counts by type; donut chart of event % distribution
- [ ] **Map filters (driver, truck, status)** — Client-side filtering of visible markers
- [ ] **Idle time breakdown** — Show which vehicles/drivers have highest idle % for coaching

**Trigger for adding:**
- Users actively viewing intelligence dashboards (analytics show >70% of tenants using Map + Safety)
- Feedback requests for specific features ("Can you show check engine codes?" → add DTC display)
- Mock data feels realistic enough to add anomaly detection logic

### Future Consideration (v2+)

Defer until product-market fit established and real hardware integration considered.

- [ ] **Route compliance visualization** — Blue/red path overlay for deviations from planned route
- [ ] **Predictive maintenance alerts** — Use DTC frequency to predict component failures (e.g., "P0420 repeating → replace catalytic converter soon")
- [ ] **Multi-vehicle route replay** — Timeline scrubber to replay fleet positions at specific past time
- [ ] **Driver coaching workflow** — Manager assigns coaching tasks when safety events occur; track completion
- [ ] **Real-time ETA sharing (public links)** — Share route progress with customers via public URL
- [ ] **Emissions PDF reports** — Generate sustainability reports with CO2 totals, trends, benchmarks
- [ ] **Live traffic/weather impact analysis** — Correlate delays with traffic/weather data (requires 3rd party API)
- [ ] **Hardware integration (real telemetry)** — Replace mock data with Geotab/Samsara API or OBD-II dongles

**Why defer:**
- Complex features (route compliance, predictive maintenance) need validation that mock data patterns are correct
- Coaching workflow is process management (wait for user demand signals)
- Real hardware integration is v2 pivot point (mock→real); validate product-market fit first
- 3rd party APIs (traffic, weather) add cost; defer until revenue justifies expense

## Feature Prioritization Matrix (Intelligence Layer)

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Live GPS Map with markers | HIGH | MEDIUM (map library + GPS data model) | P1 | Launch |
| Route breadcrumb trails | HIGH | MEDIUM (polyline generation logic) | P1 | Launch |
| Vehicle detail sidebar | HIGH | LOW (UI panel + diagnostics join) | P1 | Launch |
| Safety Dashboard (score + events) | HIGH | MEDIUM (scoring formula + event model) | P1 | Launch |
| Fuel & Energy Dashboard | HIGH | MEDIUM (MPG calc + consumption model) | P1 | Launch |
| Trend charts (safety, fuel) | HIGH | LOW (charting library) | P1 | Launch |
| Sidebar navigation refactor | MEDIUM | LOW (UI reorganization) | P1 | Launch |
| Mock data seeder | HIGH | MEDIUM (realistic simulation) | P1 | Launch |
| Check engine light / DTC codes | MEDIUM | LOW (mock occasional codes) | P2 | v1.1 |
| Driver safety leaderboard | MEDIUM | LOW (sort + display) | P2 | v1.1 |
| Geofence visualization | MEDIUM | MEDIUM (polygon drawing) | P2 | v1.1 |
| Fuel anomaly detection | MEDIUM | MEDIUM (variance calculation) | P2 | v1.1 |
| Event histograms/donut charts | LOW | LOW (charting library) | P2 | v1.1 |
| Map filters | MEDIUM | LOW (client-side filter) | P2 | v1.1 |
| Route compliance visualization | HIGH | HIGH (geofence + path intersection) | P3 | v2+ |
| Predictive maintenance | HIGH | HIGH (heuristics or ML) | P3 | v2+ |
| Multi-vehicle route replay | MEDIUM | HIGH (time-series playback UI) | P3 | v2+ |
| Driver coaching workflow | MEDIUM | MEDIUM (task management) | P3 | v2+ |
| Real-time ETA sharing | LOW | MEDIUM (public routes + auth) | P3 | v2+ |
| Emissions PDF reports | LOW | MEDIUM (PDF generation) | P3 | v2+ |

**Priority key:**
- P1 (Must have for launch): Core intelligence visualization; demonstrates Samsara-style features
- P2 (Should have, v1.1): Enhances core features; adds depth to dashboards
- P3 (Nice to have, v2+): Advanced/differentiating features; defer until mock data validated

## Data Model Requirements (Mock Data Patterns)

### GPS Telemetry (Time-Series)

**Purpose:** Store vehicle location history for map + breadcrumbs

**Schema:**
```typescript
{
  id: uuid,
  truckId: uuid,
  timestamp: timestamptz,
  latitude: decimal,
  longitude: decimal,
  speed: int, // mph
  heading: int, // 0-360 degrees
  engineState: "off" | "idle" | "running",
  tenantId: uuid
}
```

**Mock pattern:**
- Generate points every 60 seconds for routes with Route.status = IN_PROGRESS
- Interpolate realistic path from origin to destination (25-50 waypoints)
- Speed variance: 0-65 mph with realistic acceleration/deceleration
- Engine state: "running" when speed >0, "idle" when speed=0 >5min, "off" when route COMPLETED

**Storage options:**
- PostgreSQL table with index on (truckId, timestamp DESC)
- OR JSONB array on Truck model (keep recent 1000 points per truck)

### Truck Diagnostics

**Purpose:** Real-time vehicle health metrics

**Schema (extend Truck model or new TruckDiagnostics table):**
```typescript
{
  truckId: uuid,
  fuelLevelPercent: decimal, // 0-100
  fuelCapacityGallons: int, // e.g., 100 for semi truck
  defLevelPercent: decimal, // 0-100
  engineHours: decimal, // total hours
  lastDiagnosticUpdate: timestamptz,
  dtcCodes: string[], // ["P0171", "P0420"]
  checkEngineLightOn: boolean,
  currentSpeed: int, // mph
  tenantId: uuid
}
```

**Mock pattern:**
- **Fuel:** Start 80-100%, decrease 0.15% per mile (6.67 MPG average HGV)
- **DEF:** Start 90%, decrease 2.5% per fuel tank (~2.5 gallons DEF per 100 gallons diesel)
- **Engine hours:** Increment by route duration when status = IN_PROGRESS
- **DTC codes:** 5% chance per route to generate random P0XXX code (P0171 lean fuel, P0420 catalytic converter common)
- **Check engine light:** ON when dtcCodes.length > 0

### Safety Events

**Purpose:** Track harsh driving behaviors for safety scoring

**Schema:**
```typescript
{
  id: uuid,
  truckId: uuid,
  driverId: uuid,
  routeId: uuid,
  eventType: "harsh_braking" | "speeding" | "rapid_acceleration" | "rolling_stop" | "crash",
  severity: "low" | "medium" | "high",
  timestamp: timestamptz,
  latitude: decimal,
  longitude: decimal,
  metadata: json, // { speedMph: 75, speedLimitMph: 55, gForce: 0.6, duration: 3 }
  tenantId: uuid
}
```

**Mock pattern:**
- Generate 0-3 events per route (random distribution)
- **Harsh braking:** 70% of events, >0.4g deceleration, severity low-medium
- **Speeding:** 20% of events, 10-20 mph over limit, severity medium
- **Rapid acceleration:** 10% of events, >0.3g acceleration, severity low
- **Rolling stop:** Rare (5% of events), severity low
- **Crash:** Very rare (0.1% of routes), severity high, triggers v1.0 Maintenance Event

### Fuel Consumption Records

**Purpose:** Track fuel usage per route for efficiency metrics

**Schema (extend Route model or new FuelConsumption table):**
```typescript
{
  routeId: uuid,
  fuelConsumedGallons: decimal,
  distanceMiles: decimal, // calculate from origin/destination or GPS breadcrumbs
  mpg: decimal, // calculated: distance / fuelConsumed
  fuelCostUsd: decimal, // fuelConsumed × pricePerGallon
  co2EmissionsKg: decimal, // fuelConsumed × 10.21 (EPA factor for diesel)
  idleTimeMinutes: int,
  tenantId: uuid
}
```

**Mock pattern:**
- **Distance:** Calculate from GPS breadcrumbs OR Haversine formula (origin/destination lat/lng)
- **Fuel consumed:** distance / 6.8 MPG (±10% random variance per truck for realism)
- **Idle time:** 5-15% of route duration (random), add 0.8 gallons/hour fuel consumption
- **Fuel price:** $3.50/gal default (make configurable per tenant later)

## Competitor Feature Analysis (Intelligence Layer)

| Feature | Samsara | Geotab | Motive (KeepTruckin) | DriveCommand Approach |
|---------|---------|--------|----------------------|----------------------|
| **GPS update frequency** | 1 second | 2-30 seconds | 1-60 seconds configurable | 30-60 seconds (mock); on-demand 10s refresh (P2) |
| **Safety score** | Composite weighted score, customizable weights | Driver scorecard, rule-based | AI safety score with video integration | Weighted formula (harsh events per 1000 mi); no AI/video for MVP |
| **Fuel tracking** | MPG, cost, emissions, benchmarks vs similar fleets | Fuel level, consumption, IFTA reports | Fuel efficiency, theft detection, IFTA | MPG, cost, CO2, idle time, static benchmark (mock) |
| **Vehicle diagnostics** | OBD-II, DTC codes, fuel, DEF, engine health | Engine diagnostics, fault code trends | Real-time fault codes, predictive alerts | Fuel, DEF, odometer, engine hours, DTC (mock); predictive in v2+ |
| **Route compliance** | Geofence deviations, visual overlay (blue/red) | Route replay, playback | Planned vs actual routes, deviation alerts | Breadcrumbs (v1), compliance visualization (P3) |
| **Map visualization** | Live map, traffic, weather layers, satellite | Map with asset tracking, breadcrumbs | Live map, breadcrumbs, geofences | Live map, breadcrumbs, geofences (v1); layers leverage provider |
| **Driver coaching** | In-app coaching workflows, assign tasks | Driver scorecards + reports | AI Dashcam coaching (video-based) | Leaderboard (P2), coaching workflow (P3); no video |
| **Pricing (hardware + software)** | $30-50/vehicle/month + hardware ($500-1000 per vehicle) | $25-40/vehicle/month + gateway ($300-500) | $35-50/vehicle/month + dashcam ($500-800) | DriveCommand: Mock data (no hardware) for MVP; software-only pricing model possible |

**DriveCommand Differentiation (Intelligence Layer):**
- **Mock-first approach:** Real database models + APIs with simulated telemetry (no hardware dependency for demo/validation/early adopters)
- **Built on v1.0 foundation:** Intelligence layer integrates with existing Truck/Driver/Route CRUD (not separate system)
- **Cost-effective intelligence:** Samsara-tier features without hardware lock-in, per-vehicle fees, or vendor contracts
- **Clear upgrade path:** Start with mock data (v1), validate features, then integrate real hardware (v2) via API (Geotab, Samsara) vs selling hardware

## Implementation Notes for Mock Data

### Realistic Simulation Constraints

1. **GPS telemetry respects route lifecycle:**
   - Generate points ONLY when Route.status = "IN_PROGRESS"
   - Stop generating when status → "COMPLETED"
   - Odometer increments = sum of GPS distances (Haversine formula between consecutive points)

2. **Fuel consumption is consistent:**
   - Fuel level decrease = distance / MPG
   - MPG stays within realistic HGV range (6-8 MPG loaded, 8-10 MPG empty)
   - Idle time adds fuel consumption: ~0.8 gal/hour when speed=0 + engineState="idle"

3. **Safety events correlate with routes:**
   - Events ONLY during IN_PROGRESS routes
   - Event lat/lng falls ON route breadcrumb path (pick random waypoint)
   - Driver safety score aggregates across ALL completed routes

4. **Diagnostics degrade realistically:**
   - DEF decreases slower than fuel (~2-3% DEF per 100 gallons diesel)
   - Engine hours increment ONLY when engineState = "running" or "idle"
   - DTC codes persist until route completes (simulate repair cycle)

### Seeder Strategy

**Phase 1 (P1 - Launch):** Seed on route status change
- When route → IN_PROGRESS: Start generating GPS points every 60s (background job or cron)
- When route → COMPLETED: Stop GPS, finalize fuel consumption, emit 0-3 safety events

**Phase 2 (P2 - v1.1):** Backfill historical data
- Generate last 30 days of completed routes with full telemetry
- Populate safety scores for all drivers
- Create fuel efficiency trends (weekly averages)

**Phase 3 (P3 - Real-time simulation):** Live updates
- Background job generates GPS points for all IN_PROGRESS routes every 60s
- Simulates "live" map updates without actual hardware
- WebSocket or polling for real-time UI updates

## Sources

**GPS Tracking & Map:**
- [Samsara GPS Fleet Tracking](https://www.samsara.com/products/telematics/gps-fleet-tracking) — 1-second updates, live map, traffic overlays
- [GPS Fleet Tracking Update Frequency - SpaceHawk GPS](https://spacehawkgps.com/blogs/post/gps-tracker-for-trucks) — Industry standards: 30-60s typical, 1-30s available
- [GPS Breadcrumbs Guide - Workyard](https://www.workyard.com/employee-time-tracking/gps-breadcrumbs) — Breadcrumb trail concepts
- [Route Compliance Tracking - Route4Me](https://support.route4me.com/route-compliance-tracking/) — Blue/red deviation visualization
- [Fleet Overview Map - Samsara Help Center](https://kb.samsara.com/hc/en-us/articles/41266933936269-Monitor-Your-Fleet-on-the-Fleet-Overview-Map) — Map filtering, display options

**Vehicle Diagnostics:**
- [Fleet Vehicle Diagnostics - InSight Mobile Data](https://insightmobiledata.com/solutions/fleet-management-solutions/fleet-vehicle-diagnostics) — Engine hours, fuel, diagnostics monitoring
- [DEF Monitoring & Telematics - Intangles](https://www.intangles.ai/integrating-def-monitoring-with-telematics-for-enhanced-fleet-performance/) — DEF level tracking, EPA compliance
- [DTC Codes Guide - Lytx](https://www.lytx.com/blog/dtc-guide-everything-you-need-to-know-about-diagnostic-trouble-codes) — DTC structure, P0XXX codes
- [DTC Codes in Fleet Management - ClearPath GPS](https://www.clearpathgps.com/blog/what-are-dtc-codes/) — Real-time fault code alerts
- [Current Asset Diagnostic Data - Samsara](https://kb.samsara.com/hc/en-us/articles/4405442076301-Current-Asset-Diagnostic-Data) — Fuel, DEF, engine state display

**Safety Dashboard:**
- [Driver Behavior Monitoring Guide 2026 - OxMaint](https://oxmaint.com/industries/fleet-management/driver-behavior-monitoring-complete-fleet-safety-guide-2026) — Harsh braking, acceleration, speeding metrics
- [Safety Score Calculation - Samsara Help Center](https://kb.samsara.com/hc/en-us/articles/360045237852-Safety-Score-Categories-and-Calculation) — Weighted scoring, event severity
- [Driver Scorecards - Geotab](https://www.geotab.com/blog/driver-scorecards/) — Scorecard patterns, leaderboards
- [Fleet Safety Metrics - Rhythm Innovations](https://www.rhythminnovations.com/top-10-fleet-safety-metrics-every-fleet-risk-manager-should-track/) — Events per 1000 miles calculation
- [Top 10 Fleet Management KPIs - OxMaint](https://oxmaint.com/industries/fleet-management/top-10-fleet-management-kpis-track-2026) — Safety KPIs, coaching metrics

**Fuel & Energy:**
- [Fuel & Energy Hub - Samsara Help Center](https://kb.samsara.com/hc/en-us/articles/14909522972301-Fuel-Energy-Hub) — MPG, cost, emissions, idle time
- [Sustainability Report - Samsara](https://kb.samsara.com/hc/en-us/articles/14910242442125-Sustainability-Report) — EPA emission factors (10.21 kg CO2/gal diesel)
- [Fuel Efficiency Benchmarks - Samsara Blog](https://www.samsara.com/blog/fuel-efficiency-benchmarks-report) — Industry benchmarks, fleet comparisons
- [Fuel Management System Tools - Geotab](https://www.geotab.com/blog/fuel-management-system-tools/) — Fuel tracking, theft detection

**Dashboard & Visualization:**
- [Fleet Management Dashboard Design - Hicron](https://hicronsoftware.com/blog/fleet-management-dashboard-design/) — Dashboard best practices, sidebar navigation
- [Data Visualization Chart Types - Luzmo](https://www.luzmo.com/blog/chart-types) — Donut charts, histograms, trend lines
- [Dashboard Design Trends 2026 - FusionCharts](https://www.fusioncharts.com/blog/5-dashboard-design-trends-to-watch-out-for/) — Visualization patterns

---
*Feature research for: DriveCommand Fleet Intelligence Layer (Milestone)*
*Researched: 2026-02-15*
*Confidence: MEDIUM (based on Samsara/Geotab/Motive patterns, EPA standards, fleet telematics industry research)*
