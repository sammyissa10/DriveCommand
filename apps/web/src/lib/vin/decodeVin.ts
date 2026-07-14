/**
 * VIN decoder for the carrier fleet — resolves make / model / year (and a best-
 * guess truck type) from a 17-character VIN via the free NHTSA vPIC API.
 *
 *   https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json
 *
 * No key, no sign-up. Returns `null` on any failure (offline, unknown VIN,
 * partial data) so callers degrade gracefully to manual entry on the Detail
 * page. Never throws.
 */

export interface VinDecodeResult {
  make: string;
  model: string;
  year: number | null;
  /** Mapped to our truckType enum when the body class is recognisable. */
  truckType?: string;
}

const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

/** NHTSA returns makes in ALL CAPS ("PETERBILT"); present them as "Peterbilt". */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

/** Map an NHTSA Body Class string to our truckType enum, or undefined. */
function mapBodyClassToTruckType(bodyClass: string): string | undefined {
  const bc = bodyClass.toLowerCase();
  if (bc.includes('tractor')) return 'day_cab';
  if (bc.includes('truck') && bc.includes('box')) return 'box_truck';
  if (bc.includes('truck') && bc.includes('flat')) return 'flatbed';
  if (bc.includes('truck')) return 'semi';
  return undefined;
}

interface VpicRow {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  BodyClass?: string;
  ErrorCode?: string;
}

/**
 * Decode a VIN into make/model/year, or `null` if it can't be resolved.
 * Pass an AbortSignal to cancel an in-flight request when the VIN changes.
 */
export async function decodeVin(
  vin: string,
  signal?: AbortSignal,
): Promise<VinDecodeResult | null> {
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17) return null;

  try {
    const res = await fetch(`${VPIC_URL}/${encodeURIComponent(clean)}?format=json`, {
      signal,
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { Results?: VpicRow[] };
    const row = json?.Results?.[0];
    if (!row) return null;

    // vPIC returns ErrorCode "0" on a clean decode; anything else = no data.
    if (row.ErrorCode && !row.ErrorCode.startsWith('0')) return null;

    const make = titleCase(String(row.Make ?? '').trim());
    const model = String(row.Model ?? '').trim();
    const yearNum = parseInt(String(row.ModelYear ?? ''), 10);

    // Need at least a make + model to be worth confirming; otherwise fall back
    // to manual entry so we never show a half-empty confirmation line.
    if (!make || !model) return null;

    return {
      make,
      model,
      year: Number.isFinite(yearNum) ? yearNum : null,
      truckType: mapBodyClassToTruckType(String(row.BodyClass ?? '')),
    };
  } catch {
    return null;
  }
}
