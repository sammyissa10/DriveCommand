# Phase 8: Maintenance & Scheduling - Research

**Researched:** 2026-02-14
**Domain:** Fleet maintenance tracking with dual time/mileage-based scheduling
**Confidence:** HIGH

## Summary

Phase 8 implements a comprehensive maintenance tracking system for fleet vehicles with dual-trigger scheduling (time-based and mileage-based). This is a well-established pattern in fleet management where service is triggered by whichever condition is met first - for example, an oil change due "every 5,000 miles or 90 days, whichever comes first."

The system requires two distinct capabilities: (1) logging historical maintenance events with full details (date, cost, provider, notes) to build a complete service history per truck, and (2) scheduling future services with both calendar-based intervals (e.g., every 90 days) and odometer-based intervals (e.g., every 5,000 miles) that are tracked simultaneously.

The research shows this is a standard feature in modern fleet maintenance software, with clear database patterns and well-documented pitfalls around data accuracy, incomplete records, and timezone handling.

**Primary recommendation:** Use two separate database models (MaintenanceEvent for history, ScheduledService for future services) with explicit dual-trigger fields. Calculate "next due" values at query time rather than storing derived dates to avoid stale data. Follow existing codebase patterns: Prisma with RLS, TanStack Table for lists, useOptimistic for deletes, server actions for mutations, semantic HTML for read-only displays.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.4.0 | ORM with PostgreSQL RLS | Already in use, proven tenant isolation |
| Zod | 4.3.6 | Schema validation | Already in use, excellent date handling with z.iso.date() |
| PostgreSQL | Latest | Database with timestamptz support | Already in use, native timezone support |
| @tanstack/react-table | 8.21.3 | List/table views | Established pattern from Phase 3 |
| Next.js Server Actions | 16.0.0 | Mutations with form handling | Established pattern across codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useActionState | React 19 | Form state management | All create/update forms (existing pattern) |
| useOptimistic | React 19 | Optimistic delete feedback | Delete operations (existing pattern) |
| Tailwind CSS | 3.4.1 | Styling | All UI components (existing pattern) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two models (Event + Schedule) | Single polymorphic model | Separate models are clearer and avoid nullable fields that only apply to one type |
| Storing intervals, calculating next due | Storing next due dates | Calculated values prevent stale data when odometer updates |
| Native Date objects | date-fns or day.js | Native is sufficient for simple interval math, libraries add bundle size |

**Installation:**
```bash
# No new dependencies needed - all required libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(owner)/
│   ├── trucks/[id]/
│   │   ├── maintenance/          # New maintenance management section
│   │   │   ├── page.tsx          # History list + schedule list (combined view)
│   │   │   ├── log-event/
│   │   │   │   └── page.tsx      # Log past maintenance form
│   │   │   └── schedule-service/
│   │   │       └── page.tsx      # Schedule future service form
│   ├── actions/
│   │   └── maintenance.ts        # New server actions file
├── components/
│   └── maintenance/              # New maintenance components
│       ├── maintenance-event-list.tsx    # History table
│       ├── scheduled-service-list.tsx    # Future services table
│       ├── maintenance-event-form.tsx    # Log event form
│       └── scheduled-service-form.tsx    # Schedule service form
├── lib/validations/
│   └── maintenance.schemas.ts    # New Zod schemas
└── prisma/
    └── schema.prisma             # Add MaintenanceEvent + ScheduledService models
```

### Pattern 1: Two-Model Design (Event History + Future Schedules)

**What:** Separate database models for historical maintenance events vs. future scheduled services

**When to use:** When domain objects have fundamentally different lifecycles and required fields

