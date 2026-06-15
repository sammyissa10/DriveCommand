---
phase: quick-438
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/Sidebar/index.tsx
  - apps/web/src/components/search/searchProviders.ts
  - apps/web/src/components/quick-actions/quickActions.config.ts
autonomous: true

must_haves:
  truths:
    - "Carrier sidebar no longer shows a Financials nav item"
    - "Command palette / search no longer offers a Financials navigation entry"
    - "No remaining navigation or quick-action link points to the nonexistent /carrier/financials route"
    - "TypeScript compiles with no new errors and no unused-import warnings from removed icons"
  artifacts:
    - path: "apps/web/src/components/Sidebar/index.tsx"
      provides: "Intelligence nav group without the dead Financials entry"
      contains: "Intelligence"
    - path: "apps/web/src/components/search/searchProviders.ts"
      provides: "Search nav items and hrefMap without nav-financials"
    - path: "apps/web/src/components/quick-actions/quickActions.config.ts"
      provides: "Quick actions without dead /carrier/financials expense links"
  key_links:
    - from: "apps/web/src/components/Sidebar/index.tsx"
      to: "/carrier/financials"
      via: "removed nav item"
      pattern: "carrier/financials"
---

<objective>
Remove the dead "Financials" navigation item from the carrier sidebar and eliminate all direct navigation/quick-action links that point to the nonexistent `/carrier/financials` route.

Purpose: The carrier sidebar INTELLIGENCE section shows a "Financials" link to `/carrier/financials`, but no such route exists — clicking it leads to a 404. The same dead route is also referenced by the command-palette search and the expense quick-actions. This task removes the dead nav entry and the direct dead links without creating the route or building any page.

Output: Updated `Sidebar/index.tsx`, `searchProviders.ts`, and `quickActions.config.ts` with the dead Financials nav item and `/carrier/financials` links removed, plus cleanup of any now-unused icon imports.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/components/Sidebar/index.tsx
@apps/web/src/components/search/searchProviders.ts
@apps/web/src/components/quick-actions/quickActions.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove Financials nav item from the carrier sidebar</name>
  <files>apps/web/src/components/Sidebar/index.tsx</files>
  <action>
In `apps/web/src/components/Sidebar/index.tsx`, remove the dead "Financials" navigation entry from the INTELLIGENCE group.

1. Delete the entire block (currently around lines 253-260) that pushes the Financials item:
   - The comment `// Financials — hub for revenue/performance visibility`
   - The `if (managerHasPermission(perms, "revenueReport") || managerHasPermission(perms, "performanceReport")) { intelligenceItems.push({ label: "Financials", href: "/carrier/financials", icon: TrendingUp }) }` block in full.
2. Update the section header comment near line 232 that reads `// Max 3 items: Live Map, Dashboard, Financials` to `// Max 2 items: Live Map, Dashboard` (remove the stale "Financials" reference). Do NOT touch the Live Map or Carrier Dashboard items.
3. Remove the now-unused `TrendingUp` import from the lucide-react import block (line 34) — it is used ONLY by the deleted Financials entry. Verify no other `TrendingUp` usage remains in the file before removing.

Do NOT reorder other nav items, do NOT change the Live Map or Dashboard entries, do NOT alter any Tailwind classes/tokens, and do NOT create the `/carrier/financials` route.
  </action>
  <verify>
Run `grep -n "carrier/financials\|TrendingUp" apps/web/src/components/Sidebar/index.tsx` — expect zero matches. Run `cd apps/web && npx tsc --noEmit` and confirm no new errors introduced in this file.
  </verify>
  <done>The carrier sidebar no longer renders a Financials nav item, the stale comment is updated, the unused TrendingUp import is gone, and TypeScript compiles with no new errors from this file.</done>
</task>

<task type="auto">
  <name>Task 2: Remove dead /carrier/financials links from search palette and quick actions</name>
  <files>apps/web/src/components/search/searchProviders.ts, apps/web/src/components/quick-actions/quickActions.config.ts</files>
  <action>
Remove the remaining direct links to the nonexistent `/carrier/financials` route from the command palette and quick-actions config. These all point at the same dead route the sidebar item used.

In `apps/web/src/components/search/searchProviders.ts`:
1. Delete the `nav-financials` navigation item object (currently lines 60-66: `{ id: "nav-financials", label: "Financials", icon: TrendingUp, section: "navigation", keywords: [...] }`).
2. Delete the corresponding `"nav-financials": "/carrier/financials",` entry from the first `hrefMap` (currently line 193).
3. Delete the `create-expense` quick-create item that has `href: "/carrier/financials"` (currently lines ~328-336) — it links to the dead route.
4. After removals, check whether `TrendingUp` and `Receipt` icon imports are still used elsewhere in the file (`grep -n "TrendingUp\|Receipt" apps/web/src/components/search/searchProviders.ts`). If an icon now has zero remaining usages, remove it from the import block to satisfy strict/no-unused. Do NOT remove the second `hrefMap` (help articles, line ~538) — it does not reference financials.

In `apps/web/src/components/quick-actions/quickActions.config.ts`:
1. Delete the `create-expense` quick-create item with `href: "/carrier/financials"` (currently lines ~109-116).
2. Delete the `action-log-expense` quick-action item with `href: "/carrier/financials"` (currently lines ~131-138).
3. After removals, check remaining `Receipt` usages (`grep -n "Receipt" apps/web/src/components/quick-actions/quickActions.config.ts`). If `Receipt` has zero remaining usages, remove it from the import block; if it is still used by another item, leave the import intact.

Do NOT touch the `financials` help-docs category in `help.config.ts` — it is documentation content, not a link to `/carrier/financials`, and is out of scope. Keep all existing Tailwind classes/tokens. No `any`.
  </action>
  <verify>
Run `grep -rn "carrier/financials\|nav-financials" apps/web/src/components/search/searchProviders.ts apps/web/src/components/quick-actions/quickActions.config.ts` — expect zero matches. Run `cd apps/web && npx tsc --noEmit` and confirm no new errors and no unused-import errors in the two files.
  </verify>
  <done>No `/carrier/financials` link remains in the search palette or quick-actions config, the `nav-financials` search item is gone, any orphaned icon imports are removed, and TypeScript compiles cleanly with no new errors.</done>
</task>

</tasks>

<verification>
- `grep -rn "/carrier/financials" apps/web/src` returns no matches in nav/search/quick-action configs (the route never existed; only the now-removed dead links referenced it).
- `cd apps/web && npx tsc --noEmit` introduces no new TypeScript errors versus the known baseline (35 pre-existing errors from missing @types).
- Carrier sidebar Intelligence section still shows Live Map and Carrier Dashboard, in the same order, with unchanged styling.
- Command palette no longer surfaces a "Financials" navigation result.
</verification>

<success_criteria>
- The Financials nav item is removed from the carrier sidebar (`Sidebar/index.tsx`).
- All direct links to `/carrier/financials` are removed from `searchProviders.ts` and `quickActions.config.ts`.
- No orphaned/unused icon imports remain (`TrendingUp`, `Receipt` cleaned up where applicable).
- No route is created and no page is built.
- No other nav items reordered or restyled; Tailwind classes/tokens unchanged.
- TypeScript strict mode passes with no new errors and no `any` introduced.
</success_criteria>

<output>
After completion, create `.planning/quick/438-remove-dead-financials-nav-item-from-car/438-SUMMARY.md`
</output>
