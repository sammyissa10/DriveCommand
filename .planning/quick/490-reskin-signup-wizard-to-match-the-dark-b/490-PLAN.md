# Quick Task 490 — Reskin signup to match the dark Sign in screen

## Direction (confirmed with user)
Match the Sign in screen (SignInCard) — dark, branded auth aesthetic — not the ds mobile kit. Keep the 2-step wizard + all fields + server action.

## Plan
1. New `components/auth/sign-up-card.tsx`: two-panel shell mirroring SignInCard (reuse FreightMap + RotatingTips), brand block + heading + `<SignUpForm>`; framer-motion, reduced-motion guarded.
2. Restyle `sign-up-form.tsx` dark: tone="dark" inputs, uppercase n-300 labels, b-500 progress, gradient buttons, dark ghost Back, dark select, brand-critical errors, b-300 links. Logic unchanged.
3. `password-input.tsx`: tone-aware eye color; forward tone to Input.
4. `sign-up/[[...sign-up]]/page.tsx`: render `<SignUpCard>`.

## Verify
- tsc 0 errors.
- Screenshots at 390px (single dark column) + 1280px (two-panel w/ map + tips) match Sign in.

## Commit
`feat(quick-490): reskin signup to match the dark, branded Sign in screen`

## Notes
- Design source of truth: sign-in-card.tsx tokens (#0E172A/#0E1424, n-*, b-*, brand-critical, text-h1/body/label/small).
- Pre-existing FreightMap hydration warning (float rounding) is shared with Sign in — out of scope.
- Use absolute paths for file tools (shell cwd drifts to apps/web).
