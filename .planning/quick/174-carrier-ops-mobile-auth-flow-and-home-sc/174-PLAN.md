---
phase: quick-174
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/api-client/src/carrier-driver.ts
  - packages/api-client/src/index.ts
  - apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts
  - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts
  - apps/mobile/app/(driver)/carrier/index.tsx
  - apps/mobile/app/(driver)/carrier/_layout.tsx
  - apps/mobile/app/(driver)/_layout.tsx
autonomous: true
must_haves:
  truths:
    - "Driver sees active dispatches (in_progress) and upcoming dispatches (planned) on the Carrier home screen"
    - "Driver can tap a dispatch card (navigation target /carrier/dispatch/[id] — screen built in future task)"
    - "A 'Dispatch' tab appears in the driver bottom tab navigator"
    - "API returns only dispatches where the authenticated user is primary or co-driver"
    - "Pull-to-refresh works on the dispatch list"
  artifacts:
    - path: "apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts"
      provides: "GET list of driver dispatches"
      exports: ["GET"]
    - path: "apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts"
      provides: "GET dispatch detail"
      exports: ["GET"]
    - path: "packages/api-client/src/carrier-driver.ts"
      provides: "Typed carrier driver API client"
      exports: ["carrierDriverApi"]
    - path: "apps/mobile/app/(driver)/carrier/index.tsx"
      provides: "Carrier dispatch home screen"
    - path: "apps/mobile/app/(driver)/carrier/_layout.tsx"
      provides: "Carrier stack navigator layout"
  key_links:
    - from: "apps/mobile/app/(driver)/carrier/index.tsx"
      to: "packages/api-client/src/carrier-driver.ts"
      via: "carrierDriverApi.getMyDispatches(token)"
      pattern: "carrierDriverApi\\.getMyDispatches"
    - from: "packages/api-client/src/carrier-driver.ts"
      to: "/api/mobile/carrier/driver/dispatches"
      via: "apiRequest"
      pattern: "apiRequest.*carrier/driver/dispatches"
    - from: "apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts"
      to: "prisma.carrierDriver + prisma.carrierDispatch"
      via: "Prisma queries with bypass_rls"
      pattern: "carrierDriver\\.findFirst|carrierDispatch\\.findMany"
---

<objective>
Create the carrier ops mobile API endpoints (dispatches list + detail), typed API client, and driver-facing home screen with tab navigation.

Purpose: Enables carrier drivers to see their assigned dispatches in the mobile app — the foundation for all subsequent carrier mobile features (stop actions, documents, expenses).
Output: Two API routes, one api-client module, one mobile screen, one layout, and a new tab in the driver navigator.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/auth/mobile-auth.ts (validateMobileToken pattern — returns userId, tenantId, role, driverId)
@apps/web/src/app/api/mobile/driver/loads/route.ts (reference: existing mobile API route pattern with bypass_rls)
@packages/api-client/src/client.ts (apiRequest utility)
@packages/api-client/src/driver.ts (reference: existing api-client pattern)
@packages/api-client/src/index.ts (barrel export — add carrierDriverApi here)
@apps/mobile/app/(driver)/_layout.tsx (driver tab navigator — add Dispatch tab)
@apps/web/src/generated/prisma/schema.prisma (CarrierDriver, CarrierDispatch, CarrierStop, CarrierDocument, CarrierExpense, CarrierFacility models)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Carrier driver mobile API routes (dispatches list + detail)</name>
  <files>
    apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts
    apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts
  </files>
  <action>
**GET /api/mobile/carrier/driver/dispatches** (list route):

1. Validate Bearer token via `validateMobileToken(req)`. Return 401 if null. Return 403 if role !== 'DRIVER'.
2. Apply rate limiting via `applyRateLimit(mobileLimiter, auth.userId)`.
3. Look up the CarrierDriver record via `prisma.carrierDriver.findFirst({ where: { userId: auth.userId, orgId: auth.tenantId } })`. Return 404 with `{ error: "No carrier driver profile found" }` if not found. This is necessary because `validateMobileToken` returns the User.id but CarrierDriver has its own separate id used as FK on dispatches.
4. Query dispatches using bypass_rls pattern (see loads/route.ts for exact pattern):
   ```
   prisma.carrierDispatch.findMany({
     where: {
       orgId: auth.tenantId,
       status: { in: ['planned', 'in_progress'] },
       OR: [
         { primaryDriverId: carrierDriver.id },
         { coDriverId: carrierDriver.id },
       ],
     },
     orderBy: { scheduledDeparture: 'asc' },
     include: {
       truck: { select: { id: true, unitNumber: true } },
       stops: {
         orderBy: { sequenceOrder: 'asc' },
         select: {
           id: true, sequenceOrder: true, stopType: true, status: true,
           appointmentStart: true,
           facility: { select: { name: true, city: true, state: true } },
           documents: { select: { id: true, documentType: true } },
         },
       },
     },
   })
   ```
