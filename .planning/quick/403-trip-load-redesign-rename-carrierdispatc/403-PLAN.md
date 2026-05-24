---
quick: 403
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/lib/carrier/trips.ts
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx
  - apps/web/src/app/(carrier-driver)/trips/page.tsx
  - apps/web/src/app/(carrier-driver)/trips/[id]/page.tsx
  - apps/web/src/components/carrier/loads/DispatchLoadModal.tsx
  - apps/web/src/components/carrier/trips/TripPlanEditor.tsx
  - apps/web/src/components/carrier/trips/StopCard.tsx
autonomous: true

must_haves:
  truths:
    - "Prisma model is named Trip (not CarrierDispatch) with @@map('dispatches')"
    - "Owner can dispatch a load to a new or existing trip from load detail page"
    - "Owner can view trip plan screen with ordered stops and drag-drop reorder"
    - "Cancelling a load prompts to remove that load's stops from any assigned trip"
    - "Driver can view their trips at /carrier/driver/trips with stops in dispatcher order"
    - "CarrierStop has checklistStatus, deferredReason, checklistEntityId fields for future workflow integration"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "Trip model rename + CarrierStop checklist fields"
      contains: "model Trip"
    - path: "apps/web/src/lib/carrier/trips.ts"
      provides: "Trip CRUD operations (renamed from dispatches)"
      exports: ["listTrips", "getTrip", "createTrip", "updateTrip", "reorderTripStops"]
    - path: "apps/web/src/components/carrier/loads/DispatchLoadModal.tsx"
      provides: "Modal to dispatch load to new or existing trip"
      min_lines: 100
    - path: "apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx"
      provides: "Trip plan screen with stop reordering"
      min_lines: 50
    - path: "apps/web/src/app/(carrier-driver)/trips/[id]/page.tsx"
      provides: "Driver trip view with stops in dispatcher order"
      min_lines: 50
  key_links:
    - from: "apps/web/src/components/carrier/loads/DispatchLoadModal.tsx"
      to: "apps/web/src/lib/carrier/trips.ts"
      via: "createTrip() or updateTrip() call"
      pattern: "createTrip|updateTrip"
    - from: "apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx"
      to: "apps/web/src/lib/carrier/trips.ts"
      via: "reorderTripStops() call"
      pattern: "reorderTripStops"
---

<objective>
Rename CarrierDispatch to Trip, build dispatch-a-load flow, trip plan screen with reorder, load cancellation with stop removal, and driver trip view with checklist hooks.

Purpose: Align mental model (Load = commercial job, Trip = execution) with Prisma model naming. Enable multi-load trips (LTL, backhaul) with proper stop sequencing.

Output: Renamed Trip model, dispatch-a-load modal, trip plan editor, load cancellation cleanup, driver trip view with checklist field integration seams.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/investigations/trip-load-redesign-findings.md
@apps/web/prisma/schema.prisma
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/lib/carrier/stop-completion.ts
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
@apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema - Rename CarrierDispatch to Trip + Add CarrierStop checklist fields</name>
  <files>
    apps/web/prisma/schema.prisma
  </files>
  <action>
1. Rename the Prisma model from `CarrierDispatch` to `Trip`:
   - Keep `@@map("dispatches")` so the underlying table name stays the same
   - Update all relation names: `PrimaryDriver`, `CoDriver`, `PrimaryTruck`, `TrailerTruck`, `CarrierDispatcher`
   - Update reverse relations on `CarrierDriver`, `CarrierTruck`, `User`, `Tenant`, `RouteTemplate`, `CarrierLoad`, `CarrierStop`, `CarrierExpense`, `DriverPayRecord`, `FleetMessage`, `CarrierDocument`

2. Add three new fields to `CarrierStop` model for future checklist/workflow integration:
   ```prisma
   checklistStatus     String?   @map("checklist_status")       // pending | in_progress | completed | deferred
   deferredReason      String?   @map("deferred_reason")        // Why stop completion was deferred
   checklistEntityId   String?   @map("checklist_entity_id") @db.Uuid  // FK to PlaybookInstance when workflow engine supports stops
   ```

3. Run `npx prisma generate` to regenerate the client.

4. Create migration: `npx prisma migrate dev --name rename-carrier-dispatch-to-trip-add-stop-checklist-fields`

