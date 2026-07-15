'use client';

// ---------------------------------------------------------------------------
// LoadFinancials — client-side financial preview
// The arithmetic lives in lib/carrier/revenue-preview.ts, shared with the
// mobile-web ds financials card. revenue-calculator.ts (server) can't be imported
// here because it pulls in prisma — revenue-preview is its client-safe twin.
// ---------------------------------------------------------------------------

import { calculateRevenuePreview, type RevenuePreviewInput } from '@/lib/carrier/revenue-preview';

type LoadFinancialsProps = RevenuePreviewInput;

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function LoadFinancials(props: LoadFinancialsProps) {
  const { baseRevenue, baseNote, fuelSurcharge, fscNote, other, totalRevenue, grossMargin } =
    calculateRevenuePreview(props);

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
