---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
  - src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
  - src/app/(auth)/layout.tsx
autonomous: false
user_setup:
  - service: clerk
    why: "Remove Google OAuth provider from Clerk Dashboard"
    dashboard_config:
      - task: "Disable Google social connection"
        location: "Clerk Dashboard -> Configure -> Social connections -> Google -> Disable"

must_haves:
  truths:
    - "Sign-in page shows only email/password fields, no Google button"
    - "Sign-up page shows only email/password fields, no Google button"
    - "Auth pages have clean, branded styling consistent with DriveCommand"
  artifacts:
    - path: "src/app/(auth)/sign-in/[[...sign-in]]/page.tsx"
      provides: "Email/password-only sign-in page"
      contains: "socialButtonsBlockButton"
    - path: "src/app/(auth)/sign-up/[[...sign-up]]/page.tsx"
      provides: "Email/password-only sign-up page"
      contains: "socialButtonsBlockButton"
  key_links:
    - from: "SignIn component appearance prop"
      to: "Clerk social button elements"
      via: "CSS display:none on social button element keys"
      pattern: "socialButtonsBlockButton.*display.*none"
---

<objective>
Remove Google OAuth sign-in option from auth pages by hiding social login buttons via Clerk component appearance props, resulting in a clean email/password-only login experience for the fleet owner.

Purpose: The app is for a single fleet owner -- Google OAuth adds unnecessary complexity and a less professional appearance. Email/password is the only login method needed.
Output: Updated sign-in and sign-up pages with social buttons hidden via appearance config.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
@src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
@src/app/(auth)/layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hide social login buttons and clean up auth page styling</name>
  <files>
    src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
    src/app/(auth)/layout.tsx
  </files>
  <action>
Update both the SignIn and SignUp Clerk components to hide all social login buttons (Google, etc.) using Clerk's `appearance.elements` prop. Add the following element overrides to BOTH components:

```tsx
appearance={{
  elements: {
    // Hide social login buttons entirely
    socialButtonsBlockButton: "hidden",
    socialButtonsIconButton: "hidden",
    socialButtonsProviderIcon: "hidden",
    // Hide the "or" divider between social and email/password
    dividerRow: "hidden",
    dividerLine: "hidden",
    dividerText: "hidden",
    // Keep the primary button styled
    formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
  },
}}
```

Note: Clerk's appearance.elements accepts Tailwind class strings (when using `@clerk/nextjs` with Tailwind configured). The `hidden` class maps to `display: none`. If Tailwind classes don't work for hiding (Clerk sometimes needs inline styles), use this alternative:

```tsx
socialButtonsBlockButton: { display: "none" },
socialButtonsIconButton: { display: "none" },
socialButtonsProviderIcon: { display: "none" },
dividerRow: { display: "none" },
dividerLine: { display: "none" },
dividerText: { display: "none" },
```

Also update the auth layout (`src/app/(auth)/layout.tsx`) to add a subtle branded header above the Clerk form:
- Add the DriveCommand truck icon + app name above the auth card (using the same Truck icon from lucide-react used in onboarding page)
- Keep the centered flex layout

The layout should look like:
```tsx
import { Truck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
          <Truck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">DriveCommand</h1>
      </div>
      {children}
    </div>
  );
}
```
  </action>
  <verify>
Run `npx next build` (or `npm run build`) to confirm no TypeScript or build errors. Visually inspect by running `npm run dev` and navigating to `/sign-in` and `/sign-up` -- Google button and "or" divider should not be visible.
  </verify>
  <done>
Sign-in and sign-up pages render only email/password fields with no social login buttons or dividers visible. Auth layout shows DriveCommand branding above the Clerk form. Build passes without errors.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify auth pages and disable Google in Clerk Dashboard</name>
  <what-built>Updated sign-in and sign-up pages to hide Google OAuth button and social login dividers. Added DriveCommand branding to the auth layout.</what-built>
  <how-to-verify>
1. Run `npm run dev` and visit http://localhost:3000/sign-in
2. Confirm: Only email/password fields are shown (no Google button, no "or" divider)
3. Visit http://localhost:3000/sign-up
4. Confirm: Same -- only email/password fields, no social buttons
5. Confirm: DriveCommand logo and name appear above the sign-in/sign-up form
6. Test: Sign in with your email/password to confirm the flow still works end-to-end

IMPORTANT MANUAL STEP: To fully remove Google OAuth (not just hide the button), go to your Clerk Dashboard:
- Navigate to Configure -> Social connections
- Find Google and disable/remove it
- This ensures the backend also rejects Google OAuth attempts
  </how-to-verify>
  <resume-signal>Type "approved" or describe any issues with the auth page appearance</resume-signal>
</task>

</tasks>

<verification>
- Both auth pages render without social login buttons
- Build completes successfully (`npm run build`)
- Email/password sign-in flow works end-to-end
- DriveCommand branding visible on auth pages
</verification>

<success_criteria>
Sign-in and sign-up pages show ONLY email/password authentication with clean DriveCommand branding. No Google button, no social login dividers, no "or" separator visible. The owner can sign in with email/password only.
</success_criteria>

<output>
After completion, create `.planning/quick/2-change-login-method-remove-google-create/2-SUMMARY.md`
</output>
