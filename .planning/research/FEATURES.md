# Feature Landscape

**Domain:** Fleet Intelligence Platform (Samsara-inspired telematics layer)
**Researched:** 2026-02-15
**Confidence:** HIGH

**Context:** DriveCommand v1.0 complete (Truck/Driver/Route CRUD, Maintenance, Documents). This research focuses ONLY on the new intelligence layer: live GPS map, vehicle diagnostics, safety dashboard, fuel/energy dashboard, and navigation.

Research based on Samsara patterns, competitor analysis (Geotab, Motive, Verizon Connect), and fleet telematics industry standards for 2026. Mock data implementation requires realistic simulation of hardware telemetry (GPS, OBD-II diagnostics).

## Table Stakes (Intelligence Layer)

Features users expect in a Samsara-style fleet intelligence platform. Missing these = intelligence layer feels incomplete.

### Live GPS Tracking & Map

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time vehicle location on map | Industry standard; Samsara updates every 1 second, but 30-60s acceptable for most fleets | MEDIUM | Mock: Generate GPS points every 30-60s for IN_PROGRESS routes; store in time-series pattern (JSONB or separate table). Research shows 30-60s sufficient for trucking vs 1s for delivery |
| Vehicle markers with status indicators | At-a-glance view of moving vs idle vs offline vehicles | LOW | Color-coded icons: green=moving, yellow=idle >5min, gray=offline/no recent telemetry. Universal pattern across all platforms |
| Route breadcrumb trails / polylines | Historical path visualization; universal GPS tracking feature | MEDIUM | Mock: Generate polyline coordinates from route origin→destination with realistic waypoints (25-50 points per route) |
| Map clustering for large fleets | Prevents marker overload when zoomed out; high-resolution maps with smart clustering standard in 2026 | MEDIUM | Cluster markers when zoom level shows >20 vehicles in viewport. On zoom-in, expand cluster to individual markers |
| Map controls (zoom, pan, satellite/terrain layers) | Table stakes for any map interface | LOW | Use Mapbox/Google Maps standard controls; traffic/weather overlays leverage provider APIs |
| Vehicle detail sidebar panel (collapsible) | Click marker → see truck details; universal pattern in fleet systems. Samsara uses slide-out panels | MEDIUM | Slide-out panel shows current diagnostics (fuel, DEF, engine state, speed) + route info from v1.0 Route model. Panel should be collapsible/expandable |
| Live vehicle filtering (by driver, truck, status) | Essential for managing fleets >10 vehicles | LOW | Client-side filter map markers by tenantId, driverId, truckId, or engine state |
| Last reported timestamp | Shows data freshness; users distrust stale data | LOW | Display "Last update: 2 minutes ago" per vehicle. Critical for trust in real-time systems |
| Geofence visualization on map | Draw virtual boundaries (depot, customer sites, restricted zones); visual representation of zones | MEDIUM | Polygon/circle overlays on map. Common for depot tracking, customer arrival notifications |

**Dependencies:** Requires v1.0 Truck, Route (existing), User models. New: GPS Telemetry data model (time-series).

### Geofencing & Location Alerts

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Geofence creation (depot, customer sites) | Virtual boundaries for automation; standard feature in 2026 fleet platforms | MEDIUM | Circular (radius-based) or polygonal geofences. Research shows polygonal offers 60% better precision for complex sites |
| Entry/exit notifications | Automate arrival alerts; "Truck #5 arrived at customer site" | MEDIUM | Email/SMS when vehicle crosses geofence. Configurable per geofence (notify on entry, exit, or both) |
| Dwell time tracking | How long vehicle stayed at location; billing/compliance use case | LOW | Calculate duration between geofence entry and exit events. Display "Dwell: 2h 15m" |
| Unauthorized location alerts | Vehicle outside service area or in restricted zone | MEDIUM | Configurable alert when vehicle enters/exits specific zones during specific hours. Fleet security use case |

**Dependencies:** Requires Live GPS Map, Geofence Data Model (polygon coordinates, alert rules).

