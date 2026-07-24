// Pure, framework-free helper that maps a Trip/Dispatch status to per-field
// edit permissions. This is the SINGLE source of truth for the
// planned/in_progress/locked edit rule — used by the desktop header, the
// mobile trip screen, and the server (updateTrip) so all three can never
// disagree again (TKT-0086).
//
// Rule:
//  - completed / cancelled / tonu -> record is fully locked, every field
//    read-only, with a status-specific lockReason.
//  - in_progress -> record IS editable; every field is editable EXCEPT
//    routeTemplateId (changing it deletes + recreates every stop, which is
//    destructive on a running trip).
//  - planned -> fully editable, no reasons.
//  - any UNKNOWN status -> treated exactly like planned (fully editable).
//    This preserves today's behavior (an unexpected status value must never
//    make a trip un-editable) rather than introducing a new failure mode.

export const DISPATCH_EDITABLE_FIELDS = [
  'routeTemplateId',
  'primaryDriverId',
  'coDriverId',
  'truckId',
  'scheduledDeparture',
  'scheduledArrival',
  'plannedMiles',
  'actualMiles',
  'notes',
] as const;

export type DispatchEditableField = (typeof DISPATCH_EDITABLE_FIELDS)[number];

export interface DispatchFieldState {
  editable: boolean;
  reason: string | null;
}

export interface DispatchEditability {
  /** False for completed / cancelled / tonu — the whole record is read-only. */
  canEdit: boolean;
  /** Why the record is locked, for the Edit button title. Null when canEdit. */
  lockReason: string | null;
  fields: Record<DispatchEditableField, DispatchFieldState>;
}

const LOCK_REASONS: Record<string, string> = {
  completed: "A completed trip can't be edited.",
  cancelled: "A cancelled trip can't be edited.",
  tonu: "A trip marked TONU can't be edited.",
};

const ROUTE_TEMPLATE_LOCK_REASON =
  'Changing the route template replaces every stop on the trip — only available before it starts.';

function allFields(state: DispatchFieldState): Record<DispatchEditableField, DispatchFieldState> {
  return DISPATCH_EDITABLE_FIELDS.reduce(
    (acc, field) => {
      acc[field] = state;
      return acc;
    },
    {} as Record<DispatchEditableField, DispatchFieldState>
  );
}

export function dispatchFieldEditability(status: string): DispatchEditability {
  const lockReason = LOCK_REASONS[status];
  if (lockReason) {
    return {
      canEdit: false,
      lockReason,
      fields: allFields({ editable: false, reason: lockReason }),
    };
  }

  if (status === 'in_progress') {
    return {
      canEdit: true,
      lockReason: null,
      fields: {
        ...allFields({ editable: true, reason: null }),
        routeTemplateId: { editable: false, reason: ROUTE_TEMPLATE_LOCK_REASON },
      },
    };
  }

  // 'planned' and any unknown status -> fully editable (see comment at top).
  return {
    canEdit: true,
    lockReason: null,
    fields: allFields({ editable: true, reason: null }),
  };
}

/** Payload keys the server must drop for this status. Derived from the same map. */
export function lockedDispatchUpdateFields(status: string): DispatchEditableField[] {
  const editability = dispatchFieldEditability(status);
  return DISPATCH_EDITABLE_FIELDS.filter((field) => !editability.fields[field].editable);
}
