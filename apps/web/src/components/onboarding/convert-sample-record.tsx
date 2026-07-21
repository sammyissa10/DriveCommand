'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** PATCH endpoint that accepts { isSample: false }. e.g. /api/v1/carrier/fleet/trucks/{id} */
  endpoint: string;
  /** Lowercase noun used in the copy + toast, e.g. "truck". */
  recordLabel: string;
}

/**
 * Explains, on a seeded sample record's detail page, why it carries the SAMPLE
 * badge and lets the user promote it to a real record (clears is_sample).
 * Answers TKT-0075 ("why does this show as sample? how to change it to normal").
 * Once converted, the record drops the SAMPLE badge and reappears in the
 * operational pickers that hide sample data (TKT-0076).
 */
export function ConvertSampleRecord({ endpoint, recordLabel }: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function handleConvert() {
    setIsBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSample: false }),
      });
      if (res.ok) {
        toast.success(`Converted to a real ${recordLabel}`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? 'Something went wrong');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <span className="flex-1">
        This is a <strong>sample {recordLabel}</strong> created to help you explore. It&apos;s hidden
        from operational pickers. Convert it to a real record to keep and use it.
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={isBusy}
        onClick={handleConvert}
        className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
      >
        <Sparkles className="mr-2 h-4 w-4" />
        {isBusy ? 'Converting…' : 'Convert to real record'}
      </Button>
    </div>
  );
}
