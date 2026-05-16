---
phase: quick-344
plan: 344
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/notifications/types.ts
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  - apps/web/src/app/(owner)/actions/loads.ts
  - apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
autonomous: true

must_haves:
  truths:
    - "When a CarrierDriver has user_id NULL but email is set, assigning that driver to a load delivers an email to that driver's CarrierDriver.email address"
    - "The NotificationTemplate row for triggerKey='load.assigned' has defaultRecipients including an external_email rule with payloadKey='driverEmail'"
    - "createAssignment() in load-driver-assignments.ts includes driverEmail (from CarrierDriver.email, falling back to '') in the dispatchNotification payload"
    - "dispatchLoad() in loads.ts includes driverEmail in the load.assigned payload (legacy path; safe empty string since User.email already routes via 'related' rule)"
    - "NotificationPayload['load.assigned'] type in types.ts declares driverEmail: string"
    - "Existing behavior preserved when cd.email is null — empty string passes through and the resolver's external_email branch skips it via the @ shape check"
    - "npx tsc --noEmit from apps/web exits 0"
    - "npm run build from apps/web succeeds"
  artifacts:
    - path: "apps/web/src/lib/notifications/types.ts"
      provides: "load.assigned payload type with required driverEmail: string field"
      contains: "driverEmail: string"
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "createAssignment dispatch including driverEmail from CarrierDriver.email"
      contains: "driverEmail"
    - path: "apps/web/src/app/(owner)/actions/loads.ts"
      provides: "dispatchLoad payload including driverEmail field"
      contains: "driverEmail"
    - path: "NotificationTemplate (DB row, triggerKey=load.assigned)"
      provides: "defaultRecipients JSONB array with external_email rule for driverEmail"
      contains: '"type":"external_email"'
  key_links:
    - from: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      to: "apps/web/src/lib/notifications/recipient-resolver.ts (external_email branch)"
      via: "dispatchNotification payload.driverEmail -> resolver reads payload[rule.payloadKey] where payloadKey='driverEmail'"
      pattern: "driverEmail:\\s*driver\\.email"
    - from: "NotificationTemplate.defaultRecipients (load.assigned row)"
      to: "recipient-resolver external_email branch"
      via: "rule.payloadKey='driverEmail' matched against payload['driverEmail']"
      pattern: '"type":\\s*"external_email".*"payloadKey":\\s*"driverEmail"'
---

<objective>
Fix the load.assigned notification so drivers represented by CarrierDriver rows with `user_id IS NULL` still receive an email at their `CarrierDriver.email` address.

Purpose: Quick-342 fixed driver routing for User-linked CarrierDriver rows by using `cd.userId` for the `related` rule. But many CarrierDriver rows have no linked User; for those, `cd.userId ?? ''` produces an empty string, the resolver's `related` lookup finds no User, and only the OWNER role rule fires. The driver is silently dropped from the recipient list.

Output: An `external_email` recipient rule added to the load.assigned NotificationTemplate, the CarrierDriver email plumbed into the dispatch payload from both call sites (createAssignment + dispatchLoad), and the typed `NotificationPayload['load.assigned']` extended with `driverEmail`. The resolver itself is NOT modified — its external_email branch already handles this exact case (User-promote-or-emailOnly fallback).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/notifications/recipient-resolver.ts
@apps/web/src/lib/notifications/types.ts
@apps/web/src/lib/notifications/dispatcher.ts
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts
@apps/web/src/app/(owner)/actions/loads.ts
@apps/web/src/lib/notifications/__tests__/dispatcher.test.ts

Key facts confirmed during planning:

1. recipient-resolver.ts external_email branch (lines 91-110):
   - Reads `payload[rule.payloadKey]`
   - Shape check: `if (!email.includes('@') || email.includes(' ')) continue;` — empty string is rejected here (no '@'), so passing '' is safe and matches existing behavior.
   - Tries `prisma.user.findFirst({ where: { tenantId, email, isActive: true } })` — if a User exists in the tenant with that email, promotes into userMap (so prefs are honored).
   - Otherwise `emailOnlyMap.set(email, { email })`.
   - Step 5b appends emailOnly entries as `{ userId: null, email, emailEnabled: true, inAppEnabled: false }`.

2. types.ts line 60 declares: `'load.assigned': { loadId: string; loadNumber: string; driverId: string; driverName: string; originCity: string; destCity: string };` — adding `driverEmail: string` keeps the existing strict pattern (all fields required strings).

3. Dispatcher (dispatcher.ts line 122) spreads `options.payload as Record<string, string>` to resolver — no allow-list, no reject-on-unknown-keys. Extra payload fields are safe.

4. Two call sites of `dispatchNotification('load.assigned', ...)`:
   - `apps/web/src/app/(owner)/actions/load-driver-assignments.ts:289` — createAssignment (CarrierDriver-keyed)
   - `apps/web/src/app/(owner)/actions/loads.ts:455` — dispatchLoad (legacy Load.driverId = User FK)

