---
task: 261
type: quick
title: "Add route template attachment to dispatch with stop inheritance, recurring badge, and auto-next-dispatch on completion"
files_modified:
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/lib/carrier/dispatch-generator.ts
  - apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
  - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/page.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/app/api/v1/carrier/route-templates/active/route.ts
---

<objective>
Add route template attachment to the dispatch create/edit workflow. When a template is selected, inherit stops from template on creation, show a "Recurring" badge with template link on dispatch detail, and auto-generate the next dispatch when a recurring dispatch is completed.

Purpose: Enables recurring dispatches to be created manually with template attachment (complementing the existing nightly cron auto-generator), closes the loop on the dispatch-template lifecycle.
Output: Template dropdown on create form, stop inheritance, recurring badge on detail, auto-next-dispatch on completion.
</objective>

<context>
@apps/web/prisma/schema.prisma (RouteTemplate lines 1445-1507, CarrierDispatch 1509-1550, CarrierStop 1601-1644, RouteTemplateStop 1484-1507)
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/dispatch-generator.ts
@apps/web/src/lib/carrier/route-templates.ts (computeNextOccurrence)
@apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
@apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
@apps/web/src/app/(owner)/carrier/dispatches/page.tsx
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
@apps/web/src/app/api/v1/carrier/dispatches/route.ts
@apps/web/src/components/carrier/templates/RouteTemplateList.tsx (formatRecurrenceRule helper)
@apps/web/src/lib/carrier/notifications.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: API endpoint for active templates + stop inheritance in createDispatch</name>
  <files>
    apps/web/src/app/api/v1/carrier/route-templates/active/route.ts
    apps/web/src/lib/carrier/dispatches.ts
  </files>
  <action>
**1a. Create GET `/api/v1/carrier/route-templates/active/route.ts`**

A lightweight endpoint for the template dropdown. Auth + tenant isolation as usual.

```
GET /api/v1/carrier/route-templates/active
```

Query: `prisma.routeTemplate.findMany` where `orgId` and `active: true`, select:
- `id`, `templateName`, `scheduleType`, `recurrenceRule`, `recurrenceTimezone`, `scheduledDepartureTime`, `estimatedMiles`, `defaultDriverId`, `defaultTruckId`
- Include `stops` (ordered by `sequenceOrder`), each with: `sequenceOrder`, `stopType`, `facilityId`, `facility` (select `name`, `city`, `state`)
- Include `client` (select `name`)
- Order by `templateName` asc.

Return `{ data: templates }`.

**1b. Modify `createDispatch` in `dispatches.ts` to inherit stops from template**

After the dispatch is created (line ~223), add:

```typescript
// If routeTemplateId is set, inherit stops from template
if (data.routeTemplateId) {
  const templateStops = await prisma.routeTemplateStop.findMany({
    where: { routeTemplateId: data.routeTemplateId },
    orderBy: { sequenceOrder: 'asc' },
    include: { facility: true },
  });

  for (const ts of templateStops) {
    // Compute appointment times from scheduled departure + offset
    let appointmentStart: Date | null = null;
    let appointmentEnd: Date | null = null;
    const depTime = dispatch.scheduledDeparture;

    if (ts.apptWindowStartOffsetMin != null) {
      appointmentStart = new Date(depTime.getTime() + ts.apptWindowStartOffsetMin * 60000);
    }
    if (ts.apptWindowEndOffsetMin != null) {
      appointmentEnd = new Date(depTime.getTime() + ts.apptWindowEndOffsetMin * 60000);
    }

    // Address snapshot in notes (same pattern as dispatch-generator.ts lines 325-334)
    const stopNotes = JSON.stringify({
      address_snapshot: {
        address_line1: ts.facility.addressLine1,
        city: ts.facility.city,
        state: ts.facility.state,
        zip: ts.facility.zip,
        lat: ts.facility.latitude,
        lng: ts.facility.longitude,
      },
    });

    await prisma.carrierStop.create({
      data: {
        dispatchId: dispatch.id,
        sequenceOrder: ts.sequenceOrder,
        stopType: ts.stopType,
        facilityId: ts.facilityId,
        contactName: ts.contactName,
        contactPhone: ts.contactPhone,
        appointmentStart,
        appointmentEnd,
        commodityDescription: ts.commodityDescription,
        specialInstructions: ts.specialInstructions,
        bolRequired: ts.bolRequired,
        podRequired: ts.podRequired,
        notes: stopNotes,
      },
    });
  }
}
```

