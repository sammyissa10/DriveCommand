---
phase: quick-144
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts
  - apps/web/src/app/api/mobile/owner/safety/route.ts
  - packages/api-client/src/owner.ts
  - apps/mobile/app/(owner)/more/trucks/[id].tsx
  - apps/mobile/app/(owner)/more/safety.tsx
  - apps/mobile/app/(owner)/more/index.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can view maintenance history for a truck on mobile"
    - "Owner can log a new maintenance event from the truck detail screen"
    - "Owner can view safety alerts (expired docs, incidents, overdue services) on mobile"
    - "Safety screen is accessible from the More menu"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts"
      provides: "GET (list) and POST (create) maintenance events for a truck"
      exports: ["GET", "POST"]
    - path: "apps/web/src/app/api/mobile/owner/safety/route.ts"
      provides: "GET aggregated safety alerts"
      exports: ["GET"]
    - path: "packages/api-client/src/owner.ts"
      provides: "getTruckMaintenance, logMaintenanceEvent, getSafetyAlerts methods"
    - path: "apps/mobile/app/(owner)/more/trucks/[id].tsx"
      provides: "Maintenance section + log maintenance bottom sheet"
    - path: "apps/mobile/app/(owner)/more/safety.tsx"
      provides: "Safety alerts list screen"
    - path: "apps/mobile/app/(owner)/more/index.tsx"
      provides: "Safety entry in More menu"
  key_links:
    - from: "apps/mobile/app/(owner)/more/trucks/[id].tsx"
      to: "/api/mobile/owner/trucks/{id}/maintenance"
      via: "ownerApi.getTruckMaintenance / ownerApi.logMaintenanceEvent"
      pattern: "ownerApi\\.(getTruckMaintenance|logMaintenanceEvent)"
    - from: "apps/mobile/app/(owner)/more/safety.tsx"
      to: "/api/mobile/owner/safety"
      via: "ownerApi.getSafetyAlerts"
      pattern: "ownerApi\\.getSafetyAlerts"
---

<objective>
Add truck maintenance logging and safety alerts to the mobile owner portal.

Purpose: Owners need to track maintenance history per truck and see fleet-wide safety alerts (expired docs, overdue inspections, driver incidents) on mobile without opening the web app.

Output: Two new API endpoints, three api-client methods, a maintenance section on the truck detail screen with log-new bottom sheet, a new safety alerts screen, and a More menu entry for Safety.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (MaintenanceEvent model at line 355, DriverIncident at 1154, SafetyEvent at 447, ScheduledService model)
@apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts (existing truck detail API — pattern reference)
@apps/web/src/app/api/mobile/owner/compliance/route.ts (compliance API — pattern for bypass_rls, rate limiting, document expiry logic)
@apps/web/src/app/(owner)/actions/maintenance.ts (web maintenance CRUD — field reference)
@apps/web/src/app/(owner)/safety/actions.ts (web safety data queries — SafetyEvent queries)
@packages/api-client/src/owner.ts (existing api-client methods)
@apps/mobile/app/(owner)/more/trucks/[id].tsx (truck detail screen to extend)
@apps/mobile/app/(owner)/more/index.tsx (More menu to add Safety entry)
</context>

<tasks>

<task type="auto">
  <name>Task 1: API endpoints + api-client for maintenance and safety</name>
  <files>
    apps/web/src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts
    apps/web/src/app/api/mobile/owner/safety/route.ts
    packages/api-client/src/owner.ts
  </files>
  <action>
**1a. Create `apps/web/src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts`** with GET and POST handlers:

- **GET** `/api/mobile/owner/trucks/[id]/maintenance` — Returns maintenance history for a truck.
  - Auth: `validateMobileToken` + role check OWNER + `applyRateLimit(mobileLimiter, auth.userId)`.
  - Transaction with `@bypass_rls` pattern (same as trucks/[id]/route.ts).
  - Query `prisma.maintenanceEvent.findMany({ where: { truckId: id, tenantId }, orderBy: { serviceDate: 'desc' }, take: 50 })`.
  - Select fields: `id, serviceType, serviceDate, odometerAtService, cost, provider, notes, createdAt`.
  - Return JSON array. Format `serviceDate` and `createdAt` as ISO strings. Format `cost` as string (Decimal).

