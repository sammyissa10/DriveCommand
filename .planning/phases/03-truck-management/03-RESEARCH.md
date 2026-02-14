# Phase 3: Truck Management - Research

**Researched:** 2026-02-14
**Domain:** CRUD operations for fleet inventory management with React 19, Next.js 16, and Server Actions
**Confidence:** HIGH

## Summary

Phase 3 builds the first core business entity (trucks) with full CRUD operations on top of the existing multi-tenant foundation and authentication system. The modern stack (React 19 + Next.js 16) provides first-class patterns for this: Server Actions for mutations, `useActionState` for form state management with built-in pending/error states, and `useOptimistic` for instant UI feedback. The repository pattern established in Phase 1 provides automatic tenant-scoped data access through RLS.

**Critical insight:** React 19's `useActionState` has replaced older form patterns—it's now the standard way to handle form submissions with built-in loading states and error handling. Server Actions are public POST endpoints that bypass middleware, so every single action needs explicit authentication and authorization checks at the entry point (never rely on middleware or component-level guards).

**Primary recommendation:** Use React 19's `useActionState` for forms with Zod validation schemas, implement CRUD server actions with explicit role checks (`requireRole(['OWNER', 'MANAGER'])`), store structured document metadata in JSONB with typed Zod schemas for compile-time safety, use TanStack Table for the sortable/filterable truck list (headless, 15KB, full control), validate VIN with standard 17-character regex excluding I/O/Q, and track odometer readings as whole numbers (federal requirement, validated for incremental increase).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.0.0 (installed) | UI with new form hooks | `useActionState` and `useOptimistic` are now production-ready, first-class patterns for forms and optimistic updates |
| Next.js 16 | ^16.0.0 (installed) | Full-stack framework | Server Actions are stable, `proxy.ts` for tenant injection already configured |
| Zod | ^4.3.6 (installed) | Schema validation | Type-safe validation for server actions, auto-generates TypeScript types with `z.infer<typeof schema>` |
| Prisma 7 | ^7.4.0 (installed) | ORM with RLS | Repository pattern established, tenant-scoped queries automatic |
| PostgreSQL 17 | 17 (production) | Database with JSONB | JSONB for structured metadata (registration, insurance), RLS policies enforce tenant isolation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Table | ^8.20+ | Headless table library | Sortable/filterable truck list, 15KB bundle, full UI control, TypeScript-first |
| shadcn/ui | Latest | Tailwind component primitives | Optional: Pre-built form components (Input, Button, Select) with accessibility, copy source code into project |
| Vitest | ^4.0.18 (installed) | Testing framework | Testing CRUD actions, mocking tenant context |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Table | MUI Data Grid | MUI includes ready-made UI but requires buying into Material Design system and MUI X Pro for advanced features; TanStack is headless (full control) but requires building UI |
| JSONB for metadata | Separate `TruckDocument` table | JSONB keeps simple metadata (registration number, insurance expiry) with the truck entity; separate table is better if tracking full document lifecycle with uploads/versions |
| `useActionState` | React Hook Form | React Hook Form offers richer features (field-level validation, watch, complex forms) but adds 42KB; `useActionState` is built-in and sufficient for basic CRUD forms |
| Hard deletes | Soft deletes with `deletedAt` | Hard deletes are simpler (prior decision from Phase 1); soft deletes require partial indexes for unique constraints and add query complexity |

**Installation:**
```bash
npm install @tanstack/react-table@latest
# Optional: shadcn/ui components (copy source code, not npm install)
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (owner)/
│   │   ├── trucks/
│   │   │   ├── page.tsx                    # Truck list view
│   │   │   ├── new/
│   │   │   │   └── page.tsx                # Create truck form
│   │   │   └── [id]/
│   │   │       ├── page.tsx                # View truck details
│   │   │       └── edit/
│   │   │           └── page.tsx            # Edit truck form
│   │   └── actions/
│   │       └── trucks.ts                   # Server actions for truck CRUD
├── lib/
│   ├── db/
│   │   └── repositories/
│   │       └── truck.repository.ts         # TenantRepository subclass
│   ├── validations/
│   │   └── truck.schemas.ts                # Zod schemas for truck data
│   └── types/
│       └── truck.types.ts                  # TypeScript types
└── components/
    └── trucks/
        ├── truck-form.tsx                  # Reusable form component
        ├── truck-list.tsx                  # TanStack Table component
        └── truck-card.tsx                  # Optional: card view
```

### Pattern 1: Server Actions for CRUD with Role-Based Authorization

**What:** Every CRUD operation (create, read, update, delete) is a server action with explicit auth/validation checks.

**When to use:** All truck management operations—server actions are the standard Next.js 16 pattern for mutations.

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/getting-started/updating-data
// app/(owner)/actions/trucks.ts
'use server';

