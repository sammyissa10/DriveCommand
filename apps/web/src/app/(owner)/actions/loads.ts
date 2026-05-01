'use server';

import type { ActionState } from '@drivecommand/types'

import { requireRole, requireAuth } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { loadCreateSchema, loadUpdateSchema, dispatchLoadSchema } from '@drivecommand/validation';
import { Prisma, LoadStatus } from '@/generated/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sendLoadStatusEmail } from '@/lib/email/customer-notifications';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { logger } from '@/lib/logger';
import {
  createRouteStopsForLoad,
  deleteRouteStopsForLoad,
} from '@/lib/route-stops/sync-route-stops';
import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';

const Decimal = Prisma.Decimal;

/**
 * Map load status enum values to human-readable labels.
 */
function formatStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DISPATCHED: 'Dispatched',
    PICKED_UP: 'Picked Up',
    IN_TRANSIT: 'In Transit',
    DELIVERED: 'Delivered',
    INVOICED: 'Invoiced',
    CANCELLED: 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Send a load status notification email to the customer and log a CRM interaction.
 * Errors are caught and logged but never thrown — email failure must not block load status changes.
 */
async function sendNotificationAndLogInteraction(
  prisma: any,
  tenantId: string,
  loadId: string,
  newStatus: string
): Promise<void> {
  try {
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      include: {
        customer: true,
        driver: { select: { firstName: true, lastName: true } },
        truck: { select: { make: true, model: true, licensePlate: true } },
      },
    });

    if (!load?.customer?.email || !load.customer.emailNotifications) return;

    const driverName = load.driver
      ? `${load.driver.firstName || ''} ${load.driver.lastName || ''}`.trim() || 'Assigned Driver'
      : 'TBD';
    const truckInfo = load.truck
      ? `${load.truck.make} ${load.truck.model} (${load.truck.licensePlate})`
      : 'TBD';
    const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.drivecommand.com'}/loads/${loadId}`;

    await sendLoadStatusEmail(load.customer.email, {
      customerName: load.customer.contactName || load.customer.companyName,
      loadNumber: load.loadNumber,
      status: newStatus,
      origin: load.origin,
      destination: load.destination,
      driverName,
      truckInfo,
      estimatedDelivery: load.deliveryDate
        ? load.deliveryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : undefined,
      trackingUrl,
    });

    await prisma.customerInteraction.create({
      data: {
        tenantId,
        customerId: load.customer.id,
        type: 'LOAD_UPDATE',
        subject: `Load ${load.loadNumber} \u2014 ${formatStatusLabel(newStatus)}`,
        description: `Automated email sent: Load ${load.loadNumber} status changed to ${formatStatusLabel(newStatus)}. Route: ${load.origin} -> ${load.destination}.`,
        isAutomated: true,
      },
    });
  } catch (error) {
    // Log but do NOT throw — email failure should not block load status change
    logger.error('Failed to send customer notification:', error);
  }
}

/**
 * Generate the next load number (LD-NNNN format).
 */
async function generateLoadNumber(prisma: any, tenantId: string): Promise<string> {
  // Find the highest existing load number for this tenant
  const latestLoad = await prisma.load.findFirst({
    where: { tenantId },
    orderBy: { loadNumber: 'desc' },
    select: { loadNumber: true },
  });

  if (!latestLoad) {
    return 'LD-0001';
  }

  // Parse the number from "LD-NNNN" format
  const match = latestLoad.loadNumber.match(/^LD-(\d+)$/);
  if (!match) {
    return 'LD-0001';
  }

  const nextNum = parseInt(match[1], 10) + 1;
  return `LD-${String(nextNum).padStart(4, '0')}`;
}

/**
 * Create a new load.
 */
