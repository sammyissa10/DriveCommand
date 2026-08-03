import { apiRequest } from './client'

/**
 * Carrier trips — owner surface, read-only.
 *
 * `Trip` maps to table `dispatches` and the API path is `/dispatches`; the UI
 * label is "Trip" (audit B11). Added so the mobile duplicate-detection flow can
 * offer "open the existing trip", which it could not before — the mobile owner
 * portal's `loads` and `routes` screens belong to the legacy universe.
 */

export interface OwnerTripStop {
  id: string
  sequenceOrder: number
  stopType: string
  status: string
  facilityName: string
  city: string | null
  state: string | null
  appointmentStart: string | null
  pieces: number | null
}

export interface OwnerTripDetail {
  id: string
  tripNumber: string
  status: string
  scheduledDeparture: string | null
  scheduledArrival: string | null
  plannedMiles: number | null
  driverName: string | null
  truckUnit: string | null
  stops: OwnerTripStop[]
}

export const ownerTripsApi = {
  get: (token: string, tripId: string) =>
    apiRequest<{ data: OwnerTripDetail }>(`/api/mobile/carrier/owner/dispatches/${tripId}`, {
      token,
    }).then((r) => r.data),
}
