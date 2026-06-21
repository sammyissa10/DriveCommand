---
phase: quick-447
plan: 447
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/help/help.config.ts
autonomous: true

must_haves:
  truths:
    - "The Help Center category formerly named 'Loads & Dispatches' now displays as 'Loads & Trips'"
    - "The category URL slug remains 'loads-and-dispatches' so existing links do not break"
    - "No user-facing copy in the Loads & Trips category says 'dispatch' or 'Dispatches' (titles, previews, descriptions)"
    - "The category now contains the original 15 articles plus 7 new Trips articles (22 total)"
    - "The 7 new Trips articles render at /help/loads-and-dispatches/<slug> with title + preview, matching the existing stub article layout"
    - "Other categories (Getting Started, Routes, Drivers & Fleet, hidden Financials, Integrations) are unchanged"
  artifacts:
    - path: "apps/web/src/components/help/help.config.ts"
      provides: "Renamed category, dispatch->trip copy sweep, 7 new Trips article stubs"
      contains: "Loads & Trips"
  key_links:
    - from: "help.config.ts category slug"
      to: "/help/loads-and-dispatches route"
      via: "slug field unchanged"
      pattern: "slug: \"loads-and-dispatches\""
---

<objective>
Align the Help Center with the product's "Trip" terminology for the Loads & Dispatches category, and add 7 new Trips articles.

Rename the category display name from "Loads & Dispatches" to "Loads & Trips" while keeping its slug (`loads-and-dispatches`) so existing links keep working. Sweep all user-facing copy in that category to replace "dispatch"/"Dispatches" with "trip"/"Trips" (titles, previews, keywords, and the category description). Fix the "Understanding the dispatch workflow" article specifically. Add 7 new Trips article stubs in the same voice and shape as the existing ones.

Purpose: The app UI already uses "Trip" instead of "Dispatch" (Phase quick-403 renamed CarrierDispatch -> Trip). The Help Center is now out of sync, confusing carrier owners.
Output: An updated `help.config.ts` with the renamed category, dispatch->trip copy sweep, and 7 new article stubs.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/help/help.config.ts
@apps/web/src/app/(owner)/help/[categoryOrSlug]/[article]/page.tsx

