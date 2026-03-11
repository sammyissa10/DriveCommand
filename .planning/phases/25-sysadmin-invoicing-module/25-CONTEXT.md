# Phase 25: SysAdmin Invoicing Module - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning
**Depends on:** Phase 23 (SysAdmin Portal)

<domain>
## Phase Boundary

DriveCommand's own internal billing system — NOT the tenant invoice module. Lets the system admin portal create invoices for tenants covering subscription fees, setup fees, and other charges. Admins can add line items, set due dates, and deliver invoices via email. Includes tracking of unpaid/paid/overdue status and a full billing history view per tenant. Lives entirely within the sysadmin portal.

</domain>

<decisions>
## Implementation Decisions

### What this is NOT
- This is NOT the tenant-facing invoice module (quick-7) for carriers billing their customers
- This is DriveCommand billing its own tenants (B2B SaaS subscription billing)

### Scope
- Create/edit/delete invoices from sysadmin portal
- Line items per invoice (description, quantity, unit price)
- Invoice statuses: DRAFT, SENT, PAID, OVERDUE
- Due date tracking with automatic overdue detection
- Email delivery to tenant owner when invoice is sent
- Billing history per tenant (all invoices for a given tenant)
- Dashboard summary: total outstanding, overdue count, recent payments

### Plans (3)
- Plan 1: DB schema + server actions (Invoice, InvoiceLineItem models, RLS, CRUD actions)
- Plan 2: Sysadmin UI (create/edit invoice page, line items editor, status management, billing history per tenant)
- Plan 3: Email delivery (send invoice email to tenant owner, overdue detection cron or manual trigger)

</decisions>

<specifics>
## Specific Ideas

- Invoice should show DriveCommand branding when emailed (similar to rate confirmation PDF from quick-25)
- Overdue = past due date and status is still SENT (not PAID)
- Tenant billing history accessible from the tenant detail page in sysadmin portal

</specifics>

<deferred>
## Deferred Ideas

- Stripe or payment processor integration — defer, manual payment marking for now
- Tenant self-service billing portal — defer
- Automated subscription billing / recurring invoices — defer

</deferred>

---

*Phase: 25-sysadmin-invoicing-module*
*Context gathered: 2026-03-11*
