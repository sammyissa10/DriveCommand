# quick-604 · 01 — the ledger at OPEN

Taken 2026-09-15T10:07:48.734Z. Production is read **read-only**, with every statement drawn from
one frozen SELECT-only array in `scripts/audit/604-survey.ts`. No other
production statement path exists in that file.

## Production — `oqdhberkghtnszrkdvfm`

| reading | value | expected | verdict |
|---|---|---|---|
| `_prisma_migrations` rows | **156** | 156 | MATCH |
| `pg_policy` in `public` | **183** | 183 | MATCH |
| newest `migration_name` | `20260914170000_activation_progress_congrats_shown_at` | `20260914170000_activation_progress_congrats_shown_at` | MATCH |
| connection identity | {"currentUser":"postgres","database":"postgres","rolbypassrls":true} | — | recorded |

## Env-file hashes (compared again at close)

| file | sha256 |
|---|---|
| repo-root `.env` | `a10194b5b3e7f5c664b4b04e2b694d08d75206d5adb4babe3ae11df9c00ad7f0` |
| `apps/web/.env.local` | `7d298fddafeb78f686e4ddfaf096442d5dcc88dcf939db5863205ce195e0265c` |

## Staging — `UNKNOWN`, port 5432, over `STAGING_DATABASE_URL_APP_USER`

| reading | value | asserted? |
|---|---|---|
| `current_user` / `current_database` / `rolbypassrls` | {"currentUser":"app_user","database":"postgres","rolbypassrls":false} | **yes** — `app_user`, `rolbypassrls=false` |
| `_prisma_migrations` rows | ERROR 42501 | recorded (156 expected) |
| `pg_policy` in `public` | 183 | recorded (183 expected) |
| `public.tenant_context_required` present | true | **yes** |
| tripwire branch inside `current_tenant_id()` | YES — `tenant_context_required` is in the body | recorded |
| `bypass_rls_policy` count | 86 | recorded — **this task never drops one** |
| `Tenant` / `User` / `loads` / `carrier_drivers` | {"tenants":0,"users":0,"loads":0,"carrier_drivers":0} | recorded |
| `auth.users` (read on the privileged string) | 0 | recorded |

## Verdict

All assertions passed. The ledger is open.

## The refusal path, witnessed

The instrument refuses **before opening any connection**. Both directions were
run for real:

```
$ STAGING_DATABASE_URL_APP_USER="postgresql://postgres.oqdhberkghtnszrkdvfm:X@...:5432/postgres" \
    npx tsx scripts/audit/604-survey.ts --open
604-survey: REFUSING TO RUN — STAGING_DATABASE_URL_APP_USER names PRODUCTION
EXIT=1

$ STAGING_DATABASE_URL_APP_USER="postgresql://postgres.someotherproject:X@...:5432/postgres" \
    npx tsx scripts/audit/604-survey.ts --open
604-survey: REFUSING TO RUN — STAGING_DATABASE_URL_APP_USER does not name staging
```

The second case is the one a "not production" check would have got wrong.

## A contradiction with the plan, recorded rather than reconciled

The plan's Task 1 table expects *"staging `_prisma_migrations` row count | staging
| 156"*. **It cannot be read as `app_user` at all** — the reading is

```
{"ok":false,"error":{"code":"42501","message":"permission denied for table _prisma_migrations"}}
```

That is consistent with `policy-satisfiability-sweep.md` §5.1 (`_prisma_migrations`
has RLS enabled, zero policies, and **no `app_user` grant**) and it is the same
fact Task 7 rests on — migrations cannot be applied to staging as `app_user`.
The 156 figure quoted in the plan was measured on the **privileged** string.
Recorded as a reading that failed, not as a number.