**Research insight:** 2026 best practice is to avoid overly broad geofences that trigger false alerts. Polygonal fences reduce false positives by 60% vs radius-based. Focus on high-value areas (depots, major customer sites) not every stop.

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
| Composite safety score (0-100) | Industry standard; single number users recognize | MEDIUM | Mock: Weighted formula: Base 100 - (harsh events × weight per 1000 miles). Research shows 20+ distinct safety metrics combined into composite score |
| Harsh braking events | Core safety metric; tracked by all fleet telematics | LOW | Mock: Random 0-2 events per route, threshold >0.4g deceleration. Store timestamp, location, g-force. Samsara uses >0.4g for 1 second |
| Speeding violations | Most common safety concern for fleet managers | LOW | Mock: 0-1 events per route, speed 10-20 mph over limit. Store actual speed, speed limit, duration |
| Rapid acceleration events | Paired with harsh braking; fuel efficiency + safety concern | LOW | Mock: 0-1 events per route, threshold >0.3g acceleration. Typical threshold: >0.220g (Verizon Connect standard) |
| Configurable alert thresholds | Different fleets need different sensitivity (light vs heavy duty vehicles) | MEDIUM | Admin can set g-force thresholds per vehicle class. Light duty: 0.220g accel / 0.265g brake. Heavy duty: higher thresholds. Research shows customization critical |
| Rolling stop violations | Common coaching opportunity; lower severity | LOW | Mock: Rare events (10% of routes), low severity |
| Crash/collision detection | High-severity events; requires accelerometer data | MEDIUM | Mock: Very rare (0.1% of routes), high impact. Triggers maintenance workflow from v1.0. Threshold typically >3.0g impact |
| Driver safety leaderboard | Gamification; Samsara pattern for engagement | MEDIUM | Sort drivers by safety score, show top 5 / bottom 5 performers with trend arrows (↑↓). Research shows observable improvements within 30 days once drivers aware of monitoring |
| Safety trend over time (line chart) | Shows if coaching is working; management reports this | MEDIUM | Mock: Weekly/monthly aggregated scores with slight improvement trend (+2-5 points per month) |
| Event histogram (by type) | Visual breakdown of which behaviors to coach; bar chart | LOW | Bar chart: harsh braking count, speeding count, acceleration count for selected time period |
| Event distribution donut chart | Pie chart showing % of each violation type; Samsara standard visualization | LOW | Donut with center metric (e.g., "247 total events"). Research shows donut charts used extensively for compliance/logs display |
| Real-time event alerts | Immediate notification when harsh event occurs | MEDIUM | "Driver exceeded safe speed threshold 3x in one shift" → alert manager + driver. Research: enables corrective action before pattern solidifies |

**Dependencies:** Requires v1.0 Route, User (driver) models. New: Safety Events data model.

**Safety Score Calculation (Mock Formula based on 2026 industry standards):**
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

**Research insight:** Most fleets see 55% reduction in accidents, 30% insurance savings, 40% better CSA scores within 90 days of implementing driver performance analytics with coaching.

### Fuel & Energy Dashboard

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| MPG / Fuel efficiency metric | Primary cost KPI for fleet managers; "north star" metric | MEDIUM | Mock: Calculate (route distance / fuel consumed). Realistic HGV range: 6-8 MPG loaded, 8-10 MPG empty. Research: MPG captures maintenance issues, driving behavior, route efficiency in one number |
| Total fuel consumed (gallons) | Direct cost tracking | LOW | Mock: Aggregate from route-level consumption. Distance / 6.8 MPG (±10% variance per truck for realism) |
| Estimated fuel cost | Requires fuel price per gallon (user input or default) | LOW | Mock: Gallons × $3.50/gal (default, configurable per tenant). Display "Last 30 days: $4,250" |
| Distance traveled | Already calculable from v1.0 routes; telematics adds precision | LOW | Aggregate route distances for selected time period |
| Carbon emissions (CO2) | Samsara standard; EPA emission factors public; growing ESG requirement for 2026 | LOW | Mock: Gallons diesel × 10.21 kg CO2/gallon (EPA standard). Display in kg or tons. Research: corporate sustainability reporting requirement increasing |
| Idle time percentage | Wasted fuel; coaching opportunity. Research: Idle % has fastest ROI—most fleets reduce 40-60% within 30 days | MEDIUM | Mock: % of engine-on time spent at speed=0. Store idle minutes per route. Industry avg: 5-15% idle time. Alert if >15% |
| Top/bottom performers (vehicles or drivers) | Identifies coaching needs and best practices | MEDIUM | Rank by MPG; show top 3 (green) and bottom 3 (red) with variance from fleet average |
| Fuel efficiency trends (line chart) | Month-over-month or week-over-week trends | MEDIUM | Mock: Time-series with slight variance (±0.3 MPG per week). Show if improving or declining |
| Benchmark comparison | Samsara's "compare to similar fleets" feature | LOW | Mock: Show fleet avg (e.g., 6.8 MPG) vs industry avg (7.2 MPG for Class 8 trucks). Static benchmark for MVP |
| Cost per mile / Cost per kilometer | Total cost visibility; combines fuel, maintenance, insurance divided by distance | MEDIUM | Research: Critical KPI for profitability. Fleets tracking right fuel KPIs reduce costs 12-18% within 90 days |

**Dependencies:** Requires v1.0 Route, Truck models. New: Fuel Consumption data model (gallons, cost, emissions, idle time per route).

**Research insight:** 2026 dashboard best practice is "15-Minute Rule"—can someone new to your operation understand this metric and take action within 15 minutes of seeing an alert?