- **POST** `/api/mobile/owner/trucks/[id]/maintenance` — Creates a maintenance event.
  - Auth: same as GET.
  - Parse JSON body with fields: `serviceType` (string, required), `serviceDate` (ISO string, required), `odometerAtService` (int, required), `cost` (number|null, optional), `provider` (string|null, optional), `notes` (string|null, optional).
  - Validate: serviceType non-empty, odometerAtService >= 0, cost >= 0 if provided, serviceDate is valid date.
  - Verify truck exists and belongs to tenant before creating.
  - Create via `prisma.maintenanceEvent.create(...)` with `tenantId` and `truckId`.
  - Return `{ success: true, event: { id, serviceType, serviceDate, ... } }`.

**1b. Create `apps/web/src/app/api/mobile/owner/safety/route.ts`** with GET handler:

- **GET** `/api/mobile/owner/safety` — Returns aggregated safety alerts.
  - Auth: same pattern as above.
  - Transaction with `@bypass_rls` pattern.
  - Aggregate alerts from 3 sources in parallel:

    1. **Expired/expiring documents** — Query `Document` where `tenantId` matches, `expiryDate` is not null, and `expiryDate <= now + 30 days`. Join driver name. Map to alert objects with `severity: expiryDate < now ? 'high' : 'medium'`, `category: 'DOCUMENT'`, `description: '{docType} for {entityName} {expired|expires in N days}'`, `affectedEntity: entityName`, `date: expiryDate`.
    Also check truck `documentMetadata` for registration/insurance expiry (same logic as compliance route).

    2. **Overdue scheduled services** — Query `ScheduledService` where `isCompleted: false`. For each, calculate if overdue by comparing `baselineDate + intervalDays` to now and `baselineOdometer + intervalMiles` to truck current odometer. Only include overdue items. Map to alert with `severity: 'medium'`, `category: 'MAINTENANCE'`, `description: '{serviceType} overdue for {truckName}'`, `affectedEntity: truckName`, `date: dueDate`.

    3. **Recent driver incidents** (last 30 days) — Query `DriverIncident` where `tenantId` matches and `reportedAt >= 30 days ago`. Join driver name. Map to alert with `severity` from incident severity (HIGH->high, MEDIUM->medium, LOW->low), `category: 'INCIDENT'`, `description` from incident description, `affectedEntity: driverName`, `date: reportedAt`.

  - Sort all alerts: high severity first, then medium, then low. Within same severity, most recent first.
  - Return `{ alerts: SafetyAlert[], summary: { highCount, mediumCount, lowCount, totalCount } }`.

**1c. Add types and methods to `packages/api-client/src/owner.ts`:**

Add these types after the existing `ComplianceResponse` interface:

```typescript
export interface MaintenanceEventSummary {
  id: string
  serviceType: string
  serviceDate: string
  odometerAtService: number
  cost: string | null
  provider: string | null
  notes: string | null
  createdAt: string
}

export interface LogMaintenancePayload {
  serviceType: string
  serviceDate: string
  odometerAtService: number
  cost?: number | null
  provider?: string | null
  notes?: string | null
}

export interface SafetyAlert {
  severity: 'high' | 'medium' | 'low'
  category: 'DOCUMENT' | 'MAINTENANCE' | 'INCIDENT'
  description: string
  affectedEntity: string
  date: string
}

export interface SafetyAlertsResponse {
  alerts: SafetyAlert[]
  summary: {
    highCount: number
    mediumCount: number
    lowCount: number
    totalCount: number
  }
}
```

Add these methods to the `ownerApi` object:

```typescript
getTruckMaintenance: (token: string, truckId: string) =>
  apiRequest<MaintenanceEventSummary[]>(`/api/mobile/owner/trucks/${truckId}/maintenance`, { token }),

logMaintenanceEvent: (token: string, truckId: string, payload: LogMaintenancePayload) =>
  apiRequest<{ success: boolean; event: MaintenanceEventSummary }>(`/api/mobile/owner/trucks/${truckId}/maintenance`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  }),

getSafetyAlerts: (token: string) =>
  apiRequest<SafetyAlertsResponse>('/api/mobile/owner/safety', { token }),
```
  </action>
  <verify>
    Run `npx tsc --noEmit` from the project root (or `cd apps/web && npx tsc --noEmit`) to confirm no TypeScript errors in the new API routes.
    Run `cd packages/api-client && npx tsc --noEmit` to confirm the api-client types compile.
  </verify>
  <done>
    - GET /api/mobile/owner/trucks/{id}/maintenance returns maintenance history array
    - POST /api/mobile/owner/trucks/{id}/maintenance creates a maintenance event and returns it
    - GET /api/mobile/owner/safety returns aggregated alerts from documents, overdue services, and incidents
    - api-client exports getTruckMaintenance, logMaintenanceEvent, getSafetyAlerts
  </done>
