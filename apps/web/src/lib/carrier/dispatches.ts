// DEPRECATED: Use trips.ts instead. This file exists for backward compatibility.
// CarrierDispatch model was renamed to Trip in quick-403 for better semantic clarity.
// The database table remains "dispatches" (via @@map), so this is a code-only change.

export * from './trips';

// Aliases for gradual migration
export { listTrips as listDispatches } from './trips';
export { getTrip as getDispatch } from './trips';
export { createTrip as createDispatch } from './trips';
export { updateTrip as updateDispatch } from './trips';
export { transitionTripStatus as transitionDispatchStatus } from './trips';

// Type aliases
export type { ListTripsFilters as ListDispatchesFilters } from './trips';
export type { TripCreateInput as DispatchCreateInput } from './trips';
export type { TripUpdateInput as DispatchUpdateInput } from './trips';
