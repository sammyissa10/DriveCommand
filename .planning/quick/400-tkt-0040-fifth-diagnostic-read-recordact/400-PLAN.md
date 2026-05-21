---
phase: 400-tkt-0040-fifth-diagnostic
plan: 400
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Diagnostic produces verbatim body of recordActivationEvent"
    - "Diagnostic confirms whether each carrier POST route (truck/driver/client) calls recordActivationEvent"
    - "Diagnostic confirms @@map directives on Truck, Customer, User, Driver models in schema.prisma"
    - "Diagnostic enumerates every call site of recordActivationEvent in the codebase"
    - "Final output line states exactly which path updates activation_progress vs which path the carrier UI writes through, and names the precise gap"
  artifacts:
    - path: ".planning/quick/400-tkt-0040-fifth-diagnostic-read-recordact/400-SUMMARY.md"
      provides: "Read-only diagnostic write-up with verbatim code and gap analysis"
      contains: "TKT-0040 fifth diagnostic complete."
  key_links:
    - from: "carrier POST routes (truck/driver/client)"
      to: "recordActivationEvent"
      via: "import + call (or absence thereof)"
      pattern: "recordActivationEvent\\("
    - from: "recordActivationEvent"
      to: "activation_progress table / Prisma model"
      via: "DB write (prisma.<model>.update|upsert)"
      pattern: "activation_?[Pp]rogress|ActivationProgress"
---

<objective>
Run a READ-ONLY diagnostic to pin down why Jordan Expedite's `activation_progress` row never reflects truck/driver/client creates performed through the carrier portal.

Purpose: Confirm (or refute) the hypothesis that the carrier API routes write to one data path while `recordActivationEvent` reads/writes a different one — i.e., a data-model mismatch between the carrier write path and the activation tracker.

Output: A diagnostic SUMMARY containing verbatim code (recordActivationEvent body), per-route call analysis, schema @@map findings, and the precise gap statement.

Constraints (NON-NEGOTIABLE):
- READ-ONLY. No code changes. No fix. No tsc.
- No edits to any source file. Only the SUMMARY.md is produced.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/tkt-0040-onboarding-welcome-stale-data.md
@.planning/debug/tkt-0040-post-fix-verification.md

