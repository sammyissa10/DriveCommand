/**
 * quick-562 — the `(driver-fullscreen)` shell, and the rule it exists to hold.
 *
 * WHAT THIS PROTECTS. Two things, and they are not the same thing:
 *
 *   1. THE STRING. `flex min-h-dvh flex-col justify-between px-5 py-8` was
 *      pasted at five call sites across three files, with two near-copies in a
 *      fourth, and appeared nowhere else in the app. It now has exactly one
 *      home. A second copy is how this started.
 *
 *   2. THE RULE, which is the part that shipped a bug. Transient feedback
 *      renders in the same region as the control that caused it. Both shells
 *      take `feedback` and render it as the first child of the ACTION region,
 *      so a screen cannot put its error banner a viewport away from the button
 *      without leaving the shell — which is what `InspectionClient`'s
 *      `OutcomeScreen` had done, and what `InspectionRunner` had done twice.
 *
 * WHY A SOURCE SCAN. Rendering these screens needs a driver session, a trip
 * row, a `PlaybookInstance` and seven server actions; there is no harness for
 * that here (quick-549's point about narrow scans and row assertions catching
 * different classes — this is the scan half). The measurements that justified
 * the change were taken in a real Chromium at 390x844 and are recorded in
 * the quick-562 summary under `.planning/quick/`; this file stops the source drifting
 * back underneath them.
 *
 * HOW IT FAILS IF THE WORK IS UNDONE:
 *   - Paste the layout string into a screen again  → 'lives in exactly one file'.
 *   - Move a banner out of `feedback` into the top block → the per-file
 *     'renders its error through the shell' case names the file.
 *   - Reorder the shell so feedback follows the actions → 'feedback is rendered
 *     above the actions'.
 *   - Delete the screens to make the counts pass → the reachability case fails.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const APP = path.join(process.cwd(), 'src', 'app');
const GROUP = path.join(APP, '(driver-fullscreen)');

/**
 * quick-546's lesson: normalise line endings.
 *
 * This repo has no `.gitattributes` and `core.autocrlf=true`, so the index is
 * LF and the working tree is CRLF. A scan written against `\n` finds nothing on
 * a Windows checkout and passes vacuously. The length floor is the other half —
 * the failure mode of a bad read is green, not red.
 */
function readModule(file: string, minLength = 1): string {
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  expect(raw.length, `${path.basename(file)} read back empty or truncated`).toBeGreaterThanOrEqual(
    minLength
  );
  return raw;
}

/**
 * The floor for the files this test makes claims ABOUT, as opposed to the ones
 * it merely sweeps. A one-line re-export `page.tsx` elsewhere in the app is 293
 * bytes and perfectly healthy; the shell and the four screens are not.
 */
const NAMED_FILE_FLOOR = 400;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const SHELL = path.join(GROUP, 'TakeoverScreen.tsx');

/** The statement layout, and the runner near-copy it drifted into. */
const STATEMENT_LAYOUT = 'flex min-h-dvh flex-col justify-between px-5 py-8';
const RUNNER_LAYOUT = 'flex min-h-dvh flex-col"';

/** The screens that carry transient error state, and the region it must reach. */
const SCREENS_WITH_FEEDBACK = [
  {
    label: 'InspectionClient — BeginScreen and OutcomeScreen',
    file: path.join(GROUP, 'inspection', '[dispatchId]', 'InspectionClient.tsx'),
    /** Two independent `error` states on this file; both go through the shell. */
    feedbackCount: 2,
  },
  {
    label: 'InspectionRunner — the walkaround and the signature screen',
    file: path.join(GROUP, 'inspection', '[dispatchId]', 'InspectionRunner.tsx'),
    feedbackCount: 2,
  },
];

