---
phase: quick-577
plan: 577
subsystem: email
tags: [nextjs, react-email, playwright, vitest, e2e, nav-cleanup]

requires:
  - phase: quick-576
    provides: "canSeeOwnerSettings gating on /settings/notifications and /help; identified /profile as a 404 for every role but left it in pending a product decision"
provides:
  - "4 confirmed-dead email files deleted (2 templates + 2 senders), live driver-document-expiry near-miss pair verified intact"
  - "/profile nav entry removed from the user menu; its absence pinned by a spec assertion"
  - "e2e/.env.example documenting the six TEST_ account keys, pointing at scripts/seed-qa-accounts.ts"
  - "The Shell architectural blocker written up in full for session 2B, plus the previously-uncounted inline AccountExistsEmail (30th template) and a re-measured hex baseline (409/27, not the audit's stale 448/29)"
affects: [email-convergence-2b, document-import-notifications]

tech-stack:
  added: []
  patterns:
    - "tsc probe-before-trust: inject a real type error into an edited file, confirm tsc reports it, revert via git checkout, re-run clean"

key-files:
  created:
    - apps/web/e2e/.env.example
    - .planning/quick/577-email-convergence-2a-delete-orphans-migr/577-SUMMARY.md
  modified:
    - apps/web/src/components/navigation/user-menu.tsx
    - apps/web/e2e/settings/user-menu-gating.spec.ts
  deleted:
    - apps/web/src/emails/document-expiry-reminder.tsx
    - apps/web/src/emails/maintenance-reminder.tsx
    - apps/web/src/lib/email/send-document-expiry-reminder.ts
    - apps/web/src/lib/email/send-maintenance-reminder.ts

key-decisions:
  - "The 19-template Shell migration (session 2A step 2) is architecturally blocked and was NOT attempted — Shell.tsx's bodyHtml:string contract + dangerouslySetInnerHTML has no children prop, and all three routes to wrapping JSX in it are forbidden by the task's own constraints"
  - "Steps 6 (hex count) and 7 (screenshots) are consequently also blocked/deferred; step 5 (sign-up emails) is report-only"

patterns-established:
  - "A deliberate nav-entry removal must ship an absence assertion in the same commit as the removal, scoped to the most permissive viewer (OWNER), paired with a positive counter-assertion — quick-566/567's rule, applied here to /profile"

duration: ~55min
completed: 2026-09-02
---

# Quick Task 577: Email Convergence 2A — Delete Orphans, Migration Blocked Summary

**Deleted 4 confirmed-dead email files (2 templates + 2 senders) and the dead `/profile` nav link with its absence now pinned by a spec; the 19-template Shell migration is architecturally blocked and was correctly NOT attempted — full blocker write-up below for session 2B.**

## 1. The four deletions

Deleted via `git rm`, one at a time, by full path (never a glob):

- `apps/web/src/emails/document-expiry-reminder.tsx`
- `apps/web/src/emails/maintenance-reminder.tsx`
- `apps/web/src/lib/email/send-document-expiry-reminder.ts`
- `apps/web/src/lib/email/send-maintenance-reminder.ts`

Each was dead: its sole importer was its own sender, the sender's exported function had zero references outside itself, and the underlying reminder is now sent by the active dispatcher `NotificationTemplate` rows `driver.license_expiring`, `truck.document_expiring`, `truck.maintenance_due` (all carrying `defaultHtmlCache`).

`git status --porcelain` after the four `git rm` calls showed **exactly four `D` entries and nothing else**.

Post-delete proof (as specified):

```bash
$ grep -rn "sendDocumentExpiryReminder\|sendMaintenanceReminder" src scripts e2e tests
# (zero lines — grep exit code 1)
```

**The near-miss LIVE pair survived and is untouched:** `src/emails/driver-document-expiry-reminder.tsx` and `src/lib/email/send-driver-document-expiry-reminder.ts` both still exist (`ls` succeeded on both) and `DriverDocumentExpiryReminderEmail` still resolves from its importer:

