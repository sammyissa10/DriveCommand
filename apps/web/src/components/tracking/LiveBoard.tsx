'use client';

/**
 * Phase 11 — the live board: a segmented toggle over ONE fetch.
 *
 * ─── THE TOGGLE MUST NOT REFETCH ───────────────────────────────────────────
 *
 * Phase 11 verify check 1 is *"toggle views, network tab open → no refetch"*.
 * That is satisfied structurally, not by a cache setting: `/live-board` returns
 * BOTH projections in one response, both live in one piece of state, and
 * `setView` selects an array that is already in memory. There is no fetch on
 * this component's toggle path to accidentally reintroduce.
 *
 * ─── EMPTY IS NOT THE SAME AS BROKEN ───────────────────────────────────────
 *
 * Phase 11's verify list calls out *"zero active trips → real empty state, no
 * crash"* and flags it as the check that gets skipped. `rows === null` means we
 * have not loaded yet, `error` means we tried and failed, and `rows.length === 0`
 * means the day is genuinely quiet. Three states, three different sentences.
 * Collapsing them is exactly the bug this phase also fixes on the page below
 * (`getLatestVehicleLocations().catch(() => [])`), where a server error rendered
 * as "you own no trucks".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, RotateCw, Truck, Users } from 'lucide-react';
import { logger } from '@/lib/logger';
import { BOARD_EMPTY_COPY } from '@/lib/carrier/board-constants';
import type { BoardRowData, LiveBoardPayload } from '@/lib/carrier/board-view';
import { BoardRow } from './BoardRow';
import type { BoardView } from './BoardToggle';

const POLL_INTERVAL_MS = 15_000;

/**
 * Two sentences, deliberately, because there are two situations.
 *
 * A poll that fails while rows are already on screen is a REFRESH failure — the
 * board is stale but usable. A first fetch that fails means nothing has ever
 * loaded, and telling that person "we could not refresh" describes a state they
 * have never been in. quick-550's collapse in one line: one string standing for
 * two facts.
 */
const BOARD_REFRESH_FAILED_COPY = 'We could not refresh the board.';
const BOARD_LOAD_FAILED_TITLE = 'We could not load the board.';
const BOARD_LOAD_FAILED_BODY =
  'Nothing has loaded yet. Check your connection, then try again.';

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Truck;
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center px-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3">
      <div className="h-8 w-52 shrink-0 animate-pulse rounded bg-muted" />
      <div className="h-8 w-44 shrink-0 animate-pulse rounded bg-muted" />
      <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
      <div className="h-8 w-56 shrink-0 animate-pulse rounded bg-muted" />
    </div>
  );
}

function rowCountLabel(view: BoardView, count: number): string {
  const noun = view === 'drivers' ? 'driver' : 'truck';
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * `view` is a PROP, not state. It is owned by `live-map-wrapper.tsx` so that the
 * Drivers | Trucks control can live in the KPI header row beside Map | List and
 * be visible from a cold start — which is the whole point: this board used to be
 * unreachable until someone found `List` first.
 *
 * The "toggle must not refetch" property in this file's header is unaffected:
 * `/live-board` still returns BOTH projections in one response, and selecting a
 * projection is still an array pick over state that is already in memory.
 * Lifting the control did not add a fetch to that path.
 */
export function LiveBoard({ view }: { view: BoardView }) {
  const [payload, setPayload] = useState<LiveBoardPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/carrier/live-board');
      if (!res.ok) throw new Error(`Board request failed: ${res.status}`);
      const json = await res.json();
      if (!mountedRef.current) return;
      setPayload(json.data as LiveBoardPayload);
      setFailed(false);
    } catch (err) {
      logger.error('Live board fetch failed', err);
      if (!mountedRef.current) return;
      // Keep the last good payload on screen — a transient poll failure should
      // not blank a board someone is watching. The banner says it is stale.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void fetchBoard();
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void fetchBoard();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBoard]);

  async function manualRefresh() {
    setRefreshing(true);
    await fetchBoard();
    if (mountedRef.current) setRefreshing(false);
  }

  const rows: BoardRowData[] | null = payload
    ? view === 'drivers'
      ? payload.drivers
      : payload.trucks
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
        <p className="text-sm font-medium text-muted-foreground">
          {rows === null ? '' : rowCountLabel(view, rows.length)}
        </p>
        <button
          type="button"
          onClick={manualRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          aria-label="Refresh the board"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {failed && payload && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b bg-status-warning-bg px-4 py-2 text-xs text-status-warning-foreground"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {`${BOARD_REFRESH_FAILED_COPY} These rows were last updated at ${new Date(payload.computedAt).toLocaleTimeString()}.`}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? (
          failed ? (
            <div className="flex h-64 flex-col items-center justify-center px-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-warning-bg">
                <AlertCircle
                  className="h-6 w-6 text-status-warning-foreground"
                  aria-hidden="true"
                />
              </span>
              <p className="mt-3 text-sm font-semibold">{BOARD_LOAD_FAILED_TITLE}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {BOARD_LOAD_FAILED_BODY}
              </p>
              <button
                type="button"
                onClick={manualRefresh}
                disabled={refreshing}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : (
            <>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          )
        ) : rows.length === 0 ? (
          <EmptyState
            icon={view === 'drivers' ? Users : Truck}
            title={
              view === 'drivers' ? BOARD_EMPTY_COPY.noDriversTitle : BOARD_EMPTY_COPY.noTrucksTitle
            }
            body={
              view === 'drivers' ? BOARD_EMPTY_COPY.noDriversBody : BOARD_EMPTY_COPY.noTrucksBody
            }
          />
        ) : (
          rows.map((row) => (
            <BoardRow
              key={row.key}
              row={row}
              primaryKind={view === 'drivers' ? 'driver' : 'truck'}
            />
          ))
        )}
      </div>
    </div>
  );
}
