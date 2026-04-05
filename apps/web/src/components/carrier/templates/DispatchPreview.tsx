'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DispatchItem {
  id: string;
  scheduledDeparture: string;
  primaryDriverId: string;
  truckId: string;
}

interface GenerateResult {
  dispatches_created: number;
  skipped_existing: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function getThroughDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14); // 2 weeks ahead
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DispatchPreviewProps {
  templateId: string;
}

export function DispatchPreview({ templateId }: DispatchPreviewProps) {
  const [dispatches, setDispatches] = useState<DispatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchDispatches = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/carrier/dispatches?route_template_id=${templateId}&pageSize=50`
      );
      if (!res.ok) return;
      const data = await res.json();
      setDispatches((data.data?.items ?? []) as DispatchItem[]);
    } catch {
      // Silently ignore
    }
  }, [templateId]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setGenerateResult(null);
    try {
      const throughDate = getThroughDate();
      const res = await fetch(`/api/v1/carrier/route-templates/${templateId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generate_through_date: throughDate }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to generate dispatches');
      }

      const data = await res.json();
      const result = data.data as GenerateResult;
      setGenerateResult(result);

      if (result.dispatches_created > 0) {
        toast.success(
          `${result.dispatches_created} dispatch${result.dispatches_created !== 1 ? 'es' : ''} generated`
        );
      } else if (result.skipped_existing > 0) {
        toast.info(`All upcoming dispatches already exist (${result.skipped_existing} skipped)`);
      }

      await fetchDispatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate dispatches');
    } finally {
      setLoading(false);
    }
  }, [templateId, fetchDispatches]);

  // Load existing dispatches on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchDispatches();
      setHasLoaded(true);
      setLoading(false);
    }
    init();
  }, [fetchDispatches]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Dispatch Preview</h3>
          <p className="text-sm text-muted-foreground">
            Auto-generated dispatches from this template.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Regenerate
        </Button>
      </div>

      {/* Generate result summary */}
      {generateResult && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {generateResult.dispatches_created} dispatch
          {generateResult.dispatches_created !== 1 ? 'es' : ''} created &mdash;&nbsp;
          {generateResult.skipped_existing} skipped (already exist)
          {generateResult.errors > 0 && (
            <span className="ml-2 text-destructive">
              &mdash; {generateResult.errors} error{generateResult.errors !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Date', 'Day', 'Dispatch ID', 'Driver', 'Truck'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-muted animate-pulse w-20" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : hasLoaded && dispatches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No dispatches generated yet. Click &ldquo;Regenerate&rdquo; to generate dispatches for
            the next 14 days.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Day</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Dispatch ID
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Driver</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Truck</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dispatches.map((d) => {
                  const date = new Date(d.scheduledDeparture);
                  return (
                    <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(d.scheduledDeparture)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {date.toLocaleDateString(undefined, { weekday: 'long' })}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {d.id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {d.primaryDriverId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {d.truckId.slice(0, 8)}…
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
