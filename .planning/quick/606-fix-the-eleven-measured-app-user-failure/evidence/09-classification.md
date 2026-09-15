# quick-604 · 06 — classification and 456-attribution

Generated 2026-09-15T19:05:28.882Z. Membership is read from `scripts/audit/wrapper-countdown.json`
(generated 2026-09-15T17:27:19.871Z; {"unmigratedUnits":456,"unmigratedCallSites":459,"withTenantContextCallSites":0,"filesScanned":1691,"filesWithUnmigratedUnits":202}).

## The arithmetic check

| category | count |
|---|---|
| `TRIPWIRE_TC001` | 0 |
| `MISSING_GRANT` | 0 |
| `RLS_DENIAL_SATISFIABLE` | 0 |
| `RLS_DENIAL_NO_POLICY` | 0 |
| `SOMETHING_ELSE` | 0 |
| **SUM** | **0** |
| **failure count, derived independently from the verdict fields** | **0** |

`0 === 0` → **PASSES**.

The failure count is derived as
`entries.filter(v === 'fail').length + writes.filter(v === 'SILENT_NO_OP' || v === 'REFUSED').length`,
never read from this file's own header.

## Every failure, one row each

| surface | source | HTTP | SQLSTATE | category | why | offending site | attribution |
|---|---|---|---|---|---|---|---|


## Live policy queries (what makes categories 3 and 4 reproducible)

No finding reached categories 3 or 4, so no policy query was needed. The distinction is not asserted where it was not tested.



## OUTSIDE_456 — the finding

None.
