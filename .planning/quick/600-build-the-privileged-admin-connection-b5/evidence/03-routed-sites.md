# quick-600 — both-directions routed-site matrix (staging)

Captured 2026-09-14T19:10:23.466Z against staging `wyixpgunnjmzguhggocz`.

| shape | reason | call sites | dir A (admin) | dir A span | dir B (tenant A, naming B) | PASS |
| --- | --- | --- | --- | --- | --- | --- |
| S1 — Tenant active-tenant sweep | compliance/daily/weekly digest tenant sweep, reminders cron tenant sweep | digest-compliance-30day/route.ts<br>digest-daily-driver/route.ts<br>digest-weekly-owner/route.ts<br>send-reminders/route.ts | 2 | 2 | 0 | PASS |
| S2 — PlaybookInstance active-tenant sweep | workflow digest active-tenant sweep | workflow-digest/route.ts | 2 | 2 | 0 | PASS |
| S3 — StepInstance overdue sweep | workflow overdue-step sweep | workflow-notifications/route.ts (sweep 1) | 2 | 2 | 0 | PASS |
| S4 — PlaybookInstance blocked sweep | workflow blocked-instance sweep | workflow-notifications/route.ts (sweep 2) | 2 | 2 | 0 | PASS |
| S5 — SupportTicket batch close (id IN (...)) | auto-close stale ticket sweep | auto-close-tickets/route.ts | 2 | — | 0 | PASS |
| S6 — AutomationRun create for an arbitrary tenant | sysadmin manual automation trigger (create) | (admin)/actions/automations.ts:107 (manualTriggerRule, step 1) | 1 | — | ERROR [42501] new row violates row-level security policy for table "AutomationRun" | PASS |
| S7 — AutomationRun status update by id | sysadmin manual automation trigger (SENT/FAILED) | (admin)/actions/automations.ts:141 (manualTriggerRule, SENT branch)<br>(admin)/actions/automations.ts:151 (manualTriggerRule, FAILED branch) | 1 | — | 0 | PASS |
| S8 — Subscription update by tenantId (extendTrial) | sysadmin trial extension | (admin)/actions/tenants.ts:586-615 (extendTrial) | 1 | — | 0 | PASS |
| S9 — Tenant listing, unfiltered | sysadmin tenant listing | lib/db/repositories/tenant.repository.ts:87 (listAllTenants) | 2 | 2 | 0 | PASS |
| S10 — Tenant create (no tenant belongs to another tenant) | sysadmin tenant create | (admin)/actions/tenants.ts:98-123 (createTenant) | 1 | — | ERROR [42501] new row violates row-level security policy for table "Tenant" | PASS |
| S11 — Tenant UPDATE by id (status change / profile / settings) | sysadmin tenant status change, profile update, settings update | (admin)/actions/tenants.ts:190 (suspendTenant)<br>(admin)/actions/tenants.ts:229 (reactivateTenant)<br>(admin)/actions/tenants.ts:432 (updateTenant)<br>(admin)/actions/tenants.ts:542 (updateTenantSettings) | 1 | — | 0 | PASS |
| S12 — Tenant DELETE by id | sysadmin tenant delete | (admin)/actions/tenants.ts:625 (deleteTenant) | 1 | — | 0 | PASS |
| S13 — User + Tenant join, by userId | tenant lookup by user id | lib/db/repositories/tenant.repository.ts:66 (findTenantByUserId) | 1 | — | 0 | PASS |
| S14 — DriverInvitation lookup by id | invitation lookup by token | api/auth/accept-invitation/route.ts:44 (GET)<br>api/auth/accept-invitation/route.ts:121 (POST) | 1 | — | 0 | PASS |
| S15 — Load lookup by trackingToken | public shipment tracking lookup | api/track/[token]/route.ts:24 | 1 | — | 0 | PASS |
| S16 — SupportTicket status UPDATE by id | sysadmin ticket status update | actions/support-tickets.ts:341 (updateTicketStatus) | 1 | — | 0 | PASS |
| S17 — TicketMessage create for an arbitrary tenant's ticket | sysadmin ticket reply | actions/support-tickets.ts:475 (addAdminReply) | 1 | — | ERROR [42501] new row violates row-level security policy for table "TicketMessage" | PASS |
| S18 — TicketMessage read by ticketId | sysadmin ticket thread read | actions/support-tickets.ts:542 (getTicketMessages) | 1 | — | 0 | PASS |
| S19 — SysAdminInvoice create for an arbitrary tenant | sysadmin invoice management | (admin)/actions/sysadmin-invoices.ts (createSysAdminInvoice and 9 sibling functions) | 1 | — | ERROR [42501] new row violates row-level security policy for table "SysAdminInvoice" | PASS |
| S20 — SysAdminInvoice audit-trail read (createdBy/updatedBy) by id | sysadmin invoice audit trail | (admin)/billing/[id]/page.tsx:36 | 1 | — | 0 | PASS |
| S21 — SysAdminInvoice batch OVERDUE sweep | overdue invoice sweep | api/cron/mark-overdue-invoices/route.ts<br>(admin)/actions/sysadmin-invoices.ts (markOverdueInvoices) | 1 | — | 0 | PASS |
| S22 — SysAdminInvoice + User owner lookup | sysadmin invoice email lookup | lib/email/send-sysadmin-invoice.ts | 1 | — | 0 | PASS |

