import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { summariseImport } from '@/lib/document-import/intake';
import { ImportProgress } from './ImportProgress';

/**
 * The import's own URL. Everything about resume hangs off this being a real
 * page and not a modal: closing the tab, backgrounding the phone, or following
 * the Trips banner all land back here with the same state.
 */
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const { id } = await params;
  const { start } = await searchParams;

  const view = await summariseImport(orgId, id, session.userId);
  if (!view) notFound();

  return <ImportProgress initial={view} autoStart={start === '1'} />;
}
