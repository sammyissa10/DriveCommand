# quick-580 — Push and verify the email convergence chain in production

**Date:** 2026-09-02
**Type:** deploy + production verification. **No feature code written.**

---

## 1. The push

45 unpushed commits, `056713fb..b237e5b0`, branch `master` tracking `origin/master`,
working tree clean before and after.

**The range was wider than the task named.** The brief said "quick-571 through
quick-579"; the actual unpushed set spanned **quick-569 → quick-579** and included
`5f4f94e6 fix(quick-570): submitIncidentReport records the incident and notifies` — a
behavioural fix, not documentation. Reported before pushing rather than after.

Deployed by **GitHub push**, not `vercel --prod`, per the reversed deployment policy
(see the memory note below).

## 2. The deployment

| | |
|---|---|
| id | `dpl_12V4a1czKxXiENth3xHo5VDXUpdG` |
| url | `drive-command-6h7zo8yvk-sammyissa10s-projects.vercel.app` |
| aliases | `drive-command-sammyissa10s-projects.vercel.app`, `…-git-master-…` → **drivecommand.app** |
| commit | `b237e5b0` |
| target | production |
| **state** | **READY** |
| build | 3m — TypeScript clean in 55s, Sentry source maps uploaded, zero errors |

`drivecommand.app/sign-in` returns 200 with `Age: 0`.

Worth recording for next time: the Vercel API's `state` field lagged several minutes
behind the build log. The log said `Build Completed in /vercel/output [3m]` and
`lambdaRuntimeStats` had already appeared on the deployment while `state` still read
`BUILDING`. **Read the build log, not just the state field.**

## 3. Sender config — a real gap, reported not fixed

`NotificationEmailConfig` holds **zero rows** in production, and none of
`RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` / `RESEND_REPLY_TO` is set. So
`resolveSenderConfig` returns:

```json
{ "fromName": "DriveCommand", "fromEmail": "team@drivecommand.app",
  "replyTo": "team@drivecommand.io",
  "from": "DriveCommand <team@drivecommand.app>", "source": "env" }
```

**`source` is `env`. The `source: 'database'` path is UNVERIFIED** — it cannot be
exercised while the table is empty. Nothing was written to `NotificationEmailConfig`
(row count confirmed still 0 afterwards).

The fallback address is nonetheless the correct one — `team@drivecommand.app` is the
only Resend-verified domain — so the layer degrades to the right answer. The field-by-
field fallback design is working exactly as written; it simply has nothing configured
above the floor.

## 4. The production send

One real send through a **disposable tenant**, per the quick-549 convention.

- tenant `7cf7b045-d1ee-4245-a1f8-197510a4641f` ("ZZ Email Verify …"), one OWNER user
  at `sammy.issa21@gmail.com`
- trigger **`truck.maintenance_due`** — chosen because its `defaultRecipients` is
  `[{role:OWNER},{role:MANAGER}]` (so subscription is not required) and because its
  standalone template is one of the two quick-577 deleted, making this a direct
  exercise of the dispatcher path that replaced it
- `dispatchNotification` returned `{"sent":2,"skipped":0,"failed":0}`

`NotificationSendLog` EMAIL row:

```
status            SENT
channel           EMAIL
recipientEmail    sammy.issa21@gmail.com
subject           Maintenance due for Unit 42
triggerKey        truck.maintenance_due
```

(An IN_APP row was also written, also SENT.)

### Received message headers — verbatim from the delivered MIME

```
List-Unsubscribe: <mailto:team@drivecommand.io?subject=Unsubscribe>,
 <https://drivecommand.app/settings/my-notifications>
From: DriveCommand <team@drivecommand.app>
To: sammy.issa21@gmail.com
Reply-To: team@drivecommand.io
Subject: Maintenance due for Unit 42
Message-ID: <010001a0633426f7-…-000000@email.amazonses.com>
Date: Wed, 2 Sep 2026 17:39:17 +0000
MIME-Version: 1.0
Content-Type: multipart/alternative;
 boundary="--_NmP-2cc86168b66bc2ad-Part_1"
```

