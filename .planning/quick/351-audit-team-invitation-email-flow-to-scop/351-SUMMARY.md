---
phase: quick-351
plan: "01"
subsystem: notifications / invitation email
tags: [audit, email, invitation, role, manager, driver]
dependency_graph:
  requires: []
  provides: [352-fix-manager-invitation-email-copy]
  affects: [driver-invitation-template, team-permissions-action, accept-invitation-route]
tech_stack:
  added: []
  patterns: [dispatcher-pattern, react-email, resend]
key_files:
  created:
    - .planning/quick/351-audit-team-invitation-email-flow-to-scop/351-SUMMARY.md
  modified: []
decisions:
  - "Recommend option (b): split into a second NotificationTemplateSeed entry (manager.invited) and route by role — avoids polluting the driver.invited template semantics and scales cleanly to future role additions"
metrics:
  duration: ~18 min
  completed: "2026-05-16"
---

# Phase quick-351: Audit — Team Invitation Email Flow

One-liner: The MANAGER invite from /settings/team-permissions calls `sendDriverInvitation()`, which fires the `driver.invited` notification template — a template whose subject, header, and body copy are all driver-hardcoded. The `driverInvitation` Prisma model does store `role: MANAGER`, but neither the dispatcher nor the template reads it.

---

## Q1. MANAGER invite (team-permissions) — Resend template

**Template file (seed / source of truth for dispatcher):**
`apps/web/prisma/seeds/notification-template-data/driver.ts` lines 7–28

**Subject (stored in `defaultSubject` column in DB, variable-interpolated at send time):**
`"You've been invited to join {{tenantName}} on DriveCommand"`

**Header copy (hardcoded in `headerText`):**
`"Driver invitation"` — line 13

**Body copy (hardcoded in `paragraphTextWithVars`):**
`"Hi {{driverFirstName}}, you have been invited to join {{tenantName}} as a driver on DriveCommand. Accept your invitation to access your loads, documents, and messages."` — line 14-16

**CTA label:**
`"Accept Invitation"` — line 17

**Legacy fallback subject** (used when dispatcher throws, in `send-driver-invitation.ts` line 54):
`"You're invited to join ${data.organizationName} on DriveCommand"`

**Legacy fallback body** (react email component `DriverInvitationEmail`):
`"{organizationName} has invited you to join their fleet on DriveCommand as a driver."` — `apps/web/src/emails/driver-invitation.tsx` line 39-41

The primary path (dispatcher) fires trigger key `driver.invited` which resolves the above DB-seeded copy. Both paths are driver-hardcoded.

---

## Q2. DRIVER invite (carrier/drivers screen) — Resend template

**Same template file:** `apps/web/prisma/seeds/notification-template-data/driver.ts` lines 7–28

**Subject:** Same — `"You've been invited to join {{tenantName}} on DriveCommand"`

**Header copy:** Same — `"Driver invitation"`

**Body copy:** Same — `"Hi {{driverFirstName}}, you have been invited to join {{tenantName}} as a driver on DriveCommand. Accept your invitation to access your loads, documents, and messages."`

**Submit action:** `apps/web/src/app/(owner)/actions/drivers.ts` → `inviteDriver()` (line 28)
  - Uses `useFormState` / `FormData` pattern
  - Creates `driverInvitation` row with no explicit `role` field (defaults to `DRIVER` via Prisma schema default)
  - Calls `sendDriverInvitation()` at line 179

---

## Q3. Same template or different?

**Same file, same trigger key, same DB record.** Both flows call `sendDriverInvitation()` (in `apps/web/src/lib/email/send-driver-invitation.ts`), which fires `dispatchNotification('driver.invited', ...)`. The dispatcher looks up the single `NotificationTemplate` row where `triggerKey = 'driver.invited'` — there is only one such row. Neither the sender helper nor the dispatcher branches on `role`. The MANAGER and DRIVER flows are 100% identical from the email layer's perspective.

---

## Q4. Submit endpoint + role value persisted (team-permissions)

**Action (called directly as a server action):**
`apps/web/src/app/(owner)/actions/team-permissions.ts` → `inviteTeamMember()` (line 120)

**Prisma create call (lines 160–172):**
```ts
const invitation = await prisma.driverInvitation.create({
  data: {
    tenantId,
    email,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    fullName: `${data.firstName.trim()} ${data.lastName.trim()}`,
    role: UserRole.MANAGER,        // ← role IS stored correctly
    permissions: data.permissions as unknown as Prisma.JsonObject,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'PENDING',
  },
});
```

