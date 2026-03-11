# Phase 25: SysAdmin Invoicing Module - Research

**Researched:** 2026-03-11
**Domain:** B2B SaaS billing — admin portal invoicing for DriveCommand tenants
**Confidence:** HIGH (all findings verified from live codebase)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- This is DriveCommand billing its own tenants, NOT the tenant invoice module (quick-7)
- Scope: create/edit/delete invoices, line items, statuses (DRAFT/SENT/PAID/OVERDUE), due date tracking, email delivery to tenant owner, billing history per tenant, dashboard summary
- Three plans: (1) DB schema + server actions, (2) UI, (3) Email + overdue detection
- Sysadmin portal route group is `(admin)` — not `(sysadmin)`
- Invoice shows DriveCommand branding when emailed
- Overdue = past due date AND status is still SENT
- Billing history on tenant detail page

### Claude's Discretion
- (None specified — all scope was locked)

### Deferred Ideas (OUT OF SCOPE)
- Stripe or payment processor integration
- Tenant self-service billing portal
- Automated subscription billing / recurring invoices
</user_constraints>

---

## Summary

Phase 25 adds a B2B SaaS invoicing capability inside the existing sysadmin portal at `src/app/(admin)/`. The portal already manages tenants, support tickets, and platform metrics, and uses `prisma` (base client, no RLS) for cross-tenant access — the same access pattern needed for admin invoices.

The existing tenant invoice module (quick-7, `src/app/(owner)/invoices/`) has already solved all the hard problems: Zod validation schemas, the `InvoiceItemsEditor` line-item component, the `InvoiceForm` component, server actions using `Prisma.Decimal` for financial precision, status management, and soft-delete via `archivedAt`. The sysadmin module can reuse all of this UI code with minor adaptations — the form itself needs no redesign.

A new `SysAdminInvoice` / `SysAdminInvoiceItem` pair of Prisma models is needed because the existing `Invoice` model is tenant-scoped (for carriers billing their freight customers) and must not be repurposed. Email delivery uses the established `gmail-client.ts` + `@react-email/components` pattern with `sendEmail({ to, subject, react })`. Overdue detection follows the `auto-close-tickets` cron pattern: a `GET /api/cron/...` route guarded by `CRON_SECRET`, registered in `vercel.json`.

**Primary recommendation:** Reuse the existing invoice UI components directly; create new Prisma models scoped to admin billing; follow the admin portal's `requireAdminAccess()` guard; emit email via `gmail-client.ts` using a new `@react-email` template.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7 (PrismaPg adapter) | ORM + DB access | Already in use; `prisma` base client used for all cross-tenant admin queries |
| `@prisma/adapter-pg` | current | PostgreSQL driver adapter | Required by Prisma 7 setup in this project |
| `Prisma.Decimal` | (bundled) | Financial arithmetic | Used in `src/app/(owner)/actions/invoices.ts` — never use floating point for money |
| Zod | current | Input validation in server actions | Used in all existing actions |
| `@react-email/components` | current | Email template primitives | Used in `src/emails/*.tsx` |
| nodemailer (gmail-client) | current | Email delivery | The active email transport (`gmail-client.ts`); Resend client exists but is not wired to any current sender |
| `@tanstack/react-table` | current | Sortable/filterable table | Used in `tenant-list-client.tsx` for admin data tables |
| shadcn/ui Cards | current | UI layout containers | Used throughout admin portal pages |
| `next/cache` `revalidatePath` | Next.js 16 | Cache invalidation after mutations | Pattern used in all server actions |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `nanoid` | Generates pseudo-IDs for email send results | Already a dep (used in gmail-client) |
| `lucide-react` | Icons (Plus, Trash2, ArrowLeft, Pencil, etc.) | All icon usage in project |

**Installation:** No new packages needed — all required dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
src/app/(admin)/
├── billing/                      # NEW: top-level billing section
│   ├── page.tsx                  # Invoice list + dashboard summary
│   ├── new/
│   │   └── page.tsx              # Create invoice (pick tenant, add line items)
│   └── [id]/
│       ├── page.tsx              # Invoice detail + status actions
│       └── edit/
│           └── page.tsx          # Edit invoice
├── tenants/
│   └── [id]/
│       └── page.tsx              # EXTEND: add billing history section
├── actions/
│   ├── tenants.ts                # EXISTING
│   └── billing.ts                # NEW: all sysadmin invoice server actions
└── layout.tsx                    # EXTEND: add "Billing" nav link

