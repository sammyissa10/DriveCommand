---
phase: quick-291
plan: 01
subsystem: help-center
tags: [documentation, search, mdx, feedback, help]
dependency-graph:
  requires: [quick-290]
  provides: [help-center-ui, doc-feedback-collection]
  affects: [owner-portal]
tech-stack:
  added: [fuse.js, cmdk]
  patterns: [mdx-rendering, fuzzy-search, feedback-widget]
key-files:
  created:
    - apps/web/src/components/help/HelpSearch.tsx
    - apps/web/src/components/help/HelpButton.tsx
    - apps/web/src/components/help/HelpSheet.tsx
    - apps/web/src/components/help/FeedbackWidget.tsx
    - apps/web/src/app/(owner)/help/layout.tsx
    - apps/web/src/app/(owner)/help/page.tsx
    - apps/web/src/app/(owner)/help/[slug]/page.tsx
    - apps/web/src/app/(owner)/help/whats-new/page.tsx
    - apps/web/src/actions/doc-feedback.ts
    - apps/web/scripts/build-search-index.ts
    - apps/web/src/lib/docs/search-index.json
    - apps/web/docs-content/client/load-management.mdx
    - apps/web/prisma/migrations/20260509000001_doc_feedback/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/package.json
decisions:
  - "Fuse.js with 0.3 threshold for fuzzy search (balances recall and precision)"
  - "Soft upgrade banners (not blocking) for plan-gated features"
  - "Yes votes submit immediately, No votes show comment form"
  - "Search index built at build-time (not runtime) for performance"
metrics:
  duration: 536s
  tasks_completed: 10
  files_created: 13
  files_modified: 2
  commits: 11
  completed_date: "2026-05-09T06:14:07Z"
---

# Quick 291: Build Client-Facing Help Center in Owner Portal

**One-liner:** Client-facing Help Center with Command+K fuzzy search (Fuse.js), MDX documentation rendering, plan-tier upgrade banners, and Yes/No feedback collection with DocFeedback model.

## Summary

Built a complete Help Center for fleet owners at `/owner/help` with fuzzy search (Command+K shortcut), MDX documentation rendering using the quick-290 component library, soft upgrade banners for plan-gated features, and Yes/No feedback collection stored in the new DocFeedback model.

## What Was Built

### Database Layer
- **DocFeedback model:** tenantId, userId, docSlug, helpful (boolean), comment (optional), createdAt
- **Idempotent migration:** RLS policies with tenant isolation and bypass
- **Indexes:** tenantId and docSlug for query performance

### Server Actions
- **submitDocFeedback:** Zod validation (docSlug 1-100 chars, comment max 1000 chars), RLS bypass transaction, structured error logging

### Search Infrastructure
- **build-search-index.ts:** Build-time script extracting slug/name/shortDescription/category from feature-registry
- **Package.json integration:** Search index rebuilt before every `next build`
- **search-index.json:** 5 initial entries (load-management, route-planning, driver-my-route, ai-document-reader, support-tickets)

### Components
- **HelpSearch:** Command+K dialog with Fuse.js fuzzy search (0.3 threshold), grouped results by category, routes to `/owner/help/[slug]`
- **HelpButton + HelpSheet:** Slide-over with contextQuery support, 8 result limit, browse link
- **FeedbackWidget:** Three-state flow (initial → comment if No → submitted), thumbs up/down voting, toast notifications

