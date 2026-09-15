/**
 * quick-606 — is `/track/[token]` LIVE on production?
 *
 *   npx tsx scripts/audit/606-track-liveness.ts
 *
 * The decision about that page turns entirely on this number, so it is read
 * before anything is designed. R1 permits a read-only production SELECT and this
 * one is required by the plan.
 *
 * The page reads the LEGACY `"Load"` model, which holds ZERO rows on staging
 * (`seed-staging.ts` populates the CARRIER `loads` table instead), so staging
 * cannot answer "is the feature live" at all.
 *
 *   count = 0    -> the honest outcome may be "report, do not build"
 *   count > 0    -> the feature is live and must be fixed
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence',
);
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

/** Every statement this file issues against production. SELECT-only, checked at runtime. */
const SELECTS = Object.freeze({
  withToken: 'SELECT count(*)::int AS n FROM public."Load" WHERE "trackingToken" IS NOT NULL',
  total: 'SELECT count(*)::int AS n FROM public."Load"',
  gps: 'SELECT count(*)::int AS n FROM public."GPSLocation"',
  recent:
    'SELECT count(*)::int AS n FROM public."Load" WHERE "trackingToken" IS NOT NULL AND "updatedAt" > now() - interval \'180 days\'',
});
for (const [k, sql] of Object.entries(SELECTS)) {
  if (!/^SELECT\b/i.test(sql.trim())) {
    console.error(`REFUSING: SELECTS.${k} is not a SELECT`);
    process.exit(1);
  }
}

async function readAll(url: string) {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    const out: Record<string, number> = {};
    for (const [k, sql] of Object.entries(SELECTS)) out[k] = (await c.query(sql)).rows[0].n;
    return out;
  } finally {
    await c.end();
  }
}

(async () => {
  const text = readFileSync(resolve(REPO_ROOT, '.env'), 'utf8').replace(/\r\n/g, '\n');
  const prodUrl = text.match(/^DIRECT_URL\s*=\s*"?([^"\n]+)"?\s*$/m)![1];
  if (!prodUrl.includes(PRODUCTION_REF)) throw new Error('repo-root DIRECT_URL does not name production');
  const stgUrl = process.env.STAGING_DIRECT_URL!;
  if (stgUrl.includes(PRODUCTION_REF) || !stgUrl.includes(STAGING_REF)) throw new Error('bad staging url');

  const production = await readAll(prodUrl);
  const staging = await readAll(stgUrl.replace(':6543/', ':5432/').replace('?pgbouncer=true', ''));

  const record = {
    task: 'quick-606',
    at: new Date().toISOString(),
    statements: SELECTS,
    production,
    staging,
    live: production.withToken > 0,
  };
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '08-track-liveness.json'), JSON.stringify(record, null, 2) + '\n');

  console.log('PRODUCTION  legacy "Load" with a trackingToken :', production.withToken);
  console.log('PRODUCTION  legacy "Load" total                :', production.total);
  console.log('PRODUCTION  ... token AND updated in 180 days  :', production.recent);
  console.log('PRODUCTION  "GPSLocation" rows                 :', production.gps);
  console.log('STAGING     legacy "Load" with a trackingToken :', staging.withToken);
  console.log('STAGING     legacy "Load" total                :', staging.total);
  console.log(`\nLIVE ON PRODUCTION: ${record.live}`);
})();
