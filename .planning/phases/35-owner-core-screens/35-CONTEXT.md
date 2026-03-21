# Phase 35: Owner Core Screens - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the three primary owner portal screens: dashboard with fleet KPIs, loads management (view + create + assign), and driver management (view status + compliance). These are the screens an owner uses to run their fleet from their phone. Map and messaging are Phase 36.

</domain>

<decisions>
## Implementation Decisions

### Owner dashboard layout
- Top: 4 KPI cards in 2×2 grid (Active Loads, Drivers On Duty, Revenue This Month, Open Alerts)
- Middle: "Active Loads" section — compact list of top 5 active loads (load number, driver, status badge)
- Bottom: "Driver Status" grid — all drivers as small cards (name, status dot, assigned load number or "No load")
- Pull-to-refresh

### KPI card style
- Each card: large number (H1 size), label below (Muted), icon top-right
- Background: bg-slate-800, border: border-slate-700
- No interactive (tap does nothing) — display only

### Loads management layout
- Status filter tabs: All / Active / Pending / Delivered (horizontal scrollable tabs)
- FlashList of load cards
- Each card: load number, customer, origin → destination, driver name (or "Unassigned"), status badge, rate
- FAB: + icon → create load bottom sheet
- Tapping a card → load detail screen (owner can update any load)

### Create load form (bottom sheet)
- Customer: searchable select (from CRM customers)
- Origin, Destination: TextInput fields
- Pickup date: date picker
- Rate: numeric input (with $ prefix)
- Assign driver: optional select (list of active drivers)
- Submit creates load in PENDING status

### Owner load detail
- Same as driver load detail but with MORE actions
- Owner can: assign driver, update status (any transition), cancel load
- Edit button → full edit form bottom sheet
- No inline edit — separate form

### Driver management layout
- FlashList of driver cards
- Each card: avatar initials, name, status badge (Active/Inactive), current load (or "No active load"), compliance status icon (green/yellow/red dot)
- Compliance dot: red if any expired docs, yellow if any expiring, green otherwise
- Tapping → driver detail screen

### Driver detail screen
- Header: avatar, name, status badge
- Current load card (if assigned)
- Compliance section: list of documents with expiry status
- Contact section: email, phone with tap-to-call (tel:) and tap-to-email (mailto:)
- "Send Message" button → navigates to fleet messaging compose (Phase 36)

### REST endpoints needed
- GET /api/mobile/owner/dashboard
- GET /api/mobile/owner/loads?status=
- GET /api/mobile/owner/loads/[id]
- POST /api/mobile/owner/loads (create)
- PATCH /api/mobile/owner/loads/[id] (update status/assign)
- GET /api/mobile/owner/drivers
- GET /api/mobile/owner/drivers/[id]

### Claude's Discretion
- Revenue this month calculation (gross load rates for delivered loads)
- Exact compliance status algorithm for the dot color
- Whether to support inline driver status toggle (Active/Inactive) from the driver card

</decisions>

<specifics>
## Specific Ideas

- The dashboard should feel like a command center — at a glance, an owner should know if anything needs attention
- The driver status grid is inspired by Samsara's driver view — compact cards showing who's on duty

</specifics>

<deferred>
## Deferred Ideas

- Full load edit form — owner can change any field (deferred to simplify v1, status change is enough)
- Driver invite from mobile — desktop workflow
- Truck management from mobile — desktop workflow (too many fields)
- Payroll from mobile — complex multi-step, desktop only

</deferred>

---

*Phase: 35-owner-core-screens*
*Context gathered: 2026-03-21*
