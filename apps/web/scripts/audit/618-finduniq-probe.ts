/**
 * quick-618 — THE PROOF. Drives the REAL `withTenantRLS` extension and a REAL
 * Prisma client against STAGING as `app_user`.
 *
 *   npx tsx scripts/audit/618-finduniq-probe.ts            (both modes)
 *   npx tsx scripts/audit/618-finduniq-probe.ts --mode rls_in_force
 *   npx tsx scripts/audit/618-finduniq-probe.ts --mode rls_not_in_force
 *
 * ── THE MATRIX ──────────────────────────────────────────────────────────────
 *
 * For `findUnique` AND `findUniqueOrThrow`, in three projections
 * (select WITH tenantId · select WITHOUT tenantId · no select at all), in two
 * modes, against a PRE-EXISTING own-tenant row and a PRE-EXISTING foreign row:
 *
 *   own-tenant row      -> returned, and the caller's RESULT SHAPE unchanged:
 *                          the key set is asserted to equal the select exactly,
 *                          so a fix that "forces tenantId into the select" and
 *                          forgets to strip it FAILS HERE rather than passing.
 *   cross-tenant row    -> null (findUnique) / raise (findUniqueOrThrow),
 *                          PAIRED with a privileged counter-read proving the
 *                          row really exists. A refusal over a row that is not
 *                          there proves nothing (quick-610).
 *
 * ── WHY TWO MODES, AND WHY THE SECOND ONE IS THE IMPORTANT ONE ──────────────
 *
 * `rls_in_force`     — the GUC is set and no bypass flag. The DATABASE refuses
 *                      the foreign row, so this mode cannot tell a working
 *                      application layer from an absent one.
 * `rls_not_in_force` — `app.bypass_rls = 'on'`, so `bypass_rls_policy` admits
 *                      every row and the database refuses NOTHING. The
 *                      application layer is then the only guard. This models
 *                      PRODUCTION TODAY, whose `DATABASE_URL` still runs on a
 *                      bypassing role, and it is the mode in which the old
 *                      post-check was load-bearing.
 *
 * A control cell asserts the bypass really is off/on, because if it silently
 * failed to engage, `rls_not_in_force` would quietly become a second copy of
 * `rls_in_force` and every cross-tenant PASS in it would be the database's
 * doing, not the extension's.
 *
 * ── THE COMPOUND-UNIQUE CELL, AND THE ONE THING THIS SCRIPT WRITES ──────────
 *
 * `618-where-shapes.ts` measured the real `where` population: 107 SINGLE_SCALAR,
 * 15 MULTI_SCALAR and 3 COMPOUND_UNIQUE. That last shape matters BECAUSE of this
 * fix — the old code never touched `a.where` on a findUnique, the new code
 * spreads `tenantId` into it, so those three sites now emit a compound unique
 * PLUS a top-level scalar. One of them is `dispatcher.ts:111`, on the path every
 * notification takes. `TenantNotificationSettings` is empty on staging, so that
 * cell CREATES one marker row on the privileged connection, reads it back
 * through the extension, and deletes it in a `finally`, asserting `left 0`.
 *
 * So: this script writes ONE staging row and removes it. Everything else is a
 * pre-existing row. PRODUCTION IS NEVER OPENED AT ALL.
 *
 * Rules carried from 616/617: positive staging refusal; `[db-target]` to STDERR
 * with the credential MASKED; SQLSTATE off the CAUSE CHAIN; every zero paired
 * with a privileged counter-read.
 */
import { config as loadEnv } from 'dotenv';
import { Pool, Client as PgClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '../../src/generated/prisma/client';
import { withTenantRLS } from '../../src/lib/db/extensions/tenant-rls';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045';
const TRUCK_A = '610a0000-0000-4610-8000-000000000001';
const TRUCK_B = '610a0000-0000-4610-8000-000000000002';
/** A MARKER key, not a real trigger: teardown deletes exactly this and can touch nothing else. */
const COMPOUND_TRIGGER_KEY = "quick-618.fixture.safe-to-delete";

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/618-fix-the-withtenantrls-findunique-post-ch/evidence',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`618-finduniq-probe: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}
function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION (${PRODUCTION_REF})`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging (${STAGING_REF})`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}
function sqlstateOf(e: unknown): string {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return 'UNKNOWN';
}

const APP_USER_URL = staging(
  process.env.STAGING_DATABASE_URL_APP_USER,
  'STAGING_DATABASE_URL_APP_USER',
);
/** Privileged lane — counter-reads ONLY. Never written to. */
const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');

