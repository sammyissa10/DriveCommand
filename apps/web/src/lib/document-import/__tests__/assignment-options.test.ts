/**
 * quick-563 — the assignment pickers' option mapping.
 *
 * WHAT IS WORTH TESTING HERE, and what is not. Rendering a cmdk popover proves
 * that `SearchableSelect` works, which is not in doubt — it has been in
 * `DispatchLoadModal` for four pickers. What IS in doubt is the mapping, and it
 * carries three decisions that are easy to get wrong in a way nothing would
 * notice:
 *
 *   1. A BLOCKED OPTION MUST NEVER WEAR A GREEN BADGE. The old flat rows carried
 *      a red warning triangle; a select carries a badge, and the badge is
 *      derived rather than given. Getting it wrong tells a dispatcher a truck
 *      whose insurance lapsed is "Ready".
 *   2. PICKABLE OPTIONS MUST SORT ABOVE UNPICKABLE ONES. `sortByStatus` alone
 *      does the opposite for one real pair: "On Trip" outranks "Not Ready", and
 *      "On Trip" is the one that cannot be chosen.
 *   3. `disabled` MUST STAY `blocked && !selected` — quick-561. A blanket
 *      `disabled` strands a selection that went bad when the start time moved,
 *      and on a `CommandItem` (`pointer-events-none`) that is a one-way door.
 *
 * The meta strings are asserted character for character against what
 * `PickerRow` used to render, because "preserve every piece of information shown
 * inline" is the requirement this whole change is under.
 */

import { describe, expect, it } from 'vitest';
import {
  driverBadge,
  driverMeta,
  driverOptions,
  selectedDriver,
  selectedTruck,
  truckBadge,
  truckMeta,
  truckOptions,
} from '../assignment-options';
import type { DriverOption, TruckOption } from '../commit-service';

function driver(over: Partial<DriverOption> = {}): DriverOption {
  return {
    id: 'd1',
    name: 'Marcus Webb',
    availabilityLabel: 'Available',
    assignedToday: false,
    hoursLabel: '6h 30m left',
    complianceFlags: [],
    blocked: false,
    ...over,
  };
}

function truck(over: Partial<TruckOption> = {}): TruckOption {
  return {
    id: 't1',
    unitNumber: '104',
    label: '104 — Freightliner Cascadia',
    status: 'active',
    assignedToday: false,
    complianceFlags: [],
    blocked: false,
    ...over,
  };
}

/** The eight `STATUS_CONFIG` keys that render green. Nothing blocked may use one. */
const GREEN = new Set(['available', 'dispatch_ready', 'ready_to_use']);

describe('the meta line is unchanged from the flat rows', () => {
  it('driver: availability · hours, and the flags when there are any', () => {
    expect(driverMeta(driver())).toBe('Available · 6h 30m left');
    expect(
      driverMeta(
        driver({
          availabilityLabel: 'On a trip that day',
          assignedToday: true,
          hoursLabel: 'No HOS log',
          complianceFlags: ['CDL expired'],
        }),
      ),
    ).toBe('On a trip that day · No HOS log · CDL expired');
  });

  it('truck: availability, and the flags when there are any', () => {
    expect(truckMeta(truck())).toBe('Available');
    expect(truckMeta(truck({ assignedToday: true }))).toBe('On a trip that day');
    expect(
      truckMeta(truck({ complianceFlags: ['Registration expired', 'Insurance expired'] })),
    ).toBe('Available · Registration expired · Insurance expired');
  });

  it('the option and the selection summary read from the same function', () => {
    // If these two ever diverge, a dispatcher sees one sentence in the open list
    // and a different one under the closed picker for the same driver.
    const d = driver({ complianceFlags: ['CDL expiring soon'] });
    const [opt] = driverOptions([d], null);
    expect(selectedDriver([d], 'd1')?.meta).toBe(opt.secondaryLabel);

    const t = truck({ complianceFlags: ['In the shop'] });
    const [topt] = truckOptions([t], null);
    expect(selectedTruck([t], 't1')?.meta).toBe(topt.secondaryLabel);
  });
});

