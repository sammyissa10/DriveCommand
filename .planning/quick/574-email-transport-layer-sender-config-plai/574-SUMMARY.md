# Quick Task 574 — Summary

**Date:** 2026-09-01
**Not touched:** `src/emails/_system/**`, `body-html-transform.ts`, `template-renderer.ts`, any seed,
`prisma/schema.prisma`. No template *markup* changed — only the five header comments step 5 named.

## Delivered

- `src/lib/email/sender-config.ts` — DB-first sender identity, env fallback, 60s cache, never throws.
- `src/lib/email/html-to-text.ts` — plain-text alternative from the final shell HTML.
- `src/lib/email/unsubscribe.ts` — header builder (not in the original file list; the logic needed a
  home that both call sites could share rather than being duplicated twice).
- `resend-client.ts` and `dispatcher.ts` wired for `text`, DB-sourced `from`/`replyTo`, and headers.
- `gmail-client.ts` **deleted**; 22 files repointed. `GMAIL_FROM_NAME` removed from `.env.example`
  and from the `email-confirm` route's doc comment; `RESEND_FROM_NAME` documented.
- `src/__tests__/no-control-characters.test.ts` — repo-wide guard.
- `src/lib/email/__tests__/transport.test.ts` — 16 tests.

## Unsubscribe: per-recipient was NOT achievable — app-level, with two caveats

Asked and answered rather than assumed. **No per-recipient unsubscribe URL is constructible from
existing data.** There is no `/unsubscribe` route anywhere in the repo, and both
`NotificationSubscription` and `UserNotificationPreference` are keyed by an authenticated session,
not by a token. Building one is DDL plus a public route.

So the https URL is app-level, and two limitations come with it:

1. `/settings/my-notifications` **requires a login** before the recipient can act.
2. It sits under `OWNER_PATHS` in `middleware.ts`, so a **DRIVER who follows it is redirected to
   `/home`** and never reaches a preferences screen at all.

Because of that, the `mailto:` entry is listed **first** in `List-Unsubscribe` — it is the only
method that works for every recipient today, and clients prefer the earliest usable one.

### One deliberate deviation from the brief, with reasoning

**`List-Unsubscribe-Post` is emitted only when `EMAIL_ONE_CLICK_UNSUBSCRIBE_URL` is set, and that
var is unset today.** RFC 8058 one-click means the mailbox provider POSTs to the https URI with no
session. Ours is a login-gated page: it would answer with a redirect to `/sign-in`, and Gmail would
record the unsubscribe as **FAILED**. Advertising a capability the endpoint cannot honour is the
quick-548/549 defect class — a claim with no channel behind it — so it is gated rather than shipped
broken. Setting the env var switches both headers to the real endpoint with no code change. Say the
word if you want it forced on regardless.

## The trip.reminder plain-text part, verbatim

```
DriveCommand

Not started — departs in under 24 hours

Trip coming up

Mike Rodriguez,
Trip DC-2026-00412 has not been started. Truck T-104, first stop Hall Ford,
West Bend, departure Tue 26 Aug, 06:30.

Open trip (https://app.drivecommand.com/carrier/trips/trip_abc)

DriveCommand — You run the trucks. We run the rest.
Notification preferences
(https://app.drivecommand.com/settings/my-notifications) · Support
(mailto:team@drivecommand.io)
```

## The bug the text tests caught

The first version rendered the CTA as a **bare URL with no label**. Cause: conditional comments come
in two shapes and I treated them alike.

```
<!--[if mso]>      …VML…    <![endif]-->      a real comment      -> drop it
<!--[if !mso]><!-->  …markup…  <!--<![endif]-->
                     ^ downlevel-REVEALED: the content is LIVE MARKUP and only
                       the markers are comments
```

A single "strip conditional comments" regex deleted the entire real button. Now the revealed markers
are stripped first (keeping their content), then true blocks are removed — the VML twin holds a
duplicate of the label, which is why it still has to go. This is exactly why step 7 insisted the
tests run against the real shell render: a hand-written fixture has no VML and the bug is invisible.

## The control-character guard, and it caught itself twice

Written as a **Vitest test, not an ESLint rule** — `apps/web` has no working lint entry point
(quick-562: `next lint` rejects `--dir`, ESLint 9 finds no flat config). A rule in a linter nobody
can run does not run.

While writing it I reproduced quick-573's bug **twice**, which pinned the mechanism:

> **In a JavaScript STRING literal, backslash-b is the backspace character; only inside a REGEX is it
> a word boundary.** Any codemod that builds replacement source through a quoted string containing
> backslash-b silently emits 0x08.

That is precisely how the original byte got in. The guard's own self-test therefore builds both
operands with `String.fromCharCode`, since the file sits inside its own scan. It carries a file-count
floor (>500) and a positive self-test, per quick-546.

## An unexpected result: 3 pre-existing failures FIXED, with a mechanism

Suite failures went **66 → 63** and `dispatcher.test.ts` left the failing set. Not a target of this
work, so I checked rather than claimed it.

`dispatcher.test.ts` mocks `@/lib/email/resend-client` with a factory exposing `resend`,
`FROM_EMAIL` and `sendEmail` — **but not `REPLY_TO_EMAIL`**, which the dispatcher used to import.
Vitest throws when a factory mock omits an imported name; that throw landed inside the per-recipient
`try`, incremented `failed`, and `resend.emails.send` was never reached — which is exactly the
"expected send to be called once, got 0" those tests reported. The dispatcher now imports only
`resend` and takes reply-to from `sender.replyTo`, so the mock is complete and the sends proceed.
Verified as real, not vacuous: the traces show `sent=2` and the error-isolation case genuinely
raising "Resend rejected r1".

Incidentally that test also mocks `@/lib/db/prisma` as `{ prisma: {} }`, so `resolveSenderConfig`
hits an undefined `$transaction`, throws, and falls back to env — the designed behaviour, exercised
for free.

## Verification

- **Full suite: 1777 / 1650 / 63 / 61** against quick-573's baseline 1758 / 1628 / 66 / 61.
  +19 tests (3 guard + 16 transport), all passing; failures **down** 3 for the reason above; 17
  failing files, all pre-existing.
- **tsc clean and PROBED** — injected error reported at `sender-config.ts(175,7)`. Probe removed.
- Control-character guard passes across the whole tree.

## Known gaps

- The footer line wraps between "Notification preferences" and its URL. Cosmetic, visible above.
- `sendEmail` accepts a `preferencesUrl` override, but no caller passes one yet — there is nothing
  per-recipient to pass until an unsubscribe token exists.
- `GMAIL_USER` is left alone: unlike `GMAIL_FROM_NAME` it is still read as a support-inbox fallback
  in `send-support-notifications.ts` and as a reply-to fallback in sign-up. Out of scope.
