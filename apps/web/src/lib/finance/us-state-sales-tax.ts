/**
 * US statewide BASE sales-tax rates (percent), for use as an invoice tax-rate
 * *convenience* only — a carrier picks a state and the invoice tax % is filled
 * from this table. It is deliberately opt-in: the default is "exempt" (no tax),
 * and nothing is applied until a state is chosen.
 *
 * IMPORTANT — read before trusting these numbers:
 *  - Interstate freight transportation is generally NOT sales-taxable. These
 *    rates apply to taxable goods/services, not the linehaul itself. Only pick
 *    a state when the invoice genuinely has taxable charges.
 *  - These are STATEWIDE BASE rates only. County / city / special-district
 *    local taxes are NOT included, so the true combined rate is often higher.
 *  - Rates change. Treat this as an editable reference table, not a compliance
 *    source of truth. For real multi-jurisdiction accuracy use a tax API
 *    (Avalara / TaxJar) instead of this table.
 *  - The carrier can always override the % on the invoice after selecting.
 *
 * States with no statewide sales tax (AK, DE, MT, NH, OR) are 0.
 */
export interface StateSalesTaxRate {
  /** USPS two-letter code. */
  code: string;
  name: string;
  /** Statewide base rate as a percent, e.g. 7.25 for California. */
  rate: number;
}

// TODO(tax-rates): statewide base rates drift over time. Review this table each
// Jan 1 and Jul 1 (when most rate changes take effect). Last reviewed 2026-07-17;
// next review due 2027-01-01. Source of truth for real filing is a tax API
// (Avalara / TaxJar), not this table — see README.md in this directory.
export const US_STATE_SALES_TAX: StateSalesTaxRate[] = [
  { code: 'AL', name: 'Alabama', rate: 4.0 },
  { code: 'AK', name: 'Alaska', rate: 0.0 },
  { code: 'AZ', name: 'Arizona', rate: 5.6 },
  { code: 'AR', name: 'Arkansas', rate: 6.5 },
  { code: 'CA', name: 'California', rate: 7.25 },
  { code: 'CO', name: 'Colorado', rate: 2.9 },
  { code: 'CT', name: 'Connecticut', rate: 6.35 },
  { code: 'DE', name: 'Delaware', rate: 0.0 },
  { code: 'DC', name: 'District of Columbia', rate: 6.0 },
  { code: 'FL', name: 'Florida', rate: 6.0 },
  { code: 'GA', name: 'Georgia', rate: 4.0 },
  { code: 'HI', name: 'Hawaii', rate: 4.0 },
  { code: 'ID', name: 'Idaho', rate: 6.0 },
  { code: 'IL', name: 'Illinois', rate: 6.25 },
  { code: 'IN', name: 'Indiana', rate: 7.0 },
  { code: 'IA', name: 'Iowa', rate: 6.0 },
  { code: 'KS', name: 'Kansas', rate: 6.5 },
  { code: 'KY', name: 'Kentucky', rate: 6.0 },
  { code: 'LA', name: 'Louisiana', rate: 5.0 },
  { code: 'ME', name: 'Maine', rate: 5.5 },
  { code: 'MD', name: 'Maryland', rate: 6.0 },
  { code: 'MA', name: 'Massachusetts', rate: 6.25 },
  { code: 'MI', name: 'Michigan', rate: 6.0 },
  { code: 'MN', name: 'Minnesota', rate: 6.875 },
  { code: 'MS', name: 'Mississippi', rate: 7.0 },
  { code: 'MO', name: 'Missouri', rate: 4.225 },
  { code: 'MT', name: 'Montana', rate: 0.0 },
  { code: 'NE', name: 'Nebraska', rate: 5.5 },
  { code: 'NV', name: 'Nevada', rate: 6.85 },
  { code: 'NH', name: 'New Hampshire', rate: 0.0 },
  { code: 'NJ', name: 'New Jersey', rate: 6.625 },
  { code: 'NM', name: 'New Mexico', rate: 4.875 },
  { code: 'NY', name: 'New York', rate: 4.0 },
  { code: 'NC', name: 'North Carolina', rate: 4.75 },
  { code: 'ND', name: 'North Dakota', rate: 5.0 },
  { code: 'OH', name: 'Ohio', rate: 5.75 },
  { code: 'OK', name: 'Oklahoma', rate: 4.5 },
  { code: 'OR', name: 'Oregon', rate: 0.0 },
  { code: 'PA', name: 'Pennsylvania', rate: 6.0 },
  { code: 'RI', name: 'Rhode Island', rate: 7.0 },
  { code: 'SC', name: 'South Carolina', rate: 6.0 },
  { code: 'SD', name: 'South Dakota', rate: 4.2 },
  { code: 'TN', name: 'Tennessee', rate: 7.0 },
  { code: 'TX', name: 'Texas', rate: 6.25 },
  { code: 'UT', name: 'Utah', rate: 6.1 },
  { code: 'VT', name: 'Vermont', rate: 6.0 },
  { code: 'VA', name: 'Virginia', rate: 5.3 },
  { code: 'WA', name: 'Washington', rate: 6.5 },
  { code: 'WV', name: 'West Virginia', rate: 6.0 },
  { code: 'WI', name: 'Wisconsin', rate: 5.0 },
  { code: 'WY', name: 'Wyoming', rate: 4.0 },
];

/** Look up a statewide base rate by USPS code. Returns undefined if unknown. */
export function getStateSalesTaxRate(code: string): number | undefined {
  return US_STATE_SALES_TAX.find((s) => s.code === code)?.rate;
}
