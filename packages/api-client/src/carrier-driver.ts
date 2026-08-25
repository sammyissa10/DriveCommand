import { apiRequest, getApiBaseUrl } from './client'

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
  paidBy: string
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
  reimbursable: boolean
  notes?: string
  stopId?: string
}

// ---------------------------------------------------------------------------
// Phase 9 — pre-trip inspection gate (spec Section 12)
//
// These mirror the server's own view types in
// `apps/web/src/lib/carrier/inspection-handlers.ts`. One handler serves both
// the session-cookie and Bearer surfaces, so the phone and the browser cannot
// disagree about whether a trip may start.
// ---------------------------------------------------------------------------

export type InspectionOutcome =
  | 'NOT_REQUIRED'
  | 'OWNER_OVERRIDE'
  | 'PRIOR_INSPECTION'
  | 'PASSED'
  | 'PASSED_WITH_DEFECTS'
  | 'INSPECTION_REQUIRED'
  | 'BLOCKED'

export interface InspectionFailureView {
  stepInstanceId: string
  name: string
  isCritical: boolean
  note: string | null
  photoCount: number
}

export interface InspectionGateView {
  dispatchId: string
  truckUnitNumber: string
  tripStatus: string
  canStart: boolean
  outcome: InspectionOutcome
  /** One complete sentence, built server-side. Never assembled in JSX. */
  message: string
  playbookInstanceId: string | null
  unanswered: number
  failures: InspectionFailureView[]
  criticalFailures: InspectionFailureView[]
  override: { reason: string; at: string; byName: string | null } | null
  priorInspectionAt: string | null
  validityHours: number
}

export interface InspectionStepView {
  stepInstanceId: string
  name: string
  description: string | null
  stepType: string
  isCritical: boolean
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'SKIPPED'
  note: string | null
  photoKeys: string[]
  section: string
  requiresPhotoOnFail: boolean
}

export interface InspectionChecklistView {
  dispatchId: string
  playbookInstanceId: string
  playbookName: string
  truckUnitNumber: string
  driverName: string | null
  sections: Array<{ title: string; steps: InspectionStepView[] }>
  signature: { required: boolean; signed: boolean; stepInstanceId: string | null }
  failNoteMinLength: number
}

/** Thrown by `startTrip` when the gate refuses. Carries the outcome so the app
 *  can route to the blocked screen rather than showing a dismissible toast. */
export class TripStartBlockedError extends Error {
  readonly outcome: InspectionOutcome
  constructor(message: string, outcome: InspectionOutcome) {
    super(message)
    this.name = 'TripStartBlockedError'
    this.outcome = outcome
  }
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

  // ── Phase 9: the inspection gate ─────────────────────────────────────────

  /** The gate's current state. Pure read — safe to call on every screen focus. */
  getInspectionGate: (token: string, dispatchId: string) =>
    apiRequest<InspectionGateView>(
      `/api/mobile/carrier/driver/dispatches/${dispatchId}/inspection`,
      { token }
    ),

  /**
   * Open the checklist. A POST, not a GET, because it creates the checklist run
   * when the tenant has no ON_DISPATCH_CREATE trigger — and anything that can
   * change stored state is a POST (quick-516).
   *
   * Idempotent: re-opening returns the existing run with every previous answer
   * intact, which is what makes answers survive an app kill and not merely a
   * screen pop.
   */
  openInspectionChecklist: (token: string, dispatchId: string) =>
    apiRequest<InspectionChecklistView>(
      `/api/mobile/carrier/driver/dispatches/${dispatchId}/inspection/checklist`,
      { method: 'POST', token }
    ),

  /** Called after signing. Logs defects, notifies dispatch on a critical fail. */
  submitInspection: (token: string, dispatchId: string) =>
    apiRequest<InspectionGateView>(
      `/api/mobile/carrier/driver/dispatches/${dispatchId}/inspection/submit`,
      { method: 'POST', token }
    ),

  /**
   * Start the trip, through the gate.
   *
   * `apiRequest` collapses a non-2xx into a bare Error, which would lose the
   * gate's `code` — and the difference between "blocked by a critical failure"
   * and "network hiccup" is the difference between routing to the blocked
   * screen and offering a retry. So this one uses plain fetch, like the other
   * call in this repo that needs its error body (the import 409).
   */
  startTrip: async (
    token: string,
    dispatchId: string
  ): Promise<{ id: string; status: string; gate: InspectionGateView }> => {
    const res = await fetch(
      `${getApiBaseUrl()}/api/mobile/carrier/driver/dispatches/${dispatchId}/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      }
    )

    if (res.status === 422) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
      throw new TripStartBlockedError(
        body.error ?? 'This trip cannot start yet.',
        (body.code as InspectionOutcome) ?? 'BLOCKED'
      )
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }

    return res.json() as Promise<{ id: string; status: string; gate: InspectionGateView }>
  },
}
