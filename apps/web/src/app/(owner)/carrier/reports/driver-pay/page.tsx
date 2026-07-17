'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { DriverPayDesktop } from './DriverPayDesktop';
import { DriverPayMobile } from './DriverPayMobile';
import type { DriverPayRow } from './driver-pay-report-utils';

export default function DriverPayReportPage() {
  const [rows, setRows] = useState<DriverPayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [driverFilter, setDriverFilter] = useState('');
  const [payPeriodStart, setPayPeriodStart] = useState('');
  const [payPeriodEnd, setPayPeriodEnd] = useState('');
  const [approving, setApproving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (payPeriodStart) params.set('pay_period_start', payPeriodStart);
      if (payPeriodEnd) params.set('pay_period_end', payPeriodEnd);
      params.set('pageSize', '200');
      const res = await fetch(`/api/v1/carrier/reports/driver-pay?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load driver pay report');
      const json = await res.json();
      setRows(json.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [payPeriodStart, payPeriodEnd]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleMarkPaid = useCallback(
    async (id: string) => {
      if (!window.confirm('Mark this pay record as paid? This cannot be undone.')) return;
      setMarkingPaidId(id);
      try {
        const res = await fetch(`/api/v1/carrier/pay-records/${id}/mark-paid`, { method: 'PATCH' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to mark as paid');
        }
        toast.success('Pay record marked as paid');
        fetchRows();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to mark pay record as paid');
      } finally {
        setMarkingPaidId(null);
      }
    },
    [fetchRows],
  );

  const handleBulkApprove = useCallback(async () => {
    const pendingRows = (driverFilter ? rows.filter((r) => r.driver_name === driverFilter) : rows).filter(
      (r) => r.status === 'pending',
    );
    setApproving(true);
    let successCount = 0;
    let errorCount = 0;
    for (const row of pendingRows) {
      try {
        const res = await fetch(`/api/v1/carrier/pay-records/${row.id}/approve`, { method: 'PATCH' });
        if (res.ok) successCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
    }
    setApproving(false);
    if (successCount > 0) toast.success(`Approved ${successCount} record${successCount !== 1 ? 's' : ''}`);
    if (errorCount > 0) toast.error(`${errorCount} record${errorCount !== 1 ? 's' : ''} failed to approve`);
    if (successCount > 0) fetchRows();
  }, [rows, driverFilter, fetchRows]);

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <DriverPayMobile
          rows={rows}
          loading={loading}
          driverFilter={driverFilter}
          setDriverFilter={setDriverFilter}
          payPeriodStart={payPeriodStart}
          setPayPeriodStart={setPayPeriodStart}
          payPeriodEnd={payPeriodEnd}
          setPayPeriodEnd={setPayPeriodEnd}
          approving={approving}
          markingPaidId={markingPaidId}
          handleBulkApprove={handleBulkApprove}
          handleMarkPaid={handleMarkPaid}
        />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block">
        <DriverPayDesktop
          rows={rows}
          loading={loading}
          driverFilter={driverFilter}
          setDriverFilter={setDriverFilter}
          payPeriodStart={payPeriodStart}
          setPayPeriodStart={setPayPeriodStart}
          payPeriodEnd={payPeriodEnd}
          setPayPeriodEnd={setPayPeriodEnd}
          approving={approving}
          markingPaidId={markingPaidId}
          fetchRows={fetchRows}
          handleBulkApprove={handleBulkApprove}
          handleMarkPaid={handleMarkPaid}
        />
      </div>
    </>
  );
}
