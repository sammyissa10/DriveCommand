---
phase: quick-324
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx
  - apps/web/src/app/(admin)/notifications/send-log-tab.tsx
autonomous: true

must_haves:
  truths:
    - "Visiting /settings/notifications and clicking the Send Log tab no longer throws the Radix Select empty-value error"
    - "Visiting /admin/notifications and clicking the Send Log tab no longer throws the Radix Select empty-value error"
    - "Selecting 'All statuses' (or 'All channels') in a filter dropdown clears that filter from the query (treated as undefined)"
    - "Selecting a specific status (e.g. SENT, FAILED) still filters results to that status"
    - "tsc --noEmit produces no new errors"
  artifacts:
    - path: "apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx"
      provides: "Tenant Send Log filters with sentinel 'all' value instead of empty string"
      contains: "value=\"all\""
    - path: "apps/web/src/app/(admin)/notifications/send-log-tab.tsx"
      provides: "SysAdmin Send Log filter with sentinel 'all' value instead of empty string"
      contains: "value=\"all\""
  key_links:
    - from: "tenant-send-log-tab.tsx Select onValueChange"
      to: "listTenantSendLog server action"
      via: "fetchRows translates 'all' -> undefined before passing status/channel"
      pattern: "status === 'all' \\? undefined"
    - from: "send-log-tab.tsx Select onValueChange"
      to: "listNotificationSendLog server action"
      via: "fetchRows translates 'all' -> undefined before passing status"
      pattern: "status === 'all' \\? undefined"
---

<objective>
Fix the production React crash on Send Log tabs caused by Radix UI `<SelectItem value="">` violations. Both the tenant Send Log tab (`/settings/notifications`) and the SysAdmin Send Log tab (`/admin/notifications`) use empty-string SelectItem values for "All statuses" / "All channels" placeholders, which Radix rejects at render time.

Purpose: Restore working Send Log views for both tenant owners and sysadmins so notification observability is not blocked.
Output: Two surgical edits replacing empty-string SelectItem values with sentinel `"all"`, plus matching filter-handler logic that converts `"all"` back to `undefined` before calling the server action.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx
@apps/web/src/app/(admin)/notifications/send-log-tab.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace empty-string SelectItem values with sentinel "all" in both Send Log tabs</name>
  <files>
    apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx
    apps/web/src/app/(admin)/notifications/send-log-tab.tsx
  </files>
  <action>
Surgical fix only. Two files to edit. DO NOT touch notifications-tab.tsx, subscribers-tab.tsx, tenant-notifications-tabs.tsx, the data-layer actions, or the shadcn Select primitive itself.

**File 1: apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx**

1. Update initial filter state defaults (around lines 86-87):
   - Change `const [status, setStatus] = useState<string>('');` → `const [status, setStatus] = useState<string>('all');`
   - Change `const [channel, setChannel] = useState<string>('');` → `const [channel, setChannel] = useState<string>('all');`
   - Leave `triggerKey` alone — it's an Input, not a Select.

2. Update `fetchRows` (around lines 92-108) to translate sentinel back to `undefined` before calling the server action:
   - Replace `status: (status || undefined) as NotificationSendStatus | undefined,` with `status: (status && status !== 'all' ? status : undefined) as NotificationSendStatus | undefined,`
   - Replace `channel: (channel || undefined) as NotificationChannel | undefined,` with `channel: (channel && channel !== 'all' ? channel : undefined) as NotificationChannel | undefined,`
   - Leave `triggerKey: triggerKey || undefined,` alone.

3. Update the JSX SelectItems (around lines 151 and 165):
   - Change `<SelectItem value="">All statuses</SelectItem>` → `<SelectItem value="all">All statuses</SelectItem>`
   - Change `<SelectItem value="">All channels</SelectItem>` → `<SelectItem value="all">All channels</SelectItem>`

**File 2: apps/web/src/app/(admin)/notifications/send-log-tab.tsx**

1. Update initial filter state default (around line 81):
   - Change `const [status, setStatus] = useState<string>('');` → `const [status, setStatus] = useState<string>('all');`
   - Leave `tenantId`, `triggerKey`, `from`, `to`, `recipient` alone — they are Inputs, not Selects.

2. Update `fetchRows` (around lines 89-107) to translate sentinel back to `undefined`:
   - Replace `status: (status || undefined) as NotificationSendStatus | undefined,` with `status: (status && status !== 'all' ? status : undefined) as NotificationSendStatus | undefined,`

3. Update the JSX SelectItem (around line 157):
   - Change `<SelectItem value="">All statuses</SelectItem>` → `<SelectItem value="all">All statuses</SelectItem>`

**Why sentinel "all":**
Radix Select reserves empty-string values to clear selection and show the placeholder. Any `<SelectItem value="">` throws a runtime error. We use the sentinel literal `"all"` for the catch-all option in the UI layer, then translate it back to `undefined` in `fetchRows` so the server action and underlying Prisma `where` clause never see `"all"` as a real status/channel value. This preserves the existing filter contract — the server action still accepts `status` and `channel` as `NotificationSendStatus | undefined` and `NotificationChannel | undefined`.

**Do not refactor anything else.** No new types, no helper functions, no extracted FilterBar components. Edit only the lines specified.
  </action>
  <verify>
1. From repo root: `cd apps/web && npx tsc --noEmit` → exits 0 with no new errors.
2. `grep -rn 'SelectItem value=""' apps/web/src/app/(owner)/settings/notifications/ apps/web/src/app/(admin)/notifications/` returns zero matches.
3. `grep -n "value=\"all\"" apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx` returns 2 lines (status + channel).
4. `grep -n "value=\"all\"" apps/web/src/app/(admin)/notifications/send-log-tab.tsx` returns 1 line (status).
5. Manual smoke (dev server): navigate to `/settings/notifications` → click "Send Log" tab → no React error, dropdowns render with "All statuses" / "All channels" selected by default. Pick "FAILED" → click Search → results filter correctly. Pick "All statuses" again → results unfiltered.
6. Same smoke on `/admin/notifications` → "Send Log" tab → no error, default selection is "All statuses".
  </verify>
  <done>
Both Send Log tab files have:
- No `<SelectItem value="">` anywhere.
- Initial Select state set to `'all'` instead of `''`.
- `fetchRows` translates `'all'` → `undefined` before passing status/channel to the server action.
- tsc --noEmit clean.
- Send Log tab renders without Radix error in dev/prod build.
- "All statuses" / "All channels" behavior preserved (no filter applied).
- Specific-value filtering still works.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` → 0 errors.
- `cd apps/web && npm run build` → completes successfully (Next.js production build).
- Manual: open `/settings/notifications` Send Log tab and `/admin/notifications` Send Log tab — no console errors, filter dropdowns work as before.
</verification>

<success_criteria>
- Radix Select empty-value runtime error no longer fires on either Send Log tab.
- All existing filter behavior is preserved (status, channel, and other inputs all still narrow results when set; "All..." selections clear the filter).
- Only 2 files modified. No data-layer or shared component changes.
- TypeScript clean.
</success_criteria>

<output>
After completion, create `.planning/quick/324-fix-send-log-tab-crash-radix-select-empt/324-SUMMARY.md` summarizing: files changed, exact SelectItem replacements, and verification results.
</output>
