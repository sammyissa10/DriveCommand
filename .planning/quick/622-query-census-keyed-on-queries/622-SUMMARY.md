---
phase: quick-622
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, census, type-checker, static-analysis, tc001]
requires:
  - quick-616 census (flag-keyed, superseded here)
  - quick-618 56 findUnique hazards (ground truth)
  - quick-621 bare-client inventory (125 units, reconciled here)
provides:
  - apps/web/scripts/audit/622-query-census.ts: one row per database statement, client resolved by the type checker
  - apps/web/scripts/audit/622-ground-truth.ts: 20 ground-truth checks + R1–R4 reconciliation, witnessed red
  - docs/audits/query-census.md: supersedes the quick-616 census
affects:
  - every remaining cutover batch, which is now sized against 180 (169) statements, not 45
decisions:
  - "unit of account = one Prisma statement; the bypass flag is a column"
  - "RLS state from PRODUCTION (read-only), not staging"
  - "path-insensitive: a statement takes its worst arm; the 11 driver-pay rows are credited by hand in the doc, never by the tool"
  - "ABSENT flows (optional params/props no caller supplies, dead exports) are recorded per row, not silently dropped"
metrics:
  statements: 1825
  queries: 1770
  unresolved_clients: 0
  cutover_gating_scanned: 180
  cutover_gating_after_hand_credit: 169
  bypass_drop_gating: 56
  ground_truth_checks: "20/20 PASS; 5 FAIL under --break-resolver"
  completed: 2026-09-16
---

# quick-622 — the query census: 180 statements gate the cutover (169 after one hand credit), not 45

Full findings: **`docs/audits/query-census.md`**. Evidence: `evidence/`.

## Headline

| | |
|---|---|
| queries in `apps/web/src` | **1,770** (+55 `set_config` plumbing) in 363 files |
| clients unresolved | **0** (18 rows rest on a recorded `ABSENT` flow) |
| **SILENT_ZERO_AT_CUTOVER** | **180 / 53 files** as scanned; **169 / 46** crediting the 11 path-insensitive driver-pay rows |
| SILENT_ZERO_AT_BYPASS_DROP | 56 / 24 (67 / 31 with the 11) |
| BROKEN_UNDER_APP_USER / NO_POLICY_TABLE | 0 / 0 |

## Ground truth (per item)

- **(owner)/layout.tsx's 3: found.** SCOPED at HEAD. Against `37e0bb17^`: 3 × BARE × SILENT_ZERO_AT_CUTOVER × SWALLOWED.
- **quick-618's 56: 56/56 found**, receiver class agrees on 56/56. The 3 parameter-passed digest sites resolve to
  `TENANT_ORG`.
- **quick-615's Route `_count`: found**, reaching `Tenant, User, Truck, Route, DriverInvitation` on `ADMIN`.
- `--break-resolver`: 5 checks FAIL, exit 1.

## Reconciliation

- **45**: reproduced exactly by a replica of the flag walker. The 45 flags protect 69 queries. The flag method sees
  0 of the 169 cutover statements.
- **125 (quick-621)**: all 125 units map; they contain 127 gating statements. 9 units were quick-621 over-counts:
  2 shadowed `prisma` locals and 7 transactions that set the GUC through `setTransactionTenantId`.
  **53 gating statements were outside it**: 49 are the helper/parameter/destructured shape it named as its blind
  spot (`seedStarterPlaybooks` 23, notifications pipeline 15, driver-pay 11) and 4 are interpolated raw SQL in
  `reports.ts`. 127 + 53 = 180.
- **177**: → 45 by routing, file by file; no file's flag count increased.

## Scanner corrections found while building (each reproduced before being fixed)

1. `Promise.all` array destructuring.
2. Function values returned inside an object (`getPrisma`, `withBypassRls`).
3. Optional parameters and properties no caller supplies (now `ABSENT`, recorded per row).
4. Per-arm verdicts: a flag on a tenant-client transaction is decorative, not a hazard.
5. Array-form `$transaction` inheriting its sibling `set_config` (B8's shape).
6. A GUC set by a helper the tx is handed to.
7. Raw SQL fragments interpolated from `const`s.
8. Raw statements naming no table get their own verdict instead of "no RLS table"; 8 were classified by hand.

## Step 7

The in-process TC001 detector cannot see a bare statement on a connection that already carries a GUC, whether that
came from earlier in the same request or from the previous request. The previous-request case is a wrong-tenant
read under `app_user`, not a zero.

- **Keep the detector.** Add a request-boundary GUC reset in the staging harness; never reset per checkout.
- **No DB-layer instrument can see same-request inheritance**, because the SQL and the GUC are both correct at that
  point.
- **An application-layer client-identity tracer can see it** (a traced `$extends` on the bare export). Recommended,
  not built.

## Gates

- `tsc --noEmit` in `apps/web` (which includes `scripts/`): **clean, proven not blind.** A probe was reported
  (TS2322) and the same run surfaced a real TS7022 in the new scanner, now fixed. Evidence re-run afterwards: byte-identical.
- No vitest or build run: no application code changed (two new scripts under `scripts/audit/`, one doc).
- No production or staging write. Production read once (the `pg_class` query in `00-production-rls-tables.json`).

## Commits

See `git log --grep quick-622`.
