---
phase: quick-105
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts
  - apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts
  - packages/api-client/src/driver.ts
  - apps/mobile/components/driver/StatusUpdateButton.tsx
  - apps/mobile/app/(driver)/loads/[id].tsx
  - apps/mobile/lib/offline-queue.ts
autonomous: true
must_haves:
  truths:
    - "Driver can revert DISPATCHED back to PENDING (PICKED_UP back to DISPATCHED in DB terms) via a Revert button with confirmation"
    - "Driver can revert IN_TRANSIT back to PICKED_UP/DISPATCHED via a Revert button with confirmation"
    - "Driver cannot revert from PENDING or terminal statuses"
    - "Driver can download and share rate confirmation PDF for loads in DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED status"
  artifacts:
    - path: "apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts"
      provides: "PATCH endpoint for reverting load status"
    - path: "apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts"
      provides: "GET endpoint returning base64 PDF"
    - path: "packages/api-client/src/driver.ts"
      provides: "revertLoadStatus and getRateConfirmation methods"
    - path: "apps/mobile/components/driver/StatusUpdateButton.tsx"
      provides: "Revert button with confirmation modal"
    - path: "apps/mobile/app/(driver)/loads/[id].tsx"
      provides: "Rate confirmation download/share button"
  key_links:
    - from: "StatusUpdateButton.tsx"
      to: "/api/mobile/driver/loads/[id]/revert"
      via: "driverApi.revertLoadStatus"
    - from: "loads/[id].tsx"
      to: "/api/mobile/driver/loads/[id]/rate-confirmation"
      via: "driverApi.getRateConfirmation"
---

<objective>
Add two features to the mobile driver load detail screen: (1) a Revert Status button allowing drivers to step back one status level (DISPATCHED->PENDING not allowed, only PICKED_UP->DISPATCHED and IN_TRANSIT->PICKED_UP), and (2) a Rate Confirmation PDF download/share button reusing the existing server-side PDF generation.

Purpose: Drivers need to correct accidental status advances and access rate confirmations on the go.
Output: Two new API routes, updated api-client, updated mobile components.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts (auth pattern, transaction pattern, driver status mapping)
@apps/web/src/app/(owner)/actions/rate-confirmation.tsx (PDF generation logic to reuse)
@apps/web/src/lib/pdf/rate-confirmation.tsx (RateConfirmationDocument component)
@packages/api-client/src/driver.ts (driverApi object to extend)
@apps/mobile/components/driver/StatusUpdateButton.tsx (current status button to add revert to)
@apps/mobile/app/(driver)/loads/[id].tsx (load detail screen to add PDF button to)
@apps/mobile/lib/api-with-queue.ts (callOrQueue pattern for offline support)
@apps/mobile/lib/offline-queue.ts (PendingMutation type — add REVERT_LOAD_STATUS)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create revert and rate-confirmation API routes + api-client methods</name>
  <files>
    apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts
    apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts
    packages/api-client/src/driver.ts
    apps/mobile/lib/offline-queue.ts
  </files>
  <action>
**1. Create `apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts`:**

Export a `PATCH` handler. Follow the exact same auth pattern as `status/route.ts`:
- Import `validateMobileToken`, `unauthorizedResponse` from `@/lib/auth/mobile-auth`
- Import `prisma`, `TX_OPTIONS` from `@/lib/db/prisma`
- Validate `auth.driverId` exists (403 if not)
- Use `params: Promise<{ id: string }>` pattern (await params)
- Inside a `prisma.$transaction` with `TX_OPTIONS`:
  - `SELECT set_config('app.bypass_rls', 'on', TRUE)` first
  - Fetch load by `{ id, tenantId }`, select `id, driverId, status`
  - Verify `load.driverId === driverId` (403 if not)
  - Define valid revert transitions (DB status -> previous DB status):
    - `DISPATCHED` -> `PENDING` is NOT allowed (return 400: "Cannot revert to Pending. Contact dispatch.")
    - `PICKED_UP` -> `DISPATCHED` (allowed)
    - `IN_TRANSIT` -> `PICKED_UP` (allowed)
    - All other statuses return 400: "Cannot revert from {status}"
  - Note: The mobile app maps DISPATCHED as "Accepted" and IN_TRANSIT as "En Route". PICKED_UP is also mapped to "En Route" in the UI. The revert allows going back one step.
  - Update load status, include customer and truck (same as status/route.ts)
  - Return `{ success: true, load: updatedLoad }`

