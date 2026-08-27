/**
 * The assignment screen's pickers, expressed as `SearchableSelect` options.
 *
 * WHY THIS IS A MODULE AND NOT INLINE JSX. Two of the three things here are
 * judgement calls that a test should be able to hold — which badge a blocked
 * option gets, and what order the list comes out in — and neither is assertable
 * through a rendered popover without mounting cmdk. The component below stays a
 * consumer; the decisions live here.
 *
 * ---------------------------------------------------------------------------
 * WHAT `SearchableSelect` CAN AND CANNOT EXPRESS, established before building
 * ---------------------------------------------------------------------------
 * `SearchableSelectOption` is `{ value, label, status?, secondaryLabel?,
 * disabled?, sortPriority? }`. Three consequences shaped everything below:
 *
 *   1. THE TRIGGER SHOWS `label` AND NOTHING ELSE.
 *      `<span className="truncate">{selectedOption.label}</span>` — no badge, no
 *      `secondaryLabel`. So collapsing a list into a select DELETES the
 *      availability, hours and compliance text for the option a dispatcher has
 *      actually chosen, which is the one they most need it for. That is why the
 *      screen grew a selection summary: it is not decoration, it is how the
 *      "preserve every piece of information shown inline" requirement survives
 *      the collapse.
 *
 *   2. `showStatus` IS ONLY PRETTY FOR THE EIGHT KEYS IN `STATUS_CONFIG`.
 *      `getStatusConfig` falls back to `{ label: status, className: <grey> }`,
 *      so passing a carrier truck's raw `status` renders the literal
 *      `out_of_service` in grey — snake_case on screen, and grey for a truck
 *      that must not roll. Every status below is therefore MAPPED to a known
 *      key, never passed through.
 *
 *   3. SEARCH MATCHES `label` ONLY.
 *      `<CommandItem value={option.label}>` is what cmdk filters on, and
 *      `SearchableSelect` does not forward cmdk's `keywords`. So a dispatcher
 *      can search "Webb" or "Cascadia" but not "expired". Stated as a limit
 *      rather than worked around: the fix is a prop on the shared component,
 *      which has another consumer (`DispatchLoadModal`) and is out of scope
 *      here.
 *
 * Nothing else the screen needs is missing, so the component fits.
 */

import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import type { DriverOption, TruckOption } from '@/lib/document-import/commit-service';

/**
 * Ranked above every blocked option, whatever their badges say.
 *
 * `sortByStatus` orders by `sortPriority ?? statusPriority`, descending. Status
 * priority alone gets this wrong: "On Trip" is 50 and "Not Ready" is 20, but an
 * on-a-trip driver CANNOT be picked and a CDL-expiring-soon driver CAN. So
 * pickability is the primary key and the badge's own priority is the tiebreak.
 */
const SELECTABLE_RANK = 1000;

/** `STATUS_CONFIG`'s priorities, restated only for the keys used here. */
const BADGE_RANK: Record<string, number> = {
  available: 100,
  ready_to_use: 100,
  on_trip: 50,
  in_use: 50,
  not_ready: 20,
  in_maintenance: 20,
  expired_docs: 10,
  inactive: 10,
};

// ---------------------------------------------------------------------------
// The inline text, unchanged
// ---------------------------------------------------------------------------

/**
 * The driver row's `meta`, character for character as `PickerRow` rendered it.
 *
 * Kept as one function used by BOTH the option's `secondaryLabel` and the
 * selection summary, so the collapsed picker and the summary can never describe
 * the same driver differently.
 */
export function driverMeta(d: DriverOption): string {
  const base = `${d.availabilityLabel} · ${d.hoursLabel}`;
  return d.complianceFlags.length > 0 ? `${base} · ${d.complianceFlags.join(' · ')}` : base;
}

/** The truck row's `meta`, likewise unchanged from `TruckPickerRow`. */
export function truckMeta(t: TruckOption): string {
  const base = t.assignedToday ? 'On a trip that day' : 'Available';
  return t.complianceFlags.length > 0 ? `${base} · ${t.complianceFlags.join(' · ')}` : base;
}

// ---------------------------------------------------------------------------
// The badge
// ---------------------------------------------------------------------------

/**
 * Which badge a driver gets.
 *
 * DERIVED FROM FACTS THE SERVER STATES AS DATA — `assignedToday`,
 * `complianceFlags.length`, `blocked` — and never by re-reading the flag STRINGS
 * to work out which of them blocks. `validateCommit` owns that, and this file
 * changes nothing about it.
 *
 * A KNOWN IMPRECISION, stated rather than hidden. A driver who is both on a trip
 * and carrying an expired CDL shows "On Trip", not "Expired Docs": the server
 * hands down one `blocked` boolean and two independent facts, and telling those
 * two blocking reasons apart would mean re-deriving the verdict from flag text.
 * Nothing is lost — `secondaryLabel` and the summary both read
 * "On a trip that day · 6h 30m left · CDL expired" in full — and the option is
 * disabled either way, so no wrong action is ever enabled. The badge names the
 * first reason; the sentence names all of them.
 */
