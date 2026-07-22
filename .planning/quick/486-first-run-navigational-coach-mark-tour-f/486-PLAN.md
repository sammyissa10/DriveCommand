# Quick Task 486 — First-run navigational coach-mark tour (owner/dispatcher, mobile)

## Goal
A skippable, ~5-step spotlight tour shown exactly once to new owner/dispatcher users, teaching the mobile nav chrome. Persist a per-user `onboardingTourSeen` flag. Add "Replay walkthrough" under Help. Owner/manager (dispatcher) portal only — never driver or sysadmin. Must work at 390px (mobile Safari). No heavy dependency (hand-rolled overlay).

## Key architecture findings (from exploration — do not re-derive)
- The nav chrome (+ create menu, bottom tabs, Help "?") lives ONLY inside `OwnerShell` (`components/navigation/owner-shell.tsx`), rendered on `/carrier/*` etc. The `(owner)` route group is OWNER/MANAGER only (`(owner)/layout.tsx` redirects others) → mounting the tour in `OwnerShell` automatically scopes it to owner/dispatcher and excludes driver/sysadmin.
- The "Get started" activation checklist (`ActivationChecklist`) renders ONLY on the standalone `/onboarding/welcome` page (no chrome). The in-shell analog is `OnboardingReminderRibbon` (mobile instance mounted at `owner-shell.tsx:134`), which links to the checklist and shows while onboarding is incomplete. → the tour's "checklist" step targets that ribbon; when absent (activated tenants / replay), the step is auto-skipped.
- `OwnerShell` renders TWO CSS-toggled branches: desktop `hidden lg:flex`, mobile `lg:hidden`. The tour targets the MOBILE branch elements. Tag ONLY the mobile-branch instances (avoid duplicate `data-tour` across branches). Bottom nav (`owner-bottom-nav.tsx`) is a single `lg:hidden` `<nav>`.
- New tenant signup redirects to `/onboarding/welcome`; the user first enters `OwnerShell` when they click a checklist link into `/carrier/*/new` (or on next login → `/carrier/dashboard`). Auto-start fires on that first shell load.
- Per-user mutation convention: server action in `app/(owner)/actions/*.ts` using `requireAuth()` (returns `session.userId` = `User.id` UUID) + `getTenantPrisma()`. Mirror `activation-congrats.ts`.
- `User` model (`prisma/schema.prisma:237`): plain camelCase boolean flags, no `@map` (e.g. `isSample Boolean @default(false)`). Add `onboardingTourSeen Boolean @default(false)`. A SECOND generated schema copy at `src/generated/prisma/schema.prisma` must be regenerated via `npx prisma generate` (do NOT `prisma migrate dev`).
- Migration pattern: raw SQL folder `prisma/migrations/<ts>_<name>/migration.sql`, idempotent `ADD COLUMN IF NOT EXISTS`. Latest existing ts = `20260717*`. A migration.sql WRITE triggers an auto-deploy hook (`prisma migrate deploy`); verify the column landed via Supabase MCP and apply manually if the hook missed. No per-column grants needed (`User` already granted to app_user).

## Deliverables

### 1. DB flag (commit 1)
- `prisma/schema.prisma`: add `onboardingTourSeen Boolean @default(false)` to `User` right after `isSample` (line ~252).
- New migration `prisma/migrations/20260722000001_add_user_onboarding_tour_seen/migration.sql`:
  ```sql
  -- AlterTable: per-user first-run navigational tour flag
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingTourSeen" BOOLEAN NOT NULL DEFAULT FALSE;
  ```
- Run `cd apps/web && npx prisma generate` to sync `src/generated/prisma` (so `user.update({data:{onboardingTourSeen}})` typechecks).
- After writing migration, verify the column exists on the remote DB (Supabase MCP `execute_sql`: `SELECT column_name FROM information_schema.columns WHERE table_name='User' AND column_name='onboardingTourSeen'`); if missing, apply via MCP `apply_migration`.

### 2. Server actions (commit 2)
- New `app/(owner)/actions/onboarding-tour.ts` (`'use server'`):
  - `markTourSeen()` → `requireAuth()` + `getTenantPrisma().user.update({ where:{id:userId}, data:{ onboardingTourSeen:true } })`; try/catch → `{ ok }`. Mirror `activation-congrats.ts` (never throws).
  (No separate reset action — "Replay walkthrough" re-runs the tour client-side from step 1; the flag governs only the automatic first-run. Document this interpretation.)

