'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  FieldGroup,
  StatusPill,
  SheetContainer,
  type FieldDef,
  type StatusTone,
} from '@/components/ui/ds';
import { deletePayrollRecord } from '@/app/(owner)/actions/payroll';

export interface PayrollDetailData {
  id: string;
  driverName: string;
  driverEmail: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  basePay: number;
  bonuses: number;
  deductions: number;
  totalPay: number;
  paidAt: string | null;
  milesLogged: number;
  loadsCompleted: number;
  notes: string | null;
}

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  APPROVED: { label: 'Approved', tone: 'accent' },
  PAID: { label: 'Paid', tone: 'success' },
};
function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, tone: 'neutral' as StatusTone };
}
function fmtDollar(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtPeriod(a: string, b: string): string {
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(a).toLocaleDateString('en-US', o)} – ${new Date(b).toLocaleDateString('en-US', o)}`;
}

/**
 * Payroll Detail — mobile-web design system view.
 * Identity + status, a pay-breakdown card (base → bonuses → deductions → total),
 * a Performance FieldGroup, notes, and status-gated Edit/Delete (delete draft only).
 */
export function PayrollDetailMobile({ record }: { record: PayrollDetailData }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const s = statusMeta(record.status);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePayrollRecord(record.id);
      toast.success('Payroll record deleted');
      router.push('/payroll');
      router.refresh();
    } catch {
      toast.error('Failed to delete record');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const performanceFields: FieldDef[] = [
    { key: 'miles', label: 'Miles logged', value: record.milesLogged.toLocaleString() },
    { key: 'loads', label: 'Loads completed', value: String(record.loadsCompleted) },
    { key: 'driver', label: 'Driver', value: record.driverEmail },
  ];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="Payroll"
        onBack={() => router.push('/payroll')}
        right={<NavTextButton label="Edit" onClick={() => router.push(`/payroll/${record.id}/edit`)} />}
      />

      {/* Identity */}
      <div className="flex flex-col items-center pb-4 pt-2">
        <h1 className="text-center text-[22px] font-bold text-ds-txt">{record.driverName}</h1>
        <p className="mt-1 text-center text-[13px] text-ds-txt3">{fmtPeriod(record.periodStart, record.periodEnd)}</p>
        <div className="mt-2">
          <StatusPill label={s.label} tone={s.tone} />
        </div>
      </div>

      <div className="space-y-6">
        {/* Pay breakdown */}
        <div>
          <SectionHeader title="Pay breakdown" />
          <div className="space-y-2 rounded-[20px] bg-ds-card p-4">
            <div className="flex justify-between text-[15px]">
              <span className="text-ds-txt2">Base pay</span>
              <span className="text-ds-txt tabular-nums">{fmtDollar(record.basePay)}</span>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-ds-txt2">Bonuses</span>
              <span className="text-ds-success tabular-nums">+{fmtDollar(record.bonuses)}</span>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-ds-txt2">Deductions</span>
              <span className="text-ds-danger tabular-nums">-{fmtDollar(record.deductions)}</span>
            </div>
            <div className="flex justify-between border-t border-ds-hairline pt-2 text-[16px] font-semibold">
              <span className="text-ds-txt">Total pay</span>
              <span className="text-ds-txt tabular-nums">{fmtDollar(record.totalPay)}</span>
            </div>
            {record.paidAt ? (
              <p className="border-t border-ds-hairline pt-2 text-[13px] text-ds-txt3">
                Paid on <span className="text-ds-success">{fmtDate(record.paidAt)}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* Performance */}
        <div>
          <SectionHeader title="Performance" />
          <FieldGroup fields={performanceFields} isEditing={false} />
        </div>

        {/* Notes */}
        {record.notes ? (
          <div>
            <SectionHeader title="Notes" />
            <div className="rounded-[20px] bg-ds-card p-4">
              <p className="whitespace-pre-wrap text-[15px] text-ds-txt2">{record.notes}</p>
            </div>
          </div>
        ) : null}

        {/* Delete (DRAFT only) */}
        {record.status === 'DRAFT' ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-danger/[0.14] text-[17px] font-semibold text-ds-danger transition active:opacity-75"
          >
            <Trash2 className="h-5 w-5" />
            Delete record
          </button>
        ) : null}
      </div>

      <SheetContainer
        open={confirmDelete}
        onCancel={() => (deleting ? undefined : setConfirmDelete(false))}
        title="Delete payroll record"
        subtitle={`${record.driverName}'s record will be removed. This can't be undone.`}
      >
        <div className="pt-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-danger text-[17px] font-semibold text-white transition active:opacity-75 disabled:opacity-35"
          >
            <Trash2 className="h-5 w-5" />
            {deleting ? 'Deleting…' : 'Delete record'}
          </button>
        </div>
      </SheetContainer>
    </MobileScreen>
  );
}