# Primary source files (read these — do not modify)
@apps/web/src/lib/onboarding/activation-tracker.ts
@apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Read recordActivationEvent and locate all call sites</name>
  <files>
    (READ-ONLY — no files modified)
    apps/web/src/lib/onboarding/activation-tracker.ts
  </files>
  <action>
    Do NOT modify any source files. This is a read-only investigation.

    1. Open `apps/web/src/lib/onboarding/activation-tracker.ts` and capture the FULL verbatim body of `recordActivationEvent` (every line, including imports it uses, types, the function signature, and the function body). Preserve as-is.

    2. Determine from the body:
       - Does it do a DB lookup before stamping? If yes, against which Prisma model / table?
       - Does it check for row existence in any "old" tables (e.g., a legacy `tenant`/`carrier` table vs a new one)?
       - Which Prisma model does it write to (e.g., `prisma.activationProgress.update`, `prisma.tenant.update`, etc.)?
       - How is `tenantId` (or equivalent) resolved inside the function?

    3. Search the entire repo for call sites of `recordActivationEvent` using Grep:
       - Pattern: `recordActivationEvent\(`
       - Record every file + line + surrounding context (3 lines before/after) where it is called.

    4. Collect notes in memory for Task 3 to write into the SUMMARY.

    Why: We need ground truth on what `recordActivationEvent` actually does and who actually calls it, before claiming the carrier routes "don't wire up correctly." Hypothesis to test: carrier routes may not call it at all, OR they call it but it targets the wrong table.

    Do NOT propose fixes. Do NOT edit code. Do NOT run tsc.
  </action>
  <verify>
    Notes captured cover (a) full verbatim body, (b) DB target model, (c) tenant resolution mechanism, (d) every call site in the repo. No source files modified (git status should show no changes to apps/web/src/**).
  </verify>
  <done>
    Verbatim body of recordActivationEvent is captured. Full list of call sites is captured with file paths and line numbers. Read-only — no source edits.
  </done>
</task>

<task type="auto">
  <name>Task 2: Audit carrier POST routes for truck / driver / client and check schema @@map</name>
  <files>
    (READ-ONLY — no files modified)
    apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    apps/web/prisma/schema.prisma
  </files>
  <action>
    Do NOT modify any source files. Read-only investigation.

    1. Read `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` in full. For the POST handler, answer:
       - Is `recordActivationEvent` imported? Is it called?
       - If called: what arguments are passed? Where does `tenantId` come from (URL param? auth context? request body?)
       - Which Prisma model does the POST write to (e.g., `prisma.truck.create`)?

    2. Find the carrier DRIVER POST handler:
       - Use Grep to locate it. Try patterns like `app/api/v1/carrier/**/drivers/**/route.ts` via Glob, and `prisma\.(driver|user)\.create` near `carrier` paths via Grep.
       - Read the POST handler. Same three questions: import? call? args + tenantId source? Prisma target model?

    3. Find the carrier CLIENT (a.k.a. contact / customer) POST handler:
       - Use Glob: `apps/web/src/app/api/v1/carrier/**/clients/**/route.ts`, `**/contacts/**/route.ts`, `**/customers/**/route.ts`.
       - Read the POST handler. Same three questions.

    4. Open `apps/web/prisma/schema.prisma` and search for `@@map` directives on these models:
       - `Truck`
       - `Customer`
       - `User`
       - Any model literally named `Driver` (search for `model Driver`)
       Record each model's `@@map("...")` value verbatim (or note "no @@map" if absent).

    5. Also note which Prisma model `recordActivationEvent` writes to (from Task 1) — if it has an `@@map`, capture it. The question we are answering: are the carrier write models and the activation-tracker write/read model mapped to the SAME underlying Postgres table, or different ones?

    Collect notes for Task 3.

    Do NOT propose fixes. Do NOT edit code. Do NOT run tsc.
  </action>
  <verify>
    For each of the three carrier POST routes (truck, driver, client), the import/call status, argument shape, tenantId source, and Prisma target model are captured. `@@map` values (or absence) recorded for Truck, Customer, User, and any Driver model. No source files modified.
  </verify>
  <done>
    Per-route audit notes + schema @@map findings are captured and ready to write into SUMMARY.md.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write diagnostic SUMMARY with verbatim code and gap statement</name>
  <files>
    .planning/quick/400-tkt-0040-fifth-diagnostic-read-recordact/400-SUMMARY.md
  </files>
  <action>
    Create the SUMMARY at the path above. Structure:

    ```
    # TKT-0040 — Fifth Diagnostic: recordActivationEvent vs Carrier Write Path

    ## 1. recordActivationEvent — Verbatim Body
    File: apps/web/src/lib/onboarding/activation-tracker.ts

    ```ts
    <PASTE FULL FUNCTION BODY VERBATIM HERE>
    ```

    ### Behavior analysis
    - DB lookup before stamping? Yes/No — against which table?
    - Checks existence in legacy/old tables? Yes/No — which?
    - Writes to Prisma model: `prisma.<model>.<op>`
    - tenantId resolution: <how it gets tenantId inside the function>

    ## 2. All Call Sites of recordActivationEvent
    | File | Line | Context |
    |------|------|---------|
    | ... | ... | ... |

    ## 3. Carrier POST Route Audit

    ### 3a. Truck — `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts`
    - Imports recordActivationEvent? Yes/No
    - Calls recordActivationEvent? Yes/No
    - If called: arguments = ..., tenantId source = ...
    - Prisma write target: `prisma.<model>.create`

    ### 3b. Driver — <path found via search>
    - Imports recordActivationEvent? Yes/No
    - Calls recordActivationEvent? Yes/No
    - If called: arguments = ..., tenantId source = ...
    - Prisma write target: `prisma.<model>.create`

    ### 3c. Client/Customer/Contact — <path found via search>
    - Imports recordActivationEvent? Yes/No
    - Calls recordActivationEvent? Yes/No
    - If called: arguments = ..., tenantId source = ...
    - Prisma write target: `prisma.<model>.create`

    ## 4. schema.prisma @@map Directives
    | Model | @@map value (or "none") |
    |-------|-------------------------|
    | Truck | ... |
    | Customer | ... |
    | User | ... |
    | Driver (if exists) | ... |
    | <model recordActivationEvent writes to> | ... |

    ## 5. Gap Analysis
    Walk through:
    - Path A (what updates activation_progress): which call site(s) actually run, what they update, when they fire.
    - Path B (what carrier UI writes): which routes carrier UI hits, which Prisma models they touch.
    - Precise gap: name it in one sentence.

    ## 6. Final Output (REQUIRED — exact format)
    TKT-0040 fifth diagnostic complete. activation_progress is updated by [path A], carrier UI writes via [path B], gap is [precise gap].
    ```

    Constraints:
    - Paste the recordActivationEvent body VERBATIM. Do not paraphrase.
    - The final output line must literally match the format above with [path A], [path B], [precise gap] filled in with concrete identifiers (file paths, function names, route paths).
    - No fix recommendations. No "we should do X." Diagnostic only. If the user asks for a fix afterward, that is a separate plan.
    - Do NOT touch any source files. Only the SUMMARY.md is created.
  </action>
  <verify>
    `.planning/quick/400-tkt-0040-fifth-diagnostic-read-recordact/400-SUMMARY.md` exists. It contains: (1) verbatim recordActivationEvent body, (2) call-site table, (3) per-route audit for truck/driver/client carrier POSTs, (4) @@map table, (5) gap analysis, (6) final output line in exact format. `git status` shows no edits to anything in `apps/web/src/**` or `apps/web/prisma/**`.
  </verify>
  <done>
    SUMMARY is on disk, contains all six sections, ends with the exact final output line. Zero source code changes made.
  </done>
</task>

</tasks>

<verification>
- `git status` shows no modifications to apps/web/src/** or apps/web/prisma/** (read-only confirmed).
- SUMMARY.md exists at the required path.
- SUMMARY.md contains the verbatim recordActivationEvent body (not paraphrased).
- SUMMARY.md ends with the exact final output line: "TKT-0040 fifth diagnostic complete. activation_progress is updated by [path A], carrier UI writes via [path B], gap is [precise gap]." with concrete identifiers filled in.
- No tsc was run. No fix code was written.
</verification>

<success_criteria>
- Three diagnostic questions answered with evidence: (a) what is recordActivationEvent's actual write target? (b) which carrier POST routes call it and which don't? (c) do schema @@map directives create a name/table mismatch?
- The precise gap between path-A (activation_progress writer) and path-B (carrier UI writer) is named in the SUMMARY with concrete file paths / function names / table names — not vague descriptions.
- Zero source code changes.
</success_criteria>

<output>
After completion, the SUMMARY at `.planning/quick/400-tkt-0040-fifth-diagnostic-read-recordact/400-SUMMARY.md` is the deliverable. No separate STATE.md update required for a read-only diagnostic; the executor may append a short bullet to STATE.md noting that the fifth diagnostic is complete and where the SUMMARY lives, but that is the only allowed write outside the SUMMARY itself.
</output>
