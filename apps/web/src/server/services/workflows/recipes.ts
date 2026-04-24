/**
 * Recipes library — spec Section 11
 *
 * These are configuration constants, NOT database records. When a tenant enables
 * a recipe, the trigger router creates a PlaybookTrigger row by copying the
 * recipe's triggerEvent + conditions and linking to the tenant's chosen playbookId.
 *
 * Keys MUST match the spec Section 11 table exactly.
 */
import type { TriggerEvent } from '@/generated/prisma';

export interface Recipe {
  /** Stable identifier used by the UI and enableRecipe mutation */
  key: string;
  /** Human-readable name shown on the recipe card */
  displayName: string;
  /** Plain-English sentence shown under the name: "When X happens, Y runs" */
  sentence: string;
  /** Lifecycle event that fires this recipe's playbook */
  triggerEvent: TriggerEvent;
  /** Flat key-value conditions evaluated against entityData; empty object = always match */
  conditions: Record<string, unknown>;
  /** Optional category hint to help UI filter which playbooks the tenant can bind */
  suggestedCategory?:
    | 'ONBOARDING'
    | 'SAFETY'
    | 'OPERATIONS'
    | 'COMPLIANCE'
    | 'PARTNER'
    | 'CUSTOM'
    | 'VEHICLE_INSPECTION';
}

export const RECIPES: Recipe[] = [
  {
    key: 'cdl_driver_onboarding',
    displayName: 'Start CDL Driver Onboarding automatically',
    sentence: 'When a CDL driver is added, start the CDL onboarding checklist.',
    triggerEvent: 'ON_DRIVER_CREATE',
    conditions: { driverType: 'CDL' },
    suggestedCategory: 'ONBOARDING',
  },
  {
    key: 'non_cdl_driver_onboarding',
    displayName: 'Start Non-CDL Driver Onboarding automatically',
    sentence: 'When a non-CDL driver is added, start the non-CDL onboarding checklist.',
    triggerEvent: 'ON_DRIVER_CREATE',
    conditions: { driverType: 'NON_CDL' },
    suggestedCategory: 'ONBOARDING',
  },
  {
    key: 'owner_op_onboarding',
    displayName: 'Start Owner-Operator Onboarding automatically',
    sentence: 'When an owner-operator is added, start the owner-op onboarding checklist.',
    triggerEvent: 'ON_DRIVER_CREATE',
    conditions: { driverType: 'OWNER_OP' },
    suggestedCategory: 'ONBOARDING',
  },
  {
    key: 'pre_trip_inspection',
    displayName: 'Assign Pre-Trip Inspection on every dispatch',
    sentence: 'When a dispatch is created, assign the pre-trip inspection.',
    triggerEvent: 'ON_DISPATCH_CREATE',
    conditions: {},
    suggestedCategory: 'VEHICLE_INSPECTION',
  },
  {
    key: 'post_trip_inspection',
    displayName: 'Assign Post-Trip Inspection after every delivery',
    sentence: 'When a dispatch is delivered, assign the post-trip inspection.',
    triggerEvent: 'ON_DISPATCH_DELIVER',
    conditions: {},
    suggestedCategory: 'VEHICLE_INSPECTION',
  },
  {
    key: 'new_vehicle_intake',
    displayName: 'New truck intake checklist',
    sentence: 'When a new truck is added, start the intake checklist.',
    triggerEvent: 'ON_VEHICLE_CREATE',
    conditions: {},
    suggestedCategory: 'VEHICLE_INSPECTION',
  },
  {
    key: 'partner_onboarding',
    displayName: 'Start partner onboarding when a new broker is added',
    sentence: 'When a new partner is added, start the partner onboarding checklist.',
    triggerEvent: 'ON_PARTNER_CREATE',
    conditions: {},
    suggestedCategory: 'PARTNER',
  },
];

/** Lookup helper used by trigger router's enableRecipe mutation. */
export function getRecipeByKey(key: string): Recipe | undefined {
  return RECIPES.find((r) => r.key === key);
}
