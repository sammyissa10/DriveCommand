---
phase: quick-63
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
    - "Owner sees All/Open/In Progress/Closed tabs above ticket list"
    - "Each tab shows a count badge with the number of tickets in that bucket"
    - "Clicking a tab filters the ticket list to only matching statuses"
    - "Zero-count tabs appear dimmed but remain clickable"
    - "Default active tab is All"
  artifacts:
    - path: "src/app/(owner)/support/support-tickets-list.tsx"
      provides: "Client component with tab filtering and ticket card rendering"
      contains: "use client"
    - path: "src/app/(owner)/support/page.tsx"
      provides: "Server component passing tickets to client wrapper"
  key_links:
    - from: "src/app/(owner)/support/page.tsx"
      to: "src/app/(owner)/support/support-tickets-list.tsx"
      via: "passes tickets array as prop"
      pattern: "SupportTicketsList.*tickets"
---

<objective>
Add status filtering tabs with count badges to the owner support page.

Purpose: TKT-0021 — let owners quickly filter their support tickets by status (All/Open/In Progress/Closed) with count badges showing how many tickets are in each bucket.
Output: A client component with tab-based filtering, server component simplified to data fetching + delegation.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/support/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract ticket list into client component with tab filtering</name>
  <files>
    src/app/(owner)/support/support-tickets-list.tsx
    src/app/(owner)/support/page.tsx
  </files>
  <action>
1. Create `src/app/(owner)/support/support-tickets-list.tsx` as a `'use client'` component:
   - Accept a `tickets` prop typed as `Awaited<ReturnType<typeof getMyTickets>>` (import getMyTickets type from `@/actions/support-tickets`).
   - Move ALL helper functions from page.tsx into this file: `getCategoryBadgeClass`, `getCategoryLabel`, `getPriorityBadgeClass`, `getPriorityLabel`, `getStatusBadgeClass`, `getStatusLabel`.
   - Move ALL card rendering JSX (the Link/Card/CardHeader/CardContent block) into this component.
   - Add `activeTab` state with `useState`, default `'all'`.
   - Define tab buckets:
     - `all` — no filter
     - `open` — `status === 'OPEN'`
     - `in_progress` — `status === 'IN_PROGRESS' || status === 'WAITING_ON_CUSTOMER'`
     - `closed` — `status === 'RESOLVED' || status === 'CLOSED'`
   - Compute counts for each bucket from the full tickets array using `useMemo`.
   - Filter displayed tickets based on `activeTab` using `useMemo`.
   - Render a tab bar above the ticket list: a row of buttons with labels "All", "Open", "In Progress", "Closed".
   - Each tab button shows a count badge in parentheses, e.g., "Open (2)".
   - Active tab styling: `bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium`.
   - Inactive tab styling: `text-muted-foreground hover:text-foreground px-3 py-1.5 text-sm font-medium`.
   - Zero-count badges: add `opacity-50` to the inactive tab when count is 0.
   - Tab bar container: `flex items-center gap-1 bg-muted/50 rounded-lg p-1` (pill-style tab group).
   - Show the EmptyState component when tickets array is empty (no tabs shown). Show a "No tickets match" message when filtered list is empty but tickets exist.
   - Import required dependencies: Card, CardContent, CardHeader from `@/components/ui/card`, Badge from `@/components/ui/badge`, EmptyState from `@/components/ui/empty-state`, LifeBuoy from `lucide-react`, Link from `next/link`.

2. Simplify `src/app/(owner)/support/page.tsx`:
   - Remove all helper functions (moved to client component).
   - Remove Card, CardContent, CardHeader, Badge, EmptyState, LifeBuoy, Link imports.
   - Import `SupportTicketsList` from `./support-tickets-list`.
   - Keep the server-side data fetch and the page heading (h1 + description paragraph).
   - Replace the entire conditional rendering block (empty state + ticket list) with `<SupportTicketsList tickets={tickets} />`.
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors.
    Run `npx next build` or verify dev server loads `/support` without errors.
    Visually: tabs render, clicking tabs filters tickets, counts update correctly.
  </verify>
  <done>
    Owner support page shows All/Open/In Progress/Closed tab bar with count badges. Clicking a tab filters the ticket list client-side. Zero-count tabs appear dimmed. Default tab is All. Page still server-renders initial data.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Owner support page at `/support` renders tab bar with 4 tabs
- Count badges show correct numbers per bucket
- Clicking each tab filters the displayed tickets
- Empty state still shows when no tickets exist at all
</verification>

<success_criteria>
- Tab bar with All/Open/In Progress/Closed tabs visible above ticket list
- Each tab displays accurate count badge
- Filtering works correctly for each bucket's status mapping
- Zero-count tabs are dimmed
- No TypeScript errors, page loads without issues
</success_criteria>

<output>
After completion, create `.planning/quick/63-tkt-0021-add-status-filtering-to-owner-s/63-SUMMARY.md`
</output>