No request body needed — the previous status is deterministic from current status.

**2. Create `apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts`:**

Export a `GET` handler. Same auth pattern as above.
- Validate driver auth and load ownership (same pattern)
- Inside transaction with bypass_rls:
  - Fetch load with same includes as `generateRateConfirmationPDF` uses: `customer: true`, `driver: { select: { firstName, lastName } }`, `truck: { select: { year, make, model, licensePlate } }`
  - Check status is in `['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']` (400 if not)
  - Replicate the data mapping logic from `apps/web/src/app/(owner)/actions/rate-confirmation.tsx` lines 41-79 (driverName, truckInfo, formatDate, RateConfirmationData)
  - Import `renderToBuffer` from `@react-pdf/renderer` and `RateConfirmationDocument`, `RateConfirmationData` from `@/lib/pdf/rate-confirmation`
  - Render PDF to buffer, convert to base64
  - Return `{ pdf: base64String, filename: "RateConfirmation-{loadNumber}.pdf" }`

**Important:** This route runs on the server (Next.js API route) where `@react-pdf/renderer` is available. The mobile app only receives the base64 string.

**3. Add methods to `packages/api-client/src/driver.ts`:**

Add to the `driverApi` object:
```typescript
revertLoadStatus: (token: string, id: string) =>
  apiRequest<{ success: boolean; load: LoadDetail }>(
    `/api/mobile/driver/loads/${id}/revert`,
    { method: 'PATCH', token }
  ),

getRateConfirmation: (token: string, id: string) =>
  apiRequest<{ pdf: string; filename: string }>(
    `/api/mobile/driver/loads/${id}/rate-confirmation`,
    { token }
  ),
```

**4. Update `apps/mobile/lib/offline-queue.ts`:**

Add `'REVERT_LOAD_STATUS'` to the `PendingMutation['type']` union type so the revert action can be queued offline.
  </action>
  <verify>
Run `npx tsc --noEmit` from the monorepo root to verify no type errors in the new routes and api-client changes. Verify the two new route files exist and export the correct HTTP method handlers.
  </verify>
  <done>
Two new API routes exist and type-check. The api-client exports `revertLoadStatus` and `getRateConfirmation` methods. PendingMutation type includes REVERT_LOAD_STATUS.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Revert button to StatusUpdateButton and Rate Confirmation button to load detail</name>
  <files>
    apps/mobile/components/driver/StatusUpdateButton.tsx
    apps/mobile/app/(driver)/loads/[id].tsx
  </files>
  <action>
**1. Update `apps/mobile/components/driver/StatusUpdateButton.tsx`:**

Add a revert capability alongside the existing forward status button.

Add a helper function `getRevertAction(dbStatus: string): { label: string } | null`:
- `DISPATCHED` -> null (cannot revert to Pending, that is owner-only)
- `PICKED_UP` -> `{ label: 'Revert to Accepted' }`
- `IN_TRANSIT` -> `{ label: 'Revert to En Route' }`
- All others -> null

Add state: `const [revertModalVisible, setRevertModalVisible] = useState(false)` and `const [isReverting, setIsReverting] = useState(false)`.

Add `handleRevert` function following the same pattern as `handleConfirm`:
- Use `callOrQueue('REVERT_LOAD_STATUS', ...)` with `driverApi.revertLoadStatus(token, load.id)` as the online call, method `'PATCH'`, body `{}`.
- On success: haptic feedback, invalidate same queries (driver-load, driver-loads, driver-dashboard), call `onStatusUpdated()`.
- On error: toast error message.
- Close modal and reset loading state in finally.

Render a secondary "Revert" button below the primary action button when `revertAction` is not null:
```jsx
{revertAction && (
  <Pressable
    onPress={() => setRevertModalVisible(true)}
    className="border border-amber-600/50 rounded-xl items-center active:bg-amber-900/20 mt-3"
    style={{ paddingVertical: 14, paddingHorizontal: 24 }}
  >
    <Text className="text-amber-500 text-base font-semibold">{revertAction.label}</Text>
  </Pressable>
)}
```

Add a second confirmation modal (same structure as existing, different colors/text):
- Title: "Confirm: {revertAction.label}"
- Warning text: "This will move the load back to its previous status."
- Amber-colored confirm button instead of sky blue (bg-amber-600, active:bg-amber-700)
- Same cancel button pattern

