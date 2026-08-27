# quick-556 — Nothing surfaces notification delivery failures

## Step 1 — what already exists (the premise was wrong)

quick-555 claimed nothing queries `NotificationSendLog WHERE status='FAILED'`.
**Not true.** Two complete surfaces exist, both linked, both reachable:

| Surface | Where | Linked from | Filters FAILED | Shows reason |
|---|---|---|---|---|
| SysAdmin send log | `/notifications` → Send Log | `(admin)/layout.tsx:82` + middleware | yes, + tenant/trigger/recipient/date | yes — click row → `errorMessage` |
| Owner send log | `/settings/notifications` → Send Log | `settings.config.ts:99` (nav + meta) | yes | yes — click row → `errorMessage` |
| SysAdmin health tile | above the send log | same page | n/a, counts only | no |

14 crons registered in `apps/web/vercel.json` (root `vercel.json` is vestigial and
lists one), including `digest-weekly-owner` Fridays 22:00 UTC.

**Correct diagnosis: both surfaces are PULL-only, and the one push-ish signal has
a 24-hour memory.** `health-tile.tsx` reads `failedToday` (`createdAt >=
todayStart`), so a failure vanishes at local midnight, and its banner additionally
requires `failureRate > 5%`.

## Step 2 — the shape, from production

8 FAILED of 357 rows; log starts 2026-05-14; 4 tenants; 0 PENDING.
1 in the last 24h / 7d / 30d — the other 7 are older than 30 days.

| trigger | channel | n | first → last | distinct recipients |
|---|---|---|---|---|
| manager.invited | EMAIL | 2 | 2026-05-17 | **0 — none recorded** |
| driver.invited | IN_APP | 2 | 05-26 → 07-18 | 2 (2 tenants) |
| driver.invited | EMAIL | 3 | 06-16 → 06-21 | 3 |
| inspection.failed | IN_APP | 1 | 2026-08-27 | 1 |

**No recipient failed twice** — six distinct people each missed one thing, plus
two tenant-wide aborts with no recipient. Three causes: `No cached HTML` ×2,
Resend config ×3 (since fixed), in-app writer ×3.

Still live: the `inspection.failed` P2002 class (structural, needs DDL) and the
`driver.invited` invalid-uuid defect.

## Step 3 — approved recommendation

Fix the tile. Build no page.

1. 30-day AND all-time counts (`failed30d` was already computed and discarded).
2. **Drop the >5% gate entirely.** 8/357 = 2.24% — the gate suppressed every
   failure this system has ever had.
3. Banner links to `?tab=send-log&status=FAILED`.
4. **Owner side with EQUAL WEIGHT** (ruling 2): six of eight failures were
   tenant-scoped driver invitations. A carrier's problem to see.

Email digest REJECTED (ruling 3): 5 of 8 failures were EMAIL, 3 of those
transport-level. An email digest reporting that email is broken would have failed
on exactly the days it mattered.

## Tasks

1. `getNotificationSendLogStats` += `failed30d`, `failedAllTime`,
   `topFailingTriggerAllTime`. Tile: four counts, no rate gate, banner → link.
   Thread `?status=` so the FIRST page fetched is already filtered.
2. `getTenantSendLogStats` += `failedAllTime` (no date bound). Banner ABOVE the
   tabs; click switches tab + filter. Server fetches the FAILED page when
   failures exist so rows and dropdown agree.
3. Tests over the tile's decision (pure function — no RTL in this repo and none
   to be added), plus a source guard on the `showBanner` assignment.

## Constraints
Reads only. No DDL. No change to how notifications are sent, resolved or logged.
Retry reported, not built.
