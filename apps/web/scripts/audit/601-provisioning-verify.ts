/**
 * quick-601 (B3) — prove the provisioning path end to end as `app_user`, against
 * STAGING, with `bypass_rls_policy` temporarily DROPPED on every table the path
 * touches so the proof is real rather than incidental.
 *
 *   npx tsx scripts/audit/601-provisioning-verify.ts --setup
 *   npx tsx scripts/audit/601-provisioning-verify.ts --before     (pre-migration)
 *   npx tsx scripts/audit/601-provisioning-verify.ts --after      (post-migration)
 *   npx tsx scripts/audit/601-provisioning-verify.ts --admin-select
 *   npx tsx scripts/audit/601-provisioning-verify.ts --teardown
 *
 * Writes evidence/<phase>.json and evidence/<phase>.md.
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ------------------------------------------------------------------
 * `_bootstrap-env.ts` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and every env file points `DIRECT_URL` at PRODUCTION. This file
 * loads `apps/web/.env.staging` explicitly and refuses on the production ref.
 * Modelled on `scripts/audit/599-policy-verify.ts` and `600-admin-verify.ts` —
 * same ground rules, same environment discipline, same evidence shape.
 *
 * ─── WHY IT RUNS THE REAL APPLICATION CODE, NOT REPLAYED SQL ────────────────
 *
 * `--after` imports `provisionTenant`, `confirmTenantEmail`, `hydrateTenant` and
 * `getOnboardingFlags` and calls them, with the module-scope Prisma pool pointed
 * at staging as `app_user`. Replaying the statements by hand would prove the
 * policy set admits a sequence I typed out; it would not prove it admits the
 * sequence Prisma actually emits — and the whole finding this task rests on is
 * that Prisma emits a `RETURNING` clause nobody had written down.
 *
 * `DATABASE_URL` is set BEFORE the dynamic imports because `lib/db/prisma.ts`
 * builds its `pg.Pool` at module scope. It is repointed at port 5432 (session
 * mode) because 6543 is not reachable from a developer machine.
 *
 * ─── WHY `bypass_rls_policy` IS DROPPED, AND WHY THAT IS SAFE HERE ──────────
 *
 * `bypass_rls_policy` is `FOR ALL ... USING (current_setting('app.bypass_rls',
 * true) = 'on')` and, having no `WITH CHECK`, Postgres uses its `USING` as the
 * check too. It is PERMISSIVE, so it can only ever ADD rows to what is admitted.
 * With the policy present, a green run would prove only that nothing set the flag
 * — which is a property of this script, not of the path. Dropping it removes that
 * confound entirely.
 *
 * It is safe on staging specifically because `DATABASE_URL` there is `postgres`,
 * which carries `rolbypassrls`, so RLS is inert on every other connection to that
 * database for the duration. Each policy is recreated from `pg_get_expr` read back
 * at drop time — not from a literal in this file — and the restore is asserted by
 * COUNT (86 before, 86 after) and by NAME. The drop/restore is wrapped so an
 * exception anywhere in the probe body still restores.
 *
 * FIVE GROUND RULES
 *   1. Nothing is swallowed. Every probe records `{ok:true,...}` or
 *      `{error:{code,message}}` with the SQLSTATE and the full server message.
 *   2. Direct SQL probes run inside `BEGIN ... ROLLBACK`, fenced per-probe with a
 *      SAVEPOINT. The application-code probes COMMIT, because that is what the
 *      application does; `--teardown` removes what they wrote and asserts zero
 *      leftovers.
 *   3. Both directions, always. A legitimate statement must succeed AND a
 *      cross-tenant variant of the same statement must be refused.
 *   4. `bypass_rls_policy` is counted before and after and the run FAILS LOUDLY
 *      (exit 1) if the restore did not land. A dropped policy left behind is
 *      unrecoverable staging drift.
 *   5. This is a REPORT. Only a connect failure, a fixture failure, or a failed
 *      policy restore exits non-zero.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/601-make-tenant-provisioning-work-under-app-/evidence',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`601-provisioning-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;
const APP_USER_RAW = process.env.STAGING_DATABASE_URL_APP_USER;
const ADMIN_URL = process.env.STAGING_DATABASE_URL_ADMIN;

for (const [name, url] of [
  ['STAGING_DIRECT_URL', DIRECT_URL],
  ['STAGING_DATABASE_URL_APP_USER', APP_USER_RAW],
  ['STAGING_DATABASE_URL_ADMIN', ADMIN_URL],
] as const) {
  if (!url) refuse(`${name} is not set in apps/web/.env.staging`);
  if (url.includes(PRODUCTION_REF)) refuse(`${name} names the PRODUCTION project`);
  if (!url.includes(STAGING_REF)) refuse(`${name} does not name the staging project`);
}

/**
 * `.env.staging` carries the app_user string on 6543 (transaction mode), which
 * mirrors the production runtime route and is NOT reachable from a developer
 * machine. Port 5432 is the same role on the same database.
 */
