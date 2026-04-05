---
phase: quick-173
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/compliance.ts
  - apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts
  - apps/web/vercel.json
autonomous: true
must_haves:
  truths:
    - "Cron endpoint processes all active tenants in isolation and returns summary"
    - "Each tenant's compliance alerts are logged to carrier_compliance_alert_log table"
    - "One tenant failure does not block other tenants"
    - "Endpoint is protected by CRON_SECRET bearer token"
  artifacts:
    - path: "apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts"
      provides: "Daily compliance alert cron job"
      exports: ["GET"]
    - path: "apps/web/vercel.json"
      provides: "Cron schedule entry for carrier-compliance-alerts"
      contains: "carrier-compliance-alerts"
  key_links:
    - from: "apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts"
      to: "apps/web/src/lib/carrier/compliance.ts"
      via: "getComplianceAlerts import"
      pattern: "getComplianceAlerts"
    - from: "apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts"
      to: "prisma"
      via: "raw SQL for alert log table + tenant query"
      pattern: "prisma\\.\\$executeRawUnsafe|prisma\\.tenant\\.findMany"
---

<objective>
Create a daily compliance alert cron job that iterates all active tenants, runs the existing
`getComplianceAlerts()` for each, and logs any findings to a `carrier_compliance_alert_log` table.

Purpose: Proactive compliance monitoring — catch expiring CDLs, registrations, insurance, licenses,
and contracts before they lapse.

Output: Working cron endpoint at `/api/cron/carrier-compliance-alerts`, scheduled daily at 06:00 UTC.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/compliance.ts
@apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts
@apps/web/vercel.json
@apps/web/src/components/carrier/dashboard/AlertBar.tsx

NOTE on schema reality vs task description:
The task description asks for 6 check types including medical_certificate_expiry (CarrierDriver),
dot_inspection_expiry (CarrierTruck), and client credit_limit AR check.
However, the actual Prisma schema does NOT have these fields:
- CarrierDriver has: cdlExpiry (no medicalCertificateExpiry)
- CarrierTruck has: registrationExpiry, insuranceExpiry, licenseExpiry (no dotInspectionExpiry)
- CarrierClient has: no creditLimit field
The existing compliance.ts already covers the 5 checks that the schema supports.
Do NOT add checks for fields that don't exist. Use the existing 5-check implementation as-is.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create compliance alert cron route with log table</name>
  <files>
    apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts
    apps/web/vercel.json
  </files>
  <action>
Create GET handler at `apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts`.
Follow the exact pattern from `apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts`.

Structure:
1. `export const dynamic = 'force-dynamic';`
2. Validate `authorization` header against `Bearer ${process.env.CRON_SECRET}` — return 401 if mismatch.
3. Create-if-not-exists the log table via `prisma.$executeRawUnsafe`:
   ```sql
   CREATE TABLE IF NOT EXISTS carrier_compliance_alert_log (
     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     org_id uuid NOT NULL,
     alert_type text NOT NULL,
     entity_id text NOT NULL,
     message text NOT NULL,
     severity text NOT NULL,
     created_at timestamptz DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_compliance_log_org ON carrier_compliance_alert_log(org_id);
   CREATE INDEX IF NOT EXISTS idx_compliance_log_created ON carrier_compliance_alert_log(created_at);
   ```
   Run this once at the top of the handler (idempotent).
4. Query all active tenants: `prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true } })`.
   Add `@bypass_rls` comment like carrier-auto-dispatch does.
5. Initialize summary: `{ orgs_processed: 0, total_alerts_found: 0 }`.
6. Loop each tenant in a try/catch (one failure must NOT block others):
   - Call `getComplianceAlerts(tenant.id)` from `@/lib/carrier/compliance`.
   - If alerts.length > 0, insert each alert into the log table via `prisma.$executeRawUnsafe`:
     ```sql
     INSERT INTO carrier_compliance_alert_log (org_id, alert_type, entity_id, message, severity)
     VALUES ($1, $2, $3, $4, $5)
     ```
     Use parameterized `prisma.$executeRaw` (the tagged template version) for safety.
   - Increment summary counters.
   - Log with `logger.info` per tenant processed.
   - On catch: `logger.error` and continue to next tenant.
7. Return `NextResponse.json({ success: true, orgs_processed, total_alerts_found })`.

Add cron entry to `apps/web/vercel.json` in the `crons` array:
```json
{ "path": "/api/cron/carrier-compliance-alerts", "schedule": "0 6 * * *" }
```

Import pattern:
- `import { NextRequest, NextResponse } from 'next/server';`
- `import { prisma } from '@/lib/db/prisma';`
- `import { getComplianceAlerts } from '@/lib/carrier/compliance';`
- `import { logger } from '@/lib/logger';`
- `import { Prisma } from '@prisma/client';` (for Prisma.sql tagged template if needed)
  </action>
  <verify>
    - `npx tsc --noEmit` passes (run from apps/web)
    - The cron route file exists and exports a GET function
    - vercel.json contains the new cron entry with schedule "0 6 * * *"
    - The AlertBar component import path (`@/lib/carrier/compliance`) still resolves correctly (unchanged)
  </verify>
  <done>
    - GET /api/cron/carrier-compliance-alerts validates CRON_SECRET, iterates all active tenants, calls getComplianceAlerts per tenant, logs alerts to carrier_compliance_alert_log, returns { success, orgs_processed, total_alerts_found }
    - One tenant error does not block others
    - vercel.json schedules the cron daily at 06:00 UTC
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- Cron route exists with GET export and CRON_SECRET guard
- vercel.json has 6 cron entries (5 existing + 1 new)
- No changes to existing compliance.ts function signature (AlertBar continues to work)
</verification>

<success_criteria>
- Cron route created matching project's existing cron pattern (carrier-auto-dispatch)
- All active tenants processed in isolation with error boundaries
- Alerts logged to carrier_compliance_alert_log table (auto-created)
- Vercel cron scheduled for daily 06:00 UTC
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/173-carrier-ops-compliance-alert-cron-job/173-SUMMARY.md`
</output>