Also in `createDispatch`, when `data.routeTemplateId` is provided, look up template to auto-populate:
- If `plannedMiles` not provided in `data`, use `template.estimatedMiles`
- Prepend template name to notes: e.g. `[DISPATCH_NUMBER=DC-...] [Template: Dallas-Houston Daily] user notes`

**1c. Modify `updateDispatch` for template attachment on edit**

When `data.routeTemplateId` is provided AND dispatch status is `planned`:
1. Update `routeTemplateId` on the dispatch
2. Delete all existing CarrierStop records for this dispatch (`prisma.carrierStop.deleteMany({ where: { dispatchId: id } })`)
3. Re-create stops from template using the same logic as in createDispatch above
4. If template has `estimatedMiles` and `plannedMiles` is not in the update payload, set it

Important: Only allow template changes when `status === 'planned'`. If status is anything else, ignore `routeTemplateId` in the update.
  </action>
  <verify>
- `curl` the active templates endpoint returns templates with stops + facility names
- Create a dispatch via POST with `routeTemplateId` set and verify CarrierStop records are created
- PATCH a planned dispatch with a different `routeTemplateId` and verify old stops deleted, new stops created
  </verify>
  <done>
Active templates API returns template list with stop previews. Creating a dispatch with a template auto-creates CarrierStop records from template stops. Editing a planned dispatch with a template replaces stops.
  </done>
</task>

<task type="auto">
  <name>Task 2: Template selector on create form + edit dialog with stop preview</name>
  <files>
    apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
    apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    apps/web/src/app/(owner)/carrier/dispatches/page.tsx
  </files>
  <action>
**2a. Update `NewDispatchForm` to add template dropdown**

Add props: no new server-side props needed — fetch templates client-side.

At the top of the component, add a `useEffect` that fetches `/api/v1/carrier/route-templates/active` and stores in state:
```typescript
const [templates, setTemplates] = useState<Template[]>([]);
const [selectedTemplateId, setSelectedTemplateId] = useState('');
```

Where `Template` type is:
```typescript
interface Template {
  id: string;
  templateName: string;
  recurrenceRule: string | null;
  scheduledDepartureTime: string | null;
  recurrenceTimezone: string;
  estimatedMiles: number | null;
  defaultDriverId: string | null;
  defaultTruckId: string | null;
  client: { name: string } | null;
  stops: Array<{
    sequenceOrder: number;
    stopType: string;
    facility: { name: string; city: string | null; state: string | null };
  }>;
}
```

Add the template dropdown **above** the Primary Driver field. Use the same `SELECT_CLASSES`. Label: "Route Template (optional)".

When a template is selected:
- Auto-populate `plannedMiles` from `template.estimatedMiles` (if not already set by user)
- Auto-populate `primaryDriverId` from `template.defaultDriverId` (if not already selected)
- Auto-populate `truckId` from `template.defaultTruckId` (if not already selected)
- Show a stop preview below the dropdown: a compact list showing stop sequence, type badge (pickup/delivery), and facility name + city/state. Use a light blue/muted background card. Example:
  ```
  Stop 1: Pickup - Dallas Distribution Center (Dallas, TX)
  Stop 2: Delivery - Houston Warehouse (Houston, TX)
  ```

