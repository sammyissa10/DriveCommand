# Quick Task 487 — Signup form → 2-step wizard

## Goal
Refactor the "Start your free trial" tenant signup form into a 2-step wizard with a progress indicator. Same fields, no new required fields. Server action + tenant provisioning UNCHANGED. Mobile-Safari-first.

- Step 1 (About you): First name, Last name, Work email, Password (with show/hide toggle).
- Step 2 (Your company): Company name, Fleet size, Promo code (optional).

## Design (single file: `apps/web/src/app/(auth)/sign-up/sign-up-form.tsx`)
- **Keep one `<form action={action}>`** with `useActionState(signUpAction)`. Both step field-groups stay MOUNTED, toggled with the `hidden` class (`step === 1 ? 'space-y-4' : 'hidden'`). Because inputs are uncontrolled and never unmount, values persist across Back/Continue automatically AND the submitted FormData is byte-identical to the pre-refactor form — the server action contract is untouched.
- **Only step 2 renders a submit button.** Step 1's footer is a `type="button"` "Continue"; step 2's footer is `<SubmitButton>` ("Create free account") + a ghost "Back". So nothing POSTs until the final step. Enter on step 1 is intercepted (`onKeyDown`) to call Continue (no implicit submit exists there anyway).
- **Per-step validation:** `step1Schema = signUpSchema.pick({firstName,lastName,email,password})` — reuses the EXACT server rules. `validateStep1()` reads `new FormData(formRef.current)`, safeParses, sets inline errors + focuses the first invalid, and blocks advancing. Step 2 keeps native `required` + server-side validation (server returns `fieldErrors`). Native `required` on hidden step-1 fields is safe: the client gate guarantees they're filled before they're hidden, so they're never "invalid + unfocusable".
- **Progress indicator:** two flex-1 rounded bars (filled = `bg-primary`), "About you" / "Your company" labels (active = `text-foreground`), "Step X of 2", `role="progressbar"`. Tailwind/shadcn tokens only.
- **Server step-1 errors:** a `useEffect` on `state` jumps back to step 1 if the server ever returns a step-1 `fieldError` (so it's visible).
- **Mobile:** full-width inputs/buttons, `type="email"` + `autoComplete` (given-name/family-name/email/new-password/organization) for iOS keyboards + autofill.

## Do NOT touch
- `actions.tsx` (signUpAction), `provision-tenant.ts`, `onboarding.schemas.ts`, the page wrapper, or the field set. No new dependency.

## Verification
- `npx tsc --noEmit` → 0 errors.
- End-to-end at 390px via Playwright against the running dev server: step gating, invalid-data block, value preservation on Back/forward, no POST until final submit, and the final submit carries the full payload (all 6 fields). The final POST is intercepted/aborted so NO real tenant/auth-user/email is created in the shared Supabase; the server action is unchanged, so real provisioning is unaffected.

## Commit
`feat(quick-487): 2-step signup wizard (About you / Your company) + progress`
