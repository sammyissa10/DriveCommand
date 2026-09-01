# Quick Task 571 — Email Rendering Path Inventory (diagnostic, read-only)

**Date:** 2026-09-01
**Type:** Diagnostic. No code changes. One report file is the entire deliverable.

## Why

Transactional emails (Resend) render with a generic shell that does not match the brand system.
Before any redesign, establish which code path actually produces the mail users receive, and how
many templates share a shell versus define their own markup — so the redesign is scoped from
evidence rather than from an assumption that one shell edit covers everything.

## Constraints

- Read-only across `apps/web/src`. Do not refactor, do not fix in passing, do not run migrations.
- Quote real source. Nothing paraphrased, nothing described from a filename.
- If a file cannot be located, say so explicitly rather than inferring it exists.
- Output: `docs/diagnostics/email-rendering-inventory.md`, seven findings, closing statement on
  whether one shell change propagates.

## Tasks

1. **Trace both send paths to `resend.emails.send`.**
   Enumerate every call site. Read `lib/email/resend-client.ts`, `lib/notifications/dispatcher.ts`,
   `lib/notifications/template-renderer.ts`, `lib/email/gmail-client.ts`. Determine whether a shared
   shell exists, its exact path, its full source, and its complete importer list.

2. **Inventory every template under `src/emails/`.**
   For each file: does it import a shell or open its own `<Html>`; which sender imports it (the
   trigger). Measure the six brand features — preheader, dark mode, unsubscribe, postal address,
   plain-text part, logo — as counts over all files, not impressions. Locate the `trip.reminder`
   sender, subject construction and body source.

3. **Establish from-address / from-name provenance** (env vs database), then write the report.

## Verification

- Feature counts derived from greps run over the whole directory, reported as `n of 30`.
- Every quoted block copied from an opened file.
- `git status` shows exactly one added file plus this task's planning artifacts.
