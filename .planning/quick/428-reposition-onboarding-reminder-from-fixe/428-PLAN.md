---
phase: quick-428
plan: 428
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx
autonomous: true

must_haves:
  truths:
    - "When onboarding is incomplete, owner sees a full-width inline banner (not a floating pill) styled navy/yellow"
    - "Banner shows a rocket icon on the left, a setup message, and a 'Finish Setup' CTA on the right"
    - "Banner has NO dismiss button"
    - "When onboarding is complete, the component renders nothing (returns null)"
    - "Banner flows in document order (not position:fixed)"
  artifacts:
    - path: "apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx"
      provides: "Full-width inline onboarding reminder banner"
      contains: "Finish Setup"
  key_links:
    - from: "apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx"
      to: "/onboarding/welcome"
      via: "next/link Link href"
      pattern: "/onboarding/welcome"
---

<objective>
Reposition the onboarding reminder from a fixed top-right floating pill into a full-width, in-flow banner styled in the DriveCommand navy/yellow brand palette, structurally matching the existing sample-records notice (icon left, text, CTA right). CTA text is "Finish Setup". No dismiss button.

Purpose: A floating pill is easy to miss and overlaps content. A full-width banner below the top bar is a stronger, clearer call to finish setup.
Output: Restyled `OnboardingReminderRibbon.tsx`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx
@apps/web/src/components/onboarding/sample-data-banner.tsx
@apps/web/src/app/(owner)/layout.tsx
@apps/web/src/components/navigation/owner-shell.tsx
</context>

<research_findings>
Pre-planning research established the structural pattern and the mount-point reality:

**Sample-records notice pattern** (`sample-data-banner.tsx`) — the structural model to mirror:
```
<div className="flex items-center gap-3 rounded-lg border ... px-4 py-3 text-sm ...">
  <Info className="h-4 w-4 shrink-0" />
  <span className="flex-1">...message...</span>
  <button>...dismiss (we OMIT this)...</button>
</div>
```
Key structure: flex row, `gap-3`, icon `shrink-0`, message `flex-1`, action on the right. Full-width is achieved because the element is a block `<div>` with no width constraint — it fills its container. The sample banner uses amber/yellow; our banner uses navy/yellow brand colors (distinct but same skeleton).

**Current ribbon** (`OnboardingReminderRibbon.tsx`): a `position: fixed` rounded pill at `top-3 right-3 z-[1100]`. We remove all `fixed`/`z`/positioning classes and make it a full-width in-flow block.

**Mount point reality (READ THIS — informs the STOP flag below):**
- The ribbon is mounted in `(owner)/layout.tsx` as a **sibling of `<OwnerShell>`**, NOT inside it.
- `OwnerShell` (`owner-shell.tsx`) renders the dark top bar and then a scrollable `<main className="... overflow-y-auto ... bg-white rounded-2xl m-3">` that contains `{children}`.
- Breadcrumbs render **per-page, inside `{children}`** (e.g. `ChecklistDetailClient.tsx`), i.e. inside that scrollable `<main>`. There is no breadcrumb slot in the shell.
- Therefore: at its current mount point (sibling of OwnerShell, outside the flex layout), a non-fixed full-width banner will render at the very top of the document flow, **before/above the entire shell** (sidebar + top bar) on desktop — NOT below the top bar and not above breadcrumbs. The current code only "worked" visually because `position: fixed` lifted the pill out of flow.

This means: making the component in-flow is correct per the task, but achieving the desired *placement* ("below the top bar, above breadcrumbs") would require moving the mount point into `OwnerShell` (above `<main>` or inside it above children). The task constraints forbid editing `layout.tsx`/shell silently. See the STOP flag in Task 1.
</research_findings>

<tasks>

<task type="auto">
  <name>Task 1: Restyle OnboardingReminderRibbon to a full-width inline navy/yellow banner</name>
  <files>apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx</files>
  <action>
Rewrite the component body (keep the `"use client"` directive, the `OnboardingReminderRibbonProps` interface with `onboardingComplete: boolean`, the `if (onboardingComplete) return null;` guard, and the `next/link` + `lucide-react` Rocket import).

Replace the fixed pill markup with a full-width, in-flow banner that mirrors the sample-records notice STRUCTURE (flex row, icon left `shrink-0`, message `flex-1`, CTA right) but uses the navy/yellow brand palette instead of amber:

