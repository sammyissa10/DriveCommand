/**
 * "You left an import open" banner for the Trips page.
 *
 * Spec Phase 2 item 8. A banner and not a modal, deliberately — spec Section 15
 * forbids modal interruptions for warnings, and an unfinished import is a
 * warning, not a decision the user has to make before they can do anything else.
 *
 * Server component: the data is already loaded by the page.
 */

import Link from 'next/link';
import { ArrowRight, FileClock } from 'lucide-react';
import type { ImportListItem } from '@/lib/document-import/intake';

/**
 * FAILED is deliberately absent: the server no longer offers one here
 * (`RESUMABLE_STATUSES`), because "pick up where you left off" leading to a
 * document that could not be read is not somewhere to be picked up.
 */
function describe(item: ImportListItem): string {
  const pages = `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`;
  switch (item.status) {
    case 'NEEDS_REVIEW':
      return item.consignmentCount != null
        ? `${item.consignmentCount} stop${item.consignmentCount === 1 ? '' : 's'} waiting for review`
        : 'Waiting for review';
    case 'EXTRACTING':
      return `Still being read · ${pages}`;
    case 'UPLOADED':
      return `Uploaded but not read yet · ${pages}`;
    default:
      return pages;
  }
}

export function ResumeImportBanner({ items }: { items: ImportListItem[] }) {
  if (items.length === 0) return null;

  const [first, ...rest] = items;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/10 px-4 py-3">
      <FileClock className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {first.title ?? first.originalName ?? 'An imported document'} is unfinished
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {describe(first)}
          {rest.length > 0 ? ` · ${rest.length} more unfinished` : ''}
        </p>
      </div>
      <Link
        href={`/carrier/imports/${first.id}`}
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10"
      >
        Pick up where you left off
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
