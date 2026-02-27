'use client';

import { useTransition } from 'react';
import { DollarSign } from 'lucide-react';

export function MarkAsPaidButton({
  invoiceId,
  markPaidAction,
}: {
  invoiceId: string;
  markPaidAction: (id: string) => Promise<any>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await markPaidAction(invoiceId);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-50 transition-colors"
    >
      <DollarSign className="h-4 w-4" />
      {isPending ? 'Processing...' : 'Mark as Paid'}
    </button>
  );
}
