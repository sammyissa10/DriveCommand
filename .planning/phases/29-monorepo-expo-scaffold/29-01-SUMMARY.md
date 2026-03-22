---
phase: 29-monorepo-expo-scaffold
plan: "01"
subsystem: infra
tags: [turborepo, monorepo, npm-workspaces, nextjs, typescript]

# Dependency graph
requires: []
provides:
  - Turborepo monorepo root with npm workspaces
  - Next.js web app relocated to apps/web/
  - Stub shared packages: @drivecommand/types, @drivecommand/validation, @drivecommand/api-client
  - apps/mobile/ directory ready for React Native / Expo scaffold
affects:
  - 29-02 (Expo scaffold goes into apps/mobile/)
  - all future phases (all paths now relative to apps/web/)
  - Vercel deployment (root dir must be updated to apps/web/)

# Tech tracking
tech-stack:
  added: [turbo@^2.0.0, npm workspaces]
  patterns: [monorepo workspace, turbo pipeline, workspace package stubs]

key-files:
  created:
    - package.json (root workspace root)
    - turbo.json (build/dev/lint/test pipeline)
    - tsconfig.json (root base config)
    - packages/types/package.json
    - packages/validation/package.json
    - packages/api-client/package.json
    - packages/types/src/
    - packages/validation/src/
    - packages/api-client/src/
    - apps/mobile/ (empty scaffold dir)
  modified:
    - apps/web/package.json (renamed to @drivecommand/web, added workspace deps)
    - .gitignore (added monorepo artifact paths)
    - package-lock.json (regenerated for workspaces)

key-decisions:
  - "npm workspaces chosen over pnpm — project already uses npm, zero toolchain change"
  - "turbo@^2.0.0 installed at root only — web app does not need turbo as a direct dep"
  - ".env copied (not symlinked) to apps/web/ — Vercel reads from app root, both locations needed"
  - "apps/web/ files NOT changed internally — only the directory they live in changed"

patterns-established:
  - "All web app work happens inside apps/web/ — never edit src/ at repo root"
  - "Shared packages installed with '*' version specifier for workspace resolution"
  - "turbo run build --filter=@drivecommand/web to build web app from monorepo root"

# Metrics
duration: 5min
completed: 2026-03-22
---

# Phase 29 Plan 01: Turborepo Setup + Web App Migration Summary

**Turborepo monorepo with npm workspaces — existing Next.js app migrated to apps/web/, stub shared packages created, build verified passing**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-22T22:24:37Z
- **Completed:** 2026-03-22T22:29:04Z
- **Tasks:** 10
- **Files modified:** 530 (mostly renames — git tracked all as renames)

## Accomplishments
- Converted flat single-repo to Turborepo monorepo with npm workspaces
- Moved all Next.js app files into apps/web/ — zero internal file changes, all imports still work
- Created root workspace config (package.json, turbo.json, tsconfig.json)
- Created stub packages for @drivecommand/types, @drivecommand/validation, @drivecommand/api-client
- Verified Next.js build passes from apps/web/ — all 26 static pages generate successfully
- Updated .gitignore with monorepo artifact paths

## Task Commits

All tasks committed as a single atomic migration commit:

1. **Tasks 1-10: Full monorepo migration** - `e3435ba` (chore)

## Files Created/Modified

- `package.json` — Root workspace manifest (drivecommand-monorepo, npm workspaces)
- `turbo.json` — Turbo pipeline config for build/dev/lint/test tasks
- `tsconfig.json` — Root base TypeScript config
- `packages/types/package.json` — @drivecommand/types stub
- `packages/validation/package.json` — @drivecommand/validation stub
- `packages/api-client/package.json` — @drivecommand/api-client stub
- `apps/web/package.json` — Renamed to @drivecommand/web, workspace deps added
- `.gitignore` — Added monorepo artifact exclusions

## Decisions Made
- npm workspaces chosen over pnpm — project already uses npm, zero toolchain disruption
- turbo@^2.0.0 installed at workspace root only — individual apps don't need it
- .env copied (not symlinked) to apps/web/ — Vercel reads env from app root at deploy time
- All file content inside apps/web/src/ left completely unchanged — only directory location changed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Vercel project settings must be updated before next deployment:**
1. Go to your Vercel project settings
2. Navigate to **Settings → General → Root Directory**
3. Set Root Directory to: `apps/web`
4. Save and redeploy

Without this change, Vercel will try to build from the repo root (which is now the workspace root, not the Next.js app).

## Self-Check: PASSED

- apps/web/src: FOUND
- apps/web/prisma: FOUND
- apps/web/package.json: FOUND
- apps/web/next.config.ts: FOUND
- apps/web/tsconfig.json: FOUND
- apps/mobile: FOUND
- packages/types/package.json: FOUND
- packages/validation/package.json: FOUND
- packages/api-client/package.json: FOUND
- turbo.json: FOUND
- package.json: FOUND
- tsconfig.json: FOUND
- commit e3435ba: FOUND

## Next Phase Readiness

- Monorepo scaffold is complete and ready
- apps/mobile/ directory exists and is ready for Expo scaffold (Plan 29-02)
- Shared packages are stubs — they need src/index.ts files in later plans
- **REMINDER: Update Vercel Root Directory to apps/web/ before deploying**

---
*Phase: 29-monorepo-expo-scaffold*
*Completed: 2026-03-22*