```
src/emails/driver-document-expiry-reminder.tsx:12:interface DriverDocumentExpiryReminderEmailProps {
src/emails/driver-document-expiry-reminder.tsx:20:export function DriverDocumentExpiryReminderEmail({
src/lib/email/send-driver-document-expiry-reminder.ts:9:import { DriverDocumentExpiryReminderEmail } from '@/emails/driver-document-expiry-reminder';
src/lib/email/send-driver-document-expiry-reminder.ts:83:    react: DriverDocumentExpiryReminderEmail(data),
```

This pair is reached by `/api/cron/send-reminders`, scheduled `0 14 * * *` in `apps/web/vercel.json` — it was never touched.

## 2. Step-5 sign-up finding (reported, not fixed)

`src/app/(auth)/sign-up/actions.tsx` sends **two** real email bodies, and both are blocked by the same Shell issue:

- `:235` — `react: ConfirmEmailTemplate({ firstName: input.firstName, confirmUrl })`, imported from `@/emails/confirm-email` (`:15`) — one of the 19 root templates.
- `:144` — `react: AccountExistsEmail({ signInUrl: ... })` — **defined inline in that same file** (`function AccountExistsEmail` at `:27`), importing `@react-email/components` directly (`:24`). This is a **30th** email template the audit's count of 29 never counted, because it does not live under `src/emails/`.

`signUpAction`'s behaviour and signature were **not changed**. Verified by grep, not by editing:

```
15:import { ConfirmEmailTemplate } from '@/emails/confirm-email';
24:} from '@react-email/components';
27:function AccountExistsEmail({ signInUrl }: { signInUrl: string }) {
144:        react: AccountExistsEmail({ signInUrl: `${appUrl}/sign-in` }),
235:    react: ConfirmEmailTemplate({ firstName: input.firstName, confirmUrl }),
```

## 3. `/profile` removal + spec repair

