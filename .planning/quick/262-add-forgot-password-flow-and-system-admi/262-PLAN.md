---
phase: quick-262
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
  - apps/web/src/app/(auth)/forgot-password/page.tsx
  - apps/web/src/app/(auth)/reset-password/page.tsx
  - apps/web/src/app/api/auth/admin-reset-password/route.ts
  - apps/web/src/app/(admin)/tenants/[id]/page.tsx
  - apps/web/src/app/(admin)/tenants/[id]/reset-password-button.tsx
autonomous: true

must_haves:
  truths:
    - "User sees 'Forgot password?' link on sign-in page and can click it"
    - "User can enter email on forgot-password page and always sees success message (no email enumeration)"
    - "User arriving via Supabase reset link can set a new password and is redirected to sign-in"
    - "Sysadmin can send a password reset email or set a temporary password for any tenant owner"
  artifacts:
    - path: "apps/web/src/app/(auth)/forgot-password/page.tsx"
      provides: "Forgot password email form"
    - path: "apps/web/src/app/(auth)/reset-password/page.tsx"
      provides: "New password form with token handling"
    - path: "apps/web/src/app/api/auth/admin-reset-password/route.ts"
      provides: "Sysadmin password reset API"
    - path: "apps/web/src/app/(admin)/tenants/[id]/reset-password-button.tsx"
      provides: "Reset password UI for sysadmin tenant detail"
  key_links:
    - from: "sign-in page"
      to: "/forgot-password"
      via: "Link component"
    - from: "forgot-password page"
      to: "supabase.auth.resetPasswordForEmail"
      via: "anon client call with redirectTo"
    - from: "reset-password page"
      to: "supabase.auth.updateUser"
      via: "client-side after onAuthStateChange PASSWORD_RECOVERY event"
    - from: "reset-password-button.tsx"
      to: "/api/auth/admin-reset-password"
      via: "fetch POST with userId + action type"
    - from: "admin-reset-password route"
      to: "createAdminClient()"
      via: "service role key for admin.generateLink and admin.updateUserById"
---

<objective>
Add forgot password flow for all users and sysadmin password override for tenant owners.

Purpose: Users currently have no self-service password recovery. Sysadmins have no way to help locked-out users.
Output: Forgot password page, reset password page, sysadmin reset button on tenant detail.
</objective>

<context>
@apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
@apps/web/src/app/(auth)/layout.tsx
@apps/web/src/lib/supabase/client.ts
@apps/web/src/lib/supabase/admin.ts
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/app/(admin)/tenants/[id]/page.tsx
@apps/web/src/app/(admin)/tenants/[id]/owner-email-form.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Forgot password and reset password pages</name>
  <files>
    apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    apps/web/src/app/(auth)/forgot-password/page.tsx
    apps/web/src/app/(auth)/reset-password/page.tsx
  </files>
  <action>
1. **Sign-in page** (`apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`):
   - Add a "Forgot password?" link below the password field (after the password div, before the error div). Use Next.js `Link` to `/forgot-password`. Style: `text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors text-right block` (light text for dark overlay background in auth layout).

2. **Forgot password page** (`apps/web/src/app/(auth)/forgot-password/page.tsx`):
   - "use client" component matching the sign-in page card style (same `div` wrapper classes: `flex flex-col items-center gap-4 w-full max-w-sm`, inner card with `rounded-xl border border-border bg-card shadow-sm p-6`).
   - Title: "Reset your password"
   - Email input field (same styling as sign-in email input).
   - Submit button "Send reset link" with Loader2 spinner while loading.
   - On submit: import `createClient` from `@/lib/supabase/client`, call `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`\${window.location.origin}/reset-password\` })`.
   - ALWAYS show success message after submit regardless of result: "If an account exists with that email, you'll receive a password reset link." This prevents email enumeration.
   - "Back to sign in" link below the card, styled like the forgot password link.

3. **Reset password page** (`apps/web/src/app/(auth)/reset-password/page.tsx`):
   - "use client" component, same card wrapper style as sign-in.
   - Title: "Set new password"
   - Two password fields: "New password" and "Confirm password", each with Eye/EyeOff show/hide toggle (same pattern as sign-in page password field).
   - On mount: import `createClient` from `@/lib/supabase/client`, call `supabase.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY') setReady(true) })`. The `ready` state gates the form — show "Verifying reset link..." with Loader2 until ready. If no PASSWORD_RECOVERY event after 5 seconds, show error "Invalid or expired reset link" with link back to forgot-password.
   - Client-side validation: passwords must match, minimum 8 characters.
   - On submit: call `supabase.auth.updateUser({ password: newPassword })`. On success show green success message "Password updated successfully! Redirecting to sign in..." and `setTimeout(() => router.push('/sign-in'), 3000)`. On error show the error message.
   - Disable submit button while loading, show Loader2 spinner.
  </action>
  <verify>
    - Visit /sign-in and confirm "Forgot password?" link appears and navigates to /forgot-password
    - Visit /forgot-password, enter any email, submit — always shows success message
    - Visit /reset-password directly (no token) — shows "Invalid or expired reset link" after timeout
    - Run `cd apps/web && npx tsc --noEmit` — no TypeScript errors
  </verify>
  <done>
    Forgot password link on sign-in, forgot-password page sends reset email via Supabase anon client with anti-enumeration message, reset-password page handles PASSWORD_RECOVERY event and allows setting new password with show/hide toggles and redirect to sign-in.
  </done>
