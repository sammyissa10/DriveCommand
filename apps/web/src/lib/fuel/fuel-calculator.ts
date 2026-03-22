/**
 * Fuel Calculator Utility
 *
 * Converts FuelRecord data into MPG, cost-per-mile, and CO2 emissions metrics.
 * Provides efficiency color/label helpers for UI display.
 */

/**
 * EPA standard: burning 1 gallon of diesel produces ~8.887 kg CO2
 */
export const CO2_KG_PER_GALLON_DIESEL = 8.887;

/**
 * For simplicity, use same CO2 factor for gasoline
 * (actual is ~8.887 kg CO2/gallon, seed data is all DIESEL)
 */
export const CO2_KG_PER_GALLON_GASOLINE = 8.887;

/**
 * Estimated diesel cost for idling: ~0.8 gal/hr * ~$4.00/gal = ~$3.50/hr
 */
export const IDLE_COST_PER_HOUR = 3.5;

/**
 * Calculate CO2 emissions from fuel consumption
 *
 * @param gallons - Gallons of fuel consumed
 * @param fuelType - Type of fuel (defaults to diesel)
 * @returns CO2 emissions in kilograms, rounded to 1 decimal
 *
 * @example
 * calculateCO2Emissions(100) // Returns 888.7 (100 * 8.887)
 */
export function calculateCO2Emissions(
  gallons: number,
  fuelType?: string
): number {
  const co2PerGallon = CO2_KG_PER_GALLON_DIESEL; // Same for both fuel types
  return Number((gallons * co2PerGallon).toFixed(1));
}

/**
 * Calculate cost per mile
 *
 * @param totalCost - Total fuel cost in dollars
 * @param totalMiles - Total miles driven
 * @returns Cost per mile in dollars, rounded to 2 decimals
 *
 * @example
 * calculateCostPerMile(400, 1000) // Returns 0.40
 */
export function calculateCostPerMile(
  totalCost: number,
  totalMiles: number
): number {
  if (totalMiles === 0) return 0;
  return Number((totalCost / totalMiles).toFixed(2));
}

/**
 * Calculate miles per gallon (MPG)
 *
 * @param totalMiles - Total miles driven
 * @param totalGallons - Total gallons consumed
 * @returns MPG rounded to 1 decimal
 *
 * @example
 * calculateMPG(600, 100) // Returns 6.0
 */
export function calculateMPG(totalMiles: number, totalGallons: number): number {
  if (totalGallons === 0) return 0;
  return Number((totalMiles / totalGallons).toFixed(1));
}

/**
 * Get Tailwind text color class for fuel efficiency
 *
 * Fleet trucks typically average 5-8 MPG:
 * - >=7: Excellent (green)
 * - >=5.5: Good (yellow)
 * - >=4: Below Average (orange)
 * - <4: Poor (red)
 *
 * @param mpg - Miles per gallon
 * @returns Tailwind text color class
 */
export function getEfficiencyColor(mpg: number): string {
  if (mpg >= 7) return 'text-green-600';
  if (mpg >= 5.5) return 'text-yellow-600';
  if (mpg >= 4) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Get human-readable label for fuel efficiency
 *
 * @param mpg - Miles per gallon
 * @returns Label string (Excellent, Good, Below Average, Poor)
 */
export function getEfficiencyLabel(mpg: number): string {
  if (mpg >= 7) return 'Excellent';
  if (mpg >= 5.5) return 'Good';
  if (mpg >= 4) return 'Below Average';
  return 'Poor';
}

/**
 * Format CO2 emissions for display
 *
 * @param kg - CO2 emissions in kilograms
 * @returns Human-readable string (e.g., "1.2 tons" or "500.0 kg")
 *
 * @example
 * formatCO2(1500) // Returns "1.5 tons"
 * formatCO2(800)  // Returns "800.0 kg"
 */
export function formatCO2(kg: number): string {
  if (kg >= 1000) {
    const tons = (kg / 1000).toFixed(1);
    return `${tons} tons`;
  }
  return `${kg.toFixed(1)} kg`;
}
