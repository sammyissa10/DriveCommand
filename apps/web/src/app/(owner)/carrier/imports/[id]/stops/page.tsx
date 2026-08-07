import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getStopReview } from '@/lib/document-import/stop-review-service';
import { summariseImport } from '@/lib/document-import/intake';
import { StopReviewScreen } from '@/components/carrier/imports/StopReviewScreen';

/**
 * Stop review — its own URL (spec Section 10).
 *
 * A page rather than a step inside the summary card, for the same reason the
 * import itself is a page: a dispatcher who reorders nine stops and then closes
 * the tab must come back to nine reordered stops. Every edit on this screen is
 * persisted server-side, so the URL is the whole of the state.
 *
 * The first render is server-side and read-only. `getStopReview` loads, decides
 * and describes; it writes nothing, so arriving here cannot commit anything the
 * user has not agreed to.
 */
export default async function StopReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const { id } = await params;

  const [review, view] = await Promise.all([
    getStopReview(orgId, session.userId, id),
    summariseImport(orgId, id, session.userId),
  ]);
  if (!review || !view) notFound();

  return (
    <StopReviewScreen
      importId={id}
      initial={review}
      title={view.summary?.title ?? view.originalName ?? 'Untitled document'}
    />
  );
}