Note: The rename is Prisma-model-only. DB table stays `dispatches`. This is a non-breaking change.
  </action>
  <verify>
    - `npx prisma validate` passes
    - `npx prisma generate` succeeds
    - `grep -r "model Trip" apps/web/prisma/schema.prisma` returns the renamed model
    - `grep -r "checklistStatus" apps/web/prisma/schema.prisma` returns the new field
  </verify>
  <done>
    - Prisma model is `Trip` with `@@map("dispatches")`
    - CarrierStop has `checklistStatus`, `deferredReason`, `checklistEntityId` fields
    - Generated Prisma client uses `prisma.trip` instead of `prisma.carrierDispatch`
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor lib/carrier - Create trips.ts + Update all Prisma references</name>
  <files>
    apps/web/src/lib/carrier/trips.ts
    apps/web/src/lib/carrier/dispatches.ts
    apps/web/src/lib/carrier/loads.ts
    apps/web/src/lib/carrier/stop-completion.ts
    apps/web/src/lib/carrier/pay-calculator.ts
    apps/web/src/lib/carrier/notifications.ts
  </files>
  <action>
1. Create `apps/web/src/lib/carrier/trips.ts`:
   - Copy all functions from `dispatches.ts`
   - Rename all function names: `listDispatches` -> `listTrips`, `getDispatch` -> `getTrip`, `createDispatch` -> `createTrip`, `updateDispatch` -> `updateTrip`, `transitionDispatchStatus` -> `transitionTripStatus`
   - Replace all `prisma.carrierDispatch` with `prisma.trip`
   - Add new function `reorderTripStops(orgId: string, tripId: string, stopOrder: string[])`:
     ```typescript
     export async function reorderTripStops(
       orgId: string,
       tripId: string,
       stopOrder: string[]  // Array of stop IDs in new order
     ): Promise<{ success: boolean } | { error: string }> {
       const trip = await prisma.trip.findFirst({ where: { id: tripId, orgId } });
       if (!trip) return { error: 'Trip not found' };
       if (trip.status !== 'planned') return { error: 'Can only reorder stops on planned trips' };

       // Validate all stopIds belong to this trip
       const existingStops = await prisma.carrierStop.findMany({
         where: { dispatchId: tripId },
         select: { id: true },
       });
       const existingIds = new Set(existingStops.map(s => s.id));
       for (const id of stopOrder) {
         if (!existingIds.has(id)) return { error: `Stop ${id} does not belong to this trip` };
       }

       // Update sequence_order for each stop in transaction
       await prisma.$transaction(
         stopOrder.map((stopId, index) =>
           prisma.carrierStop.update({
             where: { id: stopId },
             data: { sequenceOrder: index + 1 },
           })
         )
       );

       return { success: true };
     }
     ```
   - Add `addLoadToTrip(orgId: string, tripId: string, loadId: string)` function:
     - Validates trip exists and is in `planned` status
     - Validates load exists and has no dispatchId (or is being reassigned)
     - Updates `CarrierLoad.dispatchId = tripId`
     - Persists any `pendingStopsJson` as `CarrierStop` records
     - Returns updated trip with stops
   - Export type aliases: `export type Trip = Awaited<ReturnType<typeof getTrip>>`

2. Update `dispatches.ts`:
   - Keep the file but make it a re-export wrapper for backward compatibility:
     ```typescript
     // DEPRECATED: Use trips.ts instead. This file exists for backward compatibility.
     export * from './trips';

     // Aliases for gradual migration
     export { listTrips as listDispatches } from './trips';
     export { getTrip as getDispatch } from './trips';
     export { createTrip as createDispatch } from './trips';
     export { updateTrip as updateDispatch } from './trips';
     export { transitionTripStatus as transitionDispatchStatus } from './trips';
     ```

3. Update `loads.ts`:
   - Replace all `prisma.carrierDispatch` with `prisma.trip`
   - Add `removeLoadFromTrip(orgId: string, loadId: string, removeStops: boolean)` function:
     - If `removeStops=true`, delete all `CarrierStop` records where `loadId = loadId` AND `status = 'pending'`
     - Set `CarrierLoad.dispatchId = null`
     - Return count of removed stops

4. Update `stop-completion.ts`:
   - Replace all `prisma.carrierDispatch` with `prisma.trip`

5. Update `pay-calculator.ts`:
   - Replace all `prisma.carrierDispatch` with `prisma.trip`