export function driverBadge(d: DriverOption): string {
  if (d.assignedToday) return 'on_trip';
  // Not on a trip and still blocked: on this server the only remaining driver
  // blocker is an expired CDL. A new one would land here too — red and
  // disabled, which is the safe direction — and its words appear in the meta.
  if (d.blocked) return 'expired_docs';
  // A flag that does NOT block: "CDL expiring soon". Amber, and still pickable.
  if (d.complianceFlags.length > 0) return 'not_ready';
  return 'available';
}

/**
 * Which badge a truck gets.
 *
 * `TruckOption.status` is the carrier truck's own column and is checked FIRST,
 * because it is the most specific thing the server says. `blocked` is the last
 * resort, covering the two expiries — and covering any future blocker by
 * failing safe into red.
 */
export function truckBadge(t: TruckOption): string {
  if (t.status === 'inactive') return 'inactive';
  if (t.status === 'out_of_service' || t.status === 'maintenance') return 'in_maintenance';
  if (t.assignedToday) return 'in_use';
  if (t.blocked) return 'expired_docs';
  return 'ready_to_use';
}

// ---------------------------------------------------------------------------
// The options
// ---------------------------------------------------------------------------

/**
 * `disabled` is `blocked && !selected`, NOT `blocked` — quick-561, preserved.
 *
 * These pickers re-fetch on every change because availability is a function of
 * the planned day, so an option that was legal when it was picked becomes
 * blocked when the start time moves. A blanket `disabled` would leave that
 * selection on screen and unremovable. Keeping the selected row live is what
 * lets it always be changed, or — for the optional trailer — toggled off.
 *
 * It also matters more here than it did before, not less: `SearchableSelect`
 * routes every change through `onSelect` on the option itself, and a disabled
 * `CommandItem` carries `pointer-events-none`. Disabling the current selection
 * would make the picker a one-way door.
 */
function optionFor(
  id: string,
  label: string,
  meta: string,
  badge: string,
  blocked: boolean,
  selected: boolean,
): SearchableSelectOption {
  return {
    value: id,
    label,
    secondaryLabel: meta,
    status: badge,
    disabled: blocked && !selected,
    sortPriority: (blocked ? 0 : SELECTABLE_RANK) + (BADGE_RANK[badge] ?? 0),
  };
}

export function driverOptions(
  drivers: DriverOption[],
  /** `AssignmentInput.trailerId` is optional, so `undefined` is a real input here. */
  selectedId: string | null | undefined,
): SearchableSelectOption[] {
  return drivers.map((d) =>
    optionFor(d.id, d.name, driverMeta(d), driverBadge(d), d.blocked, d.id === selectedId),
  );
}

export function truckOptions(
  trucks: TruckOption[],
  /** `AssignmentInput.trailerId` is optional, so `undefined` is a real input here. */
  selectedId: string | null | undefined,
): SearchableSelectOption[] {
  return trucks.map((t) =>
    optionFor(t.id, t.label, truckMeta(t), truckBadge(t), t.blocked, t.id === selectedId),
  );
}

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

/**
 * What a collapsed picker can no longer say about the option it is showing.
 *
 * `blocked` is carried so the summary can mark a selection that WENT bad after
 * it was made — the visible half of quick-561's guard. The option stays
 * selectable so it can be changed; this is where a dispatcher sees that it
 * needs to be.
 */
export interface AssignmentSelection {
  label: string;
  meta: string;
  blocked: boolean;
}

export function selectedDriver(
  drivers: DriverOption[],
  /** `AssignmentInput.trailerId` is optional, so `undefined` is a real input here. */
  selectedId: string | null | undefined,
): AssignmentSelection | null {
  const d = drivers.find((x) => x.id === selectedId);
  return d ? { label: d.name, meta: driverMeta(d), blocked: d.blocked } : null;
}

export function selectedTruck(
  trucks: TruckOption[],
  /** `AssignmentInput.trailerId` is optional, so `undefined` is a real input here. */
  selectedId: string | null | undefined,
): AssignmentSelection | null {
  const t = trucks.find((x) => x.id === selectedId);
  return t ? { label: t.label, meta: truckMeta(t), blocked: t.blocked } : null;
}
