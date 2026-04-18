'use server';

import type { ActionState } from '@drivecommand/types'

import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { HOSDutyStatus } from '@/generated/prisma';

/**
 * Hours of Service tracking data for the current driver.
 * Returns the latest duty status from the DriverHOSEntry table.
 */
export async function getDriverHOS() {
  const session = await getSession();
  if (!session) return null;

  const latestEntry = await prisma.driverHOSEntry.findFirst({
    where: {
      driverId: session.userId,
      tenantId: session.tenantId,
    },
    orderBy: { startTime: 'desc' },
  });

  return {
    currentStatus: (latestEntry?.status ?? 'OFF_DUTY') as 'DRIVING' | 'ON_DUTY' | 'SLEEPER_BERTH' | 'OFF_DUTY',
    onDutyHoursUsed: 0,
    drivingHoursUsed: 0,
    drivingHoursRemaining: 11,
    onDutyHoursRemaining: 14,
    cycleHoursUsed: 0,
    cycleHoursRemaining: 70,
    lastBreakAt: new Date().toISOString(),
    nextBreakRequired: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Update driver's duty status.
 * Closes any open entry and creates a new one with the selected status.
 */
export async function updateDutyStatus(prevState: ActionState | null, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const status = formData.get('status') as string;
  const validStatuses = ['DRIVING', 'ON_DUTY', 'SLEEPER_BERTH', 'OFF_DUTY'];

  if (!validStatuses.includes(status)) {
    return { error: 'Invalid duty status.' };
  }

  const hosStatus = status as HOSDutyStatus;

  try {
    // Close any currently open entry
    await prisma.driverHOSEntry.updateMany({
      where: {
        driverId: session.userId,
        tenantId: session.tenantId,
        endTime: null,
      },
      data: { endTime: new Date() },
    });

    // Create new entry for selected status
    await prisma.driverHOSEntry.create({
      data: {
        tenantId: session.tenantId,
        driverId: session.userId,
        status: hosStatus,
        startTime: new Date(),
      },
    });

    return { success: true, message: `Status updated to ${status.replace('_', ' ')}.` };
  } catch {
    return { error: 'Failed to update duty status. Please try again.' };
  }
}
