'use client';

/**
 * ExportPayrollModal — Pattern E modal for payroll export.
 *
 * Props:
 *   open: boolean — controls modal visibility
 *   onOpenChange: (open: boolean) => void
 *   eligibleSettlementIds: string[] — server-computed eligible IDs (FINALIZED|PAID, snapshot present)
 *   eligibleTotal: string           — decimal string like "641.13" (computed via decimal.js server-side)
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type ExportFormat = 'generic_csv' | 'quickbooks' | 'adp' | 'gusto';
type EmploymentType = 'W2_EMPLOYEE' | 'OWNER_OPERATOR_1099' | 'BOTH';

interface ExportPayrollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eligibleSettlementIds: string[];
  eligibleTotal: string;
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  generic_csv: 'Generic CSV',
  quickbooks: 'QuickBooks',
  adp: 'ADP',
  gusto: 'Gusto',
};

const EMP_TYPE_LABELS: Record<EmploymentType, string> = {
  W2_EMPLOYEE: 'W-2 Only',
  OWNER_OPERATOR_1099: '1099 Only',
  BOTH: 'Both (W-2 + 1099)',
};

export function buildConfirmText(count: number, total: string, formatLabel: string): string {
  const noun = count === 1 ? 'settlement' : 'settlements';
  return `Export ${count} ${noun} totaling $${total} in ${formatLabel}?`;
}

export function ExportPayrollModal({ open, onOpenChange, eligibleSettlementIds, eligibleTotal }: ExportPayrollModalProps) {
  const [format, setFormat] = useState<ExportFormat>('generic_csv');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('W2_EMPLOYEE');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const count = eligibleSettlementIds.length;
  const noun = count === 1 ? 'settlement' : 'settlements';
  const confirmText = buildConfirmText(count, eligibleTotal, FORMAT_LABELS[format]);

  async function handleDownload() {
    setIsLoading(true);
    setError(null);
    setDraftIds([]);

    try {
      const res = await fetch('/api/reports/payroll-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, employmentType, settlementIds: eligibleSettlementIds }),
      });

      if (!res.ok) {
        let errBody: { error?: string; draftIds?: string[] } = {};
        try {
          errBody = (await res.json()) as { error?: string; draftIds?: string[] };
        } catch {
          // Non-JSON error response
        }

        if (res.status === 422 && errBody.draftIds && errBody.draftIds.length > 0) {
          setDraftIds(errBody.draftIds);
          setError(errBody.error ?? 'Cannot export DRAFT settlements. Finalize them first.');
        } else {
          setError(errBody.error ?? `Export failed (HTTP ${res.status})`);
        }
        return;
      }

      // Success — trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `payroll_export.${employmentType === 'BOTH' ? 'zip' : 'csv'}`;

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error during export');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Payroll</DialogTitle>
          <DialogDescription>{confirmText}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Format select */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="export-format">Format</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
            >
              <SelectTrigger id="export-format">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(FORMAT_LABELS) as [ExportFormat, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Employment type select */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="export-emp-type">Employment Type</Label>
            <Select
              value={employmentType}
              onValueChange={(v) => setEmploymentType(v as EmploymentType)}
            >
              <SelectTrigger id="export-emp-type">
                <SelectValue placeholder="Select employment type" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(EMP_TYPE_LABELS) as [EmploymentType, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Read-only summary */}
          <p className="text-sm text-muted-foreground">
            Exporting {count} {noun} totaling ${eligibleTotal}
          </p>

          {/* Error display */}
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">{error}</p>
              {draftIds.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-xs mb-1">Draft settlement IDs:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {draftIds.map((id) => (
                      <li key={id} className="font-mono text-xs">
                        {id}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={isLoading || count === 0}>
            {isLoading ? 'Building export...' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