5. One test in `dispatcher.test.ts:311-322` passes an inline `load.assigned` payload without `driverEmail`. Required to keep compile green.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Apply DB migration to load.assigned template + extend NotificationPayload type</name>
  <files>apps/web/src/lib/notifications/types.ts</files>
  <action>
Two coordinated changes:

A) DB update via Supabase MCP `execute_sql` (use claude.ai Supabase MCP, project for DriveCommand):

```sql
UPDATE "NotificationTemplate"
SET "defaultRecipients" = '[
  {"type":"related","payloadKey":"driverId"},
  {"type":"external_email","payloadKey":"driverEmail"},
  {"role":"OWNER","type":"role"}
]'::jsonb
WHERE "triggerKey" = 'load.assigned';
```

Verify with a follow-up SELECT:
```sql
SELECT "triggerKey", "defaultRecipients"
FROM "NotificationTemplate"
WHERE "triggerKey" = 'load.assigned';
```

Expected: one row with the jsonb array exactly as above (related driverId, external_email driverEmail, role OWNER — in that order).

B) Edit `apps/web/src/lib/notifications/types.ts`. In the `NotificationPayload` mapped type (around line 60), update the `'load.assigned'` entry to add `driverEmail: string` between `driverId` and `driverName`:

```ts
'load.assigned': { loadId: string; loadNumber: string; driverId: string; driverEmail: string; driverName: string; originCity: string; destCity: string };
```

Keep `string` (not `string | undefined`) to match the existing strict-required pattern for every other field. Empty string is the documented "no email" sentinel — the resolver's shape check filters it.

Do NOT change recipient-resolver.ts. Do NOT change the dispatcher. Do NOT change any other trigger row in the DB.
  </action>
  <verify>
- Supabase MCP SELECT returns the expected jsonb array (3 rules in order: related/driverId, external_email/driverEmail, role/OWNER).
- `npx tsc --noEmit` from `apps/web` reports type errors at the two call sites (load-driver-assignments.ts:289 and loads.ts:455) AND at dispatcher.test.ts:311 — this is the intended forcing function for tasks 2-4. Note the errors and proceed; they will be resolved by subsequent tasks.
  </verify>
  <done>
- NotificationTemplate row for `load.assigned` has the 3-rule defaultRecipients including the external_email rule for driverEmail.
- types.ts declares `driverEmail: string` on `NotificationPayload['load.assigned']`.
- TypeScript errors surface at the three known unfixed call sites (load-driver-assignments.ts, loads.ts, dispatcher.test.ts) — confirming the type is correctly propagating.
  </done>
</task>

<task type="auto">
  <name>Task 2: Plumb driverEmail through both call sites + update test payload</name>
  <files>apps/web/src/app/(owner)/actions/load-driver-assignments.ts, apps/web/src/app/(owner)/actions/loads.ts, apps/web/src/lib/notifications/__tests__/dispatcher.test.ts</files>
  <action>
Three coordinated edits — match existing payload formatting exactly (same indentation, trailing commas, surrounding comments preserved).

A) `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`:

A1) Extend the CarrierDriver prefetch select (around line 261-264) to include `email`:

```ts
defaultPrisma.carrierDriver.findUnique({
  where: { id: cd.id },
  select: { firstName: true, lastName: true, email: true },
}),
```

A2) Extend the dispatch payload (around line 289-298) to include `driverEmail: driver.email ?? ''` immediately after the `driverId` line, preserving the existing comment on `driverId`:

```ts
await dispatchNotification('load.assigned', {
  tenantId,
  payload: {
    loadId,
    loadNumber,
    driverId: cd.userId ?? '', // User id for recipient resolver; cd.id is the CarrierDriver row id
    driverEmail: driver.email ?? '', // quick-344: external_email rule for CarrierDrivers without a linked User
    driverName: `${driver.firstName} ${driver.lastName}`,
    originCity,
    destCity,
  },
  relatedEntity: { type: 'Load', id: loadId },
}).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
```

B) `apps/web/src/app/(owner)/actions/loads.ts`:

The legacy `dispatchLoad` path uses `prisma.user.findUnique` (User FK on Load.driverId). Driver email comes from the User row, which is already routed via the `related` rule. We just need to satisfy the new required type field. Two options — pick option B1 (safe empty string, no behavior change):

B1) Extend the User prefetch select around line 437-440 to include `email`, and pass it:

```ts
const [dispatchDriver] = await Promise.all([
  prisma.user.findUnique({
    where: { id: result.data.driverId },
    select: { firstName: true, lastName: true, email: true },
  }),
]).catch((err) => {
  console.error('[notifications] dispatchLoad notif prep failed', err);
  return [null] as const;
});
```

Then in the dispatchNotification call (around line 455-466), insert `driverEmail` after `driverId`:

```ts
dispatchNotification('load.assigned', {
  tenantId: tId,
  payload: {
    loadId: id,
    loadNumber: load.loadNumber,
    driverId: result.data.driverId,
    driverEmail: dispatchDriver?.email ?? '',
    driverName,
    originCity: load.origin,
    destCity: load.destination,
  },
  relatedEntity: { type: 'Load', id },
}).catch((err) => console.error('[notifications] load.assigned dispatch failed', err)),
```