**`multipart/alternative` confirmed.** Both parts present:
`Content-Type: text/plain; charset=utf-8` and `Content-Type: text/html; charset=utf-8`,
each `quoted-printable`.

**List-Unsubscribe carries both methods, mailto first** — exactly the ordering
`unsubscribe.ts` documents, and the https URL is the preferences screen quick-575 made
reachable by every role. `List-Unsubscribe-Post` is correctly ABSENT
(`EMAIL_ONE_CLICK_UNSUBSCRIBE_URL` is unset, and the header is gated on it precisely so
Gmail is never told one-click works when it does not).

Auth: `dkim=pass header.i=@drivecommand.app`, `spf=pass`, `dmarc=pass`.

### Plain-text part, verbatim

```
DriveCommand

Maintenance due

Truck Unit 42 is due for Oil Change on 2026-09-09. Schedule the service to
avoid compliance issues.

View Truck (https://app.drivecommand.com/owner/trucks/truck_verify)

DriveCommand — You run the trucks. We run the rest.
Support (mailto:team@drivecommand.io)
```

The `label (url)` button rendering and the em-dash decoding both survive. **No footer
postal address** — see §6.

### Rendered HTML

`[notif-trace] render:done html_length=8857`. The header renders navy
(`bgcolor="#002654"`, 56px band) with the logo at
**`https://drivecommand.app/email/logo-2x.png`** — production domain, not localhost —
above the `#0066CC` accent rule.

## 5. Byte size

| | bytes | vs Gmail's 102,400 clip threshold |
|---|---|---|
| rendered HTML | **8,857** | **8.6% — well under** |
| whole MIME as received (both parts + headers) | 17,233 | 16.8% — under |

## 6. `EMAIL_FOOTER_ADDRESS`

**NOT SET** in the production environment. Not set by this task — that value is the
user's to provide.

**Stated plainly: the footer is not yet CAN-SPAM complete.** `Footer.tsx` renders the
address line only when the var is present, so production email currently goes out with
no physical postal address. The delivered plain-text part above confirms it: the footer
is the tagline and Support link, nothing more.

## 7. Cleanup — confirmed

Script deletion counts: `{"sendLog":2,"inApp":1,"prefs":0,"subs":0,"user":1,"tenant":1}`.

Independently re-queried afterwards:

| check | result |
|---|---|
| tenants matching `zz-email-verify-%` | **0** |
| users with `sammy.issa21@gmail.com` | 1 — the pre-existing one, back to the starting count |
| orphaned `in_app_notifications` | **0** |
| `NotificationEmailConfig` rows | **0** — nothing written |
| `NotificationTemplate` rows | **47** — none created, modified or deleted |

Five `NotificationSendLog` rows for that address remain and are **not** from this task —
four are the daily `trip.reminder` cron in `DriveCommand Demo` (2026-08-30 … 09-02) and
one is a May `load.assigned` in `QA Test Org`. Incidentally that is independent evidence
the production email path was already alive before this deploy.

The throwaway script (`apps/web/__prod-email-verify.ts`) was deleted; `git status` clean.

## 8. Honest limits of this verification

- The send was executed from **local code at commit `b237e5b0`** against the production
  database and the production Resend key, with `APP_BASE_URL` set to the production
  value. It is the same commit that is deployed, but it did **not** execute inside the
  Vercel lambda. A true in-lambda send needs an HTTP-triggerable path, and this task was
  scoped to write no new code.
- `source: 'database'` is unverified and cannot be verified until a
  `NotificationEmailConfig` row exists.

## Not done / deferred

- `NotificationEmailConfig` row — user's call; deliberately not written.
- `EMAIL_FOOTER_ADDRESS` — user's value to provide. Footer not CAN-SPAM complete until then.
- In-lambda send verification — needs a triggerable endpoint.

## Memory correction made during this task

Two stored preferences contradicted the instruction and were rewritten:
`feedback_git_push` ("never push — commit only") and `feedback_deployment`
("`vercel --prod` only, never GitHub"). Both now record the 2026-09-02 reversal and the
reason: `vercel --prod` ships the working directory rather than git HEAD, so a dirty tree
deploys uncommitted files silently.
