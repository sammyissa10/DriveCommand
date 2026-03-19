/**
 * Strip county and country components from a stored address string for clean display.
 * e.g. "Hollywood, Los Angeles, Los Angeles County, California, 90028, United States"
 *   → "Hollywood, Los Angeles, California, 90028"
 */
export function formatAddress(address: string): string {
  return address
    .split(',')
    .map((p) => p.trim())
    .filter((p) => !/ County$/i.test(p) && !/^United States$/i.test(p))
    .join(', ');
}
