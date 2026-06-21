---
id: quick-471
title: Implement Drivers section per approved spec
type: quick
status: planned
created: 2026-06-21
files_modified:
  - apps/web/src/lib/drivers/compute-driver-status.ts
  - apps/web/src/app/(owner)/drivers/page.tsx
  - apps/web/src/app/(owner)/drivers/_components/DriversPageClient.tsx
  - apps/web/src/app/(owner)/drivers/_components/DriversKPICards.tsx
  - apps/web/src/app/(owner)/drivers/_components/DriversDataGrid.tsx
  - apps/web/src/app/(owner)/drivers/invite/page.tsx
  - apps/web/src/app/(owner)/drivers/invite/_components/DriverInviteForm.tsx
  - apps/web/src/app/(owner)/drivers/[id]/page.tsx
  - apps/web/src/app/(owner)/drivers/[id]/edit/page.tsx
  - apps/web/src/app/(owner)/drivers/[id]/_components/DriverRecord.tsx
  - apps/web/src/app/(owner)/actions/drivers.ts
---

<objective>
Rebuild the Drivers section using the design system, mirroring the Trucks section pattern exactly.

**Reference:** `/drivers-spec.md` (approved spec)
**Pattern:** `/trucks/*` implementation (reference)
**Design System:** `@/components/design-system`

**Output:**
- Driver status computation utility (`compute-driver-status.ts`)
- Rebuilt overview page with KPI cards, status tabs, search, data grid
- Rebuilt invite page with sectioned form
- Rebuilt view/edit pages with unified `DriverRecord` component
- Enhanced `listDrivers` action with compliance data
</objective>

<context>
@.planning/drivers-spec.md
@.planning/design-system.md
@apps/web/src/app/(owner)/trucks/page.tsx
@apps/web/src/app/(owner)/trucks/_components/TrucksPageClient.tsx
@apps/web/src/app/(owner)/trucks/_components/TrucksKPICards.tsx
@apps/web/src/app/(owner)/trucks/_components/TrucksDataGrid.tsx
@apps/web/src/app/(owner)/trucks/new/_components/TruckCreateForm.tsx
@apps/web/src/app/(owner)/trucks/[id]/_components/TruckRecord.tsx
@apps/web/src/lib/trucks/compute-truck-status.ts
@apps/web/src/app/(owner)/actions/drivers.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create driver status computation utility</name>
  <files>apps/web/src/lib/drivers/compute-driver-status.ts</files>
  <action>
Create `compute-driver-status.ts` following the `compute-truck-status.ts` pattern.

**Define types:**
- `DriverStatus = 'Active' | 'Expiring Soon' | 'Expired Docs' | 'Deactivated'`
- `DriverStatusVariant = 'success' | 'warning' | 'danger' | 'neutral'`
- `DriverStatusInfo = { status: DriverStatus; variant: DriverStatusVariant }`
- `DriverWithRelations` interface with:
  - id, email, firstName, lastName, licenseNumber, isActive, isDispatchReady, role, isSample
  - phoneNumber (optional), licenseExpirationDate (optional, Date | null)
  - documents: { id: string; documentType: string; expiryDate: Date | null }[]
  - Optional audit fields (createdAt, updatedAt, createdBy, updatedBy)

**Implement `computeDriverStatus(driver: DriverWithRelations): DriverStatusInfo`:**
Priority order (highest wins):
1. Deactivated: `isActive === false` -> variant 'neutral'
2. Expired Docs: any document expiryDate in past OR licenseExpirationDate in past -> variant 'danger'
3. Expiring Soon: any document expiryDate OR licenseExpirationDate within 30 days -> variant 'warning'
4. Active: none of above -> variant 'success'

**Implement `getDriverComplianceAlerts(driver: DriverWithRelations): ComplianceAlert[]`:**
Returns array of { type: string; label: string; days: number | null } for:
- licenseExpirationDate (if set)
- MEDICAL_CARD document expiryDate (if exists)
- DRIVER_LICENSE or CDL_SCAN document expiryDate (if exists)

**Export all types and functions.**
  </action>
  <verify>`tsc --noEmit` passes with no errors in the new file.</verify>
  <done>Pure utility exists at `apps/web/src/lib/drivers/compute-driver-status.ts` with `computeDriverStatus` and `getDriverComplianceAlerts` functions.</done>
</task>

<task type="auto">
  <name>Task 2: Enhance listDrivers action with compliance data</name>
  <files>apps/web/src/app/(owner)/actions/drivers.ts</files>
  <action>
