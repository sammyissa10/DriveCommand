# 01 — The enumeration, as a union of three sources

**Task:** quick-603 Task 1.
**Date:** 2026-09-15.
**Nothing was written anywhere.** Every command below is a read: a `node -e` parse, an `ls`, a
`grep`, a `git log`. No database was touched in this step, staging or production.

---

## Source A — `apps/web/vercel.json`

```
$ cd apps/web && node -e "
const v=require('./vercel.json');
console.log('CRON COUNT:', v.crons.length);
for (const c of v.crons) console.log(c.path, '|', c.schedule);
"
CRON COUNT: 14
/api/cron/send-reminders          | 0 14 * * *
/api/warmup                       | 0 8 * * *
/api/cron/auto-close-tickets      | 0 2 * * *
/api/cron/mark-overdue-invoices   | 0 3 * * *
/api/cron/carrier-auto-dispatch   | 0 0 * * *
/api/cron/carrier-compliance-alerts | 0 6 * * *
/api/cron/workflow-notifications  | 0 7 * * *
/api/cron/workflow-digest         | 0 8 * * *
/api/cron/automations             | 0 0 * * *
/api/cron/digest-daily-driver     | 0 22 * * *
/api/cron/digest-weekly-owner     | 0 22 * * 5
/api/cron/digest-compliance-30day | 0 14 * * 1
/api/cron/purge-deleted           | 0 3 * * *
/api/cron/trip-reminders          | 0 13 * * *
```

**Asserted: A = 14.** Matches the planning figure. Thirteen sit under `/api/cron/`; one,
`/api/warmup`, does not.

## Source B — the filesystem

```
$ cd apps/web && ls -d src/app/api/cron/*/ | wc -l
14
$ ls src/app/api/cron/*/route.ts | wc -l
14
```

Directories (alphabetical): `auto-close-tickets`, `automations`, `carrier-auto-dispatch`,
`carrier-compliance-alerts`, `cleanup-quarantine`, `digest-compliance-30day`,
`digest-daily-driver`, `digest-weekly-owner`, `mark-overdue-invoices`, `purge-deleted`,
`send-reminders`, `trip-reminders`, `workflow-digest`, `workflow-notifications`.

**Asserted: B = 14.** Matches the planning figure. Every directory carries a `route.ts` — there are
no empty cron directories.

## The union

```
A (14) ∪ B (14) = 15
A ∩ B = 13
A \ B = { /api/warmup }
B \ A = { cleanup-quarantine }
```

**Union = 15.** Neither single source is complete, and the two omissions are in opposite
directions. The quick-602 tripwire enumerated from the directory and so its table has fourteen rows
and no `/api/warmup`; a `vercel.json`-only enumeration would have fourteen rows and no
`cleanup-quarantine`.

---

## Asymmetry 1 — `/api/warmup` is scheduled and is not under `/api/cron/`

`apps/web/src/app/api/warmup/route.ts`, 20 lines. It carries the same
`verifyCronSecret` / `cronUnauthorizedResponse` guard every cron route carries, which is what makes
it a scheduled entry point rather than an ordinary API route that happens to be pinged. It is
scheduled `0 8 * * *`.

It was invisible to the quick-602 sweep purely because that sweep globbed `src/app/api/cron/*/`.

## Asymmetry 2 — `cleanup-quarantine` was NEVER scheduled

```
$ cd apps/web && git log -S"cleanup-quarantine" --oneline -- vercel.json | wc -l
0
```

**Empty means never added, not descheduled.** `git log -S` reports every commit in which the
occurrence count of the string changed; a route that had once been scheduled and later removed would
produce two commits, one adding and one removing. Zero commits means the string has never appeared in
that file.

Inbound callers, excluding `.next/` build artefacts:

```
$ grep -rn "cleanup-quarantine" --include="*.ts" --include="*.tsx" --include="*.json" \
    --include="*.md" --include="*.mjs" . | grep -v "^./.next/" | grep -v node_modules
./docs/security/input-hardening.md:43:7. Hourly cron `/api/cron/cleanup-quarantine` deletes stale quarantine objects (> 1 hour old)
./docs/security/input-hardening.md:85:- `apps/web/src/app/api/cron/cleanup-quarantine/route.ts` — hourly quarantine cleanup cron
./docs/security/input-hardening.md:86:- `vercel.json` — cron entry `0 * * * *` for cleanup-quarantine
./src/app/api/cron/cleanup-quarantine/route.ts:  (its own file, 6 self-references)
```

**No code anywhere calls it.** The only external references are three lines of documentation.

