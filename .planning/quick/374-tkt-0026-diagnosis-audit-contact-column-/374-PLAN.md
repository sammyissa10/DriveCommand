---
phase: quick-374
plan: 374
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Facilities list page location is documented"
    - "Data fetch field selection is captured (contacts JSONB vs legacy scalars)"
    - "Contact column cell rendering code is captured"
    - "DB sample confirms whether legacy vs JSONB columns hold data"
    - "Status of TKT-0026 is determined (already resolved / still open / formatter bug)"
  artifacts:
    - path: ".planning/quick/374-tkt-0026-diagnosis-audit-contact-column-/374-SUMMARY.md"
      provides: "Diagnosis findings for TKT-0026"
      contains: "Status line + file paths + code snippets + DB sample + most recent commit"
  key_links:
    - from: "Facilities list page"
      to: "Prisma query / server action"
      via: "Data fetch — which fields are selected"
      pattern: "select.*contacts|contactName"
    - from: "Facilities table component"
      to: "Contact column cell renderer"
      via: "Field read by cell"
      pattern: "contacts|contactName"
---

<objective>
Diagnose TKT-0026 — Contact column on /carrier/facilities list view renders dashes for all facilities even when contact data was entered. Determine whether the list view was updated to read from the new `contacts` JSONB column (introduced by quick-184) or still reads from legacy `contactName`/`contactPhone`/`contactEmail` scalars.

Purpose: Produce a clear diagnosis with file paths, code snippets, DB evidence, and a status line so the user can decide on a fix (or close the ticket if already resolved).

Output: A SUMMARY.md with diagnosis findings. NO code changes. NO database changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# TKT-0026 details
- Filed Apr 5, 2026 by owner@test.com
- Reports: Contact column shows dashes for all facilities on /carrier/facilities
- Hypothesis: contacts saving correctly, but list cell not reading from new JSONB shape
- Related: quick-184 (same day) migrated contactName/contactPhone/contactEmail scalars to JSONB array `contacts`

