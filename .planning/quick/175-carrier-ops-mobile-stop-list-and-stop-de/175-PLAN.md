---
phase: quick-175
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/app/(driver)/carrier/dispatch/[id]/index.tsx
  - apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx
  - apps/mobile/components/carrier/StopListItem.tsx
  - apps/mobile/components/carrier/StopStatusButtons.tsx
autonomous: true
must_haves:
  truths:
    - "Driver can see all stops for a dispatch ordered by sequence_order"
    - "Driver can tap a stop to see full detail (facility, contact, docs)"
    - "Driver can mark a stop as arrived when status is pending"
    - "Driver can complete a stop when status is arrived and required docs uploaded"
    - "Driver sees disabled Complete button with warning when required docs missing"
    - "Driver can open facility address in preferred navigation app"
    - "Driver can tap phone number to initiate call"
  artifacts:
    - path: "apps/mobile/app/(driver)/carrier/dispatch/[id]/index.tsx"
      provides: "Dispatch detail with stop list screen"
    - path: "apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx"
      provides: "Stop detail screen with status actions"
    - path: "apps/mobile/components/carrier/StopListItem.tsx"
      provides: "Reusable stop list row component"
    - path: "apps/mobile/components/carrier/StopStatusButtons.tsx"
      provides: "Arrived and Complete action buttons"
  key_links:
    - from: "dispatch/[id]/index.tsx"
      to: "carrierDriverApi.getDispatchDetail"
      via: "TanStack Query"
      pattern: "useQuery.*getDispatchDetail"
    - from: "StopStatusButtons.tsx"
      to: "carrierDriverApi.markStopArrived / completeStop"
      via: "useMutation"
      pattern: "useMutation.*markStopArrived|completeStop"
---

<objective>
Build the carrier ops stop list and stop detail screens for the driver mobile portal.

Purpose: Drivers need to view their dispatch stops in order, navigate to facilities, and mark stops as arrived/completed with document enforcement.
Output: 4 new files — dispatch detail screen, stop detail screen, StopListItem component, StopStatusButtons component.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/(driver)/carrier/index.tsx
@apps/mobile/app/(driver)/carrier/_layout.tsx
@packages/api-client/src/carrier-driver.ts
@apps/mobile/lib/navigation.ts
@apps/mobile/constants/tokens.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: StopListItem component and dispatch detail screen with stop list</name>
  <files>
    apps/mobile/components/carrier/StopListItem.tsx
    apps/mobile/app/(driver)/carrier/dispatch/[id]/index.tsx
  </files>
  <action>
Create `apps/mobile/components/carrier/StopListItem.tsx`:
- Props: `stop: CarrierDispatchStop` (from `@drivecommand/api-client`), `isActive: boolean`, `onPress: () => void`.
- Layout: Row with left sequence number badge (circle, 24x24, centered number), middle column (facility name bold, facility city+state secondary text, appointment time if set formatted as "Mon DD, h:mm AM"), right side with status badge and doc indicator.
- Stop type icon: Use lucide-react-native icons — `Package` for pickup, `MapPin` for delivery, `Fuel` for fuel. Place next to facility name.
- Status badge colors: pending = gray (`mutedBg`/`textTertiary`), arrived = blue (`infoBg`/`info`), completed = green (`successBg`/`success`), skipped = red (`dangerBg`/`danger`). Badge text = capitalize(status).
- Document indicator: If `bolRequired && !bolUploaded` OR `podRequired && !podUploaded` show small red dot (8x8 circle, `danger` color). If all required docs uploaded, show green checkmark icon (8px, `success`). If no docs required, show nothing.
- When `isActive` is true: add left border (3px, `brand` color) and subtle brand background tint (`rgba(14,165,233,0.06)`).
- Use `useThemeColors()` for all colors. Use `Pressable` with `accessibilityRole="button"`.

