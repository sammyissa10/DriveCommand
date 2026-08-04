'use client';

/**
 * "Which contract?" — the unresolved-contract step (spec Section 4.2: "Picker.
 * Rate cons offer one-time contract").
 *
 * Two things on this screen and no more: the client's active contracts, and —
 * only for a rate confirmation — the offer to make a one-time contract from the
 * rate printed on the document.
 *
 * THE ONE-TIME CONTRACT IS LABELLED BEFORE IT EXISTS. The proposed name, the
 * rate, and the single-day term are all on screen before the button is pressed,
 * because a contract is a thing that shows up in the client's contract list
 * afterwards and nobody should be surprised by what landed there.
 */

import { useState } from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ContractOption, ContractSlotView } from '@/lib/document-import/resolution';

interface Props {
  importId: string;
  slot: ContractSlotView;
  clientName: string;
  onResolved: (nextView: unknown) => void;
  compact?: boolean;
  onCancel?: () => void;
}

export function contractLabel(c: ContractOption): string {
  return c.contractName?.trim() || c.contractNumber;
}

export function contractRateLabel(c: ContractOption): string | null {
  if (!c.baseRate) return null;
  // Formatted from the string, never parsed into a float for storage — this is
  // display only, and the value it renders came out of a Decimal column.
  const amount = Number(c.baseRate);
  if (!Number.isFinite(amount)) return c.baseRate;
  const money = amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  switch (c.rateType) {
    case 'per_mile':
      return `${money}/mi`;
    case 'per_load':
      return `${money}/load`;
    case 'per_hour':
    case 'hourly':
      return `${money}/hr`;
    case 'per_stop':
      return `${money}/stop`;
    case 'flat':
      return `${money} flat`;
    default:
      return money;
  }
}

export function ContractDecision({ importId, slot, clientName, onResolved, compact, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(slot.spotOffer?.totalRate ?? '');

  async function post(url: string, body: unknown) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: url.endsWith('/resolution') ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not set the contract.');
      onResolved(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the contract.');
      setSaving(false);
    }
  }

  const select = (contractId: string) =>
    post(`/api/v1/carrier/document-imports/${importId}/resolution`, { contractId });

  const createSpot = () =>
    post(`/api/v1/carrier/document-imports/${importId}/resolution/contract`, {
      spot: true,
      baseRate: rate.trim(),
    });

  return (
    <div className={cn('space-y-4', !compact && 'rounded-xl bg-muted/40 p-5')}>
      {!compact ? (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Which contract?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {slot.candidates.length > 0
              ? `${clientName} has ${slot.candidates.length} active contracts.`
              : `${clientName} has no active contract.`}
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ul className="space-y-1">
        {slot.candidates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void select(c.id)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {contractLabel(c)}
                  </span>
                  {c.isOneTime ? (
                    <Badge variant="warning" className="shrink-0">
                      One-time
                    </Badge>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    c.contractNumber,
                    contractRateLabel(c),
                    c.expirationDate ? `to ${c.expirationDate}` : 'no end date',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* ---- The one-time contract, offered only for a rate confirmation ---- */}
      {slot.spotOffer ? (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Make a one-time contract from this rate confirmation
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{slot.spotOffer.detail}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="spot-rate">Flat rate from the document</Label>
            <Input
              id="spot-rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="0.00"
              className="h-11"
            />
            {!slot.spotOffer.totalRate ? (
              <p className="text-xs text-muted-foreground">
                No rate could be read off the document — type the agreed amount.
              </p>
            ) : null}
          </div>

          <dl className="space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">Will be called</dt>
              <dd className="min-w-0 break-words font-medium text-foreground">
                {slot.spotOffer.proposedName}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">Effective</dt>
              <dd className="font-medium text-foreground">
                {slot.spotOffer.effectiveDate} only — one trip, not a standing agreement
              </dd>
            </div>
          </dl>

          <Button
            className="min-h-[44px] w-full"
            onClick={() => void createSpot()}
            disabled={saving || !rate.trim()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create one-time contract
          </Button>
        </div>
      ) : null}

      {slot.candidates.length === 0 && !slot.spotOffer ? (
        <p className="text-sm text-muted-foreground">
          {slot.blockedReason ??
            'There is no active contract for this client. Add one on the client’s page, then come back — this import will be waiting.'}
        </p>
      ) : null}

      {onCancel ? (
        <Button variant="ghost" className="min-h-[44px]" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
