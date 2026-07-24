---
phase: quick-507
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/Sidebar/index.tsx
autonomous: true

must_haves:
  truths:
    - "A desktop carrier owner/manager sees a 'Route Templates' link in the sidebar"
    - "Clicking the link navigates to /carrier/templates"
    - "The misleading 'Rate Sheets' comment near the legacy Routes item is corrected"
    - "The legacy 'Routes' -> /routes item is unchanged (separate system)"
    - "tsc introduces no new errors in the touched file"
  artifacts:
    - path: "apps/web/src/components/Sidebar/index.tsx"
      provides: "Sidebar nav item linking to /carrier/templates"
      contains: "/carrier/templates"
  key_links:
    - from: "apps/web/src/components/Sidebar/index.tsx"
      to: "/carrier/templates"
      via: "nav item href"
      pattern: "href:\\s*[\"']/carrier/templates[\"']"
---

<objective>
Fix TKT-0085: the carrier Route Templates page (/carrier/templates) fully works but is unreachable from the ACTIVE desktop sidebar, so desktop-only users can never create route_templates — leaving the Trip "Route Template" dropdown (GET /api/v1/carrier/route-templates/active) permanently empty. Add a "Route Templates" nav item to the active sidebar and correct the misleading comment that mislabels /carrier/templates as "Rate Sheets".

Purpose: Restore desktop discoverability of the carrier route_templates feature that feeds the Trip workflow.
Output: One edited file — apps/web/src/components/Sidebar/index.tsx (new nav item + corrected comment + one icon import).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Active desktop sidebar (the ONLY file to edit):
@apps/web/src/components/Sidebar/index.tsx

Reference-only (correct pattern already used on mobile-web — do NOT edit):
@apps/web/src/components/navigation/owner-more-menu.tsx
</context>

<verified_facts>
These were confirmed by reading the file at planning time. RE-VERIFY exact line numbers before editing — the file is large and may shift.

- Import block: lines 25-38 (`import { LayoutDashboard, MapPin, Truck, Package, Users2, FileText, Boxes, MessageSquare, UserCircle, Route, Building2, ListChecks } from "lucide-react"`). `CalendarDays` is NOT imported. `Route` is already used by the legacy Routes item, so do not reuse it.
- OPERATIONS section: lines ~260-316. Header comment states `MAX 5 ITEMS — force discussion before adding more`. It already defines exactly 5 items: Clients, Contracts, Routes (ungated, /routes), Loads, Trips. Adding a 6th here WOULD violate the MAX-5 constraint — do NOT add it here.
- Misleading comment: line ~285, currently:
  `// Renamed from "Templates" which was confusing (Rate Sheets are at /carrier/templates)`
  This is wrong — /carrier/templates is the Route Templates feature, not Rate Sheets.
- RESOURCES section: lines ~318-367. Header comment also states `MAX 5 ITEMS`. It currently defines 4 items: Drivers, Fleet, Facilities, Checklists (Checklists is ungated with a `TODO: add 'checklists' permission key if needed` comment). Room for one more (would become 5/5 — at the max, still allowed).
- Gating pattern in this file: `managerHasPermission(perms, key)` where `key` is `keyof UserPermissions`. The Routes and Checklists items are intentionally UNGATED (plain `push`, with a TODO comment). Do NOT invent a `templates`/`routeTemplates` permission key — that would require a `keyof UserPermissions` value that does not exist and cause a tsc error. Follow the ungated Routes/Checklists pattern.
</verified_facts>

<tasks>

<task type="auto">
  <name>Task 1: Add Route Templates nav item and fix the mislabeled comment</name>
  <files>apps/web/src/components/Sidebar/index.tsx</files>
  <action>
Make three edits to apps/web/src/components/Sidebar/index.tsx. Re-read the relevant regions first to confirm current line numbers (structure verified at planning time but may shift).

EDIT 1 — Add the icon import.
In the lucide-react import block (around lines 25-38), add `CalendarDays` to the imported list (keep alphabetical-ish grouping tidy; a single new line like `  CalendarDays,` is fine). Use CalendarDays to match the mobile More menu convention (owner-more-menu.tsx line 37 uses CalendarDays for the same /carrier/templates link). Do NOT reuse the `Route` icon — it already represents the legacy Routes item and would be visually ambiguous.

