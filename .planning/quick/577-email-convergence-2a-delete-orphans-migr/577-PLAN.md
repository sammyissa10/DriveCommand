---
phase: quick-577
plan: 577
type: execute
wave: 1
depends_on: []
files_modified:
  - src/emails/document-expiry-reminder.tsx
  - src/emails/maintenance-reminder.tsx
  - src/lib/email/send-document-expiry-reminder.ts
  - src/lib/email/send-maintenance-reminder.ts
  - src/components/navigation/user-menu.tsx
  - e2e/settings/user-menu-gating.spec.ts
  - e2e/.env.example
  - .planning/quick/577-email-convergence-2a-delete-orphans-migr/577-SUMMARY.md
  - .planning/STATE.md
autonomous: true

must_haves:
  truths:
    - "The four dead email files no longer exist, and the LIVE driver-document-expiry pair still does."
    - "`sendDocumentExpiryReminder` and `sendMaintenanceReminder` have zero references anywhere in src, scripts, e2e, tests."
    - "The user menu no longer offers a Profile link, for any role."
    - "`e2e/settings/user-menu-gating.spec.ts` passes green against the new three-link menu, with its positive/negative halves intact."
    - "A committed `e2e/.env.example` names the six TEST_ keys with placeholder values and points at scripts/seed-qa-accounts.ts."
    - "The summary records WHY the 19-template Shell migration did not happen, in enough detail that session 2B does not re-attempt it."
  artifacts:
    - path: "e2e/.env.example"
      provides: "Six TEST_ keys with placeholders + provenance comment"
      contains: "TEST_OWNER_EMAIL"
    - path: "src/components/navigation/user-menu.tsx"
      provides: "Three-link user menu, no /profile"
    - path: "e2e/settings/user-menu-gating.spec.ts"
      provides: "Updated UNGATED_HREFS + updated test titles/doc block"
    - path: ".planning/quick/577-email-convergence-2a-delete-orphans-migr/577-SUMMARY.md"
      provides: "Blocker write-up, re-measured hex counts, test deltas"
  key_links:
    - from: "e2e/settings/user-menu-gating.spec.ts"
      to: "src/components/navigation/user-menu.tsx"
      via: "UNGATED_HREFS asserted against rendered menu hrefs"
      pattern: "UNGATED_HREFS"
---

<objective>
Land the UNBLOCKED half of email convergence session 2A: delete four confirmed-dead email files, remove the dead `/profile` nav entry and repair the spec that pins it, add the e2e test-account env example, and write a summary that records the Shell blocker and a trustworthy hex baseline for session 2B.

Purpose: The audit's step 2 (migrate the 19 root templates onto `_system/Shell`) is architecturally blocked and is NOT in scope — see `<blocked_scope>`. Everything else in the session can still ship, and the deletions/nav cleanup are the parts that reduce surface area for 2B.
Output: 4 commits — deletions, nav + spec, env example, docs.
</objective>

<blocked_scope>
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

It injects that string through the single `dangerouslySetInnerHTML` at `Shell.tsx:219`. Its own doc comment says `bodyHtml` "arrives from Tiptap completely unstyled" — it was built for the DISPATCHER path, and `dynamic-template.tsx` is its only consumer in the repo (and is on the do-not-touch list).

The 19 root templates are ordinary JSX components, invoked SYNCHRONOUSLY by their call sites: `react: DriverInvitationEmail(data)` (`send-driver-invitation.ts:65`), `react: ConfirmEmailTemplate({...})` (`sign-up/actions.tsx:235`), `react: element` (`automations/actions/send-email.ts:78`), and `send-owner-invitation.ts:59`. Wrapping a JSX body in `<Shell>` requires one of three forbidden moves:

- (a) add a `children` prop to Shell — `_system/**` is DO NOT TOUCH;
- (b) make each template async so it can pre-render its body to a string via `@react-email/render` — turns `react: Component(props)` into a Promise and breaks every call site, and "do not modify call sites" is an explicit constraint;
- (c) hand-write body HTML strings inside each template — abandons JSX; a rewrite, not a migration.

