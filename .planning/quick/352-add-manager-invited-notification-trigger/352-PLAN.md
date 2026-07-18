---
phase: quick-352
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/types.ts
  - apps/web/prisma/seeds/notification-template-data/user.ts
  - apps/web/src/lib/email/send-manager-invitation.ts
  - apps/web/src/app/(owner)/actions/team-permissions.ts
autonomous: true

must_haves:
  truths:
    - "TriggerKey union accepts 'manager.invited' as a valid key"
    - "NotificationPayload['manager.invited'] declares { managerEmail, firstName, tenantName, inviteUrl } as string fields"
    - "A NotificationTemplate row exists in the DB with triggerKey='manager.invited' after the seed runs"
    - "Calling inviteTeamMember() routes invite emails through dispatchNotification('manager.invited', ...) instead of dispatchNotification('driver.invited', ...)"
    - "driver.invited template, send-driver-invitation.ts, inviteDriver() action, accept-invitation page/route, and DriverInvitation schema are unchanged"
    - "tsc --noEmit passes from apps/web"
  artifacts:
    - path: "apps/web/src/lib/notifications/types.ts"
      provides: "TriggerKey union + NotificationPayload mapped type with manager.invited"
      contains: "manager.invited"
    - path: "apps/web/prisma/seeds/notification-template-data/user.ts"
      provides: "manager.invited seed entry appended to userTemplates"
      contains: "manager.invited"
    - path: "apps/web/src/lib/email/send-manager-invitation.ts"
      provides: "sendManagerInvitation() wrapper that calls dispatchNotification('manager.invited', ...) with legacy SMTP fallback"
      exports: ["sendManagerInvitation", "ManagerInvitationEmailData"]
    - path: "apps/web/src/app/(owner)/actions/team-permissions.ts"
      provides: "inviteTeamMember() wired to sendManagerInvitation"
      contains: "sendManagerInvitation"
  key_links:
    - from: "apps/web/src/lib/email/send-manager-invitation.ts"
      to: "dispatchNotification('manager.invited', ...)"
      via: "direct call inside try block"
      pattern: "dispatchNotification\\(\\s*'manager\\.invited'"
    - from: "apps/web/src/app/(owner)/actions/team-permissions.ts"
      to: "sendManagerInvitation"
      via: "named import from '@/lib/email/send-manager-invitation' + replaces sendDriverInvitation call at the team-invite site (~line 178)"
      pattern: "sendManagerInvitation\\("
    - from: "apps/web/prisma/seeds/notification-template-data/user.ts"
      to: "NotificationTemplate row in DB"
      via: "npm run seed:notifications (idempotent upsert from seed-notifications.ts)"
      pattern: "triggerKey:\\s*'manager\\.invited'"
---

<objective>
Add a dedicated `manager.invited` notification trigger so team-permission invites (managers) flow through their own template and notification record, separate from `driver.invited`. Driver invitations remain untouched.

Purpose: Today, `inviteTeamMember()` (team-permissions.ts:178) reuses `sendDriverInvitation`, which dispatches the `driver.invited` trigger. Managers receive driver-flavored copy and a `driverEmail`-keyed payload — wrong audience labeling and noisy analytics. A dedicated trigger fixes copy, recipient typing, and per-trigger tenant preferences.

Output:
- `manager.invited` added to TriggerKey + NotificationPayload (typed)
- One new seed entry under `userTemplates` (NotificationCategory.USER) with manager-specific copy
- New wrapper `sendManagerInvitation` mirroring the structure of `sendDriverInvitation`
- `inviteTeamMember()` rewired to the new wrapper (import + single call site)
- Seed run + tsc pass + DB verification
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Core notification system types — must extend, not rewrite
@apps/web/src/lib/notifications/types.ts

# Mirror this file's structure exactly for sendManagerInvitation
@apps/web/src/lib/email/send-driver-invitation.ts

# Seed file convention: one file per category, USER category lives here
@apps/web/prisma/seeds/notification-template-data/user.ts

# The single call site we are rewiring (line ~178)
@apps/web/src/app/(owner)/actions/team-permissions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add manager.invited to TriggerKey union + NotificationPayload</name>
  <files>apps/web/src/lib/notifications/types.ts</files>
  <action>
Edit `apps/web/src/lib/notifications/types.ts` to register the new trigger:

1. In the `TriggerKey` union, add a new line after the existing Driver section (after `| 'driver.incident_reported'`). Group it as a new single-entry section labeled Manager so the file stays organized:

```
  // Manager (1)
  | 'manager.invited'
```

2. In the `NotificationPayload` mapped type, add the corresponding payload shape. Place it directly after the four `driver.*` entries (after the `'driver.incident_reported'` line) so adjacent code maps to adjacent types:

