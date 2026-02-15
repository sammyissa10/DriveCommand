# Phase 5: Route Management - Research

**Researched:** 2026-02-14
**Domain:** Route CRUD with driver-truck assignment coordination, recurring routes, lifecycle states, and date/time handling
**Confidence:** HIGH

## Summary

Phase 5 implements route management—the core operational entity that coordinates drivers, trucks, and documents. Routes tie together the entities established in Phases 3 and 4 (trucks and drivers) with assignment logic, lifecycle tracking (Planned → In Progress → Completed), and date/time handling for scheduling. This phase follows the same CRUD patterns as truck and driver management (React 19 + Server Actions + TanStack Table), but adds coordination complexity: routes reference both driver and truck via foreign keys, support one-time and recurring patterns, and require timezone-aware date handling.

**Critical insight:** Routes are the operational hub of the system. Unlike trucks (inventory) and drivers (users), routes have a lifecycle that changes over time and coordinate multiple entities. The data model must support both one-time routes and recurring route patterns (e.g., "every Monday, driver A takes truck B from warehouse to customer C"). Storing individual instances of recurring routes causes database bloat and performance issues—best practice is to store the recurrence pattern and generate instances at runtime. For v1, implement one-time routes only; defer recurring routes to Phase 7+ unless specifically required.

**Date/time handling is critical:** Routes have scheduled dates tied to real-world operations. PostgreSQL TIMESTAMPTZ stores dates in UTC automatically, but UI must display in tenant's timezone (stored in Tenant.timezone field). Next.js Server Components can cause hydration mismatches if dates are formatted differently server-side vs. client-side. Solution: format dates server-side using tenant timezone, suppress hydration warnings, or use client-side formatting with useEffect.

**Primary recommendation:** Use same CRUD patterns as Phases 3-4 (Zod schemas, Server Actions, TanStack Table), add RouteStatus enum (PLANNED, IN_PROGRESS, COMPLETED), store driver and truck as foreign keys (driverId and truckId on Route model), validate assignments (driver and truck must exist and be active in tenant), implement route list with TanStack Table multi-column filtering (status, driver, truck, date range), format dates using tenant timezone with Intl.DateTimeFormat, defer recurring routes to later phase (start with one-time routes only), and add unified route detail view showing driver info, truck info, and route metadata on single screen (ROUT-04 requirement).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.0.0 (installed) | UI with form hooks | Same as Phases 3-4—`useActionState` for route forms |
| Next.js 16 | ^16.0.0 (installed) | Full-stack framework | Server Actions for CRUD, Server Components for data fetching |
| Zod | ^4.3.6 (installed) | Schema validation | Validate route input (origin, destination, date, assignments) |
| Prisma 7 | ^7.4.0 (installed) | ORM with RLS | Route model with foreign keys to User (driver) and Truck |
| PostgreSQL 17 | 17 (production) | Database with TIMESTAMPTZ | TIMESTAMPTZ for route dates (auto-converts to UTC), enum for RouteStatus |
| TanStack Table | ^8.21.3 (installed) | List view | Sortable/filterable route list with multi-column filters |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^3.0+ (NEW) | Date manipulation | Optional: date formatting, date calculations (avoid if Intl.DateTimeFormat sufficient) |
| date-fns-tz | ^2.0+ (NEW) | Timezone-aware formatting | Optional: format dates in tenant timezone; alternative to Intl.DateTimeFormat |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Intl.DateTimeFormat | date-fns-tz | Intl.DateTimeFormat is built-in (no bundle cost) but verbose API; date-fns-tz is simpler API but adds 67KB bundle size; prefer Intl for v1 unless complex date math needed |
| RouteStatus enum | String field | Enum enforces valid values at database level, provides type safety in TypeScript; string field is flexible but error-prone (typos, inconsistent casing) |
| Foreign keys (driverId, truckId) | Separate RouteAssignment table | Foreign keys are simpler for one-to-one assignment (one driver, one truck per route); separate table is better for many-to-many (multiple drivers per route) but adds query complexity |
| One-time routes only | Recurring route patterns | One-time routes are simpler (one database row = one route instance); recurring patterns avoid database bloat but require runtime instance generation (complex, defer to Phase 7+) |
| Server-side date formatting | Client-side with useEffect | Server-side formatting avoids hydration mismatches and works without JS; client-side allows real-time updates (e.g., "5 minutes ago") but requires suppressHydrationWarning |

**Installation (optional):**
```bash
# Only if date-fns is needed for complex date math
npm install date-fns date-fns-tz
```

**Recommendation for v1:** Use built-in Intl.DateTimeFormat for date formatting (no added bundle size), defer date-fns to later phase if complex date calculations are needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (owner)/
│   │   ├── routes/
│   │   │   ├── page.tsx                    # Route list view
│   │   │   ├── new/
│   │   │   │   └── page.tsx                # Create route form
│   │   │   └── [id]/
│   │   │       ├── page.tsx                # Unified route detail view (ROUT-04)
│   │   │       └── edit/
│   │   │           └── page.tsx            # Edit route form
│   │   └── actions/
│   │       └── routes.ts                   # Server actions for route CRUD
├── lib/
│   ├── db/
│   │   └── repositories/
│   │       └── route.repository.ts         # TenantRepository subclass
│   ├── validations/
│   │   └── route.schemas.ts                # Zod schemas for route data
│   └── utils/
│       └── date.ts                         # Date formatting helpers (tenant timezone)
└── components/
    └── routes/
        ├── route-form.tsx                  # Reusable form component
        ├── route-list.tsx                  # TanStack Table component
        ├── route-detail.tsx                # Unified detail view component
        └── route-filters.tsx               # Multi-column filter UI
```

### Pattern 1: Route Model with Foreign Key Assignments

**What:** Route model references driver (User.id) and truck (Truck.id) via foreign keys. Each route has one driver and one truck.

**When to use:** Phase 5 implementation—all routes require driver and truck assignments.

**Example (Prisma Schema):**
```prisma
// prisma/schema.prisma

enum RouteStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
}