Update `listDrivers()` to include compliance-related data:

**Modify the Prisma query to include:**
```ts
return prisma.user.findMany({
  take: 100,
  where: {
    role: 'DRIVER',
  },
  include: {
    documents: {
      where: {
        expiryDate: { not: null },
        documentType: {
          in: ['DRIVER_LICENSE', 'MEDICAL_CARD', 'CDL_SCAN'],
        },
      },
      select: {
        id: true,
        documentType: true,
        expiryDate: true,
      },
    },
  },
  orderBy: {
    createdAt: 'desc',
  },
});
```

Also add `deleteDriver` action (for optimistic delete like trucks):
```ts
export async function deleteDriver(id: string): Promise<{ success: boolean }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  // Soft delete via deactivation (same as deactivateDriver but returns success object)
  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });

  revalidatePath('/drivers');
  revalidateTag('dashboard-metrics', 'max');

  return { success: true };
}
```
  </action>
  <verify>`listDrivers()` returns drivers with `documents` relation included. `deleteDriver` function exists.</verify>
  <done>`listDrivers` returns driver documents for compliance checks, `deleteDriver` action exists for optimistic updates.</done>
</task>

<task type="auto">
  <name>Task 3: Build DriversKPICards component</name>
  <files>apps/web/src/app/(owner)/drivers/_components/DriversKPICards.tsx</files>
  <action>
Create `DriversKPICards.tsx` following `TrucksKPICards.tsx` pattern exactly.

**Define interface:**
```ts
export interface DriverKPIData {
  total: number;
  activeCompliant: number;
  expiringSoon: number;
  needsAction: number;
}

interface DriversKPICardsProps {
  data: DriverKPIData;
  loading?: boolean;
}
```

**Implement component:**
- Use `KPICardGrid` and `KPICard` from `@/components/design-system`
- Icons: `Users` (Total), `CheckCircle` (Active & Compliant), `AlertTriangle` (Expiring Soon), `UserX` (Needs Action)
- No fake trends (same as trucks)

```tsx
'use client';

import { Users, CheckCircle, AlertTriangle, UserX } from 'lucide-react';
import { KPICard, KPICardGrid } from '@/components/design-system';

export function DriversKPICards({ data, loading = false }: DriversKPICardsProps) {
  return (
    <KPICardGrid>
      <KPICard label="Total Drivers" value={data.total} icon={Users} loading={loading} />
      <KPICard label="Active & Compliant" value={data.activeCompliant} icon={CheckCircle} loading={loading} />
      <KPICard label="Expiring Soon" value={data.expiringSoon} icon={AlertTriangle} loading={loading} />
      <KPICard label="Needs Action" value={data.needsAction} icon={UserX} loading={loading} />
    </KPICardGrid>
  );
}
```
  </action>
  <verify>Component renders without errors, TypeScript passes.</verify>
  <done>`DriversKPICards` component exists and uses design system components.</done>
</task>

<task type="auto">
  <name>Task 4: Build DriversDataGrid component</name>
  <files>apps/web/src/app/(owner)/drivers/_components/DriversDataGrid.tsx</files>
  <action>
Create `DriversDataGrid.tsx` following `TrucksDataGrid.tsx` pattern.

**Features:**
- Status tabs: All, Active, Expiring, Deactivated (with counts)
- SearchBar with placeholder "Search by name, email, license..."
- ActiveFilters (empty for now, future enhancement)
- Desktop table with columns: checkbox, Name (+ SamplePill), Email, License (mono), Phone, Status (StatusBadge), Compliance (AlertBadge), Actions ("Manage" link)
- Mobile cards with: AlertBadge (most prominent), Name + SamplePill, StatusBadge, Email (muted), ChevronRight
- Row click navigates to `/drivers/[id]`

**Use TanStack Table like TrucksDataGrid:**
- `useReactTable` with sorting, filtering
- `SortableHeader` component (can copy from trucks)
- Tab filtering uses `getStatusTabValue()` helper

**Status mapping:**
```ts
type StatusTabValue = 'all' | 'active' | 'expiring' | 'deactivated';

function getStatusTabValue(driver: DriverWithRelations): StatusTabValue {
  const { status } = computeDriverStatus(driver);
  switch (status) {
    case 'Active': return 'active';
    case 'Expiring Soon': return 'expiring';
    case 'Expired Docs': return 'expiring'; // Group with expiring for tabs
    case 'Deactivated': return 'deactivated';
    default: return 'active';
  }
}
```

