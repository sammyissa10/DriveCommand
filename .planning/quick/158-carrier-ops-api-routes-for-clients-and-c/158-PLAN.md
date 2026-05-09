---
phase: quick-158
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/clients.ts
  - apps/web/src/lib/carrier/contracts.ts
  - apps/web/src/app/api/v1/carrier/clients/route.ts
  - apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/contracts/route.ts
  - apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/contracts/[id]/loads/route.ts
autonomous: true
must_haves:
  truths:
    - "Authenticated user can list their org's clients with search/status filters"
    - "Authenticated user can CRUD clients scoped to their org"
    - "Authenticated user can list their org's contracts with client_id/status filters"
    - "Authenticated user can CRUD contracts scoped to their org with auto-generated contract numbers"
    - "Authenticated user can view revenue summary for a contract's loads"
    - "Unauthenticated requests return 401"
    - "Cross-org requests return 403"
    - "All Decimal fields serialize as strings in JSON responses"
  artifacts:
    - path: "apps/web/src/lib/carrier/clients.ts"
      provides: "Client data access functions"
    - path: "apps/web/src/lib/carrier/contracts.ts"
      provides: "Contract data access functions"
    - path: "apps/web/src/app/api/v1/carrier/clients/route.ts"
      provides: "GET list + POST create for clients"
    - path: "apps/web/src/app/api/v1/carrier/clients/[id]/route.ts"
      provides: "GET one + PATCH + DELETE for clients"
    - path: "apps/web/src/app/api/v1/carrier/contracts/route.ts"
      provides: "GET list + POST create for contracts"
    - path: "apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts"
      provides: "GET one + PATCH + DELETE for contracts"
    - path: "apps/web/src/app/api/v1/carrier/contracts/[id]/loads/route.ts"
      provides: "GET revenue summary for contract loads"
  key_links:
    - from: "API route handlers"
      to: "lib/carrier/*.ts"
      via: "function imports"
    - from: "lib/carrier/*.ts"
      to: "prisma.carrierClient / prisma.carrierContract / prisma.carrierLoad"
      via: "Prisma queries with orgId scoping"
    - from: "all route handlers"
      to: "getSession()"
      via: "import from @/lib/auth/supabase"
---

<objective>
Create REST API routes for carrier clients and contracts CRUD under /api/v1/carrier/.

Purpose: Phase 2 of Carrier Ops — expose client and contract management via REST endpoints that the carrier web UI will consume.

Output: 7 files — 2 data access modules + 5 API route files. All org-scoped via JWT session, Zod-validated, consistent {data, error} response shape.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (CarrierClient model line ~1249, CarrierContract ~1288, CarrierLoad ~1521)
@apps/web/src/lib/auth/supabase.ts (getSession — returns SessionData with tenantId)
@apps/web/src/lib/db/prisma.ts (prisma singleton + TX_OPTIONS)
@apps/web/src/lib/logger.ts (structured logger)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Data access layer — clients.ts and contracts.ts</name>
  <files>
    apps/web/src/lib/carrier/clients.ts
    apps/web/src/lib/carrier/contracts.ts
  </files>
  <action>
Create `apps/web/src/lib/carrier/` directory with two modules.

**clients.ts** — Export these functions, all taking orgId as first param for scoping:

1. `listClients(orgId, filters: { status?, search?, page?, pageSize? })` — Query `prisma.carrierClient.findMany` filtered by orgId. If `search` provided, filter `name` with `contains` (case-insensitive mode). If `status` provided, filter by it. Default pageSize=50. Return `{ items, total }`. Include pagination via `skip`/`take` + `count`.

2. `getClient(orgId, id)` — `findFirst` where `id` AND `orgId` match. Include computed fields via raw count: open loads count (`carrierLoads` where status NOT IN ('delivered','cancelled','invoiced')), outstanding AR (sum of `carrierLoads.totalRevenue` where status = 'invoiced'). Return null if not found.

3. `createClient(orgId, data)` — `prisma.carrierClient.create` with orgId forced from param, never from data. Return created record.

4. `updateClient(orgId, id, data)` — First verify record exists with matching orgId (return null if not). Then `prisma.carrierClient.update`. Return updated record.

5. `softDeleteClient(orgId, id)` — Verify org ownership, then update status to 'inactive'. Return updated record or null.

**contracts.ts** — Export these functions:

1. `listContracts(orgId, filters: { clientId?, status?, page?, pageSize? })` — `findMany` with orgId filter. Include `client: { select: { name: true } }` for display. Paginated.

2. `getContract(orgId, id)` — `findFirst` with orgId match. Include route template count and loads revenue total (aggregate sum of `carrierLoads.totalRevenue` and count).

3. `createContract(orgId, clientId, data)` — Auto-generate `contractNumber`: format `CN-{YYYY}-{NNNNN}` where NNNNN is a zero-padded sequential number. To get next number: count existing contracts for this orgId in the current year + 1. Use a transaction to prevent races. Set orgId from param. Return created record.

4. `updateContract(orgId, id, data)` — Verify org ownership first. Return updated or null.

5. `softDeleteContract(orgId, id)` — Set status to 'terminated'. Return updated or null.

6. `getContractLoadsSummary(orgId, contractId)` — Verify org ownership on the contract. Then aggregate `carrierLoad` where contractId matches: count, sum of totalRevenue, sum of totalRevenue where status = 'invoiced' (as "totalInvoiced"), sum where status = 'delivered' (as "totalPaid" — approximate), and average rateAmount. Return `{ totalLoads, totalRevenue, totalInvoiced, totalPaid, avgRate }`.

