BEGIN;

CREATE POLICY tenant_jwt_self_read ON public."Tenant"
  FOR SELECT TO app_user
  USING (id = ((auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid));

-- Verify policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'Tenant' AND policyname = 'tenant_jwt_self_read'
  ) THEN
    RAISE EXCEPTION 'tenant_jwt_self_read policy missing after CREATE';
  END IF;
END $$;

COMMIT;
