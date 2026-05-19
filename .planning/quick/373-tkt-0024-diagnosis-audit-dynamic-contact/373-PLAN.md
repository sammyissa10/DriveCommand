---
phase: 373-tkt-0024-diagnosis-audit-dynamic-contact
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Diagnosis identifies whether the New Facility form uses single fields or a dynamic contacts array"
    - "Comparison table shows DB schema vs Prisma model vs Form UI vs Server action contact-handling state"
    - "Final status (resolved / still open / partially resolved) is supported by direct evidence from code + live DB"
    - "Most recent git commit touching the facility form is identified with hash, date, and message"
  artifacts:
    - path: ".planning/quick/373-tkt-0024-diagnosis-audit-dynamic-contact/373-SUMMARY.md"
      provides: "TKT-0024 diagnosis findings, comparison table, status verdict, and remediation hints if open"
      contains: "Comparison table, status verdict, most recent commit hash"
  key_links:
    - from: "FacilityForm.tsx"
      to: "facility server action"
      via: "form submit -> action create/update"
      pattern: "createFacility|updateFacility"
    - from: "FacilityForm contacts UI"
      to: "CarrierFacility model fields"
      via: "form field -> Prisma field mapping"
      pattern: "contactName|contactPhone|contactEmail|contacts"
---

<objective>
Diagnose TKT-0024: verify whether the New Facility form at `/carrier/facilities/new` still uses single
Contact Name/Phone/Email scalar fields, or whether the QT 184 rewrite (same day as TKT-0023) introduced
the desired dynamic add/remove contacts array persisted as JSONB.

