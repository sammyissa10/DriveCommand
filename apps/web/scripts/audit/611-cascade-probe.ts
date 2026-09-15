/**
 * quick-611 — does the `25P02` cascade actually happen in THIS stack?
 *
 *   npx tsx scripts/audit/611-cascade-probe.ts
 *
 * ─── WHY THIS RUNS EVEN THOUGH ZERO SITES ARE LIVE ─────────────────────────
 *
 * `611-transaction-scope.ts` measured all 17 sites: 0 LIVE, 16 DORMANT, 1
 * IMPOSSIBLE. So there is no live site to force a cascade on, and the brief's
 * step 3 has nothing to point at.
 *
 * What is still worth measuring — and is arguably worth MORE, given the
 * verdict — is the MECHANISM, for two reasons:
 *
 *   1. "Dormant" is only a useful verdict if the waking condition is a real
 *      hazard. If the cascade did not actually occur in this stack (Prisma 7 +
 *      @prisma/adapter-pg + Supavisor + `app_user`), then the 16 would be
 *      dormant-and-harmless and the whole finding would be folklore. The brief
 *      is explicit that a claim about PostgreSQL semantics is not the same as
 *      this codebase doing it.
 *   2. Whoever eventually wakes one of the 16 needs a known-good remedy. The
 *      savepoint shape is ASSERTED by the source audit and has never been run
 *      here. Prisma 7 has no `tx.$savepoint()`, so whether raw SAVEPOINT /
 *      ROLLBACK TO through `tx.$executeRawUnsafe` genuinely clears the aborted
 *      state is a question only a measurement answers.
 *
 * ─── THREE CONTROLS, AND ALL THREE ARE REQUIRED ────────────────────────────
 *
 *   A  TRUE POSITIVE — the shape a woken site would have. Earlier write, then a
 *      swallowed failing statement, then a later write, ALL on the same `tx`.
 *      Expect: later write fails `25P02`, and the EARLIER WRITE IS GONE.
 *
 *   B  FALSE POSITIVE — the `api/driver/gps-ping/route.ts` shape, where the try
 *      WRAPS the transaction and the catch is its sibling. Expect: no cascade,
 *      earlier write survives, later write succeeds. Without B, A alone would
 *      "prove" a cascade that the analyser's IMPOSSIBLE verdict says cannot
 *      happen there — B is what makes that verdict falsifiable.
 *
 *   C  THE REMEDY — A plus a SAVEPOINT around the statement allowed to fail.
 *      Expect: earlier write survives AND later write succeeds, with the catch
 *      still swallowing exactly as the source does.
 *
 * ─── SAFETY ────────────────────────────────────────────────────────────────
 *
 * STAGING ONLY. Never imports `scripts/_bootstrap-env`; loads
 * `apps/web/.env.staging` and refuses POSITIVELY on anything that is not the
 * staging ref. Prints the resolved project ref to stderr (quick-607).
 *
 * `DATABASE_URL` and `TENANT_CONTEXT_TRIPWIRE` are assigned BEFORE any app
 * module is imported, because `prisma.ts` evaluates `ARM_TRIPWIRE` at module
 * scope — an import hoisted above that assignment builds an unarmed pool. Hence
 * the dynamic `await import()`.
 *
 * Every row it writes is tagged `QUICK611-<runId>` and deleted in a `finally`,
 * whose landing is ASSERTED (a leftover row on staging is drift, and a teardown
 * that silently did nothing is the quick-546 shape). No pre-existing row is
 * read, written or deleted.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`611-cascade-probe: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

const APP_USER_URL = staging(process.env.STAGING_DATABASE_URL_APP_USER, 'STAGING_DATABASE_URL_APP_USER');
const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');

const RUN_ID = randomUUID().slice(0, 8);
const TAG = `QUICK611-${RUN_ID}`;

/** The SQLSTATE, by CODE, walking the cause chain (quick-610: Prisma hides it on err.cause). */
function sqlstateOf(err: unknown): string {
  let node: unknown = err;
  for (let d = 0; node && d < 6; d++) {
    const code = (node as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
    node = (node as { cause?: unknown }).cause;
  }
  return 'UNKNOWN';
}

interface ControlResult {
  control: 'A' | 'B' | 'C';
  name: string;
  shape: string;
  earlierWriteSurvived: boolean | null;
  laterWriteSucceeded: boolean;
  swallowedSqlstate: string;
  laterSqlstate: string | null;
  outerSqlstate: string | null;
  expectation: string;
  matchedExpectation: boolean;
}

async function main() {
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
  process.env.PG_CONNECT_TIMEOUT_MS = process.env.PG_CONNECT_TIMEOUT_MS ?? '20000';

  // Tenant id read from staging, never hardcoded.
  const admin = new Client({ connectionString: DIRECT_URL });
  await admin.connect();
  const t = await admin.query(`select id from "Tenant" where name = $1`, ['Staging Alpha Carriers']);
  if (!t.rows.length) refuse('staging tenant "Staging Alpha Carriers" not found');
  const ORG_ID = t.rows[0].id as string;
  await admin.end();

  console.error(`[611-cascade] project : ${STAGING_REF} (staging)`);
  console.error(`[611-cascade] role    : app_user · tripwire on`);
  console.error(`[611-cascade] org     : ${ORG_ID}`);
  console.error(`[611-cascade] tag     : ${TAG}`);

  const { getTenantPrismaForOrg } = await import('@/lib/context/tenant-context');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await getTenantPrismaForOrg(ORG_ID)) as any;

  /** A uuid that is NOT a User — the FK carrier_drivers_user_id_fkey rejects it (23503). */
  const BOGUS_USER_ID = randomUUID();

  const results: ControlResult[] = [];
  const created: string[] = [];

  const mkName = (control: string, which: string) => ({
    firstName: TAG,
    lastName: `${control}-${which}`,
  });

  try {
    // ───────────────────────────────────────────────────────────────────────
    // CONTROL A — the shape a woken site would have. Everything on one `tx`.
    // This is `createCarrierDriver`'s exact structure: create, then a swallowed
    // `carrierDriver.update` that sets userId, then more writes.
    // ───────────────────────────────────────────────────────────────────────
    let aSwallowed = 'NONE';
    let aLater: string | null = null;
    let aOuter: string | null = null;
    let aLaterOk = false;
    let aEarlierId: string | null = null;

    try {
      await db.$transaction(async (tx: any) => {
        const earlier = await tx.carrierDriver.create({
          data: { orgId: ORG_ID, ...mkName('A', 'earlier') },
        });
        aEarlierId = earlier.id;

        // The statement the source is content to lose. Real failure mode: the
        // User row named by userId does not exist -> 23503 on the FK.
        try {
          await tx.carrierDriver.update({
            where: { id: earlier.id },
            data: { userId: BOGUS_USER_ID },
          });
        } catch (e) {
          aSwallowed = sqlstateOf(e); // swallowed, exactly as the source does
        }

        try {
          await tx.carrierDriver.create({ data: { orgId: ORG_ID, ...mkName('A', 'later') } });
          aLaterOk = true;
        } catch (e) {
          aLater = sqlstateOf(e);
        }
      });
    } catch (e) {
      aOuter = sqlstateOf(e);
    }

    const aEarlierRows = await db.carrierDriver.count({
      where: { orgId: ORG_ID, firstName: TAG, lastName: 'A-earlier' },
    });
    results.push({
      control: 'A',
      name: 'TRUE POSITIVE — swallowed failure INSIDE the transaction callback',
      shape: 'tx.create -> try{ tx.update FAILS }catch{swallow} -> tx.create',
      earlierWriteSurvived: aEarlierRows > 0,
      laterWriteSucceeded: aLaterOk,
      swallowedSqlstate: aSwallowed,
      laterSqlstate: aLater,
      outerSqlstate: aOuter,
      expectation: 'later write fails 25P02 AND the earlier write is GONE',
      matchedExpectation: aLater === '25P02' && aEarlierRows === 0,
    });

    // ───────────────────────────────────────────────────────────────────────
    // CONTROL B — the `gps-ping` shape. The try WRAPS the transaction.
    // ───────────────────────────────────────────────────────────────────────
    let bSwallowed = 'NONE';
    let bLater: string | null = null;
    let bLaterOk = false;

    const bEarlier = await db.carrierDriver.create({
      data: { orgId: ORG_ID, ...mkName('B', 'earlier') },
    });
    created.push(bEarlier.id);

    try {
      await db.$transaction(async (tx: any) => {
        await tx.carrierDriver.update({
          where: { id: bEarlier.id },
          data: { userId: BOGUS_USER_ID },
        });
      });
    } catch (e) {
      bSwallowed = sqlstateOf(e); // swallowed, outside the transaction
    }

    try {
      const l = await db.carrierDriver.create({ data: { orgId: ORG_ID, ...mkName('B', 'later') } });
      created.push(l.id);
      bLaterOk = true;
    } catch (e) {
      bLater = sqlstateOf(e);
    }

    const bEarlierRows = await db.carrierDriver.count({
      where: { orgId: ORG_ID, firstName: TAG, lastName: 'B-earlier' },
    });
    results.push({
      control: 'B',
      name: 'FALSE POSITIVE — the try WRAPS the transaction (api/driver/gps-ping shape)',
      shape: 'create -> try{ $transaction{ update FAILS } }catch{swallow} -> create',
      earlierWriteSurvived: bEarlierRows > 0,
      laterWriteSucceeded: bLaterOk,
      swallowedSqlstate: bSwallowed,
      laterSqlstate: bLater,
      outerSqlstate: null,
      expectation: 'NO cascade — earlier write survives and the later write succeeds',
      matchedExpectation: bEarlierRows > 0 && bLaterOk,
    });

    // ───────────────────────────────────────────────────────────────────────
    // CONTROL C — the remedy. Same as A, plus a SAVEPOINT. The catch still
    // swallows; it just rolls back to the savepoint first.
    // ───────────────────────────────────────────────────────────────────────
    let cSwallowed = 'NONE';
    let cLater: string | null = null;
    let cOuter: string | null = null;
    let cLaterOk = false;

    try {
      await db.$transaction(async (tx: any) => {
        const earlier = await tx.carrierDriver.create({
          data: { orgId: ORG_ID, ...mkName('C', 'earlier') },
        });

        await tx.$executeRawUnsafe('SAVEPOINT quick611_sp');
        try {
          await tx.carrierDriver.update({
            where: { id: earlier.id },
            data: { userId: BOGUS_USER_ID },
          });
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT quick611_sp');
        } catch (e) {
          cSwallowed = sqlstateOf(e);
          // The ONLY addition to the catch. The swallow is preserved.
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT quick611_sp');
        }

        try {
          await tx.carrierDriver.create({ data: { orgId: ORG_ID, ...mkName('C', 'later') } });
          cLaterOk = true;
        } catch (e) {
          cLater = sqlstateOf(e);
        }
      });
    } catch (e) {
      cOuter = sqlstateOf(e);
    }

    const cEarlierRows = await db.carrierDriver.count({
      where: { orgId: ORG_ID, firstName: TAG, lastName: 'C-earlier' },
    });
    results.push({
      control: 'C',
      name: 'THE REMEDY — SAVEPOINT around the statement allowed to fail',
      shape: 'tx.create -> SAVEPOINT -> try{ tx.update FAILS }catch{swallow + ROLLBACK TO} -> tx.create',
      earlierWriteSurvived: cEarlierRows > 0,
      laterWriteSucceeded: cLaterOk,
      swallowedSqlstate: cSwallowed,
      laterSqlstate: cLater,
      outerSqlstate: cOuter,
      expectation: 'earlier write SURVIVES and the later write SUCCEEDS',
      matchedExpectation: cEarlierRows > 0 && cLaterOk,
    });

    // ── report ────────────────────────────────────────────────────────────
    console.log('');
    for (const r of results) {
      console.log(`CONTROL ${r.control} — ${r.name}`);
      console.log(`  shape              : ${r.shape}`);
      console.log(`  swallowed SQLSTATE : ${r.swallowedSqlstate}`);
      console.log(`  later write        : ${r.laterWriteSucceeded ? 'SUCCEEDED' : `FAILED ${r.laterSqlstate}`}`);
      console.log(`  outer SQLSTATE     : ${r.outerSqlstate ?? '(none — transaction settled normally)'}`);
      console.log(`  EARLIER WRITE      : ${r.earlierWriteSurvived ? 'SURVIVED' : '*** GONE ***'}`);
      console.log(`  expected           : ${r.expectation}`);
      console.log(`  MATCHED            : ${r.matchedExpectation}`);
      console.log('');
    }

    const allMatched = results.every((r) => r.matchedExpectation);
    console.log(allMatched ? 'ALL THREE CONTROLS MATCHED EXPECTATION.' : '*** ONE OR MORE CONTROLS DID NOT MATCH — read the table above. ***');

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      resolve(EVIDENCE_DIR, '02-cascade-controls.json'),
      JSON.stringify(
        { at: new Date().toISOString(), project: STAGING_REF, role: 'app_user', tripwire: 'armed', orgId: ORG_ID, tag: TAG, bogusUserId: BOGUS_USER_ID, results, allMatched },
        null,
        2,
      ),
    );
  } finally {
    // ── teardown, and its landing is ASSERTED ──────────────────────────────
    const deleted = await db.carrierDriver.deleteMany({
      where: { orgId: ORG_ID, firstName: TAG },
    });
    const left = await db.carrierDriver.count({ where: { orgId: ORG_ID, firstName: TAG } });
    console.error(`[611-cascade] teardown : deleted ${deleted.count}, left ${left}`);
    if (left !== 0) {
      console.error('[611-cascade] *** TEARDOWN DID NOT LAND — rows remain on staging. This is drift. ***');
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error('611-cascade-probe FAILED:', e);
  process.exit(1);
});