### Sidebar Navigation

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Icon-based vertical navigation | Modern SaaS pattern; reduces cognitive load; industry standard in 2026 | LOW | Use Lucide icons: Map, Truck, Users, ShieldAlert, Droplet, FileText, Wrench. Consistent sizes/colors. Research: icon sidebar is Samsara's signature pattern |
| Hierarchical menu structure | Group related features; modern SaaS pattern | LOW | Sections: Dashboard, Fleet (Trucks, Drivers, Routes), Intelligence (Map, Safety, Fuel), Documents, Maintenance |
| Collapsible groups | Keep nav compact for large feature sets | LOW | Expand/collapse "Fleet" and "Intelligence" sections; persist state in localStorage. Research: recommended width 240-300px expanded, 48-64px collapsed |
| Active state indicators | Shows current page; visual clarity | LOW | Highlight active nav item with bg color or left border accent |
| Role-based visibility | Drivers shouldn't see fuel cost or safety dashboards | MEDIUM | Filter nav items by v1.0 `UserRole` enum (OWNER/MANAGER see all, DRIVER sees limited) |
| Responsive mobile behavior | Hamburger menu on mobile | MEDIUM | Use Shadcn Sheet component for mobile overlay; keep sidebar visible on desktop |

**Dependencies:** Requires v1.0 UserRole enum. UI refactor of existing navigation.

**Research insight:** 2026 best practice is to use whitespace and clarity with unconventional icon placements. Sidebars especially valuable for admin dashboards, SaaS platforms, and data analytics interfaces.

## Differentiators (Intelligence Layer)

Features that set DriveCommand apart from basic fleet intelligence. Not required for MVP, but high value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Trip replay with timeline scrubber | Scrub timeline to see vehicle path at any past moment; powerful for incident investigation | HIGH | Interactive playback with speed control (1x, 2x, 4x). Research: Geotab, Samsara, GreenRoad all offer this. Adjust playback speed via dropdown |
| Multi-vehicle route replay | Scrub timeline to see where ALL trucks were at specific time; incident investigation + dispatch optimization | HIGH | Requires time-series GPS storage with efficient querying. "Show all trucks at 2:30 PM yesterday" |
| Route compliance visualization | Show planned route vs actual path; blue=compliant, red=deviated | HIGH | Requires geofence/corridor detection logic. Flag deviations >0.5mi from planned route. Samsara offers this; many don't |
| Predictive maintenance from telemetry | Use DTC frequency + engine hours to predict failures | HIGH | Example: P0420 (catalytic converter) occurring 3x in 30 days → predict replacement needed. ML or rule-based heuristics |
| Driver coaching workflow integration | Link safety events → coaching tasks with manager accountability | MEDIUM | When harsh braking occurs, auto-create coaching task for manager. Track completion. Increases safety score impact |
| Fuel anomaly detection | Flag suspicious fuel drops (theft or leak) | MEDIUM | Compare expected consumption (distance / avg MPG) vs actual. Alert if >20% variance. "Truck #5 lost 15 gallons unexpectedly" |
| Real-time ETA sharing with customers | Share driver location + ETA via public link (no login); customer visibility | MEDIUM | Public route tracking page. Research: unique tracking links per customer via SMS, work on any device without app. Common in delivery, rare in general fleet |
| Live location sharing links | "Share live location with customer" generates public URL with accurate ETA updates | MEDIUM | Research: Samsara standard feature for customer service. Eliminates "where's my delivery?" phone calls. Links expire after delivery |
| Emissions reporting for sustainability (PDF) | ESG compliance; CO2 by fleet/driver/route with export | LOW | Generate PDF with CO2 totals, trends, benchmarks. Growing corporate requirement for 2026 sustainability goals |
| Traffic and weather impact analysis | Correlate delays with external conditions; route optimization insights | MEDIUM | Overlay traffic/weather data on map. Explain "30min delay due to I-95 traffic congestion" |
| Customizable dashboard widgets | Drag-drop widgets, resize, enable only metrics that matter to role | MEDIUM | Research: Role-based access shows different layouts (dispatcher, manager, executive). Fully customizable per user |

**Research insight:** Real-time ETA sharing is becoming table stakes in delivery fleets but still differentiator in general trucking. Customer location links increase client trust, win broker contracts, reduce wait times at client sites.

## Anti-Features (Intelligence Layer)

Features that seem good for intelligence layer but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| 1-second GPS updates | "Real-time" sounds good; Samsara does it | Database bloat (1 truck = 86,400 records/day), marginal value over 30s for trucking, battery drain. Research: 2026 consensus is 30-60s sufficient for trucking vs 1s for last-mile delivery | 30-60s updates with on-demand 10s refresh when user actively watches map |
| Live dashcam video in map panel | "See what driver sees" for safety | Massive bandwidth/storage costs, privacy concerns, regulatory (consent, retention). Research: video integration requires specialized providers | Link to external dashcam provider (Samsara Camera, Lytx) instead of embedding |
| Automatic speeding tickets/fines | "Automate enforcement" | Legal liability (not law enforcement), driver relations nightmare, union issues | Coaching alerts only; managers decide disciplinary action offline |
| Real-time route re-optimization | "AI adjusts routes on the fly" | Drivers ignore constant reroutes, requires live traffic API (cost), undermines planned logistics. Research: route compliance tracking is better approach | Manual route updates by managers with driver notification. Track deviations but don't auto-reroute |
| Social features (driver comments, likes) | "Gamification improves engagement" | Turns safety dashboard into social network, moderation burden, unprofessional | Leaderboards + private 1:1 coaching only |
| OBD-II hardware sales | "Bundle hardware with software" | Inventory management, shipping logistics, hardware support burden, margins thin | Mock data for MVP; later integrate with existing telematics providers (Geotab API) vs selling hardware |
| Alert overload (notify everything) | "Keep managers informed of all events" | Alert fatigue; managers ignore notifications. Research: 2026 pitfall is drowning managers in alerts instead of flagging only vehicles/drivers needing attention | Configurable alert thresholds, severity levels, digest mode (daily summary vs real-time spam) |
| Fully automated maintenance scheduling | "AI decides when to service vehicles" | Removes human judgment from complex decisions. Research: AI handles cognitive load and pattern detection, humans make judgment calls, coach drivers, manage exceptions. Clean data is prerequisite | AI recommendations with human approval. "Truck #5: recommend oil change in 500 miles based on engine hours" |

