import { describe, it, expect } from 'vitest';
import { computeRouteProgress, RouteStopInput } from '../computeRouteProgress';

describe('computeRouteProgress', () => {
  it('returns defaults for empty stops array', () => {
    const result = computeRouteProgress([]);
    expect(result).toEqual({
      truckPosition: 0,
      completedStops: 0,
      totalStops: 0,
      currentStopIndex: -1,
      exceptionCount: 0,
    });
  });

  it('returns truckPosition=1 when all stops completed', () => {
    const stops: RouteStopInput[] = [
      { id: '1', status: 'COMPLETED', position: 0 },
      { id: '2', status: 'COMPLETED', position: 1 },
      { id: '3', status: 'COMPLETED', position: 2 },
    ];
    const result = computeRouteProgress(stops);
    expect(result.truckPosition).toBe(1);
    expect(result.completedStops).toBe(3);
    expect(result.currentStopIndex).toBe(-1);
  });

  it('positions truck at IN_PROGRESS stop correctly', () => {
    const stops: RouteStopInput[] = [
      { id: '1', status: 'COMPLETED', position: 0 },
      { id: '2', status: 'IN_PROGRESS', position: 1 },
      { id: '3', status: 'PENDING', position: 2 },
      { id: '4', status: 'PENDING', position: 3 },
    ];
    const result = computeRouteProgress(stops);
    // Truck is at index 1, out of 3 segments (0-3)
    expect(result.truckPosition).toBe(1 / 3);
    expect(result.currentStopIndex).toBe(1);
    expect(result.completedStops).toBe(1);
  });

  it('handles mixed states correctly', () => {
    const stops: RouteStopInput[] = [
      { id: '1', status: 'COMPLETED', position: 0 },
      { id: '2', status: 'COMPLETED', position: 1 },
      { id: '3', status: 'IN_PROGRESS', position: 2 },
      { id: '4', status: 'PENDING', position: 3 },
      { id: '5', status: 'PENDING', position: 4 },
    ];
    const result = computeRouteProgress(stops);
    // Truck is at index 2, out of 4 segments (0-4)
    expect(result.truckPosition).toBe(2 / 4);
    expect(result.currentStopIndex).toBe(2);
    expect(result.completedStops).toBe(2);
  });

  it('counts exceptions correctly', () => {
    const stops: RouteStopInput[] = [
      { id: '1', status: 'COMPLETED', position: 0, hasException: false },
      { id: '2', status: 'IN_PROGRESS', position: 1, hasException: true },
      { id: '3', status: 'PENDING', position: 2, hasException: true },
      { id: '4', status: 'PENDING', position: 3, hasException: false },
    ];
    const result = computeRouteProgress(stops);
    expect(result.exceptionCount).toBe(2);
  });

  it('returns truckPosition=0 when no stops completed', () => {
    const stops: RouteStopInput[] = [
      { id: '1', status: 'PENDING', position: 0 },
      { id: '2', status: 'PENDING', position: 1 },
    ];
    const result = computeRouteProgress(stops);
    expect(result.truckPosition).toBe(0);
    expect(result.completedStops).toBe(0);
  });
});
