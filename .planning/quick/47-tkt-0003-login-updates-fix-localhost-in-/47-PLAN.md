---
phase: quick-47
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/auth/accept-invitation/route.ts
  - src/app/(auth)/accept-invitation/page.tsx
autonomous: true

must_haves:
  truths:
    - "Invitation emails link to the correct production URL, not localhost"
    - "The accept-invitation page shows a read-only email field so browsers can save the email+password for autofill"
  artifacts:
    - path: "src/app/api/auth/accept-invitation/route.ts"
      provides: "GET handler returning invitation email for the given id"
    - path: "src/app/(auth)/accept-invitation/page.tsx"
      provides: "Form with visible read-only email field + password fields"
  key_links:
    - from: "src/app/(auth)/accept-invitation/page.tsx"
      to: "/api/auth/accept-invitation?id=..."
      via: "GET fetch on mount to retrieve email"
      pattern: "fetch.*api/auth/accept-invitation"
---

<objective>
Fix two login-flow bugs from TKT-0003.

1. Invitation emails send localhost links in production. Both server actions already read
   `process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'` — the code is correct.
   The issue is that `NEXT_PUBLIC_APP_URL` is likely unset in the production environment.
   This task adds a GET endpoint to the accept-invitation API route (needed for fix #2),
   and adds a defensive log/warning so it is obvious when the env var is missing.

2. The accept-invitation page has no email field, so browsers cannot associate the
   password with an account for autofill. Fix: add a GET handler to fetch the
   invitation's email by id, then render a read-only email input above the password
   fields so the browser sees a complete username+password form.

Purpose: Correct broken invitation links in production and enable browser password-manager autofill on the account-creation page.
Output: Updated API route (new GET handler) + updated accept-invitation page (email field).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add GET handler to accept-invitation API route</name>
  <files>src/app/api/auth/accept-invitation/route.ts</files>
  <action>
    Add a `GET` export to the existing route file. The handler reads `?id=` from the
    request URL, looks up the `driverInvitation` record (bypassing RLS the same way
    the POST handler does), and returns `{ email, firstName }` so the page can
    pre-populate the form.

    Return shapes:
    - 400 `{ error: 'Invitation ID is required' }` — missing `id` param
    - 404 `{ error: 'Invitation not found' }` — no record
    - 410 `{ error: 'This invitation has already been used or cancelled' }` — status != PENDING
    - 410 `{ error: 'This invitation has expired...' }` — past expiresAt
    - 200 `{ email: string, firstName: string }` — happy path

    Expose only `email` and `firstName` — do not leak other invitation fields.

    Also add a startup warning at the top of the file (outside the handlers) that logs
    to `console.warn` when `NEXT_PUBLIC_APP_URL` is not set, so the misconfiguration
    is visible in server logs:

    ```ts
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      console.warn(
        '[accept-invitation] NEXT_PUBLIC_APP_URL is not set. Invitation links will use http://localhost:3000. Set this env var in production.'
      );
    }
    ```

    (This warning fires at module load time on the server, making the missing env var
    visible immediately in production logs.)
  </action>
  <verify>
    Run: `curl "http://localhost:3000/api/auth/accept-invitation?id=VALID_ID"` — should
    return `{ email, firstName }`.
    Run: `curl "http://localhost:3000/api/auth/accept-invitation?id=INVALID"` — should
    return 404.
    TypeScript compiles without errors: `npx tsc --noEmit`.
  </verify>
  <done>
    GET /api/auth/accept-invitation?id=X returns 200 with email+firstName for valid
    pending invitations and appropriate error codes otherwise. The env-var warning
    appears in server logs when NEXT_PUBLIC_APP_URL is unset.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add pre-filled email field to accept-invitation page</name>
  <files>src/app/(auth)/accept-invitation/page.tsx</files>
  <action>
    Update `AcceptInvitationForm` to:

    1. On mount (via `useEffect`), fetch `GET /api/auth/accept-invitation?id={invitationId}`.
       Store `email` and `firstName` in component state. Show a loading skeleton or
       spinner while fetching (reuse the existing `Loader2` import). If the GET returns
       an error (404, 410, etc.), surface the error message from the response body and
       do not render the form (same pattern as the existing "Invalid Invitation Link"
       early return).

    2. Add an email `<input>` as the **first field** in the form, before the password
       fields. Mark it `readOnly` and `tabIndex={-1}` so users cannot edit it, but
       browsers still see it for autofill association. Set `autoComplete="username"` (the
       WHATWG autofill spec token that signals this is the account identifier for the
       adjacent password fields — more compatible than `"email"` for credential saving).
       Style it to look visually distinct from editable fields: use `opacity-60` and
       `cursor-not-allowed` alongside the existing input class string. Add a visible
       label "Email" above it.

    3. Change both password inputs to `autoComplete="new-password"` (they already have
       this — verify it is present and keep it).

    4. Optionally use `firstName` from the GET response to personalise the greeting
       paragraph ("Set a password to complete your account setup, {firstName}." or
       similar) — use it if available, fall back to the current generic text.

    Keep the existing `invitationId` extraction from `useSearchParams` and the
    `handleSubmit` POST logic unchanged. The email is display-only; the POST body
    still sends only `{ invitationId, password }`.
  </action>
  <verify>
    1. Navigate to `/accept-invitation?id=VALID_ID` in a browser.
    2. Confirm the email field is pre-populated and not editable.
    3. Fill in a password and submit — account creation should still succeed.
    4. Open browser password manager — confirm it offers to save the email+password pair.
    5. TypeScript compiles without errors: `npx tsc --noEmit`.
  </verify>
  <done>
    The accept-invitation page renders a read-only email field above the password inputs.
    Browsers can associate the email with the new password for autofill/password-manager
    saving. Form submission still works correctly.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no new errors
- GET /api/auth/accept-invitation?id=X returns `{ email, firstName }` for a valid pending invitation
- Accept-invitation page shows: email (read-only) → password → confirm password → submit
- Full flow: click invitation link → page loads email → set password → account created → redirected to dashboard/my-route
- Browser password manager prompts to save credentials after successful submission
</verification>

<success_criteria>
1. Invitation emails in production will link to the correct domain once NEXT_PUBLIC_APP_URL is set (existing code is correct; the env-var warning makes the misconfiguration visible in logs).
2. The accept-invitation page displays a read-only email field so browsers can save the email+password pair via their password manager.
</success_criteria>

<output>
After completion, create `.planning/quick/47-tkt-0003-login-updates-fix-localhost-in-/47-SUMMARY.md`
</output>