Composing `Header`/`Footer`/`Button`/`Preheader` inside each template's own `<Html>` does not rescue it either: the dark-mode + `.dc-body` stylesheet is a **private `const CSS` inside Shell.tsx**, exported from nowhere (grep-verified against `_system/tokens.ts` and the whole `_system/` directory). Rebuilding it per file is exactly the local styles block the task forbids.

Consequences that follow and are therefore also out of scope:
- **Step 6 hex counts will not move** (audit baseline: 448 literals across 29 files outside `_system/`). Task 4 RE-MEASURES and reports anyway, stating plainly that the figure is unchanged because no migration occurred.
- **Step 7 screenshots are blocked.** Do NOT run `apps/web/scripts/email-render-qa.ts`; there is nothing new to render.
- **Step 5 is REPORT-ONLY.** Both sign-up emails are blocked for the same reason. Do not change `signUpAction`'s behaviour or signature.
</blocked_scope>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/components/navigation/user-menu.tsx
@apps/web/e2e/settings/user-menu-gating.spec.ts
@apps/web/scripts/seed-qa-accounts.ts
</context>

<preflight>
Do this ONCE, before Task 1. Not optional.

1. **Stop `next dev`.** Files are being deleted; a running Turbopack server will poison its on-disk cache and a red browser check afterwards is a stale bundler before it is a regression. If it was running: stop it, `rm -rf apps/web/.next`, and do not restart until Task 2's spec run needs it.

2. **Capture the Vitest baseline in the MAIN TREE.** Never a `git worktree` — `apps/web/.env.local` is untracked and gitignored, so a worktree measures a different program (quick-567).
   ```bash
   cd apps/web
   git stash --include-untracked   # only if the tree is dirty; it should be clean
   npx vitest run --reporter=default 2>&1 | tail -20
   git stash pop                   # only if you stashed
   ```
   Expected baseline: **1806 total / 1679 passed / 63 failed / 61 skipped / 3 todo**. Record the ACTUAL numbers you observe — the published figure is a claim, your run is the evidence.
   - `--reporter=basic` DOES NOT EXIST in vitest 4: it exits 0 having executed zero tests. A run whose output contains no `Test Files … | Tests …` summary is not a green run.
   - Use the SAME reporter for the after-run in Task 4, or the delta is meaningless.

3. **Confirm no test imports the deletion set** (so a file-count change later is not misread as a regression):
   ```bash
   grep -rn "document-expiry-reminder\|maintenance-reminder" src/__tests__ src/lib/email/__tests__ tests e2e scripts 2>/dev/null | grep -v driver-document-expiry
   ```
   Expected: empty. If it is NOT empty, stop and report — the deletion is not as dead as the audit believed.
</preflight>

<tasks>

<task type="auto">
  <name>Task 1: Delete the four dead email files, with the near-miss guard</name>
  <files>
src/emails/document-expiry-reminder.tsx
src/emails/maintenance-reminder.tsx
src/lib/email/send-document-expiry-reminder.ts
src/lib/email/send-maintenance-reminder.ts
  </files>
  <action>
Delete exactly these four paths. Each is dead: the template's sole importer is its sender, the sender's exported function has zero references across src/scripts/e2e/tests, and the trigger is now an active dispatcher `NotificationTemplate` row (`driver.license_expiring`, `truck.document_expiring`, `truck.maintenance_due`), all carrying `defaultHtmlCache`.

**DANGER — the near-miss name.** `src/emails/driver-document-expiry-reminder.tsx` and `src/lib/email/send-driver-document-expiry-reminder.ts` are **LIVE** — reached by `/api/cron/send-reminders`, scheduled `0 14 * * *` in `apps/web/vercel.json`. Their names are supersets of the dead ones; a substring glob or a careless `grep -v` is exactly how they get swept up.

