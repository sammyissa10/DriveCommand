---
phase: quick-385
plan: 385
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/385-tkt-0033-diagnostic-truck-details-page-u/385-SUMMARY.md
autonomous: true
diagnostic: true
read_only: true

must_haves:
  truths:
    - "Truck details page default render mode (edit vs view) is identified with exact line numbers"
    - "Truck model photo/image column existence is confirmed (or absence documented)"
    - "Existing photo/file upload pattern in the codebase is identified with file path"
    - "Storage layer (Supabase Storage vs S3-compatible R2) is confirmed"
    - "Trucks overview row-click behavior is documented"
    - "A concrete reusable Sheet component example exists for the quick-view implementation"
    - "Recommended Truck fields for quick-view sheet are listed from the actual Prisma model"
  artifacts:
    - path: ".planning/quick/385-tkt-0033-diagnostic-truck-details-page-u/385-SUMMARY.md"
      provides: "Diagnostic findings for all three TKT-0033 sub-issues"
      contains: "Issue 1, Issue 2, Issue 3 sections with file paths, line numbers, and recommendations"
  key_links:
    - from: "385-SUMMARY.md"
      to: "apps/web/src/app/(carrier)/carrier/fleet/trucks/[id]/"
      via: "file path + line number references"
      pattern: "apps/web/src/app/.*trucks/\\[id\\]"
    - from: "385-SUMMARY.md"
      to: "apps/web/prisma/schema.prisma"
      via: "Truck model field references"
      pattern: "model Truck"
---

<objective>
Diagnostic investigation of TKT-0033 — three UX issues on the truck details / trucks overview pages.
This is a READ-ONLY investigation. No code changes, no source code commits.

Purpose: Produce a precise, file-path-and-line-number-grounded findings document that a follow-up
implementation task can use as its source of truth. The follow-up work will be a separate quick
task (or phase) that fixes the three issues based on these findings.

The three sub-issues under TKT-0033:
1. Truck details page defaults to edit mode — should default to view/read mode with an Edit button.
2. No way to upload a truck photo (image of the truck itself).
3. Clicking a truck row on the overview page navigates away — should open a side sheet with a quick view.

Output: A single SUMMARY.md file with structured findings per sub-issue, including:
- Exact file paths
- Exact line numbers where current behavior is defined
- Existing patterns we can copy
- Concrete recommendations for the follow-up implementation
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Target areas of the codebase to investigate
# Do NOT @-include these in advance — the task action below directs the executor
# to read them as part of the diagnostic. Listing here for reference only.
#
# apps/web/src/app/(carrier)/carrier/fleet/trucks/[id]/
# apps/web/src/app/(carrier)/carrier/fleet/trucks/page.tsx
# apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run diagnostic investigation and write findings to SUMMARY.md</name>
  <files>.planning/quick/385-tkt-0033-diagnostic-truck-details-page-u/385-SUMMARY.md</files>
  <action>
This is a READ-ONLY diagnostic. Do NOT modify any source files. Do NOT run git commit on source files.
The ONLY file you write is the SUMMARY.md at the path above.

Investigate the three sub-issues below. For each, gather concrete evidence (file paths,
line numbers, code snippets) BEFORE writing the SUMMARY.md. Then write the findings.

============================================================
ISSUE 1 — Truck details page defaults to edit mode
============================================================

Goal: Identify exactly where/how the truck details page decides its render mode (edit vs view),
and list every editable field so a follow-up task can wrap them in a view/edit toggle.

Steps:
1. Locate the truck details route directory:
   - Glob: `apps/web/src/app/(carrier)/carrier/fleet/trucks/[id]/**`
   - Also try variants if the route group is different:
     `apps/web/src/app/**/fleet/trucks/[id]/**`
     `apps/web/src/app/**/trucks/[id]/**`
2. Read the page.tsx (and any client components it imports — e.g., a TruckDetailForm.tsx or
   TruckEditForm.tsx).
3. Determine the current default render state:
   - Is there a `useState` for `isEditing` / `mode` / `editing`? If yes, what is its initial value?
   - Are inputs (Input, Select, Textarea) rendered unconditionally? Or gated by a mode flag?
   - Is the form always editable on mount?
   - Record EXACT file path + line number for the initialization (e.g.,
     `apps/web/src/app/(carrier)/carrier/fleet/trucks/[id]/TruckDetailClient.tsx:42`).
4. List every editable field on the page (field name + input type — e.g., `vin: Input`,
   `status: Select`, `make: Input`, etc.).
5. Note the submit/save mechanism (server action name, mutation hook, route handler).
6. Identify the "Save" button label and location.

