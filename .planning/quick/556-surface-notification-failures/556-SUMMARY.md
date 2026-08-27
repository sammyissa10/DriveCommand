# quick-556 — Nothing surfaces notification delivery failures

**Commits:** `f0645864`, `c6932ec9` (pre-task HEAD `40dd6f25`)

---

## 1. What already existed — the premise was wrong

quick-555 claimed nothing queries `NotificationSendLog WHERE status='FAILED'`.
**Two complete surfaces do, and both were reachable the whole time.**

| Surface | Where | Linked from | Filters FAILED | Shows the reason |
|---|---|---|---|---|
| **SysAdmin send log** | `/notifications` → Send Log | `(admin)/layout.tsx:82` + middleware allowlist | ✅ + tenant / trigger / recipient / date | ✅ click row → `errorMessage` |
| **Owner send log** | `/settings/notifications` → Send Log | `settings.config.ts:99` (nav **and** page meta) | ✅ | ✅ click row → `errorMessage` |
| **SysAdmin health tile** | above the send log | same page | counts only | ✗ |

Also present: **14 crons, all registered** in `apps/web/vercel.json` (the root
`vercel.json` is vestigial and lists one), including `digest-weekly-owner` on
Fridays at 22:00 UTC with `buildWeeklyOwnerPayload` already section-structured.

**The correct diagnosis is narrower and less obvious than "nothing reads it":
both surfaces are PULL-only, and the one push-ish signal had a 24-hour memory.**
`health-tile.tsx` read `failedToday` — `createdAt >= todayStart` — so a failure
disappeared at local midnight, and its banner additionally required
`failureRate > 5%`. Nobody looked because nothing told them to.

## 2. The shape, from production

**8 FAILED of 357 total rows.** Log starts 2026-05-14 (~3.5 months). 4 tenants.
0 PENDING. **1 in the last 24h / 7d / 30d** — the other seven are older than 30
days, so on any ordinary day every counter the tile showed read zero.

| trigger | channel | n | first → last | distinct recipients |
|---|---|---|---|---|
| `manager.invited` | EMAIL | 2 | 2026-05-17 | **0 — none recorded** |
| `driver.invited` | IN_APP | 2 | 05-26 → 07-18 | 2 (2 tenants) |
| `driver.invited` | EMAIL | 3 | 06-16 → 06-21 | 3 |
| `inspection.failed` | IN_APP | 1 | 2026-08-27 | 1 |

**No recipient failed twice.** Six distinct people each missed one thing, plus
two tenant-wide aborts that recorded no recipient at all. Per tenant: 4 / 2 / 1 / 1.

Three causes: `No cached HTML available` ×2 · Resend transport ×3 (unverified
domain ×2, invalid API key ×1 — both since fixed) · in-app writer ×3 (invalid
uuid ×2, P2002 ×1).

**Still failing:** the `inspection.failed` P2002 class is structural and needs DDL
(quick-555), and the `driver.invited` invalid-uuid defect is unfixed.

## 3. Recommendation, as approved

Fix the tile; build no page. A new sysadmin page would duplicate a better one; the
"row on an ops dashboard" *is* the tile, with the wrong window and threshold; a
log-level alert already exists since quick-555 added `logger.error` to the silent
paths (engineers, not operators).

**The email digest was rejected for a specific reason worth recording: 5 of the 8
failures were EMAIL, and 3 of those were transport-level — invalid API key,
unverified domain. An email digest reporting that email is broken would itself
have failed on exactly the days it mattered.** The cron exists if it is ever
wanted; it is the wrong first move.

## 4. What was built

**SysAdmin tile** (`f0645864`)
- `getNotificationSendLogStats` now returns `failed30d` — **which it was already
  computing and discarding** — plus a new all-time count and an all-time top
  trigger. Four figures: sent 24h · failed 24h · failed 30d · failed all-time.
