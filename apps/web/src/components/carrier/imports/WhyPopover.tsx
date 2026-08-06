'use client';

/**
 * The "why" affordance (spec Section 4.2: "every auto-resolved value has a
 * small 'why' affordance showing the matched text and score").
 *
 * Small, secondary, never noisy: a text-sized "why" in muted type that opens a
 * short popover. It carries no icon, no colour, and no badge, because it sits
 * on a row the user is expected to read past — the point of the summary card is
 * that a confident resolution needs no explanation until it is questioned.
 *
 * WHAT IT SHOWS is whatever the server computed for that read. The score comes
 * from `scoreNameMatch` in `matching.ts` against the two strings currently in
 * the row; there is no stored score anywhere in this module, so this cannot
 * display a number that was true once and is not any more, and it cannot be
 * quietly swapped for a constant without deleting the function that feeds it.
 */

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { WhyView } from '@/lib/document-import/resolution';
import type { StopWhyView } from '@/lib/document-import/facility-lookup';

/**
 * The client, the contract and every resolved stop use this one component.
 *
 * The stop vias were added rather than given a second popover: "why is this the
 * facility" is the same question as "why is this the client", and a dispatcher
 * who has learned what the dotted `why` does on one row should not meet a
 * different affordance on the next.
 */
const VIA_LABEL: Record<WhyView['via'] | StopWhyView['via'], string> = {
  EXACT_MATCH: 'Exact name match',
  PROFILE_ALIAS: 'Saved on this client',
  ONLY_ACTIVE_CONTRACT: 'Only active contract',
  PROFILE_PIN: 'Pinned to this client',
  CHOSEN: 'You chose it',
  CREATED: 'Created from this document',
  // Facility ladder (spec Section 7).
  EXTERNAL_REF: 'Saved code for this client',
  NORMALISED_ADDRESS: 'Address match',
  MANUAL: 'You chose it',
  MANUAL_CREATE: 'Created from this document',
};

/** A human decided, so there is nothing to score. Drives the copy at the bottom. */
const HUMAN_VIAS = new Set(['CHOSEN', 'CREATED', 'MANUAL', 'MANUAL_CREATE']);

export function WhyPopover({ why }: { why: WhyView | StopWhyView | null }) {
  if (!why) return null;

  return (
    <Popover>
      <PopoverTrigger
        className="rounded text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Why this was chosen"
      >
        why
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {VIA_LABEL[why.via]}
        </p>
        <p className="text-foreground">{why.detail}</p>

        {why.documentText || why.matchedText ? (
          <dl className="space-y-1 border-t border-border pt-2 text-xs">
            {why.documentText ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">On the document</dt>
                <dd className="min-w-0 break-words font-medium text-foreground">
                  {why.documentText}
                </dd>
              </div>
            ) : null}
            {why.matchedText ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Matched</dt>
                <dd className="min-w-0 break-words font-medium text-foreground">
                  {why.matchedText}
                </dd>
              </div>
            ) : null}
            {why.score != null ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Score</dt>
                <dd className="font-medium text-foreground">{Math.round(why.score * 100)}%</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {why.score == null ? (
          // Said out loud rather than shown as a blank field. A chosen value has
          // no score because nothing was guessed, and an empty "Score —" row
          // would read as a missing number rather than an absent question.
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            {HUMAN_VIAS.has(why.via)
              ? 'No score — this was set by a person, not matched.'
              : 'No score — nothing was compared.'}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