**Critical patterns:**
- All Prisma Decimal values MUST be converted to string via `.toString()` before returning (or use a helper: `const decStr = (d: Decimal | null) => d?.toString() ?? null`).
- Use `prisma.$transaction` with `TX_OPTIONS` for the contract number generation.
- Import prisma from `@/lib/db/prisma`, logger from `@/lib/logger`.
- All functions are plain async functions (NOT server actions with "use server" — these are called from route handlers, not React components).
  </action>
  <verify>npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -30 — no errors in carrier/ files</verify>
  <done>Both files export all listed functions with correct Prisma queries, org scoping, and Decimal-to-string serialization.</done>
</task>

<task type="auto">
  <name>Task 2: API route handlers for clients and contracts</name>
  <files>
    apps/web/src/app/api/v1/carrier/clients/route.ts
    apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
    apps/web/src/app/api/v1/carrier/contracts/route.ts
    apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
    apps/web/src/app/api/v1/carrier/contracts/[id]/loads/route.ts
  </files>
  <action>
Create 5 route handler files. All follow this consistent pattern:

**Auth pattern (every handler):**
```ts
import { getSession } from '@/lib/auth/supabase';
const session = await getSession();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const orgId = session.tenantId;
if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });
```

**Response shape:** Always `{ data: T }` on success, `{ error: string }` on failure. Use proper HTTP status codes (200, 201, 400, 401, 403, 404, 500).

**Zod validation:** Define inline Zod schemas for POST/PATCH bodies. Import `z` from 'zod'. On validation failure return 400 with `{ error: zodError.errors[0].message }`.

**Error handling:** Wrap each handler body in try/catch. On catch, log with `logger.error(...)` and return 500.

---

**clients/route.ts:**
- `GET` — Parse searchParams: `status`, `search`, `page` (default 1), `pageSize` (default 50). Call `listClients(orgId, filters)`. Return `{ data: { items, total, page, pageSize } }`.
- `POST` — Zod schema: `name` required string min(1), all other CarrierClient fields optional (dbaName, mcNumber, dotNumber, taxId, primaryContact, email, phone, website, addressLine1/2, city, state, zip, country, portalAccess, portalEmail, notes). NEVER accept orgId/id/status from body. Call `createClient(orgId, validated)`. Return 201 with `{ data: client }`.

**clients/[id]/route.ts:**
- Extract `id` from `params.id` (the dynamic segment).
- `GET` — Call `getClient(orgId, id)`. Return 404 if null. Return `{ data: client }`.
- `PATCH` — Zod schema: all fields optional (same as POST fields). Call `updateClient(orgId, id, validated)`. Return 404 if null. Return `{ data: client }`.
- `DELETE` — Call `softDeleteClient(orgId, id)`. Return 404 if null. Return `{ data: { id, status: 'inactive' } }`.

**contracts/route.ts:**
- `GET` — Parse searchParams: `client_id`, `status`, `page`, `pageSize`. Call `listContracts(orgId, filters)`. Return `{ data: { items, total, page, pageSize } }`.
- `POST` — Zod schema: `clientId` required uuid, `contractType` optional (default 'spot'), `effectiveDate`/`expirationDate` optional ISO date strings, `rateType` optional, `baseRate`/`fuelSurchargeRate` optional string (will become Decimal), `fuelSurchargeMethod` optional, `notes` optional. NEVER accept orgId/contractNumber/status. Call `createContract(orgId, validated.clientId, validated)`. Return 201.

**contracts/[id]/route.ts:**
- `GET` — Call `getContract(orgId, id)`. Return 404 if null.
- `PATCH` — Same optional fields as POST (minus clientId which should not change). Call `updateContract`. Return 404 if null.
- `DELETE` — Call `softDeleteContract`. Sets status = 'terminated'. Return 404 if null. Return `{ data: { id, status: 'terminated' } }`.

**contracts/[id]/loads/route.ts:**
- `GET` only. Call `getContractLoadsSummary(orgId, id)`. Return 404 if contract not found. Return `{ data: { totalLoads, totalRevenue, totalInvoiced, totalPaid, avgRate } }` — all money values as strings.

**Important for Next.js 15 dynamic routes:** The `params` object is a Promise in Next.js 15 App Router. Access via: `const { id } = await params;` in the route handler signature `(req: NextRequest, { params }: { params: Promise<{ id: string }> })`.
  </action>
  <verify>Run `npx tsc --noEmit --project apps/web/tsconfig.json` — zero errors. Visually confirm all 7 files exist in correct directory structure.</verify>
  <done>All 5 route files export correct HTTP method handlers. Auth enforced on every handler. Zod validates request bodies. Responses use consistent {data}/{error} shape. Decimals serialize as strings. No existing files modified.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit --project apps/web/tsconfig.json` — zero type errors
2. Confirm 7 new files exist:
   - `apps/web/src/lib/carrier/clients.ts`
   - `apps/web/src/lib/carrier/contracts.ts`
   - `apps/web/src/app/api/v1/carrier/clients/route.ts`
   - `apps/web/src/app/api/v1/carrier/clients/[id]/route.ts`
   - `apps/web/src/app/api/v1/carrier/contracts/route.ts`
   - `apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts`
   - `apps/web/src/app/api/v1/carrier/contracts/[id]/loads/route.ts`
3. Confirm no existing files were modified (git diff should only show new files)
</verification>

<success_criteria>
- All 7 files created with correct exports
- TypeScript compiles clean
- Every route handler validates auth session and scopes by orgId
- org_id never accepted from request body
- Zod validation on all POST/PATCH bodies
- All Decimal values returned as strings
- Consistent {data, error} response shape across all endpoints
- Contract number auto-generation in CN-YYYY-NNNNN format
- Soft deletes (status update) instead of hard deletes
</success_criteria>

<output>
After completion, create `.planning/quick/158-carrier-ops-api-routes-for-clients-and-c/158-SUMMARY.md`
</output>