```
  'manager.invited': { managerEmail: string; firstName: string; tenantName: string; inviteUrl: string };
```

All four fields are `string` (matches the audit's documented payload contract and the `external_email` recipient rule used in the seed). Do NOT touch any other entry. Do NOT use `any`. Do NOT reorder existing entries.

Why these field names exactly: the seed in Task 2 declares `availableVariables` of `managerEmail`, `firstName`, `tenantName`, `inviteUrl`, and `defaultRecipients: [{ type: 'external_email', payloadKey: 'managerEmail' }]`. The wrapper in Task 2 passes a payload with those exact keys. Drift here = runtime template variable substitution failures.
  </action>
  <verify>
Run from repo root: `cd apps/web && npx tsc --noEmit` — must pass.
Grep confirms both additions:
```
node C:/Users/sammy/.claude/get-shit-done/bin/gsd-tools.js  # not needed; use Grep tool for:
#   pattern: "manager\\.invited"  in apps/web/src/lib/notifications/types.ts
# expected: 2 hits (TriggerKey union + NotificationPayload key)
```
  </verify>
  <done>
- `TriggerKey` union contains `'manager.invited'` (1 hit)
- `NotificationPayload` contains the `'manager.invited':` mapped entry with exactly `managerEmail`, `firstName`, `tenantName`, `inviteUrl` as `string` fields
- `tsc --noEmit` from `apps/web` exits 0
- No other lines in the file modified
  </done>
</task>

<task type="auto">
  <name>Task 2: Add manager.invited seed entry + create send-manager-invitation.ts wrapper</name>
  <files>
apps/web/prisma/seeds/notification-template-data/user.ts
apps/web/src/lib/email/send-manager-invitation.ts
  </files>
  <action>
**Part A — Seed entry (existing file edit):**

Open `apps/web/prisma/seeds/notification-template-data/user.ts` and append a new object to the `userTemplates: NotificationTemplateSeed[]` array (after the `user.role_changed` entry, before the closing `];`). Follow the audit's exact copy and the established file style (matches `user.invited` shape).

```ts
{
  triggerKey: 'manager.invited',
  category: NotificationCategory.USER,
  displayName: 'Manager Invited',
  description: 'Sent to a newly invited team member (manager) with their accept-invitation link.',
  defaultSubject: "You've been invited to join {{tenantName}} on DriveCommand",
  defaultBlockJson: buildDefaultTemplate({
    headerText: 'Team member invitation',
    paragraphTextWithVars:
      'Hi {{firstName}}, you have been invited to join {{tenantName}} as a team member on DriveCommand. Click below to accept your invitation and set up your account.',
    ctaLabel: 'Accept Invitation',
    ctaUrl: '{{inviteUrl}}',
    footerNote: 'If you did not expect this invitation, you can ignore this email.',
  }),
  availableVariables: [
    { name: 'managerEmail', description: 'Email address the invite was sent to', sampleValue: 'manager@example.com' },
    { name: 'firstName', description: "The invitee's first name", sampleValue: 'Sammy' },
    { name: 'tenantName', description: 'Name of the company on DriveCommand', sampleValue: 'Acme Trucking' },
    { name: 'inviteUrl', description: 'URL to accept the invitation', sampleValue: 'https://app.drivecommand.com/accept-invitation?token=abc123' },
  ],
  defaultRecipients: [{ type: 'external_email', payloadKey: 'managerEmail' }],
  isActive: true,
  inAppEnabled: false,
},
```

DO NOT create a separate `manager.ts` file. Per audit: codebase convention is to add to an existing category file when no dedicated category enum exists, and there is no `MANAGER` value in `NotificationCategory`. Adding to `user.ts` means `seed-notifications.ts` requires zero import changes — the `userTemplates` array is already wired in.

Apostrophe handling in the subject: use the double-quoted form shown above (`"You've been invited..."`) so the apostrophe in "You've" doesn't break the string. Match `user.invited` style — it does the same thing.

**Part B — Wrapper file (new file):**

Create `apps/web/src/lib/email/send-manager-invitation.ts`. Mirror `send-driver-invitation.ts` exactly (same wrapper pattern, same legacy fallback shape, same JSDoc header). The only differences are: function name, type name, the dispatcher trigger key/payload, and the `relatedEntity.type` label.

```ts
/**
 * WRAPPER (quick-352): Mirrors send-driver-invitation.ts but routes through the
 * dedicated `manager.invited` trigger so team-permission invites get their own
 * template + audit log rather than reusing `driver.invited`.
 * Legacy Gmail SMTP path is preserved as the fallback inside the try/catch.
 */

import { sendEmail } from './gmail-client';
import { DriverInvitationEmail } from '@/emails/driver-invitation';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface ManagerInvitationEmailData {
  firstName: string;
  lastName: string;
  organizationName: string;
  acceptUrl: string;
  expiresAt: string;
  /** Tenant the email is being sent on behalf of — drives template lookup and audit log. */
  tenantId: string;
}

/**
 * Send a team-member (manager) invitation email.
 * Routes through dispatchNotification('manager.invited'). Falls back to legacy Gmail SMTP
 * only when the dispatcher itself throws.
 */
export async function sendManagerInvitation(
  toEmail: string,
  data: ManagerInvitationEmailData
): Promise<{ id: string }> {
  try {
    const result = await dispatchNotification('manager.invited', {
      tenantId: data.tenantId,
      payload: {
        managerEmail: toEmail,
        firstName: data.firstName,
        tenantName: data.organizationName,
        inviteUrl: data.acceptUrl,
      },
      relatedEntity: { type: 'DriverInvitation', id: toEmail },
    });
    return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
  } catch (err) {
    console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
    return legacySendManagerInvitation(toEmail, data);
  }
}

/** Legacy implementation — preserved as fallback. Reuses DriverInvitationEmail react template
 *  to avoid introducing a new email component in this quick task; copy is generic enough. */
async function legacySendManagerInvitation(
  toEmail: string,
  data: ManagerInvitationEmailData
): Promise<{ id: string }> {
  const subject = `You're invited to join ${data.organizationName} on DriveCommand`;

  return sendEmail({
    to: toEmail,
    subject,
    react: DriverInvitationEmail(data),
  });
}
```

Notes & why:
- `relatedEntity.type` stays `'DriverInvitation'` because the underlying Prisma model storing the pending invite row is still `DriverInvitation` (audit constraint: do NOT modify the schema). Only the trigger + email copy diverge.
- Legacy fallback reuses `DriverInvitationEmail` react component intentionally — adding a new react email component is out of scope and the rendered HTML is acceptable for the SMTP fallback path. Future polish can swap it in.
- Subject string in the legacy path is identical to the driver legacy path per the audit instructions.
- Do NOT add a `firstName` default; callers always pass it (verified — team-permissions.ts:178 passes `firstName`).
- No `any` types. No `// @ts-ignore`. No `eslint-disable`.