**Research insight:** 2026 lesson is that "smart maintenance is a marathon of smarter execution, not a sprint to impossible automation goal." Even with best sensors, if underlying data (past repairs, asset utilization) is messy, AI predictions will be messy. Don't jump from paper checklists to managing AI alerts without proper training.

## Feature Dependencies

```
[Live GPS Map]
    └──requires──> [GPS Telemetry Data Model] (time-series: lat/lng/speed/heading/timestamp)
                       └──requires──> [Mock Data Seeder] (generate points for IN_PROGRESS routes)
    └──requires──> [v1.0 Truck, Route, User models]
    └──enables──> [Map Clustering] (when fleet >20 vehicles)

[Geofencing]
    └──requires──> [Live GPS Map]
    └──requires──> [Geofence Data Model] (polygon coordinates, alert rules)
    └──enables──> [Route Compliance Visualization]
    └──enables──> [Unauthorized Location Alerts]

[Vehicle Detail Panel]
    └──requires──> [Truck Diagnostics Data Model] (fuel, DEF, engine hours, DTC codes)
    └──requires──> [Live GPS Map] (triggered by marker click)
    └──enhances──> [v1.0 Maintenance Events] (DTC codes trigger maintenance)

[Safety Dashboard]
    └──requires──> [Safety Events Data Model] (harsh braking, speeding, acceleration, crash)
    └──requires──> [v1.0 Route model] (calculate events per 1000 miles)
    └──enhances──> [v1.0 User/Driver management] (driver safety scores)
    └──enables──> [Real-time Event Alerts]
    └──enables──> [Driver Coaching Workflow]

[Fuel & Energy Dashboard]
    └──requires──> [Fuel Consumption Data Model] (gallons, cost, emissions, idle time)
    └──requires──> [v1.0 Route model] (distance for MPG calculation)
    └──requires──> [Truck Diagnostics Data Model] (idle time from engine state)
    └──enables──> [Fuel Anomaly Detection]

[Sidebar Navigation]
    └──requires──> [v1.0 UserRole enum] (OWNER/MANAGER/DRIVER for visibility rules)
    └──organizes──> [All intelligence features]

[Trip Replay] (differentiator)
    └──requires──> [Live GPS Map]
    └──requires──> [GPS Telemetry time-series storage]
    └──enhances──> [Route Compliance investigation]

[Route Compliance Visualization] (differentiator)
    └──requires──> [Live GPS Map]
    └──requires──> [Geofence/Corridor Data Model]
    └──conflicts──> [Real-time Route Re-optimization] (anti-feature)

[Predictive Maintenance from Telemetry] (differentiator)
    └──requires──> [Truck Diagnostics Data Model] (DTC history)
    └──requires──> [v1.0 Maintenance Events] (historical maintenance)
    └──enhances──> [v1.0 Scheduled Services]

[ETA Sharing] (differentiator)
    └──requires──> [Live GPS Map]
    └──requires──> [Public route access (no auth)]
    └──enables──> [Customer satisfaction tracking]
```

### Dependency Notes

- **Live GPS Map requires v1.0 Route model:** Only generate GPS points when Route.status = IN_PROGRESS
- **Safety Dashboard requires v1.0 Route for normalization:** Calculate harsh events per 1000 miles = (total events / sum(route distances)) × 1000
- **Fuel Dashboard requires v1.0 Truck.odometer:** Validate mock fuel consumption matches odometer increments
- **Vehicle Diagnostics enhances v1.0 Maintenance:** DTC codes should create Maintenance Events when check engine light triggers
- **Geofencing enables Route Compliance:** Geofences define "compliant corridors" for planned routes
- **All features require v1.0 Tenant isolation:** GPS telemetry, safety events, diagnostics must be scoped by tenantId

## MVP Definition (Intelligence Layer Milestone)

### Launch With (Milestone v2.0 - Intelligence Layer)

Minimum viable intelligence layer to demonstrate "Samsara-inspired" capabilities with mock data.

