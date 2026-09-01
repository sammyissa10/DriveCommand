# Quick Task 572 — Summary

**Date:** 2026-09-01
**Scope held:** none of the 29 standalone templates, `dispatcher.ts`, `resend-client.ts`,
`schema.prisma` or any seed file was touched.

## Delivered

- `apps/web/src/emails/_system/` — `tokens.ts`, `Shell.tsx`, `Header.tsx`, `Footer.tsx`,
  `Button.tsx`, `DetailRows.tsx`, `StatusBar.tsx`, `Preheader.tsx`, `index.ts`,
  plus `email-attributes.d.ts`.
- `apps/web/public/email/logo-2x.png` (48x48 RGBA, 1,542 bytes) + `scripts/generate-email-logo.mjs`
  so the asset is reproducible rather than a checked-in mystery.
- `dynamic-template.tsx` rebuilt on the Shell; `template-renderer.ts` given an additive
  `options` parameter.
- `scripts/email-render-qa.ts` + four screenshots in `apps/web/.email-qa/`.

**Rendered size: 8,125 bytes (7.9 KB) — 92.2% under Gmail's 102KB clip limit.**

## The logo deviation — reported, not silently substituted

The brief asked for an `<Img>` of a 148x24 wordmark. **That asset does not exist and cannot be
derived**, established three ways before any component was written:

- `public/logo.png` (512x512 RGBA, transparent) is the **mark alone** — this IS the cleaned PNG the
  brief refers to, produced by `process-logo.mjs`, which strips white to alpha.
- `logo-horizontal.png` carries **no wordmark** despite the name: `process-logo.mjs` builds it as the
  160x160 mark with `.extend({ right: 352 })`, i.e. 352px of empty transparent padding.
- `app-logo.tsx` renders the wordmark as **live text** (Poppins, `D` at 800 + `riveCommand` at 600).
  No wordmark bitmap exists anywhere in the repo.

Rasterising letterforms would have been inventing a brand asset, which the brief forbids. So the
header pairs the **real mark** (rendered light-on-navy from
`brand/drivecommand-mark-mono-light.svg`, whose every path is already `#F5F5F7` — the colour mark at
`#050A44` would have been near-invisible on the `#002654` band) with the **wordmark as live HTML
text**. This is also the better email decision: roughly a third of recipients block images, and the
styled-`alt`-text workaround the brief proposed is honoured inconsistently by Outlook and not at all
by some webmail. Verified in the images-blocked run — the header still reads "DriveCommand" in white
on navy. Stated rather than glossed: Chromium draws a broken-image placeholder there even for
`alt=""`, so it is not a pristine header, only a brand-intact one.

## Two defects found by measuring rather than looking

1. **The body had no padding at all.** `<Section style={styles.bodyCell}>` puts the style on the
   `<table>` React Email generates, and the padding was dropped — the body sat flush at the card edge
   (measured left **51** = card 50 + 1px border) while the footer, which puts padding on its `td`,
   was correctly inset at **83**. Every other component in the system already used the `td` form;
   the body was the outlier. Fixed to a hand-rolled `table > tr > td`; body and footer now both
   measure **83**. This was invisible in the first screenshot until the offsets were measured — the
   repo's own `getBoundingClientRect` lesson, in a new place.

2. **The `<Section>` wrappers were redundant**, each rendering an outer table around a component's
   own table. Removing them cost nothing and saved **646 bytes** (8,771 → 8,125).

## Outlook Windows

Asked for up front and then built to: Word evaluates **no** `@media` query, so every dark-mode value
lives only inside `prefers-color-scheme: dark` and only overrides via `.dc-dark-*` classes — inert in
Outlook **by construction**, not by a check an edit could drop. Light values are inline styles, with
`bgcolor` attributes beside them on every coloured cell because Word drops `background-color` in
places. Dark rules carry **colour only**: the worst case if a client applied them unexpectedly is
wrong colours, never a collapsed table.

`bgcolor` needed `email-attributes.d.ts` — React renders the attribute but omits it from its DOM
typings as deprecated. Declared narrowly (three element types, one attribute) rather than cast at six
call sites where the casts would drift.

## Verification

- **tsc `--noEmit` clean in `apps/web`, and PROBED** — injected `const __probe: number = "not a
  number"` into `Shell.tsx` (a file this task edited); tsc reported exactly that error at
  `Shell.tsx(227,7)`, confirming the gate was live and not blind. Probe removed, grep-confirmed 0.
- **Image blocking proven real**, not assumed: the run counts intercepted requests and reports 2
  (one per blocked run). A blocked run that intercepts nothing would be a vacuous pass, so the
  script says so out loud. This is also why the QA page is served over HTTP — Playwright's routing
  does not intercept `file://` subresources, so a disk-loaded run would have loaded the logo anyway.
- **All four screenshots were opened and looked at**, not merely generated.
- **Test baseline taken via `git stash` against HEAD**: `dispatcher.test.ts` fails 3 tests **before**
  this work and the same 3 after. Not caused here — the failures are `hasEmail=false` (recipient
  channel preference); rendering itself succeeds in the trace (`render:done html_length=6717`).
  Notification suite otherwise 44 passed.

## Known gaps, stated rather than left to be discovered

- **`Button.tsx` and `DetailRows.tsx` are built and unreachable from the dispatcher path.** The body
  arrives as Tiptap HTML containing a bare `<a>`, so the CTA still renders as an underlined text
  link (visible in the screenshots). Turning that into the bulletproof button would mean parsing and
  rewriting the injected HTML, which is not this plan's scope. They are ready for callers that
  compose them.
- **The status bar keeps its light tint in dark mode.** Deliberate — an alert should stay loud — but
  it is a design call worth confirming rather than a thing that was missed.
- **`EMAIL_FOOTER_ADDRESS` is unset**, so no address line renders. That is the designed behaviour
  (omit rather than fake), and it means the footer is not yet CAN-SPAM complete.
