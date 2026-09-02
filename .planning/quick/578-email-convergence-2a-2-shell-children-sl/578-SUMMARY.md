---
phase: quick-578
plan: 578
subsystem: email
tags: [nextjs, react-email, typescript, playwright, vitest, discriminated-union]

requires:
  - phase: quick-577
    provides: "4 confirmed-dead email files deleted, live driver-document-expiry near-miss verified intact, the Shell architectural blocker written up in full, and a re-measured hex baseline (409 total / 296 root / 113 carrier / 27 files)"
provides:
  - "Shell.tsx ShellProps discriminated union: bodyHtml XOR children, enforced at compile time, dynamic-template.tsx compiles untouched and the dispatcher's rendered HTML is unchanged"
  - "19 root templates + a newly-extracted AccountExistsEmail (20 total) migrated onto Shell/Button, zero hex literals, zero const styles blocks, all exports/props/preheaders verified"
  - "sign-up/actions.tsx differs from its quick-577 state only by an import swap and the deleted inline AccountExistsEmail definition"
  - "email-render-qa.ts extended with a 20-template registry, 20 reviewed light-mode screenshots, and a mechanical preheader-distinctness check"
affects: [email-convergence-2b, document-import-notifications]

tech-stack:
  added: []
  patterns:
    - "ShellProps as a discriminated union over an unexported ShellBase, with bodyHtml?:never / children?:never on the opposite branch — makes passing both a TS2322 rather than a runtime check"
    - "Shell converted from React.FC<ShellProps> to a plain function declaration so the union narrows correctly on props.bodyHtml === undefined"
    - "Quoted user-supplied or reply content renders as a <blockquote> with a token-built inline style that omits `color` entirely, so the ancestor's dc-dark-text class (not an inline override) decides the colour in both schemes"
    - "A table that is real data (sysadmin-invoice's line items) keeps its <table> structure and a token-derived, non-`styles`-named layout object, rather than being flattened into prose"

key-files:
  created:
    - apps/web/src/emails/account-exists.tsx
  modified:
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
    - apps/web/.email-qa/.gitignore

key-decisions:
  - "The dispatcher's byte-identical proof used a port-normalized diff: the QA harness's throwaway http server binds :0 (OS-assigned) every run, so even two runs of unmodified code differ by port number alone — confirmed by running the unmodified script twice and seeing the identical class of diff, then normalizing 127.0.0.1:PORT before comparing"
  - "workflow-safety-digest's 3-column stat table became a <ul> of 3 lines per the plan's accepted middle ground; reviewed and confirmed it reads adequately but loses the original's glanceable-at-a-distance visual punch — reported rather than silently shipped"
  - "sysadmin-invoice keeps a module-level `tableStyles` object (not named `styles`) — real line-item/invoice-meta table data, every value token-derived, zero hex literals, stated as the plan's named deliberate exception"
  - "Two blockquote-based quote treatments (fleet-message-notification, both support-ticket replies) deliberately omit an inline `color` so the ancestor body cell's dark-mode class — not an inline override — decides text colour in both schemes"

patterns-established:
  - "A byte-identical proof must normalize any harness-introduced non-determinism (ephemeral ports, timestamps) before comparing, and that normalization must itself be verified against two unmodified runs before trusting a diff on the real before/after"
  - "tsc baseline/after comparisons for a task spanning historical commits use `git checkout <rev> -- <paths>` in the MAIN tree (never a worktree) to get a true pre-task Vitest baseline, then `git checkout HEAD -- <paths>` to restore, with a `git stash` held for genuinely uncommitted work in between"

duration: ~2h10min
completed: 2026-09-02
---

# Quick Task 578: Email Convergence 2A/2 — Shell Children Slot Summary

**Shell.tsx gained a compile-time-enforced `bodyHtml` XOR `children` union with zero drift to the live dispatcher path, and all 19 root templates plus a newly-extracted `AccountExistsEmail` (20 total) now render through it — cutting root-scoped hex literals from 296 to 0 while leaving `src/emails/carrier/**` untouched at exactly 113.**

## 1. Shell.tsx — the discriminated union and the compile-error proof

Full diff (Task 1 commit `ba0d0a5c`):

```diff
-export type ShellProps = {
+type ShellBase = {
   preheader: string;
-  bodyHtml: string;
   statusBar?: StatusBarProps;
   accentColor?: string;
   preferencesUrl?: string;
   logoBaseUrl: string;
 };

+export type ShellProps =
+  | (ShellBase & { bodyHtml: string; children?: never })
+  | (ShellBase & { bodyHtml?: never; children: React.ReactNode });
```

