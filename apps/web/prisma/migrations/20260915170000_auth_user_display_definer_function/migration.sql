-- quick-615 — the GRANT-class statement. `auth.users`, THREE COLUMNS, reached
-- through a narrow `SECURITY DEFINER` function instead of a schema grant.
--
-- ═══ READ THIS FIRST: THIS FILE REPLACES A COLUMN-GRANT MIGRATION THAT WAS
-- ═══ WRITTEN, APPLIED TO STAGING, AND MEASURED TO BE A SILENT NO-OP.
--
-- The first attempt was `20260915170000_grant_auth_user_display_columns`:
--
--     GRANT USAGE ON SCHEMA auth TO app_admin;
--     GRANT SELECT (id, email, raw_user_meta_data) ON TABLE auth.users TO app_admin;
--
-- It applied without error and HALF of it did nothing. Measured on staging,
-- immediately after:
--
--     has_schema_privilege('app_admin','auth','USAGE')  =  FALSE
--     pg_attribute.attacl on auth.users.id/email/raw_user_meta_data
--                                                      =  {app_admin=r/postgres}
--
-- The column grant landed; the schema grant did not. Re-issuing it with the
-- notice channel attached gives the reason verbatim:
--
--     WARNING:  no privileges were granted for "auth"
--
-- A WARNING, not an ERROR — so the transaction committed, the migration
-- "succeeded", and `information_schema.role_table_grants` showed the column
-- privileges sitting there looking correct while the statement they exist for
-- still failed `42501: permission denied for schema auth`.
--
-- WHY. `pg_namespace.nspacl` for `auth` reads:
--
--     supabase_admin=UC/supabase_admin, anon=U/…, authenticated=U/…,
--     service_role=U/…, supabase_auth_admin=UC/…, dashboard_user=UC/…,
--     postgres=U/supabase_admin
--
-- `postgres` — the role every migration in this repo runs as, via
-- `scripts/migrate.mjs` on `DIRECT_URL` — holds `U` with **no `*`**, i.e. USAGE
-- WITHOUT GRANT OPTION, and `rolsuper = false`. It cannot pass USAGE on. It
-- cannot borrow the owner's authority either: `SET ROLE supabase_admin` from
-- `postgres` is `42501 permission denied to set role`, measured, because
-- `postgres` is not a member of it (its memberships are anon, app_admin,
-- app_user, authenticated, authenticator, pg_create_subscription, pg_monitor,
-- pg_read_all_data, pg_signal_backend, service_role,
-- supabase_privileged_role).
--
-- The column grant worked for the mirror-image reason: `pg_class.relacl` on
-- `auth.users` reads `postgres=ar*wdDxtm/supabase_auth_admin` — SELECT **WITH
-- GRANT OPTION**. So `postgres` can hand out a column SELECT it can never make
-- reachable.
--
-- **A column grant on a schema the grantee cannot enter is a privilege that
-- reads correctly in the catalog and cannot be exercised.** That is why the
-- both-directions matrix exists, and it is the only thing that caught this: the
-- `--after` lane would have shown `42501` on a statement whose grant the same
-- report listed as present.
--
-- ─── SO THE REJECTED ALTERNATIVE BECOMES THE CHOSEN ONE ────────────────────
--
-- The replaced migration stated a `SECURITY DEFINER` function as the narrower
-- alternative and rejected it, on the ground that it changes the call site's
-- SQL and a routing task is the wrong place for a query rewrite. That argument
-- was sound and its premise — that the column grant was available — was false.
-- Measurement beats argument. This is the quick-601 precedent, which replaced a
-- bypass on the sign-up path with narrow definer functions for exactly this
-- reason.
--
-- The three options, and why this one:
--
--   1. Column grant + schema USAGE          IMPOSSIBLE from `postgres`, measured
--                                           above. Not a preference.
--   2. `GRANT authenticated TO app_admin`   `authenticated` holds `U` on `auth`,
--      (role membership)                    so this would work — and it would
--                                           hand `app_admin` everything that
--                                           role can do, forever, for three
--                                           display columns. `admin-connection.md`
--                                           §2 excludes role membership by name.
--                                           REFUSED.
--   3. `SECURITY DEFINER` function in       CHOSEN. `app_admin` gets EXECUTE on
--      `public`, owned by the migrating     one function and NO `auth` privilege
--      role                                 of any kind — `has_schema_privilege
--                                           ('app_admin','auth','USAGE')` stays
--                                           FALSE, which is strictly narrower
--                                           than option 1 ever was.
--
-- ─── WHAT THIS FUNCTION DOES AND DOES NOT EXPOSE ───────────────────────────
--
-- It returns THREE columns for an explicit array of user ids. The full
-- `auth.users` column list, so "what an unqualified table grant would have
-- exposed" is a list a reader can see — the capitalised ones are the reason
-- `GRANT SELECT ON auth.users` is forbidden by this repo and refused by
-- `615-routing-verify.ts --apply`:
--
--   instance_id, id, aud, role, email, ENCRYPTED_PASSWORD, email_confirmed_at,
--   invited_at, CONFIRMATION_TOKEN, confirmation_sent_at, RECOVERY_TOKEN,
--   recovery_sent_at, EMAIL_CHANGE_TOKEN_NEW, email_change,
--   email_change_sent_at, last_sign_in_at, raw_app_meta_data,
--   raw_user_meta_data, is_super_admin, created_at, updated_at, phone,
--   phone_confirmed_at, phone_change, PHONE_CHANGE_TOKEN, phone_change_sent_at,
--   confirmed_at, EMAIL_CHANGE_TOKEN_CURRENT, email_change_confirm_status,
--   banned_until, REAUTHENTICATION_TOKEN, reauthentication_sent_at,
--   is_sso_user, deleted_at, is_anonymous
--
-- And what `USAGE ON SCHEMA auth` would have opened, which this migration now
-- does NOT open — enumerated from the catalog rather than from memory, because
-- the decision is only reviewable if the cost is written down:
--
--   * the 27 tables in schema `auth` become NAMEABLE:
--     audit_log_entries, custom_oauth_providers, flow_state, identities,
--     instances, mfa_amr_claims, mfa_challenges, mfa_factors,
--     mfa_recovery_code_sets, mfa_recovery_codes, oauth_authorizations,
--     oauth_client_states, oauth_clients, oauth_consents, one_time_tokens,
--     refresh_tokens, saml_providers, saml_relay_states, schema_migrations,
--     scim_tokens, scim_users, sessions, sso_domains, sso_providers, users,
--     webauthn_challenges, webauthn_credentials.
--     Nameable, not readable — but USAGE is the GATE, so a future accidental
--     table grant in that schema would take effect where today it cannot.
--   * four functions in `auth` carry a leading `=X/supabase_auth_admin` ACL
--     entry, i.e. PUBLIC EXECUTE: `auth.email()`, `auth.jwt()`, `auth.role()`,
--     `auth.uid()`. All four are `prosecdef = false` and read only from
--     `current_setting('request.jwt.claims')` — they report the CALLER's own
--     PostgREST claims and nothing about any other user, and on a direct `pg`
--     connection there is no such setting, so they return null. Named because
--     USAGE is what makes them callable, not because they disclose anything.
--
-- ─── HARDENING, AND WHAT IT IS AND IS NOT ──────────────────────────────────
--
--   * `SET search_path = pg_catalog, auth` — pinned, so nothing a caller can
--     put on its own search_path changes what the body resolves to. A
--     `SECURITY DEFINER` function without a pinned search_path is the classic
--     escalation primitive.
--   * `REVOKE ALL ON FUNCTION … FROM PUBLIC` FIRST. PostgreSQL grants EXECUTE
--     to PUBLIC by default on every new function; without this line the
--     function is callable by `app_user` and by every other role in the
--     database. This single line is the difference between a narrow definer
--     and a wide-open one.
--   * `STABLE`, and no dynamic SQL anywhere in the body.
--   * The body is a fixed three-column projection over an explicit id array.
--     There is no column list a caller can influence.
--
-- HONESTLY STATED, because this is the cost of option 3 and it should not be
-- discovered later: a `SECURITY DEFINER` function owned by a role that can read
-- `auth.users` IS a standing capability, and its BODY is the only thing between
-- `EXECUTE` and the rest of that table. Widening its `SELECT` list is a one-line
-- change with no grant for a reviewer to notice. The column grant would have put
-- that boundary in `information_schema.column_privileges` where a catalog query
-- enumerates it; this puts it in `pg_proc.prosrc`, where only a code review
-- does. That trade was not chosen — it was forced by the measurement above —
-- and `615-routing-verify.ts --after` measures the boundary from the outside
-- regardless: `app_admin` reads the three display columns through the function
-- and is REFUSED `42501` on `encrypted_password`.
--
-- ─── THE OWNERSHIP DEPENDENCY, STATED ──────────────────────────────────────
--
-- A `SECURITY DEFINER` function runs as its OWNER, and the owner is whichever
-- role applies this migration. On staging and on production that is `postgres`
-- (`scripts/migrate.mjs` connects on `DIRECT_URL`), which holds `U` on schema
-- `auth` and `ar*wdDxtm` on `auth.users` — measured on staging, and the reason
-- this works at all. If a future deploy applies migrations as a role WITHOUT
-- those privileges, this function will exist and raise at call time rather than
-- silently returning nothing. That is the right failure direction, but it is a
-- dependency on the migrating role and it is recorded here rather than assumed.
--
-- ─── THE CALL SITE ─────────────────────────────────────────────────────────
--
-- `apps/web/src/actions/support-tickets.ts` :292, inside `getAllTickets`'s
-- `Promise.all`, changed in the same commit from
--
--     SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = ANY($1::uuid[])
--   to
--     SELECT id, email, raw_user_meta_data FROM public.auth_user_display($1::uuid[])
--
-- Same three columns, same names, same types, same filter, same rows. This is
-- the ONE statement in quick-615 whose text changed, and it changed only
-- because no receiver on this database can execute the original. Every other
-- routed statement is byte-identical apart from the client it runs on.
--
-- ─── ALSO HERE: CONVERGING THE TWO DATABASES ───────────────────────────────
--
-- The replaced migration left a real column grant on STAGING. Production never
-- received it. The REVOKE below removes it so both databases end in the same
-- state, and is a harmless no-op anywhere the grant was never made. It is NOT
-- an admission that the column grant was dangerous — it is that a privilege
-- nothing uses is a privilege that comes back to life the next time somebody
-- reads the catalog and assumes it is load-bearing (the quick-520 rule about
-- `end_stop_facility_id`).
--
-- No policy DDL: `npm run audit:rls-policy-drift` must stay zero and
-- `rls-policy-canonical.json` is NOT regenerated. Guarded on `pg_roles`.
-- Reaches production on the next `vercel --prod` via `scripts/migrate.mjs`,
-- which is intended — the statement is broken there too.

CREATE OR REPLACE FUNCTION public.auth_user_display(user_ids uuid[])
RETURNS TABLE (id uuid, email varchar, raw_user_meta_data jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $fn$
  SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
   WHERE u.id = ANY(user_ids)
$fn$;

COMMENT ON FUNCTION public.auth_user_display(uuid[]) IS
  'quick-615 — display-name/email fallback for support-ticket submitters. Returns EXACTLY id, email and raw_user_meta_data for an explicit id array and nothing else. SECURITY DEFINER because app_admin cannot be granted USAGE on schema auth: the migrating role holds U without GRANT OPTION, and the attempt is a WARNING rather than an error. Never widen this projection.';

-- PostgreSQL grants EXECUTE to PUBLIC by default. Without this, the function is
-- callable by app_user and by every other role in the database.
REVOKE ALL ON FUNCTION public.auth_user_display(uuid[]) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT EXECUTE ON FUNCTION public.auth_user_display(uuid[]) TO app_admin;
    -- Converge staging with production: the replaced migration granted these
    -- three columns on staging only, and nothing reads them now.
    REVOKE SELECT (id, email, raw_user_meta_data) ON TABLE auth.users FROM app_admin;
  END IF;
END
$$;
