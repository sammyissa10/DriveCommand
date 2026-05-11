'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AddComponentModal } from './add-component-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SerializedComponent = {
  id: string;
  assignmentId: string;
  componentType: string;
  category: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  multiplier: string;
  grossAmount: string;
  isTaxable: boolean;
  isReimbursement: boolean;
  visibleToDriver: boolean;
  notes: string | null;
  enteredBy: string;
  createdAt: string;
};

type Props = {
  assignmentId: string;
  payStatus: string;
  initialComponents: SerializedComponent[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
  'EARNING',
  'BONUS',
  'ACCESSORIAL',
  'ALLOWANCE',
  'REIMBURSEMENT',
  'DEDUCTION',
  'ADJUSTMENT',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  EARNING: 'Earnings',
  BONUS: 'Bonuses',
  ACCESSORIAL: 'Accessorials',
  ALLOWANCE: 'Allowances',
  REIMBURSEMENT: 'Reimbursements',
  DEDUCTION: 'Deductions',
  ADJUSTMENT: 'Adjustments',
};

const TYPE_LABELS: Record<string, string> = {
  BASE_PAY_MILEAGE: 'Base Pay — Mileage',
  BASE_PAY_HOURLY: 'Base Pay — Hourly',
  BASE_PAY_FLAT: 'Base Pay — Flat Rate',
  BASE_PAY_PERCENTAGE: 'Base Pay — % of Revenue',
  BASE_PAY_DAILY: 'Base Pay — Daily',
  FUEL_SURCHARGE: 'Fuel Surcharge',
  OVERTIME: 'Overtime',
  HAZMAT_PREMIUM: 'Hazmat Premium',
  HOLIDAY_PREMIUM: 'Holiday Premium',
  LOAD_COMPLETION_BONUS: 'Load Completion Bonus',
  FUEL_EFFICIENCY_BONUS: 'Fuel Efficiency Bonus',
  DETENTION: 'Detention',
  LAYOVER: 'Layover',
  TONU: 'Truck Ordered Not Used (TONU)',
  STOP_OFF: 'Stop-Off Fee',
  TARP: 'Tarping Fee',
  BREAKDOWN: 'Breakdown Pay',
  PER_DIEM: 'Per Diem',
  LUMPER_REIMBURSEMENT: 'Lumper Reimbursement',
  SCALE_REIMBURSEMENT: 'Scale Ticket Reimbursement',
  FUEL_REIMBURSEMENT: 'Fuel Reimbursement',
  ADVANCE_REPAYMENT: 'Advance Repayment',
  ESCROW_CONTRIBUTION: 'Escrow Contribution',
  FUEL_CARD_DEBT: 'Fuel Card Debt',
  CARGO_CLAIM: 'Cargo Claim',
  EQUIPMENT_DAMAGE: 'Equipment Damage',
  GARNISHMENT: 'Wage Garnishment',
  CHILD_SUPPORT: 'Child Support',
  ADJUSTMENT_POSITIVE: 'Positive Adjustment',
  ADJUSTMENT_NEGATIVE: 'Negative Adjustment',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (diff < 60) return rtf.format(-Math.round(diff), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PayComponentsList({ assignmentId, payStatus, initialComponents }: Props) {
  const [components, setComponents] = useState<SerializedComponent[]>(initialComponents);
  const [showAddModal, setShowAddModal] = useState(false);

  const isPaid = payStatus === 'PAID';

  // Group by category
  const grouped: Record<string, SerializedComponent[]> = {};
  for (const c of components) {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  }

  const grandTotal = components.reduce((sum, c) => sum + Number(c.grossAmount), 0);

  if (components.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          No pay components yet. Base pay will appear automatically when you submit this assignment
          for review.
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isPaid}
          onClick={() => setShowAddModal(true)}
        >
          Add pay component
        </Button>
        <AddComponentModal
          open={showAddModal}
          onOpenChange={setShowAddModal}
          assignmentId={assignmentId}
          onAdded={(c) => setComponents((prev) => [...prev, c as SerializedComponent])}
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Qty × Rate
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.map((cat) => {
                const rows = grouped[cat];
                if (!rows || rows.length === 0) return null;

                const subtotal = rows.reduce((sum, c) => sum + Number(c.grossAmount), 0);
                const isDeduction = cat === 'DEDUCTION';

                return (
                  <>
                    {/* Category heading */}
                    <tr key={`heading-${cat}`} className="bg-muted/40">
                      <td
                        colSpan={4}
                        className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {CATEGORY_LABELS[cat]}
                      </td>
                    </tr>

                    {/* Component rows */}
                    {rows.map((c) => (
                      <tr
                        key={c.id}
                        className={`border-t border-muted/50 hover:bg-muted/20 ${
                          isDeduction ? 'text-destructive' : ''
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <span className="font-medium">
                            {TYPE_LABELS[c.componentType] ?? c.componentType}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span>{c.description}</span>
                          {c.isReimbursement && !c.notes && (
                            <span className="ml-2 rounded px-1.5 py-0.5 text-xs font-medium text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/40">
                              No receipt
                            </span>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Added by {c.enteredBy.slice(0, 8)}&hellip;{' '}
                            {formatRelativeTime(c.createdAt)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right align-top text-muted-foreground">
                          {c.quantity} &times; ${Number(c.rate).toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-right align-top font-medium">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">
                                {isDeduction
                                  ? `−$${Math.abs(Number(c.grossAmount)).toFixed(2)}`
                                  : `$${Number(c.grossAmount).toFixed(2)}`}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <span className="text-xs">
                                {c.quantity} &times; ${Number(c.rate).toFixed(4)} &times;{' '}
                                {c.multiplier} ={' '}
                                {isDeduction
                                  ? `−$${Math.abs(Number(c.grossAmount)).toFixed(2)}`
                                  : `$${Number(c.grossAmount).toFixed(2)}`}
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                    ))}

                    {/* Category subtotal */}
                    <tr key={`subtotal-${cat}`} className="border-t border-muted">
                      <td
                        colSpan={3}
                        className="px-3 py-1 text-xs text-muted-foreground text-right"
                      >
                        Subtotal
                      </td>
                      <td className={`px-3 py-1 text-xs font-medium text-right ${isDeduction ? 'text-destructive' : ''}`}>
                        {isDeduction
                          ? `−$${Math.abs(subtotal).toFixed(2)}`
                          : `$${subtotal.toFixed(2)}`}
                      </td>
                    </tr>
                  </>
                );
              })}

              {/* Grand total */}
              <tr className="border-t-2 border-border">
                <td colSpan={3} className="px-3 py-2 font-semibold text-right">
                  Total
                </td>
                <td className="px-3 py-2 font-semibold text-right">${grandTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={isPaid}
          onClick={() => setShowAddModal(true)}
        >
          Add pay component
        </Button>

        <AddComponentModal
          open={showAddModal}
          onOpenChange={setShowAddModal}
          assignmentId={assignmentId}
          onAdded={(c) => setComponents((prev) => [...prev, c as SerializedComponent])}
        />
      </div>
    </TooltipProvider>
  );
}
