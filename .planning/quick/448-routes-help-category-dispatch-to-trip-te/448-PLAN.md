# Quick Task 448 — Routes Help Category Dispatch→Trip Terminology Sweep

## Goal
Replace all remaining user-facing "dispatch"/"dispatching" wording in the Routes help category with "trip"/"generating trips". Preserve slugs (URL identifiers) and all "route"/"route template" wording.

## File to Modify
- `apps/web/src/components/help/help.config.ts` — Routes category (lines 249–291)

## Tasks

### Task 1: Fix "dispatching-from-route" article
- title: "Dispatching from a route" → "Generating trips from a route"
- preview: "Turn a route template into an active load." → "Turn a route template into active trips."
- keywords: replace "dispatch" keyword entry with "trip" / "generate trip"
- Slug stays as-is (URL identifier, not user-facing copy)

### Task 2: Fix "route-scheduling" article
- preview: "Automate recurring dispatches on a schedule." → "Automate recurring trips on a schedule."

## Verification
- No user-facing "dispatch"/"dispatching" remains in Routes category
- "route"/"route template" wording preserved
- TypeScript clean (no new errors introduced)
- Only Routes category articles touched
