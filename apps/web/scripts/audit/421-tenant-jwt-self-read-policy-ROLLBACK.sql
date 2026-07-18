BEGIN;
DROP POLICY IF EXISTS tenant_jwt_self_read ON public."Tenant";
COMMIT;
