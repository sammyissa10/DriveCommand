# Quick Task 574 — Email Transport Layer

**Date:** 2026-09-01
**Follows:** quick-571 (diagnostic), quick-572 (shell), quick-573 (transforms). This sits below all
three, at the transport boundary.

## Why

Three defects from `docs/diagnostics/email-rendering-inventory.md`, each affecting every email on
both send paths:

1. `NotificationEmailConfig` has a SysAdmin editor and no reader — editing it changed nothing.
2. No send carries a `text/plain` alternative.
3. No send sets `List-Unsubscribe`.

Plus dead indirection: `gmail-client.ts` is a pure re-export and `GMAIL_FROM_NAME` is read nowhere.

## Tasks

1. **`sender-config.ts`** — DB row first, env fallback, name and address composed separately, 60s
   cache, never throws. Must tolerate the currently-deployed pre-composed `RESEND_FROM_EMAIL`.
2. **`html-to-text.ts`** — plain-text part from the FINAL shell HTML. No new dependency; regex only,
   for the reason quick-573 established about the production dependency tree.
3. **Wire both call sites** (`resend-client.ts`, `dispatcher.ts`) for `text`, `from`, `replyTo` and
   unsubscribe headers. Resolve config and text ONCE per fan-out, not per recipient.
4. **Delete `gmail-client.ts`**, repoint importers, remove `GMAIL_FROM_NAME`, fix the five template
   header comments.
5. **Repo-wide control-character guard.** `apps/web` has no working lint entry point (quick-562), so
   put it where the gate actually runs.

## Verification

- Text-part tests run against the real shell render, not a hand-written fixture — a fixture cannot
  contain the preheader padding, the `<style>` block or the button's nested table.
- Guard needs a file-count floor and a positive self-test (quick-546), and must not fail on itself.
- `tsc --noEmit` probed; full suite against the quick-573 baseline 1758 / 1628 / 66 / 61.

## Open question to answer, not assume

Whether a per-recipient unsubscribe URL is constructible from existing data. Report the answer
either way rather than quietly emitting an app-level URL.
