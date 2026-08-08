export { apiClient, apiRequest, setUnauthorizedHandler, configureApiClient, getApiBaseUrl } from './client'
export { ownerImportsApi } from './owner-imports'
export { ownerTripsApi } from './owner-trips'
export type { OwnerTripDetail, OwnerTripStop } from './owner-trips'
export type {
  ImportStatus,
  ImportView,
  ImportPageView,
  ImportSummaryView,
  ImportListItem,
  ImportUploadGrant,
  ImportDuplicate,
  CreateImportResult,
  // Resolution (Phase 3)
  ResolvedVia,
  WhyView,
  ClientOption,
  ContractOption,
  ClientPrefill,
  ClientSlotView,
  ContractSlotView,
  SpotOffer,
  ContractCreateOffer,
  ImportResolutionView,
  // Facility resolution ladder (Phase 4).
  //
  // These shipped with Phase 4 but were never added to this list, so they were
  // unreachable from `@drivecommand/api-client` — a gap nothing caught because
  // Phase 4 deliberately built no mobile stop screen to import them. Phase 5
  // builds that screen, which is what surfaced it. Added here rather than in a
  // Phase 5 block, because they are Phase 4's.
  FacilityTier,
  StopResolvedVia,
  StopWhyView,
  StopFacilityView,
  FacilityProposal,
  FacilityPrefill,
  StopSlotState,
  StopSlotView,
  StopResolutionView,
  CreateStopFacilityInput,
  // Stop review (Phase 5)
  StopType,
  RequiredDocument,
  BulkAppliedField,
  StopReferenceType,
  StopReference,
  StopLineItem,
  StopRollup,
  StopRollups,
  StopAppointment,
  StopContact,
  StopReviewRow,
  StopIssueCode,
  StopIssue,
  StopReviewView,
  StopEditInput,
  StopBulkInput,
  StopBulkResult,
  // Phase 6 — route template matching (spec Section 8).
  TemplateProvenanceVia,
  TemplateWhyView,
  TemplateStopOrigin,
  TemplateDiffRow,
  TemplateDiff,
  TemplateCandidateView,
  TemplateSlotState,
  TemplateSlotView,
  TemplateApplyResult,
  TemplateOfferView,
  SaveTemplateResult,
} from './owner-imports'
export { driverApi } from './driver'
export type { DashboardData, LoadSummary, LoadDetail, RouteStop, DirectionsResult, FleetMessage, DriverDocument, CreateDocumentPayload, DocumentStatus, DocumentType, DriverRoute, DriverRouteLoad, DriverRouteTruck } from './driver'
export { ownerApi } from './owner'
export { carrierDriverApi } from './carrier-driver'
export type { CarrierDispatch, CarrierDispatchStop, CarrierDispatchDetail, CarrierDispatchDetailStop, CarrierStopDocument, CarrierExpenseSummary, ExpenseInput } from './carrier-driver'
export type { OwnerDashboardData, OwnerLoadSummary, OwnerLoadDetail, TruckOption, TruckDetail, CreateTruckPayload, FleetPosition, CustomerOption, DriverOption, CreateLoadPayload, UpdateLoadPayload, UpdateDriverPayload, UpdateTruckPayload, OwnerDriverSummary, OwnerDriverDetail, OwnerDriverDetailHOS, OwnerDriverActiveLoad, OwnerDriverHOS, OwnerDriverDocument, OwnerDriverIncident, OwnerDriverCurrentLoad, MapVehicle, FleetMessageSummary, SendFleetMessagePayload, ConversationSummary, ConversationMessage, InvoiceStats, InvoiceSummary, InvoicesResponse, InvoiceLineItem, InvoiceDetail, CRMStats, CustomerSummary, CRMResponse, CrmContactDetail, UpdateCrmContactPayload, PayrollStats, PayrollRecordSummary, PayrollResponse, PayrollRecordDetail, CreatePayrollPayload, ComplianceSummary, ComplianceAlert, ComplianceResponse, CreateCustomerPayload, CreateInvoicePayload, OwnerRouteSummary, OwnerRouteDetail, UpdateRoutePayload, PredictProfitPayload, PredictProfitResult, FuelEntry, CreateFuelEntryPayload, MaintenanceEventSummary, LogMaintenancePayload, SafetyAlert, SafetyAlertsResponse, ScheduledServiceSummary, ScheduledServiceWithTruck, CreateScheduledServicePayload, CompleteScheduledServicePayload } from './owner'
export type { RouteStop as OwnerRouteStop } from './owner'
export type * from '@drivecommand/types'

import { driverApi as _driverApi } from './driver'

// Re-export createSupportTicket unconditionally so both driver and owner portals
// can access it via @drivecommand/api-client without importing from driver module directly.
// The SupportTicketFAB is a shared component used in both layouts.
export function createSupportTicket(
  token: string,
  data: {
    category: 'BILLING' | 'BUG' | 'FEATURE' | 'GENERAL'
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
    title: string
    description: string
    fromPage: string
    screenshotKey?: string
  }
): Promise<{ ticketNumber: string }> {
  return _driverApi.createSupportTicket(token, data)
}
