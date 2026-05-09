---
phase: quick-128
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/docs/README.md
  - apps/web/docs/database.md
autonomous: true
must_haves:
  truths:
    - "README.md tech stack table and ToC are accurate and match current implementation"
    - "database.md schema table documents all 37 models in the Prisma schema"
  artifacts:
    - path: "apps/web/docs/README.md"
      provides: "Accurate tech stack and ToC"
    - path: "apps/web/docs/database.md"
      provides: "Complete schema reference for all 37 models"
  key_links: []
---

<objective>
Fix stale documentation in apps/web/docs/ — verify README.md accuracy and add 8 missing models to database.md schema table.

Purpose: Keep developer docs in sync with the actual Prisma schema (37 models vs 29 documented).
Output: Updated README.md (if needed) and database.md with complete model coverage.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/docs/README.md
@apps/web/docs/database.md
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify and fix README.md if needed</name>
  <files>apps/web/docs/README.md</files>
  <action>
    Read apps/web/docs/README.md and verify:
    1. Tech Stack table Email row — should say "Gmail SMTP via Nodemailer" (currently appears correct at line 17, but confirm)
    2. ToC Email entry description — should reference Gmail SMTP / Nodemailer (currently appears correct at line 58, but confirm)

    If both are already correct, skip this file — no changes needed.
    If either is stale (e.g., still says "Resend (via resend SDK)"), update to match current implementation.
  </action>
  <verify>Read the file and confirm Email row says "Gmail SMTP via Nodemailer" and ToC Email entry mentions Gmail SMTP.</verify>
  <done>README.md tech stack and ToC accurately reflect the current email implementation.</done>
</task>

<task type="auto">
  <name>Task 2: Add 8 missing models to database.md schema table</name>
  <files>apps/web/docs/database.md</files>
  <action>
    The database.md schema table documents 29 models but the Prisma schema has 37. Add these 8 missing models to the table in logical positions (group with related models):

    1. `RouteDriver` — Co-driver assignment on a route. Key fields: `id`, `routeId`, `driverId`, `role` (default "co-driver"). Add after the `Route`/`RouteStop` rows.

    2. `DriverRouteJoin` — Driver-route payment assignment. Key fields: `id`, `tenantId`, `routeId`, `driverId`, `isMainDriver`, `paymentMethod`, `fixedAmount?`, `hourlyRate?`, `perMileRate?`. Add near RouteDriver.

    3. `DriverHOSEntry` — Driver hours-of-service log entry. Key fields: `id`, `tenantId`, `driverId`, `status` (OFF_DUTY/SLEEPER_BERTH/DRIVING/ON_DUTY), `startTime`, `endTime?`, `notes?`. Add after SafetyEvent.

    4. `DriverIncident` — Driver-reported incident. Key fields: `id`, `tenantId`, `driverId`, `category`, `severity`, `description`, `latitude?`, `longitude?`, `photoS3Key?`, `reportedAt`. Add after DriverHOSEntry.

    5. `FleetMessage` — In-app messaging between drivers and owners. Key fields: `id`, `tenantId`, `routeId?`, `loadId?`, `senderId`, `senderRole`, `body`, `recipientId?`, `isBroadcast`. Add after DriverIncident.

    6. `PushToken` — Mobile push notification token. Key fields: `id`, `userId`, `token`, `platform` (ios/android). Add after FleetMessage or NotificationLog.

    7. `SysAdminInvoice` — Invoice from DriveCommand to a tenant. Key fields: `id`, `tenantId`, `invoiceNumber` (unique), `status` (DRAFT/SENT/PAID/OVERDUE/CANCELLED), `issueDate`, `dueDate`, `subtotal`, `total`, `isRecurring`. Add after the tenant Invoice/InvoiceItem rows.

    8. `SysAdminInvoiceItem` — Line item on a SysAdmin invoice. Key fields: `id`, `invoiceId`, `chargeType?`, `description`, `quantity`, `unitPrice`, `amount`. Add after SysAdminInvoice.

    Also update the model count from "29 models" to "37 models" in the intro text on line 46.

    Maintain the existing table format: `| Model | Purpose | Key Fields |`
  </action>
  <verify>
    1. Count the rows in the schema table — should be 37.
    2. Grep for each new model name to confirm it appears: RouteDriver, DriverRouteJoin, DriverHOSEntry, DriverIncident, FleetMessage, PushToken, SysAdminInvoice, SysAdminInvoiceItem.
    3. Intro text says "37 models".
  </verify>
  <done>database.md schema table has all 37 models documented with accurate purpose and key fields. Model count reads "37 models".</done>
</task>

</tasks>

<verification>
- `grep -c "^|" apps/web/docs/database.md` in the schema table section shows 37 data rows (plus header/separator = 39)
- All 37 model names from `grep "^model " apps/web/prisma/schema.prisma` appear in database.md
- README.md email references are accurate
</verification>

<success_criteria>
- database.md documents all 37 Prisma models (was 29)
- README.md tech stack and ToC are verified accurate
- No models in schema.prisma are undocumented
</success_criteria>

<output>
After completion, create `.planning/quick/128-update-docs-folder-fix-stale-content-rea/128-SUMMARY.md`
</output>
