'use client';

/**
 * Text that truncates and gives up the whole value on tap.
 *
 * Spec Section 15 ends with "text never clips", and Phase 5's constraint is
 * specifically "long facility names truncate with the full value on tap". Those
 * two are in tension only if truncation is the end of the story — so it is not.
 * Collapsed, the value is one line with an ellipsis; tapped, it wraps in full.
 *
 * A `title` is set as well so a pointer gets it on hover without a click, but
 * the tap is the affordance that matters: `title` does not exist on a phone, and
 * the 60-character dealership name in the verify table is exactly the case a
 * dispatcher on a tablet hits.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';

export function TruncatedText({
  value,
  className,
  as: Tag = 'span',
}: {
  value: string;
  className?: string;
  as?: 'span' | 'p';
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tag className={cn('block min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={value}
        aria-expanded={open}
        aria-label={open ? `${value} — collapse` : `${value} — show in full`}
        className={cn(
          'block w-full min-w-0 text-left',
          // Collapsed: one line, ellipsis. Expanded: wraps, and nothing is cut.
          open ? 'whitespace-normal break-words' : 'truncate',
        )}
      >
        {value}
      </button>
    </Tag>
  );
}