- [x] **Live GPS Map with vehicle markers** — Core visualization; color-coded by status (moving/idle/offline)
- [x] **Route breadcrumb trails (polylines)** — Show historical path for completed + in-progress routes
- [x] **Vehicle detail sidebar panel (collapsible)** — Click marker → see fuel, DEF, odometer, engine state, speed, last update
- [x] **Safety Dashboard with composite score** — Driver safety scores (0-100), harsh braking/speeding/acceleration events
- [x] **Configurable alert thresholds** — Set g-force sensitivity per vehicle class (light/medium/heavy duty)
- [x] **Safety event trend chart** — Line chart showing safety scores over last 30 days (weekly aggregation)
- [x] **Event histogram + donut chart** — Bar chart of event counts by type; donut chart of % distribution
- [x] **Fuel & Energy Dashboard** — MPG, gallons consumed, cost, CO2 emissions, idle time percentage
- [x] **Fuel efficiency trend chart** — Line chart showing fleet MPG over last 30 days
- [x] **Sidebar navigation refactor (icon-based)** — Add "Intelligence" section with Map, Safety, Fuel links. Collapsible groups
- [x] **Mock data seeder** — GPS telemetry, diagnostics, safety events, fuel consumption for realistic demo

**Why this MVP:**
- Validates mock data approach (realistic telemetry without hardware)
- Demonstrates Samsara-tier features with existing v1.0 foundation (Truck/Driver/Route CRUD)
- User can see "live" map + dashboards with simulated data
- Foundation for v1.1 enhancements (geofencing, coaching, trip replay, alerts)
- Addresses 2026 research finding: focus on foundational execution before advanced AI automation

### Add After Validation (v2.1)

Enhance core intelligence features once mock data validated.

- [ ] **Geofence creation and visualization** — Draw geofence boundaries (depot, customer sites); polygon-based for precision
- [ ] **Geofence entry/exit alerts** — Email/SMS notifications when vehicle crosses boundaries
- [ ] **Check engine light / DTC codes** — Display P0XXX codes in vehicle detail panel; trigger v1.0 Maintenance Events
- [ ] **Driver safety leaderboard** — Rank drivers by safety score; top 5 / bottom 5 with trend arrows
- [ ] **Real-time safety event alerts** — Immediate notification when harsh event occurs ("Driver exceeded safe speed 3x")
- [ ] **Fuel anomaly detection alerts** — Flag >20% variance from expected consumption; fraud prevention
- [ ] **Map filters (driver, truck, status)** — Client-side filtering of visible markers
- [ ] **Idle time breakdown by vehicle/driver** — Show which have highest idle % for coaching
- [ ] **Map clustering** — Cluster markers when zoom level shows >20 vehicles; expand on zoom-in

**Trigger for adding:**
- Users actively viewing intelligence dashboards (analytics show >70% of tenants using Map + Safety)
- Feedback requests for specific features ("Can you show check engine codes?" → add DTC display)
- Mock data feels realistic enough to add anomaly detection logic
- Geofencing requested for specific use case (depot tracking, customer arrival notifications)

### Future Consideration (v2.2+)

Defer until product-market fit established and real hardware integration considered.

- [ ] **Trip replay with timeline scrubber** — Playback vehicle path at any past moment with speed control
- [ ] **Multi-vehicle route replay** — Timeline scrubber showing all trucks at specific past time
- [ ] **Route compliance visualization** — Blue/red path overlay for deviations from planned route
- [ ] **Predictive maintenance alerts** — Use DTC frequency to predict component failures (e.g., "P0420 repeating → replace catalytic converter soon")
- [ ] **Driver coaching workflow** — Manager assigns coaching tasks when safety events occur; track completion
- [ ] **Real-time ETA sharing (public links)** — Share route progress with customers via public URL
- [ ] **Live location sharing links** — Customer tracking links via SMS; works on any device without app
- [ ] **Emissions PDF reports** — Generate sustainability reports with CO2 totals, trends, benchmarks
- [ ] **Traffic/weather impact analysis** — Correlate delays with traffic/weather data (requires 3rd party API)
- [ ] **Customizable dashboard widgets** — Drag-drop, resize, role-based layouts
- [ ] **Hardware integration (real telemetry)** — Replace mock data with Geotab/Samsara API or OBD-II dongles

**Why defer:**
- Complex features (route compliance, predictive maintenance, trip replay) need validation that mock data patterns are correct
- Coaching workflow is process management (wait for user demand signals)
- ETA sharing is differentiator but requires public route access (auth complexity)
- Real hardware integration is v2 pivot point (mock→real); validate product-market fit first
- 3rd party APIs (traffic, weather) add cost; defer until revenue justifies expense
- Research shows: clean foundational data prerequisite for AI predictions; validate data quality first

