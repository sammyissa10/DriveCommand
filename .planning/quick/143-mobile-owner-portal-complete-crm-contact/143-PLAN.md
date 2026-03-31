---
phase: quick-143
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/crm/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/payroll/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/payroll/route.ts
  - packages/api-client/src/owner.ts
  - apps/mobile/app/(owner)/more/crm/[id].tsx
  - apps/mobile/app/(owner)/more/crm/index.tsx
  - apps/mobile/app/(owner)/more/payroll.tsx
autonomous: true
must_haves:
  truths:
    - "Tapping a CRM customer in the list navigates to a detail screen showing all customer fields"
    - "Owner can edit any customer field from the detail screen via a bottom sheet form"
    - "Tapping a payroll record opens a detail bottom sheet showing full pay breakdown"
    - "Owner can create a new payroll record via a FAB that opens a bottom sheet form"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/crm/[id]/route.ts"
      provides: "GET and PATCH for single CRM contact"
      exports: ["GET", "PATCH"]
    - path: "apps/web/src/app/api/mobile/owner/payroll/[id]/route.ts"
      provides: "GET for single payroll record"
      exports: ["GET"]
    - path: "apps/web/src/app/api/mobile/owner/payroll/route.ts"
      provides: "POST for creating payroll record (added to existing GET)"
      exports: ["GET", "POST"]
    - path: "packages/api-client/src/owner.ts"
      provides: "getCrmContact, updateCrmContact, getPayrollRecord, createPayrollRecord"
    - path: "apps/mobile/app/(owner)/more/crm/[id].tsx"
      provides: "CRM contact detail + edit screen"
    - path: "apps/mobile/app/(owner)/more/crm/index.tsx"
      provides: "Tappable customer cards linking to detail"
    - path: "apps/mobile/app/(owner)/more/payroll.tsx"
      provides: "Tappable rows with detail sheet + create FAB with form sheet"
  key_links:
    - from: "apps/mobile/app/(owner)/more/crm/[id].tsx"
      to: "/api/mobile/owner/crm/{id}"
      via: "ownerApi.getCrmContact and ownerApi.updateCrmContact"
      pattern: "ownerApi\\.getCrmContact|ownerApi\\.updateCrmContact"
    - from: "apps/mobile/app/(owner)/more/payroll.tsx"
      to: "/api/mobile/owner/payroll/{id} and /api/mobile/owner/payroll"
      via: "ownerApi.getPayrollRecord and ownerApi.createPayrollRecord"
      pattern: "ownerApi\\.getPayrollRecord|ownerApi\\.createPayrollRecord"
---

<objective>
Complete the mobile owner portal's CRM contact detail/edit flow and payroll detail/create flow.

Purpose: CRM currently only has list + new; payroll is read-only. This adds the missing CRUD operations so owners can view/edit contacts and view/create payroll records from mobile.
Output: 4 new API routes, 4 new api-client methods, 1 new screen, 2 updated screens
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/mobile/owner/crm/route.ts (existing CRM list API — pattern reference)
@apps/web/src/app/api/mobile/owner/payroll/route.ts (existing payroll list API — will add POST)
@apps/web/src/app/api/mobile/owner/invoices/[id]/route.ts (pattern for dynamic [id] route)
@apps/web/src/app/api/mobile/owner/invoices/route.ts (pattern for POST with validation)
@packages/api-client/src/owner.ts (add 4 new methods)
@apps/mobile/app/(owner)/more/crm/index.tsx (make cards tappable)
@apps/mobile/app/(owner)/more/crm/new.tsx (form pattern reference)
@apps/mobile/app/(owner)/more/crm/[id].tsx (NEW — detail + edit screen)
@apps/mobile/app/(owner)/more/invoices/[id].tsx (detail screen pattern reference)
@apps/mobile/app/(owner)/more/invoices/new.tsx (BottomSheet picker + form pattern)
@apps/mobile/app/(owner)/more/payroll.tsx (update with detail sheet + create sheet + FAB)
@apps/mobile/components/ui/BottomSheet.tsx (reusable bottom sheet component)
@apps/web/prisma/schema.prisma (Customer and PayrollRecord models)
</context>

<tasks>