# Prisma schema location
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Locate facilities list page, data fetch, and Contact column cell renderer</name>
  <files>READ ONLY — no files modified</files>
  <action>
    Perform a read-only investigation of the facilities list view. NO code changes. NO database changes.

    Step 1 — Locate the list page:
    - Look at apps/web/src/app/(owner)/carrier/facilities/page.tsx first
    - If the path differs, grep for "facilities" under apps/web/src/app to find the list route
    - Record the exact file path

    Step 2 — Locate the data fetch:
    - From the page, trace the data source: a Prisma query, server action, or RSC fetch
    - Common locations: apps/web/src/actions/, apps/web/src/app/(owner)/carrier/facilities/, server components in the page itself
    - Record:
      a. Exact path of the data fetch
      b. Which fields are selected for each facility
      c. SPECIFICALLY: does the select include `contacts` (JSONB) or `contactName`/`contactPhone`/`contactEmail` (legacy scalars), or both?
    - If `select` is not explicit (i.e., Prisma returns all fields by default), record that

    Step 3 — Locate the table component:
    - Find the component rendering the facilities list rows (e.g. FacilitiesList, FacilitiesTable, facilities-table.tsx)
    - Locate the Contact column cell — likely a `<TableCell>` or column definition entry labeled "Contact"
    - Capture the exact code snippet (5-15 lines) showing how the Contact cell renders its value
    - Record:
      a. What field does the cell read? (e.g., `facility.contacts`, `facility.contactName`)
      b. If it reads `contacts` (JSONB): how does it format the array? (first contact's name? joined? something else?)
      c. If it reads legacy scalars: that's a strong signal the bug is real — the new form writes to JSONB only

    Step 4 — Identify the most recent commit touching the facilities list page:
    - Run: git log --oneline -5 -- apps/web/src/app/(owner)/carrier/facilities/page.tsx
    - If list lives elsewhere, adjust path
    - Record commit hash + subject + date

    Capture all findings in working notes for the SUMMARY.
  </action>
  <verify>
    Working notes contain:
    - Exact file path of the list page
    - Exact file path of the data fetch + field selection (contacts vs legacy)
    - Exact file path of the table component + Contact cell code snippet
    - Most recent commit touching the list page
  </verify>
  <done>
    Static code investigation complete. File paths, field selections, and rendering logic captured. Zero files modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Query Supabase to confirm legacy vs JSONB column data presence</name>
  <files>READ ONLY — no files modified, no DB changes</files>
  <action>
    Use the Supabase MCP `execute_sql` tool to confirm whether legacy scalar columns hold data or are NULL on rows created after Apr 5, 2026 (the quick-184 migration date).

    Run this READ-ONLY query (no writes, no DDL):

    ```sql
    SELECT
      id,
      name,
      contact_name,
      contact_phone,
      contact_email,
      CASE
        WHEN contacts IS NULL THEN NULL
        ELSE jsonb_array_length(contacts)
      END AS contacts_count,
      created_at
    FROM facilities
    ORDER BY created_at DESC
    LIMIT 10;
    ```

    If the `facilities` table is named differently (e.g., `Facility` with quotes), check with:
    ```sql
    SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%facilit%';
    ```
    Then adjust the query.

    Record the full result set in working notes — this is the DB evidence for the SUMMARY.

    Interpretation guide:
    - If legacy `contact_name`/`contact_phone`/`contact_email` are NULL on recent rows AND `contacts_count` is > 0 → new form writes to JSONB only (confirms hypothesis)
    - If legacy scalars are populated AND contacts is empty → old form still active (unrelated bug)
    - If both populated → backfill happened (mixed state)

    DO NOT run UPDATE, INSERT, DELETE, ALTER, or any non-SELECT statements.
  </action>
  <verify>
    DB query returned a sample of ~10 facility rows showing the state of legacy scalars vs `contacts` JSONB. Result captured in working notes.
  </verify>
  <done>
    DB evidence collected. Legacy-vs-JSONB column population is confirmed on recent rows.
  </done>
</task>

<task type="auto">
  <name>Task 3: Determine status, write SUMMARY.md with full diagnosis</name>
  <files>.planning/quick/374-tkt-0026-diagnosis-audit-contact-column-/374-SUMMARY.md</files>
  <action>
    Synthesize Task 1 + Task 2 findings into a status determination, then write the SUMMARY.md.

    Status logic:
    - List view reads `contacts` JSONB correctly AND DB shows JSONB populated → "TKT-0026 already resolved — close ticket"
    - List view reads legacy scalars AND DB shows new rows have NULL scalars but populated `contacts` → "TKT-0026 still open — fix is small (1 cell renderer change + maybe a SELECT change to include `contacts`)"
    - List view reads `contacts` but formats incorrectly (e.g., reads wrong key, doesn't handle empty array) → "TKT-0026 still open — bug is in formatter logic"
    - Other (unexpected combination) → describe precisely what was found

    Write SUMMARY.md with the following structure:

    ```markdown
    # TKT-0026 Diagnosis — Audit Contact Column on Facilities List

    **Date:** 2026-05-18
    **Status:** {one of: already-resolved | still-open-cell-renderer | still-open-data-fetch | still-open-formatter | other}
    **Ticket:** TKT-0026 (filed Apr 5, 2026 by owner@test.com)

    ## Status Line
    {One-sentence verdict — e.g., "TKT-0026 is still open — the Contact cell still reads `facility.contactName` which is NULL on rows created after the quick-184 JSONB migration."}

    ## File Paths
    - **List page:** {exact path}
    - **Data fetch:** {exact path}
    - **Table component:** {exact path}

    ## Data Fetch — Field Selection
    {Describe what the Prisma query / server action selects. Quote a snippet if useful. Specifically call out: contacts JSONB vs legacy scalars.}

    ## Contact Cell Rendering Code
    ```tsx
    {paste the exact 5-15 line snippet of the Contact cell renderer}
    ```

    ## Database Evidence
    {Paste the result of the SELECT query showing recent facility rows. Highlight whether legacy scalars are NULL while `contacts_count > 0`.}

    ## Diagnosis
    {2-4 sentences explaining what's broken (or what's working). If broken: name the exact line/file + the exact fix needed (but DO NOT apply it).}

    ## Most Recent Commit Touching List Page
    `{hash}` — {subject} ({date})

    ## Recommended Next Step
    {Either: "Close ticket — already resolved" OR "Open a follow-up quick task to: (a) ensure data fetch selects `contacts`, (b) update Contact cell renderer to read first contact from JSONB array, (c) handle empty array case."}
    ```

    Write SUMMARY.md to the exact path: .planning/quick/374-tkt-0026-diagnosis-audit-contact-column-/374-SUMMARY.md

    DO NOT modify any other files. DO NOT push to git unless asked.
  </action>
  <verify>
    File exists at .planning/quick/374-tkt-0026-diagnosis-audit-contact-column-/374-SUMMARY.md and contains all required sections (status line, file paths, field selection, cell renderer snippet, DB sample, diagnosis, most recent commit, recommended next step).
  </verify>
  <done>
    SUMMARY.md written. TKT-0026 has a clear status determination backed by code references and DB evidence. No code or DB changes were made.
  </done>
</task>

</tasks>

<verification>
- SUMMARY.md exists at the expected path with all required sections
- No application code files were modified
- No database writes occurred (only SELECT queries via Supabase MCP)
- Status line clearly states one of: already-resolved | still-open-cell-renderer | still-open-data-fetch | still-open-formatter | other
- Most recent commit touching the list page is captured
</verification>

<success_criteria>
- TKT-0026 status is determined with code + DB evidence
- File paths, code snippets, DB row sample, and commit hash are documented
- The user can immediately decide: close the ticket OR file a follow-up fix task with a clear scope
</success_criteria>

<output>
After completion, the SUMMARY.md at `.planning/quick/374-tkt-0026-diagnosis-audit-contact-column-/374-SUMMARY.md` serves as the diagnosis artifact. No further phase/plan SUMMARYs needed (this is a quick task).
</output>
