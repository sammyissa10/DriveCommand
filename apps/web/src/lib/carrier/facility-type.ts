import type { StatusTone } from '@/components/ui/ds';

/**
 * Facility type display metadata for the mobile-web design system.
 *
 * Types are authored in the facility form (terminal / yard / warehouse /
 * drop_yard / customer_site). Centralized here so the Overview pill, Detail
 * header, and Create picker all read the same label + tone. `vip` amber is
 * reserved for VIP tags, so it is never used for a facility type.
 */

const FACILITY_TYPE_LABELS: Record<string, string> = {
  terminal: 'Terminal',
  yard: 'Yard',
  warehouse: 'Warehouse',
  drop_yard: 'Drop Yard',
  customer_site: 'Customer Site',
};

const FACILITY_TYPE_TONES: Record<string, StatusTone> = {
  terminal: 'accent',
  warehouse: 'success',
  yard: 'warning',
  drop_yard: 'neutral',
  customer_site: 'neutral',
};

/** Title-case a raw type value we don't have an explicit label for. */
function humanize(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function facilityTypeLabel(type: string | null | undefined): string {
  if (!type) return 'Facility';
  return FACILITY_TYPE_LABELS[type] ?? humanize(type);
}

export function facilityTypeTone(type: string | null | undefined): StatusTone {
  if (!type) return 'neutral';
  return FACILITY_TYPE_TONES[type] ?? 'neutral';
}
