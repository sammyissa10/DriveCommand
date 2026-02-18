---
phase: quick-11
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/compliance.ts
  - src/app/(owner)/compliance/page.tsx
  - src/components/compliance/compliance-summary-cards.tsx
  - src/components/compliance/driver-compliance-table.tsx
  - src/components/compliance/truck-compliance-table.tsx
  - src/components/compliance/compliance-alerts-panel.tsx
  - src/components/navigation/sidebar.tsx
autonomous: true

must_haves:
  truths:
    - "Owner/Manager can navigate to /compliance from the sidebar"
    - "Page shows a summary header with counts: expiring documents, expired documents, critical safety events"
    - "Driver compliance table shows each driver with their license expiry status and document status badges (OK / Expiring Soon / Expired)"
    - "Truck compliance table shows each truck with registration and insurance expiry status"
    - "Alerts panel highlights items expiring within 30 days and already-expired items"
    - "Safety violations summary shows HIGH/CRITICAL event counts per driver in the last 90 days"
  artifacts:
    - path: "src/app/(owner)/actions/compliance.ts"
      provides: "getComplianceDashboard server action"
      exports: ["getComplianceDashboard", "ComplianceDashboardData"]
    - path: "src/app/(owner)/compliance/page.tsx"
      provides: "Server component page at /compliance"
    - path: "src/components/compliance/compliance-summary-cards.tsx"
      provides: "Summary cards component"
    - path: "src/components/compliance/driver-compliance-table.tsx"
      provides: "Driver compliance table"
    - path: "src/components/compliance/truck-compliance-table.tsx"
      provides: "Truck compliance table"
    - path: "src/components/compliance/compliance-alerts-panel.tsx"
      provides: "Alerts panel for expiring/expired items"
  key_links:
    - from: "src/app/(owner)/compliance/page.tsx"
      to: "src/app/(owner)/actions/compliance.ts"
      via: "getComplianceDashboard() call"
    - from: "src/app/(owner)/actions/compliance.ts"
      to: "prisma.document (driverId not null, expiryDate not null)"
      via: "driver document expiry query"
    - from: "src/app/(owner)/actions/compliance.ts"
      to: "prisma.truck (documentMetadata JSONB)"
      via: "truck registration/insurance expiry parsing with documentMetadataSchema"
    - from: "src/app/(owner)/actions/compliance.ts"
      to: "prisma.safetyEvent (severity HIGH/CRITICAL, last 90 days)"
      via: "driver safety violation aggregation"
    - from: "src/components/navigation/sidebar.tsx"
      to: "/compliance"
      via: "ClipboardCheck icon link under Intelligence section"
---

<objective>
Build a compliance monitoring dashboard at /compliance that gives fleet owners a single-pane view of document expiry status (driver licenses/certifications, truck registration/insurance), safety violation summaries, and prioritized compliance alerts.

Purpose: Replace manual tracking of expiry dates with an automated dashboard that surfaces risk before it becomes a liability. Extends existing document expiry infrastructure (Phase 18) with a fleet-wide compliance view.

Output: /compliance page with summary cards, driver compliance table, truck compliance table, and alerts panel. Sidebar link under Intelligence for OWNER/MANAGER.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Key patterns from codebase:
- Server actions use: requireRole([UserRole.OWNER, UserRole.MANAGER]), getTenantPrisma()
- Page structure matches: src/app/(owner)/lane-analytics/page.tsx (server component, fetchCache force-no-store)
- Truck documentMetadata parsed via documentMetadataSchema from src/lib/validations/truck.schemas.ts (registrationExpiry, insuranceExpiry as ISO date strings)
- Driver documents: Document table with driverId, expiryDate (DateTime), documentType (DRIVER_LICENSE | DRIVER_APPLICATION | GENERAL)
- SafetyEvent table: severity (LOW | MEDIUM | HIGH | CRITICAL), driverId, timestamp
- 30-day threshold = "expiring soon" (established in Phase 18-02)
- Sidebar pattern: src/components/navigation/sidebar.tsx — add under Intelligence SidebarGroup alongside Lane Profitability
- Component pattern: client components in src/components/{domain}/, server page fetches data and passes as props
</context>

<tasks>

<task type="auto">
  <name>Task 1: Compliance data action</name>
  <files>src/app/(owner)/actions/compliance.ts</files>
  <action>
Create 'use server' action file. Export interface ComplianceDashboardData and async function getComplianceDashboard().