</task>

<task type="auto">
  <name>Task 2: Maintenance section on truck detail screen</name>
  <files>
    apps/mobile/app/(owner)/more/trucks/[id].tsx
  </files>
  <action>
Extend the existing truck detail screen to include a Maintenance section and a "Log Maintenance" bottom sheet.

**Add imports:** `Wrench` from lucide-react-native, `useMutation` is already imported, add `MaintenanceEventSummary`, `LogMaintenancePayload` to the imports from `@drivecommand/api-client`.

**Add a maintenance query** inside `TruckDetailScreen`:
```typescript
const { data: maintenance, isLoading: maintenanceLoading, refetch: refetchMaintenance } = useQuery<MaintenanceEventSummary[]>({
  queryKey: ['owner-truck-maintenance', id],
  queryFn: () => ownerApi.getTruckMaintenance(token!, id!),
  enabled: !!token && !!id,
})
```

**Add a LogMaintenanceSheet component** (similar pattern to EditTruckSheet):
- Bottom sheet with title "Log Maintenance" at 85% snap point.
- Fields:
  - Service Type: picker or text input with common options (Oil Change, Tire Rotation, Inspection, Brake Service, Engine Repair, Other). Use a simple `TextInput` with placeholder showing examples — keep it simple like the edit truck sheet pattern.
  - Description/Notes: `TextInput` multiline, placeholder "Describe the service performed..."
  - Cost ($): `TextInput` with `keyboardType="numeric"`
  - Odometer: `TextInput` with `keyboardType="numeric"`, pre-fill with truck's current odometer
  - Service Date: `TextInput` with placeholder "YYYY-MM-DD", default to today's date formatted
- Save button calls `ownerApi.logMaintenanceEvent`. On success: haptic.success(), Toast success, close sheet, invalidate `['owner-truck-maintenance', id]` query.
- On error: haptic.error(), Toast error.

**Add Maintenance section** to the ScrollView content, after the "Document Information" card and before "Record History":
- Card with `bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4` (same pattern as other cards).
- Header row: Wrench icon + "Service History" title + "Log" button (small Pressable, sky-500 text, opens the log sheet).
- If `maintenanceLoading`: small ActivityIndicator.
- If `maintenance?.length === 0`: "No maintenance records" text in slate-500.
- If maintenance has items: show latest 5 entries. Each entry is a row showing:
  - Service type (bold, slate-100) + date (slate-500, right-aligned)
  - Second line: cost (if present, formatted as $X.XX) + odometer (formatted with comma separator + "mi")
  - Divider between entries (same `h-px bg-slate-700` pattern as More menu).

**State for sheet visibility:** `const [maintenanceSheetVisible, setMaintenanceSheetVisible] = useState(false)`

