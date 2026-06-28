/**
 * Client status computation and types.
 *
 * CarrierClient status is stored as a string in the database.
 * This module maps those strings to user-facing labels and StatusBadge variants.
 */

import type { Prisma } from '@/generated/prisma';

export interface ClientWithRelations {
  id: string;
  orgId: string;
  name: string;
  dbaName: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  taxId: string | null;
  primaryContact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  status: string;
  portalAccess: boolean;
  portalEmail: string | null;
  paymentTerms: number;
  creditLimit: Prisma.Decimal | null;
  notes: string | null;
  isSample: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  updatedBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  // Computed aggregates (optional, for KPIs)
  _count?: {
    carrierLoads: number;
  };
}

export type ClientStatusVariant = 'success' | 'warning' | 'neutral' | 'info';

export interface ClientStatusResult {
  status: 'Active' | 'On Hold' | 'Inactive' | 'Prospect';
  variant: ClientStatusVariant;
}

/**
 * Map database status string to user-facing label and StatusBadge variant.
 */
export function computeClientStatus(client: ClientWithRelations): ClientStatusResult {
  switch (client.status) {
    case 'active':
      return { status: 'Active', variant: 'success' };
    case 'on_hold':
      return { status: 'On Hold', variant: 'warning' };
    case 'inactive':
      return { status: 'Inactive', variant: 'neutral' };
    case 'prospect':
      return { status: 'Prospect', variant: 'info' };
    default:
      return { status: 'Active', variant: 'success' };
  }
}

/**
 * Map status tab values to database status strings.
 */
export type ClientStatusTabValue = 'all' | 'active' | 'on_hold' | 'inactive';

export function getStatusTabValue(client: ClientWithRelations): ClientStatusTabValue {
  switch (client.status) {
    case 'active':
      return 'active';
    case 'on_hold':
      return 'on_hold';
    case 'inactive':
      return 'inactive';
    default:
      return 'active';
  }
}
