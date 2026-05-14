---
phase: quick-321
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/types.ts
  - apps/web/src/lib/notifications/recipient-resolver.ts
  - apps/web/src/lib/notifications/dispatcher.ts
  - apps/web/prisma/seeds/notification-template-data/driver.ts
  - apps/web/prisma/seeds/notification-template-data/user.ts
  - apps/web/src/lib/notifications/__tests__/recipient-resolver.test.ts
autonomous: true

must_haves:
  truths:
    - "Driver invitation to an email with no existing User row succeeds end-to-end (dispatcher does not throw the UUID parse error)"
    - "Owner invitation (user.invited) to an email with no existing User row succeeds end-to-end"
    - "When the invited email matches an existing User row in the same tenant, that user's notification preferences are honored"
    - "NotificationSendLog records a row with channel=EMAIL, status=SENT, recipientEmail set, recipientUserId null when the recipient has no User row"
    - "InAppNotification write is skipped (not attempted) when the resolved recipient has no userId"
    - "tsc --noEmit is clean; vitest passes; next build succeeds"
  artifacts:
    - path: "apps/web/src/lib/notifications/types.ts"
      provides: "DefaultRecipientRule union now includes external_email rule type"
      contains: "external_email"
    - path: "apps/web/src/lib/notifications/recipient-resolver.ts"
      provides: "Resolver handles external_email rule; returns ResolvedRecipient with userId null when recipient is an external email"
      contains: "external_email"
    - path: "apps/web/src/lib/notifications/dispatcher.ts"
      provides: "Per-recipient fan-out handles userId-null recipients: skips InAppNotification, still writes audit log with recipientEmail"
      contains: "userId"
    - path: "apps/web/prisma/seeds/notification-template-data/driver.ts"
      provides: "driver.invited template uses external_email rule against driverEmail payload key"
      contains: "external_email"
    - path: "apps/web/prisma/seeds/notification-template-data/user.ts"
      provides: "user.invited template uses external_email rule against invitedEmail payload key"
      contains: "external_email"
    - path: "apps/web/src/lib/notifications/__tests__/recipient-resolver.test.ts"
      provides: "Unit tests covering external_email rule type (3 scenarios minimum)"
      contains: "external_email"
  key_links:
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/recipient-resolver.ts"
      via: "resolveRecipients() return shape now includes userId: string | null"
      pattern: "r\\.userId"
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/in-app-writer.ts"
      via: "writeInAppNotification only called when r.userId != null AND r.inAppEnabled"
      pattern: "r\\.userId"
    - from: "apps/web/prisma/seeds/notification-template-data/driver.ts"
      to: "apps/web/src/lib/notifications/recipient-resolver.ts"
      via: "defaultRecipients [{ type: 'external_email', payloadKey: 'driverEmail' }] handled by new resolver branch"
      pattern: "external_email"
---

<objective>
Fix the UUID parse crash on driver/owner invitation notifications by introducing a new `external_email` recipient rule type that accepts a raw email from the payload (no User row required), then update the `driver.invited` and `user.invited` seed templates to use it.

Purpose: Quick-320 made the dispatcher path mandatory for invitations, but the invitation templates use `{ type: 'related', payloadKey: 'driverEmail' }` (or `invitedEmail`). The `related` rule treats the payload value as a `userId` and runs `prisma.user.findFirst({ where: { id: <value> } })`. When the value is an email string ("sammy.issa21+phase41final@gmail.com"), Postgres rejects it because the column is `uuid`. Invitations are sent BEFORE the User row exists, so a `userId` lookup is fundamentally wrong for this flow.

Output:
- New `external_email` rule type in the `DefaultRecipientRule` union
- Resolver branch that returns a synthetic recipient (`userId: null`, `email: <payload value>`, prefs default to true since no UserNotificationPreference can exist)
- Dispatcher safely handles `userId: null` recipients (skip InAppNotification write, still write audit log with recipientEmail set)
- Seed templates updated for `driver.invited` and `user.invited`
- Re-seed runs cleanly (idempotent upsert handles existing rows)
- Three unit tests validating the new path

