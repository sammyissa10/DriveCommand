---
id: quick-404
title: Reusable Intelligent Soft-Delete System
type: execute
status: planned
priority: high
complexity: medium
estimated_context: 45%
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/lib/carrier/soft-delete.ts
  - apps/web/src/actions/carrier/soft-delete.ts
  - apps/web/src/components/shared/DeleteConfirmationDialog.tsx
  - apps/web/src/hooks/useSoftDelete.ts
  - apps/web/src/app/api/cron/purge-deleted/route.ts
  - apps/web/src/app/(owner)/carrier/recently-deleted/page.tsx
  - apps/web/src/app/(owner)/carrier/recently-deleted/RecentlyDeletedGrid.tsx
  - apps/web/src/app/(owner)/carrier/clients/_grid/ClientsGrid.tsx
  - apps/web/src/app/(owner)/carrier/contracts/_grid/ContractsGrid.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/DriversGrid.tsx
  - apps/web/src/app/(owner)/carrier/fleet/trucks/_grid/TrucksGrid.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/_grid/DispatchesGrid.tsx
  - apps/web/src/app/(owner)/carrier/loads/_grid/LoadsGrid.tsx
  - apps/web/src/app/(owner)/routes/_grid/RoutesGrid.tsx
  - apps/web/src/components/navigation/sidebar.tsx
---

<objective>
Build a reusable soft-delete system for 7 entity types with shared core logic, confirmation dialog, undo toast, Recently Deleted view, and auto-purge cron.

Purpose: Replace hard deletes with recoverable soft-deletes across all major carrier entities, improving data safety and user experience.

Output: Working soft-delete with 8-second undo toast, Recently Deleted page, and 30-day auto-purge.
</objective>

<context>
## Existing Patterns
- Grids use GridShell + QuickActions with `destructive: true` for delete buttons
- Route model already has `archivedAt` column (line 505 of schema)
- RouteDriver model already has `deletedAt`/`deletedBy` pattern (lines 540-541)
- All 7 target models have `createdById`/`updatedById` pattern already
- Sonner toast with `action: { label: 'Undo', onClick: ... }` pattern exists in RoutesGrid
- AlertDialog component exists at `@/components/ui/alert-dialog`
- Cron routes use `verifyCronSecret` pattern (see cleanup-quarantine/route.ts)
- Server actions pattern established in `@/actions/carrier/`

## Target Models (7 total)
1. CarrierClient (@@map "clients") - line 1874
2. CarrierContract (@@map "contracts") - line 1920
3. CarrierDriver (@@map "carrier_drivers") - line 1999
4. CarrierTruck (@@map "carrier_trucks") - line 2053
5. Route - line 485 (already has archivedAt, add deletedBy)
6. Trip (@@map "dispatches") - line 2165
7. CarrierLoad (@@map "loads") - line 2214

## Constants
- SOFT_DELETE_RETENTION_DAYS = 30
- UNDO_TOAST_DURATION_MS = 8000
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + Core Soft-Delete Infrastructure</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/src/lib/carrier/soft-delete.ts
    apps/web/src/actions/carrier/soft-delete.ts
    apps/web/src/app/api/cron/purge-deleted/route.ts
  </files>
  <action>
**1. Schema Changes (single migration for all 7 tables):**

Add to each of the 7 models (CarrierClient, CarrierContract, CarrierDriver, CarrierTruck, Route, Trip, CarrierLoad):
```prisma
deletedAt    DateTime? @map("deleted_at") @db.Timestamptz
deletedById  String?   @map("deleted_by_id") @db.Uuid
```

Add relation to each model:
```prisma
deletedBy    User?     @relation(name: "{Model}DeletedBy", fields: [deletedById], references: [id], onDelete: SetNull)
```

Note: Route already has `archivedAt` - keep it but add `deletedAt`/`deletedById` for consistency.

Add index to each model:
```prisma
@@index([deletedAt])
```

Run: `cd apps/web && npx prisma migrate dev --name add_soft_delete_columns`

**2. Create soft-delete library (`apps/web/src/lib/carrier/soft-delete.ts`):**

