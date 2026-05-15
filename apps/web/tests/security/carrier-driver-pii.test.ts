/**
 * CarrierDriver PII end-to-end tests.
 *
 * Case A — Create + redacted read:
 *   - createCarrierDriver with cdlNumber='D1234567'.
 *   - Direct DB query asserts plaintext + ciphertext + last4 stored correctly.
 *   - getCarrierDriver returns cdlNumber=null + cdlNumberLast4='4567'.
 *
 * Case B — MANAGER decrypt success:
 *   - decryptCarrierDriverCDL as MANAGER → { ok: true, cdlNumber: 'D1234567' }.
 *   - VIEW_PII audit row exists.
 *
 * Case C — DRIVER denied:
 *   - decryptCarrierDriverCDL as DRIVER → { ok: false, status: 403 }.
 *   - VIEW_PII_DENIED audit row exists.
 *
 * Skipped when DATABASE_URL is not set.
 * Sets KMS env vars in beforeAll.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import {
  prisma,
  createTestTenant,
  createTestUser,
  cleanupTestData,
  disconnectPrisma,
} from '../isolation/setup';
import {
  createCarrierDriver,
  getCarrierDriver,
  decryptCarrierDriverCDL,
} from '@/lib/carrier/fleet-drivers';

const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

const TEST_KEY_HEX = 'b'.repeat(64); // 32 bytes of 0xbb — test-only, never reuse
const TEST_CDL = 'D1234567';

describeWithDb('CarrierDriver PII end-to-end (spec §4.1, §4.4)', () => {
  let tenantAId: string;
  let managerUserId: string;
  let driverUserId: string;
  let driverId: string;

  beforeAll(async () => {
    // Set KMS env vars BEFORE importing anything that uses the crypto layer
    process.env.KMS_KEY_v1 = TEST_KEY_HEX;
    process.env.CURRENT_KMS_KEY_ID = 'v1';
    process.env.VALID_KMS_KEY_IDS = 'v1';

    const tenantA = await createTestTenant('Test Tenant A PII');
    tenantAId = tenantA.id;

    const managerUser = await createTestUser(tenantAId, {
      clerkUserId: `pii-test-manager-${Date.now()}`,
      email: `pii-manager-${Date.now()}@example.com`,
      role: 'MANAGER',
    });
    const driverUser = await createTestUser(tenantAId, {
      clerkUserId: `pii-test-driver-${Date.now()}`,
      email: `pii-driver-${Date.now()}@example.com`,
      role: 'DRIVER',
    });
    managerUserId = managerUser.id;
    driverUserId = driverUser.id;
  });

  afterAll(async () => {
    // Clean up: remove audit log entries and carrier driver
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      if (driverId) {
        await tx.auditLog.deleteMany({ where: { resourceId: driverId } });
        await tx.carrierDriver.deleteMany({ where: { id: driverId } });
      }
    });
    await cleanupTestData();
    await disconnectPrisma();
  });

  it('Case A: create stores both plaintext and ciphertext; default read returns only last4', async () => {
    // Create driver with CDL
    const result = await createCarrierDriver(tenantAId, {
      firstName: 'Test',
      lastName: 'PiiDriver',
      cdlNumber: TEST_CDL,
    });
    driverId = result.driver.id;

    // --- Direct DB query (bypass_rls) to assert raw storage ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawRows = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return tx.$queryRaw(
        Prisma.sql`
          SELECT cdl_number, cdl_number_ciphertext, cdl_number_last4, cdl_number_key_id
          FROM carrier_drivers
          WHERE id = ${driverId}::uuid
        `
      ) as Promise<Array<{
        cdl_number: string | null;
        cdl_number_ciphertext: Buffer | null;
        cdl_number_last4: string | null;
        cdl_number_key_id: string | null;
      }>>;
    });

    const raw = rawRows[0];
    expect(raw).toBeDefined();
    // Plaintext preserved (dual-write window)
    expect(raw.cdl_number).toBe(TEST_CDL);
    // Ciphertext populated
    expect(raw.cdl_number_ciphertext).not.toBeNull();
    expect(Buffer.isBuffer(raw.cdl_number_ciphertext)).toBe(true);
    // Last4 correct
    expect(raw.cdl_number_last4).toBe('4567');
    // Key ID set
    expect(raw.cdl_number_key_id).toBe('v1');

    // --- Default read via getCarrierDriver: CDL is redacted ---
    const driverView = await getCarrierDriver(tenantAId, driverId);
    expect(driverView).not.toBeNull();
    expect(driverView!.cdlNumber).toBeNull();
    expect(driverView!.cdlNumberLast4).toBe('4567');
    expect(driverView!.cdlNumberCiphertext).toBeNull();
    expect(driverView!.cdlNumberIv).toBeNull();
    expect(driverView!.cdlNumberTag).toBeNull();
    expect(driverView!.cdlNumberKeyId).toBeNull();
  });

  it('Case B: MANAGER decrypt returns plaintext and writes VIEW_PII audit row', async () => {
    expect(driverId).toBeDefined();

    // Count audit rows before
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.count({
        where: { resourceId: driverId, action: 'VIEW_PII' },
      });
    });

    const decryptResult = await decryptCarrierDriverCDL({
      orgId: tenantAId,
      driverId,
      requestingUserId: managerUserId,
      requestingUserRole: 'MANAGER',
    });

    expect(decryptResult).toEqual({ ok: true, cdlNumber: TEST_CDL });

    // Assert VIEW_PII audit row written
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const after = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.findMany({
        where: {
          action: 'VIEW_PII',
          resourceId: driverId,
          resourceType: 'carrier_driver',
          fieldName: 'cdl_number',
          userId: managerUserId,
          tenantId: tenantAId,
        },
      });
    });

    expect(after.length).toBe(before + 1);
  });

  it('Case C: DRIVER decrypt returns 403 and writes VIEW_PII_DENIED audit row', async () => {
    expect(driverId).toBeDefined();

    const decryptResult = await decryptCarrierDriverCDL({
      orgId: tenantAId,
      driverId,
      requestingUserId: driverUserId,
      requestingUserRole: 'DRIVER',
    });

    expect(decryptResult).toEqual({ ok: false, status: 403 });

    // Assert VIEW_PII_DENIED audit row written
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deniedRows = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.findMany({
        where: {
          action: 'VIEW_PII_DENIED',
          resourceId: driverId,
          resourceType: 'carrier_driver',
          fieldName: 'cdl_number',
          userId: driverUserId,
          tenantId: tenantAId,
        },
      });
    });

    expect(deniedRows.length).toBeGreaterThanOrEqual(1);
  });
});