In `handleSubmit`, include `routeTemplateId: selectedTemplateId || undefined` in the POST body.

**2b. Update `DispatchHeader` edit dialog to include template dropdown**

In the edit dialog (only shown when `dispatch.status === 'planned'`):
- Add a template dropdown similar to the create form
- Fetch templates on dialog open (or reuse from parent)
- When user selects a template and saves, include `routeTemplateId` in the PATCH payload
- Show a warning: "Changing the template will replace all existing stops"

The DispatchHeader already has `editForm` state. Add `routeTemplateId` to it. Initialize from the current `dispatch.routeTemplateId` (need to add this to the `DispatchHeaderProps.dispatch` type).

**2c. Update dispatch list page to pass template data if needed**

The `page.tsx` for dispatches list does NOT need template data — templates are fetched client-side in the form. No changes needed to this file unless the DispatchList component needs routeTemplateId for display (it does not currently).
  </action>
  <verify>
- Open `/carrier/dispatches`, click "New Dispatch"
- Template dropdown appears above driver/truck fields
- Selecting a template shows stop preview and auto-fills driver/truck/miles
- Edit dialog on a planned dispatch shows template dropdown with warning
- Submitting with a template creates dispatch with stops
  </verify>
  <done>
Template dropdown on create form with stop preview. Template dropdown on edit dialog with replacement warning. Auto-population of driver/truck/miles from template defaults.
  </done>
</task>

<task type="auto">
  <name>Task 3: Recurring badge on dispatch detail + auto-generate next dispatch on completion</name>
  <files>
    apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/lib/carrier/dispatches.ts
  </files>
  <action>
**3a. Recurring badge in DispatchHeader**

Add to `DispatchHeaderProps.dispatch`:
- `routeTemplateId: string | null`
- `routeTemplateName: string | null` (passed from server)
- `routeTemplateRecurrenceRule: string | null`
- `routeTemplateRecurrenceTimezone: string | null`
- `routeTemplateScheduledDepartureTime: string | null`

In the header JSX, next to the dispatch number and status badge (line ~357), when `dispatch.routeTemplateId` is truthy:

```tsx
{dispatch.routeTemplateId && (
  <>
    <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-2.5 py-0.5 text-xs font-medium">
      <RefreshCw className="h-3 w-3 mr-1" />
      Recurring
    </span>
    {dispatch.routeTemplateName && (
      <Link
        href={`/carrier/templates/${dispatch.routeTemplateId}`}
        className="text-sm text-primary hover:underline"
      >
        {dispatch.routeTemplateName}
      </Link>
    )}
  </>
)}
```

Import `RefreshCw` from lucide-react and `Link` from next/link.

Below the badge row, if `routeTemplateRecurrenceRule` is set, show schedule summary using the same `formatRecurrenceRule` logic from `RouteTemplateList.tsx`. Copy the helper into DispatchHeader (or extract to a shared util — use your judgment, keep it simple). Display like:
```
Recurrence: Monday-Friday at 06:00 CT
```

**3b. Pass template data from dispatch detail page**

In `apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx`:

After fetching the dispatch (line ~26), if `dispatch.routeTemplateId` is set, fetch the template:
```typescript
const routeTemplate = dispatch.routeTemplateId
  ? await prisma.routeTemplate.findFirst({
      where: { id: dispatch.routeTemplateId },
      select: { templateName: true, recurrenceRule: true, recurrenceTimezone: true, scheduledDepartureTime: true },
    })
  : null;
```

Pass to `DispatchHeader`:
```tsx
<DispatchHeader
  dispatch={{
    ...serializedDispatch,
    routeTemplateId: dispatch.routeTemplateId,
    routeTemplateName: routeTemplate?.templateName ?? null,
    routeTemplateRecurrenceRule: routeTemplate?.recurrenceRule ?? null,
    routeTemplateRecurrenceTimezone: routeTemplate?.recurrenceTimezone ?? null,
    routeTemplateScheduledDepartureTime: routeTemplate?.scheduledDepartureTime ?? null,
  }}
  ...existing props
/>
```