- **The `> 5%` gate is gone.** Any failure raises the banner.
- The banner is a link to `?tab=send-log&status=FAILED`, threaded through
  `page.tsx` → `notifications-tabs` → `SendLogTab` so the **first page fetched is
  already filtered**. Rendering unfiltered rows and correcting them on mount would
  show the wrong answer first.
- The rate is kept as a displayed figure — useful at volume, never again a gate.

**Owner surface, equal weight** (`c6932ec9`)
- `getTenantSendLogStats` += `failedAllTime`, deliberately **not** date-bounded:
  an undelivered invitation does not stop mattering on day 31, and the oldest of
  these is three months old.
- The count moves **above the tabs**, out of the Send Log tab where it had been
  one KPI card among five. A count only visible to somebody already looking for
  it is not a count.
- Clicking switches tab **and** filter rather than navigating — these tabs are
  local state, so a link would reload and land on the default tab. The page
  fetches the FAILED page server-side when failures exist so rows and dropdown
  agree from the first paint.

## 5. Actionable, not just visible — verified in a real browser

Against production, as `demo@drivecommand.com`:

```
Banner:  "4 notifications failed to send. Someone may not have received
          something you sent. Open the send log to see who, when, and why."
Click →  activeTab: "Send Log"   statusPicker: "FAILED"   rowCount: 4
```

4 is exactly this tenant's share of the 8 — confirmed against
`GROUP BY "tenantId"` (4 / 2 / 1 / 1). The rows carry **what · to whom · when**:

```
8/26/2026, 9:23:01 PM  inspection.failed  —                            IN_APP FAILED  Trip blocked — 002 failed Check brakes…
6/21/2026, 3:22:57 AM  driver.invited     orgadmin@onesquad.com        EMAIL  FAILED  You've been invited to join DriveCommand Demo
6/16/2026, 9:12:58 PM  driver.invited     sammy.issa21+jordan@…        EMAIL  FAILED  You've been invited to join DriveCommand Demo
6/16/2026, 4:37:41 PM  driver.invited     sammy.issa21+testing@…       EMAIL  FAILED  You've been invited to join DriveCommand Demo
```

…and expanding one gives **why**:

```
Unique constraint failed on the fields: (`org_id`, `entity_id`, `type`)
```

**The sysadmin page itself was NOT rendered in a browser** — no sysadmin
credentials are configured in this environment (`TEST_SYSADMIN_EMAIL` is unset and
that auth setup fails), so only `owner.json` exists. Its logic is pinned by tests
instead, and that limitation is stated rather than glossed.

## 6. The test, and how it fails

Nine tests over `buildHealthSummary`, extracted from the tile so the decision can
be asserted. There is no `@testing-library/react` in this repo and I did not add
one; the interesting cases are pinned as a pure function rather than by rendering
— the same reasoning as quick-554's menu filter, and better evidence than a
browser check that only exercises whatever is in the database today.

The case that matters is **an ordinary day**: eight sends have failed, seven older
than 30 days, today's counters clean. The old logic showed nothing —
`failedToday` was 0, so the rate was 0% and `rate > 5` never fired.

**Proven red by a verified mutation** that reinstates the 5% gate: four tests
fail, including the source guard, which reports
`expected 'showBanner: failedAllTime > 0 && (tot…' to be 'showBanner: failedAllTime > 0,'`.

**Two corrections made while writing it, both of which would have shipped a guard
that could not fail:**

1. The first source guard hunted for `rate > 5` **by name** and **missed** the
   mutation, because the offending expression inlined the arithmetic and never
   mentioned `rate`. Enumerating the shapes a threshold might take is unbounded;
   pinning the one assignment is not.
2. The first "real production numbers" fixture used 3 sent / 1 failed — a **25%**
   rate, which *passes* the old gate. It asserted nothing about suppression.
3. A third, smaller one: the narrowed guard initially matched `showBanner: boolean;`
   in the type declaration rather than the assignment, and went red on correct
   source.

