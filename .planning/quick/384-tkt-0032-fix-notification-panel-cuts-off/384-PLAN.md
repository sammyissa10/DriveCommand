---
phase: quick-384
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/driver/driver-notification-panel.tsx
  - apps/web/src/components/navigation/notification-center.tsx
autonomous: true

must_haves:
  truths:
    - "Notification panel no longer clips at the bottom on mobile web browsers"
    - "Panel height adapts to actual viewport (accounts for address bar and bottom nav)"
    - "Panel still scrolls internally when content exceeds available height"
    - "TypeScript compiles with no new errors"
  artifacts:
    - path: "apps/web/src/components/driver/driver-notification-panel.tsx"
      provides: "Driver notification panel with viewport-aware max-height"
      contains: "max-h-[calc(100dvh-140px)]"
    - path: "apps/web/src/components/navigation/notification-center.tsx"
      provides: "Owner notification center with viewport-aware max-height"
      contains: "max-h-[calc(100dvh-140px)]"
  key_links:
    - from: "driver-notification-panel.tsx"
      to: "viewport height"
      via: "max-h-[calc(100dvh-140px)] tailwind class"
      pattern: "max-h-\\[calc\\(100dvh-140px\\)\\]"
    - from: "notification-center.tsx"
      to: "viewport height"
      via: "max-h-[calc(100dvh-140px)] tailwind class"
      pattern: "max-h-\\[calc\\(100dvh-140px\\)\\]"
---

<objective>
Fix TKT-0032: Notification panels clip at the bottom on mobile web because they use a hardcoded `max-h-[480px]`. Replace with a dynamic viewport unit (`100dvh`) that accounts for mobile browser chrome (address bar, bottom nav).

Purpose: Mobile drivers and owners can fully scroll/read all notifications without the panel being cut off by browser UI.
Output: Both notification panels (driver + owner) use `max-h-[calc(100dvh-140px)]`, TypeScript passes, single commit shipped.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@apps/web/src/components/driver/driver-notification-panel.tsx
@apps/web/src/components/navigation/notification-center.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace hardcoded max-h-[480px] with max-h-[calc(100dvh-140px)] in both notification panels</name>
  <files>
    apps/web/src/components/driver/driver-notification-panel.tsx
    apps/web/src/components/navigation/notification-center.tsx
  </files>
  <action>
    Two files need the exact same className edit:

    1. `apps/web/src/components/driver/driver-notification-panel.tsx` (line 117):
       - Find: `max-h-[480px]`
       - Replace with: `max-h-[calc(100dvh-140px)]`
       - Confirm the surrounding class `overflow-y-auto` is still present on the same div (it is — the existing class list already has it).

    2. `apps/web/src/components/navigation/notification-center.tsx` (line 147):
       - Find: `max-h-[480px]`
       - Replace with: `max-h-[calc(100dvh-140px)]`
       - Confirm `overflow-y-auto` remains on the same div.

    Rationale: `dvh` (dynamic viewport height) automatically shrinks/grows with mobile browser chrome (address bar collapse/expand, bottom nav). The 140px buffer = header (~56px) + dropdown offset (~8px) + bottom safe-zone (~76px) so the panel never extends past the visible viewport.

    Constraints:
    - DO NOT use hardcoded pixel values for max-height
    - DO NOT use `vh` (use `dvh` — `vh` is incorrect on iOS Safari with collapsing address bar)
    - DO NOT change panel width (`w-[calc(100vw-2rem)] sm:w-[380px]` stays)
    - DO NOT change positioning, z-index, shadows, borders, background, or any other styling
    - DO NOT touch state, hooks, business logic, or any other component
    - DO NOT add new imports or dependencies
  </action>
  <verify>
    After edits, run from repo root:
    ```
    npx tsc --noEmit -p apps/web/tsconfig.json
    ```
    Must pass with zero new errors.

    Then grep to confirm no stragglers:
    ```
    grep -rn "max-h-\[480px\]" apps/web/src
    ```
    Must return zero results.

    Then grep to confirm both panels have the new value:
    ```
    grep -rn "max-h-\[calc(100dvh-140px)\]" apps/web/src
    ```
    Must return exactly 2 results (driver-notification-panel.tsx and notification-center.tsx).
  </verify>
  <done>
    - Both files contain `max-h-[calc(100dvh-140px)]` exactly once each
    - Zero occurrences of `max-h-[480px]` remain in `apps/web/src`
    - `npx tsc --noEmit` passes
    - `overflow-y-auto` is still on both panel divs
    - No other lines in either file were modified
  </done>
</task>

<task type="auto">
  <name>Task 2: Commit and push the fix</name>
  <files>
    apps/web/src/components/driver/driver-notification-panel.tsx
    apps/web/src/components/navigation/notification-center.tsx
  </files>
  <action>
    Stage only the two modified files and create a single commit:

    ```
    git add apps/web/src/components/driver/driver-notification-panel.tsx apps/web/src/components/navigation/notification-center.tsx
    git commit -m "fix(notifications): use dvh-based max-height so notification panel doesn't clip on mobile web [TKT-0032]"
    git push origin master
    ```

    Constraints:
    - Use the exact commit message above (matches TKT-0032 tracking convention)
    - Do NOT use `git add .` or `git add -A` (other untracked planning files exist)
    - Do NOT amend any prior commit
    - Must push to `origin master` per project workflow (GitHub stays in sync)
  </action>
  <verify>
    ```
    git log -1 --oneline
    ```
    Must show the new commit with message starting `fix(notifications): use dvh-based max-height...`

    ```
    git status
    ```
    The two notification panel files must not appear as modified (they are committed).
  </verify>
  <done>
    - Single commit landed with the exact message above
    - Pushed to `origin master` successfully
    - Working tree no longer shows the two notification files as modified
  </done>
</task>

</tasks>

<verification>
- `grep -rn "max-h-\[480px\]" apps/web/src` returns zero matches
- `grep -rn "max-h-\[calc(100dvh-140px)\]" apps/web/src` returns exactly 2 matches
- `npx tsc --noEmit -p apps/web/tsconfig.json` passes
- `git log -1` shows the TKT-0032 commit pushed to master
</verification>

<success_criteria>
- Both driver and owner notification panels use `max-h-[calc(100dvh-140px)]` (no hardcoded pixels)
- TypeScript compiles cleanly
- Single fix commit pushed to `origin master` referencing TKT-0032
- No unrelated files touched; no logic, state, or width/positioning changed
</success_criteria>

<output>
After completion, the fix is shipped via the commit itself. No SUMMARY.md required for quick tasks.
</output>