**StatusBadge variant mapping:**
- 'success' -> 'success' (Active)
- 'warning' -> 'warning' (Expiring Soon)
- 'danger' -> 'danger' (Expired Docs)
- 'neutral' -> 'neutral' (Deactivated) -- use gray styling

**Import from:**
- `@/lib/drivers/compute-driver-status` for `computeDriverStatus`, `DriverWithRelations`
- `@/components/design-system` for UI components
- `@/components/onboarding/sample-pill` for SamplePill
  </action>
  <verify>Component renders with mock data, tabs filter correctly, search works.</verify>
  <done>`DriversDataGrid` component exists with tabs, search, desktop table, and mobile cards.</done>
</task>

<task type="auto">
  <name>Task 5: Build DriversPageClient wrapper</name>
  <files>apps/web/src/app/(owner)/drivers/_components/DriversPageClient.tsx</files>
  <action>
Create `DriversPageClient.tsx` following `TrucksPageClient.tsx` pattern exactly.

```tsx
'use client';

import { useOptimistic, useTransition } from 'react';
import { DriversDataGrid } from './DriversDataGrid';
import type { DriverWithRelations } from '@/lib/drivers/compute-driver-status';

interface DriversPageClientProps {
  drivers: DriverWithRelations[];
  deleteAction: (id: string) => Promise<{ success: boolean }>;
}

export function DriversPageClient({ drivers, deleteAction }: DriversPageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDrivers, removeOptimisticDriver] = useOptimistic(
    drivers,
    (state, removedId: string) => state.filter((driver) => driver.id !== removedId)
  );

  const handleDelete = (id: string) => {
    removeOptimisticDriver(id);
    startTransition(async () => {
      await deleteAction(id);
    });
  };

  return <DriversDataGrid drivers={optimisticDrivers} onDelete={handleDelete} />;
}
```
  </action>
  <verify>Component compiles without errors.</verify>
  <done>`DriversPageClient` wrapper exists for optimistic updates.</done>
</task>

<task type="auto">
  <name>Task 6: Rebuild drivers overview page</name>
  <files>apps/web/src/app/(owner)/drivers/page.tsx</files>
  <action>
Rebuild `page.tsx` following `trucks/page.tsx` pattern exactly.

**Structure:**
1. Import statements (Suspense, Link, Plus, actions, components, logger, etc.)
2. `computeKPIData(drivers: DriverWithRelations[]): DriverKPIData` function
3. `DriversContent` async component (fetches data, renders KPIs + client wrapper)
4. `DriversContentSkeleton` component (loading fallback)
5. `DriversPage` default export with header + Suspense

**computeKPIData logic:**
```ts
function computeKPIData(drivers: DriverWithRelations[]): DriverKPIData {
  let activeCompliant = 0;
  let expiringSoon = 0;
  let needsAction = 0;

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  drivers.forEach((driver) => {
    const { status } = computeDriverStatus(driver);

    if (status === 'Active') {
      activeCompliant++;
    }

    if (status === 'Expiring Soon') {
      expiringSoon++;
    }

    if (status === 'Expired Docs' || status === 'Deactivated') {
      needsAction++;
    }
  });

  return {
    total: drivers.length,
    activeCompliant,
    expiringSoon,
    needsAction,
  };
}
```

**Header:**
- Title: "Drivers"
- Subtitle: "View and manage your drivers"
- Primary action: `+ Invite Driver` button -> `/drivers/invite`

**Include SampleDataBanner check** (same pattern as trucks).
  </action>
  <verify>Page renders with KPI cards and data grid. Navigation to `/drivers` works.</verify>
  <done>Drivers overview page rebuilt with design system, KPIs, tabs, search, and data grid.</done>
</task>

<task type="auto">
  <name>Task 7: Build DriverInviteForm component</name>
  <files>apps/web/src/app/(owner)/drivers/invite/_components/DriverInviteForm.tsx</files>
  <action>
Create `DriverInviteForm.tsx` following `TruckCreateForm.tsx` pattern.

**Sections per spec:**
1. **Basic Information:** email (required), firstName (required), lastName (required), middleName (optional), full name preview (computed)
2. **Contact & Personal:** phoneNumber (optional), dateOfBirth (optional), address (optional with AddressAutocomplete)
3. **License & Compliance:** licenseNumber (optional, uppercase, mono font), licenseExpirationDate (optional, date picker)

