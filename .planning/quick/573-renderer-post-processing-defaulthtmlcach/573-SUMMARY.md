# Quick Task 573 — Summary

**Date:** 2026-09-01
**Not touched:** `dispatcher.ts`, `resend-client.ts`, any seed file, `prisma/schema.prisma`, the 29
standalone templates. **`--write` was never run.**

## Delivered

- `src/lib/notifications/body-html-transform.ts` — three transforms, pure, never throws.
- `template-renderer.ts` — transform wired after substitution, notes logged at debug.
- `StatusBar.tsx` + `tokens.ts` (`darkTints`) + `Shell.tsx` — dark attention tone via `.dc-dark-*`.
- `scripts/refresh-template-cache.ts` — dry-run default, `--write`, `--trigger=`, unified diff.
- `__tests__/body-html-transform.test.ts` — 24 tests, all three near-miss guarded.
- Scope extension, stated: `Button.tsx` gained two exports (`buildButtonHtml`,
  `buildButtonBlockHtml`) so the transform emits the SAME bulletproof markup rather than a second
  copy that would drift. `Shell.tsx` gained the dark CSS rule because step 7's own instruction —
  "apply via the existing `.dc-dark-*` mechanism" — puts that mechanism in Shell's `<style>`.

## Regex, not a DOM parser — and this was the deciding evidence

**No HTML parser exists in the PRODUCTION dependency tree.** `parse5` and `jsdom` resolve only as
transitive dependencies of **`vitest`**; `happy-dom` is a devDependency; `zeed-dom` does not resolve
at all. This module runs in the dispatcher's request path, so any of them would have passed every
local test and every CI run, then failed at runtime on Vercel where devDependencies are pruned.
Step 5's stated fallback therefore applies: one anchored pattern per transform, near-miss test each.

## Transform 3 ships. Here is why it is safe, and what it costs

Two guards do the work, and the near-miss tests are real strings this code meets:

- **The remainder must begin with a lowercase letter.** This alone kills every realistic false
  positive, because they all continue with a capital: `Chicago, IL to Dallas`, `Smith, John, trip …`
  (last-name-first data), `Hall Ford, West Bend` (facility names), `Mirrors, Wiper blades`
  (`defectItems`).
- **The name must be two or three capitalised words**, killing `Reminder, your trip departs` and
  `Dispatch, please review`.

The cost, stated rather than hidden: a mononym or a first-name-only `driverName` will not fire. That
is the correct direction to fail.

**Verified by reading real output, not by reasoning.** Three production templates through the full
pipeline, including a security email:

- `user.password_reset` → `Hi Sammy,` / `We received a request to reset your DriveCommand password.`
- `digest.weekly_owner` → `Hi John,` / `Here is your fleet performance for May 8–14, 2026.`
- `customer.delivered_notification` → `Hi Bob Johnson,` / `Your shipment #LD-1042 was …`

All three read correctly. `customer.delivered_notification` ends in prose, and the CTA transform
correctly declined to buttonise it.

## The dry-run caught a bug that all 24 unit tests missed

First production run reported transform 2/3 firing on **zero of 47 rows**. That number was the bug,
not the evidence:

1. **The greeting was anchored to the first ELEMENT, not the first PARAGRAPH.** Every real template
   opens with an `<h2>`, so `^<p>` never matched — dead code in production that passed its own unit
   tests because those fixtures had no heading. A regression test now covers exactly that shape.
2. **The dry-run itself was measuring the wrong thing**: it ran the transforms on raw cached HTML
   still containing `{{driverName}}`, while production runs them AFTER substitution. Fixed to
   substitute each row's `availableVariables[].sampleValue`.

**Root cause of (1) was a literal BACKSPACE byte (0x08) where `\b` belonged** —
`html.search(/<p\b/i)` was actually `/<p<BS>/i`, which can never match, so the function bailed at its
first guard. Invisible to `grep`, invisible when reading the file, and it defeated four rounds of
string-replacement because `.includes('/<p/i')` was false. Only `JSON.stringify` + a hexdump found
it: `2f3c70 08 2f69`. It is now a named constant, `FIRST_PARAGRAPH_PATTERN = /<p(?=[\s>])/i`, and
the file is asserted free of control characters.

**Post-fix dry-run: 13 of 47 rows fire the greeting transform**, zero fire the banner transform.

## Production dry-run report (step 9, `--write` NOT run)

- **Total rows: 47**
- **Rows whose HTML would change: 1** — `driver.invited`, and the diff is cosmetic only: Tiptap now
  emits `<a target rel href>` where the cache has `<a href target rel>`. No text difference.
- **Rows that failed to render: 0**
- **Transform 2 (banner) fires on: 0 rows.** The historical `<h2>DriveCommand</h2>` duplication is
  already gone from production — the cache reads `<h2>Driver invitation</h2>`. Transform 2 is a
  safety net for rows nobody refreshes, not a fix for a live defect.
- **Transform 3 (greeting) fires on 13 rows:** `customer.delivered_notification`,
  `customer.tracking_link_sent`, `digest.compliance_30day`, `digest.daily_driver`,
  `digest.weekly_owner`, `driver.invited`, `manager.invited`, `payroll.processed`, `trip.assigned`,
  `trip.reminder`, `user.password_reset`, `user.role_changed`, `user.welcome`.

## A correction to the brief's framing, worth keeping

**`defaultHtmlCache` holds the BODY HTML only** — the shell is applied at render time, every send.
So a change to `Shell.tsx` does **not** require this script; it reaches every email on the next send
with no cache work. What the script fixes is drift between `defaultBlockJson` (source) and
`defaultHtmlCache` (derived). Recorded in the script header so the next person does not run a write
expecting a shell rollout.

## Two bugs found by looking at the rendered output

1. **Dark-mode button text was unreadable.** Once the CTA transform runs, the button's anchor lives
   inside `.dc-body`, and the dark rule `.dc-body a { color: … !important }` repainted white button
   text to link-blue on a Signal Blue fill. Fixed with a `dc-btn` class and an exemption. Measured
   after: `rgb(255,255,255)` on `rgb(0,102,204)` in BOTH schemes.
2. The preheader had to be derived from the **pre-transform** HTML — the CTA upgrade appends the
   destination URL as visible text, which would otherwise leak into the inbox preview line.

## Verification

- **24 tests, all passing.** Anti-vacuity probe run per transform: gutting `transformCta` fails 3,
  `transformBanner` fails 4, `transformGreeting` fails 4. Restored, probe count 0.
- **tsc clean and PROBED** — injected error reported at `body-html-transform.ts(267,7)`. Note the
  first probe attempt appeared to show a blind gate; the grep was wrong (tsc's message contains no
  variable name), not the gate.
- **Full suite: 1758 total / 1628 passed / 66 failed / 61 pending**, against quick-570's published
  baseline of 1734 / 1604 / 66 / 61. Exactly +24 tests, all mine, all passing; failure count
  unchanged and the same 18-file pre-existing set.
- Rendered screenshots regenerated through the transform, light and dark, images on and blocked.
  9,659 bytes — 90.8% under the Gmail clip limit.

## Known gaps

- **`DetailRows` is still unreachable** from the dispatcher path. The brief's three transforms do not
  include one that converts prose into rows, and inventing a fourth was explicitly out of scope.
  It remains available to callers that compose it.
- The 13 rows the greeting transform fires on were verified by reading three of them. The other ten
  share the same `Hi {{name}}, …` shape but were not individually read.
