import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critical' | 'warning';
export type AlertType =
  | 'cdl_expiry'
  | 'registration_expiry'
  | 'insurance_expiry'
  | 'license_expiry'
  | 'contract_expiry';
export type EntityType = 'driver' | 'truck' | 'contract';

export interface ComplianceAlert {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  entityId: string;
  entityType: EntityType;
  link: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromNow(date: Date): number {
  const now = Date.now();
  const diff = date.getTime() - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function severity(daysLeft: number, criticalThreshold: number): AlertSeverity {
  return daysLeft <= criticalThreshold || daysLeft < 0 ? 'critical' : 'warning';
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function getComplianceAlerts(orgId: string): Promise<ComplianceAlert[]> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const alerts: ComplianceAlert[] = [];

  try {
    // --- CDL expiry: warn within 60 days ---
    const drivers = await prisma.carrierDriver.findMany({
      where: {
        orgId,
        status: 'active',
        cdlExpiry: { lte: in60Days },
      },
      select: { id: true, firstName: true, lastName: true, cdlExpiry: true },
    });

    for (const d of drivers) {
      if (!d.cdlExpiry) continue;
      const days = daysFromNow(d.cdlExpiry);
      const expired = days < 0;
      alerts.push({
        type: 'cdl_expiry',
        severity: severity(days, 30),
        message: expired
          ? `${d.firstName} ${d.lastName}: CDL expired ${Math.abs(days)}d ago`
          : `${d.firstName} ${d.lastName}: CDL expires in ${days}d`,
        entityId: d.id,
        entityType: 'driver',
        link: `/carrier/fleet/drivers/${d.id}`,
      });
    }

    // --- Registration expiry: warn within 30 days ---
    const regTrucks = await prisma.carrierTruck.findMany({
      where: {
        orgId,
        status: 'active',
        registrationExpiry: { lte: in30Days },
      },
      select: { id: true, unitNumber: true, registrationExpiry: true },
    });

    for (const t of regTrucks) {
      if (!t.registrationExpiry) continue;
      const days = daysFromNow(t.registrationExpiry);
      const expired = days < 0;
      alerts.push({
        type: 'registration_expiry',
        severity: severity(days, 14),
        message: expired
          ? `Truck ${t.unitNumber}: registration expired ${Math.abs(days)}d ago`
          : `Truck ${t.unitNumber}: registration expires in ${days}d`,
        entityId: t.id,
        entityType: 'truck',
        link: `/carrier/fleet/trucks/${t.id}`,
      });
    }

    // --- Insurance expiry: warn within 30 days ---
    const insTrucks = await prisma.carrierTruck.findMany({
      where: {
        orgId,
        status: 'active',
        insuranceExpiry: { lte: in30Days },
      },
      select: { id: true, unitNumber: true, insuranceExpiry: true },
    });

    for (const t of insTrucks) {
      if (!t.insuranceExpiry) continue;
      const days = daysFromNow(t.insuranceExpiry);
      const expired = days < 0;
      alerts.push({
        type: 'insurance_expiry',
        severity: severity(days, 14),
        message: expired
          ? `Truck ${t.unitNumber}: insurance expired ${Math.abs(days)}d ago`
          : `Truck ${t.unitNumber}: insurance expires in ${days}d`,
        entityId: t.id,
        entityType: 'truck',
        link: `/carrier/fleet/trucks/${t.id}`,
      });
    }

    // --- License expiry: warn within 30 days ---
    const licTrucks = await prisma.carrierTruck.findMany({
      where: {
        orgId,
        status: 'active',
        licenseExpiry: { lte: in30Days },
      },
      select: { id: true, unitNumber: true, licenseExpiry: true },
    });

    for (const t of licTrucks) {
      if (!t.licenseExpiry) continue;
      const days = daysFromNow(t.licenseExpiry);
      const expired = days < 0;
      alerts.push({
        type: 'license_expiry',
        severity: severity(days, 14),
        message: expired
          ? `Truck ${t.unitNumber}: license expired ${Math.abs(days)}d ago`
          : `Truck ${t.unitNumber}: license expires in ${days}d`,
        entityId: t.id,
        entityType: 'truck',
        link: `/carrier/fleet/trucks/${t.id}`,
      });
    }

    // --- Contract expiry: active contracts expiring within 30 days ---
    const contracts = await prisma.carrierContract.findMany({
      where: {
        orgId,
        status: 'active',
        expirationDate: { lte: in30Days },
      },
      select: { id: true, contractNumber: true, expirationDate: true },
    });

    for (const c of contracts) {
      if (!c.expirationDate) continue;
      const days = daysFromNow(c.expirationDate);
      const expired = days < 0;
      const label = c.contractNumber ?? c.id.slice(0, 8);
      alerts.push({
        type: 'contract_expiry',
        severity: severity(days, 14),
        message: expired
          ? `Contract ${label} expired ${Math.abs(days)}d ago`
          : `Contract ${label} expires in ${days}d`,
        entityId: c.id,
        entityType: 'contract',
        link: `/carrier/contracts/${c.id}`,
      });
    }

    // Sort: critical first, then by message
    alerts.sort((a, b) => {
      if (a.severity === 'critical' && b.severity !== 'critical') return -1;
      if (a.severity !== 'critical' && b.severity === 'critical') return 1;
      return a.message.localeCompare(b.message);
    });

    return alerts;
  } catch (err) {
    logger.error('getComplianceAlerts failed', err);
    throw err;
  }
}
