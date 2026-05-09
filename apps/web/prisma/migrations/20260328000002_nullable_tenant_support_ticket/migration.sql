-- Make tenantId nullable on SupportTicket so sysadmin can submit tickets without a tenant
ALTER TABLE "SupportTicket" ALTER COLUMN "tenantId" DROP NOT NULL;
