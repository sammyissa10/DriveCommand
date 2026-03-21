# Phase 32: Driver HOS + Incident Reporting - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the HOS (Hours of Service) duty status screen where drivers log their current status and view their daily log, and the incident reporting screen where drivers submit incident reports with optional photo evidence. These are two distinct screens added to the existing driver tab navigator.

</domain>

<decisions>
## Implementation Decisions

### HOS screen layout
- Current status displayed prominently at the top (large badge + time in current status)
- Status selector: 4 large tappable cards in a 2×2 grid (Off Duty, Sleeper Berth, Driving, On Duty)
- Active status card: highlighted with brand blue border
- Daily log section below: visual 24-hour bar showing status periods as colored segments
- Clock section: 14-hour clock countdown + 11-hour driving clock countdown
- Changing status requires confirmation (same confirmation bottom sheet pattern as status updates)

### HOS status colors
- Off Duty: slate grey
- Sleeper Berth: purple
- Driving: green
- On Duty (not driving): blue

### Daily log bar
- Simple horizontal bar representing 24 hours
- Each segment colored by HOS status for that time period
- Current time indicated by a vertical line
- No interactive — display only in v1

### HOS clocks
- 14-hour clock: starts from first on-duty or driving entry of the day
- 11-hour driving: only driving time
- Display as HH:MM:SS countdown
- Alert color (red) when under 2 hours remaining

### Incident report form
- Category: dropdown/select (Accident, Violation, Mechanical Issue, Hazard, Other)
- Severity: 3-button toggle (Low / Medium / High) — not a dropdown
- Description: multiline TextInput (min 3 lines, max 500 chars with counter)
- Date/time: auto-filled with current time, not editable by driver in v1
- Location: auto-filled from GPS, shown as "Lat: X, Lon: Y" (not address in v1)
- Photo: optional — tap button to open action sheet (Camera / Photo Library / Skip)
- Submit button at bottom

### Photo handling
- Max 1 photo per incident in v1
- Compressed before upload: max 1024px width, quality 0.7
- Shows thumbnail preview after selection with ✕ remove button
- Upload to S3 via existing multipart API on submit

### REST endpoints needed
- GET /api/mobile/driver/hos — today's HOS entries + calculated clocks
- POST /api/mobile/driver/hos — create new HOS entry (status change)
- POST /api/mobile/driver/incidents — submit incident report

### Claude's Discretion
- Exact 24-hour bar rendering approach (SVG vs View segments)
- Clock countdown implementation (setInterval vs date-fns diff)
- Whether to show historical HOS logs (prior days) — leave for future

</decisions>

<specifics>
## Specific Ideas

- The 4 status cards should be large enough to tap easily with work gloves on — minimum 80px tall each
- The severity toggle (Low/Medium/High) should visually match traffic light colors (green/yellow/red)

</specifics>

<deferred>
## Deferred Ideas

- FMCSA-compliant ELD integration — separate milestone (requires hardware)
- HOS violation detection and alerts — future phase
- Multi-day HOS log history — future phase
- Incident list/history for drivers — future phase

</deferred>

---

*Phase: 32-driver-hos-incidents*
*Context gathered: 2026-03-21*
