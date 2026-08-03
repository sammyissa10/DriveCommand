import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getRecentImports } from '@/lib/document-import/intake';
import { ImportWizard } from './ImportWizard';

/**
 * Screens 1 and 2 of the wizard (spec Section 4.1): source selection and
 * multi-page staging. Extraction progress is a separate URL so it survives a
 * reload.
 */
export default async function NewImportPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  // A manager cannot create a trip, so importing a document that becomes one
  // is not theirs either. Same gate the Trips page applies to New trip.
  if (session.role === 'MANAGER') redirect('/carrier/trips');

  const recent = await getRecentImports(orgId, session.userId);

  return <ImportWizard recent={recent} />;
}
