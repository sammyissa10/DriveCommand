---
phase: quick-445
plan: 445
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/help/help.config.ts
  - apps/web/src/components/help/HelpCategoryGrid.tsx
  - apps/web/src/components/search/searchProviders.ts
autonomous: true

must_haves:
  truths:
    - "The Help Center index (/help) does not list the Financials category card"
    - "Direct navigation to /help/financials returns 404 (notFound)"
    - "Direct navigation to any /help/financials/<article> URL returns 404 (notFound)"
    - "Command-palette search for 'financ', 'expense', or 'invoice' surfaces no Financials help articles or the Financials category"
    - "All other help categories (getting-started, loads-and-dispatches, routes, drivers-and-fleet, integrations) still appear and function unchanged"
    - "The Financials category content remains in source (hidden via flag), restorable by flipping one boolean"
  artifacts:
    - path: "apps/web/src/components/help/help.config.ts"
      provides: "hidden flag on HelpCategory interface + hidden:true on Financials + helpers filter hidden categories"
      contains: "hidden"
    - path: "apps/web/src/components/help/HelpCategoryGrid.tsx"
      provides: "Index grid filters out hidden categories"
      contains: "hidden"
  key_links:
    - from: "apps/web/src/app/(owner)/help/[categoryOrSlug]/page.tsx"
      to: "getCategoryBySlug"
      via: "returns undefined for hidden category -> falls through to FeatureArticlePage -> notFound"
      pattern: "getCategoryBySlug"
    - from: "apps/web/src/app/(owner)/help/[categoryOrSlug]/[article]/page.tsx"
      to: "getArticleBySlug"
      via: "returns undefined for hidden category -> notFound()"
      pattern: "getArticleBySlug"
    - from: "apps/web/src/components/search/searchProviders.ts"
      to: "HELP_CATEGORIES / getAllArticles"
      via: "createHelpProvider iterates visible categories only"
      pattern: "HELP_CATEGORIES|getAllArticles"
---

<objective>
Hide the Help Center "Financials" category (at /help/financials) from all public surfaces without deleting its content. The Financials feature work is cancelled and the /carrier/financials route 404s, so its six-plus help articles document features that do not exist. Hide the category using a restorable flag.

Purpose: Prevent users from reading docs for unbuilt features, while keeping the content recoverable by flipping one boolean.
Output: A `hidden` flag on the Financials category, enforced centrally so the index grid, category page, article pages, and command-palette search all exclude it.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The single source of truth for help categories/articles
@apps/web/src/components/help/help.config.ts

# Consumer 1: index grid (lists category cards)
@apps/web/src/components/help/HelpCategoryGrid.tsx

# Consumer 2: command-palette / Cmd+K help provider
@apps/web/src/components/search/searchProviders.ts

