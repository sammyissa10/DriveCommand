# Phase 36: Owner Map + Fleet Communication - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the live map screen showing real-time vehicle positions using react-native-maps (replaces web Leaflet), and the fleet communication screen where owners compose and send messages to individual drivers or broadcast to all. These are the last two owner portal screens.

</domain>

<decisions>
## Implementation Decisions

### Live map
- react-native-maps (Google Maps on Android, Apple Maps on iOS — both free for this use case)
- Vehicle markers: custom callout with truck number + driver name
- Marker colors: green = moving (speed > 5 mph), yellow = idle (GPS ping but speed ≈ 0), grey = offline (last ping > 10 min ago)
- Tap a marker → vehicle detail bottom sheet (same data as web: truck name, driver, speed, fuel, odometer)
- Map auto-fits all vehicles on initial load (fitToCoordinates)
- Refresh button (top right) to manually refresh positions
- Auto-refresh: every 60 seconds (same data as web, which is 30s — mobile uses 60s to save battery)
- No clustering in v1 — most fleets have < 50 trucks, clustering adds complexity

### Map initial state
- If no vehicles: centered on USA with zoom showing full country
- If vehicles exist: fitToCoordinates with padding 50px
- Map type: standard (not satellite) by default

### Fleet communication
- Compose screen: recipient select (individual driver or "All Drivers"), message body textarea, send
- Sent messages list: FlashList of sent messages (by this owner), each showing recipient, preview, timestamp
- No threading in v1 — just a simple send log
- Sending a message triggers push notification to recipient driver(s) (already wired from Phase 33-02)

### Fleet communication navigation
- Owner's Fleet tab (5th tab) shows the messaging interface
- Two views within the Fleet tab: Compose (form) and History (sent list)
- Toggle at top: "Compose" | "History"

### REST endpoints needed
- GET /api/mobile/owner/fleet/messages — owner's sent message history
- POST /api/mobile/owner/fleet/messages — send new message (triggers push)
- GET /api/mobile/owner/drivers/active — already created in Phase 35 (reuse)

### Claude's Discretion
- Whether to use react-native-maps default or custom map style (dark mode map)
- Exact vehicle detail bottom sheet layout
- Whether map has a "locate me" button (owner's location, probably not needed)

</decisions>

<specifics>
## Specific Ideas

- The map should feel like the web app's live map — same color coding, same data — just on a phone
- Try to use a dark map style to match the app's dark theme (react-native-maps supports custom map styles on Android via Google Maps JSON style)

</specifics>

<deferred>
## Deferred Ideas

- Map clustering — future phase when fleet grows > 50 trucks
- Route trail visualization on mobile map — future phase
- Geofence alerts from mobile map — future phase
- Satellite view toggle — future phase

</deferred>

---

*Phase: 36-owner-map-fleet*
*Context gathered: 2026-03-21*
