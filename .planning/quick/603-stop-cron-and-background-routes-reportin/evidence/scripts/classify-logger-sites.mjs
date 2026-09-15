/**
 * quick-603 Task 5 Step A — classify each `logger.error(msg, {obj})` site.
 *
 * Emits, per site: the file:line, the slot-2 text, the nearest ENCLOSING catch
 * binding (found by walking backwards at brace depth), and a PROPOSED bucket.
 * The proposal is a starting point for a human read, not the answer — bucket (c)
 * exists precisely because some sites cannot be decided mechanically.
 *
 * Run from `apps/web`:
 *   node ../../.planning/.../evidence/scripts/classify-logger-sites.mjs <in.json> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

const inPath = process.argv[2];
const outPath = process.argv[3];
const data = JSON.parse(readFileSync(inPath, 'utf8'));

/**
 * Walk backwards from `idx` looking for the `catch (X) {` whose block we are
 * inside. Tracks brace depth so a sibling catch that has already closed is not
 * mistaken for the enclosing one.
 */
function enclosingCatchBinding(src, idx) {
  let depth = 0;
  for (let i = idx; i >= 0; i--) {
    const c = src[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) {
        // Opening brace of a block we are inside. Is it a catch block?
        const head = src.slice(Math.max(0, i - 160), i);
        const m = head.match(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)\s*$/);
        if (m) return m[1];
        const arrow = head.match(/\.catch\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)?\s*=>\s*$/);
        if (arrow) return arrow[1];
      } else depth--;
    }
  }
  return null;
}

const ERRISH = /^(err|error|e|ex|exception)$|Err$|Error$/i;

const out = [];
for (const site of data.objSlot) {
  const file = site.loc.replace(/:\d+$/, '');
  const line = Number(site.loc.slice(file.length + 1));
  const src = readFileSync(file, 'utf8').split(CR + LF).join(LF);
  const lines = src.split(LF);
  // Byte index of the call: find the `logger.error(` on that line.
  let idx = lines.slice(0, line - 1).join(LF).length + (line > 1 ? 1 : 0);
  idx = src.indexOf('logger.error(', idx);

  const binding = enclosingCatchBinding(src, idx);

  // Does the slot-2 literal already carry the error value under some key?
  const arg2 = site.arg2;
  const keys = [...arg2.matchAll(/([A-Za-z_$][\w$]*)\s*(?::|[,}])/g)].map((m) => m[1]);
  const mentionsBinding = binding ? new RegExp(`\\b${binding}\\b`).test(arg2) : false;
  const hasErrishKey = keys.some((k) => ERRISH.test(k));

  let bucket;
  let reason;
  if (binding && mentionsBinding) {
    bucket = 'a';
    reason = `caught as \`${binding}\`, currently inside the context object`;
  } else if (binding && !mentionsBinding) {
    bucket = 'c';
    reason = `inside \`catch (${binding})\` but the context does NOT mention it — needs a human read`;
  } else if (!binding && hasErrishKey) {
    bucket = 'c';
    reason = 'no enclosing catch, but an error-ish key is present — needs a human read';
  } else {
    bucket = 'b';
    reason = 'no enclosing catch and no error value — an error-level log about a condition';
  }

  out.push({ loc: site.loc, file, line, arg2, binding, bucket, reason, raw: site.raw });
}

const counts = out.reduce((a, s) => ((a[s.bucket] = (a[s.bucket] ?? 0) + 1), a), {});
console.log('sites:', out.length, 'proposed buckets:', JSON.stringify(counts));
console.log('sum check:', Object.values(counts).reduce((a, b) => a + b, 0) === out.length);
if (outPath) {
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('wrote', outPath);
}
