/**
 * quick-617 — THE FOUR-PART ARMING COUNTER-ASSERTION.
 *
 * ZERO TC001 is exactly what a DISARMED tripwire looks like, so the count alone
 * is not evidence. Parts 1-3 are satisfied by a function that ignores the world;
 * part 4 is the one that touches the database. All four, or the count is noise.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const PROD = 'oqdhberkghtnszrkdvfm', STG = 'wyixpgunnjmzguhggocz';
const APP_ROOT = resolve(__dirname, '../..');
const EV = resolve(APP_ROOT, '../../.planning/quick/619-route-the-lib-services-surface-off-app-b/evidence');
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

const raw = process.env.STAGING_DATABASE_URL_APP_USER!;
if (!raw || raw.includes(PROD) || !raw.includes(STG)) { console.error('REFUSING — not staging'); process.exit(1); }
const APP_USER_URL = raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
const prodShaped = raw.replace(new RegExp(STG, 'g'), PROD);

(async () => {
  const { shouldArmTripwire } = await import('../../src/lib/db/tripwire-arm');
  const lines: string[] = [];
  const say = (s: string) => { lines.push(s); console.log(s); };

  say(`[db-target] project : ${STG} (staging)  role : ${new URL(APP_USER_URL).username}  (credential MASKED)`);
  say('');
  say('quick-619 — arming counter-assertion, four parts (copy of 617-arming-control.ts, evidence path changed)');
  say('================================================');

  const p1 = shouldArmTripwire(raw, 'on');
  say(`1   shouldArmTripwire(<the server's exact DATABASE_URL>, 'on')          -> ${p1}   ${p1 ? 'PASS' : 'FAIL'}`);
  say(`    proves: the arming CONDITION prisma.ts evaluates at module scope was satisfied.`);
  say(`    does NOT prove: that the set_config reached the pool.`);

  const p2 = shouldArmTripwire(prodShaped, 'on');
  say(`2   the same string with the PRODUCTION ref                             -> ${p2}   ${p2 === false ? 'PASS' : 'FAIL'}`);
  say(`    proves: the gate is a gate. A function that says yes to everything satisfies 1 identically.`);

  const p3 = shouldArmTripwire(raw, 'off');
  say(`3   the same string, TENANT_CONTEXT_TRIPWIRE='off'                      -> ${p3}   ${p3 === false ? 'PASS' : 'FAIL'}`);
  say(`    proves: the flag half is live too.`);

  // 4 — the half that touches the database.
  const c = new Client({ connectionString: APP_USER_URL });
  await c.connect();
  let guc = '', armedRaise = 'NONE', disarmed = 'NONE';
  try {
    await c.query(`SELECT set_config('app.tenant_context_tripwire', 'on', false)`);
    guc = (await c.query(`SELECT current_setting('app.tenant_context_tripwire', TRUE) AS v`)).rows[0].v;
    await c.query(`SELECT set_config('app.current_tenant_id', '', false)`);
    try {
      const n = (await c.query(`SELECT count(*)::int AS n FROM "Truck"`)).rows[0].n;
      armedRaise = `NO RAISE (count=${n})`;
    } catch (e) { armedRaise = (e as { code?: string }).code ?? 'UNKNOWN'; }
    await c.query(`SELECT set_config('app.tenant_context_tripwire', 'off', false)`);
    try {
      const n = (await c.query(`SELECT count(*)::int AS n FROM "Truck"`)).rows[0].n;
      disarmed = `silent, count=${n}`;
    } catch (e) { disarmed = `RAISED ${(e as { code?: string }).code}`; }
  } finally { await c.end(); }

  say(`4   tripwire GUC read back on a fresh app_user connection               -> "${guc}"   ${guc === 'on' ? 'PASS' : 'FAIL'}`);
  say(`4b  unscoped SELECT count(*) FROM "Truck" with it ARMED                 -> ${armedRaise}   ${armedRaise === 'TC001' ? 'PASS' : 'FAIL'}`);
  say(`    proves: the MECHANISM is live on staging for app_user AT THIS MOMENT, so a surface that`);
  say(`    ran an unscoped statement WOULD have produced a TC001 line. Meaningful over an EMPTY table`);
  say(`    on purpose — the policy expression is evaluated at scan setup, not per row (quick-610).`);
  say(`4c  the same read with the tripwire 'off'                               -> ${disarmed}   ${disarmed.startsWith('silent') ? 'PASS' : 'FAIL'}`);
  say(`    proves: the raise is caused by the ARMING, not by the statement. Without this half,`);
  say(`    "unscoped => TC001" could be a property of the read.`);
  say('');
  const ok = p1 === true && p2 === false && p3 === false && guc === 'on' && armedRaise === 'TC001' && disarmed.startsWith('silent');
  say(`VERDICT: ${ok ? 'ARMED — all four parts pass' : 'NOT PROVEN ARMED'}`);
  say('');
  say('WHAT THIS DOES NOT PROVE: that every request in the run ran on a connection that had been');
  say('armed. The GUC is session scope on a max:1 pool and pool.on(\'connect\') fires per physical');
  say('connection; nothing outside the process can read another session\'s GUC. The argument is');
  say('circumstantial in exactly that one respect, and it is stated rather than glossed.');

  mkdirSync(EV, { recursive: true });
  writeFileSync(resolve(EV, '07-arming-control.txt'), lines.join('\n') + '\n');
  if (!ok) process.exit(2);
})();
