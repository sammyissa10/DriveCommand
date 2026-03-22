import { z } from 'zod';

export const notificationPreferencesSchema = z.object({
  loadUpdates: z.boolean().default(true),
  etaNotifications: z.boolean().default(true),
  deliveryConfirmations: z.boolean().default(true),
  delayAlerts: z.boolean().default(true),
  customerEmails: z.boolean().default(true),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
