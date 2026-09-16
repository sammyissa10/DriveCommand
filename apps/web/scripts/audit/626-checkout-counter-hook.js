/**
 * quick-626 — a COUNTING hook, preloaded into `next dev` ALONGSIDE 620-tc001-driver-hook.js, staging only.
 *
 * Answers one question on REAL traffic: how many GUC round trips does a request pay?
 *   checkouts   every `pg.Pool#connect` (pool.query and adapter-pg's BEGIN both go through it)
 *   gucWrites   every parameterised `set_config('app.current_tenant_id', $1, false)` — the SAME statement text on both
 *               stacks: shipped issues it once per `getTenantPrisma*()` acquisition, the adopted pool once per
 *               checkout-cache MISS. The pool's `''` initialiser is a literal, fires once per physical connection,
 *               and is deliberately not counted.
 * The same instrument therefore measures both stacks, and `1 - gucWrites/checkouts` is the adopted cache hit rate.
 *
 * Output: after 250 ms without a counter change it prints ONE cumulative line
 *   [q626-count] checkouts=<n> gucWrites=<n>
 * so a click-through entry's delta is (last line inside its logByteRange) − (last line before it). The click-through
 * windows close on 1.5 s of log quiet (quick-624), which is longer than the debounce by construction.
 *
 * Loads 620's detector FIRST and unchanged. Observes only; never prints the TC001 token. Refuses unless DATABASE_URL
 * names staging and Q626_COUNT=on.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const STAGING_REF = 'wyixpgunnjmzguhggocz';

require('./620-tc001-driver-hook.js');

if (process.env.Q626_COUNT === 'on' && (process.env.DATABASE_URL || '').includes(STAGING_REF)) {
  let pg = null;
  try {
    pg = require('pg');
  } catch {
    pg = null;
  }
  if (pg && !pg.Pool.prototype.__q626Counted) {
    pg.Pool.prototype.__q626Counted = true;
    const c = { checkouts: 0, gucWrites: 0 };
    let timer = null;
    const changed = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        process.stderr.write(`[q626-count] pid=${process.pid} checkouts=${c.checkouts} gucWrites=${c.gucWrites}\n`);
      }, 250);
      if (timer.unref) timer.unref();
    };
    const oc = pg.Pool.prototype.connect;
    pg.Pool.prototype.connect = function (...a) {
      c.checkouts++;
      changed();
      return oc.apply(this, a);
    };
    const WRITE = /set_config\('app\.current_tenant_id',\s*\$1,\s*false\)/;
    const oq = pg.Client.prototype.query;
    pg.Client.prototype.query = function (...a) {
      const q = a[0];
      const text = typeof q === 'string' ? q : (q && q.text) || '';
      if (WRITE.test(text)) {
        c.gucWrites++;
        changed();
      }
      return oq.apply(this, a);
    };
    process.stderr.write(`[q626-count] installed pid=${process.pid}\n`);
  }
}
