/**
 * Drivers Grid Types
 *
 * Type definitions for the carrier drivers DataGrid.
 */

export interface DriverRow {
  id: string;
  firstName: string;
  lastName: string;
  cdlClass: string | null;
  cdlExpiry: Date | string | null;
  payModel: string;
  status: string;
  isSample: boolean;
  /** Portal access derived server-side from the linked User + pending DriverInvitation set. */
  portalStatus: 'active' | 'invited' | 'none';
}
