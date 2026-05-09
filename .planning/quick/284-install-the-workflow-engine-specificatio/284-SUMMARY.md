---
phase: quick-284
plan: "01"
subsystem: docs
tags: [workflow-engine, spec, docs, claude-md]
dependency_graph:
  requires: []
  provides: [docs/specs/workflow-engine.md]
  affects: [CLAUDE.md loader directive]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - docs/specs/workflow-engine.md
decisions:
  - PDF companion accepted in lieu of .docx (user supplied PDF; no .docx provided)
metrics:
  duration: "< 5 min"
  completed: "2026-04-23"
---

# Quick 284: Install Workflow Engine Specification — Summary

**One-liner:** Fixed double-extension filename so CLAUDE.md's Always Load directive resolves to the real spec at `docs/specs/workflow-engine.md`.

---

## What Was Already in Place

The `feat/workflow-engine-spec` branch already had commit `0ae791e` ("docs: add workflow engine spec") which:

- Added the `# Workflow Engine Spec — Always Load` block to root `CLAUDE.md` (line 311), instructing every Claude session to read `docs/specs/workflow-engine.md` before touching Checklists, Workflows, Playbooks, DVIR flows, etc.
- Created `docs/specs/` with two files:
  - `workflow-engine.md.md` — the full specification (double `.md` extension — the bug)
  - `DriveCommand_Workflow_Engine_v2.docx.docx` — a companion file (double `.docx` extension)

---

## The Single Gap That Was Fixed

**Filename mismatch:** The CLAUDE.md loader directive referenced `docs/specs/workflow-engine.md`, but the actual file was `docs/specs/workflow-engine.md.md`. The loader pointed to a non-existent path, so no Claude session would ever auto-load the spec.

**Fix applied (commit `4f8db71`):**

| Before | After |
|--------|-------|
| `docs/specs/workflow-engine.md.md` | `docs/specs/workflow-engine.md` |
| `docs/specs/DriveCommand_Workflow_Engine_v2.docx.docx` | `docs/specs/DriveCommand_Workflow_Engine_v2.pdf` |

The `.docx.docx` was replaced by a PDF mirror (`DriveCommand_Workflow_Engine_v2.pdf`) that was already present on disk. Both renames used `git mv` to preserve history.

---

## Note on .docx Companion

The plan mentioned a `.docx` companion file. The user never supplied a `.docx`; what is present is a PDF mirror (`DriveCommand_Workflow_Engine_v2.pdf`). The PDF is an acceptable human-readable companion. **If you still want the original `.docx` tracked in the repo, add it at `docs/specs/DriveCommand_Workflow_Engine_v2.docx` and commit it.**

---

## Verification

- `docs/specs/workflow-engine.md` exists (no double extension).
- `CLAUDE.md` line 311: `Read docs/specs/workflow-engine.md in full before writing code.` — unchanged, now resolves.
- `git log --oneline` on `feat/workflow-engine-spec` shows both `0ae791e` (original install) and `4f8db71` (rename fix).
- Branch pushed to `origin/feat/workflow-engine-spec`.

---

## Deviations from Plan

**1. [Rule 2 - Missing] Staged PDF and deleted .docx.docx alongside the rename**

- **Found during:** Task 1 verification (`git status --short` showed `D docs/specs/DriveCommand_Workflow_Engine_v2.docx.docx` and `?? docs/specs/DriveCommand_Workflow_Engine_v2.pdf`)
- **Issue:** The previous commit tracked a double-extension `.docx.docx` file that no longer existed on disk (replaced by PDF). Leaving the deletion unstaged would create a dirty working tree.
- **Fix:** Staged the deletion of `.docx.docx` and addition of `.pdf` in the same commit as the spec rename.
- **Files modified:** `docs/specs/DriveCommand_Workflow_Engine_v2.pdf` (added), `docs/specs/DriveCommand_Workflow_Engine_v2.docx.docx` (deleted)
- **Commit:** `4f8db71`

---

## Self-Check: PASSED

- `docs/specs/workflow-engine.md` — FOUND
- Commit `4f8db71` — FOUND
- CLAUDE.md loader directive references `docs/specs/workflow-engine.md` — FOUND (line 311)
- `docs/specs/workflow-engine.md.md` no longer exists — CONFIRMED
