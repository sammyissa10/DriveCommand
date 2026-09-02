---
phase: quick-579
plan: 579
subsystem: email design system (src/emails/_system, src/emails/carrier)
tags: [email, react-email, design-system, statgrid, carrier-templates]
dependency-graph:
  requires: [quick-578]
  provides: [StatGrid component, hex-literal-free src/emails/carrier, Button bottom margin]
  affects: [src/emails/_system, src/emails/carrier, src/emails/workflow-safety-digest.tsx, scripts/email-render-qa.ts]
tech-stack:
  added: []
  patterns: [table-based stat summary reusing Shell's existing .dc-dark-* classes]
key-files:
  created:
    - apps/web/src/emails/_system/StatGrid.tsx
  modified:
    - apps/web/src/emails/_system/tokens.ts
    - apps/web/src/emails/_system/index.ts
    - apps/web/src/emails/_system/Button.tsx
    - apps/web/src/emails/workflow-safety-digest.tsx
    - apps/web/src/emails/carrier/load-delivered.tsx
    - apps/web/src/emails/carrier/stop-completed.tsx
    - apps/web/src/emails/carrier/client-shipment-update.tsx
    - apps/web/src/emails/carrier/pay-record-ready.tsx
    - apps/web/src/emails/carrier/invoice-generated.tsx
    - apps/web/src/emails/carrier/client-invoice-ready.tsx
    - apps/web/src/emails/carrier/compliance-alert.tsx
    - apps/web/src/emails/carrier/dispatch-assigned.tsx
    - apps/web/scripts/email-render-qa.ts
decisions:
  - "dispatch-assigned skips StatGrid — its unit test pins the literal string `Total Stops:</strong>\\s*2`"
  - "No DetailRows introduced anywhere in the 8 carrier files (G12 conservative reading)"
  - "Button.tsx line 141 (buildButtonBlockHtml string builder) left untouched; only line ~153 (React <Button>) got the bottom margin"
metrics:
  duration: "~1h"
  completed: 2026-09-02
---

# Phase quick Plan 579: StatGrid + Button margin + carrier template convergence Summary

One-liner: Added a table-based `StatGrid` component reusing Shell's existing dark-mode classes, gave the React `<Button>` a 24px bottom margin while leaving the byte-identity-gated string builder untouched, restored workflow-safety-digest's stat grid, and migrated all 8 `src/emails/carrier/` templates onto the `_system` Shell — taking carrier hex literals from 113 to 0.

Commits (in order):
- `c8c13b01` feat(quick-579): StatGrid component + Button bottom margin
- `dc1da323` fix(quick-579): restore workflow-safety-digest stat grid via StatGrid
- `7d2046c9` refactor(quick-579): migrate load/stop carrier templates onto _system Shell
- `69d788fd` refactor(quick-579): migrate invoice/pay carrier templates onto _system Shell
- `0756f5c3` refactor(quick-579): migrate compliance-alert and dispatch-assigned onto _system Shell
- (this commit) test(quick-579): extend email QA harness to 28 templates; docs + summary

---

## 1. StatGrid.tsx source, and the token additions

`apps/web/src/emails/_system/StatGrid.tsx` (full source):

```tsx
/**
 * StatGrid — a compact row of 2-4 numeric summaries (e.g. "3 overdue steps").
 *
 * TABLE, NOT FLEX OR GRID — same reason as DetailRows (see its header):
 * Outlook Windows renders through the Word engine, which supports neither.
 * Each per-stat cell is itself a NESTED presentation table with the value
 * stacked above the label, because Word only reliably stacks content inside
 * nested tables — two sibling `<div>`s inside a `<td>` do not reflow the same
 * way there.
 *
 * `fontVariantNumeric: 'tabular-nums'` is a known CSSProperties key (unlike
 * the `mso-hide` case tokens.ts warns about) and stops digit widths jittering
 * between different counts sharing the same column.
 *
 * DARK MODE REUSES EXISTING CLASSES ONLY. Every `.dc-dark-*` rule is defined
 * once, in Shell.tsx's private `CSS` block, which this component does not
 * (and must not) touch. `.dc-dark-label` already means "a label that carries
 * a border" — exactly what a per-stat cell's divider is — so the outer `<td>`
 * uses it for the border colour, and the inner label cell reuses it a second
 * time for its text colour. The outer cell's `!important` colour does not
 * leak onto the value: the inner value/label cells carry their own inline
 * `color`, and an inline declaration on a descendant always wins over an
 * ancestor's `!important`, regardless of specificity.
 */

import * as React from 'react';
import { colors, styles } from './tokens';

export type Stat = { value: string; label: string };
export type StatGridProps = { stats: Stat[] };

export const StatGrid: React.FC<StatGridProps> = ({ stats }) => {
  if (stats.length === 0) return null;

  const perRow = Math.min(stats.length, 4);
  const cellWidth = `${100 / perRow}%`;

  const rows: Stat[][] = [];
  for (let i = 0; i < stats.length; i += perRow) {
    rows.push(stats.slice(i, i + perRow));
  }

  return (
    <table role="presentation" border={0} cellPadding="0" cellSpacing="0" width="100%" style={styles.statTable}>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((stat, colIndex) => {
              const isFirstInRow = colIndex % perRow === 0;
              const borderLeft = isFirstInRow ? undefined : `1px solid ${colors.border}`;
              return (
                <td key={colIndex} className="dc-dark-label" width={cellWidth} style={{ width: cellWidth, borderLeft, verticalAlign: 'top' }}>
                  <table role="presentation" border={0} cellPadding="0" cellSpacing="0" width="100%" style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr><td className="dc-dark-text" style={styles.statValue}>{stat.value}</td></tr>
                      <tr><td className="dc-dark-label" style={styles.statLabel}>{stat.label}</td></tr>
                    </tbody>
                  </table>
                </td>
              );
            })}
            {row.length < perRow &&
              Array.from({ length: perRow - row.length }).map((_, padIndex) => (
                <td key={`pad-${padIndex}`} width={cellWidth} style={{ width: cellWidth }} />
              ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default StatGrid;
```

**Token additions, with justification for each** (in `tokens.ts`):

| Token | Value | Justification |
|---|---|---|
| `fontSizes.stat` | `28px` | Restores the 28px centred numerals workflow-safety-digest had before quick-578 flattened its `<ul>` — recorded in quick-578's own summary. |
| `fontSizes.micro` | `11px` | Deliberately below `fine` (12px) — the StatGrid label is uppercase and letter-spaced, same treatment `styles.detailLabel` already gives a label; no existing size fit. |
| `lineHeights.stat` | `34px` | Paired line-height for the 28px numeral. |
| `lineHeights.micro` | `16px` | Paired line-height for the 11px label. |

Plus three pre-built `styles` objects (`statTable`, `statValue`, `statLabel`) placed between the detail-rows and button sections, following the file's existing convention of pre-built style objects rather than inline literals.

**`_system/` hex count is still 0** (per the plan's own verification command, which filters to `.tsx` — `tokens.ts` is the one `.ts` file exempted as the canonical hex source):
```
grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails/_system/ --include=*.tsx | wc -l   → 0
```
Running the same command **without** the `.tsx` filter (as Task 6 step 5's literal recipe does) returns `23` — every one of them a pre-existing `tokens.ts` colour definition (the design system's canonical hex source), none newly added, none in a `.tsx` component. Both readings are reported for completeness.

**StatGrid's dark-mode class mapping** (Shell.tsx was NOT touched):

| Element | class | reused for |
|---|---|---|
| outer per-stat `<td>` (carries the divider) | `dc-dark-label` | `darkColors.border` on the divider |
| inner value cell | `dc-dark-text` | `darkColors.textPrimary` |
| inner label cell | `dc-dark-label` | `darkColors.textSecondary` |

`grep -c "dc-dark-" StatGrid.tsx` → 5 (≥ 3 required). `grep -c "flex\|display: *'grid'"` → 0. No new dark class was needed; `Shell.tsx` was not edited.

---

## 2. The Button.tsx diff

```diff
 export const Button: React.FC<ButtonProps> = ({ href, label }) => (
-  <div style={{ margin: `${space[6]} 0 0 0` }}>
+  // The string builder above deliberately keeps `0` bottom: its output is the
+  // dispatcher's CTA, always the last block in a Tiptap body, and
+  // `body-html-transform.ts` is byte-identity-gated. This React Button is
+  // followed by prose in 8+ templates, which is what the bottom margin is for.
+  <div style={{ margin: `${space[6]} 0 ${space[6]} 0` }}>
     <div dangerouslySetInnerHTML={{ __html: buildButtonHtml(href, label) }} />
     <p className="dc-dark-muted" style={styles.buttonUrlNote}>
       {href}
```

Line 141 — `` `<div style="margin:${space[6]} 0 0 0">` `` inside `buildButtonBlockHtml` — **confirmed unchanged**:
```
grep -n "margin:\${space\[6\]} 0 0 0" src/emails/_system/Button.tsx
141:    `<div style="margin:${space[6]} 0 0 0">`,
```

**Dispatcher byte-identity proof.** Rendered `DynamicTemplateEmail` through `@react-email/render` directly (no HTTP server), passed through `transformBodyHtml` exactly as the dispatcher does, once with Button.tsx stashed back to its pre-change state ("before") and once with the change applied ("after"):

```
diff before.html after.html   → (empty — BYTE-IDENTICAL, gate passed)
md5sum before.html after.html:
39ff4566ab932a1dda525a8785acd55a  before.html
39ff4566ab932a1dda525a8785acd55a  after.html
```

Identical md5. `body-html-transform.ts` was not edited, and its output is unchanged.

**The intentional asymmetry, stated explicitly:** the React `<Button>` now has a 24px top **and** bottom margin; the string builder's CTA block keeps `0` bottom. This is correct, not a bug: the dispatcher's CTA (built by `buildButtonBlockHtml`) is always the last block in a Tiptap body, so nothing follows it, while the React `<Button>` is followed by prose in all 8+ templates that use it — the bottom margin is what gives that prose room to breathe.

---

## 3. workflow-safety-digest before/after

Screenshots opened and compared (`.email-qa/templates/workflow-safety-digest.png`, both states rendered via the harness before and after the edit).

**Before:** a plain bulleted `<ul>` — "**2** overdue steps / **9** completed today / **14** active checklists" as three list items.

**After:** three large navy numerals (2, 9, 14) in one row via `StatGrid`, each with an uppercase grey label beneath ("OVERDUE STEPS" / "COMPLETED TODAY" / "ACTIVE CHECKLISTS"), thin vertical rules between the columns, digits not clipped, tabular alignment intact. The orange "2 overdue steps" `StatusBar` still fires beneath the header exactly as before.

Prop signature, exported function name, `previewText`/`statusBar` derivation logic, the conditional "past due" paragraph, the `<Button>`, and the closing "You are receiving this…" paragraph are all byte-for-byte unchanged — only the `<ul>` → `<StatGrid>` swap and the import line changed (`git diff` confirms this: 8 insertions, 12 deletions, entirely inside those two spots).

---

## 4. The 8 migrated carrier templates

| File | Exported name unchanged | Props unchanged | `const styles` removed | Preheader | `_system` components used |
|---|---|---|---|---|---|
| load-delivered.tsx | Yes | Yes | Yes | `Load ${loadNumber} delivered to ${destinationStop} — ${deliveredAt}` | Shell, Button |
| stop-completed.tsx | Yes | Yes | Yes | `${driverName} completed the ${stopTypeLabel.toLowerCase()} at ${facilityName} — dispatch ${dispatchNumber}` | Shell, Button |
| client-shipment-update.tsx | Yes | Yes | Yes | `Load ${loadNumber} ${isPickup ? 'picked up from' : 'delivered to'} ${facilityName} at ${timestamp}` | Shell, Button, StatusBar (`info`/`success`) |
| pay-record-ready.tsx | Yes | Yes | Yes | `${driverName}'s pay for ${payPeriod} — ${formattedAmount} awaiting approval` | Shell, Button |
| invoice-generated.tsx | Yes | Yes | Yes | `Invoice ready for load ${loadNumber} — ${formattedTotal} from ${contractName}, due ${dueDate}` | Shell, Button |
| client-invoice-ready.tsx | Yes | Yes | Yes | `Your invoice for load ${loadNumber} — ${formattedTotal} payable by ${dueDate}` | Shell, Button |
| compliance-alert.tsx | Yes | Yes | Yes | `${alerts.length} compliance item(s) at ${companyName} — ${criticalAlerts.length} critical` | Shell, Button, StatGrid, StatusBar (`attention`) |
| dispatch-assigned.tsx | Yes | Yes | Yes | `Dispatch ${dispatchNumber} — ${stopCount} stop(s), truck ${truckUnitNumber}, departing ${scheduledDeparture}` | Shell, Button (StatGrid deliberately NOT used — see below) |

All 8: no `<Html>`, no `@react-email/components` import, no `async`/`await` keyword usage, `companyName` still rendered in the body prose of every one. All optional-URL guards (`clientPortalUrl`, `portalUrl` ×2, `paymentInstructions`) preserved, including their exact `&& (` structural form so the pre/post guard counts match per file. All four `Intl.NumberFormat` currency derivations (`pay-record-ready`, `invoice-generated`, `client-invoice-ready` ×1 each) kept exactly as written. All 4 exported interfaces on `compliance-alert.tsx`/`dispatch-assigned.tsx` (`ComplianceAlertItem`, `ComplianceAlertEmailProps`, `DispatchStopLine`, `DispatchAssignedEmailProps`) diff line-number-only against the pre-edit capture. `stopTypeLabel` helper in `dispatch-assigned.tsx` kept, same name, same body. `alert.link`/`alert.type` remain unrendered (0 matches in JSX) — no new data surfaced.

**`dispatch-assigned.tsx` StatGrid decision, stated explicitly:** the unit test at `src/lib/carrier/__tests__/dispatch-assigned-email.test.ts:70` asserts `expect(html).toMatch(/Total Stops:<\/strong>\s*2/)` — a literal string a StatGrid's value-over-label layout cannot produce (there is no "Total Stops:" label text at all in that layout; the value renders above a short "STOPS" caption instead). Per the plan's own fallback instruction, the test wins: `dispatch-assigned.tsx` keeps all four original detail lines (`Dispatch Number`, `Scheduled Departure`, `Total Stops`, `Truck Unit`) as plain `<p><strong>…</strong></p>` prose, and StatGrid was not introduced there. The suite was run immediately after the edit and is green (4/4 tests, `src/lib/carrier/__tests__/dispatch-assigned-email.test.ts`).

---

## 5. Preheader distinctness — machine-checked

**Correction to the plan's predicted count:** the plan's G9/non-negotiable-7 assumed the pre-existing harness had 21 entries and would reach 29 after adding 8. The actual pre-existing count (verified against the committed quick-578 state) was **20**, so the true total after adding 8 is **28**, not 29. This mirrors the plan's own G11 (the 4+3+2=9 commit-grouping miscount) — another off-by-one in the plan's arithmetic, reported rather than silently worked around.

Harness output (`npx tsx scripts/email-render-qa.ts`), all 28 preheaders:

```
welcome-owner -> "Welcome to DriveCommand, Maria — your 14-day trial runs until March 15, 2027"
activation-celebration -> "Rodriguez Logistics just finished onboarding — full reporting and the profit predictor are unlocked"
no-progress-nudge -> "Hey Carlos — pick up DriveCommand where you left off, it takes 2 minutes"
add-driver-nudge -> "Nice work, Denise — invite a driver to unlock assignments, HOS and the live map"
dispatch-load-nudge -> "Tyrell, create your first load to unlock revenue tracking and profit per lane"
trial-ending-soon -> "Your trial ends in 3 days — keep your fleet running"
confirm-email -> "Confirm your email, Jordan — this link is valid for 24 hours"
driver-invitation -> "Lonestar Freight Co invited you to join their fleet on DriveCommand"
owner-invitation -> "Kim Family Trucking is ready — set up your DriveCommand owner account"
account-exists -> "Someone tried to sign up for DriveCommand with your email address"
driver-document-expiry-reminder -> "Miguel Torres&#x27;s Driver License — expires in 5 days"
fleet-message-notification -> "New message from Miguel Torres (Driver) — Chicago → Indianapolis"
geofence-arrival-alert -> "Truck arrived at delivery — Load DC-2026-00512 — 4501 W Diversey Ave, Chicago, IL"
load-status-notification -> "Load DC-2026-00512 update: In transit — Indianapolis, IN"
sysadmin-invoice -> "Invoice INV-2027-0142 for Kim Family Trucking — $294.00 due March 15, 2027"
support-ticket-created -> "Ticket TCK-4821 received — High priority"
support-ticket-reply-to-admin -> "Owner reply on ticket TCK-4821 — Unable to upload rate confirmation PDF"
support-ticket-reply-to-owner -> "Support replied on ticket TCK-4821 — Unable to upload rate confirmation PDF"
workflow-instance-blocked -> "Miguel Torres has been blocked from dispatch for over 6 hours"
workflow-safety-digest -> "2 overdue steps — review needed"
load-delivered -> "Load DC-2027-00812 delivered to Dallas DC, Dallas, TX — March 2, 2027, 3:40 PM"
stop-completed -> "Miguel Torres completed the delivery at Dallas DC — dispatch DC-2027-00812"
client-shipment-update -> "Load DC-2027-00812 delivered to Dallas DC at March 2, 2027, 3:40 PM"
pay-record-ready -> "Miguel Torres&#x27;s pay for Feb 23 – Mar 1, 2027 — $1,842.50 awaiting approval"
invoice-generated -> "Invoice ready for load DC-2027-00812 — $3,250.00 from Acme Manufacturing — Lane Contract 4, due March 30, 2027"
client-invoice-ready -> "Your invoice for load DC-2027-00812 — $3,250.00 payable by March 30, 2027"
compliance-alert -> "3 compliance items at Kim Family Trucking — 2 critical"
dispatch-assigned -> "Dispatch DC-2027-00812 — 2 stops, truck T-104, departing March 2, 2027, 6:30 AM CDT"

PASS — all 28 preheaders are distinct
```
Byte size: every one of the 28 renders under the 102 KB Gmail clip limit (largest: `compliance-alert` at 12.8 KB, `sysadmin-invoice` at 12.5 KB, `workflow-safety-digest` at 12.6 KB). Script exit code 0.

---

## 6. Logo confirmation

**Explicit statement:** I opened `.email-qa/templates/load-delivered.png` FIRST — before reviewing any other screenshot — and confirmed the DriveCommand chevron mark renders correctly (an actual white geometric chevron icon inside the navy header band, beside the "DriveCommand" wordmark), not a broken-image placeholder and not an empty band. Only after that confirmation did I review the remaining 9 screenshots.

**All 10 required screenshots opened and reviewed** (all files actually opened via the Read tool, not merely generated):

| Template | Verdict |
|---|---|
| load-delivered | Clean. Header+logo, greeting, message, all 5 detail lines, CTA with visible bottom-margin gap before the closing sentence, footer — all present and correctly styled. |
| stop-completed | Clean. Same structure, "Stop Type: Delivery" and all 5 detail lines render. |
| client-shipment-update | Clean. Green "Delivered" StatusBar renders correctly with the success tint; all detail lines including the conditional Proof-of-Delivery line render. |
| pay-record-ready | Clean. Currency-formatted "$1,842.50" renders on the Net Pay line as intended, no visual regression from dropping `styles.netPayRow`'s emphasis (it now reads as plain prose, same as every other detail line — a legitimate, expected loss of the old bold/larger emphasis, since no style object exists to carry it; the label/value text itself is unchanged). |
| invoice-generated | Clean. "$3,250.00" total renders correctly; CTA guarded by `clientPortalUrl` renders. |
| client-invoice-ready | Clean. Both guards fire (payment instructions `<h2>` + charges line, and the CTA); "$3,250.00" total correct. |
| compliance-alert | Best result of the batch — the 3/2/1 StatGrid renders with visible dividers exactly as designed, orange attention StatusBar fires, Critical/Warnings groups render with correct counts. |
| dispatch-assigned | Clean. "Total Stops: 2" renders as prose (StatGrid deliberately skipped, see §4); itinerary renders in order, Chicago shows its city, Dallas correctly omits its city (`city: null` in the fixture) rather than printing ", null". |
| workflow-safety-digest | Clean — see §3 above for the before/after comparison. |
| add-driver-nudge | **The Button-margin proof.** Compared against the pre-task committed PNG (`git show c8c13b01~1:...add-driver-nudge.png`): BEFORE, the plain-text URL note and "— Sammy" sat almost flush against each other; AFTER, there is a clear, visible vertical gap between them. The margin fix landed as intended. |

Nothing read worse than its pre-migration original. The one item worth flagging honestly: `pay-record-ready`'s Net Pay line and `invoice-generated`/`client-invoice-ready`'s Invoice Total line lost their old slightly-larger/bold visual emphasis (`styles.netPayRow` / `styles.invoiceTotalRow`, both `16px` vs the body's `15px`) because the plan's G12 instruction ("no DetailRows, no reintroduced style object") left no vehicle to carry it — the text is correct and present, just no longer visually distinguished from the surrounding detail lines. See item 8 below.

---

## 7. Hex recount

Path-filtered, exactly as Task 6 step 5 specifies:

| Check | Before (quick-578 baseline) | After |
|---|---|---|
| `grep -roE hex src/emails/carrier/ \| wc -l` | 113 | **0** |
| `grep -rlE hex src/emails/carrier/ \| wc -l` (files) | 8 | **0** |
| `grep -roE hex src/emails/ --include=*.tsx \| grep -v /carrier/ \| wc -l` | 0 | **0** |
| `grep -roE hex src/emails/_system/ \| wc -l` (unfiltered, includes tokens.ts) | n/a | 23 (all pre-existing `tokens.ts` colour definitions — the canonical source, not new) |
| `grep -roE hex src/emails/_system/ --include=*.tsx \| wc -l` (G2's filtered form) | 0 | **0** |

Per-file before (from the plan's G5 table) → after:

| File | hex before | hex after |
|---|---|---|
| load-delivered.tsx | 13 | 0 |
| stop-completed.tsx | 13 | 0 |
| client-shipment-update.tsx | 13 | 0 |
| pay-record-ready.tsx | 14 | 0 |
| invoice-generated.tsx | 14 | 0 |
| client-invoice-ready.tsx | 15 | 0 |
| compliance-alert.tsx | 17 | 0 |
| dispatch-assigned.tsx | 14 | 0 |
| **Total** | **113** | **0** |

**New whole-repo `src/emails/**` hex total (`.tsx` files only): 0.** Every transactional email in the repo now renders through the `_system` Shell with zero brand hex literals outside `tokens.ts`.

---

## 8. Call-site changes needed

**None.** `src/lib/carrier/notifications.ts` (all 8 `React.createElement(Component, {...})` call sites) was not touched and did not need to be — every migrated component's prop signature is unchanged. `src/lib/carrier/dispatch-assigned-email.ts`'s type-only import of `DispatchAssignedEmailProps`/`DispatchStopLine` continues to resolve identically. Confirmed via `git diff --stat` across all 5 feature commits: no file outside `src/emails/**` and `scripts/email-render-qa.ts` was modified.

The one thing genuinely lost without a call-site change was the visual emphasis on `pay-record-ready`'s Net Pay line and the two invoice totals (§6) — `_system` has no "emphasized detail line" component today. **Proposed component, rather than a reintroduced local styles block:** a small `EmphasisRow` (or an `emphasis?: boolean` prop on `DetailRows`) that renders one label/value pair at `body`-size-plus with `fontWeight: 700`, for exactly this "the total of the email" use case. Not built here — G12 forbade introducing DetailRows in this task, and inventing a new component for three lines felt out of scope for a plan whose objective was `StatGrid` + `Button` + a faithful 1:1 port.

---

## 9. Commit-grouping discrepancy (G11)

The brief's arithmetic ("the 4 load and stop templates, the 3 invoice and pay templates, compliance-alert and dispatch-assigned" = 4+3+2 = 9) does not match the actual file count of 8. Used the plan's own corrected split, **3 / 3 / 2**:
- Task 3 (load/stop): `load-delivered`, `stop-completed`, `client-shipment-update`
- Task 4 (invoice/pay): `pay-record-ready`, `invoice-generated`, `client-invoice-ready`
- Task 5: `compliance-alert`, `dispatch-assigned`

No fourth load/stop file was invented. A second, smaller arithmetic slip surfaced independently during execution: the plan predicted a final harness total of 29 (21 existing + 8 new); the actual pre-existing count was 20, so the true final total is 28 (see §5).

---

## 10. The DetailRows reading (G12)

**No `DetailRows` was introduced in any of the 8 carrier files**, per the plan's explicit "Do NOT convert prose to DetailRows" instruction and its stated conservative reading. Every former `detailsBox` label/value line was ported as `<p><strong>Label:</strong> {value}</p>`, styled for free by `.dc-body p` / `.dc-body strong`. This is a defensible target for `DetailRows` (it is literally a label/value list), and if the user meant otherwise, redirecting this in a follow-up task would mean swapping those `<p>` lines for `<DetailRows rows={[...]} />` in each of the 8 files — a small, mechanical follow-up, not a re-architecture.

---

## 11. Verification

**tsc, probed live then clean**, once per task on the file that task actually edited:
- Task 1: probe in `StatGrid.tsx` → reported at `(114,7)` → removed → clean.
- Task 2: probe in `workflow-safety-digest.tsx` → reported at `(62,7)` → removed → clean.
- Task 3: probe in `load-delivered.tsx` → reported at `(44,7)` → removed → clean.
- Task 4: probe in `invoice-generated.tsx` → reported at `(51,7)` → removed → clean.
- Task 5: probe in `compliance-alert.tsx` → reported at `(78,7)` → removed → clean.
- Task 6: probe in `scripts/email-render-qa.ts` → reported at `(762,7)` → removed → clean.

Every probe was confirmed to report *that specific error at that file/line* before being deleted, and every re-run afterward was 0 errors (not blind — no syntax-only or `.next/`-only error set was ever seen). `git status --porcelain | grep -i probe` → empty at every check point, and again at the end.

**`next build`** — exit code 0, full route manifest printed, no "Failed to compile" or `error TS` lines in the output. The pre-existing "package seems invalid" warning (if present) predates this task and is unrelated.

**Full Vitest, same reporter (`npx vitest run`, default reporter) both ends:**

| | Test Files | Tests |
|---|---|---|
| Baseline (pre-task, e2053086) | 1806 total (documented) | 1679 passed / 63 failed / 61 skipped / 3 todo |
| After (this task, full cold run) | 162 total: 17 failed / 137 passed / 8 skipped | 1806 total: 1679 passed / 63 failed / 61 skipped / 3 todo |

**Exact match to the stated baseline — 1806 / 1679 / 63 / 61 / 3.** Zero regressions, zero new failures. The `dispatch-assigned-email.test.ts` suite specifically was also run in isolation immediately after editing `dispatch-assigned.tsx` (§4) and was green (4/4).

**Port 3000** — confirmed free before starting (`Get-NetTCPConnection -LocalPort 3000 -State Listen` returned nothing) and confirmed free again after `next build` completed. No dev server was left running.

**`defaultHtmlCache` refresh script** — NOT run. Confirmed: no reference to it appears in any command executed during this task.

**`git diff --stat e2053086..HEAD`** (all 5 feature commits, excluding `.email-qa`) touches exactly 13 files, all inside the permitted list:
```
apps/web/src/emails/_system/Button.tsx
apps/web/src/emails/_system/StatGrid.tsx        (new)
apps/web/src/emails/_system/index.ts
apps/web/src/emails/_system/tokens.ts
apps/web/src/emails/carrier/client-invoice-ready.tsx
apps/web/src/emails/carrier/client-shipment-update.tsx
apps/web/src/emails/carrier/compliance-alert.tsx
apps/web/src/emails/carrier/dispatch-assigned.tsx
apps/web/src/emails/carrier/invoice-generated.tsx
apps/web/src/emails/carrier/load-delivered.tsx
apps/web/src/emails/carrier/pay-record-ready.tsx
apps/web/src/emails/carrier/stop-completed.tsx
apps/web/src/emails/workflow-safety-digest.tsx
```
No occurrence of `notifications.ts`, `dispatch-assigned-email.ts`, `Shell.tsx`, `Header.tsx`, `Footer.tsx`, `StatusBar.tsx`, `Preheader.tsx`, `dynamic-template.tsx`, `body-html-transform.ts`, `template-renderer.ts`, `dispatcher.ts`, `resend-client.ts`, `sender-config.ts`, `html-to-text.ts`, `prisma/schema.prisma`, or either `vercel.json`.

---

## 12. Not done / deferred

- **`pay-record-ready`/`invoice-generated`/`client-invoice-ready` lost their old visual emphasis** on the Net Pay / Invoice Total line (was `16px`, no longer distinguished from surrounding `15px` body text) — no `_system` component exists for "one emphasized label/value line" today. Proposed component named in §8; not built here.
- **The G12 conservative reading (no DetailRows in the 8 carrier files) is a judgment call**, not a certainty — flagged explicitly in §10 so it can be redirected.
- **The plan's predicted harness total (29) does not match reality (28)** — reported in §5/§9 rather than silently adjusted without comment.
- **`dispatch-assigned.tsx` does not use StatGrid**, despite the plan naming it as one of the two templates that "genuinely warrant" it, because its unit test pins a literal string StatGrid cannot produce. Test wins over presentation, as the plan itself instructed for this exact case.
- Per constraints: **no `git push`** was run (orchestrator's responsibility); this SUMMARY.md and STATE.md update are the final commit for this plan.

## Self-Check: PASSED

All 16 claimed files found on disk; all 5 feature commits (`c8c13b01`, `dc1da323`, `7d2046c9`, `69d788fd`, `0756f5c3`) found in git history.
