---
phase: quick-69
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/maintenance.ts
  - src/components/maintenance/scheduled-service-form.tsx
  - src/components/maintenance/scheduled-service-list.tsx
  - src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx
  - src/app/(owner)/trucks/[id]/maintenance/[serviceId]/edit/page.tsx
autonomous: true
must_haves:
  truths:
    - "User can click Edit on any scheduled service row and navigate to the edit page"
    - "Edit page loads with all existing service values pre-filled"
    - "User can modify fields and save, which updates the record and redirects back"
  artifacts:
    - path: "src/app/(owner)/actions/maintenance.ts"
      provides: "getScheduledService and updateScheduledService server actions"
    - path: "src/app/(owner)/trucks/[id]/maintenance/[serviceId]/edit/page.tsx"
      provides: "Edit page for scheduled services"
    - path: "src/components/maintenance/scheduled-service-form.tsx"
      provides: "Form with initialValues support"
    - path: "src/components/maintenance/scheduled-service-list.tsx"
      provides: "Edit link in actions column"
  key_links:
    - from: "scheduled-service-list.tsx"
      to: "/trucks/${truckId}/maintenance/${id}/edit"
      via: "Link component"
    - from: "edit/page.tsx"
      to: "maintenance.ts"
      via: "getScheduledService + updateScheduledService"
---

<objective>
Add edit functionality for scheduled services on the truck maintenance page. Currently only delete exists -- this adds getScheduledService, updateScheduledService server actions, an edit page, and Edit links in the list table.

Purpose: Users need to modify scheduled service details (intervals, baseline dates, notes) after creation.
Output: Working edit flow for scheduled services.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/actions/maintenance.ts
@src/components/maintenance/scheduled-service-form.tsx
@src/components/maintenance/scheduled-service-list.tsx
@src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx
@src/app/(owner)/trucks/[id]/maintenance/schedule-service/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add server actions and update form for edit support</name>
  <files>
    src/app/(owner)/actions/maintenance.ts
    src/components/maintenance/scheduled-service-form.tsx
  </files>
  <action>
**In `src/app/(owner)/actions/maintenance.ts`**, add two new exported server actions after the existing `deleteScheduledService`:

1. `getScheduledService(id: string)`:
   - `await requireRole([UserRole.OWNER, UserRole.MANAGER])`
   - `const prisma = await getTenantPrisma()`
   - `// @ts-ignore - Prisma 7 withTenantRLS extension type issue`
   - `return prisma.scheduledService.findUnique({ where: { id } })` -- return the record or null

2. `updateScheduledService(truckId: string, serviceId: string, prevState: any, formData: FormData)`:
   - `await requireRole([UserRole.OWNER, UserRole.MANAGER])`
   - Parse FormData fields EXACTLY like `createScheduledService` does (serviceType, intervalDays, intervalMiles, baselineDate, baselineOdometer, notes)
   - Validate with `scheduledServiceCreateSchema.safeParse(rawData)` -- return `{ error: result.error.flatten().fieldErrors }` on failure
   - `const prisma = await getTenantPrisma()`
   - `// @ts-ignore - Prisma 7 withTenantRLS extension type issue`
   - `await prisma.scheduledService.update({ where: { id: serviceId }, data: { ...result.data } })`
   - `revalidatePath(\`/trucks/${truckId}/maintenance\`)`
   - `redirect(\`/trucks/${truckId}/maintenance\`)` -- MUST be OUTSIDE try/catch (Next.js NEXT_REDIRECT pattern)

**In `src/components/maintenance/scheduled-service-form.tsx`**, add optional `initialValues` prop:

- Add to `ScheduledServiceFormProps` interface:
  ```ts
  initialValues?: {
    serviceType?: string;
    intervalDays?: number | null;
    intervalMiles?: number | null;
    baselineDate?: string;
    baselineOdometer?: number;
    notes?: string | null;
  };
  ```
- Destructure `initialValues` in component props
- Update each input's `defaultValue`:
  - serviceType: `defaultValue={initialValues?.serviceType ?? ''}`
  - intervalDays: `defaultValue={initialValues?.intervalDays ?? ''}`
  - intervalMiles: `defaultValue={initialValues?.intervalMiles ?? ''}`
  - baselineDate: `defaultValue={initialValues?.baselineDate ?? today}`
  - baselineOdometer: `defaultValue={initialValues?.baselineOdometer ?? currentOdometer}`
  - notes textarea: `defaultValue={initialValues?.notes ?? ''}`
  </action>
  <verify>Run `npx tsc --noEmit` -- no type errors in modified files</verify>
  <done>getScheduledService and updateScheduledService actions exist and follow existing patterns. ScheduledServiceForm accepts and uses initialValues prop.</done>