### Routes
- **layout.tsx:** Help Center header with HelpSearch component
- **page.tsx:** Category grid (dispatch, fleet, finance, CRM, compliance, AI, reporting, integrations, support, settings), quick links (What's New, Support, Video Tutorials stub)
- **[slug]/page.tsx:** MDX rendering with renderClientDoc, plan-tier comparison for upgrade banners (soft, not blocking), FeedbackWidget at bottom
- **whats-new/page.tsx:** Version-grouped changelog sorted by semantic version (newest first)

### Sample Documentation
- **load-management.mdx:** Demonstrates all MDX components (FeatureVideo, Callout, Steps, Accordion, RelatedFeatures), 5-minute read estimate

## Technical Highlights

1. **Fuzzy Search:** Fuse.js with 0.3 threshold searches across name, shortDescription, and category fields. Results grouped by category with human-readable labels.

2. **Command+K Shortcut:** Global keyboard shortcut toggles search dialog, standard UX pattern for documentation sites.

3. **Build-Time Index:** Search index generated at build time (not runtime) to avoid file system reads in serverless environment. Filters to client docs only (excludes admin portal).

4. **Plan Tier Logic:** Plan hierarchy comparison (free < starter < pro < business < enterprise) for soft upgrade banners. Shows "Upgrade to [tier]" with link to /owner/subscription, but does NOT block doc access.

5. **Feedback Flow:**
   - Yes vote → immediate DB write → submitted state
   - No vote → comment form → optional comment → DB write → submitted state
   - Server action returns `{ success: boolean; error?: string }` for consistent error handling

6. **MDX Integration:** Leverages quick-290 MDX component library (Callout, Steps, Accordion, RelatedFeatures, FeatureVideo) for rich documentation rendering.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Completed

- [x] Prisma schema valid with DocFeedback model
- [x] Migration file follows idempotent RLS pattern
- [x] Server action has Zod validation and proper auth
- [x] Search index builds from feature registry (5 entries)
- [x] Help Center routes created (layout, home, [slug], whats-new)
- [x] Command component installed (cmdk dependency)
- [x] Fuse.js installed and imported
- [x] All components created (HelpSearch, HelpButton, HelpSheet, FeedbackWidget)
- [x] Sample load-management.mdx demonstrates all MDX components
- [x] Prisma client regenerated with DocFeedback model

## Dependencies

**Requires:** quick-290 (MDX Component Library and Rendering Pipeline)

**Provides:**
- Help Center UI at `/owner/help`
- Doc feedback collection system
- Search infrastructure for documentation

**Affects:** Owner portal navigation (new Help menu item can be added)

## Next Steps

1. **Add Help menu item:** Add "Help Center" link to owner portal sidebar navigation
2. **Populate docs:** Create MDX files for remaining 4 features in search index (route-planning, driver-my-route, ai-document-reader, support-tickets)
3. **Analytics:** Track search queries and feedback to identify gaps in documentation
4. **HelpButton integration:** Add `<HelpButton contextQuery="loads" />` to relevant pages (e.g., loads page shows pre-filtered search)
5. **Video tutorials:** Replace "Coming soon" stub with actual video content
6. **SysAdmin reporting:** Create admin dashboard to view DocFeedback aggregates (helpful rate per doc, common improvement suggestions)

## Files Changed

**Created (13):**
- `apps/web/src/components/help/HelpSearch.tsx` — Command+K search dialog
- `apps/web/src/components/help/HelpButton.tsx` — Help icon button
- `apps/web/src/components/help/HelpSheet.tsx` — Slide-over search sheet
- `apps/web/src/components/help/FeedbackWidget.tsx` — Yes/No feedback with comments
- `apps/web/src/app/(owner)/help/layout.tsx` — Help Center layout
- `apps/web/src/app/(owner)/help/page.tsx` — Category grid home
- `apps/web/src/app/(owner)/help/[slug]/page.tsx` — MDX article rendering
- `apps/web/src/app/(owner)/help/whats-new/page.tsx` — Version changelog
- `apps/web/src/actions/doc-feedback.ts` — Feedback server action
- `apps/web/scripts/build-search-index.ts` — Search index builder
- `apps/web/src/lib/docs/search-index.json` — Generated search index
- `apps/web/docs-content/client/load-management.mdx` — Sample documentation
- `apps/web/prisma/migrations/20260509000001_doc_feedback/migration.sql` — DocFeedback table

**Modified (2):**
- `apps/web/prisma/schema.prisma` — Added DocFeedback model
- `apps/web/package.json` — Added fuse.js, cmdk, build:search-index script

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 1a49208a | Add DocFeedback model and migration |
| 2 | 66bfc236 | Create submitDocFeedback server action |
| 3 | 7ef0f413 | Create search index build script |
| 4 | 443ce2a3 | Install shadcn Command component and Fuse.js |
| 5 | f3e820d1 | Create sample load-management MDX doc |
| 6 | b5a7fbdf | Create HelpSearch component with Fuse.js |
| 7 | fe4953d7 | Create Help Center routes |
| 8 | e954d2e2 | Create HelpButton and HelpSheet components |
| 9 | 3ea2ab18 | Create FeedbackWidget component |
| 10 | 358dc8ac | Regenerate Prisma client with DocFeedback |

## Self-Check: PASSED

**Created files verified:**
```bash
✓ apps/web/src/components/help/HelpSearch.tsx
✓ apps/web/src/components/help/HelpButton.tsx
✓ apps/web/src/components/help/HelpSheet.tsx
✓ apps/web/src/components/help/FeedbackWidget.tsx
✓ apps/web/src/app/(owner)/help/layout.tsx
✓ apps/web/src/app/(owner)/help/page.tsx
✓ apps/web/src/app/(owner)/help/[slug]/page.tsx
✓ apps/web/src/app/(owner)/help/whats-new/page.tsx
✓ apps/web/src/actions/doc-feedback.ts
✓ apps/web/scripts/build-search-index.ts
✓ apps/web/src/lib/docs/search-index.json
✓ apps/web/docs-content/client/load-management.mdx
✓ apps/web/prisma/migrations/20260509000001_doc_feedback/migration.sql
```

**Commits verified:**
```bash
✓ 1a49208a (Task 1)
✓ 66bfc236 (Task 2)
✓ 7ef0f413 (Task 3)
✓ 443ce2a3 (Task 4)
✓ f3e820d1 (Task 5)
✓ b5a7fbdf (Task 6)
✓ fe4953d7 (Task 7)
✓ e954d2e2 (Task 8)
✓ 3ea2ab18 (Task 9)
✓ 358dc8ac (Task 10)
```

All artifacts present, all commits exist in git history.
