'use client';

/**
 * ExportPayrollButton — Opens the Export Payroll modal.
 *
 * Props:
 *   settlementIds: string[] — all currently-shown settlement IDs
 *
 * For v1, exports all shown settlements (no per-row checkbox UI required).
 * Mount in the settlements page header alongside "Generate Settlements".
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { ExportPayrollModal } from './ExportPayrollModal';

interface ExportPayrollButtonProps {
  settlementIds: string[];
}

export function ExportPayrollButton({ settlementIds }: ExportPayrollButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        className="gap-1"
        onClick={() => setOpen(true)}
        disabled={settlementIds.length === 0}
      >
        <Download className="h-4 w-4" />
        Export Payroll
      </Button>

      <ExportPayrollModal
        open={open}
        onOpenChange={setOpen}
        settlementIds={settlementIds}
      />
    </>
  );
}
