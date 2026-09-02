---
phase: quick-578
plan: 578
type: execute
wave: 1
depends_on: [quick-577]
subsystem: email
autonomous: true
files_modified:
  - apps/web/src/emails/_system/Shell.tsx
  - apps/web/src/emails/activation-celebration.tsx
  - apps/web/src/emails/add-driver-nudge.tsx
  - apps/web/src/emails/dispatch-load-nudge.tsx
  - apps/web/src/emails/no-progress-nudge.tsx
  - apps/web/src/emails/trial-ending-soon.tsx
  - apps/web/src/emails/welcome-owner.tsx
  - apps/web/src/emails/confirm-email.tsx
  - apps/web/src/emails/driver-invitation.tsx
  - apps/web/src/emails/owner-invitation.tsx
  - apps/web/src/emails/account-exists.tsx
  - apps/web/src/app/(auth)/sign-up/actions.tsx
  - apps/web/src/emails/driver-document-expiry-reminder.tsx
  - apps/web/src/emails/fleet-message-notification.tsx
  - apps/web/src/emails/geofence-arrival-alert.tsx
  - apps/web/src/emails/load-status-notification.tsx
  - apps/web/src/emails/sysadmin-invoice.tsx
  - apps/web/src/emails/support-ticket-created.tsx
  - apps/web/src/emails/support-ticket-reply-to-admin.tsx
  - apps/web/src/emails/support-ticket-reply-to-owner.tsx
  - apps/web/src/emails/workflow-instance-blocked.tsx
  - apps/web/src/emails/workflow-safety-digest.tsx
  - apps/web/scripts/email-render-qa.ts
  - apps/web/.email-qa/**

must_haves:
  truths:
    - "Shell accepts EITHER bodyHtml OR children, never both, and passing both is a COMPILE error not a runtime check"
    - "dynamic-template.tsx compiles untouched and the dispatcher's rendered HTML is byte-identical before and after the Shell change"
    - "A <Button> placed through the children slot renders white-on-Signal-Blue in BOTH colour schemes, measured via getComputedStyle"
    - "All 20 templates render inside one <Html>, one stylesheet, one Header, one Footer, one dark-mode ruleset"
    - "Every migrated template keeps its exported name, its prop signature and the data it displays, and stays synchronous"
    - "All 20 preheaders are distinct and content-derived — proven by extracting them from the 20 rendered HTMLs and finding zero duplicates"
    - "Root-only hex-literal count falls sharply from 296; carrier-only stays at EXACTLY 113"
  artifacts:
    - path: "apps/web/src/emails/_system/Shell.tsx"
      provides: "ShellProps discriminated union + children rendered inside the same .dc-body div"
      contains: "children"
    - path: "apps/web/src/emails/account-exists.tsx"
      provides: "AccountExistsEmail extracted out of sign-up/actions.tsx and migrated onto Shell"
      exports: ["AccountExistsEmail"]
    - path: "apps/web/scripts/email-render-qa.ts"
      provides: "A registry of the 20 templates with representative props; renders + screenshots each"
    - path: "apps/web/.email-qa/templates/"
      provides: "20 light-mode PNGs, one per migrated template"
  key_links:
    - from: "apps/web/src/emails/*.tsx (the 20)"
      to: "apps/web/src/emails/_system"
      via: "import { Shell, Button } from './_system'"
      pattern: "from '\\./_system'"
    - from: "apps/web/src/app/(auth)/sign-up/actions.tsx"
      to: "apps/web/src/emails/account-exists"
      via: "import { AccountExistsEmail }"
      pattern: "from '@/emails/account-exists'"
---

<objective>
Unblock quick-577 by giving `_system/Shell.tsx` an optional `children` slot that is
mutually exclusive with `bodyHtml` **at the type level**, then migrate the 19 LIVE root
templates plus an extracted `AccountExistsEmail` onto it — so all 20 render inside one
`<Html>`, one stylesheet, one Header, one Footer and one dark-mode ruleset instead of 20
hand-copied shells carrying 296 hex literals between them.

Purpose: the dispatcher path already renders through this design system. The 20
non-dispatcher templates are the last surface still shipping the 2024 blue-slab shell with
no dark mode, no preheader and no bulletproof button. This is the convergence.

Output: 1 `_system` file changed (Shell only), 19 templates rewritten, 1 template
extracted and created, 1 import line changed in `sign-up/actions.tsx`, the QA harness
extended to render all 20, and 20 reviewed light-mode screenshots.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/577-email-convergence-2a-delete-orphans-migr/577-SUMMARY.md

@apps/web/src/emails/_system/Shell.tsx
@apps/web/src/emails/_system/tokens.ts
@apps/web/src/emails/_system/Button.tsx
@apps/web/src/emails/_system/index.ts
@apps/web/src/emails/dynamic-template.tsx
@apps/web/scripts/email-render-qa.ts
</context>

<preflight_verified>
## Facts already established off the real source — do NOT re-derive these

**F1 — `@types/react` is 19.2.14, React is 19.2.6.** In React 19 types `React.FC` does NOT
implicitly add `children`. `dynamic-template.tsx:111` renders `<Shell preheader bodyHtml
statusBar accentColor preferencesUrl logoBaseUrl />` — explicit props, no spread, no
children. Under the union below that call matches the `bodyHtml` member with `children`
absent, so **`dynamic-template.tsx` is expected to keep compiling untouched.** You must
still PROVE it by compiling. If it does not compile, STOP the whole plan (see Task 1).

**F2 — `dynamic-template.tsx:111` is the ONLY consumer of the email Shell in the repo.**
Grep-verified. The other `<Shell` hits (`inspection/[dispatchId]/page.tsx`,
`TemplateOfferCard.tsx`) are unrelated local components with their own definitions.
`_system/index.ts` re-exports `Shell, type ShellProps` — that line keeps working with the
union and with a function declaration, so **`index.ts` needs no edit.**

**F3 — the Button repaint hazard the brief warns about is ALREADY FIXED.** `Shell.tsx`'s
dark block ends with `.dc-body a { color:link !important }` followed by
`.dc-body a.dc-btn { color:${colors.white} !important }` (higher specificity, both
`!important`), and `Button.tsx` emits `<a class="dc-btn" …>`. So rendering `children`
inside the SAME `<div className="dc-body">` that `bodyHtml` occupies is both safe AND the
right reading of "the same controlled Section" — and it hands migrated JSX the `.dc-body`
prose reset for free. **Measure it anyway (Task 1 step C). Do not infer it from the CSS
existing.**

**F4 — the body cell is a HAND-ROLLED table, not React Email's `<Section>`**, and the
file records why (measured: `<Section>` puts padding on the `<table>` where it is dropped;
body sat flush at left 51 vs footer correctly inset at left 83). The children variant
renders `<div className="dc-body">{children}</div>` in that exact `<td>`. **Do not
restructure the table** — that is how Task 1's byte-identical proof stays achievable.

**F5 — Shell already renders `Header` and `Footer` itself.** A migrated template must NOT
render its own Header/Footer inside `children` or the email gets two of each. Templates
supply prose + `Button` only. `logoBaseUrl` is REQUIRED on `ShellProps`; each template
passes `getAppBaseUrl()` (synchronous, `src/lib/app-url.ts`) exactly as
`dynamic-template.tsx` does.

**F6 — `preview.html` is gitignored inside `.email-qa/` but the four PNGs are TRACKED.**
`.email-qa/.gitignore` = `preview.html`, `*.mjs`. So the byte-diff artefact is free, but
every QA run rewrites four tracked PNGs — restore them with `git checkout -- .email-qa`
after any run whose commit should not carry them.

**F7 — the QA script cannot render these templates today.** `scripts/email-render-qa.ts`
is hardcoded to `DynamicTemplateEmail` with one Tiptap body, takes no arguments and has no
template registry. It is NOT on the do-not-touch list. Extending it with a 20-entry table
of representative props is a real deliverable with real effort (Task 7), not a one-liner.

**F8 — quick-577 DELETED `document-expiry-reminder.tsx` and `maintenance-reminder.tsx`.**
The list of 19 contains `driver-document-expiry-reminder`, the LIVE near-miss. Do not go
looking for the deleted pair.

**F9 — corrected hex baseline: 409 total / 296 root / 113 carrier / 27 files.** The
audit's 448/29 is stale and was measured with a filter that filtered matched STRINGS, not
paths (see Task 7 for the command that actually filters paths).

**F10 — call sites, all verified. None may change except the one AccountExistsEmail import.**

| Template | Call site |
|---|---|
| welcome-owner, activation-celebration, no-progress-nudge, add-driver-nudge, dispatch-load-nudge, trial-ending-soon | `src/lib/automations/template-registry.ts:13-18` via `React.createElement` |
| confirm-email | `src/app/(auth)/sign-up/actions.tsx:15` |
| AccountExistsEmail | inline at `src/app/(auth)/sign-up/actions.tsx:27`, called `:144` |
| driver-invitation | `send-driver-invitation.ts:9` AND `send-manager-invitation.ts:9` (two importers) |
| owner-invitation | `send-owner-invitation.ts:9` |
| driver-document-expiry-reminder | `send-driver-document-expiry-reminder.ts:9` |
| fleet-message-notification | `send-fleet-message-notifications.ts:10` |
| geofence-arrival-alert | `send-geofence-alert.ts:10` |
| load-status-notification | `customer-notifications.ts:9` |
| sysadmin-invoice | `send-sysadmin-invoice.ts:15` |
| support-ticket-created, support-ticket-reply-to-admin | `send-support-notifications.ts:2-3` |
| support-ticket-reply-to-owner | `send-support-notifications.ts:91` — **a dynamic `await import()`**, not a static one |
| workflow-instance-blocked | `src/server/services/workflows/notifications.ts:21` |
| workflow-safety-digest | `src/app/api/cron/workflow-digest/route.ts:21` |

**F11 — two of the 19 have no `const styles` block already**: `geofence-arrival-alert`
(all inline objects with hex literals) and `workflow-safety-digest` (same). Their literals
still have to go.

**F12 — `fleet-message-notification` has NO url prop**, so it gets no `<Button>`. Prose
only. `sysadmin-invoice` also has no CTA url — it is an invoice, not a nudge.
</preflight_verified>

<migration_recipe>
## The one recipe every template follows

This is deliberately mechanical. Deviating per file is how 20 migrations become 20
different shells again.

**Imports.** Delete every `@react-email/components` import. Import from the design system:

```tsx
import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';
```

Import `colors` / `fonts` / `fontSizes` / `space` from `./_system` ONLY where a structural
element genuinely needs them (see "the two hard ones" below). Prose does not.

**Shape.**

```tsx
export function XxxEmail({ …unchanged props… }: XxxEmailProps) {
  return (
    <Shell
      preheader={`…distinct, content-derived, ideally interpolating a prop…`}
      logoBaseUrl={getAppBaseUrl()}
      /* statusBar / accentColor only where the template genuinely flags something */
    >
      <h2>…</h2>
      <p>…</p>
      <p><strong>Label:</strong> value</p>
      <Button href={ctaUrl} label="Do the thing" />
    </Shell>
  );
}
```

**Use BARE `<h1>` / `<h2>` / `<p>` / `<ul>` / `<li>` / `<strong>` elements, not React
Email's `<Text>` / `<Section>` / `<Heading>`.** `.dc-body` styles bare elements; `<Text>`
carries its own inline styles that fight the reset and defeat dark mode. This is the whole
reason children lands inside `.dc-body`.

**Rules that apply to every file, no exceptions:**

1. Exported component name UNCHANGED. Prop interface name and every field UNCHANGED
   (including whether it is `export`ed — `fleet-message-notification`,
   `geofence-arrival-alert`, `load-status-notification`, `sysadmin-invoice` export theirs).
2. Component stays SYNCHRONOUS. No `async`, no `await`, no Promise anywhere.
3. Every datum the old template displayed still appears. You may re-word prose; you may
   not drop a field.
4. The local `const styles = { … }` block is DELETED from the file, not left unused.
5. NO `DetailRows`. Prose plus a button is the target. Label/value pairs become
   `<p><strong>Label:</strong> value</p>` or a `<ul>`.
6. NO Header, NO Footer, NO `<Html>`, NO `<Body>`, NO `<Preview>` inside the file — Shell
   owns all of those. `<Preview>` becomes Shell's `preheader` prop.
7. Zero hex literals in the finished file.
8. Call site untouched.

**Preheaders.** One per template, distinct, derived from that template's content and
ideally interpolating a prop so it says something specific in the inbox list. Never a
constant shared with another template. Examples of the right shape:

- `driver-invitation` → `` `${organizationName} invited you to join their fleet on DriveCommand` ``
- `trial-ending-soon` → `` `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — keep your fleet running` ``
- `support-ticket-created` → `` `Ticket ${ticketNumber} received — ${priority} priority` ``

Task 7 proves distinctness mechanically. Do not rely on remembering.

**StatusBar / accentColor — use sparingly and only where the old template already
signalled something.** Tones are `info` / `attention` / `success` only.

- `geofence-arrival-alert` already switched its header colour on `stopType`. Preserve that
  signal: `statusBar={{ tone: isPickup ? 'info' : 'success', label: … }}` and
  `accentColor={isPickup ? colors.signalBlue : tintAccents.success}`.
- `trial-ending-soon`, `driver-document-expiry-reminder`, `workflow-instance-blocked` and
  `workflow-safety-digest` (when `overdueCount > 0`) are the natural `attention` cases.
- Everything else: omit. A neutral strip that means nothing is worse than none.

## The two hard ones — read before you get to them

**`sysadmin-invoice.tsx` (305 lines) is NOT prose.** It renders a real line-items table
(`items.map`, subtotal, total) plus a bill-to / invoice-meta block. That table STAYS — it
is the data the email exists to show. Rule 5 (no DetailRows) and rule 4 (delete `const
styles`) still bind, so:

- Keep the `<table>` / `<thead>` / `<tbody>` structure.
- Replace every style value with an expression built from imported tokens
  (`colors.border`, `colors.textSecondary`, `fonts.bodyStack`, `fontSizes.small`,
  `space[3]`, …). **Zero hex literals** is the measurable target.
- If you keep a module-level style object for the table, it must NOT be named `styles`, it
  must contain zero hex literals and zero font-stack literals, and you must state it in the
  summary as a deliberate exception with its reason. A brand-palette copy is what rule 4
  forbids; a token-derived table layout object is not.
- No `<Button>` — this template has no CTA url and must not gain one.

**`workflow-safety-digest.tsx` is the one most likely to read WORSE after migration.** It
currently renders three big numbers in a 3-column stat table. Under "prose plus a button"
those become a sentence or a short list. All three numbers (`overdueCount`,
`completedTodayCount`, `activeInstanceCount`) plus `tenantName` and `date` MUST still
appear — rule 3. Its existing dynamic `previewText` is exactly the right preheader; move it
to `preheader` and delete `<Preview>`. **Flag this one explicitly in the Task 7 review**,
and if the prose version genuinely reads worse than the stat table, say so in the summary
rather than quietly shipping it — a `<ul>` of three `<li>` lines is an acceptable middle
ground and is not DetailRows.
</migration_recipe>

<tasks>

<task type="auto">
  <name>Task 1: GATE — Shell children slot, byte-identical proof, dark-mode measurement</name>
  <files>apps/web/src/emails/_system/Shell.tsx</files>
  <action>
This task is a GATE. If either proof below fails, STOP the entire plan, commit nothing,
and report. The dispatcher path is live in production.

**Before anything:** confirm nothing is listening on port 3000
(`netstat -ano | grep LISTENING | grep :3000`) and kill it if there is. Confirm
`git status --porcelain` is clean.

**A. Capture the BEFORE dispatcher output.**

```bash
cd apps/web
npx tsx scripts/email-render-qa.ts
cp .email-qa/preview.html "$SCRATCH/preview-before.html"
git checkout -- .email-qa          # the 4 PNGs are TRACKED (F6) — restore them
git status --porcelain             # must be empty
```
(`$SCRATCH` = the session scratchpad directory.)

**B. Make the Shell change — and ONLY this change.**

Replace the `ShellProps` type with a discriminated union over an unexported base:

```ts
type ShellBase = {
  /** Inbox preview line. Required — a constant here is a wasted signal. */
  preheader: string;
  /** Optional glanceable strip under the header. */
  statusBar?: StatusBarProps;
  /** Overrides the 3px rule under the header band. */
  accentColor?: string;
  /** Absolute URL to notification preferences. Omitted if absent. */
  preferencesUrl?: string;
  /** Absolute origin for the logo asset. */
  logoBaseUrl: string;
};