**Note on commit layout:** the test file landed in `f0645864` rather than its own
commit — my `git add` glob covered the `__tests__/` directory. Recorded rather
than rewritten.

## Gates

- **tsc apps/web: 0 errors — PROBED** (`TS2322` in `health-tile.tsx`, removed).
- **tsc apps/mobile: 0 errors — PROBED** (`TS2322` in `lib/api-with-queue.ts`;
  removed, `git status apps/mobile` clean).
- **vitest diffed against `40dd6f25`:** baseline `18 failed | 124 passed (150
  files)`, `66 failed | 1535 passed (1665)`. Final `66 failed | 1544 passed
  (1674)`. **+9 tests, all passing; identical 66 failures. Zero regressions.**

## Files

```
apps/web/src/app/(admin)/actions/notifications.ts                          |  52 +++-
apps/web/src/app/(admin)/notifications/health-tile.tsx                     | 150 ++++++--
apps/web/src/app/(admin)/notifications/page.tsx                            |  21 +-
apps/web/src/app/(admin)/notifications/notifications-tabs.tsx              |   4 +
apps/web/src/app/(admin)/notifications/send-log-tab.tsx                    |  11 +-
apps/web/src/app/(admin)/notifications/__tests__/health-tile-summary.test.ts | NEW
apps/web/src/app/(owner)/actions/tenant-notification-settings.ts           |  23 +-
apps/web/src/app/(owner)/settings/notifications/page.tsx                   |  22 +-
apps/web/src/app/(owner)/settings/notifications/tenant-notifications-tabs.tsx | 49 ++-
apps/web/src/app/(owner)/settings/notifications/tenant-send-log-tab.tsx    |  10 +-
```

No DDL. No change to how notifications are sent, resolved or logged. This reads.

## Retry — reported, not built (step 6)

**Automatic retry is wrong for all eight.**

- **`No cached HTML` ×2 — not retryable at all.** No recipient was recorded, so
  there is nobody to re-send to. See deferred item 1.
- **Resend transport ×3 — manual only, per-row, operator-decided.** Recipient
  known and the cause fixed, but these are 2-month-old driver invitations; the
  people may since have been re-invited, deactivated or joined, and invitation
  tokens have their own lifetime. `scripts/resend-pending-invitations.ts` already
  exists and works off `PENDING` invitation state, which is a sounder basis than
  a stale log row.
- **In-app ×3 — neither.** In-app rows are ephemeral status messages;
  re-creating a 3-month-old "you were invited" is noise, and the P2002 one is
  structurally blocked until the DDL lands.

## Deferred / reported

1. **The `!cachedHtml` abort destroys the information needed to recover from it.**
   It records one audit row against EMAIL with **no recipient** and then returns,
   abandoning every channel and every recipient. Two production rows
   (`manager.invited`, 2026-05-17) already carry this, and because of it we cannot
   say who never got their invitation. **A failure that erases its own audit trail
   is worse than the failure itself.** Fixing it means writing per-recipient
   audit rows before the abort, or recording the resolved recipient list on the
   single row — neither is a read, so both are out of scope here.
2. **quick-555's claim is corrected in place** in `555-SUMMARY.md` §5 and in its
   STATE.md row: two surfaces do read the column; the defect was pull-only
   surfaces plus a 24-hour window and a rate gate.
3. **The sysadmin surface is unverifiable in this environment** — no sysadmin
   credentials, so `.playwright/auth/` holds only `owner.json`. Setting
   `TEST_SYSADMIN_EMAIL` / `TEST_SYSADMIN_PASSWORD` would let the whole admin
   portal be browser-tested; today none of it can be.
4. **Still-live failure sources** carried over from quick-555: the
   `inspection.failed` P2002 class (needs DDL) and `driver.invited` IN_APP passing
   an email where a UUID is expected. The tile will now show both accumulating.
5. **An email digest remains available** via the registered `digest-weekly-owner`
   cron if pull surfaces prove insufficient — but see §3 for why it must not be
   the only channel.