const APP_USER_URL = APP_USER_RAW!.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');

process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';

const MARKER = 'RLS601';

/** Every table on the provisioning path, from docs/audits/provisioning-path.md §2.6. */
const PATH_TABLES = [
  'ActivationProgress',
  'AppEvent',
  'Customer',
  'Load',
  'Subscription',
  'Tenant',
  'TenantNotificationSettings',
  'Truck',
  'User',
  'carrier_drivers',
  'carrier_trucks',
  'clients',
  'contracts',
  'dispatches',
  'loads',
] as const;

// ---------------------------------------------------------------------------
// Probe plumbing
// ---------------------------------------------------------------------------

type Probe =
  | { label: string; direction: 'legitimate' | 'cross-tenant'; ok: true; detail: string }
  | {
      label: string;
      direction: 'legitimate' | 'cross-tenant';
      ok: false;
      error: { code: string | undefined; message: string };
    };

const probes: Probe[] = [];

function record(p: Probe) {
  probes.push(p);
  const tag = p.ok ? 'OK  ' : 'FAIL';
  const body = p.ok ? p.detail : `${p.error.code} ${p.error.message}`;
  console.log(`  ${tag} [${p.direction}] ${p.label} -> ${body}`);
}

async function sqlProbe(
  c: Client,
  label: string,
  direction: 'legitimate' | 'cross-tenant',
  sql: string,
  params: unknown[] = [],
) {
  try {
    await c.query('SAVEPOINT p');
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT p');
    record({ label, direction, ok: true, detail: `rows=${r.rowCount}` });
    return r;
  } catch (e) {
    const err = e as { code?: string; message: string };
    await c.query('ROLLBACK TO SAVEPOINT p');
    await c.query('RELEASE SAVEPOINT p');
    record({ label, direction, ok: false, error: { code: err.code, message: err.message } });
    return null;
  }
}

async function codeProbe(
  label: string,
  direction: 'legitimate' | 'cross-tenant',
  fn: () => Promise<string>,
) {
  try {
    record({ label, direction, ok: true, detail: await fn() });
    return true;
  } catch (e) {
    const err = e as { code?: string; message: string };
    record({ label, direction, ok: false, error: { code: err.code, message: err.message } });
    return false;
  }
}

// ---------------------------------------------------------------------------
// bypass_rls_policy — count, drop, restore
// ---------------------------------------------------------------------------

interface DroppedPolicy {
  table: string;
  cmd: string;
  using: string;
  withCheck: string | null;
  permissive: boolean;
}

async function bypassPolicyCount(pg: Client): Promise<number> {
  const r = await pg.query(
    `SELECT count(*)::int AS n
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE p.polname = 'bypass_rls_policy'`,
  );
  return r.rows[0].n as number;
}

const CMD_BY_CHAR: Record<string, string> = {
  '*': 'ALL',
  r: 'SELECT',
  a: 'INSERT',
  w: 'UPDATE',
  d: 'DELETE',
};

