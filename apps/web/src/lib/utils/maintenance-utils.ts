/**
 * Utility functions for maintenance calculations.
 * Implements dual-trigger due status calculation (whichever comes first).
 */

/**
 * Due status result for a scheduled service.
 * Indicates if service is due by date, mileage, or either trigger.
 */
export interface DueStatus {
  isDueByDate: boolean;
  isDueByMileage: boolean;
  isDue: boolean; // true if EITHER trigger is met
  nextDueDate: Date | null;
  nextDueMileage: number | null;
  daysUntilDue: number | null;
  milesUntilDue: number | null;
}

/**
 * Schedule input for due status calculation.
 */
interface Schedule {
  intervalDays: number | null;
  intervalMiles: number | null;
  baselineDate: Date | string;
  baselineOdometer: number;
}

/**
 * Calculate due status for a scheduled service based on dual triggers.
 *
 * @param schedule - The scheduled service configuration
 * @param currentOdometer - The truck's current odometer reading
 * @returns DueStatus indicating whether service is due and by which trigger
 *
 * @example
 * const status = calculateNextDue({
 *   intervalDays: 90,
 *   intervalMiles: 5000,
 *   baselineDate: new Date('2024-01-01'),
 *   baselineOdometer: 10000
 * }, 14500);
 * // Returns: { isDue: false, isDueByDate: true, isDueByMileage: false, ... }
 */
export function calculateNextDue(schedule: Schedule, currentOdometer: number): DueStatus {
  const now = new Date();

  // Initialize result
  const result: DueStatus = {
    isDueByDate: false,
    isDueByMileage: false,
    isDue: false,
    nextDueDate: null,
    nextDueMileage: null,
    daysUntilDue: null,
    milesUntilDue: null,
  };

  // Calculate date-based trigger (if configured)
  if (schedule.intervalDays !== null) {
    const baselineDate = new Date(schedule.baselineDate);
    const nextDueDate = new Date(baselineDate);
    // Use setDate() to avoid DST bugs (not millisecond math)
    nextDueDate.setDate(nextDueDate.getDate() + schedule.intervalDays);

    result.nextDueDate = nextDueDate;
    result.isDueByDate = now >= nextDueDate;
    result.daysUntilDue = Math.ceil((nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Calculate mileage-based trigger (if configured)
  if (schedule.intervalMiles !== null) {
    const nextDueMileage = schedule.baselineOdometer + schedule.intervalMiles;

    result.nextDueMileage = nextDueMileage;
    result.isDueByMileage = currentOdometer >= nextDueMileage;
    result.milesUntilDue = nextDueMileage - currentOdometer;
  }

  // Service is due if EITHER trigger is met (whichever comes first)
  result.isDue = result.isDueByDate || result.isDueByMileage;

  return result;
}
