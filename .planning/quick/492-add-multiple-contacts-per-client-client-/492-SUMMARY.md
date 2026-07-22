# Quick Task 492 — Summary

Added a one-to-many **contacts** relation to the carrier client entity so a client can have zero, one, or many contacts (name, role/title, phone, email), with exactly one flagged as the main contact. Backfilled every existing client's legacy single primary-contact into the new table, wired add/remove + main-selection UI into the New Client form and client detail screens (desktop + mobile), and switched the functional customer-email read path plus display surfaces to read the main contact — falling back to the legacy columns when no contacts exist.

## What was built

**DB (raw-SQL migrations, applied directly to Supabase — the auto-deploy hook did not fire this session):**
- `20260722000004_add_client_contacts` — new `client_contacts` table (`org_id`, `client_id`, `name`, `role`, `phone`, `email`, `is_main`), RLS enabled+forced with `org_id = current_tenant_id()` (+ `bypass_rls_policy`), a partial unique index `client_contacts_one_main_per_client` (`WHERE is_main = true`) guarding at most one main per client at the DB layer, and `GRANT SELECT/INSERT/UPDATE/DELETE … TO app_user`. Self-validating (`RAISE EXCEPTION` on any assertion failure).
- `20260722000005_backfill_client_contacts` — inserts one `isMain` contact per client that has any legacy `primary_contact`/`email`/`phone` data (name falls back to the company name when `primary_contact` is blank); idempotent (skips clients that already have a `client_contacts` row). Applied against the live Supabase DB: **12 clients backfilled, 12 `isMain` rows** (verified 1:1).
- Verified after apply: `client_contacts` has `relrowsecurity`/`relforcerowsecurity = true`, the `tenant_isolation_policy` exists, the partial unique index exists, and `app_user` has all 4 DML grants.

**Schema / data layer:**
- New Prisma model `CarrierClientContact` (`@@map("client_contacts")`) with `orgId`/`clientId` relations; `CarrierClient.contacts CarrierClientContact[]`; `Tenant.carrierClientContacts` reverse relation. Ran `npx prisma generate`.
- **Deviation (Rule 3 — blocking issue):** the app's `withTenantRLS` Prisma extension auto-injects a `tenantId` field into every query for non-exempt models. `CarrierClientContact` uses `orgId` (not `tenantId`), matching every other carrier sibling table — so it had to be added to the extension's `EXEMPT_MODELS` set (`src/lib/db/extensions/tenant-rls.ts`), exactly like `CarrierClient`/`CarrierContract`/etc. Without this, any read/write on the model would throw an unknown-field error. `withAuditColumns` needed no change (it only injects fields the DMMF says exist, and `client_contacts` has neither `createdById` nor `updatedById`).
- `lib/carrier/client-contacts.ts` — pure, unit-tested helpers: `getMainContact` (isMain → first → null), `normalizeContacts` (trims, drops empty-name rows, enforces exactly one `isMain` when any remain — first-flagged wins, else the first contact is forced main), `mapLegacyPrimaryContact` (mirrors the backfill SQL rule).
- `lib/carrier/clients.ts` — `listClients`/`getClient` now `include: { contacts: { orderBy: [isMain desc, createdAt asc] } }`; `getClient` also returns a derived `mainContact`. `createClient`/`updateClient` accept an optional `contacts` array: create does a normalized nested `contacts.create`; update is **replace-all** inside a `$transaction` (delete existing `client_contacts` for the client, re-insert normalized rows) so contacts stay consistent with the exactly-one-main rule after every edit.
- Clients API (`POST`/`PATCH /api/v1/carrier/clients[/[id]]`) — Zod schemas gained an optional `contacts: z.array({id?, name, role?, phone?, email?, isMain})`.

**Customer-email read path (functional):**
- `lib/carrier/notifications.ts` — all 4 sites that read `load.client.email` (invoice-generated, plus the shared `getClientEmailForLoad` helper used by pickup/delivery/stop-completed) now add `contacts` to the `client` include and resolve `getMainContact(load.client.contacts)?.email ?? load.client.email`. Final repo-wide grep (excluding `/legacy/`) confirms no other `.client.email` / `.client.primaryContact` read was missed.