5. Map results to response shape. Since the schema has no `dispatchNumber` field, generate a display number from the ID: `"DSP-" + dispatch.id.slice(0, 8).toUpperCase()`. For each stop, derive `bol_required` and `pod_required` from the stop's `stopType` (pickup stops require BOL, delivery stops require POD — use `stopType === 'pickup'` for BOL, `stopType === 'delivery'` for POD). Derive `bol_uploaded` and `pod_uploaded` by checking if a document with `documentType === 'bol'` or `documentType === 'pod'` exists in `stop.documents`.
6. Return JSON: `{ dispatches: [...] }` with shape per dispatch: `{ id, dispatchNumber, status, scheduledDeparture, actualDeparture, truck: { unitNumber }, stops: [{ id, sequenceOrder, stopType, facilityName, facilityCity, facilityState, status, bolRequired, podRequired, bolUploaded, podUploaded, appointmentStart }] }`.

**GET /api/mobile/carrier/driver/dispatches/[id]** (detail route):

1. Same auth + rate limit + carrier driver lookup pattern.
2. Extract `id` from route params.
3. Query single dispatch with full detail:
   ```
   prisma.carrierDispatch.findFirst({
     where: {
       id: params.id,
       orgId: auth.tenantId,
       OR: [
         { primaryDriverId: carrierDriver.id },
         { coDriverId: carrierDriver.id },
       ],
     },
     include: {
       truck: { select: { id: true, unitNumber: true, make: true, model: true, year: true, licensePlate: true } },
       trailer: { select: { id: true, unitNumber: true } },
       stops: {
         orderBy: { sequenceOrder: 'asc' },
         include: {
           facility: true,
           documents: { select: { id: true, documentType: true, filename: true, fileUrl: true, createdAt: true } },
         },
       },
       expenses: {
         where: { driverId: carrierDriver.id },
         orderBy: { createdAt: 'desc' },
         select: { id: true, expenseType: true, amount: true, currency: true, notes: true, createdAt: true, reimbursable: true },
       },
     },
   })
   ```
4. Return 404 if not found. Map to response with full stop addresses (addressLine1, city, state, zip from facility), documents array per stop, expenses array. Use same `dispatchNumber` derivation.

Both routes must:
- Use `@bypass_rls reason: mobile-api` comment pattern (copy from loads/route.ts)
- Wrap queries in `prisma.$transaction` with `tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\``
- Import from `@/lib/auth/mobile-auth`, `@/lib/db/prisma`, `@/lib/rate-limit`, `@/lib/logger`
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors in the new route files.</verify>
  <done>Both API routes exist, type-check clean, follow the established bypass_rls + validateMobileToken pattern. List returns dispatches filtered by driver and status, detail returns full dispatch with stops/documents/expenses.</done>
</task>

<task type="auto">
  <name>Task 2: Carrier driver API client + mobile home screen with tab integration</name>
  <files>
    packages/api-client/src/carrier-driver.ts
    packages/api-client/src/index.ts
    apps/mobile/app/(driver)/carrier/_layout.tsx
    apps/mobile/app/(driver)/carrier/index.tsx
    apps/mobile/app/(driver)/_layout.tsx
  </files>
  <action>
**packages/api-client/src/carrier-driver.ts:**

Create new file exporting `carrierDriverApi` object. Follow the exact pattern from `driver.ts` — import `apiRequest` from `./client`.

Define TypeScript interfaces at the top of the file (NOT in packages/types — keep self-contained for now):