6. Update `notifications.ts`:
   - Replace all `prisma.carrierDispatch` with `prisma.trip`
  </action>
  <verify>
    - `npx tsc --noEmit` passes in apps/web
    - All lib/carrier/*.ts files compile without errors
    - `grep -r "prisma.carrierDispatch" apps/web/src/lib/carrier/` returns no results
  </verify>
  <done>
    - `trips.ts` exists with all trip CRUD + `reorderTripStops` + `addLoadToTrip`
    - `dispatches.ts` is a backward-compat re-export wrapper
    - `loads.ts` has `removeLoadFromTrip` function
    - All Prisma calls use `prisma.trip` instead of `prisma.carrierDispatch`
  </done>
</task>

<task type="auto">
  <name>Task 3: Update all page/component imports from dispatches to trips</name>
  <files>
    apps/web/src/app/(owner)/carrier/dispatches/page.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
    apps/web/src/app/(owner)/carrier/dispatches/_grid/DispatchesGrid.tsx
    apps/web/src/app/(owner)/carrier/dispatches/_grid/columns.tsx
    apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
    apps/web/src/components/carrier/dispatches/DispatchExpensesPanel.tsx
    apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx
    apps/web/src/components/carrier/dispatches/DispatchMessages.tsx
    apps/web/src/components/carrier/dispatches/StopTimeline.tsx
  </files>
  <action>
1. In all files under `apps/web/src/app/(owner)/carrier/dispatches/`:
   - Update imports: `from '@/lib/carrier/dispatches'` -> `from '@/lib/carrier/trips'`
   - Update function calls: `getDispatch` -> `getTrip`, `listDispatches` -> `listTrips`, etc.
   - Update Prisma calls: `prisma.carrierDispatch` -> `prisma.trip`
   - Keep URL paths as `/carrier/dispatches/*` for now (URL rename is a separate task)

2. In all files under `apps/web/src/components/carrier/dispatches/`:
   - Update Prisma type imports if any
   - Props types can stay as-is (they're local types, not Prisma types)

3. Run grep to find any remaining `carrierDispatch` references:
   ```bash
   grep -r "carrierDispatch" apps/web/src/app/\(owner\)/carrier/dispatches/
   grep -r "carrierDispatch" apps/web/src/components/carrier/dispatches/
   ```

4. Fix any API routes that reference `carrierDispatch`:
   - `apps/web/src/app/api/v1/carrier/dispatches/*/route.ts`
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - `grep -r "carrierDispatch" apps/web/src/app/\(owner\)/carrier/dispatches/` returns no results
    - `grep -r "carrierDispatch" apps/web/src/components/carrier/dispatches/` returns no results
    - Pages still render (manual check: visit /carrier/dispatches in browser)
  </verify>
  <done>
    - All dispatch pages use `prisma.trip` and import from `trips.ts`
    - TypeScript compiles without errors
    - Existing functionality preserved (backward compat via re-exports)
  </done>
</task>

<task type="auto">
  <name>Task 4: Build DispatchLoadModal component</name>
  <files>
    apps/web/src/components/carrier/loads/DispatchLoadModal.tsx
    apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  </files>
  <action>
1. Create `apps/web/src/components/carrier/loads/DispatchLoadModal.tsx`:
   ```typescript
   'use client';

   import { useState, useEffect } from 'react';
   import { useRouter } from 'next/navigation';
   import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
   import { Button } from '@/components/ui/button';
   import { Label } from '@/components/ui/label';
   import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
   import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
   import { toast } from 'sonner';
   import { Loader2 } from 'lucide-react';

   interface DispatchLoadModalProps {
     open: boolean;
     onOpenChange: (open: boolean) => void;
     loadId: string;
     loadRefNumber: string;
     drivers: { id: string; name: string }[];
     trucks: { id: string; unitNumber: string }[];
   }

   export function DispatchLoadModal({
     open,
     onOpenChange,
     loadId,
     loadRefNumber,
     drivers,
     trucks,
   }: DispatchLoadModalProps) {
     const router = useRouter();
     const [mode, setMode] = useState<'new' | 'existing'>('new');
     const [selectedTrip, setSelectedTrip] = useState<string>('');
     const [selectedDriver, setSelectedDriver] = useState<string>('');
     const [selectedTruck, setSelectedTruck] = useState<string>('');
     const [scheduledDeparture, setScheduledDeparture] = useState<string>('');
     const [existingTrips, setExistingTrips] = useState<{ id: string; label: string }[]>([]);
     const [loading, setLoading] = useState(false);
     const [loadingTrips, setLoadingTrips] = useState(false);

     // Fetch existing planned trips when modal opens
     useEffect(() => {
       if (open && mode === 'existing') {
         setLoadingTrips(true);
         fetch('/api/v1/carrier/trips?status=planned&pageSize=50')
           .then((res) => res.json())
           .then((data) => {
             setExistingTrips(
               data.items?.map((t: any) => ({
                 id: t.id,
                 label: `${extractTripNumber(t.notes)} - ${t.primaryDriver?.firstName} ${t.primaryDriver?.lastName} - ${new Date(t.scheduledDeparture).toLocaleDateString()}`,
               })) ?? []
             );
           })
           .finally(() => setLoadingTrips(false));
       }
     }, [open, mode]);

     const handleSubmit = async () => {
       setLoading(true);
       try {
         if (mode === 'new') {
           // Create new trip with this load
           const res = await fetch('/api/v1/carrier/trips', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               primaryDriverId: selectedDriver,
               truckId: selectedTruck,
               scheduledDeparture: scheduledDeparture || new Date().toISOString(),
               loadIds: [loadId],  // New field to attach load(s) on creation
             }),
           });
           if (!res.ok) throw new Error('Failed to create trip');
           const trip = await res.json();
           toast.success(`Load dispatched to new trip ${extractTripNumber(trip.notes)}`);
           router.push(`/carrier/trips/${trip.id}/plan`);
         } else {
           // Add load to existing trip
           const res = await fetch(`/api/v1/carrier/trips/${selectedTrip}/loads`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ loadId }),
           });
           if (!res.ok) throw new Error('Failed to add load to trip');
           toast.success('Load added to trip');
           router.push(`/carrier/trips/${selectedTrip}/plan`);
         }
         onOpenChange(false);
       } catch (err) {
         toast.error(err instanceof Error ? err.message : 'Failed to dispatch load');
       } finally {
         setLoading(false);
       }
     };

     return (
       <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md">
           <DialogHeader>
             <DialogTitle>Dispatch Load {loadRefNumber}</DialogTitle>
             <DialogDescription>
               Add this load to a new trip or an existing planned trip.
             </DialogDescription>
           </DialogHeader>

           <div className="space-y-4 py-4">
             <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'new' | 'existing')}>
               <div className="flex items-center space-x-2">
                 <RadioGroupItem value="new" id="new" />
                 <Label htmlFor="new">Create new trip</Label>
               </div>
               <div className="flex items-center space-x-2">
                 <RadioGroupItem value="existing" id="existing" />
                 <Label htmlFor="existing">Add to existing trip</Label>
               </div>
             </RadioGroup>

             {mode === 'new' ? (
               <div className="space-y-3">
                 <div>
                   <Label>Driver</Label>
                   <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                     <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                     <SelectContent>
                       {drivers.map((d) => (
                         <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <Label>Truck</Label>
                   <Select value={selectedTruck} onValueChange={setSelectedTruck}>
                     <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                     <SelectContent>
                       {trucks.map((t) => (
                         <SelectItem key={t.id} value={t.id}>{t.unitNumber}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <Label>Scheduled Departure</Label>
                   <input
                     type="datetime-local"
                     className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                     value={scheduledDeparture}
                     onChange={(e) => setScheduledDeparture(e.target.value)}
                   />
                 </div>
               </div>
             ) : (
               <div>
                 <Label>Select Trip</Label>
                 {loadingTrips ? (
                   <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                     <Loader2 className="h-4 w-4 animate-spin" /> Loading trips...
                   </div>
                 ) : (
                   <Select value={selectedTrip} onValueChange={setSelectedTrip}>
                     <SelectTrigger><SelectValue placeholder="Select a planned trip" /></SelectTrigger>
                     <SelectContent>
                       {existingTrips.map((t) => (
                         <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 )}
               </div>
             )}
           </div>

           <DialogFooter>
             <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
             <Button
               onClick={handleSubmit}
               disabled={loading || (mode === 'new' ? !selectedDriver || !selectedTruck : !selectedTrip)}
             >
               {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               {mode === 'new' ? 'Create Trip' : 'Add to Trip'}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     );
   }

   function extractTripNumber(notes: string | null): string {
     const match = notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
     return match ? match[1] : 'New Trip';
   }
   ```

2. Update `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx`:
   - Add "Dispatch this Load" button to `LoadDetailActions` component (or inline)
   - Only show button if `load.dispatchId` is null AND `load.status === 'pending'`
   - Wire up the modal with drivers and trucks props

3. Create API route `apps/web/src/app/api/v1/carrier/trips/[id]/loads/route.ts`:
   - POST handler that calls `addLoadToTrip(orgId, tripId, loadId)`
   - Returns updated trip data
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Modal renders without errors (manual check)
    - API route returns 200 on valid request
  </verify>
  <done>
    - DispatchLoadModal component exists with new/existing trip modes
    - Load detail page shows "Dispatch this Load" button when appropriate
    - API route `/api/v1/carrier/trips/[id]/loads` handles adding loads to trips
  </done>
</task>

<task type="auto">
  <name>Task 5: Build Trip Plan screen with stop reorder</name>
  <files>
    apps/web/src/app/(owner)/carrier/trips/page.tsx
    apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx
    apps/web/src/components/carrier/trips/TripPlanEditor.tsx
    apps/web/src/components/carrier/trips/StopCard.tsx
  </files>
  <action>
1. Create route alias: `/carrier/trips` should exist alongside `/carrier/dispatches`:
   - Create `apps/web/src/app/(owner)/carrier/trips/page.tsx` as a redirect or symlink to dispatches page
   - OR: Copy the dispatches page structure to trips/ (preferred for future divergence)

2. Create `apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx`:
   - Redirect to `/carrier/dispatches/[id]` for now, or copy the dispatch detail page

3. Create `apps/web/src/app/(owner)/carrier/trips/[id]/plan/page.tsx`:
   ```typescript
   import { notFound, redirect } from 'next/navigation';
   import { getSession } from '@/lib/auth/supabase';
   import { getTrip } from '@/lib/carrier/trips';
   import { prisma } from '@/lib/db/prisma';
   import { TripPlanEditor } from '@/components/carrier/trips/TripPlanEditor';
   import { ArrowLeft } from 'lucide-react';
   import Link from 'next/link';

   interface Props {
     params: Promise<{ id: string }>;
   }

   export default async function TripPlanPage({ params }: Props) {
     const session = await getSession();
     if (!session) redirect('/login');
     const orgId = session.tenantId;
     if (!orgId) redirect('/login');

     const { id } = await params;
     const trip = await getTrip(orgId, id);
     if (!trip) notFound();

     // Fetch facility details for all stops
     const facilityIds = [...new Set(trip.stops.map((s) => s.facilityId))];
     const facilities = await prisma.carrierFacility.findMany({
       where: { id: { in: facilityIds }, orgId },
       select: { id: true, name: true, city: true, state: true },
     });
     const facilityMap = Object.fromEntries(facilities.map((f) => [f.id, f]));

     // Fetch load reference numbers for each stop
     const loadIds = [...new Set(trip.stops.filter((s) => s.loadId).map((s) => s.loadId!))];
     const loads = loadIds.length
       ? await prisma.carrierLoad.findMany({
           where: { id: { in: loadIds } },
           select: { id: true, referenceNumber: true, client: { select: { name: true } } },
         })
       : [];
     const loadMap = Object.fromEntries(loads.map((l) => [l.id, l]));

     // Serialize for client
     const stopsForEditor = trip.stops.map((s) => ({
       id: s.id,
       sequenceOrder: s.sequenceOrder,
       stopType: s.stopType,
       status: s.status,
       loadId: s.loadId,
       loadRefNumber: s.loadId ? loadMap[s.loadId]?.referenceNumber ?? null : null,
       clientName: s.loadId ? loadMap[s.loadId]?.client?.name ?? null : null,
       facilityName: facilityMap[s.facilityId]?.name ?? 'Unknown',
       facilityCity: facilityMap[s.facilityId]?.city ?? null,
       facilityState: facilityMap[s.facilityId]?.state ?? null,
       appointmentStart: s.appointmentStart?.toISOString() ?? null,
       appointmentEnd: s.appointmentEnd?.toISOString() ?? null,
     }));

     // Parse trip number from notes
     const tripNumberMatch = trip.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
     const tripNumber = tripNumberMatch ? tripNumberMatch[1] : trip.id.slice(0, 8);

     return (
       <div className="space-y-6">
         <div>
           <Link
             href={`/carrier/trips/${id}`}
             className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
           >
             <ArrowLeft className="h-4 w-4" />
             Back to Trip Detail
           </Link>
         </div>

         <div>
           <h1 className="text-2xl font-bold">Trip Plan: {tripNumber}</h1>
           <p className="text-muted-foreground">
             Drag and drop stops to reorder. Changes save automatically.
           </p>
         </div>

         <TripPlanEditor
           tripId={id}
           tripStatus={trip.status}
           stops={stopsForEditor}
         />
       </div>
     );
   }
   ```

4. Create `apps/web/src/components/carrier/trips/TripPlanEditor.tsx`:
   - Client component with drag-and-drop (use @dnd-kit/core or react-beautiful-dnd)
   - Maps over stops, renders StopCard for each
   - On drag end, calls `/api/v1/carrier/trips/[id]/reorder` with new stop order
   - Shows disabled state if trip is not in `planned` status

5. Create `apps/web/src/components/carrier/trips/StopCard.tsx`:
   - Displays stop info: sequence #, facility name, city/state, stop type badge, load reference
   - Shows appointment window if set
   - Drag handle on the left
   - Status indicator (pending/arrived/completed/skipped)

6. Create API route `apps/web/src/app/api/v1/carrier/trips/[id]/reorder/route.ts`:
   - POST handler that calls `reorderTripStops(orgId, tripId, stopOrder)`
   - Body: `{ stopOrder: string[] }` - array of stop IDs in new order
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - `/carrier/trips/[id]/plan` page renders with stops
    - Drag-and-drop reordering works (manual test)
    - API returns 200 and updates sequence_order in DB
  </verify>
  <done>
    - Trip plan page exists at `/carrier/trips/[id]/plan`
    - TripPlanEditor component with drag-drop reordering
    - StopCard component with load labels and facility info
    - Reorder API endpoint functional
  </done>
</task>

<task type="auto">
  <name>Task 6: Load cancellation with stop removal prompt</name>
  <files>
    apps/web/src/components/carrier/loads/LoadDetailActions.tsx
    apps/web/src/components/carrier/loads/CancelLoadModal.tsx
    apps/web/src/app/api/v1/carrier/loads/[id]/cancel/route.ts
  </files>
  <action>
1. Create `apps/web/src/components/carrier/loads/CancelLoadModal.tsx`:
   ```typescript
   'use client';

   import { useState } from 'react';
   import { useRouter } from 'next/navigation';
   import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
   import { Button } from '@/components/ui/button';
   import { Checkbox } from '@/components/ui/checkbox';
   import { Label } from '@/components/ui/label';
   import { Textarea } from '@/components/ui/textarea';
   import { toast } from 'sonner';
   import { Loader2, AlertTriangle } from 'lucide-react';

   interface CancelLoadModalProps {
     open: boolean;
     onOpenChange: (open: boolean) => void;
     loadId: string;
     loadRefNumber: string;
     dispatchId: string | null;
     pendingStopCount: number;  // Number of pending stops for this load on the trip
   }

   export function CancelLoadModal({
     open,
     onOpenChange,
     loadId,
     loadRefNumber,
     dispatchId,
     pendingStopCount,
   }: CancelLoadModalProps) {
     const router = useRouter();
     const [removeStops, setRemoveStops] = useState(true);
     const [reason, setReason] = useState('');
     const [loading, setLoading] = useState(false);

     const handleCancel = async () => {
       setLoading(true);
       try {
         const res = await fetch(`/api/v1/carrier/loads/${loadId}/cancel`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ removeStops, reason }),
         });
         if (!res.ok) {
           const data = await res.json();
           throw new Error(data.error || 'Failed to cancel load');
         }
         toast.success(`Load ${loadRefNumber} cancelled`);
         router.push('/carrier/loads');
         router.refresh();
       } catch (err) {
         toast.error(err instanceof Error ? err.message : 'Failed to cancel');
       } finally {
         setLoading(false);
       }
     };

     return (
       <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <AlertTriangle className="h-5 w-5 text-destructive" />
               Cancel Load {loadRefNumber}
             </DialogTitle>
             <DialogDescription>
               This action cannot be undone. The load status will be set to cancelled.
             </DialogDescription>
           </DialogHeader>

           <div className="space-y-4 py-4">
             {dispatchId && pendingStopCount > 0 && (
               <div className="flex items-start space-x-2 p-3 bg-muted rounded-md">
                 <Checkbox
                   id="removeStops"
                   checked={removeStops}
                   onCheckedChange={(c) => setRemoveStops(c === true)}
                 />
                 <div>
                   <Label htmlFor="removeStops" className="font-medium">
                     Remove {pendingStopCount} pending stop{pendingStopCount > 1 ? 's' : ''} from trip
                   </Label>
                   <p className="text-sm text-muted-foreground">
                     Uncheck to keep the stops on the trip (e.g., if another load will use them).
                   </p>
                 </div>
               </div>
             )}

             <div>
               <Label htmlFor="reason">Cancellation Reason (optional)</Label>
               <Textarea
                 id="reason"
                 value={reason}
                 onChange={(e) => setReason(e.target.value)}
                 placeholder="e.g., Customer cancelled, load rebooked with another carrier..."
               />
             </div>
           </div>

           <DialogFooter>
             <Button variant="outline" onClick={() => onOpenChange(false)}>
               Keep Load
             </Button>
             <Button variant="destructive" onClick={handleCancel} disabled={loading}>
               {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               Cancel Load
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     );
   }
   ```

2. Update `apps/web/src/components/carrier/loads/LoadDetailActions.tsx`:
   - Add "Cancel Load" button (only show if status is not already cancelled)
   - Count pending stops for this load: fetch from API or pass as prop
   - Wire up CancelLoadModal

3. Create API route `apps/web/src/app/api/v1/carrier/loads/[id]/cancel/route.ts`:
   ```typescript
   import { NextRequest, NextResponse } from 'next/server';
   import { getSession } from '@/lib/auth/supabase';
   import { prisma } from '@/lib/db/prisma';
   import { removeLoadFromTrip, updateLoad } from '@/lib/carrier/loads';

   export async function POST(
     request: NextRequest,
     { params }: { params: Promise<{ id: string }> }
   ) {
     const session = await getSession();
     if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

     const { id } = await params;
     const { removeStops, reason } = await request.json();

     const load = await prisma.carrierLoad.findFirst({
       where: { id, orgId: session.tenantId },
     });
     if (!load) return NextResponse.json({ error: 'Load not found' }, { status: 404 });

     // If load has a dispatch and user wants to remove stops
     let removedStopCount = 0;
     if (load.dispatchId && removeStops) {
       const result = await removeLoadFromTrip(session.tenantId, id, true);
       if ('error' in result) return NextResponse.json(result, { status: 400 });
       removedStopCount = result.removedStopCount;
     }

     // Update load status to cancelled
     const notes = load.notes
       ? `${load.notes}\n[CANCELLED] ${reason || 'No reason provided'}`
       : `[CANCELLED] ${reason || 'No reason provided'}`;

     await updateLoad(session.tenantId, id, { status: 'cancelled', notes });

     return NextResponse.json({ success: true, removedStopCount });
   }
   ```

4. Update `removeLoadFromTrip` in `loads.ts` to return `{ removedStopCount: number }`.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Cancel modal shows stop removal checkbox when load is on a trip
    - API correctly removes stops and updates load status
  </verify>
  <done>
    - CancelLoadModal with stop removal prompt
    - LoadDetailActions has Cancel button
    - API endpoint handles cancellation + stop cleanup
  </done>
</task>

<task type="auto">
  <name>Task 7: Driver Trip View at /carrier/driver/trips</name>
  <files>
    apps/web/src/app/(carrier-driver)/trips/page.tsx
    apps/web/src/app/(carrier-driver)/trips/[id]/page.tsx
    apps/web/src/components/carrier/driver/TripStopList.tsx
  </files>
  <action>
1. Create route group `(carrier-driver)` if it doesn't exist:
   - Check if `apps/web/src/app/(carrier-driver)/` exists
   - If not, create layout.tsx that enforces driver role from CarrierDriver

2. Create `apps/web/src/app/(carrier-driver)/trips/page.tsx`:
   ```typescript
   import { redirect } from 'next/navigation';
   import { getSession } from '@/lib/auth/supabase';
   import { prisma } from '@/lib/db/prisma';
   import Link from 'next/link';
   import { Badge } from '@/components/ui/badge';
   import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
   import { Truck, Calendar, MapPin } from 'lucide-react';

   export default async function DriverTripsPage() {
     const session = await getSession();
     if (!session) redirect('/login');

     const orgId = session.tenantId;
     if (!orgId) redirect('/login');

     // Find CarrierDriver for this user
     const driver = await prisma.carrierDriver.findFirst({
       where: { userId: session.userId, orgId },
     });
     if (!driver) redirect('/carrier');  // Not a carrier driver

     // Fetch trips where this driver is primary or co-driver
     const trips = await prisma.trip.findMany({
       where: {
         orgId,
         OR: [
           { primaryDriverId: driver.id },
           { coDriverId: driver.id },
         ],
         status: { in: ['planned', 'in_progress'] },
       },
       include: {
         truck: { select: { unitNumber: true } },
         stops: { orderBy: { sequenceOrder: 'asc' }, take: 1 },
       },
       orderBy: { scheduledDeparture: 'asc' },
       take: 20,
     });

     return (
       <div className="space-y-6">
         <h1 className="text-2xl font-bold">My Trips</h1>

         {trips.length === 0 ? (
           <p className="text-muted-foreground">No active trips assigned.</p>
         ) : (
           <div className="grid gap-4">
             {trips.map((trip) => {
               const tripNumber = trip.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/)?.[1] ?? trip.id.slice(0, 8);
               const firstStop = trip.stops[0];
               return (
                 <Link key={trip.id} href={`/carrier/driver/trips/${trip.id}`}>
                   <Card className="hover:border-primary transition-colors">
                     <CardHeader className="pb-2">
                       <CardTitle className="flex items-center justify-between">
                         <span>{tripNumber}</span>
                         <Badge variant={trip.status === 'in_progress' ? 'default' : 'secondary'}>
                           {trip.status.replace('_', ' ')}
                         </Badge>
                       </CardTitle>
                     </CardHeader>
                     <CardContent className="space-y-2 text-sm">
                       <div className="flex items-center gap-2 text-muted-foreground">
                         <Truck className="h-4 w-4" />
                         <span>{trip.truck.unitNumber}</span>
                       </div>
                       <div className="flex items-center gap-2 text-muted-foreground">
                         <Calendar className="h-4 w-4" />
                         <span>{new Date(trip.scheduledDeparture).toLocaleString()}</span>
                       </div>
                       {firstStop && (
                         <div className="flex items-center gap-2 text-muted-foreground">
                           <MapPin className="h-4 w-4" />
                           <span>First stop: {firstStop.stopType}</span>
                         </div>
                       )}
                     </CardContent>
                   </Card>
                 </Link>
               );
             })}
           </div>
         )}
       </div>
     );
   }
   ```

3. Create `apps/web/src/app/(carrier-driver)/trips/[id]/page.tsx`:
   - Shows trip details: truck, scheduled departure, status
   - Lists all stops in `sequenceOrder` with:
     - Stop type badge (pickup/delivery/fuel_stop/layover)
     - Facility name + address
     - Load reference number (if stop has loadId)
     - Appointment window
     - Status (pending/arrived/completed/skipped)
     - Checklist status placeholder (shows checklistStatus field if set)
   - Action buttons: Arrive, Complete, Skip (reuse existing stop-completion APIs)

4. Create `apps/web/src/components/carrier/driver/TripStopList.tsx`:
   - Client component that displays stops
   - Each stop shows: sequence, facility, load ref, time window, status
   - If `checklistStatus` is set (future), show badge
   - If `deferredReason` is set, show deferred indicator
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Driver can access /carrier/driver/trips and see assigned trips
    - Trip detail page shows stops in dispatcher order
    - Stop arrival/completion actions work
  </verify>
  <done>
    - Driver trips list page at /carrier/driver/trips
    - Driver trip detail page at /carrier/driver/trips/[id]
    - Stops displayed in sequenceOrder with checklist field placeholders
    - Stop actions (arrive/complete) functional
  </done>
</task>

</tasks>

<verification>
1. **Schema verification:**
   - `npx prisma validate` and `npx prisma generate` pass
   - Migration applied successfully
   - `prisma.trip` is accessible in code

2. **TypeScript compilation:**
   - `cd apps/web && npx tsc --noEmit` passes with no errors

3. **Functional verification:**
   - Existing /carrier/dispatches pages still work (backward compat)
   - New /carrier/trips routes work
   - Dispatch-a-load modal creates trips and adds loads
   - Trip plan screen allows stop reordering
   - Load cancellation prompts for stop removal
   - Driver trip view shows stops in order

4. **Database verification:**
   - `SELECT * FROM dispatches LIMIT 1;` returns data (table unchanged)
   - `SELECT checklist_status, deferred_reason, checklist_entity_id FROM stops LIMIT 1;` shows new columns
</verification>

<success_criteria>
- [ ] Prisma model renamed from CarrierDispatch to Trip
- [ ] CarrierStop has checklistStatus, deferredReason, checklistEntityId fields
- [ ] trips.ts exists with all CRUD + reorderTripStops + addLoadToTrip
- [ ] DispatchLoadModal allows dispatching load to new or existing trip
- [ ] Trip plan screen at /carrier/trips/[id]/plan with drag-drop reorder
- [ ] Load cancellation modal prompts to remove stops from trip
- [ ] Driver trip view at /carrier/driver/trips shows stops in dispatcher order
- [ ] TypeScript compiles without errors
- [ ] Existing dispatch functionality preserved via re-exports
</success_criteria>

<output>
After completion, create `.planning/quick/403-trip-load-redesign-rename-carrierdispatc/403-SUMMARY.md`
</output>