/**
 * Drop `bypass_rls_policy` on the path tables, capturing each definition FROM THE
 * CATALOGUE so the restore rebuilds exactly what was there — never from a literal
 * in this file, which is how a restore silently normalises a body.
 */
async function dropBypassOnPathTables(pg: Client): Promise<DroppedPolicy[]> {
  const r = await pg.query(
    `SELECT c.relname AS table,
            p.polcmd::text AS cmd,
            p.polpermissive AS permissive,
            pg_get_expr(p.polqual, p.polrelid) AS using,
            pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE p.polname = 'bypass_rls_policy'
        AND c.relname = ANY($1)
      ORDER BY c.relname`,
    [PATH_TABLES as unknown as string[]],
  );

  const captured: DroppedPolicy[] = r.rows.map((x) => ({
    table: x.table as string,
    cmd: CMD_BY_CHAR[x.cmd as string] ?? 'ALL',
    using: x.using as string,
    withCheck: (x.with_check as string | null) ?? null,
    permissive: x.permissive as boolean,
  }));

  for (const p of captured) {
    await pg.query(`DROP POLICY bypass_rls_policy ON "${p.table}"`);
  }
  return captured;
}

async function restoreBypass(pg: Client, captured: DroppedPolicy[]) {
  for (const p of captured) {
    const check = p.withCheck ? ` WITH CHECK (${p.withCheck})` : '';
    await pg.query(
      `CREATE POLICY bypass_rls_policy ON "${p.table}"
         AS ${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}
         FOR ${p.cmd}
         TO PUBLIC
         USING (${p.using})${check}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Staging carries ZERO "NotificationTemplate" rows. That matters more than it
 * looks: with no active template the AFTER INSERT trigger's `INSERT ... SELECT`
 * inserts zero rows, its WITH CHECK is never evaluated, and the failure this whole
 * task exists to fix DOES NOT REPRODUCE. A green run without this fixture would be
 * the "all assertions passed, nothing was tested" shape.
 */
async function seedFixtures(pg: Client) {
  for (const k of ['a', 'b']) {
    await pg.query(
      `INSERT INTO "NotificationTemplate"
         ("triggerKey","category","displayName","description","defaultSubject",
          "defaultBlockJson","availableVariables","defaultRecipients","isActive","updatedAt")
       SELECT $1, 'USER', 'RLS601 fixture', 'quick-601 verification fixture', 'subject',
              '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, TRUE, now()
        WHERE NOT EXISTS (SELECT 1 FROM "NotificationTemplate" WHERE "triggerKey" = $1)`,
      [`rls601.fixture.${k}`],
    );
  }
  const n = await pg.query(`SELECT count(*)::int AS n FROM "NotificationTemplate" WHERE "isActive"`);
  return n.rows[0].n as number;
}

/**
 * Delete everything the committed application-code probes wrote.
 *
 * There is no local database (DEC-3), so a real-row test creates a DISPOSABLE
 * tenant, scopes every write to it, and deletes CHILDREN BEFORE THE TENANT —
 * `User_tenantId_fkey` and 60 other inbound FKs are RESTRICT, so the order is not
 * cosmetic. Convention from tests/carrier/document-import-commit-rollback.test.ts.
 */
async function teardownTenants(pg: Client): Promise<{ deleted: number; leftover: number }> {
  const ids = await pg.query(`SELECT id FROM "Tenant" WHERE name LIKE $1`, [`${MARKER}%`]);
  const tenantIds = ids.rows.map((r) => r.id as string);

  for (const id of tenantIds) {
    for (const t of ['loads', 'dispatches', 'carrier_drivers', 'carrier_trucks', 'contracts', 'clients']) {
      await pg.query(`DELETE FROM "${t}" WHERE org_id = $1`, [id]);
    }
    for (const t of ['Load', 'Customer', 'Truck', 'AppEvent', 'ActivationProgress', 'Subscription', 'TenantNotificationSettings', 'User']) {
      await pg.query(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [id]);
    }
    await pg.query(`DELETE FROM "Tenant" WHERE id = $1`, [id]);
  }

  await pg.query(`DELETE FROM "NotificationTemplate" WHERE "triggerKey" LIKE 'rls601.%'`);
  const left = await pg.query(`SELECT count(*)::int AS n FROM "Tenant" WHERE name LIKE $1`, [`${MARKER}%`]);
  return { deleted: tenantIds.length, leftover: left.rows[0].n as number };
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/** The `tenant_bootstrap_insert` body this migration replaced. */
const OLD_BOOTSTRAP_CHECK = `NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL`;

/**
 * The two failures, as they stood BEFORE the migration.
 *
 * The migration is already applied to staging, so this phase TEMPORARILY swaps
 * `tenant_bootstrap_insert` back to its old body, runs the probes, and restores the
 * new one — capturing the current body from `pg_get_expr` first, so the restore
 * rebuilds what was actually there rather than what this file thinks was there.
 * Same discipline as the `bypass_rls_policy` drop. Without this the "before" half
 * of the matrix would be a quoted transcript nobody can re-run.
 */
async function phaseBefore() {
  const pg = new Client({ connectionString: DIRECT_URL });
  await pg.connect();
  console.log('active templates:', await seedFixtures(pg));

  const current = await pg.query(
    `SELECT pg_get_expr(p.polwithcheck, p.polrelid) AS w
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname = 'Tenant' AND p.polname = 'tenant_bootstrap_insert'`,
  );
  if (current.rowCount !== 1) {
    console.error('FIXTURE FAILURE: tenant_bootstrap_insert not found on "Tenant".');
    process.exit(1);
  }
  const currentCheck = current.rows[0].w as string;
  console.log('current tenant_bootstrap_insert WITH CHECK:', currentCheck);

  const c = new Client({ connectionString: APP_USER_URL });

  try {
    await pg.query(`DROP POLICY tenant_bootstrap_insert ON "Tenant"`);
    await pg.query(
      `CREATE POLICY tenant_bootstrap_insert ON "Tenant" FOR INSERT WITH CHECK (${OLD_BOOTSTRAP_CHECK})`,
    );
    console.log('temporarily reverted tenant_bootstrap_insert to its pre-migration body');

    await c.connect();
    await c.query('BEGIN');
    console.log('\n--- app_user, no bypass flag, no tenant GUC ---');
    await sqlProbe(
      c,
      'INSERT "Tenant" (no RETURNING) — the sweep\'s derived failure',
      'legitimate',
      `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1,$2,now())`,
      [`${MARKER} before a`, `${MARKER.toLowerCase()}-before-a-${Date.now()}`],
    );
    await sqlProbe(
      c,
      'INSERT "Tenant" RETURNING id — what Prisma actually emits',
      'legitimate',
      `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1,$2,now()) RETURNING id`,
      [`${MARKER} before b`, `${MARKER.toLowerCase()}-before-b-${Date.now()}`],
    );
    console.log('\n--- app_user, bypass flag ON (the live behaviour this task removes the need for) ---');
    await c.query(`SELECT set_config('app.bypass_rls','on',TRUE)`);
    await sqlProbe(
      c,
      'INSERT "Tenant" RETURNING id with the bypass flag set',
      'legitimate',
      `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1,$2,now()) RETURNING id`,
      [`${MARKER} before c`, `${MARKER.toLowerCase()}-before-c-${Date.now()}`],
    );
    await c.query('ROLLBACK');
  } finally {
    await c.end().catch(() => {});
    await pg.query(`DROP POLICY IF EXISTS tenant_bootstrap_insert ON "Tenant"`);
    await pg.query(
      `CREATE POLICY tenant_bootstrap_insert ON "Tenant" FOR INSERT WITH CHECK (${currentCheck})`,
    );
    const back = await pg.query(
      `SELECT pg_get_expr(p.polwithcheck, p.polrelid) AS w
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = 'Tenant' AND p.polname = 'tenant_bootstrap_insert'`,
    );
    const restoredCheck = back.rows[0]?.w as string | undefined;
    console.log('tenant_bootstrap_insert restored to:', restoredCheck);
    if (restoredCheck !== currentCheck) {
      console.error(`POLICY RESTORE FAILED — expected ${currentCheck}, got ${restoredCheck}`);
      await pg.end();
      process.exit(1);
    }
    await pg.end();
  }
}

async function phaseAfter() {
  const pg = new Client({ connectionString: DIRECT_URL });
  await pg.connect();

  const templates = await seedFixtures(pg);
  if (templates < 1) {
    console.error('FIXTURE FAILURE: no active NotificationTemplate — the trigger would write nothing.');
    process.exit(1);
  }
  console.log('active templates:', templates);

  const bypassBefore = await bypassPolicyCount(pg);
  console.log('bypass_rls_policy before:', bypassBefore);

  let dropped: DroppedPolicy[] = [];
  let restored = -1;

  try {
    dropped = await dropBypassOnPathTables(pg);
    console.log(`dropped bypass_rls_policy on ${dropped.length} path tables:`, dropped.map((d) => d.table).join(', '));
    console.log('bypass_rls_policy while dropped:', await bypassPolicyCount(pg));

    // -- the real application code, as app_user --------------------------------
    process.env.DATABASE_URL = APP_USER_URL;
    process.env.EMAIL_TOKEN_SECRET ??= randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

    const [{ provisionTenant }, { confirmTenantEmail }, { hydrateTenant }, { getOnboardingFlags }, { prisma }] =
      await Promise.all([
        import('../../src/lib/onboarding/provision-tenant'),
        import('../../src/lib/onboarding/confirm-tenant-email'),
        import('../../src/lib/onboarding/hydrate-tenant'),
        import('../../src/lib/onboarding/onboarding-flags'),
        import('../../src/lib/db/prisma'),
      ]);

    const who = await prisma.$queryRaw<Array<{ current_user: string; bypass: boolean }>>`
      SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass
    `;
    console.log(`\napplication pool connected as ${who[0].current_user} (rolbypassrls=${who[0].bypass})`);
    if (who[0].current_user !== 'app_user' || who[0].bypass) {
      console.error('CONNECTION FAILURE: the application pool is not a non-bypassing app_user.');
      throw new Error('wrong role');
    }

    console.log('\n--- sign-up, email confirmation, hydration: the real functions ---');
    const stamp = Date.now();
    let tenantId = '';

    await codeProbe('provisionTenant() — sign-up', 'legitimate', async () => {
      const r = await provisionTenant(
        {
          firstName: 'Quick',
          lastName: '601',
          email: `${MARKER.toLowerCase()}+${stamp}@example.test`,
          password: 'Sufficiently-Long-Password-601',
          companyName: `${MARKER} Verification ${stamp}`,
          truckCount: 1,
          fleetSizeBucket: 'OWNER_OPERATOR',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        randomUUID(),
      );
      tenantId = r.tenantId;
      return `tenantId=${r.tenantId} planKey=${r.planKey}`;
    });

    if (tenantId) {
      // The sweep's failure, asserted on the row it would have prevented. `templates`
      // is read from the fixture rather than hardcoded, so this cannot pass by both
      // sides being zero.
      const seeded = await pg.query(
        `SELECT count(*)::int AS n FROM "TenantNotificationSettings" WHERE "tenantId" = $1`,
        [tenantId],
      );
      const seededCount = seeded.rows[0].n as number;
      if (seededCount === templates) {
        record({
          label: 'trg_seed_tenant_notification_settings wrote its rows (the sweep\'s failure)',
          direction: 'legitimate',
          ok: true,
          detail: `rows=${seededCount} (expected ${templates})`,
        });
      } else {
        record({
          label: 'trg_seed_tenant_notification_settings wrote its rows (the sweep\'s failure)',
          direction: 'legitimate',
          ok: false,
          error: { code: 'ASSERT', message: `rows=${seededCount}, expected ${templates}` },
        });
      }

      await codeProbe('confirmTenantEmail() — email confirmation', 'legitimate', async () => {
        const r = await confirmTenantEmail(tenantId);
        return `status=${r.status}`;
      });

      await codeProbe('confirmTenantEmail() again — idempotency', 'legitimate', async () => {
        const r = await confirmTenantEmail(tenantId);
        return `status=${r.status}`;
      });

      await codeProbe('hydrateTenant() — onboarding hydration + sample seed', 'legitimate', async () => {
        await hydrateTenant(tenantId);
        const t = await pg.query(`SELECT "provisioningPhase", "sampleDataSeeded" FROM "Tenant" WHERE id = $1`, [tenantId]);
        return `phase=${t.rows[0].provisioningPhase} seeded=${t.rows[0].sampleDataSeeded}`;
      });

      await codeProbe('getOnboardingFlags() — activation checklist', 'legitimate', async () => {
        const f = await getOnboardingFlags(tenantId);
        return JSON.stringify(f);
      });

      // COUNTER-ASSERTION, and it is load-bearing. `getOnboardingFlags` filters
      // `isSample: false`, and everything hydration seeds is `isSample: true`, so
      // all-false is the CORRECT answer — and it is also exactly what an
      // RLS-blocked read returns. Without this probe the two are indistinguishable,
      // which is the precise failure this task exists to catch. So: read the same
      // tables through the same tenant-scoped connection WITHOUT the isSample
      // filter, and require a non-zero count.
      const cf = new Client({ connectionString: APP_USER_URL });
      await cf.connect();
      await cf.query('BEGIN');
      await cf.query(`SELECT set_config('app.current_tenant_id',$1,TRUE)`, [tenantId]);
      const seenAsTenant = await cf.query(
        `SELECT (SELECT count(*)::int FROM clients        WHERE org_id = $1) AS clients,
                (SELECT count(*)::int FROM carrier_trucks WHERE org_id = $1) AS trucks,
                (SELECT count(*)::int FROM loads          WHERE org_id = $1) AS carrier_loads`,
        [tenantId],
      );
      const row = seenAsTenant.rows[0] as { clients: number; trucks: number; carrier_loads: number };
      const totalSeeded = row.clients + row.trucks + row.carrier_loads;
      record(
        totalSeeded > 0
          ? {
              label: 'counter-assertion: the seeded rows ARE readable as this tenant (all-false flags are the isSample filter, not RLS)',
              direction: 'legitimate',
              ok: true,
              detail: `clients=${row.clients} carrier_trucks=${row.trucks} loads=${row.carrier_loads}`,
            }
          : {
              label: 'counter-assertion: the seeded rows ARE readable as this tenant',
              direction: 'legitimate',
              ok: false,
              error: { code: 'ASSERT', message: 'zero seeded rows visible — the flags were blocked, not filtered' },
            },
      );
      await cf.query('ROLLBACK');
      await cf.end();

      // The sign-up action's own AppEvent write. Not reachable through the real
      // server action here (it needs FormData and a Supabase Auth admin client), so
      // its exact statement shape is probed directly under the same GUC the action
      // now sets. Named as the one statement on the path proven by SQL rather than
      // by calling the function that issues it.
      const ev = new Client({ connectionString: APP_USER_URL });
      await ev.connect();
      await ev.query('BEGIN');
      await ev.query(`SELECT set_config('app.current_tenant_id',$1,TRUE)`, [tenantId]);
      await sqlProbe(
        ev,
        'INSERT "AppEvent" tenant.created — sign-up actions.tsx step 3',
        'legitimate',
        `INSERT INTO "AppEvent" ("tenantId","eventType","properties") VALUES ($1,'tenant.created','{}'::jsonb) RETURNING id`,
        [tenantId],
      );
      await ev.query('ROLLBACK');
      await ev.end();
    }

    // -- direction B: the same statements, cross-tenant -------------------------
    console.log('\n--- cross-tenant direction: the same statements, refused ---');
    const c = new Client({ connectionString: APP_USER_URL });
    await c.connect();
    await c.query('BEGIN');

    const otherTenantId = randomUUID();
    const foreignId = randomUUID();

    await c.query(`SELECT set_config('app.current_tenant_id',$1,TRUE)`, [otherTenantId]);

    await sqlProbe(
      c,
      'INSERT "Tenant" whose id is NOT the declared GUC',
      'cross-tenant',
      `INSERT INTO "Tenant" (id, name, slug, "updatedAt") VALUES ($1,$2,$3,now()) RETURNING id`,
      [foreignId, `${MARKER} cross`, `${MARKER.toLowerCase()}-cross-${stamp}`],
    );
    await c.query(`SELECT set_config('app.current_tenant_id','',TRUE)`);
    await sqlProbe(
      c,
      'INSERT "Tenant" with NO GUC set at all (exactly what the old policy allowed)',
      'cross-tenant',
      `INSERT INTO "Tenant" (id, name, slug, "updatedAt") VALUES ($1,$2,$3,now())`,
      [randomUUID(), `${MARKER} noguc`, `${MARKER.toLowerCase()}-noguc-${stamp}`],
    );

    if (tenantId) {
      await c.query(`SELECT set_config('app.current_tenant_id',$1,TRUE)`, [otherTenantId]);
      await sqlProbe(
        c,
        'SELECT the provisioned tenant from a DIFFERENT tenant context',
        'cross-tenant',
        `SELECT id FROM "Tenant" WHERE id = $1`,
        [tenantId],
      );
      await sqlProbe(
        c,
        'UPDATE the provisioned tenant from a DIFFERENT tenant context',
        'cross-tenant',
        `UPDATE "Tenant" SET "emailConfirmedAt" = NULL WHERE id = $1`,
        [tenantId],
      );
      await sqlProbe(
        c,
        'counter-read: the row IS there (so 0 rows above means refused, not absent)',
        'cross-tenant',
        `SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`,
        [tenantId],
      );
      await sqlProbe(
        c,
        'INSERT "TenantNotificationSettings" for a tenant that is not ours',
        'cross-tenant',
        `INSERT INTO "TenantNotificationSettings" ("tenantId","triggerKey","isActive","updatedAt")
         VALUES ($1,$2,TRUE,now())`,
        [tenantId, `${MARKER.toLowerCase()}.cross`],
      );
    }

    await c.query('ROLLBACK');
    await c.end();
    await prisma.$disconnect();
  } finally {
    if (dropped.length) {
      await restoreBypass(pg, dropped);
    }
    restored = await bypassPolicyCount(pg);
    console.log(`\nbypass_rls_policy restored: ${restored} (expected ${bypassBefore})`);
  }

  writeEvidence('after', { bypassBefore, bypassAfter: restored, droppedTables: dropped.map((d) => d.table) });

  if (restored !== bypassBefore) {
    console.error(`POLICY RESTORE FAILED — ${bypassBefore} before, ${restored} after. This is unrecoverable drift; fix before doing anything else.`);
    await pg.end();
    process.exit(1);
  }
  await pg.end();
}

/**
 * quick-601 step 7 — is `app_admin`'s SELECT on "TenantNotificationSettings" the
 * over-grant `trigger-grant-sweep.md` §3.1 suspected?
 *
 * GRANT/REVOKE is transactional in Postgres, but a catalogue change is invisible to
 * OTHER sessions until it commits — and the probe must run as `app_admin`, a
 * different session. So the revoke is committed, the probe runs, and the grant is
 * restored, in that order, with the restore in a `finally`.
 */
async function phaseAdminSelect() {
  const pg = new Client({ connectionString: DIRECT_URL });
  await pg.connect();
  const templates = await seedFixtures(pg);
  if (templates < 1) {
    console.error('FIXTURE FAILURE: no active NotificationTemplate — ON CONFLICT would never be reached.');
    process.exit(1);
  }
  console.log('active templates:', templates);

  const readGrants = async () => {
    const r = await pg.query(
      `SELECT coalesce(string_agg(privilege_type, ',' ORDER BY privilege_type), '(none)') AS p
         FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name='TenantNotificationSettings' AND grantee='app_admin'`,
    );
    return r.rows[0].p as string;
  };

  const adminInsert = async (label: string) => {
    const c = new Client({ connectionString: ADMIN_URL });
    await c.connect();
    await c.query('BEGIN');
    await sqlProbe(
      c,
      label,
      'legitimate',
      `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1,$2,now()) RETURNING id`,
      [`${MARKER} admin`, `${MARKER.toLowerCase()}-admin-${Date.now()}`],
    );
    await c.query('ROLLBACK');
    await c.end();
  };

  try {
    console.log('grants:', await readGrants());
    await adminInsert('app_admin "Tenant" INSERT with SELECT HELD');

    await pg.query(`REVOKE SELECT ON "TenantNotificationSettings" FROM app_admin`);
    console.log('grants:', await readGrants());
    await adminInsert('app_admin "Tenant" INSERT with SELECT REVOKED');
  } finally {
    await pg.query(`GRANT SELECT ON "TenantNotificationSettings" TO app_admin`);
    console.log('grants restored:', await readGrants());
  }

  writeEvidence('admin-select', {});
  await pg.end();
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

function writeEvidence(phase: string, extra: Record<string, unknown>) {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  const payload = { phase, generatedAt: new Date().toISOString(), projectRef: STAGING_REF, ...extra, probes };
  writeFileSync(resolve(EVIDENCE_DIR, `${phase}.json`), JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const lines = [
    `# quick-601 — \`${phase}\``,
    '',
    `Generated ${payload.generatedAt} against staging (\`${STAGING_REF}\`).`,
    '',
    ...Object.entries(extra).map(([k, v]) => `- **${k}**: \`${JSON.stringify(v)}\``),
    '',
    '| direction | probe | result |',
    '|---|---|---|',
    ...probes.map((p) =>
      `| ${p.direction} | ${p.label.replace(/\|/g, '\\|')} | ${
        p.ok ? `OK — ${p.detail}` : `\`${p.error.code}\` ${p.error.message.replace(/\|/g, '\\|')}`
      } |`,
    ),
    '',
  ];
  writeFileSync(resolve(EVIDENCE_DIR, `${phase}.md`), lines.join('\n'), 'utf8');
  console.log(`\nWrote ${resolve(EVIDENCE_DIR, `${phase}.md`)}`);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

(async () => {
  const arg = process.argv.find((a) => a.startsWith('--'));
  switch (arg) {
    case '--setup': {
      const pg = new Client({ connectionString: DIRECT_URL });
      await pg.connect();
      console.log('active templates after setup:', await seedFixtures(pg));
      console.log('bypass_rls_policy:', await bypassPolicyCount(pg));
      await pg.end();
      break;
    }
    case '--before':
      await phaseBefore();
      writeEvidence('before', {});
      break;
    case '--after':
      await phaseAfter();
      break;
    case '--admin-select':
      await phaseAdminSelect();
      break;
    case '--teardown': {
      const pg = new Client({ connectionString: DIRECT_URL });
      await pg.connect();
      const t = await teardownTenants(pg);
      console.log(`teardown: deleted ${t.deleted} probe tenant(s), leftover ${t.leftover}`);
      console.log('bypass_rls_policy:', await bypassPolicyCount(pg));
      await pg.end();
      if (t.leftover !== 0) process.exit(1);
      break;
    }
    default:
      refuse('pass one of --setup | --before | --after | --admin-select | --teardown');
  }
})().catch((e) => {
  console.error('601-provisioning-verify: UNCAUGHT', e);
  process.exit(1);
});
