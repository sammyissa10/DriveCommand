/**
 * Repo-wide guard: no source file may contain a raw control character.
 *
 * ===========================================================================
 * WHY THIS EXISTS
 * ===========================================================================
 * quick-573 lost four rounds of debugging to a literal BACKSPACE byte (0x08)
 * sitting where a regex word-boundary escape belonged. The line looked correct
 * and was a pattern that could never match. It was invisible to `grep`,
 * invisible when reading the file, and it defeated repeated string-replacement
 * because the search text never matched. Only `JSON.stringify` plus a hexdump
 * found it. A whole transform was dead in production because of one byte.
 *
 * THE MECHANISM, worth stating because it will happen again: in a JavaScript
 * STRING literal, backslash-b is the backspace character; only inside a REGEX
 * is it a word boundary. Any codemod that builds replacement source through a
 * quoted string containing backslash-b will silently emit 0x08. That is exactly
 * how the original bug was introduced — and it recurred twice while this very
 * file was being written.
 *
 * ===========================================================================
 * WHY A TEST AND NOT AN ESLINT RULE
 * ===========================================================================
 * `apps/web` has NO working lint entry point — `next lint` no longer accepts
 * `--dir` on this Next version and ESLint 9 finds no `eslint.config.js` (the
 * repo still has `.eslintrc.*`). Established in quick-562, still true. A rule
 * added to a linter nobody can run is a rule that does not run, so the guard
 * lives where the gate actually executes: Vitest.
 *
 * ===========================================================================
 * TWO THINGS THIS FILE MUST HAVE, per quick-546
 * ===========================================================================
 * A source-scanning guard fails GREEN when its scan is broken, so it needs both:
 *   1. a FLOOR on how many files it examined — a scan that finds nothing because
 *      it walked the wrong directory must fail, not pass;
 *   2. a positive self-test proving the detector actually detects.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

/**
 * Tab (0x09), LF (0x0a) and CR (0x0d) are legitimate. Everything else in the
 * C0 range, plus DEL (0x7f), is not.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

const ROOT = join(__dirname, '../..');
const SCAN_DIRS = ['src', 'scripts', 'prisma'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'generated', // Prisma client — machine-generated, not ours to police.
  'dist',
  '.turbo',
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (EXTENSIONS.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

describe('no control characters in source', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it('actually found files to scan', () => {
    // The floor. A broken walk returns [] and every assertion below would pass
    // vacuously — exactly the failure mode this guard exists to catch.
    expect(files.length).toBeGreaterThan(500);
  });

  it('detects a control character when one is present', () => {
    // Positive self-test: without it, a broken FORBIDDEN regex is invisible.
    //
    // Both operands are built with String.fromCharCode rather than written as
    // escapes, because this file sits inside its own scan and the escape/byte
    // ambiguity described in the header is the whole hazard.
    const backspace = String.fromCharCode(0x08);
    const backslash = String.fromCharCode(0x5c);

    // A raw 0x08 where a word boundary was intended — the real bug.
    expect(FORBIDDEN.test(`const x = /<p${backspace}/i;`)).toBe(true);

    // The correct two-character sequence: backslash followed by 'b'.
    expect(FORBIDDEN.test(`const x = /<p${backslash}b/i;`)).toBe(false);
  });

  it('finds no control characters in any scanned file', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (!FORBIDDEN.test(content)) continue;

      // Report the location precisely — the whole point is that these are
      // invisible, so "file X is bad" is not actionable on its own.
      const lines = content.split(/\r?\n/);
      lines.forEach((line, i) => {
        const match = line.match(FORBIDDEN);
        if (match) {
          const code = match[0].charCodeAt(0).toString(16).padStart(2, '0');
          offenders.push(
            `${file.replace(ROOT, '')}:${i + 1} — 0x${code} at column ${(match.index ?? 0) + 1}`,
          );
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
