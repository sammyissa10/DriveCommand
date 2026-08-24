-- Align `route_template_stops.stop_type` with `stops.stop_type`.
--
-- `stops_stop_type_check` has admitted five values since it was seeded
-- (pickup | delivery | fuel_stop | layover | relay_handoff) while
-- `route_template_stops_stop_type_check` admitted only the first four. That
-- split is invisible until something writes both tables in one transaction —
-- which is exactly what Phase 8's commit path does: it materialises stops and
-- then creates or updates a route template. A relay-handoff trip therefore
-- committed its stop and then took a 23514 on the template, rolling back a
-- perfectly valid trip. Same class as DEC-14: a CHECK seeded early that never
-- tracked the app's vocabulary.
--
-- The value list below is written in the varchar-cast shape deliberately, so
-- that after this migration `pg_get_constraintdef` renders the two constraints
-- identically apart from the table name. A future diff of the pair is then
-- meaningful rather than noise about how each was originally spelled.
--
-- Applied to production via Supabase MCP before this file was written, and
-- marked applied with `prisma migrate resolve --applied` rather than replayed,
-- per DEC-3 rules 1 and 4 — there is no non-production database to replay it
-- against. The body is idempotent regardless (`DROP ... IF EXISTS` then a
-- rebuild), and mirrors exactly what is live, read back from `pg_constraint`
-- rather than inferred.
--
-- Deliberately NOT done here: `stops.stop_type` is already correct and is not
-- touched, and `facilities_facility_type_check` is not widened.
ALTER TABLE route_template_stops DROP CONSTRAINT IF EXISTS route_template_stops_stop_type_check;

ALTER TABLE route_template_stops
  ADD CONSTRAINT route_template_stops_stop_type_check
  CHECK ((stop_type = ANY (ARRAY[('pickup'::character varying)::text, ('delivery'::character varying)::text, ('fuel_stop'::character varying)::text, ('layover'::character varying)::text, ('relay_handoff'::character varying)::text])));
