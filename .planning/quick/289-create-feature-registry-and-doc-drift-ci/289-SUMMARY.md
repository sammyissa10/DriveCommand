---
phase: quick-289
plan: 01
subsystem: documentation
tags:
  - feature-registry
  - ci
  - documentation
  - zod-validation
dependency_graph:
  requires: []
  provides:
    - feature-registry-schema
    - feature-registry
    - doc-drift-check
  affects:
    - ci-workflows
tech_stack:
  added:
    - zod-validation
  patterns:
    - code-as-data
    - two-pass-validation
    - ci-enforcement
key_files:
  created:
    - apps/web/src/lib/docs/feature-registry-schema.ts
    - apps/web/src/lib/docs/feature-registry.ts
    - apps/web/src/lib/docs/get-features.ts
    - apps/web/scripts/check-doc-drift.ts
    - docs-content/client/.gitkeep
    - docs-content/sysadmin/.gitkeep
    - .github/workflows/doc-drift.yml
  modified:
    - apps/web/package.json
decisions:
  - choice: TypeScript code-as-data registry (not Postgres table)
    rationale: Build-time validation via Zod catches errors before runtime, no migrations/RLS needed for config data, CI can enforce doc coverage without database access
  - choice: Split client/sysadmin doc folders
    rationale: Different audiences with different needs (plain-English how-to vs technical details), easier to maintain and review than conditional sections
  - choice: Two-pass validation (Zod + reference check)
    rationale: Zod validates field structure, second pass validates relatedFeatureSlugs integrity across features
  - choice: 90-day staleness warning (not error)
    rationale: Encourages regular doc reviews without blocking deployments
metrics:
  duration: 180s
  tasks_completed: 3
  files_created: 7
  files_modified: 1
  commits: 3
  completed_date: 2026-05-09
---

# Quick Task 289: Create Feature Registry and Doc-Drift CI Check

**One-liner:** Zod-validated TypeScript feature registry with 6 seed entries, synchronous read helpers, CI script enforcing MDX doc coverage, and GitHub Action blocking PRs with missing docs.

## What Was Built

Created foundational infrastructure for in-app documentation system where every user-facing feature is registered once and drives both client Help Center and SysAdmin knowledge base, with CI enforcing required docs exist.

### Task 1: Zod Schema, Registry, and Read Helpers
**Commit:** `0336e8a2`
**Files:**
- `apps/web/src/lib/docs/feature-registry-schema.ts` — Zod enums (Portal, Category, PlanTier, Status) + FeatureSchema with 11+ validated fields including slugSchema rejecting non-kebab-case with descriptive error
- `apps/web/src/lib/docs/feature-registry.ts` — 6 seed features (load-management, route-planning, driver-my-route, ai-document-reader, tenant-management, support-tickets) with two-pass validation (Zod + relatedFeatureSlugs integrity check)
- `apps/web/src/lib/docs/get-features.ts` — 6 pure synchronous helpers: getAllFeatures, getFeatureBySlug, getFeaturesByPortal, getFeaturesByCategory, getFeaturesByPlan (tier-inclusive), getRelatedFeatures

**Key validation features:**
- Slug regex: `/^[a-z0-9]+(-[a-z0-9]+)*$/` with message "Slug must be lowercase kebab-case"
- Second-pass validation throws with all broken relatedFeatureSlugs listed
- semver validation for addedInVersion
- ISO datetime validation for lastDocReviewedAt

### Task 2: Doc-Drift CI Script and Directories
**Commit:** `e24c0bbe`
**Files:**
- `apps/web/scripts/check-doc-drift.ts` — Node-only script checking stable/beta features for required MDX files, exits 1 if missing, warns (exit 0) for docs >90 days old
- `docs-content/client/.gitkeep` — Client-facing docs directory
- `docs-content/sysadmin/.gitkeep` — SysAdmin technical docs directory
- `apps/web/package.json` — Added "check:docs" npm script

**Current state:** Reports 11 missing docs (5 client + 6 sysadmin) as expected.

### Task 3: GitHub Action Workflow
**Commit:** `d108a3ee`
**Files:**
- `.github/workflows/doc-drift.yml` — PR workflow triggering on changes to `apps/web/src/lib/docs/**`, `docs-content/**`, `apps/web/src/app/**`

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

All verification steps passed:

1. TypeScript compiles with no errors in new files
2. Registry loads without Zod errors
3. `npm run check:docs` reports 11 missing files and exits 1
4. Invalid slug "Load Management" rejected with "lowercase kebab-case" message
5. Second-pass validation catches broken relatedFeatureSlugs
6. All 6 read helpers work correctly:
   - getAllFeatures: 6 features
   - getFeatureBySlug: finds by slug
   - getFeaturesByPortal(owner): 4 features (includes 'shared')
   - getFeaturesByCategory(dispatch): 3 features
   - getFeaturesByPlan(pro): 4 features (free + starter + pro)
   - getRelatedFeatures(load-management): 2 features (route-planning, driver-my-route)

## Next Steps

1. Add feature entries as new features ship
2. Create corresponding MDX files in docs-content/client and docs-content/sysadmin
3. Build Help Center UI consuming these helpers
4. Build SysAdmin knowledge base UI
5. Consider adding `relatedRoutes` field for deep linking in docs

## Self-Check: PASSED

**Created files exist:**
```
FOUND: apps/web/src/lib/docs/feature-registry-schema.ts
FOUND: apps/web/src/lib/docs/feature-registry.ts
FOUND: apps/web/src/lib/docs/get-features.ts
FOUND: apps/web/scripts/check-doc-drift.ts
FOUND: docs-content/client/.gitkeep
FOUND: docs-content/sysadmin/.gitkeep
FOUND: .github/workflows/doc-drift.yml
```

**Modified files exist:**
```
FOUND: apps/web/package.json (check:docs script added)
```

**Commits exist:**
```
FOUND: 0336e8a2 (Task 1: Zod schema + registry + helpers)
FOUND: e24c0bbe (Task 2: CI script + directories)
FOUND: d108a3ee (Task 3: GitHub Action)
```