import { z } from 'zod';
import { requireRole } from '@/lib/auth/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { truckCreateSchema, truckUpdateSchema } from '@/lib/validations/truck.schemas';
import { revalidatePath } from 'next/cache';

export async function createTruck(input: unknown) {
  // 1. Require authorization (Owner or Manager)
  await requireRole(['OWNER', 'MANAGER']);

  // 2. Validate input with Zod
  const data = truckCreateSchema.parse(input);

  // 3. Get tenant-scoped Prisma client (RLS automatic)
  const prisma = await getTenantPrisma();

  // 4. Create truck (tenantId auto-populated by RLS)
  const truck = await prisma.truck.create({
    data: {
      make: data.make,
      model: data.model,
      year: data.year,
      vin: data.vin,
      licensePlate: data.licensePlate,
      odometer: data.odometer,
      documentMetadata: data.documentMetadata, // JSONB field
    },
  });

  // 5. Revalidate list page cache
  revalidatePath('/trucks');

  return { success: true, truckId: truck.id };
}

export async function updateTruck(id: string, input: unknown) {
  await requireRole(['OWNER', 'MANAGER']);
  const data = truckUpdateSchema.parse(input);
  const prisma = await getTenantPrisma();

  const truck = await prisma.truck.update({
    where: { id },
    data,
  });

  revalidatePath('/trucks');
  revalidatePath(`/trucks/${id}`);

  return { success: true, truck };
}

export async function deleteTruck(id: string) {
  await requireRole(['OWNER', 'MANAGER']);
  const prisma = await getTenantPrisma();

  // Hard delete (Phase 1 decision)
  await prisma.truck.delete({
    where: { id },
  });

  revalidatePath('/trucks');

  return { success: true };
}
```

**Critical:** Server actions are public POST endpoints. Auth checks must be first line in every action.

### Pattern 2: React 19 `useActionState` for Form State Management

**What:** `useActionState` manages form submission state, errors, and pending status—replaces old `useFormState` pattern.

**When to use:** All CRUD forms (create truck, edit truck).

**Example:**
```typescript
// Source: https://react.dev/reference/react/useActionState
// app/(owner)/trucks/new/page.tsx
'use client';

import { useActionState } from 'react';
import { createTruck } from '@/app/(owner)/actions/trucks';

export default function NewTruckPage() {
  const [state, formAction, isPending] = useActionState(createTruck, null);

  return (
    <form action={formAction}>
      <label>
        Make:
        <input name="make" required disabled={isPending} />
      </label>
      <label>
        VIN:
        <input name="vin" required maxLength={17} disabled={isPending} />
      </label>
      {/* More fields... */}

      {state?.error && (
        <div className="text-red-600">{state.error}</div>
      )}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Truck'}
      </button>
    </form>
  );
}
```

**Key features:**
- `state`: Latest return value from server action (errors, success message)
- `formAction`: Pass to form's `action` prop
- `isPending`: Boolean for loading state (disable button, show spinner)

### Pattern 3: Zod Schemas for Type-Safe Validation

**What:** Define validation schemas once, derive TypeScript types, validate input in server actions.

**When to use:** Every server action that accepts user input.

**Example:**
```typescript
// Source: https://zod.dev/
// lib/validations/truck.schemas.ts
import { z } from 'zod';

// VIN validation: exactly 17 characters, no I/O/Q
const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;

export const documentMetadataSchema = z.object({
  registrationNumber: z.string().optional(),
  registrationExpiry: z.string().datetime().optional(), // ISO 8601 date
  insuranceNumber: z.string().optional(),
  insuranceExpiry: z.string().datetime().optional(),
}).strict(); // Reject unknown fields

export const truckCreateSchema = z.object({
  make: z.string().min(1, 'Make is required').max(100),
  model: z.string().min(1, 'Model is required').max(100),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  vin: z.string().regex(vinRegex, 'VIN must be 17 characters, no I/O/Q'),
  licensePlate: z.string().min(1).max(20), // Varies by jurisdiction
  odometer: z.number().int().min(0), // Whole numbers only (federal requirement)
  documentMetadata: documentMetadataSchema.optional(),
});

export const truckUpdateSchema = truckCreateSchema.partial();