**3c. Auto-generate next dispatch on completion**

In `dispatches.ts`, in the `transitionDispatchStatus` function, inside the `in_progress -> completed` block (after line ~403 where pay records are generated), add:

```typescript
// Auto-generate next recurring dispatch if this dispatch has a template
if (dispatch.routeTemplateId) {
  after(async () => {
    try {
      const template = await prisma.routeTemplate.findFirst({
        where: { id: dispatch.routeTemplateId!, active: true },
        select: {
          id: true, recurrenceRule: true, recurrenceTimezone: true,
          scheduledDepartureTime: true, templateName: true,
          defaultDriverId: true, defaultTruckId: true, estimatedMiles: true,
          stops: { orderBy: { sequenceOrder: 'asc' }, include: { facility: true } },
        },
      });

      if (!template || !template.recurrenceRule) return;

      // Import computeNextOccurrence from route-templates.ts
      const nextDateStr = computeNextOccurrence(template.recurrenceRule, template.recurrenceTimezone);
      if (!nextDateStr) return;

      // Check if dispatch already exists for that date + template
      const dayStart = new Date(`${nextDateStr}T00:00:00`);
      const dayEnd = new Date(`${nextDateStr}T23:59:59`);
      const existingNext = await prisma.carrierDispatch.findFirst({
        where: {
          routeTemplateId: template.id,
          orgId,
          scheduledDeparture: { gte: dayStart, lt: dayEnd },
        },
      });
      if (existingNext) return; // Already generated (by cron or previous completion)

      // Use driver/truck from completed dispatch (may differ from template defaults)
      const driverId = dispatch.primaryDriverId;
      const truckId = dispatch.truckId;

      // Generate dispatch number
      const year = new Date().getFullYear();
      const lastDispatchForNumber = await prisma.carrierDispatch.findFirst({
        where: { orgId, notes: { contains: `DC-${year}-` } },
        orderBy: { createdAt: 'desc' },
        select: { notes: true },
      });
      let lastSeq = 0;
      if (lastDispatchForNumber?.notes) {
        const match = lastDispatchForNumber.notes.match(/\[DISPATCH_NUMBER=DC-\d{4}-(\d{5})\]/);
        if (match) lastSeq = parseInt(match[1], 10);
      }
      const nextDispatchNumber = `DC-${year}-${String(lastSeq + 1).padStart(5, '0')}`;

      // Compute scheduled departure for next date
      const [h, m] = (template.scheduledDepartureTime ?? '08:00').split(':').map(Number);
      const scheduledDeparture = new Date(`${nextDateStr}T00:00:00`);
      scheduledDeparture.setHours(h ?? 8, m ?? 0, 0, 0);

      const nextDispatch = await prisma.carrierDispatch.create({
        data: {
          orgId,
          routeTemplateId: template.id,
          primaryDriverId: driverId,
          truckId: truckId,
          scheduledDeparture,
          status: 'planned',
          plannedMiles: template.estimatedMiles ?? null,
          notes: `[DISPATCH_NUMBER=${nextDispatchNumber}] [Template: ${template.templateName}]`,
        },
      });

      // Clone stops from template (same as createDispatch stop inheritance)
      for (const ts of template.stops) {
        const stopNotes = JSON.stringify({
          address_snapshot: {
            address_line1: ts.facility.addressLine1,
            city: ts.facility.city,
            state: ts.facility.state,
            zip: ts.facility.zip,
            lat: ts.facility.latitude,
            lng: ts.facility.longitude,
          },
        });

        await prisma.carrierStop.create({
          data: {
            dispatchId: nextDispatch.id,
            sequenceOrder: ts.sequenceOrder,
            stopType: ts.stopType,
            facilityId: ts.facilityId,
            contactName: ts.contactName,
            contactPhone: ts.contactPhone,
            commodityDescription: ts.commodityDescription,
            specialInstructions: ts.specialInstructions,
            bolRequired: ts.bolRequired,
            podRequired: ts.podRequired,
            notes: stopNotes,
          },
        });
      }

      // Notify driver about next scheduled dispatch
      const driver = await prisma.carrierDriver.findFirst({
        where: { id: driverId },
        select: { userId: true },
      });
      if (driver?.userId) {
        await sendPushToUser(driver.userId, {
          title: 'Next Recurring Dispatch',
          body: `${nextDispatchNumber} has been scheduled for ${nextDateStr}`,
          data: { type: 'dispatch_assigned', dispatchId: nextDispatch.id },
        });
        await createNotification({
          orgId,
          userId: driver.userId,
          type: 'dispatch_assigned',
          title: 'Next Recurring Dispatch Scheduled',
          message: `Your next recurring dispatch ${nextDispatchNumber} has been automatically scheduled for ${nextDateStr}.`,
          entityType: 'dispatch',
          entityId: nextDispatch.id,
        });
      }

      logger.info('transitionDispatchStatus: auto-generated next recurring dispatch', {
        orgId,
        completedDispatchId: id,
        nextDispatchId: nextDispatch.id,
        nextDispatchNumber,
        nextDate: nextDateStr,
      });
    } catch (err) {
      logger.error('transitionDispatchStatus: auto-generate next dispatch failed', { dispatchId: id, err });
    }
  });
}
```

