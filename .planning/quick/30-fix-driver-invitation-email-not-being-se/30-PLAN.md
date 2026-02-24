---
phase: quick-30
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/drivers.ts
  - src/lib/email/resend-client.ts
  - .env.example
autonomous: true

must_haves:
  truths:
    - "When RESEND_API_KEY is missing, inviteDriver returns an error telling the user email could not be sent (not a silent success)"
    - "When RESEND_API_KEY is present and valid, driver receives invitation email after being invited"
    - "The invitation email shows the actual tenant/organization name, not hardcoded 'your fleet'"
    - "The success message distinguishes between 'invitation created + email sent' vs 'invitation created but email failed'"
  artifacts:
    - path: "src/app/(owner)/actions/drivers.ts"
      provides: "inviteDriver with visible email failure feedback"
    - path: ".env.example"
      provides: "Documents RESEND_API_KEY and RESEND_FROM_EMAIL"
  key_links:
    - from: "src/app/(owner)/actions/drivers.ts"
      to: "src/lib/email/send-driver-invitation.ts"
      via: "sendDriverInvitation call with tenant name"
      pattern: "sendDriverInvitation"
---

<objective>
Fix driver invitation emails not being sent — the root cause is that email send failures are silently swallowed, returning "Invitation sent" even when the email was never delivered. Additionally, RESEND_API_KEY is not documented in .env.example, making it easy to miss during setup. The organization name is hardcoded as "your fleet" instead of using the tenant name.

Purpose: Drivers should actually receive invitation emails, and when email sending fails, the user should know about it.
Output: Working invitation email flow with proper error visibility.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(owner)/actions/drivers.ts
@src/lib/email/send-driver-invitation.ts
@src/lib/email/resend-client.ts
@src/emails/driver-invitation.tsx
@.env.example
</context>

<tasks>

<task type="auto">
  <name>Task 1: Surface email failures to user and fetch tenant name</name>
  <files>
    src/app/(owner)/actions/drivers.ts
    src/lib/email/resend-client.ts
    .env.example
  </files>
  <action>
**Problem analysis:** The inviteDriver action in `src/app/(owner)/actions/drivers.ts` has an inner try/catch around the email send (lines 93-108) that catches all errors and logs them with console.error, then continues to return `{ success: true, message: "Invitation sent to {email}" }`. The user sees a green success message even when the email was never sent. Additionally, if RESEND_API_KEY is missing, the resend-client.ts Proxy throws immediately, which is caught by this same inner catch.

**Fix 1 — Surface email failure in inviteDriver (src/app/(owner)/actions/drivers.ts):**

In the inner try/catch block (around `sendDriverInvitation` call, lines 93-108):
- Keep the try/catch (do NOT roll back the invitation record on email failure — per quick-16 decision)
- But change what is returned: track whether email succeeded with a boolean
- After the try/catch, return different messages:
  - If email sent: `{ success: true, message: "Invitation sent to {email}" }`
  - If email failed: `{ success: true, warning: true, message: "Invitation created for {email}, but the email could not be sent. Check that RESEND_API_KEY is configured in your environment variables." }`
- This preserves the existing pattern (invitation record persists) while giving the user actionable feedback

**Fix 2 — Fetch tenant name for organization name (src/app/(owner)/actions/drivers.ts):**

Before the email send call, fetch the tenant name:
```typescript
// Fetch tenant name for email
const tenant = await prisma.tenant.findUnique({
  where: { id: tenantId },
  select: { name: true },
});
const organizationName = tenant?.name || 'your fleet';
```

Note: `tenantId` is already available (line 44). The `prisma` client is already tenant-scoped (line 45). Use `prisma.tenant.findUnique` with the tenantId. Then pass `organizationName` to `sendDriverInvitation` instead of the hardcoded `'your fleet'`.

IMPORTANT: The Tenant model has RLS, but the current prisma client is already configured with tenant context (getTenantPrisma), so `prisma.tenant.findUnique({ where: { id: tenantId } })` will work because RLS allows reading your own tenant. If this fails due to RLS, fall back to hardcoded 'your fleet' (the tenant name fetch should be in a try/catch or use optional chaining).

**Fix 3 — Add warning display to form feedback (src/app/(owner)/actions/drivers.ts):**

The `DriverForm` component already handles `state?.success && state?.message` (green banner). The warning state needs to render differently. However, since the form component checks `state?.success` for the green banner, we need the warning to show as a yellow/amber banner instead.

In the return object, when email fails, return:
```typescript
return {
  success: true,
  warning: 'Invitation created but email could not be sent. Check RESEND_API_KEY configuration.',
};
```

Then in `src/components/drivers/driver-invite-form.tsx`, add a warning banner between success and error checks:
```tsx
{state?.warning && (
  <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
    <p className="text-sm text-amber-800">{state.warning}</p>
  </div>
)}
```

**Fix 4 — Add helpful error log in resend-client.ts (src/lib/email/resend-client.ts):**

The Proxy in resend-client.ts throws a generic error when RESEND_API_KEY is missing. Improve the error message:
```typescript
throw new Error('RESEND_API_KEY environment variable is required. Add it to .env.local — get your key from https://resend.com/api-keys');
```

**Fix 5 — Document env vars (.env.example):**

Add to `.env.example`:
```
# Email (Resend — required for invitation emails, notifications)
RESEND_API_KEY=
RESEND_FROM_EMAIL=DriveCommand <onboarding@resend.dev>
```
  </action>
  <verify>
1. `npx tsc --noEmit` — TypeScript compiles without errors
2. Read the modified inviteDriver function and confirm: (a) email failure returns warning instead of success message, (b) tenant name is fetched and passed to sendDriverInvitation, (c) invitation record still persists on email failure
3. Read .env.example and confirm RESEND_API_KEY and RESEND_FROM_EMAIL are documented
4. Read driver-invite-form.tsx and confirm warning banner is rendered for state.warning
  </verify>
  <done>
- inviteDriver returns distinct success vs warning messages based on email send outcome
- Organization name comes from Tenant.name (not hardcoded)
- .env.example documents RESEND_API_KEY and RESEND_FROM_EMAIL
- DriverForm shows amber warning banner when email fails but invitation was created
- resend-client.ts has actionable error message pointing to Resend dashboard
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles: `npx tsc --noEmit`
- Dev server starts: `npm run dev` (quick smoke test)
- Review the invitation flow end-to-end: inviteDriver action -> sendDriverInvitation -> resend-client -> Resend API
- Confirm no silent error swallowing remains in the invitation path
</verification>

<success_criteria>
- Email send failures produce visible user feedback (amber warning banner, not green success)
- Invitation record still persists regardless of email outcome (preserving quick-16 decision)
- Tenant name used in email instead of "your fleet"
- RESEND env vars documented in .env.example
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/30-fix-driver-invitation-email-not-being-se/30-SUMMARY.md`
</output>