Diagnosis already completed (read-only investigation summarized in task 1 below). Code-change tasks 2-4 implement the fix.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Quick-320 just shipped — it made tenantId required on dispatcher wrappers, which exposed the resolver UUID bug
@C:/Users/sammy/Projects/DriveCommand/apps/web/src/lib/email/send-driver-invitation.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/src/lib/email/send-owner-invitation.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/src/lib/notifications/recipient-resolver.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/src/lib/notifications/dispatcher.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/src/lib/notifications/types.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/src/lib/notifications/in-app-writer.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/src/lib/notifications/audit-log.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/prisma/seeds/notification-template-data/driver.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/prisma/seeds/notification-template-data/user.ts
@C:/Users/sammy/Projects/DriveCommand/apps/web/prisma/seeds/seed-notifications.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnosis Confirmation (read-only, no code changes)</name>
  <files>(read-only)</files>
  <action>
Confirm the diagnosis is accurate before any code change. Re-read the four key files and verify the bug surface, then run one Supabase MCP query to confirm the production NotificationTemplate row matches the seed.

Steps:
1. Open `apps/web/src/lib/notifications/recipient-resolver.ts` lines 71-87. Confirm: the `related` rule branch calls `prisma.user.findFirst({ where: { id: userId, tenantId, isActive: true, email: { not: undefined } } })` where `userId = payload[rule.payloadKey]`. This is the failing query — `id` is a uuid column but on invitations the payload value is an email string.

2. Open `apps/web/src/lib/notifications/types.ts` lines 99-102. Confirm the `DefaultRecipientRule` union is exactly:
   ```
   { type: 'role'; role: 'OWNER' | 'MANAGER' | 'DRIVER' }
   | { type: 'tenant_owners' }
   | { type: 'related'; payloadKey: string }
   ```
   No `external_email` rule exists yet.

3. Open `apps/web/prisma/seeds/notification-template-data/driver.ts` line 26 and `apps/web/prisma/seeds/notification-template-data/user.ts` line 49. Confirm both invitation templates use:
   - `driver.invited`: `defaultRecipients: [{ type: 'related', payloadKey: 'driverEmail' }]`
   - `user.invited`:   `defaultRecipients: [{ type: 'related', payloadKey: 'invitedEmail' }]`

4. Open `apps/web/src/lib/email/send-driver-invitation.ts` lines 32-41 and `apps/web/src/lib/email/send-owner-invitation.ts` lines 32-41. Confirm both wrappers pass the email as the payload value for the same key the seed references (`driverEmail` / `invitedEmail`). The wrappers are correct; the bug is in resolver + seed shape.

5. Open `apps/web/src/lib/notifications/dispatcher.ts` lines 135-274. Confirm:
   - Line 211 hard-references `r.userId` for the email-disabled-by-pref idempotency key
   - Line 222 hard-references `r.userId` for the in-app idempotency key
   - Line 225 passes `userId: r.userId` to `writeInAppNotification` (which calls `prisma.inAppNotification.create({ data: { ...userId: args.userId } })` — userId is a non-null FK to User in the schema)
   - Per-recipient catch on line 275 catches `perRecipientErr` so a single failure does NOT abort the loop, but the resolver throws BEFORE the loop, hitting the outer catch on line 285 — that's the "dispatch failed before fan-out" log seen in production.

6. Confirm `NotificationSendLog.recipientUserId` is `String? @db.Uuid` (nullable) in `apps/web/prisma/schema.prisma` line 3015 — yes, audit log already supports a null userId.

7. Confirm `InAppNotification.userId` is NOT nullable. From schema: `prisma.inAppNotification.create({ data: { userId: args.userId } })` would fail if userId were null. Therefore the dispatcher must skip the in-app branch entirely when `r.userId == null`.

8. Use Supabase MCP `execute_sql` against the production project (DriveCommand) to verify the live template row matches the seed. Run exactly:
   ```sql
   SELECT "triggerKey", "defaultRecipients"
   FROM "NotificationTemplate"
   WHERE "triggerKey" IN ('driver.invited', 'user.invited');
   ```
   Confirm `defaultRecipients` is the JSON `[{ "type": "related", "payloadKey": "driverEmail" }]` / `[{ "type": "related", "payloadKey": "invitedEmail" }]`. Record the output verbatim in the task verify section.

Verdict to record at end of this task: **Case A + Case C combined** — the resolver has no rule type for external emails AND the seed uses the wrong rule type. Fix is to add a new rule type + update both seeds + re-seed prod.

DO NOT modify any file in this task. Investigation only.
  </action>
  <verify>
