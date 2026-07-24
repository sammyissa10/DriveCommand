/** Minimal structural shape shared by RouteForm and RouteCreateMobile waypoints. */
export interface WaypointLike {
  clientId: string;
  type: 'PICKUP' | 'DELIVERY';
}

export const MIN_WAYPOINTS = 2; // a route always needs an origin + a destination

/** A row may be removed only while more than MIN_WAYPOINTS rows exist. */
export function canRemoveWaypoint<T extends WaypointLike>(waypoints: T[]): boolean {
  return waypoints.length > MIN_WAYPOINTS;
}

/**
 * Remove the row with `clientId`, then normalize endpoints so the list stays valid:
 * first row -> type 'PICKUP' (Origin), last row -> type 'DELIVERY' (Destination).
 * Removing the LAST row promotes the previous row to Destination; removing the FIRST
 * row promotes the next row to Origin. Returns the SAME array reference when the
 * removal is refused (length <= MIN_WAYPOINTS) or `clientId` is not found, so callers
 * can use it directly inside a setState updater with no extra render.
 */
export function removeWaypointById<T extends WaypointLike>(waypoints: T[], clientId: string): T[] {
  if (waypoints.length <= MIN_WAYPOINTS) return waypoints;

  const next = waypoints.filter((w) => w.clientId !== clientId);
  if (next.length === waypoints.length) return waypoints; // clientId not found

  return next.map((w, idx) => {
    if (idx === 0 && w.type !== 'PICKUP') return { ...w, type: 'PICKUP' };
    if (idx === next.length - 1 && w.type !== 'DELIVERY') return { ...w, type: 'DELIVERY' };
    return w;
  });
}
