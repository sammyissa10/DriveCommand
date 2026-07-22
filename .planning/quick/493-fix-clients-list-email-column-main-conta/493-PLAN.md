---
phase: quick-493
plan: 493
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/clients/page.tsx
  - apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/clients/route.ts
autonomous: true

must_haves:
  truths:
    - "Clients list EMAIL column shows the Main contact's email (falls back to legacy client.email)"
    - "After editing a client (PATCH), the list and detail views reflect the change without stale cache"
    - "After creating a client (POST), the list view reflects the new client without stale cache"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/clients/page.tsx"
      provides: "clientRows.email resolved from getMainContact"
      contains: "getMainContact(c.contacts)?.email ?? c.email"
    - path: "apps/web/src/app/api/v1/carrier/clients/[id]/route.ts"
      provides: "PATCH revalidation of list + detail paths"
      contains: "revalidatePath"
    - path: "apps/web/src/app/api/v1/carrier/clients/route.ts"
      provides: "POST revalidation of list path"
      contains: "revalidatePath('/carrier/clients')"
  key_links:
    - from: "clients/page.tsx clientRows"
      to: "getMainContact(c.contacts)?.email"
      via: "row mapping"
      pattern: "getMainContact\\(c\\.contacts\\)\\?\\.email"
    - from: "PATCH handler"
      to: "revalidatePath('/carrier/clients')"
      via: "after updateClient success"
      pattern: "revalidatePath\\('/carrier/clients'\\)"
---

<objective>
Fix the Clients list EMAIL column so it resolves the Main contact's email (mirroring how the
name column already resolves the Main contact's name), and add server-side cache revalidation
to the client PATCH and POST API routes so list/detail views are not stale after a save.

Purpose: EMAIL column currently shows the legacy top-level client.email, which is often empty or
outdated now that contacts are the source of truth. Saves also leave stale cached pages.
Output: 3 edited files; `next build` passes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/app/(owner)/carrier/clients/page.tsx
@apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
@apps/web/src/app/api/v1/carrier/clients/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Resolve EMAIL column to Main contact + add PATCH/POST revalidation</name>
  <files>apps/web/src/app/(owner)/carrier/clients/page.tsx, apps/web/src/app/api/v1/carrier/clients/[id]/route.ts, apps/web/src/app/api/v1/carrier/clients/route.ts</files>
  <action>
Make three small, surgical edits. Do NOT touch any other files.

CHANGE 1 — EMAIL column resolves Main contact email
File: apps/web/src/app/(owner)/carrier/clients/page.tsx
- Inside the `clientRows = items.map((c) => ({ ... }))` mapping (~line 44), change
  `email: c.email,` to `email: getMainContact(c.contacts)?.email ?? c.email,`.
- `getMainContact` is already imported at line 6 — no new import.
- Mirror the adjacent `mainContactName: getMainContact(c.contacts)?.name ?? c.primaryContact,` line.
- Keep the `?? c.email` legacy fallback. `mobileRows` spreads `...c` (~lines 65-69) so it inherits
  the fixed email automatically — no change there.

CHANGE 2 — revalidate after PATCH
File: apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
- Add `import { revalidatePath } from 'next/cache';` near the top imports.
- In the PATCH handler ONLY: after `const client = await updateClient(...)` and its non-null 404
  guard, and BEFORE `return NextResponse.json({ data: client });`, add:
    revalidatePath('/carrier/clients');
    revalidatePath(`/carrier/clients/${id}`);
- Do NOT modify the GET or DELETE handlers.

CHANGE 3 — revalidate after POST create
File: apps/web/src/app/api/v1/carrier/clients/route.ts
- `revalidatePath` is ALREADY imported at line 3 — do NOT add a duplicate import.
- In the POST handler, after `const client = await createClient(orgId, parsed.data);` (~line 101),
  add `revalidatePath('/carrier/clients');`. Placing it immediately after the create (alongside the
  existing `revalidatePath('/onboarding/welcome')` block) is fine; it must run before the
  `return NextResponse.json({ data: client }, { status: 201 });`.

Explicitly DO NOT TOUCH: clients/_grid/columns.tsx, clients/[id]/ClientDetailMobile.tsx,
components/carrier/clients/ClientForm.tsx, lib/carrier/clients.ts, prisma/schema.prisma.
  </action>
  <verify>
From apps/web: run `npx next build` and confirm it completes successfully.
Grep confirms: page.tsx contains `getMainContact(c.contacts)?.email ?? c.email`; [id]/route.ts
PATCH contains both `revalidatePath('/carrier/clients')` and `revalidatePath(\`/carrier/clients/${id}\`)`;
route.ts POST contains `revalidatePath('/carrier/clients')` with no duplicate import.
  </verify>
  <done>
EMAIL column resolves Main contact email with legacy fallback; PATCH revalidates list + detail;
POST revalidates list; `next build` passes with no new errors in the three touched files.
  </done>
</task>

</tasks>

<verification>
- `npx next build` (from apps/web) completes successfully.
- No new TypeScript errors introduced in the three touched files (baseline ~35 pre-existing errors
  unrelated to these files are acceptable).
</verification>

<success_criteria>
- Clients list EMAIL column shows the Main contact's email (fallback to client.email when no contact).
- Editing a client refreshes list + detail views (no stale cache).
- Creating a client refreshes the list view (no stale cache).
- Only the 3 intended files changed. Build passes.
</success_criteria>

<output>
After completion, create `.planning/quick/493-fix-clients-list-email-column-main-conta/493-SUMMARY.md`
</output>