export type ShellProps =
  | (ShellBase & { bodyHtml: string;         children?: never })
  | (ShellBase & { bodyHtml?: never;         children: React.ReactNode });
```

Keep every existing JSDoc line, moved onto the corresponding field. `ShellBase` stays
UNEXPORTED — `_system/index.ts` is do-not-touch and re-exports only `Shell` and
`ShellProps`, both of which still resolve (F2).

Convert `export const Shell: React.FC<ShellProps> = ({ … }) => (…)` to a plain function
declaration — `React.FC` with a union prop type narrows badly, and a function declaration
is not a change to any other `_system` file:

```tsx
export function Shell(props: ShellProps) {
  const { preheader, statusBar, accentColor, preferencesUrl, logoBaseUrl } = props;
  ...
}
```

Inside the existing `<td className="dc-dark-text" style={styles.bodyCell}>` — the
hand-rolled table cell, structure UNCHANGED (F4) — render:

```tsx
{props.bodyHtml === undefined ? (
  <div className="dc-body">{props.children}</div>
) : (
  <div className="dc-body" dangerouslySetInnerHTML={{ __html: props.bodyHtml }} />
)}
```

Keep the two existing explanatory comments above that cell verbatim, and extend the first
one to say that `children` is the JSX twin of the same slot and lands in the same
`.dc-body` div so both paths share one stylesheet, one Header, one Footer and one dark
ruleset.

If TypeScript will not narrow `props.children` from the `props.bodyHtml === undefined`
check, the permitted fallback is destructuring through a locally-declared widened alias
(`const { bodyHtml, children } = props as ShellBase & { bodyHtml?: string; children?: React.ReactNode };`)
with a comment saying why. Do NOT add a literal discriminant field — that would force a
change to `dynamic-template.tsx`.

Update the file's top doc block: the "`bodyHtml` arrives from Tiptap completely unstyled"
paragraph should now also state that JSX arriving through `children` lands in the same
`.dc-body` div and therefore inherits the same reset — which is the point.

**C. Prove `dynamic-template.tsx` still compiles, untouched.**

```bash
cd apps/web && npx tsc --noEmit
```
Must be clean. If `dynamic-template.tsx` reports an error: **STOP, revert
`git checkout -- src/emails/_system/Shell.tsx`, and report.** Do not modify
`dynamic-template.tsx`.

Also prove the union actually bites — this is the whole point of doing it at the type
level rather than at runtime. Temporarily add to `Shell.tsx`:
```tsx
const __probe578_both = <Shell preheader="p" logoBaseUrl="u" bodyHtml="<p>x</p>">hi</Shell>;
```
Confirm `tsc` reports an error on THAT line. Delete it. Quote the error in the summary.

**D. Prove the dispatcher output is byte-identical.**

```bash
cd apps/web
npx tsx scripts/email-render-qa.ts
diff "$SCRATCH/preview-before.html" .email-qa/preview.html && echo "BYTE-IDENTICAL"
git checkout -- .email-qa
```
The diff MUST be empty. If it is not: **STOP, revert, report the diff.**

**E. MEASURE the button colour through the children path, both schemes.**

Write a throwaway probe at `apps/web/scripts/__probe578-children.ts` (delete it before
committing — it must not appear in `git status`). It must:

1. Render `<Shell preheader="probe" logoBaseUrl={origin}><p>Body copy.</p><Button href="https://example.com/x" label="Open trip" /></Shell>` via `@react-email/render`.
2. Also render the bodyHtml twin — `DynamicTemplateEmail` with
   `transformBodyHtml('<p>Body copy.</p><p><a href="https://example.com/x">Open trip</a></p>').html` —
   so the two paths can be compared rather than judged alone.
3. Serve both over the throwaway http server pattern already in `email-render-qa.ts`
   (a `file://` load is not equivalent — see that file's header).
