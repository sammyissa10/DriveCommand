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
  status: string;
  isSample: boolean;
}
