export const SOFT_DELETE_RETENTION_DAYS = 30;
export const UNDO_TOAST_DURATION_MS = 8000;

export type SoftDeletableEntity =
  | 'CarrierClient'
  | 'CarrierContract'
  | 'CarrierDriver'
  | 'CarrierTruck'
  | 'Route'
  | 'Trip'
  | 'CarrierLoad'
  // CarrierFacility is the one member whose table has NO `deleted_by_id`
  // column (quick-530 added `deleted_at` alone). `softDeleteRecords` and
  // `restoreRecords` therefore omit `deletedById` for this member only —
  // see the comment at those sites before adding a ninth entity.
  | 'CarrierFacility';

export const ENTITY_DISPLAY_NAMES: Record<SoftDeletableEntity, string> = {
  CarrierClient: 'Client',
  CarrierContract: 'Contract',
  CarrierDriver: 'Driver',
  CarrierTruck: 'Truck',
  Route: 'Route',
  Trip: 'Trip',
  CarrierLoad: 'Load',
  CarrierFacility: 'Facility',
};

export const ENTITY_PLURAL_NAMES: Record<SoftDeletableEntity, string> = {
  CarrierClient: 'Clients',
  CarrierContract: 'Contracts',
  CarrierDriver: 'Drivers',
  CarrierTruck: 'Trucks',
  Route: 'Routes',
  Trip: 'Trips',
  CarrierLoad: 'Loads',
  CarrierFacility: 'Facilities',
};

/**
 * Which soft-deletable tables actually carry a `deleted_by_id` column.
 *
 * This is not a preference — it is a fact about the schema, verified against
 * production `information_schema.columns`. `facilities` got `deleted_at` alone
 * in quick-530; every other member of the union has both columns.
 *
 * It exists as a `Record<SoftDeletableEntity, boolean>` rather than an
 * `entityType === 'CarrierFacility'` check at the two mutation sites because
 * the delegates in `actions/carrier/soft-delete.ts` are reached through
 * `(model as any)`, which means a column name that does not exist is a RUNTIME
 * Prisma error, not a compile error. This map is the only part of that path a
 * type-checker can still police: adding a ninth entity fails the build until
 * someone states which kind it is.
 */
export const HAS_DELETED_BY: Record<SoftDeletableEntity, boolean> = {
  CarrierClient: true,
  CarrierContract: true,
  CarrierDriver: true,
  CarrierTruck: true,
  Route: true,
  Trip: true,
  CarrierLoad: true,
  CarrierFacility: false,
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
