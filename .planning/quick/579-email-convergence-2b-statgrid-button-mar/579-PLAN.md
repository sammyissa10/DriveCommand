---
phase: quick-579
plan: 579
type: execute
wave: 1
depends_on: [quick-578]
autonomous: true

files_modified:
  - apps/web/src/emails/_system/StatGrid.tsx          # NEW
  - apps/web/src/emails/_system/index.ts
  - apps/web/src/emails/_system/Button.tsx
  - apps/web/src/emails/_system/tokens.ts
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
  - apps/web/.email-qa/templates/*.png
  - .planning/quick/579-*/579-SUMMARY.md
  - .planning/STATE.md

must_haves:
  truths:
    - "The dispatcher's rendered HTML is byte-identical before and after the Button change (port-normalised)."
    - "All 8 carrier templates render through Shell's children slot with zero <Html> wrappers and zero `const styles` blocks."
    - "`src/emails/carrier/**` hex-literal count falls from 113 to 0."
    - "Every prop each carrier template rendered before migration is still rendered after; no exported name or prop signature changed."
    - "workflow-safety-digest shows its three counts as a StatGrid, with the same data and the same prop signature."
    - "A Button followed by prose has visible vertical separation (proved by screenshot, not by reading the diff)."
    - "All 29 preheaders (21 existing harness entries + 8 new carrier) are machine-verified distinct."
    - "`src/lib/carrier/notifications.ts` and `src/lib/carrier/dispatch-assigned-email.ts` are untouched."
  artifacts:
    - path: "apps/web/src/emails/_system/StatGrid.tsx"
      provides: "Table-based compact numeric summary, 2-4 stats per row, tabular figures, dark mode via existing .dc-dark-* classes"
      contains: "export const StatGrid"
    - path: "apps/web/src/emails/_system/index.ts"
      provides: "StatGrid + StatGridProps + Stat exported from the module's public surface"
      contains: "StatGrid"
    - path: "apps/web/scripts/email-render-qa.ts"
      provides: "29-entry TEMPLATES registry, 29 rendered HTML + PNG, preheader distinctness over all 29"
  key_links:
    - from: "apps/web/src/emails/carrier/*.tsx"
      to: "apps/web/src/emails/_system"
      via: "import { Shell, Button, StatGrid, StatusBar } from '../_system'"
      pattern: "from '\\.\\./_system'"
    - from: "apps/web/src/lib/notifications/body-html-transform.ts"
      to: "apps/web/src/emails/_system/Button.tsx"
      via: "buildButtonBlockHtml — MUST remain byte-identical"
      pattern: "buildButtonBlockHtml"
---

<objective>
Close the second half of the email convergence: build the one missing design-system
component (`StatGrid`), fix the `Button` bottom-margin gap quick-578 surfaced, restore
`workflow-safety-digest`'s stat grid, and migrate the 8 `src/emails/carrier/` templates
onto the `_system` Shell — taking carrier-scoped hex literals from 113 to 0.

Purpose: after this task every transactional email in the repo renders through one shell
with one token file. `src/emails/**` becomes hex-literal-free end to end.

Output: `StatGrid.tsx`, a 1-line `Button.tsx` margin change, 9 migrated templates,
an extended QA harness, 10 reviewed light-mode screenshots, and a summary.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/578-email-convergence-2a-2-shell-children-sl/578-SUMMARY.md

@apps/web/src/emails/_system/tokens.ts
@apps/web/src/emails/_system/Shell.tsx
@apps/web/src/emails/_system/Button.tsx
@apps/web/src/emails/_system/DetailRows.tsx
@apps/web/src/emails/add-driver-nudge.tsx
@apps/web/src/emails/workflow-safety-digest.tsx
@apps/web/scripts/email-render-qa.ts
</context>

---

# GROUND TRUTH — read before starting

Everything below was read off real source during planning. Re-read each file before
editing it, but do not re-derive these facts.

## G1. `Button.tsx` has TWO margin sites and only ONE may change — THE BIGGEST RISK HERE

```
Button.tsx:141   `<div style="margin:${space[6]} 0 0 0">`        <- inside buildButtonBlockHtml (STRING builder)
Button.tsx:149   <div style={{ margin: `${space[6]} 0 0 0` }}>   <- the React <Button> component
```

`buildButtonBlockHtml` is imported by `src/lib/notifications/body-html-transform.ts:36`
and called at `:120`. That is the **dispatcher's Tiptap CTA transform — live production
email**. quick-578 established, and twice proved, that the dispatcher's rendered HTML is
byte-identical across that task. `body-html-transform.ts` is on this task's do-not-touch
list, so its output changing at all is a red flag by definition.

**Change line 149 ONLY. Line 141 must be left exactly as it is.**

Consequence, and it is intentional: the React `<Button>` and the dispatcher's CTA block
will now differ by a 24px bottom margin. That is correct — the dispatcher's CTA is always
the last block in a Tiptap body, so nothing follows it; the React Button is followed by
prose in at least 8 templates. State this divergence in the summary rather than
"harmonising" it by touching line 141.

## G2. Tokens — what exists, what must be added

Already present, no new token needed:
- `colors.border === '#E4E7EC'` — **exactly** the divider colour the brief specifies.
- `colors.navy === '#002654'`, `colors.textSecondary === '#5A6472'`.
- `letterSpacing: '0.4px'` on an uppercase `textSecondary` label already exists as
  `styles.detailLabel`. StatGrid's label copies that idiom; do not invent a second one.

Missing, and this is the sanctioned "only if it does not exist" addition:
- `fontSizes` runs wordmark 18 / h1 22 / h2 18 / body 15 / button 16 / small 13 / fine 12.
  There is **no 11px** and **no large stat size**.

**Add exactly these four, and no others:**

```ts
// in fontSizes
  /** StatGrid value. Large enough to read at arm's length. */
  stat: '28px',
  /** StatGrid label. Smaller than `fine` deliberately — uppercase + letter-spaced. */
  micro: '11px',

// in lineHeights
  stat: '34px',
  micro: '16px',
```

`stat: '28px'` is not invented: quick-578's summary records that the original
workflow-safety-digest grid used 28px centred numbers, which is what task 2 restores.

**`_system/` currently contains ZERO hex literals** (verified: `grep -roE
'#[0-9a-fA-F]{3,8}\b' src/emails/ --include=*.tsx | grep -v /carrier/` returns 0).
StatGrid and the token addition must keep it at zero — that is why the additions are
sizes, never colours.

## G3. `fontVariantNumeric` works inline. Do not "fix" it into a CSS string.

`font-variant-numeric` appears nowhere in the codebase today. React's `CSSProperties`
**does** support `fontVariantNumeric`, so `fontVariantNumeric: 'tabular-nums'` in a style
object renders correctly. The warning in `tokens.ts` on `styles.preheader` — *"`mso-hide:all`
cannot live here — React drops unknown CSS properties"* — applies to **unknown** properties.
`fontVariantNumeric` is a known one. Leave it as a normal style-object key.

## G4. StatGrid's dark mode reuses existing classes. Shell.tsx is NOT edited.

Every `.dc-dark-*` class is defined in a **private `const CSS` inside `Shell.tsx`**, which
is do-not-touch this task. So StatGrid cannot define a new dark rule — it must reuse what
exists (`Shell.tsx:132-156`):

