-- ============================================================================
-- Quick-492: Backfill legacy single primary-contact into client_contacts
-- Every existing client with ANY legacy contact data (primary_contact, email,
-- or phone) gets exactly one isMain contact row. Clients with none of these
-- get ZERO contact rows (contacts stay optional). Idempotent: skipped for any
-- client that already has a client_contacts row.
-- ============================================================================
BEGIN;

INSERT INTO client_contacts (org_id, client_id, name, role, phone, email, is_main)
SELECT c.org_id, c.id,
       COALESCE(NULLIF(TRIM(c.primary_contact), ''), c.name),
       NULL, c.phone, c.email, true
FROM clients c
WHERE (NULLIF(TRIM(c.primary_contact), '') IS NOT NULL
       OR NULLIF(TRIM(c.email), '') IS NOT NULL
       OR NULLIF(TRIM(c.phone), '') IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id);

COMMIT;