describe('(driver-fullscreen) — one shell', () => {
  it('the layout string lives in exactly one file, and it is the shell', () => {
    const files = walk(APP);
    expect(files.length, 'no app files scanned — the walk found nothing').toBeGreaterThan(50);

    const statementHits = files.filter((f) => readModule(f).includes(STATEMENT_LAYOUT));
    const runnerHits = files.filter((f) => readModule(f).includes(RUNNER_LAYOUT));

    expect(statementHits.map((f) => path.relative(APP, f))).toEqual([
      path.relative(APP, SHELL),
    ]);
    expect(runnerHits.map((f) => path.relative(APP, f))).toEqual([path.relative(APP, SHELL)]);
  });

  it('feedback is rendered above the actions in both shells', () => {
    const src = readModule(SHELL, NAMED_FILE_FLOOR);

    // `TakeoverScreen` and `TakeoverRunner` each render `{feedback}` then
    // `{actions}`. Order in the source is order in the DOM here — both are
    // plain children of one flex/stack container with no reordering.
    for (const component of ['TakeoverScreen', 'TakeoverRunner']) {
      const start = src.indexOf(`export function ${component}(`);
      expect(start, `${component} not found in the shell`).toBeGreaterThan(-1);
      const end = src.indexOf('\n}\n', start);
      expect(end, `${component} body not delimited`).toBeGreaterThan(start);
      const body = src.slice(start, end);

      const feedbackAt = body.indexOf('{feedback}');
      const actionsAt = body.indexOf('{actions}');
      expect(feedbackAt, `${component} does not render {feedback}`).toBeGreaterThan(-1);
      expect(actionsAt, `${component} does not render {actions}`).toBeGreaterThan(-1);
      expect(
        feedbackAt,
        `${component} renders {feedback} after {actions} — a banner below the button it belongs to`
      ).toBeLessThan(actionsAt);
    }
  });

  it.each(SCREENS_WITH_FEEDBACK)(
    'renders its error through the shell — $label',
    ({ file, feedbackCount }) => {
      const src = readModule(file, NAMED_FILE_FLOOR);

      // Every `error` state on these files reaches the screen as the shell's
      // `feedback`, not as a banner the file positions itself.
      const feedbackProps = src.match(/feedback=\{error/g) ?? [];
      expect(feedbackProps.length).toBe(feedbackCount);

      // And the banner markup itself is the shell's, not a fourth copy.
      expect(src).toContain('TakeoverAlert');
      expect(
        src,
        'a hand-rolled red banner is back — use TakeoverAlert'
      ).not.toContain('rounded-2xl bg-red-50 p-4');
    }
  );

  it('the shell is actually reached — the screens still exist and still guard', () => {
    // The counter-assertion. Every check above is satisfied by deleting the
    // screens; this one is not. It also pins the auth guard the route-guard
    // suite depends on, so a refactor cannot quietly drop it while making the
    // layout assertions greener.
    const pages = [
      path.join(GROUP, 'inspection', '[dispatchId]', 'page.tsx'),
      path.join(GROUP, 'inspection', '[dispatchId]', 'blocked', 'page.tsx'),
    ];
    for (const p of pages) {
      const src = readModule(p, NAMED_FILE_FLOOR);
      expect(src, `${path.basename(p)} lost its guard`).toContain('resolveInspectionAccess');
      expect(src, `${path.basename(p)} is not on the shell`).toContain('TakeoverScreen');
    }

    const client = readModule(
      path.join(GROUP, 'inspection', '[dispatchId]', 'InspectionClient.tsx'),
      NAMED_FILE_FLOOR
    );
    expect(client).toContain('Start the walkaround');
    expect(client).toContain('Start trip');

    const runner = readModule(
      path.join(GROUP, 'inspection', '[dispatchId]', 'InspectionRunner.tsx'),
      NAMED_FILE_FLOOR
    );
    expect(runner).toContain('Review &amp; sign');
    expect(runner).toContain('Sign and submit');
  });

  it('no touch target in the group falls below 44px', () => {
    // quick-561: 56px is tapped outdoors with a glove on and is already above
    // the design system's 48pt floor. Shrinking a control to make a screen
    // quieter is the wrong axis, and a shell refactor is exactly when it would
    // happen by accident.
    //
    // 44px is legitimate and deliberately allowed: `Save & exit` and `Back to
    // the checklist` are secondary header controls at the iOS floor, and they
    // predate this task. The line is BELOW 44, not below 56 — a rule that
    // failed on the existing 44s would be a red test everyone learns to ignore.
    const found: string[] = [];
    for (const file of walk(GROUP)) {
      const src = readModule(file, NAMED_FILE_FLOOR);
      for (const m of src.matchAll(/min-h-\[(\d+)px\]/g)) {
        const px = Number(m[1]);
        if (px < 44) found.push(`${path.basename(file)}: min-h-[${px}px]`);
      }
    }
    expect(found).toEqual([]);

    // …and the primary actions are still 56, which is the number the constraint
    // names. An empty `found` is also what deleting every button looks like.
    const runner = readModule(
      path.join(GROUP, 'inspection', '[dispatchId]', 'InspectionRunner.tsx'),
      NAMED_FILE_FLOOR
    );
    expect((runner.match(/min-h-\[56px\]/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});
