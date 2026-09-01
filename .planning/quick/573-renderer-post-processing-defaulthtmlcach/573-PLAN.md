# Quick Task 573 — Renderer Post-Processing + defaultHtmlCache Refresh Tooling

**Date:** 2026-09-01
**Follows:** quick-572, which built `_system` but left `Button`/`DetailRows` unreachable from the
dispatcher path.

## Why

Two blockers for the remaining email work:

1. Dispatcher bodies arrive as cached Tiptap HTML with a bare `<a>`, so every CTA renders as an
   underlined text link no matter how good the button component is.
2. `defaultHtmlCache` is a derived column with no reconciliation tool, and it has drifted from its
   source before (`driver.invited`).

## Tasks

1. **`body-html-transform.ts`** — exactly three transforms, each recording a note: CTA upgrade,
   banner de-duplication, greeting normalisation. Pure, never throws. Decide parser-vs-regex on
   evidence about the PRODUCTION dependency tree, not on what resolves locally.

2. **Wire into `template-renderer.ts`** after substitution, log notes at debug. Update
   `StatusBar.tsx` with a dark attention tone via the existing `.dc-dark-*` mechanism, tokens only.

3. **`refresh-template-cache.ts`** — regenerate `defaultHtmlCache` from `defaultBlockJson`; dry-run
   by default, `--write` to persist, `--trigger=` to scope, unified diff of the first three. Run
   `--dry-run` against production and report. Never `--write` in this plan.

## Verification

- Each transform: fires / does-NOT-fire-on-near-miss / leaves unrelated HTML byte-identical.
- Anti-vacuity probe: gut each transform, confirm ITS tests fail, restore.
- The near-misses must be real strings this code will meet (facility names, `defectItems`,
  last-name-first driver data), not invented ones.
- The production dry-run is evidence, not decoration — if a transform fires on zero rows, find out
  why before assuming it is correct.
- `tsc --noEmit` with an injected type-error probe; full Vitest suite against a published baseline.
- Read the rendered output of real templates the transform fires on, especially security emails.

## Risk called out up front

Transform 3 rewrites human copy. If it cannot be made safe against false positives, ship 1 and 2
only and say so.
