---
phase: quick-116
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
autonomous: true
must_haves:
  truths:
    - "Owner sees driver's actual name (or email fallback) in conversation list, never 'Unknown Driver'"
    - "Owner sees driver's actual name (or email fallback) in conversation thread header and message bubbles"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/fleet/messages/route.ts"
      provides: "Conversation list with resolved driver names"
      contains: "email"
    - path: "apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts"
      provides: "Conversation thread with resolved sender/recipient names"
      contains: "email"
  key_links:
    - from: "apps/web/src/app/api/mobile/owner/fleet/messages/route.ts"
      to: "prisma.user.findMany"
      via: "select includes email for fallback"
      pattern: "select:.*email"
---

<objective>
Fix "Unknown Driver" appearing in the owner's mobile fleet messages screens.

Purpose: When a driver User record has null/empty firstName and lastName, the API falls back to the
hardcoded string "Unknown Driver" instead of using the user's email as a reasonable fallback. This
makes the conversation list and thread view unusable for identifying which driver sent a message.

Output: Both owner fleet message API routes resolve names with email fallback, eliminating all
"Unknown Driver" / "Unknown" occurrences.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
@apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix name resolution in owner fleet conversation list API</name>
  <files>apps/web/src/app/api/mobile/owner/fleet/messages/route.ts</files>
  <action>
In the GET handler, fix the user name resolution to use email as fallback instead of "Unknown Driver":

1. In the `tx.user.findMany` call (around line 66-69), add `email: true` to the `select` object so it returns `{ id, firstName, lastName, email }`.

2. On line 73, change the name resolution from:
   `const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unknown Driver';`
   to:
   `const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;`

3. On line 105, change the fallback from `'Unknown Driver'` to `'Driver'` as a last resort (this path means the ID wasn't in the user table at all, which shouldn't happen in practice).

4. In the POST handler, apply the same fix to the recipient name resolution (around line 230-235):
   - Add `email: true` to the `tx.user.findFirst` select on line 231
   - Change line 235 from:
     `recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || 'Unknown Driver';`
     to:
     `recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || recipient.email;`
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors.</verify>
  <done>Conversation list API returns driver email (not "Unknown Driver") when firstName/lastName are empty.</done>
</task>

<task type="auto">
  <name>Task 2: Fix name resolution in owner fleet conversation thread API</name>
  <files>apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts</files>
  <action>
In the GET handler, fix the user name resolution to use email as fallback:

1. In the `tx.user.findMany` call that builds the nameMap (around line 78-82), add `email: true` to the select.

2. Change the nameMap building (around line 86) from:
   `const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unknown';`
   to:
   `const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;`

3. For the recipient name resolution (around line 97-102):
   - Add `email: true` to the `tx.user.findFirst` select on line 98
   - Change the fallback from:
     `recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || 'Unknown Driver';`
     to:
     `recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || recipient.email;`

4. On line 110, change the senderName fallback from `'Unknown'` to `'Driver'` as a last resort.

5. In the POST handler (around line 170-178):
   - Add `email: true` to the `tx.user.findFirst` select on line 172
   - Change the senderName resolution from:
     `const senderName = sender ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Owner' : 'Owner';`
     to:
     `const senderName = sender ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.email : 'Owner';`
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors.</verify>
  <done>Conversation thread API returns driver/sender email (not "Unknown"/"Unknown Driver") when names are empty.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/web/tsconfig.json` passes with no errors
- Grep for "Unknown Driver" in both modified files returns zero matches
- Grep for "'Unknown'" (single-quoted Unknown without Driver) in both files returns zero matches
</verification>

<success_criteria>
- No "Unknown Driver" or "Unknown" fallbacks remain in the two API route files
- All name resolution paths use email as fallback before any generic string
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/116-fix-unknown-driver-name-in-mobile-messag/116-SUMMARY.md`
</output>
