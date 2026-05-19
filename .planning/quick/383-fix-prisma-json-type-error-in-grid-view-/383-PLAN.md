---
phase: quick-383
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
  - apps/web/src/app/api/user/grid-views/[gridId]/route.ts
autonomous: true

must_haves:
  truths:
    - "Vercel/local `tsc --noEmit` passes from apps/web with zero errors"
    - "PUT /api/user/grid-views/[gridId]/[viewId] compiles with correct Prisma JSON type for `state`"
    - "POST /api/user/grid-views/[gridId] compiles with correct Prisma JSON type for `state`"
    - "No `any` and no `@ts-ignore` introduced"
  artifacts:
    - path: "apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts"
      provides: "PUT handler with `state: state as Prisma.InputJsonValue`"
      contains: "Prisma.InputJsonValue"
    - path: "apps/web/src/app/api/user/grid-views/[gridId]/route.ts"
      provides: "POST handler with `state: state as Prisma.InputJsonValue` (if same pattern exists)"
      contains: "Prisma.InputJsonValue"
  key_links:
    - from: "apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts"
      to: "@/generated/prisma"
      via: "import type { Prisma }"
      pattern: "import type \\{ Prisma \\} from '@/generated/prisma'"
    - from: "apps/web/src/app/api/user/grid-views/[gridId]/route.ts"
      to: "@/generated/prisma"
      via: "import type { Prisma }"
      pattern: "import type \\{ Prisma \\} from '@/generated/prisma'"
---

<objective>
Fix the Vercel build failure caused by an incorrect Prisma JSON type cast in two grid-view API routes. Prisma's `GridViewUpdateInput.state` / `GridViewCreateInput.state` expects `Prisma.InputJsonValue | Prisma.JsonNull | undefined`, but the routes currently cast `state` to `Record<string, unknown>`, which is not assignable to Prisma's JSON input types.

Purpose: Unblock the Vercel build by aligning the cast with Prisma's expected input type without changing validation boundaries or schema.

Output:
- Updated PUT handler in `[viewId]/route.ts` using `state as Prisma.InputJsonValue`
- Updated POST handler in `[gridId]/route.ts` using `state as Prisma.InputJsonValue`
- `Prisma` type imported from `@/generated/prisma` in both files
- `npx tsc --noEmit` passes cleanly from `apps/web`
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
@apps/web/src/app/api/user/grid-views/[gridId]/route.ts

# Confirmed import pattern used elsewhere in apps/web:
#   import { Prisma } from '@/generated/prisma';
# (e.g., apps/web/src/server/services/workflows/seedStarterPlaybooks.ts)
# For these route files, use a TYPE-only import since we only need the namespace
# for casting: `import type { Prisma } from '@/generated/prisma'`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Prisma JSON cast in both grid-view route files</name>
  <files>
    apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
    apps/web/src/app/api/user/grid-views/[gridId]/route.ts
  </files>
  <action>
Fix the incorrect Prisma JSON cast in both files.

**File 1: `apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts`**

1. Add a type-only Prisma import directly below the existing `import type { GridViewState } ...` line:
   ```ts
   import type { Prisma } from '@/generated/prisma';
   ```
   (Keep it as a separate `import type` line. Do NOT merge with the value-import of `prisma` from `@/lib/db/prisma` — that import is a runtime client, not the namespace.)

2. In the PUT handler (around line 90), replace:
   ```ts
   ...(state !== undefined && { state: state as unknown as Record<string, unknown> }),
   ```
   with:
   ```ts
   ...(state !== undefined && { state: state as Prisma.InputJsonValue }),
   ```

**File 2: `apps/web/src/app/api/user/grid-views/[gridId]/route.ts`**

1. Add the same type-only Prisma import directly below the existing `import type { GridViewState } ...` line:
   ```ts
   import type { Prisma } from '@/generated/prisma';
   ```

2. In the POST handler (around line 128), replace:
   ```ts
   state: state as unknown as Record<string, unknown>,
   ```
   with:
   ```ts
   state: state as Prisma.InputJsonValue,
   ```

**Constraints (HARD):**
- Do NOT introduce `any`.
- Do NOT add `@ts-ignore` or `@ts-expect-error`.
- Do NOT change the Zod / body validation shape — `state` stays typed as `GridViewState` at the request boundary.
- Do NOT change `prisma/schema.prisma` and do NOT create or run any migrations.
- Do NOT touch any other files (no DELETE/GET handler changes, no imports cleanup elsewhere).
- Keep the existing `prisma` runtime import (`import { prisma } from '@/lib/db/prisma'`) untouched.

**Why this cast direction:**
`Prisma.InputJsonValue` is Prisma's recursive JSON-compatible input type. `GridViewState` is a structured TS interface whose runtime value is JSON-compatible, so a single-step `as Prisma.InputJsonValue` cast is the correct, narrowest assertion. The previous `as unknown as Record<string, unknown>` cast went the wrong direction (Prisma does not accept `Record<string, unknown>` because it doesn't preserve JSON-leaf constraints).
  </action>
  <verify>
From the repo root:

```
cd apps/web
npx tsc --noEmit
```

Expected: exit code 0, no errors mentioning `GridViewUpdateInput`, `GridViewCreateInput`, or `state`.

Also grep to confirm the bad cast is gone and the new cast is present:

```
grep -n "state as unknown as Record" apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
grep -n "state as unknown as Record" apps/web/src/app/api/user/grid-views/[gridId]/route.ts
grep -n "Prisma.InputJsonValue"      apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
grep -n "Prisma.InputJsonValue"      apps/web/src/app/api/user/grid-views/[gridId]/route.ts
```

Expected:
- First two greps: no matches
- Last two greps: one match each
  </verify>
  <done>
- Both files import `Prisma` as a type from `@/generated/prisma`.
- Both occurrences of `state as unknown as Record<string, unknown>` are replaced with `state as Prisma.InputJsonValue`.
- `npx tsc --noEmit` from `apps/web` exits with 0 errors.
- No `any`, no `@ts-ignore`, no other files modified.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` from `apps/web` passes with zero errors.
2. Only the two target route files are modified — confirm via `git status`.
3. No new `any` / `@ts-ignore` / `@ts-expect-error` introduced — confirm via:
   ```
   git diff apps/web/src/app/api/user/grid-views | grep -E "any|@ts-(ignore|expect-error)"
   ```
   (Expected: no matches.)
4. No changes under `apps/web/prisma/` — confirm via `git status apps/web/prisma`.
</verification>

<success_criteria>
- Vercel build no longer fails on the `GridViewUpdateInput.state` type error.
- PUT and POST handlers for grid views compile cleanly under strict TS.
- Validation boundary (`GridViewState`) and Prisma schema are unchanged.
- Diff is limited to the two route files and contains only:
  - One added `import type { Prisma } from '@/generated/prisma';` per file.
  - One replaced cast per file (`state as Prisma.InputJsonValue`).
</success_criteria>

<output>
After completion, create `.planning/quick/383-fix-prisma-json-type-error-in-grid-view-/quick-383-SUMMARY.md` documenting:
- The two cast fixes applied
- The `Prisma` type-only import added to each file
- `tsc --noEmit` result
- Confirmation that schema, validation, and other files were untouched
</output>
