import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { resendCarrierDriverInvitation } from '@/lib/carrier/fleet-drivers';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const result = await resendCarrierDriverInvitation(orgId, id);

    if ('error' in result) {
      if (result.error === 'Not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Already-provisioned is a benign state, not an error — return 200 so the
    // client shows an info message rather than a red error toast.
    if ('alreadyProvisioned' in result) {
      return NextResponse.json({ alreadyProvisioned: true, email: result.email });
    }

    return NextResponse.json({
      sent: result.sent,
      email: result.email,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (err) {
    logger.error('POST /api/v1/carrier/fleet/drivers/[id]/resend-invitation failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