export async function createLoad(prevState: ActionState | null, formData: FormData) {
  const rawData = {
    customerId: formData.get('customerId') as string,
    driverId: (formData.get('driverId') as string) || '',
    truckId: (formData.get('truckId') as string) || '',
    routeId: (formData.get('routeId') as string) || '',
    origin: formData.get('origin') as string,
    destination: formData.get('destination') as string,
    pickupDate: formData.get('pickupDate') as string,
    deliveryDate: (formData.get('deliveryDate') as string) || '',
    weight: formData.get('weight') as string,
    commodity: (formData.get('commodity') as string) || '',
    rate: formData.get('rate') as string,
    notes: (formData.get('notes') as string) || '',
  };

  const result = loadCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const pickupLat = parseFloat(formData.get('pickupLat') as string);
  const pickupLng = parseFloat(formData.get('pickupLng') as string);
  const deliveryLat = parseFloat(formData.get('deliveryLat') as string);
  const deliveryLng = parseFloat(formData.get('deliveryLng') as string);

  let createdId: string;

  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);
    const tenantId = await requireTenantId();
    const userId = await requireAuth();
    const prisma = await getTenantPrisma();

    const loadNumber = await generateLoadNumber(prisma, tenantId);

    const loadRouteId = result.data.routeId || null;

    const load = await prisma.$transaction(async (tx) => {
      const createdLoad = await tx.load.create({
        data: {
          tenantId,
          loadNumber,
          customerId: result.data.customerId,
          driverId: result.data.driverId || null,
          truckId: result.data.truckId || null,
          routeId: loadRouteId,
          origin: result.data.origin,
          destination: result.data.destination,
          pickupDate: new Date(result.data.pickupDate),
          deliveryDate: result.data.deliveryDate ? new Date(result.data.deliveryDate) : null,
          weight: result.data.weight || null,
          commodity: result.data.commodity || null,
          rate: new Decimal(result.data.rate),
          notes: result.data.notes || null,
          pickupLat: !isNaN(pickupLat) ? new Decimal(pickupLat) : null,
          pickupLng: !isNaN(pickupLng) ? new Decimal(pickupLng) : null,
          deliveryLat: !isNaN(deliveryLat) ? new Decimal(deliveryLat) : null,
          deliveryLng: !isNaN(deliveryLng) ? new Decimal(deliveryLng) : null,
          createdById: userId,
          updatedById: userId,
        },
      });

      // If load is being assigned to a route on creation, auto-create RouteStops
      if (loadRouteId) {
        await createRouteStopsForLoad(tx, {
          routeId: loadRouteId,
          tenantId,
          load: createdLoad,
        });
      }

      return createdLoad;
    });

    createdId = load.id;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    // Surface the real error so it's visible in the form
    return { error: msg || 'Failed to create load. Please try again.' };
  }

  revalidatePath('/loads');
  redirect(`/loads/${createdId}`);
}

/**
 * Update an existing load.
 */
export async function updateLoad(id: string, prevState: ActionState | null, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    customerId: formData.get('customerId') as string,
    driverId: (formData.get('driverId') as string) || '',
    truckId: (formData.get('truckId') as string) || '',
    routeId: (formData.get('routeId') as string) || '',
    origin: formData.get('origin') as string,
    destination: formData.get('destination') as string,
    pickupDate: formData.get('pickupDate') as string,
    deliveryDate: (formData.get('deliveryDate') as string) || '',
    weight: formData.get('weight') as string,
    commodity: (formData.get('commodity') as string) || '',
    rate: formData.get('rate') as string,
    notes: (formData.get('notes') as string) || '',
  };

  const result = loadUpdateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const userId = await requireAuth();
  const prisma = await getTenantPrisma();
  const tenantId = await requireTenantId();

  const pickupLat = parseFloat(formData.get('pickupLat') as string);
  const pickupLng = parseFloat(formData.get('pickupLng') as string);
  const deliveryLat = parseFloat(formData.get('deliveryLat') as string);
  const deliveryLng = parseFloat(formData.get('deliveryLng') as string);

  // Fetch current routeId before updating to detect route transitions
  const existingLoad = await prisma.load.findUnique({
    where: { id },
    select: {
      routeId: true,
      origin: true,
      destination: true,
      pickupLat: true,
      pickupLng: true,
      deliveryLat: true,
      deliveryLng: true,
    },
  });

  if (!existingLoad) {
    return { error: 'Load not found.' };
  }

  const newRouteId = result.data.routeId || null;
  const oldRouteId = existingLoad.routeId;
  const originChanged = result.data.origin !== existingLoad.origin;
  const destinationChanged = result.data.destination !== existingLoad.destination;
  const addressChanged = originChanged || destinationChanged;

  try {
    await prisma.$transaction(async (tx) => {
      const updatedLoad = await tx.load.update({
        where: { id },
        data: {
          customerId: result.data.customerId,
          driverId: result.data.driverId || null,
          truckId: result.data.truckId || null,
          routeId: newRouteId,
          origin: result.data.origin,
          destination: result.data.destination,
          pickupDate: new Date(result.data.pickupDate),
          deliveryDate: result.data.deliveryDate ? new Date(result.data.deliveryDate) : null,
          weight: result.data.weight || null,
          commodity: result.data.commodity || null,
          rate: new Decimal(result.data.rate),
          notes: result.data.notes || null,
          ...(!isNaN(pickupLat) && { pickupLat: new Decimal(pickupLat) }),
          ...(!isNaN(pickupLng) && { pickupLng: new Decimal(pickupLng) }),
          ...(!isNaN(deliveryLat) && { deliveryLat: new Decimal(deliveryLat) }),
          ...(!isNaN(deliveryLng) && { deliveryLng: new Decimal(deliveryLng) }),
          updatedById: userId,
        },
      });

      // Build a load snapshot for RouteStop sync (use form-provided coords when valid)
      const loadForSync = {
        id,
        origin: result.data.origin,
        destination: result.data.destination,
        pickupLat: !isNaN(pickupLat) ? new Decimal(pickupLat) : updatedLoad.pickupLat,
        pickupLng: !isNaN(pickupLng) ? new Decimal(pickupLng) : updatedLoad.pickupLng,
        deliveryLat: !isNaN(deliveryLat) ? new Decimal(deliveryLat) : updatedLoad.deliveryLat,
        deliveryLng: !isNaN(deliveryLng) ? new Decimal(deliveryLng) : updatedLoad.deliveryLng,
      };

      const routeBeingSet = newRouteId && !oldRouteId;
      const routeBeingCleared = !newRouteId && oldRouteId;
      const routeBeingChanged = newRouteId && oldRouteId && newRouteId !== oldRouteId;
      const addressChangedWithRoute = addressChanged && newRouteId && newRouteId === oldRouteId;

      if (routeBeingSet && newRouteId) {
        await createRouteStopsForLoad(tx, { routeId: newRouteId, tenantId, load: loadForSync });
      } else if (routeBeingCleared && oldRouteId) {
        await deleteRouteStopsForLoad(tx, { routeId: oldRouteId, loadId: id });
      } else if (routeBeingChanged && newRouteId && oldRouteId) {
        await deleteRouteStopsForLoad(tx, { routeId: oldRouteId, loadId: id });
        await createRouteStopsForLoad(tx, { routeId: newRouteId, tenantId, load: loadForSync });
      } else if (addressChangedWithRoute && newRouteId) {
        // Address changed while staying on same route: rebuild stops with new coords
        await deleteRouteStopsForLoad(tx, { routeId: newRouteId, loadId: id });
        await createRouteStopsForLoad(tx, { routeId: newRouteId, tenantId, load: loadForSync });
      }
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to update load. Please try again.' };
  }

  revalidatePath('/loads');
  redirect(`/loads/${id}`);
}

/**
 * Delete a load. Only PENDING or CANCELLED loads can be deleted.
 */
export async function deleteLoad(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    const load = await prisma.load.findUnique({ where: { id }, select: { status: true } });
    if (!load) {
      return { error: 'Load not found.' };
    }
    if (load.status !== 'PENDING' && load.status !== 'CANCELLED') {
      return { error: 'Only pending or cancelled loads can be archived.' };
    }
    await prisma.load.update({ where: { id }, data: { archivedAt: new Date() } });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to archive load.' };
  }

  revalidatePath('/loads');
  redirect('/loads');
}