```typescript
export const SOFT_DELETE_RETENTION_DAYS = 30;
export const UNDO_TOAST_DURATION_MS = 8000;

export type SoftDeletableEntity =
  | 'CarrierClient'
  | 'CarrierContract'
  | 'CarrierDriver'
  | 'CarrierTruck'
  | 'Route'
  | 'Trip'
  | 'CarrierLoad';

export const ENTITY_DISPLAY_NAMES: Record<SoftDeletableEntity, string> = {
  CarrierClient: 'Client',
  CarrierContract: 'Contract',
  CarrierDriver: 'Driver',
  CarrierTruck: 'Truck',
  Route: 'Route',
  Trip: 'Trip',
  CarrierLoad: 'Load',
};

export const ENTITY_PLURAL_NAMES: Record<SoftDeletableEntity, string> = {
  CarrierClient: 'Clients',
  CarrierContract: 'Contracts',
  CarrierDriver: 'Drivers',
  CarrierTruck: 'Trucks',
  Route: 'Routes',
  Trip: 'Trips',
  CarrierLoad: 'Loads',
};

// Calculate purge date from deletedAt
export function getPurgeDate(deletedAt: Date): Date {
  const purgeDate = new Date(deletedAt);
  purgeDate.setDate(purgeDate.getDate() + SOFT_DELETE_RETENTION_DAYS);
  return purgeDate;
}

// Days until purge
export function getDaysUntilPurge(deletedAt: Date): number {
  const purgeDate = getPurgeDate(deletedAt);
  const now = new Date();
  const diffMs = purgeDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
```

**3. Create soft-delete server actions (`apps/web/src/actions/carrier/soft-delete.ts`):**

```typescript
'use server';

import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import type { SoftDeletableEntity } from '@/lib/carrier/soft-delete';

interface SoftDeleteResult {
  success: boolean;
  error?: string;
  deletedCount?: number;
}

// Generic soft delete - sets deletedAt and deletedById
export async function softDeleteRecords(
  entityType: SoftDeletableEntity,
  ids: string[]
): Promise<SoftDeleteResult> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const orgId = session.tenantId;
  const userId = session.user?.id;
  if (!orgId || !userId) return { success: false, error: 'Invalid session' };

  const now = new Date();

  // Use dynamic model access with type-safe mapping
  const modelMap = {
    CarrierClient: prisma.carrierClient,
    CarrierContract: prisma.carrierContract,
    CarrierDriver: prisma.carrierDriver,
    CarrierTruck: prisma.carrierTruck,
    Route: prisma.route,
    Trip: prisma.trip,
    CarrierLoad: prisma.carrierLoad,
  } as const;

  const orgField = entityType === 'Route' ? 'tenantId' : 'orgId';

  const model = modelMap[entityType];
  const result = await (model as any).updateMany({
    where: {
      id: { in: ids },
      [orgField]: orgId,
      deletedAt: null, // Only delete non-deleted records
    },
    data: {
      deletedAt: now,
      deletedById: userId,
    },
  });

  revalidatePath('/', 'layout');
  return { success: true, deletedCount: result.count };
}

// Generic restore - clears deletedAt and deletedById
export async function restoreRecords(
  entityType: SoftDeletableEntity,
  ids: string[]
): Promise<SoftDeleteResult> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const orgId = session.tenantId;
  if (!orgId) return { success: false, error: 'Invalid session' };

  const modelMap = {
    CarrierClient: prisma.carrierClient,
    CarrierContract: prisma.carrierContract,
    CarrierDriver: prisma.carrierDriver,
    CarrierTruck: prisma.carrierTruck,
    Route: prisma.route,
    Trip: prisma.trip,
    CarrierLoad: prisma.carrierLoad,
  } as const;

  const orgField = entityType === 'Route' ? 'tenantId' : 'orgId';

  const model = modelMap[entityType];
  const result = await (model as any).updateMany({
    where: {
      id: { in: ids },
      [orgField]: orgId,
      deletedAt: { not: null },
    },
    data: {
      deletedAt: null,
      deletedById: null,
    },
  });

  revalidatePath('/', 'layout');
  return { success: true, deletedCount: result.count };
}

// Permanent delete - actually removes from database
export async function permanentlyDeleteRecords(
  entityType: SoftDeletableEntity,
  ids: string[]
): Promise<SoftDeleteResult> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const orgId = session.tenantId;
  if (!orgId) return { success: false, error: 'Invalid session' };

  const modelMap = {
    CarrierClient: prisma.carrierClient,
    CarrierContract: prisma.carrierContract,
    CarrierDriver: prisma.carrierDriver,
    CarrierTruck: prisma.carrierTruck,
    Route: prisma.route,
    Trip: prisma.trip,
    CarrierLoad: prisma.carrierLoad,
  } as const;

  const orgField = entityType === 'Route' ? 'tenantId' : 'orgId';

  const model = modelMap[entityType];
  const result = await (model as any).deleteMany({
    where: {
      id: { in: ids },
      [orgField]: orgId,
      deletedAt: { not: null }, // Only permanently delete already soft-deleted
    },
  });

  revalidatePath('/', 'layout');
  return { success: true, deletedCount: result.count };
}
```