```
.dc-dark-text  { color: darkColors.textPrimary !important; }
.dc-dark-muted { color: darkColors.textSecondary !important; }
.dc-dark-label { color: darkColors.textSecondary !important;
                 border-color: darkColors.border !important; }
```

`.dc-dark-label` is *exactly* "a label that carries a border" — which is what a StatGrid
column cell with a divider is. Mapping:

| Element | class | light | dark |
|---|---|---|---|
| outer per-stat `<td>` (carries the divider `borderLeft`) | `dc-dark-label` | border `colors.border` | border `darkColors.border` |
| inner value cell | `dc-dark-text` | `colors.navy` inline | `darkColors.textPrimary` |
| inner label cell | `dc-dark-label` | `colors.textSecondary` inline | `darkColors.textSecondary` |

The outer `<td>`'s `!important` colour does not leak onto the value: the inner cells carry
their own inline `color`, and an inline declaration on an element beats an inherited value
from an ancestor regardless of `!important` on the ancestor.

**If you conclude a genuinely new dark class is required: STOP and report. Do not edit
Shell.tsx.**

## G5. The 8 carrier templates are uniform

Each has exactly one `const styles` block at the bottom, no `<Preview>`, its own `<Html>`,
a `DriveCommand - {companyName}` header band, a `detailsBox` of `<strong>Label:</strong>
value` lines, one `<Button>` (two of them behind an optional-URL guard), and a two-line
footer.

| File | lines | hex | Button href prop |
|---|---|---|---|
| load-delivered.tsx | 170 | 13 | `loadDetailUrl` |
| stop-completed.tsx | 172 | 13 | `dispatchDetailUrl` |
| client-shipment-update.tsx | 206 | 13 | `portalUrl?` (optional → CTA guarded) |
| pay-record-ready.tsx | 177 | 14 | `payRecordsUrl` |
| invoice-generated.tsx | 179 | 14 | `clientPortalUrl?` (optional → CTA guarded) |
| client-invoice-ready.tsx | 194 | 15 | `portalUrl?` (optional → CTA guarded) |
| compliance-alert.tsx | 203 | 17 | `dashboardUrl` |
| dispatch-assigned.tsx | 205 | 14 | `driverPortalUrl` |

Sum = **113**, matching quick-578's carrier figure exactly.

Verify with the path-filtering command (this is the one to report against):
```bash
cd apps/web
grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails/carrier/ | wc -l      # 113 -> must become 0
grep -rlE "#[0-9a-fA-F]{3,8}\b" src/emails/carrier/ | wc -l      # 8   -> must become 0
grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails/ --include=*.tsx | grep -v "/carrier/" | wc -l   # 0 -> stays 0
```

## G6. Call sites — all `React.createElement`, none may change

`src/lib/carrier/notifications.ts` invokes all 8 via `React.createElement(Component, {...})`
at lines 174, 314, 434, 537, 664, 741, 947, 1086, 1195. **DO NOT EDIT IT.**

`src/lib/carrier/dispatch-assigned-email.ts:9-12` does a **type-only** import of
`DispatchAssignedEmailProps` and `DispatchStopLine` from `@/emails/carrier/dispatch-assigned`.
Both interfaces must survive with identical fields. **DO NOT EDIT IT.**

`src/lib/carrier/__tests__/dispatch-assigned-email.test.ts` renders `DispatchAssignedEmail`
with `@react-email/render` and asserts on the output. It is part of the 1806 baseline and
must stay green. It asserts on rendered *content*, so a purely structural migration is safe
— but read the test before editing `dispatch-assigned.tsx` and check which strings it pins.

## G7. Shell owns Header and Footer. Templates never import them.

`Shell` renders `<Header>` and `<Footer>` internally (`Shell.tsx:193`, `:236`). The brief's
"plus Header, Footer" is satisfied *by using Shell*. A carrier template must **not** import
`Header` or `Footer`.

**This creates the one real content risk in the migration.** The system `Header` shows the
DriveCommand logo + wordmark only — no tenant name — and the system `Footer` shows
"DriveCommand — You run the trucks. We run the rest." + optional address + preferences/support
links. Neither renders `companyName`. But all 8 carrier templates currently render
`companyName` twice (header band + footer subtext), and **the brief forbids changing the
data a template displays**.

**Rule: `companyName` must still be rendered in the body.** Keep the existing closing
sentence as body prose, e.g. `<p>This is an automated notification from {companyName}.</p>`
(use each file's own wording verbatim — three of them say "invoice notification",
"shipment notification", "daily compliance report"). Task 6 enforces this with a mechanical
props-rendered audit.

## G8. `.dc-body` resets — what the children slot already styles for you

```
.dc-body h1 { 22px / navy / 700 }      .dc-body h2 { 18px / navy / 700 }
.dc-body p  { 15px / 24px / textPrimary / margin 0 0 16px 0 }
.dc-body p:last-child { margin-bottom: 0 }
.dc-body ul, ol { same type / margin 0 0 16px 0 / padding-left 20px }
.dc-body strong { font-weight: 600 }
.dc-body a { signalBlue, underline }   .dc-body a.dc-btn { white !important }
```

So plain `<h2>`, `<p>`, `<strong>`, `<ul>` inside the children slot need **no** styling.
That is the entire reason a migrated template carries no style objects.

## G9. The QA harness already does most of task 6

`scripts/email-render-qa.ts` has a `TEMPLATES: Array<{ name, Component, props }>` registry
(line 184) with 21 entries. `runTemplatesPhase()` (line 458) already, for every entry:
renders → writes `.email-qa/templates/{name}.html` → byte-size vs the 102 KB Gmail clip
limit → light-mode PNG → extracts the preheader → **cross-checks all preheaders for
duplicates and sets `process.exitCode = 1` on any duplicate or oversize**.

Adding 8 entries gets all of that for free. Two edits are still needed:
1. Line ~544: `console.log('\nPASS — all 20 preheaders are distinct')` — the `20` is a
   hardcoded literal. Change to `${TEMPLATES.length}`.
2. Line ~462: `console.log('\n=== Phase 2: the 20 migrated templates ===\n')` — same.

**The logo trap, carried forward from quick-578 (harness lines 490-513).** The migrated
templates take no `logoBaseUrl` prop — they call `getAppBaseUrl()` themselves and emit
`http://localhost:3000/email/logo-2x.png`. The harness's `logoBaseUrl: origin` spread is a
silent no-op. quick-578 reviewed 20 screenshots **with a broken logo** before catching it.
The fix is already in the file:
```ts
await page.route('**/email/logo-2x.png', (route) =>
  route.fulfill({ path: join(PUBLIC_DIR, 'email', 'logo-2x.png'), contentType: 'image/png' }),
);
```
It is there and works. **Confirm it visually anyway** — see task 6 step 3.

## G10. `.email-qa/` PNGs are TRACKED

25 paths under `.email-qa/` are in git (4 dispatcher PNGs + 20 template PNGs + `.gitignore`).
`templates/*.html` and `preview.html` are gitignored. Any QA run rewrites every tracked PNG.
**After any throwaway/exploratory run: `git checkout -- .email-qa`.** Only the final,
reviewed run's PNGs get committed.

## G11. The brief's commit grouping miscounts — report it, do not invent a file

