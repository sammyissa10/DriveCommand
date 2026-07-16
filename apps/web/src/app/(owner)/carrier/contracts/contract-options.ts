/**
 * Shared option sets for the carrier-contract mobile-web forms (detail edit +
 * create). Single source so the two ds surfaces can't drift — mirrors the
 * desktop `components/carrier/contracts/ContractForm.tsx` value lists.
 */

export const CONTRACT_TYPES = [
  { value: 'spot', label: 'Spot' },
  { value: 'contract', label: 'Contract' },
  { value: 'dedicated', label: 'Dedicated' },
];

export const RATE_TYPES = [
  { value: 'per_mile', label: 'Per Mile' },
  { value: 'per_load', label: 'Per Load' },
  { value: 'per_hour', label: 'Per Hour' },
  { value: 'per_stop', label: 'Per Stop' },
  { value: 'flat', label: 'Flat Rate' },
  { value: 'per_cwt', label: 'Per CWT' },
  { value: 'per_pallet', label: 'Per Pallet' },
  { value: 'hourly', label: 'Hourly' },
];

export const FUEL_SURCHARGE_METHODS = [
  { value: 'none', label: 'None' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'per_mile', label: 'Per Mile' },
  { value: 'table', label: 'Table' },
];

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'draft', label: 'Draft' },
];

export const PAYMENT_TERMS = [
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_45', label: 'Net 45' },
  { value: 'net_60', label: 'Net 60' },
  { value: 'net_90', label: 'Net 90' },
  { value: 'due_on_receipt', label: 'Due on Receipt' },
];

export const YES_NO = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];
