import { redirect } from 'next/navigation';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { SETTINGS_PAGE_META } from '@/components/settings/settings.config';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { OperationsSettingsForm } from './OperationsSettingsForm';

const meta = SETTINGS_PAGE_META.operations;

/**
 * Operations settings — Phase 9 item 6.
 *
 * `requirePreTripInspection` and `blockTripStartOnFailedInspection` have existed
 * as real, NOT NULL columns on `Tenant` since Phase 1 (verified against
 * `information_schema`, defaults false and true respectively). No DDL was needed
 * here and that is a claim with evidence behind it, per DEC-9 — what was missing
 * was any surface to change them from, which is why every Phase 9 verification
 * step that depends on them was previously untestable without a SQL client.
 */
export default async function OperationsSettingsPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const tenantPrisma = await getTenantPrismaForOrg(session.tenantId);
  const tenant = await tenantPrisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      requirePreTripInspection: true,
      blockTripStartOnFailedInspection: true,
    },
  });

  return (
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle} />
      <OperationsSettingsForm
        initial={{
          requirePreTripInspection: tenant?.requirePreTripInspection ?? false,
          blockTripStartOnFailedInspection: tenant?.blockTripStartOnFailedInspection ?? true,
        }}
      />
    </div>
  );
}