`/profile` is a confirmed 404 for every role (quick-576's finding — no route exists anywhere under `src/app`, no rewrite/redirect in `next.config.ts`). Removed in `apps/web/src/components/navigation/user-menu.tsx`:

- Deleted the entire `<DropdownMenu.Item asChild>` block wrapping `<Link href="/profile">`, together with the quick-576 comment above it that explained the dead link.
- Removed the now-unused `User` icon import (nothing else in the file used it).
- Updated the file's top doc comment to describe the menu as "My Notifications, Settings, Help & Support" and noted the quick-577 removal.
- Left `/settings/my-notifications` (ungated) and `/settings/notifications` + `/help` (behind `canSeeOwnerSettings`) untouched — quick-576's gating is undisturbed.

`grep -n '"/profile"' src -r` in `apps/web` returns **nothing**.

`e2e/settings/user-menu-gating.spec.ts` updated in the same commit:

- `UNGATED_HREFS` → `['/settings/my-notifications']` (was `['/profile', '/settings/my-notifications']`).
- Both test titles and the OWNER describe's title updated from "four links"/"Profile, My Notifications, Settings and Help & Support" to "three links"/omits Profile phrasing.
- DRIVER test's positive/negative pair preserved: positive half still asserts `/settings/my-notifications` is present before the negative half asserts `/settings/notifications` and `/help` are absent.
- **New**: OWNER test's positive assertions (all three real links present) are paired with a new negative assertion — `expect(hrefs).not.toContain('/profile')` — scoped to the OWNER session specifically (the most permissive viewer), per quick-566/567's rule that an unasserted absence gets silently re-added.
- `WHY THIS EXISTS` doc block extended with a "QUICK-577 UPDATE" paragraph explaining this is a deliberate unlink (route never existed), not the accidental kind quick-552/553 spent two tasks recovering.
- Locator scoping (`[role="menu"] a`) untouched. Nothing marked `.skip`.

**Spec re-run result:** started `next dev` in `apps/web` (stopped/`.next` cleared first, per preflight), waited for `http://localhost:3000/sign-in` to return `200` (confirmed on first poll), then:

```
$ npx playwright test e2e/settings/user-menu-gating.spec.ts
Running 9 tests using 3 workers
...
9 passed (50.7s)
```

Re-run a second time later in the task (after `next build` had touched `.next`, so the dev server was stopped, `.next` cleared, and restarted fresh first) with an identical result: **9 passed (53.6s)**, both `chromium` and `mobile` projects green, plus the shared `setup` project (owner/driver/manager auth — the pre-existing sysadmin auth-setup skip, "no credentials configured," is unrelated and pre-existing).

## 4. `e2e/.env.example`

Created at `apps/web/e2e/.env.example` (there was no existing file at that path; `apps/web/.env.example` carries zero `TEST_` keys, so this keeps Playwright's env reference beside its own specs):

```
# Playwright test-account credentials (quick-577)
#
# The REAL values are not here and must never be committed. They live in
# apps/web/scripts/seed-qa-accounts.ts (~lines 155-182), which seeds
# owner@test.com, manager@test.com and driver@test.com into a dedicated
# "QA Test Org" tenant. Copy this file to e2e/.env (gitignored) and fill
# in the values that script actually created — do not guess them.
#
# Why this file exists: quick-575 invented a password ("driver1234"), got
# a 401 against a real seeded account, and reported it as a missing/broken
# account. quick-576 proved the accounts had been healthy all along — the
# credential was simply wrong. A guessed credential is indistinguishable
# from a broken environment from the outside, and that guess cost a whole
# task. Copy the real values from the seed script instead of guessing.
#
# These six keys feed e2e/auth.setup.ts, which every requireRoleAuth()
# fixture depends on (see e2e/fixtures/auth-helpers.ts).

TEST_OWNER_EMAIL=
TEST_OWNER_PASSWORD=
TEST_DRIVER_EMAIL=
TEST_DRIVER_PASSWORD=
TEST_MANAGER_EMAIL=
TEST_MANAGER_PASSWORD=
```

Real values live in `apps/web/scripts/seed-qa-accounts.ts` (confirmed: `owner@test.com` / `manager@test.com` / `driver@test.com`, password `TestPass123!`, ~lines 155-182). The real password is not present in the committed file — `grep -rn "TestPass123" e2e/.env.example` returns nothing.

`git check-ignore -v apps/web/e2e/.env.example` exits **1** with no output (not ignored); `git status --porcelain` listed it as untracked before the commit; `grep -c "TEST_" e2e/.env.example` returns **6**.

## 5. Re-measured hex-literal counts

The audit's stale baseline was **448 literals across 29 files** (root + carrier, outside `_system/`). Re-measured with the exact commands the plan specifies:

```bash
$ grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails --include=*.tsx | grep -v "/_system/" | wc -l
409
$ grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails --include=*.tsx | grep -v "/_system/" | grep "/carrier/" | wc -l
113
```

- **Total (root + carrier, outside `_system/`):** 409 (was 448)
- **Carrier-only:** 113
- **Root-only (total minus carrier):** 296
- **File count** with any hex literal, outside `_system/`: 27 (was 29) — 19 root `.tsx` files + 8 carrier `.tsx` files

**This is unchanged (modulo the 4 deletions) because the Shell migration did not run.** The 39-literal, 2-file delta is fully accounted for by the two deleted root templates, confirmed directly against their pre-deletion content:

```bash
$ git show 7e81888d:apps/web/src/emails/document-expiry-reminder.tsx | grep -oE "#[0-9a-fA-F]{3,8}\b" | wc -l
22
$ git show 7e81888d:apps/web/src/emails/maintenance-reminder.tsx | grep -oE "#[0-9a-fA-F]{3,8}\b" | wc -l
17
```

22 + 17 = 39 = 448 − 409. No other `.tsx` file under `src/emails` was touched this session. Session 2B should treat **409 total / 296 root-only / 113 carrier-only / 27 files** as its trustworthy starting figure, not the audit's 448/29.

## 6. The blocker (verbatim from the plan) — handoff to session 2B

**DO NOT ATTEMPT the 19-template Shell migration. Do not design a workaround. Do not touch `src/emails/_system/**`.**

`src/emails/_system/Shell.tsx` is not a wrapper. Its props are:

```ts
export type ShellProps = {
  preheader: string;
  bodyHtml: string;          // a STRING, not children
  statusBar?: StatusBarProps;
  accentColor?: string;
  preferencesUrl?: string;
  logoBaseUrl: string;
};
```

It injects that string through the single `dangerouslySetInnerHTML` at `Shell.tsx:219` (verified: `dangerouslySetInnerHTML={{ __html: bodyHtml }}` at that exact line, with a comment above it at `:193-194` — "The ONE dangerouslySetInnerHTML in this file, as designed. `bodyHtml` must already be Tiptap-generated"). Its own doc comment (`:28`) says `bodyHtml` "arrives from Tiptap completely unstyled" — it was built for the DISPATCHER path, and `dynamic-template.tsx` is its only consumer in the repo (and is on the do-not-touch list).

The 19 root templates are ordinary JSX components, invoked SYNCHRONOUSLY by their call sites — all four verified directly this session:

- `send-driver-invitation.ts:65` — `react: DriverInvitationEmail(data)`
- `send-owner-invitation.ts:59` (verified at the equivalent line in that file) — `react: OwnerInvitationEmail(data)`
- `automations/actions/send-email.ts:78` — `react: element`
- `sign-up/actions.tsx:144` and `:235` — `react: AccountExistsEmail(...)` and `react: ConfirmEmailTemplate(...)`

Wrapping a JSX body in `<Shell>` requires one of three forbidden moves:

- **(a)** add a `children` prop to Shell — `_system/**` is DO NOT TOUCH;
- **(b)** make each template async so it can pre-render its body to a string via `@react-email/render` — turns `react: Component(props)` into a Promise and breaks every call site above, and "do not modify call sites" is an explicit constraint;
- **(c)** hand-write body HTML strings inside each template — abandons JSX; a rewrite, not a migration.

Composing `Header`/`Footer`/`Button`/`Preheader` inside each template's own `<Html>` does not rescue it either: the dark-mode + `.dc-body` stylesheet is a **private `const CSS` inside Shell.tsx** (`Shell.tsx:74`), exported from nowhere (grep-verified against `_system/tokens.ts` and the whole `_system/` directory). Rebuilding it per file is exactly the local-styles-block the task forbids.

Consequences, also out of scope:
- **Step 6 hex counts do not move** by migration — confirmed above (§5): the delta present is entirely explained by the 4 deletions.
- **Step 7 screenshots are blocked.** `apps/web/scripts/email-render-qa.ts` was **not** run — there is nothing new to render.
- **Step 5 is report-only** (§2 above). `signUpAction`'s behaviour and signature are unchanged.

**What 2B should do first:** the blocker needs a decision from the user before any template migration can be planned — this is being reported to the orchestrator separately. The three forbidden moves above are not omissions; they are the complete option space given the current constraints (Shell's shape, the synchronous call sites, and the "no rewrite" boundary). A real fix requires either relaxing one of those three constraints (e.g., permitting `_system/` changes, permitting async call sites, or accepting a per-template stylesheet) or a fourth option nobody has proposed yet.

## 7. Verification

**tsc — probed, twice (once per task that touched a surviving file):**
```bash
# Injected: const __probe577: number = 'x'; into send-driver-document-expiry-reminder.ts
$ npx tsc --noEmit
src/lib/email/send-driver-document-expiry-reminder.ts(87,7): error TS2322: Type 'string' is not assignable to type 'number'.
# Reverted via `git checkout -- <file>` (confirmed exact restore via git diff --stat = empty)
$ npx tsc --noEmit
# (clean, exit 0)
```
Repeated identically during the Task 4 verification sweep with the same result. tsc is proven non-blind, and clean both times.

**`next build`:**
```bash
$ npx next build
✓ Compiled successfully in 39.6s
$ echo $?
0
```
Full route manifest printed with no errors (one pre-existing, unrelated warning: "The package seems invalid. require() resolves to a EcmaScript module" — present before this task's changes, not investigated further as it is out of scope).

**Vitest — same reporter (`--reporter=default`) both ends, main tree (no worktree):**

| | Test Files | Tests |
|---|---|---|
| Preflight baseline | 162 (17 failed / 137 passed / 8 skipped) | 1806 (1679 passed / 63 failed / 61 skipped / 3 todo) |
| Post-Task-4 | 162 (17 failed / 137 passed / 8 skipped) | 1806 (1679 passed / 63 failed / 61 skipped / 3 todo) |

**Identical.** No movement — consistent with the preflight check that confirmed nothing in `src/__tests__`, `src/lib/email/__tests__`, `tests`, `e2e`, or `scripts` imports any of the four deleted files. Matches the plan's expected baseline exactly (1806/1679/63/61/3).

**Playwright:** `npx playwright test e2e/settings/user-menu-gating.spec.ts` → **9 passed** (setup ×5 + 2 tests × 2 projects), run twice against a freshly-started `next dev` (stopped + `.next` cleared before each start, per the "don't trust a red result under a swapped-file dev server" rule) with identical results both times.

**`git diff --stat` over the four commits — do-not-touch audit:**
```
 apps/web/e2e/.env.example                          |  24 +++
 apps/web/e2e/settings/user-menu-gating.spec.ts     |  30 ++-
 apps/web/src/components/navigation/user-menu.tsx   |  29 +--
 apps/web/src/emails/document-expiry-reminder.tsx   | 227 ---------------------
 apps/web/src/emails/maintenance-reminder.tsx       | 197 ------------------
 .../src/lib/email/send-document-expiry-reminder.ts |  64 ------
 .../web/src/lib/email/send-maintenance-reminder.ts |  65 ------
```
None of the do-not-touch paths appear: no `src/emails/carrier/**`, no `src/emails/_system/**`, no `dynamic-template.tsx`, `body-html-transform.ts`, `template-renderer.ts`, `dispatcher.ts`, `resend-client.ts`, `sender-config.ts`, `html-to-text.ts`, `middleware.ts`, `route-access.ts`, seed file, `prisma/schema.prisma`, or either `vercel.json`. The `defaultHtmlCache` refresh script was not run. Nothing marked `.skip`.

## Task Commits

1. **Task 1: Delete the four dead email files** — `4d7db2d6` (refactor)
2. **Task 2: Remove the dead /profile menu item + repair the spec** — `d78ec00b` (fix)
3. **Task 3: Add e2e/.env.example** — `da4f47f1` (docs)
4. **Task 4: Verification sweep + summary** — this commit (docs)

## Not done / deferred

- **Step 2 — migrate the 19 root templates onto `_system/Shell`: BLOCKED.** See §6 above. Not attempted; `_system/**` untouched.
- **Step 6 (half) — hex-literal reduction via migration: BLOCKED**, same root cause. The re-measurement in §5 was performed (a real, trustworthy number for 2B), but no literals were removed by migration — only by the unrelated file deletions in Task 1.
- **Step 7 — email-render-qa screenshots: BLOCKED**, same root cause. `scripts/email-render-qa.ts` deliberately not run.

## Next Phase Readiness

Session 2B cannot proceed with the template migration until the user decides how to resolve the Shell contract conflict (§6). Everything else in this session — the four dead files, the `/profile` cleanup, and the env example — is complete, committed, and independently verified; none of it blocks or is blocked by 2B's eventual work.

---
*Phase: quick-577*
*Completed: 2026-09-02*

## Self-Check: PASSED

- FOUND: apps/web/e2e/.env.example
- CONFIRMED DELETED: apps/web/src/emails/document-expiry-reminder.tsx
- CONFIRMED DELETED: apps/web/src/emails/maintenance-reminder.tsx
- CONFIRMED DELETED: apps/web/src/lib/email/send-document-expiry-reminder.ts
- CONFIRMED DELETED: apps/web/src/lib/email/send-maintenance-reminder.ts
- LIVE PAIR CONFIRMED PRESENT: apps/web/src/emails/driver-document-expiry-reminder.tsx, apps/web/src/lib/email/send-driver-document-expiry-reminder.ts
- FOUND: .planning/quick/577-email-convergence-2a-delete-orphans-migr/577-SUMMARY.md
- FOUND commit: 4d7db2d6
- FOUND commit: d78ec00b
- FOUND commit: da4f47f1
