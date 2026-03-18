---
phase: quick-62
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/support/page.tsx
  - src/app/(owner)/support/support-tickets-list.tsx
autonomous: true
must_haves:
  truths:
    - "Owner sees All/Open/In Progress/Closed tab bar on support page"
    - "Each tab shows a count badge with the number of tickets in that bucket"
    - "Clicking a tab filters the ticket list to show only matching tickets"
    - "All tab shows total count and all tickets"
    - "Ticket cards remain clickable links to detail page"
  artifacts:
    - path: "src/app/(owner)/support/support-tickets-list.tsx"
      provides: "Client component with tab state and filtered ticket rendering"
    - path: "src/app/(owner)/support/page.tsx"
      provides: "Server component passing tickets to client wrapper"
  key_links:
    - from: "src/app/(owner)/support/page.tsx"
      to: "src/app/(owner)/support/support-tickets-list.tsx"
      via: "tickets prop"
      pattern: "<SupportTicketsList tickets="
---

<objective>
Add status filtering tabs to the owner support page with All/Open/In Progress/Closed buckets and count badges.

Purpose: Owners need to quickly find tickets by status instead of scanning the full list.
Output: Filtered ticket list with tab bar matching the admin support pattern.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/support/page.tsx
@src/app/(admin)/admin-support/ticket-list.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create client-side SupportTicketsList component with tab filtering</name>
  <files>src/app/(owner)/support/support-tickets-list.tsx</files>
  <action>
Create a new `'use client'` component `SupportTicketsList` that receives all tickets as a prop and renders the tab bar + filtered ticket list.

**Tab bar pattern** — copy the exact styling from `src/app/(admin)/admin-support/ticket-list.tsx` lines 380-441:
- TabValue type: `'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'`
- `useState<TabValue>('ALL')` for active tab
- Tab bar container: `flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit`
- Active tab: `bg-white border border-gray-200 shadow-sm text-gray-900 font-semibold`
- Inactive tab: `text-gray-500 hover:text-gray-700 hover:bg-gray-100`
- Each tab button shows `{label} ({count})`

**Status buckets** (same as admin):
- ALL: all tickets
- OPEN: status === 'OPEN'
- IN_PROGRESS: status === 'IN_PROGRESS' || status === 'WAITING_ON_CUSTOMER'
- CLOSED: status === 'RESOLVED' || status === 'CLOSED'

**Counts** — pre-compute from full ticket array (not affected by active filter).

**Filtered list rendering** — move ALL the ticket card rendering logic from the current `page.tsx` into this component (the Card/Link/Badge markup from lines 101-143). Move the helper functions (`getCategoryBadgeClass`, `getCategoryLabel`, `getPriorityBadgeClass`, `getPriorityLabel`, `getStatusBadgeClass`, `getStatusLabel`) into this file as well.

**Empty state for filtered view** — when a tab has 0 tickets, show: `<p className="text-sm text-muted-foreground py-8 text-center">No tickets in this category.</p>`

**Props type** — use `Awaited<ReturnType<typeof getMyTickets>>` for the tickets prop type (import `getMyTickets` type only). The component receives `tickets` as a prop.

Do NOT add priority or tenant filters (those are admin-only). Just the status tab bar.
  </action>
  <verify>File exists, has 'use client' directive, exports SupportTicketsList, contains activeTab state, contains tab buttons with count badges, contains filtered ticket cards with Link components.</verify>
  <done>SupportTicketsList component renders tab bar with All/Open/In Progress/Closed tabs showing count badges, filters tickets client-side on tab click, and renders ticket cards as clickable links.</done>
</task>

<task type="auto">
  <name>Task 2: Update owner support page to use SupportTicketsList wrapper</name>
  <files>src/app/(owner)/support/page.tsx</files>
  <action>
Modify the server component `page.tsx` to:

1. Keep it as an async server component — keep the `getMyTickets()` fetch and try/catch.
2. Remove all the helper functions (getCategoryBadgeClass, getCategoryLabel, etc.) — they moved to `support-tickets-list.tsx`.
3. Remove the Card/Badge/Link imports that are no longer needed.
4. Keep the page header (h1 "My Support Tickets" + description paragraph).
5. Keep the EmptyState for when `tickets.length === 0`.
6. Replace the ticket list rendering (lines 101-143) with: `<SupportTicketsList tickets={tickets} />`
7. Import `SupportTicketsList` from `./support-tickets-list`.

The page structure becomes:
- Header (h1 + description)
- if no tickets: EmptyState
- else: `<SupportTicketsList tickets={tickets} />`
  </action>
  <verify>`npm run build` succeeds without errors. Navigate to /support as an owner — page renders with tab bar and ticket cards.</verify>
  <done>Owner support page renders the tab bar via SupportTicketsList, server component only handles data fetching and empty state, all rendering logic delegated to client component.</done>
</task>

</tasks>

<verification>
- `npm run build` passes with no TypeScript errors
- Owner support page at `/support` shows All/Open/In Progress/Closed tabs
- Tab counts reflect correct ticket counts per bucket
- Clicking each tab filters the visible tickets
- Ticket cards remain clickable and link to `/support/[id]`
- Empty state still shows when owner has zero tickets total
</verification>

<success_criteria>
Owner support page has a functional status filter tab bar matching the admin pattern, with count badges on each tab and client-side filtering. No server roundtrips needed for filtering.
</success_criteria>

<output>
After completion, create `.planning/quick/62-tkt-0021-add-status-filtering-to-owner-s/62-SUMMARY.md`
</output>