### 3. Tour components (commit 2, same as actions)
- `components/onboarding/tour/steps.ts` — `TourStep { target: string|null; title; body }` + `TOUR_STEPS` (5): intro (target null) → `create` → `tabs` → `checklist` → `help`. Copy short/mobile-friendly.
- `components/onboarding/tour/OnboardingTour.tsx` (`'use client'`):
  - `TourContext` + `useOnboardingTour()` hook exposing `start()`.
  - `OnboardingTourProvider({ tourSeen, children })`:
    - `resolveTarget(name)` = first `[data-tour="name"]` with non-zero rect (handles the hidden desktop duplicates / missing ribbon).
    - `begin()` builds visible steps = `TOUR_STEPS.filter(s => s.target===null || resolveTarget(s.target))`, sets step 0, active true. `start` (context) = `begin`.
    - Auto-start once: `useEffect` — if `!tourSeen` and `matchMedia('(max-width:1023px)').matches`, `setTimeout(begin, 600)` (let chrome lay out); guard with a ref so it fires once.
    - `finish()` → active false + `void markTourSeen()`.
    - Render children, then (portal to `document.body`, only when mounted+active) `<TourOverlay step total index onNext onPrev onSkip />`.
  - `TourOverlay`: measures target rect (`useLayoutEffect` + `requestAnimationFrame` + `resize`/`scroll` listeners). Renders:
    - full-screen `z-[2000]` container, `role="dialog" aria-modal aria-label="Product tour"`.
    - a transparent full-screen tap-catcher `<button>` → `onNext` (tap-through advance).
    - spotlight: `pointer-events-none absolute` box at rect±6px pad, `rounded-xl ring-2 ring-white/90`, `boxShadow:'0 0 0 9999px rgba(2,6,23,0.72)'`; when no target (intro) a plain full dim layer.
    - card: `absolute left-4 right-4 mx-auto max-w-md rounded-2xl bg-card p-5 shadow-2xl` positioned above target if `rect.top > innerHeight/2` (`bottom: vh-rect.top+12`) else below (`top: rect.bottom+12`); intro centered. Card has step counter "{i+1} of {n}", Skip (top-right), title, body, Back (disabled on 0), Next/Done. `stopPropagation` on card so its taps don't advance.
  - z-index: chrome header is `z-[1001]`, bottom nav `z-50`; overlay `z-[2000]` sits above both. Never traps: Skip always visible + backdrop tap advances.

### 4. Wire into shell + tag targets (commit 3)
- `(owner)/layout.tsx`: after the activation query, read the flag:
  ```ts
  let tourSeen = true; // fail-safe: on error, do NOT nag
  try {
    const rows = await prisma.$queryRaw<{ onboardingTourSeen: boolean }[]>`
      SELECT "onboardingTourSeen" FROM "User" WHERE id = ${session.userId}::uuid LIMIT 1`;
    tourSeen = rows[0]?.onboardingTourSeen ?? false;
  } catch { tourSeen = true; }
  ```
  Pass `tourSeen={tourSeen}` to `<OwnerShell>`.
- `owner-shell.tsx`: add `tourSeen?: boolean` to props; import `OnboardingTourProvider`; wrap the returned tree (inside `CommandPaletteProvider`, around both branches) with `<OnboardingTourProvider tourSeen={tourSeen ?? true}>`. Tag mobile-branch targets:
  - wrap mobile `<QuickActionsMenu variant="mobile" />` (line 126) → `<span data-tour="create" className="flex items-center">…</span>`
  - wrap mobile `<TopBarHelpButton />` (line 127) → `<span data-tour="help" className="flex items-center">…</span>`
  - wrap mobile `<OnboardingReminderRibbon … />` (line 134) → `<div data-tour="checklist">…</div>`
- `owner-bottom-nav.tsx`: add `data-tour="tabs"` to the `<nav>` (line ~66).

### 5. Replay under Help (commit 4)
- `components/onboarding/tour/ReplayTourButton.tsx` (`'use client'`): `useOnboardingTour().start()` on click; labeled "Replay walkthrough" with a `PlayCircle` icon; styled as a small secondary button/row consistent with Help page.
- `(owner)/help/page.tsx`: render `<ReplayTourButton />` (e.g. just under `<HelpHeader />`). The help page is inside `OwnerShell` → provider context is available.

## Verification
- `cd apps/web && npx prisma generate` then `npx tsc --noEmit` → 0 new errors (baseline ~35; total was 0 after 485). Report touched-file check.
- Confirm the new column exists on remote DB (Supabase MCP) — the flag read must not throw in prod.
- **390px render check:** run the app / a Playwright screenshot at viewport 390×844 of an owner page with the tour active, and visually confirm: spotlight sits on the target, card is within the 390px width (no horizontal overflow), Skip + Next reachable, tabs step card sits above the bottom nav. If a live authenticated 390px screenshot is not feasible in this environment, build a minimal standalone HTML harness that reproduces the overlay markup + the four target rects at 390px and screenshot THAT, and clearly report what was executed vs. recommended manual check. Do not claim a render that wasn't performed.
- Do NOT deploy (`vercel`) or push.

## Commit plan
1. `feat(quick-486): add User.onboardingTourSeen flag + migration`
2. `feat(quick-486): coach-mark tour overlay + steps + markTourSeen action`
3. `feat(quick-486): mount tour in OwnerShell + tag mobile nav targets + read flag`
4. `feat(quick-486): Replay walkthrough entry on Help page`

## Scope guards
- Owner/manager only (never `(driver)`/sysadmin) — guaranteed by mounting in `OwnerShell`.
- No new npm dependency.
- Do not alter the checklist page, signup redirect, or any nav behavior beyond adding `data-tour` attributes + wrappers.
- Non-blocking: Skip always present; backdrop tap advances; underlying nav is not permanently trapped (tour dismisses on skip/done).
