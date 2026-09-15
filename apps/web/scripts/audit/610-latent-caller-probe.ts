/**
 * quick-610 — the COLD-POOL measurement of the six `createTenantClient` call sites.
 *
 *   npx tsx scripts/audit/610-latent-caller-probe.ts --before
 *   npx tsx scripts/audit/610-latent-caller-probe.ts --after
 *   npx tsx scripts/audit/610-latent-caller-probe.ts --one <siteId> --acquire before|after   (child)
 *
 * ─── WHY A CHILD PROCESS PER SITE ──────────────────────────────────────────
 *
 * "Cold" is the whole measurement, and it is not a figure of speech. `prisma.ts`
 * holds `max: 1` and the tenant GUC is SESSION scope, so the first statement in a
 * process that sets `app.current_tenant_id` leaves it set for every statement
 * after it on that backend — quick-602 reproduced exactly this from the other
 * direction, and `app-user-failure-remediation.md` §8 item 5 is the standing
 * caveat on every `pass` in that document. Running two sites in one process would
 * therefore measure the first honestly and the second not at all.
 *
 * So every site gets its own process, its own pool and its own backend, and the
 * statement under test is the FIRST tenant-touching statement that process ever
 * issues. Nothing this probe does can leave a context behind for the next site.
 *
 * ─── WHAT IS REAL HERE, AND WHAT IS REPRODUCED ─────────────────────────────
 *
 * Stated rather than blurred, because the strength of the two halves differs.
 *
 *   SITE 6 (`base.repository.ts`) is measured through the REAL class:
 *   `new DocumentRepository(tenantId).findByTruckId(...)`. Its verdict is
 *   whatever the source tree does on the day the probe runs — there is no
 *   acquisition switch to get wrong. That is the strongest form available, and
 *   it is available only because the repository has no session dependency.
 *
 *   SITES 1-5 are server-action internals. `_fetchNotificationAlerts` and
 *   `_fetchDashboardMetrics` are module-PRIVATE inside a `'use server'` module,
 *   and the three `tenant-notification-settings` exports open with
 *   `requireTenantAccess()` -> `getSession()` -> cookies. Neither can be called
 *   from a script without forging a session, and a forged session measures this
 *   file's understanding of `@supabase/ssr` rather than the application
 *   (604-click-through.ts's rule). So for those five the probe drives the REAL
 *   client-acquisition expression — `createTenantClient(tenantId)` imported from
 *   real source, or `getTenantPrismaForOrg(tenantId)` imported from real source —
 *   and then issues that site's own first query.
 *
 *   That is a faithful measurement of the LATENT claim, because the LATENT claim
 *   is precisely a claim about WHICH CLIENT the site holds. It is NOT a claim
 *   that the file contains that expression. That half is pinned separately by
 *   the source scan in `tests/security/tenant-client-acquisition.test.ts`, and
 *   end-to-end by the 604 click-through. Row assertions and source scans catch
 *   different classes and this needs both (quick-549).
 *
 * ─── BOTH DIRECTIONS, ALWAYS ───────────────────────────────────────────────
 *
 * `--after` additionally issues, through the SAME returned client:
 *   (a) a RAW count of the OTHER tenant's rows on that site's own table — must
 *       be 0. Raw SQL bypasses `withTenantRLS`'s argument injection, so RLS
 *       alone decides those rows. Through the Prisma model API the injected
 *       filter would answer and the POLICY would never be tested at all.
 *   (b) a RAW count of the OWN tenant's rows on the same table — must be > 0.
 *       Without (b), (a) is satisfied by an empty table and proves nothing.
 *       `610-staging-fixtures.ts --ensure` is what makes (b) true.
 *
 * ─── STAGING ONLY ──────────────────────────────────────────────────────────
 *
 * MUST NEVER IMPORT `scripts/_bootstrap-env`. Loads `apps/web/.env.staging` and
 * refuses POSITIVELY on anything that is not the staging ref. `DATABASE_URL` is
 * assigned from the app_user string BEFORE any app module is imported, because
 * `prisma.ts` evaluates `ARM_TRIPWIRE` at MODULE SCOPE — an import hoisted above
 * that assignment would build an UNARMED pool and every verdict would be a
 * silent false negative. That is why every app import below is dynamic.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/610-close-the-five-latent-createtenantclient/evidence',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`610-latent-caller-probe: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

const APP_USER_URL = staging(
  process.env.STAGING_DATABASE_URL_APP_USER,
  'STAGING_DATABASE_URL_APP_USER',
);
const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');

// ---------------------------------------------------------------------------
// The six sites — the inventory as frozen in
// tests/security/tenant-mechanism-fence.test.ts at quick-606.
// ---------------------------------------------------------------------------

type SiteId = 's1' | 's2' | 's3' | 's4' | 's5' | 's6';

interface Site {
  id: SiteId;
  file: string;
  line: number;
  fn: string;
  /** Where the tenant is available AT THAT POINT in the source. */
  tenantSource: string;
  /** The table the site's first query reads — also the cross-tenant subject. */
  table: string;
  /** True when the probe drives the real module rather than the acquisition expression. */
  realModule: boolean;
}