Add import at top of `dispatches.ts`:
```typescript
import { computeNextOccurrence } from '@/lib/carrier/route-templates';
import { createNotification } from '@/lib/carrier/in-app-notifications';
```

(`sendPushToUser` and `createNotification` are already imported.)

CRITICAL: The `after()` pattern ensures this never blocks dispatch completion. If it fails, the dispatch is still completed. Errors are logged but not thrown.

CRITICAL: Do NOT modify the nightly cron in `apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts`. The cron and this completion-triggered generation can coexist — the duplicate check (`existingNext`) prevents double-creation.
  </action>
  <verify>
- Dispatch detail page for a dispatch with `routeTemplateId` shows purple "Recurring" badge next to dispatch number
- Template name is a clickable link to `/carrier/templates/[id]`
- Recurrence schedule summary is displayed (e.g. "MWF 06:00 CT")
- Complete a recurring dispatch and verify:
  - A new dispatch is created with the next scheduled date
  - New dispatch has stops from template
  - Push notification sent to driver
  - If next date already has a dispatch, no duplicate is created
- `tsc --noEmit` passes
  </verify>
  <done>
Recurring badge with template link and schedule summary on dispatch detail. Auto-generation of next recurring dispatch on completion with duplicate prevention, stop cloning, and driver notification. Nightly cron unmodified and coexists safely.
  </done>
</task>

</tasks>

<verification>
1. Create a dispatch without a template — works exactly as before (no regression)
2. Create a dispatch with a template — stops appear immediately on detail page
3. Edit a planned dispatch to attach a template — old stops replaced with template stops
4. Dispatch detail shows "Recurring" badge + template link + schedule summary for template dispatches
5. Complete a recurring dispatch — next dispatch auto-created with correct date, stops, and notification
6. Complete a recurring dispatch when next date already has a dispatch — no duplicate created
7. `tsc --noEmit` passes with no errors
</verification>

<success_criteria>
- Template dropdown on create form with stop preview and auto-fill
- Template dropdown on edit dialog (planned status only) with stop replacement
- Stop inheritance from template on dispatch creation and edit
- Purple "Recurring" badge with template link on dispatch detail
- Auto-next-dispatch on completion using after() pattern
- No changes to nightly cron generator
- No changes to driver portal
- TypeScript compiles cleanly
</success_criteria>
