import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

const expo = new Expo();

/**
 * Send a push notification to all devices registered for the given user.
 *
 * Uses Expo's push notification service which handles FCM (Android) and
 * APNs (iOS) delivery transparently. Invalid tokens are silently skipped.
 *
 * Notifications are best-effort — errors are logged but never thrown.
 * Never awaited in critical paths; use with void or fire-and-forget.
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
    const tokens = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.pushToken.findMany({
        where: { userId },
        select: { token: true },
      });
    }, TX_OPTIONS);

    if (tokens.length === 0) return;

    // Build valid Expo push messages — filter out invalid tokens
    const messages: ExpoPushMessage[] = tokens
      .filter(({ token }) => Expo.isExpoPushToken(token))
      .map(({ token }) => ({
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sound: 'default' as const,
      }));

    if (messages.length === 0) return;

    // Send in chunks of 100 (Expo API limit)
    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);

        // Log any delivery errors (token expired, invalid, etc.)
        for (const receipt of receipts) {
          if (receipt.status === 'error') {
            console.error('[send-push] delivery error:', receipt.message, receipt.details);
          }
        }
      } catch (chunkErr) {
        console.error('[send-push] chunk send failed:', chunkErr);
      }
    }
  } catch (err) {
    console.error('[send-push] sendPushToUser failed for userId', userId, err);
  }
}
