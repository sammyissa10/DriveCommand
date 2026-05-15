---
phase: quick-332
plan: 01
subsystem: web/dependencies
tags: [react-dom, npm, build-fix, dependencies]
dependency_graph:
  requires: []
  provides: [react-dom-explicit-dep]
  affects: [apps/web]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified: []
decisions:
  - "package.json edit skipped — react-dom was already declared at ^19.2.4 matching react"
  - "npm install skipped — node_modules/react-dom was already fully installed (index.js, client.js, cjs/) at 19.2.0"
  - "No commit made — neither apps/web/package.json nor package-lock.json changed"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-15"
  tasks: 3
  files: 0
---

# Quick-332: Add react-dom to apps/web/package.json — Summary

## One-liner

react-dom was already explicitly declared at ^19.2.4 and fully installed at 19.2.0; local node_modules were intact, build compiled successfully — no changes required.

## What Was Found

### apps/web/package.json State (before any action)

react-dom was ALREADY present in `dependencies` at the same pin as react:

```json
"react": "^19.2.4",
"react-dom": "^19.2.4",
```

No edit to package.json was needed.

### apps/web/node_modules/react-dom State (before any action)

The plan noted the directory might be corrupted (only LICENSE + README.md). On inspection, it was fully intact:

```
LICENSE  README.md  cjs/  client.js  client.react-server.js
index.js  package.json  profiling.js  server.browser.js
server.js  server.node.js  static.browser.js  static.js  ...
```

Installed version: react-dom 19.2.0

No reinstall was required.

## npm install

Skipped — node_modules/react-dom was already fully installed and intact. Running `npm install --legacy-peer-deps` would have been a no-op.

## TypeScript Check

```
npx tsc --noEmit
```

Result: Exited with no errors. Zero react-dom-related module resolution errors.

## Build Output

```
npm run build
```

Key lines:
```
✓ Compiled successfully in 31.3s
✓ Completed runAfterProductionCompile in 120s
✓ Generating static pages using 11 workers (211/211) in 1737ms
```

No "Module not found: Can't resolve 'react-dom'" error appeared. The only non-fatal message was a pre-existing MDX modules.md read error unrelated to react-dom.

## Commit

No code commit was made — neither `apps/web/package.json` nor `package-lock.json` changed. Per plan instructions: "If NEITHER file changed, skip the commit and report that the issue must lie elsewhere."

**Implication for Vercel:** If the Vercel build is failing with "Can't resolve 'react-dom'", the cause is NOT a missing declaration in package.json. Likely causes to investigate:
1. Vercel build cache serving a stale/corrupted node_modules — trigger a clean build (disable cache in Vercel dashboard)
2. A version conflict at install time on Vercel's build environment
3. A peer dependency resolution difference between local (npm) and Vercel (npm)

## Tiptap Renderer Fixes (quick-331)

Confirmed intact. Last commit is `5f12e53` (docs(quick-331): complete Tiptap renderer fix plan). The following quick-331 commits were NOT touched:

- `ec33a15` fix(quick-331): resolve react/react-dom version mismatch, fix ES2018 regex flag
- `0f66a3e` test(quick-331): add real-pipeline renderer tests, remove hardcoded-HTML dispatcher mock
- `3c0c5a2` fix(quick-331): switch @tiptap/html -> @tiptap/html/server, remove silent JSON fallback

## Self-Check

- apps/web/package.json contains `"react-dom": "^19.2.4"` — CONFIRMED
- apps/web/node_modules/react-dom/index.js exists — CONFIRMED
- apps/web/node_modules/react-dom/client.js exists — CONFIRMED
- npm run build completed without react-dom resolution error — CONFIRMED
- Tiptap commits from quick-331 intact — CONFIRMED

## Self-Check: PASSED
