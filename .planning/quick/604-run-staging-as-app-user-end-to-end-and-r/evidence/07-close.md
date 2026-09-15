# quick-604 · 07 — the ledger at CLOSE

Taken 2026-09-15T11:18:11.718Z.

## Production — `oqdhberkghtnszrkdvfm`, open vs close

| reading | at open | at close | verdict |
|---|---|---|---|
| production _prisma_migrations rows | `156` | `156` | **identical** |
| production pg_policy(public) | `183` | `183` | **identical** |
| production newest migration_name | `20260914170000_activation_progress_congrats_shown_at` | `20260914170000_activation_progress_congrats_shown_at` | **identical** |
| sha256 repo-root .env | `a10194b5b3e7f5c664b4b04e2b694d08d75206d5adb4babe3ae11df9c00ad7f0` | `a10194b5b3e7f5c664b4b04e2b694d08d75206d5adb4babe3ae11df9c00ad7f0` | **identical** |
| sha256 apps/web/.env.local | `7d298fddafeb78f686e4ddfaf096442d5dcc88dcf939db5863205ce195e0265c` | `7d298fddafeb78f686e4ddfaf096442d5dcc88dcf939db5863205ce195e0265c` | **identical** |

## Staging at close — recorded, never asserted (this task deliberately changed staging)

| reading | value |
|---|---|
| `current_user` / `rolbypassrls` | {"currentUser":"app_user","database":"postgres","rolbypassrls":false} |
| `pg_policy` in `public` | 183 |
| `bypass_rls_policy` count | 86 |
| row counts | {"tenants":0,"users":0,"loads":0,"carrier_drivers":0} |
| `auth.users` | 9 |

## Verdict

Production was never written. Both env files are byte-identical to their state at open.
