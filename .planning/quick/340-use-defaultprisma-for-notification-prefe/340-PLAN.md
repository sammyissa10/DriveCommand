---
phase: quick-340
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
autonomous: true
must_haves:
  truths:
    - "createAssignment notification prefetch returns non-null load and driver rows for valid IDs"
    - "[notif-trace] caller:prefetch-result log line is emitted on every createAssignment call, showing load=true/false and driver=true/false"
    - "dispatchNotification('load.assigned', ...) executes when a driver is assigned to a load (no longer silently skipped by RLS-filtered nulls)"
    - "All non-prefetch prisma operations in load-driver-assignments.ts remain tenant-scoped (assignment create, duplicate-main-driver check, other reads)"
    - "TypeScript compiles cleanly via `npx tsc --noEmit` from apps/web"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "createAssignment server action with RLS-bypassed notification prefetch"
      contains: "defaultPrisma.load.findUnique"
  key_links:
    - from: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts (createAssignment prefetch)"
      to: "apps/web/src/lib/db/prisma.ts (exported `prisma` — unscoped client)"
      via: "import { prisma as defaultPrisma } from '@/lib/db/prisma'"
      pattern: "defaultPrisma\\.(load|carrierDriver)\\.findUnique"
    - from: "createAssignment prefetch result"
      to: "dispatchNotification('load.assigned')"
      via: "if (load && driver) guard (now passes because RLS is bypassed for these two reads)"
      pattern: "if \\(load && driver\\)"
---

<objective>
Fix silent null prefetch in `createAssignment` so notifications actually dispatch on driver assignment.

Root cause: the notification prefetch `Promise.all` uses the tenant-scoped `prisma` client. RLS filtering on `loads` and `carrier_drivers` silently returns `null` for both `findUnique` calls — it does NOT throw, so the `.catch()` handler never fires. The `if (load && driver)` guard then closes silently and `dispatchNotification` is never called. NotificationSendLog rows never appear.

Fix: use the unscoped `defaultPrisma` client ONLY for the two prefetch reads inside `Promise.all`. Every other prisma reference in the file stays tenant-scoped.

Safety justification (this fix is safe because):
1. `requireRole(UserRole.OWNER)`, `requireAuth()`, and `requireTenantId()` have already run earlier in `createAssignment` — caller is authenticated and authorized.
2. `loadId` came from the request body and `cd.id` came from a prior tenant-scoped query, so both IDs are already validated within the tenant boundary.
3. The fields being read (`loadNumber`, `origin`, `destination`, `firstName`, `lastName`) are non-sensitive — they're already exposed to the driver via the load assignment.
4. The unscoped client is used for nothing else — duplicate-main-driver check, assignment create, and any other reads continue to enforce RLS.

Purpose: unblock the notification pipeline. Without this fix, no driver gets a push notification when assigned to a load.
Output: one-file edit + trace log line + TypeScript pass.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Target file (the only file modified)
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts

# Source of the unscoped client — confirmed export at line 44
@apps/web/src/lib/db/prisma.ts
</context>

<reasoning_confirmation>
Confirmed before writing this plan:

1. **Unscoped client export** — `apps/web/src/lib/db/prisma.ts` line 44:
   ```ts
   export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });
   ```
   This is the raw PrismaClient (no `$extends` for tenant scoping, no RLS context). It is the same singleton consumed by `getTenantPrisma()` which wraps it. Importing it directly bypasses the tenant extension entirely.

2. **Exact prefetch location** — `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` lines 237–250:
   ```ts
   // Prefetch load/driver data needed for notification payload.
   const [load, driver] = await Promise.all([
     prisma.load.findUnique({
       where: { id: loadId },
       select: { loadNumber: true, origin: true, destination: true },
     }),
     prisma.carrierDriver.findUnique({
       where: { id: cd.id },
       select: { firstName: true, lastName: true },
     }),
   ]).catch((err) => {
     console.error('[notifications] createAssignment prefetch failed', err);
     return [null, null] as const;
   });
   ```
   Only these TWO `prisma.*.findUnique` calls switch to `defaultPrisma`. The `.catch` stays.

3. **Existing imports** — line 6 already imports `getTenantPrisma, requireTenantId` from `@/lib/context/tenant-context`. The new import for `defaultPrisma` is added alongside existing imports, NOT replacing them.

4. **Existing trace lines** — lines 253 and 270 already emit `[notif-trace] caller:before-dispatch` and `[notif-trace] caller:after-dispatch`. We add a third line `[notif-trace] caller:prefetch-result` IMMEDIATELY before the `if (load && driver) {` guard on line 252. This makes the silent-null failure visible going forward.
</reasoning_confirmation>

<tasks>

<task type="auto">
  <name>Task 1: Switch notification prefetch to defaultPrisma + add prefetch-result trace</name>
  <files>apps/web/src/app/(owner)/actions/load-driver-assignments.ts</files>
  <action>
Make exactly THREE edits to `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`. No other files. No other changes.

**Edit 1 — Add the import.**
Locate the existing import block at the top of the file (lines 3–13). Add this line alongside the existing imports (a natural spot is right after the existing `getTenantPrisma, requireTenantId` import on line 6, but anywhere in the import block is acceptable):

```ts
import { prisma as defaultPrisma } from '@/lib/db/prisma';
```

Use the `as defaultPrisma` alias so it does NOT shadow the existing tenant-scoped `prisma` symbol used throughout the rest of the file.

**Edit 2 — Swap the two prefetch reads to defaultPrisma.**
In the `createAssignment` function, locate the prefetch `Promise.all` at lines 238–250. Change ONLY these two lines:

