'use client';

/**
 * Screens 2 and 3 of the wizard (spec Section 4.1): the extracting progress bar
 * and the summary card it becomes.
 *
 * All progress comes from the server. The page counter reads
 * `document_import_pages` rows through `GET /api/v1/carrier/document-imports/[id]`,
 * so it keeps advancing while this tab is in the background, it is still right
 * after a reload, and if the extraction request itself dies the "Keep reading"
 * button picks up from the last page that landed rather than starting over.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ImportSummaryCard } from '@/components/carrier/imports/ImportSummaryCard';
import type { ImportView } from '@/lib/document-import/intake';

const POLL_MS = 1500;

interface Props {
  initial: ImportView;
  /** True when we arrived straight from the wizard and should start reading. */
  autoStart: boolean;
}

export function ImportProgress({ initial, autoStart }: Props) {
  const [view, setView] = useState<ImportView>(initial);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);

  const reshootRef = useRef<HTMLInputElement>(null);
  const reshootPage = useRef<number | null>(null);

  const inFlight = view.status === 'UPLOADED' || view.status === 'EXTRACTING';

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/v1/carrier/document-imports/${view.id}`);
    if (!res.ok) return;
    const json = await res.json();
    setView(json.data as ImportView);
  }, [view.id]);

  /** Fire-and-poll: the POST may outlive this tab, and that is fine. */
  const extract = useCallback(async () => {
    setWorking(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/carrier/document-imports/${view.id}/extract`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data?.import) setView(json.data.import as ImportView);
      else await refresh();
    } catch {
      // The request died — the server may well still be working, and the poll
      // below will show it. Never tell the user their pages were lost.
      setNotice('Lost contact while reading. Checking where it got to…');
      await refresh();
    } finally {
      setWorking(false);
    }
  }, [view.id, refresh]);

  // Kick off exactly once when arriving from the wizard.
  useEffect(() => {
    if (!autoStart || started.current) return;
    if (view.status !== 'UPLOADED') return;
    started.current = true;
    void extract();
  }, [autoStart, view.status, extract]);

  // Poll while anything is in flight.
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [inFlight, refresh]);

  async function cancel() {
    setWorking(true);
    try {
      await fetch(`/api/v1/carrier/document-imports/${view.id}`, { method: 'DELETE' });
      await refresh();
    } finally {
      setWorking(false);
    }
  }

  function startReshoot(pageNumber: number) {
    reshootPage.current = pageNumber;
    reshootRef.current?.click();
  }

  async function applyReshoot(file: File | undefined) {
    const pageNumber = reshootPage.current;
    reshootPage.current = null;
    if (!file || pageNumber == null) return;

    setWorking(true);
    setNotice(null);
    try {
      const grantRes = await fetch('/api/v1/carrier/document-imports/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'image/jpeg',
          sizeBytes: file.size,
        }),
      });
      const grant = await grantRes.json().catch(() => ({}));
      if (!grantRes.ok) throw new Error(grant.error ?? 'Could not prepare the upload.');

      const put = await fetch(grant.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
      });
      if (!put.ok) throw new Error('The upload did not finish.');

      const res = await fetch(`/api/v1/carrier/document-imports/${view.id}/pages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageNumber, storageKey: grant.data.storageKey }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not replace that page.');

      setNotice(`Page ${pageNumber} replaced. Reading it now — the other pages are already done.`);
      await extract();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not replace that page.');
    } finally {
      setWorking(false);
    }
  }

  // -------------------------------------------------------------------------

  const pct = view.pageCount > 0 ? (view.pagesDone / view.pageCount) * 100 : 0;
  const failedPages = view.pages.filter((p) => p.status === 'failed');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <input
        ref={reshootRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        hidden
        onChange={(e) => {
          void applyReshoot(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {inFlight ? 'Reading document' : view.status === 'NEEDS_REVIEW' ? 'We found this' : 'Import'}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {view.originalName ?? 'Untitled document'}
          </p>
        </div>
        <Link
          href="/carrier/trips"
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </Link>
      </div>

      {notice ? (
        <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p>{notice}</p>
        </div>
      ) : null}

      {/* ---- Extracting ---- */}
      {inFlight ? (
        <div className="space-y-4 rounded-xl bg-muted/40 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Reading page {Math.min(view.pagesDone + 1, view.pageCount)} of {view.pageCount}
            </span>
            <span className="text-muted-foreground">
              {view.pagesDone}/{view.pageCount}
            </span>
          </div>
          <Progress value={pct} />
          <p className="text-xs text-muted-foreground">
            This carries on in the background. Closing this page will not lose it — the Trips page
            will offer to pick it up.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={cancel} disabled={working}>
              Cancel
            </Button>
            {/* The extraction request can die while the work survives. This
                resumes from the last page that landed. */}
            <Button variant="ghost" onClick={() => void extract()} disabled={working}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Keep reading
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---- Failed ---- */}
      {view.status === 'FAILED' ? (
        <div className="space-y-4 rounded-xl bg-destructive/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-foreground">
              {view.failureMessage ?? 'That document could not be read.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {view.failureCode === 'ZERO_CONSIGNMENTS' ? (
              <Button asChild>
                <Link href="/carrier/imports/new">
                  <Camera className="mr-2 h-4 w-4" />
                  Take clearer photos
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void extract()} disabled={working}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {view.status === 'CANCELLED' ? (
        <div className="space-y-4 rounded-xl bg-muted/40 p-5">
          <p className="text-sm text-foreground">
            This import was cancelled. The pages are still here — reading them again picks up where
            it stopped.
          </p>
          <Button asChild variant="outline">
            <Link href="/carrier/imports/new">Start a new import</Link>
          </Button>
        </div>
      ) : null}

      {/* ---- Per-page failures: re-shoot one page, not all sixteen ---- */}
      {failedPages.length > 0 ? (
        <div className="space-y-3 rounded-xl bg-amber-500/10 p-5">
          <p className="text-sm font-medium text-foreground">
            {failedPages.length} page{failedPages.length === 1 ? '' : 's'} could not be read. The
            rest went through.
          </p>
          <ul className="space-y-2">
            {failedPages.map((p) => (
              <li key={p.pageNumber} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                  Page {p.pageNumber} — {p.failureMessage ?? 'unreadable'}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  disabled={working}
                  onClick={() => startReshoot(p.pageNumber)}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Re-shoot page {p.pageNumber}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Only the replaced page is read again — the others are already done and cost nothing.
          </p>
        </div>
      ) : null}

      {/* ---- Summary card, or the one question standing in its way ----
          `ImportSummaryCard` decides which: an unresolved client or contract
          takes the screen to itself, and the card is drawn once neither does
          (spec Section 4.2). */}
      {view.status === 'NEEDS_REVIEW' && view.summary ? (
        <>
          <ImportSummaryCard view={view} onChange={setView} />
          {/* Secondary facts, and only once the card is what is on screen —
              while a decision step is up, the rule is one question and nothing
              else competing with it. */}
          {view.resolution?.resolved ? <DocumentFacts view={view} /> : null}
        </>
      ) : null}

      {/* ---- Pages ---- */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          {view.pageCount} page{view.pageCount === 1 ? '' : 's'}
        </h2>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {view.pages.map((p) => (
            <li
              key={p.pageNumber}
              className={cn(
                'relative overflow-hidden rounded-lg bg-muted/40',
                p.status === 'failed' && 'ring-2 ring-destructive',
              )}
            >
              <div className="flex aspect-[3/4] items-center justify-center">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- presigned URL, expires
                  <img src={p.previewUrl} alt={`Page ${p.pageNumber}`} className="h-full w-full object-cover" />
                ) : (
                  <FileText className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                <span className="text-muted-foreground">{p.pageNumber}</span>
                {p.status === 'done' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Read" />
                ) : p.status === 'failed' ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Unreadable" />
                ) : (
                  <span className="text-muted-foreground" aria-label="Waiting">
                    …
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * What the document said, underneath the card that says what it means.
 *
 * Deliberately not part of the summary card: Section 4.1 draws five rows, and
 * adding "Pieces" and "Number" to them would turn a card a dispatcher reads in
 * two seconds into a table they read in ten. These are here for the moment
 * something looks wrong and someone wants to check the source.
 */
function DocumentFacts({ view }: { view: ImportView }) {
  const s = view.summary!;
  return (
    <section className="space-y-2 rounded-xl border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        On the document
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Row label="Type" value={s.documentType?.replace(/_/g, ' ').toLowerCase() ?? '—'} />
        <Row label="Number" value={s.documentNumber ?? '—'} />
        {s.totalPieces != null ? <Row label="Pieces" value={String(s.totalPieces)} /> : null}
        {s.originName ? <Row label="Named on it" value={s.originName} /> : null}
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-foreground">{value}</dd>
    </>
  );
}