</task>

<task type="auto">
  <name>Task 2: Create edit page and add Edit links to list</name>
  <files>
    src/app/(owner)/trucks/[id]/maintenance/[serviceId]/edit/page.tsx
    src/components/maintenance/scheduled-service-list.tsx
    src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx
  </files>
  <action>
**Create `src/app/(owner)/trucks/[id]/maintenance/[serviceId]/edit/page.tsx`:**

Model after the existing `schedule-service/page.tsx` layout. Key differences:

- `params: Promise<{ id: string; serviceId: string }>`
- Await params: `const { id, serviceId } = await params`
- Import `getTruck` from `@/app/(owner)/actions/trucks`, `getScheduledService` and `updateScheduledService` from `@/app/(owner)/actions/maintenance`
- Fetch both in parallel: `const [truck, service] = await Promise.all([getTruck(id), getScheduledService(serviceId)])`
- `if (!truck || !service) notFound()`
- Format baselineDate for the date input: `const baselineDate = service.baselineDate instanceof Date ? service.baselineDate.toISOString().split('T')[0] : String(service.baselineDate).split('T')[0]`
- Bind action: `const boundAction = updateScheduledService.bind(null, id, serviceId)`
- Render same layout as schedule-service page:
  - ArrowLeft back link to `/trucks/${id}/maintenance`
  - h1: "Edit Scheduled Service"
  - Subtitle: `{truck.year} {truck.make} {truck.model}`
  - Card with `<ScheduledServiceForm>` passing:
    - `action={boundAction}`
    - `currentOdometer={truck.odometer}`
    - `submitLabel="Update Service"`
    - `initialValues={{ serviceType: service.serviceType, intervalDays: service.intervalDays, intervalMiles: service.intervalMiles, baselineDate, baselineOdometer: service.baselineOdometer, notes: service.notes }}`

**In `src/components/maintenance/scheduled-service-list.tsx`:**

- Add `truckId: string` to the `ScheduledServiceListProps` interface
- Add `import Link from 'next/link'` at top
- Destructure `truckId` in component props
- Update the actions column cell (currently just a Delete button) to render a fragment with Edit link before Delete:
  ```tsx
  <>
    <Link href={`/trucks/${truckId}/maintenance/${row.original.id}/edit`} className="text-blue-600 hover:text-blue-800 font-medium mr-3">Edit</Link>
    <button onClick={() => handleDelete(row.original.id, row.original.serviceType)} className="text-red-600 hover:text-red-800 font-medium">Delete</button>
  </>
  ```

**In `src/app/(owner)/trucks/[id]/maintenance/maintenance-page-client.tsx`:**

- Add `truckId={truckId}` prop to the `<ScheduledServiceList>` component (line 53):
  `<ScheduledServiceList schedules={optimisticSchedules} onDelete={handleDeleteSchedule} truckId={truckId} />`
  </action>
  <verify>Run `npx tsc --noEmit` -- no type errors. Run `npm run build` to confirm the new dynamic route compiles. Navigate to a truck maintenance page and confirm Edit links appear next to Delete buttons.</verify>
  <done>Edit page exists at /trucks/[id]/maintenance/[serviceId]/edit, pre-fills form with existing values, saves updates and redirects back. Edit links visible in scheduled service list.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- `npm run build` succeeds
- Navigating to /trucks/{id}/maintenance shows Edit links on each scheduled service row
- Clicking Edit navigates to the edit page with pre-filled values
- Modifying a field and submitting updates the record and redirects back to the maintenance page
</verification>

<success_criteria>
- Scheduled services can be edited end-to-end: list -> edit page -> save -> redirect
- Form pre-fills all existing values correctly (serviceType, intervals, baseline date/odometer, notes)
- Edit uses same validation as create (scheduledServiceCreateSchema)
- All patterns match existing codebase (ts-ignore comments, redirect outside try/catch, role checks)
</success_criteria>

<output>
After completion, create `.planning/quick/69-tkt-0022-add-edit-functionality-for-sche/69-SUMMARY.md`
</output>
