/**
 * Facilities Grid Types
 *
 * Type definitions for the facilities DataGrid.
 */

export interface FacilityRow {
  id: string;
  name: string;
  facilityType: string | null;
  city: string | null;
  state: string | null;
  contactName: string | null;
  contacts?: Array<{ name: string; phone?: string; email?: string; role?: string }>;
  notes: string | null;
}
