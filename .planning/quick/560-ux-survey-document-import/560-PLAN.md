# quick-560 — UX survey of the Document Import module's screens

**Date:** 2026-08-27 · **Type:** SURVEY ONLY, read-only · **Branch:** feature/document-import
**Pre-task commit:** `1380d80c`

## Goal
Answer six questions about ten screens and report. **No code, no CSS, no
screenshots committed.** The central question is whether the empty-middle
symptom on four screens is one shared convention or four separate faults —
established *before* anything is redesigned.

## Tasks
1. **Establish the conventions first.** Shells, page wrappers, max-widths,
   documented spacing scale. Whether a convention exists decides whether the
   remaining answers are "comply" or "invent".
2. **Read all nine screens in source**, quoting the layout wrapper of each of
   the four empty-middle ones so Q2 is answered by string comparison rather
   than by impression.
3. **Survey the app's other pickers** for Q3, and check whether a searchable
   picker component already exists and has consumers.
4. **Report**, with the audience split, a cheap/structural separation, and an
   explicit list of what should NOT be fixed.

## Method notes
- Q2 is a grep question, not a judgement: if the four wrappers are the same
  string, that is the answer, and the count of call sites decides whether the
  fix is one edit or many.
- Q6 needs evidence, not contrarianism. Prefer production data and in-code
  comments over opinion — a complaint whose premise is factually wrong is a
  stronger "not worth fixing" than one I merely disagree with.
- Do not open a browser for the driver screens without driver credentials;
  report source claims as source claims rather than dressing them as observed.

## Out of scope
Any fix. Any design-system or component-library proposal. The `ui-ux-pro-max`
generator, whose output is a design-system proposal, is excluded by the task's
own constraint — flag that rather than skipping it silently.