/**
 * Dispatch a load by assigning a driver and truck. Status moves to DISPATCHED.
 */
export async function dispatchLoad(id: string, prevState: ActionState | null, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    driverId: formData.get('driverId') as string,
    truckId: formData.get('truckId') as string,
    routeId: (formData.get('routeId') as string) || '',
  };

  const result = dispatchLoadSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const prisma = await getTenantPrisma();

  try {
    const load = await prisma.load.findUnique({
      where: { id },
      select: { status: true, loadNumber: true, origin: true, destination: true },
    });
    if (!load) {
      return { error: 'Load not found.' };
    }
    if (load.status !== 'PENDING') {
      return { error: 'Only pending loads can be dispatched.' };
    }

    await prisma.load.update({
      where: { id },
      data: {
        driverId: result.data.driverId,
        truckId: result.data.truckId,
        routeId: result.data.routeId || null,
        status: 'DISPATCHED',
        trackingToken: globalThis.crypto.randomUUID(),
      },
    });

    // Fire-and-forget notification (non-blocking)
    const tId = await requireTenantId();
    sendNotificationAndLogInteraction(prisma, tId, id, 'DISPATCHED');

    // Push notification to assigned driver — best-effort
    void sendPushToUser(result.data.driverId, {
      title: 'New load assigned',
      body: `Load ${load.loadNumber}: ${load.origin} → ${load.destination}`,
      data: { screen: 'loads', loadId: id },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to dispatch load. Please try again.' };
  }

  revalidatePath('/loads');
  redirect(`/loads/${id}`);
}

/**
 * Reassign the truck on an active load (DISPATCHED, PICKED_UP, IN_TRANSIT).
 * Does not change the driver or load status — only swaps the truck.
 */
export async function reassignTruck(loadId: string, prevState: ActionState | null, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const truckId = (formData.get('truckId') as string | null)?.trim();
  if (!truckId) {
    return { error: 'Please select a truck.' };
  }

  const userId = await requireAuth();
  const prisma = await getTenantPrisma();

  try {
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      select: { status: true },
    });

    if (!load) {
      return { error: 'Load not found.' };
    }

    const allowedStatuses = ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'];
    if (!allowedStatuses.includes(load.status)) {
      return { error: 'Truck can only be reassigned on dispatched or in-transit loads.' };
    }

    await prisma.load.update({
      where: { id: loadId },
      data: { truckId, updatedById: userId },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to reassign truck. Please try again.' };
  }

  revalidatePath('/loads');
  revalidatePath(`/loads/${loadId}`);
  return { success: true };
}

// Allowed status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  DISPATCHED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['INVOICED', 'CANCELLED'],
};

