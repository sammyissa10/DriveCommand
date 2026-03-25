---
phase: 36-owner-map-fleet
plan: 02b
type: execute
wave: 2
depends_on: ["36-02a"]
files_modified:
  - apps/mobile/components/owner/RecipientSelector.tsx
  - apps/mobile/app/(owner)/fleet.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can compose and send a message to a specific driver"
    - "Owner can broadcast a message to all drivers"
    - "Owner can view sent message history with recipient names and timestamps"
    - "Pre-selecting a driver from driver detail screen populates the compose form"
    - "Character counter shows remaining characters (max 500)"
    - "Send button shows loading state and disables during send"
  artifacts:
    - path: "apps/mobile/components/owner/RecipientSelector.tsx"
      provides: "Bottom sheet with All Drivers option and individual driver list"
    - path: "apps/mobile/app/(owner)/fleet.tsx"
      provides: "Fleet messaging screen with compose and history views"
  key_links:
    - from: "apps/mobile/app/(owner)/fleet.tsx"
      to: "/api/mobile/owner/fleet/messages"
      via: "ownerApi.getFleetMessages and ownerApi.sendFleetMessage"
      pattern: "ownerApi\\.(getFleetMessages|sendFleetMessage)"
    - from: "apps/mobile/app/(owner)/fleet.tsx"
      to: "apps/mobile/components/owner/RecipientSelector.tsx"
      via: "import RecipientSelector"
      pattern: "import.*RecipientSelector"
    - from: "apps/mobile/app/(owner)/fleet.tsx"
      to: "/api/mobile/owner/drivers/active"
      via: "ownerApi.getActiveDrivers for recipient list"
      pattern: "ownerApi\\.getActiveDrivers"
---

<objective>
Build the fleet messaging UI: compose form with recipient selector, sent message history list, and pre-select driver navigation integration.

Purpose: Give fleet owners a simple way to communicate with drivers individually or broadcast to all from the mobile app.
Output: Working fleet tab with compose/history toggle, recipient selector bottom sheet, and message sending.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/36-owner-map-fleet/36-02a-SUMMARY.md
@packages/api-client/src/owner.ts
@apps/mobile/app/(owner)/fleet.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build RecipientSelector bottom sheet component</name>
  <files>
    apps/mobile/components/owner/RecipientSelector.tsx
  </files>
  <action>
Create RecipientSelector.tsx — a bottom sheet for selecting message recipients.

Props:
- visible: boolean
- onSelect: (recipient: { id: string | null, name: string, isBroadcast: boolean }) => void
- onClose: () => void
- drivers: DriverOption[] (from ownerApi.getActiveDrivers)

Content:
- Sheet header: "Select Recipient" with close (X) button
- "All Drivers" option at top (always shown) — renders with a broadcast/megaphone icon
  - onSelect({ id: null, name: 'All Drivers', isBroadcast: true })
- Divider
- List of active drivers below (FlatList or ScrollView)
  - Each row: driver name, radio-style single-select
  - onSelect({ id: driver.id, name: driver.name, isBroadcast: false })
- Single-select behavior (tapping one selects it and dismisses sheet)
- Use absolute-positioned overlay (or @gorhom/bottom-sheet if available) consistent with VehicleDetailSheet pattern from 36-01
  </action>
  <verify>
TypeScript compiles: `cd apps/mobile && npx tsc --noEmit`
Component exports default and accepts visible, onSelect, onClose, drivers props.
  </verify>
  <done>
RecipientSelector renders as a bottom sheet with "All Drivers" broadcast option and individual driver list. Single-select behavior dismisses on selection.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build fleet messaging screen with compose and history views</name>
  <files>
    apps/mobile/app/(owner)/fleet.tsx
  </files>
  <action>
REPLACES existing apps/mobile/app/(owner)/fleet.tsx (if it exists as a placeholder or basic screen).

Two-panel view with toggle at top:

**Toggle bar:**
- Two buttons: "Compose" | "History"
- Active tab has primary color background, inactive has muted
- Default to "Compose" view

**Compose panel:**
- Recipient field: pressable area showing selected recipient name (or "Select recipient..." placeholder)
  - Press opens RecipientSelector bottom sheet
  - After selection: show recipient chip (name with X button to clear)
- Message textarea: multiline TextInput, 4 lines visible, maxLength 500
  - Character counter below: "X / 500" — changes to warning color at 450+
- Send button: full width, primary color, disabled when no recipient or empty body
  - Loading state: shows ActivityIndicator, disabled during send
  - Uses useMutation with ownerApi.sendFleetMessage
  - On success: show "Message sent!" toast (Alert.alert or custom toast), clear form (reset recipient + body), invalidate fleet-messages query
  - On error: show error toast

**History panel:**
- useQuery with ownerApi.getFleetMessages, queryKey ['fleet-messages']
- FlashList of sent messages, each row:
  - recipientName (bold) — or "All Drivers" with broadcast icon for broadcasts
  - message body preview (truncated to ~80 chars)
  - timestamp (relative: "5 min ago", "2h ago", etc.)
- Tap a row: show full message in an Alert or simple detail modal (id, full body, recipient, timestamp)
- Pull-to-refresh: onRefresh → refetch query
- Empty state: "No messages sent yet" centered text

**Pre-selected driver from driver detail:**
```typescript
const { driverId } = useLocalSearchParams()
```
- If driverId present on mount: fetch driver name from ownerApi.getActiveDrivers list, pre-select that driver as recipient, ensure Compose view is active
- Use useEffect with driverId dependency

**Data fetching:**
- Active drivers for RecipientSelector: useQuery ownerApi.getActiveDrivers (already exists in api-client)
- Fleet messages for history: useQuery ownerApi.getFleetMessages
- Send message: useMutation ownerApi.sendFleetMessage
  </action>
  <verify>
TypeScript compiles: `cd apps/mobile && npx tsc --noEmit`
fleet.tsx imports RecipientSelector, uses ownerApi.getFleetMessages and ownerApi.sendFleetMessage.
  </verify>
  <done>
Fleet screen has compose/history toggle. Compose allows selecting recipient (individual or broadcast) and sending messages with character counter and loading state. History shows sent messages with pull-to-refresh. Pre-selected driver from driver detail navigates correctly.
  </done>
</task>

</tasks>

<verification>
- [ ] Fleet tab shows compose and history toggle
- [ ] Compose: selecting "All Drivers" and sending creates broadcast message
- [ ] Compose: selecting individual driver creates targeted message
- [ ] Push notification delivered to driver's device after send
- [ ] History shows sent messages in order
- [ ] History pull-to-refresh works
- [ ] Pre-selected driver from driver detail screen works
- [ ] Message character counter works
- [ ] Send button shows loading state and disables during send
</verification>

<success_criteria>
Owner can compose messages to individual drivers or broadcast to all, view sent message history, and navigate from driver detail with pre-selected recipient.
</success_criteria>

<output>
After completion, create `.planning/phases/36-owner-map-fleet/36-02b-SUMMARY.md`
</output>
