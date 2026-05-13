'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, CheckCircle, Loader2, XCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  approvedCount: number;
  approvedTotal: string;
}

interface GenerateResult {
  settlement: {
    id: string;
    driverId: string;
    netPay: string;
    settlementReference: string;
  };
  assignmentCount: number;
  bonusCount: number;
  deductionCount: number;
}

interface Conflict {
  driverId: string;
  reason: string;
  conflictingSettlementId?: string;
}

interface Props {
  drivers: Driver[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLastMonday(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const daysToLastMonday = dayOfWeek === 0 ? 7 : dayOfWeek; // Sunday = go back 7
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysToLastMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getLastSunday(): Date {
  const monday = getLastMonday();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatMoney(val: string): string {
  const n = parseFloat(val);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function driverName(driver: Driver): string {
  return `${driver.firstName} ${driver.lastName}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerateSettlementsModal({ drivers }: Props) {
  const router = useRouter();

  // Form state
  const [periodStart, setPeriodStart] = useState(toDateInput(getLastMonday()));
  const [periodEnd, setPeriodEnd] = useState(toDateInput(getLastSunday()));
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(
    new Set(drivers.map((d) => d.id)),
  );

  // Submit state
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<GenerateResult[] | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggleDriver = useCallback((id: string) => {
    setSelectedDriverIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedDriverIds.size === drivers.length) {
      setSelectedDriverIds(new Set());
    } else {
      setSelectedDriverIds(new Set(drivers.map((d) => d.id)));
    }
  }, [drivers, selectedDriverIds.size]);

  // Compute estimated totals
  const selectedDrivers = drivers.filter((d) => selectedDriverIds.has(d.id));
  const totalEstimated = selectedDrivers.reduce(
    (sum, d) => sum + parseFloat(d.approvedTotal || '0'),
    0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDriverIds.size === 0) return;

    setIsLoading(true);
    setError(null);
    setResults(null);
    setConflicts([]);

    try {
      const res = await fetch('/api/driver-pay/settlements/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverIds: Array.from(selectedDriverIds),
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const data = (await res.json()) as {
        results: GenerateResult[];
        conflicts: Conflict[];
        error?: string;
      };

      if (!res.ok && data.error && data.results === undefined) {
        setError(data.error);
      } else {
        setResults(data.results ?? []);
        setConflicts(data.conflicts ?? []);
      }
    } catch {
      setError('Failed to generate settlements. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Driver name lookup for results
  const driverMap = new Map(drivers.map((d) => [d.id, d]));

  // If results are shown, display results panel
  if (results !== null) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {results.map((r) => {
            const driver = driverMap.get(r.settlement.driverId);
            return (
              <Card key={r.settlement.id} className="border-emerald-200 dark:border-emerald-800">
                <CardContent className="flex items-start gap-3 pt-4">
                  <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {driver ? driverName(driver) : r.settlement.driverId.slice(0, 8)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Draft created · Net Pay{' '}
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(r.settlement.netPay)}
                      </span>{' '}
                      · {r.assignmentCount} load{r.assignmentCount !== 1 ? 's' : ''}
                    </p>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() =>
                        router.push(`/carrier/driver-pay/settlements/${r.settlement.id}`)
                      }
                    >
                      View settlement
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {conflicts.map((c) => {
            const driver = driverMap.get(c.driverId);
            return (
              <Card key={c.driverId} className="border-amber-200 dark:border-amber-800">
                <CardContent className="flex items-start gap-3 pt-4">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {driver ? driverName(driver) : c.driverId.slice(0, 8)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Already has a finalized settlement for this period
                    </p>
                    {c.conflictingSettlementId && (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() =>
                          router.push(
                            `/carrier/driver-pay/settlements/${c.conflictingSettlementId}`,
                          )
                        }
                      >
                        View conflicting settlement
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {results.length === 0 && conflicts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No settlements were generated. Drivers may have no approved assignments in this period.
            </p>
          )}
        </div>

        <Button
          className="w-full"
          variant="outline"
          onClick={() => router.push('/carrier/driver-pay/settlements')}
        >
          View All Settlements
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Period */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="period-start">Period Start</Label>
          <Input
            id="period-start"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="period-end">Period End</Label>
          <Input
            id="period-end"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Driver selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Drivers</Label>
          <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
            {selectedDriverIds.size === drivers.length ? 'Deselect all' : 'Select all'}
          </Button>
        </div>

        {drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No drivers with approved assignments in this period.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto rounded-md border p-3">
            {drivers.map((d) => (
              <div key={d.id} className="flex items-center gap-3">
                <Switch
                  id={`driver-${d.id}`}
                  checked={selectedDriverIds.has(d.id)}
                  onCheckedChange={() => toggleDriver(d.id)}
                  aria-label={`Include ${driverName(d)}`}
                />
                <Label
                  htmlFor={`driver-${d.id}`}
                  className="flex-1 cursor-pointer font-normal"
                >
                  <span className="font-medium">{driverName(d)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({d.approvedCount} load{d.approvedCount !== 1 ? 's' : ''} ·{' '}
                    {formatMoney(d.approvedTotal)} pending)
                  </span>
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview summary */}
      {selectedDriverIds.size > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="flex justify-between items-center py-3 px-4">
            <p className="text-sm text-muted-foreground">
              {selectedDriverIds.size} driver{selectedDriverIds.size !== 1 ? 's' : ''} ·{' '}
              {selectedDrivers.reduce((sum, d) => sum + d.approvedCount, 0)} loads pending
            </p>
            <p className="font-semibold text-foreground">
              est. {formatMoney(totalEstimated.toFixed(2))}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        disabled={isLoading || selectedDriverIds.size === 0}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating settlements...
          </>
        ) : (
          `Generate ${selectedDriverIds.size > 0 ? selectedDriverIds.size : ''} Settlement${selectedDriverIds.size !== 1 ? 's' : ''}`
        )}
      </Button>
    </form>
  );
}
