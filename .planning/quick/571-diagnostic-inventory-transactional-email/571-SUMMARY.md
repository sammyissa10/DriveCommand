# Quick Task 571 — Summary

**Date:** 2026-09-01
**Deliverable:** `docs/diagnostics/email-rendering-inventory.md`
**Code changed:** none. Diagnostic only, as briefed.

## Headline

**There are two independent send paths, and the brief's implicit premise — one generic shell — is
true of only one of them.**

- **Path A — 29 hand-written templates** under `src/emails/`. Each opens its own `<Html>` and
  carries its own ~90-line `const styles` object. **Not one imports a shell.** They agree on
  `#1e40af` and a 600px container by copy-paste, not by dependency.
- **Path B — the dispatcher.** `DynamicTemplateEmail` (`src/emails/dynamic-template.tsx`) wraps
  Tiptap HTML cached in the DB. **One importer in all of `src/`:** `template-renderer.ts:18`.

`resend.emails.send` is called from exactly two places: `resend-client.ts:56` and
`dispatcher.ts:340`. A third grep hit in `DriverDetailMobile.tsx` is a local variable in an
invite-resend handler, not the mail client — checked, not assumed.

## The seven findings

1. **Shell exists, serves Path B only.** Full source quoted. Its `brandName` and `footerAddress`
   props have no non-default caller — `renderTemplate` passes `{ bodyHtml }` alone, so the address
   line never renders and the brand is always the literal default.
2. **Phase 41 present.** `NotificationTemplate` at `schema.prisma:3798`, `dispatcher.ts` present,
   plus six supporting models. Tiptap is not invoked on the server; HTML is cached at save time.
3. **"Trip coming up" has no `.tsx` file.** Subject `'Reminder: trip {{tripNumber}} departs
   {{scheduledDeparture}}'` is a `defaultSubject` literal in
   `prisma/seeds/notification-template-data/trip.ts:100`; body is a `buildDefaultTemplate` Tiptap doc
   (heading + one sentence + CTA); fired by `GET` in `api/cron/trip-reminders/route.ts:125`.
4. **29 templates, all own-`<Html>`, table of trigger per file.** Header colour: `#1e40af` ×26,
   `#0f62fe` (the shell), `#111827`, `#dc2626`, two with no header style. `<Tailwind>` used in zero.
5. **No logo image anywhere.** `grep "<Img"` over `src/emails` → **0**. Brand is a `<Text>` string in
   three different wordings; the footer dash is inconsistent (hyphen ×15, em dash ×6).
6. **Preheader 2 of 30** — and the shell's is a constant, so every dispatcher email previews as
   "DriveCommand notification". Dark mode 0, unsubscribe 0, postal address 0 rendered,
   plain-text part 0 (`grep "text:"` over both send paths returns nothing; `SendEmailOptions` has no
   field to pass one).
7. **From-address is env, read at module load.** `FROM_EMAIL` / `REPLY_TO_EMAIL` in
   `resend-client.ts:33-35`; no separate from-name — the display name is baked into one
   `Name <addr>` string. No call site can override `from`.

## Two things found that were not in the brief

- **`NotificationEmailConfig` (`fromName`, `fromEmail`, `replyTo`) has a SysAdmin screen and no
  reader on the send path.** Editing it changes nothing a recipient sees. Reported, not fixed — the
  task is read-only and this is a behaviour change.
- **`GMAIL_FROM_NAME` is dead.** Five templates carry a header comment claiming a Gmail sender;
  `gmail-client.ts` is now a pure re-export of `resend-client.ts` and the variable is read nowhere
  in `src/`. Those comments are stale.

## Answer to the closing question

**One shell change would not propagate.** It reaches Path B — ~45 template rows including
`trip.reminder`, genuinely one edit — and **none** of the 29 files. A brand redesign is two pieces:
the shell edit, plus a per-file migration of 29 templates onto a shared shell that does not exist
for them yet. The six missing brand features are absent from **both** paths, so each needs building
once in the new shell and once at the transport layer.

## Verification

- Feature counts are greps over the whole directory reported as `n of 30`, not impressions.
- Every quoted block copied from an opened file; no file described from its name.
- `git status` shows one added report plus these planning artifacts. No source file touched.
