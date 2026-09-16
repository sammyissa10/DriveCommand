/**
 * quick-624 — reproduce DRIVER_A's /home TC001 ON DEMAND.
 *
 *   node scripts/audit/624-start-staging-server.js <log>          (FIRST — dev server, 620 detector + 624 tracer)
 *   CLICK_THROUGH_LOG=<log> npx tsx scripts/audit/624-home-repro.ts [--n 6] [--path /home] [--out <file>]
 *
 * Logs in once through the real /api/auth/login, then GETs the path N times, strictly sequentially. After each
 * response it WAITS FOR THE SERVER LOG TO GO QUIET (no growth for 1.5 s) before closing the byte window, so a
 * hook line the server writes after its `GET … 200` line still lands in the window of the request that caused
 * it — the attribution error quick-623 found. Per request it records the status, the `[q620-hook] TC001` count
 * and every `[q624]` RAISE block in that window.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';

const APP_ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

const BASE = 'http://localhost:3000';
const LOG = process.env.CLICK_THROUGH_LOG;
if (!LOG) {
  console.error('624-home-repro: CLICK_THROUGH_LOG is not set');
  process.exit(1);
}
const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const N = Number(arg('--n', '6'));
const PATHS = arg('--paths', arg('--path', '/home')).split(',');
// --window quiet (default) closes on a quiet log; --window fixed350 reproduces the OLD click-through closing rule.
const WINDOW = arg('--window', 'quiet');
const EMAIL = arg('--email', 'driver1@alpha.staging.test');
const OUT = process.argv.includes('--out') ? resolve(arg('--out', '')) : null;

const size = () => statSync(LOG).size;
async function quiet(ms = 1500, max = 30000) {
  const start = Date.now();
  let last = size();
  let stableSince = Date.now();
  while (Date.now() - start < max) {
    await new Promise((r) => setTimeout(r, 250));
    const now = size();
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= ms) return;
  }
}
const slice = (from: number, to: number) => readFileSync(LOG).subarray(from, to).toString('utf8');

(async () => {
  const pw = process.env.STAGING_SEED_PASSWORD;
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: pw }),
  });
  const cookie = ((res.headers as unknown as { getSetCookie(): string[] }).getSetCookie() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  console.log(`login ${EMAIL} -> ${res.status}`);
  if (res.status !== 200) process.exit(1);
  await quiet();

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i <= N; i++) for (const PATH of PATHS) {
    const before = size();
    const r = await fetch(`${BASE}${PATH}`, { headers: { cookie }, redirect: 'manual' });
    await r.text();
    if (WINDOW === 'fixed350') await new Promise((x) => setTimeout(x, 350));
    else await quiet();
    const text = slice(before, size());
    const hook = text.split('\n').filter((l) => l.includes('[q620-hook] TC001'));
    const raises = text.split('[q624] ===== RAISE').slice(1).map((b) => ('===== RAISE' + b).split('\n').filter((l) => l.startsWith('[q624]') || l.startsWith('===== RAISE')).join('\n'));
    const postRaise = text.split('\n').filter((l) => l.includes('post-raise read'));
    const otherErrors = text.split('\n').filter((l) => /\[q624\].* ERROR (?!T-C-0-0-1)/.test(l));
    const gets = text.split('\n').filter((l) => /^\s*GET \//.test(l)).map((l) => l.trim());
    rows.push({ i, window: WINDOW, path: PATH, status: r.status, byteRange: [before, size()], gets, q620Tc001: hook.length, raises, postRaise, otherErrors });
    console.log(`#${i} [${WINDOW}] ${PATH} ${r.status}  [q620-hook] TC001=${hook.length}  RAISE blocks=${raises.length}  non-TC001 errors=${otherErrors.length}  GET lines=${gets.join(' | ')}`);
    for (const p of postRaise) console.log(`    ${p}`);
  }
  if (OUT) {
    mkdirSync(resolve(OUT, '..'), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), email: EMAIL, rows }, null, 2) + '\n');
    console.log(`written ${OUT}`);
  }
})();
