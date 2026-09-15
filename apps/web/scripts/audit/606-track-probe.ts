/**
 * quick-606 — measure what `/track/[token]` ACTUALLY DOES the first time a
 * tracking token exists.
 *
 *   npx tsx scripts/audit/606-track-probe.ts
 *
 * Production carries **ZERO** legacy `"Load"` rows with a `trackingToken`
 * (`08-track-liveness.json`), so the feature is not live and the plan's own rule
 * makes "report, do not build" the correct outcome. But "not live" is not the
 * same claim as "harmless", and the difference is worth one measurement rather
 * than a paragraph of reasoning: this seeds ONE disposable legacy `Load` with a
 * token on staging, drives the page **with no session at all**, records exactly
 * what comes back, and hard-deletes the row.
 *
 * The result is what §8 of the report needs — the concrete thing that happens on
 * the day somebody sets a token — instead of a prediction.
 *
 * STAGING ONLY. Never imports `scripts/_bootstrap-env`.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, openSync, readSync, closeSync, statSync, mkdirSync as _m, writeFileSync } from 'fs';
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
const SERVER_LOG = process.env.CLICK_THROUGH_LOG ? resolve(process.env.CLICK_THROUGH_LOG) : null;

function refuse(reason: string): never {
  console.error(`606-track-probe: REFUSING — ${reason}`);
  process.exit(1);
}

const url = process.env.STAGING_DIRECT_URL;
if (!url) refuse('STAGING_DIRECT_URL unset');
if (url.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names PRODUCTION');
if (!url.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name staging');

async function priv<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    const who = (await c.query<{ cu: string }>('SELECT current_user AS cu')).rows[0].cu;
    if (who === 'app_user') refuse('the counter-read connection is app_user');
    return await fn(c);
  } finally {
    await c.end();
  }
}

function logSize(): number {
  if (!SERVER_LOG) return 0;
  try {
    return statSync(SERVER_LOG).size;
  } catch {
    return 0;
  }
}
function logSlice(from: number, to: number): string {
  if (!SERVER_LOG || to <= from) return '';
  const fd = openSync(SERVER_LOG, 'r');
  try {
    const buf = Buffer.alloc(to - from);
    readSync(fd, buf, 0, to - from, from);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

(async () => {
  const tenant = await priv(async (c) =>
    (await c.query<{ id: string; slug: string }>(`SELECT id, slug FROM public."Tenant" ORDER BY slug LIMIT 1`)).rows[0],
  );
  if (!tenant) refuse('no tenant on staging');

  const id = randomUUID();
  const customerId = randomUUID();
  const token = `606-probe-token-${id.slice(0, 12)}`;
  const loadNumber = `606-PROBE-${id.slice(0, 8)}`;

  /**
   * `"Load"."customerId"` is NOT NULL and staging carries ZERO legacy
   * `"Customer"` rows, so a disposable customer is seeded alongside the load and
   * removed with it, in FK order. Both are real rows in the tenant's own scope,
   * not a fabricated id handed to the page — the distinction the plan draws.
   */
  let seeded = false;
  let seedError: string | null = null;
  try {
    await priv(async (c) => {
      await c.query(
        `INSERT INTO public."Customer" (id, "tenantId", "companyName", "createdAt", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3, now(), now())`,
        [customerId, tenant.id, `606-probe customer ${customerId.slice(0, 8)}`],
      );
      await c.query(
        `INSERT INTO public."Load"
           (id, "tenantId", "customerId", "loadNumber", origin, destination, "pickupDate", rate, status, "trackingToken", "createdAt", "updatedAt")
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'Probeville, XX', 'Probetown, XX', now(), 1, 'PENDING', $5, now(), now())`,
        [id, tenant.id, customerId, loadNumber, token],
      );
    });
    seeded = true;
  } catch (e) {
    seedError = String((e as Error)?.message ?? e);
  }

  let status: number | null = null;
  let bodyExcerpt = '';
  let slice = '';
  let tc001 = 0;
  /**
   * Searched in the FULL body, never in `bodyExcerpt` — quick-605's rule. The
   * page renders through `TrackingPoller`, so the load number arrives in the RSC
   * payload well past the first 2 KB, and an excerpt-only check would report a
   * correctly-rendering page as "UNEXPECTED".
   */
  let bodyCarriesLoadNumber = false;
  if (seeded) {
    const from = logSize();
    // NO SESSION AT ALL — the caller is an anonymous member of the public and the
    // token IS the capability.
    const res = await fetch(`${BASE}/track/${encodeURIComponent(token)}`, { redirect: 'manual' });
    status = res.status;
    const body = await res.text();
    bodyCarriesLoadNumber = body.includes(loadNumber);
    bodyExcerpt = body.slice(0, 2048);
    await new Promise((r) => setTimeout(r, 400));
    slice = logSlice(from, logSize());
    tc001 = (slice.match(/TC001/g) ?? []).length;
  }

  // FK order: the load before the customer it points at.
  const cleanup = await priv(async (c) => {
    const del = await c.query(`DELETE FROM public."Load" WHERE "trackingToken" LIKE '606-probe-token-%'`);
    const delCust = await c.query(`DELETE FROM public."Customer" WHERE "companyName" LIKE '606-probe customer%'`);
    const left = Number(
      (
        await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM public."Load" WHERE "trackingToken" LIKE '606-probe-token-%'`,
        )
      ).rows[0].n,
    );
    const leftCust = Number(
      (
        await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM public."Customer" WHERE "companyName" LIKE '606-probe customer%'`,
        )
      ).rows[0].n,
    );
    return { deleted: del.rowCount, deletedCustomers: delCust.rowCount, left, leftCust };
  });

  const verdict = !seeded
    ? 'NOT_MEASURED'
    : tc001 > 0 || (status ?? 0) >= 500
      ? 'FAILS — the page raises as app_user the first time a token exists'
      : status === 200 && bodyCarriesLoadNumber
        ? 'RENDERS — HTTP 200, no TC001, and the load number is in the body'
        : `UNEXPECTED — HTTP ${status}`;

  const record = {
    task: 'quick-606',
    at: new Date().toISOString(),
    note: 'production carries ZERO legacy "Load" rows with a trackingToken — this measures the SHAPE, not a live feature',
    probe: { id, token, loadNumber, tenant: tenant.slug, seeded, seedError },
    response: { status, tc001InLogWindow: tc001, bodyCarriesLoadNumber, bodyExcerpt: bodyExcerpt.slice(0, 1200) },
    logSliceExcerpt: slice.slice(0, 3000),
    cleanup,
    verdict,
  };
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '08-track-probe.json'), JSON.stringify(record, null, 2) + '\n');

  console.log(`seeded: ${seeded}${seedError ? ` (${seedError})` : ''}`);
  console.log(`HTTP ${status}  TC001 in window: ${tc001}`);
  console.log(`cleanup: deleted ${cleanup.deleted} load(s) + ${cleanup.deletedCustomers} customer(s); remaining ${cleanup.left}/${cleanup.leftCust}`);
  console.log(`VERDICT: ${verdict}`);
  if (cleanup.left !== 0 || cleanup.leftCust !== 0) {
    console.error('PROBE ROWS SURVIVED.');
    process.exit(1);
  }
})();
