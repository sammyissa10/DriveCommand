# quick-538 — Complete the TKT-0076 sample-record backfill

TKT-0076 hides seeded demo records from operational pickers. The intent is deliberate,
ticketed, and stated on screen by `ConvertSampleRecord`. It was applied to the surfaces that
existed when it was written and never backfilled, so the split runs **per-surface, not
per-table**, and each surface is internally consistent.

## STEP 1 gate — audit before changing

Report every `excludeSamples` call site with its effective value and the blast radius of
flipping the default; confirm quick-537's surface list against live code. **Continue only if it
matches; if the flip reaches call sites outside scope, stop and report rather than widening.**

## Tasks

### T1 — Filter every operational picker that lacks it
Five web pages (Create Load, Load detail, Create Template, Edit Template, Trip detail) and the
mobile driver picker. Match `carrier/trips/new` exactly: `isSample: false, deletedAt: null`,
with a TKT-0076 comment at each new site.

### T2 — `excludeSamples` default flip
**Conditional on the step 1 audit.** Flip to default-on and update any call site that relied on
the old default.

### T3 — Shared endpoints
Where a picker and a list grid read the same endpoint, add an **opt-in, default-off**
`exclude_samples` param rather than filtering the shared `where` — the grid must keep showing
samples with their pill, because it is the only place a record can be converted from.

### T4 — `ConvertSampleRecord` on drivers and clients
Match the trucks implementation. Do not redesign it. Both PATCH endpoints need to accept
`isSample`.

### T5 — A visible reason for the absence
One line, in the picker, no modal, shown only when samples were actually excluded and the tenant
has some. **Copy approved before implementing.**

### T6 — Tests
Real rows, disposable tenant: a sample truck, driver and client each excluded from a
newly-filtered picker AND present in the corresponding list; a converted record appears in the
pickers immediately.

## Constraints carried from the brief
- No DDL. Do not add `is_sample` to `facilities`.
- Do not change what `is_sample` MEANS or add a way to mark records as samples.
- **Sample records must remain visible in list grids with their pill.** This hides them from
  pickers only.
- No writes to tenant `7e9eca25-1f97-46ed-9365-e67be49436d5`; disposable tenant only, `afterAll`
  cleanup verified by post-teardown row count.
- `git worktree remove`, never `Remove-Item`.