**Mutation for logging:**
```typescript
const { mutate: logMaintenance, isPending: isLogging } = useMutation({
  mutationFn: (payload: LogMaintenancePayload) => ownerApi.logMaintenanceEvent(token!, id!, payload),
  onSuccess: () => {
    haptic.success()
    queryClient.invalidateQueries({ queryKey: ['owner-truck-maintenance', id] })
    Toast.show({ type: 'success', text1: 'Maintenance logged', text2: 'Service record saved.', visibilityTime: 3000 })
    setMaintenanceSheetVisible(false)
  },
  onError: (err: Error) => {
    haptic.error()
    Toast.show({ type: 'error', text1: 'Failed to log', text2: err.message || 'Please try again.', visibilityTime: 4000 })
  },
})
```
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit` to confirm no TypeScript errors.
    Visually verify (if emulator available): navigate to a truck detail, see the Maintenance section, tap "Log" to open bottom sheet, fill in fields and save.
  </verify>
  <done>
    - Truck detail screen shows "Service History" section with recent maintenance events
    - "Log" button opens bottom sheet with service type, notes, cost, odometer, date fields
    - Submitting the form creates a maintenance event and refreshes the list
    - Empty state shows "No maintenance records" message
  </done>
</task>

<task type="auto">
  <name>Task 3: Safety alerts screen + More menu entry</name>
  <files>
    apps/mobile/app/(owner)/more/safety.tsx
    apps/mobile/app/(owner)/more/index.tsx
  </files>
  <action>
**3a. Create `apps/mobile/app/(owner)/more/safety.tsx`:**

Follow the established mobile screen pattern (SafeAreaView + AnimatedScreen + ScrollView with RefreshControl).

- Import `SafetyAlertsResponse`, `SafetyAlert` from `@drivecommand/api-client`, `useQuery` from tanstack, `useAuthContext`, `ownerApi`.
- Import icons: `ChevronLeft`, `Shield`, `AlertTriangle`, `FileText`, `Wrench`, `AlertCircle` from lucide-react-native.

- **Header:** Back button + "Safety Alerts" title (same pattern as truck detail).

- **Summary cards row** at the top (horizontal, 3 small cards):
  - High: red background (`#ef444420`), red text, count from `summary.highCount`
  - Medium: amber background (`#f59e0b20`), amber text, count from `summary.mediumCount`  
  - Low: green background (`#22c55e20`), green text, count from `summary.lowCount`

- **Alerts list:** FlatList or mapped list inside ScrollView. Each alert card:
  - Left: severity indicator dot (red for high, amber for medium, green for low) — 8x8 rounded-full View.
  - Category icon: `FileText` for DOCUMENT, `Wrench` for MAINTENANCE, `AlertCircle` for INCIDENT. Size 16, color matching severity.
  - Content: description text (slate-100, 14px), affected entity below (slate-500, 12px), date right-aligned (slate-500, 12px, formatted as "Mar 31, 2026").
  - Card styling: `bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 mb-2`.

- **Empty state:** Shield icon (slate-600) + "No alerts" + "Your fleet is in good shape" subtitle.
- **Error state:** AlertTriangle + retry button (same pattern as truck detail).
- **Loading state:** centered ActivityIndicator.
- **Pull to refresh:** RefreshControl on ScrollView.

Query:
```typescript
const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<SafetyAlertsResponse>({
  queryKey: ['owner-safety-alerts'],
  queryFn: () => ownerApi.getSafetyAlerts(token!),
  enabled: !!token,
})
```

**3b. Add Safety entry to More menu in `apps/mobile/app/(owner)/more/index.tsx`:**

In the `SECTIONS` array, add a new entry to the FLEET section (after "Fuel Log"):
```typescript
{
  label: 'Safety',
  subtitle: 'Alerts & incidents',
  Icon: Shield,
  iconBg: 'rgba(239,68,68,0.15)',
  iconColor: '#ef4444',
  route: '/(owner)/more/safety',
},
```

`Shield` is already imported in the file (used for Team Permissions but that uses a different icon). Check: the FLEET section currently uses `ShieldCheck` for Compliance. Use `AlertTriangle` instead for Safety to differentiate visually. Import `AlertTriangle` if not already imported (it is already imported in the file — confirmed from the imports). So use `AlertTriangle` as the Icon for the Safety entry with red coloring.
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit` to confirm no TypeScript errors.
    Verify the More menu shows the Safety entry under FLEET.
    Verify navigating to Safety shows the alerts screen with summary cards and alert list.
  </verify>
  <done>
    - Safety alerts screen at `/(owner)/more/safety` shows summary counts and alert list
    - Each alert displays severity, category icon, description, affected entity, and date
    - Pull to refresh works
    - More menu has "Safety" entry under FLEET section with AlertTriangle icon
    - Empty state and error state are handled
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes (API routes compile)
- `cd packages/api-client && npx tsc --noEmit` passes (types compile)
- `cd apps/mobile && npx tsc --noEmit` passes (mobile screens compile)
- Manual test: Open truck detail on mobile, see maintenance section, log an event
- Manual test: Open More menu, tap Safety, see alerts list
</verification>

<success_criteria>
- Two new API endpoints respond correctly (maintenance GET/POST, safety GET)
- Truck detail screen shows maintenance history and allows logging new events
- Safety alerts screen aggregates data from documents, scheduled services, and incidents
- More menu includes Safety entry that navigates to the new screen
- All TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/144-mobile-owner-portal-add-truck-maintenanc/144-SUMMARY.md`
</output>