4. In Playwright contexts with `colorScheme: 'light'` and `colorScheme: 'dark'`, read via
   `getComputedStyle`:
   - `document.querySelector('.dc-body a.dc-btn')` → `color`
   - its closest `td` → `backgroundColor`
5. Print all eight numbers (2 paths × 2 schemes × 2 properties).

Required result, quoted verbatim in the summary:
`color` is `rgb(255, 255, 255)` and the cell background is `rgb(0, 102, 204)` in BOTH
schemes on BOTH paths. Anything else — particularly a link-blue in dark mode — is a
failure: STOP and report.

**F. Clean up and commit.** Delete the probe file. `git status --porcelain` must show
exactly one modified path: `apps/web/src/emails/_system/Shell.tsx`.
  </action>
  <verify>
`npx tsc --noEmit` clean (and reported an error on the both-props probe while it was
present); `diff preview-before.html preview.html` empty; the eight measured colour values
printed and correct; `git status --porcelain` shows only `Shell.tsx`.
  </verify>
  <done>
Shell accepts `children` XOR `bodyHtml` as a compile-time guarantee, the dispatcher's
rendered HTML has not moved one byte, and a Button through the children path is measured
white-on-Signal-Blue in light and dark. Commit: `feat(quick-578): add a children slot to the email Shell, mutually exclusive with bodyHtml`
  </done>
