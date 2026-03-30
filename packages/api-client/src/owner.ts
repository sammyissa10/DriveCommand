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

export interface TruckDetail {
  id: string
  make: string
  model: string
  year: number
  vin: string
  licensePlate: string
  odometer: number
  inMaintenance: boolean
  status: string
  documentMetadata: {
    registrationNumber?: string
    registrationExpiry?: string
    insuranceNumber?: string
    insuranceExpiry?: string
  } | null
  createdAt: string
  updatedAt: string
}

export interface CreateTruckPayload {
  make: string
  model: string
  year: number
  vin: string
  licensePlate: string
  odometer: number
  registrationNumber?: string
  registrationExpiry?: string
  insuranceNumber?: string
  insuranceExpiry?: string
}

export interface TruckOption {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string
  odometer: number
  inMaintenance: boolean
  status: 'In Use' | 'In Maintenance' | 'Expired Docs' | 'Ready to Use'
  variant: 'blue' | 'amber' | 'red' | 'green'
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

export interface ConversationSummary {
  recipientId: string | null
  recipientName: string
  isBroadcast: boolean
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}

export interface ConversationMessage {
  id: string
  senderId: string
  senderRole: string
  senderName: string
  body: string
  isBroadcast: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface InvoiceStats {
  total: number
  draft: number
  overdue: number
  outstandingAmount: number
  paidAmount: number
}

export interface InvoiceSummary {
  id: string
  invoiceNumber: string
  status: string
  totalAmount: number
  customerName: string
  dueDate: string | null
  createdAt: string
}

export interface InvoicesResponse {
  stats: InvoiceStats
  invoices: InvoiceSummary[]
}

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface InvoiceDetail {
  id: string
  invoiceNumber: string
  status: string
  customerName: string
  issueDate: string
  dueDate: string
  paidDate: string | null
  notes: string | null
  subtotal: number
  tax: number
  totalAmount: number
  items: InvoiceLineItem[]
  createdByName: string | null
  createdAt: string
  updatedByName: string | null
  updatedAt: string
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export interface CreateCustomerPayload {
  companyName: string
  contactName?: string
  email?: string
  phone?: string
}

export interface CreateInvoicePayload {
  customerId?: string
  description: string
  amount: number
  dueDate?: string
}

export interface CRMStats {
  total: number
  active: number
  vip: number
}

export interface CustomerSummary {
  id: string
  companyName: string
  status: string
  priority: string
  phone: string | null
  email: string | null
}

export interface CRMResponse {
  stats: CRMStats
  customers: CustomerSummary[]
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export interface PayrollStats {
  total: number
  draft: number
  approved: number
  totalPaid: number
}

export interface PayrollRecordSummary {
  id: string
  status: string
  periodStart: string
  periodEnd: string
  totalPay: number
  driverName: string
}

export interface PayrollResponse {
  stats: PayrollStats
  records: PayrollRecordSummary[]
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export interface ComplianceSummary {
  expiredCount: number
  expiringSoonCount: number
  totalDriversTracked: number
  totalTrucksTracked: number
}

export interface ComplianceAlert {
  entityName: string
  documentType: string
  status: 'EXPIRED' | 'EXPIRING_SOON'
  daysUntilExpiry: number | null
}

export interface ComplianceResponse {
  summary: ComplianceSummary
  alerts: ComplianceAlert[]
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

  getTruck: (token: string, id: string) =>
    apiRequest<TruckDetail>(`/api/mobile/owner/trucks/${id}`, { token }),

  createTruck: (token: string, payload: CreateTruckPayload) =>
    apiRequest<{ truck: { id: string } }>('/api/mobile/owner/trucks', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),

  getCustomers: (token: string) =>
    apiRequest<CustomerOption[]>('/api/mobile/owner/customers', { token }),

  createCustomer: (token: string, payload: CreateCustomerPayload) =>
    apiRequest<{ customer: { id: string; companyName: string } }>('/api/mobile/owner/customers', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),

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

  getFleetConversations: (token: string) =>
    apiRequest<{ conversations: ConversationSummary[] }>('/api/mobile/owner/fleet/messages', { token }),

  getConversationThread: (token: string, recipientId: string) =>
    apiRequest<{ messages: ConversationMessage[]; recipientName: string }>(
      `/api/mobile/owner/fleet/messages/${recipientId}`,
      { token }
    ),

  sendConversationMessage: (token: string, recipientId: string, body: string) =>
    apiRequest<{ message: ConversationMessage }>(
      `/api/mobile/owner/fleet/messages/${recipientId}`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ body }),
      }
    ),

  getInvoices: (token: string) =>
    apiRequest<InvoicesResponse>('/api/mobile/owner/invoices', { token }),

  getInvoice: (token: string, id: string) =>
    apiRequest<InvoiceDetail>(`/api/mobile/owner/invoices/${id}`, { token }),

  createInvoice: (token: string, payload: CreateInvoicePayload) =>
    apiRequest<{ invoice: { id: string; invoiceNumber: string } }>('/api/mobile/owner/invoices', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    }),

  getCRM: (token: string) =>
    apiRequest<CRMResponse>('/api/mobile/owner/crm', { token }),

  getPayroll: (token: string) =>
    apiRequest<PayrollResponse>('/api/mobile/owner/payroll', { token }),

  getCompliance: (token: string) =>
    apiRequest<ComplianceResponse>('/api/mobile/owner/compliance', { token }),

  inviteDriver: (token: string, payload: { firstName: string; lastName: string; email: string; licenseNumber?: string }) =>
    apiRequest<{ success: boolean; invitationId: string; emailSent: boolean; message: string }>(
      '/api/mobile/owner/drivers/invite',
      { method: 'POST', token, body: JSON.stringify(payload) }
    ),
}