describe('a blocked option never wears a green badge', () => {
  const blockedDrivers: DriverOption[] = [
    driver({ blocked: true, complianceFlags: ['CDL expired'] }),
    driver({ blocked: true, assignedToday: true, availabilityLabel: 'On a trip that day' }),
    driver({
      blocked: true,
      assignedToday: true,
      availabilityLabel: 'On a trip that day',
      complianceFlags: ['CDL expired'],
    }),
  ];

  const blockedTrucks: TruckOption[] = [
    truck({ blocked: true, status: 'out_of_service', complianceFlags: ['Out of service'] }),
    truck({ blocked: true, status: 'maintenance', complianceFlags: ['In the shop'] }),
    truck({ blocked: true, status: 'inactive', complianceFlags: ['Inactive'] }),
    truck({ blocked: true, complianceFlags: ['Insurance expired'] }),
    truck({ blocked: true, assignedToday: true }),
  ];

  it.each(blockedDrivers.map((d, i) => [i, d] as const))('driver case %i', (_i, d) => {
    expect(GREEN.has(driverBadge(d))).toBe(false);
  });

  it.each(blockedTrucks.map((t, i) => [i, t] as const))('truck case %i', (_i, t) => {
    expect(GREEN.has(truckBadge(t))).toBe(false);
  });

  it('and a clear option DOES — otherwise the case above passes by saying nothing', () => {
    expect(driverBadge(driver())).toBe('available');
    expect(truckBadge(truck())).toBe('ready_to_use');
  });
});

describe('the badge names the fact the server stated', () => {
  it('a non-blocking flag is amber and still pickable', () => {
    const d = driver({ complianceFlags: ['CDL expiring soon'], blocked: false });
    expect(driverBadge(d)).toBe('not_ready');
    expect(driverOptions([d], null)[0].disabled).toBe(false);
  });

  it('truck status outranks the generic blocked fallback', () => {
    expect(truckBadge(truck({ status: 'maintenance', blocked: true }))).toBe('in_maintenance');
    expect(truckBadge(truck({ status: 'inactive', blocked: true }))).toBe('inactive');
    // Status is ordinary; the only thing left that blocks is an expiry.
    expect(truckBadge(truck({ status: 'active', blocked: true }))).toBe('expired_docs');
  });

  it('an unrecognised future blocker fails safe into red rather than green', () => {
    // The point of the fallback: a blocker this file has never heard of must not
    // come out "Ready".
    expect(truckBadge(truck({ status: 'something_new', blocked: true }))).toBe('expired_docs');
    expect(driverBadge(driver({ blocked: true }))).toBe('expired_docs');
  });
});

describe('pickable sorts above unpickable', () => {
  it('the pair that status priority alone gets backwards', () => {
    // "On Trip" is priority 50 in STATUS_CONFIG and "Not Ready" is 20, but the
    // on-a-trip driver cannot be chosen and the CDL-expiring-soon one can.
    const onTrip = driver({
      id: 'busy',
      assignedToday: true,
      availabilityLabel: 'On a trip that day',
      blocked: true,
    });
    const soon = driver({ id: 'soon', complianceFlags: ['CDL expiring soon'] });

    const [busyOpt, soonOpt] = driverOptions([onTrip, soon], null);
    expect(soonOpt.sortPriority!).toBeGreaterThan(busyOpt.sortPriority!);
  });

  it('and among pickable options the better badge still wins', () => {
    const clear = driver({ id: 'clear' });
    const soon = driver({ id: 'soon', complianceFlags: ['CDL expiring soon'] });
    const [clearOpt, soonOpt] = driverOptions([clear, soon], null);
    expect(clearOpt.sortPriority!).toBeGreaterThan(soonOpt.sortPriority!);
  });
});

describe('quick-561 — blocked && !selected, never a blanket disabled', () => {
  it('a blocked option that is NOT selected is disabled', () => {
    const d = driver({ blocked: true });
    expect(driverOptions([d], null)[0].disabled).toBe(true);
  });

  it('a blocked option that IS selected stays live so it can be changed', () => {
    // The regression this guards: availability re-fetches per planned day, so a
    // selection legal when it was made goes blocked when the start time moves.
    // Disabled here, on a `pointer-events-none` CommandItem, is a one-way door.
    const d = driver({ blocked: true });
    expect(driverOptions([d], 'd1')[0].disabled).toBe(false);

    const t = truck({ blocked: true });
    expect(truckOptions([t], 't1')[0].disabled).toBe(false);
  });

  it('the summary marks it instead, which is how a dispatcher sees it went bad', () => {
    expect(selectedDriver([driver({ blocked: true })], 'd1')).toEqual({
      label: 'Marcus Webb',
      meta: 'Available · 6h 30m left',
      blocked: true,
    });
  });
});

describe('the option carries what the picker needs', () => {
  it('value, label and the status the badge is drawn from', () => {
    const [opt] = truckOptions([truck()], null);
    expect(opt.value).toBe('t1');
    expect(opt.label).toBe('104 — Freightliner Cascadia');
    expect(opt.status).toBe('ready_to_use');
  });

  it('nothing selected yields no summary at all', () => {
    expect(selectedDriver([driver()], null)).toBeNull();
    expect(selectedTruck([truck()], undefined)).toBeNull();
  });
});