model Route {
  id            String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String      @db.Uuid

  // Assignment references (foreign keys)
  driverId      String      @db.Uuid
  truckId       String      @db.Uuid

  // Route details
  origin        String
  destination   String
  scheduledDate DateTime    @db.Timestamptz  // Auto-converts to UTC
  status        RouteStatus @default(PLANNED)

  // Metadata (optional)
  notes         String?

  createdAt     DateTime    @default(now()) @db.Timestamptz
  updatedAt     DateTime    @updatedAt @db.Timestamptz

  // Relations
  tenant        Tenant      @relation(fields: [tenantId], references: [id])
  driver        User        @relation(fields: [driverId], references: [id])
  truck         Truck       @relation(fields: [truckId], references: [id])

  @@index([tenantId])
  @@index([driverId])
  @@index([truckId])
  @@index([scheduledDate])
  @@index([status])
}

// Update existing models to add relations
model User {
  // ... existing fields
  assignedRoutes Route[]  // Relation to routes where user is driver
}

model Truck {
  // ... existing fields
  assignedRoutes Route[]  // Relation to routes where truck is assigned
}

model Tenant {
  // ... existing fields
  routes Route[]
}
```

**Critical:** Foreign keys enforce referential integrity—deleting a driver or truck with assigned routes will fail. This is correct behavior: routes preserve operational history. Deactivated drivers (isActive = false) should still appear in historical route records.

### Pattern 2: Zod Validation for Route Assignment Coordination

**What:** Validate that driver and truck exist, are active, and belong to current tenant before creating route.

**When to use:** All route creation and update operations.

**Example:**
```typescript
// lib/validations/route.schemas.ts
import { z } from 'zod';

export const routeCreateSchema = z.object({
  origin: z.string().min(1, 'Origin is required').max(200),
  destination: z.string().min(1, 'Destination is required').max(200),
  scheduledDate: z.string().datetime('Invalid date format'), // ISO 8601 string
  driverId: z.string().uuid('Invalid driver ID'),
  truckId: z.string().uuid('Invalid truck ID'),
  notes: z.string().max(1000).optional(),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED']).default('PLANNED'),
});

export const routeUpdateSchema = routeCreateSchema.partial();

export type RouteCreate = z.infer<typeof routeCreateSchema>;
export type RouteUpdate = z.infer<typeof routeUpdateSchema>;
```

```typescript
// app/(owner)/actions/routes.ts
'use server';

import { requireRole } from '@/lib/auth/server';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { routeCreateSchema } from '@/lib/validations/route.schemas';
import { revalidatePath } from 'next/cache';

export async function createRoute(prevState: any, formData: FormData) {
  await requireRole(['OWNER', 'MANAGER']);

  const rawData = {
    origin: formData.get('origin'),
    destination: formData.get('destination'),
    scheduledDate: formData.get('scheduledDate'), // ISO 8601 string from datetime-local input
    driverId: formData.get('driverId'),
    truckId: formData.get('truckId'),
    notes: formData.get('notes'),
  };

  const result = routeCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Validate driver exists and is active in tenant
  const driver = await prisma.user.findUnique({
    where: { id: result.data.driverId },
  });

  if (!driver || !driver.isActive || driver.role !== 'DRIVER') {
    return { error: { driverId: ['Selected driver is not available'] } };
  }

  // Validate truck exists in tenant
  const truck = await prisma.truck.findUnique({
    where: { id: result.data.truckId },
  });

  if (!truck) {
    return { error: { truckId: ['Selected truck not found'] } };
  }

  // Create route
  const route = await prisma.route.create({
    data: {
      tenantId,
      origin: result.data.origin,
      destination: result.data.destination,
      scheduledDate: new Date(result.data.scheduledDate), // Convert ISO string to Date
      driverId: result.data.driverId,
      truckId: result.data.truckId,
      notes: result.data.notes,
      status: 'PLANNED',
    },
  });

  revalidatePath('/routes');
  return { success: true, routeId: route.id };
}
```

**Key insight:** Validation happens in two stages: (1) Zod validates input format, (2) Server action validates business rules (driver/truck availability in tenant). This prevents creating routes with invalid assignments.

### Pattern 3: Unified Route Detail View (ROUT-04)

**What:** Single page showing all route information: driver details, truck details, route metadata, and status on one screen.

**When to use:** Route detail page (`/routes/[id]`).

**Example:**
```typescript
// app/(owner)/routes/[id]/page.tsx
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { RouteDetail } from '@/components/routes/route-detail';

export default async function RouteDetailPage({ params }: { params: { id: string } }) {
  await requireRole(['OWNER', 'MANAGER', 'DRIVER']);

  const prisma = await getTenantPrisma();

  // Fetch route with related driver and truck data in single query
  const route = await prisma.route.findUnique({
    where: { id: params.id },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          licenseNumber: true,
        },
      },
      truck: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          vin: true,
        },
      },
    },
  });

  if (!route) {
    notFound();
  }

  return <RouteDetail route={route} />;
}
```

```typescript
// components/routes/route-detail.tsx
'use client';

import Link from 'next/link';
import { formatDateInTenantTimezone } from '@/lib/utils/date';
import type { Route, User, Truck } from '@/generated/prisma/client';

interface RouteDetailProps {
  route: Route & {
    driver: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'licenseNumber'>;
    truck: Pick<Truck, 'id' | 'make' | 'model' | 'year' | 'licensePlate' | 'vin'>;
  };
}

