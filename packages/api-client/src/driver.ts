import { apiRequest } from './client'

export interface DashboardData {
  activeLoad: {
    id: string
    loadNumber: string
    status: string
    origin: string
    destination: string
    customer: { companyName: string }
    stops?: Array<{
      id: string
      name: string
      address: string
      position: number
      completed: boolean
    }>
  } | null
  stopsCompleted: number
  hosHoursRemaining: number
  todayMiles: number
  recentAlerts: Array<{
    id: string
    message: string
    type: string
    createdAt: string
  }>
}

export interface LoadSummary {
  id: string
  loadNumber: string
  status: string
  origin: string
  destination: string
  customer: { companyName: string }
  createdAt: string
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

export interface LoadDetail {
  id: string
  loadNumber: string
  status: string
  origin: string
  destination: string
  pickupDate?: string | null
  deliveryDate?: string | null
  rate?: number | null
  customer: { id: string; companyName: string; email?: string; phone?: string }
  truck: { id: string; licensePlate: string; make: string; model: string } | null
  stops: RouteStop[]
  createdAt: string
}

export const driverApi = {
  getDashboard: (token: string) =>
    apiRequest<DashboardData>('/api/mobile/driver/dashboard', { token }),

  getLoads: (token: string, status: 'active' | 'history') =>
    apiRequest<LoadSummary[]>(`/api/mobile/driver/loads?status=${status}`, { token }),

  getLoad: (token: string, id: string) =>
    apiRequest<LoadDetail>(`/api/mobile/driver/loads/${id}`, { token }),

  updateLoadStatus: (token: string, id: string, status: string) =>
    apiRequest<{ success: boolean; load: LoadDetail }>(
      `/api/mobile/driver/loads/${id}/status`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ status }),
      }
    ),
}
