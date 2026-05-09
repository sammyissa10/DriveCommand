/**
 * Pure utility for computing a truck's operational status from its related data.
 * No DB calls — accepts already-fetched data and returns the derived status.
 *
 * Priority order (highest wins):
 *   1. In Use        — active route or active load
 *   2. In Maintenance — manual override OR overdue scheduled service
 *   3. Expired Docs  — at least one document past its expiry date
 *   4. Ready to Use  — none of the above
 */

export type TruckStatus = 'In Use' | 'In Maintenance' | 'Expired Docs' | 'Ready to Use';

export type TruckStatusVariant = 'blue' | 'amber' | 'red' | 'green';

export interface TruckStatusInfo {
  status: TruckStatus;
  variant: TruckStatusVariant;
}

interface DocumentMetadata {
  registrationNumber?: string;
  registrationExpiry?: string;
  insuranceNumber?: string;
  insuranceExpiry?: string;
}

/** Minimal shape of related data expected by computeTruckStatus. */
export interface TruckWithRelations {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string;
  odometer: number;
  isSample?: boolean;
  inMaintenance?: boolean;
  documentMetadata?: unknown;
  tenantId: string;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  /** Active routes assigned to this truck (pre-filtered to IN_PROGRESS, non-archived). */
  assignedRoutes: { id: string; status: string }[];
  /** Active loads assigned to this truck (pre-filtered to DISPATCHED/PICKED_UP/IN_TRANSIT). */
  loads: { id: string; status: string }[];
  /** Pending scheduled services (pre-filtered to isCompleted === false). Must include due-date fields. */
  scheduledServices: {
    id: string;
    baselineDate: Date;
    intervalDays: number | null;
    intervalMiles: number | null;
    baselineOdometer: number;
  }[];
  /** Documents with an expiry date (pre-filtered to expiryDate not null). */
  documents: { id: string; expiryDate: Date | null }[];
  /** Optional audit relations (present on detail page). */
  createdBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  updatedBy?: { firstName: string | null; lastName: string | null; email: string } | null;
}

/**
 * Determine if a scheduled service is currently overdue.
 *
 * A service is overdue when:
 *   - intervalDays is set AND baselineDate + intervalDays <= now, OR
 *   - intervalMiles is set AND baselineOdometer + intervalMiles <= truck.odometer
 */
function isServiceOverdue(
  service: TruckWithRelations['scheduledServices'][number],
  truckOdometer: number
): boolean {
  const now = new Date();

  if (service.intervalDays !== null) {
    const dueDate = new Date(service.baselineDate);
    dueDate.setDate(dueDate.getDate() + service.intervalDays);
    if (dueDate <= now) return true;
  }

  if (service.intervalMiles !== null) {
    const dueMileage = service.baselineOdometer + service.intervalMiles;
    if (dueMileage <= truckOdometer) return true;
  }

  return false;
}

/**
 * Returns true if documentMetadata contains a registrationExpiry or insuranceExpiry
 * date string that is in the past (i.e. expired). Invalid or missing date strings are
 * safely ignored.
 */
function hasExpiredMetadataDate(
  documentMetadata: DocumentMetadata | null | undefined
): boolean {
  if (!documentMetadata) return false;

  for (const field of ['registrationExpiry', 'insuranceExpiry'] as const) {
    const value = documentMetadata[field];
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime()) && date < new Date()) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Compute the operational status of a truck from its related data.
 *
 * @param truck - Truck with pre-fetched relations (routes, loads, services, documents).
 * @returns A TruckStatusInfo containing the human-readable status and badge variant colour.
 */
export function computeTruckStatus(truck: TruckWithRelations): TruckStatusInfo {
  // 1. In Use — truck has an active route OR an active load
  const isInUse =
    (truck.assignedRoutes?.length ?? 0) > 0 || (truck.loads?.length ?? 0) > 0;

  if (isInUse) {
    return { status: 'In Use', variant: 'blue' };
  }

  // 2a. In Maintenance — manual override
  if (truck.inMaintenance) {
    return { status: 'In Maintenance', variant: 'amber' };
  }

  // 2b. In Maintenance — truck has at least one OVERDUE scheduled service
  const isInMaintenance = (truck.scheduledServices ?? []).some((service) =>
    isServiceOverdue(service, truck.odometer)
  );

  if (isInMaintenance) {
    return { status: 'In Maintenance', variant: 'amber' };
  }

  // 3. Expired Docs — at least one document has passed its expiry date,
  //    OR a documentMetadata expiry date (registration/insurance) is in the past
  const now = new Date();
  const hasExpiredDocs =
    (truck.documents ?? []).some(
      (doc) => doc.expiryDate !== null && doc.expiryDate < now
    ) || hasExpiredMetadataDate(truck.documentMetadata as DocumentMetadata | null);

  if (hasExpiredDocs) {
    return { status: 'Expired Docs', variant: 'red' };
  }

  // 4. Default — truck is available
  return { status: 'Ready to Use', variant: 'green' };
}
