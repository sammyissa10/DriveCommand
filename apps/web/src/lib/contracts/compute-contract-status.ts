/**
 * Contract status computation and types.
 *
 * CarrierContract status is computed based on effectiveDate, expirationDate, and status field.
 * This module provides status computation logic and types for UI display.
 */

import type { Prisma } from '@/generated/prisma';

export interface ContractWithRelations {
  id: string;
  orgId: string;
  clientId: string;
  contractNumber: string;
  contractName: string | null;
  contractType: string;
  effectiveDate: Date | null;
  expirationDate: Date | null;
  rateType: string;
  baseRate: Prisma.Decimal | null;
  fuelSurchargeMethod: string;
  fuelSurchargeRate: Prisma.Decimal | null;
  detentionFreeMinutes: number;
  detentionRatePerHour: Prisma.Decimal | null;
  tonuRate: Prisma.Decimal | null;
  layoverRatePerDay: Prisma.Decimal | null;
  paymentTermsOverride: string | null;
  autoRenew: boolean;
  status: string;
  notes: string | null;
  defaultFreeTimeMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  updatedBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  client?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    carrierLoads: number;
    routeTemplates: number;
  };
}

export type ContractStatusVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export interface ContractAlert {
  variant: 'success' | 'warning' | 'danger' | 'info';
  message: string;
}

export interface ContractStatusResult {
  status: 'Active' | 'Expiring Soon' | 'Expired' | 'Pending' | 'Draft' | 'Terminated';
  variant: ContractStatusVariant;
  alert: ContractAlert | null;
}

/**
 * Compute contract status based on dates and status field.
 * Logic implements spec section 2.2.
 */
export function computeContractStatus(contract: ContractWithRelations): ContractStatusResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Manual termination takes precedence
  if (contract.status === 'terminated') {
    return { status: 'Terminated', variant: 'neutral', alert: null };
  }

  // Check expiration
  if (contract.expirationDate) {
    const expiry = new Date(contract.expirationDate);
    expiry.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return {
        status: 'Expired',
        variant: 'danger',
        alert: { variant: 'danger', message: `Expired ${Math.abs(daysUntilExpiry)} days ago` }
      };
    }

    if (daysUntilExpiry <= 30) {
      return {
        status: 'Expiring Soon',
        variant: 'warning',
        alert: { variant: 'warning', message: `Expires in ${daysUntilExpiry} days` }
      };
    }
  }

  // Check if not yet effective
  if (contract.effectiveDate) {
    const effective = new Date(contract.effectiveDate);
    effective.setHours(0, 0, 0, 0);
    if (effective > today) {
      const daysUntilEffective = Math.ceil((effective.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        status: 'Pending',
        variant: 'info',
        alert: { variant: 'info', message: `Starts in ${daysUntilEffective} days` }
      };
    }
  }

  // No dates set = draft
  if (!contract.effectiveDate && contract.status === 'draft') {
    return { status: 'Draft', variant: 'neutral', alert: null };
  }

  // Default: active
  return { status: 'Active', variant: 'success', alert: null };
}

/**
 * Map contract to status tab value for filtering.
 */
export type ContractStatusTabValue = 'all' | 'active' | 'expiring' | 'expired' | 'draft';

export function getStatusTabValue(contract: ContractWithRelations): ContractStatusTabValue {
  const result = computeContractStatus(contract);

  switch (result.status) {
    case 'Active':
    case 'Pending':
      return 'active';
    case 'Expiring Soon':
      return 'expiring';
    case 'Expired':
      return 'expired';
    case 'Draft':
      return 'draft';
    case 'Terminated':
      return 'expired'; // Terminated contracts filtered as expired
    default:
      return 'all';
  }
}
