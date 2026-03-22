'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';

/**
 * Hours of Service tracking data for the current driver.
 * Returns HOS status and remaining hours.
 */
export async function getDriverHOS() {
  await requireRole([UserRole.DRIVER]);

  // HOS feature scaffold - would connect to ELD integration
  return {
    currentStatus: 'ON_DUTY' as const,
    drivingHoursUsed: 6.5,
    drivingHoursRemaining: 4.5,
    onDutyHoursUsed: 8.0,
    onDutyHoursRemaining: 6.0,
    cycleHoursUsed: 42.0,
    cycleHoursRemaining: 28.0,
    lastBreakAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    nextBreakRequired: new Date(Date.now() + 1.5 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Update driver's duty status.
 */
export async function updateDutyStatus(prevState: any, formData: FormData) {
  await requireRole([UserRole.DRIVER]);

  const status = formData.get('status') as string;
  const validStatuses = ['DRIVING', 'ON_DUTY', 'SLEEPER_BERTH', 'OFF_DUTY'];

  if (!validStatuses.includes(status)) {
    return { error: 'Invalid duty status.' };
  }

  // In production, this would update the ELD/HOS system
  return { success: true, message: `Status updated to ${status.replace('_', ' ')}.` };
}
