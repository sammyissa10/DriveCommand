---
phase: 393-tkt-0037-diagnostic-sysadmin-edit-button
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/393-tkt-0037-diagnostic-sysadmin-edit-button/393-SUMMARY.md
autonomous: true

must_haves:
  truths:
    - "Every field shown on the sysadmin tenant detail page is enumerated"
    - "Every field on the Tenant and User Prisma models is classified SAFE / DANGEROUS / IMMUTABLE with justification"
    - "Existence (or absence) of updateTenant / updateUser server actions and admin PATCH routes is confirmed by file inspection"
    - "Whether Tenant and User tables have created_by_id / updated_by_id columns and whether any write path populates them is confirmed"
    - "An existing edit-form pattern (e.g. CarrierTruckForm) is identified with form library + success-state navigation"
    - "A UI-placement recommendation exists for both the tenant and user edit affordances"
    - "A build-scope recommendation (ONE / TWO / THREE prompts) is justified by coupling, risk, and review-size"
  artifacts:
    - path: ".planning/quick/393-tkt-0037-diagnostic-sysadmin-edit-button/393-SUMMARY.md"
      provides: "TKT-0037 diagnostic report with all required sections"
      contains: "TKT-0037 diagnostic complete. Build scope:"
  key_links:
    - from: "Tenant detail page"
      to: "Tenant Prisma model"
      via: "field-by-field cross-reference"
      pattern: "field classification table"
    - from: "Diagnostic findings"
      to: "Build-scope recommendation"
      via: "justification narrative"
      pattern: "ONE | TWO | THREE prompts"
---

<objective>
Produce a read-only diagnostic report mapping every relevant surface for adding sysadmin edit
capabilities for tenants and tenant users (TKT-0037). The report must be precise enough that a
follow-up build prompt can be authored without re-investigating the codebase.

Purpose: Sysadmin write bugs have global blast radius. Before any edit UI is built, every Tenant
and User field must be classified as SAFE / DANGEROUS / IMMUTABLE, existing infrastructure must be
inventoried, and a defensible build-scope recommendation (ONE / TWO / THREE prompts) must be made.

Output: A single diagnostic SUMMARY.md. No code changes, no commits for code, no tsc run.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Files explicitly named in the task scope
@apps/web/src/app/(admin)/tenants/[id]/page.tsx
@apps/web/src/app/(admin)/tenants/page.tsx
@apps/web/src/app/(admin)/users/page.tsx
@apps/web/src/app/(admin)/users/users-list.tsx
@apps/web/src/app/(admin)/actions/tenants.ts
@apps/web/src/app/(admin)/actions/users.ts
@apps/web/prisma/schema.prisma