type Mode = 'rls_in_force' | 'rls_not_in_force';
type Shape = 'selectWithTenantId' | 'selectWithoutTenantId' | 'noSelect' | 'compoundUnique';

/** The three PROJECTION shapes driven through the matrix. `compoundUnique` is a
 *  WHERE shape, not a projection, and is exercised in its own cell below. */
type ProjectionShape = Exclude<Shape, 'compoundUnique'>;
const SELECTS: Record<ProjectionShape, Record<string, boolean> | undefined> = {
  selectWithTenantId: { id: true, make: true, tenantId: true },
  selectWithoutTenantId: { id: true, make: true },
  noSelect: undefined,
};

type Cell = {
  mode: Mode;
  method: 'findUnique' | 'findUniqueOrThrow';
  shape: Shape;
  direction: 'own' | 'cross';
  outcome: string;
  resultKeys: string[] | null;
  expectedKeys: string[] | null;
  shapeUnchanged: boolean | null;
  counterRead: number | null;
  sqlstate?: string;
  pass: boolean;
};

async function run(mode: Mode): Promise<Cell[]> {
  /**
   * ONE `max: 1` pool, and the GUCs are issued THROUGH THE PRISMA CLIENT rather
   * than on a connection this script holds open. The first version of this probe
   * did `pool.connect()` and kept the handle: with `max: 1` that is the only
   * backend, so Prisma's first statement waited for a connection this script was
   * never going to release, and the run hung with no output. The GUCs must land
   * on the SAME backend Prisma uses — that is the whole point of session scope —
   * so the answer is to send them down the same client, not to open a second
   * connection.
   *
   * The PRIVILEGED counter-reads therefore run on a genuinely separate,
   * privileged connection (`STAGING_DIRECT_URL`, the `postgres` role), which is
   * what "privileged counter-read" should have meant anyway: asking the same
   * restricted connection whether a row it cannot see exists is not a
   * counter-read at all.
   */
  const pool = new Pool({ connectionString: APP_USER_URL, max: 1 });
  const u = new URL(APP_USER_URL);
  console.error(
    `[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  mode : ${mode}  (credential MASKED, never printed)`,
  );

  const adapter = new PrismaPg(pool);
  const base = new PrismaClient({ adapter });
  const db = base.$extends(withTenantRLS(TENANT_A)) as unknown as PrismaClient;

  const priv = new PgClient({ connectionString: DIRECT_URL });
  await priv.connect();

  // Session-scope GUCs on the backend Prisma will use. Set EXPLICITLY per mode
  // — never inherited from a previous run (quick-602/610).
  await base.$executeRawUnsafe(`SET app.tenant_context_tripwire = 'on'`);
  await base.$executeRawUnsafe(
    `SELECT set_config('app.current_tenant_id', '${mode === 'rls_in_force' ? TENANT_A : ''}', false)`,
  );
  await base.$executeRawUnsafe(
    `SELECT set_config('app.bypass_rls', '${mode === 'rls_not_in_force' ? 'on' : 'off'}', false)`,
  );

  /* CONTROL: is the database actually refusing (mode 1) / not refusing (mode 2)?
     Without this, mode 2 could silently be mode 1 and every cross-tenant PASS
     in it would be the database's work rather than the extension's. */
  const control = (await base.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "Truck" WHERE id = '${TRUCK_B}'`,
  )) as Array<{ n: number }>;
  const foreignVisibleToDb = control[0].n;
  console.log(
    `  CONTROL — foreign row visible to the DATABASE on this connection: ${foreignVisibleToDb}` +
      (mode === 'rls_in_force'
        ? '  (expect 0 — RLS is refusing it)'
        : '  (expect 1 — bypass is on, the DB refuses nothing)'),
  );
  const controlOk = mode === 'rls_in_force' ? foreignVisibleToDb === 0 : foreignVisibleToDb === 1;
  if (!controlOk) {
    await base.$disconnect().catch(() => {});
    await priv.end();
    await pool.end();
    throw new Error(
      `CONTROL FAILED for ${mode}: foreign row visibility ${foreignVisibleToDb} is not what this mode requires — the rest of this mode would be meaningless`,
    );
  }

  const cells: Cell[] = [];

  for (const method of ['findUnique', 'findUniqueOrThrow'] as const) {
    for (const shape of Object.keys(SELECTS) as ProjectionShape[]) {
      const select = SELECTS[shape];
      for (const direction of ['own', 'cross'] as const) {
        const id = direction === 'own' ? TRUCK_A : TRUCK_B;
        const args: Record<string, unknown> = { where: { id } };
        if (select) args.select = { ...select };

        // PRIVILEGED counter-read on a separate, privileged connection: does the
        // row EXIST at all? A refusal over a row that is not there proves
        // nothing (quick-610), and every zero below is paired with this.
        const cr = await priv.query(
          `SELECT count(*)::int AS n FROM "Truck" WHERE id = $1 AND "tenantId" = $2`,
          [id, direction === 'own' ? TENANT_A : TENANT_B],
        );
        const counterRead = cr.rows[0].n as number;

        let outcome = '';
        let resultKeys: string[] | null = null;
        let sqlstate: string | undefined;
        let row: Record<string, unknown> | null = null;
        try {
          row = (await (db as any).truck[method](args)) as Record<string, unknown> | null;
          outcome = row === null ? 'null' : 'row';
          if (row) resultKeys = Object.keys(row).sort();
        } catch (e) {
          outcome = `throw:${(e as Error).constructor.name}`;
          sqlstate = sqlstateOf(e);
          if (/No record was found|does not exist/i.test((e as Error).message ?? '')) {
            outcome = 'throw:NotFound';
          }
          if (/Tenant isolation violation/.test((e as Error).message ?? '')) {
            outcome = 'throw:TenantIsolationViolation';
          }
        }

        const expectedKeys = select ? Object.keys(select).sort() : null;
        const shapeUnchanged =
          direction === 'own' && resultKeys && expectedKeys
            ? JSON.stringify(resultKeys) === JSON.stringify(expectedKeys)
            : direction === 'own' && !expectedKeys
              ? resultKeys !== null && resultKeys.length > 3 // full row
              : null;

        const pass =
          direction === 'own'
            ? outcome === 'row' && shapeUnchanged === true
            : method === 'findUnique'
              ? outcome === 'null' && counterRead === 1
              : outcome.startsWith('throw:') && counterRead === 1;

        cells.push({
          mode,
          method,
          shape,
          direction,
          outcome,
          resultKeys,
          expectedKeys,
          shapeUnchanged,
          counterRead,
          sqlstate,
          pass,
        });
      }
    }
  }

  /**
   * ── THE COMPOUND-UNIQUE CELL ────────────────────────────────────────────
   *
   * Everything above uses `where: { id }`. `618-where-shapes.ts` measured the
   * real population: 107 SINGLE_SCALAR, 15 MULTI_SCALAR and **3 COMPOUND_UNIQUE**
   * — `TenantNotificationSettings` keyed on `tenantId_triggerKey` (x2) and
   * `tenantId_triggerKey_userId`.
   *
   * That shape matters here specifically BECAUSE OF THIS FIX. The old code never
   * touched `a.where` on a findUnique; the new code spreads `tenantId` into it.
   * So for these three sites the emitted where becomes
   *
   *     { tenantId_triggerKey: { tenantId, triggerKey }, tenantId }
   *
   * — a compound unique PLUS a top-level scalar. Under extendedWhereUnique that
   * is legal, but "legal per the docs" is not a measurement, and if Prisma
   * rejected it these three previously-working call sites would throw. One of
   * them is `dispatcher.ts:111`, on the path every notification takes.
   *
   * Read-only: the row is looked up, never written.
   */
  /**
   * `TenantNotificationSettings` is EMPTY on staging (measured by
   * `618-fixtures.ts`: total rows 0). Reading a key that is not there would only
   * show that Prisma did not THROW — the negative half — and would leave the
   * question that actually matters unproven: does the injected scalar AND
   * correctly with the compound key, or does it exclude the row?
   *
   * So this cell CREATES one row on the privileged connection, reads it back
   * through the extension, and deletes it, asserting `left 0`. The model needs
   * only `tenantId` (FK to an existing Tenant) and `triggerKey`, so the fixture
   * has no FK chain. Teardown is in a `finally`; the delete is keyed on the
   * fixture's own marker trigger key and can touch nothing else.
   */
  let compound: { outcome: string; keys: string[] | null; error?: string } | undefined;
  let exists = 0;
  let left = -1;
  try {
    // `updatedAt` is `@updatedAt` — Prisma populates it in the CLIENT, so the
    // column carries no database default and raw SQL must supply it. The first
    // run of this cell failed 23502 on exactly that, and wrote nothing.
    await priv.query(
      `INSERT INTO "TenantNotificationSettings" ("tenantId", "triggerKey", "isActive", "updatedAt")
       VALUES ($1, $2, true, now()) ON CONFLICT DO NOTHING`,
      [TENANT_A, COMPOUND_TRIGGER_KEY],
    );
    const c0 = await priv.query(
      `SELECT count(*)::int AS n FROM "TenantNotificationSettings" WHERE "tenantId" = $1 AND "triggerKey" = $2`,
      [TENANT_A, COMPOUND_TRIGGER_KEY],
    );
    exists = c0.rows[0].n as number;

    try {
      const row = (await (db as any).tenantNotificationSettings.findUnique({
        where: { tenantId_triggerKey: { tenantId: TENANT_A, triggerKey: COMPOUND_TRIGGER_KEY } },
      })) as Record<string, unknown> | null;
      compound = {
        outcome: row === null ? 'null' : 'row',
        keys: row ? Object.keys(row).sort() : null,
      };
    } catch (e) {
      compound = { outcome: 'THROW', keys: null, error: (e as Error).message.split('\n')[0] };
    }
  } finally {
    await priv.query(
      `DELETE FROM "TenantNotificationSettings" WHERE "tenantId" = $1 AND "triggerKey" = $2`,
      [TENANT_A, COMPOUND_TRIGGER_KEY],
    );
    const c1 = await priv.query(
      `SELECT count(*)::int AS n FROM "TenantNotificationSettings" WHERE "tenantId" = $1 AND "triggerKey" = $2`,
      [TENANT_A, COMPOUND_TRIGGER_KEY],
    );
    left = c1.rows[0].n as number;
  }

  // PASS needs BOTH halves: Prisma accepted the compound key alongside the
  // injected scalar (no THROW), AND the own-tenant row came back (not excluded
  // by the injection). Paired with a privileged counter-read of 1, and fixtures
  // left 0.
  const compoundPass = compound!.outcome === 'row' && exists === 1 && left === 0;
  console.log(
    `  ${compoundPass ? 'PASS' : 'FAIL'}  COMPOUND_UNIQUE tenantId_triggerKey -> ${compound!.outcome}` +
      `  privilegedCounterRead=${exists}  fixturesLeft=${left}${compound!.error ? `  error=${compound!.error}` : ''}`,
  );
  cells.push({
    mode,
    method: 'findUnique',
    shape: 'compoundUnique' as Shape,
    direction: 'own',
    outcome: compound.outcome,
    resultKeys: compound.keys,
    expectedKeys: null,
    shapeUnchanged: null,
    counterRead: exists,
    sqlstate: compound.error,
    pass: compoundPass,
  });

  await base.$disconnect().catch(() => {});
  await priv.end();
  await pool.end();
  return cells;
}

async function main() {
  const argMode = process.argv.includes('--mode')
    ? (process.argv[process.argv.indexOf('--mode') + 1] as Mode)
    : null;
  const modes: Mode[] = argMode ? [argMode] : ['rls_in_force', 'rls_not_in_force'];

  const all: Cell[] = [];
  for (const m of modes) {
    console.log(`\n=== MODE: ${m} ===`);
    const cells = await run(m);
    all.push(...cells);
    for (const c of cells) {
      const shapeNote =
        c.direction === 'own'
          ? `  keys=${JSON.stringify(c.resultKeys)}${
              c.expectedKeys ? ` expected=${JSON.stringify(c.expectedKeys)}` : ' (full row)'
            }`
          : `  counterRead=${c.counterRead}`;
      console.log(
        `  ${c.pass ? 'PASS' : 'FAIL'}  ${c.method.padEnd(18)} ${c.shape.padEnd(21)} ${c.direction.padEnd(5)} -> ${c.outcome}${shapeNote}`,
      );
    }
  }

  const failed = all.filter((c) => !c.pass);
  console.log(`\nCELLS: ${all.length}   PASS: ${all.length - failed.length}   FAIL: ${failed.length}`);
  if (failed.length) {
    console.log('FAILING CELLS:');
    for (const c of failed) console.log(`  ${JSON.stringify(c)}`);
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const tag = argMode ? `-${argMode}` : '';
  writeFileSync(
    resolve(EVIDENCE_DIR, `03-probe${tag}.json`),
    JSON.stringify({ generatedAt: new Date().toISOString(), cells: all }, null, 2),
  );
  process.exit(failed.length ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
