---
phase: quick-447
plan: 447
subsystem: help-center
tags: [help, copy, terminology, trips, loads]
dependency_graph:
  requires: []
  provides: [help-center-trips-articles]
  affects: [help.config.ts]
tech_stack:
  added: []
  patterns: [stub-article-pattern]
key_files:
  created: []
  modified:
    - apps/web/src/components/help/help.config.ts
decisions:
  - "Kept slug 'loads-and-dispatches' unchanged to preserve all existing help article links"
  - "Kept article slug 'dispatch-workflow' unchanged while renaming its title to 'Understanding the trip workflow'"
  - "Swept only user-facing copy (title/preview/keywords) — no MDX body files created (stubs pattern)"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-15T21:01:18Z"
  tasks_completed: 2
  files_modified: 1
---

# Phase quick-447: Add Trips Documentation and Align Help Center Copy Summary

Renamed the "Loads & Dispatches" Help Center category to "Loads & Trips" and added 7 new trip-focused article stubs, aligning help copy with the "Trip" terminology introduced in quick-403.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename category and sweep dispatch->trip copy | 54230216 | apps/web/src/components/help/help.config.ts |
| 2 | Add 7 new Trips article stubs | eff763da | apps/web/src/components/help/help.config.ts |

## What Was Built

### Task 1 — Category rename and copy sweep

- `name`: "Loads & Dispatches" → "Loads & Trips"
- `description`: Updated to include "build trips" phrasing
- `dispatch-workflow` article title: "Understanding the dispatch workflow" → "Understanding the trip workflow"
- `dispatch-workflow` keywords: `["dispatch", ...]` → `["trip", ...]`
- `assigning-driver-to-load` keywords: `"dispatch"` → `"trip"`
- Category slug `loads-and-dispatches` preserved — no link breakage
- Article slug `dispatch-workflow` preserved — no link breakage
- Routes category (uses "dispatch" legitimately for route templates) — untouched

### Task 2 — 7 new Trips article stubs

Added to the `articles` array of the loads-and-dispatches category after the original 15:

| Slug | Title |
|------|-------|
| what-is-a-trip | What is a trip? |
| creating-a-trip | Creating a trip |
| assigning-driver-and-truck | Assigning a driver and truck |
| following-stop-timeline | Following the stop timeline |
| completing-and-skipping-stops | Completing and skipping stops |
| understanding-trip-status | Understanding trip status |
| editing-a-trip | Editing a trip |

Category total: 22 articles (15 original + 7 new). Each renders at `/help/loads-and-dispatches/<slug>` via the existing stub article page layout.

## Verification Results

- `Loads & Trips` confirmed as category name; slug `loads-and-dispatches` unchanged
- No user-facing "dispatch"/"Dispatch"/"Dispatches" remains in the loads-and-dispatches category copy (titles, previews, keywords)
- Remaining `dispatch` occurrences in file are: slug field (line 109), article slug `dispatch-workflow` (line 145), and routes category — all intentionally preserved
- 7 new article slugs present and unique, no collisions with existing slugs
- `tsc --noEmit` introduced zero new TypeScript errors
- No DC- prefixes added; no MDX/body files created; no app routes, schema, or APIs touched
- Hidden Financials category and all other categories unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/components/help/help.config.ts` modified and exists: FOUND
- Commit 54230216: FOUND
- Commit eff763da: FOUND
