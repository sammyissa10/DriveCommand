---
phase: 367-tkt-0015-prompt-4-build-audittrailfooter
plan: 367
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/audit-trail/format-relative-time.ts
  - apps/web/src/components/audit-trail-footer.tsx
  - apps/web/src/components/audit-trail-footer.test.tsx
  - apps/web/src/app/(owner)/loads/[id]/page.tsx
  - apps/web/src/app/(owner)/routes/[id]/page.tsx
  - apps/web/src/app/(owner)/trucks/[id]/page.tsx
  - apps/web/src/app/(owner)/invoices/[id]/page.tsx
  - apps/web/src/app/(owner)/payroll/[id]/page.tsx
  - apps/web/src/app/(owner)/crm/[id]/page.tsx
  - apps/web/src/app/(owner)/support/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
  - apps/web/src/app/(owner)/checklists/instances/[id]/page.tsx
  - apps/web/src/app/(driver)/my-tickets/[id]/page.tsx
  - apps/web/src/app/(driver)/tasks/[id]/page.tsx
  - apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx
  - apps/web/src/app/(admin)/billing/[id]/page.tsx
  - apps/web/src/app/(admin)/tenants/[id]/page.tsx
autonomous: false

must_haves:
  truths:
    - "Every tenant-scoped detail page in apps/web displays a consistent two-line audit footer (Created / Last updated)"
    - "Relative-time text is shown by default with absolute UTC->local timestamp revealed on hover (desktop) or tap (mobile)"
    - "Null creator names render as 'Unknown' while still showing the actual timestamp"
    - "The footer collapses to a single 'Created' line when updatedAt === createdAt OR when |updatedAt - createdAt| < 60s AND createdByName === updatedByName"
    - "The component is pure presentation — never reaches into Prisma or server-only modules"
  artifacts:
    - path: "apps/web/src/lib/audit-trail/format-relative-time.ts"
      provides: "formatRelativeTime(date: Date | string): string and formatAbsoluteTime(date: Date | string): string helpers using vanilla Date math + Intl.DateTimeFormat"
      exports: ["formatRelativeTime", "formatAbsoluteTime"]
    - path: "apps/web/src/components/audit-trail-footer.tsx"
      provides: "<AuditTrailFooter> React component that renders the two-line (or one-line) audit footer with shadcn Tooltip"
      exports: ["AuditTrailFooter", "AuditTrailFooterProps"]
    - path: "apps/web/src/components/audit-trail-footer.test.tsx"
      provides: "Vitest unit tests covering all 6 rendering branches"
      min_lines: 80
  key_links:
    - from: "apps/web/src/components/audit-trail-footer.tsx"
      to: "apps/web/src/lib/audit-trail/format-relative-time.ts"
      via: "named import"
      pattern: "from ['\"](.*)audit-trail/format-relative-time['\"]"
    - from: "apps/web/src/components/audit-trail-footer.tsx"
      to: "apps/web/src/components/ui/tooltip"
      via: "named import (Tooltip, TooltipContent, TooltipProvider, TooltipTrigger)"
      pattern: "from ['\"](.*)ui/tooltip['\"]"
    - from: "every modified detail page under apps/web/src/app/"
      to: "apps/web/src/components/audit-trail-footer"
      via: "JSX usage of <AuditTrailFooter ... />"
      pattern: "<AuditTrailFooter"
---

<objective>
Build a single reusable React component `<AuditTrailFooter>` plus a vanilla-Date relative-time helper, then integrate it across the ~21 tenant-scoped detail pages in apps/web that should display creator/updater attribution.

Purpose: Now that Prompt 3 auto-populates created_by / updated_by on every write (47 tenant-scoped models), Prompt 4 makes that audit data visible to users in a consistent, low-noise UI pattern. This is the final, presentation-only piece of TKT-0015.

Output:
- 1 new component + 1 new helper + 1 new test file
- ~21 detail pages updated to fetch creator/updater + render the footer at the bottom of main content
- Zero schema, Prisma extension, or business-logic changes
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md
@apps/web/src/components/ui/tooltip.tsx

