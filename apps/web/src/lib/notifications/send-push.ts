import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

const expo = new Expo();

/**
 * Send a push notification to all devices registered for the given user.
 *
 * Uses Expo's push notification service which handles FCM (Android) and
 * APNs (iOS) delivery transparently. Invalid tokens are automatically cleaned up.
 *
 * Notifications are best-effort — errors are logged but never thrown.
 * Use with after() in serverless routes to ensure delivery survives context freezing.
 *
 * ─── THE $transaction IS A BYPASS SCOPE, NOT AN ATOMICITY WRAPPER (quick-596) ──
 * quick-619 CORRECTION. This header used to say `PushToken`'s policy was
 *   USING ("userId"::text = current_setting('app.current_user_id', true))
 * and could never pass. Read from `pg_policies` on 2026-09-16, byte-identical on
 * staging and production, the live policy is
 *   tenant_isolation_policy FOR ALL USING ("tenantId" = current_tenant_id())
 * — an ordinary tenant policy. So the bypass is NOT load-bearing for a caller
 * that holds a tenant: `sendPushToOrg` below now runs on
 * getTenantPrismaForOrg(orgId). It IS still load-bearing HERE, for a different
 * reason than the one this header gave: `sendPushToUser` takes a `userId` and
 * nothing else, so there is no tenant to scope with, and without the bypass the
 * read returns zero tokens silently. Routing it needs a tenant threaded in from
 * the callers — a signature change, reported by quick-619 and not made.
 *
 * `set_config(..., TRUE)` is transaction-local, so the transaction is what
 * confines the bypass. Do NOT swap it for an optional client parameter that sets
 * the bypass on a caller's transaction — that leaves `app.bypass_rls = on` for
 * the rest of the caller's unit of work. Thirteen call-chain units reach a
 * transaction through this function (docs/audits/wrapper-migration-scope.md §1b);
 * the real fix is a privileged connection, or repairing the dead policy.
 */
export async function sendPushToUser(
  userId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
): Promise<void> {
  try {
    // Fetch all push tokens for this user
    const tokenRecords = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.pushToken.findMany({
        where: { userId },
        select: { token: true },
      });
    }, TX_OPTIONS);

    if (tokenRecords.length === 0) return;

    // Build valid Expo push messages — filter out invalid tokens, keep token for cleanup
    const validEntries = tokenRecords.filter(({ token }) => Expo.isExpoPushToken(token));

    if (validEntries.length === 0) return;

    const messages: ExpoPushMessage[] = validEntries.map(({ token }) => ({
      to: token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default' as const,
    }));

    // Send in chunks of 100 (Expo API limit)
    const chunks = expo.chunkPushNotifications(messages);
    let messageIndex = 0;

    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);

        for (let i = 0; i < receipts.length; i++) {
          const receipt = receipts[i];
          if (receipt.status === 'error') {
            logger.error('[send-push] delivery error:', receipt.message, receipt.details);

            // Clean up invalid/expired device tokens
            if (receipt.details?.error === 'DeviceNotRegistered') {
              const tokenToRemove = validEntries[messageIndex + i]?.token;
              if (tokenToRemove) {
                try {
                  await prisma.$transaction(async (tx) => {
                    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
                    await tx.pushToken.deleteMany({ where: { token: tokenToRemove } });
                  }, TX_OPTIONS);
                  logger.info('[send-push] removed invalid token for userId', { userId });
                } catch (cleanupErr) {
                  logger.error('[send-push] failed to clean up invalid token', cleanupErr, { userId });
                }
              }
            }
          }
        }

        messageIndex += chunk.length;
      } catch (chunkErr) {
        logger.error('[send-push] chunk send failed:', chunkErr);
        messageIndex += chunk.length;
      }
    }
  } catch (err) {
    logger.error('[send-push] sendPushToUser failed', err, { userId });
  }
}

/**
 * Send a push notification to all registered devices for an entire org (tenantId).
 *
 * Joins PushToken through User where user.tenantId = orgId for tenant isolation.
 * Optionally filtered by role (e.g. 'DRIVER').
 *
 * Notifications are best-effort — errors are logged but never thrown.
 */
export async function sendPushToOrg(
  orgId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  },
  options?: { role?: string }
): Promise<void> {
  try {
    // quick-619: `orgId` IS the tenant. One tenant client for the read and the
    // token cleanup below; no userId (quick-610). withTenantRLS adds
    // `PushToken.tenantId = orgId` beside the `user.tenantId` filter — the two agree
    // by construction, because the only writer (api/push-tokens) sets both from the
    // same verified token.
    const tenantPrisma = await getTenantPrismaForOrg(orgId);

    // Fetch all push tokens for users in the org (optionally filtered by role)
    const tokenRecords = await tenantPrisma.$transaction(async (tx) => {
      return tx.pushToken.findMany({
        where: {
          user: {
            tenantId: orgId,
            isActive: true,
            ...(options?.role ? { role: options.role as never } : {}),
          },
        },
        select: { token: true },
      });
    }, TX_OPTIONS);

    if (tokenRecords.length === 0) return;

    // Filter to valid Expo tokens
    const validEntries = tokenRecords.filter(({ token }) => Expo.isExpoPushToken(token));

    if (validEntries.length === 0) return;

    const messages: ExpoPushMessage[] = validEntries.map(({ token }) => ({
      to: token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default' as const,
    }));

    // Send in chunks of 100 (Expo API limit)
    const chunks = expo.chunkPushNotifications(messages);
    let messageIndex = 0;

    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);

        for (let i = 0; i < receipts.length; i++) {
          const receipt = receipts[i];
          if (receipt.status === 'error') {
            logger.error('[send-push] org delivery error:', receipt.message, receipt.details);

            // Clean up invalid/expired device tokens
            if (receipt.details?.error === 'DeviceNotRegistered') {
              const tokenToRemove = validEntries[messageIndex + i]?.token;
              if (tokenToRemove) {
                try {
                  await tenantPrisma.$transaction(async (tx) => {
                    await tx.pushToken.deleteMany({ where: { token: tokenToRemove } });
                  }, TX_OPTIONS);
                  logger.info('[send-push] removed invalid org token', { orgId });
                } catch (cleanupErr) {
                  logger.error('[send-push] failed to clean up invalid org token', cleanupErr, { orgId });
                }
              }
            }
          }
        }

        messageIndex += chunk.length;
      } catch (chunkErr) {
        logger.error('[send-push] org chunk send failed:', chunkErr);
        messageIndex += chunk.length;
      }
    }
  } catch (err) {
    logger.error('[send-push] sendPushToOrg failed', err, { orgId });
  }
}