# Recent SUMMARYs that establish precedent patterns referenced by the task
@.planning/quick/390-tkt-0034-fix-swap-bare-prisma-to-gettena/390-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Inventory existing surfaces (tenants, users, actions, schema, edit-form precedent)</name>
  <files>
    .planning/quick/393-tkt-0037-diagnostic-sysadmin-edit-button/393-SUMMARY.md
  </files>
  <action>
    READ-ONLY inventory. Do NOT modify any source file. Do NOT run tsc. Do NOT commit code.

    For each scoped file, read and extract findings. Record everything in a working notes section
    of the SUMMARY.md (you will polish it in Task 2).

    1. Tenant detail page — `apps/web/src/app/(admin)/tenants/[id]/page.tsx`
       - List EVERY field rendered (label + source property).
       - Note whether any edit affordance exists today (button, link, inline edit, modal, sheet).
       - Note the page's overall layout pattern (server component? cards? tabs?).

    2. Tenant list page — `apps/web/src/app/(admin)/tenants/page.tsx`
       - Note row actions (view, edit, delete, none).
       - Note whether rows are clickable (navigate to detail).

    3. Users list page — `apps/web/src/app/(admin)/users/page.tsx` and `users-list.tsx`
       - This page is from TKT-0036. Note: row layout, existing row actions, search/filter UX, and
         whether there is a detail route (`/users/[id]`) or only the list.
       - Document the precedent: where would a per-user edit affordance most naturally live?

    4. Tenant Prisma model — `apps/web/prisma/schema.prisma`
       - List EVERY field on `model Tenant`.
       - For each field, pre-classify as SAFE TO EDIT / DANGEROUS / IMMUTABLE.
         * IMMUTABLE candidates: `id`, `createdAt`, FK ids, tenant-identity fields.
         * DANGEROUS candidates: anything that could orphan data, change tenancy, billing identity,
           or that other tables reference by value (slug, subdomain, schema name).
         * SAFE candidates: display name, contact info, address-style fields, notes/metadata.
       - For each DANGEROUS field write a one-line "why dangerous".

    5. User Prisma model — `apps/web/prisma/schema.prisma`
       - List EVERY field on `model User`.
       - Pre-classify same way. Specifically confirm `passwordHash`, `isSystemAdmin`, `isSample`
         (or their actual field names) are IMMUTABLE through this sysadmin edit UI.
       - Note `tenantId`, `role`, `email` — typically DANGEROUS (tenancy moves, privilege
         escalation, identity collisions). Document why.

    6. Audit columns — `apps/web/prisma/schema.prisma`
       - Do `model Tenant` and `model User` have `createdById` / `updatedById` (or equivalent)?
       - If yes, grep for write sites: `(admin)/actions/tenants.ts`, `(admin)/actions/users.ts`,
         any `api/admin/tenants*` route. Are those columns populated?
       - Reference: TKT-0034 (`.planning/quick/390-tkt-0034-fix-swap-bare-prisma-to-gettena/`) only
         fixed carrier_* tables. Note that gap explicitly.

    7. Existing edit infrastructure — `apps/web/src/app/(admin)/actions/tenants.ts` and `users.ts`
       - Grep for `updateTenant`, `editTenant`, `patchTenant`, `updateUser`, `editUser`,
         `patchUser`. Record signatures and whether they exist.
       - Search for `apps/web/src/app/api/admin/tenants/[id]/route.ts` (PATCH/PUT).
       - Search for `apps/web/src/app/api/admin/users/[id]/route.ts`.
       - If write infrastructure exists but is not surfaced in UI, the build is smaller — flag it.

    8. Existing edit-form precedent
       - Find the most recently built edit form. Candidates: any `*Form.tsx` under
         `apps/web/src/app/(carrier)/`. Likely `CarrierTruckForm` from TKT-0033 Part 1.
       - Use Glob on `apps/web/src/app/**/*Form.tsx` if needed.
       - Document: form library (`react-hook-form` + `zod`? plain `<form>` + server action?),
         submission pattern (server action vs API route), success-state navigation
         (`router.push`? `router.refresh`? toast?), error display.
       - The new sysadmin edit forms MUST reuse this pattern.

    Use Read, Grep, and Glob tools only. Do NOT use Edit or Write on any source file. The ONLY
    Write call is to `.planning/quick/393-tkt-0037-diagnostic-sysadmin-edit-button/393-SUMMARY.md`
    (created in Task 2; for Task 1 you may scratch findings into a Working Notes section at the
    top of that file).
  </action>
  <verify>
    The SUMMARY.md file exists and contains, at minimum, these inventory sections (even if rough):
    1. Tenant detail page field list
    2. Tenant model field classification
    3. User model field classification
    4. Audit-column findings
    5. Existing action / API route findings
    6. Edit-form precedent findings
  </verify>
  <done>
    Every scoped file has been read. Every Tenant and User model field is enumerated and
    pre-classified. The existence (or absence) of updateTenant / updateUser is confirmed. The
    edit-form precedent (file path + library) is identified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Synthesize diagnostic report with UI-placement + build-scope recommendation</name>
  <files>
    .planning/quick/393-tkt-0037-diagnostic-sysadmin-edit-button/393-SUMMARY.md
  </files>
  <action>
    Convert the Task 1 working notes into a final, well-structured diagnostic report. Still
    READ-ONLY for source code — only the SUMMARY.md is written.

    Required report structure (use these exact H2 headings):

    ## Overview
    One paragraph: scope, why it matters (global blast radius), what was inspected.

    ## Tenant Detail Page — Current State
    - File path
    - Bulleted list of every field currently displayed (label → model property)
    - Existing edit affordance: yes/no (and if yes, what + where)
    - Layout pattern

    ## Tenant Model — Field Classification
    Table with columns: Field | Classification (SAFE / DANGEROUS / IMMUTABLE) | Reason
    Cover EVERY field. DANGEROUS rows must include a concrete failure mode (e.g. "changing slug
    breaks subdomain routing", "changing schema name orphans rows").

    ## User Model — Field Classification
    Same table format. Explicitly call out: passwordHash → IMMUTABLE (use auth flow),
    isSystemAdmin → IMMUTABLE (privilege escalation), isSample → IMMUTABLE (data integrity),
    tenantId → DANGEROUS (tenancy move), role → DANGEROUS (privilege), email → DANGEROUS (auth
    identity collision).

    ## Audit Columns
    - Tenant: has createdById/updatedById? populated? by which write paths?
    - User: same
    - Gap statement: TKT-0034 touched only carrier_* — note remediation scope for tenant/user.

    ## Existing Edit Infrastructure
    - updateTenant / editTenant / patchTenant — exists? signature? called from where?
    - updateUser / editUser / patchUser — same
    - /api/admin/tenants/[id] PATCH — exists?
    - /api/admin/users/[id] PATCH — exists?
    - Verdict: "build greenfield" vs "wire existing action to UI"

    ## Edit-Form Precedent
    - File path of the chosen precedent (likely CarrierTruckForm)
    - Form library + validation
    - Submission pattern (server action vs route)
    - Success-state navigation
    - Error display
    - One-line directive: "New sysadmin edit forms MUST follow this pattern."

    ## UI Placement Recommendation
    - Tenants: pick ONE of {edit button on detail page only, edit button on list row only, both}.
      Justify with: existing pattern consistency, cheapest to build, lowest blast radius.
    - Users: pick ONE of {row action button, click-row-opens-sheet (TKT-0033 Part 3 precedent),
      dedicated /users/[id] detail page}. Justify same way.

    ## Build-Scope Recommendation
    Pick ONE of: ONE prompt / TWO prompts / THREE prompts.
    - ONE: both tenant and user edit in a single review.
    - TWO: tenant edit first, user edit second.
    - THREE: tenant edit, user edit form, user edit UI wiring (TKT-0033 was split three ways).
    Justify based on: coupling (do they share infrastructure?), risk (is one strictly more
    dangerous?), review-size manageability (lines of diff per prompt).

    Recommendation must explicitly reference TKT-0033's three-part split and explain why this
    work is similar or different.

    ## Final Line
    The LAST line of the file must be EXACTLY:
    `TKT-0037 diagnostic complete. Build scope: [ONE | TWO | THREE] prompts.`
    (Replace the bracketed choice with the actual recommendation.)

    Do NOT create any other files. Do NOT modify any source code. Do NOT run tsc. Do NOT commit.
  </action>
  <verify>
    Open `.planning/quick/393-tkt-0037-diagnostic-sysadmin-edit-button/393-SUMMARY.md` and confirm:
    - All eight H2 sections above are present
    - Every Tenant and User model field appears in its classification table
    - Audit-column status is stated for both Tenant and User
    - Existing updateTenant / updateUser status is stated unambiguously
    - Edit-form precedent file path is concrete
    - UI placement is decided (not "either could work")
    - Final line matches exactly: `TKT-0037 diagnostic complete. Build scope: X prompts.`
  </verify>
  <done>
    The SUMMARY.md is a complete, decision-ready diagnostic that a follow-up author could use to
    write the build prompt(s) without re-reading any source file.
  </done>
</task>

</tasks>

<verification>
- `.planning/quick/393-tkt-0037-diagnostic-sysadmin-edit-button/393-SUMMARY.md` exists
- All required sections are present and populated
- No source files were modified (run `git status` — only the planning directory should appear)
- No git commits for code changes were created
- Final line of SUMMARY.md is the required attestation string
</verification>

<success_criteria>
- Tenant detail page fields fully enumerated
- Tenant and User model fields fully classified (SAFE / DANGEROUS / IMMUTABLE) with reasons
- Audit-column gap documented (TKT-0034 only fixed carrier_*)
- Existence of updateTenant / updateUser actions and admin PATCH routes confirmed
- Edit-form precedent identified with library + navigation pattern
- UI placement decided for both tenant and user edit affordances
- Build scope chosen (ONE / TWO / THREE prompts) with justification
- Final attestation line present
</success_criteria>

<output>
After completion, the diagnostic lives at:
`.planning/quick/393-tkt-0037-diagnostic-sysadmin-edit-button/393-SUMMARY.md`

No additional SUMMARY file is required — this plan's deliverable IS the SUMMARY.
</output>
