# Quick Task 486 — Summary

**Goal:** A skippable, ~5-step first-run coach-mark tour for new owner/dispatcher users on mobile, persisted per-user (shown once), with a "Replay walkthrough" entry under Help. Owner/dispatcher portal only. Must work at 390px. No heavy dependency.

## Approach
Hand-rolled spotlight overlay (no library) mounted inside `OwnerShell`. Because the `(owner)` route group is OWNER/MANAGER-only, mounting there automatically scopes the tour to owner/dispatcher and excludes the driver and sysadmin portals.

Architectural note: the "+ menu / bottom tabs / Help ?" chrome lives only in `OwnerShell`, while the "Get started" activation checklist renders only on the standalone `/onboarding/welcome` page. So the tour runs in the shell and its "checklist" step targets the in-shell `OnboardingReminderRibbon` (the persistent nudge to the checklist); when that ribbon is absent (activated tenant / desktop), the step is skipped automatically.

## Changes (6 commits)
1. `5bc6f7d5` — **DB flag.** `User.onboardingTourSeen Boolean @default(false)` in `schema.prisma`; raw-SQL migration `20260722000001_add_user_onboarding_tour_seen` (idempotent `ADD COLUMN IF NOT EXISTS`); `prisma generate` synced the second generated schema copy. Column applied + verified on the remote Supabase DB (the auto-deploy hook didn't fire in this environment, so applied via Supabase MCP `apply_migration`).
2. `2f3a93cf` — **Tour engine.** `components/onboarding/tour/steps.ts` (5 steps: intro → create → tabs → checklist → help) + `OnboardingTour.tsx` (context/provider/overlay) + `app/(owner)/actions/onboarding-tour.ts` `markTourSeen()` (mirrors `markCongratsShown`: own row via `requireAuth()` + `getTenantPrisma()`, never throws).
3. `cededfa6` — **Wire-in.** `(owner)/layout.tsx` reads the flag (fail-safe `true` on error) and passes `tourSeen` to `OwnerShell`, which wraps its tree in `OnboardingTourProvider` and tags the mobile-branch chrome: `data-tour="create"` (+ menu), `"help"` (?), `"checklist"` (ribbon), `"tabs"` (bottom nav on `owner-bottom-nav.tsx`).
4. `39af878c` — **Replay.** `ReplayTourButton` ("Replay walkthrough", `PlayCircle`) added to the Help Center page (`/help`, the "?" affordance); calls the provider's `start()`.
5. `bbd890f1` — **Robustness.** `sessionStorage` guard so auto-start can't re-fire after a skip/finish before the persisted flag round-trips.

## Behavior
- **Auto-start:** once, mobile only (`matchMedia(max-width:1023px)`), 600ms after mount so chrome is laid out; guarded by a ref + `sessionStorage` + the persisted `onboardingTourSeen` flag.
- **Overlay:** dim + white spotlight ring around the target (`box-shadow: 0 0 0 9999px`), coach-mark card with step counter, Back/Next/Done, and an always-present Skip. Backdrop tap advances (tap-through). z-`[2000]` over the header (`z-[1001]`) and bottom nav (`z-50`). Portal to `document.body`.
- **Never blocks:** Skip always visible; tap-through advances; tour dismisses on skip/done. Missing targets are filtered out at start.
- **Replay:** "Replay walkthrough" restarts from step 1 on demand (client-side); the persisted flag governs only the automatic first-run (documented interpretation of "resets and replays").

## Verification
- `npx prisma generate` + `npx tsc --noEmit` → **0 errors** (none in touched files).
- Remote DB column confirmed present (`information_schema.columns`).
- **390px render — actually executed:** a Playwright run (chromium, viewport 390×844) against a faithful static harness that ports the overlay's exact positioning math (`SPOTLIGHT_PAD=6`, `CARD_GAP=12`, `placeAbove = rect.top > vh/2`, `left-4 right-4 mx-auto max-w-md`) with real `data-tour` chrome elements. Results for all 5 steps: card spans x:16–374 (inside 390, **no horizontal overflow**, `docW==winW==390`); intro centered; header-target cards render just below the header; the **tabs card correctly sits above the bottom nav** (top 590 of 844). Screenshots visually confirmed: spotlight rings the +, the bottom tab bar (stays bright while the rest dims), the reminder ribbon, and the ? — cards legible and within the viewport. (Harness lived in the scratchpad; not committed.)
- Recommended final manual check: open `/carrier/dashboard` as a brand-new owner in mobile Safari / DevTools 390px to confirm against live chrome; and tap "Replay walkthrough" on `/help`.

## Scope / notes
- No new npm dependency.
- Owner/manager only — never driver/sysadmin (guaranteed by the mount point).
- Revoke of the tour / desktop targeting intentionally out of scope: the tour is mobile-focused per the request; on desktop, replay shows only the intro (mobile-only targets absent).
- Not deployed, not pushed.
