-- Enable RLS on SupportTicket (has tenantId — use standard tenant isolation)
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "SupportTicket";
CREATE POLICY tenant_isolation_policy ON "SupportTicket"
  FOR ALL
  USING ("tenantId" = current_tenant_id());

DROP POLICY IF EXISTS bypass_rls_policy ON "SupportTicket";
CREATE POLICY bypass_rls_policy ON "SupportTicket"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- Enable RLS on TicketMessage (no tenantId — scope via parent SupportTicket)
ALTER TABLE "TicketMessage" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "TicketMessage";
CREATE POLICY tenant_isolation_policy ON "TicketMessage"
  FOR ALL
  USING (
    "ticketId" IN (
      SELECT id FROM "SupportTicket"
      WHERE "tenantId" = current_tenant_id()
    )
  );

DROP POLICY IF EXISTS bypass_rls_policy ON "TicketMessage";
CREATE POLICY bypass_rls_policy ON "TicketMessage"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
