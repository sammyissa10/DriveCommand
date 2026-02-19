---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/emails/driver-invitation.tsx
  - src/lib/email/send-driver-invitation.ts
  - src/app/(owner)/actions/drivers.ts
  - src/app/(auth)/accept-invitation/page.tsx
  - src/app/api/auth/accept-invitation/route.ts
autonomous: true
must_haves:
  truths:
    - "When an owner invites a driver, the driver receives an email at the specified address"
    - "The invitation email contains the driver's name, the organization context, and a link to accept"
    - "Clicking the accept link takes the driver to a page where they set a password and create their account"
    - "After accepting, the driver can sign in and the invitation status is updated to ACCEPTED"
  artifacts:
    - path: "src/emails/driver-invitation.tsx"
      provides: "React-email invitation template"
      contains: "DriverInvitationEmail"
    - path: "src/lib/email/send-driver-invitation.ts"
      provides: "Resend send function for invitation"
      exports: ["sendDriverInvitation"]
    - path: "src/app/(owner)/actions/drivers.ts"
      provides: "Updated inviteDriver action that sends email"
      contains: "sendDriverInvitation"
    - path: "src/app/(auth)/accept-invitation/page.tsx"
      provides: "Accept invitation page with password form"
      contains: "accept-invitation"
    - path: "src/app/api/auth/accept-invitation/route.ts"
      provides: "API endpoint to validate invitation and create user"
      exports: ["POST"]
  key_links:
    - from: "src/app/(owner)/actions/drivers.ts"
      to: "src/lib/email/send-driver-invitation.ts"
      via: "import and call after DB create"
      pattern: "sendDriverInvitation"
    - from: "src/emails/driver-invitation.tsx"
      to: "accept-invitation page"
      via: "URL in email button"
      pattern: "accept-invitation\\?id="
    - from: "src/app/(auth)/accept-invitation/page.tsx"
      to: "src/app/api/auth/accept-invitation/route.ts"
      via: "fetch POST to create account"
      pattern: "api/auth/accept-invitation"
---

<objective>
Wire up the driver invitation flow so that inviting a driver actually sends an email via Resend, with an accept link that lets the driver create their account (set password).

Purpose: Currently inviteDriver creates a DB record but sends no email. Drivers have no way to know they've been invited or create an account. This completes the invitation loop.

Output: Email template, send function, updated server action, accept-invitation page, and accept-invitation API endpoint.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/emails/driver-document-expiry-reminder.tsx (template pattern to follow)
@src/lib/email/send-driver-document-expiry-reminder.ts (send function pattern to follow)
@src/lib/email/resend-client.ts (resend singleton + FROM_EMAIL)
@src/app/(owner)/actions/drivers.ts (inviteDriver action to modify)
@src/app/(auth)/sign-in/[[...sign-in]]/page.tsx (auth UI pattern)
@src/app/api/auth/login/route.ts (auth API pattern, bcrypt + setSession)
@prisma/schema.prisma (DriverInvitation model + User model)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create invitation email template and send function</name>
  <files>
    src/emails/driver-invitation.tsx
    src/lib/email/send-driver-invitation.ts
  </files>
  <action>
