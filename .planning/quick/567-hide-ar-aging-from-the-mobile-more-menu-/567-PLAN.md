# quick-567 — PLAN

**Hide AR Aging on mobile too, closing the desktop/mobile split quick-566 reopened.**

Mode: quick · 1 plan · 3 tasks · autonomous
Baseline commit: `6810cc31`

---

## Why

quick-554 added AR Aging to the mobile More menu *specifically* to end a
desktop/mobile disagreement — the menu was the one surface missing a report the
sidebar offered. quick-566 then removed the desktop sidebar entry and, being
scoped to the sidebar, left the mobile one standing. Net result: AR Aging is one
tap away on a phone and absent on a laptop — the same split quick-554 closed,
running the other way.

This task removes the mobile entry on **the same terms as the sidebar**: nav
entry only. Route, page, API, the `arAgingReport` permission key, its
team-permissions catalogue row and its `PERMISSION_GATED_PATHS` row all stay.

After this task `/carrier/reports/aging` has **no nav entry on any surface** and
is reachable only by direct URL, still gated. That is the requested end state —
record it plainly rather than letting a later reader mistake it for the
quick-552/553 accident where destinations lost their links by mistake.

---

## Grounding (already verified — do NOT re-explore)

**The entry.** `apps/web/src/components/navigation/owner-more-menu.tsx:96`, in
the `Reports` section of `menuSections`:
```ts
{ label: 'AR Aging', href: '/carrier/reports/aging', icon: BarChart3, permission: 'arAgingReport' },
```
`BarChart3` is still used by Revenue / Driver Pay / Performance / Today's Trips —
verify nothing is orphaned, but it will not be.

**The stale header comment.** Same file, ~lines 54-57:
> `- AR Aging is ADDED. It was the one report with no entry here, so the menu was missing a destination the sidebar offers. That was the only legitimate difference between the two, and it is removed rather than preserved.`

That sentence describes a decision this task reverses and becomes false on
commit. Correct it — CLAUDE.md records repeatedly that a comment asserting an
invariant which no longer holds is how these bugs survive.

**TWO unit assertions will go RED. This is expected; they encode the decision
being reversed.** `apps/web/src/components/navigation/__tests__/owner-more-menu-permissions.test.ts`:
1. `'an OWNER sees everything, Team Permissions included'` — contains
   `expect(hrefs).toContain('/carrier/reports/aging');`
2. the `it.each([...])` table — row `['arAgingReport', '/carrier/reports/aging']`,
   whose second half asserts a MANAGER *with* the permission DOES see the href.

**The integrity floors still hold — check, do not change them.** Items go 15 → 14
(floor is `>= 12`); permissioned items go 11 → 10 (floor is `>= 9`). Both pass.
Do not lower them, and do not raise them to fit; they exist so an emptied menu
cannot pass vacuously.

**Two assertions that must stay green untouched:**
- `'an empty section is dropped rather than rendered as a bare header'` — it sets
  `arAgingReport: false` among four; with no item reading that key it is simply
  inert, and the Reports section still empties. Leave it exactly as is.
- `'every gated menu item uses the same permission PERMISSION_GATED_PATHS does'`
  — iterates menu items, so one fewer item is fine.

**Stale comments in the e2e spec.** `apps/web/e2e/owner/navigation-reachability.spec.ts`
lines ~77 and ~83, both written by quick-566 yesterday, state that AR Aging "had
a link on ONE surface, not zero" and "is still reachable from the mobile
more-menu's Reports section". Both are false after this task. Correct them.
The spec's `REQUIRED_SIDEBAR_HREFS` and its quick-566 counter-assertion test need
**no** change — they are about the sidebar and remain correct.

**The doc.** `docs-content/client/carrier-reports-aging.mdx:25` currently reads:
> `On mobile, tap **More → Reports → AR Aging**. On desktop the report is not in the sidebar — open it directly at` `/carrier/reports/aging`. `The report loads with all unpaid invoices.`

Half of that is about to be false too. Rewrite to name **only the direct URL**,
per the brief. Keep `feature-registry.ts`'s `carrier-reports-aging` entry — the
route still works, `check-doc-drift.ts` is a CI gate and `renderClientDoc` throws
for a slug absent from the registry.

**MUST NOT TOUCH (all re-verified present on disk at `6810cc31`):**
- `apps/web/src/app/(owner)/carrier/reports/aging/` — `page.tsx`, `AgingDesktop.tsx`, `AgingMobile.tsx`, `aging-report-utils.ts`
- `apps/web/src/app/api/v1/carrier/reports/aging/route.ts`
- `apps/web/src/lib/auth/permissions.ts` — the `arAgingReport` field (36), its two defaults (90, 111), the team-permissions catalogue row (170) and **`PERMISSION_GATED_PATHS` (222)**
- `apps/web/src/lib/carrier/reports.ts` `getAgingReport`, `report-access.ts`
- `apps/web/src/lib/carrier/__tests__/reports-permission-gating.test.ts` — must stay green with ZERO diff; if it reddens the gate was damaged
- `apps/web/src/components/carrier/clients/ClientFinancials.tsx` (API consumer), `CarrierBreadcrumb.tsx` (label map)
- `docs-content/sysadmin/carrier-reports-aging.mdx` — read at quick-566, makes no nav claim
- The desktop sidebar. `components/Sidebar/` gets zero diff this task.

**Nothing in `apps/mobile` references this route** — grep-verified empty. The
React Native app is untouched; "mobile" here means the `lg:hidden` web More menu.

---

## Task 1 — Remove the entry, correct the comment

