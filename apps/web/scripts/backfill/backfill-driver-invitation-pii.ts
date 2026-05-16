/**
 * Backfill script: encrypt DriverInvitation PII columns.
 *
 * Encrypts existing rows where:
 *   - licenseNumber IS NOT NULL AND licenseNumberCiphertext IS NULL
 *   - dateOfBirth IS NOT NULL AND dateOfBirthCiphertext IS NULL
 *
 * Idempotent: re-running picks up only un-encrypted rows.
 * Batched: 200 rows per transaction.
 * Verify: each licenseNumber row is read back and decrypted to confirm match.
 *
 * Run from apps/web/:
 *   npm run backfill:driver-invitation-pii
 *
 * IMPORTANT: Set KMS_KEY_v1, CURRENT_KMS_KEY_ID, VALID_KMS_KEY_IDS in .env.local first.
 *
 * Part of quick-347 PII encryption PR A.
 * Allowlisted in scripts/audit/raw-prisma-usage.ts (apps/web/scripts/ prefix).
 */

// Load .env.local for local dev (Next.js uses .env.local; dotenv defaults to .env)
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient, Prisma } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { encryptField, decryptField, last4 } = require('../../src/lib/security/field-crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getCurrentKey } = require('../../src/lib/security/key-registry');

const BATCH_SIZE = 200;
const TX_OPTIONS = { maxWait: 30000, timeout: 120000 } as const;

interface PendingRow {
  id: string;
  licenseNumber: string | null;
  licenseNumberCiphertext: Buffer | null;
  dateOfBirth: Date | null;
  dateOfBirthCiphertext: Buffer | null;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const { keyId } = getCurrentKey();
    console.log(`[backfill-driver-invitation-pii] Using KMS key: ${keyId}`);

    // Count rows needing encryption
    const countResult = await prisma.$queryRaw<Array<{ count: string }>>(
      Prisma.sql`
        SELECT COUNT(*)::text AS count
        FROM "DriverInvitation"
        WHERE (
          ("licenseNumber" IS NOT NULL AND "licenseNumberCiphertext" IS NULL)
          OR
          ("dateOfBirth" IS NOT NULL AND "dateOfBirthCiphertext" IS NULL)
        )
      `
    );
    const totalCount = parseInt(countResult[0]?.count ?? '0', 10);
    console.log(`[backfill-driver-invitation-pii] Rows needing encryption: ${totalCount}`);

    if (totalCount === 0) {
      console.log('[backfill-driver-invitation-pii] Nothing to backfill — all rows already encrypted or have no PII.');
      return;
    }

    let totalEncrypted = 0;
    let totalVerified = 0;
    let totalErrors = 0;

    // Process in batches (keyset-based: always fetch the first N needing encryption)
    while (true) {
      const rows = await prisma.$queryRaw<PendingRow[]>(
        Prisma.sql`
          SELECT id, "licenseNumber", "licenseNumberCiphertext", "dateOfBirth", "dateOfBirthCiphertext"
          FROM "DriverInvitation"
          WHERE (
            ("licenseNumber" IS NOT NULL AND "licenseNumberCiphertext" IS NULL)
            OR
            ("dateOfBirth" IS NOT NULL AND "dateOfBirthCiphertext" IS NULL)
          )
          ORDER BY "createdAt"
          LIMIT ${BATCH_SIZE}
        `
      );

      if (rows.length === 0) break;

      const batchResult = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

        let encrypted = 0;
        let verified = 0;
        let errors = 0;

        for (const row of rows) {
          try {
            const updatePayload: Record<string, Buffer | string> = {};

            // Encrypt licenseNumber if needed
            if (row.licenseNumber && !row.licenseNumberCiphertext) {
              const ef = encryptField(row.licenseNumber, keyId);
              updatePayload['licenseNumberCiphertext'] = ef.ciphertext;
              updatePayload['licenseNumberIv'] = ef.iv;
              updatePayload['licenseNumberTag'] = ef.tag;
              updatePayload['licenseNumberKeyId'] = ef.keyId;
              updatePayload['licenseNumberLast4'] = last4(row.licenseNumber);
            }

            // Encrypt dateOfBirth if needed (store ISO date string YYYY-MM-DD)
            if (row.dateOfBirth && !row.dateOfBirthCiphertext) {
              const dobString = row.dateOfBirth.toISOString().split('T')[0];
              const ef = encryptField(dobString, keyId);
              updatePayload['dateOfBirthCiphertext'] = ef.ciphertext;
              updatePayload['dateOfBirthIv'] = ef.iv;
              updatePayload['dateOfBirthTag'] = ef.tag;
              updatePayload['dateOfBirthKeyId'] = ef.keyId;
              updatePayload['dateOfBirthLast4'] = last4(row.dateOfBirth.getFullYear().toString());
            }

            if (Object.keys(updatePayload).length === 0) continue;

            await tx.driverInvitation.update({
              where: { id: row.id },
              data: updatePayload,
            });

            encrypted++;

            // Read back and verify licenseNumber decryption
            if (updatePayload['licenseNumberCiphertext']) {
              const rb = await tx.$queryRaw<Array<{
                licenseNumberCiphertext: Buffer;
                licenseNumberIv: Buffer;
                licenseNumberTag: Buffer;
                licenseNumberKeyId: string;
              }>>(
                Prisma.sql`
                  SELECT "licenseNumberCiphertext", "licenseNumberIv", "licenseNumberTag", "licenseNumberKeyId"
                  FROM "DriverInvitation"
                  WHERE id = ${row.id}::uuid
                `
              );

              if (!rb[0]) throw new Error(`Row ${row.id}: not found after update`);

              const decrypted = decryptField({
                ciphertext: rb[0].licenseNumberCiphertext,
                iv: rb[0].licenseNumberIv,
                tag: rb[0].licenseNumberTag,
                keyId: rb[0].licenseNumberKeyId,
              });

              if (decrypted !== row.licenseNumber) {
                throw new Error(`Row ${row.id}: licenseNumber decrypt-equals-plaintext mismatch`);
              }

              verified++;
            }
          } catch (err) {
            errors++;
            // Log only error message — never log plaintext values
            console.error(`[backfill-driver-invitation-pii] Error on row ${row.id}:`, (err as Error).message);
          }
        }

        return { encrypted, verified, errors };
      }, TX_OPTIONS);

      totalEncrypted += batchResult.encrypted;
      totalVerified += batchResult.verified;
      totalErrors += batchResult.errors;

      console.log(
        `[backfill-driver-invitation-pii] Batch done: ` +
        `encrypted=${batchResult.encrypted}, verified=${batchResult.verified}, errors=${batchResult.errors}`
      );

      // If no rows were encrypted in this batch, we're done
      if (batchResult.encrypted === 0) break;
    }

    console.log(
      `[backfill-driver-invitation-pii] Complete. ` +
      `total_encrypted=${totalEncrypted}, total_verified=${totalVerified}, total_errors=${totalErrors}`
    );

    if (totalErrors > 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[backfill-driver-invitation-pii] Fatal error:', err.message);
  process.exit(1);
});
