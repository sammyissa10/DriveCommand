/**
 * Pure utility for computing a driver's operational status from their related data.
 * No DB calls — accepts already-fetched data and returns the derived status.
 *
 * Priority order (highest wins):
 *   1. Deactivated   — isActive === false
 *   2. Expired Docs  — any document or license expiration date is in the past
 *   3. Expiring Soon — any document or license expires within 30 days
 *   4. Active        — none of the above
 */

export type DriverStatus = 'Active' | 'Expiring Soon' | 'Expired Docs' | 'Deactivated';

export type DriverStatusVariant = 'success' | 'warning' | 'danger' | 'neutral';

export interface DriverStatusInfo {
  status: DriverStatus;
  variant: DriverStatusVariant;
}

export interface ComplianceAlert {
  type: string;
  label: string;
  days: number | null;
}

/** Minimal shape of related data expected by computeDriverStatus. */
export interface DriverWithRelations {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  licenseNumber: string | null;
  isActive: boolean;
  isDispatchReady: boolean;
  role: string;
  isSample?: boolean;
  phoneNumber?: string | null;
  licenseExpirationDate?: Date | null;
  /** Documents with an expiry date (pre-filtered to expiryDate not null). */
  documents: {
    id: string;
    documentType: string | null;
    expiryDate: Date | null;
  }[];
  /** Optional audit fields. */
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: { firstName: string | null; lastName: string | null; email: string } | null;
  updatedBy?: { firstName: string | null; lastName: string | null; email: string } | null;
}

/**
 * Compute the operational status of a driver from their related data.
 *
 * @param driver - Driver with pre-fetched relations (documents, etc.).
 * @returns A DriverStatusInfo containing the human-readable status and badge variant.
 */
export function computeDriverStatus(driver: DriverWithRelations): DriverStatusInfo {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // 1. Deactivated — isActive === false
  if (!driver.isActive) {
    return { status: 'Deactivated', variant: 'neutral' };
  }

  // Check license expiration date
  let hasExpiredDocs = false;
  let hasExpiringSoon = false;

  if (driver.licenseExpirationDate) {
    const licenseDate = new Date(driver.licenseExpirationDate);
    if (licenseDate < now) {
      hasExpiredDocs = true;
    } else if (licenseDate <= thirtyDaysFromNow) {
      hasExpiringSoon = true;
    }
  }

  // Check document expiry dates
  for (const doc of driver.documents ?? []) {
    if (doc.expiryDate) {
      const expiryDate = new Date(doc.expiryDate);
      if (expiryDate < now) {
        hasExpiredDocs = true;
        break; // No need to check further
      } else if (expiryDate <= thirtyDaysFromNow) {
        hasExpiringSoon = true;
      }
    }
  }

  // 2. Expired Docs — at least one document or license has passed its expiry date
  if (hasExpiredDocs) {
    return { status: 'Expired Docs', variant: 'danger' };
  }

  // 3. Expiring Soon — at least one document or license expires within 30 days
  if (hasExpiringSoon) {
    return { status: 'Expiring Soon', variant: 'warning' };
  }

  // 4. Default — driver is active and compliant
  return { status: 'Active', variant: 'success' };
}

/**
 * Calculate the number of days until a date.
 * Returns negative numbers for past dates.
 */
function getDaysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get compliance alerts for a driver.
 * Returns an array of alerts for license and key document expiry dates.
 *
 * @param driver - Driver with pre-fetched relations.
 * @returns Array of ComplianceAlert objects.
 */
export function getDriverComplianceAlerts(driver: DriverWithRelations): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];

  // License expiration date
  if (driver.licenseExpirationDate) {
    alerts.push({
      type: 'license',
      label: 'License Expiry',
      days: getDaysUntil(driver.licenseExpirationDate),
    });
  }

  // Check for MEDICAL_CARD document
  const medicalCard = driver.documents?.find(
    (doc) => doc.documentType === 'MEDICAL_CARD' && doc.expiryDate
  );
  if (medicalCard) {
    alerts.push({
      type: 'medical_card',
      label: 'Medical Card Expiry',
      days: getDaysUntil(medicalCard.expiryDate),
    });
  }

  // Check for DRIVER_LICENSE or CDL_SCAN document
  const cdlDoc = driver.documents?.find(
    (doc) =>
      (doc.documentType === 'DRIVER_LICENSE' || doc.documentType === 'CDL_SCAN') &&
      doc.expiryDate
  );
  if (cdlDoc) {
    alerts.push({
      type: 'cdl',
      label: 'CDL Expiry',
      days: getDaysUntil(cdlDoc.expiryDate),
    });
  }

  return alerts;
}
