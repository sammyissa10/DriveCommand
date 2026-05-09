---
phase: quick-183
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/seed-qa-accounts.ts
autonomous: true
must_haves:
  truths:
    - "Running seed script creates 2 QA tenants with all child records"
    - "Running seed script a second time skips all records (idempotent)"
    - "Summary at end shows created vs skipped counts"
  artifacts:
    - path: "apps/web/scripts/seed-qa-accounts.ts"
      provides: "Idempotent QA seed script for carrier ops"
  key_links:
    - from: "seed-qa-accounts.ts"
      to: "Supabase Auth + Prisma DB"
      via: "createUser then prisma.create"
---

<objective>
Create `apps/web/scripts/seed-qa-accounts.ts` — an idempotent QA seed script that creates two test tenants with users, carrier drivers, trucks, facilities, and clients.

Purpose: Reproducible QA test data for carrier operations testing.
Output: Single script file runnable via `npx tsx --env-file=.env.local scripts/seed-qa-accounts.ts` from apps/web/.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/scripts/cleanup-test-tenants.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create idempotent QA seed script</name>
  <files>apps/web/scripts/seed-qa-accounts.ts</files>
  <action>
Create `apps/web/scripts/seed-qa-accounts.ts` following the exact same setup pattern as `cleanup-test-tenants.ts`:
- `import 'dotenv/config'`
- PrismaClient with PrismaPg adapter + Pool
- Supabase admin client with service role key
- Wrap main() in try/catch, process.exit(1) on error, disconnect in .finally()

Track two counters: `created` and `skipped`. For every record, log either `CREATED: [description]` or `SKIP — already exists: [description]`.

IMPORTANT SCHEMA MAPPING — the spec references fields that do NOT exist on the carrier ops models. Map as follows:

CarrierDriver (@@map "carrier_drivers"):
- Has: firstName, lastName, email, phone, cdlNumber, cdlState, cdlClass, cdlExpiry, payModel, payRate, status, orgId, userId
- Does NOT have: loadedMileRate, emptyMileRate, medicalCertificateExpiry
- Map spec's pay_model "per_mile" to payModel: "per_mile"
- Map spec's loaded_mile_rate "0.52" to payRate: "0.52" (use payRate as the primary rate)
- Ignore emptyMileRate and medicalCertificateExpiry — they don't exist on the model
- Set cdlClass: "A", cdlExpiry: 2 years from now, status: "active"

CarrierTruck (@@map "carrier_trucks"):
- Has: unitNumber, truckType, status, year, make, model, orgId
- Map spec values directly: unitNumber "UNIT-QA-01", truckType "day_cab", year 2022, make "Kenworth", model "T680"

CarrierFacility (@@map "facilities"):
- Has: name, facilityType, addressLine1, city, state, zip, orgId
- Does NOT have: lumperRequired, appointmentRequired
- Ignore those fields. Just set name, facilityType, address fields.
- facilityType for spec's "shipper" → "shipper", "receiver" → "receiver"

CarrierClient (@@map "clients"):
- Has: name (not companyName), addressLine1, city, state, zip, status, orgId
- Does NOT have: billingAddressLine1, billingCity, billingState, billingZip, paymentTermsDays
- Map spec's companyName to `name`
- Map spec's billing_address_* to addressLine1, city, state, zip

Seed order (FK-safe):

**Tenant 1 — "QA Test Org" (slug: "qa-test-org"):**
1. Upsert Tenant by slug
2. Create 3 Supabase Auth users (owner@test.com, manager@test.com, driver@test.com) with password "TestPass123!" and email_confirm: true. For idempotency: call supabaseAdmin.auth.admin.createUser(), if error.message includes "already" then look up existing user via supabaseAdmin.auth.admin.listUsers({ filter: email }). Extract the Auth user UUID.
3. Set app_metadata on each Auth user: { role: "OWNER"/"MANAGER"/"DRIVER", tenantId: tenantId }
4. Create DB User records (check by email + tenantId first). Use the Auth UUID as the User.id.
5. Create CarrierDriver linked to driver@test.com's User.id (check by userId). Set firstName: "QA", lastName: "Driver", payModel: "per_mile", payRate: "0.52", cdlClass: "A", cdlExpiry: 2 years from now, status: "active".
6. Create CarrierTruck (check by unitNumber + orgId)
7. Create 2 CarrierFacility records (check by name + orgId)

**Tenant 2 — "QA Test Org B" (slug: "qa-test-org-b"):**
1. Upsert Tenant by slug
2. Create 1 Supabase Auth user (owner_b@test.com) with same pattern
3. Create DB User record
4. Create CarrierClient (check by name + orgId)

Print summary: `\n=== Summary ===\n  Created: ${created}\n  Skipped: ${skipped}\nDone.`

Use Decimal strings for all Prisma Decimal fields (e.g., "0.52").
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit scripts/seed-qa-accounts.ts` or compile check via the project's tsconfig.
    Visually confirm: script has correct imports, idempotency checks for every record, proper error handling, summary output.
  </verify>
  <done>
    Script exists at apps/web/scripts/seed-qa-accounts.ts. It compiles without type errors. It creates 2 tenants, 4 auth users, 4 DB users, 1 carrier driver, 1 carrier truck, 2 facilities, and 1 client — all idempotently with skip/create logging and a summary.
  </done>
</task>

</tasks>

<verification>
- File exists: `apps/web/scripts/seed-qa-accounts.ts`
- TypeScript compiles without errors
- Script follows same setup pattern as cleanup-test-tenants.ts (PrismaPg adapter, Supabase admin client, dotenv/config)
- All records have idempotency checks before creation
- Summary prints created/skipped counts
</verification>

<success_criteria>
- seed-qa-accounts.ts compiles cleanly
- Script is idempotent (safe to run multiple times)
- All specified test data is seeded for both tenants
</success_criteria>

<output>
After completion, create `.planning/quick/183-create-qa-seed-script-for-carrier-operat/183-SUMMARY.md`
</output>