## Feature Prioritization Matrix (Intelligence Layer)

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Live GPS Map with markers | HIGH | MEDIUM (map library + GPS data model) | P1 | Launch (v2.0) |
| Route breadcrumb trails | HIGH | MEDIUM (polyline generation logic) | P1 | Launch (v2.0) |
| Vehicle detail sidebar (collapsible) | HIGH | LOW (UI panel + diagnostics join) | P1 | Launch (v2.0) |
| Safety Dashboard (score + events) | HIGH | MEDIUM (scoring formula + event model) | P1 | Launch (v2.0) |
| Fuel & Energy Dashboard | HIGH | MEDIUM (MPG calc + consumption model) | P1 | Launch (v2.0) |
| Trend charts (safety, fuel) | HIGH | LOW (charting library) | P1 | Launch (v2.0) |
| Event histograms/donut charts | MEDIUM | LOW (charting library) | P1 | Launch (v2.0) |
| Sidebar navigation refactor (icons) | MEDIUM | LOW (UI reorganization) | P1 | Launch (v2.0) |
| Configurable alert thresholds | MEDIUM | MEDIUM (per-vehicle-class settings) | P1 | Launch (v2.0) |
| Mock data seeder | HIGH | MEDIUM (realistic simulation) | P1 | Launch (v2.0) |
| Geofence creation/visualization | MEDIUM | MEDIUM (polygon drawing) | P2 | v2.1 |
| Geofence entry/exit alerts | MEDIUM | MEDIUM (alert rules + notifications) | P2 | v2.1 |
| Check engine light / DTC codes | MEDIUM | LOW (mock occasional codes) | P2 | v2.1 |
| Driver safety leaderboard | MEDIUM | LOW (sort + display) | P2 | v2.1 |
| Real-time safety event alerts | MEDIUM | MEDIUM (notification service) | P2 | v2.1 |
| Fuel anomaly detection | MEDIUM | MEDIUM (variance calculation) | P2 | v2.1 |
| Map filters | MEDIUM | LOW (client-side filter) | P2 | v2.1 |
| Map clustering | LOW | MEDIUM (clustering algorithm) | P2 | v2.1 |
| Trip replay (single vehicle) | MEDIUM | HIGH (time-series playback UI) | P3 | v2.2+ |
| Multi-vehicle route replay | MEDIUM | HIGH (multi-layer playback) | P3 | v2.2+ |
| Route compliance visualization | HIGH | HIGH (geofence + path intersection) | P3 | v2.2+ |
| Predictive maintenance | HIGH | HIGH (heuristics or ML) | P3 | v2.2+ |
| Driver coaching workflow | MEDIUM | MEDIUM (task management) | P3 | v2.2+ |
| Real-time ETA sharing | MEDIUM | MEDIUM (public routes + auth) | P3 | v2.2+ |
| Emissions PDF reports | LOW | MEDIUM (PDF generation) | P3 | v2.2+ |
| Traffic/weather impact analysis | LOW | MEDIUM (3rd party API integration) | P3 | v2.2+ |

**Priority key:**
- P1 (Must have for launch): Core intelligence visualization; demonstrates Samsara-style features
- P2 (Should have, v2.1): Enhances core features; adds depth to dashboards and actionable alerts
- P3 (Nice to have, v2.2+): Advanced/differentiating features; defer until mock data validated

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

### Geofence Data Model

**Purpose:** Define virtual boundaries for location-based alerts

**Schema:**
```typescript
{
  id: uuid,
  tenantId: uuid,
  name: string, // "Main Depot", "Customer Site - Acme Corp"
  type: "circle" | "polygon",
  coordinates: json, // Circle: {lat, lng, radiusMeters} | Polygon: [{lat, lng}, ...]
  alertOnEntry: boolean,
  alertOnExit: boolean,
  alertRecipients: string[], // email addresses or user IDs
  createdAt: timestamptz
}
```

**Mock pattern:**
- Create 2-3 geofences per tenant (depot + major customer sites)
- Circular geofences: 100-500m radius
- Polygonal geofences: 4-8 coordinate pairs outlining facility boundaries
- 60% of geofences alert on entry only (arrival notifications)

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

