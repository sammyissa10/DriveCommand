import { apiRequest } from './client'
import type { HOSData, HOSStatus, HOSEntry, CreateIncidentPayload, Incident } from '@drivecommand/types'

export type { HOSData, HOSStatus, HOSEntry, CreateIncidentPayload, Incident, IncidentCategory, IncidentSeverity } from '@drivecommand/types'

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type DocumentStatus = 'VALID' | 'EXPIRING' | 'EXPIRED'

export type DocumentType =
  | 'CDL'
  | 'MEDICAL_CARD'
  | 'HAZMAT'
  | 'INSURANCE'
  | 'REGISTRATION'
  | 'INSPECTION'
  | 'OTHER'

export interface DriverDocument {
  id: string
  fileName: string
  s3Key: string
  contentType: string
  sizeBytes: number
  documentType: string | null
  expiryDate: string | null
  notes: string | null
  createdAt: string
  status: DocumentStatus
}

export interface CreateDocumentPayload {
  type: DocumentType
  name: string
  expiryDate?: string
  s3Key: string
  contentType: string
  sizeBytes: number
}

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

export interface FleetMessage {
  id: string
  tenantId: string
  routeId: string | null
  loadId: string | null
  senderId: string
  senderRole: string
  body: string
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

  // HOS
  getHOS: (token: string) =>
    apiRequest<HOSData>('/api/mobile/driver/hos', { token }),

  updateHOSStatus: (token: string, status: HOSStatus, notes?: string) =>
    apiRequest<{ entry: HOSEntry }>('/api/mobile/driver/hos', {
      method: 'POST',
      token,
      body: JSON.stringify({ status, notes }),
    }),

  // Incidents
  getIncidents: (token: string) =>
    apiRequest<{ incidents: Incident[] }>('/api/mobile/driver/incidents', { token }),

  createIncident: (token: string, data: CreateIncidentPayload) =>
    apiRequest<{ incident: Incident }>('/api/mobile/driver/incidents', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  // GPS tracking token — returns active load's tracking token for supplementary GPS context
  getTrackingToken: (token: string) =>
    apiRequest<{ trackingToken: string | null }>('/api/mobile/driver/tracking-token', { token }),

  // Messaging
  getMessages: (token: string) =>
    apiRequest<FleetMessage[]>('/api/mobile/driver/messages', { token }),

  sendMessage: (token: string, body: string, loadId?: string) =>
    apiRequest<FleetMessage>('/api/mobile/driver/messages', {
      method: 'POST',
      token,
      body: JSON.stringify({ body, ...(loadId && { loadId }) }),
    }),

  getUnreadCount: (token: string, since?: string) =>
    apiRequest<{ count: number }>(
      `/api/mobile/driver/messages/unread-count${since ? `?since=${encodeURIComponent(since)}` : ''}`,
      { token }
    ),

  markMessagesRead: (token: string) =>
    apiRequest<{ success: boolean }>('/api/mobile/driver/messages/mark-read', {
      method: 'POST',
      token,
    }),

  // Documents
  getDocuments: (token: string) =>
    apiRequest<{ documents: DriverDocument[] }>('/api/mobile/driver/documents', { token }),

  getDocumentUrl: (token: string, id: string) =>
    apiRequest<{ url: string }>(`/api/mobile/driver/documents/${id}/url`, { token }),

  getDocumentUploadUrl: (
    token: string,
    data: { fileName: string; contentType: string; sizeBytes: number }
  ) =>
    apiRequest<{ uploadUrl: string; s3Key: string }>('/api/mobile/driver/documents/upload-url', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  uploadDocument: (token: string, data: CreateDocumentPayload) =>
    apiRequest<{ document: DriverDocument }>('/api/mobile/driver/documents', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),
}