<task type="auto">
  <name>Task 1: API routes + api-client for CRM detail/edit and payroll detail/create</name>
  <files>
    apps/web/src/app/api/mobile/owner/crm/[id]/route.ts
    apps/web/src/app/api/mobile/owner/payroll/[id]/route.ts
    apps/web/src/app/api/mobile/owner/payroll/route.ts
    packages/api-client/src/owner.ts
  </files>
  <action>
**CRM [id] route — `apps/web/src/app/api/mobile/owner/crm/[id]/route.ts`:**

Create GET and PATCH handlers. Follow the exact pattern from `invoices/[id]/route.ts`:
- Import `validateMobileToken`, `unauthorizedResponse`, `prisma`, `TX_OPTIONS`, `mobileLimiter`, `applyRateLimit`, `logger`.
- Both handlers: validate token, check OWNER role, apply rate limit, extract tenantId, await params for id.
- Use `$transaction` with `set_config('app.bypass_rls', 'on', TRUE)` and add the `@bypass_rls` JSDoc comment block (copy from existing routes).

GET handler:
- `prisma.customer.findFirst({ where: { id, tenantId } })` selecting: id, companyName, contactName, email, phone, address, city, state, zipCode, priority, status, notes, emailNotifications, totalLoads, totalRevenue, lastLoadDate, createdAt, updatedAt.
- Return 404 if not found. Convert Decimal `totalRevenue` to Number. Convert dates to ISO strings.

PATCH handler:
- Parse JSON body. Accept optional fields: companyName, contactName, email, phone, address, city, state, zipCode, priority (must be one of LOW/MEDIUM/HIGH/VIP), status (must be one of ACTIVE/INACTIVE/PROSPECT), notes, emailNotifications.
- Validate: if companyName provided, it must be non-empty string. If priority provided, validate against enum. If status provided, validate against enum.
- `prisma.customer.update({ where: { id }, data: { ...validatedFields } })` — only include fields that were actually provided in the body (do not set undefined fields to null).
- Return the updated customer with same shape as GET.

**Payroll [id] route — `apps/web/src/app/api/mobile/owner/payroll/[id]/route.ts`:**

Create GET handler only. Same auth/bypass_rls pattern.
- `prisma.payrollRecord.findFirst({ where: { id, tenantId, archivedAt: null }, include: { driver: { select: { firstName: true, lastName: true } } } })`
- Return 404 if not found.
- Return: id, status, periodStart (ISO), periodEnd (ISO), basePay (Number), bonuses (Number), deductions (Number), totalPay (Number), milesLogged, loadsCompleted, notes, paidAt (ISO or null), driverName (joined firstName+lastName), createdAt (ISO).

**Payroll POST — add to existing `apps/web/src/app/api/mobile/owner/payroll/route.ts`:**

Add a POST handler below the existing GET. Same auth/bypass_rls pattern.
- Parse JSON body: `{ driverId: string, periodStart: string, periodEnd: string, basePay: number, deductions?: number, bonuses?: number, notes?: string }`.
- Validate: driverId required (UUID), periodStart and periodEnd required (valid dates, periodEnd > periodStart), basePay required (number >= 0). deductions defaults to 0, bonuses defaults to 0.
- Compute totalPay = basePay + bonuses - deductions.
- Create with `prisma.payrollRecord.create({ data: { tenantId, driverId, periodStart: new Date(body.periodStart), periodEnd: new Date(body.periodEnd), basePay, bonuses, deductions, totalPay, notes: body.notes?.trim() || null, status: 'DRAFT', createdById: userId, updatedById: userId } })`.
- Return `{ record: { id, driverName } }` with status 201. Resolve driverName by including driver in the create or doing a separate select.

**Api-client — `packages/api-client/src/owner.ts`:**

Add types near the CRM section:

```typescript
export interface CrmContactDetail {
  id: string
  companyName: string
  contactName: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  priority: string
  status: string
  notes: string | null
  emailNotifications: boolean
  totalLoads: number
  totalRevenue: number
  lastLoadDate: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateCrmContactPayload {
  companyName?: string
  contactName?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  priority?: string
  status?: string
  notes?: string
  emailNotifications?: boolean
}
```

Add types near the Payroll section:

