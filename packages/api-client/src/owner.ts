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
  rate?: number | null
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
  notes?: string | null
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

export interface CustomerOption {
  id: string
  name: string
}

export interface DriverOption {
  id: string
  name: string
}

export interface OwnerDriverSummary {
  id: string
  name: string
  email: string
  phone: string | null
  status: 'on_duty' | 'off_duty'
  currentLoadNumber: string | null
  hosStatus: string | null
  complianceStatus: 'ok' | 'warning' | 'critical'
  expiringDocCount: number
  expiredDocCount: number
}

export interface OwnerDriverDocument {
  id: string
  fileName: string
  documentType: string | null
  expiryDate: string | null
  notes: string | null
  createdAt: string
  status: 'VALID' | 'EXPIRING' | 'EXPIRED'
}

export interface OwnerDriverIncident {
  id: string
  category: string
  severity: string
  description: string
  reportedAt: string
}

export interface OwnerDriverCurrentLoad {
  id: string
  loadNumber: string
  status: string
  origin: string
  destination: string
  pickupDate: string | null
  deliveryDate: string | null
  rate: number | null
}

export interface OwnerDriverDetail {
  id: string
  name: string
  email: string
  phone: string | null
  hosStatus: string | null
  hosStartTime: string | null
  complianceStatus: 'ok' | 'warning' | 'critical'
  currentLoad: OwnerDriverCurrentLoad | null
  documents: OwnerDriverDocument[]
  recentIncidents: OwnerDriverIncident[]
}

export interface MapVehicle {
  truckId: string
  truckName: string
  driverName: string | null
  driverId: string | null
  latitude: number
  longitude: number
  speed: number
  heading: number | null
  lastPingAt: string | null
  status: 'MOVING' | 'IDLE' | 'OFFLINE'
  loadNumber: string | null
}

export interface FleetMessageSummary {
  id: string
  recipientName: string
  body: string
  isBroadcast: boolean
  createdAt: string
}

export interface SendFleetMessagePayload {
  recipientId?: string
  body: string
  isBroadcast?: boolean
}

export interface CreateLoadPayload {
  customerId?: string
  customerName?: string
  origin: string
  destination: string
  pickupDate?: string
  rate?: number
  driverId?: string
}

export interface UpdateLoadPayload {
  status?: string
  driverId?: string | null
  notes?: string
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const ownerApi = {
  getDashboard: (token: string) =>
    apiRequest<OwnerDashboardData>('/api/mobile/owner/dashboard', { token }),

  getLoads: (token: string, status: 'all' | 'active' | 'pending' | 'delivered') =>
    apiRequest<OwnerLoadSummary[]>(`/api/mobile/owner/loads?status=${status}`, { token }),

  createLoad: (token: string, payload: CreateLoadPayload) =>
    apiRequest<{ load: OwnerLoadSummary }>('/api/mobile/owner/loads', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),

  getLoad: (token: string, id: string) =>
    apiRequest<OwnerLoadDetail>(`/api/mobile/owner/loads/${id}`, { token }),

  updateLoad: (token: string, id: string, payload: UpdateLoadPayload) =>
    apiRequest<{ load: OwnerLoadDetail }>(`/api/mobile/owner/loads/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    }),

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

  getCustomers: (token: string) =>
    apiRequest<CustomerOption[]>('/api/mobile/owner/customers', { token }),

  getActiveDrivers: (token: string) =>
    apiRequest<DriverOption[]>('/api/mobile/owner/drivers/active', { token }),

  getFleetPositions: (token: string) =>
    apiRequest<FleetPosition[]>('/api/mobile/owner/fleet-positions', { token }),

  getDrivers: (token: string) =>
    apiRequest<OwnerDriverSummary[]>('/api/mobile/owner/drivers', { token }),

  getDriverDetail: (token: string, id: string) =>
    apiRequest<OwnerDriverDetail>(`/api/mobile/owner/drivers/${id}`, { token }),

  getMapVehicles: (token: string) =>
    apiRequest<{ vehicles: MapVehicle[] }>('/api/mobile/owner/map/vehicles', { token }),

  getFleetMessages: (token: string) =>
    apiRequest<{ messages: FleetMessageSummary[] }>('/api/mobile/owner/fleet/messages', { token }),

  sendFleetMessage: (token: string, payload: SendFleetMessagePayload) =>
    apiRequest<{ message: FleetMessageSummary }>('/api/mobile/owner/fleet/messages', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),
}