Requirements for the new markup:
- Outer element: a block-level container that fills its parent's width (NO `fixed`, NO `top-*`/`right-*`, NO `z-*`). Use `flex w-full items-center gap-3 ... px-4 py-3`.
- Navy/yellow palette via Tailwind: navy background with yellow accent. Suggested: `bg-[#0f1e3d]` (navy) container with `text-white`, a yellow icon (`text-yellow-400` / `text-amber-400`), and a yellow CTA button. Use a `border` to match the notice pattern (e.g. `border border-yellow-400/30`). Pick from Tailwind palette where possible; only use the navy hex if no close Tailwind token fits the brand. Keep dark-mode safe (navy works on both light and dark page backgrounds).
- Rocket icon on the left: `<Rocket className="h-4 w-4 shrink-0 text-yellow-400" aria-hidden="true" />`.
- Message in the middle with `flex-1`: a short prompt, e.g. "Finish setting up your DriveCommand workspace." (font-medium, white text).
- CTA on the RIGHT: render the "Finish Setup" action as a `Link` to `/onboarding/welcome`. Style it as a small yellow button/pill: e.g. `inline-flex items-center rounded-md bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-[#0f1e3d] hover:bg-yellow-300 transition-colors shrink-0`. The visible text MUST be exactly `Finish Setup` (capital S).
- NO dismiss button. NO local state. NO useEffect.
- Keep an accessible label on the CTA (e.g. `aria-label="Finish onboarding setup"`).
- You may either make the whole banner a `Link` OR keep the banner a `div` with the CTA being the `Link` — prefer the `div` + CTA `Link` approach so the structure matches the sample notice (text + separate action). Whole-banner-as-link is acceptable only if it keeps the CTA visually distinct.
- Update the component's JSDoc comment to reflect "full-width inline banner" instead of "fixed top-right ribbon" and remove the z-index note.

Use Tailwind only. No new libraries. TypeScript strict (no `any`).
  </action>
  <verify>
Run `pnpm --filter web exec tsc --noEmit` (or the repo's standard `tsc --noEmit`) from the repo root and confirm no NEW type errors in the touched file. Visually confirm in the editor that the file no longer contains `fixed`, `top-3`, `right-3`, or `z-[1100]`, and that it contains the literal string `Finish Setup` and `href="/onboarding/welcome"`.
  </verify>
  <done>
Component returns null when `onboardingComplete` is true; otherwise renders a full-width in-flow navy banner with a yellow Rocket icon left, a setup message, and a yellow "Finish Setup" CTA linking to /onboarding/welcome. No dismiss button. tsc passes with no new errors.
  </done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <decision>STOP — confirm before any layout.tsx / OwnerShell mount-point change</decision>
  <context>
Per task constraints, `layout.tsx` and `owner-shell.tsx` must NOT be edited silently.

Research finding: the ribbon is currently mounted in `(owner)/layout.tsx` as a sibling of `<OwnerShell>` (line 64), OUTSIDE the shell's flex/topbar/content structure. With `position: fixed` removed (Task 1), the now-in-flow banner will render at the very top of the document — ABOVE the entire shell (sidebar + top bar) on desktop — NOT "below the top bar, above breadcrumbs" as the visual goal describes. Breadcrumbs render per-page inside the shell's scrollable `<main>`, so there is no way to land the banner below the top bar / above breadcrumbs WITHOUT moving the mount point into `OwnerShell`.

The exact one-line move that would achieve the desired placement:
- REMOVE `<OnboardingReminderRibbon onboardingComplete={onboardingComplete} />` from `layout.tsx` (it is a sibling of `<OwnerShell>` on line 64).
- PASS `onboardingComplete` into `OwnerShell` as a prop and render `<OnboardingReminderRibbon ... />` inside `owner-shell.tsx` immediately at the top of the desktop `<main>` (line ~77, before `{children}`) and the mobile `<main>` content (line ~100/101, before `{children}`), so it sits below the top bar and above page breadcrumbs.

This is more than a one-line edit (it threads a prop through OwnerShell and adds the banner in two render branches), and it touches two files the task fenced off. Do NOT proceed without explicit confirmation.
  </context>
  <options>
    <option id="option-a">
      <name>Ship Task 1 only — leave mount point as-is</name>
      <pros>Honors the "modify ONLY the ribbon component" constraint exactly. Zero risk to shell/layout. Banner becomes full-width and in-flow as required.</pros>
      <cons>On desktop the banner will appear above the sidebar/top bar (top of document), not below the top bar above breadcrumbs. Visual placement won't match the described ideal until the mount point is moved.</cons>
    </option>
    <option id="option-b">
      <name>Approve the mount-point move into OwnerShell</name>
      <pros>Achieves the intended placement: full-width banner below the top bar, above breadcrumbs, on both desktop and mobile.</pros>
      <cons>Requires editing `layout.tsx` (remove sibling, pass prop) and `owner-shell.tsx` (accept prop, render in two main branches) — files the task said not to touch silently.</cons>
    </option>
  </options>
  <resume-signal>Select: option-a (ribbon-only, ship as-is) or option-b (approve mount-point move into OwnerShell, then I will edit layout.tsx + owner-shell.tsx)</resume-signal>
</task>

</tasks>

<verification>
- `OnboardingReminderRibbon.tsx` contains no `fixed`/`top-`/`right-`/`z-[` positioning classes.
- File contains exactly `Finish Setup` (capital S) and `href="/onboarding/welcome"`.
- No dismiss button / no `useState` / no `useEffect` in the file.
- `tsc --noEmit` shows no new errors in the touched file.
- Mount-point change (if any) only happens after explicit user confirmation at the checkpoint.
</verification>

<success_criteria>
- Incomplete onboarding renders a full-width, in-flow navy/yellow banner with Rocket icon, message, and yellow "Finish Setup" CTA.
- Complete onboarding renders nothing.
- No dismiss button.
- `layout.tsx` and `owner-shell.tsx` are untouched unless the user picks option-b at the checkpoint.
</success_criteria>

<output>
After completion, create `.planning/quick/428-reposition-onboarding-reminder-from-fixe/428-SUMMARY.md`
</output>