**Example:**
```prisma
// Historical maintenance events (immutable log)
model MaintenanceEvent {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  truckId     String   @db.Uuid

  // What happened
  serviceType String                    // "Oil Change", "Tire Rotation", etc.
  serviceDate DateTime  @db.Timestamptz // When service was performed
  odometerAtService Int                 // Odometer reading at time of service

  // Service details
  cost        Decimal?  @db.Decimal(10, 2)  // Optional cost tracking
  provider    String?                       // Shop/technician name
  notes       String?                       // Additional details

  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  truck  Truck  @relation(fields: [truckId], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([serviceDate])
}

// Future scheduled services (mutable, can be completed/cancelled)
model ScheduledService {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  truckId     String   @db.Uuid

  serviceType String   // "Oil Change", "Tire Rotation", etc.

  // Dual triggers - service due when EITHER condition is met
  intervalDays     Int?  // e.g., 90 days
  intervalMiles    Int?  // e.g., 5000 miles

  // Baseline for calculations (when interval started)
  baselineDate     DateTime @db.Timestamptz  // Last service date or creation date
  baselineOdometer Int                       // Odometer at baseline

  notes       String?
  isCompleted Boolean  @default(false)
  completedAt DateTime? @db.Timestamptz

  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  truck  Truck  @relation(fields: [truckId], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([isCompleted])
}
```

**Why this works:**
- Historical events are immutable (insert-only) - matches real-world service logs
- Scheduled services are mutable (can be marked complete, updated) - matches planning workflow
- No nullable "completed/not completed" discriminator pollution
- Clear separation of concerns for queries

### Pattern 2: "Whichever Comes First" Dual-Trigger Logic

**What:** Industry-standard pattern where maintenance is due when EITHER time-based OR mileage-based threshold is reached

**When to use:** Any recurring service that has both calendar and usage-based wear factors

**Example calculation (server-side utility):**
```typescript
// lib/utils/maintenance-utils.ts

interface ScheduledService {
  intervalDays: number | null;
  intervalMiles: number | null;
  baselineDate: Date;
  baselineOdometer: number;
}

interface DueStatus {
  isDueByDate: boolean;
  isDueByMileage: boolean;
  isDue: boolean;  // true if EITHER trigger is met
  nextDueDate: Date | null;
  nextDueMileage: number | null;
  daysUntilDue: number | null;
  milesUntilDue: number | null;
}

/**
 * Calculate when a scheduled service is next due based on dual triggers.
 * Service is due when EITHER time OR mileage threshold is met (whichever comes first).
 */
export function calculateNextDue(
  schedule: ScheduledService,
  currentOdometer: number
): DueStatus {
  const now = new Date();

  // Calculate date-based due status
  let isDueByDate = false;
  let nextDueDate: Date | null = null;
  let daysUntilDue: number | null = null;

  if (schedule.intervalDays) {
    nextDueDate = new Date(schedule.baselineDate);
    nextDueDate.setDate(nextDueDate.getDate() + schedule.intervalDays);

    const msUntilDue = nextDueDate.getTime() - now.getTime();
    daysUntilDue = Math.ceil(msUntilDue / (1000 * 60 * 60 * 24));
    isDueByDate = daysUntilDue <= 0;
  }

  // Calculate mileage-based due status
  let isDueByMileage = false;
  let nextDueMileage: number | null = null;
  let milesUntilDue: number | null = null;

  if (schedule.intervalMiles) {
    nextDueMileage = schedule.baselineOdometer + schedule.intervalMiles;
    milesUntilDue = nextDueMileage - currentOdometer;
    isDueByMileage = milesUntilDue <= 0;
  }

  return {
    isDueByDate,
    isDueByMileage,
    isDue: isDueByDate || isDueByMileage,  // Whichever comes first
    nextDueDate,
    nextDueMileage,
    daysUntilDue,
    milesUntilDue,
  };
}
```

**Real-world usage:**
- Oil change: every 5,000 miles or 90 days (accounts for both highway driving and city idling)
- Tire rotation: every 7,500 miles or 6 months
- Inspection: every 12 months (time-only, no mileage trigger)
- Air filter: every 15,000 miles (mileage-only, no time trigger)

