'use server';

import { addDays, subDays } from 'date-fns';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { documentMetadataSchema } from '@/lib/validations/truck.schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentStatus = 'OK' | 'EXPIRING_SOON' | 'EXPIRED';
type TruckFieldStatus = 'OK' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_SET';

export interface DriverDocumentItem {
  id: string;
  documentType: string;
  fileName: string;
  expiryDate: string; // ISO string
  status: DocumentStatus;
}

export interface DriverComplianceItem {
  driverId: string;
  driverName: string;
  isActive: boolean;
  documents: DriverDocumentItem[];
  overallStatus: DocumentStatus;
  highCriticalEvents: number;
}

export interface TruckFieldCompliance {
  expiry: string | null; // ISO string or null
  status: TruckFieldStatus;
}

export interface TruckComplianceItem {
  truckId: string;
  truckLabel: string; // e.g. "2021 Kenworth T680"
  licensePlate: string;
  registration: TruckFieldCompliance;
  insurance: TruckFieldCompliance;
  overallStatus: TruckFieldStatus;
}

export interface ComplianceAlert {
  type: 'driver_document' | 'truck_registration' | 'truck_insurance';
  entityId: string;
  entityName: string;
  item: string; // document type or "Registration" / "Insurance"
  expiryDate: string; // ISO string
  status: 'EXPIRED' | 'EXPIRING_SOON';
  daysUntilExpiry: number; // negative = already expired
}

