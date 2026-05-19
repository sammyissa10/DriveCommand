---
phase: 380-tkt-0032-diagnosis-notification-popup-cu
plan: 380
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md
autonomous: true

must_haves:
  truths:
    - "The /my-load page file path in apps/web is identified"
    - "All notification popup candidates (Toaster, banner, dropdown, dialog) are enumerated with file:line references"
    - "CSS positioning (position, top/right/bottom/left, max-width, safe-area handling) is captured for each candidate"
    - "Mobile layout obstructions (sticky bottom nav, sticky header) are documented with measured heights"
    - "A ranked hypothesis table identifies the most plausible cause of the cutoff"
    - "Recent git history on candidate files is surfaced to narrow recent regressions"
    - "DIAGNOSIS.md is written; no code or DB changes are made"
  artifacts:
    - path: ".planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md"
      provides: "Full read-only diagnosis report for TKT-0032"
      contains: "Hypothesis table, candidate components, CSS analysis, reproduction recommendation"
  key_links:
    - from: "380-DIAGNOSIS.md"
      to: "apps/web /my-load page + notification components"
      via: "file:line citations"
      pattern: "apps/web/.*\\.tsx?:\\d+"
---

<objective>
Diagnose TKT-0032 — Notification popup gets cut off on /my-load when viewed in MOBILE WEB (apps/web rendered in a mobile browser), NOT the React Native app.

Purpose: Produce a read-only diagnosis report that a follow-up fix ticket can act on. No code or DB changes.
Output: `.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md`
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Ticket details (inline — no separate CONTEXT.md for quick task)
TKT-0032 filed Apr 19, 2026 by hazemojel02@gmail.com.
Report: "Notification popup gets cut off" on /my-load.
Platform tag: "Mobile" — USER CONFIRMED this means MOBILE WEB (apps/web in a phone browser), NOT React Native.

Scope is `apps/web` ONLY. Ignore `apps/mobile`.

# Hard constraints
- READ-ONLY. DO NOT modify any source file.
- DO NOT modify the database.
- DO NOT run migrations.
- DO NOT install packages.
- Output is a single Markdown report.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Locate /my-load page and enumerate notification popup candidates</name>
  <files>.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md (write-only, partial)</files>
  <action>
    Read-only investigation. Do not edit any source code.

    Step 1 — Locate the /my-load page in apps/web:
    - Run: Grep for `my-load` under `apps/web/src/app` (glob: `**/*.tsx`, `**/*.ts`).
    - Also check route folders: `apps/web/src/app/my-load/`, `apps/web/src/app/(driver)/my-load/`, `apps/web/src/app/driver/my-load/`.
    - Output the exact file path of the page.tsx that renders /my-load and any layout.tsx that wraps it.

    Step 2 — Enumerate notification popup candidates. For each, capture `file:line`:
    a) Global Toaster (shadcn/sonner) — Grep for `Toaster`, `sonner`, `<Toaster` in `apps/web/src/app/layout.tsx` and any nested layouts. Note the `position` prop, `richColors`, `closeButton`, and any `toastOptions`/`offset` props.
    b) Custom in-app notification banner — Grep (case-insensitive) for `NotificationBanner`, `NotificationPopup`, `NotificationToast`, `NotificationPanel`, `NotificationCenter`.
    c) Bell-icon dropdown — Grep for `Bell`, `bell-icon`, `BellIcon` usage in headers; find the popover/dropdown component it triggers.
    d) shadcn Sheet/Dialog used for notifications — Grep for `Sheet`, `Dialog` near the notification components found above.
    e) Toast triggers on /my-load — Grep for `toast(`, `toast.success`, `toast.error`, `useToast` within the /my-load page and its child components.

    Step 3 — Begin writing the report at `.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md` with sections:
      - "## 1. /my-load page location"
      - "## 2. Notification popup candidates" (table: Candidate | File:Line | Type | Notes)

    Do not modify any source files. Output only the diagnosis markdown.
  </action>
  <verify>
    - `380-DIAGNOSIS.md` exists and contains sections 1 and 2.
    - Section 1 lists the exact `apps/web/...` path of the /my-load page.
    - Section 2 has at least 2 enumerated candidates with `file:line` citations (or explicitly states "not found" for categories that have no match).
    - `git status` shows ONLY `.planning/quick/380-tkt-0032-.../380-DIAGNOSIS.md` as new/changed (no source code touched).
  </verify>
  <done>
    /my-load page path identified and notification popup candidates enumerated with citations in DIAGNOSIS.md sections 1–2.
  </done>
