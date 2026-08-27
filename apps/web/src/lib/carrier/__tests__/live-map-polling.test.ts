/**
 * quick-559 — guards for the two things this task actually changed.
 *
 * Both are structural and neither is visible to a rendering test, so both are
 * source scans. The failure they exist to catch is silent in every other way:
 * a re-added `const POLL_INTERVAL_MS` compiles, renders, and passes the suite
 * while quietly restoring a third timer, and a page that goes back to
 * `lg:hidden` / `hidden lg:block` looks identical on screen while mounting a
 * whole second lane behind `display: none`.
 *
 * Per quick-546, every source-reading guard here normalises line endings
 * (`core.autocrlf=true`, no `.gitattributes`, so the working tree is CRLF and
 * the index is LF), and carries both a "was it actually read" assertion and a
 * length floor — because the failure mode of a bad read is GREEN, not red.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LIVE_BOARD_POLL_INTERVAL_MS,
  LIVE_MAP_VEHICLES_POLL_INTERVAL_MS,
} from '../live-map-constants';

const WEB_SRC = join(__dirname, '..', '..', '..');

function readSource(relativePath: string): string {
  const src = readFileSync(join(WEB_SRC, relativePath), 'utf8').replace(/\r\n/g, '\n');
  expect(src.length).toBeGreaterThan(500); // the file was really read
  return src;
}

/** The three components that poll the live-map surface. */
const POLLERS = [
  join('components', 'tracking', 'LiveBoard.tsx'),
  join('components', 'maps', 'live-map-wrapper.tsx'),
  join('app', '(owner)', 'live-map', 'LiveMapMobile.tsx'),
];

const PAGE = join('app', '(owner)', 'live-map', 'page.tsx');

describe('live-map poll intervals live in one place', () => {
  it('each constant is defined exactly once, in live-map-constants.ts', () => {
    const constants = readSource(join('lib', 'carrier', 'live-map-constants.ts'));
    for (const name of ['LIVE_BOARD_POLL_INTERVAL_MS', 'LIVE_MAP_VEHICLES_POLL_INTERVAL_MS']) {
      const defs = constants.match(new RegExp(`export const ${name}\\s*=`, 'g')) ?? [];
      expect(defs).toHaveLength(1);
    }
  });

  it('no live-map component declares its own POLL_INTERVAL_MS', () => {
    // There were three of these — one per file, all 15_000 — which is how three
    // timers on one page came to look like a single deliberate rate.
    for (const file of POLLERS) {
      const src = readSource(file);
      expect(src).not.toMatch(/const\s+POLL_INTERVAL_MS\s*=/);
      expect(src).toContain('POLL_INTERVAL_MS'); // …because it imports one
      expect(src).toContain('@/lib/carrier/live-map-constants');
    }
  });

  it('the board does not poll faster than the map', () => {
    // The invariant, not the literal numbers — those are a product call and may
    // be retuned. What must not come back is the INVERSION quick-559 fixed: the
    // largest payload on the fastest timer. `/live-board` is ~18-20 kB against
    // `/vehicles`' ~5 kB, so the board may never tick more often than the map.
    expect(LIVE_BOARD_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(
      LIVE_MAP_VEHICLES_POLL_INTERVAL_MS,
    );
  });

  it('neither interval is fast enough to be an accident', () => {
    // A floor, not an assertion of today's value. Anything under 10s on this
    // surface is a typo or a debugging leftover, not a decision.
    expect(LIVE_BOARD_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(LIVE_MAP_VEHICLES_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe('the live-map page mounts ONE lane', () => {
  it('uses ResponsiveSwitch rather than a CSS dual mount', () => {
    const page = readSource(PAGE);
    expect(page).toContain('ResponsiveSwitch');
    expect(page).toContain('@/components/ui/ResponsiveSwitch');
  });

  it('does not re-introduce the lg:hidden / hidden lg:block pair', () => {
    const page = readSource(PAGE);
    // Comments are allowed to NAME the old pattern — that history is why the
    // fix is there — so strip comment lines before scanning for real usage.
    const code = page
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');

    // The pair is the defect: one lane hidden below lg, the other hidden above.
    const hasMobileOnly = /className="[^"]*\blg:hidden\b/.test(code);
    const hasDesktopOnly = /className="[^"]*\bhidden\s+lg:block\b/.test(code);
    expect(hasMobileOnly && hasDesktopOnly).toBe(false);
  });

  it('still renders both lanes — this guard must not be satisfiable by deletion', () => {
    // A counter-assertion, per quick-549: a scan that only forbids something can
    // be made green by removing the feature. Both lanes must still be here.
    const page = readSource(PAGE);
    expect(page).toContain('LiveMapMobile');
    expect(page).toContain('LiveMapWrapper');
    expect(page).toMatch(/mobile=/);
    expect(page).toMatch(/desktop=/);
  });
});