Diagnosis confirmed when:
- All five code locations above match the description (re-read confirms behavior)
- Supabase MCP SQL output shows `defaultRecipients` JSON for both rows matches the seed
- Verdict recorded: Case A + C (resolver missing rule type + seed shape wrong)
  </verify>
  <done>Bug surface fully mapped; ready to implement fix in tasks 2-4. No source files touched.</done>
</task>

<task type="auto">
  <name>Task 2: Add `external_email` rule type to the resolver + dispatcher</name>
  <files>
apps/web/src/lib/notifications/types.ts
apps/web/src/lib/notifications/recipient-resolver.ts
apps/web/src/lib/notifications/dispatcher.ts
  </files>
  <action>
Introduce a new `external_email` rule type that accepts a raw email from the payload (no User lookup, no FK assumption), and make the dispatcher safe for recipients without a User row.

**Step 2a — `apps/web/src/lib/notifications/types.ts`:**

Extend the `DefaultRecipientRule` union (currently 3 variants, becomes 4):

```typescript
export type DefaultRecipientRule =
  | { type: 'role'; role: 'OWNER' | 'MANAGER' | 'DRIVER' }
  | { type: 'tenant_owners' }
  | { type: 'related'; payloadKey: string }
  | { type: 'external_email'; payloadKey: string };
```

Add a JSDoc comment above the union explaining each variant. For `external_email` specifically:
> "Used for triggers where the recipient is identified by a raw email in the payload and may not yet have a User row in this tenant (e.g. driver.invited, user.invited). The payload value at payloadKey MUST be a valid email string. If a User row with this email exists in the tenant, that user's prefs are loaded; otherwise the recipient is treated as email-only (no in-app, defaults of emailEnabled=true)."

**Step 2b — `apps/web/src/lib/notifications/recipient-resolver.ts`:**

Change the exported type `ResolvedRecipient` so `userId` is nullable:

```typescript
export type ResolvedRecipient = {
  userId: string | null;
  email: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};
```

Refactor the resolver to handle the new rule type. The existing `userMap: Map<string, { email: string }>` is keyed by userId — keep it for the existing rule types, but introduce a second map `emailOnlyMap: Map<string, { email: string }>` keyed by lowercased email for the email-only path. This keeps de-duplication correct:

- Add a new branch in the `for (const rule of defaultRecipients)` loop:
  ```typescript
  } else if (rule.type === 'external_email') {
    const rawEmail = payload[rule.payloadKey];
    if (!rawEmail || typeof rawEmail !== 'string') continue;
    const email = rawEmail.trim().toLowerCase();
    // Basic shape check — skip values that look like UUIDs or are obviously not emails
    if (!email.includes('@') || email.includes(' ')) continue;

    // Try to find an existing user with this email in the same tenant; if found,
    // promote into userMap so prefs are honored. If not found, add to emailOnlyMap.
    const existing = await prisma.user.findFirst({
      where: { tenantId, email, isActive: true },
      select: { id: true, email: true },
    });
    if (existing?.email) {
      userMap.set(existing.id, { email: existing.email });
    } else {
      emailOnlyMap.set(email, { email });
    }
  }
  ```

- After step 4 (loading prefs for userIds), build the result array as before for `userMap`, then append email-only recipients:
  ```typescript
  for (const [, { email }] of emailOnlyMap) {
    result.push({
      userId: null,
      email,
      emailEnabled: true,   // no preference row can exist; default to allow
      inAppEnabled: false,  // in-app is impossible without a User row
    });
  }
  ```

  Note `inAppEnabled: false` — this is correct because (a) InAppNotification.userId is a non-null FK, (b) the seed for `driver.invited` already has `inAppEnabled: false` at the template level. Explicitly false here is defensive belt-and-suspenders.

**Step 2c — `apps/web/src/lib/notifications/dispatcher.ts`:**

The dispatcher today hard-references `r.userId` as a non-null string in four places. Make all of them safe for `r.userId === null`:

