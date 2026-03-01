'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';

/**
 * Submit an incident report from the driver.
 */
export async function submitIncidentReport(prevState: any, formData: FormData) {
  await requireRole([UserRole.DRIVER]);

  const type = formData.get('type') as string;
  const description = formData.get('description') as string;
  const location = formData.get('location') as string;

  if (!type) return { error: { type: ['Incident type is required'] } };
  if (!description || description.trim().length < 10) {
    return { error: { description: ['Please provide at least 10 characters of detail'] } };
  }

  // In production, this would create a safety event record with optional photo uploads
  return { success: true, message: 'Incident report submitted successfully. Dispatch has been notified.' };
}

/**
 * Get the driver's recent incident reports.
 */
export async function getMyIncidentReports() {
  await requireRole([UserRole.DRIVER]);

  // Feature scaffold - would query safety events for current driver
  return [];
}
