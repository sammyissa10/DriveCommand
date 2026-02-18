ALTER TABLE "TenantIntegration" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "TenantIntegration"
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);
