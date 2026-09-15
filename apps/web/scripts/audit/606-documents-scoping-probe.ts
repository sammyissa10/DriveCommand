/**
 * quick-606 — prove `/documents` is TENANT-SCOPED, not merely non-500.
 *
 *   npx tsx scripts/audit/606-documents-scoping-probe.ts
 *
 * R3: staging holds ZERO `Document` rows, so a 200 after the column-drift
 * migration proves the `P2022` is gone and NOTHING AT ALL about the scoping.
 * quick-605 established this on `/carrier/driver-pay/reports` — "a LATENT row is
 * not a safe row". This closes it:
 *
 *   1. seed ONE disposable `Document` for tenant A's driver, on the PRIVILEGED
 *      connection (`postgres`), with a fileName that cannot collide;
 *   2. drive `/documents` as tenant A's driver — the probe must RENDER;
 *   3. drive `/documents` as tenant B's driver — the probe must NOT appear;
 *   4. hard-delete the probe and assert ZERO survive.
 *
 * Step 3 is the one that matters. Step 2 alone would pass on an unscoped read.
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
const ORIGIN = 'http://localhost:3000';
const PASSWORD = process.env.STAGING_SEED_PASSWORD;
const PROBE_FILENAME = `606-probe-doc-${Date.now()}.pdf`;

function refuse(reason: string): never {
  console.error(`606-documents-scoping-probe: REFUSING — ${reason}`);
  process.exit(1);
}

const url = process.env.STAGING_DIRECT_URL;
if (!url) refuse('STAGING_DIRECT_URL unset');
if (url.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names PRODUCTION');
if (!url.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name staging');
if (!PASSWORD) refuse('STAGING_SEED_PASSWORD unset');

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

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: 'manual',
  });
  if (res.status !== 200) refuse(`login ${email} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const raw = (res.headers as any).getSetCookie?.() as string[] | undefined;
  const list = raw && raw.length ? raw : [res.headers.get('set-cookie') ?? ''];
  const cookie = list.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  if (!cookie.includes('sb-')) refuse(`login ${email} returned 200 with no sb- cookie`);
  return cookie;
}

async function visit(cookie: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}/documents`, { headers: { cookie }, redirect: 'manual' });
  return { status: res.status, body: (await res.text()).slice(0, 400_000) };
}

(async () => {
  const drivers = await priv(async (c) =>
    (
      await c.query<{ id: string; email: string; tenantId: string; slug: string }>(
        `SELECT u.id, u.email, u."tenantId", t.slug
           FROM public."User" u JOIN public."Tenant" t ON t.id = u."tenantId"
          WHERE u.role = 'DRIVER' AND u."isActive" = true
          ORDER BY t.slug, u.email`,
      )
    ).rows,
  );
  const a = drivers.find((d) => d.slug === 'staging-alpha');
  const b = drivers.find((d) => d.slug === 'staging-beta');
  if (!a) refuse('no active DRIVER on staging-alpha');
  if (!b) {
    console.warn(
      'NO ACTIVE DRIVER ON staging-beta — the cross-tenant half CANNOT be run. ' +
        'Reporting this row as LATENT rather than pass (R3).',
    );
  }

  // --- 1. seed ------------------------------------------------------------
  const probeId = randomUUID();
  await priv(async (c) => {
    await c.query(
      `INSERT INTO public."Document"
         (id, "tenantId", "driverId", "fileName", "s3Key", "contentType", "sizeBytes", "uploadedBy", "expiryDate", "createdAt", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'application/pdf', 1234, $3::uuid, now() + interval '90 days', now(), now())`,
      [probeId, a.tenantId, a.id, PROBE_FILENAME, `606-probe/${probeId}`],
    );
  });
  console.log(`seeded probe Document ${probeId} for ${a.email} (${a.slug})`);

  // --- 2 & 3. drive both drivers -----------------------------------------
  const aCookie = await login(a.email);
  const aRes = await visit(aCookie);
  const aSees = aRes.body.includes(PROBE_FILENAME);

  let bRes: { status: number; body: string } | null = null;
  let bSees: boolean | null = null;
  if (b) {
    const bCookie = await login(b.email);
    bRes = await visit(bCookie);
    bSees = bRes.body.includes(PROBE_FILENAME);
  }

  // --- 4. clean up, and COUNTER-READ that nothing survives ----------------
  const deleted = await priv(async (c) => {
    const r = await c.query('DELETE FROM public."Document" WHERE id = $1::uuid', [probeId]);
    return r.rowCount;
  });
  const survivors = await priv(async (c) =>
    Number(
      (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."Document" WHERE "fileName" LIKE '606-probe%'`))
        .rows[0].n,
    ),
  );

  const verdict =
    aRes.status === 200 && aSees && b && bSees === false
      ? 'SCOPED — tenant A sees its probe, tenant B does not'
      : b
        ? 'NOT PROVEN'
        : 'LATENT — no tenant-B driver to run the cross-tenant half against';

  const record = {
    task: 'quick-606',
    at: new Date().toISOString(),
    probe: { id: probeId, fileName: PROBE_FILENAME, tenant: a.slug, driver: a.email },
    tenantA: { email: a.email, status: aRes.status, sawProbe: aSees },
    tenantB: b ? { email: b.email, status: bRes!.status, sawProbe: bSees } : null,
    cleanup: { deletedRows: deleted, survivingProbeRows: survivors },
    verdict,
  };
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '06-documents-scoping.json'), JSON.stringify(record, null, 2) + '\n');

  console.log(`tenant A ${a.email}: HTTP ${aRes.status}  sees probe: ${aSees}`);
  if (b) console.log(`tenant B ${b.email}: HTTP ${bRes!.status}  sees probe: ${bSees}`);
  console.log(`cleanup: deleted ${deleted} row(s); surviving 606-probe rows: ${survivors}`);
  console.log(`VERDICT: ${verdict}`);

  if (survivors !== 0) {
    console.error('PROBE ROWS SURVIVED — clean them up before closing the task.');
    process.exit(1);
  }
  process.exit(verdict.startsWith('SCOPED') ? 0 : 2);
})();
