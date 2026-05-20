/**
 * Clients Grid Types
 *
 * Type definitions for the clients DataGrid.
 */

export interface ClientRow {
  id: string;
  name: string;
  status: string;
  email: string | null;
  phone: string | null;
  primaryContact: string | null;
  city: string | null;
  state: string | null;
  portalAccess: boolean;
  isSample: boolean;
}