```typescript
export interface PayrollRecordDetail {
  id: string
  status: string
  periodStart: string
  periodEnd: string
  basePay: number
  bonuses: number
  deductions: number
  totalPay: number
  milesLogged: number
  loadsCompleted: number
  notes: string | null
  paidAt: string | null
  driverName: string
  createdAt: string
}

export interface CreatePayrollPayload {
  driverId: string
  periodStart: string
  periodEnd: string
  basePay: number
  deductions?: number
  bonuses?: number
  notes?: string
}
```

Add 4 methods to the `ownerApi` object:

```typescript
getCrmContact: (token: string, id: string) =>
  apiRequest<CrmContactDetail>(`/api/mobile/owner/crm/${id}`, { token }),

updateCrmContact: (token: string, id: string, payload: UpdateCrmContactPayload) =>
  apiRequest<CrmContactDetail>(`/api/mobile/owner/crm/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  }),

getPayrollRecord: (token: string, id: string) =>
  apiRequest<PayrollRecordDetail>(`/api/mobile/owner/payroll/${id}`, { token }),

createPayrollRecord: (token: string, payload: CreatePayrollPayload) =>
  apiRequest<{ record: { id: string; driverName: string } }>('/api/mobile/owner/payroll', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  }),
```

Make sure all new types are exported from the package (they are auto-exported since they use `export interface`).
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — no type errors in the new API routes.
Run `cd packages/api-client && npx tsc --noEmit` — no type errors in owner.ts.
  </verify>
  <done>
4 API endpoints respond (GET/PATCH crm/[id], GET payroll/[id], POST payroll). 4 api-client methods typed and exported. TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: CRM contact detail screen + tappable list items</name>
  <files>
    apps/mobile/app/(owner)/more/crm/[id].tsx
    apps/mobile/app/(owner)/more/crm/index.tsx
  </files>
  <action>
**CRM detail screen — `apps/mobile/app/(owner)/more/crm/[id].tsx`:**

Create a full detail screen following the pattern from `invoices/[id].tsx` (SafeAreaView + AnimatedScreen + header + ScrollView with sections). Import `useLocalSearchParams`, `useQuery`, `useMutation`, `useQueryClient` from appropriate packages.

**Data fetching:**
- `useQuery({ queryKey: ['crm-contact', id], queryFn: () => ownerApi.getCrmContact(token!, id) })`
- Show loading spinner, error state with retry (same pattern as invoice detail).

**Detail view sections (read-only by default):**

Use the `SectionLabel` and `DetailRow` helper components (copy from invoices/[id].tsx pattern — inline them in this file).

Section 1 — "Contact Information":
- Company Name, Contact Name, Email, Phone, Address (join address/city/state/zipCode). Only show rows that have values.

Section 2 — "Business Details":
- Status (with colored badge), Priority (with colored badge), Email Notifications (Yes/No).

Section 3 — "Performance" (if totalLoads > 0):
- Total Loads, Total Revenue (formatted as currency), Last Load Date.

Section 4 — "Notes" (if notes exist):
- Show notes in a card with pre-wrap text.

**Edit functionality:**
- Add an "Edit" button in the header (Pencil icon from lucide-react-native).
- Pressing Edit opens a BottomSheet (import from `../../../../components/ui/BottomSheet`) with `snapPoint="90%"`.
- The edit sheet contains a ScrollView with form fields for: companyName (required), contactName, email, phone, address, city, state, zipCode, priority (picker via a nested BottomSheet or simple list of 4 options: LOW/MEDIUM/HIGH/VIP), status (picker: ACTIVE/INACTIVE/PROSPECT), notes (multiline TextInput), emailNotifications (toggle/switch).
- Pre-populate all fields from current query data when sheet opens.
- Use `useMutation` calling `ownerApi.updateCrmContact`. On success: haptic.success(), invalidate both `['crm-contact', id]` and `['owner-crm']` queries, show success toast, close sheet.
- On error: haptic.error(), show error toast.
- Use the same `FormField`, `inputClass` pattern from `crm/new.tsx`.
- For priority and status pickers, use simple Pressable rows inside the edit sheet (no nested BottomSheet needed — just render them as selectable pill buttons in a row).

**Make list items tappable — update `apps/mobile/app/(owner)/more/crm/index.tsx`:**

Wrap the `CustomerCard` component content in a `Pressable` (or make the outer View a Pressable) that navigates to the detail screen:
- In the `CustomerCard` component, change the outer `<View>` to `<Pressable onPress={() => router.push(\`/(owner)/more/crm/\${customer.id}\` as never)} className="active:opacity-80">`.
- Pass `router` to CustomerCard — either accept it as a prop or use `useRouter()` inside CustomerCard.
- The `renderCustomer` callback in the screen already renders `<CustomerCard>`, so the navigation will work automatically.
  </action>
  <verify>
Run `cd apps/mobile && npx tsc --noEmit` — no type errors.
Visually: open CRM list, tap a customer, see detail screen with all fields. Tap Edit, modify a field, save — see updated data.
  </verify>
  <done>
CRM list items are tappable and navigate to [id].tsx detail screen. Detail screen shows all customer fields in organized sections. Edit bottom sheet allows updating any field with validation and optimistic feedback.
  </done>
</task>

<task type="auto">
  <name>Task 3: Payroll detail bottom sheet + create form with FAB</name>
  <files>
    apps/mobile/app/(owner)/more/payroll.tsx
  </files>
  <action>
**Update `apps/mobile/app/(owner)/more/payroll.tsx` to add detail view and create form.**

**Imports to add:** `useState` from react, `useMutation`, `useQueryClient` from tanstack, `BottomSheet` from `../../../components/ui/BottomSheet`, `PageSpeedDial` from `../../../components/ui/PageSpeedDial`, `haptic` from `../../../lib/haptics`, `Toast` from `react-native-toast-message`, `ownerApi` types: `PayrollRecordDetail`, `DriverOption`. Add `TextInput`, `ActivityIndicator`, `KeyboardAvoidingView`, `Platform`, `ScrollView as RNScrollView` (alias to avoid conflict with FlashList's implicit scroll).

**1. Detail bottom sheet:**

Add state: `const [selectedId, setSelectedId] = useState<string | null>(null)` and `const [detailVisible, setDetailVisible] = useState(false)`.

Add a detail query:
```typescript
const { data: detail, isLoading: detailLoading } = useQuery<PayrollRecordDetail>({
  queryKey: ['payroll-detail', selectedId],
  queryFn: () => ownerApi.getPayrollRecord(token!, selectedId!),
  enabled: !!token && !!selectedId,
  staleTime: 60_000,
})
```

Make `PayrollRow` tappable: change outer `<View>` to `<Pressable onPress={() => { setSelectedId(record.id); setDetailVisible(true); }} className="active:opacity-80">`. Pass the onPress as a prop or use state setter directly.

Add a `<BottomSheet visible={detailVisible} onClose={() => setDetailVisible(false)} title="Payroll Detail" snapPoint="70%">` at the bottom of the component (before closing SafeAreaView).

Inside the detail sheet, show:
- Loading spinner if `detailLoading`.
- Otherwise, use inline styles (matching invoices/[id].tsx DetailRow pattern):
  - Driver Name (bold, large)
  - Period: `{formatDateShort(detail.periodStart)} - {formatDateShort(detail.periodEnd)}`
  - Status badge (colored, same helpers already in file)
  - Pay Breakdown section: Base Pay, + Bonuses (green), - Deductions (red), = Total Pay (bold, with divider line above)
  - Performance section (if milesLogged > 0 or loadsCompleted > 0): Miles Logged, Loads Completed
  - Paid date (if paidAt not null, green text)
  - Notes (if present)

**2. Create form bottom sheet:**

Add state: `const [createVisible, setCreateVisible] = useState(false)`.
Add form state: `driverId`, `periodStart`, `periodEnd`, `basePay`, `deductions`, `bonuses`, `notes` — all strings, initialized to `''`.
Add driver picker state: `driverPickerVisible`, `selectedDriver`.

Fetch drivers list:
```typescript
const { data: drivers } = useQuery<DriverOption[]>({
  queryKey: ['owner-active-drivers'],
  queryFn: () => ownerApi.getActiveDrivers(token!),
  enabled: !!token && createVisible,
  staleTime: 60_000,
})
```

Add create mutation:
```typescript
const { mutate: createRecord, isPending: creating } = useMutation({
  mutationFn: () => ownerApi.createPayrollRecord(token!, {
    driverId: selectedDriver!.id,
    periodStart: periodStart.trim(),
    periodEnd: periodEnd.trim(),
    basePay: parseFloat(basePay),
    ...(deductions.trim() ? { deductions: parseFloat(deductions) } : {}),
    ...(bonuses.trim() ? { bonuses: parseFloat(bonuses) } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  }),
  onSuccess: () => {
    haptic.success()
    queryClient.invalidateQueries({ queryKey: ['owner-payroll'] })
    Toast.show({ type: 'success', text1: 'Payroll created', text2: 'New record added as draft.', visibilityTime: 3000 })
    setCreateVisible(false)
    // Reset form state
  },
  onError: (err: Error) => {
    haptic.error()
    Toast.show({ type: 'error', text1: 'Failed to create', text2: err.message || 'Please try again.', visibilityTime: 4000 })
  },
})
```

Add validation in handleCreate: selectedDriver required, periodStart and periodEnd required (YYYY-MM-DD format hint), basePay must be > 0.

Add `<BottomSheet visible={createVisible} onClose={() => setCreateVisible(false)} title="New Payroll Record" snapPoint="85%">` with a KeyboardAvoidingView + ScrollView inside containing:

- Driver picker: Pressable showing selected driver name or "Select driver *", opens a nested driver selection list (render driver options as Pressable rows inside the same sheet content, toggled by state — similar to how invoices/new.tsx does customer picker but inline rather than nested BottomSheet).
  - Actually, use a separate `<BottomSheet>` for driver picker (like invoices/new.tsx uses for customer picker). State: `driverPickerVisible`.
- Period Start: TextInput, placeholder "YYYY-MM-DD", hint "e.g. 2026-04-01"
- Period End: TextInput, placeholder "YYYY-MM-DD"
- Base Pay ($): TextInput, decimal-pad
- Bonuses ($): TextInput, decimal-pad, optional
- Deductions ($): TextInput, decimal-pad, optional
- Notes: TextInput, multiline, optional
- Submit button: "Create Payroll Record", disabled while `creating`, shows ActivityIndicator.

Use the `FormField` helper pattern (copy from crm/new.tsx — define inline in this file).

**3. FAB:**

Add `<PageSpeedDial>` (already imported for other screens) below the FlashList area:
```tsx
<PageSpeedDial
  primaryLabel="New Payroll"
  primaryIcon={DollarSign}
  primaryColor="#8b5cf6"
  onPrimaryPress={() => setCreateVisible(true)}
/>
```

The DollarSign icon is already imported in the file.
  </action>
  <verify>
Run `cd apps/mobile && npx tsc --noEmit` — no type errors.
Visually: open Payroll screen, tap a record — detail bottom sheet shows full pay breakdown. Tap FAB — create form appears, fill in driver + period + pay, submit — new record appears in list.
  </verify>
  <done>
Payroll rows are tappable and show detail bottom sheet with full pay breakdown. FAB opens create form bottom sheet with driver picker, period dates, pay fields, and notes. Created records appear in list after invalidation.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes (API routes compile)
2. `cd packages/api-client && npx tsc --noEmit` passes (new types/methods compile)
3. `cd apps/mobile && npx tsc --noEmit` passes (all screens compile)
4. CRM: list -> tap customer -> detail screen -> tap edit -> bottom sheet form -> save -> data updates
5. Payroll: list -> tap record -> detail sheet shows breakdown -> close -> tap FAB -> fill form -> create -> record in list
</verification>

<success_criteria>
- CRM contact detail screen shows all Customer model fields in organized sections
- CRM edit bottom sheet allows updating all editable fields with validation
- CRM list items navigate to detail on tap
- Payroll detail bottom sheet shows full pay breakdown (basePay, bonuses, deductions, totalPay)
- Payroll create form collects driver, period, pay amounts, and notes
- All 4 new API endpoints handle auth, validation, and error cases
- All 4 new api-client methods are typed and exported
- TypeScript compiles cleanly across web, api-client, and mobile packages
</success_criteria>

<output>
After completion, create `.planning/quick/143-mobile-owner-portal-complete-crm-contact/143-SUMMARY.md`
</output>