Do NOT touch `send-driver-invitation.ts`. Do NOT update `seed-notifications.ts` (the `userTemplates` import is already there).
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — must pass (validates payload typing matches Task 1 + new wrapper compiles).
2. Grep `apps/web/prisma/seeds/notification-template-data/user.ts` for `manager.invited` — must return 1 hit (the triggerKey line).
3. Grep `apps/web/src/lib/email/send-manager-invitation.ts` for `dispatchNotification\\('manager\\.invited'` — must return 1 hit.
4. Confirm `send-driver-invitation.ts` is byte-identical to before this task (no accidental edits).
  </verify>
  <done>
- `userTemplates` array has 5 entries (was 4); the 5th is `manager.invited` with category `USER` and `defaultRecipients` `[{ type: 'external_email', payloadKey: 'managerEmail' }]`
- `apps/web/src/lib/email/send-manager-invitation.ts` exists, exports `sendManagerInvitation` and `ManagerInvitationEmailData`, and dispatches `'manager.invited'` with the exact payload keys declared in Task 1
- `tsc --noEmit` from `apps/web` exits 0
- `send-driver-invitation.ts` unchanged
  </done>
</task>

<task type="auto">
  <name>Task 3: Rewire inviteTeamMember(), run seed, and verify DB row</name>
  <files>apps/web/src/app/(owner)/actions/team-permissions.ts</files>
  <action>
**Part A — Swap import + call site:**

In `apps/web/src/app/(owner)/actions/team-permissions.ts`:

1. Line 14 (the existing import line):
   - BEFORE: `import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';`
   - AFTER:  `import { sendManagerInvitation } from '@/lib/email/send-manager-invitation';`

2. Line ~178 (the call site inside `inviteTeamMember()`):
   - BEFORE: `await sendDriverInvitation(email, { tenantId, firstName, lastName, organizationName, acceptUrl, expiresAt })`
   - AFTER:  `await sendManagerInvitation(email, { tenantId, firstName, lastName, organizationName, acceptUrl, expiresAt })`

The argument shape is byte-identical because `ManagerInvitationEmailData` has the same field set as `DriverInvitationEmailData`. Do NOT change argument order, field names, or any surrounding logic (validation, DriverInvitation row creation, role assignment). Do NOT touch `inviteDriver()` if it lives in the same file — confirm by grepping for `sendDriverInvitation\(` in this file after editing; it must return 0 hits (this file should no longer reference the driver wrapper).

If `sendDriverInvitation` is still referenced elsewhere in the repo after this change, leave those usages alone — only the team-permissions site is in scope.

