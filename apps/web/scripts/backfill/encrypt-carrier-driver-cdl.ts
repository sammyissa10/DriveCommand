/**
 * Backfill script: encrypt carrier_drivers.cdl_number → encrypted shape columns.
 *
 * Runs inside a single transaction with bypass_rls.
 * For every row where cdl_number IS NOT NULL and cdl_number_ciphertext IS NULL:
 *   1. Encrypt cdl_number with the current KMS key.
 *   2. Write cdl_number_ciphertext, cdl_number_iv, cdl_number_tag,
 *      cdl_number_key_id, cdl_number_last4.
 *   3. Read back and decrypt — assert decrypt === original plaintext.
 *      If mismatch, throws → entire transaction rolls back.
 *
 * Logs only counts. Never logs cdl_number plaintext.
 *
 * Run from apps/web/:
 *   npm run backfill:carrier-driver-cdl
 *
 * Part of quick-329 PII encryption PR1.
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
const { encryptField, decryptField } = require('../../src/lib/security/field-crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getCurrentKey } = require('../../src/lib/security/key-registry');

const TX_OPTIONS = { maxWait: 30000, timeout: 60000 } as const;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Bypass RLS for the backfill operation
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Fetch all rows where cdl_number is populated but ciphertext is not yet written
      const rows = await tx.$queryRaw<
        Array<{ id: string; cdl_number: string; org_id: string }>
      >(
        Prisma.sql`
          SELECT id, cdl_number, org_id
          FROM carrier_drivers
          WHERE cdl_number IS NOT NULL
            AND cdl_number_ciphertext IS NULL
        `
      );

      console.log(`Found ${rows.length} row(s) to backfill`);

      let backfilledCount = 0;
      let verifiedCount = 0;

      const { keyId } = getCurrentKey();

      for (const row of rows) {
        // Encrypt
        const ef = encryptField(row.cdl_number, keyId);

        // Write encrypted shape
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE carrier_drivers
            SET
              cdl_number_ciphertext = ${ef.ciphertext},
              cdl_number_iv         = ${ef.iv},
              cdl_number_tag        = ${ef.tag},
              cdl_number_key_id     = ${ef.keyId},
              cdl_number_last4      = ${row.cdl_number.slice(-4)}
            WHERE id = ${row.id}::uuid
          `
        );

        backfilledCount++;

        // Read back and verify
        const readBack = await tx.$queryRaw<
          Array<{
            cdl_number_ciphertext: Buffer;
            cdl_number_iv: Buffer;
            cdl_number_tag: Buffer;
            cdl_number_key_id: string;
          }>
        >(
          Prisma.sql`
            SELECT cdl_number_ciphertext, cdl_number_iv, cdl_number_tag, cdl_number_key_id
            FROM carrier_drivers
            WHERE id = ${row.id}::uuid
          `
        );

        if (!readBack[0]) {
          throw new Error(`Backfill verification failed: row ${row.id} not found after update`);
        }

        const rb = readBack[0];
        const decrypted = decryptField({
          ciphertext: rb.cdl_number_ciphertext,
          iv: rb.cdl_number_iv,
          tag: rb.cdl_number_tag,
          keyId: rb.cdl_number_key_id,
        });

        if (decrypted !== row.cdl_number) {
          throw new Error(
            `Backfill verification failed: decrypt-equals-plaintext mismatch for row ${row.id}`
          );
        }

        verifiedCount++;
      }

      return { backfilledCount, verifiedCount };
    }, TX_OPTIONS);

    console.log(
      `backfilled ${result.backfilledCount} row${result.backfilledCount !== 1 ? 's' : ''}, ` +
      `verified ${result.verifiedCount} decrypt-equals match${result.verifiedCount !== 1 ? 'es' : ''}`
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
