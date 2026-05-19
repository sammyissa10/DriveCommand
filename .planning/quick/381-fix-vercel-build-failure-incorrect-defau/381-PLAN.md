---
phase: quick-381
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/user/grid-views/[gridId]/route.ts
  - apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
autonomous: true

must_haves:
  truths:
    - "Vercel/Turbopack build no longer fails with 'Export default doesn't exist in target module' for prisma in grid-views routes"
    - "Both grid-views route files import prisma as a named export"
    - "No file in apps/web imports prisma as a default export from @/lib/db/prisma"
    - "TypeScript compilation passes with no new errors introduced by this change"
  artifacts:
    - path: "apps/web/src/app/api/user/grid-views/[gridId]/route.ts"
      provides: "Grid view collection API route with corrected named prisma import"
      contains: "import { prisma } from '@/lib/db/prisma'"
    - path: "apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts"
      provides: "Grid view item API route with corrected named prisma import"
      contains: "import { prisma } from '@/lib/db/prisma'"
  key_links:
    - from: "apps/web/src/app/api/user/grid-views/[gridId]/route.ts"
      to: "apps/web/src/lib/db/prisma.ts"
      via: "named import { prisma }"
      pattern: "import \\{ prisma \\} from '@/lib/db/prisma'"
    - from: "apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts"
      to: "apps/web/src/lib/db/prisma.ts"
      via: "named import { prisma }"
      pattern: "import \\{ prisma \\} from '@/lib/db/prisma'"
---

<objective>
Fix Vercel/Turbopack build failure caused by two grid-views API routes incorrectly importing `prisma` as a default export from `@/lib/db/prisma`. The module only exports `prisma` as a named export (verified: `export const prisma = ...` at line 44 of `apps/web/src/lib/db/prisma.ts`).

Purpose: Restore the production build so deploys can proceed.
Output: Two route files updated to use the correct named import; no other files affected; type-check clean.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/lib/db/prisma.ts
@apps/web/src/app/api/user/grid-views/[gridId]/route.ts
@apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts

# Verified scope (pre-planning grep across apps/web):
# Only 2 files match `import prisma from '@/lib/db/prisma'` — the same 2 files
# called out in the task description. No additional files require fixing.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix default prisma imports in both grid-views route files</name>
  <files>
    apps/web/src/app/api/user/grid-views/[gridId]/route.ts
    apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
  </files>
  <action>
    In both files, change line 9 from:
      `import prisma from '@/lib/db/prisma';`
    to:
      `import { prisma } from '@/lib/db/prisma';`

    DO NOT modify any other lines, any other imports, or any business logic in these files.
    DO NOT add a default export to `apps/web/src/lib/db/prisma.ts` — the named export is the correct pattern and is used by 100+ other files in the codebase.
    DO NOT use `@ts-ignore` or `as any` anywhere.

    Rationale: `apps/web/src/lib/db/prisma.ts` exports `prisma` as `export const prisma = ...` (named export, line 44). It has no `export default`. The default import currently used by these two route files is what triggers the Turbopack error: "Export default doesn't exist in target module."

    Pre-flight check (already done during planning): a grep across `apps/web` for `import prisma from '@/lib/db/prisma'` returns exactly these 2 files. No additional default-import offenders exist.

    Post-edit re-verification (perform during execution):
    Run a grep from `apps/web` for the pattern `import prisma from ['\"]@/lib/db/prisma['\"]` and confirm 0 matches. If any new matches appear, fix them with the same named-import change.
  </action>
  <verify>
    1. `grep -rn "import prisma from '@/lib/db/prisma'" apps/web/src` returns no matches.
    2. `grep -n "import { prisma } from '@/lib/db/prisma'" apps/web/src/app/api/user/grid-views/[gridId]/route.ts` returns line 9.
    3. `grep -n "import { prisma } from '@/lib/db/prisma'" apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts` returns line 9.
    4. From `apps/web`, run `npx tsc --noEmit`. It must complete without introducing new errors related to the `prisma` symbol in either of these two files. (Pre-existing unrelated type errors elsewhere in the repo, if any, are out of scope — only confirm no NEW errors caused by this change.)
  </verify>
  <done>
    - Both grid-views route files use `import { prisma } from '@/lib/db/prisma';` on line 9.
    - No file in `apps/web/src` imports prisma as a default export from that module.
    - `npx tsc --noEmit` in `apps/web` shows no new errors caused by this change.
    - No default export was added to `apps/web/src/lib/db/prisma.ts`.
    - No other lines, files, or business logic were modified.
  </done>
</task>

</tasks>

<verification>
- Final grep sweep: `import prisma from '@/lib/db/prisma'` has zero occurrences in `apps/web/src`.
- Both target files compile and use the named import.
- `npx tsc --noEmit` from `apps/web` does not surface any new errors attributable to this change.
- The Turbopack "Export default doesn't exist in target module" error for these two routes is resolved (the next Vercel build should no longer fail on these files).
</verification>

<success_criteria>
- Both grid-views route files use the named import `{ prisma }` on line 9.
- A repo-wide grep for the offending default-import pattern returns 0 matches in `apps/web/src`.
- TypeScript compilation in `apps/web` produces no new errors from this change.
- `apps/web/src/lib/db/prisma.ts` is unchanged (still named export only).
- No use of `@ts-ignore` or `as any` introduced.
</success_criteria>

<output>
After completion, create `.planning/quick/381-fix-vercel-build-failure-incorrect-defau/381-SUMMARY.md` documenting:
- Files changed (2) with before/after of line 9
- Confirmation that no other default-import offenders were found
- `tsc --noEmit` result
- Confirmation that `prisma.ts` was not modified
</output>
