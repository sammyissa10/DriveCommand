-- Enable RLS on _prisma_migrations
-- This table is accessed only by the Prisma migration runner via a direct DB connection
-- (not the Supabase pooler), so it runs as the database owner which bypasses RLS automatically.
-- No permissive policies are added — no Supabase client should ever access this table directly.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on Tenant
-- This table is server-only and never accessed by the Supabase client directly.
-- No tenant_isolation_policy is added because Tenant is not tenant-scoped data.
-- The bypass_rls_policy allows server-side Prisma access when app.bypass_rls = 'on'.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bypass_rls_policy ON "Tenant";
CREATE POLICY bypass_rls_policy ON "Tenant"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