src/emails/
└── sysadmin-invoice.tsx          # NEW: invoice email template (DriveCommand branding)

src/lib/email/
└── send-sysadmin-invoice.ts      # NEW: send function wrapping gmail-client

src/app/api/cron/
└── mark-overdue-invoices/
    └── route.ts                  # NEW: cron job for overdue detection

prisma/schema.prisma              # EXTEND: SysAdminInvoice + SysAdminInvoiceItem models
vercel.json                       # EXTEND: register new cron
```

### Pattern 1: Admin Server Action Guard
**What:** All admin server actions start with `requireAdminAccess()` — an inline helper that calls `requireAuth()` then `isSystemAdmin()`.
**When to use:** Every function in `src/app/(admin)/actions/billing.ts`.
**Example:**
```typescript
// Source: src/app/(admin)/actions/tenants.ts
async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Admin access required');
  }
}
```

### Pattern 2: Cross-Tenant Prisma Access (No RLS)
**What:** Admin actions use the base `prisma` client (from `@/lib/db/prisma`) directly — NOT `getTenantPrisma()`. This bypasses row-level security and allows cross-tenant reads.
**When to use:** All sysadmin billing queries.
**Example:**
```typescript
// Source: src/app/(admin)/actions/tenants.ts
import { prisma } from '@/lib/db/prisma';
const invoices = await prisma.sysAdminInvoice.findMany({ ... });
```

### Pattern 3: Financial Precision with Prisma.Decimal
**What:** All money calculations use `Prisma.Decimal` (re-exported as `const Decimal = Prisma.Decimal`), never JavaScript floats.
**When to use:** Every amount field: subtotal, tax, totalAmount, unitPrice, quantity.
**Example:**
```typescript
// Source: src/app/(owner)/actions/invoices.ts
import { Prisma } from '@/generated/prisma';
const Decimal = Prisma.Decimal;

const qty = new Decimal(item.quantity);
const price = new Decimal(item.unitPrice);
const amount = qty.mul(price);
const subtotal = itemsWithAmounts.reduce(
  (sum, item) => sum.add(item.amount),
  new Decimal(0)
);
const totalAmount = subtotal.add(tax);
```

### Pattern 4: Line Items via Nested Create + Delete/Recreate on Update
**What:** Line items created via nested `items: { create: [...] }` on the parent `create`. On update: `deleteMany({ where: { invoiceId: id } })` then recreate in a `$transaction`.
**When to use:** Create and update invoice mutations.
**Example:**
```typescript
// Source: src/app/(owner)/actions/invoices.ts
// UPDATE pattern:
await prisma.$transaction(async (tx) => {
  await tx.sysAdminInvoiceItem.deleteMany({ where: { invoiceId: id } });
  await tx.sysAdminInvoice.update({
    where: { id },
    data: { ...fields, items: { create: itemsWithAmounts } },
  });
}, TX_OPTIONS);
```

### Pattern 5: Items JSON Hidden Field
**What:** The `InvoiceItemsEditor` client component serializes line items to a hidden `<input name="itemsJson">` field. The server action calls `JSON.parse(formData.get('itemsJson'))`.
**When to use:** Line item forms — reuse `InvoiceItemsEditor` directly.
**Example:**
```typescript
// Source: src/app/(owner)/actions/invoices.ts
const itemsJson = formData.get('itemsJson') as string;
parsedItems = JSON.parse(itemsJson || '[]');
```

### Pattern 6: Invoice Number Auto-Generation
**What:** Find the latest invoice by `createdAt desc`, parse the trailing number with regex, increment and zero-pad.
**When to use:** New invoice page — auto-populate invoice number field (user can override).
**Example:**
```typescript
// Source: src/app/(owner)/invoices/new/page.tsx
const latestInvoice = await prisma.sysAdminInvoice.findFirst({
  orderBy: { createdAt: 'desc' },
  select: { invoiceNumber: true },
});
if (latestInvoice?.invoiceNumber) {
  const match = latestInvoice.invoiceNumber.match(/(\d+)$/);
  if (match) {
    const nextNum = parseInt(match[1]) + 1;
    nextInvoiceNumber = `SINV-${String(nextNum).padStart(4, '0')}`;
  }
}
```
Use prefix `SINV-` (SysAdmin Invoice) to distinguish from tenant `INV-` numbers.

### Pattern 7: Email Delivery
**What:** Create a file in `src/lib/email/` that calls `sendEmail` from `gmail-client`. Pass a React component from `src/emails/`.
**When to use:** Send invoice action.
**Example:**
```typescript
// Source: src/lib/email/send-maintenance-reminder.ts (pattern)
import { sendEmail } from './gmail-client';
import { SysAdminInvoiceEmail } from '@/emails/sysadmin-invoice';

