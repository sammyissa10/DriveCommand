---
phase: quick-492
plan: 492
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260722000004_add_client_contacts/migration.sql
  - apps/web/prisma/migrations/20260722000005_backfill_client_contacts/migration.sql
  - apps/web/prisma/schema.prisma
  - apps/web/src/lib/carrier/client-contacts.ts
  - apps/web/src/lib/carrier/clients.ts
  - apps/web/src/lib/carrier/notifications.ts
  - apps/web/src/app/api/v1/carrier/clients/route.ts
  - apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
  - apps/web/src/components/carrier/clients/ClientForm.tsx
  - apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
  - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetailMobile.tsx
  - apps/web/src/app/(owner)/carrier/clients/page.tsx
  - apps/web/src/app/(owner)/carrier/clients/ClientsMobile.tsx
  - apps/web/src/app/(owner)/carrier/clients/_grid/columns.tsx
  - apps/web/src/app/(owner)/carrier/clients/NewClientSheet.tsx
  - apps/web/src/app/(owner)/carrier/clients/new/ClientCreateMobile.tsx
  - apps/web/src/lib/carrier/__tests__/client-contacts.test.ts
autonomous: true

must_haves:
  truths:
    - "Each client can have zero, one, or many contacts (name, role, phone, email, isMain)"
    - "When any contacts exist, exactly one is flagged isMain; DB rejects two mains on one client"
    - "Every existing client with legacy contact data gets one migrated isMain contact"
    - "New Client form and client detail let the user add/remove contacts and pick the main one"
    - "The customer-email path reads the main contact's email (falling back to the legacy client.email)"
    - "tsc --noEmit passes; client pages render for clients with 0, 1, and many contacts"
  artifacts:
    - path: "apps/web/prisma/migrations/20260722000004_add_client_contacts/migration.sql"
      provides: "client_contacts table + RLS + app_user GRANT + partial unique index"
      contains: "CREATE TABLE client_contacts"
    - path: "apps/web/prisma/migrations/20260722000005_backfill_client_contacts/migration.sql"
      provides: "Data migration: legacy primary contact -> isMain contact row"
      contains: "INSERT INTO client_contacts"
    - path: "apps/web/src/lib/carrier/client-contacts.ts"
      provides: "getMainContact + normalizeContacts (exactly-one-main) + mapLegacyPrimaryContact pure helpers"
    - path: "apps/web/src/lib/carrier/__tests__/client-contacts.test.ts"
      provides: "Tests: backfill mapping, exactly-one-main, main-contact read path"
  key_links:
    - from: "apps/web/src/lib/carrier/notifications.ts"
      to: "client.contacts (isMain)"
      via: "getMainContact() with client.email fallback"
      pattern: "getMainContact"
    - from: "apps/web/src/app/api/v1/carrier/clients/route.ts"
      to: "normalizeContacts()"
      via: "POST/PATCH contacts payload"
      pattern: "normalizeContacts"
---

<objective>
Add a one-to-many "contacts" relation to the carrier client entity so a client can have multiple contacts (name, role/title, phone, email) with exactly one flagged as the main contact. Backfill each existing client's legacy single primary-contact into the new table as its main contact, wire add/remove + main-selection UI into the New Client form and client detail screens, and switch the functional read path (customer emails) plus display surfaces to read the main contact from the relation (falling back to the legacy columns).

Purpose: Real carriers deal with several people per client (billing, dispatch, AP). The current single primaryContact/email/phone/website is too limited.
Output: `client_contacts` table + RLS + backfill, pure contact helpers, extended clients API, contacts UI on form + detail, switched read paths, and 3 tests.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Grounding facts discovered during planning — DO NOT re-discover

## The "client" entity
- Prisma model is **`CarrierClient`** (`apps/web/prisma/schema.prisma` line ~1892), mapped to table **`clients`** via `@@map("clients")`.
- Tenant column is **`orgId` / `org_id`** (`@db.Uuid`, FK to `Tenant.id`) — NOT `tenantId`. Every carrier sibling table uses `org_id`. This new child table MUST use `org_id` too (do NOT introduce a `tenantId` column — that would break consistency with its parent and siblings).
- Legacy single-contact fields on `CarrierClient`: `primaryContact` (`primary_contact`), `email`, `phone`, `website`. **Keep these columns in place** as a fallback — do NOT drop them.
- Soft-delete convention: `deletedAt`. Audit columns `createdById`/`updatedById` auto-populate via the tenant-client extension.

