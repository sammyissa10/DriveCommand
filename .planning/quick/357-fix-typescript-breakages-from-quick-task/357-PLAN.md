---
phase: 357-fix-typescript-breakages-from-quick-task
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
  - apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts
  - apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
  - apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts
  - apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
  - apps/web/src/app/api/driver-pay/settlements/route.ts
  - apps/web/src/lib/driver-pay/settlement-generator.ts
autonomous: true

must_haves:
  truths:
    - "apps/web `tsc --noEmit` exits 0"
    - "All 18 createdBy/null assignment errors are gone"
    - "No `as any`, `as string`, `@ts-ignore`, or `eslint-disable` introduced"
    - "Prisma schema is unmodified"
    - "Serialized API responses still expose a usable `createdBy` value (string or null) to clients"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/driver-compensation-templates.ts"
      provides: "SerializedTemplate.createdBy widened to string | null"
      contains: "createdBy: string | null"
    - path: "apps/web/src/app/api/driver-pay/settlements/route.ts"
      provides: "Settlement serializer accepts nullable createdBy"
      contains: "createdBy: string | null"
    - path: "apps/web/src/lib/driver-pay/settlement-generator.ts"
      provides: "GenerateResult.settlement.createdBy widened to string | null"
      contains: "createdBy: string | null"
  key_links:
    - from: "Local serializer parameter types"
      to: "Prisma model types"
      via: "createdBy column nullability (quick-356 / TKT-0015 Prompt 2a)"
      pattern: "createdBy: string \\| null"
---

<objective>
Fix all TypeScript errors introduced by Quick Task 356 (commit 19d5930) where the `created_by` / `createdBy` column was made nullable on 14 audit-FK tables. Nine downstream files declare local serializer parameter types or return types with `createdBy: string` (non-null) and now mismatch the Prisma model types (`string | null`).

Purpose: Restore green `tsc --noEmit` so `vercel --prod` deploys succeed again. Runtime behavior is unaffected — this is purely a type-widening exercise.

Output: Updated type annotations in 10 files (9 with errors + settlement-generator helper). `tsc --noEmit` from `apps/web` returns exit 0.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/356-tkt-0015-prompt-2a-pre-flight-schema-cleanup/356-SUMMARY.md