EDIT 2 — Fix the misleading comment (around line 285).
Change the line that reads:
  `// Renamed from "Templates" which was confusing (Rate Sheets are at /carrier/templates)`
to accurately describe reality, e.g.:
  `// Legacy route system (/routes) — SEPARATE from carrier Route Templates (/carrier/templates)`
Do NOT change the "Routes" item itself (label "Routes", href "/routes", icon Route) — it is a different system and must stay exactly as-is.

EDIT 3 — Add the "Route Templates" nav item to the RESOURCES section.
Rationale: the OPERATIONS section is already at its documented MAX 5 items (Clients, Contracts, Routes, Loads, Trips), so adding there would violate the `MAX 5 ITEMS` constraint. The RESOURCES section has 4 items and is semantically "the things being managed" — a route blueprint is a managed resource, and keeping it visually separate from the legacy "Routes" item is intentional (they are two different route systems). Add the item right after the "Checklists" push, before the `if (resourcesItems.length > 0)` block (around lines 359-361):

    // Route Templates — reusable carrier route blueprints that feed the Trip "Route Template" picker
    // Permission: currently ungated (matches Routes/Checklists; TODO: add a permission key if needed)
    resourcesItems.push({
      label: "Route Templates",
      href: "/carrier/templates",
      icon: CalendarDays,
    })

Keep indentation consistent with the surrounding pushes (2-space, matching the existing file). Do NOT add a permission gate (no `managerHasPermission` wrapper) — follow the ungated Checklists/Routes pattern. Do NOT introduce PermissionGuard (that is a different, unused pattern from the dead sidebar.tsx).

Constraints reminder: UI-only change. No data/schema changes, no new dependencies, no other files touched.
  </action>
  <verify>
1. `grep -n "carrier/templates" apps/web/src/components/Sidebar/index.tsx` shows the new nav item.
2. `grep -n "Rate Sheets" apps/web/src/components/Sidebar/index.tsx` returns NOTHING (old comment removed).
3. `grep -n "CalendarDays" apps/web/src/components/Sidebar/index.tsx` shows both the import and the icon usage.
4. Confirm the legacy Routes item (label "Routes", href "/routes") is still present and unchanged.
  </verify>
  <done>
Sidebar/index.tsx contains a "Route Templates" item linking to /carrier/templates in the Resources section, using the CalendarDays icon; the "Rate Sheets" comment is corrected; the legacy Routes item is untouched; no permission-gating pattern was invented.
  </done>
</task>

<task type="auto">
  <name>Task 2: Type-check the touched file (no new errors)</name>
  <files>apps/web/src/components/Sidebar/index.tsx</files>
  <action>
From apps/web, run `npx tsc --noEmit`. The repo has ~35 pre-existing baseline errors from missing @types (framer-motion, zustand, nuqs, papaparse, d3-geo, @tanstack/react-virtual) — those are NOT regressions. Confirm there are ZERO errors referencing apps/web/src/components/Sidebar/index.tsx and that the total error count did not increase versus baseline. A common self-inflicted error here would be an unused-import or a missing-import for CalendarDays — resolve any such error before finishing.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` — no errors mention Sidebar/index.tsx; total count matches the ~35 baseline (no regression).
  </verify>
  <done>
tsc --noEmit reports no new errors and none in the touched file.
  </done>
</task>

</tasks>

<verification>
- Desktop carrier owner/manager sidebar renders a "Route Templates" link under Resources.
- Link href is /carrier/templates (the carrier route_templates page that feeds the Trip picker).
- The "Rate Sheets" mislabel comment is gone; comment now correctly distinguishes /routes (legacy) from /carrier/templates (Route Templates).
- Legacy "Routes" -> /routes item unchanged.
- No new tsc errors.
</verification>

<success_criteria>
- TKT-0085 addressed: /carrier/templates is reachable from the active desktop sidebar.
- Only apps/web/src/components/Sidebar/index.tsx modified.
- MAX-5 Operations constraint respected (item placed in Resources instead).
- No schema/data changes, no new dependencies, no new gating pattern.
</success_criteria>

<output>
After completion, create `.planning/quick/507-add-route-templates-link-to-desktop-carr/507-SUMMARY.md`.
</output>
