/**
 * quick-620 — the FIXED driver-level TC001 detector, preloaded into `next dev`.
 *
 *   NODE_OPTIONS="--require <abs path to this file>"   (set by 620-start-staging-server.js)
 *
 * quick-619 fixed its TC001 hook to watch BOTH `pg` call forms — the promise form
 * (interactive-transaction statements) and the callback form that pg-pool uses for
 * every autocommit statement. That fix lived only inside 619's step-6 harness; its
 * click-throughs counted `TC001` in server-log text, which a route that swallows
 * its own error never writes. This file puts the same fixed hook inside the server
 * process and prints one line per driver-level raise, so both click-through
 * harnesses — which count `TC001` in their correlated log slices — see every raise,
 * swallowed or not.
 *
 * `pg` is on Next's built-in server-external list, so the app requires the same
 * `node_modules/pg` this file patches (verified before this file was written).
 *
 * CONTROL: at load, in every process that inherits NODE_OPTIONS, one unscoped read
 * is issued on a fresh client with the tripwire armed. It MUST raise, and the hook
 * MUST record it — otherwise "0 TC001 in the log" means nothing. The control line
 * spells the code as `T-C-0-0-1` so it is NOT counted by the harnesses' /TC001/
 * matchers; its verdict token is `Q620_HOOK_CONTROL=PASS|FAIL`.
 *
 * Staging only: the control refuses unless DATABASE_URL names the staging ref and
 * TENANT_CONTEXT_TRIPWIRE is exactly `on`. The hook itself only observes.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const STAGING_REF = 'wyixpgunnjmzguhggocz';

function sqlstateOf(e) {
  const seen = new Set();
  let cur = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    if (typeof cur.code === 'string' && /^[0-9A-Z]{5}$/.test(cur.code)) return cur.code;
    cur = cur.cause;
  }
  return 'UNKNOWN';
}

let pg;
try {
  pg = require('pg');
} catch {
  pg = null;
}

if (pg && !pg.Client.prototype.__q620Hooked) {
  const orig = pg.Client.prototype.query;
  let controlPending = null; // set only while the control query runs
  const note = (e, q) => {
    if (sqlstateOf(e) !== 'TC001') return;
    if (controlPending && controlPending.query === q) {
      controlPending.recorded = true;
      return;
    }
    const sql = typeof q === 'string' ? q : (q && q.text) || '';
    process.stderr.write(`[q620-hook] TC001 pid=${process.pid} sql=${sql.replace(/\s+/g, ' ').slice(0, 200)}\n`);
  };
  pg.Client.prototype.query = function (...args) {
    const last = args[args.length - 1];
    if (typeof last === 'function') {
      args[args.length - 1] = function (err, ...rest) {
        if (err) note(err, args[0]);
        return last.call(this, err, ...rest);
      };
    }
    const r = orig.apply(this, args);
    if (r && typeof r.then === 'function') r.then(undefined, (e) => note(e, args[0]));
    return r;
  };
  pg.Client.prototype.__q620Hooked = true;

  const url = process.env.DATABASE_URL || '';
  if (url.includes(STAGING_REF) && process.env.TENANT_CONTEXT_TRIPWIRE === 'on') {
    (async () => {
      const c = new pg.Client({ connectionString: url.replace(':6543/', ':5432/').replace('?pgbouncer=true', '') });
      let callerSaw = 'none';
      const q = 'SELECT count(*) FROM "FleetMessage"';
      try {
        await c.connect();
        await c.query("SELECT set_config('app.tenant_context_tripwire', 'on', false)");
        controlPending = { query: q, recorded: false };
        try {
          await c.query(q);
        } catch (e) {
          callerSaw = sqlstateOf(e);
        }
        await new Promise((r) => setTimeout(r, 50));
      } catch (e) {
        callerSaw = `connect-failed:${sqlstateOf(e)}`;
      } finally {
        const recorded = !!(controlPending && controlPending.recorded);
        controlPending = null;
        c.end().catch(() => {});
        const pass = callerSaw === 'TC001' && recorded;
        process.stderr.write(
          `[q620-hook] control pid=${process.pid} callerSaw=${callerSaw === 'TC001' ? 'T-C-0-0-1' : callerSaw} hookRecorded=${recorded} Q620_HOOK_CONTROL=${pass ? 'PASS' : 'FAIL'}\n`,
        );
      }
    })();
  } else {
    process.stderr.write(`[q620-hook] installed pid=${process.pid}; control SKIPPED (not staging or tripwire flag not on)\n`);
  }
}
