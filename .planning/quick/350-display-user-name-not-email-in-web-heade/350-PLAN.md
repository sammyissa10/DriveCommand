---
phase: quick-350
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/auth/display-name.ts
  - apps/web/src/components/navigation/user-menu.tsx
autonomous: true

must_haves:
  truths:
    - "Header user menu shows the user's name (not their email) as the primary label when first_name/last_name are available"
    - "Header user menu falls back gracefully through first+last → first → full_name → email local-part → full email"
    - "Email remains visible as muted secondary text in the dropdown panel and the trigger row"
    - "tsc --noEmit passes with no new errors"
  artifacts:
    - path: "apps/web/src/lib/auth/display-name.ts"
      provides: "Pure getDisplayName(user) helper with full fallback chain"
      exports: ["getDisplayName", "DisplayNameUser"]
    - path: "apps/web/src/components/navigation/user-menu.tsx"
      provides: "User menu trigger + dropdown using getDisplayName for the primary label"
      contains: "getDisplayName"
  key_links:
    - from: "apps/web/src/components/navigation/user-menu.tsx"
      to: "apps/web/src/lib/auth/display-name.ts"
      via: "named import { getDisplayName }"
      pattern: "from ['\"]@/lib/auth/display-name['\"]"
    - from: "apps/web/src/components/navigation/user-menu.tsx"
      to: "useAuth() user object"
      via: "getDisplayName(user) called with user from useAuth()"
      pattern: "getDisplayName\\("
---

<objective>
Display the user's name (not their email) as the primary label in the web header user menu, using a graceful fallback chain. Extract a pure `getDisplayName(user)` helper so the logic is testable, reusable, and not entangled with the UI.

Purpose: TKT-0001 — current UX shows raw email in the top-right header, which feels impersonal and leaks the user's email address into screenshots/screen-shares. A name is friendlier and safer.

Output:
- New file `apps/web/src/lib/auth/display-name.ts` with `getDisplayName` helper + `DisplayNameUser` type.
- Updated `apps/web/src/components/navigation/user-menu.tsx` using the helper. Email becomes secondary muted text only.
- No changes to auth provider, middleware, RLS, DB schema, mobile app, or session shape.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Component being edited (already uses useAuth() and has partial fallback logic — REPLACE the inline logic with the helper)
@apps/web/src/components/navigation/user-menu.tsx

# Auth user shape — confirms which fields exist on the client (id, email, role, tenantId, firstName?, lastName?, permissions?)
# Note: no `full_name` field currently exists on AuthUser; helper should still accept it for future-proofing per spec.
@apps/web/src/lib/auth/auth-context.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pure getDisplayName helper</name>
  <files>apps/web/src/lib/auth/display-name.ts</files>
  <action>
Create a new file `apps/web/src/lib/auth/display-name.ts` that exports a pure helper `getDisplayName` and its input type.

Exact requirements:

1. Export a TypeScript type `DisplayNameUser` describing the accepted input. Use this exact shape (all optional except acknowledging email may be undefined too):
   ```ts
   export type DisplayNameUser = {
     firstName?: string | null;
     lastName?: string | null;
     full_name?: string | null;  // accepted for future-proofing even though current AuthUser does not expose it
     email?: string | null;
   };
   ```
   Use snake_case `full_name` exactly as the spec calls out — it mirrors a possible DB column.

2. Export a pure function `getDisplayName(user: DisplayNameUser | null | undefined): string` that applies this fallback chain in order, returning the FIRST non-empty result (after trimming whitespace):
   1. `firstName + " " + lastName` if BOTH are non-empty strings after trim
   2. `firstName` alone if only firstName is non-empty
   3. `full_name` if non-empty
   4. The local-part of `email` (everything before `@`) if email contains `@` and the local-part is non-empty
   5. The full `email` string if present and non-empty
   6. The literal string `"User"` if nothing else is available (safety fallback so callers never get an empty string)

3. Implement defensive checks:
   - Treat `null`, `undefined`, and empty/whitespace-only strings as "missing".
   - Use `.trim()` when checking and when composing the first+last result.
   - Do NOT mutate the input.
   - Do NOT use `any`. No `@ts-ignore`. Strict-mode clean.

4. Add a short JSDoc block above the function summarizing the fallback chain.

Constraints:
- Pure function — no imports from React, no side effects, no logging.
- File is ~30-50 lines including type, JSDoc, and function.
- Do not export a default; use named exports only (matches existing repo style).
  </action>
  <verify>
- `npx tsc --noEmit` from `apps/web/` reports no new errors.
- File exports both `getDisplayName` and `DisplayNameUser`.
- Manual reasoning trace: `getDisplayName({ firstName: "Sammy", lastName: "Issa" })` → `"Sammy Issa"`; `getDisplayName({ firstName: "Sammy" })` → `"Sammy"`; `getDisplayName({ full_name: "Sammy Issa" })` → `"Sammy Issa"`; `getDisplayName({ email: "sammy.issa21@gmail.com" })` → `"sammy.issa21"`; `getDisplayName({ email: "noatsign" })` → `"noatsign"`; `getDisplayName(null)` → `"User"`.
  </verify>
  <done>
