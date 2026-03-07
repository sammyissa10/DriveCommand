---
phase: quick-44
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(admin)/admin-support/page.tsx
  - src/app/(admin)/admin-support/ticket-list.tsx
autonomous: true

must_haves:
  truths:
    - "Admin can click a tab to see only Open tickets"
    - "Admin can click a tab to see only In Progress tickets"
    - "Admin can click a tab to see only Closed tickets (RESOLVED + CLOSED combined)"
    - "An 'All' tab shows every ticket regardless of status"
    - "Active tab is visually distinct from inactive tabs"
    - "Each tab label shows the count of tickets in that status"
  artifacts:
    - path: "src/app/(admin)/admin-support/ticket-list.tsx"
      provides: "Client component with tab UI and client-side status filtering"
      contains: "useState.*activeTab\|activeTab.*useState"
    - path: "src/app/(admin)/admin-support/page.tsx"
      provides: "Server page passes all tickets to AdminTicketList"
  key_links:
    - from: "src/app/(admin)/admin-support/page.tsx"
      to: "src/app/(admin)/admin-support/ticket-list.tsx"
      via: "tickets prop (all statuses, unfiltered)"
      pattern: "AdminTicketList.*tickets"
---

<objective>
Add status tab filtering to the sysadmin support ticket dashboard so admins can quickly focus on Open, In Progress, or Closed tickets instead of scanning one long undifferentiated list.

Purpose: The current flat list mixes all statuses — admins need to triage Open tickets but have to scroll past Closed ones.
Output: Tab bar above the ticket list with All / Open / In Progress / Closed filters; active tab highlighted; each tab shows count badge.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add tab filter UI and client-side filtering to AdminTicketList</name>
  <files>src/app/(admin)/admin-support/ticket-list.tsx</files>
  <action>
    Convert AdminTicketList to include a tab bar at the top with four tabs: All, Open, In Progress, Closed.

    Tab logic:
    - Add `useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('ALL')` named `activeTab`
    - "Closed" tab matches tickets where `status === 'RESOLVED' || status === 'CLOSED'` (combine both into one bucket since both represent resolved work)
    - Derive `filteredTickets` from `tickets` based on `activeTab`:
      - ALL: all tickets
      - OPEN: status === 'OPEN'
      - IN_PROGRESS: status === 'IN_PROGRESS'
      - CLOSED: status === 'RESOLVED' || status === 'CLOSED'

    Tab bar markup (place above the existing count/hint row):
    - Use a simple flex row of buttons, not shadcn Tabs (no dep needed)
    - Active tab: `bg-white border border-gray-200 shadow-sm text-gray-900 font-semibold`
    - Inactive tab: `text-gray-500 hover:text-gray-700 hover:bg-gray-100`
    - Shared tab classes: `px-3 py-1.5 rounded-md text-sm transition-colors`
    - Each tab label: `{label} ({count})` where count is pre-computed from the full `tickets` array (not filtered), e.g. `Open (3)`
    - Count for Closed tab = RESOLVED + CLOSED combined

    Replace the existing `tickets.map(...)` render with `filteredTickets.map(...)`.
    Update the "All Tickets (N)" heading to show `filteredTickets.length` and reflect the active filter, e.g. "Open Tickets (3)" or "All Tickets (12)".

    Do NOT change TicketRow, the status update logic, or any other existing behavior.
  </action>
  <verify>
    Run `npx tsc --noEmit` from /c/Users/sammy/Projects/DriveCommand — zero new errors.
    Visually: visit /admin/admin-support, confirm four tabs render, clicking each changes the visible ticket list.
  </verify>
  <done>
    Four tabs (All / Open / In Progress / Closed) appear above the ticket list. Each tab shows a count. Clicking a tab filters the list. Active tab is visually distinct. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` produces zero new errors
- AdminTicketList renders tab bar with All / Open / In Progress / Closed
- Tab counts match the stat cards already shown at the top of the page
- Selecting a tab filters the ticket list correctly
- Existing expand/status-update functionality inside TicketRow is unaffected
</verification>

<success_criteria>
Sysadmin can open /admin/admin-support, click "Open" tab, and see only open tickets — no page reload needed (client-side filter). Tab counts are accurate. TypeScript compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/44-add-ticket-status-filtering-to-sysadmin-/44-SUMMARY.md`
</output>