```typescript
export interface CarrierDispatchStop {
  id: string
  sequenceOrder: number
  stopType: string
  facilityName: string
  facilityCity: string
  facilityState: string
  status: string
  bolRequired: boolean
  podRequired: boolean
  bolUploaded: boolean
  podUploaded: boolean
  appointmentStart: string | null
}

export interface CarrierDispatch {
  id: string
  dispatchNumber: string
  status: string
  scheduledDeparture: string
  actualDeparture: string | null
  truck: { unitNumber: string }
  stops: CarrierDispatchStop[]
}

export interface CarrierStopDocument {
  id: string
  documentType: string
  filename: string
  fileUrl: string
  createdAt: string
}

export interface CarrierDispatchDetailStop {
  id: string
  sequenceOrder: number
  stopType: string
  status: string
  appointmentStart: string | null
  appointmentEnd: string | null
  arrivedAt: string | null
  departedAt: string | null
  contactName: string | null
  contactPhone: string | null
  specialInstructions: string | null
  bolNumber: string | null
  podNumber: string | null
  sealNumber: string | null
  facility: {
    name: string
    addressLine1: string | null
    city: string | null
    state: string | null
    zip: string | null
    latitude: number | null
    longitude: number | null
  }
  documents: CarrierStopDocument[]
}

export interface CarrierExpenseSummary {
  id: string
  expenseType: string
  amount: string
  currency: string
  notes: string | null
  createdAt: string
  reimbursable: boolean
}

export interface CarrierDispatchDetail {
  id: string
  dispatchNumber: string
  status: string
  scheduledDeparture: string
  actualDeparture: string | null
  scheduledArrival: string | null
  actualArrival: string | null
  plannedMiles: string | null
  actualMiles: string | null
  notes: string | null
  truck: { unitNumber: string; make: string | null; model: string | null; year: number | null; licensePlate: string | null }
  trailer: { unitNumber: string } | null
  stops: CarrierDispatchDetailStop[]
  expenses: CarrierExpenseSummary[]
}

export interface ExpenseInput {
  expenseType: string
  amount: number
  paidBy: string
  notes?: string
  stopId?: string
}
```

Export `carrierDriverApi`:
```typescript
export const carrierDriverApi = {
  getMyDispatches: (token: string) =>
    apiRequest<{ dispatches: CarrierDispatch[] }>('/api/mobile/carrier/driver/dispatches', { token })
      .then(r => r.dispatches),

  getDispatchDetail: (token: string, id: string) =>
    apiRequest<CarrierDispatchDetail>(`/api/mobile/carrier/driver/dispatches/${id}`, { token }),

  markStopArrived: (token: string, stopId: string) =>
    apiRequest<CarrierDispatchDetailStop>(`/api/mobile/carrier/driver/stops/${stopId}/arrive`, { method: 'POST', token }),

  completeStop: (token: string, stopId: string) =>
    apiRequest<CarrierDispatchDetailStop>(`/api/mobile/carrier/driver/stops/${stopId}/complete`, { method: 'POST', token }),

  uploadStopDocument: (token: string, stopId: string, documentType: string, file: FormData) =>
    apiRequest<CarrierStopDocument>(`/api/mobile/carrier/driver/stops/${stopId}/documents`, {
      method: 'POST',
      token,
      body: file as unknown as string,
      headers: {},  // Let browser set Content-Type for FormData
    }),

  logExpense: (token: string, dispatchId: string, data: ExpenseInput) =>
    apiRequest<CarrierExpenseSummary>(`/api/mobile/carrier/driver/dispatches/${dispatchId}/expenses`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),
}
```

Note: `markStopArrived`, `completeStop`, `uploadStopDocument`, and `logExpense` point to API routes not yet created — they are typed stubs for future tasks per the spec. Only `getMyDispatches` and `getDispatchDetail` have backing routes from Task 1.

**packages/api-client/src/index.ts:**

Add barrel exports. Add after the existing `ownerApi` export line:
```typescript
export { carrierDriverApi } from './carrier-driver'
export type { CarrierDispatch, CarrierDispatchStop, CarrierDispatchDetail, CarrierDispatchDetailStop, CarrierStopDocument, CarrierExpenseSummary, ExpenseInput } from './carrier-driver'
```

**apps/mobile/app/(driver)/carrier/_layout.tsx:**

Simple Stack layout (expo-router):
```tsx
import { Stack } from 'expo-router'
import { useThemeColors } from '../../../constants/tokens'

export default function CarrierLayout() {
  const c = useThemeColors()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    />
  )
}
```

**apps/mobile/app/(driver)/carrier/index.tsx:**

