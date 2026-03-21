# Phase 28: Driver History - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Drivers can view their own completed loads and routes in the driver portal — read-only. History surfaces in the existing Load and Route tabs. No editing, no filtering by others, no new navigation items.

</domain>

<decisions>
## Implementation Decisions

### Where history lives
- Completed loads appear in the **Load tab** — active load card at top, "Past Loads" section below
- Completed routes appear in the **Route tab** — active route at top, completed routes list below
- No separate History tab in the bottom nav

### History scope
- Show **all** completed loads and routes for the driver (no date limit, no item cap)
- Scoped strictly to the logged-in driver (driverId + tenantId)

### Load card fields
- Claude's discretion on which fields to surface — keep it scannable and useful for a driver referencing a past delivery

### Interaction on tap
- Tapping a completed load or route **expands inline** — no navigation to a detail page
- Expanded view shows the full detail within the card

### Empty state
- Simple message with a small icon: e.g. "No completed loads yet" / "No completed routes yet"
- No suggested actions — drivers can't create loads/routes

### Access model
- Strictly read-only — no edit controls, no status updates
- Driver only sees their own history (not other drivers' loads/routes)

### Claude's Discretion
- Exact fields shown on load history cards
- Visual treatment of expanded inline card (height, animation, content layout)
- Skeleton/loading state design
- Ordering of history items (most recent first assumed)

</decisions>

<specifics>
## Specific Ideas

- No specific references — open to standard approaches that match the existing driver portal mobile-first design

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-driver-history*
*Context gathered: 2026-03-21*
