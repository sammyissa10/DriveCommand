---
phase: quick
plan: 365
type: execute
wave: 1
depends_on: [quick-358, quick-359]
autonomous: true
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave2_fleet_audit_columns/migration.sql
  - .planning/quick/365-tkt-0015-prompt-2b-wave-2-apply-audit-co/365-WAVE2-REPORT.md

must_haves:
  truths:
    - "Each of the 11 fleet-domain models has the audit FK columns expected for that model: 9 snake_case carrier tables get created_by_id + updated_by_id, Document gets createdById + updatedById alongside its existing uploadedBy, FleetMessage gets createdById ONLY (no updatedById — immutable)."
    - "All new columns are nullable UUID and reference User.id with ON DELETE SET NULL."
    - "Every new Prisma User-side back-relation is named uniquely (e.g. CarrierClientCreatedBy, FleetMessageCreatedBy) so prisma validate passes."
    - "Document.uploadedBy / uploader relation is preserved unchanged — only the new createdById/updatedById pair is added alongside it."
    - "FleetMessage receives only createdById + createdBy relation. No updatedById is added to schema or DB."
    - "withAuditColumns extension already handles FleetMessage as CREATE_ONLY — no extension code changes are required in this wave."
    - "withAuditColumns auto-injects createdById/updatedById on writes to all 11 models when a session userId is forwarded (verified by isolation test on at least one snake_case + one camelCase + FleetMessage)."
    - "Migration is created with --create-only, reviewed, then applied via Supabase MCP execute_sql (NOT prisma migrate deploy)."
    - "npx tsc --noEmit from apps/web exits 0 after schema regen."
    - "Truck, Route, Load, Invoice, PayrollRecord, Tag, ExpenseCategory are NOT touched by this wave."
    - "Wave 2 STOPS after verification report — no Wave 3 work is started."
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "11 models gain createdById/updatedById fields + named User back-relations; User model gains 21 reverse relation arrays."
      contains: "name: \"CarrierClientCreatedBy\""
    - path: "apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave2_fleet_audit_columns/migration.sql"
      provides: "DDL adding audit columns + FK constraints to 11 fleet tables."
    - path: ".planning/quick/365-tkt-0015-prompt-2b-wave-2-apply-audit-co/365-WAVE2-REPORT.md"
      provides: "Verification report: migration SQL, column confirmations, FleetMessage createdById-only confirmation, tsc result, isolation test results, commit SHA."
  key_links:
    - from: "apps/web/prisma/schema.prisma (all 11 carrier/Document/FleetMessage models)"
      to: "User.id"
      via: "createdById/updatedById FK with onDelete: SetNull"
      pattern: "@relation\\(name: \"(Carrier|Document|FleetMessage)\\w+(Created|Updated)By\""
    - from: "apps/web/prisma/schema.prisma (User model)"
      to: "11 fleet models"
      via: "21 reverse-relation arrays using matching named relations"
      pattern: "@relation\\(name: \"(Carrier|Document|FleetMessage)\\w+(Created|Updated)By\"\\)"
    - from: "apps/web/src/lib/db/extensions/audit-columns.ts (existing, unchanged)"
      to: "Prisma $allOperations on each new model"
      via: "createdById/updatedById injection on create/update/upsert; FleetMessage already in CREATE_ONLY_AUDIT_MODELS"
      pattern: "CREATE_ONLY_AUDIT_MODELS"
---