getComplianceDashboard():
1. requireRole([UserRole.OWNER, UserRole.MANAGER])
2. const prisma = await getTenantPrisma()
3. const now = new Date(); const thirtyDaysOut = addDays(now, 30) (use date-fns addDays — already in package.json from Phase 18)
4. const ninetyDaysAgo = subDays(now, 90)

DRIVER DOCUMENTS query:
```
const driverDocs = await prisma.document.findMany({
  where: { driverId: { not: null }, expiryDate: { not: null } },
  select: {
    id: true, driverId: true, documentType: true, expiryDate: true, fileName: true,
    driver: { select: { id: true, firstName: true, lastName: true, isActive: true } }
  },
  orderBy: { expiryDate: 'asc' }
})
```

TRUCK REGISTRATION/INSURANCE query:
```
const trucks = await prisma.truck.findMany({
  select: { id: true, make: true, model: true, year: true, licensePlate: true, documentMetadata: true }
})
```
Parse each truck.documentMetadata using documentMetadataSchema.safeParse(). Extract registrationExpiry and insuranceExpiry (ISO strings). Convert to Date objects for comparison.

SAFETY EVENTS query:
```
const safetyEvents = await prisma.safetyEvent.findMany({
  where: {
    severity: { in: ['HIGH', 'CRITICAL'] },
    timestamp: { gte: ninetyDaysAgo },
    driverId: { not: null }
  },
  select: { driverId: true, severity: true, timestamp: true, eventType: true,
    driver: { select: { id: true, firstName: true, lastName: true } }
  }
})
```

BUILD OUTPUT SHAPE:

DriverComplianceItem: { driverId, driverName, isActive, documents: Array<{ id, documentType, fileName, expiryDate: string, status: 'OK' | 'EXPIRING_SOON' | 'EXPIRED' }>, overallStatus: 'OK' | 'EXPIRING_SOON' | 'EXPIRED', highCriticalEvents: number }

Status logic: expiryDate < now → 'EXPIRED', expiryDate <= thirtyDaysOut → 'EXPIRING_SOON', else 'OK'. Driver overallStatus = worst status among their documents.