Purpose: Resolve the ambiguity around TKT-0024 with concrete evidence from form code, Prisma schema,
live DB columns, server action transformations, and product spec intent — without touching any code or data.
Output: A SUMMARY.md containing a comparison matrix and a defensible verdict
(resolved / still open / partially resolved) plus the most recent commit touching the form.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/components/carrier/facilities/FacilityForm.tsx
@apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Gather facility contact evidence (form + schema + live DB + server action + spec intent)</name>
  <files>
    READ ONLY (no writes):
    - apps/web/src/components/carrier/facilities/FacilityForm.tsx
    - apps/web/src/app/(owner)/carrier/facilities/new/page.tsx
    - apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
    - apps/web/prisma/schema.prisma (search for `model CarrierFacility`)
    - Server action(s) wiring the form. Find via grep:
        * `grep -r "createFacility\|updateFacility\|carrierFacility" apps/web/src/actions apps/web/src/app`
    - Product docs/specs. Search the repo for intent:
        * `grep -rni "dynamic contacts\|contacts JSONB\|contacts json\|contacts\\[\\]" docs/ .planning/ apps/web/src/`
        * `grep -rni "TC-04\|TKT-0024" docs/ .planning/`
  </files>
  <action>
    Pure read + grep + live DB query. DO NOT modify code, schema, or data.

    Step A — FORM UI (FacilityForm.tsx):
      - Identify how contacts are captured. Look for:
        * Single scalar inputs: `contactName`, `contactPhone`, `contactEmail` (one of each) — TKT-0024 reported state.
        * OR a dynamic array UI: `useFieldArray`, `contacts.map(...)`, "Add contact" / "Remove" buttons, indexed names like `contacts[0].name`.
      - Record exact field names, default values, and how submit payload is shaped (look for `onSubmit`/`handleSubmit`).
      - Note any JSON.stringify / JSON serialization of contacts before submit.

    Step B — PRISMA MODEL (apps/web/prisma/schema.prisma):
      - Locate `model CarrierFacility`.
      - List EVERY contact-related field with type:
        * Scalars: e.g. `contactName String?`, `contactPhone String?`, `contactEmail String?`
        * JSON/JSONB: e.g. `contacts Json?` (Prisma maps Json -> jsonb in Postgres)
      - Note `@db.JsonB` or `@map` annotations.

    Step C — LIVE DB (Supabase MCP):
      - Use Supabase MCP `list_tables` to find the facilities table (likely `CarrierFacility` or `carrier_facilities`).
      - Inspect column list. Confirm presence/absence of:
        * Scalar contact columns (contact_name, contact_phone, contact_email or camelCase variants)
        * A `contacts` jsonb column
      - Record the exact column names and data types as returned by MCP.

    Step D — SERVER ACTION:
      - Open the create/update server action(s) found via grep.
      - Trace how form input is mapped to the Prisma `create`/`update` payload.
      - Document whether contacts are written as scalars, JSON, or both.
      - Note any Zod schemas validating the contact shape (search `packages/validation` and local action files).

    Step E — SPEC / INTENT:
      - Search docs/specs and .planning/ for "dynamic contacts", "contacts JSONB", "TC-04", "TKT-0024".
      - Capture the desired-state requirement in 1-2 sentences with file:line citation.

    Step F — MOST RECENT GIT COMMIT touching the form:
      - Run: `git log -n 5 --pretty=format:"%h %ad %s" --date=short -- apps/web/src/components/carrier/facilities/FacilityForm.tsx`
      - Record the most recent commit (hash, date, message) and note whether it references TKT-0023, TKT-0024, or QT 184.

    Build a COMPARISON TABLE (Markdown) with columns:
      | Layer            | Current State                              | Desired State (per spec)       | Match? |
      |------------------|--------------------------------------------|--------------------------------|--------|
      | DB columns       | …                                          | `contacts jsonb`               | ✓ / ✗  |
      | Prisma model     | …                                          | `contacts Json?`               | ✓ / ✗  |
      | Form UI          | single fields / dynamic array              | dynamic add/remove array       | ✓ / ✗  |
      | Server action    | scalars / JSON write                       | writes `contacts` JSON array   | ✓ / ✗  |

    Determine STATUS verdict:
      - resolved: all 4 layers ✓
      - partially resolved: some ✓ (call out which)
      - still open: form/action still use scalars

    Write findings to `.planning/quick/373-tkt-0024-diagnosis-audit-dynamic-contact/373-SUMMARY.md` with sections:
      1. Verdict (one sentence)
      2. Evidence — Form UI (file:line excerpts)
      3. Evidence — Prisma model (field list)
      4. Evidence — Live DB columns (from Supabase MCP)
      5. Evidence — Server action mapping
      6. Spec intent (citation)
      7. Comparison Table
      8. Most recent commit touching FacilityForm.tsx
      9. Recommended next step (if not fully resolved): brief remediation hint — DO NOT implement.

    HARD CONSTRAINTS:
      - DO NOT edit any source file, migration, schema, or DB row.
      - DO NOT run `prisma migrate`, `prisma db push`, or any write SQL.
      - Supabase MCP usage is read-only (`list_tables`, `execute_sql` with SELECT only).
  </action>
  <verify>
    - SUMMARY.md exists at `.planning/quick/373-tkt-0024-diagnosis-audit-dynamic-contact/373-SUMMARY.md`.
    - SUMMARY.md contains all 9 sections listed above.
    - Comparison table populated with concrete column/field names (no "TBD" placeholders).
    - Verdict is one of: resolved | partially resolved | still open.
    - `git status` shows no modifications to any tracked file except the new SUMMARY.md.
  </verify>
  <done>
    - TKT-0024 status is decisively answered with citations from form, schema, live DB, action, and spec.
    - Reader can act on the verdict without re-doing the investigation.
    - Zero code or DB mutations occurred.
  </done>
</task>

</tasks>

<verification>
- Run `git status` — only the new SUMMARY.md (and this PLAN.md) should appear as changes.
- Open SUMMARY.md and confirm comparison table + verdict + most-recent-commit line are all present.
- Spot-check one cited file:line from each Evidence section.
</verification>

<success_criteria>
- SUMMARY.md exists with verdict, comparison table, and commit reference.
- All four layers (DB / Prisma / Form / Action) audited with direct evidence.
- No source files or DB rows were modified.
</success_criteria>

<output>
After completion, create `.planning/quick/373-tkt-0024-diagnosis-audit-dynamic-contact/373-SUMMARY.md`
following the template at @C:/Users/sammy/.claude/get-shit-done/templates/summary.md.
</output>