const SITES: Site[] = [
  {
    id: 's1',
    file: 'src/app/(owner)/actions/dashboard.ts',
    line: 85,
    fn: '_fetchNotificationAlerts',
    tenantSource: 'function ARGUMENT (tenantId), resolved upstream by getAuthContext() from the session',
    table: 'Truck',
    realModule: false,
  },
  {
    id: 's2',
    file: 'src/app/(owner)/actions/dashboard.ts',
    line: 330,
    fn: '_fetchDashboardMetrics',
    tenantSource: 'function ARGUMENT (tenantId), resolved upstream by getAuthContext() from the session',
    table: 'User',
    realModule: false,
  },
  {
    id: 's3',
    file: 'src/app/(owner)/actions/tenant-notification-settings.ts',
    line: 374,
    fn: 'listTenantUsers',
    tenantSource: 'SESSION, via requireTenantAccess() on the function’s first line',
    table: 'User',
    realModule: false,
  },
  {
    id: 's4',
    file: 'src/app/(owner)/actions/tenant-notification-settings.ts',
    line: 513,
    fn: 'listTenantSendLog',
    tenantSource: 'SESSION, via requireTenantAccess() on the function’s first line',
    table: 'NotificationSendLog',
    realModule: false,
  },
  {
    id: 's5',
    file: 'src/app/(owner)/actions/tenant-notification-settings.ts',
    line: 543,
    fn: 'getTenantSendLogStats',
    tenantSource: 'SESSION, via requireTenantAccess() on the function’s first line',
    table: 'NotificationSendLog',
    realModule: false,
  },
  {
    id: 's6',
    file: 'src/lib/db/repositories/base.repository.ts',
    line: 11,
    fn: 'TenantRepository constructor (inherited by every subclass)',
    tenantSource: 'CONSTRUCTOR ARGUMENT (tenantId), passed by all 22 call sites',
    table: 'Document',
    realModule: true,
  },
];

// ---------------------------------------------------------------------------
// CHILD — one site, one fresh process, one cold pool.
// ---------------------------------------------------------------------------

async function child(siteId: SiteId, acquire: 'before' | 'after') {
  const site = SITES.find((s) => s.id === siteId)!;

  // MUST precede every app import — prisma.ts reads both at module scope.
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
  process.env.PG_CONNECT_TIMEOUT_MS = process.env.PG_CONNECT_TIMEOUT_MS ?? '20000';

  const ALPHA = process.env.Q610_ALPHA!;
  const BETA = process.env.Q610_BETA!;

  const verdict: Record<string, unknown> = {
    site: site.id,
    file: site.file,
    line: site.line,
    fn: site.fn,
    tenantSource: site.tenantSource,
    acquire,
    instrument: site.realModule
      ? 'REAL MODULE (DocumentRepository through the inherited constructor)'
      : 'REAL acquisition expression + this site’s own first query',
    table: site.table,
  };

  let db: unknown = null;

  try {
    if (site.realModule) {
      // Site 6 — the REAL class. Whatever the source tree currently does.
      const { DocumentRepository } = await import('@/lib/db/repositories/document.repository');
      const repo = new DocumentRepository(ALPHA);
      const rows = await repo.findByTruckId(process.env.Q610_ALPHA_TRUCK!);
      verdict.raised = false;
      verdict.result = `DocumentRepository#findByTruckId -> ${rows.length} row(s)`;
    } else if (acquire === 'before') {
      const { createTenantClient } = await import('@/lib/db/tenant-client');
      db = createTenantClient(ALPHA);
      verdict.result = await firstQuery(site, db, ALPHA);
      verdict.raised = false;
    } else {
      const { getTenantPrismaForOrg } = await import('@/lib/context/tenant-context');
      db = await getTenantPrismaForOrg(ALPHA);
      verdict.result = await firstQuery(site, db, ALPHA);
      verdict.raised = false;
    }
  } catch (err: unknown) {
    const raw = String((err as { message?: string })?.message ?? err);
    verdict.raised = true;
    verdict.code = sqlstateOf(err);
    verdict.isTC001 = verdict.code === 'TC001';
    verdict.errorClass = (err as { constructor?: { name?: string } })?.constructor?.name ?? 'unknown';
    verdict.message = raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(-3).join(' | ');
  }

  // --- direction B: the cross-tenant refusal -------------------------------
  // Only meaningful once direction A passed. Site 6 re-acquires through the
  // same wrapper its base class now uses, because the repository holds its
  // client privately and exposing it would change what the class offers.
  if (acquire === 'after' && verdict.raised === false) {
    try {
      if (!db) {
        const { getTenantPrismaForOrg } = await import('@/lib/context/tenant-context');
        db = await getTenantPrismaForOrg(ALPHA);
      }
      const client = db as { $queryRawUnsafe: (sql: string, ...a: unknown[]) => Promise<Array<{ n: number }>> };
      const own = await client.$queryRawUnsafe(
        `select count(*)::int as n from "${site.table}" where "tenantId" = $1::uuid`,
        ALPHA,
      );
      const foreign = await client.$queryRawUnsafe(
        `select count(*)::int as n from "${site.table}" where "tenantId" = $1::uuid`,
        BETA,
      );
      verdict.crossTenant = {
        ownRowsVisible: Number(own[0].n),
        foreignRowsVisible: Number(foreign[0].n),
        // The PAIR is the assertion. `foreign === 0` alone is satisfied by an
        // empty table, which is the vacuous pass this probe exists to avoid.
        refused: Number(foreign[0].n) === 0,
        nonVacuous: Number(own[0].n) > 0,
      };
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      verdict.crossTenant = {
        error: { code: e?.code ?? 'UNKNOWN', message: String(e?.message ?? err).split('\n')[0] },
      };
    }
  }

  process.stdout.write(`__VERDICT__${JSON.stringify(verdict)}\n`);
  process.exit(0);
}

