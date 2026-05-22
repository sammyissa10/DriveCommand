/**
 * Types for Loads DataGrid
 */

export interface LoadRow {
  id: string;
  referenceNumber: string;
  clientId: string;
  clientName: string;
  dispatchId: string | null;
  dispatchNumber: string | null;
  loadType: string;
  status: string;
  totalRevenue: string | null;
  isSample: boolean;
}