**Use design system components:**
- `FormSection` with title and description
- `FormRow` for side-by-side fields
- `FormField` for each field
- `CompletenessIndicator` (optional, dismissible)
- `Button` for submit

**State management:**
```tsx
const [email, setEmail] = useState('');
const [firstName, setFirstName] = useState('');
const [lastName, setLastName] = useState('');
const [middleName, setMiddleName] = useState('');
// ... etc for all fields
const [showCompleteness, setShowCompleteness] = useState(true);
```

**Full name preview:**
```tsx
const fullNamePreview = [firstName, middleName, lastName].filter(Boolean).join(' ') || 'Full name will appear here';
```

**Address field:** Use AddressAutocomplete component from `@/components/maps/AddressAutocomplete` if available, otherwise use standard Input.

**Submit button text:** "Send Invitation" (not "Create")
  </action>
  <verify>Form renders with all sections, validation works, submit calls `inviteDriver` action.</verify>
  <done>`DriverInviteForm` component exists with sectioned form using design system.</done>
</task>

<task type="auto">
  <name>Task 8: Rebuild driver invite page</name>
  <files>apps/web/src/app/(owner)/drivers/invite/page.tsx</files>
  <action>
Rebuild `invite/page.tsx` following `trucks/new/page.tsx` pattern.

**Structure:**
```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { inviteDriver } from '@/app/(owner)/actions/drivers';
import { DriverInviteForm } from './_components/DriverInviteForm';
import { Skeleton } from '@/components/ui/skeleton';

function FormSkeleton() {
  return (
    <div className="max-w-2xl space-y-8">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function DriverInvitePage() {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/drivers"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Drivers
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Invite Driver
        </h1>
        <p className="mt-1 text-muted-foreground">
          Send an invitation to add a new driver to your fleet
        </p>
      </div>

      {/* Form */}
      <Suspense fallback={<FormSkeleton />}>
        <DriverInviteForm action={inviteDriver} />
      </Suspense>
    </div>
  );
}
```
  </action>
  <verify>Page renders, form submits successfully, redirect works.</verify>
  <done>Driver invite page rebuilt with design system form.</done>
</task>

<task type="auto">
  <name>Task 9: Build DriverRecord component</name>
  <files>apps/web/src/app/(owner)/drivers/[id]/_components/DriverRecord.tsx</files>
  <action>
Create `DriverRecord.tsx` following `TruckRecord.tsx` pattern exactly.

**Features:**
- Unified view/edit component with `mode: 'view' | 'edit'` prop
- View mode: read-only fields using `RecordLayout`, `RecordSection`, `RecordFieldGrid`, `RecordField`
- Edit mode: editable form using `FormSection`, `FormRow`, `FormField`

**Sections:**
1. **Personal Information:** firstName, lastName, middleName, dateOfBirth, phoneNumber, email (read-only in edit), address
2. **License & Compliance:** licenseNumber, licenseExpirationDate

**Right rail content:**
- **Compliance Health:** License Expiry, Medical Card Expiry, CDL Expiry (use `getDriverComplianceAlerts`)
- **Current Assignment:** Show active route/load status or "Available"
- **Documents Quick View:** Document count with link to documents section

**Header actions:**
- View mode: "Edit" button, "Deactivate"/"Reactivate" toggle
- Edit mode: "Unsaved changes" indicator, "Cancel", "Save Changes"

**State management:**
- Track form values and dirty state (same as TruckRecord)
- Navigation guard for unsaved changes
- Handle form submission with `updateAction`

**Import StatusBadge and AlertBadge from design system.**
  </action>
  <verify>Component renders in both view and edit modes, form validation works.</verify>
  <done>`DriverRecord` component exists with unified view/edit modes using design system.</done>
</task>

<task type="auto">
  <name>Task 10: Rebuild driver view page</name>
  <files>apps/web/src/app/(owner)/drivers/[id]/page.tsx</files>
  <action>
Rebuild `[id]/page.tsx` following `trucks/[id]/page.tsx` pattern.

**Structure:**
```tsx
import { notFound } from 'next/navigation';
import { getDriverWithRelations } from '@/app/(owner)/actions/drivers';
import { DriverRecord } from './_components/DriverRecord';

interface DriverPageProps {
  params: Promise<{ id: string }>;
}

export default async function DriverPage({ params }: DriverPageProps) {
  const { id } = await params;
  const driver = await getDriverWithRelations(id);

  if (!driver) {
    notFound();
  }

  return <DriverRecord driver={driver} mode="view" />;
}
```

