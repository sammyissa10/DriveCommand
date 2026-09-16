/**
 * quick-624 — a TRACING hook, preloaded ALONGSIDE 620-tc001-driver-hook.js, staging only.
 *
 *   NODE_OPTIONS="--require <abs>/624-guc-trace-hook.js" node scripts/audit/620-start-staging-server.js <log>
 *
 * 620's hook answers "did a TC001 happen". This one answers "on WHICH physical connection, after WHAT".
 * For every pg.Client it keeps:
 *   - a connection id (cid) and the backend pid once known;
 *   - a journal of the last statements on that connection, with any `set_config('app.current_tenant_id', …)`
 *     value and every ERROR of ANY SQLSTATE (620 prints only TC001, so a preceding non-TC001 error is invisible
 *     to it);
 *   - connect / end events (a replaced physical connection is a candidate cause and must be seen, not inferred).
 * Every statement captures a JS stack AT CALL TIME (async frames included where V8 keeps them).
 *
 * On a TC001 it prints: the statement, its call-time stack, the cid + backend pid, that connection's journal,
 * the process-wide interleaving journal, and then — on the SAME client — `current_setting('app.current_tenant_id')`
 * and `pg_backend_pid()`. If the connection is inside an aborted transaction that follow-up read returns 25P02,
 * which is itself recorded; the database's own TC001 message already states the GUC at raise time.
 *
 * Observes only. Refuses to do anything unless DATABASE_URL names staging and Q624_TRACE=on.
 * Output lines are prefixed `[q624]` and never contain the substring the click-through harnesses count
 * (it writes `T-C-0-0-1`), so installing it cannot change a click-through's TC001 tally.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const STAGING_REF = 'wyixpgunnjmzguhggocz';

// Load 620's detector FIRST and unchanged, so the click-through harnesses see exactly the `[q620-hook] TC001`
// lines (and control) they always did. NODE_OPTIONS on Windows would not carry two `--require`s, so the
// 624 launcher preloads only this file.
require('./620-tc001-driver-hook.js');

if (process.env.Q624_TRACE === 'on' && (process.env.DATABASE_URL || '').includes(STAGING_REF)) {
  let pg = null;
  try {
    pg = require('pg');
  } catch {
    pg = null;
  }
  if (pg && !pg.Client.prototype.__q624Traced) {
    Error.stackTraceLimit = 80;
    const t0 = Date.now();
    const ms = () => String(Date.now() - t0).padStart(7);
    let nextCid = 1;
    const cidOf = new WeakMap();
    const journalOf = new WeakMap();
    const GLOBAL = [];
    const cid = (c) => {
      if (!cidOf.has(c)) {
        cidOf.set(c, nextCid++);
        journalOf.set(c, []);
      }
      return cidOf.get(c);
    };
    const out = (s) => process.stderr.write(s.replace(/TC001/g, 'T-C-0-0-1') + '\n');
    const sqlstateOf = (e) => {
      const seen = new Set();
      let cur = e;
      while (cur && typeof cur === 'object' && !seen.has(cur)) {
        seen.add(cur);
        if (typeof cur.code === 'string' && /^[0-9A-Z]{5}$/.test(cur.code)) return cur.code;
        cur = cur.cause;
      }
      return 'UNKNOWN';
    };
    const textOf = (q) => (typeof q === 'string' ? q : (q && q.text) || '');
    const valuesOf = (q, args) => (q && typeof q === 'object' && q.values) || (Array.isArray(args[1]) ? args[1] : undefined);
    const push = (c, entry) => {
      const j = journalOf.get(c);
      j.push(entry);
      if (j.length > 60) j.shift();
      GLOBAL.push({ cid: cid(c), ...entry });
      if (GLOBAL.length > 120) GLOBAL.shift();
    };
    const describe = (text, values) => {
      const flat = text.replace(/\s+/g, ' ');
      const m = /set_config\('(app\.[a-z_]+)',\s*(\$1|'[^']*'|\$\d+)/.exec(flat);
      if (m) {
        const v = m[2].startsWith('$') ? (values ? JSON.stringify(values[Number(m[2].slice(1)) - 1]) : '?') : m[2];
        return `SET ${m[1]}=${v}${/,\s*(true|TRUE)\s*\)/.test(flat) ? ' (tx-local)' : /,\s*(false|FALSE)\s*\)/.test(flat) ? ' (session)' : ''}`;
      }
      return flat.slice(0, 150);
    };

    const origConnect = pg.Client.prototype.connect;
    pg.Client.prototype.connect = function (...a) {
      const id = cid(this);
      const self = this;
      push(this, { t: ms(), ev: 'CONNECT-START' });
      out(`[q624] ${ms()} cid=${id} CONNECT-START`);
      const r = origConnect.apply(this, a);
      const done = () => {
        push(self, { t: ms(), ev: `CONNECTED backendPid=${self.processID}` });
        out(`[q624] ${ms()} cid=${id} CONNECTED backendPid=${self.processID}`);
      };
      if (r && typeof r.then === 'function') r.then(done, () => {});
      return r;
    };
    const origEnd = pg.Client.prototype.end;
    pg.Client.prototype.end = function (...a) {
      push(this, { t: ms(), ev: 'END' });
      out(`[q624] ${ms()} cid=${cid(this)} backendPid=${this.processID} END (physical connection closed)`);
      return origEnd.apply(this, a);
    };

    const origQuery = pg.Client.prototype.query;
    pg.Client.prototype.query = function (...args) {
      const q = args[0];
      const text = textOf(q);
      const values = valuesOf(q, args);
      const id = cid(this);
      const self = this;
      if (text.startsWith('/*q624*/')) return origQuery.apply(this, args);
      const stack = new Error('q624 call site').stack;
      const entry = { t: ms(), sql: describe(text, values) };
      push(this, entry);

      const onErr = (e) => {
        const code = sqlstateOf(e);
        entry.err = code;
        push(self, { t: ms(), ev: `ERROR ${code}: ${String((e && e.message) || '').slice(0, 140)}` });
        out(`[q624] ${ms()} cid=${id} backendPid=${self.processID} ERROR ${code} sql=${entry.sql}`);
        if (code !== 'TC001') return;
        const lines = [];
        lines.push(`[q624] ===== RAISE on cid=${id} backendPid=${self.processID} =====`);
        lines.push(`[q624] message: ${String(e && e.message).replace(/\s+/g, ' ').slice(0, 300)}`);
        lines.push(`[q624] sql (full): ${text.replace(/\s+/g, ' ')}`);
        lines.push(`[q624] values: ${JSON.stringify(values)}`);
        lines.push('[q624] call-time stack:');
        for (const l of String(stack).split('\n').slice(1)) lines.push(`[q624]   ${l.trim()}`);
        lines.push(`[q624] journal of cid=${id} (oldest first):`);
        for (const x of journalOf.get(self)) lines.push(`[q624]   ${x.t} ${x.ev || x.sql}${x.err ? '  -> ERROR ' + x.err : ''}`);
        lines.push('[q624] process-wide interleaving (last 40):');
        for (const x of GLOBAL.slice(-40)) lines.push(`[q624]   ${x.t} cid=${x.cid} ${x.ev || x.sql}${x.err ? '  -> ERROR ' + x.err : ''}`);
        out(lines.join('\n'));
        // The GUC on the SAME backend, read immediately after the raise.
        origQuery
          .call(self, "/*q624*/ SELECT current_setting('app.current_tenant_id', true) AS guc, pg_backend_pid() AS pid, now() AS at")
          .then(
            (r) => out(`[q624] post-raise read on cid=${id}: guc=${JSON.stringify(r.rows[0].guc)} backendPid=${r.rows[0].pid}`),
            // Measured in quick-624: this fails with no SQLSTATE because pg-pool has already ENDED the physical
            // connection — `_release(client, idle, err)` removes any client released with an error. The GUC at raise
            // time is therefore taken from the database's own TC001 message and this connection's journal.
            (e2) => out(`[q624] post-raise read on cid=${id} FAILED ${sqlstateOf(e2)} (the pool had already closed this connection: ${String((e2 && e2.message) || '').slice(0, 80)})`),
          );
      };

      const last = args[args.length - 1];
      if (typeof last === 'function') {
        args[args.length - 1] = function (err, ...rest) {
          if (err) onErr(err);
          return last.call(this, err, ...rest);
        };
      }
      const r = origQuery.apply(this, args);
      if (r && typeof r.then === 'function') r.then(undefined, onErr);
      return r;
    };
    pg.Client.prototype.__q624Traced = true;
    out(`[q624] trace hook installed pid=${process.pid}`);
  }
}
