// quick-626 — per-request GUC round trips on REAL traffic, from a click-through JSON + its server log.
//   node guc-cost.cjs <server.log> <out.json> <click-through.json> [more click-through.json …]
// Reads the cumulative `[q626-count] pid=<p> checkouts=<n> gucWrites=<n>` lines 626-checkout-counter-hook.js prints,
// and for every entry carrying a `logByteRange` computes, per pid, (last value inside the range) − (last value before
// it), summed over pids. Entries with no counter line inside their range issued no checkout.
const fs = require('fs');
const [, , logPath, outPath, ...inputs] = process.argv;
const log = fs.readFileSync(logPath);
const text = log.toString('latin1'); // byte offsets == string offsets
const RE = /\[q626-count\] pid=(\d+) checkouts=(\d+) gucWrites=(\d+)/g;
const marks = [];
for (let m; (m = RE.exec(text)); ) marks.push({ at: m.index, pid: m[1], co: +m[2], gw: +m[3] });

function lastBefore(offset) {
  const per = {};
  for (const k of marks) if (k.at < offset) per[k.pid] = k;
  return per;
}
function entries(node, acc = []) {
  if (Array.isArray(node)) node.forEach((n) => entries(n, acc));
  else if (node && typeof node === 'object') {
    if (Array.isArray(node.logByteRange)) acc.push(node);
    for (const v of Object.values(node)) if (v && typeof v === 'object' && v !== node.logByteRange) entries(v, acc);
  }
  return acc;
}
const rows = [];
for (const f of inputs) {
  for (const e of entries(JSON.parse(fs.readFileSync(f, 'utf8')))) {
    const [s, end] = e.logByteRange;
    const before = lastBefore(s);
    const inside = lastBefore(end);
    let co = 0, gw = 0;
    for (const [pid, k] of Object.entries(inside)) {
      const b = before[pid];
      co += k.co - (b ? b.co : 0);
      gw += k.gw - (b ? b.gw : 0);
    }
    rows.push({ file: f.split(/[\\/]/).pop(), role: e.role, surface: e.surface ?? e.path ?? e.route, status: e.status, verdict: e.verdict, checkouts: co, gucWrites: gw });
  }
}
const withDb = rows.filter((r) => r.checkouts > 0);
const sum = (k, rs) => rs.reduce((a, r) => a + r[k], 0);
const sorted = (k, rs) => rs.map((r) => r[k]).sort((a, b) => a - b);
const pct = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);
const summary = {
  entries: rows.length,
  entriesWithCheckouts: withDb.length,
  checkouts: sum('checkouts', withDb),
  gucWrites: sum('gucWrites', withDb),
  gucWritesPerRequest: { mean: +(sum('gucWrites', withDb) / withDb.length).toFixed(2), median: pct(sorted('gucWrites', withDb), 50), p95: pct(sorted('gucWrites', withDb), 95), max: Math.max(...sorted('gucWrites', withDb)) },
  checkoutsPerRequest: { mean: +(sum('checkouts', withDb) / withDb.length).toFixed(2), median: pct(sorted('checkouts', withDb), 50), p95: pct(sorted('checkouts', withDb), 95) },
  gucWritesOverCheckouts: +(sum('gucWrites', withDb) / sum('checkouts', withDb)).toFixed(3),
};
fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