</task>

<task type="auto">
  <name>Task 2: Migrate the 6 automations templates</name>
  <files>apps/web/src/emails/activation-celebration.tsx, apps/web/src/emails/add-driver-nudge.tsx, apps/web/src/emails/dispatch-load-nudge.tsx, apps/web/src/emails/no-progress-nudge.tsx, apps/web/src/emails/trial-ending-soon.tsx, apps/web/src/emails/welcome-owner.tsx</files>
  <action>
Apply `<migration_recipe>` to all six. These are the closest to the ideal shape — each is
a greeting, two or three paragraphs, one CTA, a `— Sammy` signature and a footer. The
footer copy goes away (Shell's Footer owns it); the signature line stays as a `<p>`.

Before editing, capture the six export signatures so the after-state can be diffed:
```bash
cd apps/web
for f in activation-celebration add-driver-nudge dispatch-load-nudge no-progress-nudge trial-ending-soon welcome-owner; do
  echo "### $f"; awk '/^(export )?interface .*Props \{/,/^\}/' src/emails/$f.tsx
  grep -n "^export function" src/emails/$f.tsx
done | tee "$SCRATCH/sigs-t2-before.txt"
```
Re-run after and `diff`. It must be empty.

Per-template notes:

- **welcome-owner** — props `firstName, companyName, trialEndsAt, dashboardUrl`. All four
  must still appear; `trialEndsAt` is currently rendered and must remain.
- **activation-celebration** — `firstName, companyName, dashboardUrl`.
- **no-progress-nudge** — `firstName, companyName, dashboardUrl`.
- **add-driver-nudge** — `firstName, companyName, driversUrl`. Note the existing
  destructure renames `companyName: _companyName` (unused). Keep the prop in the interface;
  you may keep or drop the underscore rename depending on whether your prose uses it —
  the INTERFACE is what must not change.
- **dispatch-load-nudge** — `firstName, companyName, loadsUrl`.
- **trial-ending-soon** — `firstName, companyName, daysLeft, subscriptionUrl`. Give it
  `statusBar={{ tone: 'attention', label: … }}` with a `daysLeft`-derived label.

The nudges each open with a `// Sent via resend-client.ts …` comment block naming the rule
key and trigger. **Keep those comments** — they are the only place the automation wiring is
documented at the template.

Call site (`src/lib/automations/template-registry.ts`) is UNTOUCHED. Confirm with
`git diff --name-only` that it does not appear.
  </action>
  <verify>
`diff "$SCRATCH/sigs-t2-before.txt"` against the re-captured signatures → empty.
`grep -c "^const styles" src/emails/{the six}.tsx` → 0 each.
`grep -ohE "#[0-9a-fA-F]{3,8}\b" src/emails/{the six}.tsx | wc -l` → 0.
`grep -n "async" src/emails/{the six}.tsx` → nothing.
`npx tsc --noEmit` clean.
`git diff --name-only` lists exactly the six files.
  </verify>
  <done>
All six render through Shell with distinct preheaders, zero hex literals, zero `const
styles`, unchanged exports and an untouched template registry.
Commit: `refactor(quick-578): migrate the 6 automations templates onto the email Shell`
  </done>
</task>

<task type="auto">
  <name>Task 3: Migrate invitations + auth, and extract AccountExistsEmail</name>
  <files>apps/web/src/emails/confirm-email.tsx, apps/web/src/emails/driver-invitation.tsx, apps/web/src/emails/owner-invitation.tsx, apps/web/src/emails/account-exists.tsx, apps/web/src/app/(auth)/sign-up/actions.tsx</files>
  <action>
Capture-and-diff the export signatures as in Task 2 (`$SCRATCH/sigs-t3-before.txt`).

**Migrate three existing templates** per `<migration_recipe>`:

- **confirm-email** — `ConfirmEmailTemplate({ firstName, confirmUrl })`. Keep the "valid
  for 24 hours" sentence and the "if you didn't create an account, ignore this" note.
- **driver-invitation** — `DriverInvitationEmail({ firstName, lastName, organizationName, acceptUrl, expiresAt })`.
  **Two importers** (`send-driver-invitation.ts` and `send-manager-invitation.ts`) — neither
  may change.
- **owner-invitation** — `OwnerInvitationEmail({ firstName, lastName, organizationName, acceptUrl, expiresAt })`.

driver- and owner-invitation are near-identical files with different copy. Keep them as two
files with two exports; do not "helpfully" merge them.

**Extract AccountExistsEmail.**

Create `apps/web/src/emails/account-exists.tsx` (kebab-case, matching every sibling):

```tsx
export function AccountExistsEmail({ signInUrl }: { signInUrl: string }) { … }
```

The exported name and the inline prop type `{ signInUrl: string }` are UNCHANGED — the call
site passes an object literal and must keep compiling. Migrate it onto Shell with the same
three sentences it has today (someone tried to sign up with your address / if that was you,
sign in / if it wasn't, no action needed) plus a `<Button href={signInUrl} label="Sign in to DriveCommand" />`.
This one has never had a preheader; give it a real one — it is an unsolicited security-shaped
email and the inbox line matters more here than anywhere else in the set.

Note the file's own comment says "Minimal inline template for duplicate-email path". Carry
a short version of that rationale into the new file's doc block, plus a line recording that
quick-577 found it uncounted by the audit because it did not live under `src/emails/`.

In `src/app/(auth)/sign-up/actions.tsx`:
- Delete the `function AccountExistsEmail(…)` definition (`:27-42`) and its comment.
- Delete the now-unused `@react-email/components` import block (`:18-24`) — verify with
  grep that nothing else in the file uses `Html`/`Body`/`Container`/`Text`/`Button` first.
- Add `import { AccountExistsEmail } from '@/emails/account-exists';` beside the existing
  `ConfirmEmailTemplate` import at `:15`.
- **Change nothing else.** `signUpAction`'s behaviour, signature, the rate limiter, the
  duplicate-detection branch and the `sendEmail({ …, react: AccountExistsEmail({ signInUrl: … }) })`
  call at `:144` all stay exactly as they are. Prove it:
  `git diff src/app/\(auth\)/sign-up/actions.tsx` must show ONLY the two import edits and
  the deleted function. Quote that diff in the summary.

If the file still ends up `.tsx` after the JSX leaves it — it will, `ConfirmEmailTemplate`
is called as a function not as JSX, so there may be no JSX left. **Do not rename the file.**
A server-action file rename is a route-adjacent change and is out of scope.
  </action>
  <verify>
Signature diff empty for the three migrated templates.
`grep -n "AccountExistsEmail" src/app/\(auth\)/sign-up/actions.tsx` shows an import and the
call at its original position, no local definition.
`git diff --stat src/app/\(auth\)/sign-up/actions.tsx` shows a deletion-dominated diff with
no change to `signUpAction`.
Zero hex literals and zero `const styles` in all four email files.
`npx tsc --noEmit` clean.
  </verify>
  <done>
confirm-email, driver-invitation and owner-invitation render through Shell;
AccountExistsEmail lives in its own file, renders through Shell, and `sign-up/actions.tsx`
differs only by an import path.
Commit: `refactor(quick-578): migrate invitation + auth emails onto the Shell, extract AccountExistsEmail`
  </done>
</task>

<task type="auto">
  <name>Task 4: Migrate the reminder and alert templates</name>
  <files>apps/web/src/emails/driver-document-expiry-reminder.tsx, apps/web/src/emails/fleet-message-notification.tsx, apps/web/src/emails/geofence-arrival-alert.tsx, apps/web/src/emails/load-status-notification.tsx, apps/web/src/emails/sysadmin-invoice.tsx</files>
  <action>
This is the heaviest task in the plan (1000 lines across five files, including the
305-line invoice). Work one file at a time, `tsc` after each, and do not batch-edit.

Capture-and-diff the export signatures (`$SCRATCH/sigs-t4-before.txt`). Note that FOUR of
these five `export` their props interface — `FleetMessageNotificationEmailProps`,
`GeofenceArrivalAlertProps`, `LoadStatusNotificationEmailProps`,
`SysAdminInvoiceEmailProps`. The `export` keyword must survive.

- **driver-document-expiry-reminder** (227 lines) — `driverName, documentType, expiryDate,
  daysUntilExpiry, dashboardUrl`. `statusBar={{ tone: 'attention', … }}`. All five values
  must still appear.
  **F8: this is the LIVE one.** The similarly-named `document-expiry-reminder.tsx` was
  deleted by quick-577 and does not exist. Do not look for it.

- **fleet-message-notification** (181 lines) — `recipientName, senderName, senderRole,
  messagePreview, routeName?`. **No url prop, so NO `<Button>`** (F12). The message preview
  is quoted content — render it as a `<blockquote>` or an indented `<p>`; `.dc-body` styles
  `p` but not `blockquote`, so if you use `blockquote` give it a token-built inline style.
  `routeName` is optional and must stay conditional.

- **geofence-arrival-alert** (81 lines, no `const styles` — all inline hex) — `loadNumber,
  stopType, stopAddress, driverName, licensePlate, loadUrl`. It derives `isPickup`,
  `headerColor`, `stopLabel` and `headline` locally. Preserve the pickup/delivery signal
  through `statusBar` + `accentColor` per the recipe, not through a hand-coloured header
  band. `headline` becomes the `<h2>`; the four detail values become `<p><strong>…</strong>`
  lines. `<Button href={loadUrl} label="View load" />`.

- **load-status-notification** (206 lines) — `customerName, loadNumber, status, origin,
  destination, driverName, truckInfo, estimatedDelivery?, trackingUrl`. Nine fields, one
  optional. This is customer-facing (sent to the shipper), so the copy should read as an
  update, not an internal alert. `<Button href={trackingUrl} label="Track this shipment" />`.

- **sysadmin-invoice** (305 lines) — see "the two hard ones" in `<migration_recipe>`. Keep
  the line-items table and the bill-to / meta block; rebuild every style value from
  `_system` tokens; zero hex literals; no `<Button>`; `notes` stays conditional. This one
  file may keep a non-`styles`-named, token-only style object — declare it in the summary
  as a deliberate exception with its reason if you use one.

None of the five call sites may change. Confirm with `git diff --name-only`.
  </action>
  <verify>
Signature diff empty (including the four `export`ed interfaces).
`grep -c "^const styles" src/emails/{the five}.tsx` → 0 each.
`grep -ohE "#[0-9a-fA-F]{3,8}\b" src/emails/{the five}.tsx | wc -l` → 0.
No `async` in any of the five.
`npx tsc --noEmit` clean.
`git diff --name-only` lists exactly the five template files.
  </verify>
  <done>
All five render through Shell with distinct preheaders and zero hex literals; the invoice's
line-items table survives intact and token-built; geofence's pickup/delivery colour signal
survives as a StatusBar tone.
Commit: `refactor(quick-578): migrate the reminder and alert emails onto the Shell`
  </done>
</task>

<task type="auto">
  <name>Task 5: Migrate the 3 support templates</name>
  <files>apps/web/src/emails/support-ticket-created.tsx, apps/web/src/emails/support-ticket-reply-to-admin.tsx, apps/web/src/emails/support-ticket-reply-to-owner.tsx</files>
  <action>
Capture-and-diff the export signatures (`$SCRATCH/sigs-t5-before.txt`).

- **support-ticket-created** — `ticketNumber, title, category, priority, submitterEmail,
  ticketUrl`. Preheader should carry the ticket number AND the priority — that is what a
  sysadmin triages on from the message list.
- **support-ticket-reply-to-admin** — `ticketNumber, title, body, submitterEmail, ticketUrl`.
- **support-ticket-reply-to-owner** — `ticketNumber, title, body, ownerEmail, ticketUrl`.

The two reply templates are near-twins. Keep them as two files with two exports and two
DISTINCT preheaders — "a reply on ticket X" reaching an admin and reaching a tenant owner
are different events and must not share an inbox line.

`body` is the free-text reply. Render it as quoted content the way
`fleet-message-notification` renders `messagePreview`, and keep the two consistent — same
element, same treatment. `body` may contain newlines: preserve whatever the current file
does about that (check before you rewrite; if it currently renders raw in a `<Text>`,
`white-space: pre-wrap` via a token-built inline style is the honest equivalent). Do NOT
introduce `dangerouslySetInnerHTML` — this is user-supplied text.

**`support-ticket-reply-to-owner` is imported via a dynamic `await import()` at
`send-support-notifications.ts:91`**, not statically (F10). It still must not change, and
the dynamic import still resolves the same named export.
  </action>
  <verify>
Signature diff empty.
Zero `const styles`, zero hex literals across the three.
`grep -rn "dangerouslySetInnerHTML" src/emails/support-*.tsx` → nothing.
`npx tsc --noEmit` clean.
`git diff --name-only` lists exactly the three files.
  </verify>
  <done>
All three render through Shell with three distinct preheaders and no raw-HTML injection of
the user-supplied reply body.
Commit: `refactor(quick-578): migrate the 3 support-ticket emails onto the Shell`
  </done>
</task>

<task type="auto">
  <name>Task 6: Migrate the 2 workflow templates</name>
  <files>apps/web/src/emails/workflow-instance-blocked.tsx, apps/web/src/emails/workflow-safety-digest.tsx</files>
  <action>
Capture-and-diff the export signatures (`$SCRATCH/sigs-t6-before.txt`).

- **workflow-instance-blocked** (202 lines) — `driverName, stepName, playbookName,
  tenantName, hoursBlocked, dashboardUrl`. `statusBar={{ tone: 'attention', … }}` — this is
  an operational block and it is exactly what the strip exists for. All six values appear.

- **workflow-safety-digest** (119 lines) — `tenantName, date, overdueCount,
  completedTodayCount, activeInstanceCount, dashboardUrl`. Read "the two hard ones" in
  `<migration_recipe>` first. Its existing `previewText` const (overdue-count aware) becomes
  the `preheader`; delete the `<Preview>` element. Give it
  `statusBar={{ tone: 'attention', … }}` only when `overdueCount > 0` — otherwise omit,
  matching its current conditional alert paragraph. All three counts plus `tenantName` and
  `date` must still appear. It currently renders them as three large numbers in a
  3-column table; a `<ul>` of three `<li>` lines is an acceptable middle ground and is not
  DetailRows. **This is the template most likely to read worse after migration — you will
  review its screenshot in Task 7 and must report honestly if it does.**

  Its footer sentence ("You are receiving this because you are an owner or manager on
  {tenantName} DriveCommand. Daily digest sent at 8:00 AM UTC.") is real information the
  shared Footer does not carry. Keep it as a small `<p>` at the end of the children, not as
  a second footer band.
  </action>
  <verify>
Signature diff empty.
`grep -n "Preview" src/emails/workflow-safety-digest.tsx` → nothing.
Zero `const styles`, zero hex literals across both.
`npx tsc --noEmit` clean.
`git diff --name-only` lists exactly the two files.
  </verify>
  <done>
Both render through Shell; the digest's dynamic preview line became its preheader and all
three of its counts survive.
Commit: `refactor(quick-578): migrate the 2 workflow emails onto the Shell`
  </done>
</task>

<task type="auto">
  <name>Task 7: Extend the QA harness, render + review all 20, recount hex, full verification, summary</name>
  <files>apps/web/scripts/email-render-qa.ts, apps/web/.email-qa/**, .planning/quick/578-email-convergence-2a-2-shell-children-sl/578-SUMMARY.md</files>
  <action>
**A. Extend `scripts/email-render-qa.ts` (F7).**

The script today is hardcoded to `DynamicTemplateEmail` with one Tiptap body. Keep that
existing four-state run EXACTLY as it is — it is the dispatcher regression check and the
four tracked PNGs are its committed evidence. ADD a second phase:

- A `TEMPLATES` table: 20 entries of `{ name, Component, props }` with REPRESENTATIVE props
  for every template. Realistic values, not `'foo'` — a real-looking ticket number, a real
  driver name, a plausible date, an invoice with 2-3 line items. The screenshots are only
  worth reviewing if the data is shaped like real data.
- Include optional props on at least a few entries (`estimatedDelivery`, `routeName`,
  `notes`) so the conditional branches are actually exercised, and set
  `workflow-safety-digest`'s `overdueCount` above zero so its attention path renders.
- For each entry: `render(React.createElement(Component, props))`, write
  `.email-qa/templates/{name}.html`, and screenshot LIGHT mode to
  `.email-qa/templates/{name}.png` at the existing VIEWPORT/SCALE, served over the same
  throwaway http server (a `file://` load is not equivalent — see the script's own header).
- Print each template's byte size against `GMAIL_CLIP_LIMIT` and fail loudly on any that
  exceed it (`sysadmin-invoice` with many line items is the realistic candidate).
- **Extract each rendered preheader** from its HTML — the text inside
  `<div class="dc-preheader" …>`, stripped of the U+200C/U+200A padding run — and print
  a `name → preheader` table, then print any DUPLICATE preheader as an explicit FAIL line.
  This is the mechanical distinctness proof; duplication is invisible one file at a time.

Add `templates/*.html` to `.email-qa/.gitignore` (the HTML is a byproduct; the PNGs are the
reviewed evidence and stay tracked, matching the existing convention in that file).

Run: `cd apps/web && npx tsx scripts/email-render-qa.ts`.

**B. Review all 20 screenshots.** Open and actually look at every one. In the summary,
give a one-line verdict per template. Flag anything that reads WORSE than before
migration — the brief names the automations nudges and `workflow-safety-digest` as the
specific risks, and the digest is the one that lost a stat table. If one reads worse, say
so; do not ship a silent regression behind a green checklist.

**C. Recount hex literals with a filter that filters PATHS (F9).**

```bash
cd apps/web
FILES=$(grep -rlE "#[0-9a-fA-F]{3,8}\b" src/emails --include=*.tsx | grep -v '/_system/')
ROOT=$(echo "$FILES" | grep -v '/carrier/' | grep -v '^$')
CARR=$(echo "$FILES" | grep '/carrier/' | grep -v '^$')
echo "root files:    $(echo "$ROOT" | grep -c . )"
echo "carrier files: $(echo "$CARR" | grep -c . )"
echo "root literals:    $(echo "$ROOT" | xargs -r grep -EohI '#[0-9a-fA-F]{3,8}\b' | wc -l)"
echo "carrier literals: $(echo "$CARR" | xargs -r grep -EohI '#[0-9a-fA-F]{3,8}\b' | wc -l)"
```

Report against quick-577's corrected baseline of **409 total / 296 root / 113 carrier /
27 files**. Expected: root falls to 0 (or near it — name every survivor and why),
**carrier stays at EXACTLY 113**. Carrier at 113 is a scope assertion, not a curiosity: it
proves `src/emails/carrier/**` was not touched. If it moved, something was touched that
should not have been.

**D. Preheader table.** Reproduce the 20 `name → preheader` pairs from step A in the
summary, plus the duplicate check result. `sort | uniq -d` over the 20 must be empty.

**E. Verification gates.**

1. **tsc, PROBED.** Inject `const __probe578: number = 'x';` into a file you actually
   edited (e.g. `src/emails/welcome-owner.tsx`), run `npx tsc --noEmit`, confirm it reports
   THAT error at THAT line, `git checkout --` the file, re-run clean. **If the only errors
   are syntax errors, or errors in files you did not touch, the gate is BLIND** — delete
   `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` and re-run.
   Quote both runs.
2. **`npx next build`** — must exit 0. (The pre-existing "package seems invalid /
   require() resolves to an EcmaScript module" warning is unrelated and predates this task.)
3. **Full Vitest**, `--reporter=default` at both ends, run in the MAIN tree (never a
   worktree — `.env.local` is untracked and a worktree measures something else).
   Baseline: **162 files (17 failed / 137 passed / 8 skipped), 1806 tests (1679 passed /
   63 failed / 61 skipped / 3 todo)**. Take a fresh baseline with `git stash` if you want
   to be certain, and run it AFTER the last code commit, not before.
   **A run with no `Test Files … | Tests …` summary line is NOT a green run.**
   Only two suites are email-adjacent — `src/lib/email/__tests__/transport.test.ts`
   (imports `dynamic-template`) and `src/lib/carrier/__tests__/dispatch-assigned-email.test.ts`
   (carrier, untouched). Neither imports any of the 20. So a delta here is a real
   regression, not an inherited one — but check the importer before concluding either way.
4. **Do-not-touch audit.** `git diff --stat <base>..HEAD` over all seven commits. The ONLY
   `_system/` path permitted is `Shell.tsx`. There must be no `src/emails/carrier/**`, no
   `dynamic-template.tsx`, `body-html-transform.ts`, `template-renderer.ts`, `dispatcher.ts`,
   `resend-client.ts`, `sender-config.ts`, `html-to-text.ts`, `middleware.ts`,
   `route-access.ts`, no seed file, no `prisma/schema.prisma`, neither `vercel.json`. The
   only non-email source file permitted is `src/app/(auth)/sign-up/actions.tsx`. Paste the
   stat.
5. Nothing marked `.skip`. The `defaultHtmlCache` refresh script was NOT run.
6. Nothing listening on port 3000 at the end.

**F. Write the summary** at
`.planning/quick/578-email-convergence-2a-2-shell-children-sl/578-SUMMARY.md` using the GSD
summary template. It must contain, at minimum:
- The Task-1 gate evidence: the both-props compile error, the empty `preview.html` diff,
  and the eight measured colour values.
- The 20-row preheader table + duplicate check.
- The 20-row screenshot verdict table, with any "reads worse" flagged honestly.
- The hex recount against 409/296/113/27.
- Every deliberate exception taken (the `sysadmin-invoice` table style object; anything
  else) with its reason.
- The tsc probe transcript, the `next build` result, the Vitest before/after, the
  `git diff --stat`.
  </action>
  <verify>
`.email-qa/templates/` holds 20 PNGs. The script prints 20 preheaders and zero duplicates.
Root hex literals reported against 296; carrier reported as exactly 113.
tsc probe transcript shows the injected error then a clean run. `next build` exits 0.
Vitest matches 1806/1679/63/61/3. `git diff --stat` contains no do-not-touch path.
  </verify>
  <done>
All 20 templates render, are screenshotted and have been individually looked at; preheader
distinctness is mechanically proven; the hex count is re-measured with a path filter that
actually filters paths; every gate is green and probed; the summary records the evidence
rather than asserting the outcome.
Commit: `docs(quick-578): QA harness for all 20 templates, 20 screenshots, summary`
  </done>
</task>

</tasks>

<verification>
**The gate.** Task 1 is a hard stop. If `dynamic-template.tsx` fails to compile, or the
`preview.html` diff is non-empty, or the button measures anything but
`rgb(255, 255, 255)` on `rgb(0, 102, 204)` in either scheme — revert, commit nothing, and
report. Everything downstream is worthless if the dispatcher path moved.

**Per-template, all 20:**
- [ ] Exported component name unchanged (captured before, diffed after)
- [ ] Props interface name, `export` keyword and every field unchanged
- [ ] Component is SYNCHRONOUS
- [ ] `const styles` block deleted from the file
- [ ] Zero hex literals in the file
- [ ] Distinct, content-derived preheader
- [ ] No DetailRows
- [ ] No own `<Html>` / `<Body>` / `<Preview>` / Header / Footer
- [ ] Every datum the old version displayed still appears
- [ ] Call site untouched (sole exception: the AccountExistsEmail import path)

**Whole-task:**
- [ ] `npx tsc --noEmit` clean AND probed
- [ ] `npx next build` exits 0
- [ ] Vitest 1806 / 1679 / 63 / 61 / 3, same reporter both ends, main tree
- [ ] `git diff --stat` shows `Shell.tsx` as the only `_system/` path and no do-not-touch path
- [ ] Carrier hex literals still exactly 113
- [ ] Nothing on port 3000
- [ ] Nothing `.skip`ped; `defaultHtmlCache` refresh script not run
</verification>

<success_criteria>
- `ShellProps` is a discriminated union; passing both `bodyHtml` and `children` is a
  COMPILE error (proven by a probe), and `dynamic-template.tsx` compiles untouched.
- The dispatcher's rendered HTML is byte-identical before and after (`diff` empty).
- A `<Button>` through the children slot measures white on Signal Blue in BOTH schemes.
- 19 root templates + `account-exists.tsx` render through Shell, with 20 distinct
  preheaders proven by extraction, zero `const styles` blocks and zero hex literals.
- `sign-up/actions.tsx` differs only by the removed inline component and its imports.
- Root-only hex literals fall sharply from 296; carrier stays at exactly 113.
- 20 light-mode screenshots exist, have been individually reviewed, and any regression —
  particularly `workflow-safety-digest` — is reported rather than buried.
- Seven commits, one per task, in the group order the brief mandates.
</success_criteria>

<output>
After completion, create
`.planning/quick/578-email-convergence-2a-2-shell-children-sl/578-SUMMARY.md`.
</output>
</content>
</invoke>