Create `apps/mobile/app/(driver)/carrier/dispatch/[id]/index.tsx`:
- Use TanStack Query: `useQuery({ queryKey: ['carrier-dispatch', id], queryFn: () => carrierDriverApi.getDispatchDetail(token!, id) })`. Import `CarrierDispatchDetail` type.
- Header section: Back button (ChevronLeft icon, `router.back()`), dispatch number (`dispatchNumber` from API), status badge (same color scheme as home screen — planned=gray, in_progress=blue, completed=green), truck unit number + scheduled departure formatted.
- Progress bar: Calculate completed stops (`status === 'completed'`). Show "X of Y stops completed" text + progress bar (same style as carrier home screen — track with fill).
- Stop list: Use `FlashList` with `estimatedItemSize={72}`. Data = `dispatch.stops` sorted by `sequenceOrder` (they should come sorted, but enforce with `.sort((a,b) => a.sequenceOrder - b.sequenceOrder)`).
- Determine active stop: first stop where `status !== 'completed' && status !== 'skipped'`. Pass `isActive={stop.id === activeStopId}` to each StopListItem.
- Tap navigates to `/carrier/dispatch/${id}/stop/${stop.id}`.
- Pull-to-refresh via `RefreshControl` on the FlashList.
- Loading state: skeleton cards (same pattern as carrier home — 3 skeleton rectangles).
- Wrap in `AnimatedScreen` and `SafeAreaView`.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/mobile/tsconfig.json` — no errors in new files. Visually inspect: dispatch detail shows header + progress + sorted stop list.</verify>
  <done>Dispatch detail screen renders stop list ordered by sequence_order with active stop highlighted, progress bar, and navigation to stop detail on tap.</done>
</task>

<task type="auto">
  <name>Task 2: StopStatusButtons component and stop detail screen</name>
  <files>
    apps/mobile/components/carrier/StopStatusButtons.tsx
    apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx
  </files>
  <action>
Create `apps/mobile/components/carrier/StopStatusButtons.tsx`:
- Props: `stop: CarrierDispatchDetailStop` (from `@drivecommand/api-client`), `token: string`, `dispatchId: string`, `onSuccess: () => void`.
- Uses `useMutation` from TanStack Query for both actions. On success: invalidate `['carrier-dispatch', dispatchId]` query, call `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`, call `onSuccess()`.
- "Arrived" button: Visible only when `stop.status === 'pending'`. Blue background (`info` color), white text. Shows `ActivityIndicator` while loading. Calls `carrierDriverApi.markStopArrived(token, stop.id)`.
- "Complete Stop" button: Visible only when `stop.status === 'arrived'`. Green background (`success` color), white text.
  - Disable logic: If `stop.bolRequired && !stop.bolUploaded` → disabled with red warning "Upload BOL first". If `stop.podRequired && !stop.podUploaded` → disabled with red warning "Upload POD first". Show both warnings if both missing.
  - When disabled: button opacity 0.5, not pressable. Warning text below button in `danger` color, fontSize 12.
  - Calls `carrierDriverApi.completeStop(token, stop.id)`.
  - On error: Check if response status is 422. Parse error message from response body. Show toast via `Alert.alert('Cannot Complete', errorMessage)`. Never show generic error — always surface the API's error string.
- Both buttons: full-width, height 48, borderRadius 10, fontWeight '600', fontSize 16.
- Import `* as Haptics from 'expo-haptics'`. Use `useThemeColors()`.

Create `apps/mobile/app/(driver)/carrier/dispatch/[id]/stop/[stopId].tsx`:
- Route params: `id` (dispatch ID) and `stopId`. Use `useLocalSearchParams<{ id: string; stopId: string }>()`.
- Data: Use the parent dispatch query `useQuery({ queryKey: ['carrier-dispatch', id], queryFn: ... })` and find the stop by `stopId` from `dispatch.stops`. This avoids an extra API call and shares cache.
- If stop not found, show error text and back button.
- Layout (ScrollView):
  1. **Header**: Back button (ChevronLeft, `router.back()`). Stop type label ("Pickup" / "Delivery" / "Fuel Stop") with icon. Sequence badge.
  2. **Facility section**: Facility name (fontSize 20, fontWeight '700'). Full address: `addressLine1, city, state zip`. "Open in Maps" button — calls `openNavigation({ lat: facility.latitude, lng: facility.longitude, address: fullAddressString })` from `@/lib/navigation`. Style: outlined button with MapPin icon, brand color.
  3. **Contact section**: If contactName or contactPhone present. Contact name (textPrimary). Phone as tappable link — `Linking.openURL('tel:${contactPhone}')` with Phone icon. Style phone in brand color.
  4. **Details section**: Show if any of these exist: `specialInstructions`, `bolNumber`, `podNumber`, `sealNumber`, `appointmentStart`/`appointmentEnd`. Render as label-value pairs. Appointment window formatted as "Mon DD h:mm AM - h:mm AM".
  5. **StopStatusButtons**: Pass the stop, token, dispatchId. `onSuccess` navigates back: `router.back()`.
  6. **Documents section**: Header "Documents" with count. If `stop.documents.length > 0`, render compact list (filename + type + date). Upload button (Camera icon + "Upload Document") — for now just `Alert.alert('Coming Soon', 'Document upload will be available soon.')`.
  7. **Expense Log button**: Full-width outlined button "Log Expense" — for now `Alert.alert('Coming Soon', 'Expense logging will be available soon.')`.
- Use `AnimatedScreen`, `SafeAreaView`, `useThemeColors()`.
- Import `* as Linking from 'expo-linking'`.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/mobile/tsconfig.json` — no errors. Visually inspect: stop detail shows facility info, contact, status buttons with correct enable/disable logic, document list, and placeholder buttons.</verify>
  <done>Stop detail screen renders all facility/contact/detail info, status buttons enforce document requirements, "Open in Maps" and phone tap work, haptic feedback fires on successful status changes, 422 errors display exact API message.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` passes with no errors in new files
- Dispatch detail at `/carrier/dispatch/[id]` shows header, progress bar, and stop list sorted by sequence_order
- Active stop is visually highlighted with brand accent
- Stop detail at `/carrier/dispatch/[id]/stop/[stopId]` shows full facility info
- Arrived button appears only for pending stops, Complete button only for arrived stops
- Complete button disabled with warning when required docs missing
- Open in Maps launches navigation app
- Phone number tap initiates call
- Haptics fire on successful Arrived and Complete actions
</verification>

<success_criteria>
All 4 files created and type-check clean. Driver can navigate from dispatch list -> dispatch detail (stop list) -> stop detail, mark stops arrived/completed with proper doc enforcement and haptic feedback.
</success_criteria>

<output>
After completion, create `.planning/quick/175-carrier-ops-mobile-stop-list-and-stop-de/175-SUMMARY.md`
</output>