File `apps/web/src/lib/auth/display-name.ts` exists, exports `getDisplayName` + `DisplayNameUser`, and the fallback chain matches the spec. TypeScript clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire user-menu to getDisplayName and keep email as secondary muted text</name>
  <files>apps/web/src/components/navigation/user-menu.tsx</files>
  <action>
Update `apps/web/src/components/navigation/user-menu.tsx` to use the new helper for the primary label, keeping email only as muted secondary text.

Exact changes:

1. Add a new import near the top, alongside the existing `useAuth` import:
   ```ts
   import { getDisplayName } from "@/lib/auth/display-name";
   ```

2. Replace the existing inline displayName computation (currently lines ~53-55):
   ```ts
   const displayName = user?.firstName
     ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
     : user?.email ?? "User";
   ```
   with a single call:
   ```ts
   const displayName = getDisplayName(user);
   ```
   Pass `user` directly — the helper handles `null`/`undefined`. The shape (`firstName`, `lastName`, `email`) is already compatible with `DisplayNameUser`; `full_name` is simply absent which is fine.

3. Do NOT change the `getInitials` helper at the top of the file — it is separate from name display and still works correctly.

4. Confirm the existing markup already renders email as secondary muted text in two spots — keep both:
   - The trigger row (line ~68): `<span className="truncate text-xs text-muted-foreground ...">{user?.email}</span>`
   - The dropdown header (line ~82): `<p className="text-xs text-muted-foreground truncate">{user?.email}</p>`
   Both already use `text-muted-foreground` which IS the muted secondary style. Do NOT change these classes — the spec says "keep existing Tailwind classes; add new ones only if needed", and they are not needed.

5. Do NOT refactor anything else in the file — no changes to sign-out flow, dropdown open/close logic, skeleton state, or initials.

Constraints (from spec — re-read before committing):
- Do not modify the auth provider, session shape, middleware, or any RLS / database logic. Only this component + the new helper file.
- TypeScript strict — no `any`.
- Do NOT deploy to Vercel.
  </action>
  <verify>
- Run `npx tsc --noEmit` from `apps/web/` — no new errors.
- `grep` confirms `getDisplayName` is imported and called inside `user-menu.tsx`.
- `grep` confirms the old inline ternary (`user?.firstName ? \`${user.firstName}\`...`) is gone from `user-menu.tsx`.
- The two `{user?.email}` renders with `text-muted-foreground` still exist in the file (trigger row + dropdown header).
- The `getInitials` helper is untouched.
  </verify>
  <done>
`user-menu.tsx` imports and uses `getDisplayName(user)` for the primary label in both the trigger row and the dropdown header. Email remains the muted secondary line in both locations. No other behavior changed. `tsc --noEmit` clean. No deploy performed.
  </done>
</task>

</tasks>

<verification>
1. From `apps/web/`, run `npx tsc --noEmit` — must report zero errors (or only pre-existing unrelated errors; no NEW errors introduced).
2. Open `apps/web/src/components/navigation/user-menu.tsx` and confirm:
   - Imports `getDisplayName` from `@/lib/auth/display-name`.
   - Calls `getDisplayName(user)` for the displayed primary label.
   - Old inline first/last/email ternary is removed.
   - Email still rendered with `text-muted-foreground` in trigger row + dropdown header.
3. Open `apps/web/src/lib/auth/display-name.ts` and confirm exports + fallback order.
4. Smoke check (optional, no deploy): `cd apps/web && npm run dev`, sign in, look at the user menu in the top-right — should show first+last (or first alone if last is missing). Email shows as muted line below.
5. Confirm NO changes outside the two listed files (auth-context, supabase.ts, middleware, mobile, schema all untouched).
</verification>

<success_criteria>
- `apps/web/src/lib/auth/display-name.ts` exists with `getDisplayName` + `DisplayNameUser` exports.
- `apps/web/src/components/navigation/user-menu.tsx` uses `getDisplayName(user)` and the old inline logic is gone.
- Email remains visible as secondary muted text in trigger row + dropdown header.
- `tsc --noEmit` clean in `apps/web/`.
- No files outside the two listed are modified.
- No Vercel deploy triggered.
</success_criteria>

<output>
After completion, create `.planning/quick/350-display-user-name-not-email-in-web-heade/350-SUMMARY.md` summarizing:
- Files created/modified (the two listed).
- The fallback chain implemented.
- `tsc --noEmit` result.
- Confirmation that no deploy happened and no out-of-scope files were touched.
</output>
