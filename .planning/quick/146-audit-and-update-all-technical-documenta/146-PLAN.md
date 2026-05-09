---
phase: quick-146
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/docs/architecture.md
  - apps/web/docs/auth.md
  - apps/web/docs/database.md
  - apps/web/docs/stack.md
  - apps/web/docs/modules.md
  - apps/web/docs/setup.md
  - apps/web/docs/deployment.md
  - apps/mobile/docs/architecture.md
  - apps/mobile/docs/local-development.md
autonomous: true
must_haves:
  truths:
    - "All auth file references point to supabase.ts (not session.ts/server.ts)"
    - "Mobile API route tree in mobile architecture.md matches actual filesystem"
    - "Mobile navigation tree matches actual app/ directory structure"
    - "Database model count and model list matches current schema.prisma"
    - "No references to custom AES-256-GCM cookies for web auth (web migrated to Supabase Auth)"
    - "No stale RESEND_API_KEY references in deployment checklist or setup env table"
  artifacts:
    - path: "apps/web/docs/auth.md"
      provides: "Accurate auth docs reflecting supabase.ts consolidation"
    - path: "apps/web/docs/architecture.md"
      provides: "Accurate file structure and auth references"
    - path: "apps/mobile/docs/architecture.md"
      provides: "Accurate mobile API tree, navigation tree, and auth description"
  key_links:
    - from: "apps/web/docs/auth.md"
      to: "apps/web/src/lib/auth/supabase.ts"
      via: "Key files reference"
      pattern: "supabase\\.ts"
    - from: "apps/web/docs/architecture.md"
      to: "apps/web/src/lib/auth/"
      via: "File structure listing"
      pattern: "supabase\\.ts.*mobile-auth\\.ts.*roles\\.ts"
---

<objective>
Audit and update all technical documentation in apps/web/docs/ and apps/mobile/docs/ to accurately reflect the current state of the codebase after Phases 29-37.6.

Purpose: Documentation has drifted significantly since Phase 24. The web auth system was migrated from custom AES-256-GCM to Supabase Auth (Phase 37.6), auth helpers were consolidated from session.ts + server.ts into a single supabase.ts, the mobile app was built out through 11 phases with dozens of new API endpoints and screens, and the database schema has grown. Stale docs will mislead future development.

Output: All doc files updated to match the current codebase. No new files created.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/lib/auth/
@apps/web/src/lib/db/
@apps/mobile/app/
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update web docs (auth, architecture, database, stack, setup, deployment, modules)</name>
  <files>
    apps/web/docs/auth.md
    apps/web/docs/architecture.md
    apps/web/docs/database.md
    apps/web/docs/stack.md
    apps/web/docs/modules.md
    apps/web/docs/setup.md
    apps/web/docs/deployment.md
  </files>
  <action>
Audit each web doc file against the actual codebase and fix all drift. Specific known issues to fix:

**auth.md:**
- Key files section: Replace `session.ts` and `server.ts` references with `supabase.ts` (the single consolidated auth module after Phase 37.6). Add `permissions.ts`, `guards.tsx`, `auth-context.tsx` to the key files list.
- Add `requirePermission(key: keyof UserPermissions)` to the Auth Helpers section — this is a new export from supabase.ts.
- In "Key Design Decisions" or wherever custom AES-256-GCM is mentioned as the web auth mechanism, update to reflect that web now uses Supabase Auth via `@supabase/ssr` (not custom encryption). The ADR in mobile architecture.md also needs updating (Task 2).

**architecture.md:**
- File structure: Update `lib/auth/` listing from `session.ts, server.ts, roles.ts` to `supabase.ts, mobile-auth.ts, roles.ts, permissions.ts, guards.tsx, auth-context.tsx`.
- File structure: Add `lib/db/tenant-client.ts`, `lib/db/repositories/`, `lib/db/extensions/` to the db section.
- File structure: Update `lib/email/` description — mention Gmail client (not just "Resend client").
- Update "Mobile API routes are secured with Supabase JWT verification (not the custom session cookie used by web portals)" — remove the parenthetical since web also uses Supabase Auth now. Say something like "Mobile API routes are secured with Supabase JWT Bearer tokens via validateMobileToken(), while web portals use Supabase cookie-based sessions via @supabase/ssr."
- Verify the "Key Design Decisions" section. Update the "Custom AES-256-GCM session cookie" entry to reflect Supabase Auth migration. The sentence should describe `@supabase/ssr` cookie-based sessions instead.

**database.md:**
- Read `prisma/schema.prisma` and recount models. Update "37 models" to the actual count.
- Check if any new models are missing from the table (e.g., DriverDocument if it exists separately, or any models added in Phases 29-37).
- Verify enum lists are current.

**stack.md:**
- Check if `bcryptjs` is still used after Supabase Auth migration. If password hashing is now handled by Supabase, note that bcryptjs is legacy or remove it from the utilities table.
- Verify all version numbers against actual package.json. Update any that are significantly wrong.
- In section 16 (Push Notifications), verify expo-server-sdk version.

**setup.md:**
- Env vars table: The note about RESEND_API_KEY vs Gmail is already there but could be cleaner. Ensure SUPABASE_SERVICE_ROLE_KEY is documented if it's now required (check .env.example or actual usage).
- Check if `npm run seed` and `npm run seed:fleet` still exist as scripts.

