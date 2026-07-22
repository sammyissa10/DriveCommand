# Quick Task 487 — Summary

**Goal:** Turn the single-screen "Start your free trial" signup form into a 2-step wizard with a progress indicator, mobile-Safari-first. Same fields, no new required fields, server action + provisioning unchanged.

## Change (1 file, commit `d1600223`)
`apps/web/src/app/(auth)/sign-up/sign-up-form.tsx` — rewritten as a wizard:
- **Step 1 — About you:** First name, Last name, Work email, Password (with the show/hide toggle from quick task 1).
- **Step 2 — Your company:** Company name, Fleet size, Promo code (optional).

## How it preserves the server contract
Kept a single `<form action={signUpAction}>`. Both step field-groups stay **mounted**, toggled with the `hidden` class. Because the inputs are uncontrolled and never unmount:
1. Values persist across Back/Continue automatically (no controlled state, no hidden mirror inputs).
2. The submitted `FormData` is **byte-identical** to the old single-screen form → `signUpAction`, `provisionTenant`, and `onboarding.schemas.ts` are untouched.

Only **step 2 renders a submit button**, so nothing POSTs until "Create free account". Step 1's footer is a `type="button"` Continue; Enter on step 1 is intercepted to advance.

## Validation
- **Step 1 (client gate):** `step1Schema = signUpSchema.pick({firstName,lastName,email,password})` — reuses the exact server rules, so client and server never disagree. Blocks advancing, shows inline errors, focuses the first invalid field.
- **Step 2:** native `required` + unchanged server-side validation (returns `fieldErrors`). Native `required` on the now-hidden step-1 fields is safe — the client gate guarantees they're filled before they're hidden, so they can't be "invalid + unfocusable".
- A `useEffect` jumps back to step 1 if the server ever returns a step-1 field error (so it stays visible).

## Progress indicator + mobile
Two flex-1 rounded bars (filled = `bg-primary`), "About you"/"Your company" labels (active = `text-foreground`), "Step X of 2", `role="progressbar"`. Full-width inputs/buttons, `type="email"` + `autoComplete` hints for iOS keyboards/autofill. Tailwind + shadcn tokens only; no new dependency.

## Verification
- `npx tsc --noEmit` → **0 errors**.
- **End-to-end at 390px** via Playwright against the running dev server (`/sign-up`) — **22/22 checks**:
  - step 1 shown first, company field hidden; empty Continue blocked (no POST); invalid email/short password blocked;
  - valid step 1 advances to step 2 (company visible, step-1 fields hidden);
  - Back preserves First name + email; forward preserves Company name;
  - **no POST during navigation**; **exactly one POST on final submit**, whose payload contains firstName, lastName, email, password, companyName, and fleetSizeBucket.
  - Screenshots at 390px confirm both steps render in the shadcn card with the progress bar and no overflow.
- The final submit was intercepted/aborted in the test so **no real tenant, auth user, or confirmation email was created** in the shared Supabase. Since `signUpAction` and the provisioning flow are unchanged and receive identical FormData, real end-to-end provisioning is unaffected.

## Notes
- Not deployed, not pushed. (Tested against the already-running local dev server on :3000; a throwaway :3457 attempt deferred to it and exited — the user's server was left untouched.)
- If a live provisioning run is wanted, it can be done with a throwaway email — flagged rather than performed to avoid creating real data + sending an email.