TruckComplianceItem: { truckId, truckLabel (e.g. "2021 Kenworth T680"), licensePlate, registration: { expiry: string | null, status: 'OK' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_SET' }, insurance: { expiry: string | null, status: same }, overallStatus: worst of the two }

Alerts: derive from driverDocs and trucks where status is EXPIRED or EXPIRING_SOON. Each alert: { type: 'driver_document' | 'truck_registration' | 'truck_insurance', entityId, entityName, item, expiryDate: string, status: 'EXPIRED' | 'EXPIRING_SOON', daysUntilExpiry: number (negative if already expired) }. Sort alerts: EXPIRED first, then EXPIRING_SOON by soonest expiry.

Summary counts: expiredCount (driver docs + truck fields that are EXPIRED), expiringSoonCount (EXPIRING_SOON), criticalSafetyCount (CRITICAL events in last 90 days), highSafetyCount (HIGH events in last 90 days).

ComplianceDashboardData shape:
```typescript
export interface ComplianceDashboardData {
  drivers: DriverComplianceItem[];
  trucks: TruckComplianceItem[];
  alerts: ComplianceAlert[];
  summary: {
    expiredCount: number;
    expiringSoonCount: number;
    criticalSafetyCount: number;
    highSafetyCount: number;
    totalDriversTracked: number;
    totalTrucksTracked: number;
  };
}
```
  </action>
  <verify>TypeScript compiles: npx tsc --noEmit (no type errors in compliance.ts)</verify>
  <done>getComplianceDashboard() returns typed ComplianceDashboardData with drivers array, trucks array, alerts array, and summary counts</done>
</task>

<task type="auto">
  <name>Task 2: Compliance page and components</name>
  <files>
    src/app/(owner)/compliance/page.tsx
    src/components/compliance/compliance-summary-cards.tsx
    src/components/compliance/driver-compliance-table.tsx
    src/components/compliance/truck-compliance-table.tsx
    src/components/compliance/compliance-alerts-panel.tsx
    src/components/navigation/sidebar.tsx
  </files>
  <action>
CREATE src/app/(owner)/compliance/page.tsx:
- export const fetchCache = 'force-no-store'
- requireRole([UserRole.OWNER, UserRole.MANAGER])
- const data = await getComplianceDashboard()
- Layout: page header ("Compliance Dashboard", subtitle "Monitor document expiry and safety compliance across your fleet"), then 4 summary cards, then 2-column grid (alerts panel left, or stacked on mobile), then driver table, then truck table
- All components are client components receiving props

CREATE src/components/compliance/compliance-summary-cards.tsx ('use client'):
4 cards in a responsive grid (2 on mobile, 4 on desktop):
- "Expired Documents" — count in red/destructive, AlertCircle icon
- "Expiring Soon (30 days)" — count in amber/yellow, Clock icon
- "Critical Safety Events (90d)" — criticalSafetyCount in red, Shield icon
- "High Safety Events (90d)" — highSafetyCount in orange, ShieldAlert icon
Each card: rounded-xl border bg-card p-5 shadow-sm, count large bold, label text-muted-foreground text-sm

CREATE src/components/compliance/compliance-alerts-panel.tsx ('use client'):
Props: alerts: ComplianceAlert[]
Shows prioritized list of items needing attention.
If alerts.length === 0: green "All Clear" message with CheckCircle icon.
Otherwise: scrollable list (max-h-96 overflow-y-auto). Each alert row:
- Red badge for EXPIRED, amber for EXPIRING_SOON
- Entity name + item description
- Days until expiry: "X days overdue" (negative) or "X days remaining" (positive)
- Link to /drivers/{id} for driver_document, /trucks/{id} for truck items
Show at most 20 alerts, with "and N more..." if truncated.

CREATE src/components/compliance/driver-compliance-table.tsx ('use client'):
Props: drivers: DriverComplianceItem[]
Table with columns: Driver, Status, Documents, Safety Events (90d), Actions
- Status badge: green "OK", amber "Expiring Soon", red "Expired" based on overallStatus
- Documents cell: compact list of document types with expiry date and per-doc status badge (max 3 shown, "+N more" if more)
- Safety Events: show highCriticalEvents count; 0 = green "None", 1-2 = amber, 3+ = red
- Actions: "View Driver" link to /drivers/{driverId}
If no drivers have tracked documents, show empty state: "No driver compliance documents found. Upload driver licenses and certifications on each driver's profile."

CREATE src/components/compliance/truck-compliance-table.tsx ('use client'):
Props: trucks: TruckComplianceItem[]
Table with columns: Truck, License Plate, Registration, Insurance, Actions
- Registration cell: show expiry date + status badge, or "Not Set" in muted text
- Insurance cell: same
- Status badge per field: green "OK", amber "Expiring Soon", red "Expired", gray "Not Set"
- Actions: "View Truck" link to /trucks/{truckId}
If no trucks: empty state "No trucks found."
If no trucks have documentMetadata set: show note "Add registration and insurance expiry dates by editing each truck."

UPDATE src/components/navigation/sidebar.tsx:
Add ClipboardCheck to lucide-react imports.
Under the Intelligence SidebarGroup (after Lane Profitability SidebarMenuItem), add:
```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    asChild
    isActive={pathname.startsWith("/compliance")}
    tooltip="Compliance"
  >
    <Link href="/compliance">
      <ClipboardCheck />
      <span>Compliance</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```
  </action>
  <verify>
1. npx tsc --noEmit — no type errors
2. Visit http://localhost:3000/compliance — page loads without errors
3. Summary cards render with counts
4. Driver table shows drivers with their document status badges
5. Truck table shows trucks with registration/insurance status
6. Sidebar shows "Compliance" link under Intelligence
  </verify>
  <done>
/compliance page fully renders with summary cards, driver compliance table, truck compliance table, and alerts panel. Sidebar navigation link works. All document expiry statuses are correctly categorized as OK / Expiring Soon / Expired based on 30-day threshold.
  </done>
</task>

</tasks>

<verification>
1. npx tsc --noEmit passes with no new errors
2. GET /compliance returns 200 for OWNER/MANAGER role
3. Document expiry classification: items with expiryDate in the past show EXPIRED, within 30 days show EXPIRING_SOON, beyond 30 days show OK
4. Truck documentMetadata parsing handles trucks with null/missing documentMetadata gracefully (NOT_SET status, no crashes)
5. Sidebar "Compliance" link navigates to /compliance and highlights correctly
6. Empty states render correctly when no documents/trucks exist
</verification>

<success_criteria>
- /compliance page loads without TypeScript errors or runtime crashes
- All four data sections render: summary cards, alerts panel, driver table, truck table
- Document expiry status uses 30-day threshold consistent with Phase 18-02 decisions
- Safety events show HIGH + CRITICAL counts from last 90 days per driver
- Trucks with no documentMetadata show "Not Set" gracefully (no crashes)
- Sidebar link visible to OWNER/MANAGER under Intelligence section
</success_criteria>

<output>
After completion, create `.planning/quick/11-build-compliance-dashboard/11-SUMMARY.md` following the summary template.
</output>