The brief says "the 4 load and stop templates, the 3 invoice and pay templates,
compliance-alert and dispatch-assigned" = 4+3+2 = 9, but there are 8. The natural split
keeping the intended boundaries is **3 / 3 / 2**:

- load/stop: `load-delivered`, `stop-completed`, `client-shipment-update`
- invoice/pay: `pay-record-ready`, `invoice-generated`, `client-invoice-ready`
- `compliance-alert`, `dispatch-assigned`

Use 3/3/2. Note the discrepancy in the summary. Do not invent a fourth load/stop file.

## G12. DetailRows is OFF THE TABLE for this task

The brief lists the permitted components as "Shell via the children slot, plus Header,
Footer, Button, and StatGrid or StatusBar" — `DetailRows` is deliberately absent — and step
7 says "Do NOT convert prose to DetailRows".

`DetailRows` would be a defensible target for the `detailsBox` label/value lines, but the
brief did not sanction it and "Do NOT" is a hard constraint word. **Conservative reading,
which this plan adopts: introduce no `DetailRows` in any of the 8 carrier files.** Render
each existing detail line as `<p><strong>Label:</strong> {value}</p>` — a faithful, 1:1 port
of what the file already renders, styled by `.dc-body p` / `.dc-body strong` for free.

State this reading explicitly in the summary so the user can redirect it in a follow-up if
they meant otherwise.

---

<tasks>

<task type="auto">
  <name>Task 1: StatGrid + token additions + the Button line-149 margin (1 commit)</name>
  <files>
apps/web/src/emails/_system/StatGrid.tsx   (new)
apps/web/src/emails/_system/tokens.ts
apps/web/src/emails/_system/index.ts
apps/web/src/emails/_system/Button.tsx
  </files>
  <action>
**PRE-FLIGHT.** Kill anything on port 3000 and leave it dead for the whole task:
```bash
# PowerShell
Get-NetTCPConnection -LocalPort 3000 -State Listen -EA SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
Then capture the pre-change dispatcher render for the byte-identity gate (step D below)
BEFORE touching Button.tsx.

---

**A. tokens.ts — add exactly four keys, nothing else.**

In `fontSizes`, after `fine`:
```ts
  /** StatGrid value. Large enough to read at arm's length — restores the 28px
   *  centred numerals workflow-safety-digest had before quick-578 flattened it. */
  stat: '28px',
  /** StatGrid label. Deliberately below `fine`, because it is uppercase and
   *  letter-spaced — the same treatment `styles.detailLabel` gives a label. */
  micro: '11px',
```
In `lineHeights`, after `fine`:
```ts
  stat: '34px',
  micro: '16px',