export async function sendSysAdminInvoice(toEmail: string, data: SysAdminInvoiceEmailProps) {
  return sendEmail({
    to: toEmail,
    subject: `Invoice ${data.invoiceNumber} from DriveCommand`,
    react: SysAdminInvoiceEmail(data),
  });
}
```

### Pattern 8: Cron Job for Overdue Detection
**What:** `GET /api/cron/[name]/route.ts` — verify `CRON_SECRET` bearer token, run Prisma update, return JSON summary. Register in `vercel.json`.
**When to use:** Nightly overdue invoice marking.
**Example:**
```typescript
// Source: src/app/api/cron/auto-close-tickets/route.ts (pattern)
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    await tx.sysAdminInvoice.updateMany({
      where: { status: 'SENT', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });
  }, TX_OPTIONS);
  return Response.json({ success: true });
}
```

### Pattern 9: Admin Page UI Structure
**What:** Admin pages use `bg-gray-50` / `bg-white` / `bg-gray-900` (header) — the gray Tailwind palette, NOT the owner portal's CSS variable tokens (`bg-card`, `text-foreground`, etc.).
**When to use:** Any new admin portal page.
**Example:**
```
// Source: src/app/(admin)/admin-dashboard/page.tsx
// Cards: rounded-lg border border-gray-200 bg-white px-6 py-4 shadow-sm
// Header text: text-gray-900 font-bold
// Nav: bg-gray-900 text-white (in layout.tsx)
```

### Pattern 10: Tenant Owner Email Lookup
**What:** To find the billing recipient, query `User` where `tenantId = X AND role = 'OWNER' AND isActive = true`.
**When to use:** Send invoice action — need the tenant owner's email.
**Example:**
```typescript
// Source: src/app/api/cron/send-reminders/route.ts (pattern)
const owners = await prisma.user.findMany({
  where: { tenantId: invoice.tenantId, role: 'OWNER', isActive: true },
  select: { email: true, firstName: true, lastName: true },
});
```

### Anti-Patterns to Avoid
- **Using `getTenantPrisma()` in admin actions:** Admin code must use base `prisma` client. `getTenantPrisma()` reads from session context and scopes to the logged-in user's tenant — useless for cross-tenant admin work.
- **Repurposing the existing `Invoice` model:** The `Invoice` model is for tenants billing their freight customers. Creating sysadmin invoices in that table would corrupt RLS and mix billing domains. New models required.
- **Floating point for money:** Never `amount = qty * price` in JS. Always `new Decimal(qty).mul(new Decimal(price))`.
- **Sending email from the create/update action in a blocking call without error handling:** Follow the "non-blocking warning" pattern from `createTenant` — catch email errors separately and return `emailWarning` without failing the whole operation.
- **Using Resend client for new emails:** The `resend-client.ts` exists but `gmail-client.ts` is the active transport (all current send functions import from `gmail-client`). Use `gmail-client`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line items editor UI | Custom React state + form | `InvoiceItemsEditor` from `src/components/invoices/invoice-items-editor.tsx` | Already built, tested, handles JSON serialization |
| Invoice form layout | New form components | `InvoiceForm` from `src/components/invoices/invoice-form.tsx` | Adapt props; the form shell is reusable |
| Invoice number generation | Custom UUID/timestamp | Regex increment pattern (see Pattern 6) | Already established in `invoices/new/page.tsx` |
| Financial calculation | `Number()` arithmetic | `Prisma.Decimal` (see Pattern 3) | Floating point causes penny errors |
| Zod schemas for invoice | New schemas from scratch | Copy and adapt `src/lib/validations/invoice.schemas.ts` — swap `customerId` for `tenantId` | Schema already covers all invoice fields |
| Email templates | Raw HTML strings | `@react-email/components` (see `src/emails/maintenance-reminder.tsx`) | React Email renders consistent HTML across clients |
| Admin auth guard | Custom session check | `requireAdminAccess()` helper (see Pattern 1) | Already used in all admin actions |
| Overdue detection query | Scheduled background job | Cron route + `vercel.json` (see Pattern 8) | Existing infrastructure; no worker process needed |

**Key insight:** The sysadmin invoice module is architecturally identical to the tenant invoice module but scoped differently. The entire UI layer (form, line items editor, list table structure, detail view layout) can be copied and adapted rather than written from scratch.

---

## Common Pitfalls

### Pitfall 1: Wrong Prisma client in admin actions
**What goes wrong:** Using `getTenantPrisma()` in an admin server action results in queries scoped to the sysadmin's own (empty) tenant rather than the target tenant.
**Why it happens:** `getTenantPrisma()` reads `tenantId` from the session, and the system admin's session will have a tenant context.
**How to avoid:** Import `{ prisma }` from `@/lib/db/prisma` directly in admin actions. Never call `getTenantPrisma()`.
**Warning signs:** Queries returning empty results or "not found" for tenants you know exist.

### Pitfall 2: Missing `bypass_rls` in cron transactions
**What goes wrong:** Cron job fails to update rows because RLS blocks the query.
**Why it happens:** The cron HTTP route runs without a user session, so `app.tenant_id` is unset. RLS rejects the query.
**How to avoid:** Wrap all cron DB mutations in `prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`; ... }, TX_OPTIONS)` — exactly as in `auto-close-tickets`.
**Warning signs:** Cron returns 500 or logs PostgreSQL RLS policy violation errors.

