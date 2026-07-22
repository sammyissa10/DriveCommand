/**
 * "How did you hear about us?" acquisition-channel options.
 *
 * Shared by the signup form (client) and the SysAdmin tenant detail (server) so
 * the stored key and its human label never drift. The stored value is the
 * option `value` (a stable key); "other" carries a free-text detail.
 */
export const HEARD_ABOUT_OPTIONS = [
  { value: 'google_search', label: 'Google search' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social media' },
  { value: 'industry_event', label: 'Industry event' },
  { value: 'other', label: 'Other' },
] as const;

export const HEARD_ABOUT_OTHER = 'other';

export type HeardAboutValue = (typeof HEARD_ABOUT_OPTIONS)[number]['value'];

const LABELS: Record<string, string> = Object.fromEntries(
  HEARD_ABOUT_OPTIONS.map((o) => [o.value, o.label]),
);

/** Human label for a stored key; falls back to the raw value, or null if empty. */
export function heardAboutLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return LABELS[value] ?? value;
}