```

Then add three pre-built style objects to `styles`, in a new
`// --- stat grid ----` section placed between the detail-rows and button sections
(the file's convention is pre-built objects, not inline literals in components):

```ts
  statTable: {
    width: '100%',
    borderCollapse: 'collapse',
    margin: `${space[2]} 0 ${space[6]} 0`,
  },
  statValue: {
    padding: `${space[4]} ${space[2]} 0 ${space[2]}`,
    fontFamily: fonts.headingStack,
    fontSize: fontSizes.stat,
    lineHeight: lineHeights.stat,
    fontWeight: 700,
    color: colors.navy,
    // Known CSSProperties key — see the file header note about `mso-hide`.
    // Stops digit widths jittering between counts. React emits this fine.
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'center',
  },
  statLabel: {
    padding: `${space[1]} ${space[2]} ${space[4]} ${space[2]}`,
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.micro,
    lineHeight: lineHeights.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    textAlign: 'center',
  },
```
**No hex literal anywhere.** Re-verify after editing:
`grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails/_system/ | wc -l` must stay `0`.

---

**B. Create `apps/web/src/emails/_system/StatGrid.tsx`.**

Public API — this exact shape, it is what task 2 and task 5 consume:
```ts
export type Stat = { value: string; label: string };
export type StatGridProps = { stats: Stat[] };
```

Implementation rules, all load-bearing:

1. **Tables only. No flex, no grid, no `display:block` layout.** Outlook Windows renders
   through Word, which supports neither — same reason DetailRows is a table (see its header).
2. Structure: one outer `<table role="presentation" border={0} cellPadding="0"
   cellSpacing="0" width="100%" style={styles.statTable}>`, one `<tr>` per row of stats,
   one `<td>` per stat. Each per-stat `<td>` contains a **nested** presentation table with
   two `<tr>`s — the value cell above the label cell. Nested tables are what Word actually
   honours for stacked content; two sibling `<div>`s are not.
3. **Chunking / equal widths.** `const perRow = Math.min(stats.length, 4)`. Chunk `stats`
   into rows of `perRow`. Every per-stat `<td>` gets `width: \`${100 / perRow}%\``. Pad the
   final short row with empty `<td>` cells (no content, no border) so columns in a wrapped
   second row line up with the first. More than 4 stats therefore **wraps**, never compresses,
   as the brief requires.
4. **Dividers.** `borderLeft: \`1px solid ${colors.border}\`` on every per-stat `<td>`
   **except the first in its row** (index `% perRow !== 0`). Never `borderRight` — the last
   cell would get a trailing rule against the card edge. Padding cells get no border.
5. **Dark mode — reuse only, per G4.** Per-stat `<td>` → `className="dc-dark-label"`
   (picks up `darkColors.border` for the divider). Inner value cell →
   `className="dc-dark-text"`. Inner label cell → `className="dc-dark-label"`.
   **Do not add a class Shell.tsx does not define.**
6. `if (stats.length === 0) return null;` — DetailRows' precedent. A single stat renders
   fine (one full-width cell, no divider); do not throw.
7. `React.FC<StatGridProps>` + `export default StatGrid`, matching DetailRows/StatusBar.
8. File header comment in the house style: why a table and not flex/grid; why
   `tabular-nums`; why dark mode reuses `.dc-dark-label` rather than adding a rule (Shell
   owns the CSS block).

---

**C. `_system/index.ts` — export it.**
```ts
export { StatGrid, type Stat, type StatGridProps } from './StatGrid';
```
Place it after the `DetailRows` line, before `StatusBar`. Also add `stat`/`micro` awareness
is automatic — `fontSizes`/`lineHeights` are already re-exported wholesale.

---

**D. `Button.tsx` — ONE line. Line 149 ONLY.**

```diff
-export const Button: React.FC<ButtonProps> = ({ href, label }) => (
-  <div style={{ margin: `${space[6]} 0 0 0` }}>
+export const Button: React.FC<ButtonProps> = ({ href, label }) => (
+  <div style={{ margin: `${space[6]} 0 ${space[6]} 0` }}>
```

24px matches the top margin and clears `.dc-body p`'s own 16px bottom margin, so prose
after a Button now sits a full block away.

**Line 141 — `` `<div style="margin:${space[6]} 0 0 0">` `` inside
`buildButtonBlockHtml` — MUST NOT CHANGE.** See G1.

Add a short comment above line 149 recording the asymmetry and why:
> The string builder above deliberately keeps `0` bottom: its output is the
> dispatcher's CTA, always the last block in a Tiptap body, and
> `body-html-transform.ts` is byte-identity-gated. This React Button is followed
> by prose in 8+ templates, which is what the bottom margin is for.

---

**E. THE GATE — dispatcher byte-identity re-proof. A non-empty diff is a STOP.**

Method (no server, no Next.js; this is quick-578's proof, simplified because we render
`DynamicTemplateEmail` directly with fixed props so there is no ephemeral port to normalise):

```bash
cd apps/web
# 1. BEFORE — with Button.tsx reverted
git stash push -- src/emails/_system/Button.tsx
npx tsx -e "
import { render } from '@react-email/render';
import * as React from 'react';
import Dynamic from './src/emails/dynamic-template';
import { transformBodyHtml } from './src/lib/notifications/body-html-transform';
const body = transformBodyHtml('<h2>Trip coming up</h2><p>Body.</p><p><a href=\"https://app.drivecommand.com/x\">Open trip</a></p>');
render(React.createElement(Dynamic, { preheader:'p', bodyHtml: body, logoBaseUrl:'https://example.test' }))
  .then(h => require('fs').writeFileSync('/tmp/btn-before.html', h));
" 
git stash pop
# 2. AFTER — same command, output to /tmp/btn-after.html
# 3. Compare
diff /tmp/btn-before.html /tmp/btn-after.html && echo "BYTE-IDENTICAL — gate passed"
md5sum /tmp/btn-before.html /tmp/btn-after.html
```

Adjust the exact `DynamicTemplateEmail` prop names to whatever the file actually takes —
read it first; it is on the do-not-touch list so it must not be edited, only read. If the
inline `-e` form is awkward, write a throwaway `scripts/__probe579-btn.ts`, run it, and
**delete it before committing** (quick-519 found a previous run's `__probe.ts` still on
disk; `git status --porcelain` must not list it).

**If the diff is non-empty: STOP. Do not commit. Report which line moved.** A non-empty
diff means the string builder was touched, and every dispatcher send in production would
change.

---

**F. tsc, probed (this task's gate is used again in every later task — full recipe here,
referenced later).**

```bash
cd apps/web
# Inject into a file THIS TASK ACTUALLY EDITED:
#   const __probe579: number = 'x';      -> src/emails/_system/StatGrid.tsx
npx tsc --noEmit
```
Confirm tsc reports **that** error, at that file and line. Then delete the probe and re-run
to zero errors.

**Blind-gate rules (CLAUDE.md, non-negotiable):** if the only errors are syntax errors, or
are all in files you did not touch, or are all under `.next/`, the gate is BLIND, not green.
Delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, re-run,
re-probe.

---

**G. Commit.**
```
git add apps/web/src/emails/_system/StatGrid.tsx apps/web/src/emails/_system/index.ts \
        apps/web/src/emails/_system/tokens.ts apps/web/src/emails/_system/Button.tsx
git commit -m "feat(quick-579): StatGrid component + Button bottom margin"
```
`git status --porcelain` after the commit must be clean of probe files and of `.email-qa`.
Do NOT push (the orchestrator pushes once at the end).
  </action>
  <verify>
- `git diff --stat HEAD~1` lists exactly 4 paths, all under `src/emails/_system/`.
- `git diff HEAD~1 -- apps/web/src/emails/_system/Button.tsx` shows the line-149 margin and the comment, and **does not touch line 141 / `buildButtonBlockHtml`**.
- `grep -n "0 0 0" src/emails/_system/Button.tsx` still shows the string-builder margin unchanged.
- `diff /tmp/btn-before.html /tmp/btn-after.html` is empty; md5s match.
- `grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails/_system/ | wc -l` → `0`.
- `grep -c "dc-dark-" src/emails/_system/StatGrid.tsx` ≥ 3; `grep -c "flex\|display: *'grid'" src/emails/_system/StatGrid.tsx` → 0.
- tsc probed live, then clean.
  </verify>
  <done>
StatGrid exists and is exported; tokens gained exactly `fontSizes.stat`, `fontSizes.micro`,
`lineHeights.stat`, `lineHeights.micro` plus three `styles` objects; `_system/` still has
zero hex literals; the React Button has a 24px bottom margin; `buildButtonBlockHtml`'s
output is byte-identical (md5-proved); one commit.
  </done>
</task>

<task type="auto">
  <name>Task 2: restore workflow-safety-digest's stat grid (1 commit)</name>
  <files>
apps/web/src/emails/workflow-safety-digest.tsx
  </files>
  <action>
**A. Capture the BEFORE screenshot first** (this is a visual restoration, so the evidence
is a pair):
```bash
cd apps/web
npx tsx scripts/email-render-qa.ts
cp .email-qa/templates/workflow-safety-digest.png /tmp/digest-before.png
git checkout -- .email-qa            # G10 — that run dirtied 24 tracked PNGs
```

**B. Edit `workflow-safety-digest.tsx`. Change ONE thing: the `<ul>` becomes a `<StatGrid>`.**

Current (lines ~37-49):
```tsx
<ul>
  <li><strong>{overdueCount}</strong> overdue step{overdueCount !== 1 ? 's' : ''}</li>
  <li><strong>{completedTodayCount}</strong> completed today</li>
  <li><strong>{activeInstanceCount}</strong> active checklist{activeInstanceCount !== 1 ? 's' : ''}</li>
</ul>
```
Replace with:
```tsx
<StatGrid
  stats={[
    { value: String(overdueCount), label: overdueCount === 1 ? 'Overdue step' : 'Overdue steps' },
    { value: String(completedTodayCount), label: 'Completed today' },
    { value: String(activeInstanceCount), label: activeInstanceCount === 1 ? 'Active checklist' : 'Active checklists' },
  ]}
/>
```
and extend the import: `import { Shell, Button, StatGrid } from './_system';`

**Everything else stays byte-for-byte:**
- the `WorkflowSafetyDigestEmailProps` interface — unchanged
- `previewText` and its `overdueCount > 0` branch — unchanged
- the `statusBar` prop and its `overdueCount > 0` branch — unchanged
- the `<h2>`, the `{tenantName} · {date}` line, the conditional "past due" paragraph, the
  `<Button>`, and the closing "You are receiving this…" paragraph — unchanged
- the exported function name and its call signature — unchanged

Same three counts, same pluralisation semantics, same data. This is a presentation swap.

**C. After screenshot + review.**
```bash
npx tsx scripts/email-render-qa.ts
cp .email-qa/templates/workflow-safety-digest.png /tmp/digest-after.png
git checkout -- .email-qa            # final PNGs are committed in task 6, not here
```
**Open both PNGs.** Confirm in the AFTER image: three large navy numerals in one row,
uppercase small labels beneath, thin vertical rules between the columns, digits not
clipped, and the orange "2 overdue steps" StatusBar still fires (fixture has
`overdueCount: 2`). Do not report a screenshot as reviewed that you did not open.

**D. tsc probed** (probe into `workflow-safety-digest.tsx` this time — the file this task
edited), per Task 1 step F. Then commit:
```
git commit -m "fix(quick-579): restore workflow-safety-digest stat grid via StatGrid"
```
  </action>
  <verify>
- `git diff --stat HEAD~1` lists exactly one path: `apps/web/src/emails/workflow-safety-digest.tsx`.
- `git status --porcelain` shows nothing under `.email-qa/`.
- `grep -n "interface WorkflowSafetyDigestEmailProps" -A 8 src/emails/workflow-safety-digest.tsx` — the six fields are unchanged.
- `grep -c "<ul>" src/emails/workflow-safety-digest.tsx` → 0. `grep -c "StatGrid" ...` → ≥ 2.
- `git diff HEAD~1` touches only the import line and the `<ul>`→`<StatGrid>` block — no change to `previewText`, `statusBar`, or any paragraph.
- BEFORE and AFTER PNGs both opened and compared.
  </verify>
  <done>
The digest shows three counts as a StatGrid; prop signature, exported name, preheader logic,
StatusBar logic and every sentence are unchanged; before/after screenshots reviewed; one commit.
  </done>
</task>

<task type="auto">
  <name>Task 3: migrate load-delivered, stop-completed, client-shipment-update (1 commit)</name>
  <files>
apps/web/src/emails/carrier/load-delivered.tsx
apps/web/src/emails/carrier/stop-completed.tsx
apps/web/src/emails/carrier/client-shipment-update.tsx
  </files>
  <action>
**THE MIGRATION RECIPE — applies identically to tasks 3, 4 and 5. Read it once.**

**Step 0 — capture the contract before editing each file.** For each file:
```bash
cd apps/web
grep -n "^export interface\|^export function\|^export type\|^function " src/emails/carrier/<f>.tsx
sed -n '/^export interface/,/^}/p' src/emails/carrier/<f>.tsx      # full field list
```
Save the output. After editing, re-run and diff — the only permitted difference is line
numbers. Any field, type, optionality or name change is a FAILURE, not a refinement.

Also list, by hand, **every prop the file currently renders** (walk the JSX). After editing,
confirm each one still appears. `companyName` is the one that catches people — see G7.

**Step 1 — replace the imports.**
```diff
-import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components';
+import * as React from 'react';
+import { Shell, Button } from '../_system';
+import { getAppBaseUrl } from '@/lib/app-url';
```
Add `StatGrid` and/or `StatusBar` only where the task below says so. Never import `Header`
or `Footer` (G7). Never import `DetailRows` (G12).

**Step 2 — replace the whole render tree with the children slot.** Pattern, matching the
20 already-migrated root templates (`add-driver-nudge.tsx` is the canonical example):
```tsx
return (
  <Shell
    preheader={/* the distinct, prop-interpolated sentence from step 4 */}
    logoBaseUrl={getAppBaseUrl()}
    /* statusBar={...} only where specified below */
  >
    <h2>{/* the old styles.greeting text */}</h2>
    <p>{/* the old styles.message text, verbatim */}</p>

    {/* one <p> per old detailsBox line: */}
    <p><strong>Load Number:</strong> {loadNumber}</p>
    ...

    <Button href={...} label="View Load" />

    <p>This is an automated notification from {companyName}.</p>
  </Shell>
);
```
Notes:
- The old `<Button>` child text becomes the `label` prop verbatim ("View Load",
  "View Dispatch", "Track Shipment", …). The `_system` Button takes `{href, label}`, not children.
- Where the CTA was inside `{portalUrl && (...)}`, keep the guard around `<Button>`.
- The old header band's `DriveCommand - {companyName}` has no place in the system Header;
  `companyName` survives via the closing sentence (G7). Do not drop it.
- The old footer's `DriveCommand - Fleet Management` line is now the system Footer's
  "DriveCommand — You run the trucks. We run the rest." — drop the duplicate.
- **Stay synchronous.** No `async`, no `await`, no promise anywhere in these files.

**Step 3 — delete the `const styles = {...}` block entirely.** No renamed survivor object
(quick-578 allowed one for `sysadmin-invoice`'s real line-item table; nothing here qualifies).

**Step 4 — a distinct, content-derived preheader interpolating real props.** Never a
constant, never a near-copy of another template's. Proposed (adjust wording if a prop shape
makes it awkward, but keep them interpolated and distinct):

| File | preheader |
|---|---|
| load-delivered | `` `Load ${loadNumber} delivered to ${destinationStop} — ${deliveredAt}` `` |
| stop-completed | `` `${driverName} completed the ${stopTypeLabel.toLowerCase()} at ${facilityName} — dispatch ${dispatchNumber}` `` |
| client-shipment-update | `` `Load ${loadNumber} ${isPickup ? 'picked up from' : 'delivered to'} ${facilityName} at ${timestamp}` `` |

`client-shipment-update` already computes `isPickup`; reuse it rather than re-deriving.

---

**PER-FILE SPECIFICS FOR THIS TASK**

`load-delivered.tsx` — 7 props, all rendered today (`loadNumber`, `clientName`,
`originStop`, `destinationStop`, `deliveredAt`, `loadDetailUrl`, `companyName`). Straight
port. No StatusBar, no StatGrid.

`stop-completed.tsx` — 7 props. Keep the local `const stopTypeLabel = stopType === 'pickup'
? 'Pickup' : 'Delivery'` derivation exactly as it is. Straight port. No StatusBar, no StatGrid.

`client-shipment-update.tsx` — 12 props, 4 optional (`commodity`, `estimatedDelivery`,
`podNote`, `portalUrl`). **Every conditional must survive**: the `referenceNumbers &&`
guard, `commodity &&`, `isPickup && estimatedDelivery &&`, `!isPickup && podNote &&`, and
`portalUrl &&` around the CTA. The labels flip on `isPickup` ("Picked Up From" vs
"Delivered To", "Pickup Time" vs "Delivery Time") — preserve both branches.
**Add a StatusBar here** — it is the one client-facing status email and the tone is real
information, not decoration:
```tsx
statusBar={{ tone: isPickup ? 'info' : 'success', label: isPickup ? 'Picked up — in transit' : 'Delivered' }}
```
(`tints`/`tintAccents` define `info`, `attention`, `success`; `success` is the tone
`geofence-arrival-alert` already uses for a delivery.) No StatGrid.

---

**Verification for this task:** tsc probed (probe into `load-delivered.tsx`), then commit:
```
git commit -m "refactor(quick-579): migrate load/stop carrier templates onto _system Shell"
```
  </action>
  <verify>
- `git diff --stat HEAD~1` lists exactly the 3 carrier files. Nothing else, and **not** `src/lib/carrier/notifications.ts`.
- For each file: `grep -c "const styles" ` → 0; `grep -c "<Html\|@react-email/components"` → 0; `grep -c "async\|await"` → 0.
- Interface field lists and exported function names diff line-number-only against the step-0 capture.
- Every prop rendered before is rendered after — including `companyName` in all three.
- The three preheaders are distinct from each other and interpolate props (no bare string literal passed to `preheader`).
- tsc probed live, then clean.
  </verify>
  <done>
Three templates render through Shell's children slot with no `<Html>`, no `const styles`,
no DetailRows, unchanged exports/props/data, distinct interpolated preheaders, and
`client-shipment-update` carries a status-derived StatusBar. One commit.
  </done>
</task>

<task type="auto">
  <name>Task 4: migrate pay-record-ready, invoice-generated, client-invoice-ready (1 commit)</name>
  <files>
apps/web/src/emails/carrier/pay-record-ready.tsx
apps/web/src/emails/carrier/invoice-generated.tsx
apps/web/src/emails/carrier/client-invoice-ready.tsx
  </files>
  <action>
Apply the **migration recipe from Task 3** (steps 0-4) unchanged.

**PER-FILE SPECIFICS**

`pay-record-ready.tsx` — 6 props. **Keep the `Intl.NumberFormat` currency derivation
exactly as written** (`formattedAmount`); it is data, not styling. The old
`styles.netPayRow` gave Net Pay visual emphasis; preserve that emphasis without a style
object by keeping it as the last `<p><strong>Net Pay:</strong> {formattedAmount}</p>` line.
No StatGrid (a currency string plus a pay-period string is not a 2-4 numeric summary — do
not force it). No StatusBar.

`invoice-generated.tsx` — 6 props, `clientPortalUrl` optional. Keep `formattedTotal`'s
`Intl.NumberFormat`. Keep the `clientPortalUrl && (...)` guard around the `<Button>`. The
old `styles.invoiceTotalRow` emphasis → keep the Invoice Total line as-is in prose.
No StatGrid, no StatusBar.

`client-invoice-ready.tsx` — 7 props, `paymentInstructions` and `portalUrl` optional. Keep
`formattedTotal`. Keep BOTH optional guards. The second `detailsBox` with
`styles.sectionHeading` "Payment Instructions" becomes `<h2>Payment Instructions</h2>`
followed by `<p>{paymentInstructions}</p>`, still inside the `paymentInstructions &&` guard
(`.dc-body h2` styles it for free).

**Preheaders — 5 and 6 are the two most likely to collide. Keep them clearly apart:**

| File | preheader |
|---|---|
| pay-record-ready | `` `${driverName}'s pay for ${payPeriod} — ${formattedAmount} awaiting approval` `` |
| invoice-generated | `` `Invoice ready for load ${loadNumber} — ${formattedTotal} from ${contractName}, due ${dueDate}` `` |
| client-invoice-ready | `` `Your invoice for load ${loadNumber} — ${formattedTotal} payable by ${dueDate}` `` |

Note `pay-record-ready`'s uses an apostrophe — in a template literal that is fine, but if
it ends up in JSX text anywhere use `&apos;`. It goes into the `preheader` **prop** (a
string), so no escaping is needed.

tsc probed (probe into `invoice-generated.tsx`), then:
```
git commit -m "refactor(quick-579): migrate invoice/pay carrier templates onto _system Shell"
```
  </action>
  <verify>
- `git diff --stat HEAD~1` lists exactly the 3 carrier files.
- Per file: `const styles` gone, `@react-email/components` import gone, no `async`/`await`, no `DetailRows`.
- `Intl.NumberFormat` derivations still present in all three (`grep -c "Intl.NumberFormat"` → 1 each).
- Both optional-URL guards and the `paymentInstructions` guard survive (`grep -c "&& ("` matches the pre-edit count for each file).
- Interfaces and exported names diff line-number-only.
- `companyName` still rendered in all three.
- tsc probed live, then clean.
  </verify>
  <done>
Three invoice/pay templates migrated; currency formatting, optional guards, exports, props
and displayed data unchanged; three distinct interpolated preheaders. One commit.
  </done>
</task>

<task type="auto">
  <name>Task 5: migrate compliance-alert and dispatch-assigned (1 commit)</name>
  <files>
apps/web/src/emails/carrier/compliance-alert.tsx
apps/web/src/emails/carrier/dispatch-assigned.tsx
  </files>
  <action>
Apply the **migration recipe from Task 3** (steps 0-4). These two are the least uniform;
read each fully before editing.

---

**`compliance-alert.tsx`** — 3 props (`companyName`, `alerts: ComplianceAlertItem[]`,
`dashboardUrl`). **Two exported interfaces** (`ComplianceAlertItem`, `ComplianceAlertEmailProps`)
— both must survive with identical fields.

Keep the `criticalAlerts` / `warningAlerts` filters exactly as written.

**This is the one template that genuinely warrants StatGrid.** Add above the groups:
```tsx
<StatGrid
  stats={[
    { value: String(alerts.length), label: alerts.length === 1 ? 'Total alert' : 'Total alerts' },
    { value: String(criticalAlerts.length), label: 'Critical' },
    { value: String(warningAlerts.length), label: 'Warnings' },
  ]}
/>
```
That displays **no new data** — all three numbers are already on screen today (the greeting
prints `alerts.length`, and each group header prints its own count). It re-presents them.
Keep the group headers too: `<h2>Critical ({criticalAlerts.length})</h2>` /
`<h2>Warnings ({warningAlerts.length})</h2>`, each still inside its `length > 0` guard,
with each alert's `alert.message` as a `<p>`.

**`alert.link` and `alert.type` are NOT rendered today.** Do not start rendering them —
"do not change the data it displays" cuts both ways. The `key={i}` on the mapped items stays.

Add a StatusBar, since the whole email is an attention signal:
```tsx
statusBar={{ tone: 'attention', label: `${alerts.length} compliance item${alerts.length !== 1 ? 's' : ''} need attention` }}
```
Preheader: `` `${alerts.length} compliance item${alerts.length !== 1 ? 's' : ''} at ${companyName} — ${criticalAlerts.length} critical` ``

---

**`dispatch-assigned.tsx`** — the highest-risk file in the task.

- **Two exported interfaces** (`DispatchStopLine`, `DispatchAssignedEmailProps`) are
  **type-imported by `src/lib/carrier/dispatch-assigned-email.ts:9-12`**, which is
  do-not-touch. Every field, including the doc comments on `sequence` / `type`, must survive.
- **The non-exported `stopTypeLabel(type: string)` helper must stay** — same name, same body.
- **`src/lib/carrier/__tests__/dispatch-assigned-email.test.ts` renders this component and
  asserts on the output.** READ THAT TEST BEFORE EDITING. Whatever strings it pins must
  still appear in the rendered HTML. It is part of the 1806 baseline and must stay green.
  If a faithful migration would break an assertion, **STOP and report** — do not edit the test.
- Keep the `stops.length > 0 &&` guard, the `<Text style={styles.stopsHeading}>Itinerary</Text>`
  → `<h2>Itinerary</h2>`, and the `stops.map` with `key={stop.sequence}` and the
  `{stop.city ? \`, ${stop.city}\` : ''}` tail.

**StatGrid here: use it, with two stats** — `stopCount` and `truckUnitNumber` are both
already displayed and both read as compact figures:
```tsx
<StatGrid
  stats={[
    { value: String(stopCount), label: stopCount === 1 ? 'Stop' : 'Stops' },
    { value: truckUnitNumber, label: 'Truck unit' },
  ]}
/>
```
Then keep `dispatchNumber` and `scheduledDeparture` as `<p><strong>…</strong></p>` lines so
no displayed prop is lost. If the unit test pins the exact `<strong>Total Stops:</strong> 2`
string, **keep those two lines as prose as well and skip the StatGrid here** — the test
winning over the presentation is the correct trade. Report which way it went.

Preheader: `` `Dispatch ${dispatchNumber} — ${stopCount} stop${stopCount !== 1 ? 's' : ''}, truck ${truckUnitNumber}, departing ${scheduledDeparture}` ``

---

**Run the dispatch-assigned suite immediately, before the commit:**
```bash
cd apps/web
npx vitest run src/lib/carrier/__tests__/dispatch-assigned-email.test.ts
```
Must be green. tsc probed (probe into `compliance-alert.tsx`), then:
```
git commit -m "refactor(quick-579): migrate compliance-alert and dispatch-assigned onto _system Shell"
```
  </action>
  <verify>
- `git diff --stat HEAD~1` lists exactly the 2 carrier files — **not** `dispatch-assigned-email.ts`, **not** its test, **not** `notifications.ts`.
- All FOUR exported interfaces (`ComplianceAlertItem`, `ComplianceAlertEmailProps`, `DispatchStopLine`, `DispatchAssignedEmailProps`) diff line-number-only.
- `grep -n "function stopTypeLabel" src/emails/carrier/dispatch-assigned.tsx` still matches.
- `npx vitest run src/lib/carrier/__tests__/dispatch-assigned-email.test.ts` green.
- `const styles` gone from both; no `@react-email/components`; no `async`/`await`.
- `alert.link` / `alert.type` still unrendered (`grep -c "alert.link\|alert.type"` → 0 in JSX).
- `companyName` still rendered in both.
- tsc probed live, then clean.
  </verify>
  <done>
Both templates migrated; four exported interfaces and the `stopTypeLabel` helper intact;
the dispatch-assigned unit test green; compliance-alert carries a StatGrid + attention
StatusBar re-presenting counts it already showed. One commit.
  </done>
</task>

<task type="auto">
  <name>Task 6: QA harness, 10 screenshots, hex recount, full verification, summary (1 commit)</name>
  <files>
apps/web/scripts/email-render-qa.ts
apps/web/.email-qa/templates/*.png
.planning/quick/579-email-convergence-2b-statgrid-button-mar/579-SUMMARY.md
.planning/STATE.md
  </files>
  <action>
**1. Extend the harness (G9).**

Add 8 imports beside the existing 21:
```ts
import { LoadDeliveredEmail } from '../src/emails/carrier/load-delivered';
import { StopCompletedEmail } from '../src/emails/carrier/stop-completed';
import { ClientShipmentUpdateEmail } from '../src/emails/carrier/client-shipment-update';
import { PayRecordReadyEmail } from '../src/emails/carrier/pay-record-ready';
import { InvoiceGeneratedEmail } from '../src/emails/carrier/invoice-generated';
import { ClientInvoiceReadyEmail } from '../src/emails/carrier/client-invoice-ready';
import { ComplianceAlertEmail } from '../src/emails/carrier/compliance-alert';
import { DispatchAssignedEmail } from '../src/emails/carrier/dispatch-assigned';
```
Add 8 `TEMPLATES` entries with realistic props — real-looking load numbers, real currency
amounts, a `compliance-alert` fixture with **both** critical and warning items (so both
groups render and the StatGrid shows three non-zero figures), a `dispatch-assigned` fixture
with ≥ 2 stops including one with `city: null` (so the null tail is exercised), and
`client-shipment-update` with `status: 'delivered'` plus `podNote` set (so the
delivered-branch labels and the success StatusBar render). Set every optional URL so the
guarded CTAs actually appear.

Fix the two hardcoded `20`s:
- `'\n=== Phase 2: the 20 migrated templates ==='` → `` `\n=== Phase 2: the ${TEMPLATES.length} migrated templates ===` ``
- `'\nPASS — all 20 preheaders are distinct'` → `` `\nPASS — all ${TEMPLATES.length} preheaders are distinct` ``

Update the registry's `no-explicit-any` comment ("20 distinct components" → the new count).
Do not otherwise restructure `runTemplatesPhase` — it already does byte-size, screenshot,
preheader extraction and cross-template duplicate detection with a non-zero exit code.

**2. Run it.**
```bash
cd apps/web
npx tsx scripts/email-render-qa.ts
```
Confirm in the console: 29 rendered, every one under the 102 KB Gmail clip limit, and
**`PASS — all 29 preheaders are distinct`**. A duplicate sets `process.exitCode = 1` — if
that fires, fix the offending preheader in its template file, amend that template's commit,
and re-run. Paste the full preheader list into the summary.

**3. THE LOGO GATE — before reviewing anything else (G9, and quick-578's named failure).**

quick-578 reviewed 20 screenshots with a broken logo while every automated gate stayed
green. So:

**Open `.email-qa/templates/load-delivered.png` FIRST and confirm the DriveCommand mark
renders in the navy header band — an actual chevron image, not a broken-image placeholder
or an empty band beside the wordmark. State explicitly in the summary that you did this,
and which file you checked, before reviewing any other image.** If it is broken, stop and
fix the harness interception; do not proceed to review.

**4. Review all 10 required screenshots — opened, not merely generated.**
The 8 carrier PNGs + `workflow-safety-digest.png` + `add-driver-nudge.png`.

Per carrier image confirm: header band + logo; the greeting `<h2>`; the message paragraph;
every detail line; the CTA button; the `companyName` closing sentence; the footer; and where
applicable the StatusBar / StatGrid. Report a one-line verdict per template — and report any
that reads *worse* than its pre-migration original rather than blanket-marking them clean
(quick-578's digest entry is the model for how to flag one honestly).

**`add-driver-nudge.png` is the Button-margin proof (brief step 10).** That template is
`<Button href={driversUrl} label="Invite a driver" />` immediately followed by `<p>— Sammy</p>`.
Confirm visible vertical separation between the plain-text URL line under the button and
"— Sammy". Compare against the committed pre-task PNG:
```bash
git show HEAD:apps/web/.email-qa/templates/add-driver-nudge.png > /tmp/nudge-before.png
```
Open both. If the gap did not visibly increase, the margin fix did not land — investigate
before claiming it did.

**5. Hex recount, path-filtered (brief step 8).**
```bash
cd apps/web
grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails/carrier/ | wc -l
grep -rlE "#[0-9a-fA-F]{3,8}\b" src/emails/carrier/ | wc -l
grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails/ --include=*.tsx | grep -v "/carrier/" | wc -l
grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails/_system/ | wc -l
```
Expected: `0`, `0`, `0`, `0`. Report against quick-578's figure of **113 across 8 carrier
files**. Also report per-file before/after using the G5 table.

**6. Scope check — `git diff --stat` across the whole task.**
```bash
git diff --stat <pre-task-sha>..HEAD
```
Permitted paths and NOTHING else:
`src/emails/_system/StatGrid.tsx` (new), `_system/index.ts`, `_system/Button.tsx`,
`_system/tokens.ts`, `src/emails/workflow-safety-digest.tsx`, the 8 `src/emails/carrier/*.tsx`,
`scripts/email-render-qa.ts`, `.email-qa/**`, `.planning/**`.

Any other path — especially `src/lib/carrier/notifications.ts`,
`src/lib/carrier/dispatch-assigned-email.ts`, `_system/Shell.tsx`, `_system/Header.tsx`,
`_system/Footer.tsx`, `_system/StatusBar.tsx`, `_system/Preheader.tsx`, `dynamic-template.tsx`,
`body-html-transform.ts`, `template-renderer.ts`, `dispatcher.ts`, `resend-client.ts`,
`sender-config.ts`, `html-to-text.ts`, `prisma/schema.prisma`, either `vercel.json` — is a
**violation**. Report it; do not quietly accept it.

**7. Final verification gates.**

**a. tsc, probed.** Inject `const __probe579: number = 'x';` into a file this task actually
edited (`scripts/email-render-qa.ts` or any migrated carrier file). Confirm tsc reports
**that** error at that file/line. Delete it. Re-run to zero.
Blind-gate rules per Task 1 step F: only-syntax-errors, or errors only in files you did not
touch, or errors only under `.next/` ⇒ BLIND. Delete `apps/web/.next/dev/types/validator.ts`
and `apps/web/tsconfig.tsbuildinfo`, re-run, re-probe. Confirm no `__probe*.ts` survives:
`git status --porcelain | grep -i probe` → empty.

**b. `next build`.** `cd apps/web && npx next build` — exit code 0, full route manifest.
(The pre-existing "package seems invalid" warning is unrelated and predates this task.)

**c. Full Vitest, same reporter both ends.**
```bash
cd apps/web && npx vitest run
```
Read the `Test Files … | Tests …` summary lines. Baseline: **1806 / 1679 / 63 / 61 / 3**.
Report the after figures as the same 5-tuple.
- `--reporter=basic` **does not exist in vitest 4** — it exits 0 having run ZERO tests. Do
  not use it. A green run whose output contains no test counts is not a green run.
- If the after figures differ, re-measure the baseline **in the MAIN tree** via
  `git stash` (never a `git worktree` — quick-567: a worktree does not carry the untracked,
  gitignored `apps/web/.env.local`, and DB-dependent tests then skew by ~25 tests).
- A single test that fails in a full cold run and passes in isolation is quick-549's
  cold-cache flake (~82s cold import). Re-run before calling it a regression.
- Do NOT mark any spec `.skip`.

**d. Port 3000.** Confirm nothing is listening at the end:
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -EA SilentlyContinue
```
Must return nothing.

**e. `defaultHtmlCache`.** Do NOT run the refresh script. Confirm you did not.

**8. Write the summary** to
`.planning/quick/579-email-convergence-2b-statgrid-button-mar/579-SUMMARY.md`, following
quick-578's structure. It must contain:
- The dispatcher byte-identity proof (md5s) and the statement that Button line 141 was untouched.
- The four tokens added and why (`_system/` hex count still 0).
- StatGrid's dark-mode class mapping and the statement that Shell.tsx was not edited.
- The **explicit logo-confirmation sentence** naming the file checked (step 3).
- A per-template table: exported name unchanged / props unchanged / `const styles` removed /
  preheader used / props-rendered audit incl. `companyName`.
- All 29 preheaders and the distinctness PASS line.
- Hex before/after, path-filtered, against 113.
- The 10 screenshot verdicts, honestly graded.
- The G11 commit-grouping discrepancy (brief said 4+3+2=9, there are 8; used 3/3/2).
- The G12 reading (no DetailRows introduced) stated plainly so the user can redirect it.
- The intentional Button top/bottom asymmetry between the React component and the string builder.
- Anything a carrier template needed that `_system` could not express, **with a proposed
  component**, rather than a reintroduced local styles block.
- The 5-tuple Vitest before/after, tsc probe transcript, `next build` exit code.

Update `.planning/STATE.md` with the quick-579 row.

**9. Commit.**
```
git add apps/web/scripts/email-render-qa.ts apps/web/.email-qa .planning
git commit -m "test(quick-579): extend email QA harness to 29 templates; docs + summary"
```
Do NOT push — the orchestrator pushes once at the end.
  </action>
  <verify>
- Harness prints `PASS — all 29 preheaders are distinct` and every template under 102 KB; script exit code 0.
- Logo confirmed present in the FIRST carrier PNG opened, and that confirmation is written in the summary naming the file.
- 10 screenshots opened and individually verdicted; `add-driver-nudge` compared against `git show HEAD:...` and the gap visibly increased.
- Hex: carrier 113 → 0; carrier files 8 → 0; root non-carrier 0; `_system` 0.
- `git diff --stat <pre-task-sha>..HEAD` contains no path outside the permitted list.
- tsc probed live then clean, no surviving `__probe*` file; `next build` exit 0; Vitest 5-tuple reported against 1806 / 1679 / 63 / 61 / 3 with the same reporter both ends.
- Port 3000 free. `defaultHtmlCache` script not run. No spec `.skip`ped.
- Exactly 6 commits on the branch for this task.
  </verify>
  <done>
The harness renders and screenshots 29 templates with a machine-checked distinct-preheader
gate; 10 screenshots reviewed with the logo confirmed first; carrier hex literals are 0;
all three verification gates pass; the summary records the byte-identity proof, the props
audit, the two brief discrepancies (G11, G12) and any component gap; STATE.md updated.
One commit.
  </done>
</task>

</tasks>

<verification>
Whole-task gates, all of which must hold at the end:

1. **Dispatcher byte-identity** — `buildButtonBlockHtml`'s rendered output md5-identical
   before/after. Non-empty diff = task failure.
2. **Scope** — `git diff --stat` across all 6 commits touches only the permitted paths.
   `src/lib/carrier/notifications.ts`, `dispatch-assigned-email.ts`, `Shell.tsx`,
   `Header.tsx`, `Footer.tsx`, `StatusBar.tsx`, `Preheader.tsx`, `dynamic-template.tsx`,
   `body-html-transform.ts` are all unmodified.
3. **Contracts** — 10 exported interfaces/type aliases across the 8 carrier files and the
   digest diff line-number-only. Every exported component name unchanged. Every rendered
   prop still rendered.
4. **Hex** — `src/emails/carrier/**` 113 → 0; `src/emails/**` non-carrier stays 0;
   `_system/**` stays 0.
5. **Synchronous** — no `async`/`await` introduced into any template.
6. **tsc** — probed live, then zero errors, no surviving probe file, gate not blind.
7. **`next build`** — exit 0.
8. **Vitest** — 1806 / 1679 / 63 / 61 / 3 matched, same reporter both ends, nothing `.skip`ped.
9. **Screenshots** — 10 opened; logo confirmed in the first image and stated in the summary.
10. **Preheaders** — 29 distinct, machine-checked by the harness, exit code 0.
11. **Hygiene** — port 3000 free; `.email-qa` contains only the final reviewed run;
    `defaultHtmlCache` refresh NOT run; no push.
</verification>

<success_criteria>
- `apps/web/src/emails/_system/StatGrid.tsx` exists, is exported from `_system/index.ts`,
  is table-only, uses `tabular-nums`, wraps past 4 stats, and does dark mode with existing
  `.dc-dark-*` classes only.
- Exactly four token keys added; `_system/` hex-literal count still 0.
- `Button.tsx` line 149 has a 24px bottom margin; line 141 is untouched; dispatcher output
  md5-identical.
- `workflow-safety-digest` shows a 3-column StatGrid with unchanged data and signature.
- All 8 carrier templates render through Shell's children slot: no `<Html>`, no
  `const styles`, no `DetailRows`, no async, unchanged exports/props/data, `companyName`
  still displayed, distinct interpolated preheaders.
- QA harness covers 29 templates; 10 screenshots reviewed with the logo confirmed first.
- 6 commits, in the stated groups. Summary written; STATE.md updated.
</success_criteria>

<output>
After completion, create
`.planning/quick/579-email-convergence-2b-statgrid-button-mar/579-SUMMARY.md`
per the contents list in Task 6 step 8, and update `.planning/STATE.md`.
</output>
</content>
</invoke>