**UI (desktop + mobile-web DS):**
- New shared `components/carrier/clients/ContactsEditor.tsx` — add/remove contact rows (name, role, phone, email) with a radio group enforcing exactly one main across rows; zero contacts is a valid empty state. Reused everywhere contacts are edited (kept single-sourced rather than forking a DS-styled variant, to stay within scope).
- `ClientForm.tsx` (desktop New/Edit) — Contacts section wired into the same submit body; `ClientDetail.tsx`'s edit mode already renders `ClientForm`, so editing "just worked" there — the desktop Overview tab additionally renders a contacts list (main badged) in place of the single Primary Contact/Email/Phone/Website fields when contacts exist, falling back to the legacy fields when they don't.
- `ClientDetailMobile.tsx` — added a "Contacts" section to the Details tab: view mode lists contacts (main pill), edit mode renders the same `ContactsEditor`; `save()` now submits `contacts` and updates local state from the PATCH response's `data.contacts` (real IDs) so a second edit doesn't lose them.
- `NewClientSheet.tsx` and `new/ClientCreateMobile.tsx` (mobile create) — added an optional "Additional contacts" `ContactsEditor` block, submitted only when non-empty.
- List/grid surfaces — `_grid/types.ts` gained `mainContactName`/`contacts` on `ClientRow`; `clients/page.tsx` computes `mainContactName = getMainContact(c.contacts)?.name ?? c.primaryContact` server-side; `_grid/columns.tsx` and `ClientsMobile.tsx` (search + subline) now read `mainContactName` instead of the raw legacy field.

**Tests:**
- `src/lib/carrier/__tests__/client-contacts.test.ts` — 10 tests covering `mapLegacyPrimaryContact` (maps primaryContact/email/phone; falls back to company name; returns null with no legacy data), `normalizeContacts` (collapses multiple `isMain` flags to the first; forces the first contact main when none flagged; `[]` stays `[]`; drops blank-name rows), and `getMainContact` (isMain wins; falls back to first; null on empty).

## Verification

- `npx tsc --noEmit` (apps/web) → **0 errors** (baseline was ~35 pre-existing; this task introduced none — in fact the working tree tsc'd clean throughout).
- `npx vitest run src/lib/carrier` → **14/14 pass** (10 new `client-contacts` tests + the pre-existing 4 `dispatch-assigned-email` tests, unaffected).
- `npx prisma validate` → schema valid.
- DB verification via direct query against the live Supabase instance (superuser `DATABASE_URL` from `.env`, same mechanism prior quick-tasks used since the auto-deploy hook did not fire): `client_contacts` exists, FORCE RLS on, `tenant_isolation_policy` present, partial unique main index present, `app_user` has all 4 grants, backfill produced 12 rows / 12 isMain (1:1 with legacy-data clients).
- Final grep confirms every `.client.email` / `.client.primaryContact` functional read outside `/legacy/` now prefers the main contact.

## Deviations from plan

**1. [Rule 3 — blocking issue] `CarrierClientContact` had to be added to the `tenantId`-injection RLS extension's exemption list**
- **Found during:** Task 1, first attempt to write the new model.
- **Issue:** `src/lib/db/extensions/tenant-rls.ts` auto-injects a `tenantId` where/data field into every Prisma operation on non-exempt models. `client_contacts` uses `org_id` (per the plan's explicit convention, matching every carrier sibling table), so an un-exempted `CarrierClientContact` model would throw on every query.
- **Fix:** Added `'CarrierClientContact'` to `EXEMPT_MODELS` in `tenant-rls.ts`, alongside `CarrierClient`/`CarrierContract`/etc.
- **Files modified:** `apps/web/src/lib/db/extensions/tenant-rls.ts`
- **Commit:** `761ed3ce`

No other deviations — the rest of the plan executed as written.

## Not done / follow-ups

- Not deployed (`vercel --prod`), not pushed — per standing workflow, the user deploys/pushes.
- The mobile `ContactsEditor` reuses the desktop shadcn-styled component rather than a bespoke DS-token-styled editor (wrapped in a `bg-ds-card` container for visual consistency); a future pass could build a DS-native variant if the visual mismatch bothers design review.

## Self-Check: PASSED

- FOUND: apps/web/prisma/migrations/20260722000004_add_client_contacts/migration.sql
- FOUND: apps/web/prisma/migrations/20260722000005_backfill_client_contacts/migration.sql
- FOUND: apps/web/src/lib/carrier/client-contacts.ts
- FOUND: apps/web/src/lib/carrier/__tests__/client-contacts.test.ts
- FOUND: apps/web/src/components/carrier/clients/ContactsEditor.tsx
- FOUND commit: 761ed3ce (feat(quick-492): add client_contacts table + backend read/write switch)
- FOUND commit: bd739089 (feat(quick-492): contacts UI on New Client form, client detail, list surfaces)
- FOUND commit: bbd4f1a5 (test(quick-492): client-contacts pure-helper coverage)