Procedure, in order:

1. Delete the four files individually by full path (`git rm`), never via a glob or a find pattern.
2. `git status --porcelain` — assert **exactly four** deleted paths and nothing else staged. If a fifth path appears, restore everything and stop.
3. Prove the live pair survived:
   ```bash
   ls src/emails/driver-document-expiry-reminder.tsx src/lib/email/send-driver-document-expiry-reminder.ts
   grep -rn "DriverDocumentExpiryReminderEmail" src | head
   ```
   Both files must exist and the symbol must still resolve from its importer.
4. Prove the dead symbols are gone:
   ```bash
   grep -rn "sendDocumentExpiryReminder\|sendMaintenanceReminder" src scripts e2e tests 2>/dev/null
   ```
   Must return **zero lines**. Note `sendDriverDocumentExpiryReminder` contains `sendDocumentExpiryReminder`… no it does not — the live name is `sendDriverDocumentExpiryReminder`, which does NOT contain the dead substring `sendDocumentExpiryReminder` as written (`Driver` sits between `send` and `Document`). So a plain grep is safe here; if any line DOES come back, read it rather than filtering it away.
5. `npx tsc --noEmit` (see `<tsc_gate>` — probe it).

Commit: `refactor(quick-577): delete 4 dead email templates + senders superseded by dispatcher templates`
Body must list the four paths and name the three dispatcher trigger keys that replaced them, plus an explicit line that the `driver-document-expiry-reminder` pair is LIVE and untouched.
  </action>
  <verify>
`git status --porcelain` shows exactly 4 deletions.
`ls src/emails/driver-document-expiry-reminder.tsx src/lib/email/send-driver-document-expiry-reminder.ts` succeeds.
`grep -rn "sendDocumentExpiryReminder\|sendMaintenanceReminder" src scripts e2e tests` returns nothing.
`npx tsc --noEmit` clean, PROBED per `<tsc_gate>`.
  </verify>
  <done>Four files deleted, live pair intact, zero dangling references, tsc clean and proven non-blind, one commit.</done>
</task>

<task type="auto">
  <name>Task 2: Remove the dead /profile menu item and repair every spec that pins it</name>
  <files>
src/components/navigation/user-menu.tsx
e2e/settings/user-menu-gating.spec.ts
  </files>
  <action>
`/profile` is a confirmed 404 for an authenticated OWNER (quick-576 replayed storageState cookies against the running dev server; `find src/app -iname "*profile*"` returns nothing; `next.config.ts` has no rewrite or redirect). Remove the link. **Do NOT build a profile page.**

1. In `src/components/navigation/user-menu.tsx` (~lines 156-178), delete the ENTIRE `<DropdownMenu.Item asChild>` block wrapping `<Link href="/profile">`, **together with the quick-576 comment above it** that records the 404 — the comment exists to explain a link that will no longer be there. Remove the now-unused `User` icon import if nothing else in the file uses it (check before deleting; `tsc` will not flag an unused import).
   Leave the other three items exactly as they are: `/settings/my-notifications` (ungated) and `/settings/notifications` + `/help` (both behind `canSeeOwnerSettings`). **Do not disturb that gating** — it is quick-576's fix and has its own red proof.

2. Find every test that asserts the link before editing:
   ```bash
   grep -rn "/profile\|Profile" e2e src/__tests__ | grep -v node_modules
   ```
   Known: `e2e/settings/user-menu-gating.spec.ts:50` — `const UNGATED_HREFS = ['/profile', '/settings/my-notifications'];`. Also check `owner-more-menu-permissions.test.ts` and `navigation-reachability.spec.ts`.