/**
 * The SQLSTATE, BY CODE — never by matching the message prose (quick-602).
 *
 * Measured rather than assumed, because the obvious read is wrong: Prisma does
 * NOT put it on `err.code`. A policy raise arrives as a `DriverAdapterError`
 * whose own `code`, `errorCode` and `meta` are all `undefined`, and whose own
 * enumerable keys are `name, cause, clientVersion`. The SQLSTATE is on
 * `err.cause.code`. A probe that read `err.code` would have recorded `UNKNOWN`
 * for every raise and invited exactly the prose match the rule forbids.
 *
 * The chain is walked (rather than `cause.code` read once) so a raw `pg` error —
 * which carries `code` at the top level — and any future extra wrapping layer
 * are both found by the same function.
 */
function sqlstateOf(err: unknown): string {
  let node: unknown = err;
  for (let depth = 0; node && depth < 5; depth++) {
    const code = (node as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
    node = (node as { cause?: unknown }).cause;
  }
  return 'UNKNOWN';
}

/** Each site's OWN first query, transcribed from the source file. */
async function firstQuery(site: Site, db: unknown, tenantId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = db as any;
  switch (site.id) {
    case 's1': {
      const r = await c.truck.findMany({
        select: { id: true, year: true, make: true, model: true, documentMetadata: true },
      });
      return `truck.findMany -> ${r.length} row(s)`;
    }
    case 's2': {
      const n = await c.user.count({ where: { role: 'DRIVER', isActive: true } });
      return `user.count(role=DRIVER, isActive) -> ${n}`;
    }
    case 's3': {
      const r = await c.user.findMany({
        where: { isActive: true },
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
        orderBy: { email: 'asc' },
      });
      return `user.findMany(isActive) -> ${r.length} row(s)`;
    }
    case 's4': {
      const n = await c.notificationSendLog.count({ where: { tenantId } });
      return `notificationSendLog.count -> ${n}`;
    }
    case 's5': {
      const thirty = new Date();
      thirty.setDate(thirty.getDate() - 30);
      const n = await c.notificationSendLog.count({
        where: { tenantId, createdAt: { gte: thirty } },
      });
      return `notificationSendLog.count(30d) -> ${n}`;
    }
    default:
      throw new Error(`site ${site.id} has no reproduced query`);
  }
}

// ---------------------------------------------------------------------------
// PARENT
// ---------------------------------------------------------------------------

async function parent(acquire: 'before' | 'after') {
  const admin = new Client({ connectionString: DIRECT_URL });
  await admin.connect();
  const t = await admin.query(
    'select id, name from "Tenant" where name = any($1) order by name',
    [['Staging Alpha Carriers', 'Staging Beta Logistics']],
  );
  if (t.rows.length !== 2) refuse('expected both staging tenants by name');
  const ALPHA = t.rows[0].id as string;
  const BETA = t.rows[1].id as string;
  const truck = await admin.query('select id from "Truck" where "tenantId" = $1 limit 1', [ALPHA]);
  if (!truck.rows.length) {
    refuse('no Truck fixture for ALPHA — run 610-staging-fixtures.ts --ensure first');
  }
  const ALPHA_TRUCK = truck.rows[0].id as string;
  await admin.end();

  console.error(`[610-probe] project=${STAGING_REF} role=app_user tripwire=on acquire=${acquire}`);
  console.error(`[610-probe] alpha=${ALPHA} beta=${BETA}`);

  // `tsx` is HOISTED to the repo root by the workspace install — it is not under
  // apps/web/node_modules. Resolved rather than hardcoded, and asserted, because
  // a missing CLI makes every child produce no verdict line, which this parent
  // would otherwise have to guess the meaning of.
  const TSX_CLI = [
    resolve(APP_ROOT, 'node_modules/tsx/dist/cli.mjs'),
    resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'),
  ].find((p) => existsSync(p));
  if (!TSX_CLI) refuse('cannot locate tsx/dist/cli.mjs in apps/web or the repo root');

  const verdicts: Array<Record<string, unknown>> = [];
  for (const site of SITES) {
    // One child per site means six fresh Supavisor connections in quick
    // succession, and the first `--after` sweep had two of them come back
    // `P2010 / Server has closed the connection` on the `set_config` itself.
    // That is TRANSPORT, not a policy refusal — both sites passed immediately
    // when re-run alone — but it is recorded here rather than smoothed over,
    // because "the connection died" and "the tenant context is missing" are
    // different facts and only one of them is what this probe measures.
    // A short pause between children removes the contention without retrying,
    // which would risk a retry masking a genuine refusal.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    const r = spawnSync(
      process.execPath,
      [
        TSX_CLI,
        __filename,
        '--one',
        site.id,
        '--acquire',
        acquire,
      ],
      {
        cwd: APP_ROOT,
        encoding: 'utf8',
        env: { ...process.env, Q610_ALPHA: ALPHA, Q610_BETA: BETA, Q610_ALPHA_TRUCK: ALPHA_TRUCK },
        timeout: 180_000,
      },
    );
    const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('__VERDICT__'));
    if (!line) {
      verdicts.push({
        site: site.id,
        file: site.file,
        line: site.line,
        fn: site.fn,
        acquire,
        harnessFailure: true,
        stdout: (r.stdout ?? '').slice(-1200),
        stderr: (r.stderr ?? '').slice(-1200),
      });
      continue;
    }
    verdicts.push(JSON.parse(line.slice('__VERDICT__'.length)));
  }

  const report = {
    at: new Date().toISOString(),
    project: STAGING_REF,
    role: 'app_user',
    tripwire: 'armed',
    acquire,
    poolShape:
      'max:1 — ONE CHILD PROCESS PER SITE, so every verdict is the first tenant-touching statement of its own process',
    verdicts,
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stem = acquire === 'before' ? '02-cold-before' : '05-cold-after';
  writeFileSync(resolve(EVIDENCE_DIR, `${stem}.json`), JSON.stringify(report, null, 2));

  const lines: string[] = [];
  lines.push(`# quick-610 — cold-pool ${acquire.toUpperCase()}`);
  lines.push('');
  lines.push(
    `project \`${STAGING_REF}\` · role \`app_user\` · tripwire armed · one process per site`,
  );
  lines.push('');
  lines.push('| # | file:line | fn | verdict | detail |');
  lines.push('|---|---|---|---|---|');
  for (const v of verdicts) {
    const cross = v.crossTenant as
      | { ownRowsVisible?: number; foreignRowsVisible?: number; error?: unknown }
      | undefined;
    const verdictCell = v.harnessFailure
      ? 'HARNESS FAILURE'
      : v.raised
        ? `**RAISED \`${v.code}\`**`
        : 'no raise';
    const detail = v.harnessFailure
      ? String(v.stderr).split('\n').slice(-2).join(' ')
      : v.raised
        ? String(v.message)
        : String(v.result) +
          (cross && !cross.error
            ? ` · cross-tenant: own=${cross.ownRowsVisible} foreign=${cross.foreignRowsVisible}`
            : cross
              ? ` · cross-tenant ERROR ${JSON.stringify(cross.error)}`
              : '');
    lines.push(`| ${v.site} | \`${v.file}:${v.line}\` | \`${v.fn}\` | ${verdictCell} | ${detail} |`);
  }
  writeFileSync(resolve(EVIDENCE_DIR, `${stem}.md`), lines.join('\n') + '\n');

  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
if (argv.includes('--one')) {
  const siteId = argv[argv.indexOf('--one') + 1] as SiteId;
  const acquire = (argv[argv.indexOf('--acquire') + 1] as 'before' | 'after') ?? 'before';
  child(siteId, acquire).catch((e) => {
    process.stdout.write(
      `__VERDICT__${JSON.stringify({ site: siteId, harnessFailure: true, message: String((e as Error)?.message ?? e) })}\n`,
    );
    process.exit(0);
  });
} else {
  const acquire: 'before' | 'after' = argv.includes('--after') ? 'after' : 'before';
  parent(acquire).catch((e) => {
    console.error('610-latent-caller-probe FAILED:', e);
    process.exit(1);
  });
}