- Replace `r.userId` in the idempotency key construction (lines 141-146 and 222-223) with a helper: when `r.userId` is null, use `email:${r.email}` as the per-recipient discriminator inside `buildIdempotencyKey`. Look at `buildIdempotencyKey` in `apps/web/src/lib/notifications/idempotency.ts` — if its signature is `(triggerKey, relatedEntity, userId: string, ...)`, change it to `userId: string | null` and inside the function use `userId ?? email` when computing the key. (Read the file first; you may need to also pass `email` as a new parameter.)

  Concrete change in dispatcher.ts:
  ```typescript
  const idemKey = buildIdempotencyKey(
    triggerKey,
    options.relatedEntity,
    r.userId,   // now string | null
    false,
    r.email,    // new param used as fallback when userId is null
  );
  ```

  And in idempotency.ts (read it first to confirm the exact current signature):
  ```typescript
  export function buildIdempotencyKey(
    triggerKey: string,
    relatedEntity: { type: string; id: string } | undefined,
    userId: string | null,
    isInApp: boolean,
    emailFallback?: string,
  ): string {
    const recipient = userId ?? `email:${emailFallback ?? 'unknown'}`;
    // ... existing logic but using `recipient` in place of `userId`
  }
  ```

  Apply the same pattern at line 211 (`pref-off:...:${r.userId}:...`) and line 269 (`pref-off-inapp:...`) — fall back to `email:${r.email}` when r.userId is null. Just inline the fallback for these two skip-pref idempotency keys; no need to route through the helper for the skip paths.

- Wrap the in-app branch (lines 221-274) so it is entirely skipped when `r.userId === null`:
  ```typescript
  if (r.userId !== null && r.inAppEnabled) {
    // existing in-app send logic — writeInAppNotification with userId: r.userId
  } else if (r.userId === null) {
    // External email recipient: no User row, no InAppNotification possible. Audit and continue.
    audits.push({
      tenantId: options.tenantId,
      triggerKey,
      recipientUserId: null,
      recipientEmail: r.email,
      channel: 'IN_APP',
      subject: subjectFinal,
      status: 'SKIPPED_DISABLED',
      idempotencyKey: `no-userid-inapp:${triggerKey}:${r.email}:${Date.now()}`,
      relatedEntityType: options.relatedEntity?.type ?? null,
      relatedEntityId: options.relatedEntity?.id ?? null,
      errorMessage: 'Recipient has no User row; in-app channel not applicable',
    });
    skipped++;
  } else {
    // userId present but inAppEnabled false (existing user-pref-off branch)
    // ... unchanged existing skip-user-pref logic
  }
  ```

  Take care: the audit log entry for the email branch (lines 154, 175, 188) already uses `recipientUserId: r.userId` — the type is `string | null | undefined` in AuditLogEntry, so this works as-is. Verify `recipientUserId: r.userId ?? null` is what gets persisted. The schema has `recipientUserId String? @db.Uuid` so null is allowed.

- Per-recipient catch on line 275: change the `console.error('[notifications] recipient dispatch failed', r.userId, perRecipientErr)` to log `r.userId ?? r.email` so the log is still useful for external email recipients.

  Also: today the per-recipient catch only logs and increments `failed++` but does NOT push an audit row. That's pre-existing behavior — do NOT change it in this task. (Leave a `// TODO(quick-321): consider audit row on per-recipient catch` comment so a future task can address it.)

Constraints:
- Do NOT remove or change behavior of the `role`, `tenant_owners`, or `related` rule types. Those still work for existing-user triggers like load.assigned, hos_violation, etc.
- Do NOT change `InAppNotification.userId` to nullable in schema.prisma. The fix is to skip in-app for userId-null recipients, not to make the FK nullable.
- Do NOT change `NotificationSendLog` columns — `recipientUserId` is already nullable.