</task>

<task type="auto">
  <name>Task 2: Analyze CSS positioning, mobile layout obstructions, and global Toaster config</name>
  <files>.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md (append)</files>
  <action>
    Continuing the read-only investigation. Do not edit any source code.

    For EACH candidate identified in Task 1, capture:
    a) `position` value (fixed/absolute/sticky) — from Tailwind classes (`fixed`, `absolute`, `sticky`) or inline style.
    b) `top` / `right` / `bottom` / `left` values — list all hardcoded pixel values vs responsive (e.g., `top-4`, `bottom-[80px]`, `right-4 md:right-8`). Flag any hardcoded px that look mobile-hostile.
    c) `max-width` / `width` — note whether it's viewport-relative (`max-w-[90vw]`, `max-w-sm`) or fixed (e.g., `w-96`, `w-[400px]`). Flag any width that exceeds ~360px on mobile.
    d) Safe-area-inset handling — Grep candidate files (and their parent layouts) for `safe-area-inset`, `env(safe-area`, `pb-safe`, `pt-safe`, `safeAreaInsets`. Note presence/absence.
    e) `overflow` on ancestor wrappers — Inspect the /my-load layout chain. Grep ancestors for `overflow-hidden`, `overflow-clip`. Flag any that wrap the toast/popup mount point.

    Driver/my-load mobile layout obstructions:
    a) Sticky bottom nav — Grep for `BottomNav`, `MobileBottomNav`, `MobileNav`, `fixed bottom-0` in the /my-load layout chain. If found, capture the height (`h-14`, `h-16`, `h-[64px]`, etc.) and `pb-` or `mb-` offsets applied to page content.
    b) Sticky header — Grep for `sticky top-0`, `fixed top-0` in the /my-load layout chain. Capture height. Could it obscure a top-positioned toast?

    Global Toaster config (apps/web/src/app/layout.tsx and any nested layouts):
    a) `position` prop value (default is `bottom-right`).
    b) Any mobile-specific overrides (media-query CSS, conditional position based on `useMediaQuery`/`useIsMobile`).
    c) Any `offset` prop or custom `toastOptions.style`.

    Append to `380-DIAGNOSIS.md`:
      - "## 3. CSS positioning analysis per candidate" (table or per-candidate subsections)
      - "## 4. /my-load mobile layout obstructions" (bottom nav height, header height, ancestor overflow)
      - "## 5. Global Toaster (sonner) configuration"

    Do not modify any source files.
  </action>
  <verify>
    - Sections 3, 4, 5 exist in `380-DIAGNOSIS.md`.
    - Section 3 has positioning details for each candidate from Task 1 (or "n/a" with reason).
    - Section 4 reports sticky bottom nav height OR explicit "no sticky bottom nav found".
    - Section 5 reports the Toaster `position` prop value (or explicit "default — not specified").
    - `git status` still shows only the DIAGNOSIS.md file changed.
  </verify>
  <done>
    CSS positioning, mobile obstructions, and Toaster config documented with file:line evidence in DIAGNOSIS.md sections 3–5.
  </done>
</task>

