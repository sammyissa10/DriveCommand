---
phase: quick-433
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
read_only: true

must_haves:
  truths:
    - "Report states definitively: (a) congrats UI exists but mis-triggers, or (b) never built"
    - "Report identifies whether any positive 'you're done' signal exists beyond the banner unmounting"
    - "Report names the existing toast/modal/notification infra a fix should reuse"
    - "Report recommends a one-time-trigger approach (e.g. congratsShownAt flag) without implementing it"
  artifacts: []
  key_links: []
---

<objective>
Diagnose why a tenant who completes all four onboarding steps gets NO completion
acknowledgment (no congrats modal, toast, confetti, or message) — the "Finish Setup"
banner simply vanishes when ActivationProgress.isActivated flips true.

Purpose: Determine whether a congrats moment was built-but-mis-triggered (a) or never
built (b), gather evidence, and recommend a reuse-existing-infra fix with a one-time
trigger guard. STOP before implementing.

Output: A short diagnostic report returned as the executor's final message (no .md file,
no code/DB changes).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
READ-ONLY diagnosis. Use Grep, Glob, and Read ONLY. Do NOT edit any file, run migrations,
or touch the database.

Key files already located (confirm/expand during investigation):
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/lib/onboarding/activation-tracker.ts
@apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx
@apps/web/src/app/onboarding/welcome/page.tsx
@apps/web/src/app/onboarding/welcome/checklist.tsx
@apps/web/src/app/onboarding/page.tsx

Known facts from prior investigation (verify, do not assume):
- recordActivationEvent (activation-tracker.ts) is where isActivated flips true and a
  one-time `tenant.activated` AppEvent fires, guarded by `!current.isActivated`.
- owner-shell.tsx renders OnboardingReminderRibbon gated on `onboardingComplete` prop —
  the ONLY UI effect found so far is the banner unmounting when complete.
- The final activation step is `first_load_in_transit` (load → IN_TRANSIT path).
- ActivationProgress schema lives in apps/web/prisma/schema.prisma.
- The app uses `sonner` for toasts (see DispatchLoadModal, CancelLoadModal, etc.) and a
  TripSuccessBanner pattern exists for post-action acknowledgments.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hunt for any existing activation-completion UI</name>
  <files>(read-only — no files modified)</files>
  <action>
    Search the codebase for any UI that celebrates or acknowledges onboarding/activation
    completion. Look for:
    - Components or JSX keyed on `isActivated === true`, `completionPct === 100`,
      `onboardingComplete`, or a "just completed" transition (e.g. prev !== current).
    - Congrats/celebration patterns: grep for "congrat", "confetti", "you're all set",
      "all set", "setup complete", "welcome aboard", "activated", "Setup complete".
    - The onboarding welcome page + checklist.tsx: read fully. Determine what renders when
      all four steps are done — does it show a completion state, a CTA, or just hide items?
    - OnboardingReminderRibbon.tsx: confirm it ONLY unmounts on completion vs. showing a
      positive done-state.
    - Any modal/dialog whose open state depends on activation crossing 100%.

    Classify the finding as either:
    (a) A congrats UI EXISTS but is mis-triggered, or
    (b) No congrats UI was ever built — the only completion effect is the banner unmounting.
  </action>
  <verify>Grep results + file reads conclusively support an (a) or (b) classification.</verify>
  <done>Executor can state (a) or (b) with cited file paths and line evidence.</done>
</task>

<task type="auto">
  <name>Task 2: Trace the activation-complete signal path and one-time-fire mechanics</name>
  <files>(read-only — no files modified)</files>
  <action>
    Establish exactly how completion currently surfaces (or fails to surface) to the UI:
    - Read activation-tracker.ts recordActivationEvent: confirm where isActivated flips,
      where the one-time `tenant.activated` AppEvent fires, and the guard that ensures
      once-only (`!current.isActivated`). Note this runs server-side inside the
      load→IN_TRANSIT write, NOT in a user-facing render path.
    - Trace the load → IN_TRANSIT caller (apps/web/src/lib/carrier/trips.ts and/or the
      trip/dispatch action that moves a load to IN_TRANSIT) to see what, if anything, is
      returned to the client after the final step — is there any client-side hook,
      redirect, or response field that could trigger a congrats moment? Where does the
      user land after the final step?
    - Confirm whether ActivationProgress (prisma/schema.prisma) has any
      "acknowledged/seen" style field (e.g. congratsShownAt, activatedAcknowledgedAt).
      Report present/absent — this determines whether a once-only guard already exists.
    - Confirm there is NO positive "you're done" signal anywhere beyond the banner
      unmounting (or report the signal if one exists).
  </action>
  <verify>The signal path from final step → UI is documented end to end, including the absence/presence of a one-time acknowledgment flag.</verify>
  <done>Executor knows where the congrats trigger would have to hook in and whether a once-only flag exists.</done>
</task>

<task type="auto">
  <name>Task 3: Inventory reusable notification infra + write the report</name>
  <files>(read-only — no files modified)</files>
  <action>
    Catalog the existing UI infra a fix should reuse (so a fix does not invent new patterns):
    - Toast system: confirm `sonner` usage and where Toaster is mounted (grep "Toaster",
      "sonner", "import { toast }"). Note the standard call pattern.
    - Modal/dialog pattern: identify the shared dialog/modal component used app-wide
      (e.g. DispatchLoadModal, CancelLoadModal, TripAddStopModal patterns).
    - Success-banner pattern: read TripSuccessBanner.tsx as a candidate reuse template.
    - In-app notification system (NotificationBell / notifications routes) — note if a
      congrats could surface there as fallback.

    Then return a SHORT report (final message, NOT a file) with:
    1. Verdict: (a) mis-triggered or (b) never built — with evidence/file:line cites.
    2. Whether any positive "you're done" signal exists today.
    3. Why no congrats shows (gated condition / wrong page / missing trigger at final step).
    4. Existing infra to reuse: toast (sonner), modal pattern, success-banner pattern,
       notification bell.
    5. Recommended one-time-trigger approach: e.g. add a `congratsShownAt` (or
       `activatedAcknowledgedAt`) field on ActivationProgress so the congrats fires exactly
       once; describe where the client check would live (likely owner-shell or a layout
       effect comparing isActivated true + congratsShownAt null). Do NOT implement.
  </action>
  <verify>Report covers verdict, evidence, infra inventory, and a concrete once-only recommendation.</verify>
  <done>A short, decision-ready diagnostic report is returned; no files or DB were changed.</done>
</task>

</tasks>

<verification>
- No files were modified, no migrations run, no DB writes (pure read-only diagnosis).
- Report definitively classifies (a) vs (b) with cited evidence.
- Report names the specific reusable infra and a one-time-trigger recommendation.
</verification>

<success_criteria>
- Executor returns a short report stating (a) congrats UI exists but mis-triggers, or
  (b) it was never built, backed by file/line evidence.
- Report identifies whether any positive completion signal exists beyond the banner
  unmounting.
- Report inventories existing toast (sonner) / modal / success-banner / notification infra.
- Report recommends a one-time-fire approach (e.g. congratsShownAt flag) and stops before
  implementing.
</success_criteria>

<output>
Return findings directly as the final assistant message. Do NOT create a SUMMARY/report .md
file and do NOT make any code or DB changes.
</output>
