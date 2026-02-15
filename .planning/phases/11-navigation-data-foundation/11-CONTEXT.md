# Phase 11: Navigation & Data Foundation - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current owner portal navigation with a Samsara-style collapsible sidebar. Create GPSLocation, SafetyEvent, and FuelRecord data models with RLS tenant isolation. Build idempotent mock data seed scripts generating 30 days of realistic fleet intelligence data for 20-30 trucks. Live map rendering, safety dashboards, and fuel dashboards are separate phases (12-14).

</domain>

<decisions>
## Implementation Decisions

### Sidebar visual style
- Company logo + company name at the top of the sidebar (collapses to logo icon when sidebar is collapsed)
- Claude's discretion on: dark vs light theme, collapse behavior (icon rail vs fully hidden), user profile/avatar placement, collapse animation

### Menu organization
- Grouped sections with section headers (not a flat list)
- Samsara-style grouping: Dashboard (top) → Fleet Intelligence (Live Map, Safety, Fuel) → Fleet Management (Trucks, Drivers, Routes) → Maintenance
- Claude's discretion on: whether Maintenance/Documents get standalone sidebar entries or stay nested in detail pages, whether section headers are collapsible or always visible

### Mock data characteristics
- Medium fleet size: 20-30 trucks with corresponding drivers
- 30-day time range for all GPS, safety, and fuel data
- GPS trails should follow real road networks — user prefers Google Maps data if feasible (researcher to evaluate: Google Maps Directions API, OSRM, or pre-built coordinate sets along real US highways/interstates)
- Seed script must be idempotent (safe to run multiple times) with a --reset flag to clear all mock data

### Navigation transition
- Claude's discretion on: whether to replace top nav entirely or keep a thin top bar for breadcrumbs/search, whether driver portal gets a sidebar or keeps current nav, mobile sidebar behavior (drawer overlay vs bottom tabs), whether system admin portal adopts sidebar pattern

### Claude's Discretion
- Sidebar theme (dark navy vs matching current app theme)
- Collapse behavior (icon rail vs fully hidden)
- User profile/avatar placement (bottom of sidebar vs keeping current UserMenu)
- Top nav fate (replace completely vs keep thin bar)
- Driver portal navigation approach
- System admin portal navigation approach
- Mobile sidebar pattern
- Section header collapsibility
- Maintenance/Documents sidebar placement

</decisions>

<specifics>
## Specific Ideas

- User wants GPS trails to use Google Maps or real road network data if possible — realism matters for the map experience
- Samsara is the primary reference for sidebar layout and grouping structure
- Company branding (logo + name) should be prominently placed at the top of the sidebar

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-navigation-data-foundation*
*Context gathered: 2026-02-15*
