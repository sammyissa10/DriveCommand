/**
 * Single source of truth for a carrier driver's design-system display status.
 * Used by the Drivers Overview (mobile-web) — and available to Detail — so the
 * status pill reads identically everywhere (see mobile-design-system §6).
 *
 * The carrier portal has no Hours-of-Service data (that lives on the owner app's
 * DriverHOSEntry, keyed by User). The dispatch question "who can take this load"
 * is therefore answered from what the carrier schema DOES have: whether the
 * driver is on an active dispatch, whether their account has been accepted, and
 * their stored status. Compliance (CDL expiry) drives the warning tint — the
 * field state that actually costs the owner money (§8 Q5).
 */

// A dispatch (Trip) is "active" only while in progress — see truck-status.ts.
export { ACTIVE_DISPATCH_STATUSES } from './truck-status';

/**
 * The three duty buckets shown on the Overview (matching the design mockup:
 * Driving / On Duty / Off Duty). Sleeper/off collapse into Off Duty.
 */
export type DriverDuty = 'driving' | 'on_duty' | 'off_duty';

export interface DriverDutyInput {
  /** Current open DriverHOSEntry status via the linked User, or null. */
  openHosStatus: string | null;
  /** True when the driver has a dispatch (Trip) currently in progress. */
  hasActiveDispatch: boolean;
  /** True when the linked account is accepted + active (available for dispatch). */
  accountActive: boolean;
}

/**
 * Duty status for a carrier driver, best-signal-first:
 *   1. Real HOS wins when the driver is logged DRIVING or ON_DUTY right now.
 *   2. No live HOS → on an active dispatch means they're out driving a load.
 *   3. Otherwise an accepted/active roster member is on duty (available to dispatch).
 *   4. Everyone else (invited, inactive, sleeper, off) is off duty.
 *
 * Carrier HOS logging is sparse, so we fall back to dispatch/roster state rather
 * than showing an all-"Off Duty" board when nobody has punched a duty status.
 */
export function computeDriverDuty({
  openHosStatus,
  hasActiveDispatch,
  accountActive,
}: DriverDutyInput): DriverDuty {
  if (openHosStatus === 'DRIVING') return 'driving';
  if (openHosStatus === 'ON_DUTY') return 'on_duty';
  if (hasActiveDispatch) return 'driving';
  if (accountActive) return 'on_duty';
  return 'off_duty';
}

const DAY_MS = 86_400_000;

export interface CdlCompliance {
  /** Warning-worthy: CDL expired or expiring within 30 days. Drives the avatar dot. */
  warn: boolean;
  /** Short urgent fact for the meta line, or null when nothing is urgent. */
  fact: string | null;
  /** Tint for the fact — danger when expired, warning when expiring soon. */
  tone: 'warning' | 'danger' | null;
}

/**
 * The single most urgent CDL fact for a driver, computed server-side.
 * Returns nulls when the CDL is valid (or absent) so the caller can fall back to
 * a calmer meta line.
 */
export function cdlCompliance(cdlExpiry: Date | string | null | undefined, now: number = Date.now()): CdlCompliance {
  if (!cdlExpiry) return { warn: false, fact: null, tone: null };
  const days = Math.ceil((new Date(cdlExpiry).getTime() - now) / DAY_MS);
  if (days < 0) return { warn: true, fact: 'CDL expired', tone: 'danger' };
  if (days <= 30) return { warn: true, fact: `CDL expires in ${days}d`, tone: 'warning' };
  return { warn: false, fact: null, tone: null };
}