Create `src/emails/driver-invitation.tsx` — a react-email template matching the existing style (same imports from `@react-email/components`, same style object pattern with blue #1e40af header, white content area, gray footer).

Props interface:
```ts
interface DriverInvitationEmailProps {
  firstName: string;
  lastName: string;
  organizationName: string; // tenant/company name (pass "your fleet" as fallback)
  acceptUrl: string; // full URL with invitation ID
  expiresAt: string; // human-readable expiry date
}
```

Template content:
- Header: "You're Invited to DriveCommand"
- Greeting: "Hello {firstName},"
- Body: "{organizationName} has invited you to join their fleet on DriveCommand as a driver. Click the button below to create your account and get started."
- CTA Button: "Accept Invitation" linking to `acceptUrl`
- Below button: "This invitation expires on {expiresAt}."
- Footer: standard "DriveCommand - Fleet Management" footer

Create `src/lib/email/send-driver-invitation.ts` following the exact same pattern as `send-driver-document-expiry-reminder.ts`:
- Import `resend, FROM_EMAIL` from `./resend-client`
- Import `DriverInvitationEmail` from `@/emails/driver-invitation`
- Export interface `DriverInvitationEmailData` with: `firstName`, `lastName`, `organizationName`, `acceptUrl`, `expiresAt`
- Export async function `sendDriverInvitation(toEmail: string, data: DriverInvitationEmailData): Promise<{ id: string }>`
- Subject line: "You're invited to join {organizationName} on DriveCommand"
- Call `resend.emails.send({ from: FROM_EMAIL, to: [toEmail], subject, react: DriverInvitationEmail(data) })`
- Throw on error with descriptive message, return `{ id: result.data.id }` on success
  </action>
  <verify>Run `npx tsc --noEmit --pretty` and confirm no type errors in the new files.</verify>
  <done>Email template renders invitation with accept link; send function follows established Resend pattern.</done>
</task>

<task type="auto">
  <name>Task 2: Wire inviteDriver action to send the email</name>
  <files>
    src/app/(owner)/actions/drivers.ts
  </files>
  <action>
Modify the `inviteDriver` function in `src/app/(owner)/actions/drivers.ts`:

1. Add import at top: `import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';`

2. After the `prisma.driverInvitation.create()` call (around line 86), capture the created invitation's `id`:
   ```ts
   const invitation = await prisma.driverInvitation.create({ ... });
   ```

3. Build the accept URL using the invitation ID:
   ```ts
   const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
   const acceptUrl = `${baseUrl}/accept-invitation?id=${invitation.id}`;
   ```

4. Send the email in a try/catch (email failure should NOT fail the invitation creation — log and continue):
   ```ts
   try {
     await sendDriverInvitation(email, {
       firstName,
       lastName,
       organizationName: 'your fleet', // No tenant name lookup needed for now
       acceptUrl,
       expiresAt: invitation.expiresAt.toLocaleDateString('en-US', {
         year: 'numeric', month: 'long', day: 'numeric',
       }),
     });
   } catch (emailError) {
     console.error('Failed to send invitation email:', emailError);
     // Invitation record exists; email can be resent later
   }
   ```

5. Update success message to: `Invitation sent to ${email}`

IMPORTANT: Keep the email send inside the existing try/catch for the DB operation, but wrap the email send itself in its own inner try/catch so a Resend failure does not roll back the invitation record.
  </action>
  <verify>Run `npx tsc --noEmit --pretty` and confirm no type errors. Visually inspect that the email send is after the DB create and in its own try/catch.</verify>
  <done>inviteDriver creates DB record AND sends email. Email failure is logged but does not break the invitation flow.</done>
</task>

<task type="auto">
  <name>Task 3: Create accept-invitation page and API endpoint</name>
  <files>
    src/app/(auth)/accept-invitation/page.tsx
    src/app/api/auth/accept-invitation/route.ts
  </files>
  <action>
**API endpoint** `src/app/api/auth/accept-invitation/route.ts`:

Create a POST endpoint that accepts `{ invitationId: string, password: string }` JSON body.

Logic:
1. Validate `invitationId` and `password` exist (password min 8 chars)
2. Use the root `prisma` client (not tenant-scoped — no session yet). Use bypass RLS pattern from login route:
   ```ts
   const invitation = await prisma.$transaction(async (tx) => {
     await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
     return tx.driverInvitation.findUnique({ where: { id: invitationId } });
   });
   ```
3. Validate invitation: exists, status is PENDING, not expired (`expiresAt > now()`)
4. Hash password with `bcrypt.hash(password, 12)`
5. In a transaction (with RLS bypass), create the User and update the invitation:
   ```ts
   await prisma.$transaction(async (tx) => {
     await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
     const user = await tx.user.create({
       data: {
         tenantId: invitation.tenantId,
         email: invitation.email.toLowerCase().trim(),
         passwordHash,
         role: 'DRIVER',
         firstName: invitation.firstName,
         lastName: invitation.lastName,
         licenseNumber: invitation.licenseNumber,
         isActive: true,
       },
     });
     await tx.driverInvitation.update({
       where: { id: invitationId },
       data: { status: 'ACCEPTED', acceptedAt: new Date(), userId: user.id },
     });
     return user;
   });
   ```
6. After transaction, call `setSession(...)` with the new user's data (same pattern as login route)
7. Return `{ success: true, redirectUrl: '/dashboard' }`
8. Handle errors: 400 for validation, 404 for not found, 410 for expired/already accepted, 409 for email conflict, 500 for server error

Imports: `NextRequest`, `NextResponse`, `bcrypt`, `prisma` from `@/lib/db/prisma`, `setSession` from `@/lib/auth/session`

**Accept page** `src/app/(auth)/accept-invitation/page.tsx`:

Create a client component (`"use client"`) that:
1. Reads `?id=` from URL using `useSearchParams()`
2. Has three states: `loading` (validating invitation), `form` (show password form), `error` (invalid/expired)
3. On mount, validate the invitation exists via a GET-style check — actually, skip the GET validation for simplicity. Just show the password form immediately with the invitation ID from the URL. The POST will validate.
4. Form fields: password (min 8 chars), confirm password (must match)
5. On submit, POST to `/api/auth/accept-invitation` with `{ invitationId: id, password }`
6. On success, redirect to `data.redirectUrl` via `window.location.href`
7. On error, show the error message from the API response
8. If no `id` param, show "Invalid invitation link"
9. Style: match sign-in page pattern (same card style, same input classes, same button classes from `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`)
10. Include a heading "Create Your Account", a subtitle "Set a password to complete your driver registration", password field, confirm password field, and submit button "Create Account"
11. Wrap in `Suspense` boundary since `useSearchParams()` requires it in Next.js App Router — create an inner component for the form and wrap it in `<Suspense>` in the default export

Do NOT add this page to any layout group that requires authentication. It lives under `(auth)` layout which is the unauthenticated layout.
  </action>
  <verify>Run `npx tsc --noEmit --pretty` confirming no type errors. Run `npm run build` (or `npx next build`) to confirm both the page and API route compile. Manually verify the page renders at /accept-invitation by starting dev server.</verify>
  <done>Drivers clicking the email link land on a password-setting form. Submitting creates their User account, marks invitation ACCEPTED, sets session, and redirects to dashboard.</done>
</task>

</tasks>

<verification>
1. Type check passes: `npx tsc --noEmit --pretty`
2. Build succeeds: `npx next build` (or at minimum no compile errors)
3. Email template file exists and exports `DriverInvitationEmail` component
4. Send function file exists and exports `sendDriverInvitation`
5. `inviteDriver` action imports and calls `sendDriverInvitation` after DB create
6. Accept invitation page exists at `/accept-invitation` route
7. Accept invitation API exists at `/api/auth/accept-invitation`
</verification>

<success_criteria>
- Inviting a driver from the UI creates the DB record AND triggers an email via Resend
- The email contains the driver's name and a clickable accept link with the invitation ID
- The accept link leads to a password-setting page at /accept-invitation?id=UUID
- Submitting a valid password creates the driver's User account with DRIVER role in the correct tenant
- The invitation record is updated to ACCEPTED status with acceptedAt and userId
- The driver is automatically logged in after accepting and redirected to /dashboard
- Email send failure does not prevent the invitation record from being created
</success_criteria>

<output>
After completion, create `.planning/quick/16-wire-up-driver-invitation-flow-to-send-e/16-SUMMARY.md`
</output>