## Migration mechanics (CRITICAL)
- Raw-SQL migrations live at `apps/web/prisma/migrations/<timestamp>_<name>/migration.sql` (repo-root `migrations/` does NOT exist — ignore the task's "migrations/" path).
- Latest existing migration: `20260722000003_add_tenant_heard_about`. **Use `20260722000004_add_client_contacts` (DDL) and `20260722000005_backfill_client_contacts` (data).**
- Do NOT run `prisma migrate dev`. A repo hook auto-applies `prisma migrate deploy` when a `migration.sql` is written. If the hook does not fire, apply the raw SQL via the Supabase MCP `apply_migration` tool. Verify the table exists after (`SELECT` against `client_contacts` or list_tables).
- After editing `schema.prisma`, run `npx prisma generate` from `apps/web` (generated client lives at `apps/web/src/generated/prisma`, imported as `@/generated/prisma`).

## RLS pattern to copy (modern current_tenant_id pattern)
Reference: `apps/web/prisma/migrations/20260423100001_add_workflow_engine_foundation/migration.sql` (StepTemplate block) and `20260527000001_quick410_advisor_rls_fix` (carrier tables use `org_id = current_tenant_id()`).
- `getTenantPrisma()` (`apps/web/src/lib/context/tenant-context.ts`) sets `app.current_tenant_id` GUC; RLS reads it via `current_tenant_id()`.
- MEMORY HAZARD: a new FORCE-RLS table returns ZERO rows under the future app_user role unless GRANTed. The DDL migration MUST include `GRANT SELECT, INSERT, UPDATE, DELETE ON client_contacts TO app_user;` (matches `20260602000001_phase1_grant_app_user_dml`).
- `role` is FREE TEXT (title). No CHECK constraint needed — avoids the carrier CHECK-constraint drift hazard.

## Data access layer
- `apps/web/src/lib/carrier/clients.ts` — `listClients`, `getClient`, `createClient`, `updateClient`, `softDeleteClient`, all using `getTenantPrisma()` and passing `orgId` explicitly in `where`.
- API routes: `apps/web/src/app/api/v1/carrier/clients/route.ts` (GET list, POST create, Zod `ClientCreateSchema`) and `.../clients/[id]/route.ts` (GET, PATCH `ClientUpdateSchema`, DELETE soft-delete).

## READ-PATH INVENTORY — switch ALL of these to prefer the main contact (fallback = legacy columns)
1. FUNCTIONAL (must switch): `apps/web/src/lib/carrier/notifications.ts` — `load.client.email` at lines ~592, ~844, ~976, ~1113 (customer invoice/status emails). Add `contacts` to the `load.client` include and use `getMainContact(contacts)?.email ?? client.email`.
2. `apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx` (~L25 query, L45-48) — include `contacts`, pass to detail.
3. `apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx` (L272-275, L428-431) — desktop detail: render the contacts list (main highlighted) instead of only single fields.
4. `apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetailMobile.tsx` (L190-193, L264-267, L334-384) — mobile detail: contacts list + add/remove/main.
5. `apps/web/src/app/(owner)/carrier/clients/page.tsx` (L45), `ClientsMobile.tsx` (L109, L174), `_grid/columns.tsx` (L83) — list views showing `primaryContact`: show `mainContact.name ?? primaryContact`.
6. `apps/web/src/components/carrier/clients/ClientForm.tsx` — desktop New/Edit form (add contacts UI).
7. `apps/web/src/app/(owner)/carrier/clients/NewClientSheet.tsx` (L71,144) + `apps/web/src/app/(owner)/carrier/clients/new/ClientCreateMobile.tsx` — mobile create.
8. DO NOT TOUCH `apps/web/src/legacy/2026-05-20/components/carrier/clients/ClientList.tsx` (it lives under `/legacy/`).
- No dispatch/trip view reads client contact fields directly (only `notifications.ts` reads `client.email`). Still run a final grep for `\.client\.email` / `\.client\.primaryContact` to confirm nothing new slipped in.

## Test conventions
- Vitest, `environment: node`, pure-function unit tests (see `apps/web/src/lib/carrier/__tests__/dispatch-assigned-email.test.ts`). Run `npm test` from `apps/web`. Include glob covers `src/**/__tests__/**/*.test.ts`. Design tests against PURE helpers — no live DB.
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB migration + schema + backfill + backend read/write switch</name>
  <files>
    apps/web/prisma/migrations/20260722000004_add_client_contacts/migration.sql,
    apps/web/prisma/migrations/20260722000005_backfill_client_contacts/migration.sql,
    apps/web/prisma/schema.prisma,
    apps/web/src/lib/carrier/client-contacts.ts,
    apps/web/src/lib/carrier/clients.ts,
    apps/web/src/lib/carrier/notifications.ts,
    apps/web/src/app/api/v1/carrier/clients/route.ts,
    apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
  </files>
  <action>
**1a. DDL migration** `20260722000004_add_client_contacts/migration.sql` (raw SQL, idempotent). Follow the workflow-engine RLS style + carrier `org_id` naming:
```sql
CREATE TABLE IF NOT EXISTS client_contacts (
    id         UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id     UUID        NOT NULL,
    client_id  UUID        NOT NULL,
    name       TEXT        NOT NULL,
    role       TEXT,
    phone      TEXT,
    email      TEXT,
    is_main    BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT client_contacts_pkey PRIMARY KEY (id),
    CONSTRAINT client_contacts_org_id_fkey    FOREIGN KEY (org_id)    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT client_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id)   ON DELETE CASCADE   ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS client_contacts_org_id_idx    ON client_contacts (org_id);
CREATE INDEX IF NOT EXISTS client_contacts_client_id_idx ON client_contacts (client_id);
-- At most ONE main contact per client (DB guard). "Exactly one when any exist" is enforced in app layer.
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_one_main_per_client
  ON client_contacts (client_id) WHERE is_main = true;

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON client_contacts
  FOR ALL USING (org_id = current_tenant_id()) WITH CHECK (org_id = current_tenant_id());
CREATE POLICY bypass_rls_policy ON client_contacts
  FOR ALL USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

GRANT SELECT, INSERT, UPDATE, DELETE ON client_contacts TO app_user;
```
Wrap `CREATE POLICY` in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` guards so re-runs are safe.

**1b. Backfill migration** `20260722000005_backfill_client_contacts/migration.sql`: insert one isMain contact per client that has ANY legacy contact data. Idempotent (skip if the client already has contacts). `name` is NOT NULL, so fall back to the company `name` when `primary_contact` is blank:
```sql
INSERT INTO client_contacts (org_id, client_id, name, role, phone, email, is_main)
SELECT c.org_id, c.id,
       COALESCE(NULLIF(TRIM(c.primary_contact), ''), c.name),
       NULL, c.phone, c.email, true
FROM clients c
WHERE (NULLIF(TRIM(c.primary_contact), '') IS NOT NULL
       OR NULLIF(TRIM(c.email), '') IS NOT NULL
       OR NULLIF(TRIM(c.phone), '') IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id);
```
Clients with no legacy contact data get ZERO contacts (keeps it optional).

**1c. schema.prisma**: add model `CarrierClientContact` with `@@map("client_contacts")`, fields mapped exactly (`orgId @map("org_id")`, `clientId @map("client_id")`, `role`, `phone`, `email`, `isMain @map("is_main")`, timestamps), relations `tenant Tenant @relation(...)` and `client CarrierClient @relation(fields: [clientId], references: [id], onDelete: Cascade)`, plus `@@index([orgId])` and `@@index([clientId])`. Add `contacts CarrierClientContact[]` to `CarrierClient`, and a back-relation on `Tenant` if the Tenant model requires the reverse field to compile. Then run `npx prisma generate` from `apps/web`. Do NOT run `prisma migrate dev`.

**1d. Pure helpers** `apps/web/src/lib/carrier/client-contacts.ts`:
- `export interface ContactInput { id?: string; name: string; role?: string | null; phone?: string | null; email?: string | null; isMain: boolean }`
- `getMainContact<T extends { isMain: boolean }>(contacts: T[]): T | null` — returns the isMain one, else the first, else null.
- `normalizeContacts(contacts: ContactInput[]): ContactInput[]` — trims, drops entries with an empty name; if any remain and none/multiple are isMain, force exactly one main (keep the first flagged main, else the first contact). Returns [] for empty input (zero contacts allowed).
- `mapLegacyPrimaryContact(client: { name: string; primaryContact?: string | null; email?: string | null; phone?: string | null }): ContactInput | null` — mirrors the backfill rule (returns null when no legacy contact data), so the test can assert the mapping.

**1e. Data layer** `clients.ts`: extend `ClientCreateInput`/`ClientUpdateInput` with optional `contacts?: ContactInput[]`. In `createClient` and `updateClient`, when `contacts` is provided, `normalizeContacts` then write children in the same tenant transaction (for update: replace-all — delete existing `client_contacts` for the client, re-insert normalized). Set `orgId` on each child. In `getClient` and `listClients`, `include`/select `contacts` (order `isMain desc, createdAt asc`) so callers can render them; expose a derived `mainContact` on `getClient`.

**1f. API routes**: add `contacts` (array of `{name, role?, phone?, email?, isMain}`) to `ClientCreateSchema` and `ClientUpdateSchema` (Zod, all optional). Pass through to the lib functions.

**1g. Read-path switch — email (functional)** `notifications.ts`: at each `load.client.email` site (~592, ~844, ~976, ~1113), add `contacts: { select: { name, email, phone, isMain } }` to the `load.client` include and replace `load.client.email` with `getMainContact(load.client.contacts)?.email ?? load.client.email`. Keep the existing "no email" guard.
  </action>
  <verify>
    From `apps/web`: `npx prisma generate` succeeds; `client_contacts` table + RLS + app_user grant exist (list_tables / SELECT). `npx tsc --noEmit` shows no NEW errors vs baseline. Backfill: for a client with a legacy primary contact, `SELECT count(*) FROM client_contacts WHERE client_id = <id> AND is_main` returns 1.
  </verify>
  <done>
    `client_contacts` exists with RLS (org_id = current_tenant_id()), a partial unique main index, and app_user GRANT. Legacy primary contacts are backfilled as isMain rows; zero-data clients have none. clients lib + API accept/return contacts. Customer-email path reads the main contact's email with legacy fallback.
  </done>
</task>

<task type="auto">
  <name>Task 2: Contacts UI — New Client form, client detail (desktop + mobile), list surfaces</name>
  <files>
    apps/web/src/components/carrier/clients/ClientForm.tsx,
    apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx,
    apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx,
    apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetailMobile.tsx,
    apps/web/src/app/(owner)/carrier/clients/page.tsx,
    apps/web/src/app/(owner)/carrier/clients/ClientsMobile.tsx,
    apps/web/src/app/(owner)/carrier/clients/_grid/columns.tsx,
    apps/web/src/app/(owner)/carrier/clients/NewClientSheet.tsx,
    apps/web/src/app/(owner)/carrier/clients/new/ClientCreateMobile.tsx
  </files>
  <action>
Auto-run the UI UX Pro Max skill (per CLAUDE.md) before writing UI: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "editable contacts list with radio main selector, add remove rows" --design-system -p "DriveCommand"` and apply results. Use existing shadcn/ui primitives (`Input`, `Button`, `Label`, radio via `<input type="radio">` styled like the existing `portalAccess` checkbox) — do NOT introduce a new component library or pattern.

Build a reusable **Contacts editor** (a `ContactsField` block; keep it local to ClientForm or a small shared component under `components/carrier/clients/`) that renders a list of contact rows (name, role/title, phone, email) with:
- "Add contact" button appending a blank row.
- Per-row remove (trash) button.
- A radio group across rows binding `isMain` — selecting one clears the others (enforces exactly one main in the UI). If contacts exist, one radio must be selected (default the first). Zero contacts is allowed (empty list, no radio).
Emit the contacts array into the existing submit body (`body.contacts = normalizedRows`) alongside the current fields. Keep the legacy Contact section fields as-is for now (they remain the fallback) OR relabel the section — minimum requirement: the contacts editor is present and submits.

**ClientForm.tsx (desktop New/Edit)**: add the Contacts editor to the "Contact" section; seed initial rows from `initialData.contacts` on edit.

**[id]/page.tsx**: the server query already fetches the client — add `contacts` (via the lib `getClient` which now includes them) and pass `contacts` into `ClientDetail`/`ClientDetailMobile` and the `ClientData` shape.

**ClientDetail.tsx (desktop detail)** and **ClientDetailMobile.tsx (mobile detail)**: render the contacts list (main contact badged/first), and route add/remove/edit through the same PATCH `contacts` payload. Preserve rendering when `contacts` is empty (show the legacy single fields or an empty state) so pages render for 0/1/many contacts.

**List surfaces** — replace the displayed single contact with the main contact name (fallback to legacy `primaryContact`):
- `clients/page.tsx` L45, `ClientsMobile.tsx` L109/L174 (subline), `_grid/columns.tsx` L83 (`row.original.primaryContact`). Use `getMainContact(row.contacts)?.name ?? row.primaryContact`. Ensure `contacts` is selected in the queries feeding these (listClients now includes it).

**Mobile create**: `NewClientSheet.tsx` and `new/ClientCreateMobile.tsx` — add a minimal add/remove contacts control mirroring the desktop editor, submitting `contacts` in the POST body. Keep it optional.

Reuse `normalizeContacts` / `getMainContact` from `@/lib/carrier/client-contacts` in client components for the UI-side main enforcement and display.
  </action>
  <verify>
    From `apps/web`: `npx tsc --noEmit` no new errors. Manually (or via existing dev server) the New Client form shows an add/remove contacts editor with a working main radio; the client detail lists contacts; the clients list shows the main contact name. Confirm the detail + list pages render for a client with 0 contacts, 1 contact, and multiple contacts (use the backfilled data + a manually multi-contact client).
  </verify>
  <done>
    New Client form (desktop + mobile) and client detail (desktop + mobile) can add/remove contacts with a radio enforcing exactly one main; list/grid surfaces show the main contact; all client pages render for 0/1/many contacts. No new tsc errors.
  </done>
</task>

<task type="auto">
  <name>Task 3: Tests — backfill mapping, exactly-one-main, main-contact read path</name>
  <files>apps/web/src/lib/carrier/__tests__/client-contacts.test.ts</files>
  <action>
Write a Vitest suite (pure functions, no DB — match `dispatch-assigned-email.test.ts` style) importing from `@/lib/carrier/client-contacts`:

1. **Migration mapping** — `mapLegacyPrimaryContact`:
   - Client with `primaryContact: 'Jane Doe', email, phone` maps to `{ name: 'Jane Doe', email, phone, isMain: true }`.
   - Client with blank/undefined `primaryContact` but an email/phone maps with `name` falling back to the company `name` and `isMain: true`.
   - Client with no primaryContact/email/phone returns `null` (no contact created — stays at zero).

2. **Exactly-one-main constraint** — `normalizeContacts`:
   - Given multiple rows with `isMain: true`, exactly one remains main (the first flagged).
   - Given rows with none flagged main, exactly one becomes main (the first).
   - Empty input returns `[]` (zero contacts allowed → no main).
   - Rows with empty/whitespace `name` are dropped.

3. **Read path** — `getMainContact`:
   - Returns the `isMain` contact when present (assert its `email` is the one a caller like the customer-email path would use).
   - Falls back to the first contact when none flagged; returns `null` for an empty list.

Run `npm test` from `apps/web` and ensure the new file passes.
  </action>
  <verify>From `apps/web`: `npm test` (or `npx vitest run src/lib/carrier/__tests__/client-contacts.test.ts`) — all new tests green.</verify>
  <done>Three behaviors covered (backfill mapping, exactly-one-main, main-contact read) and passing.</done>
</task>

</tasks>

<verification>
- From `apps/web`: `npx tsc --noEmit` — no new errors vs the known ~35-error baseline (only regressions or errors in touched files count).
- `npm test` passes including the new `client-contacts.test.ts`.
- `client_contacts` table exists in the DB with RLS enabled (`org_id = current_tenant_id()`), the partial unique main index, and `app_user` DML grant.
- Backfill produced exactly one isMain contact per legacy-contact client; zero-data clients have none.
- Client list, client detail (desktop + mobile), and New Client form render for clients with 0, 1, and multiple contacts.
- Final grep confirms every `client.primaryContact` / `client.email` DISPLAY or email read now prefers the main contact (legacy `/legacy/` file excluded).
</verification>

<success_criteria>
- Multiple contacts per client (name, role, phone, email, isMain) with a DB guard against two mains and app-layer "exactly one when any exist".
- Existing clients' primary contact backfilled as their main contact.
- Add/remove + main radio on New Client form and client detail (desktop + mobile).
- Customer-email path and display surfaces read the main contact (legacy fallback).
- Contacts optional (zero allowed). `tsc --noEmit` clean of regressions; tests pass.
</success_criteria>

<output>
After completion, create `.planning/quick/492-add-multiple-contacts-per-client-client-/492-SUMMARY.md`.
Do NOT push — commit only; the orchestrator handles the single final push.
</output>
