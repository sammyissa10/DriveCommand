# Quick Task 444 — Plan
## Confirm mobile INVOICED guard is tenant-safe under bypass_rls

**Mode:** READ ONLY — no code changes. Investigation and reporting only.

### Task 1: Read mobile owner load PATCH handler
- File: `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts`
- Locate the pre-check load lookup (before the INVOICED guard)
- Locate the INVOICED guard itself
- Document execution order with line numbers

### Task 2: Read Prisma schema for Invoice and Load models
- File: `apps/web/prisma/schema.prisma`
- Confirm `Load.id` is a globally-unique UUID PK
- Confirm `Invoice.loadId` is a FK to `Load.id`
- Confirm no shared key space between tenants

### Task 3: Produce security verdict
- Answer all 4 questions with file:line evidence
- Definitive yes/no on tenant safety
- Identify any bypass path if one exists