</task>

<task type="auto">
  <name>Task 2: Sysadmin password reset on tenant detail page</name>
  <files>
    apps/web/src/app/api/auth/admin-reset-password/route.ts
    apps/web/src/app/(admin)/tenants/[id]/reset-password-button.tsx
    apps/web/src/app/(admin)/tenants/[id]/page.tsx
  </files>
  <action>
1. **API route** (`apps/web/src/app/api/auth/admin-reset-password/route.ts`):
   - POST handler accepting JSON body: `{ userId: string, email: string, action: 'send_reset' | 'set_password', password?: string }`.
   - Guard: call `requireAuth()` then `isSystemAdmin()` from `@/lib/auth/supabase` — return 403 if not sysadmin.
   - Import `createAdminClient` from `@/lib/supabase/admin`.
   - For `action: 'send_reset'`: call `supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: \`\${process.env.NEXT_PUBLIC_APP_URL || 'https://drivecommand.vercel.app'}/reset-password\` } })`. Return 200 with `{ success: true, message: 'Reset email sent' }`. Note: `generateLink` generates AND sends the email.
   - For `action: 'set_password'`: validate password is at least 8 chars, then call `supabase.auth.admin.updateUserById(userId, { password })`. Return 200 with `{ success: true, message: 'Password updated' }`.
   - Wrap in try/catch, return 500 on error with `{ error: message }`.
   - Add structured logging via `logger` from `@/lib/logger` for both actions.

2. **Reset password button component** (`apps/web/src/app/(admin)/tenants/[id]/reset-password-button.tsx`):
   - "use client" component accepting props: `{ userId: string, email: string, userName: string }`.
   - "Reset Password" button (same style as other admin action buttons — `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50`).
   - On click: opens a modal/dialog using a simple state-driven overlay (no need for shadcn Dialog — use a div overlay with backdrop like the warning pattern in owner-email-form, but as a centered modal).
   - Modal shows two options:
     - **Option A: "Send Reset Email"** — button that calls POST `/api/auth/admin-reset-password` with `action: 'send_reset'`. Shows success/error feedback.
     - **Option B: "Set Temporary Password"** — reveals a password input with Eye/EyeOff toggle + "Set Password" button. Calls POST with `action: 'set_password'` and the entered password. Min 8 chars client-side validation. Shows success/error feedback. On success, display the message: "Password set. Please share the temporary password with the user securely."
   - Close button on modal. Reset state on close.

3. **Tenant detail page** (`apps/web/src/app/(admin)/tenants/[id]/page.tsx`):
   - Import `ResetPasswordButton` from `./reset-password-button`.
   - In the Owner section (where `OwnerEmailForm` is rendered, around line 142-155), add `<ResetPasswordButton userId={tenant.ownerUser.id} email={tenant.ownerUser.email} userName={\`\${tenant.ownerUser.firstName} \${tenant.ownerUser.lastName}\`} />` below the `OwnerEmailForm`. Only render when `tenant.ownerUser` exists.
  </action>
  <verify>
    - Visit /tenants/[id] as sysadmin — "Reset Password" button visible in owner section
    - Click "Reset Password" — modal opens with two options
    - Run `cd apps/web && npx tsc --noEmit` — no TypeScript errors
  </verify>
  <done>
    Sysadmin can send password reset emails or set temporary passwords for tenant owners from the tenant detail page. API route uses service role key server-side only, guarded by sysadmin check.
  </done>
</task>

</tasks>

<verification>
- Sign-in page shows "Forgot password?" link
- Forgot password page sends reset email and shows anti-enumeration success message
- Reset password page handles Supabase magic link token and allows password change
- Sysadmin tenant detail page has "Reset Password" button with send-email and set-password options
- All password fields have show/hide toggles
- No TypeScript errors (`npx tsc --noEmit`)
</verification>

<success_criteria>
- Complete forgot password self-service flow: sign-in -> forgot-password -> email -> reset-password -> sign-in
- Sysadmin can reset any tenant owner's password via two methods (send email or set directly)
- No email enumeration vulnerability on forgot-password page
- Service role key used only server-side in API route
- All pages match existing auth layout styling
</success_criteria>
