import { NextRequest, NextResponse, after } from 'next/server';
import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { createMessageNotification } from '@/lib/carrier/in-app-notifications';
import { logger } from '@/lib/logger';

/**
 * GET /api/driver/stops/[stopId]/messages
 *
 * Returns all messages scoped to a specific stop for the assigned driver.
 * Marks unread messages as read.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ stopId: string }> }
) {
  try {
    await requireRole([UserRole.DRIVER]);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stopId } = await params;

  try {
    /**
     * NO bypass_rls (flag removed, quick-587): tenant-scoped access on a tenant-scoped
     *      client. stops / carrier_documents / route_template_stops get NO bypass_rls_policy,
     *      so the flag could never apply to them. Do not re-add it.
     * SCOPE: Stop must belong to a dispatch where primaryDriverId = this driver's carrierDriver.id
     *        and orgId = session.tenantId.
     * SAFETY: Gated by requireRole([DRIVER]) + getSession() above.
     */

    const tenantPrisma = await getTenantPrisma();
    const result = await tenantPrisma.$transaction(async (tx) => {

      // Verify driver identity and stop ownership
      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: session.userId, orgId: session.tenantId },
        select: { id: true },
      });
      if (!carrierDriver) return null;

      const stop = await tx.carrierStop.findFirst({
        where: {
          id: stopId,
          dispatch: { primaryDriverId: carrierDriver.id, orgId: session.tenantId },
        },
        select: { id: true, dispatchId: true },
      });
      if (!stop) return null;

      return { stop, carrierDriverId: carrierDriver.id };
    }, TX_OPTIONS);

    if (!result) return NextResponse.json({ error: 'Stop not found' }, { status: 404 });

    const messages = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.fleetMessage.findMany({
        where: { stopId, tenantId: session.tenantId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          senderId: true,
          senderRole: true,
          recipientId: true,
          body: true,
          isBroadcast: true,
          dispatchId: true,
          stopId: true,
          readAt: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    // Mark unread messages as read (messages sent to this driver)
    const unreadIds = messages
      .filter((m) => !m.readAt && m.recipientId === session.userId)
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        await tx.fleetMessage.updateMany({
          where: { id: { in: unreadIds } },
          data: { readAt: new Date() },
        });
      }, TX_OPTIONS);
    }

    // Resolve sender names
    const senderIds = new Set(messages.map((m) => m.senderId));
    const senderMap = new Map<string, string>();
    if (senderIds.size > 0) {
      const users = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: { id: { in: Array.from(senderIds) }, tenantId: session.tenantId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }, TX_OPTIONS);
      for (const u of users) {
        senderMap.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email);
      }
    }

    const serialized = messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: senderMap.get(m.senderId) ?? 'Unknown',
      senderRole: m.senderRole,
      recipientId: m.recipientId,
      body: m.body,
      isBroadcast: m.isBroadcast,
      dispatchId: m.dispatchId,
      stopId: m.stopId,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      isOwn: m.senderId === session.userId,
    }));

    return NextResponse.json({ messages: serialized });
  } catch (err) {
    logger.error('[api/driver/stops/[stopId]/messages GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/driver/stops/[stopId]/messages
 *
 * Send a stop-scoped message from driver to the dispatch owner.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ stopId: string }> }
) {
  try {
    await requireRole([UserRole.DRIVER]);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stopId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.body !== 'string' || payload.body.trim().length === 0) {
    return NextResponse.json({ error: 'body is required and must be non-empty' }, { status: 400 });
  }
  if (payload.body.toString().length > 2000) {
    return NextResponse.json({ error: 'body must be 2000 characters or fewer' }, { status: 400 });
  }

  const messageBody = payload.body.toString().trim();

  try {
    /**
     * NO bypass_rls (flag removed, quick-587): tenant-scoped access on a tenant-scoped
     *      client. stops / carrier_documents / route_template_stops get NO bypass_rls_policy,
     *      so the flag could never apply to them. Do not re-add it.
     * Same rationale as GET handler above.
     */

    // Verify driver identity and stop ownership, get dispatchId
    const tenantPrisma = await getTenantPrisma();
    const context = await tenantPrisma.$transaction(async (tx) => {

      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: session.userId, orgId: session.tenantId },
        select: { id: true },
      });
      if (!carrierDriver) return null;

      const stop = await tx.carrierStop.findFirst({
        where: {
          id: stopId,
          dispatch: { primaryDriverId: carrierDriver.id, orgId: session.tenantId },
        },
        select: { id: true, dispatchId: true },
      });
      if (!stop) return null;

      return { stop };
    }, TX_OPTIONS);

    if (!context) return NextResponse.json({ error: 'Stop not found' }, { status: 404 });

    // Find first OWNER user in tenant to send message to
    const ownerUser = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.findFirst({
        where: { tenantId: session.tenantId, role: 'OWNER' },
        select: { id: true, firstName: true, lastName: true },
      });
    }, TX_OPTIONS);

    const recipientId = ownerUser?.id ?? null;

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.fleetMessage.create({
        data: {
          tenantId: session.tenantId,
          senderId: session.userId,
          senderRole: 'DRIVER',
          body: messageBody,
          recipientId,
          stopId,
          dispatchId: context.stop.dispatchId,
          isBroadcast: false,
        },
        select: {
          id: true,
          senderId: true,
          senderRole: true,
          recipientId: true,
          body: true,
          dispatchId: true,
          stopId: true,
          isBroadcast: true,
          createdAt: true,
        },
      });
    }, TX_OPTIONS);

    if (recipientId) {
      const driverName = [session.firstName, session.lastName].filter(Boolean).join(' ') || 'Driver';
      const pushBody = messageBody.slice(0, 100);
      after(() =>
        sendPushToUser(recipientId, {
          title: `New Message from ${driverName}`,
          body: pushBody,
          data: { type: 'fleet_message', messageId: created.id },
        })
      );
      after(() =>
        createMessageNotification({
          orgId: session.tenantId,
          recipientUserId: recipientId,
          senderName: driverName,
          messagePreview: messageBody,
          dispatchId: created.dispatchId ?? undefined,
          messageId: created.id,
        })
      );
    }

    return NextResponse.json(
      {
        message: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          isOwn: true,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error('[api/driver/stops/[stopId]/messages POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
