/**
 * quick-606 — summarise a vitest JSON report into the two numbers that matter
 * and the failing-file set BY NAME.
 *
 *   npx tsx scripts/audit/606-suite-summary.ts <report.json> [<other-report.json>]
 *
 * With two arguments it diffs the failing-file sets in BOTH DIRECTIONS. A count
 * comparison alone misses a swap (quick-603's rule), and
 * `--reporter=basic` does not exist in vitest 4 and exits 0 having run ZERO
 * tests (quick-557), so the test COUNTS are printed too and both sides must be
 * taken under the same reporter.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

type Report = {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTotalTestSuites: number;
  testResults: { name: string; status: string }[];
};

function load(p: string): Report {
  return JSON.parse(readFileSync(resolve(p), 'utf8'));
}

function failingFiles(r: Report): string[] {
  const set = new Set<string>();
  for (const t of r.testResults) {
    if (t.status !== 'failed') continue;
    const norm = t.name.split('\\').join('/');
    const i = norm.indexOf('/apps/web/');
    set.add(i >= 0 ? norm.slice(i + '/apps/web/'.length) : norm);
  }
  return [...set].sort();
}

function describe(label: string, r: Report) {
  const f = failingFiles(r);
  console.log(
    `${label}: tests ${r.numTotalTests} (passed ${r.numPassedTests} · failed ${r.numFailedTests} · pending ${r.numPendingTests}) — failing files ${f.length}`,
  );
  for (const x of f) console.log(`    ${x}`);
  return f;
}

const [a, b] = process.argv.slice(2);
if (!a) {
  console.error('usage: npx tsx scripts/audit/606-suite-summary.ts <report.json> [<other.json>]');
  process.exit(1);
}
const ra = load(a);
const fa = describe('A', ra);
if (b) {
  const rb = load(b);
  const fb = describe('B', rb);
  const onlyA = fa.filter((x) => !fb.includes(x));
  const onlyB = fb.filter((x) => !fa.includes(x));
  console.log(`\nfailing only in A: ${onlyA.length ? onlyA.join(', ') : '(none)'}`);
  console.log(`failing only in B: ${onlyB.length ? onlyB.join(', ') : '(none)'}`);
  console.log(`IDENTICAL BY NAME IN BOTH DIRECTIONS: ${onlyA.length === 0 && onlyB.length === 0}`);
  console.log(`test delta (B - A): ${rb.numTotalTests - ra.numTotalTests}`);
}
