---
phase: quick-135
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/types/src/index.ts
  - apps/web/src/lib/validations/ (DELETE all 17 files)
  - apps/web/src/app/(owner)/actions/*.ts
  - apps/web/src/app/(driver)/actions/*.ts
  - apps/web/src/actions/*.ts
  - apps/web/src/lib/api/with-mobile-auth.ts
  - apps/web/src/app/api/mobile/driver/dashboard/route.ts
  - apps/web/src/app/api/mobile/driver/hours/route.ts
  - apps/web/src/app/api/mobile/driver/messages/route.ts
  - apps/web/src/app/api/mobile/owner/dashboard/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/route.ts
  - apps/web/src/app/(owner)/fuel/actions.ts
  - apps/web/src/app/(owner)/live-map/actions.ts
  - apps/web/src/app/(sysadmin)/components/tenant-list-client.tsx
  - apps/web/src/app/(sysadmin)/tenants/new/page.tsx
  - apps/web/src/app/(sysadmin)/components/tenant-status-controls.tsx
  - apps/web/src/app/(owner)/trucks/actions.ts
  - apps/web/src/app/(owner)/tags/actions.ts
  - apps/web/src/app/(owner)/routes/actions.ts
  - apps/web/src/components/landing/landing-page.tsx
  - apps/web/src/components/landing/hero-section.tsx
  - apps/web/src/components/landing/features-section.tsx
  - apps/mobile/components/EditScreenInfo.tsx (DELETE)
  - apps/mobile/components/ExternalLink.tsx (DELETE)
  - apps/mobile/components/StyledText.tsx (DELETE)
  - apps/mobile/components/Themed.tsx (DELETE)
  - apps/web/.eslintrc.json
  - apps/mobile/.eslintrc.json
  - .prettierrc
  - apps/web/src/app/not-found.tsx
autonomous: true
must_haves:
  truths:
    - "Zero catch(error: any) or prevState: any patterns remain in codebase"
    - "Dead validation schemas and unused Expo boilerplate are removed"
    - "Mobile API routes share a withMobileAuth wrapper instead of duplicated auth logic"
    - "Raw SQL results are typed, not cast as any[]"
    - "Landing page is composed of extracted section components"
    - "npx tsc --noEmit passes cleanly"
  artifacts:
    - path: "packages/types/src/index.ts"
      provides: "ActionState type export"
      contains: "ActionState"
    - path: "apps/web/src/lib/api/with-mobile-auth.ts"
      provides: "Shared mobile auth wrapper"
      exports: ["withMobileAuth"]
    - path: "apps/web/src/components/landing/hero-section.tsx"
      provides: "Extracted hero section"
    - path: "apps/web/src/components/landing/features-section.tsx"
      provides: "Extracted features section"
    - path: "apps/web/src/app/not-found.tsx"
      provides: "Custom 404 page"
    - path: ".prettierrc"
      provides: "Repo-wide Prettier config"
  key_links:
    - from: "apps/web/src/app/(owner)/actions/*.ts"
      to: "packages/types/src/index.ts"
      via: "import ActionState"
      pattern: "import.*ActionState.*packages/types"
    - from: "apps/web/src/app/api/mobile/*/route.ts"
      to: "apps/web/src/lib/api/with-mobile-auth.ts"
      via: "import withMobileAuth"
      pattern: "import.*withMobileAuth"
---

<objective>
Fix code quality audit findings across the DriveCommand codebase: eliminate `any` types, remove dead code, extract shared patterns, split oversized files, and add linting/formatting config.