**Part B — Run the seed:**

```powershell
cd apps/web; npm run seed:notifications
```

The seed is idempotent (upsert), so re-runs are safe. Expect a log line indicating the new template was created or upserted.

**Part C — Verify in DB:**

Use the Supabase MCP `execute_sql` tool against the project DB to confirm the row exists. Run:

```sql
SELECT "triggerKey", "category", "displayName", "isActive", "inAppEnabled"
FROM "NotificationTemplate"
WHERE "triggerKey" = 'manager.invited';
```

Expected: at least one row with `category = 'USER'`, `displayName = 'Manager Invited'`, `isActive = true`, `inAppEnabled = false`. (If the project uses tenant-scoped template rows, expect one row per tenant that has been seeded — that is normal and acceptable; the seed handles fan-out.)

**Part D — Final typecheck:**

```powershell
cd apps/web; npx tsc --noEmit
```

Must exit 0.
  </action>
  <verify>
1. `apps/web/src/app/(owner)/actions/team-permissions.ts`:
   - Grep `sendDriverInvitation` → 0 hits.
   - Grep `sendManagerInvitation` → 2 hits (import + call site).
2. `npm run seed:notifications` exits 0 with no errors and at least one log line referencing `manager.invited`.
3. Supabase SQL returns ≥1 row for `triggerKey = 'manager.invited'` with the expected column values.
4. `npx tsc --noEmit` from `apps/web` exits 0.
5. Manual sanity: grep the whole `apps/web/src/app/(owner)/actions/` directory for `sendDriverInvitation\(` — should still return ≥1 hit (the `inviteDriver()` action still uses it) UNLESS the only consumer in the file was the team-permissions site, in which case adjacent driver-invite actions live elsewhere; that is fine. The point is `team-permissions.ts` no longer references it.
  </verify>
  <done>
- `inviteTeamMember()` calls `sendManagerInvitation(...)` (not `sendDriverInvitation(...)`)
- `team-permissions.ts` no longer imports `sendDriverInvitation`
- Seed ran successfully; DB query returns ≥1 `manager.invited` row with `displayName='Manager Invited'`, `category='USER'`, `isActive=true`, `inAppEnabled=false`
- `tsc --noEmit` passes
- Driver invitation flow (`inviteDriver()`, `send-driver-invitation.ts`, `DriverInvitationEmail`, `driver.invited` seed entry) is unchanged
  </done>
</task>

</tasks>

<verification>
End-to-end check after all 3 tasks complete:

1. **Types compile end-to-end:** `cd apps/web && npx tsc --noEmit` exits 0.
2. **Trigger registered:** Grep `apps/web/src/lib/notifications/types.ts` for `manager\.invited` → exactly 2 hits.
3. **Seed entry present:** Grep `apps/web/prisma/seeds/notification-template-data/user.ts` for `manager\.invited` → exactly 1 hit (the `triggerKey` line).
4. **Wrapper exists and dispatches correctly:** Grep `apps/web/src/lib/email/send-manager-invitation.ts` for `dispatchNotification\('manager\.invited'` → exactly 1 hit.
5. **Call site rewired:** Grep `apps/web/src/app/(owner)/actions/team-permissions.ts` for `sendManagerInvitation` → 2 hits; `sendDriverInvitation` → 0 hits.
6. **DB row exists:** Supabase `SELECT ... FROM NotificationTemplate WHERE triggerKey = 'manager.invited'` returns ≥1 row with expected column values.
7. **Driver path untouched:** `git diff` shows zero changes to `send-driver-invitation.ts`, `DriverInvitationEmail` component, `accept-invitation` page/route/POST handler, and `DriverInvitation` Prisma model. Only the seed file for `user.ts` gained a new entry; the existing `user.invited` and other entries are byte-identical.
</verification>

<success_criteria>
- All 3 tasks' `done` blocks satisfied.
- `tsc --noEmit` clean from `apps/web`.
- DB confirms `manager.invited` NotificationTemplate row exists with USER category, active=true, inAppEnabled=false.
- A real call to `inviteTeamMember()` in the team-permissions UI would now go through `dispatchNotification('manager.invited', ...)` (not `driver.invited`). (Verifiable via dispatcher logs on next manual smoke test — not required for plan completion.)
- Driver invitation flow is provably unmodified (git diff scoped only to the 4 files listed in `files_modified`).
</success_criteria>

<output>
After completion, create `.planning/quick/352-add-manager-invited-notification-trigger/352-SUMMARY.md` covering:
- Files changed (with line counts)
- New trigger key + payload shape registered
- Seed file the template was added to (user.ts) and why (no MANAGER category enum exists)
- Confirmation that driver path is untouched
- DB verification query + result
- tsc result
</output>
