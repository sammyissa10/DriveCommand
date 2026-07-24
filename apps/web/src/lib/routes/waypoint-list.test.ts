import { describe, expect, it } from 'vitest';
import { canRemoveWaypoint, MIN_WAYPOINTS, removeWaypointById, type WaypointLike } from './waypoint-list';

interface TestWaypoint extends WaypointLike {
  label: string;
}

function wp(clientId: string, type: 'PICKUP' | 'DELIVERY', label: string): TestWaypoint {
  return { clientId, type, label };
}

describe('removeWaypointById', () => {
  it('removes a middle stop, preserving order and destination as last', () => {
    const list = [
      wp('o', 'PICKUP', 'O'),
      wp('s1', 'PICKUP', 'S1'),
      wp('s2', 'PICKUP', 'S2'),
      wp('d', 'DELIVERY', 'D'),
    ];
    const result = removeWaypointById(list, 's1');
    expect(result.map((w) => w.label)).toEqual(['O', 'S2', 'D']);
    expect(result[result.length - 1].type).toBe('DELIVERY');
  });

  it('removing the LAST row promotes the previous row to Destination (TKT-0083 case)', () => {
    const list = [wp('o', 'PICKUP', 'O'), wp('s1', 'PICKUP', 'S1'), wp('d', 'DELIVERY', 'D')];
    const result = removeWaypointById(list, 'd');
    expect(result.map((w) => w.label)).toEqual(['O', 'S1']);
    expect(result[result.length - 1].type).toBe('DELIVERY');
    expect(result[0].type).toBe('PICKUP');
  });

  it('removing the FIRST row promotes the next row to Origin', () => {
    const list = [wp('o', 'PICKUP', 'O'), wp('s1', 'PICKUP', 'S1'), wp('d', 'DELIVERY', 'D')];
    const result = removeWaypointById(list, 'o');
    expect(result.map((w) => w.label)).toEqual(['S1', 'D']);
    expect(result[0].type).toBe('PICKUP');
    expect(result[result.length - 1].type).toBe('DELIVERY');
  });

  it('is a no-op at the 2-row floor and returns the SAME reference', () => {
    const list = [wp('o', 'PICKUP', 'O'), wp('d', 'DELIVERY', 'D')];
    expect(removeWaypointById(list, 'o')).toBe(list);
    expect(removeWaypointById(list, 'd')).toBe(list);
  });

  it('returns the SAME reference for an unknown clientId', () => {
    const list = [wp('o', 'PICKUP', 'O'), wp('s1', 'PICKUP', 'S1'), wp('d', 'DELIVERY', 'D')];
    expect(removeWaypointById(list, 'nope')).toBe(list);
  });

  it('does not mutate the input array or its objects', () => {
    const list = [wp('o', 'PICKUP', 'O'), wp('s1', 'PICKUP', 'S1'), wp('d', 'DELIVERY', 'D')];
    const snapshot = list.map((w) => ({ ...w }));
    removeWaypointById(list, 'd');
    expect(list).toEqual(snapshot);
  });

  it('keeps stop indices contiguous after removal (no index gaps)', () => {
    const list = [
      wp('o', 'PICKUP', 'O'),
      wp('s1', 'PICKUP', 'S1'),
      wp('s2', 'PICKUP', 'S2'),
      wp('s3', 'PICKUP', 'S3'),
      wp('d', 'DELIVERY', 'D'),
    ];
    const result = removeWaypointById(list, 's1');
    const fieldNames = result.slice(1, -1).map((_, k) => `stops_${k}_address`);
    expect(fieldNames).toEqual(['stops_0_address', 'stops_1_address']);
  });
});

describe('canRemoveWaypoint', () => {
  it('is false at MIN_WAYPOINTS (2)', () => {
    const list = [wp('o', 'PICKUP', 'O'), wp('d', 'DELIVERY', 'D')];
    expect(list.length).toBe(MIN_WAYPOINTS);
    expect(canRemoveWaypoint(list)).toBe(false);
  });

  it('is true at 3 rows', () => {
    const list = [wp('o', 'PICKUP', 'O'), wp('s1', 'PICKUP', 'S1'), wp('d', 'DELIVERY', 'D')];
    expect(canRemoveWaypoint(list)).toBe(true);
  });
});
