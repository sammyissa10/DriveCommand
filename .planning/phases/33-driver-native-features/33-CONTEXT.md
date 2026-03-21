# Phase 33: Driver Native Features - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the three native device capabilities that make the driver app indispensable: background GPS reporting to the existing backend, push notifications for dispatch and HOS alerts, and an offline mutation queue that buffers changes when the driver has no signal. These are platform-native features that cannot be done in a web browser.

</domain>

<decisions>
## Implementation Decisions

### Background GPS
- Reports to existing /api/gps/report endpoint — no backend changes needed
- Interval: 30 seconds when HOS status is DRIVING or ON_DUTY
- Interval: 5 minutes when HOS status is OFF_DUTY or SLEEPER_BERTH
- Stops reporting when app is force-killed (resumes on next app open)
- Permission flow: explain screen → foreground permission → background permission (two-step Apple requirement)
- Battery optimization: check battery level (expo-battery), drop to 10-min interval below 20% battery
- GPS status indicator in driver tab bar header (small colored dot, green=active, grey=paused/off)

### Push notifications
- One new DB table: PushToken (id, userId, token, platform, updatedAt)
- One new endpoint: POST /api/push-tokens (upsert by userId + platform)
- Notification types in v1: new fleet message, load status change (owner changes), document expiry alert
- Notification tap: deep-link to relevant screen (message → messages tab, load change → loads tab, doc → documents tab)
- Permission request: asked once on first login, after explaining what notifications are used for
- No scheduling of local notifications in v1 — all push come from server

### Offline queue
- MMKV-backed array of PendingMutation objects
- PendingMutation: { id: string, type: string, endpoint: string, method: string, body: string, timestamp: number, retryCount: number }
- Queue in v1 covers: updateLoadStatus, createHOSEntry, createIncident (the three driver write actions)
- Flush on reconnect: NetInfo isConnected transition false→true
- Max retries: 3 per mutation (exponential backoff: 1s, 2s, 4s)
- After 3 failures: mark as FAILED, show to driver as "X updates failed — tap to retry"
- Sync status bar: shows below the header when offline ("Offline — X updates pending") or syncing ("Syncing...")
- Disappears when all synced and online

### Claude's Discretion
- Exact GPS background task implementation details (expo-task-manager specifics)
- Battery API usage for adaptive reporting interval
- Whether to use Expo's built-in notification categories or custom handling

</decisions>

<specifics>
## Specific Ideas

- The offline sync status bar should be non-intrusive but clearly visible — a thin bar below the screen header, not a modal or blocking UI
- Background GPS should continue even when the phone is locked — this requires iOS background modes being correctly configured in app.json (already done in Phase 29)

</specifics>

<deferred>
## Deferred Ideas

- Geofence-based auto-arrive (already on web, needs mobile adaptation) — Phase 36 scope expansion
- Local scheduled notifications (HOS warnings at X hours remaining) — future phase
- Background fetch for message polling — current polling approach sufficient for v1

</deferred>

---

*Phase: 33-driver-native-features*
*Context gathered: 2026-03-21*
