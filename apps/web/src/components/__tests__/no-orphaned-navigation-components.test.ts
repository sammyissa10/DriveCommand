/**
 * Guard: no orphaned navigation components.
 *
 * quick-551 added a "Live Board" sidebar entry, and Phase 11 added a "Today's Trips"
 * entry, to `src/components/navigation/sidebar.tsx` — a 670-line component exporting
 * `AppSidebar` that NOTHING imported. Both shipped green, both reported as "wired",
 * and neither ever rendered. The real sidebar is `src/components/Sidebar/index.tsx`.
 *
 * A dead navigation component is uniquely dangerous because editing it looks exactly
 * like doing the work: the file compiles, the entry reads correctly, tsc is clean, and
 * the only signal that anything is wrong is the absence of a link on a screen nobody
 * re-opened. This test makes that absence mechanical.
 *
 * There is deliberately NO allowlist. An exemption list quietly grows, and this guard
 * is worthless the moment it has one. If a component here has no importer, either wire
 * it or delete it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '..', '..', '..'); // apps/web
const SRC_DIR = path.join(WEB_ROOT, 'src');

const NAV_DIRS = [
  path.join(SRC_DIR, 'components', 'navigation'),
  path.join(SRC_DIR, 'components', 'Sidebar'),
];

/** Read a source file with line endings normalised (repo is core.autocrlf=true). */
function readSource(file: string): string {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Basename with the extension stripped: `sidebar.tsx` -> `sidebar`. */
function moduleBasename(file: string): string {
  return path.basename(file).replace(/\.tsx?$/, '');
}

describe('no orphaned navigation components', () => {
  const candidates = NAV_DIRS.flatMap((dir) => walk(dir)).filter(
    (file) => !/^index\.tsx?$/.test(path.basename(file))
  );
  const allSources = walk(SRC_DIR);

  it('scanned a plausible number of files (integrity floor)', () => {
    // A bad glob that finds nothing would otherwise make every assertion below
    // pass vacuously. This repo has been bitten by exactly that.
    expect(candidates.length).toBeGreaterThanOrEqual(10);
    expect(allSources.length).toBeGreaterThanOrEqual(50);
  });

  it('every component under navigation/ and Sidebar/ is imported by something', () => {
    const sourceTexts = new Map<string, string>();
    for (const file of allSources) sourceTexts.set(file, readSource(file));

    const orphans: string[] = [];

    for (const candidate of candidates) {
      const base = escapeRegex(moduleBasename(candidate));
      // The specifier must END in the basename, anchored on the closing quote.
      // A bare substring match is NOT sufficient: `sidebar` also occurs inside
      // `sidebar.config`, which is how the dead `sidebar.tsx` looked imported.
      const importPattern = new RegExp(
        `from\\s*\\(?\\s*['"](?:[^'"]*\\/)?${base}['"]`
      );

      const importedBy = allSources.filter((file) => {
        if (file === candidate) return false;
        return importPattern.test(sourceTexts.get(file) ?? '');
      });

      if (importedBy.length === 0) {
        orphans.push(path.relative(WEB_ROOT, candidate).replace(/\\/g, '/'));
      }
    }

    expect(
      orphans,
      orphans.length === 0
        ? ''
        : [
            'Orphaned navigation component(s) found — nothing in src/ imports these:',
            ...orphans.map((o) => `  - ${o}`),
            '',
            'An orphaned navigation component is how quick-551 and Phase 11 both shipped',
            'a nav entry that never rendered: the edit compiles, tsc is clean, and the only',
            'signal is a missing link nobody looked for. Wire it or delete it.',
            'Do not add an allowlist — this guard is worthless the moment it has one.',
          ].join('\n')
    ).toEqual([]);
  });
});
