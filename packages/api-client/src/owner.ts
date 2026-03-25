import { apiRequest } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OwnerDashboardData {
  kpis: {
    activeLoadsCount: number
    driversOnDutyCount: number
    revenueThisMonth: number
    openAlertsCount: number
  }
  activeLoads: Array<{
    id: string
    loadNumber: string
    status: string
    origin: string
    destination: string
    customer: { id: string; companyName: string }
    truck: { id: string; make: string; model: string; licensePlate: string } | null
    driverName: string | null
    createdAt: string
    updatedAt: string
  }>
  driverStatuses: Array<{
    id: string
    name: string
    hosStatus: string | null
    activeLoadNumber: string | null
  }>
}

export interface OwnerLoadSummary {
  id: string
  loadNumber: string
  status: string
  origin: string
  destination: string
  customer: { id: string; companyName: string }
  truck: { id: string; make: string; model: string; licensePlate: string } | null
  driver: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export interface RouteStop {
  id: string
  position: number
  type: 'PICKUP' | 'DELIVERY'
  address: string
  status: 'PENDING' | 'ARRIVED' | 'DEPARTED'
  scheduledAt: string | null
  arrivedAt: string | null
  departedAt: string | null
  notes: string | null
}

export interface OwnerLoadDetail {
  id: string
  loadNumber: string
  status: string
  origin: string
  destination: string
  pickupDate?: string | null
  deliveryDate?: string | null
  rate?: number | null
  customer: { id: string; companyName: string; email?: string; phone?: string }
  truck: { id: string; make: string; model: string; licensePlate: string } | null
  driver: { id: string; name: string } | null
  stops: RouteStop[]
  createdAt: string
}

export interface TruckOption {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string
  inMaintenance: boolean
}

export interface FleetPosition {
  truckId: string
  latitude: number
  longitude: number
  speed: number | null
  heading: number | null
  timestamp: string
  truck: {
    make: string
    model: string
    licensePlate: string
  }
  driverName: string | null
  loadNumber: string | null
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const ownerApi = {
  getDashboard: (token: string) =>
    apiRequest<OwnerDashboardData>('/api/mobile/owner/dashboard', { token }),

  getLoads: (token: string, status: 'active' | 'history') =>
    apiRequest<OwnerLoadSummary[]>(`/api/mobile/owner/loads?status=${status}`, { token }),

  getLoad: (token: string, id: string) =>
    apiRequest<OwnerLoadDetail>(`/api/mobile/owner/loads/${id}`, { token }),

  assignTruck: (token: string, loadId: string, truckId: string | null) =>
    apiRequest<{ success: boolean; load: OwnerLoadDetail }>(
      `/api/mobile/owner/loads/${loadId}/assign-truck`,
      {
        method: 'PATCH',
        token,
        body: JSON.stringify({ truckId }),
      }
    ),

  getTrucks: (token: string) =>
    apiRequest<TruckOption[]>('/api/mobile/owner/trucks', { token }),

  getFleetPositions: (token: string) =>
    apiRequest<FleetPosition[]>('/api/mobile/owner/fleet-positions', { token }),
}