3. Update `user-menu-gating.spec.ts` in the SAME commit:
   - `UNGATED_HREFS` becomes `['/settings/my-notifications']`.
   - Update both test titles and the OWNER describe's title — they currently say "all four links" and "shows Profile, My Notifications, Settings and Help & Support".
   - **Preserve the positive/negative structure.** The DRIVER test's positive half must still assert a present link (`/settings/my-notifications`), or the negative half proves nothing — a bare absence assertion passes identically when the menu simply failed to open (quick-563/566).
   - **Add an ABSENCE assertion for `/profile`, for the OWNER** — the most permissive viewer, so it cannot be satisfied by a permission merely being switched off. Pair it with the existing positive assertions in the same test. This is quick-566/567's rule: *deleting a nav entry records nothing unless the absence is asserted, or the next task re-adds it.*
   - Extend the spec's `WHY THIS EXISTS` doc block with a quick-577 paragraph: the link was removed because the route does not exist, this is a deliberate unlink (not the accidental kind quick-552/553 spent two tasks recovering), and the absence is now pinned.
   - Keep the locator scoped to `[role="menu"] a`. Never a bare `document.querySelectorAll('a')`.
   - Do NOT mark anything `.skip`.

4. Re-run the spec green. Start `next dev` first if it is stopped; if you swapped files under a running server, stop it, `rm -rf apps/web/.next`, restart before believing a red result.
   ```bash
   npx playwright test e2e/settings/user-menu-gating.spec.ts
   ```
   Both projects (`chromium` and `mobile`) must pass. If auth storageState is stale, re-run `auth.setup.ts` rather than weakening the spec.

Commit: `fix(quick-577): remove dead /profile link from user menu + pin its absence`
  </action>
  <verify>
`grep -rn '"/profile"' src` returns nothing.
`npx playwright test e2e/settings/user-menu-gating.spec.ts` passes in both projects, with a visible test count.
`npx tsc --noEmit` clean.
Menu still renders three links for OWNER, one for DRIVER — confirmed by the spec's own positive assertions.
  </verify>
  <done>The /profile item and its quick-576 comment are gone, the gating spec asserts its absence for an OWNER alongside a positive counter-assertion, and the spec runs green.</done>
</task>

<task type="auto">
  <name>Task 3: Add e2e/.env.example with the six TEST_ keys</name>
  <files>e2e/.env.example</files>
  <action>
Create `apps/web/e2e/.env.example`. Placement rationale: the scope line names "the e2e env example", there is no existing `e2e/.env.example`, and `apps/web/.env.example` carries zero `TEST_` keys — keeping Playwright's env reference beside its own specs is the smaller change.

**Confirm it will not be gitignored before writing it.** Verified at plan time: `apps/web/.gitignore` ignores `.env*.local` and the root ignores `.env*.local` / `.env.local` / `.env` — none of which match `e2e/.env.example`. Re-confirm with `git check-ignore -v e2e/.env.example` (must exit non-zero / print nothing) and, after writing, that `git status` actually shows it as untracked. An ignored example file helps nobody.

Six keys, **placeholder values only — never the real password**:

```
TEST_OWNER_EMAIL=
TEST_OWNER_PASSWORD=
TEST_DRIVER_EMAIL=
TEST_DRIVER_PASSWORD=
TEST_MANAGER_EMAIL=
TEST_MANAGER_PASSWORD=
```

Header comment must carry:
- That the real values live in `apps/web/scripts/seed-qa-accounts.ts` (which creates `owner@test.com`, `manager@test.com`, `driver@test.com`, ~lines 155-182) — name the file, do not copy the secret.
- The defect this file exists to prevent: **quick-575 invented a password (`driver1234`), got a 401, and reported it as a missing account; quick-576 proved the accounts had been healthy all along.** A guessed credential is indistinguishable from a broken environment, and that guess cost a whole task.
- That these feed `e2e/auth.setup.ts` / the `requireRoleAuth` fixtures.

Use placeholder values that cannot be mistaken for real ones (e.g. `owner@example.test` / `replace-me`), or leave them empty — but be consistent, and make sure a reader cannot copy the file and accidentally authenticate.

Do NOT modify `apps/web/.env.example`, `playwright.config.ts`, `auth.setup.ts`, or any fixture. This task adds one file.

