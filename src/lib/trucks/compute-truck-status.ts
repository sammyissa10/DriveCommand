/**
 * Pure utility for computing a truck's operational status from its related data.
 * No DB calls — accepts already-fetched data and returns the derived status.
 *
 * Priority order (highest wins):
 *   1. In Use        — active route or active load
 *   2. In Maintenance — pending scheduled service
 *   3. Expired Docs  — at least one document past its expiry date
 *   4. Ready to Use  — none of the above
 */

export type TruckStatus = 'In Use' | 'In Maintenance' | 'Expired Docs' | 'Ready to Use';

export type TruckStatusVariant = 'blue' | 'amber' | 'red' | 'green';

export interface TruckStatusInfo {
  status: TruckStatus;
  variant: TruckStatusVariant;
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
  /** Pending scheduled services (pre-filtered to isCompleted === false). */
  scheduledServices: { id: string }[];
  /** Documents with an expiry date (pre-filtered to expiryDate not null). */
  documents: { id: string; expiryDate: Date | null }[];
  /** Optional audit relations (present on detail page). */
  createdBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  updatedBy?: { firstName: string | null; lastName: string | null; email: string } | null;
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

  // 2. In Maintenance — truck has at least one pending scheduled service
  const isInMaintenance = (truck.scheduledServices?.length ?? 0) > 0;

  if (isInMaintenance) {
    return { status: 'In Maintenance', variant: 'amber' };
  }

  // 3. Expired Docs — at least one document has passed its expiry date
  const now = new Date();
  const hasExpiredDocs = (truck.documents ?? []).some(
    (doc) => doc.expiryDate !== null && doc.expiryDate < now
  );

  if (hasExpiredDocs) {
    return { status: 'Expired Docs', variant: 'red' };
  }

  // 4. Default — truck is available
  return { status: 'Ready to Use', variant: 'green' };
}