`Shell` converted from `React.FC<ShellProps>` to a plain function declaration (`export function Shell(props: ShellProps)`), because a `React.FC` with a union prop type narrows badly. Inside the existing hand-rolled `<td>`:

```tsx
{props.bodyHtml === undefined ? (
  <div className="dc-body">{props.children}</div>
) : (
  <div className="dc-body" dangerouslySetInnerHTML={{ __html: props.bodyHtml }} />
)}
```

**Compile-error proof.** Added, compiled, and deleted this probe:
```tsx
const __probe578_both = <Shell preheader="p" logoBaseUrl="u" bodyHtml="<p>x</p>">hi</Shell>;
```
`npx tsc --noEmit` reported, verbatim:
```
src/emails/_system/Shell.tsx(159,26): error TS2322: Type '{ children: string; preheader: string; logoBaseUrl: string; bodyHtml: string; }' is not assignable to type 'IntrinsicAttributes & ShellProps'.
  Types of property 'bodyHtml' are incompatible.
    Type 'string' is not assignable to type 'undefined'.
```
Probe deleted; re-run was clean. `git status --porcelain` after Task 1 showed exactly one path: `apps/web/src/emails/_system/Shell.tsx`.

## 2. `dynamic-template.tsx` untouched + byte-identical dispatcher output

`git diff --stat 2cb784c0..HEAD -- apps/web/src/emails/dynamic-template.tsx` returns **empty** — the file was never opened for edit across all seven commits.

The byte-identical proof needed one correction to the plan's literal recipe. The QA harness's throwaway HTTP server binds `server.listen(0, '127.0.0.1', ...)` — an OS-assigned ephemeral port — so the rendered HTML's `<img src="http://127.0.0.1:PORT/...">` differs by port number on **every** invocation, including two runs of completely unmodified code. Verified this was harness noise, not a Shell regression, before trusting anything:

```
$ git stash                      # temporarily revert Shell.tsx
$ npx tsx scripts/email-render-qa.ts   # run A (pre-Shell-change)
$ npx tsx scripts/email-render-qa.ts   # run B (pre-Shell-change, same code)
$ diff run-A run-B
```
Both diffed identically to the real before/after — same shape, port-only — confirming the port is non-deterministic per run rather than a code difference. `git stash pop` restored the real change, and the comparison was re-run with the port normalized:

```
$ sed -E 's#127\.0\.0\.1:[0-9]+#127.0.0.1:PORT#g' preview-before.html > before.norm.html
$ sed -E 's#127\.0\.0\.1:[0-9]+#127.0.0.1:PORT#g' preview.html        > after.norm.html
$ diff before.norm.html after.norm.html && echo "BYTE-IDENTICAL (port-normalized)"
BYTE-IDENTICAL (port-normalized)
```
Byte size of the dispatcher's rendered HTML was also identical before and after: **10016 bytes** both times.

## 3. Dark-mode measurement — Button through the children path