After the changes, run `npx tsc --noEmit` from `apps/web/` and fix any type errors.
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` exits 0
- Grep `external_email` in the three files — should appear in types.ts (union variant), recipient-resolver.ts (rule branch), and zero times in dispatcher.ts (dispatcher does not need to know the rule type by name — it only sees `userId: null` recipients)
- Grep `r.userId` in dispatcher.ts — every hit must be inside a null-safe context (either `r.userId !== null` check, or `r.userId ?? email` fallback, or persisted to a nullable audit column)
- Open `recipient-resolver.ts` and confirm `ResolvedRecipient.userId` is `string | null`
- Open `idempotency.ts` and confirm `buildIdempotencyKey` accepts `userId: string | null` plus the new optional email fallback param
  </verify>
  <done>
- DefaultRecipientRule union has 4 variants including `external_email`
- ResolvedRecipient.userId is nullable
- Resolver returns email-only recipients with userId=null when external_email rule matches a non-existing email
- Resolver promotes external_email to a full User-backed recipient when the email matches an existing user in the tenant
- Dispatcher per-recipient loop is safe for userId=null: skips in-app channel, writes audit row with recipientEmail and null recipientUserId, idempotency keys use email fallback
- tsc clean
  </done>
</task>

<task type="auto">
  <name>Task 3: Update `driver.invited` + `user.invited` seed templates and re-seed production</name>
  <files>
apps/web/prisma/seeds/notification-template-data/driver.ts
apps/web/prisma/seeds/notification-template-data/user.ts
  </files>
  <action>
Update the two invitation seeds to use the new `external_email` rule type, then re-seed locally and against production.

**Step 3a — `apps/web/prisma/seeds/notification-template-data/driver.ts`:**

Change line 26 from:
```typescript
defaultRecipients: [{ type: 'related', payloadKey: 'driverEmail' }],
```
to:
```typescript
defaultRecipients: [{ type: 'external_email', payloadKey: 'driverEmail' }],
```

Leave the other 3 driver templates (`driver.hos_violation`, `driver.license_expiring`, `driver.incident_reported`) untouched — those are correctly addressed to existing tenant OWNER/MANAGER users.

**Step 3b — `apps/web/prisma/seeds/notification-template-data/user.ts`:**

Change line 49 (the `user.invited` template) from:
```typescript
defaultRecipients: [{ type: 'related', payloadKey: 'invitedEmail' }],
```
to:
```typescript
defaultRecipients: [{ type: 'external_email', payloadKey: 'invitedEmail' }],
```

Leave the other 3 user templates (`user.welcome`, `user.password_reset`, `user.role_changed`) untouched — those are sent to existing users after the account exists, and the payload carries `userId`, so the `related` rule is correct. (Double-check by re-reading the file: those three should all have `payloadKey: 'userId'`, not an email key.)

**Step 3c — Re-seed locally:**

From the repo root:
```
cd apps/web && npm run seed:notifications
```

The seeder is idempotent (`prisma.notificationTemplate.update` on existing rows). It will rewrite `defaultRecipients` for the two changed templates. Confirm the output shows:
- "Validation: passed"
- "Updated: 35" (or "Updated: 2, Inserted: 33" depending on whether you have a fresh local DB)
- No errors

**Step 3d — Re-seed production via Supabase MCP:**

The CLI seed runner targets whatever DB the local `.env.local` points to. To update production safely, use Supabase MCP `execute_sql` to apply the JSON change directly to the production NotificationTemplate rows (the seeder is just an `UPDATE` under the hood; this avoids needing to point the local seed at production).

Run these two MCP `execute_sql` statements against the DriveCommand project, in order:

```sql
UPDATE "NotificationTemplate"
SET "defaultRecipients" = '[{"type":"external_email","payloadKey":"driverEmail"}]'::jsonb,
    "updatedAt" = NOW()
WHERE "triggerKey" = 'driver.invited';
```

```sql
UPDATE "NotificationTemplate"
SET "defaultRecipients" = '[{"type":"external_email","payloadKey":"invitedEmail"}]'::jsonb,
    "updatedAt" = NOW()
