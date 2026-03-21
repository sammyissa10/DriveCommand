# Phase 31: Driver Core Screens - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the driver dashboard screen and the complete loads workflow: loads list (active + completed), load detail with multi-stop timeline, and status update flow. This is what drivers use for their core daily job. HOS, incidents, documents, and messaging are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Driver dashboard layout
- Top section: active load card (if any) — prominent, full width
- Middle section: today's snapshot row (miles today, stops completed, HOS hours remaining as 3 stat chips)
- Bottom section: recent alerts list (maintenance, document expiry, new messages)
- If no active load: empty state card with "No active load" + "View All Loads" button
- Pull-to-refresh on the entire screen

### Loads list
- Two tabs at top: "Active" (PENDING/ACCEPTED/EN_ROUTE) and "History" (DELIVERED/INVOICED/CANCELLED)
- FlashList (not FlatList) for performance
- Each card shows: load number, origin → destination (truncated), status badge, pickup date, customer name
- Tapping a card navigates to load detail screen
- Empty state per tab if no loads

### Load detail screen
- Header: load number + status badge
- Section: Route info (origin, destination, customer, pickup/delivery dates, rate)
- Section: Multi-stop timeline (vertical list of stops with status dots — pending=grey, arrived=blue, departed=green)
- Section: Assigned truck info
- Bottom: Status update button (context-aware — only shows valid next status)

### Status update flow
- Single button at bottom of load detail: "Accept Load" / "Start Route" / "Mark Delivered"
- Tapping opens a confirmation bottom sheet (not inline)
- Bottom sheet shows: action name, load number, brief summary
- Confirm button → API call → haptic success → screen refreshes
- Error state: toast with error message, button re-enabled

### Status progression (driver-facing)
- PENDING → "Accept Load" → ACCEPTED
- ACCEPTED → "Start Route" → EN_ROUTE
- EN_ROUTE → "Mark Delivered" → DELIVERED
- Drivers cannot cancel or invoice — owner-only actions

### REST endpoints needed (thin wrappers in apps/web/src/app/api/mobile/)
- GET /api/mobile/driver/loads — returns driver's loads (active + history)
- GET /api/mobile/driver/loads/[id] — load detail
- POST /api/mobile/driver/loads/[id]/status — update load status
- GET /api/mobile/driver/dashboard — dashboard data

### Claude's Discretion
- Exact card layout proportions
- Whether stop timeline uses connecting lines between stops
- Loading skeleton shape for load cards

</decisions>

<specifics>
## Specific Ideas

- The active load card on the dashboard should be the most prominent element — larger than everything else, with a clear visual hierarchy
- Status badges must match the web app's color scheme exactly (consistent brand experience)
- The status update button should feel weighty — this is a high-stakes action for a driver

</specifics>

<deferred>
## Deferred Ideas

- Load search/filter — future phase
- Load map view from load detail — future phase (would use Phase 36 map infrastructure)
- Driver rating/feedback on completion — future milestone

</deferred>

---

*Phase: 31-driver-core-screens*
*Context gathered: 2026-03-21*
