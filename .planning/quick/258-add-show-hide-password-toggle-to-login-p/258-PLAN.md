---
phase: quick-258
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
  - apps/web/src/app/(auth)/accept-invitation/page.tsx
autonomous: true
must_haves:
  truths:
    - "User can toggle password visibility on the sign-in page"
    - "User can toggle password visibility on accept-invitation page (both password and confirm password fields)"
    - "Toggle button does not submit the form"
    - "Toggle button does not interfere with keyboard tab navigation"
  artifacts:
    - path: "apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx"
      provides: "Sign-in password toggle"
      contains: "showPassword"
    - path: "apps/web/src/app/(auth)/accept-invitation/page.tsx"
      provides: "Accept-invitation password toggles"
      contains: "showPassword"
  key_links: []
---

<objective>
Add show/hide password toggle (eye icon) to all password input fields across the auth pages.

Purpose: Improve UX by letting users verify their password entry.
Output: Updated sign-in and accept-invitation pages with password visibility toggles.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
@apps/web/src/app/(auth)/accept-invitation/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add password toggle to sign-in and accept-invitation pages</name>
  <files>
    apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    apps/web/src/app/(auth)/accept-invitation/page.tsx
  </files>
  <action>
**Sign-in page** (`sign-in/[[...sign-in]]/page.tsx`):
1. Import `Eye` and `EyeOff` from `lucide-react` (Loader2 is already imported from there).
2. Add state: `const [showPassword, setShowPassword] = useState(false)`
3. Wrap the password `<input>` in a `<div className="relative">`.
4. Change the input `type` to `{showPassword ? 'text' : 'password'}`.
5. Add `pr-10` to the input className (to make room for the icon button).
6. After the input, add the toggle button:
```tsx
<button
  type="button"
  onClick={() => setShowPassword(!showPassword)}
  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
  tabIndex={-1}
  aria-label={showPassword ? "Hide password" : "Show password"}
>
  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
</button>
```

**Accept-invitation page** (`accept-invitation/page.tsx`):
1. Import `Eye` and `EyeOff` from `lucide-react`.
2. Add two states: `const [showPassword, setShowPassword] = useState(false)` and `const [showConfirmPassword, setShowConfirmPassword] = useState(false)`.
3. Apply the same wrapper + toggle pattern to both the password input (id="password") and the confirm password input (id="confirmPassword"), each with its own independent state.
4. Add `pr-10` to both input classNames.
5. Add `aria-label` to both toggle buttons.

Do NOT change any auth logic, form submission, validation, or other form fields.
  </action>
  <verify>
1. `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit` passes with no errors in the modified files.
2. Visual check: navigate to `/sign-in` — password field has eye icon, clicking toggles between text/password type.
3. Visual check: navigate to `/accept-invitation?id=test` — both password fields have independent eye icon toggles.
  </verify>
  <done>
All 3 password fields (1 on sign-in, 2 on accept-invitation) have working show/hide toggles with Eye/EyeOff icons. Toggles do not submit the form and are excluded from tab order.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Sign-in page password field has toggle
- Accept-invitation page password and confirm password fields each have independent toggles
- Clicking toggle switches input type between text and password
- Toggle buttons have type="button" and tabIndex={-1}
</verification>

<success_criteria>
All password fields across auth pages have functional show/hide toggles using Eye/EyeOff icons from lucide-react.
</success_criteria>

<output>
After completion, create `.planning/quick/258-add-show-hide-password-toggle-to-login-p/258-SUMMARY.md`
</output>