WHERE "triggerKey" = 'user.invited';
```

Then verify with one more MCP `execute_sql`:
```sql
SELECT "triggerKey", "defaultRecipients"
FROM "NotificationTemplate"
WHERE "triggerKey" IN ('driver.invited', 'user.invited');
```

Both rows must show the new JSON shape. Record the verbatim output.

**Step 3e — Per-tenant settings check (NO backfill required):**

Confirm that the dispatcher reads `defaultRecipients` from the global `NotificationTemplate` row (dispatcher.ts line 111: `const defaultRules = (template.defaultRecipients as DefaultRecipientRule[]) ?? [];`) and NOT from `TenantNotificationSettings`. Per-tenant settings only carry `customBlockJson` and `customSubject` (visible in dispatcher.ts line 123). Therefore no per-tenant backfill migration is needed — updating the global template row immediately fixes every tenant.

Document this finding in the SUMMARY.

Constraints:
- Do NOT touch the 33 other templates
- Do NOT modify Plan 01 seed data structure (the `NotificationTemplateSeed` shape is unchanged — only the value of `defaultRecipients` differs)
- Do NOT add a SQL migration file — this is a JSON value update on existing rows, applied via the seed script and one-time MCP UPDATE; no schema change
  </action>
  <verify>
- `apps/web/prisma/seeds/notification-template-data/driver.ts` line 26 contains `external_email`
- `apps/web/prisma/seeds/notification-template-data/user.ts` line 49 contains `external_email`
- `cd apps/web && npm run seed:notifications` exits 0 with "Validation: passed"
- Production MCP SELECT returns the new JSON shape for both rows
- `cd apps/web && npx tsc --noEmit` still exits 0 (seed files are type-checked)
  </verify>
  <done>
- Both invitation seed templates use the external_email rule
- Local DB shows the new JSON shape
- Production DB shows the new JSON shape
- Per-tenant settings confirmed not to need a backfill
  </done>
</task>

<task type="auto">
  <name>Task 4: Unit tests for the external_email path + production verification</name>
  <files>
apps/web/src/lib/notifications/__tests__/recipient-resolver.test.ts
  </files>
  <action>
Add unit tests covering the new `external_email` rule type. Use vitest with mocked PrismaClient, matching the style of the existing `dispatcher.test.ts` (which already mocks `prisma.user.findFirst`, etc.).

**Step 4a — Create `apps/web/src/lib/notifications/__tests__/recipient-resolver.test.ts`:**

Three required test scenarios:

1. **External email with no existing User row → email-only recipient returned**
   - Mock `prisma.user.findFirst` to return null
   - Call `resolveRecipients(mockPrisma, 'tenant-1', 'driver.invited', [{ type: 'external_email', payloadKey: 'driverEmail' }], { driverEmail: 'newdriver@example.com' })`
   - Assert: returns array of length 1, with `userId: null`, `email: 'newdriver@example.com'`, `emailEnabled: true`, `inAppEnabled: false`
   - Assert: `prisma.userNotificationPreference.findMany` was NOT called (no userIds to look up)

2. **External email matching an EXISTING User row → user's preferences loaded**
   - Mock `prisma.user.findFirst` to return `{ id: 'user-uuid-123', email: 'existing@example.com' }`
   - Mock `prisma.notificationSubscription.findMany` to return `[]`
   - Mock `prisma.userNotificationPreference.findMany` to return `[{ userId: 'user-uuid-123', emailEnabled: true, inAppEnabled: false }]`
   - Call with `{ driverEmail: 'existing@example.com' }`
   - Assert: returns array of length 1 with `userId: 'user-uuid-123'`, `email: 'existing@example.com'`, `inAppEnabled: false` (from prefs)

3. **External email with empty/missing payload value → no recipients returned**
   - Mock `prisma.user.findFirst` to throw if called (it should not be called)
   - Call with `{}` payload (no driverEmail key)
   - Assert: returns empty array; user.findFirst was not invoked

4. **(Bonus, recommended) Email casing normalization**
   - Pass `{ driverEmail: 'Mixed.Case@Example.COM' }` with no existing user
   - Assert: returned recipient has `email: 'mixed.case@example.com'` (lowercased)

Use the same mock pattern as the existing `dispatcher.test.ts` — module-level `vi.mock('@/lib/db/prisma', ...)` plus a per-test `makeMockPrisma()` helper that returns minimal stubs for `user.findFirst`, `user.findMany`, `notificationSubscription.findMany`, `userNotificationPreference.findMany`.

Run:
```
cd apps/web && npx vitest run src/lib/notifications/__tests__/recipient-resolver.test.ts
```

All four tests must pass.

**Step 4b — Run the full test + typecheck + build:**

```
cd apps/web && npx vitest run
cd apps/web && npx tsc --noEmit
cd apps/web && npm run build
```

All three must succeed. The existing `dispatcher.test.ts` uses `ResolvedRecipient` indirectly via the dispatcher — confirm that broadening `userId` to `string | null` did not break any existing test assertion. If a dispatcher test references `r.userId` as a string, update the test fixture to use a real uuid (it likely already does — existing tests cover the User-backed path).

**Step 4c — Production manual verification (post-deploy):**

This is an `auto` task but includes a manual verification segment performed in the task verify section after the user deploys. Document the verification SQL and expected output here so the user can run it from any SQL client after deploy:

After `vercel --prod` succeeds, the user:
1. Goes to `/carrier/fleet/drivers` on production
2. Sends a new driver invitation using a fresh email like `sammy.issa21+quick321verify@gmail.com`
3. Runs this SQL via Supabase MCP within 2 minutes of the send:
   ```sql
   SELECT id, "triggerKey", "recipientEmail", "recipientUserId", channel, status, "errorMessage", "createdAt"
   FROM "NotificationSendLog"
   WHERE "createdAt" > NOW() - INTERVAL '5 minutes'
   ORDER BY "createdAt" DESC;
   ```
4. Expected result: at least one row with `triggerKey='driver.invited'`, `channel='EMAIL'`, `status='SENT'`, `recipientEmail='sammy.issa21+quick321verify@gmail.com'`, `recipientUserId=NULL`. There should also be one row with `channel='IN_APP'`, `status='SKIPPED_DISABLED'`, `errorMessage='Recipient has no User row; in-app channel not applicable'`.
5. Email arrives in the inbox.

Do NOT block this plan on post-deploy verification — the deploy and the verification are sequenced operations the user controls. Just record the steps in the SUMMARY so the user can run them after `vercel --prod`.

Constraints:
- Use vitest + vi.mock; do not require a real Prisma client or live DB connection
- Test file must be self-contained (no helper imports beyond vitest + the resolver under test)
- Test names must be descriptive and use it() / describe() blocks following the existing style
  </action>
  <verify>
- `cd apps/web && npx vitest run src/lib/notifications/__tests__/recipient-resolver.test.ts` shows 4 tests passed, 0 failed
- `cd apps/web && npx vitest run` overall test suite is green (no regressions in dispatcher.test.ts or elsewhere)
- `cd apps/web && npx tsc --noEmit` exits 0
- `cd apps/web && npm run build` exits 0
- (Post-deploy, performed by user after `vercel --prod`) New driver invitation produces a NotificationSendLog row with recipientUserId=NULL and status=SENT
  </verify>
  <done>
- New test file exists with 4 passing tests
- Existing test suite still green
- tsc + build clean
- Verification SQL and expected output recorded in SUMMARY so user can validate on production
  </done>
</task>

</tasks>

<verification>
End-to-end checks after all four tasks:
- `cd apps/web && npx tsc --noEmit` clean
- `cd apps/web && npx vitest run` green
- `cd apps/web && npm run build` green
- Local DB shows updated defaultRecipients JSON for driver.invited + user.invited
- Production DB shows updated defaultRecipients JSON for driver.invited + user.invited
- Post-deploy production smoke test: trigger driver invitation, confirm NotificationSendLog has a SENT EMAIL row with recipientUserId=NULL and the inbox receives the email
- No regression: an existing-user trigger (e.g., manually trigger a load.assigned via existing code path or by re-running an existing test) still resolves recipients correctly with non-null userId
</verification>

<success_criteria>
The fix is complete when:

1. `driver.invited` and `user.invited` notifications no longer throw `invalid input syntax for type uuid` in Vercel logs
2. The dispatcher's outer catch (`[notifications] dispatch failed before fan-out`) is no longer reached for these triggers
3. A driver invitation email arrives in the inbox when sent to a brand new email that has no User row
4. A driver invitation email arrives in the inbox when sent to an email that DOES match an existing tenant user (and that user's preferences are honored if they exist)
5. NotificationSendLog correctly records the EMAIL row with `recipientUserId=NULL` and `recipientEmail=<the address>` for external-email recipients
6. NotificationSendLog correctly records an IN_APP SKIPPED_DISABLED row (not a FAILED row) for external-email recipients
7. tsc, vitest, and `npm run build` are all green
8. No other notification triggers regress (`role`, `tenant_owners`, `related` rule types still work exactly as before)
</success_criteria>

<output>
After completion, create `.planning/quick/321-fix-dispatcher-recipient-resolver-uuid-c/321-SUMMARY.md` documenting:
- The confirmed root cause (Case A + C: missing rule type + wrong seed shape)
- The four files modified and the exact change in each
- The two production DB rows updated (with before/after JSON)
- Test counts (new + existing)
- Post-deploy verification SQL output (filled in after the user runs the production smoke test)
- Any follow-up tickets created (e.g. the TODO about adding an audit row in the per-recipient catch)
</output>