Purpose: Reduce tech debt and improve type safety before continuing mobile development.
Output: Cleaner codebase with zero `any` patterns in server actions, shared mobile auth wrapper, split landing page, and proper linting.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/types/src/index.ts
@apps/web/src/lib/api/with-mobile-auth.ts (to be created)
@apps/web/src/components/landing/landing-page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dead code removal + ActionState type + prevState/catch fixes</name>
  <files>
    packages/types/src/index.ts
    apps/web/src/lib/validations/ (DELETE directory)
    apps/web/src/app/(owner)/actions/*.ts
    apps/web/src/app/(driver)/actions/*.ts
    apps/web/src/actions/*.ts
    apps/web/src/app/(sysadmin)/components/tenant-list-client.tsx
    apps/web/src/app/(sysadmin)/tenants/new/page.tsx
    apps/web/src/app/(sysadmin)/components/tenant-status-controls.tsx
    apps/web/src/app/(owner)/trucks/actions.ts
    apps/web/src/app/(owner)/tags/actions.ts
    apps/web/src/app/(owner)/routes/actions.ts
    apps/mobile/components/EditScreenInfo.tsx (DELETE)
    apps/mobile/components/ExternalLink.tsx (DELETE)
    apps/mobile/components/StyledText.tsx (DELETE)
    apps/mobile/components/Themed.tsx (DELETE)
  </files>
  <action>
**Step A — Delete dead validation schemas:**
1. Run `grep -r "from.*lib/validations" apps/web/src/ --include="*.ts" --include="*.tsx"` to confirm zero imports
2. If zero imports confirmed, delete the entire `apps/web/src/lib/validations/` directory (17 files)
3. If any imports found, update them to point to `packages/validation/src/` instead, THEN delete

**Step B — Delete unused Expo boilerplate:**
1. Run `grep -r "EditScreenInfo\|ExternalLink\|StyledText\|Themed" apps/mobile/ --include="*.ts" --include="*.tsx" -l` to find imports
2. Exclude the files themselves from results. If zero other imports, delete all 4 files:
   - apps/mobile/components/EditScreenInfo.tsx
   - apps/mobile/components/ExternalLink.tsx
   - apps/mobile/components/StyledText.tsx
   - apps/mobile/components/Themed.tsx

**Step C — Add ActionState type:**
Add to `packages/types/src/index.ts`:
```ts
export type ActionState = {
  error?: Record<string, string[]>
  success?: boolean
  message?: string
  data?: unknown
}
```

**Step D — Replace prevState: any in all server actions:**
Search all files under `apps/web/src/app/(owner)/actions/`, `apps/web/src/app/(driver)/actions/`, and `apps/web/src/actions/` for `prevState: any`. Replace each with `prevState: ActionState`. Add the import `import type { ActionState } from '@drivecommand/types'` (or the correct package import path — check existing type imports in these files for the right pattern).

**Step E — Fix catch(error: any) to catch(error: unknown):**
In each of these files, find `catch (error: any)` or `catch(error: any)` and replace with `catch (error: unknown)`. Then replace any `error.message` usage with `error instanceof Error ? error.message : 'Unknown error'`:
- apps/web/src/app/(sysadmin)/components/tenant-list-client.tsx
- apps/web/src/app/(sysadmin)/tenants/new/page.tsx
- apps/web/src/app/(sysadmin)/components/tenant-status-controls.tsx
- apps/web/src/app/(owner)/trucks/actions.ts
- apps/web/src/app/(owner)/tags/actions.ts
- apps/web/src/app/(owner)/routes/actions.ts (the actions file, not page)

Also check the server action files from Step D for any `catch(error: any)` patterns while you are editing them.
  </action>
  <verify>
Run: `grep -r "prevState: any" apps/web/src/ --include="*.ts" | wc -l` — must be 0
Run: `grep -r "catch.*error: any" apps/web/src/ --include="*.ts" --include="*.tsx" | wc -l` — must be 0
Run: `ls apps/web/src/lib/validations/ 2>/dev/null` — must not exist
Run: `ls apps/mobile/components/EditScreenInfo.tsx 2>/dev/null` — must not exist
  </verify>
  <done>ActionState type exported from packages/types, all prevState: any replaced, all catch(error: any) replaced, dead validation schemas deleted, unused Expo boilerplate deleted</done>
</task>

<task type="auto">
  <name>Task 2: withMobileAuth wrapper + typed SQL + driver dashboard cleanup</name>
  <files>
    apps/web/src/lib/api/with-mobile-auth.ts
    apps/web/src/app/api/mobile/driver/dashboard/route.ts
    apps/web/src/app/api/mobile/driver/hours/route.ts
    apps/web/src/app/api/mobile/driver/messages/route.ts
    apps/web/src/app/api/mobile/owner/dashboard/route.ts
    apps/web/src/app/api/mobile/owner/fleet/route.ts
    apps/web/src/app/(owner)/fuel/actions.ts
    apps/web/src/app/(owner)/live-map/actions.ts
  </files>
  <action>
**Step A — Extract withMobileAuth wrapper:**
1. Read 2-3 mobile API route files to identify the repeated auth pattern (validateMobileToken, role check, applyRateLimit, $transaction with bypass_rls)
2. Create `apps/web/src/lib/api/with-mobile-auth.ts` that exports a `withMobileAuth` function:
```ts
type MobileAuthOptions = {
  allowedRoles: string[]
}

type AuthenticatedHandler = (
  req: NextRequest,
  context: { session: SessionData; tenantId: string }
) => Promise<NextResponse>

export function withMobileAuth(handler: AuthenticatedHandler, options: MobileAuthOptions) {
  return async (req: NextRequest) => {
    // 1. validateMobileToken(req)
    // 2. Check session.role against options.allowedRoles
    // 3. applyRateLimit
    // 4. Call handler with session context
    // Wrap errors in try/catch returning appropriate JSON responses
  }
}
```
3. Match the exact existing pattern from the route files — do NOT change behavior, just extract
4. Update these 5 routes to use the wrapper:
   - apps/web/src/app/api/mobile/driver/dashboard/route.ts
   - apps/web/src/app/api/mobile/driver/hours/route.ts
   - apps/web/src/app/api/mobile/driver/messages/route.ts
   - apps/web/src/app/api/mobile/owner/dashboard/route.ts
   - apps/web/src/app/api/mobile/owner/fleet/route.ts

**Step B — Type raw SQL results:**
1. In `apps/web/src/app/(owner)/fuel/actions.ts`, find all `as any[]` casts (around lines 49, 130, 199, 270, 352). For each, define a typed interface matching the SQL SELECT columns (e.g., `interface FuelLogRow { id: string; date: Date; gallons: number; ... }`). Replace `as any[]` with `as FuelLogRow[]`.
2. In `apps/web/src/app/(owner)/live-map/actions.ts`, find `as any[]` casts (around lines 43, 87). Define typed interfaces and replace.

**Step C — Fix driver dashboard placeholder comments:**
In `apps/web/src/app/api/mobile/driver/dashboard/route.ts`, remove or update any stale `// Placeholder` comments. If the code beneath is real/working, just remove the comment. If the code is genuinely a stub, add a TODO with context instead.
  </action>
  <verify>
Run: `grep -r "as any\[\]" apps/web/src/app/\(owner\)/fuel/actions.ts apps/web/src/app/\(owner\)/live-map/actions.ts | wc -l` — must be 0
Run: `grep -c "withMobileAuth" apps/web/src/lib/api/with-mobile-auth.ts` — must be >= 1
Run: `grep -r "withMobileAuth" apps/web/src/app/api/mobile/ --include="*.ts" -l | wc -l` — must be >= 5
Run: `grep -c "Placeholder" apps/web/src/app/api/mobile/driver/dashboard/route.ts` — must be 0
  </verify>
  <done>withMobileAuth wrapper created and used in 5 mobile routes, all raw SQL `as any[]` replaced with typed interfaces, placeholder comments cleaned up</done>
</task>

<task type="auto">
  <name>Task 3: Landing page split + not-found page + ESLint/Prettier + tsc check</name>
  <files>
    apps/web/src/components/landing/landing-page.tsx
    apps/web/src/components/landing/hero-section.tsx
    apps/web/src/components/landing/features-section.tsx
    apps/web/src/app/not-found.tsx
    apps/web/.eslintrc.json
    apps/mobile/.eslintrc.json
    .prettierrc
  </files>
  <action>
**Step A — Split landing page:**
1. Read `apps/web/src/components/landing/landing-page.tsx` (936 lines)
2. Identify major visual sections (hero, features, pricing, testimonials, CTA, footer, etc.)
3. Extract each major section into its own file under `apps/web/src/components/landing/`:
   - `hero-section.tsx` — the hero/banner area
   - `features-section.tsx` — the features grid/list
   - Any other sections that are 80+ lines (e.g., `pricing-section.tsx`, `cta-section.tsx`, `testimonials-section.tsx`) — use your judgment
4. Each extracted component: export as named export, accept any needed props
5. Rewrite `landing-page.tsx` as a thin composition file importing and rendering all sections. Target: under 100 lines.
6. Preserve ALL existing functionality and styling exactly. This is a pure refactor.

**Step B — Create custom not-found page:**
Create `apps/web/src/app/not-found.tsx`:
- Dark theme matching the app's existing dark palette (check existing layout/globals for color vars)
- Display "404 — Page Not Found" heading
- Brief message: "The page you're looking for doesn't exist or has been moved."
- Link back to `/login` ("Back to Login") — use Next.js Link component
- Center the content vertically and horizontally
- Keep it simple, under 40 lines

**Step C — ESLint + Prettier config:**
1. Read existing `apps/web/.eslintrc.json`. Add these rules (merge, don't replace):
   - `"@typescript-eslint/no-explicit-any": "warn"`
   - `"no-unused-vars": "off"` and `"@typescript-eslint/no-unused-vars": "error"` (use TS version to avoid conflicts)
   - Ensure `@typescript-eslint` plugin and parser are present
2. Create `.prettierrc` at repo root:
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```
   Check 2-3 existing source files for the current style (semicolons? quotes? trailing commas?) and match the Prettier config to what already exists — do NOT change the project's existing style.
3. Create or update `apps/mobile/.eslintrc.json` with basic React Native + TypeScript rules:
```json
{
  "extends": ["expo", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "error"
  }
}
```
   Check if this file already exists and what extends it uses before writing.

**Step D — TypeScript check:**
Run `cd apps/web && npx tsc --noEmit` to verify all changes compile. Fix any type errors introduced by the changes in Tasks 1-3. Common issues:
- Missing imports for ActionState
- Type mismatches from the new SQL interfaces
- Import path issues from deleted files
  </action>
  <verify>
Run: `wc -l apps/web/src/components/landing/landing-page.tsx` — must be under 150 lines
Run: `ls apps/web/src/components/landing/hero-section.tsx apps/web/src/components/landing/features-section.tsx` — must exist
Run: `ls apps/web/src/app/not-found.tsx` — must exist
Run: `ls .prettierrc` — must exist
Run: `cd apps/web && npx tsc --noEmit` — must pass with zero errors
  </verify>
  <done>Landing page split into section components (under 150 lines for composition file), custom 404 page created, ESLint rules added for any/unused-vars, Prettier config created, TypeScript compiles cleanly</done>
</task>

</tasks>

<verification>
1. `grep -r "prevState: any" apps/web/src/ --include="*.ts"` — zero matches
2. `grep -r "catch.*error: any" apps/web/src/ --include="*.ts" --include="*.tsx"` — zero matches
3. `grep -r "as any\[\]" apps/web/src/app/\(owner\)/fuel/ apps/web/src/app/\(owner\)/live-map/` — zero matches
4. `ls apps/web/src/lib/validations/ 2>/dev/null` — directory does not exist
5. `ls apps/mobile/components/EditScreenInfo.tsx 2>/dev/null` — file does not exist
6. `wc -l apps/web/src/components/landing/landing-page.tsx` — under 150 lines
7. `cd apps/web && npx tsc --noEmit` — passes clean
</verification>

<success_criteria>
- Zero `any` type annotations in server action prevState params and catch blocks
- Dead code (17 validation files + 4 Expo boilerplate files) removed
- withMobileAuth wrapper extracted and used in 5 mobile API routes
- All raw SQL `as any[]` replaced with typed interfaces
- Landing page split from 936 lines to composition + section components
- Custom not-found.tsx page exists
- ESLint rules for no-explicit-any and no-unused-vars active
- Prettier config at repo root
- TypeScript compiles with zero errors
</success_criteria>

<output>
After completion, create `.planning/quick/135-fix-code-quality-audit-findings-actionst/135-SUMMARY.md`
</output>
