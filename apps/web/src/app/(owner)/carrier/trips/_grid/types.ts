/**
 * Types for Trips DataGrid
 *
 * The row shape is defined once, next to the payload it is built from, in
 * `lib/carrier/trip-list-row.ts` — see quick-557 for why the two must share a
 * vocabulary rather than translate between one another.
 */

export type { TripListRow as DispatchRow } from '@/lib/carrier/trip-list-row';