export interface ComplianceDashboardData {
  drivers: DriverComplianceItem[];
  trucks: TruckComplianceItem[];
  alerts: ComplianceAlert[];
  summary: {
    expiredCount: number;
    expiringSoonCount: number;
    criticalSafetyCount: number;
    highSafetyCount: number;
    totalDriversTracked: number;
    totalTrucksTracked: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDocumentStatus(expiryDate: Date, now: Date, thirtyDaysOut: Date): DocumentStatus {
  if (expiryDate < now) return 'EXPIRED';
  if (expiryDate <= thirtyDaysOut) return 'EXPIRING_SOON';
  return 'OK';
}

function getTruckFieldStatus(expiryStr: string | undefined, now: Date, thirtyDaysOut: Date): TruckFieldStatus {
  if (!expiryStr) return 'NOT_SET';
  const date = new Date(expiryStr);
  if (isNaN(date.getTime())) return 'NOT_SET';
  return getDocumentStatus(date, now, thirtyDaysOut);
}

/** Worst status across multiple document statuses (EXPIRED > EXPIRING_SOON > OK) */
function worstDocumentStatus(statuses: DocumentStatus[]): DocumentStatus {
  if (statuses.includes('EXPIRED')) return 'EXPIRED';
  if (statuses.includes('EXPIRING_SOON')) return 'EXPIRING_SOON';
  return 'OK';
}

/** Worst status across two truck field statuses (EXPIRED > EXPIRING_SOON > OK > NOT_SET) */
function worstTruckStatus(a: TruckFieldStatus, b: TruckFieldStatus): TruckFieldStatus {
  const rank: Record<TruckFieldStatus, number> = {
    EXPIRED: 3,
    EXPIRING_SOON: 2,
    OK: 1,
    NOT_SET: 0,
  };
  return rank[a] >= rank[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

/**
 * Get compliance dashboard data for the fleet.
 * Aggregates driver document expiry, truck registration/insurance expiry,
 * and safety violation counts for OWNER/MANAGER role.
 */
export async function getComplianceDashboard(): Promise<ComplianceDashboardData> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  const now = new Date();
  const thirtyDaysOut = addDays(now, 30);
  const ninetyDaysAgo = subDays(now, 90);

  // -------------------------------------------------------------------------
  // 1. Driver documents with expiry dates
  // -------------------------------------------------------------------------
  const driverDocs = await prisma.document.findMany({
    where: { driverId: { not: null }, expiryDate: { not: null } },
    select: {
      id: true,
      driverId: true,
      documentType: true,
      expiryDate: true,
      fileName: true,
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      },
    },
    orderBy: { expiryDate: 'asc' },
  });

  // -------------------------------------------------------------------------
  // 2. Trucks with documentMetadata
  // -------------------------------------------------------------------------
  const trucks = await prisma.truck.findMany({
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      licensePlate: true,
      documentMetadata: true,
    },
  });

  // -------------------------------------------------------------------------
  // 3. HIGH/CRITICAL safety events in last 90 days
  // -------------------------------------------------------------------------
  const safetyEvents = await prisma.safetyEvent.findMany({
    where: {
      severity: { in: ['HIGH', 'CRITICAL'] },
      timestamp: { gte: ninetyDaysAgo },
      driverId: { not: null },
    },
    select: {
      driverId: true,
      severity: true,
      timestamp: true,
      eventType: true,
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  // -------------------------------------------------------------------------
  // Build safety event counts per driver
  // -------------------------------------------------------------------------
  const safetyCountByDriver = new Map<string, number>();
  let criticalSafetyCount = 0;
  let highSafetyCount = 0;

  for (const event of safetyEvents) {
    if (!event.driverId) continue;
    const existing = safetyCountByDriver.get(event.driverId) ?? 0;
    safetyCountByDriver.set(event.driverId, existing + 1);
    if (event.severity === 'CRITICAL') criticalSafetyCount++;
    if (event.severity === 'HIGH') highSafetyCount++;
  }

  // -------------------------------------------------------------------------
  // Build DriverComplianceItem list (group docs by driver)
  // -------------------------------------------------------------------------
  const driverMap = new Map<string, DriverComplianceItem>();

  for (const doc of driverDocs) {
    if (!doc.driverId || !doc.driver || !doc.expiryDate) continue;

    const expiryDate = new Date(doc.expiryDate);
    const docStatus = getDocumentStatus(expiryDate, now, thirtyDaysOut);

    const docItem: DriverDocumentItem = {
      id: doc.id,
      documentType: doc.documentType ?? 'GENERAL',
      fileName: doc.fileName,
      expiryDate: doc.expiryDate.toISOString(),
      status: docStatus,
    };

    if (driverMap.has(doc.driverId)) {
      const existing = driverMap.get(doc.driverId)!;
      existing.documents.push(docItem);
      // Recompute overall status
      existing.overallStatus = worstDocumentStatus(
        existing.documents.map((d) => d.status)
      );
    } else {
      driverMap.set(doc.driverId, {
        driverId: doc.driverId,
        driverName: `${doc.driver.firstName} ${doc.driver.lastName}`.trim(),
        isActive: doc.driver.isActive ?? true,
        documents: [docItem],
        overallStatus: docStatus,
        highCriticalEvents: safetyCountByDriver.get(doc.driverId) ?? 0,
      });
    }
  }

  // Update highCriticalEvents for all drivers (including those already in map)
  for (const [driverId, item] of driverMap.entries()) {
    item.highCriticalEvents = safetyCountByDriver.get(driverId) ?? 0;
  }

  const drivers = Array.from(driverMap.values());

  // -------------------------------------------------------------------------
  // Build TruckComplianceItem list
  // -------------------------------------------------------------------------
  const truckItems: TruckComplianceItem[] = trucks.map((truck) => {
    const parsed = documentMetadataSchema.safeParse(truck.documentMetadata);
    const metadata = parsed.success ? parsed.data : {};

    const registrationStatus = getTruckFieldStatus(
      metadata.registrationExpiry,
      now,
      thirtyDaysOut
    );
    const insuranceStatus = getTruckFieldStatus(
      metadata.insuranceExpiry,
      now,
      thirtyDaysOut
    );

    const overall = worstTruckStatus(registrationStatus, insuranceStatus);

    return {
      truckId: truck.id,
      truckLabel: `${truck.year} ${truck.make} ${truck.model}`,
      licensePlate: truck.licensePlate,
      registration: {
        expiry: metadata.registrationExpiry ?? null,
        status: registrationStatus,
      },
      insurance: {
        expiry: metadata.insuranceExpiry ?? null,
        status: insuranceStatus,
      },
      overallStatus: overall,
    };
  });

  // -------------------------------------------------------------------------
  // Build alerts list
  // -------------------------------------------------------------------------
  const alerts: ComplianceAlert[] = [];

  // Driver document alerts
  for (const driver of drivers) {
    for (const doc of driver.documents) {
      if (doc.status === 'OK') continue;
      const expiry = new Date(doc.expiryDate);
      const daysUntilExpiry = Math.round(
        (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      alerts.push({
        type: 'driver_document',
        entityId: driver.driverId,
        entityName: driver.driverName,
        item: doc.documentType,
        expiryDate: doc.expiryDate,
        status: doc.status,
        daysUntilExpiry,
      });
    }
  }

  // Truck alerts
  for (const truck of truckItems) {
    if (
      truck.registration.status === 'EXPIRED' ||
      truck.registration.status === 'EXPIRING_SOON'
    ) {
      const expiry = new Date(truck.registration.expiry!);
      const daysUntilExpiry = Math.round(
        (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      alerts.push({
        type: 'truck_registration',
        entityId: truck.truckId,
        entityName: truck.truckLabel,
        item: 'Registration',
        expiryDate: truck.registration.expiry!,
        status: truck.registration.status,
        daysUntilExpiry,
      });
    }

    if (
      truck.insurance.status === 'EXPIRED' ||
      truck.insurance.status === 'EXPIRING_SOON'
    ) {
      const expiry = new Date(truck.insurance.expiry!);
      const daysUntilExpiry = Math.round(
        (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      alerts.push({
        type: 'truck_insurance',
        entityId: truck.truckId,
        entityName: truck.truckLabel,
        item: 'Insurance',
        expiryDate: truck.insurance.expiry!,
        status: truck.insurance.status,
        daysUntilExpiry,
      });
    }
  }

  // Sort: EXPIRED first, then EXPIRING_SOON by soonest expiry
  alerts.sort((a, b) => {
    if (a.status === 'EXPIRED' && b.status !== 'EXPIRED') return -1;
    if (a.status !== 'EXPIRED' && b.status === 'EXPIRED') return 1;
    return a.daysUntilExpiry - b.daysUntilExpiry;
  });

  // -------------------------------------------------------------------------
  // Summary counts
  // -------------------------------------------------------------------------
  let expiredCount = 0;
  let expiringSoonCount = 0;

  for (const alert of alerts) {
    if (alert.status === 'EXPIRED') expiredCount++;
    if (alert.status === 'EXPIRING_SOON') expiringSoonCount++;
  }

  return {
    drivers,
    trucks: truckItems,
    alerts,
    summary: {
      expiredCount,
      expiringSoonCount,
      criticalSafetyCount,
      highSafetyCount,
      totalDriversTracked: drivers.length,
      totalTrucksTracked: truckItems.length,
    },
  };
}
