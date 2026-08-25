import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { staffViewer } from '@/lib/carrier/facility-visibility';
import { getCommitPreview } from '@/lib/document-import/commit-service';
import { summariseImport } from '@/lib/document-import/intake';
import { AssignmentScreen } from '@/components/carrier/imports/AssignmentScreen';

/**
 * Assignment and commit (spec Section 11) — its own URL.
 *
 * A page rather than a step inside stop review, for the reason every screen in
 * this module is a page: a dispatcher who picks a driver and then closes the
 * tab must not lose the eleven stops they reordered first. Nothing on this
 * screen is persisted until the commit, so the URL carries only the import id
 * and the assignment lives in the form — which is honest, because there is no
 * half-assigned trip to resume.
 *
 * The first render is server-side and READ-ONLY. `getCommitPreview` loads,
 * validates and describes; it writes nothing, so arriving here cannot create
 * anything. The `ensure*` mutation boundaries fire on the POST, not on this.
 *
 * Defaults the start time to 05:30 tomorrow — the run this module was built
 * around leaves before dawn, and an empty datetime field is one more thing to
 * fill in at the moment the dispatcher is least able to.
 */
export default async function AssignImportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const { id } = await params;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(5, 30, 0, 0);

  const [preview, view] = await Promise.all([
    getCommitPreview(
      orgId,
      session.userId,
      id,
      {
        primaryDriverId: null,
        truckId: null,
        trailerId: null,
        coDriverId: null,
        scheduledDeparture: tomorrow.toISOString(),
        notes: null,
      },
      staffViewer(session),
    ),
    summariseImport(orgId, id, session.userId),
  ]);
  if (!preview || !view) notFound();

  // A committed import has nothing to assign. Sending them to the import page
  // rather than showing a dead form, because that is where the committed state
  // and the template offer are.
  if (preview.status === 'COMMITTED') redirect(`/carrier/imports/${id}`);

  return (
    <AssignmentScreen
      importId={id}
      initial={preview}
      title={view.summary?.title ?? view.originalName ?? 'Untitled document'}
    />
  );
}
