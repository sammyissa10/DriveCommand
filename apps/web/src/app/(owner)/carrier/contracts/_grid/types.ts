/**
 * Types for Contracts DataGrid
 */

export interface ContractRow {
  id: string;
  contractNumber: string;
  contractType: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  clientId: string;
  clientName: string;
  isExpiringSoon: boolean;
}
