import { z } from 'zod';

export const notificationCreateSchema = z.object({
  tenantId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  notificationType: z.string().min(1),
  recipientEmail: z.string().email(),
  emailSubject: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
});

export type NotificationCreate = z.infer<typeof notificationCreateSchema>;