Output for Issue 1 in SUMMARY.md:
- Current default mode (with exact file:line citation)
- Why it defaults that way (control flow explanation)
- Full list of editable fields
- Save mechanism details
- Recommendation: where to add the `viewMode` state, what the toggle button should look like,
  what fields need read-only variants.

============================================================
ISSUE 2 — Cannot upload truck photo
============================================================

Goal: Confirm whether the Truck model already has a photo column, and identify the existing
upload pattern that should be reused.

Steps:
1. Read `apps/web/prisma/schema.prisma`. Find the `model Truck { ... }` block.
   - Grep for fields containing: `photo`, `image`, `picture`, `thumbnail`, `url`.
   - Record every field on the Truck model relevant to images, AND record absent ones explicitly.
2. Find existing photo/file upload patterns. Run these searches and pick the most relevant:
   - Grep `presignedUrl` OR `getPresignedUrl` across `apps/web/src/`
   - Grep `r2` OR `R2` (Cloudflare R2 is referenced in CLAUDE.md)
   - Grep `supabase.storage` across `apps/web/src/`
   - Look at these likely candidates (in priority order):
     a. Driver documents upload — `apps/web/src/app/**/documents/**` or
        `apps/web/src/app/api/**/documents/**`
     b. Expense receipts — grep `receipt` in actions / api routes
     c. Incident photos — `apps/web/src/app/api/**/incidents/**`
     d. Support ticket screenshots — grep `screenshot`
3. Confirm storage layer from the helper code. CLAUDE.md says **Cloudflare R2 (S3-compatible)**.
   Confirm or contradict by reading the helper file (e.g., `apps/web/lib/storage/*.ts` or
   `apps/web/lib/r2/*.ts`).
4. Identify the upload helper file path that would be reused for truck photos (e.g.,
   `apps/web/lib/storage/r2.ts` — exact path).
5. Identify the UI upload component (if one exists — e.g., `DocumentUploadSheet`,
   `PhotoUploadButton`).

Output for Issue 2 in SUMMARY.md:
- Whether `photo_url` / `image_url` / similar exists on Truck (with exact schema line)
- If absent: recommended column name + Prisma type + migration sketch
- Storage backend confirmation (R2 confirmed, with file path + 1-line code citation)
- Path to the reusable upload helper
- Path to the closest existing upload UI to copy
- Recommendation for the follow-up task: schema change needed (yes/no), reusable helpers,
  and where to mount the new UI on the truck details page.

============================================================
ISSUE 3 — Trucks overview row click navigates away
============================================================

Goal: Document current row-click behavior, find the best Sheet example in the codebase,
and propose fields for a quick-view sheet.

Steps:
1. Read `apps/web/src/app/(carrier)/carrier/fleet/trucks/page.tsx` (or the actual location —
   glob `apps/web/src/app/**/fleet/trucks/page.tsx`).
2. Find the row click handler:
   - Is each row a `<Link>` to `/carrier/fleet/trucks/[id]`?
   - Is there an `onClick` that calls `router.push`?
   - Record exact file:line.
3. Find the best Sheet component example to reuse. Search:
   - Grep for `import { Sheet` in `apps/web/src/` — list 3-5 files using `Sheet`.
   - Look for usage patterns where a row click opens a sheet (NOT navigation). Likely
     candidates: loads quick-view, driver quick-view, CRM contact sheet.
   - If none open a sheet on row click in carrier portal, find the shadcn `<Sheet>` import path
     (`@/components/ui/sheet` is the standard shadcn location).
4. Read the Truck Prisma model again and pick the most useful quick-view fields. Aim for 5-8
   fields that a dispatcher would want to see at a glance (e.g., unit number, VIN, status,
   make/model/year, license plate, current driver, last service date, document expiry).
5. Note whether the page is a client component already (`'use client'` at top). If it's a
   server component, the sheet trigger needs to be lifted into a client wrapper — call this
   out.

Output for Issue 3 in SUMMARY.md:
- Exact current click behavior (file:line)
- Best Sheet example file (with import path of the Sheet primitives)
- Server vs client component status of the trucks list page
- Recommended quick-view fields (5-8, with reasoning)
- Recommendation: a `TruckQuickViewSheet` client component; trigger from row click;
  optional "Open full details" link inside the sheet that does the current navigation.

============================================================
SUMMARY.md STRUCTURE
============================================================

Write to:
  `.planning/quick/385-tkt-0033-diagnostic-truck-details-page-u/385-SUMMARY.md`

Use this exact structure:

