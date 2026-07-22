# Quick Task 490 — Summary

Reskinned the "Start your free trial" signup wizard to match the dark, branded **Sign in** screen (it had been a light shadcn card sitting on the dark auth background — mismatching the mobile design system and its sibling auth page).

## Direction
User chose "Match the Sign in screen" (over the ds mobile kit). Source of truth: `components/auth/sign-in-card.tsx` (dark `#0E172A`/`#0E1424`, DriveCommand mark + "Miles Ahead.", `tone="dark"` inputs, uppercase `n-300` labels, gradient `b-500→b-600` button, `b-300` links, `brand-critical` errors, freight map + rotating tips on desktop).

## Changes (1 commit `7473bdb0`)
- **New `components/auth/sign-up-card.tsx`** — two-panel shell mirroring `SignInCard`, reusing the existing `FreightMap` + `RotatingTips` (desktop left panel), the DriveCommand brand block, the mobile branding block (shown when the left panel is hidden), the "Start your free trial" heading + subtitle, and `<SignUpForm>` on the right. framer-motion entrance, `useReducedMotion`-guarded.
- **`sign-up-form.tsx`** restyled dark (logic untouched): `tone="dark"` on every input, uppercase `n-300` labels (plain `<label>`, dropped shadcn `Label`), `b-500` progress bar on a `#1C2536` track, gradient primary buttons (Continue with arrow, Create free account), dark ghost Back, dark `#070B14` select, `brand-critical` error blocks (dropped shadcn `Alert`), `b-300` sign-in link.
- **`components/ui/password-input.tsx`** — now tone-aware: forwards `tone` to `Input` and picks the eye-toggle contrast (`n-400/n-200` on dark, `muted-foreground` default). Light default preserved for reuse.
- **`sign-up/[[...sign-up]]/page.tsx`** — renders `<SignUpCard searchParams={…}>` (removed the light card wrapper).

## Unchanged
Wizard logic (2 steps, progress, per-step validation, value preservation), all fields, and `signUpAction` / provisioning — this was styling only.

## Verification
- `tsc --noEmit` → **0 errors**.
- Playwright screenshots against the live dev server:
  - **390px** — single dark column: brand block, "Start your free trial", blue progress bar, uppercase labels, dark inputs, eye toggle, gradient "Continue → " button, blue "Sign in" link. Step 2 shows the dark select + "Create free account" + ghost "Back". Matches mobile Sign in.
  - **1280px** — two-panel: left = DriveCommand brand + animated freight map (CHI/DAL routes) + rotating TIP card; right = dark wizard. Matches desktop Sign in.
- The form briefly fades in via the entrance animation (~0.8s) — an early 700ms screenshot caught it mid-animation (looked empty); confirmed present + visible at 1.5s.
- The "1 Issue" dev badge is a **pre-existing** FreightMap SVG float-rounding hydration warning (server vs client), shared with the Sign in screen — not introduced here.

## Notes / follow-up
- Not deployed, not pushed.
- Pre-existing FreightMap hydration warning could be fixed separately (round path coords deterministically) — affects both auth screens; out of scope here.