**Role value stored:** `UserRole.MANAGER` ("MANAGER") — correct in the DB row.

**Email send call (lines 178–188):**
```ts
await sendDriverInvitation(email, {
  tenantId,
  firstName: data.firstName.trim(),
  lastName: data.lastName.trim(),
  organizationName,
  acceptUrl,
  expiresAt: ...,
});
```

The role is never passed to `sendDriverInvitation()`. The function signature (`DriverInvitationEmailData`) has no `role` parameter. The dispatcher payload shape for `driver.invited` (`{ driverEmail, driverFirstName, tenantName, inviteUrl }`) also has no `role` field — it is impossible for the current dispatcher to send different copy per role.

**Invitation table row shape for a MANAGER invite:**

| Column | Value |
|--------|-------|
| role | MANAGER |
| permissions | JSON object (manager permissions) |
| licenseNumber | null |
| licenseNumberCiphertext | null |
| dateOfBirth | null |
| middleName | null |
| status | PENDING |

---

## Q5. Accept-invitation flow — role-aware?

**Route file (page):** `apps/web/src/app/(auth)/accept-invitation/page.tsx`
**API route:** `apps/web/src/app/api/auth/accept-invitation/route.ts`

**Page copy:** The page UI is role-agnostic. It shows only:
- Title: `"Create Your Account"` (line 122) — no role mention
- Subtitle: `"Set a password to complete your account setup, {firstName}."` (line 125-127) — no role mention
- Submit button: `"Create Account"` (line 224) — no role mention

**POST redirect (API route line 265):**
```ts
const redirectUrl = user.role === 'OWNER' || user.role === 'MANAGER' ? '/carrier/dashboard' : '/home';
```
The post-accept redirect IS role-aware. MANAGER → `/carrier/dashboard`; DRIVER → `/home`. This part is correct.

**Summary:** The accept-invitation page and API route are functionally role-aware at the redirect level. The page copy is role-neutral (acceptable — "Create Your Account" is fine for any role). No driver-hardcoded strings on this screen.

---

## Q6. Invitation table schema — role-related columns

**Model:** `DriverInvitation` (`apps/web/prisma/schema.prisma` lines 336–373)

| Column | Type | Role relevance |
|--------|------|----------------|
| `role` | `UserRole @default(DRIVER)` | Stores the invited user's role (DRIVER or MANAGER). Set correctly by both invite flows. |
| `permissions` | `Json?` | MANAGER-only permissions object. Null for DRIVERs. Set by team-permissions flow. |
| `licenseNumber` | `String?` | Driver-specific PII. Null for MANAGER invites. |
| `licenseNumberCiphertext` | `Bytes?` | Encrypted driver CDL. Null for MANAGER invites. |
| `dateOfBirth` | `DateTime?` | Driver-specific PII. Null for MANAGER invites. |

No `isDriver` boolean column exists. Role distinction is solely via the `role: UserRole` enum column (line 359). The DB schema is correct — the bug is entirely in the email layer above it.

---

## Q7. Downstream driver-hardcoded copy inventory

Every string that will be wrong when a MANAGER receives the invitation:

| File | Line(s) | String | Used for |
|------|---------|--------|----------|
| `apps/web/prisma/seeds/notification-template-data/driver.ts` | 13 | `'Driver invitation'` | Email header text (stored in DB as blockJson) |
| `apps/web/prisma/seeds/notification-template-data/driver.ts` | 14-16 | `'you have been invited to join {{tenantName}} as a driver on DriveCommand. Accept your invitation to access your loads, documents, and messages.'` | Email body paragraph (stored in DB as blockJson) |
| `apps/web/prisma/seeds/notification-template-data/driver.ts` | 9 | `displayName: 'Driver Invited'` | Admin UI display name — not visible to invitee, but mislabels MANAGER invites in the notification log |
| `apps/web/prisma/seeds/notification-template-data/driver.ts` | 10 | `description: 'Sent to a newly invited driver with their invite link...'` | Admin UI description — same mislabeling |
| `apps/web/src/emails/driver-invitation.tsx` | 39-41 | `'{organizationName} has invited you to join their fleet on DriveCommand as a driver.'` | Legacy fallback email body paragraph |
| `apps/web/src/lib/email/send-driver-invitation.ts` | 9 | `import { DriverInvitationEmail }` | Function name and import; used as fallback template component |
| `apps/web/src/lib/email/send-driver-invitation.ts` | 32 | `dispatchNotification('driver.invited', ...)` | Trigger key — fires the driver-specific template for both roles |
| `apps/web/src/app/(owner)/actions/team-permissions.ts` | 14 | `import { sendDriverInvitation }` | Calls driver-specific sender from the MANAGER invite action |
| `apps/web/src/app/(owner)/actions/team-permissions.ts` | 178 | `await sendDriverInvitation(email, { ... })` | Dispatch call — no role passed |