**2. Update `apps/mobile/app/(driver)/loads/[id].tsx`:**

Add a "Rate Confirmation" download/share button for eligible statuses.

Add imports:
- `import * as FileSystem from 'expo-file-system'`
- `import * as Sharing from 'expo-sharing'` — NOTE: `expo-sharing` is NOT in package.json yet. Before implementing, run `cd apps/mobile && npx expo install expo-sharing` to add it.
- `import { FileText } from 'lucide-react-native'` (for the button icon)
- `import Toast from 'react-native-toast-message'`

Add state: `const [isDownloadingPDF, setIsDownloadingPDF] = useState(false)`

Add `handleRateConfirmation` async function:
- Guard: `if (!token || isDownloadingPDF) return`
- Set loading true
- Try: call `driverApi.getRateConfirmation(token, load.id)`
- Write base64 to file: `FileSystem.writeAsStringAsync(FileSystem.documentDirectory + result.filename, result.pdf, { encoding: FileSystem.EncodingType.Base64 })`
- Share: `await Sharing.shareAsync(FileSystem.documentDirectory + result.filename, { mimeType: 'application/pdf', dialogTitle: 'Rate Confirmation' })`
- Catch: Toast error
- Finally: set loading false

Determine eligible statuses: `const canViewRateConfirmation = ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(load.status)`

Add the button inside the "Route Info Card" (the card at line 174), at the bottom after the flex-row of info fields, before the closing `</View>`:
```jsx
{canViewRateConfirmation && (
  <Pressable
    onPress={handleRateConfirmation}
    disabled={isDownloadingPDF}
    className="flex-row items-center justify-center border border-slate-600 rounded-lg py-3 mt-3 active:bg-slate-700/50"
  >
    {isDownloadingPDF ? (
      <ActivityIndicator size="small" color="#94a3b8" />
    ) : (
      <>
        <FileText color="#94a3b8" size={16} style={{ marginRight: 8 }} />
        <Text className="text-slate-300 font-medium text-sm">Rate Confirmation PDF</Text>
      </>
    )}
  </Pressable>
)}
```

Add `useState` to the React import if not already there (it is not — currently only `useCallback` is imported). Add `ActivityIndicator` to the react-native import.
  </action>
  <verify>
1. Run `cd apps/mobile && npx expo install expo-sharing` first if not already installed.
2. Run `npx tsc --noEmit` from monorepo root — no type errors.
3. Visual check: open load detail screen on Android emulator, verify Revert button appears for PICKED_UP/IN_TRANSIT loads, and Rate Confirmation button appears in the Route Info card for eligible statuses.
  </verify>
  <done>
- StatusUpdateButton shows a secondary amber "Revert" button with confirmation modal for PICKED_UP and IN_TRANSIT loads (not for DISPATCHED).
- Load detail screen shows a "Rate Confirmation PDF" button inside the Route Info card for DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED loads.
- Tapping Rate Confirmation fetches the PDF from the API, saves it locally, and opens the system share sheet.
- Revert uses callOrQueue for offline support.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors across the monorepo.
2. On Android emulator, navigate to a load in PICKED_UP or IN_TRANSIT status:
   - The primary forward status button still works as before.
   - A secondary amber "Revert" button appears below it.
   - Tapping Revert shows confirmation modal, confirming reverts the status.
3. On a load in DISPATCHED status, no Revert button appears (cannot revert to Pending).
4. On a load in DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED status, a "Rate Confirmation PDF" button appears in the Route Info card.
5. Tapping "Rate Confirmation PDF" fetches the PDF and opens the share sheet with the file.
</verification>

<success_criteria>
- Two new API routes respond correctly (revert returns updated load, rate-confirmation returns base64 PDF).
- Revert transitions: PICKED_UP->DISPATCHED and IN_TRANSIT->PICKED_UP work; DISPATCHED->PENDING is blocked with helpful message.
- Rate confirmation PDF generates and shares successfully on Android emulator.
- No TypeScript errors across the monorepo.
- Offline queue supports REVERT_LOAD_STATUS type.
</success_criteria>

<output>
After completion, create `.planning/quick/105-revert-status-rate-confirmation-pdf-on-m/105-SUMMARY.md`
</output>