Commit: `docs(quick-577): add e2e/.env.example documenting the six TEST_ account keys`
  </action>
  <verify>
`git check-ignore -v e2e/.env.example` prints nothing (file is trackable).
`git status --porcelain` lists it.
`grep -c "TEST_" e2e/.env.example` returns 6.
`grep -rn "TestPass123" e2e/.env.example` returns nothing — the real password must not be in the file.
Header comment names `scripts/seed-qa-accounts.ts`.
  </verify>
  <done>A committed, non-ignored e2e/.env.example with six placeholder keys and provenance pointing at the seed script.</done>
</task>

<task type="auto">
  <name>Task 4: Verification sweep, hex re-measure, blocker write-up, summary + STATE</name>
  <files>
.planning/quick/577-email-convergence-2a-delete-orphans-migr/577-SUMMARY.md
.planning/STATE.md
  </files>
  <action>
**A. Gates.**
1. `npx tsc --noEmit` — PROBED per `<tsc_gate>`. A clean run you did not probe is not evidence.
2. `npx next build` — must succeed. tsc is blind to Tailwind classes, CSS and route resolution; a deleted module that something still resolves at build time shows up here and nowhere else.
3. Full Vitest, SAME reporter as the preflight baseline:
   ```bash
   npx vitest run --reporter=default 2>&1 | tail -20
   ```
   Compare against the preflight numbers. Expected: **unchanged** (preflight step 3 proved no test imports the deletion set). If the FILE count moved, check whether a deleted file was imported by a test before calling it a regression. If a file fails but all its tests pass, read the **Failed Suites** block, not the assertions (quick-546).
4. `npx playwright test e2e/settings/user-menu-gating.spec.ts` — green, with a visible count.

**B. Do-not-touch audit.** `git diff --stat HEAD~4..HEAD` (adjust range to the four commits) and assert NONE of these appear:
`src/emails/carrier/**`, `src/emails/_system/**`, `dynamic-template.tsx`, `body-html-transform.ts`, `template-renderer.ts`, `dispatcher.ts`, `resend-client.ts`, `sender-config.ts`, `html-to-text.ts`, `middleware.ts`, `route-access.ts`, any seed file, `prisma/schema.prisma`, either `vercel.json`.
Also confirm the `defaultHtmlCache` refresh script was NOT run.

**C. Re-measure the hex baseline (step 6).** The audit reported 448 literals across 29 files outside `_system/`. Re-measure and report **root-only, carrier-only, and total**, with the exact command used, e.g.:
```bash
grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails --include=*.tsx | grep -v "/_system/" | wc -l
grep -roE "#[0-9a-fA-F]{3,8}\b" src/emails --include=*.tsx | grep -v "/_system/" | grep "/carrier/" | wc -l
```
State plainly: **unchanged (or changed only by the 4 deletions) because the Shell migration did not happen.** Session 2B needs a figure it can trust, and a number carried forward from an audit is not a measurement.

**D. Write `577-SUMMARY.md`.** It must contain:
1. **The blocker, in full** — reproduce `<blocked_scope>` above: Shell's `bodyHtml: string` contract, the `dangerouslySetInnerHTML` at `Shell.tsx:219`, the four synchronous call sites (`send-driver-invitation.ts:65`, `send-owner-invitation.ts:59`, `automations/actions/send-email.ts:78`, `sign-up/actions.tsx:144` and `:235`), the three forbidden moves (a)/(b)/(c) and why each is forbidden, and the fact that the dark-mode `.dc-body` stylesheet is a private `const CSS` in Shell.tsx exported from nowhere. **Session 2B must be able to read this and not re-attempt the migration.**
2. **Step 5 finding — the answer is YES, and there are TWO emails, not one.** `src/app/(auth)/sign-up/actions.tsx` imports `@react-email/components` directly and sends:
   - `:235` `react: ConfirmEmailTemplate({ firstName, confirmUrl })` from `@/emails/confirm-email` — one of the 19.
   - `:144` `react: AccountExistsEmail({ signInUrl })` — **defined inline in that file**, i.e. a **30th** email template the audit's 29 did not count because it does not live in `src/emails/`.
   Record that both are blocked for the same Shell reason and that `signUpAction`'s behaviour and signature were not changed.