**Add `getDriverWithRelations` to drivers.ts action:**
```ts
export async function getDriverWithRelations(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  return prisma.user.findUnique({
    where: { id, role: 'DRIVER' },
    include: {
      documents: {
        where: {
          expiryDate: { not: null },
        },
        select: {
          id: true,
          documentType: true,
          expiryDate: true,
        },
      },
      // Include active routes/loads for assignment display
    },
  });
}
```
  </action>
  <verify>Page renders driver details in view mode. 404 for invalid IDs.</verify>
  <done>Driver view page rebuilt, fetches driver with relations.</done>
</task>

<task type="auto">
  <name>Task 11: Rebuild driver edit page</name>
  <files>apps/web/src/app/(owner)/drivers/[id]/edit/page.tsx</files>
  <action>
Rebuild `[id]/edit/page.tsx` following `trucks/[id]/edit/page.tsx` pattern.

**Structure:**
```tsx
import { notFound } from 'next/navigation';
import { getDriverWithRelations, updateDriver } from '@/app/(owner)/actions/drivers';
import { DriverRecord } from '../_components/DriverRecord';

interface DriverEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function DriverEditPage({ params }: DriverEditPageProps) {
  const { id } = await params;
  const driver = await getDriverWithRelations(id);

  if (!driver) {
    notFound();
  }

  // Bind driver ID to update action
  const boundUpdateAction = updateDriver.bind(null, id);

  return (
    <DriverRecord
      driver={driver}
      mode="edit"
      updateAction={boundUpdateAction}
    />
  );
}
```
  </action>
  <verify>Page renders driver in edit mode, form saves correctly.</verify>
  <done>Driver edit page rebuilt with form save functionality.</done>
</task>

<task type="auto">
  <name>Task 12: Clean up legacy driver files</name>
  <files>
    apps/web/src/app/(owner)/drivers/driver-list-wrapper.tsx
    apps/web/src/components/drivers/driver-list.tsx
    apps/web/src/components/drivers/driver-invite-form.tsx
    apps/web/src/app/(owner)/drivers/[id]/edit/edit-driver-client.tsx
  </files>
  <action>
Remove or archive legacy driver files that are now replaced:

1. **Delete** `apps/web/src/app/(owner)/drivers/driver-list-wrapper.tsx` (replaced by `_components/DriversPageClient.tsx`)

2. **Check** if `apps/web/src/components/drivers/driver-list.tsx` exists and is unused, delete if so

3. **Check** if `apps/web/src/components/drivers/driver-invite-form.tsx` exists and is unused, delete if so

4. **Delete** `apps/web/src/app/(owner)/drivers/[id]/edit/edit-driver-client.tsx` (replaced by `DriverRecord`)

**Note:** Only delete files that are fully replaced by new implementations. Keep any files that provide functionality not yet migrated (like `driver-documents-section.tsx`, `driver-status-button.tsx`, `driver-route-assignments-section.tsx`).
  </action>
  <verify>No import errors after cleanup. Build passes.</verify>
  <done>Legacy driver files removed, no orphan imports.</done>
</task>

</tasks>

<verification>
Run after all tasks complete:

1. `pnpm tsc --noEmit` - No TypeScript errors
2. `pnpm dev` and navigate to:
   - `/drivers` - Overview with KPIs, tabs, search, data grid
   - `/drivers/invite` - Sectioned form
   - `/drivers/[id]` - View mode with compliance rail
   - `/drivers/[id]/edit` - Edit mode with form
3. Test tab filtering (All, Active, Expiring, Deactivated)
4. Test search by name, email, license
5. Test mobile view (cards instead of table)
6. Test form validation on invite and edit pages
7. Verify StatusBadge and AlertBadge rendering
</verification>

<success_criteria>
- [ ] `compute-driver-status.ts` utility exists with proper type exports
- [ ] `listDrivers` action returns drivers with compliance documents
- [ ] DriversKPICards shows 4 metrics using design system
- [ ] DriversDataGrid has tabs, search, table (desktop), cards (mobile)
- [ ] Driver invite page uses sectioned form with CompletenessIndicator
- [ ] DriverRecord works in both view and edit modes
- [ ] Right rail shows compliance health and current assignment
- [ ] All pages use design system components (no legacy patterns)
- [ ] Legacy files cleaned up with no import errors
- [ ] TypeScript compiles without errors
</success_criteria>

<output>
After completion, verify deployment with `vercel --prod` and test all driver flows.
</output>