Carrier dispatch home screen:
1. Import `useAuthContext` for token, `carrierDriverApi` from `@drivecommand/api-client`, `useQuery` from `@tanstack/react-query`, `useThemeColors` from `@/constants/tokens`, `FlashList` from `@shopify/flash-list`, `useRouter` from `expo-router`.
2. Use `useQuery({ queryKey: ['carrier-dispatches'], queryFn: () => carrierDriverApi.getMyDispatches(token!) })`.
3. Render:
   - **Active dispatch card** (first item where `status === 'in_progress'`): Large card with `dispatchNumber`, truck unit number, scheduled departure formatted with `toLocaleDateString`, stop count, and a progress bar showing `completedStops / totalStops`. Use `useThemeColors()` tokens: `c.surfaceCard` background, `c.brand` for progress bar fill, `c.text` and `c.textSecondary` for text.
   - **Upcoming dispatches** (status === 'planned'): FlashList of smaller cards with `dispatchNumber`, departure date, stop count. `estimatedItemSize={80}`.
   - **Empty state**: When no dispatches, show centered text "No dispatches assigned" with `c.textTertiary` color and a truck icon from lucide-react-native.
   - **Pull-to-refresh**: Pass `refreshing={isRefetching}` and `onRefresh={refetch}` to FlashList (or ScrollView wrapping the active card + FlashList).
4. Tap on any dispatch card navigates to `router.push(\`/carrier/dispatch/${dispatch.id}\`)` — this route doesn't exist yet but sets up the navigation target for the next task.
5. Apply `useThemeColors()` tokens consistently. Use `AnimatedScreen` wrapper if the pattern exists, otherwise a plain `SafeAreaView`.
6. Derive progress: `const completedStops = dispatch.stops.filter(s => s.status === 'completed' || s.status === 'departed').length`.

**apps/mobile/app/(driver)/_layout.tsx:**

Add a new hidden tab route for the `carrier` directory. Add it alongside the existing hidden routes at the bottom of the Tabs component (after the `incidents` hidden route):
```tsx
<Tabs.Screen name="carrier" options={{ href: null }} />
```

This keeps carrier as a navigable route within the driver layout without adding a visible tab. The "Dispatch" tab mentioned in the spec will be added to the More screen's navigation list in a future task once more carrier screens exist. For now, the carrier home screen is accessible via deep link or programmatic navigation (`router.push('/carrier')`).

IMPORTANT: Do NOT add a visible tab to the bottom navigator yet — adding a 6th visible tab would break the current 5-tab layout. Instead, keep it hidden (href: null) and add a "Carrier Dispatches" link to the More screen in a subsequent task.
  </action>
  <verify>
Run `npx tsc --noEmit -p packages/api-client/tsconfig.json` to verify the api-client types.
Run `npx tsc --noEmit -p apps/mobile/tsconfig.json` to verify mobile app compiles.
  </verify>
  <done>
carrierDriverApi is exported from @drivecommand/api-client with all 6 methods typed.
Carrier home screen renders active + upcoming dispatches with pull-to-refresh and empty state.
carrier/_layout.tsx provides Stack navigation for future carrier sub-screens.
Driver tab navigator has carrier as a hidden route (no visible tab break).
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p apps/web/tsconfig.json` — no errors from new API routes
2. `npx tsc --noEmit -p packages/api-client/tsconfig.json` — no errors from carrier-driver.ts
3. `npx tsc --noEmit -p apps/mobile/tsconfig.json` — no errors from new screens
4. Manually review: API routes use bypass_rls pattern, validateMobileToken, rate limiting
5. Manually review: carrier-driver.ts exports all 6 methods per spec
6. Manually review: Home screen uses FlashList, useThemeColors, TanStack Query, pull-to-refresh
</verification>

<success_criteria>
- Two API routes created at the correct paths, following established mobile-api patterns
- carrierDriverApi typed client with all 6 methods (2 backed by routes, 4 stubs for future)
- Carrier home screen shows active dispatch card + upcoming list + empty state
- Pull-to-refresh works via TanStack Query refetch
- Driver tab navigator includes carrier as hidden route (no layout break)
- All three TypeScript projects compile clean
</success_criteria>

<output>
After completion, create `.planning/quick/174-carrier-ops-mobile-auth-flow-and-home-sc/174-SUMMARY.md`
</output>
