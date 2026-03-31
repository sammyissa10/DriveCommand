export { apiClient, apiRequest, setUnauthorizedHandler, configureApiClient } from './client'
export { driverApi } from './driver'
export type { DashboardData, LoadSummary, LoadDetail, RouteStop, FleetMessage, DriverDocument, CreateDocumentPayload, DocumentStatus, DocumentType, DriverRoute, DriverRouteLoad, DriverRouteTruck } from './driver'
export { ownerApi } from './owner'
export type { OwnerDashboardData, OwnerLoadSummary, OwnerLoadDetail, TruckOption, TruckDetail, CreateTruckPayload, FleetPosition, CustomerOption, DriverOption, CreateLoadPayload, UpdateLoadPayload, UpdateDriverPayload, UpdateTruckPayload, OwnerDriverSummary, OwnerDriverDetail, OwnerDriverDocument, OwnerDriverIncident, OwnerDriverCurrentLoad, MapVehicle, FleetMessageSummary, SendFleetMessagePayload, ConversationSummary, ConversationMessage, InvoiceStats, InvoiceSummary, InvoicesResponse, InvoiceLineItem, InvoiceDetail, CRMStats, CustomerSummary, CRMResponse, CrmContactDetail, UpdateCrmContactPayload, PayrollStats, PayrollRecordSummary, PayrollResponse, PayrollRecordDetail, CreatePayrollPayload, ComplianceSummary, ComplianceAlert, ComplianceResponse, CreateCustomerPayload, CreateInvoicePayload, OwnerRouteSummary, OwnerRouteDetail, UpdateRoutePayload, PredictProfitPayload, PredictProfitResult, FuelEntry, CreateFuelEntryPayload } from './owner'
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
