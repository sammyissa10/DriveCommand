/**
 * Types for Routes DataGrid
 */

export interface RouteRow {
  id: string;
  name: string;
  origin: string | null;
  destination: string | null;
  scheduledDate: string | null;
  driverId: string | null;
  driverName: string | null;
  truckId: string | null;
  truckUnit: string | null;
  status: string;
}