# IMPORTANT — Step 0 findings (architecture reality, do NOT contradict):
# - Help Center article BODIES DO NOT EXIST. There are no MDX/markdown body files
#   for these articles. The article page (page.tsx above) renders a hardcoded stub:
#   "Article content coming soon." followed by the article's `preview` field.
# - The ONLY user-facing per-article copy lives in help.config.ts as three fields per
#   article: `title`, `preview`, and `keywords` (HelpArticle interface, lines 22-31).
# - Therefore "sweeping article bodies" = editing title/preview/keywords in help.config.ts.
#   Do NOT invent a body storage location or create MDX files.
# - The string "DC-" / "DC-2026-xxxxx" does NOT appear anywhere in help.config.ts, so no
#   trip-number prefix is at risk. Do not add any.
# - The category to change is at lines ~108-205: slug "loads-and-dispatches",
#   name "Loads & Dispatches", description "Create loads, assign drivers, and track deliveries.",
#   containing 15 article stubs.
# - Category names/counts are NOT hardcoded in route pages; they all derive from
#   help.config.ts via getCategoryBySlug / getArticleCount. Editing the config is sufficient.
# - The hidden "financials" category (line ~318) and all OTHER categories must NOT be touched.
# - The .docs-data/admin-docs-search-index.json file is a SEPARATE sysadmin docs index
#   (internal taxonomy with category:"dispatch"); it is OUT OF SCOPE. Do not edit it.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename category and sweep dispatch->trip copy in the loads-and-dispatches category</name>
  <files>apps/web/src/components/help/help.config.ts</files>
  <action>
    Edit ONLY the category whose `slug` is "loads-and-dispatches" (the object starting near line 108). Do NOT change the slug.

    1. Rename `name: "Loads & Dispatches"` to `name: "Loads & Trips"`.
    2. Update `description: "Create loads, assign drivers, and track deliveries."` to read naturally with trip terminology, e.g. `description: "Create loads, build trips, assign drivers, and track deliveries."` (keep it one short line, warm plain-English tone matching other categories).
    3. Fix the dispatch-workflow article (slug "dispatch-workflow", ~line 144). Keep its slug unchanged. Change:
       - title: "Understanding the dispatch workflow" -> "Understanding the trip workflow"
       - preview: keep the meaning ("Learn how loads flow from creation to delivery.") — no "dispatch" present, fine as-is or refine to mention trips.
       - keywords: replace "dispatch" with "trip" -> ["trip", "workflow", "process", "lifecycle"]
    4. Sweep the remaining 14 existing articles in this category for the word "dispatch"/"Dispatch"/"Dispatches" in their `title`, `preview`, and `keywords` and replace with the trip equivalent. Known occurrence: the "assigning-driver-to-load" article has keyword "dispatch" -> change to "trip". Scan every article object in this category and replace any user-facing "dispatch" with "trip" (preserve grammar/casing).
    5. Do NOT touch the "routes" category (it legitimately uses "dispatch"/"dispatching" for route templates and is OUT OF SCOPE per the task — only the loads-and-dispatches category is in scope). Do NOT touch any other category.

    Preserve all existing article slugs (links must not break). Preserve the warm, plain-English voice.
  </action>
  <verify>
    From apps/web run: `grep -n "dispatch" src/components/help/help.config.ts`
    Confirm NO matches remain inside the loads-and-dispatches category block (matches inside the separate "routes" category are expected and allowed).
    Confirm `grep -n "Loads & Trips" src/components/help/help.config.ts` returns the renamed category, and `grep -n "loads-and-dispatches" src/components/help/help.config.ts` still shows the unchanged slug.
  </verify>
  <done>
    The loads-and-dispatches category displays as "Loads & Trips", its slug is unchanged, the workflow article is "Understanding the trip workflow", and no user-facing "dispatch" copy remains in that category's articles or description.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add 7 new Trips article stubs to the Loads & Trips category</name>
  <files>apps/web/src/components/help/help.config.ts</files>
  <action>
    Append 7 new HelpArticle objects to the `articles` array of the loads-and-dispatches (now "Loads & Trips") category, after the existing 15. Match the exact HelpArticle shape (slug, title, preview, keywords) and the warm plain-English voice of the surrounding stubs. Use these 7 articles (slugs must be unique kebab-case and not collide with existing slugs):

    1. slug: "what-is-a-trip", title: "What is a trip?", preview: "A plain-English intro to trips and how they organize your loads.", keywords: ["trip", "what is", "definition", "overview"]
    2. slug: "creating-a-trip", title: "Creating a trip", preview: "Step-by-step guide to building a new trip.", keywords: ["create trip", "new trip", "add trip", "build trip"]
    3. slug: "assigning-driver-and-truck", title: "Assigning a driver and truck", preview: "Match the right driver and truck to each trip.", keywords: ["assign driver", "assign truck", "trip assignment", "driver", "truck"]
    4. slug: "following-stop-timeline", title: "Following the stop timeline", preview: "Watch a trip progress through its pickups and deliveries.", keywords: ["stop timeline", "stops", "progress", "pickups", "deliveries"]
    5. slug: "completing-and-skipping-stops", title: "Completing and skipping stops", preview: "Mark stops done or skip them when plans change.", keywords: ["complete stop", "skip stop", "stops", "update stop"]
    6. slug: "understanding-trip-status", title: "Understanding trip status", preview: "What each trip status means and how trips move between them.", keywords: ["trip status", "status", "lifecycle", "in progress", "completed"]
    7. slug: "editing-a-trip", title: "Editing a trip", preview: "Update stops, assignments, or details on an existing trip.", keywords: ["edit trip", "modify trip", "update trip", "change trip"]

    Do NOT add any "DC-" trip-number prefixes. Do NOT create body files — these are stubs rendered by the existing article page exactly like the other articles.
  </action>
  <verify>
    From apps/web run: `npx tsc --noEmit -p .` and confirm no NEW type errors are introduced in help.config.ts (baseline pre-existing errors are acceptable per project TS baseline).
    Confirm `grep -c "slug:" src/components/help/help.config.ts` reflects 7 additional article slugs in the loads-and-dispatches category (the category now has 22 articles total).
    Spot-check each of the 7 new slugs exists exactly once and is unique.
  </verify>
  <done>
    The Loads & Trips category contains 22 articles (original 15 + 7 new Trips articles), each new article has slug/title/preview/keywords, no DC- prefixes, no duplicate slugs, and getArticleCount("loads-and-dispatches") would return 22. Each new article renders at /help/loads-and-dispatches/<slug> using the existing stub article layout.
  </done>
</task>

</tasks>

<verification>
- `Loads & Trips` appears as the category name; `loads-and-dispatches` slug unchanged.
- No user-facing "dispatch"/"Dispatches" copy remains in the loads-and-dispatches category (routes category untouched).
- "Understanding the trip workflow" article present (slug "dispatch-workflow" preserved).
- 7 new Trips article stubs added; category total = 22 articles.
- No DC- prefixes added anywhere.
- Other categories (incl. hidden Financials) unchanged.
- No new TypeScript errors introduced.
- No MDX/body files created; no app routes, schema, or APIs touched.
</verification>

<success_criteria>
- Visiting /help shows the category labeled "Loads & Trips".
- Visiting /help/loads-and-dispatches lists 22 articles with no "dispatch" wording.
- Visiting /help/loads-and-dispatches/what-is-a-trip (and the other 6 new slugs) renders the article page with the correct title and preview.
- Existing article links (e.g. /help/loads-and-dispatches/dispatch-workflow) still resolve.
</success_criteria>

<output>
After completion, create `.planning/quick/447-add-trips-documentation-and-align-dispat/447-SUMMARY.md`
</output>