**4. Create auto-purge cron (`apps/web/src/app/api/cron/purge-deleted/route.ts`):**

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
import { SOFT_DELETE_RETENTION_DAYS } from '@/lib/carrier/soft-delete';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] purge-deleted: Starting');

  if (!verifyCronSecret(request)) {
    logger.error('[CRON] purge-deleted: Unauthorized request');
    return cronUnauthorizedResponse();
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SOFT_DELETE_RETENTION_DAYS);

  const results: Record<string, number> = {};

  // Purge each entity type
  const models = [
    { name: 'CarrierLoad', model: prisma.carrierLoad },
    { name: 'Trip', model: prisma.trip },
    { name: 'CarrierContract', model: prisma.carrierContract },
    { name: 'CarrierClient', model: prisma.carrierClient },
    { name: 'CarrierDriver', model: prisma.carrierDriver },
    { name: 'CarrierTruck', model: prisma.carrierTruck },
    { name: 'Route', model: prisma.route },
  ];

  for (const { name, model } of models) {
    try {
      const result = await (model as any).deleteMany({
        where: {
          deletedAt: { not: null, lt: cutoffDate },
        },
      });
      results[name] = result.count;
      if (result.count > 0) {
        logger.info(`[CRON] purge-deleted: Purged ${result.count} ${name} records`);
      }
    } catch (err) {
      logger.error(`[CRON] purge-deleted: Failed to purge ${name}`, { error: String(err) });
      results[name] = -1;
    }
  }

  const totalPurged = Object.values(results).filter(n => n > 0).reduce((a, b) => a + b, 0);
  logger.info('[CRON] purge-deleted: Completed', { totalPurged, results });

  return Response.json({ success: true, totalPurged, results });
}
```

**5. Add cron to vercel.json** (if it exists, otherwise note for user):
```json
{ "path": "/api/cron/purge-deleted", "schedule": "0 3 * * *" }
```
  </action>
  <verify>
    - `cd apps/web && npx prisma validate` passes
    - `cd apps/web && npx tsc --noEmit` passes
    - Migration created and applied
    - All 7 models have deletedAt, deletedById, deletedBy relation, and @@index([deletedAt])
  </verify>
  <done>
    Schema updated with soft-delete columns for all 7 entities. Core library exports constants and helper functions. Server actions for soft-delete, restore, and permanent-delete work for any entity type. Auto-purge cron deletes records older than 30 days.
  </done>
</task>

<task type="auto">
  <name>Task 2: UI Components + Hook + Recently Deleted Page</name>
  <files>
    apps/web/src/components/shared/DeleteConfirmationDialog.tsx
    apps/web/src/hooks/useSoftDelete.ts
    apps/web/src/app/(owner)/carrier/recently-deleted/page.tsx
    apps/web/src/app/(owner)/carrier/recently-deleted/RecentlyDeletedGrid.tsx
    apps/web/src/components/navigation/sidebar.tsx
  </files>
  <action>
**1. Create DeleteConfirmationDialog (`apps/web/src/components/shared/DeleteConfirmationDialog.tsx`):**

```typescript
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { SOFT_DELETE_RETENTION_DAYS } from '@/lib/carrier/soft-delete';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemCount?: number;
  itemName?: string;
  isPermanent?: boolean;
  isLoading?: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  itemCount = 1,
  itemName = 'item',
  isPermanent = false,
  isLoading = false,
}: DeleteConfirmationDialogProps) {
  const plural = itemCount > 1;
  const itemText = plural ? `${itemCount} ${itemName}s` : `this ${itemName}`;

  const defaultTitle = isPermanent
    ? `Permanently delete ${itemText}?`
    : `Delete ${itemText}?`;

  const defaultDescription = isPermanent
    ? `This action cannot be undone. ${plural ? 'These items' : 'This item'} will be permanently removed from the database.`
    : `${plural ? 'These items' : 'This item'} will be moved to Recently Deleted and automatically purged after ${SOFT_DELETE_RETENTION_DAYS} days. You can restore ${plural ? 'them' : 'it'} anytime before then.`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? defaultTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? defaultDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className={buttonVariants({ variant: 'destructive' })}
          >
            {isLoading ? 'Deleting...' : isPermanent ? 'Delete Forever' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

**2. Create useSoftDelete hook (`apps/web/src/hooks/useSoftDelete.ts`):**

```typescript
'use client';

import { useState, useCallback, useTransition } from 'react';
import { toast } from 'sonner';
import { softDeleteRecords, restoreRecords } from '@/actions/carrier/soft-delete';
import {
  UNDO_TOAST_DURATION_MS,
  ENTITY_DISPLAY_NAMES,
  ENTITY_PLURAL_NAMES,
  type SoftDeletableEntity,
} from '@/lib/carrier/soft-delete';

interface UseSoftDeleteOptions {
  entityType: SoftDeletableEntity;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function useSoftDelete({ entityType, onSuccess, onError }: UseSoftDeleteOptions) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const displayName = ENTITY_DISPLAY_NAMES[entityType];
  const pluralName = ENTITY_PLURAL_NAMES[entityType];

  // Open confirmation dialog
  const requestDelete = useCallback((ids: string | string[]) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    setPendingIds(idArray);
    setDialogOpen(true);
  }, []);

  // Execute soft delete after confirmation
  const confirmDelete = useCallback(() => {
    if (pendingIds.length === 0) return;

    const idsToDelete = [...pendingIds];
    setDialogOpen(false);
    setPendingIds([]);

    startTransition(async () => {
      const result = await softDeleteRecords(entityType, idsToDelete);

      if (result.success) {
        const count = result.deletedCount ?? idsToDelete.length;
        const itemText = count > 1 ? `${count} ${pluralName.toLowerCase()}` : displayName;

        toast.success(`${itemText} deleted`, {
          duration: UNDO_TOAST_DURATION_MS,
          action: {
            label: 'Undo',
            onClick: async () => {
              const undoResult = await restoreRecords(entityType, idsToDelete);
              if (undoResult.success) {
                toast.success(`${itemText} restored`);
                onSuccess?.();
              } else {
                toast.error(`Failed to restore: ${undoResult.error}`);
              }
            },
          },
        });
        onSuccess?.();
      } else {
        toast.error(`Failed to delete: ${result.error}`);
        onError?.(result.error ?? 'Unknown error');
      }
    });
  }, [pendingIds, entityType, displayName, pluralName, onSuccess, onError]);

  // Cancel deletion
  const cancelDelete = useCallback(() => {
    setDialogOpen(false);
    setPendingIds([]);
  }, []);

  return {
    isPending,
    dialogOpen,
    pendingIds,
    itemCount: pendingIds.length,
    requestDelete,
    confirmDelete,
    cancelDelete,
    setDialogOpen,
    itemName: displayName.toLowerCase(),
  };
}
```

**3. Create Recently Deleted page (`apps/web/src/app/(owner)/carrier/recently-deleted/page.tsx`):**

```typescript
import { Suspense } from 'react';
import { prisma } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/supabase';
import { redirect } from 'next/navigation';
import { RecentlyDeletedGrid } from './RecentlyDeletedGrid';
import type { SoftDeletableEntity } from '@/lib/carrier/soft-delete';

export const metadata = {
  title: 'Recently Deleted | DriveCommand',
};

interface DeletedItem {
  id: string;
  entityType: SoftDeletableEntity;
  name: string;
  deletedAt: Date;
  deletedBy: string | null;
}

async function getDeletedItems(orgId: string): Promise<DeletedItem[]> {
  const items: DeletedItem[] = [];

  // Fetch soft-deleted records from all entity types
  const [clients, contracts, drivers, trucks, routes, trips, loads] = await Promise.all([
    prisma.carrierClient.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.carrierContract.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, contractNumber: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.carrierDriver.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, firstName: true, lastName: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.carrierTruck.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, unitNumber: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.route.findMany({
      where: { tenantId: orgId, deletedAt: { not: null } },
      select: { id: true, name: true, origin: true, destination: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.trip.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, scheduledDeparture: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
    prisma.carrierLoad.findMany({
      where: { orgId, deletedAt: { not: null } },
      select: { id: true, referenceNumber: true, deletedAt: true, deletedBy: { select: { email: true } } },
    }),
  ]);

  clients.forEach(c => items.push({
    id: c.id,
    entityType: 'CarrierClient',
    name: c.name,
    deletedAt: c.deletedAt!,
    deletedBy: c.deletedBy?.email ?? null,
  }));

  contracts.forEach(c => items.push({
    id: c.id,
    entityType: 'CarrierContract',
    name: c.contractNumber,
    deletedAt: c.deletedAt!,
    deletedBy: c.deletedBy?.email ?? null,
  }));

  drivers.forEach(d => items.push({
    id: d.id,
    entityType: 'CarrierDriver',
    name: `${d.firstName} ${d.lastName}`,
    deletedAt: d.deletedAt!,
    deletedBy: d.deletedBy?.email ?? null,
  }));

  trucks.forEach(t => items.push({
    id: t.id,
    entityType: 'CarrierTruck',
    name: t.unitNumber,
    deletedAt: t.deletedAt!,
    deletedBy: t.deletedBy?.email ?? null,
  }));

  routes.forEach(r => items.push({
    id: r.id,
    entityType: 'Route',
    name: r.name ?? `${r.origin} → ${r.destination}`,
    deletedAt: r.deletedAt!,
    deletedBy: r.deletedBy?.email ?? null,
  }));

  trips.forEach(t => items.push({
    id: t.id,
    entityType: 'Trip',
    name: `Trip ${t.scheduledDeparture.toLocaleDateString()}`,
    deletedAt: t.deletedAt!,
    deletedBy: t.deletedBy?.email ?? null,
  }));

  loads.forEach(l => items.push({
    id: l.id,
    entityType: 'CarrierLoad',
    name: l.referenceNumber ?? `Load ${l.id.slice(0, 8)}`,
    deletedAt: l.deletedAt!,
    deletedBy: l.deletedBy?.email ?? null,
  }));

  // Sort by deletedAt descending (most recent first)
  return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

export default async function RecentlyDeletedPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const items = await getDeletedItems(session.tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recently Deleted</h1>
        <p className="text-muted-foreground">
          Items here will be automatically purged after 30 days. You can restore them anytime before then.
        </p>
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <RecentlyDeletedGrid items={items} />
      </Suspense>
    </div>
  );
}
```

**4. Create RecentlyDeletedGrid (`apps/web/src/app/(owner)/carrier/recently-deleted/RecentlyDeletedGrid.tsx`):**

```typescript
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { restoreRecords, permanentlyDeleteRecords } from '@/actions/carrier/soft-delete';
import { DeleteConfirmationDialog } from '@/components/shared/DeleteConfirmationDialog';
import {
  getDaysUntilPurge,
  ENTITY_DISPLAY_NAMES,
  type SoftDeletableEntity,
} from '@/lib/carrier/soft-delete';

interface DeletedItem {
  id: string;
  entityType: SoftDeletableEntity;
  name: string;
  deletedAt: Date;
  deletedBy: string | null;
}

interface RecentlyDeletedGridProps {
  items: DeletedItem[];
}

export function RecentlyDeletedGrid({ items: initialItems }: RecentlyDeletedGridProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<DeletedItem | null>(null);

  const handleRestore = (item: DeletedItem) => {
    startTransition(async () => {
      const result = await restoreRecords(item.entityType, [item.id]);
      if (result.success) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        toast.success(`${ENTITY_DISPLAY_NAMES[item.entityType]} restored`);
        router.refresh();
      } else {
        toast.error(`Failed to restore: ${result.error}`);
      }
    });
  };

  const handlePermanentDelete = () => {
    if (!deleteTarget) return;

    const target = deleteTarget;
    setDeleteTarget(null);

    startTransition(async () => {
      const result = await permanentlyDeleteRecords(target.entityType, [target.id]);
      if (result.success) {
        setItems(prev => prev.filter(i => i.id !== target.id));
        toast.success(`${ENTITY_DISPLAY_NAMES[target.entityType]} permanently deleted`);
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    });
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No deleted items. Items you delete will appear here for 30 days.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {items.map(item => {
          const daysLeft = getDaysUntilPurge(item.deletedAt);
          return (
            <Card key={`${item.entityType}-${item.id}`}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <Badge variant="outline">
                    {ENTITY_DISPLAY_NAMES[item.entityType]}
                  </Badge>
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Deleted {item.deletedAt.toLocaleDateString()}
                      {item.deletedBy && ` by ${item.deletedBy}`}
                      {' • '}
                      <span className={daysLeft <= 7 ? 'text-destructive' : ''}>
                        {daysLeft === 0 ? 'Purges today' : `Purges in ${daysLeft} days`}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(item)}
                    disabled={isPending}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />
                    Restore
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteTarget(item)}
                    disabled={isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete Forever
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DeleteConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handlePermanentDelete}
        itemName={deleteTarget ? ENTITY_DISPLAY_NAMES[deleteTarget.entityType].toLowerCase() : 'item'}
        isPermanent
        isLoading={isPending}
      />
    </>
  );
}
```

**5. Add Recently Deleted to sidebar navigation:**

In `apps/web/src/components/navigation/sidebar.tsx`, add to the carrier section (near other management links):
```typescript
{
  name: 'Recently Deleted',
  href: '/carrier/recently-deleted',
  icon: Trash2,
}
```

Import `Trash2` from `lucide-react` if not already imported.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - Navigate to /carrier/recently-deleted shows empty state
    - DeleteConfirmationDialog renders correctly
    - Sidebar shows Recently Deleted link
  </verify>
  <done>
    Generic DeleteConfirmationDialog component with soft/permanent delete messaging. useSoftDelete hook provides requestDelete, confirmDelete, 8-second undo toast with working Undo button. Recently Deleted page lists all soft-deleted items across 7 entity types with Restore and Delete Forever actions. Sidebar navigation updated.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire Soft-Delete to All 7 Grids</name>
  <files>
    apps/web/src/app/(owner)/carrier/clients/_grid/ClientsGrid.tsx
    apps/web/src/app/(owner)/carrier/contracts/_grid/ContractsGrid.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/DriversGrid.tsx
    apps/web/src/app/(owner)/carrier/fleet/trucks/_grid/TrucksGrid.tsx
    apps/web/src/app/(owner)/carrier/dispatches/_grid/DispatchesGrid.tsx
    apps/web/src/app/(owner)/carrier/loads/_grid/LoadsGrid.tsx
    apps/web/src/app/(owner)/routes/_grid/RoutesGrid.tsx
  </files>
  <action>
For each of the 7 grid components, apply this pattern:

**1. Add imports:**
```typescript
import { useSoftDelete } from '@/hooks/useSoftDelete';
import { DeleteConfirmationDialog } from '@/components/shared/DeleteConfirmationDialog';
```

**2. Add hook usage inside the component:**
```typescript
const {
  isPending: isDeletePending,
  dialogOpen,
  itemCount,
  itemName,
  requestDelete,
  confirmDelete,
  setDialogOpen,
} = useSoftDelete({
  entityType: '{EntityType}', // e.g., 'CarrierClient', 'CarrierDriver', etc.
  onSuccess: () => router.refresh(),
});
```

**3. Update the delete action in renderQuickActions:**
Replace the TODO/console.warn with:
```typescript
{
  id: 'delete',
  label: 'Delete',
  icon: Trash2,
  onClick: () => requestDelete(row.id),
  destructive: true,
}
```

**4. Update bulk delete in bulkActions:**
Replace the TODO/console.warn with:
```typescript
{
  id: 'delete',
  label: 'Delete',
  icon: Trash2,
  onClick: () => requestDelete(Array.from(selectedIds)),
  destructive: true,
}
```

**5. Add dialog at end of component return (before closing tag):**
```typescript
<DeleteConfirmationDialog
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  onConfirm={confirmDelete}
  itemCount={itemCount}
  itemName={itemName}
  isLoading={isDeletePending}
/>
```

**6. Update each grid's data query to exclude soft-deleted:**
In the page.tsx that provides data to each grid, add `deletedAt: null` to the where clause:
- `/carrier/clients/page.tsx`: `where: { orgId, deletedAt: null }`
- `/carrier/contracts/page.tsx`: `where: { orgId, deletedAt: null }`
- `/carrier/fleet/drivers/page.tsx`: `where: { orgId, deletedAt: null }`
- `/carrier/fleet/trucks/page.tsx`: `where: { orgId, deletedAt: null }`
- `/carrier/dispatches/page.tsx`: `where: { orgId, deletedAt: null }`
- `/carrier/loads/page.tsx`: `where: { orgId, deletedAt: null }`
- `/routes/page.tsx`: `where: { tenantId, deletedAt: null }`

**Entity type mapping:**
- ClientsGrid → `'CarrierClient'`
- ContractsGrid → `'CarrierContract'`
- DriversGrid → `'CarrierDriver'`
- TrucksGrid → `'CarrierTruck'`
- DispatchesGrid → `'Trip'`
- LoadsGrid → `'CarrierLoad'`
- RoutesGrid → `'Route'`

**Special note for RoutesGrid:**
- Remove the existing `deleteAction` prop and `handleDelete` function
- Use the new useSoftDelete hook instead
- The existing optimistic removal logic can be removed (hook handles toast)
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - Each grid's delete button opens confirmation dialog
    - Confirming delete removes item from list and shows 8-second undo toast
    - Clicking Undo restores the item
    - Bulk select + bulk delete works on all grids
    - Soft-deleted items no longer appear in normal listings
    - Soft-deleted items appear in Recently Deleted page
  </verify>
  <done>
    All 7 grids wired to soft-delete system. Delete button triggers confirmation dialog. After confirmation, item is soft-deleted with 8-second undo toast. Undo restores the item. Bulk delete works. Soft-deleted items hidden from normal views, visible in Recently Deleted. Full delete lifecycle working end-to-end.
  </done>
</task>

</tasks>

<verification>
1. Schema validation: `cd apps/web && npx prisma validate`
2. TypeScript: `cd apps/web && npx tsc --noEmit`
3. Manual test flow:
   - Delete a client from /carrier/clients
   - Confirmation dialog appears with 30-day messaging
   - Confirm -> client disappears, toast shows for 8 seconds with Undo
   - Click Undo -> client restored
   - Delete again, let toast expire
   - Navigate to /carrier/recently-deleted -> client appears
   - Click Restore -> client back in /carrier/clients
   - Delete again, go to Recently Deleted, click Delete Forever
   - Confirm permanent delete -> client gone forever
4. Repeat for at least 2 other entity types (e.g., Driver, Load)
5. Bulk delete: select multiple items, bulk delete, verify all appear in Recently Deleted
</verification>

<success_criteria>
- All 7 entity types support soft-delete with deletedAt/deletedById columns
- Delete action on any grid shows confirmation dialog before proceeding
- After soft-delete, 8-second undo toast appears with working Undo button
- Soft-deleted items hidden from normal listings (where deletedAt: null)
- Recently Deleted page at /carrier/recently-deleted lists all soft-deleted items
- Each item shows entity type badge, name, deletion date/by, days until purge
- Restore button immediately restores item to normal listings
- Delete Forever button with confirmation permanently removes item
- Auto-purge cron at /api/cron/purge-deleted removes items older than 30 days
- Sidebar navigation includes Recently Deleted link
- No TypeScript errors, no console warnings
</success_criteria>