## Notes per row

### S1 — Tenant active-tenant sweep

Admin sees >=2 active tenants unscoped; tenant A cannot see tenant B by id.

### S2 — PlaybookInstance active-tenant sweep

Admin sees the RLS600 NOT_STARTED rows for both A and B; tenant A cannot see B's.

### S3 — StepInstance overdue sweep

Admin sees the RLS600 overdue StepInstance for both A and B; tenant A cannot see B's.

### S4 — PlaybookInstance blocked sweep

Admin sees the RLS600 BLOCKED rows for both A and B; tenant A cannot see B's.

### S5 — SupportTicket batch close (id IN (...))

Admin closes tenant B's RLS600 ticket in a batch statement; tenant-A-scoped app_user affects 0 rows on the same id.

### S6 — AutomationRun create for an arbitrary tenant

Admin creates a PENDING run naming tenant B with no GUC set; tenant-A-scoped app_user's WITH CHECK refuses the same insert naming tenant B.

### S7 — AutomationRun status update by id

Admin marks tenant B's RLS600 run SENT with no GUC set; tenant-A-scoped app_user affects 0 rows on the same id.

### S8 — Subscription update by tenantId (extendTrial)

Admin extends tenant B's trial with no GUC set; tenant-A-scoped app_user affects 0 rows on tenant B's subscription.

### S9 — Tenant listing, unfiltered

Admin lists every tenant with no GUC set (>=2 distinct, A and B both present); tenant A cannot see B by id.

### S10 — Tenant create (no tenant belongs to another tenant)

Admin creates a brand-new tenant with no GUC set; tenant-A-scoped app_user's INSERT is refused because a GUC is set (tenant_bootstrap_insert only admits an UNSET GUC).

### S11 — Tenant UPDATE by id (status change / profile / settings)

Admin updates tenant B with no GUC set; tenant-A-scoped app_user affects 0 rows on the same id (tenant_self_update only admits id = current_tenant_id()).

### S12 — Tenant DELETE by id

Admin creates + deletes a THROWAWAY, dependent-free tenant with no GUC set (isolates the grant/RLS question from the real User_tenantId_fkey constraint, which real tenant B would trip under ANY role). Tenant-A-scoped app_user attempting DELETE on the REAL tenant B affects 0 rows — no DELETE policy exists on "Tenant" at all, deliberately (design §4.5): a tenant must never be able to delete itself.

### S13 — User + Tenant join, by userId

Admin resolves tenant B's owner user id to its tenant with no GUC set; tenant-A-scoped app_user reads 0 rows for that user id.

### S14 — DriverInvitation lookup by id

Admin reads tenant B's RLS600 invitation by id with no GUC set; tenant-A-scoped app_user reads 0 rows for the same id.

### S15 — Load lookup by trackingToken

Admin reads tenant B's RLS600 load by trackingToken with no GUC set; tenant-A-scoped app_user reads 0 rows for the same token.

### S16 — SupportTicket status UPDATE by id

Admin resolves tenant B's RLS600 ticket with no GUC set; tenant-A-scoped app_user affects 0 rows on the same id.

### S17 — TicketMessage create for an arbitrary tenant's ticket

Admin posts a reply on tenant B's RLS600 ticket with no GUC set. The cross-tenant column runs the SAME insert as app_user scoped to tenant A, naming tenant B's ticketId — recorded as measured, not assumed; TicketMessage carries no tenant column of its own, so its write-side isolation (if any) can only come from a policy that subqueries SupportTicket, and whether one exists is exactly what this row measures.

### S18 — TicketMessage read by ticketId

Admin reads tenant B's RLS600 ticket thread with no GUC set; tenant-A-scoped app_user reads 0 rows for the same ticketId (TicketMessage's policy is a subquery over SupportTicket.tenantId).

### S19 — SysAdminInvoice create for an arbitrary tenant

Admin creates an invoice for tenant B with no GUC set; tenant-A-scoped app_user's WITH CHECK refuses the same insert.

### S20 — SysAdminInvoice audit-trail read (createdBy/updatedBy) by id

Admin reads tenant B's seeded invoice with no GUC set; tenant-A-scoped app_user reads 0 rows for the same id.

### S21 — SysAdminInvoice batch OVERDUE sweep

Admin marks tenant B's seeded (DRAFT) invoice OVERDUE (batch shape) with no GUC set; tenant-A-scoped app_user affects 0 rows on the same id.

### S22 — SysAdminInvoice + User owner lookup

Admin resolves tenant B's invoice + owner email with no GUC set; tenant-A-scoped app_user reads 0 rows for the same invoice id.