**deployment.md:**
- First Deployment Checklist: Replace `RESEND_API_KEY` with Gmail SMTP vars (`GMAIL_USER`, `GMAIL_APP_PASSWORD`), or note both options clearly.
- Add `SUPABASE_SERVICE_ROLE_KEY` to the checklist if it's required for production.

**modules.md:**
- Add SysAdmin Invoicing module (Phase 25) — `/admin-dashboard` or wherever sysadmin invoices are managed. Add entry for SysAdminInvoice CRUD.
- Add Fleet Messaging mention under the SysAdmin or shared section if applicable.
- Verify all owner portal pages listed match actual routes in `src/app/(owner)/`.

For each file: read the current doc, read the corresponding source files to verify accuracy, then update only the stale sections. Preserve all correct content. Do NOT rewrite entire files — make surgical edits.
  </action>
  <verify>
    - `grep -r "session\.ts" apps/web/docs/` returns NO matches
    - `grep -r "server\.ts" apps/web/docs/` returns NO matches (except generic references to "server actions" or "server components")
    - `grep "supabase\.ts" apps/web/docs/auth.md` returns at least 1 match
    - `grep "AES-256-GCM" apps/web/docs/architecture.md` returns NO matches
    - The model count in database.md matches `grep -c "^model " prisma/schema.prisma`
  </verify>
  <done>All 7 web doc files accurately reflect the current codebase. No stale auth file references, no stale email provider references in checklists, correct model count, correct file structure listings.</done>
</task>

<task type="auto">
  <name>Task 2: Update mobile docs (architecture, local-development, api)</name>
  <files>
    apps/mobile/docs/architecture.md
    apps/mobile/docs/local-development.md
  </files>
  <action>
Audit each mobile doc file against the actual codebase and fix all drift. Specific known issues:

**architecture.md:**
- Monorepo Position section: The mobile API tree shown is incomplete. Update it to match the actual filesystem under `apps/web/src/app/api/mobile/`. The current doc only lists `owner/{customers, drivers, invoices, trucks}` and `driver/` and `support/`. The actual tree includes many more owner endpoints: `compliance`, `crm`, `dashboard`, `fleet`, `fleet-positions`, `fuel`, `loads`, `map`, `payroll`, `profit-predictor`, `routes`, `safety`, and many more driver endpoints: `dashboard`, `documents`, `hos`, `incidents`, `loads` (with sub-routes), `messages` (with sub-routes), `route`, `tracking-token`.
- Navigation section: Update the route tree to match the actual `apps/mobile/app/` directory. Key additions:
  - Login screen is `login.tsx` not `sign-in.tsx`
  - Owner portal has `routes/` section (index.tsx, [id].tsx)
  - Owner `more/` section has many more items: `ai-documents.tsx`, `compliance.tsx`, `fuel.tsx`, `payroll.tsx`, `profit-predictor.tsx`, `safety.tsx`, `settings/` (with account.tsx, team.tsx, index.tsx), `invoices/` (with [id].tsx, index.tsx, new.tsx)
  - Driver portal has `loads/my-route.tsx`, `incidents/new.tsx`
- Key Design Decisions section: Update "Supabase Auth for mobile, custom session for web" — web has also migrated to Supabase Auth (Phase 37.6). The statement should say both web and mobile now use Supabase Auth, but via different mechanisms (web uses @supabase/ssr cookie sessions, mobile uses JWT Bearer tokens via expo-secure-store).
- ADR-001: Update the Context section — it says "The web app uses a custom AES-256-GCM encrypted session cookie for authentication." This is no longer true. Update to reflect that web now also uses Supabase Auth (via @supabase/ssr), but the mobile decision to use JWT Bearer tokens is still correct and the ADR rationale still holds (cookies don't work well in mobile).

**local-development.md:**
- Project Structure section: Replace `sign-in.tsx` with `login.tsx`.
- Verify all other file references are accurate.

**api.md — DO NOT MODIFY.** This file is 33KB and was recently generated. Modifying it risks breaking its comprehensive endpoint documentation. Skip it.
  </action>
  <verify>
    - `grep "sign-in\.tsx" apps/mobile/docs/local-development.md` returns NO matches
    - `grep "AES-256-GCM" apps/mobile/docs/architecture.md` returns NO matches
    - `grep "custom.*session.*cookie" apps/mobile/docs/architecture.md` returns NO matches (or only in historical context)
    - The navigation tree in architecture.md includes `login.tsx`, `routes/`, `settings/`, `ai-documents.tsx`
  </verify>
  <done>Mobile architecture.md has accurate API tree, navigation tree, and auth descriptions. Local-development.md has correct file references. No stale AES-256-GCM references.</done>
</task>

</tasks>

<verification>
After both tasks:
1. All doc files reference `supabase.ts` instead of `session.ts`/`server.ts` for auth
2. No mentions of custom AES-256-GCM as the current web auth mechanism
3. Mobile API tree and navigation tree match actual filesystem
4. Database model count matches schema
5. Deployment/setup docs reference Gmail SMTP (not Resend) as primary email
6. `npx next build` still passes (docs are .md files, no build impact, but verify no broken imports if any doc is referenced from code)
</verification>

<success_criteria>
All 9 documentation files accurately reflect the current codebase state as of Phase 37.6. A new developer reading these docs would get an accurate picture of the auth system, file structure, database schema, mobile API surface, and deployment process.
</success_criteria>

<output>
After completion, create `.planning/quick/146-audit-and-update-all-technical-documenta/146-SUMMARY.md`
</output>