**A third finding, not in the plan:** `docs/security/input-hardening.md:86` states as fact that
`vercel.json` carries a `0 * * * *` entry for this route. It does not, and by `git log -S` it never
has. The route's own header comment (line 15) repeats the claim: *"Schedule: hourly (0 * * * * in
vercel.json)"*. So quick-349 shipped the route, wrote the schedule into two documents and a comment,
and never wrote it into `vercel.json`. Stale R2 quarantine objects have been accumulating since.

**Reported, not fixed.** Whether that route wants a schedule or a deletion is a product decision.
Adding a cron entry is not a defect repair, and this task does not make it. (Its *reporting* is fixed
in Task 3, because it is in the union and it misreports — that is a different question from whether
it runs.)

---

## Source C — background handlers (candidate populations)

These are candidate populations, reported with their exact commands. They are narrowed to the actual
defect class — *catches, then reports success* — in `02-classification.md`.

### `after()` call sites

```
$ cd apps/web && grep -rn "\bafter(" src --include="*.ts" --include="*.tsx" \
    | grep -v "^src/generated/" | wc -l
77
$ ... | grep -v "^src/generated/" | grep -v "\.after(" | wc -l
77          # there are zero `.after(` method calls; the exclusion is a no-op here
$ ... | grep -vE ":[0-9]+:\s*(\*|//)" | wc -l
43          # comment and JSDoc lines removed
$ grep -rln "\bafter(" src --include="*.ts" --include="*.tsx" | grep -v "^src/generated/" | wc -l
28
```

**77 raw matches across 28 files; 43 are real call sites and 34 are prose inside comments.** The
planning figure of 77 is the raw one. Both are published because they answer different questions.

By file (real call sites only):

| file | n |
|---|---|
| `src/lib/carrier/trips.ts` | 9 |
| `src/lib/carrier/loads.ts` | 5 |
| `src/lib/carrier/stop-completion.ts` | 3 |
| `src/lib/carrier/stops.ts` | 2 |
| `src/lib/carrier/inspection-service.ts` | 2 |
| `src/app/api/v1/messages/send/route.ts` | 2 |
| `src/app/api/v1/carrier/stops/[id]/messages/route.ts` | 2 |
| `src/app/api/v1/carrier/route-templates/[id]/generate/route.ts` | 2 |
| `src/app/api/mobile/owner/fleet/messages/route.ts` | 2 |
| `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts` | 2 |
| `src/app/api/driver/stops/[stopId]/messages/route.ts` | 2 |
| `src/app/api/cron/carrier-auto-dispatch/route.ts` | 2 |
| `src/app/(owner)/actions/fleet-messages.ts` | 2 |
| `src/lib/notifications/emit.ts` | 1 |
| `src/lib/document-import/commit-service.ts` | 1 |
| `src/lib/carrier/pay-calculator.ts` | 1 |
| `src/app/api/v1/messages/broadcast/route.ts` | 1 |
| `src/app/api/v1/carrier/fleet/trucks/route.ts` | 1 |
| `src/app/api/v1/carrier/fleet/drivers/route.ts` | 1 |
| **total** | **43** |

### `setTimeout` / `setInterval`

```
$ grep -rnE "\b(setTimeout|setInterval)\(" src --include="*.ts" | grep -v "^src/generated/" | wc -l
11
$ grep -rnE "\b(setTimeout|setInterval)\(" src --include="*.tsx" | grep -v "^src/generated/" | wc -l
65
# combined: 76
```

**The planning figure of 11 is the `.ts`-only count.** Including `.tsx` the population is 76. The
discrepancy is not an error in either direction: `.tsx` files in this repo are client components, and
a browser timer in a React component is not a scheduled server handler. **11 is the figure relevant
to this task**, and it is published alongside 76 so nobody re-derives 76 later and reads it as drift.

### Fire-and-forget `void <promise>`

```
$ grep -rnE "^\s*void [a-zA-Z_]" src --include="*.ts" --include="*.tsx" \
    | grep -v "^src/generated/" | wc -l
66
```

Matches the planning figure exactly.

### The two wrapper helpers

- `src/lib/document-import/commit-service.ts:264` — `afterResponse(label, importId, work)`
- `src/lib/notifications/emit.ts:87` — `emitNotificationAfterResponse(triggerKey, args)`

Both read verbatim at the source. Both use the real `logger.error(message, error, context)` arity
with `serializeError(err)` in the context, and `afterResponse`'s comment names this exact bug
("Passing the context there instead renders `Error: [object Object]`"). Both swallow deliberately and
say why ("neither the notification nor the template step may undo a committed trip"). Classified
`DELIBERATE_REPORTED`, cited as precedent, **left alone**.
