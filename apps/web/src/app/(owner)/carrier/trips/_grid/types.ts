/**
 * Types for Trips DataGrid
 */

export interface DispatchRow {
  id: string;
  dispatchNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  truckId: string | null;
  truckUnit: string | null;
  scheduledDate: string;
  status: string;
  loadCount: number;
  notes: string | null;
}
