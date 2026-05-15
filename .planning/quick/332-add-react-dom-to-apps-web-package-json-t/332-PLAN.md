---
phase: quick-332
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
  - package-lock.json
autonomous: true

must_haves:
  truths:
    - "react-dom is listed as an explicit dependency in apps/web/package.json at the same pin/version as react"
    - "apps/web/node_modules/react-dom contains a usable installed package (index.js, package.json, cjs/ entry points)"
    - "Running tsc --noEmit from apps/web reports no react-dom-related module resolution errors"
    - "Running npm run build from apps/web completes without 'Module not found: Can't resolve react-dom' errors"
    - "The change is committed and pushed to origin/master"
  artifacts:
    - path: "apps/web/package.json"
      provides: "Explicit react-dom dependency declaration"
      contains: "\"react-dom\""
    - path: "apps/web/node_modules/react-dom/package.json"
      provides: "Installed react-dom package"
  key_links:
    - from: "apps/web/package.json"
      to: "apps/web/node_modules/react-dom"
      via: "npm install --legacy-peer-deps"
      pattern: "react-dom"
    - from: "apps/web (Next.js build)"
      to: "react-dom"
      via: "module resolution"
      pattern: "Can't resolve 'react-dom'"
---

<objective>
Fix the Vercel production build failure caused by missing react-dom resolution. Confirm react-dom is listed in apps/web/package.json at the exact same pin style and version as react, install dependencies cleanly, verify the local node_modules entry is complete, run typecheck + build to prove the build error is resolved, then commit and push.

Purpose: Vercel build fails with "Module not found: Can't resolve 'react-dom'" because react-dom is either missing from explicit dependencies or its installed package is corrupted. Without react-dom, no Next.js app can render — the entire web app is blocked from deploying.

Output: A working apps/web/package.json with react-dom pinned matching react, a healthy apps/web/node_modules/react-dom, a green local build, and the fix committed + pushed.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify react-dom is declared in apps/web/package.json matching react's pin</name>
  <files>apps/web/package.json</files>
  <action>
    Read apps/web/package.json and locate the "react" entry in the "dependencies" section.

    Current observed state (as of plan creation): react is "^19.2.4" and react-dom is "^19.2.4".

    Validate:
    1. The react-dom entry exists in "dependencies" (not devDependencies).
    2. The version string of react-dom EXACTLY matches the version string of react, character-for-character — same pin style (caret/tilde/exact) and same version number.
    3. If react is "^19.2.4", react-dom must be "^19.2.4".
    4. If react is "19.2.4" (exact), react-dom must be "19.2.4" (exact).

    If react-dom is missing OR its version string does not match react's: edit apps/web/package.json to add/correct react-dom in the dependencies block immediately after the "react" entry, using the EXACT same version string as react.

    If react-dom is already present and matches react's pin: make NO edit to package.json — the file is already correct. Note this in the task summary.

    Do NOT modify any other package.json files (packages/types, packages/validation, packages/api-client, apps/mobile).
    Do NOT bump react or react-dom to a different version.
    Do NOT touch @types/react-dom (it is already in devDependencies as "^19").
  </action>
  <verify>
    Read apps/web/package.json and confirm:
    - "react-dom" appears in "dependencies"
    - The version string of react-dom is identical to the version string of react
    - No other dependencies were modified
  </verify>
  <done>
    apps/web/package.json has react-dom in dependencies with the exact same version pin as react.
  </done>
</task>

