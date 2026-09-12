# quick-592 — Create and seed drivecommand-staging as the Phase 0 verification target

**Date:** 2026-09-11
**Outcome:** Project created. **Seeding blocked by a defect in the migration
chain.** Steps 3–7 unmet as a consequence. The defect is the deliverable.

Audit: [`docs/audits/staging-environment.md`](../../../docs/audits/staging-environment.md)

---

## What was built

- **`drivecommand-staging`** — ref `wyixpgunnjmzguhggocz`, `us-west-1`,
  Postgres 17.6.1.166, org `smtxeyavhusrpylmpywu`. Cost confirmed with the user
  at $10/month before creation.
- **`.gitignore`** now covers `.env.staging`, as a one-line diff, verified with
  `git check-ignore -v` rather than by reading the file back.
- **`apps/web/scripts/seed-staging.ts`** — written, typechecked, production
  guard tested. Not run: the tables it targets do not exist.

## The finding

`node scripts/migrate.mjs` against staging stopped at **migration 38 of 141**:

```
Applying migration: 20260331000000_add_composite_indexes
  Failed: column "driverId" does not exist
```

`Document` is created by `20260214000004_add_document_model` **without** a
`driverId` column, **no migration anywhere adds it** (`grep -rn 'ADD
COLUMN[^;]*driverId' prisma/migrations` returns nothing), yet `schema.prisma`
declares it and production has it as a nullable `uuid`.

The column was added to production out of band and no migration file was ever
written, so the index migration succeeded there and fails on any database
rebuilt from the repo. **The repository cannot rebuild its own database from
scratch.** Same family as DEC-17 and as the `app_user` login grant below: live
database state that no migration records.

Scope is not established. This is the *first* failure; whether more sit behind
it cannot be known without fixing it and re-running, and the task's instruction
was to stop rather than work around. Nothing was edited, skipped, hand-inserted
into the ledger, or applied with a different applier.

**A preview branch could never have found this** — it never gets far enough to
run the migration.

## State left on staging

| | Value |
|---|---|
| Migrations applied | 37 of 141 |
| Last applied | `20260329000001_add_load_sequence` |
| Unfinished ledger rows | 0 — clean rollback |
| Tables in `public` | 38 (production: 98) |
| `app_user` | absent — its migration sits past the failure |

`migrate.mjs` wraps each migration in `BEGIN`/`COMMIT`, so the database is a
clean prefix and a re-run resumes at the failing migration. The applier threw
before its post-run step, so `seed-starter-playbooks.ts` never ran anywhere.

## Two hazards caught before they fired

- **`migrate.mjs` spawns a second writer that reads a *different* variable.**
  The applier uses `DIRECT_URL`; the `seed-starter-playbooks.ts` it spawns
  resolves `DATABASE_URL` through `src/lib/db/prisma.ts:45`. Repointing only
  `DIRECT_URL` would have written starter playbooks into **production**. Both
  were set inline, and both were shown masked in the run output as evidence
  neither named the production ref.
- **`seed-qa-accounts.ts` could not be reused**, for a worse reason than
  coverage: it calls `supabaseAdmin.auth.admin.createUser` against
  `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, which resolve to
  production. Repointing only the database would have put rows in staging and
  auth users in production. The replacement is database-only and refuses the
  production ref outright.

## Recorded for Prompt 2

- **`app_user` is created `NOLOGIN`; production's has `rolcanlogin = true`.**
  The login grant was applied out of band, so the role's production state is not
  reproducible from migrations alone.
- **Compute tiers differ and the difference is binding.** `max_connections` is
  60 on both, so the Postgres ceiling is identical; the Supavisor pool in front
  differs (staging Micro, pool 15; production Nano, pool 30) and is the smaller,
  binding number. The direction is counterintuitive — larger tier, smaller pool
  — so a saturation figure measured on staging must state which pool it used.
- **Staging is on `aws-0-us-west-1.pooler.supabase.com`, not production's
  `aws-1`.** Verified by connecting to both. Supavisor's `<role>.<ref>` tenant
  format works for a non-default project, which confirms the address shape but
  says nothing yet about a non-`postgres` role.

## Deviations

- **A third file.** The closing check expected only the audit file and a
  `.gitignore` change. Step 7 authorises a seed script when the existing helper
  does not serve, and it does not, so `scripts/seed-staging.ts` is legitimate.
  It holds no credentials.
- **`.env.staging` was not written.** Two of its three values cannot be built:
  `app_user` does not exist, so it has no password and no login. A file with one
  real key and two placeholders would be worse than none. The gitignore entry is
  in place ahead of it.
- **The service-role key was left blank** by choice, so seeded users would have
  no login. Sufficient for Prompt 3; insufficient for Prompt 2's click-through.

## Next

Decide whether Prompt 1 adds the missing column migration
(`ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "driverId" UUID` plus the FK,
sorting before `20260331000000`, a no-op against production), then re-run the
applier to discover whether further gaps sit behind this one.