// Derive TypeScript types
export type TruckCreate = z.infer<typeof truckCreateSchema>;
export type TruckUpdate = z.infer<typeof truckUpdateSchema>;
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
```

**Benefits:**
- Single source of truth for validation rules and TypeScript types
- Runtime validation prevents bad data from reaching database
- Clear error messages for users

### Pattern 4: JSONB Field for Structured Document Metadata

**What:** Store structured metadata (registration number, insurance expiry) in a JSONB column with Zod validation.

**When to use:** Simple structured data that belongs to the entity, doesn't need separate querying/indexing.

**Example (Prisma Schema):**
```prisma
// Source: https://zenstack.dev/blog/json-typing
// prisma/schema.prisma
model Truck {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String   @db.Uuid
  make              String
  model             String
  year              Int
  vin               String
  licensePlate      String
  odometer          Int      // Whole miles, no decimals
  documentMetadata  Json?    // JSONB field for registration/insurance metadata
  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz

  tenant            Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@unique([tenantId, vin]) // Unique VIN per tenant
}
```

**Validation in server action:**
```typescript
// Prisma stores as Json, validate with Zod on read/write
const data = truckCreateSchema.parse(input);

// documentMetadata is typed and validated
const truck = await prisma.truck.create({
  data: {
    // ...other fields
    documentMetadata: data.documentMetadata, // Zod already validated structure
  },
});

// Type-safe access
const metadata = documentMetadataSchema.parse(truck.documentMetadata);
console.log(metadata.insuranceExpiry); // TypeScript knows this is string | undefined
```

**Tradeoff:** JSONB is great for simple metadata, but if you need to query by insurance expiry date or generate "expiring soon" reports, use separate columns or a `TruckDocument` table.

### Pattern 5: TanStack Table for Sortable/Filterable List

**What:** Headless table library that provides sorting, filtering, pagination logic without prescribing UI.

**When to use:** Truck list view with sorting (by make, year, odometer) and filtering (search by VIN, license plate).

**Example:**
```typescript
// Source: https://tanstack.com/table/latest
// components/trucks/truck-list.tsx
'use client';

import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, flexRender } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { Truck } from '@prisma/client';

interface TruckListProps {
  trucks: Truck[];
}

