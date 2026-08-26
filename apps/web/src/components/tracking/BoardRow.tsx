'use client';

/**
 * Phase 11 — THE row component. There is one, and both board views use it.
 *
 * Section 13: *"Both views share ONE data source and ONE row component with a
 * swapped primary column. Build the generic version first, then layer the
 * specifics. Do not duplicate logic across the two views."* The phase's named
 * drift is *"two nearly identical row components"*, so the swap is done in DATA
 * — `board-view.ts` decides what `primary`, `secondary` and `facts` hold — and
 * this file has no idea which view it is rendering. There is nothing here for a
 * second component to specialise, which is a stronger guarantee than a comment
 * asking the next person not to fork it.
 *
 * ─── WHY THE OPEN TARGET IS AN EMPTY OVERLAY ───────────────────────────────
 *
 * This replaces `TruckRow`, whose root was a `<button>` containing two more
 * `<button>`s (expand, kebab). `<button>` and `<a>` both forbid interactive
 * descendants: the parser breaks the nesting, React reports a hydration
 * mismatch, and the inner controls stop reliably taking their own clicks. Same
 * defect quick-513 fixed on `StopReviewRow`, and the fix is the one that phase
 * documented:
 *
 *     <div class="relative">
 *       <Link class="absolute inset-0" aria-label="Open …" />   <- NO children
 *       <div>…row content…</div>                <- not positioned: under it
 *       <a class="relative" href="tel:…">…</a>  <- positioned + later in DOM
 *     </div>
 *
 * Painting order does the work. An absolutely-positioned element with
 * `z-index: auto` paints above in-flow NON-POSITIONED content, so the overlay
 * covers the text and a click anywhere opens the trip. The phone link carries
 * `relative` and comes later in DOM order, so it paints above the overlay and
 * takes its own click. No element is inside another interactive element.
 *
 * The accepted cost, stated rather than hidden: text inside the row is not
 * selectable, because the overlay is over it. That was quick-513's trade too.
 */

import Link from 'next/link';
import { Phone, Truck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardFact, BoardRowData } from '@/lib/carrier/board-view';
import { InspectionBadge, OnTimeBadge } from './BoardBadges';

const FACT_TONE: Record<NonNullable<BoardFact['tone']>, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground italic',
  warning: 'text-status-warning-foreground',
  danger: 'text-status-danger-foreground',
};

function relativeTime(iso: string | null): string {
  if (!iso) return 'No GPS yet';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'No GPS yet';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Identity({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string | null;
  icon: typeof User;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
      </span>
    </div>
  );
}

export interface BoardRowProps {
  row: BoardRowData;
  /**
   * Which identity leads. Chosen by the view, and it selects an ICON only —
   * every word on the row already came from the projection.
   */
  primaryKind: 'driver' | 'truck';
}

export function BoardRow({ row, primaryKind }: BoardRowProps) {
  const PrimaryIcon = primaryKind === 'driver' ? User : Truck;
  const SecondaryIcon = primaryKind === 'driver' ? Truck : User;

  // The phone lives on whichever identity is the driver, and the projection
  // sets it — it is never recovered from the display string.
  const driverIdentity = primaryKind === 'driver' ? row.primary : row.secondary;
  const phone = driverIdentity?.phone ?? null;

  return (
    <div
      className={cn(
        'relative border-b transition-colors hover:bg-muted/50',
        // A blocked trip is the reason this board exists. The tint is a fourth
        // signal on top of the badge's colour + icon + text, never the only one.
        row.attention === 'FAILED_INSPECTION' && 'bg-status-danger-bg/40',
      )}
    >
      {/*
        The open target. Absolutely positioned, NO CHILDREN — anything nested in
        here would be an interactive descendant of a link, which is the bug this
        structure exists to avoid.
      */}
      {row.href && (
        <Link
          href={row.href}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          aria-label={`Open ${row.tripReference ?? 'trip'} — ${row.primary.title}`}
        />
      )}

      {/* Row content. Not positioned, so it sits UNDER the overlay and its
          clicks fall through to the link. */}
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="w-52 shrink-0">
          <Identity
            title={row.primary.title}
            subtitle={row.primary.subtitle}
            icon={PrimaryIcon}
          />
        </div>

        <div className="w-44 shrink-0">
          {row.secondary ? (
            <Identity
              title={row.secondary.title}
              subtitle={row.secondary.subtitle}
              icon={SecondaryIcon}
            />
          ) : (
            <span className="text-xs italic text-muted-foreground">Unassigned</span>
          )}
        </div>

        <div className="w-36 shrink-0 min-w-0">
          <span className="block truncate text-sm font-medium">
            {row.tripReference ?? 'No trip'}
          </span>
          <span className="block truncate text-xs capitalize text-muted-foreground">
            {(row.tripStatus ?? '').replace('_', ' ') || '—'}
          </span>
        </div>

        {/* The per-view cells. Data, not a branch. */}
        <div className="flex min-w-0 flex-1 gap-6">
          {row.facts.map((fact) => (
            <div key={fact.label} className="min-w-0 flex-1">
              <span className="block truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                {fact.label}
              </span>
              <span
                className={cn('block truncate text-sm', FACT_TONE[fact.tone ?? 'default'])}
              >
                {fact.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex w-56 shrink-0 flex-col items-end gap-1">
          <InspectionBadge state={row.inspection} />
          <OnTimeBadge state={row.onTime} />
          <span className="text-[11px] text-muted-foreground">
            GPS {relativeTime(row.lastPositionAt)}
          </span>
        </div>

        {/*
          The second interactive target, and the only one. `relative` and later
          in DOM order than the overlay, so it paints above it and takes its own
          click — it is a SIBLING of the overlay's content, never a child of the
          overlay. Calling the driver is what a dispatcher does about a blocked
          or late trip, so it earns the second target.

          `w-16` is reserved whether or not a number exists, so rows with and
          without a phone still line their columns up.
        */}
        <div className="w-16 shrink-0">
          {phone && (
            <a
              href={`tel:${phone.replace(/[^\d+]/g, '')}`}
              className="relative inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Call ${driverIdentity?.title ?? 'driver'}`}
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              Call
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