<objective>
Wave 2 of TKT-0015 Prompt 2b: add nullable audit FK columns (createdById/updatedById, snake_case @map'd for carrier models) to the 11 fleet-domain tables listed below. Wave 1 (QT 358) shipped Tag + ExpenseCategory and the withAuditColumns Prisma extension; QT 359 fixed getTenantPrisma() to forward session userId. This wave rolls the proven pattern across the carrier-operations + fleet messaging surface.

Purpose: Every fleet-domain write (creating a CarrierLoad, updating a CarrierDispatch, sending a FleetMessage, uploading a Document) must now carry a who-created / who-last-updated identity so the audit-trail consumer in Prompt 3 (auto-capture middleware) and Prompt 4 (detail-page UI) have data to surface.

Output: schema edits, one atomic migration applied via Supabase MCP, a single commit, and a `365-WAVE2-REPORT.md` documenting verifications. Then STOP — do NOT proceed to Wave 3.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/358-tkt-0015-prompt-2b-add-created-by-id-upd/358-PLAN.md
@.planning/quick/358-tkt-0015-prompt-2b-add-created-by-id-upd/358-WAVE1-REPORT.md
@.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md
@apps/web/prisma/schema.prisma
@apps/web/src/lib/db/extensions/audit-columns.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/context/tenant-context.ts
</context>

<global_constraints>

**Locked decisions (do NOT revisit — inherited from QT 358):**
- Nullable columns only. NO `NOT NULL`. NO historical backfill.
- ON DELETE SET NULL on every audit FK.
- snake_case @map for carrier models: Prisma fields `createdById` / `updatedById` with `@map("created_by_id")` / `@map("updated_by_id")`.
- camelCase models (Document, FleetMessage): plain `createdById` / `updatedById` field names (no `@map`).
- Named User relations. Every new audit FK must use a unique `name:` argument on `@relation`. User model must receive matching reverse-relation arrays.
- FleetMessage: `createdById` ONLY. No `updatedById`. Messages are immutable.
- Document: PRESERVE existing `uploadedBy` (NOT NULL) + `uploader` relation. ADD `createdById` + `updatedById` alongside.

**Out of scope — DO NOT TOUCH:**
- Truck, Route, Load, Invoice, PayrollRecord (already have full audit FKs).
- Tag, ExpenseCategory (Wave 1, already migrated).
- Tenant, User, audit-only/append-only models.
- `apps/web/src/lib/db/extensions/audit-columns.ts` — FleetMessage is already in `CREATE_ONLY_AUDIT_MODELS`. No extension edits are needed in this wave. If you find yourself wanting to edit it, STOP and re-read.
- `apps/web/src/lib/db/extensions/tenant-rls.ts`.
- `apps/web/src/lib/db/tenant-client.ts`, `apps/web/src/lib/context/tenant-context.ts` (already wired in QT 358/359).
- UI, API routes, server actions, business logic — Prompt 3 will wire auto-capture, Prompt 4 will surface in UI.
- Any model not in the 11-table list below.

**Forbidden tokens in the diff:**
- `as any`
- `@ts-ignore` / `@ts-expect-error`
- `eslint-disable`

**Migration policy:**
- Generate the migration with `npx prisma migrate dev --name tkt0015_2b_wave2_fleet_audit_columns --create-only` from `apps/web/` so Prisma writes both the migration directory and the SQL file but does NOT apply it.
- Review and (if needed) tighten the generated SQL — replace bare `ALTER TABLE ... ADD COLUMN` lines with `ADD COLUMN IF NOT EXISTS`, wrap each `ADD CONSTRAINT` in the standard `DO $$ IF NOT EXISTS ... END $$` guard to make the migration idempotent. Confirm every FK has `ON DELETE SET NULL`.
- Apply the migration via Supabase MCP `execute_sql` (or `apply_migration` if available) — DO NOT run `prisma migrate deploy`. The auto-deploy hook is fine for normal flows but we're applying create-only SQL directly here per the planning_context constraint.
- After apply: run `npx prisma generate` from `apps/web/` to refresh the client.

**Verification gates (mandatory; fail any → fix or revert before commit):**
1. `npx prisma validate` from `apps/web/` exits 0.
2. `npx prisma generate` from `apps/web/` exits 0.
3. `npx tsc --noEmit` from `apps/web/` exits 0. If any pre-existing site fails because the new fields make an action's response shape slightly different, widen the local type inline (`| null` on the failing field) — do NOT introduce `as any`. Type widening matching the QT 357 pattern is acceptable.
4. Live DB check via Supabase MCP for column existence:
   ```sql
   SELECT table_name, column_name, is_nullable, data_type
   FROM information_schema.columns
   WHERE (table_name IN ('clients','contracts','facilities','carrier_drivers','carrier_trucks',
                         'dispatches','stops','loads','carrier_expenses')
          AND column_name IN ('created_by_id','updated_by_id'))
      OR (table_name = 'Document' AND column_name IN ('createdById','updatedById'))
      OR (table_name = 'FleetMessage' AND column_name IN ('createdById','updatedById'))
   ORDER BY table_name, column_name;
   ```
   Expected: **21 rows total** — 9 snake_case tables × 2 cols = 18 + Document × 2 = 20 + FleetMessage × 1 = 21. All `is_nullable = YES`, `data_type = uuid`. The query must NOT return any `updatedById` row for `FleetMessage` (proves the create-only carve-out is honored at the DB layer).
5. Live DB check for FK delete_rule:
   ```sql
   SELECT tc.table_name, tc.constraint_name, rc.delete_rule
   FROM information_schema.table_constraints tc
   JOIN information_schema.referential_constraints rc USING (constraint_name)
   WHERE tc.table_name IN ('clients','contracts','facilities','carrier_drivers','carrier_trucks',
                            'dispatches','stops','loads','carrier_expenses','Document','FleetMessage')
     AND (tc.constraint_name LIKE '%created_by_id_fkey'
       OR tc.constraint_name LIKE '%updated_by_id_fkey'
       OR tc.constraint_name LIKE '%createdById_fkey'
       OR tc.constraint_name LIKE '%updatedById_fkey')
   ORDER BY tc.table_name, tc.constraint_name;
   ```
   Expected: **21 constraints**, all `delete_rule = 'SET NULL'`.
6. Isolation tests — at minimum the 3 spot checks described in Step 5 below (one snake_case write, one camelCase write, one FleetMessage write).

</global_constraints>

<tasks>

<task type="auto">
  <name>Task 1 — Schema + migration for 11 fleet models, apply via Supabase MCP</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/&lt;timestamp&gt;_tkt0015_2b_wave2_fleet_audit_columns/migration.sql
  </files>
  <action>
    Goal: Add nullable audit FKs to all 11 fleet-domain tables, generate the create-only migration, apply it via Supabase MCP, regenerate the Prisma client, and confirm prisma validate / generate / tsc all stay green.

    **Tables in scope (11 total) — exact pattern per row:**

    | Prisma Model | DB Table | Casing | Add | Relation Names |
    |---|---|---|---|---|
    | CarrierClient | clients | snake_case | created_by_id + updated_by_id | CarrierClientCreatedBy / CarrierClientUpdatedBy |
    | CarrierContract | contracts | snake_case | created_by_id + updated_by_id | CarrierContractCreatedBy / CarrierContractUpdatedBy |
    | CarrierFacility | facilities | snake_case | created_by_id + updated_by_id | CarrierFacilityCreatedBy / CarrierFacilityUpdatedBy |
    | CarrierDriver | carrier_drivers | snake_case | created_by_id + updated_by_id | CarrierDriverCreatedBy / CarrierDriverUpdatedBy |
    | CarrierTruck | carrier_trucks | snake_case | created_by_id + updated_by_id | CarrierTruckCreatedBy / CarrierTruckUpdatedBy |
    | CarrierDispatch | dispatches | snake_case | created_by_id + updated_by_id | CarrierDispatchCreatedBy / CarrierDispatchUpdatedBy |
    | CarrierLoad | loads | snake_case | created_by_id + updated_by_id | CarrierLoadCreatedBy / CarrierLoadUpdatedBy |
    | CarrierStop | stops | snake_case | created_by_id + updated_by_id | CarrierStopCreatedBy / CarrierStopUpdatedBy |
    | CarrierExpense | carrier_expenses | snake_case | created_by_id + updated_by_id | CarrierExpenseCreatedBy / CarrierExpenseUpdatedBy |
    | Document | Document | camelCase | createdById + updatedById (KEEP uploadedBy) | DocumentCreatedBy / DocumentUpdatedBy |
    | FleetMessage | FleetMessage | camelCase | createdById ONLY (no updatedById) | FleetMessageCreatedBy |

    **Step 1 — Confirm baseline before editing:**

    Verify the schema does NOT already contain `createdById` on any of these 11 models. Read each model in `apps/web/prisma/schema.prisma` at these approximate line numbers and confirm absence of `createdById`/`created_by_id`:
    - Document: line ~470
    - FleetMessage: line ~1300
    - CarrierClient: line ~1722
    - CarrierContract: line ~1764
    - CarrierFacility: line ~1802
    - CarrierDriver: line ~1835
    - CarrierTruck: line ~1885
    - CarrierDispatch: line ~1986
    - CarrierLoad: line ~2031
    - CarrierStop: line ~2090
    - CarrierExpense: line ~2197

    If any already has audit FKs, STOP and report — do not proceed.

    **Step 2 — schema.prisma edits — snake_case carrier models (9 models):**

    For each snake_case model, add the audit fields immediately before the existing `createdAt` line, and add the two named relations in the relations block. Example for CarrierClient (line ~1722):

    ```prisma
    model CarrierClient {
      id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      orgId          String   @map("org_id") @db.Uuid
      // ... existing fields unchanged ...
      notes          String?
      createdById    String?  @map("created_by_id") @db.Uuid    // NEW (Wave 2)
      updatedById    String?  @map("updated_by_id") @db.Uuid    // NEW (Wave 2)
      createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
      updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

      tenant           Tenant            @relation(fields: [orgId], references: [id])
      createdBy        User?             @relation(name: "CarrierClientCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)  // NEW
      updatedBy        User?             @relation(name: "CarrierClientUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)  // NEW
      // ... existing relations unchanged ...
    }
    ```

    Apply this exact pattern to the other 8 snake_case carrier models. Use these unique relation name pairs:
    - CarrierContractCreatedBy / CarrierContractUpdatedBy
    - CarrierFacilityCreatedBy / CarrierFacilityUpdatedBy
    - CarrierDriverCreatedBy / CarrierDriverUpdatedBy
    - CarrierTruckCreatedBy / CarrierTruckUpdatedBy
    - CarrierDispatchCreatedBy / CarrierDispatchUpdatedBy
    - CarrierLoadCreatedBy / CarrierLoadUpdatedBy
    - CarrierStopCreatedBy / CarrierStopUpdatedBy
    - CarrierExpenseCreatedBy / CarrierExpenseUpdatedBy

    **Step 3 — schema.prisma edits — Document (camelCase, KEEP uploadedBy):**

    At Document (line ~470) — add `createdById` + `updatedById` + `createdBy` + `updatedBy` alongside the existing `uploadedBy` + `uploader`. The existing `uploadedBy String @db.Uuid` field and its `uploader User @relation(fields: [uploadedBy], references: [id])` line MUST be preserved exactly:

    ```prisma
    model Document {
      id           String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      // ... existing fields up to and including uploadedBy ...
      uploadedBy   String        @db.Uuid       // PRESERVE — not touched
      // ... existing fields ...
      createdById  String?       @db.Uuid                       // NEW (Wave 2)
      updatedById  String?       @db.Uuid                       // NEW (Wave 2)
      createdAt    DateTime      @default(now()) @db.Timestamptz
      updatedAt    DateTime      @updatedAt @db.Timestamptz

      tenant   Tenant @relation(fields: [tenantId], references: [id])
      // ... existing relations unchanged including:
      uploader User   @relation(fields: [uploadedBy], references: [id])      // PRESERVE
      createdBy User? @relation(name: "DocumentCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)    // NEW
      updatedBy User? @relation(name: "DocumentUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)    // NEW

      // ... existing indexes ...
    }
    ```

    **Step 4 — schema.prisma edits — FleetMessage (camelCase, CREATED-BY ONLY):**

    At FleetMessage (line ~1300) — add `createdById` + `createdBy` ONLY. Do NOT add `updatedById`. Preserve existing `senderId` + sender relation (currently FleetMessage has no `sender` relation in Prisma but the `senderId` field exists — leave it as-is):

    ```prisma
    model FleetMessage {
      id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      // ... existing fields ...
      senderId    String    @db.Uuid       // PRESERVE
      // ... existing fields ...
      readAt      DateTime? @db.Timestamptz
      createdById String?   @db.Uuid       // NEW (Wave 2 — createdById ONLY)
      createdAt   DateTime  @default(now()) @db.Timestamptz

      stopId   String? @map("stop_id") @db.Uuid
      audioUrl String? @map("audio_url")

      dispatch  CarrierDispatch? @relation(fields: [dispatchId], references: [id], onDelete: SetNull)
      stop      CarrierStop?     @relation(fields: [stopId], references: [id], onDelete: SetNull)
      createdBy User?            @relation(name: "FleetMessageCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)    // NEW

      // ... existing indexes ...
    }
    ```

    **Step 5 — User model — add 21 reverse-relation arrays:**

    Locate the existing TKT-0015 Wave 1 reverse-relation block in the `User` model (currently ends around line 316 with `expenseCategoriesUpdated ExpenseCategory[] @relation(name: "ExpenseCategoryUpdatedBy")`). Add a new comment-delimited block immediately after it:

    ```prisma
      // TKT-0015 Prompt 2b — Wave 2 reverse relations (fleet domain)
      carrierClientsCreated    CarrierClient[]    @relation(name: "CarrierClientCreatedBy")
      carrierClientsUpdated    CarrierClient[]    @relation(name: "CarrierClientUpdatedBy")
      carrierContractsCreated  CarrierContract[]  @relation(name: "CarrierContractCreatedBy")
      carrierContractsUpdated  CarrierContract[]  @relation(name: "CarrierContractUpdatedBy")
      carrierFacilitiesCreated CarrierFacility[]  @relation(name: "CarrierFacilityCreatedBy")
      carrierFacilitiesUpdated CarrierFacility[]  @relation(name: "CarrierFacilityUpdatedBy")
      carrierDriversCreated    CarrierDriver[]    @relation(name: "CarrierDriverCreatedBy")
      carrierDriversUpdated    CarrierDriver[]    @relation(name: "CarrierDriverUpdatedBy")
      carrierTrucksCreated     CarrierTruck[]     @relation(name: "CarrierTruckCreatedBy")
      carrierTrucksUpdated     CarrierTruck[]     @relation(name: "CarrierTruckUpdatedBy")
      carrierDispatchesCreated CarrierDispatch[]  @relation(name: "CarrierDispatchCreatedBy")
      carrierDispatchesUpdated CarrierDispatch[]  @relation(name: "CarrierDispatchUpdatedBy")
      carrierLoadsCreated      CarrierLoad[]      @relation(name: "CarrierLoadCreatedBy")
      carrierLoadsUpdated      CarrierLoad[]      @relation(name: "CarrierLoadUpdatedBy")
      carrierStopsCreated      CarrierStop[]      @relation(name: "CarrierStopCreatedBy")
      carrierStopsUpdated      CarrierStop[]      @relation(name: "CarrierStopUpdatedBy")
      carrierExpensesCreated   CarrierExpense[]   @relation(name: "CarrierExpenseCreatedBy")
      carrierExpensesUpdated   CarrierExpense[]   @relation(name: "CarrierExpenseUpdatedBy")
      documentsCreated         Document[]         @relation(name: "DocumentCreatedBy")
      documentsUpdated         Document[]         @relation(name: "DocumentUpdatedBy")
      fleetMessagesCreated     FleetMessage[]     @relation(name: "FleetMessageCreatedBy")
    ```

    That is exactly 21 arrays: 9 × 2 (carrier) + 2 (Document) + 1 (FleetMessage) = 21.

    Run `cd apps/web && npx prisma validate`. Must exit 0. If it fails on relation-name collisions, double-check that every `@relation(name: "...")` string is unique across the entire schema.

    **Step 6 — Generate the create-only migration:**

    From `apps/web/`:
    ```
    npx prisma migrate dev --name tkt0015_2b_wave2_fleet_audit_columns --create-only
    ```

    This creates `apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave2_fleet_audit_columns/migration.sql` with the raw DDL Prisma generated.

    **Step 7 — Harden the migration SQL for idempotency + correct delete rules:**

    Open the new migration.sql. The generated SQL will be a series of `ALTER TABLE ... ADD COLUMN` + `ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES "User"(id) ON DELETE SET NULL` blocks. Edit it so every block follows this idempotent pattern (example for `clients`):

    ```sql
    -- TKT-0015 Prompt 2b — Wave 2: fleet domain audit columns
    -- Tables: clients, contracts, facilities, carrier_drivers, carrier_trucks,
    --         dispatches, loads, stops, carrier_expenses, Document, FleetMessage
    -- All FKs: ON DELETE SET NULL. All columns nullable.

    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "updated_by_id" UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'clients_created_by_id_fkey' AND table_name = 'clients'
      ) THEN
        ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_fkey"
          FOREIGN KEY ("created_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'clients_updated_by_id_fkey' AND table_name = 'clients'
      ) THEN
        ALTER TABLE "clients" ADD CONSTRAINT "clients_updated_by_id_fkey"
          FOREIGN KEY ("updated_by_id") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;
    END $$;
    ```

    Repeat the pattern for all 9 snake_case tables. Constraint names follow the pattern `<table>_<column>_fkey`:
    - clients_created_by_id_fkey, clients_updated_by_id_fkey
    - contracts_created_by_id_fkey, contracts_updated_by_id_fkey
    - facilities_created_by_id_fkey, facilities_updated_by_id_fkey
    - carrier_drivers_created_by_id_fkey, carrier_drivers_updated_by_id_fkey
    - carrier_trucks_created_by_id_fkey, carrier_trucks_updated_by_id_fkey
    - dispatches_created_by_id_fkey, dispatches_updated_by_id_fkey
    - loads_created_by_id_fkey, loads_updated_by_id_fkey
    - stops_created_by_id_fkey, stops_updated_by_id_fkey
    - carrier_expenses_created_by_id_fkey, carrier_expenses_updated_by_id_fkey

    For Document (camelCase) — both columns + FKs:
    ```sql
    ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "createdById" UUID;
    ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Document_createdById_fkey' AND table_name = 'Document'
      ) THEN
        ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Document_updatedById_fkey' AND table_name = 'Document'
      ) THEN
        ALTER TABLE "Document" ADD CONSTRAINT "Document_updatedById_fkey"
          FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;
    END $$;
    ```

    For FleetMessage (camelCase, CREATED ONLY — one column, one FK only):
    ```sql
    ALTER TABLE "FleetMessage" ADD COLUMN IF NOT EXISTS "createdById" UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FleetMessage_createdById_fkey' AND table_name = 'FleetMessage'
      ) THEN
        ALTER TABLE "FleetMessage" ADD CONSTRAINT "FleetMessage_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;
    END $$;
    ```

    **CRITICAL — do NOT add `updatedById` for FleetMessage anywhere** (not in schema.prisma, not in the SQL).

    **Step 8 — Apply the migration via Supabase MCP:**

    Read the hardened migration.sql file. Apply it as a single SQL block via Supabase MCP `execute_sql` (preferred) or `apply_migration` if available. Capture the response.

    DO NOT run `npx prisma migrate deploy`. The auto-deploy hook should not fire for create-only — but verify by checking that `_prisma_migrations` rows are not duplicated.

    **Step 9 — Regenerate Prisma client and verify:**

    From `apps/web/`:
    - `npx prisma generate` → must exit 0
    - `npx tsc --noEmit` → must exit 0

    If `tsc` fails because a server action's input/output type narrowed, widen the specific field inline (e.g. add `| null` to a return-shape property). Do NOT use `as any`, `@ts-ignore`, or `eslint-disable`. If a widening is needed, document the exact file:line in the wave report.

    **Step 10 — Isolation tests (lightweight spot checks):**

    Run **at least three** of these spot checks. Each is a one-off ad-hoc Prisma call (NOT a permanent test file) executed in a tiny throwaway script (`node -e ...` from `apps/web/` is fine, or via the existing tenant-isolation test harness if available). Use a real `tenantId` + `userId` from the dev DB.

    For each check:
    a) Create one record via `createTenantClient(tenantId, userId).<model>.create({ data: { ...minimum required fields... } })`.
    b) Re-read the record and confirm `createdById === userId` (and `updatedById === userId` for non-FleetMessage models, or absent for FleetMessage).

    **Required spot checks:**
    - **CarrierClient** (snake_case): create a client, confirm `created_by_id` and `updated_by_id` are populated.
    - **Document** (camelCase): create a Document row, confirm both `createdById` and `updatedById` are populated AND `uploadedBy` accepts the existing required value.
    - **FleetMessage** (camelCase, create-only): create a FleetMessage row, confirm `createdById` is populated. Then attempt an `update({ where: {id}, data: {body: 'edited'}})` — confirm that NO `updatedById` is injected (because FleetMessage is in `CREATE_ONLY_AUDIT_MODELS` and the column does not exist).

    If the FleetMessage update spot check fails (extension tries to inject `updatedById` and the DB rejects the unknown column), that means the extension is malfunctioning — STOP and report. Do NOT edit the extension; instead capture the failure and surface it as a blocker. Note: based on the Wave 1 extension code, `CREATE_ONLY_AUDIT_MODELS` already includes FleetMessage, so this should pass cleanly.

    Clean up the test rows after the spot checks (delete by id).

    **Step 11 — Live-DB column + FK verification via Supabase MCP:**

    Run the two SQL queries from `<global_constraints>` Verification gate 4 and 5. Capture the row counts:
    - Column query: **must return 21 rows**, all `is_nullable = YES`, `data_type = uuid`. FleetMessage must appear with `createdById` only (no `updatedById` row).
    - FK query: **must return 21 constraints**, all `delete_rule = 'SET NULL'`.

    If the row counts differ, STOP and report.

    **Step 12 — Write 365-WAVE2-REPORT.md:**

    Create `.planning/quick/365-tkt-0015-prompt-2b-wave-2-apply-audit-co/365-WAVE2-REPORT.md` with sections:
    - **Migration SQL** — full final migration.sql contents (post-hardening).
    - **Schema changes** — summary of 11 model edits + 21 User reverse-relations.
    - **Live DB verification** — the 21-row column query output, the 21-row FK query output.
    - **FleetMessage createdById-only confirmation** — explicit single-line note: "Confirmed: FleetMessage has createdById, has NO updatedById in schema.prisma or live DB."
    - **Document.uploadedBy preservation** — explicit single-line note: "Confirmed: Document.uploadedBy + uploader relation preserved unchanged; createdById/updatedById added alongside."
    - **Verification results** — tsc/validate/generate exit codes.
    - **Isolation test results** — the 3 spot-check outputs (created record IDs, observed audit columns).
    - **TypeScript widenings (if any)** — file:line + before/after, or "none required".
    - **Files modified** — exact paths.
    - **Commit SHA** — once committed.
    - **Tables NOT touched in this wave** — explicit list confirming Truck/Route/Load/Invoice/PayrollRecord/Tag/ExpenseCategory and all Wave 3+ tables.

    **Step 13 — Commit and push:**

    Stage and commit ONLY these paths:
    - `apps/web/prisma/schema.prisma`
    - `apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave2_fleet_audit_columns/migration.sql`
    - `apps/web/src/generated/prisma/**` (regenerated client, if tracked in your repo — check `.gitignore`)
    - `.planning/quick/365-tkt-0015-prompt-2b-wave-2-apply-audit-co/365-WAVE2-REPORT.md`
    - any inline tsc widenings under `apps/web/src/actions/` etc. (only if applied)

    Commit message:
    ```
    feat(quick-365): TKT-0015 Prompt 2b Wave 2 — fleet domain audit FKs (11 tables)
    ```

    Then `git push origin master` to keep GitHub in sync.

    **Step 14 — STOP.**

    Do NOT proceed to Wave 3 (finance/CRM/compliance). The final-line requirement for executor output is exactly:

    ```
    Wave 2 complete — stopping. Do not start Wave 3.
    ```
  </action>
  <verify>
    1. `cd apps/web && npx prisma validate` → exit 0
    2. `cd apps/web && npx prisma generate` → exit 0
    3. `cd apps/web && npx tsc --noEmit` → exit 0
    4. Column query (Verification gate 4) returns exactly 21 rows, all is_nullable=YES, data_type=uuid, no FleetMessage.updatedById row present.
    5. FK query (Verification gate 5) returns exactly 21 constraints, all delete_rule=SET NULL.
    6. The 3 isolation spot checks (CarrierClient, Document, FleetMessage) all confirm correct audit-column population (and FleetMessage update does NOT attempt updatedById injection).
    7. `git log --oneline -1` shows `feat(quick-365): TKT-0015 Prompt 2b Wave 2 — fleet domain audit FKs (11 tables)`.
    8. `git diff HEAD~1 HEAD -- apps/web/src/lib/db/extensions/` returns empty (extension untouched).
    9. `git diff HEAD~1 HEAD -- apps/web/prisma/schema.prisma | grep -E "model (Truck|Route|Load|Invoice|PayrollRecord|Tag|ExpenseCategory) "` returns empty (no wave 1 / pre-358 tables touched).
    10. `.planning/quick/365-tkt-0015-prompt-2b-wave-2-apply-audit-co/365-WAVE2-REPORT.md` exists with all required sections including explicit FleetMessage and Document confirmations.
    11. Forbidden-token check: `git diff HEAD~1 HEAD -- apps/web | grep -E "as any|@ts-ignore|@ts-expect-error|eslint-disable"` returns empty.
    12. Final executor output line is exactly: `Wave 2 complete — stopping. Do not start Wave 3.`
  </verify>
  <done>
    All 11 fleet-domain models carry the correct audit FK columns in both schema.prisma and live DB. Document.uploadedBy preserved. FleetMessage carries createdById ONLY. Extension untouched. Migration applied via Supabase MCP (not prisma migrate deploy). Wave 2 report written. Commit landed and pushed. Stopped.
  </done>