### Pitfall 3: Soft-delete vs. hard-delete confusion
**What goes wrong:** Billing history shows deleted invoices; or "delete" permanently removes financial records that should be auditable.
**Why it happens:** The tenant invoice module uses `archivedAt` soft-delete. New models should follow the same pattern.
**How to avoid:** Add `archivedAt DateTime? @db.Timestamptz` to `SysAdminInvoice`. Queries filter `where: { archivedAt: null }`. Only DRAFT invoices can be archived.
**Warning signs:** Billing history counts change unexpectedly; paid invoices disappearing.

### Pitfall 4: Unique constraint on invoice number — cross-tenant collision
**What goes wrong:** `@@unique([invoiceNumber])` without a tenant scope would require globally unique invoice numbers, but sysadmin invoices are not per-tenant (there's only one admin context).
**Why it happens:** Copying the tenant invoice unique constraint `@@unique([tenantId, invoiceNumber])` without thinking about it.
**How to avoid:** `SysAdminInvoice.invoiceNumber` just needs `@unique` — no tenantId scoping needed. There's one admin, one number sequence.

### Pitfall 5: Email sent before status transition persisted
**What goes wrong:** Email fires but invoice stays in DRAFT; or exception during email delivery rolls back the status update.
**Why it happens:** Putting email send inside the DB transaction.
**How to avoid:** Persist the `status: 'SENT'` DB update first, then send email outside the transaction. Catch email errors separately and return a warning rather than failing the action.

### Pitfall 6: No `createdById` tracking for admin invoices
**What goes wrong:** Audit trail is missing — no way to see which admin created or modified an invoice.
**Why it happens:** Forgetting to wire `requireAuth()` return value into `createdById` / `updatedById`.
**How to avoid:** Always call `const userId = await requireAuth()` and store it in `createdById` / `updatedById`.

### Pitfall 7: Admin layout nav not updated
**What goes wrong:** Billing section is unreachable because the nav in `(admin)/layout.tsx` has no "Billing" link.
**Why it happens:** Adding pages without updating the nav.
**How to avoid:** Plan 2 must include a nav update task for `src/app/(admin)/layout.tsx`.

---

## Code Examples

### SysAdminInvoice Prisma Model (proposed)
```prisma
// Source: pattern adapted from prisma/schema.prisma Invoice model

enum SysAdminInvoiceStatus {
  DRAFT
  SENT
  PAID
  OVERDUE
}

model SysAdminInvoice {
  id            String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                 @db.Uuid
  invoiceNumber String                 @unique
  status        SysAdminInvoiceStatus  @default(DRAFT)
  issueDate     DateTime               @db.Timestamptz
  dueDate       DateTime               @db.Timestamptz
  paidDate      DateTime?              @db.Timestamptz
  amount        Decimal                @db.Decimal(12, 2)   // subtotal
  tax           Decimal                @default(0) @db.Decimal(10, 2)
  totalAmount   Decimal                @db.Decimal(12, 2)
  notes         String?
  sentAt        DateTime?              @db.Timestamptz
  createdById   String?                @db.Uuid
  updatedById   String?                @db.Uuid
  createdAt     DateTime               @default(now()) @db.Timestamptz
  updatedAt     DateTime               @updatedAt @db.Timestamptz
  archivedAt    DateTime?              @db.Timestamptz

  tenant   Tenant                     @relation(fields: [tenantId], references: [id])
  items    SysAdminInvoiceItem[]

  @@index([tenantId])
  @@index([status])
  @@index([dueDate])
  @@index([archivedAt])
}

model SysAdminInvoiceItem {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  invoiceId   String  @db.Uuid
  description String
  quantity    Decimal @db.Decimal(10, 2)
  unitPrice   Decimal @db.Decimal(10, 2)
  amount      Decimal @db.Decimal(12, 2)

  invoice SysAdminInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
}
```

Note: `createdById` / `updatedById` reference `User` but without a Prisma relation field — because system admin users live in the `User` table but this is a cross-tenant operation. Use `@db.Uuid` and query manually if audit display is needed. This avoids the named-relation complexity seen in the tenant `Invoice` model. Alternatively add a named relation to `User` following the same `InvoiceCreatedBy` / `InvoiceUpdatedBy` pattern.

### Zod Schema for SysAdmin Invoice
```typescript
// Source: adapted from src/lib/validations/invoice.schemas.ts
import { z } from 'zod';

export const sysAdminInvoiceItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
});

export const sysAdminInvoiceCreateSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant'),
  invoiceNumber: z.string().min(1).max(50),
  tax: z.coerce.number().min(0).default(0),
  status: z.enum(['DRAFT', 'SENT']).default('DRAFT'),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  notes: z.string().max(2000).optional().or(z.literal('')),
  items: z.array(sysAdminInvoiceItemSchema).min(1),
});
```

### Send Invoice Action Pattern
```typescript
// Source: adapted from src/app/(owner)/actions/invoices.ts + src/app/(admin)/actions/tenants.ts
'use server';

export async function sendSysAdminInvoice(invoiceId: string) {
  await requireAdminAccess();

  const invoice = await prisma.sysAdminInvoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, tenant: { select: { name: true } } },
  });
  if (!invoice || invoice.status !== 'DRAFT') {
    return { error: 'Invoice not found or not in DRAFT status' };
  }

  // Transition to SENT
  await prisma.sysAdminInvoice.update({
    where: { id: invoiceId },
    data: { status: 'SENT', sentAt: new Date() },
  });

  // Find tenant owner email
  const owner = await prisma.user.findFirst({
    where: { tenantId: invoice.tenantId, role: 'OWNER', isActive: true },
    select: { email: true, firstName: true },
  });

  if (owner) {
    try {
      await sendSysAdminInvoiceEmail(owner.email, { ...invoice, ownerName: owner.firstName });
    } catch (err) {
      console.error('[sendSysAdminInvoice] email failed:', err);
      revalidatePath('/billing');
      return { success: true, emailWarning: `Invoice sent but email could not be delivered to ${owner.email}.` };
    }
  }

  revalidatePath('/billing');
  revalidatePath(`/tenants/${invoice.tenantId}`);
  return { success: true };
}
```

### Overdue Cron Route
```typescript
// Source: pattern from src/app/api/cron/auto-close-tickets/route.ts
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  let updated = 0;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.sysAdminInvoice.updateMany({
        where: { status: 'SENT', dueDate: { lt: now }, archivedAt: null },
        data: { status: 'OVERDUE' },
      });
    }, TX_OPTIONS);
    updated = result.count;
  } catch (error) {
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }

  return Response.json({ success: true, markedOverdue: updated });
}
```

### Vercel.json cron entry (addition)
```json
{
  "path": "/api/cron/mark-overdue-invoices",
  "schedule": "0 6 * * *"
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Resend SDK (RESEND_API_KEY) | Gmail SMTP via Nodemailer (GMAIL_USER + GMAIL_APP_PASSWORD) | All new email senders must use `gmail-client.ts`, not `resend-client.ts` |
| No invoice number scoping | `@@unique([tenantId, invoiceNumber])` for tenant invoices | SysAdmin invoices only need `@unique` — single namespace |

**Note on Resend:** `src/lib/email/resend-client.ts` exists in the codebase but NO send function imports from it. All active senders (`send-maintenance-reminder.ts`, `send-support-notifications.ts`, etc.) import from `gmail-client.ts`. The resend client appears to be a legacy or unused file. Use `gmail-client.ts`.

---

## Open Questions

1. **Named relations for `createdById`/`updatedById` on `SysAdminInvoice`**
   - What we know: The tenant `Invoice` model has named relations `InvoiceCreatedBy` / `InvoiceUpdatedBy` pointing to `User`. Prisma requires named relations when multiple FK fields point to the same model.
   - What's unclear: Whether the planner wants full audit trail display (requires named relations) or just ID storage.
   - Recommendation: Include named relations to match the pattern of `Invoice`, `PayrollRecord`, etc. The cost is low and audit trail has been present in every financial model so far.

2. **Manual "mark overdue" trigger vs. cron-only**
   - What we know: The context says "cron or manual trigger." The cron pattern is well-established. A manual trigger would be a server action button on the billing dashboard.
   - What's unclear: Whether admins need same-day overdue marking outside cron schedule.
   - Recommendation: Implement both — a cron for nightly automation and a "Run Overdue Check" button on the billing dashboard for manual use. The cron action function can be called from the manual trigger too.

3. **Billing history on tenant detail page — tab or section?**
   - What we know: The tenant detail page (`/tenants/[id]/page.tsx`) currently has two cards in a two-column grid. Adding billing history would be a third section.
   - What's unclear: Whether to inline the history in the page or add a tab-based navigation.
   - Recommendation: Add a third full-width Card below the existing two-column grid. Keep it simple — no tabs. The admin portal uses plain Cards throughout, no tab components.

---

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma` — all existing models, field types, unique constraints, index patterns
- `src/app/(admin)/` — full sysadmin portal structure, layout, nav, page patterns, table UI
- `src/app/(admin)/actions/tenants.ts` — `requireAdminAccess()` guard, cross-tenant Prisma usage, `revalidatePath`, error handling pattern
- `src/app/(owner)/actions/invoices.ts` — complete invoice CRUD pattern with Decimal arithmetic
- `src/app/(owner)/invoices/` — all four invoice pages (list, new, detail, edit)
- `src/components/invoices/` — `InvoiceForm`, `InvoiceItemsEditor`, `DeleteInvoiceButton`, `MarkAsPaidButton`
- `src/lib/validations/invoice.schemas.ts` — Zod schema patterns
- `src/lib/email/gmail-client.ts` — active email transport, `sendEmail` interface
- `src/lib/email/send-maintenance-reminder.ts` + `send-support-notifications.ts` — send function patterns
- `src/emails/maintenance-reminder.tsx` — React Email template pattern + branding
- `src/app/api/cron/auto-close-tickets/route.ts` — cron route pattern with `bypass_rls`
- `src/app/api/cron/send-reminders/route.ts` — multi-tenant cron pattern with CRON_SECRET
- `vercel.json` — cron registration format

### Secondary (MEDIUM confidence)
- N/A — all findings are from the live codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package usage in codebase
- Architecture: HIGH — all patterns directly observed in existing code
- DB schema: HIGH — model design follows documented patterns exactly
- Pitfalls: HIGH — derived from actual code reading, not speculation
- Email pattern: HIGH — gmail-client is the live transport used by all senders

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable codebase, 30-day window)
