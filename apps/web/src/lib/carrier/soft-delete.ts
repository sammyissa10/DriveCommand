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
