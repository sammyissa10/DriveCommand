---
status: diagnosed
trigger: "vercel-react-dom-removal"
created: 2026-05-15T00:00:00Z
updated: 2026-05-15T00:00:00Z
symptoms_prefilled: true
goal: investigation_report_only
---

## Current Focus

hypothesis: CONFIRMED — stale lockfile + peer:true hoisting + --legacy-peer-deps combine to leave react-dom absent
test: lockfile analysis, version cross-check, node_modules state inspection
expecting: N/A — root cause found
next_action: deliver report

## Symptoms

expected: react-dom available in apps/web/node_modules after Vercel install; Next.js build succeeds
actual: react-dom absent from apps/web/node_modules after Vercel install; build fails with three "Module not found: Can't resolve 'react-dom'" errors
errors: "Module not found: Can't resolve 'react-dom'" (three occurrences in Vercel build log)
reproduction: Push commit 287df53 to trigger Vercel build; Vercel install command is "cd ../.. && npm install --legacy-peer-deps" (runs from monorepo root, not apps/web)
started: commit 287df53 (commit ec33a15 — react/react-dom version bump in apps/web)
context: Vercel build log says "ignoring workspace config at /vercel/path0/apps/web/.npmrc"

## Eliminated

- hypothesis: react-dom version conflict between workspaces causes a non-resolvable peer dep error
  evidence: versions are technically compatible at semver level; issue is about installation location, not resolution failure
  timestamp: 2026-05-15

## Evidence

- timestamp: 2026-05-15
  checked: apps/web/package.json
  found: react = "^19.2.4", react-dom = "^19.2.4" (bumped from ^19.0.0 in commit ec33a15)
  implication: apps/web wants the latest patch of react-dom 19

- timestamp: 2026-05-15
  checked: apps/mobile/package.json
  found: react = "19.2.0" (exact pin), react-dom = "19.2.0" (exact pin)
  implication: mobile pins both to the older exact patch; these two workspaces require different versions

- timestamp: 2026-05-15
  checked: package-lock.json packages map — react-dom entries
  found: TWO react-dom entries:
    - node_modules/react-dom = 19.2.4, marked "peer: true"
    - apps/web/node_modules/react-dom = 19.2.0, NOT marked peer
  implication: npm hoisted 19.2.4 only as a peer dep; apps/web's actual satisfying copy was 19.2.0 nested

- timestamp: 2026-05-15
  checked: lockfile apps/web workspace entry vs apps/web/package.json
  found: lockfile records apps/web react-dom dep as "^19.2.0" but package.json now says "^19.2.4"
  implication: lockfile is STALE — it was not regenerated after the ^19.2.4 bump in ec33a15

- timestamp: 2026-05-15
  checked: apps/web/.npmrc
  found: playwright_skip_browser_download=true and legacy-peer-deps=true
  implication: Vercel ignores this file (workspace .npmrc not honoured in Vercel's root install context); Vercel passes --legacy-peer-deps on CLI directly but the conflict still exists

- timestamp: 2026-05-15
  checked: current node_modules state (locally working install)
  found: apps/web/node_modules/react-dom = 19.2.0 EXISTS; node_modules/react-dom = 19.2.4 EXISTS; apps/mobile/node_modules/react-dom = ABSENT (mobile uses hoisted)
  implication: local install works because both copies exist; Vercel fails because one is removed

- timestamp: 2026-05-15
  checked: mechanism of Vercel failure
  found: Vercel's "npm install --legacy-peer-deps" + stale lockfile causes npm to re-evaluate: it sees apps/web now wants ^19.2.4, installs 19.2.4 as the satisfying hoisted version, and removes the nested apps/web/node_modules/react-dom@19.2.0 as now-redundant. But the 19.2.4 hoisted copy is marked "peer:true" — with --legacy-peer-deps peer installs are suppressed. Net result: no react-dom anywhere.
  implication: "removed 1 package, changed 3 packages" in Vercel log = npm removing apps/web/node_modules/react-dom@19.2.0 + changing related scheduler/react entries

## Resolution

root_cause: The lockfile is stale after commit ec33a15 bumped apps/web react-dom from ^19.0.0 to ^19.2.4. The lockfile still records ^19.2.0 as the declared version for that workspace, causing npm on Vercel to detect a mismatch, re-resolve, dedupe the nested apps/web/node_modules/react-dom@19.2.0 away (treating hoisted 19.2.4 as sufficient), but then --legacy-peer-deps suppresses the hoisted peer-flagged 19.2.4 install, leaving react-dom absent entirely. The root cause is the lockfile not being regenerated after the version bump — so Vercel's install diverges from the local working state.
fix: N/A (investigation_report_only mode)
verification: N/A
files_changed: []