| Feature | Samsara | Geotab | Motive (KeepTruckin) | Verizon Connect | DriveCommand Approach |
|---------|---------|--------|----------------------|-----------------|----------------------|
| **GPS update frequency** | 1 second | 2-30 seconds | 1-60 seconds configurable | 30-60 seconds | 30-60 seconds (mock); on-demand 10s refresh (P2) |
| **Safety score** | Composite weighted score, customizable weights | Driver scorecard, rule-based | AI safety score with video integration | Harsh event tracking | Weighted formula (harsh events per 1000 mi); configurable thresholds by vehicle class |
| **Fuel tracking** | MPG, cost, emissions, benchmarks vs similar fleets | Fuel level, consumption, IFTA reports | Fuel efficiency, theft detection, IFTA | Fuel consumption, idle time | MPG, cost, CO2, idle time, static benchmark (mock); anomaly detection (P2) |
| **Vehicle diagnostics** | OBD-II, DTC codes, fuel, DEF, engine health | Engine diagnostics, fault code trends | Real-time fault codes, predictive alerts | Check engine light, diagnostics | Fuel, DEF, odometer, engine hours, DTC (mock); predictive in v2+ |
| **Route compliance** | Geofence deviations, visual overlay (blue/red) | Route replay, playback | Planned vs actual routes, deviation alerts | Geofencing with alerts | Breadcrumbs (v2.0), geofences (v2.1), compliance visualization (P3) |
| **Map visualization** | Live map, traffic, weather layers, satellite, clustering | Map with asset tracking, breadcrumbs | Live map, breadcrumbs, geofences | Live map with clustering | Live map, breadcrumbs, clustering (v2.1), geofences (v2.1); layers leverage provider |
| **Trip replay** | Timeline scrubber, speed control, multi-vehicle | Trip replay with events | Route history playback | Route replay | Single vehicle (P3), multi-vehicle (P3) |
| **ETA sharing** | Live location links for customers | No | Driver ETA sharing | No | Public tracking links (P3) |
| **Dashboard charts** | Donut, histogram, line, bar with customizable widgets | Scorecard reports | Compliance hub with donut charts | Fleet health metrics | Donut (event %), histogram (event counts), line (trends) in v2.0 |
| **Driver coaching** | In-app coaching workflows, assign tasks | Driver scorecards + reports | AI Dashcam coaching (video-based) | Alerts for harsh events | Leaderboard (v2.1), coaching workflow (P3); no video |
| **Pricing (hardware + software)** | $30-50/vehicle/month + hardware ($500-1000 per vehicle) | $25-40/vehicle/month + gateway ($300-500) | $35-50/vehicle/month + dashcam ($500-800) | $30-45/vehicle/month + device ($300-600) | DriveCommand: Mock data (no hardware) for v2.0; software-only pricing model possible |

**DriveCommand Differentiation (Intelligence Layer):**
- **Mock-first approach:** Real database models + APIs with simulated telemetry (no hardware dependency for demo/validation/early adopters)
- **Built on v1.0 foundation:** Intelligence layer integrates with existing Truck/Driver/Route CRUD (not separate system)
- **Cost-effective intelligence:** Samsara-tier features without hardware lock-in, per-vehicle fees, or vendor contracts
- **Clear upgrade path:** Start with mock data (v2.0), validate features, then integrate real hardware (v2.2+) via API (Geotab, Samsara) vs selling hardware
- **Focus on foundational execution:** 2026 research emphasizes clean data and smart execution over AI automation hype

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

5. **Geofence events trigger correctly:**
   - Check GPS point against all geofences for tenant
   - Trigger entry alert only once (track last geofence state per truck)
   - Dwell time = duration between entry and exit events

### Seeder Strategy

**Phase 1 (P1 - Launch v2.0):** Seed on route status change
- When route → IN_PROGRESS: Start generating GPS points every 60s (background job or cron)
- When route → COMPLETED: Stop GPS, finalize fuel consumption, emit 0-3 safety events

**Phase 2 (P2 - v2.1):** Backfill historical data
- Generate last 30 days of completed routes with full telemetry
- Populate safety scores for all drivers
- Create fuel efficiency trends (weekly averages)

**Phase 3 (P3 - Real-time simulation):** Live updates
- Background job generates GPS points for all IN_PROGRESS routes every 60s
- Simulates "live" map updates without actual hardware
- WebSocket or polling for real-time UI updates

## Sources