A throwaway probe (`scripts/__probe578-children.ts`, deleted before commit, confirmed absent from `git status`) rendered the same CTA through both Shell paths — `children` (real JSX: `<p>` + `<Button>`) and `bodyHtml` (the dispatcher's twin, via `transformBodyHtml`) — served over the same throwaway HTTP pattern as the QA harness, then read `getComputedStyle` in both `colorScheme: 'light'` and `colorScheme: 'dark'` Playwright contexts:

```
/children / light: color=rgb(255, 255, 255)  bg=rgb(0, 102, 204)
/bodyhtml / light: color=rgb(255, 255, 255)  bg=rgb(0, 102, 204)
/children / dark:  color=rgb(255, 255, 255)  bg=rgb(0, 102, 204)
/bodyhtml / dark:  color=rgb(255, 255, 255)  bg=rgb(0, 102, 204)
```
All eight values match the required result exactly: white text (`rgb(255,255,255)`) on Signal Blue (`rgb(0,102,204)`), both schemes, both paths.

## 4. The 20 migrated templates

| File | Exported name unchanged | Props unchanged | `const styles` removed | Preheader used |
|---|---|---|---|---|
| welcome-owner.tsx | y | y | y | "Welcome to DriveCommand, {firstName} — your 14-day trial runs until {trialEndsAt}" |
| activation-celebration.tsx | y | y | y | "{companyName} just finished onboarding — full reporting and the profit predictor are unlocked" |
| no-progress-nudge.tsx | y | y | y | "Hey {firstName} — pick up DriveCommand where you left off, it takes 2 minutes" |
| add-driver-nudge.tsx | y | y | y | "Nice work, {firstName} — invite a driver to unlock assignments, HOS and the live map" |
| dispatch-load-nudge.tsx | y | y | y | "{firstName}, create your first load to unlock revenue tracking and profit per lane" |
| trial-ending-soon.tsx | y | y | y | "Your trial ends in {daysLeft} {day/days} — keep your fleet running" |
| confirm-email.tsx | y | y | y | "Confirm your email, {firstName} — this link is valid for 24 hours" |
| driver-invitation.tsx | y | y | y | "{organizationName} invited you to join their fleet on DriveCommand" |
| owner-invitation.tsx | y | y | y | "{organizationName} is ready — set up your DriveCommand owner account" |
| account-exists.tsx (new) | y (matches inline original) | y | n/a (never had one) | "Someone tried to sign up for DriveCommand with your email address" |
| driver-document-expiry-reminder.tsx | y | y | y | "{driverName}'s {documentType} — {expires in N days / expired N days ago}" |
| fleet-message-notification.tsx | y | y | y | "New message from {senderName} ({roleLabel}){ — routeName}" |
| geofence-arrival-alert.tsx | y | y | n/a (never had one) | "{headline} — {stopAddress}" |
| load-status-notification.tsx | y | y | y | "Load {loadNumber} update: {statusLabel} — {destination}" |
| sysadmin-invoice.tsx | y | y | y (deliberate `tableStyles` exception, see §8) | "Invoice {invoiceNumber} for {tenantName} — {total} due {dueDate}" |
| support-ticket-created.tsx | y | y | y | "Ticket {ticketNumber} received — {priority} priority" |
| support-ticket-reply-to-admin.tsx | y | y | y | "Owner reply on ticket {ticketNumber} — {title}" |
| support-ticket-reply-to-owner.tsx | y | y | y | "Support replied on ticket {ticketNumber} — {title}" |
| workflow-instance-blocked.tsx | y | y | y | "{driverName} has been blocked from dispatch for over {hoursBlocked} hours" |
| workflow-safety-digest.tsx | y | y | n/a (never had one) | previewText (unchanged: "{overdueCount} overdue steps — review needed" / "{completedTodayCount} steps completed today") |

Every interface's field list, `export` keyword (where present: `FleetMessageNotificationEmailProps`, `GeofenceArrivalAlertProps`, `LoadStatusNotificationEmailProps`, `SysAdminInvoiceEmailProps`), and exported function name was captured before editing and diffed after per task; every diff was line-number-only or comment-whitespace-only (never a field, type, or name change).

## 5. Preheaders — 20 distinct, machine-checked

Extracted from the 20 rendered HTMLs by the extended QA harness (`extractPreheader`, which cuts each `.dc-preheader` div's content at the first React-inserted `<!--` boundary, i.e. before the ZWNJ padding run):

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
```
Duplicate check (`sort | uniq -d` equivalent, run inside the harness over all 20): **PASS — all 20 preheaders are distinct.**

## 6. AccountExistsEmail extraction

Created `apps/web/src/emails/account-exists.tsx` exporting `AccountExistsEmail({ signInUrl }: { signInUrl: string })` — same exported name and same inline prop type the call site already used, migrated onto Shell with its original three sentences plus a `<Button>`.

`git diff` of `src/app/(auth)/sign-up/actions.tsx` (full, unabridged):

```diff
 import { sendEmail } from '@/lib/email/resend-client';
 import { ConfirmEmailTemplate } from '@/emails/confirm-email';
+import { AccountExistsEmail } from '@/emails/account-exists';
 import { getAppBaseUrl } from '@/lib/app-url';
 import bcrypt from 'bcryptjs';
-import {
-  Html,
-  Body,
-  Container,
-  Text,
-  Button,
-} from '@react-email/components';
-
-// Minimal inline template for duplicate-email path
-function AccountExistsEmail({ signInUrl }: { signInUrl: string }) {
-  return (
-    <Html>
-      <Body>
-        <Container>
-          <Text>
-            Hi there — someone just tried to sign up for DriveCommand using your email address.
-          </Text>
-          <Text>If that was you, you already have an account. Sign in below:</Text>
-          <Button href={signInUrl}>Sign in to DriveCommand</Button>
-          <Text>If it wasn&apos;t you, no action is needed. Your account is safe.</Text>
-        </Container>
-      </Body>
-    </Html>
-  );
-}
 
 // ── In-memory rate limiter (10 req / IP / hour) ─────────────────────────────
```
Exactly the two import edits and the deleted inline definition — `signUpAction`'s behaviour, the rate limiter, the duplicate-detection branch and the `sendEmail({ ..., react: AccountExistsEmail({ signInUrl }) })` call at its original position are all untouched. `git diff --stat` on this file: `26 changed, 1 insertion(+), 25 deletions(-)`.

## 7. Screenshot review — all 20 opened and read

All 20 `.email-qa/templates/*.png` were opened and visually inspected (not merely rendered):

| Template | Verdict |
|---|---|
| welcome-owner | Clean — greeting, trial date, 3-item list, button, signature all render correctly |
| activation-celebration | Clean |
| no-progress-nudge | Clean |
| add-driver-nudge | Clean |
| dispatch-load-nudge | Clean |
| trial-ending-soon | Clean — orange "Trial ends in 3 days" StatusBar renders correctly |
| confirm-email | Clean |
| driver-invitation | Clean |
| owner-invitation | Clean |
| account-exists | Clean |
| driver-document-expiry-reminder | Clean — orange "Urgent — expiring soon" StatusBar correct |
| fleet-message-notification | Clean — quoted message renders as a clean blockquote, route line present |
| geofence-arrival-alert | Clean — green "Arrived at delivery" StatusBar + green accent bar correctly reflect the delivery (vs pickup=blue) signal |
| load-status-notification | Clean — all 7 required fields plus optional estimated delivery render |
| sysadmin-invoice | Clean — line-items table, bill-to/meta block and totals row all render correctly with token-derived styling |
| support-ticket-created | Clean |
| support-ticket-reply-to-admin | Clean — quoted reply renders as blockquote |
| support-ticket-reply-to-owner | Clean |
| workflow-instance-blocked | Clean — orange "Action required — driver blocked" StatusBar correct |
| **workflow-safety-digest** | **Reads adequately, but flagged as instructed.** The original's 3-column grid of large centered numbers (28px, glanceable from across a room) is now a 3-line bulleted list. It is legible and complete (all 3 counts + tenantName + date present, orange "2 overdue steps" StatusBar fires correctly when `overdueCount > 0`), but it genuinely loses the original's at-a-glance visual punch. This is the plan's own named risk and its own accepted middle ground (a `<ul>` of 3 lines, explicitly not DetailRows) — not a silent regression, but worth stating plainly rather than marking it "Clean" alongside the other 19. |

No automations nudge read worse than its original; the digest is the one genuine visual downgrade, exactly where the plan predicted it would be.

## 8. Residual hex-literal counts

```
root files:    0   (was 296 literals / ~19 files pre-migration)
carrier files: 8
root literals:    0
carrier literals: 113
```
Against quick-577's corrected baseline of **409 total / 296 root / 113 carrier / 27 files**: root fell from 296 to **0** (every root-scoped hex literal removed), and carrier is **exactly 113** across the same 8 files — a scope assertion proving `src/emails/carrier/**` was never touched by this task.

**Deliberate exceptions, stated per the plan's own carve-out:**
- `sysadmin-invoice.tsx` keeps a module-level `tableStyles` object (not named `styles`) for its line-items table — real invoice data, not prose. Every value in it is built from `_system` tokens (`colors.*`, `fonts.*`, `fontSizes.*`, `space[*]`); the only non-token literal is the CSS keyword `monospace` for the invoice-number cell, which is not a hex literal or a brand font-stack.
- `fleet-message-notification.tsx`, `support-ticket-reply-to-admin.tsx`, and `support-ticket-reply-to-owner.tsx` each keep a small `quoteStyle` object for their `<blockquote>`, all token-derived, deliberately omitting `color` (see key-decisions above).

## 9. Call-site changes

**Only one, exactly as the plan permitted:** the `AccountExistsEmail` import in `src/app/(auth)/sign-up/actions.tsx`, from a local inline definition to `import { AccountExistsEmail } from '@/emails/account-exists'`. No other call site (`template-registry.ts`, `send-driver-invitation.ts`, `send-manager-invitation.ts`, `send-owner-invitation.ts`, `send-driver-document-expiry-reminder.ts`, `send-fleet-message-notifications.ts`, `send-geofence-alert.ts`, `customer-notifications.ts`, `send-sysadmin-invoice.ts`, `send-support-notifications.ts` — both the static imports and the dynamic `await import()` for `support-ticket-reply-to-owner` — `workflows/notifications.ts`, `cron/workflow-digest/route.ts`) required any change, confirmed by `git diff --name-only` across all seven commits containing no path outside `src/emails/**`, `_system/Shell.tsx`, and the one auth file.

## 10. Verification

**tsc, probed.** Injected `const __probe578: number = 'x';` into `src/emails/welcome-owner.tsx` (a file this task edited):
```
src/emails/welcome-owner.tsx(53,7): error TS2322: Type 'string' is not assignable to type 'number'.
```
Reverted via `git checkout --`; re-run reported **zero errors**. The gate is proven live, not blind.

**`next build`.** Exit code **0**, full route manifest printed, no errors (the pre-existing "package seems invalid" warning is unrelated and predates this task).

**Full Vitest, `--reporter=default`, main tree, both ends.**

Before (pre-quick-578, measured via `git checkout 2cb784c0 -- <touched paths>` in the main tree, never a worktree, so `.env.local` stayed present):
```
Test Files  17 failed | 137 passed | 8 skipped (162)
     Tests  63 failed | 1679 passed | 61 skipped | 3 todo (1806)
```
After (current tree, all 7 commits + uncommitted Task 7 work, restored via `git checkout HEAD --` then `git stash pop`):
```
Test Files  17 failed | 137 passed | 8 skipped (162)
     Tests  63 failed | 1679 passed | 61 skipped | 3 todo (1806)
```
**Identical** — same 162/17/137/8 and 1806/63/1679/61/3, same failing suite (`stepTemplate.test.ts` and siblings, all pre-existing `headers() outside request scope` tRPC-context failures, unrelated to email). Checked per the plan's instruction: neither `src/lib/email/__tests__/transport.test.ts` nor `src/lib/carrier/__tests__/dispatch-assigned-email.test.ts` imports any of the 20 migrated templates, so this delta (zero) is a real "no regression," not an inherited one.

**`git diff --stat 2cb784c0..HEAD`** (22 files changed, 708 insertions, 2647 deletions):
```
apps/web/src/app/(auth)/sign-up/actions.tsx        |  26 +-
apps/web/src/emails/_system/Shell.tsx              |  42 ++-
apps/web/src/emails/account-exists.tsx             |  36 ++
apps/web/src/emails/activation-celebration.tsx     | 137 ++-----
apps/web/src/emails/add-driver-nudge.tsx           | 114 +-----
apps/web/src/emails/confirm-email.tsx              | 102 +----
apps/web/src/emails/dispatch-load-nudge.tsx        | 115 +-----
apps/web/src/emails/driver-document-expiry-reminder.tsx | 239 ++----------
apps/web/src/emails/driver-invitation.tsx          | 146 +-------
apps/web/src/emails/fleet-message-notification.tsx | 190 ++--------
apps/web/src/emails/geofence-arrival-alert.tsx     |  76 ++--
apps/web/src/emails/load-status-notification.tsx   | 219 ++---------
apps/web/src/emails/no-progress-nudge.tsx          | 137 ++-----
apps/web/src/emails/owner-invitation.tsx           | 147 +-------
apps/web/src/emails/support-ticket-created.tsx     | 182 +--------
apps/web/src/emails/support-ticket-reply-to-admin.tsx | 212 ++---------
apps/web/src/emails/support-ticket-reply-to-owner.tsx | 207 ++---------
apps/web/src/emails/sysadmin-invoice.tsx           | 412 +++++++++------------
apps/web/src/emails/trial-ending-soon.tsx          | 125 ++-----
apps/web/src/emails/welcome-owner.tsx              | 143 ++-----
apps/web/src/emails/workflow-instance-blocked.tsx  | 208 ++---------
apps/web/src/emails/workflow-safety-digest.tsx     | 140 +++----
```
The only `_system/` path is `Shell.tsx`. No `src/emails/carrier/**`, no `dynamic-template.tsx`, `body-html-transform.ts`, `template-renderer.ts`, `dispatcher.ts`, `resend-client.ts`, `sender-config.ts`, `html-to-text.ts`, `middleware.ts`, `route-access.ts`, no seed file, no `prisma/schema.prisma`, neither `vercel.json`. The only non-email source file is `src/app/(auth)/sign-up/actions.tsx`.

**Nothing `.skip`ped.** `defaultHtmlCache` refresh script **not** run. Port 3000 confirmed clear before starting and after finishing.

## Performance

- **Duration:** ~2h 10min
- **Tasks:** 7
- **Files modified:** 22 (20 templates + Shell.tsx + sign-up/actions.tsx), plus scripts/email-render-qa.ts and .email-qa/.gitignore/templates/*.png

## Task Commits

1. **Task 1: Shell children slot, byte-identical proof, dark-mode measurement** — `ba0d0a5c` (feat)
2. **Task 2: Migrate the 6 automations templates** — `0d2bc0bd` (refactor)
3. **Task 3: Migrate invitations + auth, extract AccountExistsEmail** — `db08d6bb` (refactor)
4. **Task 4: Migrate the reminder and alert templates** — `67d0c67c` (refactor)
5. **Task 5: Migrate the 3 support templates** — `7aa4aec0` (refactor)
6. **Task 6: Migrate the 2 workflow templates** — `5ba60720` (refactor)
7. **Task 7: QA harness, 20 screenshots, verification, summary** — (this commit)

## Decisions Made

See `key-decisions` in frontmatter. The most consequential: the byte-identical proof required normalizing the QA harness's ephemeral port before trusting the diff, verified against two runs of unmodified code first rather than assumed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dispatcher phase's `process.exit(1)` changed to `process.exitCode = 1`**
- **Found during:** Task 7 (extending the QA harness with a second phase)
- **Issue:** The existing dispatcher check called `process.exit(1)` on a Gmail-clip-limit breach, which would terminate the process immediately and prevent the new templates phase from ever running.
- **Fix:** Changed to `process.exitCode = 1` (sets the eventual exit code without killing the process early); the templates phase runs unconditionally afterward and sets its own `process.exitCode` on its own failures.
- **Files modified:** apps/web/scripts/email-render-qa.ts
- **Verification:** Dispatcher's own byte-size check still passes (10016 bytes, well under the 104448-byte limit) so this branch is never actually exercised in practice; behavior change is inert under current data.
- **Committed in:** Task 7 commit

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking, to let a real second QA phase run at all)
**Impact on plan:** Necessary infrastructure change to add the templates phase without killing the process on the pre-existing (never-firing) dispatcher gate. No scope creep, no behavior change to the dispatcher's actual rendered output.

## Issues Encountered

- **Byte-identical diff was non-empty on first attempt** — resolved by identifying the QA harness's ephemeral-port non-determinism (see §2), proving it was harness noise rather than a Shell regression by running two before-only comparisons, then normalizing the port before the real before/after comparison.
- **`ComponentType<Record<string, unknown>>` rejected all 20 heterogeneous template components** — the 20 templates have 20 different, incompatible prop shapes, so a structurally-typed `Record<string, unknown>` component type cannot accept any of them. Widened to `React.ComponentType<any>` for the QA-only registry array (test/tooling code, not shipped application logic), with a comment explaining why.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 20 non-dispatcher templates now share one design system with the dispatcher path: one `<Html>`, one stylesheet, one Header, one Footer, one dark-mode ruleset.
- Root-scoped hex literals are at 0; only `src/emails/carrier/**` (113 literals, 8 files, explicitly out of scope for this plan) remains unconverged.
- `workflow-safety-digest`'s visual downgrade (3-column stat grid → 3-line list) is reported but not further addressed — a future task could restyle the `<ul>` into a lighter-weight 3-column table if the loss of glanceability is judged worth revisiting.
- `email-render-qa.ts` now carries a reusable 20-template registry pattern (`TEMPLATES` array of `{ name, Component, props }`) that a future 21st template can extend by appending one entry.

---
*Phase: quick-578*
*Completed: 2026-09-02*

## Self-Check: PASSED

- FOUND: apps/web/src/emails/_system/Shell.tsx
- FOUND: apps/web/src/emails/account-exists.tsx
- FOUND: apps/web/scripts/email-render-qa.ts
- FOUND: apps/web/.email-qa/templates/welcome-owner.png (and all 19 sibling PNGs)
- FOUND: .planning/quick/578-email-convergence-2a-2-shell-children-sl/578-SUMMARY.md
- FOUND commit ba0d0a5c (Task 1)
- FOUND commit 0d2bc0bd (Task 2)
- FOUND commit db08d6bb (Task 3)
- FOUND commit 67d0c67c (Task 4)
- FOUND commit 7aa4aec0 (Task 5)
- FOUND commit 5ba60720 (Task 6)
- FOUND commit ab010a25 (Task 7)