export function RouteDetail({ route }: RouteDetailProps) {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold mb-4">Route Details</h1>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <span className="text-gray-600">Origin:</span>
            <p className="font-medium">{route.origin}</p>
          </div>
          <div>
            <span className="text-gray-600">Destination:</span>
            <p className="font-medium">{route.destination}</p>
          </div>
          <div>
            <span className="text-gray-600">Scheduled Date:</span>
            <p className="font-medium">{formatDateInTenantTimezone(route.scheduledDate)}</p>
          </div>
          <div>
            <span className="text-gray-600">Status:</span>
            <span className={`px-3 py-1 rounded-full text-sm ${
              route.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
              route.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {route.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {route.notes && (
          <div className="mb-6">
            <span className="text-gray-600">Notes:</span>
            <p className="mt-1">{route.notes}</p>
          </div>
        )}
      </div>

      {/* Driver Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold mb-4">Assigned Driver</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-600">Name:</span>
            <p className="font-medium">{route.driver.firstName} {route.driver.lastName}</p>
          </div>
          <div>
            <span className="text-gray-600">Email:</span>
            <p className="font-medium">{route.driver.email}</p>
          </div>
          {route.driver.licenseNumber && (
            <div>
              <span className="text-gray-600">License Number:</span>
              <p className="font-medium">{route.driver.licenseNumber}</p>
            </div>
          )}
        </div>
        <Link
          href={`/drivers/${route.driver.id}`}
          className="text-blue-600 hover:text-blue-800 font-medium mt-4 inline-block"
        >
          View Driver Details →
        </Link>
      </div>

      {/* Truck Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold mb-4">Assigned Truck</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-600">Vehicle:</span>
            <p className="font-medium">{route.truck.year} {route.truck.make} {route.truck.model}</p>
          </div>
          <div>
            <span className="text-gray-600">License Plate:</span>
            <p className="font-medium">{route.truck.licensePlate}</p>
          </div>
          <div>
            <span className="text-gray-600">VIN:</span>
            <p className="font-medium">{route.truck.vin}</p>
          </div>
        </div>
        <Link
          href={`/trucks/${route.truck.id}`}
          className="text-blue-600 hover:text-blue-800 font-medium mt-4 inline-block"
        >
          View Truck Details →
        </Link>
      </div>
    </div>
  );
}
```

**Why unified view:** ROUT-04 requires "unified route detail showing driver, truck, documents, and status on one screen." Single-page view eliminates navigation between separate driver/truck detail pages. Use Prisma `include` to fetch all related data in one query (N+1 query prevention).

### Pattern 4: Timezone-Aware Date Formatting

**What:** Format dates using tenant's timezone (Tenant.timezone field) to display correct local time. PostgreSQL stores TIMESTAMPTZ in UTC automatically, format for display in tenant timezone.

**When to use:** All date displays in route list and detail views.

**Example:**
```typescript
// lib/utils/date.ts
/**
 * Format date in tenant timezone using Intl.DateTimeFormat.
 * Uses tenant timezone from context (stored in Tenant.timezone field).
 *
 * @param date - Date object or ISO string
 * @param timezone - Tenant timezone (e.g., "America/New_York", "UTC")
 * @returns Formatted date string
 */
export function formatDateInTenantTimezone(
  date: Date | string,
  timezone: string = 'UTC',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: timezone,
  }).format(dateObj);
}

/**
 * Format date for datetime-local input (YYYY-MM-DDTHH:mm format).
 * Converts UTC date to tenant timezone for form input.
 *
 * @param date - Date object
 * @param timezone - Tenant timezone
 * @returns ISO 8601 string without timezone (for datetime-local input)
 */
export function formatForDatetimeInput(date: Date, timezone: string = 'UTC'): string {
  // Get date in tenant timezone
  const formatted = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date);

  // Convert to YYYY-MM-DDTHH:mm format
  const [datePart, timePart] = formatted.split(', ');
  return `${datePart}T${timePart}`;
}
```

```typescript
// app/(owner)/routes/[id]/page.tsx
import { getTenantContext } from '@/lib/context/tenant-context';
import { formatDateInTenantTimezone } from '@/lib/utils/date';

export default async function RouteDetailPage({ params }: { params: { id: string } }) {
  const { tenant } = await getTenantContext();
  const route = await prisma.route.findUnique({ where: { id: params.id } });

  // Format date server-side in tenant timezone
  const formattedDate = formatDateInTenantTimezone(route.scheduledDate, tenant.timezone);

  return (
    <div>
      <p>Scheduled: {formattedDate}</p>
    </div>
  );
}
```

**Hydration mismatch prevention:** Format dates server-side using tenant timezone to avoid mismatch between server render (UTC) and client render (browser timezone). If client-side formatting is needed (e.g., real-time "5 minutes ago"), use `suppressHydrationWarning={true}` on element.

**Source:** [Next.js date time handling best practices](https://www.linkedin.com/pulse/handling-date-time-nextjs-best-practices-common-pitfalls-aloui-zxkze)

### Pattern 5: TanStack Table Multi-Column Filtering

**What:** Route list with filters for status, driver, truck, and date range. TanStack Table supports column-specific filtering and global search.

**When to use:** Route list view (`/routes/page.tsx`).

**Example:**
```typescript
// components/routes/route-list.tsx
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import type { Route, User, Truck } from '@/generated/prisma/client';

interface RouteWithRelations extends Route {
  driver: Pick<User, 'firstName' | 'lastName'>;
  truck: Pick<Truck, 'make' | 'model' | 'licensePlate'>;
}

interface RouteListProps {
  routes: RouteWithRelations[];
  timezone: string;
}

export function RouteList({ routes, timezone }: RouteListProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns: ColumnDef<RouteWithRelations>[] = useMemo(() => [
    {
      accessorKey: 'origin',
      header: 'Origin',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'destination',
      header: 'Destination',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'scheduledDate',
      header: 'Scheduled Date',
      cell: (info) => {
        const date = info.getValue() as Date;
        return new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: timezone,
        }).format(date);
      },
      // Custom filter function for date range
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue) return true;
        const { start, end } = filterValue as { start?: Date; end?: Date };
        const rowDate = row.getValue(columnId) as Date;

        if (start && rowDate < start) return false;
        if (end && rowDate > end) return false;
        return true;
      },
    },
    {
      id: 'driver',
      accessorFn: (row) => `${row.driver.firstName} ${row.driver.lastName}`,
      header: 'Driver',
      cell: (info) => info.getValue(),
    },
    {
      id: 'truck',
      accessorFn: (row) => `${row.truck.make} ${row.truck.model} (${row.truck.licensePlate})`,
      header: 'Truck',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const status = info.getValue() as string;
        return (
          <span className={`px-3 py-1 rounded-full text-sm ${
            status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
            status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {status.replace('_', ' ')}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link
          href={`/routes/${row.original.id}`}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          View
        </Link>
      ),
    },
  ], [timezone]);

  const table = useReactTable({
    data: routes,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <input
          type="text"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search routes..."
          className="w-full max-w-md border border-gray-300 rounded-md px-4 py-2"
        />

        <select
          value={(table.getColumn('status')?.getFilterValue() as string) ?? ''}
          onChange={(e) => table.getColumn('status')?.setFilterValue(e.target.value || undefined)}
          className="border border-gray-300 rounded-md px-4 py-2"
        >
          <option value="">All Statuses</option>
          <option value="PLANNED">Planned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left text-sm font-medium text-gray-500 uppercase px-6 py-3"
                  >
                    <div
                      className={
                        header.column.getCanSort()
                          ? 'cursor-pointer select-none'
                          : ''
                      }
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                      {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Key features:**
- Global search across all columns
- Status dropdown filter (Planned, In Progress, Completed)
- Date column formatted in tenant timezone
- Custom filter function for date range (can be extended with date range picker)
- Driver and truck columns use `accessorFn` to combine related data

**Source:** [TanStack Table Column Filtering Guide](https://tanstack.com/table/v8/docs/guide/column-filtering)

### Pattern 6: Route Lifecycle State Transitions

**What:** Routes progress through lifecycle: PLANNED → IN_PROGRESS → COMPLETED. Transitions should be explicit (server action) not automatic.

**When to use:** Route detail page with status update actions.

**Example:**
```typescript
// app/(owner)/actions/routes.ts
export async function updateRouteStatus(routeId: string, newStatus: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED') {
  await requireRole(['OWNER', 'MANAGER']);

  const prisma = await getTenantPrisma();

  // Validate status transition (optional: enforce state machine rules)
  const route = await prisma.route.findUnique({
    where: { id: routeId },
  });

  if (!route) {
    return { error: 'Route not found' };
  }

  // Example state machine validation (optional for v1)
  const validTransitions: Record<string, string[]> = {
    PLANNED: ['IN_PROGRESS'],
    IN_PROGRESS: ['COMPLETED'],
    COMPLETED: [], // Cannot transition from COMPLETED
  };

  if (!validTransitions[route.status].includes(newStatus)) {
    return { error: `Cannot transition from ${route.status} to ${newStatus}` };
  }

  await prisma.route.update({
    where: { id: routeId },
    data: { status: newStatus },
  });

  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);
  return { success: true };
}
```

**State machine rules (optional for v1):**
- PLANNED → IN_PROGRESS (driver starts route)
- IN_PROGRESS → COMPLETED (driver finishes route)
- COMPLETED is terminal (no transitions out)

**Recommendation:** Start with simple status updates (no validation), add state machine rules in Phase 6+ if needed.

### Anti-Patterns to Avoid

- **No validation of driver/truck assignments:** Always verify driver is active and truck exists before creating route—foreign key constraint prevents database errors but doesn't provide helpful error messages to users.
- **Client-side date formatting without suppressHydrationWarning:** Formatting dates client-side causes hydration mismatch; either format server-side or add `suppressHydrationWarning={true}`.
- **Storing recurring route instances separately:** Creating database row for each instance of recurring route (e.g., "every Monday" creates 52 rows per year) causes bloat; store pattern and generate instances at runtime.
- **Not using TIMESTAMPTZ for scheduledDate:** Using `DateTime` without `@db.Timestamptz` loses timezone information; PostgreSQL stores as local time without timezone offset.
- **Manual WHERE tenantId clauses in route queries:** Repository pattern with RLS extension handles tenant scoping automatically—don't add manual WHERE clauses (error-prone).
- **Not including driver/truck data in route list queries:** Fetching routes then separately fetching driver/truck for each route causes N+1 queries; use Prisma `include` to fetch related data in single query.
- **Hard-coding timezone in date formatting:** Use tenant.timezone field to format dates in correct local time—hard-coding "America/New_York" breaks for tenants in other timezones.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recurring route logic | Custom recurrence pattern parsing | Defer to Phase 7+ or use library like `rrule` | Recurrence patterns (daily, weekly, monthly, with exceptions) are complex; parsing "every 2nd Monday except holidays" requires handling edge cases (leap years, month boundaries, DST transitions); defer to later phase unless specifically required |
| Date timezone conversion | Manual UTC offset calculations | Intl.DateTimeFormat or date-fns-tz | Timezone conversion involves DST transitions, historical timezone changes, and leap seconds; Intl.DateTimeFormat handles these automatically |
| Route optimization (shortest path) | Custom routing algorithm | Defer to Phase 7+ or use external API (Google Maps, Mapbox) | Route optimization (traveling salesman problem) is NP-hard; custom algorithms are slow and inaccurate; external APIs provide traffic-aware, real-time routing |
| Date range filtering UI | Custom date picker component | Native datetime-local input or library (react-datepicker) | Custom date pickers require handling calendar logic, keyboard navigation, accessibility, mobile touch; use native input for v1 (works on all browsers), add library later if richer UI needed |

**Key insight:** Route management has deceptively complex problems (recurring patterns, timezone handling, route optimization). For v1, implement simple one-time routes with basic date handling. Defer advanced features to Phase 7+ when requirements are clearer.

## Common Pitfalls

### Pitfall 1: Date Hydration Mismatch (Server UTC vs. Client Local Time)

**What goes wrong:** Server renders date in UTC, client re-renders in browser's local timezone, React hydration error: "Text content does not match server-rendered HTML."

**Why it happens:**
- PostgreSQL TIMESTAMPTZ stores dates in UTC
- Server Component formats date using UTC timezone
- Client re-renders using browser's local timezone (e.g., "America/New_York")
- Hydration compares server HTML vs. client HTML, finds mismatch

**How to avoid:**
1. Format dates server-side using tenant timezone (not UTC, not browser timezone)
2. Pass formatted string to client component (don't pass Date object and format client-side)
3. If client-side formatting needed, use `suppressHydrationWarning={true}` on element
4. Use `useEffect` to format date client-side after hydration completes

**Warning signs:**
- Hydration error in console: "Text content does not match"
- Dates show different times on refresh vs. navigation
- Dates flicker or change after page loads

**Example (GOOD):**
```typescript
// Server Component - format date before passing to client
export default async function RouteDetailPage({ params }) {
  const route = await prisma.route.findUnique({ where: { id: params.id } });
  const tenant = await getTenant();

  // Format date server-side in tenant timezone
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone: tenant.timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(route.scheduledDate);

  return <RouteDetail route={route} formattedDate={formattedDate} />;
}
```

**Example (BAD):**
```typescript
// Client Component - formats date, causes hydration mismatch
export function RouteDetail({ route }) {
  // Server renders in UTC, client renders in browser timezone → MISMATCH
  const formattedDate = route.scheduledDate.toLocaleString();

  return <p>Scheduled: {formattedDate}</p>;
}
```

**Sources:**
- [Next.js Hydration Errors in 2026](https://medium.com/@blogs-world/next-js-hydration-errors-in-2026-the-real-causes-fixes-and-prevention-checklist-4a8304d53702)
- [How to Fix Hydration Errors in Next.js](https://www.swhabitation.com/blogs/how-to-fix-hydration-errors-nextjs)

### Pitfall 2: Foreign Key Constraint Violations When Deleting Driver/Truck

**What goes wrong:** Owner deletes driver or truck that has assigned routes. Database rejects deletion with foreign key constraint error. User sees cryptic error message.

**Why it happens:**
- Route model has foreign keys to User (driver) and Truck
- Deleting referenced record violates referential integrity
- PostgreSQL prevents deletion to maintain data consistency

**How to avoid:**
1. Check for assigned routes before allowing driver/truck deletion
2. Show helpful error: "Cannot delete driver—3 routes assigned. Deactivate instead."
3. Recommend deactivation (isActive = false) instead of deletion for drivers
4. For trucks, prevent deletion if routes exist (or implement cascade delete if routes should be removed)
5. Add database-level cascade rule (optional): `onDelete: Cascade` in Prisma schema

**Warning signs:**
- Error: "Foreign key constraint violation"
- Delete action succeeds for some drivers but fails for others
- No validation before delete operation

**Example (GOOD - check before delete):**
```typescript
// app/(owner)/actions/drivers.ts
export async function deleteDriver(driverId: string) {
  await requireRole(['OWNER', 'MANAGER']);

  const prisma = await getTenantPrisma();

  // Check for assigned routes
  const routeCount = await prisma.route.count({
    where: { driverId },
  });

  if (routeCount > 0) {
    return {
      error: `Cannot delete driver—${routeCount} routes assigned. Deactivate driver instead.`
    };
  }

  await prisma.user.delete({ where: { id: driverId } });

  revalidatePath('/drivers');
  return { success: true };
}
```

**Alternative (Prisma schema with cascade):**
```prisma
model Route {
  driverId String @db.Uuid
  driver   User   @relation(fields: [driverId], references: [id], onDelete: Cascade)
}
```

**Recommendation:** For v1, prevent deletion if routes exist (show error message). Decide cascade vs. prevent based on business rules: should deleting driver also delete their historical routes? (Usually no—preserve audit trail).

### Pitfall 3: Not Including Related Data Causes N+1 Queries

**What goes wrong:** Route list page fetches routes, then separately fetches driver and truck for each route. 100 routes = 1 route query + 100 driver queries + 100 truck queries = 201 database queries. Page is slow.

**Why it happens:**
- Initial query only fetches Route records
- Rendering loop calls `prisma.user.findUnique()` and `prisma.truck.findUnique()` for each route
- Each call is separate database query

**How to avoid:**
1. Use Prisma `include` to fetch related data in single query
2. Select only needed fields to reduce payload size
3. For large lists, consider pagination to limit rows fetched

**Warning signs:**
- Slow page load times (seconds instead of milliseconds)
- Database query logs show hundreds of queries for single page load
- Performance degrades as number of routes increases

**Example (GOOD - include related data):**
```typescript
// app/(owner)/routes/page.tsx
export async function listRoutes() {
  const prisma = await getTenantPrisma();

  return prisma.route.findMany({
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      truck: {
        select: {
          id: true,
          make: true,
          model: true,
          licensePlate: true,
        },
      },
    },
    orderBy: { scheduledDate: 'desc' },
  });
}
```

**Example (BAD - N+1 queries):**
```typescript
// Fetches routes only
const routes = await prisma.route.findMany();

// In component, fetches driver/truck separately for EACH route
{routes.map(route => {
  const driver = await prisma.user.findUnique({ where: { id: route.driverId } }); // N queries
  const truck = await prisma.truck.findUnique({ where: { id: route.truckId } }); // N queries
  // ...
})}
```

**Source:** [Prisma Relation Queries Documentation](https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries)

### Pitfall 4: Assigning Deactivated Driver to Route

**What goes wrong:** Owner creates route, selects driver from dropdown, submits form. Driver was deactivated yesterday but still appears in dropdown. Route is created with inactive driver. Driver cannot log in to view route assignment.

**Why it happens:**
- Driver dropdown populated with all drivers (active and inactive)
- No validation that driver is active before creating route
- Database allows foreign key to inactive user (isActive is application-level concept, not database constraint)

**How to avoid:**
1. Filter driver dropdown to show only active drivers (`WHERE isActive = true`)
2. Validate driver is active in server action before creating route
3. Show warning if trying to assign inactive driver: "Driver [name] is deactivated and cannot be assigned to routes."
4. For route detail view, show deactivated status if driver was deactivated after route creation

**Warning signs:**
- Routes assigned to deactivated drivers
- Driver dropdown shows inactive drivers
- No validation of driver.isActive in route creation

**Example (GOOD):**
```typescript
// app/(owner)/routes/new/page.tsx
export async function NewRoutePage() {
  const prisma = await getTenantPrisma();

  // Fetch only active drivers
  const drivers = await prisma.user.findMany({
    where: {
      role: 'DRIVER',
      isActive: true, // Filter to active drivers only
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  return <RouteForm drivers={drivers} />;
}

// Server action validation
export async function createRoute(formData) {
  // ... parse input

  // Validate driver is active
  const driver = await prisma.user.findUnique({
    where: { id: driverId },
  });

  if (!driver || !driver.isActive) {
    return { error: { driverId: ['Selected driver is not active'] } };
  }

  // ... create route
}
```

### Pitfall 5: Status Transitions Without Validation (Completed → Planned)

**What goes wrong:** Owner accidentally changes route status from COMPLETED back to PLANNED. Historical data is corrupted—completed route appears as pending. Reports show incorrect metrics.

**Why it happens:**
- Status update action accepts any status value
- No validation of valid state transitions
- UI allows selecting any status from dropdown

**How to avoid:**
1. Implement state machine validation in server action
2. UI only shows valid next states (e.g., if COMPLETED, no status change allowed)
3. Add "completedAt" timestamp field to track completion time (immutable)
4. Consider making COMPLETED terminal state (no transitions out)

**Warning signs:**
- Status values change arbitrarily (COMPLETED → PLANNED → IN_PROGRESS)
- No audit trail of status changes
- Reports show completed routes with future scheduled dates

**Example (state machine validation):**
```typescript
const VALID_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  PLANNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [], // Terminal state
};

export async function updateRouteStatus(routeId: string, newStatus: RouteStatus) {
  const route = await prisma.route.findUnique({ where: { id: routeId } });

  if (!VALID_TRANSITIONS[route.status].includes(newStatus)) {
    return {
      error: `Cannot transition from ${route.status} to ${newStatus}`
    };
  }

  const updateData: any = { status: newStatus };

  // Set completedAt timestamp when transitioning to COMPLETED
  if (newStatus === 'COMPLETED') {
    updateData.completedAt = new Date();
  }

  await prisma.route.update({
    where: { id: routeId },
    data: updateData,
  });

  return { success: true };
}
```

**Recommendation for v1:** Implement basic validation (prevent COMPLETED → other states), add full state machine in Phase 6+ if needed.

### Pitfall 6: Date Input Sends Browser Timezone, Stored as UTC Without Conversion

**What goes wrong:** Owner in New York (UTC-5) schedules route for "2026-03-15 09:00 AM" local time. Form sends "2026-03-15T09:00" to server. Server treats as UTC and stores "2026-03-15 09:00 UTC". When displayed in tenant timezone (America/New_York), shows as "2026-03-15 04:00 AM" (5 hours earlier).

**Why it happens:**
- HTML datetime-local input sends time without timezone offset
- Server interprets input as UTC by default
- No conversion from tenant timezone to UTC before storing

**How to avoid:**
1. Accept datetime-local input as ISO string (2026-03-15T09:00)
2. Interpret input as tenant's local time, not UTC
3. Convert from tenant timezone to UTC before storing
4. Display dates in tenant timezone when reading from database

**Warning signs:**
- Scheduled dates show several hours earlier/later than entered
- Time difference matches timezone offset
- Dates are correct in UTC but wrong in local time

**Example (GOOD - convert from tenant timezone to UTC):**
```typescript
// app/(owner)/actions/routes.ts
import { toDate } from 'date-fns-tz';

export async function createRoute(formData: FormData) {
  const scheduledDateInput = formData.get('scheduledDate') as string; // "2026-03-15T09:00"
  const tenant = await getTenant();

  // Parse input as tenant's local time, convert to UTC Date object
  const scheduledDateUTC = toDate(scheduledDateInput, {
    timeZone: tenant.timezone, // e.g., "America/New_York"
  });

  await prisma.route.create({
    data: {
      // ... other fields
      scheduledDate: scheduledDateUTC, // Stored as UTC in TIMESTAMPTZ column
    },
  });
}
```

**Alternative (if not using date-fns-tz):**
```typescript
// Manual conversion using Intl.DateTimeFormat
function parseLocalDatetimeAsUTC(datetimeString: string, timezone: string): Date {
  const [datePart, timePart] = datetimeString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  // Create date in tenant timezone
  const localDate = new Date();
  localDate.setFullYear(year, month - 1, day);
  localDate.setHours(hour, minute, 0, 0);

  // Get UTC offset for tenant timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });

  // ... complex conversion logic
  // Recommendation: use date-fns-tz instead of manual conversion
}
```

**Recommendation:** Use date-fns-tz for timezone conversions (handles DST, historical timezone changes). Manual conversion is error-prone.

**Sources:**
- [Handling Date and Time in Next.js: Best Practices](https://www.linkedin.com/pulse/handling-date-time-nextjs-best-practices-common-pitfalls-aloui-zxkze)
- [A Guide to Handling Date and Time for Full Stack JavaScript Developers](https://dd.engineering/blog/a-guide-to-handling-date-and-time-for-full-stack-javascript-developers)

## Code Examples

Verified patterns from official sources and existing codebase:

### Complete Route CRUD Server Actions

```typescript
// app/(owner)/actions/routes.ts
'use server';

import { requireRole } from '@/lib/auth/server';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { routeCreateSchema, routeUpdateSchema } from '@/lib/validations/route.schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createRoute(prevState: any, formData: FormData) {
  await requireRole(['OWNER', 'MANAGER']);

  const rawData = {
    origin: formData.get('origin'),
    destination: formData.get('destination'),
    scheduledDate: formData.get('scheduledDate'),
    driverId: formData.get('driverId'),
    truckId: formData.get('truckId'),
    notes: formData.get('notes'),
  };

  const result = routeCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Validate driver is active
  const driver = await prisma.user.findUnique({
    where: { id: result.data.driverId },
  });

  if (!driver || !driver.isActive || driver.role !== 'DRIVER') {
    return { error: { driverId: ['Selected driver is not available'] } };
  }

  // Validate truck exists
  const truck = await prisma.truck.findUnique({
    where: { id: result.data.truckId },
  });

  if (!truck) {
    return { error: { truckId: ['Selected truck not found'] } };
  }

  // Create route
  const route = await prisma.route.create({
    data: {
      tenantId,
      origin: result.data.origin,
      destination: result.data.destination,
      scheduledDate: new Date(result.data.scheduledDate),
      driverId: result.data.driverId,
      truckId: result.data.truckId,
      notes: result.data.notes,
      status: 'PLANNED',
    },
  });

  revalidatePath('/routes');
  redirect(`/routes/${route.id}`);
}

export async function updateRoute(routeId: string, prevState: any, formData: FormData) {
  await requireRole(['OWNER', 'MANAGER']);

  const rawData = Object.fromEntries(formData.entries());
  const result = routeUpdateSchema.safeParse(rawData);

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const prisma = await getTenantPrisma();

  await prisma.route.update({
    where: { id: routeId },
    data: {
      ...result.data,
      scheduledDate: result.data.scheduledDate ? new Date(result.data.scheduledDate) : undefined,
    },
  });

  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);
  redirect(`/routes/${routeId}`);
}

export async function updateRouteStatus(routeId: string, newStatus: 'IN_PROGRESS' | 'COMPLETED') {
  await requireRole(['OWNER', 'MANAGER']);

  const prisma = await getTenantPrisma();

  await prisma.route.update({
    where: { id: routeId },
    data: { status: newStatus },
  });

  revalidatePath('/routes');
  revalidatePath(`/routes/${routeId}`);
  return { success: true };
}

export async function deleteRoute(routeId: string) {
  await requireRole(['OWNER', 'MANAGER']);

  const prisma = await getTenantPrisma();

  await prisma.route.delete({
    where: { id: routeId },
  });

  revalidatePath('/routes');
  return { success: true };
}

export async function listRoutes() {
  await requireRole(['OWNER', 'MANAGER', 'DRIVER']);

  const prisma = await getTenantPrisma();

  return prisma.route.findMany({
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      truck: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
        },
      },
    },
    orderBy: { scheduledDate: 'desc' },
  });
}
```

### Zod Validation Schemas

```typescript
// lib/validations/route.schemas.ts
import { z } from 'zod';

export const routeCreateSchema = z.object({
  origin: z.string().min(1, 'Origin is required').max(200),
  destination: z.string().min(1, 'Destination is required').max(200),
  scheduledDate: z.string().datetime('Invalid date format'), // ISO 8601 string
  driverId: z.string().uuid('Invalid driver ID'),
  truckId: z.string().uuid('Invalid truck ID'),
  notes: z.string().max(1000).optional(),
});

export const routeUpdateSchema = routeCreateSchema.partial();

export type RouteCreate = z.infer<typeof routeCreateSchema>;
export type RouteUpdate = z.infer<typeof routeUpdateSchema>;
```

### Route Repository

```typescript
// lib/db/repositories/route.repository.ts
import { TenantRepository } from './base.repository';
import type { Prisma } from '@/generated/prisma/client';

export class RouteRepository extends TenantRepository {
  async findAll(options?: {
    status?: string;
    driverId?: string;
    truckId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Prisma.RouteWhereInput = {};

    if (options?.status) {
      where.status = options.status as any;
    }

    if (options?.driverId) {
      where.driverId = options.driverId;
    }

    if (options?.truckId) {
      where.truckId = options.truckId;
    }

    if (options?.startDate || options?.endDate) {
      where.scheduledDate = {};
      if (options.startDate) {
        where.scheduledDate.gte = options.startDate;
      }
      if (options.endDate) {
        where.scheduledDate.lte = options.endDate;
      }
    }

    return this.db.route.findMany({
      where,
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        truck: {
          select: {
            id: true,
            make: true,
            model: true,
            licensePlate: true,
          },
        },
      },
      orderBy: { scheduledDate: 'desc' },
    });
  }

  async findById(id: string) {
    return this.db.route.findUnique({
      where: { id },
      include: {
        driver: true,
        truck: true,
      },
    });
  }

  async create(data: Prisma.RouteCreateInput) {
    return this.db.route.create({ data });
  }

  async update(id: string, data: Prisma.RouteUpdateInput) {
    return this.db.route.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.route.delete({
      where: { id },
    });
  }
}
```

### Date Formatting Utilities

```typescript
// lib/utils/date.ts

/**
 * Format date in tenant timezone using Intl.DateTimeFormat.
 * Avoids hydration mismatches by formatting server-side.
 */
export function formatDateInTenantTimezone(
  date: Date | string,
  timezone: string = 'UTC',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: timezone,
  }).format(dateObj);
}

/**
 * Format date for datetime-local input (YYYY-MM-DDTHH:mm).
 */
export function formatForDatetimeInput(date: Date, timezone: string = 'UTC'): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date);

  const [datePart, timePart] = formatted.split(', ');
  return `${datePart}T${timePart}`;
}
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| Moment.js for dates | Intl.DateTimeFormat or date-fns | 2020+ | Moment.js is 288KB and deprecated; Intl.DateTimeFormat is built-in (0KB); date-fns is modular (67KB for tz support) |
| Storing recurring instances | Store pattern, generate at runtime | Industry best practice | Storing instances causes database bloat (52 rows/year for weekly route); pattern storage is scalable |
| Manual timezone conversion | TIMESTAMPTZ + Intl | PostgreSQL 9.2+ (2012) | TIMESTAMPTZ auto-converts to UTC; Intl.DateTimeFormat handles display in any timezone |
| Client-side date formatting | Server-side formatting | Next.js App Router (2023) | Server-side formatting avoids hydration mismatches; works without JavaScript |
| Many-to-many route assignments | One-to-one foreign keys for v1 | Phase 5 simplification | One driver, one truck per route is simpler; many-to-many (multiple drivers per route) deferred to Phase 7+ |

**Deprecated/outdated:**
- **Moment.js:** 288KB bundle size, no longer maintained—use Intl.DateTimeFormat (built-in) or date-fns (modular)
- **Storing recurring route instances separately:** Causes database bloat—store recurrence pattern and generate instances at runtime
- **Manual UTC offset calculations:** Error-prone (DST, leap seconds)—use TIMESTAMPTZ and Intl.DateTimeFormat
- **Client-side only date formatting:** Causes hydration mismatches—format server-side when possible

## Open Questions

1. **Recurring routes implementation timeline**
   - What we know: Recurring routes require pattern storage and runtime instance generation (complex)
   - What's unclear: Is recurring route functionality required for Phase 5 MVP, or can it be deferred to Phase 7+?
   - Recommendation: **Defer to Phase 7+**—implement one-time routes only for Phase 5; add recurring patterns when requirements are clearer and usage patterns are established

2. **Route optimization/routing engine**
   - What we know: Route optimization (shortest path, traffic-aware routing) is complex (NP-hard problem)
   - What's unclear: Do users need automated route optimization, or is manual origin/destination sufficient?
   - Recommendation: **Manual entry for Phase 5**—owner manually enters origin and destination; defer route optimization to Phase 7+ or integrate external API (Google Maps Directions) if needed

3. **Multiple drivers per route**
   - What we know: Current design is one driver, one truck per route
   - What's unclear: Do routes ever need multiple drivers (e.g., team driving for long haul)?
   - Recommendation: **One driver for Phase 5**—simplifies data model and UI; if multi-driver is needed, add junction table (RouteAssignment) in Phase 7+

4. **Route completion timestamp**
   - What we know: Route has status enum (PLANNED, IN_PROGRESS, COMPLETED)
   - What's unclear: Should we track completion timestamp (completedAt field) for reporting/analytics?
   - Recommendation: **Add completedAt field**—useful for calculating actual vs. scheduled time, driver performance metrics; set timestamp when status transitions to COMPLETED

5. **Date range filtering UI**
   - What we know: TanStack Table supports custom filter functions for date ranges
   - What's unclear: Should route list have visual date range picker, or is text input sufficient?
   - Recommendation: **Text input for Phase 5** (use native datetime-local inputs for start/end dates); add visual date picker (react-datepicker) in Phase 6+ if users request richer UI

## Sources

### Primary (HIGH confidence)

- [Prisma Filtering and Sorting Documentation](https://www.prisma.io/docs/orm/prisma-client/queries/filtering-and-sorting) - Official Prisma filtering guide
- [Prisma Relation Queries Documentation](https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries) - Official relation queries guide
- [TanStack Table Column Filtering Guide](https://tanstack.com/table/v8/docs/guide/column-filtering) - Official column filtering documentation
- [TanStack Table Filters Guide](https://tanstack.com/table/v8/docs/guide/filters) - Official filters guide
- [Next.js Text content does not match server-rendered HTML](https://nextjs.org/docs/messages/react-hydration-error) - Official Next.js hydration error docs
- [Next.js Getting Started: Updating Data](https://nextjs.org/docs/app/getting-started/updating-data) - Official Server Actions CRUD guide (Phase 3 pattern)
- [React useActionState](https://react.dev/reference/react/useActionState) - Official React 19 hook (Phase 3 pattern)
- [Zod Documentation](https://zod.dev/) - Official validation library (Phase 3 pattern)

### Secondary (MEDIUM confidence)

- [Recurring Calendar Events — Database Design](https://medium.com/@aureliadotlim/recurring-calendar-events-database-design-dc872fb4f2b5) - Recurring events pattern
- [Again and Again! Managing Recurring Events In a Data Model](https://www.red-gate.com/blog/again-and-again-managing-recurring-events-in-a-data-model) - Recurring events best practices
- [Handling Date and Time in Next.js: Best Practices](https://www.linkedin.com/pulse/handling-date-time-nextjs-best-practices-common-pitfalls-aloui-zxkze) - Date/time handling guide
- [Next.js Date & Time Localization Guide](https://staarter.dev/blog/nextjs-date-and-time-localization-guide) - Localization patterns
- [Displaying Local Times in Next.js](https://francoisbest.com/posts/2023/displaying-local-times-in-nextjs) - Timezone handling
- [A Guide to Handling Date and Time for Full Stack JavaScript Developers](https://dd.engineering/blog/a-guide-to-handling-date-and-time-for-full-stack-javascript-developers) - Comprehensive date/time guide
- [Next.js Hydration Errors in 2026](https://medium.com/@blogs-world/next-js-hydration-errors-in-2026-the-real-causes-fixes-and-prevention-checklist-4a8304d53702) - Hydration error solutions
- [How to Fix Hydration Errors in Next.js](https://www.swhabitation.com/blogs/how-to-fix-hydration-errors-nextjs) - Practical fixes
- [How to Design Database for Logistics and Transportation](https://www.geeksforgeeks.org/sql/how-to-design-database-for-logistics-and-transportation/) - Database design patterns
- [Prisma Migrate: Expand and Contract Pattern](https://www.prisma.io/docs/guides/data-migration) - Schema migration best practices
- [Route4Me Recurring Routes Documentation](https://support.route4me.com/repeating-route-templates-for-recurring-schedule-delivery-routes/) - Industry pattern for recurring routes

### Tertiary (LOW confidence - needs validation)

- [Fleet Management Operations Guide](https://www.allpronow.net/blog/fleet-management-operations/) - General fleet management context
- [Fleet Lifecycle Management](https://www.fleetio.com/features/lifecycle-management) - Industry terminology
- [Top 10 Fleet Management KPIs](https://oxmaint.com/industries/fleet-management/top-10-fleet-management-kpis-track-2026) - Performance metrics

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - Same stack as Phases 3-4 (React 19, Next.js 16, Prisma, TanStack Table), all verified from official docs
- Architecture: **HIGH** - Foreign key pattern standard relational design, Prisma include pattern from official docs, date formatting from Next.js best practices
- Pitfalls: **HIGH** - Hydration errors from official Next.js docs, N+1 queries from Prisma docs, foreign key constraints from PostgreSQL standards
- Code examples: **HIGH** - Follows Phase 3-4 patterns (Server Actions, Zod schemas, TanStack Table), date formatting from official guides

**Research date:** 2026-02-14
**Valid until:** 2026-03-16 (30 days—stack is stable, patterns unlikely to change significantly)

**Key risk areas requiring validation during planning:**
1. Date timezone conversion—verify Intl.DateTimeFormat handles tenant timezone correctly, test with multiple timezones
2. Foreign key cascade behavior—confirm deleting driver/truck with assigned routes shows helpful error (not database error)
3. Hydration mismatch prevention—test server-side date formatting across different timezones, verify no hydration errors
4. TanStack Table filtering—verify multi-column filters (status, date range) work with Prisma queries
5. Route assignment validation—test creating route with inactive driver, verify error message is user-friendly