Sources: [Cottman Transmission](https://www.cottman.com/blog/mileage-or-time-which-should-i-use-for-maintenance/), [Brattleboro Subaru](https://www.brattleborosubaru.com/service/time-vs-miles.htm)

### Pattern 3: Display "Next Due" Without Storing It

**What:** Calculate next due date/mileage at query time instead of storing as a database field

**When to use:** When the value depends on current state (truck's current odometer) that changes independently

**Example:**
```typescript
// BAD: Storing next due creates stale data
model ScheduledService {
  nextDueDate DateTime  // STALE if odometer updates make mileage due first
  nextDueMileage Int    // STALE if time passes
}

// GOOD: Store intervals and baseline, calculate on read
model ScheduledService {
  intervalDays Int
  baselineDate DateTime
  // Calculate nextDueDate = baselineDate + intervalDays at query time
}

// Server action to fetch scheduled services with calculated due status
export async function getScheduledServices(truckId: string) {
  const truck = await prisma.truck.findUnique({ where: { id: truckId } });
  const schedules = await prisma.scheduledService.findMany({
    where: { truckId, isCompleted: false },
  });

  // Augment with calculated due status
  return schedules.map(schedule => ({
    ...schedule,
    dueStatus: calculateNextDue(schedule, truck.odometer),
  }));
}
```

**Why:** Odometer updates happen via separate route completions (Phase 5). Storing calculated "next due" dates/mileage would require expensive cascading updates every time odometer changes. Calculating on read is simpler and always accurate.

### Pattern 4: Maintenance History Listing with TanStack Table

**What:** Use established TanStack Table pattern for sortable, filterable maintenance event history

**When to use:** List views for historical maintenance events (follows trucks list, drivers list, routes list patterns)

**Example:**
```typescript
// components/maintenance/maintenance-event-list.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';

interface MaintenanceEvent {
  id: string;
  serviceType: string;
  serviceDate: Date;
  odometerAtService: number;
  cost: number | null;
  provider: string | null;
}

interface MaintenanceEventListProps {
  events: MaintenanceEvent[];
  truckId: string;
}

export function MaintenanceEventList({ events, truckId }: MaintenanceEventListProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'serviceDate', desc: true }  // Most recent first by default
  ]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns: ColumnDef<MaintenanceEvent>[] = [
    {
      accessorKey: 'serviceDate',
      header: 'Date',
      cell: (info) => new Date(info.getValue() as Date).toLocaleDateString(),
    },
    {
      accessorKey: 'serviceType',
      header: 'Service Type',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'odometerAtService',
      header: 'Odometer',
      cell: (info) => `${(info.getValue() as number).toLocaleString()} mi`,
    },
    {
      accessorKey: 'provider',
      header: 'Provider',
      cell: (info) => info.getValue() || '—',
    },
    {
      accessorKey: 'cost',
      header: 'Cost',
      cell: (info) => {
        const cost = info.getValue() as number | null;
        return cost ? `$${cost.toFixed(2)}` : '—';
      },
    },
  ];

  const table = useReactTable({
    data: events,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // ... render table (follows truck-list.tsx pattern)
}
```

### Anti-Patterns to Avoid

- **Don't denormalize next due dates into truck model** - Creates stale data and complex update logic when odometer changes
- **Don't use single model with status enum** - "Historical" vs "Scheduled" are fundamentally different domain objects with different required fields
- **Don't store timezone in dates** - Use @db.Timestamptz, store UTC, convert at display time
- **Don't calculate "days until due" in database** - Do it at query time in application code for accuracy

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date validation | Custom regex/parsing | Zod's z.iso.date() | Handles edge cases (leap years, invalid dates) |
| Date arithmetic | Manual millisecond math | Native Date setDate/setMonth | Handles month boundaries, DST transitions |
| Table sorting/filtering | Custom sort/filter logic | @tanstack/react-table | Handles complex sorting (e.g., dates, numbers, nulls) |
| Form state management | Custom form state | useActionState | Handles pending states, errors, server validation |
| Timezone conversion | Manual offset calculations | Store UTC, convert at display | Avoids DST bugs, simpler database queries |
| Decimal currency | JavaScript numbers (floats) | Prisma Decimal @db.Decimal(10,2) | Avoids floating-point rounding errors |

**Key insight:** Date/time handling has many edge cases (DST, leap years, timezone offsets, month boundaries). Use proven libraries and follow "store UTC, display local" pattern. Fleet maintenance is a solved problem - follow industry patterns rather than inventing custom approaches.

## Common Pitfalls

### Pitfall 1: Storing Derived "Next Due" Values

**What goes wrong:** Storing `nextDueDate` or `nextDueMileage` as database fields creates stale data when odometer updates (which happens via separate route completion workflow).

**Why it happens:** Developers think pre-calculating makes queries faster, but odometer changes are frequent (every route completion) and updating all scheduled services on every route completion is expensive.

**How to avoid:** Store baseline (last service date/odometer) and intervals. Calculate next due at query time. Modern databases are fast enough for these simple calculations.

**Warning signs:**
- Migration to add `nextDueDate` column
- Cascade update logic in odometer update action
- Bug reports about "service shows as due but it was just done"

**Source:** Common database design mistake documented in fleet maintenance systems

### Pitfall 2: Time-Based Interval Bugs (DST, Month Boundaries)

**What goes wrong:** Adding "90 days" to a date by multiplying 90 * 24 * 60 * 60 * 1000 fails during DST transitions and gives wrong results for month-based intervals.

**Why it happens:** Not all days are 24 hours (DST adds/removes an hour), and months have different lengths.

**How to avoid:** Use Date's `setDate()`, `setMonth()` methods which handle calendar complexities:
```javascript
// BAD: Assumes all days are 24 hours
const nextDue = new Date(baseline.getTime() + (90 * 24 * 60 * 60 * 1000));

// GOOD: Let Date object handle calendar math
const nextDue = new Date(baseline);
nextDue.setDate(nextDue.getDate() + 90);  // Handles DST, month boundaries
```

**Warning signs:**
- Off-by-one-hour bugs during spring/fall DST transitions
- "Due date is March 31st but should be March 30th" bugs (month boundary errors)

**Sources:** [JavaScript Date Calculations](https://www.i-programmer.info/programming/javascript/6322-date-hacks-doing-javascript-date-calculations.html), [MDN Temporal.Duration](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/Duration)

### Pitfall 3: Prisma Timestamptz Precision (0) Rounding

**What goes wrong:** Using `@db.Timestamptz(0)` causes PostgreSQL to round timestamps to nearest whole second, leading to "created in the future" bugs when `now()` gets rounded up.

**Why it happens:** Developers think zero fractional seconds is cleaner, but Prisma/PostgreSQL `now()` includes milliseconds which round up.

**How to avoid:** Always use `@db.Timestamptz(6)` for microsecond precision (PostgreSQL default):
```prisma
// BAD: Rounds 15:30:45.678 to 15:30:46
serviceDate DateTime @db.Timestamptz(0)

// GOOD: Stores full precision
serviceDate DateTime @db.Timestamptz(6)
```

**Warning signs:**
- "Record created in the future" errors
- Time comparisons off by a second
- Prisma docs warning about precision

**Sources:** [Prisma Docs: Avoid timestamp(0)](https://www.prisma.io/docs/postgres/query-optimization/recommendations/avoid-timestamp-timestampz-0), [Medium: Fix Prisma DateTime Issues](https://medium.com/@basem.deiaa/how-to-fix-prisma-datetime-and-timezone-issues-with-postgresql-1c778aa2d122)

### Pitfall 4: Incomplete Maintenance Records

**What goes wrong:** Users forget to log maintenance, leading to duplicate work or missed services. System shows "oil change overdue" but it was done at a shop that wasn't logged.

**Why it happens:** Logging maintenance is extra work with no immediate benefit. Users take shortcuts.

**How to avoid:**
- Make logging fast and easy (minimize required fields)
- Show service history prominently on truck detail page
- Provide clear benefit (cost tracking, warranty compliance)
- Consider marking scheduled service as complete from log event form

**Warning signs:**
- Service history gaps (3-month periods with no entries)
- Multiple "overdue" services that were actually done
- User complaints about "too much data entry"

**Sources:** [Fleet Maintenance Best Practices](https://www.fleetio.com/blog/vehicle-maintenance-log-software), [Common PM Mistakes](https://maintainiq.com/common-mistakes-to-avoid-in-preventive-maintenance-scheduling/)

### Pitfall 5: HTML Date Input Format Mismatch

**What goes wrong:** Sending ISO timestamp "2024-01-15T10:30:00Z" to `<input type="date">` fails. Field appears blank or throws error.

**Why it happens:** HTML date inputs require YYYY-MM-DD format only (no time, no timezone).

**How to avoid:**
```typescript
// BAD: Full ISO timestamp
<input
  type="date"
  defaultValue={truck.lastServiceDate.toISOString()}  // 2024-01-15T10:30:00Z
/>

// GOOD: Extract date portion only
<input
  type="date"
  defaultValue={truck.lastServiceDate.toISOString().split('T')[0]}  // 2024-01-15
/>
```

**Warning signs:**
- Date inputs appear blank despite data in database
- Form submits without date value
- Console error about invalid date format

**Sources:** [MDN: input type=date](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date), [React Admin DateInput](https://marmelab.com/react-admin/DateInput.html)

### Pitfall 6: One-Size-Fits-All Scheduling

**What goes wrong:** System enforces same intervals for all trucks (e.g., "all trucks get oil change every 5,000 miles"), but different trucks have different manufacturer recommendations and usage patterns.

**Why it happens:** Simpler to implement uniform schedules.

**How to avoid:** Store intervals per scheduled service, not per truck type. Each scheduled service can have different intervals. This allows flexibility without complex truck categorization.

**Warning signs:**
- Feature requests for "different intervals for different truck types"
- Over-servicing low-usage trucks
- Under-servicing high-usage trucks

**Sources:** [Preventive Maintenance Mistakes](https://llumin.com/blog/5-common-preventive-maintenance-mistakes-how-to-fix-them/)

## Code Examples

Verified patterns from existing codebase and official sources:

### Server Action Pattern for Logging Maintenance Event

```typescript
// app/(owner)/actions/maintenance.ts
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { maintenanceEventCreateSchema } from '@/lib/validations/maintenance.schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createMaintenanceEvent(
  truckId: string,
  prevState: any,
  formData: FormData
) {
  // Auth check FIRST
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    serviceType: formData.get('serviceType') as string,
    serviceDate: formData.get('serviceDate') as string,  // YYYY-MM-DD from input[type=date]
    odometerAtService: parseInt(formData.get('odometerAtService') as string, 10),
    cost: formData.get('cost') ? parseFloat(formData.get('cost') as string) : null,
    provider: formData.get('provider') as string || null,
    notes: formData.get('notes') as string || null,
  };

  // Validate
  const result = maintenanceEventCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  // Create via tenant-scoped Prisma
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  await prisma.maintenanceEvent.create({
    data: {
      ...result.data,
      truckId,
      tenantId,
    },
  });

  revalidatePath(`/trucks/${truckId}/maintenance`);
  redirect(`/trucks/${truckId}/maintenance`);
}
```

### Zod Schema with Date Validation

```typescript
// lib/validations/maintenance.schemas.ts
import { z } from 'zod';

export const maintenanceEventCreateSchema = z.object({
  serviceType: z
    .string()
    .min(1, 'Service type is required')
    .max(100, 'Service type must be 100 characters or less'),

  serviceDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date format')
    .transform((val) => new Date(val)),  // Convert YYYY-MM-DD string to Date

  odometerAtService: z
    .number()
    .int('Odometer must be a whole number')
    .min(0, 'Odometer cannot be negative'),

  cost: z
    .number()
    .min(0, 'Cost cannot be negative')
    .nullable(),

  provider: z.string().max(200).nullable(),
  notes: z.string().max(1000).nullable(),
});

export const scheduledServiceCreateSchema = z.object({
  serviceType: z
    .string()
    .min(1, 'Service type is required')
    .max(100),

  intervalDays: z
    .number()
    .int()
    .min(1, 'Interval must be at least 1 day')
    .nullable(),

  intervalMiles: z
    .number()
    .int()
    .min(1, 'Interval must be at least 1 mile')
    .nullable(),

  baselineDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
    .transform((val) => new Date(val)),

  baselineOdometer: z
    .number()
    .int()
    .min(0),

  notes: z.string().max(1000).nullable(),
})
  .refine(
    (data) => data.intervalDays !== null || data.intervalMiles !== null,
    { message: 'At least one interval (days or miles) is required' }
  );

export type MaintenanceEventCreate = z.infer<typeof maintenanceEventCreateSchema>;
export type ScheduledServiceCreate = z.infer<typeof scheduledServiceCreateSchema>;
```

### Form with Date Input

```typescript
// components/maintenance/maintenance-event-form.tsx
'use client';

import { useActionState } from 'react';

interface MaintenanceEventFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  currentOdometer: number;  // Pre-fill from truck's current odometer
  submitLabel: string;
}

export function MaintenanceEventForm({
  action,
  currentOdometer,
  submitLabel
}: MaintenanceEventFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Default to today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {/* Service Type */}
      <div>
        <label htmlFor="serviceType" className="block font-medium mb-1">
          Service Type
        </label>
        <input
          type="text"
          id="serviceType"
          name="serviceType"
          placeholder="e.g., Oil Change, Tire Rotation"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
        {state?.error?.serviceType && (
          <p className="mt-1 text-sm text-red-600">{state.error.serviceType}</p>
        )}
      </div>

      {/* Service Date */}
      <div>
        <label htmlFor="serviceDate" className="block font-medium mb-1">
          Service Date
        </label>
        <input
          type="date"
          id="serviceDate"
          name="serviceDate"
          defaultValue={today}
          max={today}  // Prevent future dates for historical events
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
        {state?.error?.serviceDate && (
          <p className="mt-1 text-sm text-red-600">{state.error.serviceDate}</p>
        )}
      </div>

      {/* Odometer at Service */}
      <div>
        <label htmlFor="odometerAtService" className="block font-medium mb-1">
          Odometer Reading
        </label>
        <input
          type="number"
          id="odometerAtService"
          name="odometerAtService"
          defaultValue={currentOdometer}
          min={0}
          step={1}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          Current odometer: {currentOdometer.toLocaleString()} miles
        </p>
        {state?.error?.odometerAtService && (
          <p className="mt-1 text-sm text-red-600">{state.error.odometerAtService}</p>
        )}
      </div>

      {/* Cost (optional) */}
      <div>
        <label htmlFor="cost" className="block font-medium mb-1">
          Cost (optional)
        </label>
        <input
          type="number"
          id="cost"
          name="cost"
          min={0}
          step={0.01}
          placeholder="0.00"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
        />
        {state?.error?.cost && (
          <p className="mt-1 text-sm text-red-600">{state.error.cost}</p>
        )}
      </div>

      {/* Provider (optional) */}
      <div>
        <label htmlFor="provider" className="block font-medium mb-1">
          Service Provider (optional)
        </label>
        <input
          type="text"
          id="provider"
          name="provider"
          placeholder="e.g., Joe's Auto Shop"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
        />
        {state?.error?.provider && (
          <p className="mt-1 text-sm text-red-600">{state.error.provider}</p>
        )}
      </div>

      {/* Notes (optional) */}
      <div>
        <label htmlFor="notes" className="block font-medium mb-1">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Additional details..."
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
        />
        {state?.error?.notes && (
          <p className="mt-1 text-sm text-red-600">{state.error.notes}</p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50"
      >
        {isPending ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
```

### Combined Maintenance View (History + Schedules)

```typescript
// app/(owner)/trucks/[id]/maintenance/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTruck } from '@/app/(owner)/actions/trucks';
import {
  listMaintenanceEvents,
  listScheduledServices
} from '@/app/(owner)/actions/maintenance';
import { MaintenanceEventList } from '@/components/maintenance/maintenance-event-list';
import { ScheduledServiceList } from '@/components/maintenance/scheduled-service-list';

interface MaintenancePageProps {
  params: Promise<{ id: string }>;
}

export default async function MaintenancePage({ params }: MaintenancePageProps) {
  const { id } = await params;
  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  const [events, schedules] = await Promise.all([
    listMaintenanceEvents(id),
    listScheduledServices(id),
  ]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href={`/trucks/${id}`} className="text-blue-600 hover:text-blue-800 mb-2 inline-block">
          ← Back to Truck
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          Maintenance: {truck.year} {truck.make} {truck.model}
        </h1>
        <p className="text-gray-600 mt-1">
          Current odometer: {truck.odometer.toLocaleString()} miles
        </p>
      </div>

      {/* Scheduled Services Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Scheduled Services</h2>
          <Link
            href={`/trucks/${id}/maintenance/schedule-service`}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md"
          >
            Schedule Service
          </Link>
        </div>
        <ScheduledServiceList
          schedules={schedules}
          currentOdometer={truck.odometer}
        />
      </div>

      {/* Service History Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Service History</h2>
          <Link
            href={`/trucks/${id}/maintenance/log-event`}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md"
          >
            Log Service
          </Link>
        </div>
        <MaintenanceEventList events={events} truckId={id} />
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Store next due dates | Calculate at query time | 2020+ | Eliminates stale data from odometer updates |
| Manual timezone math | UTC storage + @db.Timestamptz(6) | Prisma 2.0+ | Eliminates DST bugs, timezone offset errors |
| Generic date validation | Zod z.iso.date() | Zod 3.0+ | Standardized ISO 8601 validation |
| Single maintenance table | Separate history + schedule models | Domain-driven design | Clear separation of immutable history vs mutable plans |
| Storing currency as float | Decimal @db.Decimal(10,2) | Standard practice | Eliminates floating-point rounding errors |

**Deprecated/outdated:**
- **Moment.js**: Now in maintenance mode, replaced by native Date API for simple operations or Temporal (future standard)
- **Storing local time without timezone**: Always use timestamptz, not timestamp
- **Manual date parsing from strings**: Use Zod's built-in date validation with transform

## Open Questions

1. **Should scheduled services auto-complete when maintenance event is logged?**
   - What we know: Industry software often links them (log service → mark schedule complete)
   - What's unclear: Whether to make this automatic or manual, UX flow for linking
   - Recommendation: Start simple (separate workflows), add linking in future iteration based on user feedback

2. **Should system send reminders/alerts for upcoming services?**
   - What we know: Common feature in fleet software, but adds email infrastructure complexity
   - What's unclear: Whether this is in scope for Phase 8 or future phase
   - Recommendation: Out of scope for Phase 8 (focus on CRUD and display). Flag for future phase.

3. **Should odometer be editable or only updated via route completion?**
   - What we know: Phase 5 updates odometer on route completion
   - What's unclear: Manual odometer corrections (typos, external service updates)
   - Recommendation: Allow manual odometer edit on truck edit form (already implemented in Phase 3)

## Sources

### Primary (HIGH confidence)
- Prisma Schema: c:/Users/sammy/Projects/DriveCommand/prisma/schema.prisma (existing patterns)
- Truck Actions: c:/Users/sammy/Projects/DriveCommand/src/app/(owner)/actions/trucks.ts (server action pattern)
- [Prisma Timestamptz Precision Docs](https://www.prisma.io/docs/postgres/query-optimization/recommendations/avoid-timestamp-timestampz-0)
- [MDN: HTML input type=date](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date)
- [Zod API Documentation](https://zod.dev/api)

### Secondary (MEDIUM confidence)
- [Fleet Preventive Maintenance](https://www.fleetio.com/blog/5-components-of-fleet-preventive-maintenance) - Industry patterns for dual triggers
- [Cottman Transmission: Mileage vs Time](https://www.cottman.com/blog/mileage-or-time-which-should-i-use-for-maintenance/) - "Whichever comes first" pattern
- [Vehicle Maintenance Database Design](https://www.inettutor.com/diagrams/vehicle-repair-and-maintenance-management-system-database-design/) - Schema patterns
- [Maintenance Scheduling Mistakes](https://maintainiq.com/common-mistakes-to-avoid-in-preventive-maintenance-scheduling/) - Common pitfalls
- [Prisma DateTime Timezone Fix](https://medium.com/@basem.deiaa/how-to-fix-prisma-datetime-and-timezone-issues-with-postgresql-1c778aa2d122) - Timestamptz best practices
- [JavaScript Date Calculations](https://www.i-programmer.info/programming/javascript/6322-date-hacks-doing-javascript-date-calculations.html) - Date arithmetic patterns

### Tertiary (LOW confidence)
- [FieldEx Fleet Maintenance Trends](https://www.fieldex.com/en/blog/top-18-fleet-maintenance-industry-trends-and-innovations-to-watch) - General industry context
- [Simply Fleet Maintenance Calendar](https://www.simplyfleet.app/blog/fleet-maintenance-calendar-mixed-fleet) - Product features (not technical patterns)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, proven patterns
- Architecture: HIGH - Clear two-model design, established server action pattern
- Pitfalls: MEDIUM-HIGH - Some from existing codebase (timestamptz), some from industry sources (maintenance scheduling)

**Research date:** 2026-02-14
**Valid until:** 2026-03-15 (30 days - stack is stable, patterns well-established)