export function TruckList({ trucks }: TruckListProps) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(() => [
    { accessorKey: 'make', header: 'Make' },
    { accessorKey: 'model', header: 'Model' },
    { accessorKey: 'year', header: 'Year' },
    { accessorKey: 'vin', header: 'VIN' },
    { accessorKey: 'licensePlate', header: 'License Plate' },
    { accessorKey: 'odometer', header: 'Odometer' },
    {
      id: 'actions',
      cell: ({ row }) => (
        <a href={`/trucks/${row.original.id}/edit`}>Edit</a>
      ),
    },
  ], []);

  const table = useReactTable({
    data: trucks,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search trucks..."
      />
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() ? (header.column.getIsSorted() === 'asc' ? ' 🔼' : ' 🔽') : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Why TanStack Table:**
- Headless: Full UI control (works with Tailwind, shadcn/ui, or custom CSS)
- 15KB bundle size (vs. MUI Data Grid 200KB+)
- TypeScript-first, excellent type inference
- Sorting, filtering, pagination out of the box

### Pattern 6: Optimistic Updates for Delete Operations

**What:** Use React 19's `useOptimistic` to immediately remove deleted trucks from UI before server confirms.

**When to use:** Delete operations where instant feedback improves UX (list views).

**Example:**
```typescript
// Source: https://react.dev/reference/react/useOptimistic
// app/(owner)/trucks/page.tsx
'use client';

import { useOptimistic, useTransition } from 'react';
import { deleteTruck } from '@/app/(owner)/actions/trucks';
import type { Truck } from '@prisma/client';

export function TruckListWithOptimistic({ initialTrucks }: { initialTrucks: Truck[] }) {
  const [optimisticTrucks, setOptimisticTrucks] = useOptimistic(
    initialTrucks,
    (state, truckIdToRemove: string) => state.filter(t => t.id !== truckIdToRemove)
  );
  const [isPending, startTransition] = useTransition();

  async function handleDelete(truckId: string) {
    startTransition(async () => {
      // Optimistically remove from UI
      setOptimisticTrucks(truckId);

      // Perform server action
      await deleteTruck(truckId);
    });
  }

  return (
    <div>
      {optimisticTrucks.map(truck => (
        <div key={truck.id}>
          {truck.make} {truck.model}
          <button onClick={() => handleDelete(truck.id)} disabled={isPending}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Behavior:** Truck disappears instantly, server confirms in background. If server errors, UI reverts to previous state automatically.

### Anti-Patterns to Avoid

- **No auth checks in server actions:** Server actions are public POST endpoints—always check `requireRole(['OWNER', 'MANAGER'])` first.
- **Trusting client-side validation alone:** Validate with Zod in server actions even if you validate client-side—client can be bypassed.
- **Using `WHERE tenant_id = ?` in queries:** Repository pattern with RLS extension handles tenant scoping automatically—don't add manual WHERE clauses (error-prone).
- **Storing odometer as float/decimal:** Federal odometer disclosure requires whole miles—store as `Int` not `Float`.
- **Not revalidating paths after mutations:** Next.js caches server component data—call `revalidatePath('/trucks')` after create/update/delete.
- **Partial indexes without proper ON CONFLICT:** If using soft deletes later, partial indexes for unique constraints require matching ON CONFLICT clause.
- **JSONB for frequently-queried fields:** Document metadata (registration number, insurance expiry) is rarely queried in v1, but if you need "show all trucks with expiring insurance" reports, use separate columns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VIN validation | Custom regex with check digit | Standard VIN regex + optional check digit library | VIN check digit algorithm is complex (weighted positions, character mapping); basic regex handles format, defer full validation to v2 or external API |
| Table sorting/filtering | Custom state + array manipulation | TanStack Table | Handles edge cases (multi-column sort, date parsing, nested accessors), TypeScript-first, 15KB bundle |
| Form state management | Manual useState + error tracking | React 19 `useActionState` | Built-in pending state, error handling, progressive enhancement (works without JS), integrated with Server Actions |
| Optimistic updates | Manual state rollback logic | React 19 `useOptimistic` | Automatic rollback on error, integrates with Transitions, handles race conditions |
| Input validation | Manual regex + error messages | Zod schemas | Type inference, composable schemas, clear error messages, runtime + compile-time safety |

**Key insight:** React 19 and Next.js 16 provide first-class patterns for CRUD operations. Using built-in hooks (`useActionState`, `useOptimistic`) instead of custom solutions reduces bugs and takes advantage of framework-level optimizations.

## Common Pitfalls

### Pitfall 1: Server Actions Without Authorization Checks

**What goes wrong:** Server actions are public POST endpoints accessible to anyone who knows the endpoint URL. Forgetting to add `requireRole()` allows unauthorized users (or attackers) to create/delete trucks across tenants.

**Why it happens:**
- Developers assume middleware protects server actions (it doesn't)
- Component-level `<RoleGuard>` gives false sense of security (client-side only)
- Copy-pasting server action examples that skip auth for brevity

**How to avoid:**
1. First line of every server action: `await requireRole(['OWNER', 'MANAGER'])`
2. Never rely on middleware or client-side guards for security
3. Add ESLint rule or test to verify all server actions have auth checks
4. Use "Data Access Layer" pattern: auth check → validation → data operation

**Warning signs:**
- Server action code starts with `const data = schema.parse(input)` before auth check
- No auth imports in server action file
- Tests don't mock `requireRole()`

**Source:** https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions

### Pitfall 2: VIN Uniqueness Across Tenants vs. Within Tenant

**What goes wrong:** Two scenarios: (1) VIN unique globally causes collision when different tenants legitimately have same VIN (used truck sold between fleets), (2) VIN unique per-tenant allows duplicate VINs within one tenant's fleet (data error).

**Why it happens:**
- Confusion about whether VINs are globally unique in the real world (they are for manufacturer issuance, but fleets can track the same VIN at different times)
- Not considering tenant isolation requirements

**How to avoid:**
1. Use composite unique constraint: `@@unique([tenantId, vin])`
2. VIN is unique within a tenant's fleet, not globally across all tenants
3. Add validation to prevent duplicate VIN within tenant (database enforces, UI shows helpful error)
4. Consider soft-delete implications: if using soft deletes later, need partial index `WHERE deletedAt IS NULL`

**Warning signs:**
- VIN constraint errors when different tenants add same truck
- No `tenantId` in unique constraint
- Tests don't verify VIN uniqueness per tenant

**Example (Prisma):**
```prisma
model Truck {
  // ...
  @@unique([tenantId, vin])
}
```

### Pitfall 3: Odometer Reading Stored as Float/Decimal

**What goes wrong:** Storing odometer as float (e.g., 50123.5 miles) violates federal odometer disclosure requirements and adds unnecessary precision that causes floating-point comparison bugs.

**Why it happens:**
- Assumption that "numbers should be precise" leads to using float/decimal
- Not researching domain requirements (federal law requires whole miles)
- Copying patterns from other numeric fields (price, weight) that do need decimals

**How to avoid:**
1. Store odometer as `Int` (whole miles)
2. Validate odometer increases incrementally (new reading > old reading)
3. Add UI hint: "Odometer reading in miles (whole numbers)"
4. Federal requirement: "not to include tenths of miles"

**Warning signs:**
- Prisma schema has `odometer Float` or `Decimal`
- Validation allows decimal input (e.g., `z.number()` without `.int()`)
- Odometer comparison bugs (e.g., 50123.0 !== 50123)

**Sources:**
- https://www.federalregister.gov/documents/2019/10/02/2019-20360/odometer-disclosure-requirements
- https://community.geotab.com/s/article/How-to-modify-the-odometer-offset

### Pitfall 4: Not Revalidating Paths After Mutations

**What goes wrong:** User creates/updates/deletes a truck, navigates to list page, sees stale data (old truck still visible or new truck missing) because Next.js served cached server component output.

**Why it happens:**
- Next.js aggressively caches server component renders and data fetches
- Server actions execute successfully but don't invalidate relevant caches
- Developers unfamiliar with Next.js caching model

**How to avoid:**
1. Call `revalidatePath('/trucks')` after create/update/delete operations
2. Revalidate specific truck page: `revalidatePath(\`/trucks/${id}\`)`
3. Use `revalidateTag()` if using fetch with tags for more granular cache control
4. Consider `redirect()` after create/update to force fresh page load

**Warning signs:**
- Users report "changes don't show up until I refresh"
- Server action succeeds but list view shows old data
- No `revalidatePath()` calls in server actions

**Example:**
```typescript
export async function createTruck(input: unknown) {
  // ... create truck
  revalidatePath('/trucks'); // Invalidate list page cache
  return { success: true, truckId: truck.id };
}
```

**Source:** https://nextjs.org/docs/app/getting-started/updating-data

### Pitfall 5: JSONB Field Type Safety Lost

**What goes wrong:** `documentMetadata` field typed as `Json` in Prisma, but no runtime validation on read/write. Corrupted data or schema changes cause TypeScript to think field is valid when it's not.

**Why it happens:**
- Prisma types JSONB as `any` or `JsonValue` (no structure)
- Developers store data without validation
- Schema evolves (add new field) but old records have different structure

**How to avoid:**
1. Always validate JSONB on write: `documentMetadataSchema.parse(input.documentMetadata)`
2. Validate on read: `const metadata = documentMetadataSchema.parse(truck.documentMetadata)`
3. Use `.safeParse()` to handle old records gracefully during schema migration
4. Consider using Prisma generator like `zod-prisma-types` to auto-generate schemas

**Warning signs:**
- TypeScript errors when accessing JSONB fields (`Property 'insuranceExpiry' does not exist on type 'JsonValue'`)
- Runtime errors: "Cannot read property of undefined"
- Inconsistent JSONB structure across records

**Example:**
```typescript
// GOOD: Validate on write
const data = truckCreateSchema.parse(input);
await prisma.truck.create({ data });

// GOOD: Validate on read
const truck = await prisma.truck.findUnique({ where: { id } });
const metadata = documentMetadataSchema.parse(truck.documentMetadata);
```

**Source:** https://zenstack.dev/blog/json-typing

### Pitfall 6: License Plate Validation Too Strict

**What goes wrong:** Validation enforces specific license plate format (e.g., "ABC-1234") but different states/countries have wildly different formats, causing legitimate license plates to be rejected.

**Why it happens:**
- Developer creates regex based on their local format
- Not researching jurisdiction variations (commercial plates differ from passenger)
- Trying to be "helpful" with strict validation

**How to avoid:**
1. Use permissive validation: length (1-20 characters), alphanumeric + common separators (dash, space)
2. Don't enforce specific format patterns
3. If validation needed, make it configurable per tenant (tenant settings for jurisdiction)
4. Let users enter what's on the actual plate

**Warning signs:**
- License plate validation regex has strict format (e.g., `/^[A-Z]{3}-\d{4}$/`)
- Support requests: "I can't enter my truck's plate number"
- Validation rejects valid plates from other states/countries

**Example:**
```typescript
// TOO STRICT (don't do this)
licensePlate: z.string().regex(/^[A-Z]{3}-\d{4}$/)

// PERMISSIVE (do this)
licensePlate: z.string().min(1).max(20).regex(/^[A-Z0-9\s\-]+$/i)
```

**Sources:**
- https://en.wikipedia.org/wiki/United_States_license_plate_designs_and_serial_formats
- https://en.wikipedia.org/wiki/Vehicle_license_plates_of_the_United_States

### Pitfall 7: Race Conditions in Optimistic Updates

**What goes wrong:** User deletes truck optimistically, but server action hasn't completed. User navigates away, server action fails, truck reappears unexpectedly later.

**Why it happens:**
- `useOptimistic` updates UI immediately but doesn't wait for server confirmation
- Navigation or component unmount interrupts transition
- Error handling not implemented

**How to avoid:**
1. Wrap server action in `startTransition()` to coordinate optimistic update with async operation
2. Handle errors explicitly: show toast/alert if deletion fails
3. Don't navigate away until server confirms success
4. Consider using `useOptimistic` only for low-stakes operations (not critical deletes)

**Warning signs:**
- Deleted items reappear after navigation
- No error handling for failed optimistic operations
- `useOptimistic` without `useTransition`

**Example:**
```typescript
async function handleDelete(truckId: string) {
  startTransition(async () => {
    setOptimisticTrucks(truckId); // Optimistic
    try {
      await deleteTruck(truckId); // Server
    } catch (error) {
      // UI automatically reverts, show error to user
      alert('Failed to delete truck');
    }
  });
}
```

**Source:** https://react.dev/reference/react/useOptimistic

## Code Examples

Verified patterns from official sources:

### Complete CRUD Server Actions

```typescript
// Source: https://nextjs.org/docs/app/getting-started/updating-data
// app/(owner)/actions/trucks.ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { truckCreateSchema, truckUpdateSchema } from '@/lib/validations/truck.schemas';

export async function createTruck(prevState: any, formData: FormData) {
  // 1. Authorization
  await requireRole(['OWNER', 'MANAGER']);

  // 2. Parse and validate
  const rawData = {
    make: formData.get('make'),
    model: formData.get('model'),
    year: parseInt(formData.get('year') as string, 10),
    vin: formData.get('vin'),
    licensePlate: formData.get('licensePlate'),
    odometer: parseInt(formData.get('odometer') as string, 10),
  };

  const result = truckCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  // 3. Create truck (tenant-scoped)
  const prisma = await getTenantPrisma();
  const truck = await prisma.truck.create({
    data: result.data,
  });

  // 4. Revalidate and redirect
  revalidatePath('/trucks');
  redirect(`/trucks/${truck.id}`);
}

export async function updateTruck(id: string, prevState: any, formData: FormData) {
  await requireRole(['OWNER', 'MANAGER']);

  const rawData = Object.fromEntries(formData.entries());
  const result = truckUpdateSchema.safeParse(rawData);

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const prisma = await getTenantPrisma();
  await prisma.truck.update({
    where: { id },
    data: result.data,
  });

  revalidatePath('/trucks');
  revalidatePath(`/trucks/${id}`);
  redirect(`/trucks/${id}`);
}

export async function deleteTruck(id: string) {
  await requireRole(['OWNER', 'MANAGER']);

  const prisma = await getTenantPrisma();
  await prisma.truck.delete({ where: { id } });

  revalidatePath('/trucks');
  return { success: true };
}

export async function listTrucks() {
  // Drivers can view trucks (read-only)
  await requireRole(['OWNER', 'MANAGER', 'DRIVER']);

  const prisma = await getTenantPrisma();
  return prisma.truck.findMany({
    orderBy: { createdAt: 'desc' },
  });
}
```

### Form with useActionState

```typescript
// Source: https://react.dev/reference/react/useActionState
// app/(owner)/trucks/new/page.tsx
'use client';

import { useActionState } from 'react';
import { createTruck } from '@/app/(owner)/actions/trucks';

export default function NewTruckPage() {
  const [state, formAction, isPending] = useActionState(createTruck, null);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Add New Truck</h1>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="make" className="block font-medium mb-1">
            Make
          </label>
          <input
            id="make"
            name="make"
            type="text"
            required
            disabled={isPending}
            className="w-full border rounded px-3 py-2"
            aria-describedby={state?.error?.make ? 'make-error' : undefined}
          />
          {state?.error?.make && (
            <p id="make-error" className="text-red-600 text-sm mt-1">
              {state.error.make}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="model" className="block font-medium mb-1">
            Model
          </label>
          <input
            id="model"
            name="model"
            type="text"
            required
            disabled={isPending}
            className="w-full border rounded px-3 py-2"
          />
          {state?.error?.model && (
            <p className="text-red-600 text-sm mt-1">{state.error.model}</p>
          )}
        </div>

        <div>
          <label htmlFor="year" className="block font-medium mb-1">
            Year
          </label>
          <input
            id="year"
            name="year"
            type="number"
            required
            min="1900"
            max={new Date().getFullYear() + 1}
            disabled={isPending}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="vin" className="block font-medium mb-1">
            VIN (17 characters, no I/O/Q)
          </label>
          <input
            id="vin"
            name="vin"
            type="text"
            required
            maxLength={17}
            pattern="[A-HJ-NPR-Z0-9]{17}"
            disabled={isPending}
            className="w-full border rounded px-3 py-2 uppercase"
          />
          {state?.error?.vin && (
            <p className="text-red-600 text-sm mt-1">{state.error.vin}</p>
          )}
        </div>

        <div>
          <label htmlFor="licensePlate" className="block font-medium mb-1">
            License Plate
          </label>
          <input
            id="licensePlate"
            name="licensePlate"
            type="text"
            required
            maxLength={20}
            disabled={isPending}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="odometer" className="block font-medium mb-1">
            Odometer (miles, whole numbers)
          </label>
          <input
            id="odometer"
            name="odometer"
            type="number"
            required
            min="0"
            step="1"
            disabled={isPending}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Creating...' : 'Create Truck'}
        </button>
      </form>
    </div>
  );
}
```

### Truck Repository

```typescript
// lib/db/repositories/truck.repository.ts
import { TenantRepository } from './base.repository';
import type { Prisma, Truck } from '@prisma/client';

export class TruckRepository extends TenantRepository {
  async findAll() {
    return this.db.truck.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Truck | null> {
    return this.db.truck.findUnique({
      where: { id },
    });
  }

  async create(data: Prisma.TruckCreateInput) {
    return this.db.truck.create({ data });
  }

  async update(id: string, data: Prisma.TruckUpdateInput) {
    return this.db.truck.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.truck.delete({
      where: { id },
    });
  }

  async findByVin(vin: string): Promise<Truck | null> {
    return this.db.truck.findFirst({
      where: { vin },
    });
  }
}
```

### Zod Validation Schemas

```typescript
// lib/validations/truck.schemas.ts
import { z } from 'zod';

// VIN: 17 characters, excludes I, O, Q
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

export const documentMetadataSchema = z.object({
  registrationNumber: z.string().optional(),
  registrationExpiry: z.string().datetime().optional(),
  insuranceNumber: z.string().optional(),
  insuranceExpiry: z.string().datetime().optional(),
}).strict();

export const truckCreateSchema = z.object({
  make: z.string().min(1, 'Make is required').max(100),
  model: z.string().min(1, 'Model is required').max(100),
  year: z
    .number({ invalid_type_error: 'Year must be a number' })
    .int()
    .min(1900, 'Year must be 1900 or later')
    .max(new Date().getFullYear() + 1, 'Year cannot be in the future'),
  vin: z
    .string()
    .length(17, 'VIN must be exactly 17 characters')
    .regex(VIN_REGEX, 'VIN cannot contain I, O, or Q')
    .transform(val => val.toUpperCase()),
  licensePlate: z
    .string()
    .min(1, 'License plate is required')
    .max(20, 'License plate must be 20 characters or less')
    .regex(/^[A-Z0-9\s\-]+$/i, 'License plate contains invalid characters'),
  odometer: z
    .number({ invalid_type_error: 'Odometer must be a number' })
    .int('Odometer must be a whole number')
    .min(0, 'Odometer cannot be negative'),
  documentMetadata: documentMetadataSchema.optional(),
});

export const truckUpdateSchema = truckCreateSchema.partial();

// Type inference
export type TruckCreate = z.infer<typeof truckCreateSchema>;
export type TruckUpdate = z.infer<typeof truckUpdateSchema>;
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| `useFormState` | `useActionState` | React 19 (2024) | Hook renamed, same functionality but better naming |
| API routes for mutations | Server Actions | Next.js 13+ (2023), stable in 16 | Eliminates API boilerplate, type-safe client→server, progressive enhancement |
| React Hook Form for all forms | `useActionState` for simple forms, RHF for complex | React 19 (2024) | Built-in hook sufficient for CRUD forms, RHF still better for multi-step/conditional logic |
| Manual optimistic updates | `useOptimistic` hook | React 19 (2024) | Automatic rollback on error, integrates with Transitions |
| `middleware.ts` | `proxy.ts` | Next.js 16 (2025) | Breaking change—file and export renamed |
| Jest | Vitest | 2024+ mainstream | 10-20× faster, better ESM support |

**Deprecated/outdated:**
- **Pages Router form patterns:** `getServerSideProps` + API routes. App Router uses Server Components + Server Actions.
- **`useFormState` hook:** Renamed to `useActionState` in React 19.
- **Manual form state management:** `useState` + manual error tracking replaced by `useActionState`.
- **SWR/React Query for mutations:** Server Actions with `revalidatePath` replace mutation libraries for Next.js apps.

## Open Questions

1. **Truck photo uploads**
   - What we know: Phase 6 handles document uploads (PDFs, images)
   - What's unclear: Should Phase 3 include truck photos as part of CRUD, or defer until Phase 6?
   - Recommendation: **Defer to Phase 6**—focus Phase 3 on core CRUD with structured metadata, add photo uploads when implementing document management system

2. **Document metadata extensibility**
   - What we know: TRUK-04 requires registration number and insurance expiry
   - What's unclear: Will users need custom document fields (safety inspection, emissions test)?
   - Recommendation: **Start with fixed schema** (registration + insurance), add custom fields in Phase 6 if needed; JSONB allows schema evolution without migration

3. **List view default: table vs. cards**
   - What we know: Mobile users (drivers) may prefer card layout, desktop users (owners/managers) may prefer table
   - What's unclear: What's the primary use case for truck list view?
   - Recommendation: **Table for v1** (owner/manager on desktop is primary user), add responsive card view later if mobile usage is high

4. **Odometer history tracking**
   - What we know: Current requirement is storing current odometer reading
   - What's unclear: Do users need odometer history (track readings over time for maintenance scheduling)?
   - Recommendation: **Single current reading for Phase 3**—Phase 8 (maintenance tracking) will need odometer history for mileage-based maintenance; defer history table until then

5. **VIN validation with check digit**
   - What we know: Basic VIN format is 17 characters excluding I/O/Q; 9th digit is check digit (North America)
   - What's unclear: Should we validate check digit algorithm?
   - Recommendation: **Format validation only for v1**—check digit validation is complex and not critical for data entry; consider adding external VIN lookup API later for data enrichment

## Sources

### Primary (HIGH confidence)

- [Next.js Getting Started: Updating Data](https://nextjs.org/docs/app/getting-started/updating-data) - Official Server Actions CRUD guide
- [Next.js Forms Guide](https://nextjs.org/docs/app/guides/forms) - Official forms documentation
- [React useActionState](https://react.dev/reference/react/useActionState) - Official React 19 hook documentation
- [React useOptimistic](https://react.dev/reference/react/useOptimistic) - Official optimistic updates hook
- [Zod Documentation](https://zod.dev/) - Official Zod validation library
- [TanStack Table](https://tanstack.com/table/latest) - Official headless table library
- [Prisma Custom Validation](https://www.prisma.io/docs/orm/prisma-client/queries/custom-validation) - Official Prisma validation guide
- [regex101: Vehicle Identification Number (VIN)](https://regex101.com/library/49qCxI) - Standard VIN regex pattern
- [Federal Register: Odometer Disclosure Requirements](https://www.federalregister.gov/documents/2019/10/02/2019-20360/odometer-disclosure-requirements) - Federal odometer standards
- [shadcn/ui](https://www.shadcn.io/) - Official component library

### Secondary (MEDIUM confidence)

- [Next.js Server Actions: The Complete Guide (2026)](https://makerkit.dev/blog/tutorials/nextjs-server-actions) - Comprehensive server actions guide
- [Secure Next.js Server Actions](https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions) - Security best practices
- [My Approach to Building Forms with useActionState](https://www.buildwithmatija.com/blog/my-approach-crud-forms-react19-useactionstate) - Real-world form patterns
- [Zod React Hook Form: Complete Guide 2026](https://practicaldev.online/blog/reactjs/react-hook-form-zod-validation-guide) - Zod validation patterns
- [ZenStack: Typing Those JSON Fields](https://zenstack.dev/blog/json-typing) - Type-safe JSONB with Zod
- [5 Best React Data Grid Libraries for Data-Driven Apps in 2026](https://www.syncfusion.com/blogs/post/top-react-data-grid-libraries) - Table library comparison
- [Top Free, Open-Source Alternatives to Ag-Grid for React in 2026](https://svar.dev/blog/top-react-alternatives-to-ag-grid/) - Table library alternatives
- [Implementing Optimistic Updates in Next.js](https://jb.desishub.com/blog/implementing-optimistic-update) - Optimistic UI patterns
- [When "Soft Delete" Meets "Unique Index"](https://blog.staynoob.cn/post/2019/05/when-soft-delete-meets-unique-index/) - Partial index patterns
- [Soft Delete and Unique Constraint](https://gusiol.medium.com/soft-delete-and-unique-constraint-da94b41cff62) - PostgreSQL unique constraints
- [United States License Plate Designs](https://en.wikipedia.org/wiki/United_States_license_plate_designs_and_serial_formats) - License plate format variations

### Tertiary (LOW confidence - needs validation)

- [Vehicle License Plates of the United States](https://en.wikipedia.org/wiki/Vehicle_license_plates_of_the_United_States) - License plate overview
- [Geotab: How to Check Odometer Data](https://community.geotab.com/s/article/How-to-modify-the-odometer-offset) - Fleet odometer tracking
- [Fleetio: Meter Validation](https://fleetio.helpjuice.com/meter-validation-in-fleetio-go?kb_language=en_US) - Odometer validation in fleet management

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - React 19 and Next.js 16 patterns verified from official docs, Server Actions production-ready
- Architecture: **HIGH** - Server Actions, `useActionState`, and `useOptimistic` documented in official React/Next.js guides, TanStack Table official docs
- Pitfalls: **HIGH** - Security issues from official Next.js security docs, VIN/odometer standards from federal sources
- Code examples: **HIGH** - All patterns sourced from official documentation or verified 2026 guides

**Research date:** 2026-02-14
**Valid until:** 2026-03-16 (30 days—React 19 and Next.js 16 are stable, patterns unlikely to change significantly)

**Key risk areas requiring validation during planning:**
1. JSONB schema evolution strategy—confirm Zod validation handles old records gracefully
2. TanStack Table integration with Server Components—verify SSR compatibility
3. Optimistic updates with `useOptimistic`—test error rollback behavior thoroughly
4. VIN uniqueness constraint—confirm `@@unique([tenantId, vin])` works with RLS policies
5. License plate validation permissiveness—verify real-world formats aren't rejected
