'use client';

// ---------------------------------------------------------------------------
// LoadFinancials — client-side financial preview
// NOTE: Cannot import revenue-calculator.ts (it imports prisma).
// The calculateRevenue logic is replicated inline here.
// ---------------------------------------------------------------------------

interface LoadFinancialsProps {
  rateType?: string;
  rateAmount?: number;
  weightLbs?: number;
  pallets?: number;
  otherCharges?: number;
  fuelSurchargeMethod?: string;
  fuelSurchargeRate?: number;
  brokerFlag?: boolean;
  carrierCost?: number;
  plannedMiles?: number;
  deliveryStopCount?: number;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// Replicated from apps/web/src/lib/carrier/revenue-calculator.ts
function calculateRevenue(props: LoadFinancialsProps) {
  const {
    rateType = 'flat',
    rateAmount = 0,
    weightLbs = 0,
    pallets = 0,
    otherCharges = 0,
    fuelSurchargeMethod = 'none',
    fuelSurchargeRate = 0,
    brokerFlag = false,
    carrierCost = 0,
  } = props;

  const amount = Number(rateAmount) || 0;
  const weight = Number(weightLbs) || 0;
  const pals = Number(pallets) || 0;

  let baseRevenue = 0;
  let baseNote: string | null = null;

  switch (rateType) {
    case 'flat':
      baseRevenue = amount;
      break;
    case 'per_cwt':
      baseRevenue = amount * (weight / 100);
      break;
    case 'per_pallet':
      baseRevenue = amount * pals;
      break;
    case 'hourly':
      baseRevenue = amount * 8; // hardcoded default 8 hours
      baseNote = '(8 hr default)';
      break;
    case 'per_mile': {
      const miles = Number(props.plannedMiles) || 0;
      baseRevenue = amount * miles;
      if (miles === 0) {
        baseNote = '(enter planned miles)';
      }
      break;
    }
    case 'per_stop': {
      const stopCount = Number(props.deliveryStopCount) || 0;
      baseRevenue = amount * stopCount;
      if (stopCount === 0) {
        baseNote = '(add delivery stops)';
      }
      break;
    }
    default:
      baseRevenue = amount;
  }

  let fuelSurcharge = 0;
  let fscNote: string | null = null;
  const fscRate = Number(fuelSurchargeRate) || 0;

  if (fuelSurchargeMethod && fuelSurchargeMethod !== 'none') {
    if (fuelSurchargeMethod === 'percent_of_linehaul') {
      fuelSurcharge = baseRevenue * fscRate;
    } else if (fuelSurchargeMethod === 'per_mile') {
      const miles = Number(props.plannedMiles) || 0;
      fuelSurcharge = miles * fscRate;
      if (miles === 0) {
        fscNote = 'per-mile FSC (enter planned miles)';
      }
    }
  }

  const other = Number(otherCharges) || 0;
  const totalRevenue = baseRevenue + fuelSurcharge + other;

  let grossMargin: number | null = null;
  if (brokerFlag) {
    grossMargin = totalRevenue - (Number(carrierCost) || 0);
  }

  return { baseRevenue, baseNote, fuelSurcharge, fscNote, other, totalRevenue, grossMargin };
}

export function LoadFinancials(props: LoadFinancialsProps) {
  const { baseRevenue, baseNote, fuelSurcharge, fscNote, other, totalRevenue, grossMargin } =
    calculateRevenue(props);

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
      <h4 className="text-sm font-semibold text-foreground">Financial Preview</h4>

      {/* Base revenue — always show */}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">
          Base Revenue{baseNote ? <span className="ml-1 text-xs italic">{baseNote}</span> : null}
        </span>
        <span className="tabular-nums">{formatCurrency(baseRevenue)}</span>
      </div>

      {/* FSC — only show if non-zero or has a note */}
      {(fuelSurcharge !== 0 || fscNote) && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Fuel Surcharge{fscNote ? <span className="ml-1 text-xs italic">{fscNote}</span> : null}
          </span>
          <span className="tabular-nums">{fscNote ? '—' : formatCurrency(fuelSurcharge)}</span>
        </div>
      )}

      {/* Accessorial / Other — only show if non-zero */}
      {other !== 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Accessorial / Other</span>
          <span className="tabular-nums">{formatCurrency(other)}</span>
        </div>
      )}

      {/* Total — always show */}
      <div className="flex justify-between text-sm font-bold border-t border-border pt-2 mt-2">
        <span>Invoice Total</span>
        <span className="tabular-nums">{formatCurrency(totalRevenue)}</span>
      </div>

      {/* Gross margin (broker only) — always show when broker mode active */}
      {props.brokerFlag && (
        <div className={`flex justify-between text-sm font-medium ${grossMargin != null && grossMargin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          <span>Gross Margin</span>
          <span className="tabular-nums">{grossMargin != null ? formatCurrency(grossMargin) : '—'}</span>
        </div>
      )}
    </div>
  );
}