```markdown
# Quick 385 — TKT-0033 Diagnostic: Truck Details Page UX

**Status:** diagnostic-complete
**Type:** read-only investigation
**Date:** 2026-05-19

## TL;DR

(3-5 bullet summary of what was found and what the follow-up task needs to do.)

---

## Issue 1 — Truck details defaults to edit mode

### Current behavior
- File: `<exact path>`
- Default mode: edit / view
- Initialization line: `<file>:<line>`
- Why: <1-sentence control-flow explanation>

### Editable fields
| Field | Input type | Required? |
|-------|------------|-----------|
| ... | ... | ... |

### Save mechanism
- Server action / mutation: `<name>` at `<file>:<line>`
- Save button: `<file>:<line>`, label "<text>"

### Recommendation for follow-up task
- Add `viewMode` state (default `'view'`)
- Wrap editable fields in `{viewMode === 'edit' ? <Input /> : <ReadOnlyValue />}`
- Add Edit / Save / Cancel buttons in header
- Suggested follow-up plan title: ...

---

## Issue 2 — Truck photo upload missing

### Schema state
- `apps/web/prisma/schema.prisma`, model Truck:
  - photo column present? <yes/no> (`<field name>: <type>` if yes; or "absent" if no)
  - Other image-adjacent fields: <list or "none">

### Existing upload pattern (reusable)
- Closest pattern: <feature name>
- Helper file: `<exact path>`
- UI component: `<exact path>` (e.g., `apps/web/src/components/.../DocumentUploadSheet.tsx`)
- Storage backend: Cloudflare R2 (confirmed at `<file>:<line>`)

### Recommendation for follow-up task
- Schema change required: <yes/no — with migration sketch if yes>
- Reusable helper: `<path>`
- Where to mount upload UI on truck details: <section/component>
- Display: aspect ratio, fallback when no photo

---

## Issue 3 — Trucks overview row click navigates away

### Current behavior
- File: `<exact path>`
- Row implementation: `<Link href=... />` / `onClick router.push` / other
- Line: `<file>:<line>`
- Component type: server / client

### Best Sheet example in codebase
- File: `<exact path>`
- Sheet primitives import: `<import line>`
- Why this example: <1 sentence>

### Recommended quick-view fields (from Truck model)
1. <field> — <why>
2. ...

### Recommendation for follow-up task
- Create `TruckQuickViewSheet` client component
- Replace row `<Link>` with `<SheetTrigger>`
- Include "Open full details" link inside sheet to preserve current deep-link
- Component placement: `<suggested path>`

---

## Files referenced in this investigation

(Full list of every absolute file path read during the diagnostic, for the follow-up task.)
```

============================================================
RULES — VERY IMPORTANT
============================================================

- READ-ONLY: Do NOT edit, create, or delete any source file. Only write the SUMMARY.md.
- Do NOT run `git commit` for source code. The SUMMARY.md write is fine to leave for the user
  to commit later.
- Every claim in the SUMMARY.md must cite a file path (and line number where applicable).
- If a search returns nothing, document that explicitly ("no Sheet usage in carrier/fleet — used
  shadcn primitive directly") — do not guess.
- Keep the SUMMARY.md tight and scannable. Tables and short bullets, not prose paragraphs.
  </action>
  <verify>
1. `.planning/quick/385-tkt-0033-diagnostic-truck-details-page-u/385-SUMMARY.md` exists.
2. SUMMARY.md contains the three required H2 sections (Issue 1, Issue 2, Issue 3).
3. Each issue section cites at least one absolute or repo-relative file path with line numbers
   where applicable.
4. The "Files referenced" section at the bottom is populated.
5. `git status` shows NO modified files under `apps/`, `packages/`, or `prisma/` — only the new
   SUMMARY.md under `.planning/quick/385-*/`.
  </verify>
  <done>
- A single SUMMARY.md exists at the path above.
- All three sub-issues have current-behavior findings, citations, and concrete follow-up
  recommendations.
- Storage backend (R2) is confirmed with a file:line citation.
- No source code under `apps/`, `packages/`, or `prisma/` was modified.
  </done>
</task>

</tasks>

<verification>
- Open the produced SUMMARY.md and confirm all three Issue sections are filled with
  concrete file paths and line numbers (no `<...>` placeholders left).
- `git status` shows zero modifications under `apps/`, `packages/`, or `prisma/`.
- The follow-up implementation task (a future quick task) can be scoped from the SUMMARY.md
  without re-reading the truck details page.
</verification>

<success_criteria>
- SUMMARY.md exists at `.planning/quick/385-tkt-0033-diagnostic-truck-details-page-u/385-SUMMARY.md`.
- Diagnostic answers all three sub-issues with file:line evidence.
- Recommendation for each sub-issue is concrete enough to write a follow-up PLAN against
  without another investigation pass.
- Zero source-code changes (no diff under `apps/`, `packages/`, `prisma/`).
</success_criteria>

<output>
After completion, the SUMMARY.md at
`.planning/quick/385-tkt-0033-diagnostic-truck-details-page-u/385-SUMMARY.md`
IS the deliverable. No further phase summary needed.
</output>
