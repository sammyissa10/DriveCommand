'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';

/**
 * Fleet messaging - get messages for the current driver.
 * In a real implementation this would use a proper messaging model.
 * For now we return empty array (feature scaffold).
 */
export async function getDriverMessages() {
  await requireRole([UserRole.DRIVER]);
  // Messages feature scaffold - would connect to a real messaging model
  return [];
}

/**
 * Send a message from the driver to dispatch.
 */
export async function sendDriverMessage(prevState: any, formData: FormData) {
  await requireRole([UserRole.DRIVER]);

  const message = formData.get('message') as string;
  if (!message || message.trim().length === 0) {
    return { error: 'Message cannot be empty.' };
  }

  // In production, this would create a message record and notify dispatch
  return { success: true, message: 'Message sent to dispatch.' };
}