- Line 239: `prisma.load.findUnique({` → `defaultPrisma.load.findUnique({`
- Line 243: `prisma.carrierDriver.findUnique({` → `defaultPrisma.carrierDriver.findUnique({`

Do NOT touch:
- The `.catch((err) => { ... })` handler — leave it as-is.
- The `select` clauses — leave them as-is.
- Any other `prisma.*` reference anywhere else in the file (assignment create, duplicate-main-driver check, updateAssignment, deleteAssignment, etc.) — they MUST stay tenant-scoped.

**Edit 3 — Add the prefetch-result trace line.**
Immediately before the existing `if (load && driver) {` line (currently line 252, will shift by Edit 2's surroundings if any), insert this single line:

```ts
console.log(`[notif-trace] caller:prefetch-result load=${load != null} driver=${driver != null} loadId=${loadId} driverId=${cd.id}`);
```

Place it AFTER the closing `});` of the `.catch(...)` block and BEFORE the `if (load && driver) {` line. So the resulting structure is:

```ts
  ]).catch((err) => {
    console.error('[notifications] createAssignment prefetch failed', err);
    return [null, null] as const;
  });

  console.log(`[notif-trace] caller:prefetch-result load=${load != null} driver=${driver != null} loadId=${loadId} driverId=${cd.id}`);
  if (load && driver) {
    console.log(`[notif-trace] caller:before-dispatch trigger=load.assigned load=${loadId} driver=${cd.id}`);
    ...
```

**Constraints (re-stated, do NOT violate):**
- Do NOT remove or modify the existing `.catch` handler.
- Do NOT change any other `prisma.*` reference in the file — only the two prefetch reads inside `Promise.all`.
- Do NOT touch the dispatcher (`@/lib/notifications/dispatcher`) or any other file.
- Do NOT modify the existing two trace lines (`caller:before-dispatch`, `caller:after-dispatch`) — only add the new third one.
- Keep all existing comments (including the quick-336/337/338 explanation block) intact.
  </action>
  <verify>
Run from the repository root:

```bash
cd apps/web && npx tsc --noEmit
```

Expected: exit code 0, no errors. (If type errors appear, they must be unrelated to this change — investigate before declaring done.)

Then verify the edits landed correctly by grepping the file:

```bash
grep -n "defaultPrisma" apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts
```

Expected output (3 lines):
1. The import line (`import { prisma as defaultPrisma } from '@/lib/db/prisma';`)
2. `defaultPrisma.load.findUnique(...)`
3. `defaultPrisma.carrierDriver.findUnique(...)`

And:

```bash
grep -n "caller:prefetch-result" apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts
```

Expected: exactly one match, sitting immediately before the `if (load && driver) {` line.

Final sanity check — count all `prisma.` references that are NOT `defaultPrisma.` and confirm they look unchanged compared to before the edit (should still see the tenant-scoped `prisma.loadDriverAssignment.create`, `prisma.loadDriverAssignment.findFirst` for duplicate-main-driver, etc.).
  </verify>
  <done>
- `npx tsc --noEmit` from `apps/web` exits 0.
- Exactly one new import line: `import { prisma as defaultPrisma } from '@/lib/db/prisma';`
- The two prefetch `findUnique` calls inside `Promise.all` use `defaultPrisma` (load + carrierDriver).
- Exactly one new `console.log` line emitting `[notif-trace] caller:prefetch-result load=... driver=... loadId=... driverId=...` immediately before `if (load && driver) {`.
- Every other `prisma.*` reference in the file is unchanged (still tenant-scoped via the existing top-of-function `const prisma = await getTenantPrisma(...)` or however it was scoped before).
- The existing `.catch` handler is intact and unchanged.
- No other files modified.
  </done>
</task>

</tasks>

<verification>
Spot-check after Task 1 completes:

1. `npx tsc --noEmit` (from `apps/web`) — clean.
2. `git diff apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts` — should show exactly:
   - 1 added import line
   - 2 lines changed: `prisma.load.findUnique` → `defaultPrisma.load.findUnique`, `prisma.carrierDriver.findUnique` → `defaultPrisma.carrierDriver.findUnique`
   - 1 added `console.log` trace line
   - Nothing else.
3. Diff line count: roughly +4 / -2 (or +5 / -2 if the new console.log is on its own line with surrounding whitespace).
4. `grep -n 'prisma\.\(load\|carrierDriver\)\.findUnique' apps/web/src/app/\(owner\)/actions/load-driver-assignments.ts` should return ZERO matches — confirming all prefetch reads are now `defaultPrisma.*`.
</verification>

<success_criteria>
- TypeScript compiles cleanly from `apps/web` (`npx tsc --noEmit`).
- Exactly three textual changes in `load-driver-assignments.ts` (1 import, 2 prefetch swaps, 1 trace log).
- No other files modified.
- The tenant-scoped `prisma` symbol is still used by every non-prefetch operation in the file (assignment create, duplicate-main-driver check, etc.).
- Plan SUMMARY documents the safety reasoning (auth + tenant validation already happened upstream) so future readers know why bypassing RLS here is acceptable.
</success_criteria>

<output>
After completion, create `.planning/quick/340-use-defaultprisma-for-notification-prefe/340-SUMMARY.md` documenting:
- The exact edits made (with line numbers).
- The safety justification for bypassing RLS on these two reads.
- Confirmation that `tsc --noEmit` passed.
- Expected next observable behavior in production: `[notif-trace] caller:prefetch-result` lines should now show `load=true driver=true` for valid assignments, followed by `caller:before-dispatch` and `caller:after-dispatch`, and a NotificationSendLog row should be created.
</output>
