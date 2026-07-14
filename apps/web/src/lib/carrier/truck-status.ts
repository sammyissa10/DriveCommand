/**
 * Single source of truth for a carrier truck's design-system display status.
 * Used by BOTH the Trucks Overview and the Truck Detail page so the status pill
 * is computed identically everywhere (see mobile-design-system §6).
 *
 * A truck is "On Load" when it has a currently-running dispatch. The dispatch
 * status vocabulary in this system is: planned | in_progress | completed |
 * cancelled — there is no `in_transit`. Only `in_progress` means the truck is
 * actually out on a load right now; `planned` is a future assignment (still
 * Ready). Earlier code filtered by the non-existent `in_transit`, which both
 * missed trucks actively hauling and over-counted trucks with future plans.
 */

export const ACTIVE_DISPATCH_STATUSES = ['in_progress'] as const;

export type TruckDisplayStatus = 'ready' | 'on_load' | 'in_shop' | 'out_of_service' | 'inactive';

function isActive(status: string): boolean {
  return (ACTIVE_DISPATCH_STATUSES as readonly string[]).includes(status);
}

/**
 * Map stored status + the truck's dispatch statuses to the display status.
 * Stored maintenance/out_of_service/inactive win; otherwise On Load iff any
 * dispatch is in progress, else Ready.
 */
export function computeTruckDisplayStatus(
  storedStatus: string,
  dispatchStatuses: string[],
): TruckDisplayStatus {
  if (storedStatus === 'maintenance') return 'in_shop';
  if (storedStatus === 'out_of_service') return 'out_of_service';
  if (storedStatus === 'inactive') return 'inactive';
  return dispatchStatuses.some(isActive) ? 'on_load' : 'ready';
}
