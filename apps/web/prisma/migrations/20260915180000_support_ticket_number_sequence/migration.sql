-- quick-616 (B7) — a REAL sequence for TKT-NNNN, replacing a cross-tenant
-- read-the-maximum in two racing copies of `generateTicketNumber`.
--
-- ─── WHAT THIS REPLACES ────────────────────────────────────────────────────
--
--   src/actions/support-tickets.ts:99            (web)
--   src/app/api/mobile/support/ticket/route.ts:39 (mobile)
--
-- Both ran, byte-identically:
--
--   prisma.$transaction(async (tx) => {
--     await tx.$executeRaw`SELECT set_config('app.bypass_rls','on',TRUE)`
--     return tx.supportTicket.findFirst({ orderBy: { ticketNumber: 'desc' } })
--   })
--
-- ─── WHY A SEQUENCE AND NOT `getAdminDb` ───────────────────────────────────
--
-- `docs/audits/admin-connection.md` §9, verbatim:
--
--   "An admin connection is the wrong fix here (it would paper over a
--    data-model problem); the correct fix is `CREATE SEQUENCE
--    support_ticket_number` + `GRANT USAGE` to `app_user`, which removes the
--    cross-tenant read AND the live race between the two copies in one change."
--
-- The race is real and is NOT fixed by a client swap: read-max-then-insert with
-- no lock, from two code paths that can run concurrently on web and mobile.
-- `SupportTicket_ticketNumber_key` is a GLOBAL unique index, so the second
-- writer's insert throws.
--
-- And §9's predicted cutover symptom is a SILENT WRONG ANSWER, which is the
-- worse failure mode: under `app_user` with an empty GUC the read returns ZERO
-- ROWS, not an error, so `generateTicketNumber` falls through to its
-- `if (!result) return 'TKT-0001'` branch and issues TKT-0001 for every new
-- ticket, colliding on the second one. A `getAdminDb` route would have fixed
-- that and left the race untouched.
--
-- ─── THE START VALUE IS READ, NOT ASSUMED ──────────────────────────────────
--
-- Computed from the table, per database, inside the migration — so staging
-- (0 rows today) and production (87 rows at the last count in
-- `bypass-replacement-design.md` §1.3(c)) each get a correct start without a
-- hardcoded number that would be wrong on one of them. `setval(..., max+1,
-- false)` makes the FIRST `nextval` return exactly `max + 1`.
--
-- Guarded on the sequence's own absence so a re-application cannot RESET it.
-- `scripts/migrate.mjs` skips by `migration_name`, so this is belt and braces.
--
-- ─── ACCEPTED COST, STATED ─────────────────────────────────────────────────
--
-- A sequence is not transactional: a rolled-back insert consumes its number and
-- leaves a gap. Ticket numbers are IDENTIFIERS, not a count, and nothing in the
-- product reads them as contiguous. A gap is strictly better than a collision.

DO $$
DECLARE v_max bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'S'
      AND relname = 'support_ticket_number_seq'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    CREATE SEQUENCE public.support_ticket_number_seq AS bigint INCREMENT BY 1 NO CYCLE;

    SELECT COALESCE(
             MAX(CASE WHEN "ticketNumber" ~ '^TKT-[0-9]+$'
                      THEN substring("ticketNumber" from 5)::bigint END),
             0)
      INTO v_max
      FROM public."SupportTicket";

    PERFORM setval('public.support_ticket_number_seq', v_max + 1, false);
  END IF;
END
$$;

-- `nextval` needs USAGE. SELECT is granted alongside so a diagnostic
-- `SELECT last_value` is possible without a second migration.
GRANT USAGE, SELECT ON SEQUENCE public.support_ticket_number_seq TO app_user;

-- `app_admin` exists on staging only (quick-600 created it there); guarded on
-- `pg_roles` so this file is a no-op wherever the role has not been created yet.
-- Same shape as `20260915160000_grant_cutover_routing_tables_to_app_admin`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT USAGE, SELECT ON SEQUENCE public.support_ticket_number_seq TO app_admin;
  END IF;
END
$$;
