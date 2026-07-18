'use server';

import { getSession } from '@/lib/auth/supabase';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantPrisma } from '@/lib/context/tenant-context';

export async function getSignedPhotoUrl(stepInstanceId: string): Promise<string | null> {
  try {
    const session = await getSession();
    if (!session) return null;

    const tenantPrisma = await getTenantPrisma();
    const step = await tenantPrisma.stepInstance.findFirst({
      where: {
        id: stepInstanceId,
        playbookInstance: { tenantId: session.tenantId },
      },
      select: { result: true },
    });

    const photoPath = (step?.result as { photoPath?: string } | null)?.photoPath;
    if (!photoPath) return null;

    const supabaseAdmin = createAdminClient();
    const { data } = await supabaseAdmin.storage
      .from('drivecommand-files')
      .createSignedUrl(photoPath, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
