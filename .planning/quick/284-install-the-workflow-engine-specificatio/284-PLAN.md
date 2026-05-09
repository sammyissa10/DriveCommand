---
phase: 284-install-the-workflow-engine-specificatio
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/specs/workflow-engine.md
autonomous: true

must_haves:
  truths:
    - "docs/specs/ directory exists at repo root"
    - "docs/specs/workflow-engine.md exists (the canonical path referenced by CLAUDE.md loader directive)"
    - "Root CLAUDE.md contains the Workflow Engine Spec loader block"
    - "Branch feat/workflow-engine-spec exists and has a commit installing the spec"
  artifacts:
    - path: "docs/specs/workflow-engine.md"
      provides: "Full workflow engine specification referenced by CLAUDE.md"
    - path: "CLAUDE.md"
      provides: "Loader directive under '# Workflow Engine Spec — Always Load'"
      contains: "Workflow Engine Spec"
  key_links:
    - from: "CLAUDE.md (# Workflow Engine Spec — Always Load)"
      to: "docs/specs/workflow-engine.md"
      via: "filepath reference in the loader directive"
      pattern: "docs/specs/workflow-engine.md"
---

<objective>
Reconcile the workflow-engine spec install with the current repo state. Most work is already done on this branch (feat/workflow-engine-spec exists; CLAUDE.md already has the loader block; docs/specs/ exists with the spec file and PDF companion). The ONLY remaining issue: the spec file is currently named `docs/specs/workflow-engine.md.md` (double extension), but the CLAUDE.md loader directive references `docs/specs/workflow-engine.md`. That mismatch means the loader points to a non-existent path. This plan fixes that filename so the loader resolves correctly.

Purpose: Ensure the `Always Load` directive in CLAUDE.md resolves to a real file, so that any Claude session touching Checklists & Workflows / Playbooks / DVIR actually loads the spec.

Output: Correctly-named spec file at `docs/specs/workflow-engine.md`, committed on the `feat/workflow-engine-spec` branch and pushed.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Current state already verified by planner:
# - Branch feat/workflow-engine-spec already exists and is currently checked out
# - Commit "docs: add workflow engine spec" (0ae791e) is already on this branch
# - CLAUDE.md already contains the "# Workflow Engine Spec — Always Load" block at line 305
# - docs/specs/ already exists and contains:
#     * workflow-engine.md.md  (double .md extension — MUST be renamed to workflow-engine.md)
#     * DriveCommand_Workflow_Engine_v2.pdf  (human-readable companion; the task description
#       mentioned a .docx but a PDF mirror is already present — acceptable; do not fetch or
#       create a .docx)
# - No other changes are needed — tasks below only fix the filename mismatch.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename workflow-engine.md.md to workflow-engine.md so the CLAUDE.md loader directive resolves</name>
  <files>docs/specs/workflow-engine.md</files>
  <action>
    Rename `docs/specs/workflow-engine.md.md` to `docs/specs/workflow-engine.md` using git so history is preserved.

    Run from repo root:
      git mv docs/specs/workflow-engine.md.md docs/specs/workflow-engine.md

    Rationale: The CLAUDE.md loader directive (line 305+ in root CLAUDE.md) says:
      "Read docs/specs/workflow-engine.md in full before writing code."
    The current file is at `docs/specs/workflow-engine.md.md` (double extension) so that path does not resolve. Renaming to the canonical name fixes the loader without touching any other files.

    DO NOT:
    - Modify CLAUDE.md (the loader block is already correct and matches the spec in the task description)
    - Touch the PDF companion (`DriveCommand_Workflow_Engine_v2.pdf`) — leave it in place
    - Edit the contents of the spec file — pure rename only
    - Create a new branch — we are already on `feat/workflow-engine-spec`
    - Run any code generation, dependency install, or typecheck — not required for docs-only change
  </action>
  <verify>
    Run from repo root:
      test -f docs/specs/workflow-engine.md && echo OK
      test ! -f docs/specs/workflow-engine.md.md && echo OK
      git status --short
    Expect: both OK prints, and `git status` shows a rename `docs/specs/workflow-engine.md.md -> docs/specs/workflow-engine.md` staged.
  </verify>
  <done>
    File `docs/specs/workflow-engine.md` exists at the repo root; `docs/specs/workflow-engine.md.md` no longer exists; rename is staged in git.
  </done>
</task>

<task type="auto">
  <name>Task 2: Commit the rename on feat/workflow-engine-spec and push</name>
  <files>(git commit — no file content changes)</files>
  <action>
    Confirm current branch is `feat/workflow-engine-spec`:
      git rev-parse --abbrev-ref HEAD

    If not on that branch, `git checkout feat/workflow-engine-spec` (do NOT create a new branch — it already exists).

    Commit the staged rename:
      git commit -m "docs: fix workflow-engine spec filename to match CLAUDE.md loader path"

    Then push:
      git push origin feat/workflow-engine-spec

    DO NOT:
    - Use `--amend` on the existing `0ae791e docs: add workflow engine spec` commit — create a new commit per GSD git safety rules
    - Push to master
    - Force push
  </action>
  <verify>
    Run:
      git log --oneline -3
      git status
    Expect: most recent commit is the rename commit; working tree clean; branch is `feat/workflow-engine-spec`.

    Also verify the CLAUDE.md link now resolves:
      grep -n "docs/specs/workflow-engine.md" CLAUDE.md
      test -f docs/specs/workflow-engine.md && echo "loader target exists"
  </verify>
  <done>
    Rename is committed on `feat/workflow-engine-spec` and pushed to origin; CLAUDE.md's loader directive now points at a real file.
  </done>
</task>

</tasks>

<verification>
1. `docs/specs/workflow-engine.md` exists (no double extension).
2. `CLAUDE.md` still contains the `# Workflow Engine Spec — Always Load` block (unchanged from current state).
3. `git log --oneline` on `feat/workflow-engine-spec` shows both the original spec install commit (`0ae791e`) and the new rename commit.
4. `git status` is clean; branch is pushed to origin.
</verification>

<success_criteria>
- Loader directive in CLAUDE.md resolves: opening `docs/specs/workflow-engine.md` (the exact path named in the directive) succeeds.
- No other files in the repo were modified (only the rename).
- Branch `feat/workflow-engine-spec` is in sync with origin.
</success_criteria>

<output>
After completion, create `.planning/quick/284-install-the-workflow-engine-specificatio/284-SUMMARY.md` noting:
- What was already in place before this task (branch, CLAUDE.md block, docs/specs/ contents)
- The single remaining gap that was fixed (filename mismatch)
- That the `.docx` companion was never supplied by the user and a PDF mirror (`DriveCommand_Workflow_Engine_v2.pdf`) is present instead — flag this for the user in case they still want to add the `.docx`
</output>