**Strings that are acceptable as-is (no change needed):**
- Subject: `"You've been invited to join {{tenantName}} on DriveCommand"` — role-neutral, acceptable
- CTA button text: `"Accept Invitation"` — role-neutral, acceptable
- Footer: `"If you did not expect this invitation, you can ignore this email."` — role-neutral, acceptable
- Accept-invitation page: `"Create Your Account"` / `"Set a password to complete your account setup"` — role-neutral, acceptable
- Post-accept redirect: already role-aware (line 265 of route.ts)

---

## Recommendation

**Strategy: (b) Split into a second template and route by role at the call site**

**Rationale:**

1. **The `driver.invited` template semantics are correct for drivers.** Its display name, description, available variables (`driverEmail`, `driverFirstName`), and body copy all describe a driver onboarding flow. Branching inside the template would require either: (a) adding an `{{#if role == MANAGER}}` conditional that the current Tiptap/blockJson renderer does not support, or (b) adding a `role` variable and building complex conditional copy into the seed — both approaches couple the two distinct concepts into one template and complicate the tenant customization UI.

2. **A new `manager.invited` (or `team_member.invited`) seed entry is the minimal, clean fix.** It requires: one new entry in `apps/web/prisma/seeds/notification-template-data/` (e.g., `manager.ts`), one new trigger key in `types.ts`, one new `NotificationPayload` shape, and a one-line change in `inviteTeamMember()` to call `dispatchNotification('manager.invited', ...)` instead of `sendDriverInvitation()`. The driver flow is untouched.

3. **The legacy fallback path also needs a parallel fix.** `send-driver-invitation.ts` wraps both flows. A new `send-manager-invitation.ts` helper (mirroring the existing file's structure) should call `dispatchNotification('manager.invited', ...)` and fall back to a `ManagerInvitationEmail` React component — a sibling of `driver-invitation.tsx`.

4. **The DB schema already supports this cleanly.** `DriverInvitation.role` already stores `MANAGER` vs `DRIVER`. No migration needed.

**Surgical fix scope — minimum viable fix:**

- `apps/web/prisma/seeds/notification-template-data/driver.ts` — no change (driver template stays as-is)
- NEW: `apps/web/prisma/seeds/notification-template-data/manager.ts` — new `manager.invited` template seed with corrected copy ("Team member invitation", "...invited to join {{tenantName}} as a team member...")
- `apps/web/src/lib/notifications/types.ts` — add `'manager.invited'` to `TriggerKey` union (line 3) and add `NotificationPayload['manager.invited']` shape
- NEW: `apps/web/src/lib/email/send-manager-invitation.ts` — sibling to `send-driver-invitation.ts`, calls `dispatchNotification('manager.invited', ...)`
- `apps/web/src/app/(owner)/actions/team-permissions.ts` — replace `import { sendDriverInvitation }` (line 14) with `import { sendManagerInvitation }`, replace `sendDriverInvitation(...)` call (line 178) with `sendManagerInvitation(...)`
- NEW: `apps/web/src/emails/manager-invitation.tsx` (or `team-member-invitation.tsx`) — legacy fallback React Email component with role-correct copy
- Run the notification-template seed (or a new migration) to insert the `manager.invited` DB row

**Out-of-scope follow-ups (nice-to-have):**

- Rename `sendDriverInvitation` → more role-explicit name (e.g., `sendDriverInvitationEmail`) for clarity — low priority, no user impact
- Add `role` to `DriverInvitationEmailData` interface for future extensibility
- Consider renaming model `DriverInvitation` → `UserInvitation` in a future migration (schema-level clarity; non-trivial, skip for now)
- Template admin UI: once `manager.invited` exists in the DB, owners will see it in notification settings and can customize it per tenant

---

## Self-Check: PASSED

- All 7 questions answered with file paths and line numbers
- Offending strings quoted with exact locations (Q7 table)
- Recommendation explicitly chooses (b) with concrete evidence citing the blockJson renderer limitation, the clean DB schema, and the untouched driver flow benefit
- `git status` confirms no source files modified — only this SUMMARY.md is new
