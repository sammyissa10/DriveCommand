import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileText, Plus } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getRecentImports } from '@/lib/document-import/intake';
import { Button } from '@/components/ui/button';

/**
 * The imports list — the module's front door.
 *
 * There was not one until Phase 8. Every screen in this module has had its own
 * URL since Phase 2, but the only ways to reach any of them were the "Choose
 * recent" picker inside the upload flow and a resume banner on the Trips page:
 * a dispatcher who wanted to see yesterday's imports had nowhere to go, and the
 * sidebar has had no entry for five phases. This page and the sidebar item that
 * points at it are that gap closed.
 *
 * Read-only. Listing imports must never move one along — arriving here is not
 * a decision about any of them.
 */

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  UPLOADED: { label: 'Uploaded', tone: 'text-muted-foreground' },
  EXTRACTING: { label: 'Reading', tone: 'text-blue-600 dark:text-blue-400' },
  NEEDS_REVIEW: { label: 'Needs review', tone: 'text-amber-600 dark:text-amber-500' },
  READY: { label: 'Ready', tone: 'text-emerald-600 dark:text-emerald-500' },
  COMMITTING: { label: 'Creating trip', tone: 'text-blue-600 dark:text-blue-400' },
  COMMITTED: { label: 'Trip created', tone: 'text-emerald-600 dark:text-emerald-500' },
  FAILED: { label: 'Failed', tone: 'text-destructive' },
  CANCELLED: { label: 'Cancelled', tone: 'text-muted-foreground' },
};

export default async function ImportsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const imports = await getRecentImports(orgId, session.userId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Document Imports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn a photographed manifest or a rate confirmation into a trip.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/carrier/imports/new">
            <Plus className="mr-2 h-4 w-4" />
            New import
          </Link>
        </Button>
      </div>

      {imports.length === 0 ? (
        <div className="rounded-xl bg-card p-10 text-center shadow-sm">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No imports yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Photograph a manifest and it becomes a trip in a few taps.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {imports.map((imp) => {
            const status = STATUS_COPY[imp.status] ?? {
              label: imp.status,
              tone: 'text-muted-foreground',
            };
            return (
              <li key={imp.id}>
                <Link
                  href={`/carrier/imports/${imp.id}`}
                  className="flex items-center gap-4 rounded-xl bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  {/* `min-w-0` on the flex child, or a long filename widens the
                      row past the page. See quick-519 and the flex-min-w-0 note. */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {imp.title ?? imp.originalName ?? 'Untitled document'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {imp.pageCount} page{imp.pageCount === 1 ? '' : 's'}
                      {imp.consignmentCount !== null
                        ? ` · ${imp.consignmentCount} stop${imp.consignmentCount === 1 ? '' : 's'}`
                        : ''}
                      {' · '}
                      {new Date(imp.createdAt).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${status.tone}`}>
                    {status.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