# Reference: an existing detail page already showing createdAt — pattern to align with
@apps/web/src/app/(owner)/loads/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the relative-time helper, AuditTrailFooter component, and unit tests</name>
  <files>
    apps/web/src/lib/audit-trail/format-relative-time.ts
    apps/web/src/components/audit-trail-footer.tsx
    apps/web/src/components/audit-trail-footer.test.tsx
  </files>
  <action>
    Create three files. NO Prisma imports, NO server-only imports, NO new npm dependencies (no date-fns / dayjs / moment).

    **1. `apps/web/src/lib/audit-trail/format-relative-time.ts`**

    Export two pure functions, both accepting `Date | string` and returning `string`:

    - `formatRelativeTime(input)` — uses vanilla `Date` math. Compute `diffMs = Date.now() - inputDate.getTime()`. Buckets (round down, no decimals, no pluralize-one-as-singular logic beyond ternary):
      - `< 5s` → `"just now"`
      - `< 60s` → `"{n} seconds ago"`
      - `< 60m` → `"{n} minute(s) ago"` (singular at n===1)
      - `< 24h` → `"{n} hour(s) ago"`
      - `< 7d`  → `"{n} day(s) ago"`
      - `< 30d` → `"{n} week(s) ago"`
      - `< 365d` → `"{n} month(s) ago"` (approximate, 30-day months — fine)
      - otherwise → `"{n} year(s) ago"`
      Negative diffs (future timestamps) — treat as `"just now"` (defensive; never expected in practice).

    - `formatAbsoluteTime(input)` — returns the timestamp in the user's local timezone via `Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d)`. Passing `undefined` as the first arg uses the runtime's default locale; relying on the browser to resolve the timezone from the Date object (which is UTC-stored on the server side). No explicit IANA timezone string.

    Coerce string inputs via `new Date(input)` at the top of each function. Do NOT throw on invalid dates — fall back to `""`.

    **2. `apps/web/src/components/audit-trail-footer.tsx`**

    `'use client'` at the top (Tooltip needs client). Export both the component and the props type.

    Props (exact shape, no optional gymnastics — pages MUST pass all six):
    ```ts
    export interface AuditTrailFooterProps {
      createdAt: Date | string;
      createdByName: string | null;
      createdByEmail: string | null;
      updatedAt: Date | string;
      updatedByName: string | null;
      updatedByEmail: string | null;
    }
    ```

    Rendering logic (in this order):
    1. Coerce both timestamps to `Date` objects.
    2. Compute `createdMs = createdDate.getTime()`, `updatedMs = updatedDate.getTime()`, `diffMs = Math.abs(updatedMs - createdMs)`.
    3. Resolve display names: `createdActor = createdByName?.trim() || createdByEmail?.trim() || "Unknown"` (and same for updated).
    4. Collapse to one line if:
       - `updatedMs === createdMs` (exact match, no update has happened), OR
       - `diffMs < 60_000` AND `createdActor === updatedActor`.
    5. Wrap the whole thing in a single `<TooltipProvider>`.
    6. Each line: plain `<p className="text-sm text-muted-foreground">` containing the label, the actor, and a `<Tooltip>` whose trigger is the relative-time `<span>` (use `tabIndex={0}` and `role="button"` on the trigger span for keyboard/mobile reachability) and whose `<TooltipContent>` shows the absolute time.
    7. Container: `<div className="mt-8 pt-6 space-y-1">` — top padding, NO border (per locked design: "section dividers are space, not lines").

    Suggested line format (exact copy):
    - `Created {relative} by {actor}`
    - `Last updated {relative} by {actor}`

    Use shadcn Tooltip from `@/components/ui/tooltip` (already exists). Do NOT use `as any`, `@ts-ignore`, or `// @ts-expect-error`.

    **3. `apps/web/src/components/audit-trail-footer.test.tsx`**

    Vitest + React Testing Library (`@testing-library/react`). Cover exactly these 6 branches — one `it()` block each:
    1. **Two-line render** — different actors, updatedAt 2 hours after createdAt → both `Created` and `Last updated` lines present, two distinct actor names rendered.
    2. **Created-only when updatedAt === createdAt** — pass identical Date → assert only one line ("Created") rendered; `queryByText(/Last updated/)` is null.
    3. **Unknown actor** — `createdByName: null, createdByEmail: null` → renders "Unknown" but still renders the relative time.
    4. **Collapse redundant update** — same actor name, updatedAt 30s after createdAt → only "Created" line rendered.
    5. **Absolute tooltip content** — hover the relative-time trigger via `userEvent.hover` (or check `aria-describedby`) and assert that a tooltip containing a parseable absolute date string appears. (If Radix Tooltip is hard to assert in jsdom, fall back to checking that the trigger has a `title` attribute OR that the `TooltipContent` is rendered into the DOM with the expected text — pick whichever works in the existing test setup.)
    6. **Dark-mode class application** — render the component and assert that the outer text element has class `text-muted-foreground` present in the DOM (`expect(container.querySelector('.text-muted-foreground')).not.toBeNull()`).

    Use `Date` instances directly in tests (no mocking of `Date.now` required if you compute relative offsets from `new Date()` at test time).
  </action>
  <verify>
    From repo root:
    - `pnpm --filter @drivecommand/web tsc --noEmit` exits 0
    - `pnpm --filter @drivecommand/web test audit-trail-footer` (or whatever the configured vitest invocation is — check `apps/web/package.json` scripts) passes all 6 test cases
    - `grep -r "as any\|@ts-ignore\|@ts-expect-error" apps/web/src/components/audit-trail-footer.tsx apps/web/src/lib/audit-trail/` produces no output
  </verify>
  <done>
    Three files exist and compile. All 6 unit tests pass. Component is importable from `@/components/audit-trail-footer` and helper from `@/lib/audit-trail/format-relative-time`.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: CHECKPOINT — surface page list, component code, and test results for confirmation</name>
  <what-built>
    Reusable `<AuditTrailFooter>` component + `formatRelativeTime` helper + 6-branch unit test suite.
  </what-built>
  <how-to-verify>
    Before this checkpoint, the executor MUST output, in a single response, all of the following:

    1. **Component code** — print the full content of `apps/web/src/components/audit-trail-footer.tsx` (so the user can sanity-check copy, layout, and props).
    2. **Helper code** — print the full content of `apps/web/src/lib/audit-trail/format-relative-time.ts`.
    3. **Test results** — paste the terminal output of running the test file (must show all 6 tests green).
    4. **Page list** — run the following discovery and print the resulting table. Start from the QT-354 inventory and filter:

       ```bash
       # 1. List all candidate pages from QT-354 Section 3 (27 detail pages total)
       # 2. EXCLUDE the 3 doc/help pages: /admin/docs/features, /admin/docs/operations, /admin/docs/database, /owner/help/[slug]
       # 3. Output the remaining ~21-23 pages as a table with columns:
       #    | # | Route | File | Prisma model | Already shows audit info? (yes/partial/no) | Action (integrate / replace existing display / skip-and-why) |
       ```

       For each "Already shows audit info?" = `yes` (Loads, Routes, Trucks, Invoices, Payroll, Support, Tenants, my-tickets):
       - Mark Action = "REPLACE existing inline createdAt display with <AuditTrailFooter>" (do not leave both — the brief says collapse to the unified footer; the QT-354 brief "Pages that already have their own audit display — leave those alone" applies only if the existing display is a dedicated/richer audit component, NOT a one-liner `createdAt` field. The user must confirm which of these to replace vs leave.)

       For `partial` (carrier/dispatches, carrier/loads, carrier/driver-pay/settlements, driver/pay/settlements): mark Action = "INTEGRATE — add <AuditTrailFooter> at bottom of main content".

       For `no`: mark Action = "INTEGRATE — add <AuditTrailFooter> at bottom of main content".

       Flag explicitly:
       - The hybrid client-shell pages (`/owner/checklists/instances/[id]`, `/driver/pay/settlements/[id]`) — note that integration must happen inside the client component since the footer is a client component and props must be serialized from the server shell.
       - Pages whose Prisma query does NOT currently `.include` the creator/updater User — list which queries need extension.

    5. **Final line** — exactly: `Awaiting page-list confirmation before integration.`

    The executor MUST STOP here. Do not run Task 3 until the user replies with one of:
    - `approved` → proceed with the full list as proposed
    - `approved with edits: <list of pages to skip or treat differently>` → proceed with edits
    - Any other response → wait for clarification
  </how-to-verify>
  <resume-signal>Type "approved" (with optional edits) or describe issues</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Integrate AuditTrailFooter into all confirmed detail pages</name>
  <files>
    apps/web/src/app/(owner)/loads/[id]/page.tsx
    apps/web/src/app/(owner)/routes/[id]/page.tsx
    apps/web/src/app/(owner)/trucks/[id]/page.tsx
    apps/web/src/app/(owner)/invoices/[id]/page.tsx
    apps/web/src/app/(owner)/payroll/[id]/page.tsx
    apps/web/src/app/(owner)/crm/[id]/page.tsx
    apps/web/src/app/(owner)/support/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
    apps/web/src/app/(owner)/checklists/instances/[id]/page.tsx
    apps/web/src/app/(driver)/my-tickets/[id]/page.tsx
    apps/web/src/app/(driver)/tasks/[id]/page.tsx
    apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx
    apps/web/src/app/(admin)/billing/[id]/page.tsx
    apps/web/src/app/(admin)/tenants/[id]/page.tsx
  </files>
  <action>
    Apply the user-confirmed integration plan from Task 2. Process pages in this order: server pages first, then hybrid (server-shell + client) pages.

    For each page in the confirmed list:

    **Step A — extend the Prisma query** (only if the existing `findUnique`/`findFirst` does not already include the creator/updater User):
    - Add `include` (or `select`) for the User relations matching that model's audit FKs. Use the per-model convention from QT-354 Section 1:
      - camelCase models (`Load`, `Truck`, `Route`, `Invoice`, `PayrollRecord`, `Customer`, `SupportTicket`, `Tag`, `MaintenanceEvent`, etc.) — relations are named `createdBy` and `updatedBy` referencing `User` (or whatever the relation name is in `schema.prisma` for that specific model — verify by reading the model block before writing the query).
      - snake_case Carrier / Driver Pay models — relations are named `createdBy` / `updatedBy` mapped to `created_by_id` / `updated_by_id` (Prompt 3 added these as proper FK relations on most snake_case models; some Driver Pay models may still use bare-UUID `created_by` — for those, fall back to a separate `prisma.user.findMany({ where: { id: { in: [createdBy, updatedBy].filter(Boolean) } } })` lookup and assemble the names manually).
    - Select only `firstName`, `lastName`, `email` (and `id` for type safety) on the User. Do not over-fetch.
    - If the page already has a Prisma include block, ADD to it — do not duplicate the query.

    **Step B — resolve display name** (do this in the page body, after the record is loaded):
    ```ts
    const createdByName = record.createdBy
      ? `${record.createdBy.firstName ?? ''} ${record.createdBy.lastName ?? ''}`.trim() || null
      : null;
    const createdByEmail = record.createdBy?.email ?? null;
    // same for updatedBy
    ```
    If a model uses a different relation name (e.g. Document's `uploader`, FleetMessage's `sender`), use that — but per QT-354 Recommendation, FleetMessage and Document are OUT OF SCOPE for the audit FK rollout; they should be SKIPPED unless the user explicitly opts them back in during Task 2.

    **Step C — render the footer** at the bottom of the page's main content:
    ```tsx
    import { AuditTrailFooter } from '@/components/audit-trail-footer';
    // ...
    <AuditTrailFooter
      createdAt={record.createdAt}
      createdByName={createdByName}
      createdByEmail={createdByEmail}
      updatedAt={record.updatedAt}
      updatedByName={updatedByName}
      updatedByEmail={updatedByEmail}
    />
    ```
    Place it AFTER all tabs / cards / sections — it is the last thing on the page. If the page has a tabbed layout (e.g. `<Tabs>` from shadcn), put the footer BELOW the entire `<Tabs>` block, outside the `<TabsContent>` panels.

    **Step D — remove redundant inline displays.** Per the user's Task 2 confirmation: any existing one-liner `<dt>Created</dt><dd>{load.createdAt.toLocaleDateString()}</dd>` block (Loads, Routes, Trucks, Invoices, Payroll, etc.) MUST be deleted when adding the footer — the footer replaces it. Do NOT remove richer custom audit displays if the user marked them "leave alone" in Task 2.

    **Step E — hybrid client-shell pages** (`/owner/checklists/instances/[id]` delegates to `ChecklistDetailClient`; `/driver/pay/settlements/[id]` delegates to `DriverSettlementDetailView`):
    - Pass the resolved name/email/timestamp props from the server shell DOWN into the client component as new props.
    - The client component renders `<AuditTrailFooter>` at the bottom of its JSX.
    - Serialize Dates to ISO strings if they cross the server→client boundary (Next.js will warn otherwise). The component accepts `Date | string` so this is safe.

    **Step F — driver-pay bare-UUID fallback** (only if user kept Driver Pay pages in scope at Task 2):
    For DriverSettlement and related Driver Pay models that still use bare `created_by` UUIDs without a Prisma relation, do a single `prisma.user.findMany({ where: { id: { in: [...] }}, select: { id, firstName, lastName, email } })` and build a lookup map. Then resolve names from that map.

    **Constraints (re-stated for this task):**
    - DO NOT touch `apps/mobile/`.
    - DO NOT modify `apps/web/src/lib/db/extensions/audit-columns.ts`, `tenant-client.ts`, or `prisma/schema.prisma`.
    - DO NOT add `as any` or `@ts-ignore` anywhere.
    - DO NOT change server actions, API routes, or business logic — only data fetching for the page's own Prisma read.
    - If a page in the list cannot be safely integrated (e.g. its query is shared across many pages and would require a wider refactor), STOP and surface the issue rather than forcing the change.
  </action>
  <verify>
    - `pnpm --filter @drivecommand/web tsc --noEmit` exits 0
    - `pnpm --filter @drivecommand/web build` succeeds (or at minimum `next build` against the modified routes)
    - Spot-check 3 pages by manual visual review of the diff: 1 server page (e.g. /owner/loads/[id]), 1 carrier snake_case page (e.g. /owner/carrier/clients/[id]), 1 hybrid page (e.g. /owner/checklists/instances/[id]). Confirm each renders `<AuditTrailFooter ... />` exactly once, at the bottom of the main content, with all 6 props supplied.
    - `grep -r "<AuditTrailFooter" apps/web/src/app/` returns one match per page in the confirmed list (no duplicates, no missed pages).
    - `grep -rn "as any\|@ts-ignore\|@ts-expect-error" apps/web/src/app/(owner) apps/web/src/app/(driver) apps/web/src/app/(admin)` returns no NEW matches (diff against pre-task baseline).
  </verify>
  <done>
    All confirmed detail pages render `<AuditTrailFooter>` at the bottom of main content with creator and updater names resolved from joined User data. Existing inline one-liner "Created on {date}" displays are removed in favor of the unified footer. TypeScript compiles cleanly. No mobile-app files were touched.
  </done>
