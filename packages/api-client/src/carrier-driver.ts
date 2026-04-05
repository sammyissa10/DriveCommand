import { apiRequest } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CarrierDispatchStop {
  id: string
  sequenceOrder: number
  stopType: string
  facilityName: string
  facilityCity: string | null
  facilityState: string | null
  status: string
  bolRequired: boolean
  podRequired: boolean
  bolUploaded: boolean
  podUploaded: boolean
  appointmentStart: string | null
}

export interface CarrierDispatch {
  id: string
  dispatchNumber: string
  status: string
  scheduledDeparture: string
  actualDeparture: string | null
  truck: { unitNumber: string }
  stops: CarrierDispatchStop[]
}

export interface CarrierStopDocument {
  id: string
  documentType: string
  filename: string
  fileUrl: string
  createdAt: string
}

export interface CarrierDispatchDetailStop {
  id: string
  sequenceOrder: number
  stopType: string
  status: string
  appointmentStart: string | null
  appointmentEnd: string | null
  arrivedAt: string | null
  departedAt: string | null
  contactName: string | null
  contactPhone: string | null
  specialInstructions: string | null
  bolRequired: boolean
  bolUploaded: boolean
  podRequired: boolean
  podUploaded: boolean
  bolNumber: string | null
  podNumber: string | null
  sealNumber: string | null
  facility: {
    name: string
    addressLine1: string | null
    city: string | null
    state: string | null
    zip: string | null
    latitude: number | null
    longitude: number | null
  }
  documents: CarrierStopDocument[]
}

export interface CarrierExpenseSummary {
  id: string
  expenseType: string
  amount: string
  currency: string
  notes: string | null
  createdAt: string
  reimbursable: boolean
}

export interface CarrierDispatchDetail {
  id: string
  dispatchNumber: string
  status: string
  scheduledDeparture: string
  actualDeparture: string | null
  scheduledArrival: string | null
  actualArrival: string | null
  plannedMiles: string | null
  actualMiles: string | null
  notes: string | null
  truck: {
    unitNumber: string
    make: string | null
    model: string | null
    year: number | null
    licensePlate: string | null
  }
  trailer: { unitNumber: string } | null
  stops: CarrierDispatchDetailStop[]
  expenses: CarrierExpenseSummary[]
}

export interface ExpenseInput {
  expenseType: string
  amount: number
  paidBy: string
  notes?: string
  stopId?: string
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const carrierDriverApi = {
  getMyDispatches: (token: string) =>
    apiRequest<{ dispatches: CarrierDispatch[] }>('/api/mobile/carrier/driver/dispatches', { token })
      .then((r) => r.dispatches),

  getDispatchDetail: (token: string, id: string) =>
    apiRequest<CarrierDispatchDetail>(`/api/mobile/carrier/driver/dispatches/${id}`, { token }),

  markStopArrived: (token: string, stopId: string) =>
    apiRequest<CarrierDispatchDetailStop>(`/api/mobile/carrier/driver/stops/${stopId}/arrive`, {
      method: 'POST',
      token,
    }),

  completeStop: (token: string, stopId: string) =>
    apiRequest<CarrierDispatchDetailStop>(`/api/mobile/carrier/driver/stops/${stopId}/complete`, {
      method: 'POST',
      token,
    }),

  uploadStopDocument: (token: string, stopId: string, _documentType: string, file: FormData) =>
    apiRequest<CarrierStopDocument>(`/api/mobile/carrier/driver/stops/${stopId}/documents`, {
      method: 'POST',
      token,
      body: file as unknown as string,
      headers: {}, // Let browser set Content-Type for FormData
    }),

  logExpense: (token: string, dispatchId: string, data: ExpenseInput) =>
    apiRequest<CarrierExpenseSummary>(`/api/mobile/carrier/driver/dispatches/${dispatchId}/expenses`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),
}
