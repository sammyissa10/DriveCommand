/**
 * Trucks Grid Types
 *
 * Type definitions for the carrier trucks DataGrid.
 */

export interface TruckRow {
  id: string;
  vehicleId: string;
  displayName: string | null;
  unitNumber: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  truckType: string;
  currentOdometerMiles: number | null;
  registrationExpiry: Date | string | null;
  licenseExpiry: Date | string | null;
  insuranceExpiry: Date | string | null;
  licensePlate: string | null;
  licenseState: string | null;
  status: string;
  isSample: boolean;
  photoS3Key: string | null;
  assignedDriver: { id: string; firstName: string; lastName: string } | null;
}

/**
 * KPI data for trucks overview
 */
export interface TruckKPIData {
  totalFleet: number;
  activeCompliant: number;
  expiringSoon: number;
  needsAction: number;
}

/**
 * Status tab counts
 */
export interface TruckStatusCounts {
  all: number;
  active: number;
  maintenance: number;
  out_of_service: number;
}