</task>

</tasks>

<verification>
End-to-end:
- The 3 new files (helper, component, test) exist and pass tests.
- Every page in the user-confirmed list contains exactly one `<AuditTrailFooter>` usage with all 6 props.
- Hover/tap on the relative-time text in any modified page reveals the absolute timestamp in the user's local timezone.
- Pages where the record has never been updated (createdAt === updatedAt) show only the "Created" line.
- Pages with a NULL creator (legacy rows from before Prompt 3) show "Unknown" as the actor and still render the timestamp.
- No mobile-app files modified.
- No Prisma schema, no audit-columns extension, no tenant-client changes.
- `tsc --noEmit` and `next build` both pass.
</verification>

<success_criteria>
- 1 new component + 1 new helper + 1 new test file (3 files total) created.
- ~21 detail pages updated (final count confirmed at the Task 2 checkpoint).
- 6/6 unit tests pass (all rendering branches covered).
- No new `as any` / `@ts-ignore` / `@ts-expect-error` introduced.
- No new npm dependency added (vanilla Date math only).
- No changes outside `apps/web/src/`.
- Task 2 checkpoint was honored: the executor stopped, surfaced the page list + code + test output, and waited for user approval before integration.
</success_criteria>

<output>
After completion, create `.planning/quick/367-tkt-0015-prompt-4-build-audittrailfooter/367-SUMMARY.md` documenting:
- Final list of integrated pages (with any pages skipped per user Task 2 edits)
- Component API and 6 rendering branches
- Snapshot of test results
- Any pages where the Prisma query needed extension (creator/updater not previously joined)
- Any hybrid client-shell pages and how props were threaded
- Confirmation that QT-354 SUMMARY's "leave alone" list was respected (which pages still have their own audit display vs were replaced)
</output>
