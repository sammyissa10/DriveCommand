# quick-605 · 02 — the three e2e specs that came close, and why each was the wrong shape

The grep that settles the headline first:

```
$ grep -rn "driver-pay/settlements\|checklists/automation\|docs/features\|docs/database" apps/web/e2e/
(no output)
```

**No spec in `apps/web/e2e/` names any of the seven routes in the trace.** So the question is not
"which spec failed to assert enough" — it is "which specs came close enough that someone would
reasonably have believed these routes were covered". Three did, and each is a different shape of near
miss.

---

## `e2e/carrier/reports.spec.ts` — a different directory, one word apart

Every `goto()` in the file, enumerated:

```
/carrier/reports/aging
/carrier/reports/driver-pay
/carrier/reports/performance
/carrier/reports/revenue
```

**`/carrier/reports/driver-pay` is NOT `/carrier/driver-pay/reports`.** They are two distinct pages in
two distinct directories:

- `src/app/(owner)/carrier/reports/driver-pay/page.tsx` — the one the spec visits (`reports.spec.ts:32`,
  `:39`, `:48`).
- `src/app/(owner)/carrier/driver-pay/reports/page.tsx` — the one in the nuqs trace.

Checked before answering, because two similarly-named routes is a trap this repo has hit before
(`project_two_route_systems.md`):

- `ls src/app/(owner)/carrier/reports/` → `aging`, `driver-pay`, `performance`, `revenue`,
  `todays-trips`. A real directory with its own pages, not an alias.
- `next.config.ts:19` `redirects()` returns exactly two entries, both `/carrier/dispatches*` →
  `/carrier/trips*`. **There is no redirect between the two driver-pay routes.**
- `grep -rn "useDataGrid\|data-grid" src/app/(owner)/carrier/reports/driver-pay/` → no output. The page
  this spec visits is not a nuqs consumer at all.

**Verdict:** this spec was never near it. The name collision makes it look like one character of
difference; it is two unrelated pages, and the one under test cannot throw this error.

---

## `e2e/carrier/access.spec.ts` — a redirect assertion never renders the page

Three describe blocks, three storage states:

- `:12` `Carrier Access — Driver role blocked`, `:13` `storageState: driver.json`. Every assertion is
  `expect(page.url()).not.toContain(...)` — `:19`, `:25`, `:31`, `:37`, `:43`. A driver is bounced
  before the page renders; that is the whole point of the block.
- `:53` `Carrier Access — Unauthenticated`, `:55`/`:65`/`:75` empty storage state, asserting
  `expect(page.url()).toMatch(/\/login/)` at `:60`, `:69`, `:78`.
- `:87` `Carrier Access — Owner allowed`, `:88` `storageState: owner.json`. This block DOES render as an
  owner — and it visits `/carrier/dashboard` (`:91`), `/carrier/dispatches` (`:98`) and
  `/carrier/reports/driver-pay` (`:104`). None of the three is a nuqs consumer.

**Verdict:** the route name appearing in a file is not coverage. Two of the three blocks assert that a
page is *not* reached; the third reaches three pages, none of which renders a grid.

---

## `e2e/owner/navigation-reachability.spec.ts` — it proves the LINK, not the DESTINATION

`REQUIRED_SIDEBAR_HREFS` (`:57`–`:91`) is a list of hrefs; the test at `:95` does exactly one
navigation, `page.goto('/carrier/dashboard')` (`:96`), collects the sidebar's `href` attributes, and
asserts membership (`:106`, `:108`). **It never navigates to any destination in the list.**

Two things follow, and the second is the more interesting one:

1. None of the seven trace routes is in `REQUIRED_SIDEBAR_HREFS` in the first place. Checked:
   `grep -rn "driver-pay/settlements\|checklists/automation\|driver-pay/reports" src/components/`
   filtered to `href` returns nothing — **the sidebar does not link these routes at all.** They are
   reached from `/checklists` and from the Driver Pay pages themselves. So even a version of this spec
   that DID navigate would not have reached them.

2. **The irony is worth stating plainly.** This is the one spec in the repo whose entire stated purpose
   is that a navigation claim is not finished until a real browser confirms it — its header
   (`:4`–`:45`) documents seven consecutive phases that reported a nav entry as wired when it was not,
   and the repo's own convention out of quick-566/567 is that *a nav claim is not done until a DOM
   query finds its link*. It proves the link exists. It does not ask whether the thing on the other end
   of the link renders. Four of the seven routes in this trace answer **HTTP 500**; a spec built to
   stop "reported as wired, actually unreachable" cannot see it, because unreachability by 500 is not
   the failure mode it was written for.

**Verdict:** the right instrument pointed one step short of the destination.

---

## Is the suite even running, and is anything skipped out of it?

- `.github/workflows/playwright.yml` runs on `push` and `pull_request` to `master`, and on
  `workflow_dispatch`. The command is `npx playwright test --project=chromium` — **the full chromium
  suite, not a `@smoke` subset.** `@smoke` appears only as a tag inside individual test titles; nothing
  filters on it in CI.
- `grep -rn "test.skip\|describe.skip\|test.fixme" apps/web/e2e/` returns skips only inside test bodies
  and all data-conditional (`'No clients in list — skipping edit test'`, `'No dispatches found'`, and
  `testInfo.project.name === 'mobile'` guards). **No spec file is skipped out of the run**, and none of
  the seven routes is inside a skipped block, because none of them is inside any block.
- **Whether the workflow is currently green on `master` could not be read from this machine.** `gh` is
  unauthenticated here (`gh run list` → *"To get started with GitHub CLI, please run: gh auth login"*),
  and I did not authenticate it. That is a stated limitation, not a pass.

  What *can* be established without CI access, and is the load-bearing half: all five files involved —
  `(dev)/layout.tsx`, `useGridUrlState.ts`, and the `settlements` / `automation` / `docs/features`
  pages — are present on `origin/master` (`git cat-file -e origin/master:<path>` succeeds for each),
  whose tip is `86d3a584`, dated 2026-09-03. So the defect has been on the branch the workflow watches.
  **"e2e is not run" is not available as an excuse.** The reason it did not fire is structural and is
  the three sections above: no spec navigates to any of these routes as an authorised user.

  (Local `master` is 101 commits ahead of `origin/master` — those 101 have not been pushed, so the
  workflow has not seen them. That is a fact about this working copy, not about the defect, which
  predates them.)