<task type="auto">
  <name>Task 2: Clean install and verify react-dom resolves locally</name>
  <files>package-lock.json, apps/web/node_modules/react-dom/</files>
  <action>
    From the repo root (c:/Users/sammy/Projects/DriveCommand), run:

    ```
    npm install --legacy-peer-deps
    ```

    Wait for it to complete. If it fails with peer dependency errors, surface the error and stop — do NOT add overrides or change other package versions.

    After install completes, verify the react-dom package was installed cleanly by listing apps/web/node_modules/react-dom/. The directory MUST contain at minimum:
    - package.json
    - index.js
    - client.js (or cjs/react-dom.production.min.js)

    If the directory is missing key files (e.g., only LICENSE + README — which was the broken state before this fix), the install did not pick up react-dom. In that case:
    1. Remove apps/web/node_modules/react-dom entirely
    2. Re-run npm install --legacy-peer-deps from repo root
    3. Re-verify

    Do NOT delete the full node_modules — only react-dom if corrupted.
  </action>
  <verify>
    Run: `ls apps/web/node_modules/react-dom/`
    Expected: package.json, index.js, client.js, cjs/ (and friends) are all present.

    Run: `cat apps/web/node_modules/react-dom/package.json` — confirm "name": "react-dom" and "version" starts with "19.2".
  </verify>
  <done>
    apps/web/node_modules/react-dom contains a fully installed react-dom 19.2.x package with index.js and client.js present.
  </done>
</task>

<task type="auto">
  <name>Task 3: Typecheck, build, commit, and push</name>
  <files>apps/web/, .git/</files>
  <action>
    From apps/web (cd apps/web first):

    1. Run: `npx tsc --noEmit`
       - Expected: no errors related to react-dom or missing modules.
       - If type errors specifically reference missing react-dom types AND @types/react-dom is at "^19" already, surface the errors. Otherwise, ignore pre-existing unrelated errors but document them.

    2. Run: `npm run build`
       - Expected: build completes with no "Module not found: Can't resolve 'react-dom'" error.
       - The build script runs: build:search-index → build:admin-search → prisma generate → next build.
       - If the build fails for a reason UNRELATED to react-dom (e.g., env var missing, prisma issue), note the failure but consider the react-dom fix successful if the specific "Can't resolve react-dom" error no longer appears.

    3. From repo root, stage and commit:
       ```
       git add apps/web/package.json package-lock.json
       git commit -m "fix(web): add react-dom 19.2.4 to explicit dependencies"
       ```
       Note: If apps/web/package.json was already correct (Task 1 made no edit) but the lockfile changed during npm install, still commit the lockfile. If NEITHER file changed, skip the commit and report that the issue must lie elsewhere.

    4. Push:
       ```
       git push origin master
       ```
  </action>
  <verify>
    - `npx tsc --noEmit` exits 0 (or only with pre-existing unrelated errors)
    - `npm run build` succeeds OR fails without the "Can't resolve 'react-dom'" error
    - `git log -1 --oneline` shows the new fix commit
    - `git status` shows working tree clean (or only pre-existing unrelated changes)
    - `git push` output confirms push to origin/master
  </verify>
  <done>
    Local build no longer fails on react-dom resolution; commit "fix(web): add react-dom 19.2.4 to explicit dependencies" is pushed to origin/master.
  </done>
</task>

</tasks>

<verification>
End-to-end success means:
1. apps/web/package.json has react-dom in dependencies, pin matching react exactly.
2. apps/web/node_modules/react-dom is a complete, usable package (index.js present, not just LICENSE+README).
3. Local `npm run build` from apps/web does NOT emit "Module not found: Can't resolve 'react-dom'".
4. Commit + push to origin/master complete so Vercel will pick up the fix.

Manual confirmation by user after push: trigger a new Vercel deploy (or wait for git-push-triggered deploy) and confirm the build passes.
</verification>

<success_criteria>
- apps/web/package.json contains `"react-dom": "<same-pin-as-react>"` in dependencies
- `ls apps/web/node_modules/react-dom/` shows index.js, client.js, package.json
- `npm run build` in apps/web completes without the react-dom resolution error
- `git log` on master shows the fix commit pushed to origin
</success_criteria>

<output>
After completion, create `.planning/quick/332-add-react-dom-to-apps-web-package-json-t/332-SUMMARY.md` documenting:
- What was found in package.json before the fix (was react-dom missing, or was version mismatched, or was node_modules corrupted?)
- The exact edit made (or "no edit needed" if package.json was already correct)
- Whether the npm install repaired the node_modules entry
- tsc and build output (key lines)
- The commit hash pushed
</output>