<task type="auto">
  <name>Task 3: Build hypothesis table, gather recent git history, finalize report</name>
  <files>.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md (append, finalize)</files>
  <action>
    Continuing the read-only investigation. Do not edit any source code.

    Step 1 — Build a hypothesis table ranked by plausibility based on Tasks 1–2 findings. Use these baseline rows and adjust/add rows as evidence dictates:

    | Hypothesis | Plausibility (high/med/low) | Evidence |
    |---|---|---|
    | Toast positioned bottom-right with hardcoded offset, hidden behind sticky bottom nav on /my-load | ... | reference file:line |
    | Toast positioned top with hardcoded offset, hidden under iOS notch / mobile address bar (no safe-area-inset) | ... | reference file:line |
    | Toast max-width exceeds 375px viewport, causing horizontal cutoff | ... | reference file:line |
    | Ancestor `overflow:hidden` on /my-load layout clips the toast | ... | reference file:line |
    | Notification dropdown (bell icon popover) anchored to icon overflows right edge of mobile viewport | ... | reference file:line |
    | Sonner Toaster default `bottom-right` collides with mobile bottom nav (no `offset` configured) | ... | reference file:line |

    Adjust plausibility (high/med/low) based on actual findings. Add any newly-discovered hypotheses. Each row MUST cite specific evidence (file:line or "no evidence found").

    Step 2 — Recent git history. For each candidate file from Task 1, run:
      `git log --oneline -10 -- <file_path>`
    Collect the 3 most recent commits per file. Note any commit in the last ~30 days that touched positioning, layout, or styling — flag as potential regression source.

    Step 3 — Append to `380-DIAGNOSIS.md`:
      - "## 6. Hypothesis table" (ranked, with evidence)
      - "## 7. Recent git history on candidate files" (3 most recent commits per file)
      - "## 8. Recommended next steps" (which hypothesis to test first, suggested reproduction setup)
      - "## 9. Reproduction recommendation"

    Step 4 — At the END of the diagnosis report file, on its own line, write exactly:
      `Diagnosis complete. Recommend reproducing in mobile viewport (Chrome DevTools 375x667 iPhone SE).`

    Step 5 — Final printed output (the LAST line of your assistant message for this task) must be exactly:
      `Diagnosis complete. Recommend reproducing in mobile viewport (Chrome DevTools 375x667 iPhone SE).`

    Do not modify any source files. Do not modify the database. Do not run migrations.
  </action>
  <verify>
    - Sections 6, 7, 8, 9 exist in `380-DIAGNOSIS.md`.
    - Section 6 hypothesis table has plausibility ratings AND evidence column populated for each row.
    - Section 7 shows recent git commits per candidate file (or "no history" if untracked).
    - The DIAGNOSIS.md file ends with the literal line: `Diagnosis complete. Recommend reproducing in mobile viewport (Chrome DevTools 375x667 iPhone SE).`
    - `git status` shows ONLY `.planning/quick/380-tkt-0032-.../380-DIAGNOSIS.md` (and possibly STATE.md if updated). NO `apps/web` source files modified.
    - Run: `git diff --name-only apps/web/` returns empty.
  </verify>
  <done>
    Full diagnosis report committed to disk with hypothesis ranking, evidence citations, recent commit history, and reproduction recommendation. Zero source-code changes.
  </done>
</task>

</tasks>

<verification>
- `.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md` exists with sections 1–9.
- Final line of report is: `Diagnosis complete. Recommend reproducing in mobile viewport (Chrome DevTools 375x667 iPhone SE).`
- `git diff --name-only apps/web/` is empty (no source code touched).
- `git diff --name-only prisma/ apps/web/prisma/` is empty (no schema/migration changes).
- Hypothesis table has at least 5 rows, each with plausibility rating + evidence citation.
- Every candidate notification component is referenced with `file:line` in the report.
</verification>

<success_criteria>
- DIAGNOSIS.md is the ONLY new/modified file in the repo (aside from optional STATE.md update by the executor wrapper).
- A developer reading DIAGNOSIS.md can immediately identify the most plausible root cause and the file:line(s) to inspect first.
- No code, schema, or migration changes were made.
</success_criteria>

<output>
After completion, the diagnosis report at `.planning/quick/380-tkt-0032-diagnosis-notification-popup-cu/380-DIAGNOSIS.md` IS the deliverable. No SUMMARY.md required for this quick diagnosis task.
</output>