# Files to modify (read each before editing — full file context required)
@apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
@apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts
@apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
@apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts
@apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
@apps/web/src/app/api/driver-pay/settlements/route.ts
@apps/web/src/lib/driver-pay/settlement-generator.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Widen createdBy types in 10 driver-pay files</name>
  <files>
    apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
    apps/web/src/app/api/driver-pay/settlements/route.ts
    apps/web/src/lib/driver-pay/settlement-generator.ts
  </files>
  <action>
    Mechanical type widening to match Prisma's new nullable `createdBy` column.

    **Approach — run iteratively:**
    1. From `apps/web/`, run `npx tsc --noEmit 2>&1 | head -80` to see current errors.
    2. For each error site, open the file at the reported line.
    3. Locate the local TypeScript type annotation (parameter type, return type, interface, or type alias) that declares `createdBy: string`.
    4. Change `createdBy: string` to `createdBy: string | null` in the LOCAL annotation only.
    5. If the same file declares a `Serialized*` return type (an exported `export type` shape returned to client components) that exposes `createdBy: string`, ALSO widen that to `string | null` so the function can return what it now receives.
    6. After editing each file, re-run `npx tsc --noEmit 2>&1 | head -40` to confirm progress and detect any new errors revealed by the fix.
    7. Repeat until `npx tsc --noEmit` exits 0.

    **Known error sites (18 total across 9 files; settlement-generator.ts is the 10th — fix its `GenerateResult` type):**
    - `(owner)/actions/driver-compensation-templates.ts` — `serializeTemplate` parameter type (line ~75) + exported `SerializedTemplate` type (line ~48)
    - `api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts` line 214
    - `api/driver-pay/assignments/[assignmentId]/components/route.ts` lines 138, 261
    - `api/driver-pay/assignments/[assignmentId]/corrections/route.ts` line 261
    - `api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts` lines 208, 278
    - `api/driver-pay/drivers/[driverId]/bonuses/route.ts` lines 141, 274, 275, 302
    - `api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts` lines 236, 296
    - `api/driver-pay/drivers/[driverId]/deductions/route.ts` lines 141, 237
    - `api/driver-pay/settlements/route.ts` line 177
    - `lib/driver-pay/settlement-generator.ts` line 109 — widen `GenerateResult` type so `settlement.createdBy` is `string | null`

    **Hard constraints (per task description):**
    - DO NOT modify `apps/web/prisma/schema.prisma`
    - DO NOT run any prisma migrate / db push commands
    - DO NOT introduce `as any`, `as string`, `as unknown as ...`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable`
    - DO NOT refactor business logic, rename functions, reorder fields, or change return shapes beyond widening the null
    - DO NOT change `enteredBy: string` — that column is NOT nullable, it just appears in error type context as noise
    - DO NOT touch `updatedBy` unless tsc explicitly errors on it (the 18 known errors are all `createdBy`)

    **Serialized output handling:**
    Most of these files have a `Serialized*` shape returned to client components where `createdBy` is currently `string`. Widen to `string | null` and let `null` flow through serialization (e.g., `t.createdBy` stays as-is — no fallback needed, since the value is already the right shape). Do NOT coerce `null` → `''` or `null` → `'system'` — clients should see the truth.

    **Why this is safe:**
    - Quick-356 (commit 19d5930) made `createdBy` nullable in 14 tables as audit-FK cleanup. Runtime values that were previously string remain string; new null values represent legitimately-null audit FKs (system actions, pre-migration rows).
    - All 18 errors are local-type mismatches, not real runtime bugs.
  </action>
  <verify>
    From `apps/web/` directory:
    ```
    npx tsc --noEmit
    ```
    Must exit 0 with no errors. Also confirm no forbidden tokens were introduced:
    ```
    git diff --unified=0 -- 'apps/web/src/app/(owner)/actions/driver-compensation-templates.ts' \
      'apps/web/src/app/api/driver-pay/**' \
      'apps/web/src/lib/driver-pay/settlement-generator.ts' \
      | grep -E '(as any|as string|@ts-ignore|@ts-expect-error|eslint-disable)' || echo "CLEAN"
    ```
    Must print `CLEAN`.

    Confirm schema untouched:
    ```
    git diff --stat -- 'apps/web/prisma/schema.prisma'
    ```
    Must show no output (zero changes).
  </verify>
  <done>
    - `npx tsc --noEmit` from `apps/web/` exits 0
    - All 10 listed files have `createdBy: string | null` everywhere the local annotation previously said `createdBy: string`
    - `Serialized*` exported types (where present) expose `createdBy: string | null`
    - `GenerateResult.settlement.createdBy` in settlement-generator.ts is `string | null`
    - No `as any` / `as string` / `@ts-ignore` / `@ts-expect-error` / `eslint-disable` added
    - `prisma/schema.prisma` unchanged
    - No business logic, function signatures, or return shapes altered beyond the null widening
  </done>
</task>

</tasks>

<verification>
**Phase-level check:**
1. From `apps/web/`: `npx tsc --noEmit` → exit 0
2. From repo root: `git diff --stat` should show ~10 files changed, all in the lists above, all with small diffs (annotation widenings only)
3. No new files created
4. `apps/web/prisma/schema.prisma` untouched
5. Forbidden tokens grep returns `CLEAN`

**Optional sanity (do not block on this):**
- `cd apps/web && pnpm build` (or `next build`) compiles past the typecheck stage. If runtime build fails for an unrelated reason, that's out of scope.
</verification>

<success_criteria>
- `tsc --noEmit` exits 0 in `apps/web`
- All 18 createdBy null-assignability errors resolved
- Zero usage of `as any`, `as string`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` in the diff
- `prisma/schema.prisma` is byte-identical to its state before this plan
- Diff is purely type-widening — no logic, no renames, no behavioral changes
- Vercel build (`next build`) can proceed past the typecheck phase
</success_criteria>

<output>
After completion, create `.planning/quick/357-fix-typescript-breakages-from-quick-task/357-SUMMARY.md` documenting:
- Final tsc result (exit code, error count)
- Files touched and the exact annotation change pattern applied
- Confirmation that schema, business logic, and serialization shapes are unchanged
- Any unexpected errors discovered during iterative tsc runs (and how they were resolved within the same widening pattern)
</output>