# Consumers 3 & 4 (NOT modified — they already call helpers that we make hidden-aware):
#   apps/web/src/app/(owner)/help/[categoryOrSlug]/page.tsx       -> getCategoryBySlug
#   apps/web/src/app/(owner)/help/[categoryOrSlug]/[article]/page.tsx -> getArticleBySlug
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add hidden flag to help.config and make helpers + grid + search hidden-aware</name>
  <files>
    apps/web/src/components/help/help.config.ts
    apps/web/src/components/help/HelpCategoryGrid.tsx
    apps/web/src/components/search/searchProviders.ts
  </files>
  <action>
    Mechanism chosen: an optional `hidden?: boolean` flag on the category (flag > manifest removal > comment-out). This is the least-destructive option — content stays in source and the Financials category is restored by deleting one line. Filtering is centralized so no route page needs to change.

    In `apps/web/src/components/help/help.config.ts`:
    1. Add an optional field to the `HelpCategory` interface:
       ```ts
       /** When true, the category is hidden from index, category/article pages, and search. Content is preserved for later restoration. */
       hidden?: boolean
       ```
    2. On the existing Financials category object (slug: "financials", name: "Financials"), add `hidden: true,` immediately after the `slug: "financials",` line. Do NOT remove, reorder, or comment out any of its articles — leave all article content intact.
    3. Make the lookup helpers treat hidden categories as absent so the category and article route pages naturally 404:
       - In `getCategoryBySlug`, return undefined when the matched category is hidden:
         ```ts
         export function getCategoryBySlug(slug: string): HelpCategory | undefined {
           const category = HELP_CATEGORIES.find((cat) => cat.slug === slug)
           if (!category || category.hidden) return undefined
           return category
         }
         ```
         (Note: `getArticleBySlug` already calls `getCategoryBySlug`, so it inherits the hidden behavior automatically — do not duplicate the check there.)
       - In `getAllArticles`, exclude hidden categories from the flattened list so search indexing never surfaces them:
         ```ts
         export function getAllArticles(): Array<HelpArticle & { categorySlug: string; categoryName: string }> {
           return HELP_CATEGORIES.filter((category) => !category.hidden).flatMap((category) =>
             category.articles.map((article) => ({
               ...article,
               categorySlug: category.slug,
               categoryName: category.name,
             }))
           )
         }
         ```

    In `apps/web/src/components/help/HelpCategoryGrid.tsx`:
    4. Filter hidden categories out of the index grid. Change `{HELP_CATEGORIES.map((category) => {` to first exclude hidden ones, e.g.:
       ```tsx
       {HELP_CATEGORIES.filter((category) => !category.hidden).map((category) => {
       ```

    In `apps/web/src/components/search/searchProviders.ts`:
    5. In `createHelpProvider`, the category list is built from `HELP_CATEGORIES.map(...)` and the href map is built from `HELP_CATEGORIES.map(...)`. Filter hidden categories out of BOTH so the command palette never lists the Financials category:
       - In the `helpItems` array, change `...HELP_CATEGORIES.map((category) => ({` to `...HELP_CATEGORIES.filter((c) => !c.hidden).map((category) => ({`
       - In the `hrefMap` object, change `HELP_CATEGORIES.map((cat) => [...])` to `HELP_CATEGORIES.filter((cat) => !cat.hidden).map((cat) => [...])`
       - The two `getAllArticles()` calls in this function (in `helpItems` and in `hrefMap`) need no change — `getAllArticles()` already excludes hidden categories after step 3.

    Constraints: TypeScript strict, no `any`. Touch only the Financials category and the shared filtering logic; do not alter any other category's data. `git diff` must show only these three files.
  </action>
  <verify>
    From apps/web run `npx tsc --noEmit` (expect no NEW errors in the three touched files; the repo has a known ~35-error baseline — only regressions in touched files matter).
    From apps/web run `npx next build` and confirm it completes without errors.
    Grep confirmation that the flag is present and filters are applied:
      - `hidden: true` appears exactly once in help.config.ts (on Financials).
      - `category.hidden` / `!c.hidden` / `!cat.hidden` filters appear in help.config.ts, HelpCategoryGrid.tsx, and searchProviders.ts.
    Manual (or note for reviewer): /help shows 5 category cards (no Financials); /help/financials renders the 404 page; /help/financials/logging-expenses renders the 404 page; Cmd+K search for "financ", "expense", and "invoice" returns no Financials category or Financials article rows.
  </verify>
  <done>
    - Financials category card absent from /help index grid.
    - /help/financials and all /help/financials/<article> URLs return notFound (404).
    - Command-palette search for "financ"/"expense"/"invoice" surfaces no Financials help category or articles.
    - All other five categories unchanged and still functional.
    - Financials content remains in help.config.ts, restorable by removing the `hidden: true` line.
    - `next build` clean; `git diff` limited to the three help-content/config files.
  </done>
</task>

</tasks>

<verification>
1. `npx next build` (from apps/web) completes clean.
2. `npx tsc --noEmit` shows no new errors in the three touched files.
3. /help index has no Financials card; /help/financials and its article URLs 404; Cmd+K search for "financ"/"expense"/"invoice" surfaces no Financials help results.
4. `git diff --name-only` lists only: help.config.ts, HelpCategoryGrid.tsx, searchProviders.ts.
</verification>

<success_criteria>
- The Financials help category is hidden from index, category page, article pages, and command-palette search.
- Hidden via a single restorable `hidden: true` flag (no content deleted).
- No other help category affected; no carrier routes, schema, or APIs touched.
- TypeScript strict satisfied (no `any`); build clean.
</success_criteria>

<output>
After completion, create `.planning/quick/445-hide-financials-help-center-category-fro/445-SUMMARY.md`
</output>