`apps/web/src/components/navigation/owner-more-menu.tsx`

1. Delete the AR Aging item from the `Reports` section.
2. Rewrite the stale `- AR Aging is ADDED` bullet in the header comment to
   record what is now true: quick-554 added it to align the two surfaces;
   quick-566 removed the desktop sidebar entry; quick-567 removes this one, so
   the surfaces agree again — at "no nav entry, URL only" rather than at "both".
   Say that the route/API/permission/`PERMISSION_GATED_PATHS` are intact and
   that restoring it is re-adding the one-line item, in the same
   one-line-reversible shape quick-566 used on the sidebar.

**Verify before committing:** `BarChart3` still used; `git diff` touches this
file only; `PERMISSION_GATED_PATHS` and the aging route/page/API unchanged on
disk.

Commit: `fix(quick-567): drop AR Aging from the mobile More menu`

## Task 2 — Update the guard, and pin the absence

`apps/web/src/components/navigation/__tests__/owner-more-menu-permissions.test.ts`

1. Remove `expect(hrefs).toContain('/carrier/reports/aging')` from the OWNER
   case, and remove the `['arAgingReport', '/carrier/reports/aging']` row from
   the `it.each` table.
2. **Do not stop at deletion.** quick-566's lesson: a removed line records
   nothing and the next task re-adds the entry. Add a case pinning the absence
   as a decision — `/carrier/reports/aging` must NOT appear in the menu **for an
   OWNER, i.e. the most permissive viewer**, so the assertion cannot be
   satisfied by a permission simply being off. Pair it with the positive half
   (quick-563's rule): assert the other four report hrefs — `revenue`,
   `driver-pay`, `performance`, `todays-trips` — ARE still there, or a passing
   test would equally describe a Reports section that had vanished entirely.
3. Comment the new case with why the absence is deliberate and how to reverse it.

Also correct the two stale quick-566 comments at
`apps/web/e2e/owner/navigation-reachability.spec.ts` ~77 and ~83.

And rewrite `docs-content/client/carrier-reports-aging.mdx:25` to name only the
direct URL — no sidebar path, no More-menu path.

**Prove the guard red before green:** temporarily reinstate the menu item,
confirm the new absence case FAILS, then remove it again. A guard never seen red
is not evidence.

Commit: `test(quick-567): pin AR Aging's absence from both nav surfaces`

## Task 3 — Verify and report

1. **DOM proof at 390px, real Chromium, signed in as owner.** Open the More
   menu (it is a full-screen overlay behind the bottom nav's `More` control —
   it must be OPENED, not merely present in the DOM). Report the full list of
   menu hrefs, confirm `/carrier/reports/aging` is ABSENT, and confirm
   `revenue`, `driver-pay`, `performance`, `todays-trips` are all PRESENT.
   The menu filters on `useAuth()` and **fails OPEN while unloaded** — so wait
   for a gated href to appear before reading, or an unloaded menu will show
   everything and read as a false negative.
2. **`/carrier/reports/aging` still returns 200** by direct URL as a permitted
   owner, with the page rendering. Report the status code.
3. `tsc --noEmit` **PROBED** in `apps/web` AND `apps/mobile` — inject
   `const __probe: number = 'y'` into a file this task actually edited, confirm
   tsc reports THAT error, remove the probe, re-run clean, confirm `git diff`
   empty. A clean run alone is not evidence; if the only errors are syntax
   errors or sit in files nobody touched (including under `.next/`), the gate is
   BLIND. Delete `apps/web/.next/dev/types/validator.ts` and
   `apps/web/tsconfig.tsbuildinfo` if `.next` errors appear.
4. **Suite before/after with the SAME reporter**, baseline on a stashed-clean
   tree. quick-566 measured 1730 tests / 1600 passed / 66 failed / 61 pending
   with `--reporter=json`; use the same reporter so the delta means something.
   `--reporter=basic` does not exist in vitest 4 and exits 0 having run ZERO
   tests; a run printing no test counts is not a green run. Compare TEST counts,
   not file counts. Do NOT start a run and then edit files while it is going.
   Expect a small negative delta from the two removed `it.each`/`toContain`
   assertions plus a small positive from the new case — state the arithmetic.
5. **Lint:** `apps/web` has no working entry point (`next lint` rejects `--dir`
   on this Next version; ESLint 9 finds no flat config). Report that; do not
   claim lint passed.

Write `567-SUMMARY.md` ending in a per-item audit of the brief's four asks —
remove the entry · reversal comment · mdx names only the URL · DOM proof at
390px + 200 by URL — each IMPLEMENTED / PARTIALLY / NOT DONE.

Commit: `docs(quick-567): plan, summary, STATE.md`

---

## Constraints

- Nav entry only. Do NOT delete or disable the route, page, API, permission key,
  catalogue row or `PERMISSION_GATED_PATHS` row.
- Do NOT change any other nav entry on either surface. The desktop sidebar gets
  zero diff.
- Do NOT restructure the More menu or its sections.
- No DDL, no data changes.
- PowerShell has NO `&&` / `||` statement separators — use `;` or `if ($?) { }`.
- `git worktree remove --force`, never `Remove-Item`; put any baseline worktree
  INSIDE the repo and never symlink `node_modules` into it.
- Swapping files under a running `next dev` poisons the Turbopack cache and
  reports correct work as missing. A red DOM check straight after a stash or
  file swap is a stale bundler first: stop the server, delete `apps/web/.next`,
  restart, re-run.
- Commit each task atomically. Do NOT push — the user pushes.