// Reverse status transitions — used by revertLoadStatus
const REVERSE_STATUS_TRANSITIONS: Record<string, string> = {
  DISPATCHED: 'PENDING',
  PICKED_UP: 'DISPATCHED',
  IN_TRANSIT: 'PICKED_UP',
  DELIVERED: 'IN_TRANSIT',
  INVOICED: 'DELIVERED',
};

/**
 * Progress a load's status through the lifecycle.
 */
export async function updateLoadStatus(id: string, newStatus: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  // Declare tenantId at outer scope so it is available to both the notification
  // block and the activation tracker call below.
  const tenantId = await requireTenantId();

  let invoicedCustomerId: string | null = null;

  try {
    const load = await prisma.load.findUnique({ where: { id }, select: { status: true, customerId: true, rate: true, isSample: true } });
    if (!load) {
      return { error: 'Load not found.' };
    }

    // Idempotency: if already at target status, treat as success (TKT-0034)
    if (load.status === newStatus) {
      return { success: true };
    }

    const allowedTransitions = STATUS_TRANSITIONS[load.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      return { error: `Cannot transition from ${load.status} to ${newStatus}.` };
    }

    // Guard: require at least one linked invoice before marking as INVOICED
    if (newStatus === 'INVOICED') {
      const invoiceCount = await prisma.invoice.count({
        where: { loadId: id, status: { not: 'CANCELLED' } },
      });
      if (invoiceCount === 0) {
        return { error: 'An invoice must be created and linked to this load before it can be marked as Invoiced.' };
      }
    }

    await prisma.load.update({
      where: { id },
      data: { status: newStatus as LoadStatus },
    });

    // Activation tracker: fire when first real load goes IN_TRANSIT
    if (newStatus === 'IN_TRANSIT' && !load.isSample) {
      try {
        await recordActivationEvent(tenantId, 'first_load_in_transit');
      } catch (err) {
        console.error('[updateLoadStatus] activation tracker failed', err);
      }
    }

    // Only send for customer-relevant statuses
    if (['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(newStatus)) {
      sendNotificationAndLogInteraction(prisma, tenantId, id, newStatus);
    }

    // Update CRM customer performance stats when a load is invoiced
    if (newStatus === 'INVOICED' && load.customerId) {
      invoicedCustomerId = load.customerId;
      prisma.customer.update({
        where: { id: load.customerId },
        data: {
          totalLoads: { increment: 1 },
          totalRevenue: { increment: load.rate },
          lastLoadDate: new Date(),
        },
      }).catch((err) => logger.error('Failed to update customer stats:', err));
    }
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to update load status. Please try again.' };
  }

  revalidatePath('/loads');
  revalidatePath(`/loads/${id}`);
  if (invoicedCustomerId) {
    revalidatePath(`/crm/${invoicedCustomerId}`);
  }
  return { success: true };
}

/**
 * Update the sequence (leg number) of a load on a route.
 * Passing null clears the sequence.
 */
export async function updateLoadSequence(loadId: string, sequence: number | null) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const prisma = await getTenantPrisma();

  try {
    await prisma.load.update({
      where: { id: loadId },
      data: { sequence },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to update load sequence.' };
  }

  revalidatePath('/routes');
  return { success: true };
}

/**
 * Revert a load's status one step back in the lifecycle.
 * Does NOT send customer notifications — this is a dispatcher correction, not a customer-facing event.
 * When reverting from DISPATCHED back to PENDING, clears driverId, truckId, and trackingToken.
 */
export async function revertLoadStatus(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    const load = await prisma.load.findUnique({ where: { id }, select: { status: true } });
    if (!load) {
      return { error: 'Load not found.' };
    }

    const prevStatus = REVERSE_STATUS_TRANSITIONS[load.status];
    if (!prevStatus) {
      return { error: `Cannot revert from ${load.status}.` };
    }

    // When reverting from DISPATCHED back to PENDING, clear assignment fields
    const updateData: any = { status: prevStatus };
    if (load.status === 'DISPATCHED') {
      updateData.driverId = null;
      updateData.truckId = null;
      updateData.trackingToken = null;
    }

    await prisma.load.update({
      where: { id },
      data: updateData,
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { error: 'Load not found.' };
    }
    return { error: 'Failed to revert load status. Please try again.' };
  }

  revalidatePath('/loads');
  revalidatePath(`/loads/${id}`);
  return { success: true };
}