**GPS Tracking & Map (2026 Research):**
- [Samsara GPS Fleet Tracking](https://www.samsara.com/products/telematics/gps-fleet-tracking) — 1-second updates, live map, traffic overlays
- [How Real-Time Fleet GPS Tracking Works (2026 U.S. Guide)](https://spacehawkgps.com/blogs/post/how-real-time-fleet-gps-tracking-works) — Update frequency standards
- [Next-Gen Fleet Management Trends Shaping 2026](https://www.accugps.com/post/next-gen-fleet-management-trends-shaping-2026) — Map clustering, smart overlays
- [Fleet Route Replay - GreenRoad](https://greenroad.com/solutions/route-replay/) — Trip replay features
- [Trip Replay - Geotab](https://support.geotab.com/help/mygeotab/fleet-activity/trips/trip-replay) — Timeline scrubber, playback speed
- [Fleet Management Dashboard Live Map View UI Patterns 2026](https://hicronsoftware.com/blog/fleet-management-dashboard-ui-design/) — Map as cornerstone, collapsible panels
- [Fleet Management Dashboards Explained for 2026](https://www.fanruan.com/en/blog/fleet-management-dashboard) — Information hierarchy, customization

**Geofencing (2026 Research):**
- [Geofencing in Fleet Management: Best Practices](https://gocodes.com/geofencing-fleet-management-best-practices/) — Polygonal vs radius, precision
- [Geofencing for Fleet Management 2026](https://www.simplyfleet.app/blog/how-geofencing-can-improve-fleet-management) — Alert configuration, focus on high-value areas
- [Why You Need Geofencing Fleet Management](https://www.mixtelematics.com/us/resources/blog/why-you-need-geofencing-fleet-management-mix-telematics/) — Entry/exit notifications, dwell time

**Vehicle Diagnostics:**
- [Fleet Vehicle Diagnostics - InSight Mobile Data](https://insightmobiledata.com/solutions/fleet-management-solutions/fleet-vehicle-diagnostics) — Engine hours, fuel, diagnostics monitoring
- [DEF Monitoring & Telematics - Intangles](https://www.intangles.ai/integrating-def-monitoring-with-telematics-for-enhanced-fleet-performance/) — DEF level tracking, EPA compliance
- [DTC Codes Guide - Lytx](https://www.lytx.com/blog/dtc-guide-everything-you-need-to-know-about-diagnostic-trouble-codes) — DTC structure, P0XXX codes
- [Harsh Event Detection - Samsara](https://kb.samsara.com/hc/en-us/articles/5321169919501-Harsh-Event-Detection) — Detection methods, thresholds

**Safety Dashboard (2026 Research):**
- [Driver Behavior Monitoring: Complete Fleet Safety Guide 2026](https://oxmaint.com/industries/fleet-management/driver-behavior-monitoring-complete-fleet-safety-guide-2026) — 20+ safety metrics, composite scoring, 55% accident reduction
- [How to use fleet safety analytics to improve driver safety](https://www.samsara.com/guides/fleet-safety-analytics) — Real-time alerts, coaching workflows
- [Defining Thresholds for Your Fleet](https://help.responsiblefleet.com/best-practice/defining-thresholds-for-your-fleet/) — Configurable g-force thresholds by vehicle class
- [Harsh Driving - Motive Help Center](https://helpcenter.gomotive.com/hc/en-us/articles/31054170471837-Harsh-Driving) — Detection sensitivity levels (High/Normal/Low)
- [Driver Scorecards - Geotab](https://www.geotab.com/blog/driver-scorecards/) — Leaderboard patterns, 30-day improvement observable

**Fuel & Energy (2026 Research):**
- [Top 10 Fleet Management KPIs to Track in 2026](https://oxmaint.com/industries/fleet-management/top-10-fleet-management-kpis-track-2026) — MPG as "north star" metric, 12-18% cost reduction in 90 days
- [Fuel Efficiency KPIs for Fleets](https://heavyvehicleinspection.com/blog/post/fuel-efficiency-kpis-for-fleets-mileage-idle-time-cost-km) — MPG, idle %, cost per km
- [Fleet Management Dashboards Explained for 2026](https://www.fanruan.com/en/blog/fleet-management-dashboard) — Donut charts transform to line graphs for trends, 15-Minute Rule
- [What is Compliance Hub? - Motive](https://helpcenter.gomotive.com/hc/en-us/articles/6162446181533-What-is-Compliance-Hub) — Donut charts for logs/inspections data

**ETA Sharing & Customer Tracking (2026 Research):**
- [Customer Tracking Links - Zeo Route Planner](https://zeorouteplanner.com/features/live-tracking/customer-tracking-links/) — Unique tracking links via SMS, no app required
- [Fleet Trip Share & Live ETA - FleetUp](https://fleetup.com/solutions/features/trip-sharing/) — Increased transparency, reduced wait times
- [ETA vs ETD: Real-Time Fleet Tracking](https://www.loginextsolutions.com/blog/eta-vs-etd-and-its-significance-in-real-time-fleet-tracking/) — Accurate ETA sharing reduces phone calls

**Dashboard & Visualization (2026 Research):**
- [Fleet Management Dashboard UI: A Design Guide](https://hicronsoftware.com/blog/fleet-management-dashboard-ui-design/) — Live map as cornerstone, collapsible panels, modular design
- [8+ Best Sidebar Menu Design Examples of 2025](https://www.navbar.gallery/blog/best-side-bar-navigation-menu-design-examples) — 240-300px expanded, 48-64px collapsed
- [Best UX Practices for Designing a Sidebar](https://uxplanet.org/best-ux-practices-for-designing-a-sidebar-9174ee0ecaa2) — Icon-based, hierarchical structure

**Anti-Features & Pitfalls (2026 Research):**
- [Fleet Management Challenges in 2026](https://www.frotcom.com/blog/2025/12/fleet-management-challenges-2026-5-errors-avoid) — Alert fatigue, data quality issues
- [5 Top Fleet Management Trends in 2026](https://www.utilimarc.com/blog/5-top-fleet-management-trends-in-2026) — AI amplifies human capability, not replaces it
- [The Quiet Shift: What Fleet Maintenance Really Looked Like in 2025](https://www.connixt.com/the-quiet-shift-what-fleet-maintenance-really-looked-like-in-2025/) — Smart maintenance is marathon, not sprint; clean data prerequisite

---
*Feature research for: DriveCommand Fleet Intelligence Layer (Milestone v2.0)*
*Researched: 2026-02-15*
*Confidence: HIGH (based on Samsara/Geotab/Motive/Verizon Connect 2026 patterns, EPA standards, fleet telematics industry research, official platform documentation)*
