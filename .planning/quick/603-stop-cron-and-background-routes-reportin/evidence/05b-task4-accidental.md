# 05b — Task 4: ACCIDENTAL catches

## The finding

**Zero. There are no ACCIDENTAL catches on the scheduled surface.**

Task 4 is therefore a one-line finding, exactly as the plan permits. **No narrowing work was
invented to fill it.** What follows is the examination that establishes the zero, because an empty
finding asserted without one is indistinguishable from an examination that was never done.

## What ACCIDENTAL means here

Per Task 1's verdict table: *the catch is wider than what it was meant to handle.* The plan names
three typical shapes.

## Shape 1 — a bare `catch {}` around a call with one expected failure mode

```
$ cd apps/web && grep -rnE "catch\s*\{" src/app/api/cron src/app/api/warmup | wc -l
0
```

**None exist.** Every catch on the surface binds an error variable.

## Shape 2 — a `.catch(() => null)` that also absorbs programming errors

```
$ grep -rnE "\.catch\(\(\s*\)\s*=>" src/app/api/cron src/app/api/warmup
(no output)
```

**None exist.** The three `.catch(…)` call sites on the surface — `digest-daily-driver:77`,
`digest-weekly-owner:77`, `digest-compliance-30day:79` — all take `(err: unknown)`, log it, and
return an explicit `{ sent: 0, skipped: 0, failed: 1 }`. That is a deliberate degradation with a
counter, not an absorption.

## Shape 3 — a `try` wrapped around more statements than the one that can legitimately fail

This one cannot be grepped for; all 37 catches were read and each `try` block's extent compared
against what can actually reach it.

| catch | lines wrapped | what can actually reach it | verdict |
|---|---|---|---|
| `workflow-notifications:109` | the sweep-1 query **and** its loop | only the query — **the loop body has its own inner catch at `:104`** | as narrow as it can be |
| `workflow-notifications:162` | the sweep-2 query **and** its loop | only the query — inner catch at `:154` | as narrow as it can be |
| `cleanup-quarantine:96` | the whole `ListObjectsV2` pagination **and** the per-object loop | only `s3Client.send(listCommand)` — inner catch at `:85` | as narrow as it can be |
| `digest-*:89`/`:91` | `prisma.$extends`, `user.findMany`, **and** the person loop | only the extend/findMany — inner catch per person | as narrow as it can be |
| `send-reminders:165` | a `Promise.all` **and** three item loops | only the `Promise.all` — all three loops have per-item catches | as narrow as it can be |
| `carrier-compliance-alerts:113` | `getComplianceAlerts`, the insert loop, **and** the email block | the first two; the email block has its own catch at `:99` | as narrow as it can be |
| `carrier-auto-dispatch:170` | `routeTemplate.findMany` **and** the template loop | only the findMany — inner catch at `:151` | as narrow as it can be |
| `automations:33` | four scheduler calls **and** `runEvaluator()` | all of them — but it returns an **honest 500** | not misreporting; narrowing would change failure semantics, not reporting |
| all 20 per-item catches | exactly one awaited call each | that call | narrow by construction |
| the 7 sweep/DDL catches that return 500 | one query or one DDL statement | that statement | narrow by construction |

**Several of these are wide in line count and narrow in what can arrive**, because the loop they
enclose carries its own inner catch. Counting lines rather than reachable throws would have produced
seven false ACCIDENTAL classifications and seven pointless refactors.

## Why the zero is the interesting result

The plan's design constraint 1 says *"Fix the reporting, not the catching, for DELIBERATE cases"*,
implying DELIBERATE cases are most of the population and ACCIDENTAL cases are the rest. The
measurement says constraint 1 describes **the entire population**. Every author of every one of
these twelve routes understood that a batch must survive a bad record, and wrote a catch that does
exactly that. **What nobody did was tell the operator afterwards.** That is a single, uniform defect
with a single, uniform fix, and it is why §5's contract could be one file rather than twelve
bespoke repairs.

## Background handlers

Checked separately in `01-enumeration.md` §Source C. The 43 real `after()` call sites are
post-response work with no status to lie about; none catches-and-reports-success. The two `after()`
wrappers (`commit-service.ts:264`, `emit.ts:87`) catch deliberately, document why, and log with the
real arity — `DELIBERATE_REPORTED`, cited as precedent, **left alone** per the plan.
