/**
 * Clients Grid Types
 *
 * Type definitions for the clients DataGrid.
 */

export interface ClientContactRow {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isMain: boolean;
}

export interface ClientRow {
  id: string;
  name: string;
  status: string;
  email: string | null;
  phone: string | null;
  primaryContact: string | null;
  /** Display name of the client's main contact, if any (falls back to primaryContact). */
  mainContactName: string | null;
  contacts: ClientContactRow[];
  city: string | null;
  state: string | null;
  portalAccess: boolean;
  isSample: boolean;
}
