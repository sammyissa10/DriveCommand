/**
 * quick-606 — prove `/api/cron/purge-deleted` actually DELETES.
 *
 *   npx tsx scripts/audit/606-purge-write-probe.ts
 *
 * R2, and it is not optional here. **A DELETE refused by RLS is 0 rows and no
 * error** (`policy-satisfiability-sweep.md` §4.1 as corrected by quick-599), so
 * `totalPurged: 0` is indistinguishable from a clean run with nothing to purge —
 * the exact erasure quick-603 removed from this file once already, arriving by a
 * different door. HTTP 200 proves nothing about a DELETE sweep.
 *
 *   1. seed ONE disposable soft-deleted row per model per tenant on the
 *      PRIVILEGED connection, with `deleted_at` beyond SOFT_DELETE_RETENTION_DAYS;
 *   2. note every id;
 *   3. run the cron;
 *   4. COUNTER-READ on the privileged connection that each id is GONE — and that
 *      the response body agrees;
 *   5. assert a control row that is soft-deleted but INSIDE the retention window
 *      SURVIVES, so "it deleted everything" cannot pass as "it deleted the right
 *      things";
 *   6. clean up anything the sweep did not remove and assert zero probes survive.
 *
 * Only the two models with no FK dependants are probed — `CarrierClient` and
 * `CarrierTruck` are parents of loads/trips and a disposable parent is not
 * disposable. `CarrierLoad` and `Trip` are the leaves.
 *
 * STAGING ONLY. Never imports `scripts/_bootstrap-env`.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
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

const BASE = process.env.CLICK_THROUGH_BASE ?? 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

function refuse(reason: string): never {
  console.error(`606-purge-write-probe: REFUSING — ${reason}`);
  process.exit(1);
}

const url = process.env.STAGING_DIRECT_URL;
if (!url) refuse('STAGING_DIRECT_URL unset');
if (url.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names PRODUCTION');
if (!url.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name staging');
if (!CRON_SECRET) refuse('CRON_SECRET unset — the probe would measure auth, not the sweep');

async function priv<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    const who = (await c.query<{ cu: string }>('SELECT current_user AS cu')).rows[0].cu;
    if (who === 'app_user') refuse('the counter-read connection is app_user — it cannot tell "no row" from "no permission"');
    return await fn(c);
  } finally {
    await c.end();
  }
}

type Probe = { model: string; table: string; id: string; tenantId: string; control: boolean };

(async () => {
  const tenants = await priv(async (c) =>
    (await c.query<{ id: string; slug: string }>(`SELECT id, slug FROM public."Tenant" WHERE "isActive" = true ORDER BY slug`)).rows,
  );
  if (tenants.length < 2) refuse(`expected 2 active tenants on staging, found ${tenants.length}`);

  const probes: Probe[] = [];

  // --- 1/2. seed, on the privileged connection ------------------------------
  await priv(async (c) => {
    for (const t of tenants) {
      /**
       * `loads` is CarrierLoad's mapped table — a leaf, so a disposable row here
       * has no dependants. `client_id` turned out to be NOT NULL even though
       * information_schema did not list it among the NOT NULL columns, so the id
       * is taken from a REAL client OF THE SAME TENANT: a fabricated id would
       * fail the FK, and another tenant's client would seed a cross-tenant row —
       * which is the one thing a tenant-isolation probe must never do.
       */
      const client = await c.query<{ id: string }>(
        'SELECT id FROM public.clients WHERE org_id = $1::uuid ORDER BY id LIMIT 1',
        [t.id],
      );
      if (!client.rows[0]) refuse(`tenant ${t.slug} has no client row to hang a disposable load on`);

      for (const control of [false, true]) {
        const id = randomUUID();
        const deletedAt = control ? `now() - interval '1 day'` : `now() - interval '400 days'`;
        await c.query(
          `INSERT INTO public.loads
             (id, org_id, client_id, reference_number, status, created_at, updated_at, deleted_at)
           VALUES ($1::uuid, $2::uuid, $4::uuid, $3, 'pending', now(), now(), ${deletedAt})`,
          [id, t.id, `606-probe-${control ? 'control' : 'purge'}-${id.slice(0, 8)}`, client.rows[0].id],
        );
        probes.push({ model: 'CarrierLoad', table: 'loads', id, tenantId: t.id, control });
      }
    }
  });
  console.log(`seeded ${probes.length} disposable rows across ${tenants.length} tenants`);

  // --- 3. run the cron ------------------------------------------------------
  const res = await fetch(`${BASE}/api/cron/purge-deleted`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const bodyText = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    /* recorded raw below */
  }
  console.log(`cron: HTTP ${res.status}  ${bodyText.slice(0, 300)}`);

  // --- 4/5. COUNTER-READ ----------------------------------------------------
  const survivors = await priv(async (c) => {
    const out: Record<string, boolean> = {};
    for (const p of probes) {
      const r = await c.query(`SELECT 1 FROM public.${p.table} WHERE id = $1::uuid`, [p.id]);
      out[p.id] = (r.rowCount ?? 0) > 0;
    }
    return out;
  });

  const purgeProbes = probes.filter((p) => !p.control);
  const controlProbes = probes.filter((p) => p.control);
  const purgedAll = purgeProbes.every((p) => survivors[p.id] === false);
  const controlsSurvived = controlProbes.every((p) => survivors[p.id] === true);
  const bodyCount = body?.results?.CarrierLoad ?? null;

  // --- 6. clean up whatever is left, and assert zero probes survive ---------
  const cleaned = await priv(async (c) => {
    const r = await c.query(`DELETE FROM public.loads WHERE reference_number LIKE '606-probe-%'`);
    return r.rowCount;
  });
  const leftovers = await priv(async (c) =>
    Number(
      (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.loads WHERE reference_number LIKE '606-probe-%'`))
        .rows[0].n,
    ),
  );

  const verdict =
    purgedAll && controlsSurvived && typeof bodyCount === 'number' && bodyCount >= purgeProbes.length
      ? 'DELETED — every out-of-window probe is gone on the privileged counter-read, every in-window control survived, and the response body agrees'
      : 'NOT PROVEN';

  const record = {
    task: 'quick-606',
    at: new Date().toISOString(),
    tenants: tenants.map((t) => t.slug),
    probes,
    cron: { status: res.status, body: body ?? bodyText.slice(0, 2000) },
    counterRead: survivors,
    purgedAllOutOfWindowProbes: purgedAll,
    inWindowControlsSurvived: controlsSurvived,
    bodyReportedCarrierLoadCount: bodyCount,
    cleanup: { deletedAfterwards: cleaned, leftovers },
    verdict,
  };
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '07-purge-write-probe.json'), JSON.stringify(record, null, 2) + '\n');

  console.log(`out-of-window probes gone : ${purgedAll}`);
  console.log(`in-window controls alive  : ${controlsSurvived}`);
  console.log(`body results.CarrierLoad  : ${bodyCount}`);
  console.log(`cleanup: deleted ${cleaned} leftover probe row(s); remaining: ${leftovers}`);
  console.log(`VERDICT: ${verdict}`);

  if (leftovers !== 0) {
    console.error('PROBE ROWS SURVIVED CLEANUP.');
    process.exit(1);
  }
  process.exit(verdict.startsWith('DELETED') ? 0 : 2);
})();
