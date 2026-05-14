'use client';

/**
 * ExportPayrollButton — Opens the Export Payroll modal.
 *
 * Props:
 *   eligibleSettlementIds: string[] — server-computed eligible IDs
 *                                     (FINALIZED|PAID, deletedAt null, snapshot present)
 *   eligibleTotal: string           — pre-computed decimal total (e.g. "641.13")
 *
 * VOIDED, DRAFT, soft-deleted, and snapshot-null settlements are excluded by the
 * server-side eligibility query in settlements/page.tsx before being passed here.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { ExportPayrollModal } from './ExportPayrollModal';

interface ExportPayrollButtonProps {
  eligibleSettlementIds: string[];
  eligibleTotal: string;
}

export function ExportPayrollButton({ eligibleSettlementIds, eligibleTotal }: ExportPayrollButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        className="gap-1"
        onClick={() => setOpen(true)}
        disabled={eligibleSettlementIds.length === 0}
      >
        <Download className="h-4 w-4" />
        Export Payroll
      </Button>

      <ExportPayrollModal
        open={open}
        onOpenChange={setOpen}
        eligibleSettlementIds={eligibleSettlementIds}
        eligibleTotal={eligibleTotal}
      />
    </>
  );
}