</task>

</tasks>

<verification>

**End-to-end wave verification (re-stated for clarity):**

1. **Schema completeness** — `grep -c "createdBy.*User?.*@relation" apps/web/prisma/schema.prisma` increases by 11 (10 createdBy + 1 FleetMessage createdBy). `grep -c "updatedBy.*User?.*@relation" apps/web/prisma/schema.prisma` increases by 10 (FleetMessage gets no updatedBy).
2. **User reverse-relations** — `grep -c "@relation(name: \"Carrier" apps/web/prisma/schema.prisma` increases by 18; `@relation(name: "Document` by 2; `@relation(name: "FleetMessage` by 1.
3. **Extension untouched** — `audit-columns.ts` byte-identical to its Wave 1 state.
4. **Tenant-client untouched** — `tenant-client.ts` byte-identical to its QT 359 state (already passes userId).
5. **No prisma migrate deploy** — confirm migration was applied via Supabase MCP only; check `_prisma_migrations` table has exactly one row for `tkt0015_2b_wave2_fleet_audit_columns`.
6. **No untouched-files violation** — verify the commit diff does NOT include UI, API, server actions (unless a single targeted tsc widening was needed and is documented in the report).

</verification>

<success_criteria>

- 11 fleet-domain tables carry nullable `created_by_id`/`updated_by_id` (carrier) or `createdById`/`updatedById` (Document, FleetMessage) FK columns referencing `User.id` with `ON DELETE SET NULL`.
- FleetMessage has `createdById` ONLY — no `updatedById` in schema or DB.
- Document retains its existing `uploadedBy String @db.Uuid` (NOT NULL) and `uploader User` relation.
- User model carries 21 new named reverse-relation arrays.
- Migration generated via `--create-only`, hardened for idempotency, applied via Supabase MCP `execute_sql`/`apply_migration` (NOT `prisma migrate deploy`).
- `npx tsc --noEmit` from `apps/web/` exits 0.
- 3 isolation spot checks pass (CarrierClient + Document + FleetMessage), proving auto-injection works for snake_case, camelCase-full, and camelCase-create-only models.
- 21 columns present in DB column inventory query, all nullable, uuid.
- 21 FK constraints present in DB constraint query, all SET NULL.
- Audit-columns extension and tenant-client and tenant-rls extension files are byte-identical to their pre-365 state.
- Commit `feat(quick-365): TKT-0015 Prompt 2b Wave 2 — fleet domain audit FKs (11 tables)` exists; pushed to origin/master.
- `365-WAVE2-REPORT.md` exists with all required sections.
- Final executor output line: `Wave 2 complete — stopping. Do not start Wave 3.`

</success_criteria>

<output>
After Wave 2 completes (all verifications green, commit landed, push done), the wave report MUST exist at:
`.planning/quick/365-tkt-0015-prompt-2b-wave-2-apply-audit-co/365-WAVE2-REPORT.md`

Final executor output line MUST be exactly:
```
Wave 2 complete — stopping. Do not start Wave 3.
```
</output>
