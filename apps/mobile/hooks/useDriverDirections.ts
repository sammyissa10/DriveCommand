import { useQuery } from '@tanstack/react-query'
import { driverApi, type RouteStop, type DirectionsResult } from '@drivecommand/api-client'

interface UseDriverDirectionsOptions {
  token: string | null
  stops: RouteStop[]
  enabled: boolean  // false when no active load or stops lack coordinates
}

interface DriverDirectionsResult {
  polyline: [number, number][] | null
  distanceMiles: number | null
  durationSeconds: number | null
  isLoading: boolean
  isError: boolean
}

/**
 * Fetches OSRM road polyline for the active load's stops.
 *
 * Only calls the API when:
 * - driver has a valid token
 * - there are at least 2 stops with non-null lat/lng
 * - enabled flag is true (active load in progress)
 *
 * Stops that lack lat/lng (null) are filtered out before sending.
 * If fewer than 2 stops remain after filtering, returns null (no polyline).
 *
 * Refetches every 5 minutes in case stop completion status changes
 * (caller is expected to pass only unvisited/remaining stops if desired).
 */
export function useDriverDirections({
  token,
  stops,
  enabled,
}: UseDriverDirectionsOptions): DriverDirectionsResult {
  // Filter to stops that have coordinates
  const stopsWithCoords = stops
    .filter(s => s.lat != null && s.lng != null)
    .map(s => ({ lat: Number(s.lat), lng: Number(s.lng) }))

  const canFetch = enabled && !!token && stopsWithCoords.length >= 2

  const { data, isLoading, isError } = useQuery({
    queryKey: ['driver-directions', stops.map(s => s.id).join(',')],
    queryFn: async (): Promise<DirectionsResult> => {
      return driverApi.getDirections(token!, stopsWithCoords)
    },
    enabled: canFetch,
    staleTime: 5 * 60 * 1000,   // 5 minutes — polyline doesn't change mid-route
    retry: 1,                    // OSRM public API can be flaky; one retry is enough
  })

  return {
    polyline: data?.polyline ?? null,
    distanceMiles: data?.distanceMiles ?? null,
    durationSeconds: data?.durationSeconds ?? null,
    isLoading: canFetch && isLoading,
    isError,
  }
}