Note: in the legacy path the same User is already discovered by the `related` rule via `driverId`, so the external_email rule will dedup (resolver's userMap by userId) — no double-send risk. The fallback `?? ''` is defensive in case `User.email` is somehow null.

C) `apps/web/src/lib/notifications/__tests__/dispatcher.test.ts`:

In Test 5 around line 311-322, add `driverEmail: 'alex@test.com'` to the payload literal so the test still compiles:

```ts
const result = await dispatchNotification('load.assigned' as 'load.assigned', {
  tenantId: 'tenant_1',
  payload: {
    loadId: 'load_1',
    loadNumber: 'L-001',
    driverId: 'user_alex',
    driverEmail: 'alex@test.com',
    driverName: 'Alex',
    originCity: 'Chicago',
    destCity: 'Dallas',
  },
  prismaClient: db as unknown as Parameters<typeof dispatchNotification>[1]['prismaClient'],
});
```

The mock in this test already returns `makeRecipient('alex@test.com', 'user_alex')` from `db.user.findFirst`, so the external_email rule will promote into the same User row by email lookup and dedup with the `related` rule by userId. Assertions remain valid.

Do NOT change behavior when `cd.email`/`User.email` is null — the empty string falls through and is rejected by the resolver's `@`-shape check. This is the existing-pattern behavior we must preserve per constraints.

Do NOT modify recipient-resolver.ts.

Do NOT introduce new patterns (e.g. don't add a separate prefetch helper, don't wrap in a new utility — match the inline shape already in these files).
  </action>
  <verify>
From `apps/web`:
1. `npx tsc --noEmit` exits 0 (no type errors).
2. `npm run build` succeeds.
3. Grep confirmations (from repo root):
   - `grep -n "driverEmail" apps/web/src/lib/notifications/types.ts` shows the new field.
   - `grep -n "driverEmail" apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts` shows the payload line and prefetch select.
   - `grep -n "driverEmail" apps/web/src/app/\(owner\)/actions/loads.ts` shows the payload line and prefetch select.
   - `grep -n "driverEmail" apps/web/src/lib/notifications/__tests__/dispatcher.test.ts` shows the updated test payload.
4. (Optional sanity) Run the dispatcher test file: `cd apps/web && npx vitest run src/lib/notifications/__tests__/dispatcher.test.ts` — all existing tests still pass.
  </verify>
  <done>
- Both `dispatchNotification('load.assigned', ...)` call sites pass a `driverEmail` field in the payload.
- createAssignment sources it from `CarrierDriver.email` (the actual fix — closes the reported bug).
- dispatchLoad sources it from `User.email` (legacy path; satisfies the new required type, no behavior change since `related` rule already routes the User).
- `npx tsc --noEmit` and `npm run build` both succeed from `apps/web`.
- The existing dispatcher test still passes with the added `driverEmail` field.
- A CarrierDriver row with `user_id IS NULL` and a valid `email` will now appear as a recipient (userId: null, emailEnabled: true) when assigned to a load, and receive the load.assigned email.
  </done>
</task>

</tasks>

<verification>
Phase-level checks (run from `apps/web`):

1. Type check: `npx tsc --noEmit` exits 0.
2. Build: `npm run build` exits 0.
3. DB row: Supabase MCP `execute_sql` SELECT on `NotificationTemplate` where `triggerKey='load.assigned'` returns the 3-rule defaultRecipients (related/driverId, external_email/driverEmail, role/OWNER).
4. Code paths: every `dispatchNotification('load.assigned', ...)` site has a `driverEmail` payload field (grep returns 2 source files + 1 test).
5. Resolver unchanged: `git diff apps/web/src/lib/notifications/recipient-resolver.ts` is empty.
6. Behavioral spot-check (manual, optional): In a dev shell, assign a CarrierDriver with `user_id IS NULL` and a non-null `email` to a load. NotificationSendLog should have an EMAIL row with `recipientUserId IS NULL` and `recipientEmail` matching the CarrierDriver.email.
</verification>

<success_criteria>
- A CarrierDriver row with `user_id IS NULL` AND `email IS NOT NULL` receives the load.assigned email when assigned via createAssignment.
- A CarrierDriver row with `user_id IS NULL` AND `email IS NULL` (or empty) does NOT trigger errors and silently skips driver email (only OWNER role fires) — unchanged from current behavior.
- A CarrierDriver row with a linked `user_id` continues to work as quick-342 fixed it (related rule fires; external_email rule with empty driverEmail is filtered by shape check OR with non-empty driverEmail dedups via the userMap promotion path).
- The legacy dispatchLoad path continues to work; no double-send (resolver dedup by userId then by email).
- `npx tsc --noEmit` and `npm run build` succeed from `apps/web`.
- `recipient-resolver.ts` is unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/344-fix-load-assigned-notification-routing-t/344-SUMMARY.md`
</output>