3. Step 7 screenshots: blocked with step 2; `scripts/email-render-qa.ts` deliberately not run.
4. The hex figures from C, with the commands.
5. Test deltas: preflight vs post numbers, same reporter, and the explanation for any movement.
6. The four commits and what each contains.
7. A short "what 2B should do first" note: the blocker needs a decision from the user (the orchestrator is reporting it separately) before any template migration can be planned.

**E. Update `.planning/STATE.md`** — current position, the four commits, and the blocker as an open decision.

Commit: `docs(quick-577): plan, summary, STATE.md`
  </action>
  <verify>
tsc clean and probed; `next build` succeeds; Vitest matches the preflight baseline (or the delta is explained); the gating spec is green.
`git diff --stat` over the task's commits touches no do-not-touch path.
577-SUMMARY.md exists and contains the Shell blocker, both sign-up emails including the inline `AccountExistsEmail`, and the re-measured hex counts with the commands used.
  </verify>
  <done>All gates pass, the do-not-touch set is provably untouched, and the summary carries enough detail that session 2B does not repeat the blocked migration.</done>
</task>

</tasks>

<tsc_gate>
**A clean `tsc --noEmit` is not evidence until you have probed it.**

Insert `const __probe577: number = 'x';` into a file you ACTUALLY edited this task, run `npx tsc --noEmit`, and confirm tsc reports **that** error. Then delete the probe and re-run.

If the only errors reported are syntax errors, or are all in files you did not touch, **the gate is BLIND, not green**: a parse error anywhere in the program (TS1003 / TS1110 / TS1161 / TS1354) suppresses semantic checking of everything. Delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then re-run. Check for stray untracked half-written files from other sessions. Delete your probe when done — a previous run's `__probe.ts` has been found still sitting in the tree.

Note: `apps/web` currently has **no working lint entry point** (`next lint` no longer accepts `--dir`; ESLint 9 finds no flat config). tsc and `next build` are the only real gates. Do not report "lint passed" from a command that errored.
</tsc_gate>

<verification>
- Exactly four files deleted; `driver-document-expiry-reminder.tsx` + `send-driver-document-expiry-reminder.ts` still present and still imported.
- `grep -rn "sendDocumentExpiryReminder\|sendMaintenanceReminder" src scripts e2e tests` → empty.
- `grep -rn '"/profile"' src` → empty; `e2e/settings/user-menu-gating.spec.ts` asserts its absence for OWNER and passes.
- `e2e/.env.example` is tracked (not gitignored), has six TEST_ keys, contains no real password, and names `scripts/seed-qa-accounts.ts`.
- `npx tsc --noEmit` clean and PROBED; `npx next build` succeeds.
- Vitest matches the preflight baseline with the SAME reporter, or the delta is explained.
- `git diff --stat` touches no do-not-touch path; no seed/migration/schema/vercel.json change; the defaultHtmlCache refresh script was not run.
- Nothing marked `.skip`.
- Four commits, one per task.
</verification>

<success_criteria>
- Four dead email files gone, live near-miss pair intact, zero dangling references.
- Dead `/profile` nav entry removed and its absence pinned by a spec that still carries a positive counter-assertion.
- `e2e/.env.example` committed with placeholders and provenance.
- Summary records the Shell blocker in enough detail that session 2B does not re-attempt it, plus the two sign-up emails (including the previously-uncounted inline `AccountExistsEmail`) and a re-measured hex baseline.
- No template was migrated; no `_system/` file was touched.
</success_criteria>

<output>
After completion, create `.planning/quick/577-email-convergence-2a-delete-orphans-migr/577-SUMMARY.md`
</output>
