'use server';

import { getSession } from '@/lib/auth/supabase';
import { createAdminClient } from '@/lib/supabase/admin';

export async function getSignedPhotoUrl(storagePath: string): Promise<string | null> {
  try {
    const session = await getSession();
    if (!session) return null;
    const supabaseAdmin = createAdminClient();
    const { data } = await supabaseAdmin.storage
      .from('drivecommand-files')
      .createSignedUrl(storagePath, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
