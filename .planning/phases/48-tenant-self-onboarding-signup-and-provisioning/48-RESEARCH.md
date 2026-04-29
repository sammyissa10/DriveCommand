# Phase 48: Tenant Self-Onboarding — Signup and Provisioning - Research

**Researched:** 2026-04-28
**Domain:** Supabase Auth provisioning, Prisma bypass_rls transactions, AES-GCM token helpers, React Email templates
**Confidence:** HIGH — all findings verified directly from codebase files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary**
Everything from the blank `/sign-up` form through atomic tenant creation, sample data seeding by fleet size, email confirmation token generation and redemption, and first landing at `/onboarding/welcome`. Three plans: B-01 provisioning logic, B-02 signup page + server action, B-03 email confirmation + templates.

Phase C (onboarding checklist UX, sample data banner, activation tracking) is explicitly out of scope. This phase ends when: the owner is logged in, sample data is seeded, and the confirmation email has been sent.

**Provisioning transaction (B-01)**
- All 14 steps in spec section 6.1 happen inside a single Prisma transaction with `bypass_rls = on`
- `bypass_rls = on` scoped ONLY to this signup transaction; never leaks to other tenant code paths
- If any step fails before commit, the entire transaction rolls back — no half-provisioned tenants
- Password: bcrypt, 12 rounds, matching existing `src/lib/auth/` pattern
- Slug: lowercase kebab-case from companyName, numeric suffix on collision
- Trial length: `plan.defaultTrialDays + (promo?.bonusTrialDays ?? 0)` computed at signup, stored as `trialEndsAt` on Subscription
- Promo lookup: read from `?promo=` URL param; only apply if promo is active, within date range, and under maxRedemptions
- Stripe deferred: `stripeCustomerId` and `stripeSubscriptionId` left NULL

**Sample data seeding (B-01)**
- Fork by `fleetSizeBucket`: OWNER_OPERATOR: 1 truck/1 driver/1 client/1 completed load/1 in-transit load; SMALL/MEDIUM/LARGE: 3 trucks/3 drivers/2 clients/1 completed+2 in-transit
- All `isSample = true`
- Seeded on first landing (hydration), NOT during signup transaction
- `hydrateTenant` is idempotent: returns immediately if `provisioningPhase = HYDRATED`

**Email confirmation token (B-01)**
- Single-use, 24-hour expiry, AES-256-GCM signed
- Invalidated on first redemption — second click must fail
- Redeemed marker stored in DB

**Signup server action (B-02)**
- On success: set session cookie → fire `tenant.created` event → redirect to `/onboarding/welcome`
- On duplicate email: identical response, send "you already have an account" email, pad response time within 100ms
- Rate limit: 10/IP/hour, in-memory Map

**Public routing (B-02/B-03)**
- `/sign-up`, `/onboarding/welcome`, `/api/email-confirm/*` must be added to public route allowlist in `src/middleware.ts`

**Email templates (B-03)**
- `welcome-owner.tsx`: FROM named human ("Tom from DriveCommand"), Reply-To to real inbox
- `confirm-email.tsx`: single-use link to `/api/email-confirm/[token]`
- Via existing Gmail SMTP at `src/lib/email/gmail-client.ts`
- Using `@react-email/components`

**Session**
- Existing AES-256-GCM session cookie from `src/lib/auth/session.ts`

### Claude's Discretion
- Visual design of `/sign-up` page
- Loading/error/success states in the signup form
- Email template visual style
- Exact redeemed-token invalidation storage mechanism

### Deferred Ideas (OUT OF SCOPE)
- Phase C: onboarding checklist UX, sample data banner, activation tracking
</user_constraints>

---

## Summary

Phase 48 wires together a self-serve signup flow: form → atomic provisioning transaction → Supabase Auth user + session cookie → sample data hydration → email confirmation token. All patterns are established in the codebase; this phase assembles them into a new flow rather than introducing new technology.

The most important thing to understand: **the app uses Supabase Auth for session management, not a custom cookie**. "Set session cookie" in the CONTEXT.md means calling `supabase.auth.signInWithPassword()` after creating the user via the admin client — Supabase's SSR library automatically writes the session cookie. There is no custom `session.ts` with an `encrypt`/`decrypt` helper; that file referenced in CONTEXT.md does not exist. The AES-GCM work is **new** — it must be built for the email confirmation token.

The bypass_rls pattern, bcrypt rounds, Prisma TX_OPTIONS, and email send signature are all established. The `/sign-up` page currently has a placeholder stub that must be replaced entirely.

**Primary recommendation:** Follow the `accept-invitation` route as the gold-standard template for the provisioning transaction — it shows bypass_rls, Supabase admin client user creation, and signInWithPassword session cookie all in one file.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bcryptjs` | `^3.0.3` | Password hashing | Already installed (`apps/web/package.json:96`); used in seed.ts at 12 rounds |
| `@supabase/supabase-js` | existing | Admin client — create user, update app_metadata | Pattern from `accept-invitation` route |
| `@supabase/ssr` | existing | Server client — set session cookie via signInWithPassword | Pattern from `login` route |
| `@react-email/components` | existing | Email template components | Already used in 20+ templates |
| `nodemailer` | existing | SMTP transport | `gmail-client.ts` |
| `nanoid` | existing | Generate unique IDs | Used in `gmail-client.ts` |
| `crypto` (Node built-in) | — | AES-256-GCM token encrypt/decrypt | Used in Node.js without install; used for slug UUID suffix in `tenant.repository.ts` |
| `zod` | existing | Input validation schemas | Used in all server actions and via `@drivecommand/validation` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@upstash/ratelimit` | existing | Per-IP rate limiting | Signup endpoint (10/IP/hour) |
| `@upstash/redis` | existing | Redis backing for rate limiter | Same as above |
| `prisma` (TX_OPTIONS) | existing | Shared transaction options | All bypass_rls transactions |

---

## Architecture Patterns

### Recommended File Structure

```
apps/web/src/
├── app/
│   ├── (auth)/
│   │   └── sign-up/[[...sign-up]]/
│   │       └── page.tsx              — replace existing stub with 6-field form
│   ├── onboarding/
│   │   ├── page.tsx                  — existing (redirect logic for no-tenant users)
│   │   └── welcome/
│   │       └── page.tsx              — NEW: post-signup landing (add to PUBLIC_PATHS)
│   └── api/
│       └── email-confirm/
│           └── [token]/
│               └── route.ts          — NEW: GET handler, validate + redeem token
├── lib/
│   ├── auth/
│   │   └── email-token.ts            — NEW: AES-256-GCM encrypt/decrypt for confirm token
│   └── onboarding/
│       ├── provision-tenant.ts       — NEW: 14-step atomic bypass_rls transaction
│       ├── seed-sample-data.ts       — NEW: fleet-size-forked sample data creator
│       └── hydrate-tenant.ts         — NEW: idempotent wrapper (MINIMAL → HYDRATED)
├── actions/
│   └── signup.ts                     — NEW: signUpAction server action
└── emails/
    ├── welcome-owner.tsx             — NEW: post-signup welcome with human FROM
    └── confirm-email.tsx             — NEW: single-use confirmation link
```

### Pattern 1: bypass_rls Prisma Transaction

The established pattern for all pre-auth or cross-tenant writes. Verified in `tenant.repository.ts` (line 31-52) and `accept-invitation/route.ts` (lines 117-122, 209-249).

```typescript
// Source: apps/web/src/lib/db/repositories/tenant.repository.ts:31
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

const result = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  // ... all writes here ...
  return something;
}, TX_OPTIONS);
```

TX_OPTIONS (from `apps/web/src/lib/db/prisma.ts:53`):
```typescript
export const TX_OPTIONS = { maxWait: 15000, timeout: 30000 } as const;
```

**Critical:** The `set_config` call is `TRUE` (transaction-scoped), meaning it automatically resets after the transaction closes. This is how bypass_rls stays scoped to only this transaction.

### Pattern 2: Supabase Auth User Creation + Session

From `apps/web/src/app/api/auth/accept-invitation/route.ts`:

```typescript
// Step 1 — Create Supabase Auth user (admin client)
const admin = createAdminClient();
const { data: authData, error: authError } = await admin.auth.admin.createUser({
  email: userEmail,
  password,
  email_confirm: true,           // skip Supabase's built-in confirm flow
  user_metadata: {
    firstName: '...',
    lastName: '...',
  },
  app_metadata: {                // security claims — tamper-proof
    role: 'OWNER',
    tenantId: tenant.id,
    isSystemAdmin: false,
  },
});

// Step 2 — Sign in to set session cookie (SSR client)
const supabase = await createSupabaseServerClient();
await supabase.auth.signInWithPassword({ email: userEmail, password });
```

**Important:** `email_confirm: true` on admin.auth.admin.createUser bypasses Supabase's own email flow. DriveCommand sends its own confirmation email separately (Phase B-03). The Supabase session is valid immediately.

**After `signInWithPassword`:** The `@supabase/ssr` library writes the session cookie automatically. No manual cookie manipulation is needed. The redirect to `/onboarding/welcome` will work because middleware reads the Supabase cookie.

### Pattern 3: Session Reading

From `apps/web/src/lib/auth/supabase.ts:41`:

```typescript
export const getSession = cache(async function getSession(): Promise<SessionData | null> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Security claims from app_metadata
  const appMeta = user.app_metadata || {};
  return {
    userId: user.id,
    email: user.email!,
    role: appMeta.role || 'DRIVER',
    tenantId: appMeta.tenantId || '',
    ...
  };
});
```

The signup action's redirect to `/onboarding/welcome` will have a valid session with `tenantId` set (because app_metadata is set during user creation).

### Pattern 4: Email Send

From `apps/web/src/lib/email/gmail-client.ts`:

```typescript
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }>
```

**Gotcha — Reply-To not in current interface:** `SendEmailOptions` does not have a `replyTo` field. The CONTEXT.md requires a Reply-To on the welcome email. Two options:
1. Extend `SendEmailOptions` to add optional `replyTo?: string` and pass it to `transporter.sendMail()`
2. Create a separate `sendEmailWithReplyTo` wrapper

Nodemailer supports `replyTo` natively in `sendMail` options. Extending the interface is the cleaner approach — add `replyTo?: string` to `SendEmailOptions` and pass it through.

### Pattern 5: Email Template Structure

From `apps/web/src/emails/driver-invitation.tsx`:

```typescript
import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components';

interface MyEmailProps { ... }

export function MyEmail({ ... }: MyEmailProps) {
  return (
    <Html><Head /><Body style={styles.body}>
      <Container style={styles.container}>
        ...
      </Container>
    </Body></Html>
  );
}

const styles = { ... }; // inline style objects
```

Caller pattern (from `send-driver-invitation.ts`):
```typescript
import { MyEmail } from '@/emails/my-email';
return sendEmail({ to, subject, react: MyEmail({ ...props }) });
```

### Pattern 6: Slug Generation

The existing `generateSlug` in `tenant.repository.ts` always appends a random UUID suffix. For self-onboarding, slug collision via numeric suffix needs different logic. Implement fresh in `provision-tenant.ts`:

```typescript
function generateSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// In the transaction: check for collision, append -2, -3, etc.
let slug = generateSlug(companyName);
const existing = await tx.tenant.findFirst({ where: { slug } });
if (existing) slug = `${slug}-2`; // or loop for -2, -3, etc.
```

### Pattern 7: AppEvent Write

`AppEvent` table exists in schema (lines 2313-2326). No `emitEvent` utility function exists in the codebase — there is no event bus. The signup action must write directly:

```typescript
await tx.appEvent.create({
  data: {
    tenantId: tenant.id,
    userId: user.id,
    eventType: 'tenant.created',
    properties: { planKey, promoCode, fleetSizeBucket },
  },
});
```

`AppEvent.tenantId` is required (not nullable). Write it inside the provisioning transaction or immediately after.

### Pattern 8: Bcrypt Usage

From `apps/web/prisma/seed.ts:21-23`:
```typescript
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('password', 12);
```

Package is `bcryptjs` (not `bcrypt`). 12 rounds established in seed and in migration comment. The `User.passwordHash` field accepts `String?` — passwords are primarily managed by Supabase Auth. The `passwordHash` field stores the hash but Supabase Auth is the authority for signInWithPassword.

### Anti-Patterns to Avoid

- **Do not use `withTenantRLS` extension for provisioning:** `getTenantPrisma()` / `createTenantClient()` from `tenant-context.ts` injects tenantId into all queries. During provisioning no tenantId exists yet. Use raw `prisma.$transaction` with manual bypass_rls instead.
- **Do not redirect to `/onboarding` for new owners:** Middleware at line 141-149 redirects users with no `tenantId` to `/onboarding`. After signup the user WILL have a tenantId in app_metadata. The redirect to `/onboarding/welcome` bypasses this check because the user has a tenantId.
- **Do not use `prisma.tenant.findUnique` for email uniqueness check:** User uniqueness is `@@unique([email, tenantId])` on the User model, but cross-tenant email checks need bypass_rls and a `findFirst` without tenantId filter.
- **Do not call `prisma.$transaction` with the array form for multi-step logic:** The function/callback form (`async (tx) => { ... }`) is required for multi-step transactions. The array form (sequential execution) is only for two-step read patterns.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie | Custom cookie | `supabase.auth.signInWithPassword()` | @supabase/ssr handles HttpOnly, Secure, SameSite automatically |
| User creation in Supabase | Direct REST API | `createAdminClient().auth.admin.createUser()` | Handles password hashing, email confirmation, metadata |
| Email HTML rendering | Manual string concat | `@react-email/render` (already in `sendEmail`) | Handles inline styles, client compatibility |
| Rate limiting persistence | Custom Map + setInterval | Upstash Ratelimit (already in `rate-limit.ts`) | Note: CONTEXT.md says "in-memory Map" for signup — acceptable for this endpoint |
| Slug uniqueness at DB | Application retry loop | DB `@@unique` constraint + catch + retry | Transaction rollback on violation is cleaner than pre-checking |

---

## Common Pitfalls

### Pitfall 1: Middleware Blocks `/onboarding/welcome`

**What goes wrong:** `/onboarding/welcome` is not in `PUBLIC_PATHS`. After signup the user has a session + tenantId, so middleware lets them through — but if they arrive before the cookie is fully written, they hit the no-tenantId redirect at line 141.

**Why it happens:** Cookie writes from `signInWithPassword` happen in the same request cycle, but `redirect()` from a server action happens before the response is sent. The cookie is written by the Supabase SSR library into the response object.

**How to avoid:** Add `/onboarding/welcome` to `PUBLIC_PATHS` in `middleware.ts` (line 47-66). The welcome page itself reads the session and shows appropriate content if not logged in.

**Warning signs:** Redirect loop between `/onboarding/welcome` and `/onboarding`.

### Pitfall 2: `email_confirm: true` vs. DriveCommand Confirm Flow

**What goes wrong:** Setting `email_confirm: true` tells Supabase the email is already confirmed (skips Supabase's OTP flow). DriveCommand sends its own AES-GCM confirmation token separately. If you DON'T set `email_confirm: true`, Supabase blocks sign-in until Supabase's own email is confirmed — but that email is never sent because the Gmail SMTP path is used instead.

**How to avoid:** Always pass `email_confirm: true` to `admin.auth.admin.createUser()`. Track DriveCommand's own confirmation state via `Tenant.emailConfirmedAt`.

### Pitfall 3: AES-256-GCM Token — No Existing Helper

**What goes wrong:** CONTEXT.md references "existing AES-256-GCM session cookie from `src/lib/auth/session.ts`" — but that file does not exist. The web app uses Supabase's cookie (not a custom AES session). There are NO existing AES-GCM crypto helpers in `apps/web/src`.

**How to avoid:** Build `apps/web/src/lib/auth/email-token.ts` from scratch using Node's built-in `crypto` module:
- `crypto.randomBytes(12)` for the 96-bit IV (GCM standard)
- `crypto.createCipheriv('aes-256-gcm', key, iv)` for encryption
- Key sourced from `process.env.EMAIL_TOKEN_SECRET` (32-byte hex → `Buffer.from(secret, 'hex')`)
- Output: `iv.hex + ':' + ciphertext.hex + ':' + authTag.hex` stored as URL-safe base64 or hex string

### Pitfall 4: Email Confirmation Token Invalidation Storage

**What goes wrong:** No `EmailConfirmToken` table exists in the schema. The token must be invalidated after first use. The CONTEXT.md leaves storage mechanism to Claude's discretion.

**Recommendation:** Use `Tenant.emailConfirmedAt` as the invalidation marker. Logic:
- Generate token containing `{ tenantId, expiresAt }` signed/encrypted
- On redemption: verify signature, check expiry, check `tenant.emailConfirmedAt IS NULL`
- Set `tenant.emailConfirmedAt = NOW()` in the same transaction
- Second click: `emailConfirmedAt` is non-null → return "already confirmed"

This avoids adding a new table and uses an existing nullable column already on Tenant (schema line 133).

### Pitfall 5: Sample Data Load Requires Customer FK

**What goes wrong:** The `Load` model requires `customerId` (non-nullable FK to `Customer`). Sample data seeding must create the Customer record BEFORE the Load record within the same transaction or in the correct order.

**Schema constraint:** `Load.customerId String @db.Uuid` — not nullable. `Load.loadNumber` is `@@unique([tenantId, loadNumber])` — sample loads need distinct numbers.

**How to avoid:** In `seed-sample-data.ts`, create trucks → customers → loads (in that dependency order). Assign the first sample customer's ID to all sample loads.

### Pitfall 6: Rate Limiting — In-Memory Map vs. Upstash

**What goes wrong:** CONTEXT.md specifies "10/IP/hour, in-memory Map" for the signup rate limit. This differs from every other rate limiter in the codebase (Upstash-based). An in-memory Map resets on cold starts (serverless) and is not shared across instances.

**Assessment:** For signup (low-frequency action, cold starts acceptable), in-memory is sufficient. But if the app is deployed across multiple Vercel instances simultaneously, each instance has its own Map. This is acceptable per the CONTEXT.md decision.

**Implementation:** Use `Map<string, { count: number; resetAt: number }>` at module level, prune expired entries on each check.

### Pitfall 7: Promo Redemption Counter Race Condition

**What goes wrong:** Two signups with the same promo code can simultaneously read `redemptionCount < maxRedemptions`, both pass the check, both insert, both increment — total redemptions exceed `maxRedemptions`.

**How to avoid:** Inside the provisioning transaction (which is serialized by Postgres), use an atomic increment with check:
```sql
UPDATE "Promo" SET "redemptionCount" = "redemptionCount" + 1
WHERE id = $promoId AND ("maxRedemptions" IS NULL OR "redemptionCount" < "maxRedemptions")
RETURNING id
```
If 0 rows updated, the promo is exhausted — roll back. In Prisma raw:
```typescript
const updated = await tx.$executeRaw`
  UPDATE "Promo" SET "redemptionCount" = "redemptionCount" + 1
  WHERE id = ${promoId}::uuid AND ("maxRedemptions" IS NULL OR "redemptionCount" < "maxRedemptions")
`;
if (updated === 0) throw new Error('Promo code is no longer available');
```

### Pitfall 8: `/onboarding/welcome` Route Collision with Existing Middleware Logic

**What goes wrong:** Middleware at lines 141-149 redirects users with no `tenantId` to `/onboarding`. The existing `/onboarding` page at `apps/web/src/app/onboarding/page.tsx` redirects users WITH a tenantId to `/carrier/dashboard`. The new `/onboarding/welcome` is a subpath of `/onboarding`.

**How middleware handles it:** Line 145: `const isOnboardingPath = pathname.startsWith('/onboarding')` — this INCLUDES `/onboarding/welcome`. So new owners (who have a tenantId) will NOT be redirected away from `/onboarding/welcome` by this block. They'll pass through to the System admin guard and then DRIVER guard — both pass for OWNER role. Safe.

**But:** Add `/onboarding/welcome` explicitly to PUBLIC_PATHS anyway for pre-session access (e.g., arriving from the email link after cookie expires).

---

## Code Examples

### Verified Pattern: bypass_rls Transaction

```typescript
// Source: apps/web/src/lib/db/repositories/tenant.repository.ts:31-52
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

const result = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

  const tenant = await tx.tenant.create({
    data: {
      name: data.companyName,
      slug: generateSlug(data.companyName),
      users: {
        create: { id: data.ownerId, email: data.ownerEmail, role: 'OWNER' },
      },
    },
    include: { users: true },
  });

  return tenant;
}, TX_OPTIONS);
```

### Verified Pattern: Supabase Admin User Create + Sign In

```typescript
// Source: apps/web/src/app/api/auth/accept-invitation/route.ts:173-253
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Create user (admin client — bypasses RLS, sets app_metadata)
const admin = createAdminClient();
const { data: authData, error: authError } = await admin.auth.admin.createUser({
  email: userEmail,
  password,
  email_confirm: true,
  user_metadata: { firstName, lastName },
  app_metadata: { role: 'OWNER', tenantId: tenant.id, isSystemAdmin: false },
});

// Sign in to write session cookie (SSR client)
const supabase = await createSupabaseServerClient();
await supabase.auth.signInWithPassword({ email: userEmail, password });

// Redirect — cookie is now set by @supabase/ssr
return NextResponse.json({ success: true, redirectUrl: '/onboarding/welcome' });
```

### Verified Pattern: Email Send

```typescript
// Source: apps/web/src/lib/email/send-driver-invitation.ts
import { sendEmail } from '@/lib/email/gmail-client';
import { WelcomeOwnerEmail } from '@/emails/welcome-owner';

await sendEmail({
  to: ownerEmail,
  subject: 'Welcome to DriveCommand',
  react: WelcomeOwnerEmail({ firstName, companyName, confirmUrl }),
});
```

**To add Reply-To**, extend `SendEmailOptions` in `gmail-client.ts`:
```typescript
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;  // ADD THIS
}

// In sendEmail():
await transporter.sendMail({
  from: FROM_EMAIL,
  to: toAddresses,
  subject: options.subject,
  html,
  replyTo: options.replyTo,  // ADD THIS (nodemailer supports it natively)
});
```

### Verified Pattern: Bcrypt (12 rounds)

```typescript
// Source: apps/web/prisma/seed.ts:21-23
import bcrypt from 'bcryptjs';  // note: bcryptjs not bcrypt
const hash = await bcrypt.hash(password, 12);
```

### New Pattern: AES-256-GCM Token (must build)

```typescript
// apps/web/src/lib/auth/email-token.ts  (NEW FILE)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const KEY = Buffer.from(process.env.EMAIL_TOKEN_SECRET!, 'hex'); // 32-byte key

export function encryptToken(payload: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:ciphertext:tag all hex-encoded, joined
  return [iv.toString('hex'), encrypted.toString('hex'), tag.toString('hex')].join(':');
}

export function decryptToken(token: string): object | null {
  try {
    const [ivHex, encHex, tagHex] = token.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null; // tampered or invalid
  }
}
```

**Environment variable needed:** `EMAIL_TOKEN_SECRET` — 64 hex chars (32 bytes). Must be added to `.env.local` and Vercel.

---

## Schema Confirmation (Phase 47 Tables)

All Phase 47 tables verified present in `apps/web/prisma/schema.prisma`:

| Model | Key Fields | Verified |
|-------|-----------|---------|
| `Plan` | `id`, `key`, `name`, `defaultTrialDays`, `monthlyPriceCents`, `yearlyPriceCents`, `maxTrucks`, `maxUsers`, `isActive`, `stripeProductId` | Line 2185 |
| `Promo` | `id`, `code`, `bonusTrialDays`, `discountPct`, `activeFrom`, `activeTo`, `maxRedemptions`, `redemptionCount`, `isActive` | Line 2207 |
| `Subscription` | `id`, `tenantId` (unique), `planId`, `promoId`, `status`, `trialEndsAt`, `stripeCustomerId` (nullable), `stripeSubscriptionId` (nullable) | Line 2227 |
| `ActivationProgress` | `id`, `tenantId` (unique), `accountCreatedAt`, `completionPct`, `isActivated` | Line 2252 |
| `AppEvent` | `id`, `tenantId`, `userId` (nullable), `eventType`, `properties`, `createdAt` | Line 2313 |

Enums verified:
- `FleetSizeBucket`: `OWNER_OPERATOR`, `SMALL`, `MEDIUM`, `LARGE` (line 1357)
- `TenantStatus`: `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED` (line 1364)
- `ProvisioningPhase`: `MINIMAL`, `HYDRATED` (line 1372)
- `SubscriptionStatus`: `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `SUSPENDED` (line 1377)

### isSample Columns Confirmed

| Model | Field | Schema Line |
|-------|-------|------------|
| `User` | `isSample Boolean @default(false)` | 215 |
| `Truck` | `isSample Boolean @default(false)` | 273 |
| `Customer` | `isSample Boolean @default(false)` | 744 |
| `Load` | `isSample Boolean @default(false)` | 1005 |

The seed target is `Customer` (not `CarrierClient`) — confirmed: `Customer` is the CRM model with `tenantId`.

### Tenant Fields for Provisioning

On the `Tenant` model (lines 119-198):
- `slug String @unique` — kebab-case, globally unique
- `fleetSizeBucket FleetSizeBucket @default(OWNER_OPERATOR)`
- `status TenantStatus @default(ACTIVE)` — new tenants should be `TRIAL`
- `emailConfirmedAt DateTime? @db.Timestamptz` — null until confirmed, used as invalidation marker
- `sampleDataSeeded Boolean @default(false)` — set to `true` after hydration
- `provisioningPhase ProvisioningPhase @default(MINIMAL)` — `HYDRATED` after sample data seeded

---

## Middleware — Exact Changes Required

File: `apps/web/src/middleware.ts`, line 47-66.

Current `PUBLIC_PATHS`:
```
'/sign-in', '/sign-up', '/forgot-password', '/reset-password',
'/accept-invitation', '/api/auth/login', '/api/auth/logout',
'/api/auth/accept-invitation', '/api/auth/callback',
'/api/health', '/api/warmup', '/api/webhooks', '/track',
'/_next/static', '/_next/image', '/favicon.ico', '/favicon.png', '/site.webmanifest'
```

**Add these three entries:**
```typescript
'/onboarding/welcome',      // post-signup landing page
'/api/email-confirm',       // GET email confirmation token handler
```

Note: `/sign-up` is already in `PUBLIC_PATHS` (line 49). No change needed there.

Note: `/onboarding` is NOT in PUBLIC_PATHS — it is handled by middleware logic at line 141-149 which allows no-tenantId users through to `/onboarding`. Do NOT add `/onboarding` to PUBLIC_PATHS as that would let unauthenticated users bypass auth checks.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Custom password auth (Clerk) | Supabase Auth `signInWithPassword` | Session cookie is set by @supabase/ssr automatically |
| Resend email API | Gmail SMTP via Nodemailer | `sendEmail()` signature unchanged |
| Custom session.ts with AES cookie | Supabase cookie-based session | No custom AES session cookie exists |
| Direct Prisma writes (no RLS) | bypass_rls transaction pattern | Must use `tx.$executeRaw` set_config |

**Note on "existing AES-256-GCM session cookie":** This is a misconception in the CONTEXT.md. The web app migrated from Clerk to Supabase Auth. The `src/lib/auth/session.ts` file referenced was the old Clerk session wrapper — it no longer exists. The AES-256-GCM work for email confirmation tokens must be built from scratch in a new `src/lib/auth/email-token.ts`.

---

## Open Questions

1. **`Tenant.status` initial value for new self-signup tenants**
   - What we know: enum has `TRIAL`, `ACTIVE`, etc. Schema default is `ACTIVE`.
   - What's unclear: Should self-signup tenants start as `TRIAL` (matching TenantStatus) or `ACTIVE`?
   - Recommendation: Override default, set `status: TenantStatus.TRIAL` during provisioning.

2. **`EMAIL_TOKEN_SECRET` environment variable**
   - What we know: Does not exist yet. Must be 64 hex chars (32 bytes).
   - What's unclear: Has the user set this up locally or in Vercel?
   - Recommendation: Plan must include a step to generate and document this env var.

3. **`User.role` in Prisma vs. `UserRole` enum**
   - What we know: Schema has `UserRole { OWNER MANAGER DRIVER }`. `roles.ts` has `UserRole.OWNER = 'OWNER'`. Prisma generated client uses the same enum.
   - What's unclear: The `accept-invitation` route passes `role: 'OWNER'` as a string literal to `app_metadata`. The Prisma User creation uses the Prisma enum.
   - Recommendation: For `app_metadata`, use string `'OWNER'`. For Prisma User.role, use `UserRole.OWNER` from the generated client.

4. **Default Plan selection during signup**
   - What we know: Plan table exists with a `key` field and `isActive`. The CONTEXT.md says promo from `?promo=` URL param.
   - What's unclear: Which plan key is the default "starter" plan? Tenant has a legacy `plan String @default("starter")` field AND a new Subscription.planId FK.
   - Recommendation: The provisioning logic must query `Plan.findFirst({ where: { key: 'starter', isActive: true } })` to get the default plan ID. This query needs bypass_rls since Plan has no tenantId.

5. **`Load.loadNumber` for sample data**
   - What we know: `@@unique([tenantId, loadNumber])` — tenant-scoped unique.
   - What's unclear: Sample load numbers must be unique within the new tenant.
   - Recommendation: Use short deterministic values like `'SAMPLE-001'`, `'SAMPLE-002'`.

---

## Sources

### Primary (HIGH confidence)
- `apps/web/src/middleware.ts` — PUBLIC_PATHS array, middleware logic
- `apps/web/src/lib/db/repositories/tenant.repository.ts` — bypass_rls transaction pattern
- `apps/web/src/app/api/auth/accept-invitation/route.ts` — admin.createUser + signInWithPassword pattern
- `apps/web/src/lib/auth/supabase.ts` — SessionData interface, getSession() implementation
- `apps/web/src/lib/email/gmail-client.ts` — sendEmail() signature, SendEmailOptions interface
- `apps/web/src/lib/db/prisma.ts` — TX_OPTIONS definition
- `apps/web/src/lib/db/extensions/tenant-rls.ts` — why raw prisma (not tenant client) is needed
- `apps/web/prisma/schema.prisma` — all Phase 47 models, isSample columns, enums, Tenant fields
- `apps/web/prisma/seed.ts` — bcryptjs import, 12 rounds pattern
- `apps/web/package.json` — bcryptjs@^3.0.3 confirmed installed
- `apps/web/src/lib/supabase/admin.ts` — createAdminClient() implementation
- `apps/web/src/lib/supabase/server.ts` — createSupabaseServerClient() implementation
- `apps/web/src/app/(auth)/layout.tsx` — auth layout (background image, logo, centered)
- `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — existing stub (to be replaced)
- `apps/web/src/lib/app-url.ts` — getAppBaseUrl() for building confirmation URLs
- `apps/web/src/lib/rate-limit.ts` — applyRateLimit() pattern, existing limiters

### Secondary (MEDIUM confidence)
- `apps/web/src/emails/driver-invitation.tsx` — email template structure pattern
- `apps/web/src/lib/email/send-driver-invitation.ts` — email send wrapper pattern
- `apps/web/src/app/onboarding/page.tsx` — existing onboarding page (redirect logic)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json and imported in codebase
- Architecture: HIGH — patterns verified from existing files (accept-invitation, tenant.repository)
- Pitfalls: HIGH — derived from actual code inspection, not assumptions
- Schema fields: HIGH — read directly from prisma/schema.prisma
- AES-GCM token: MEDIUM — pattern is standard Node.js crypto; no existing helper to copy from

**Research date:** 2026-04-28
**Valid until:** 60 days (schema is stable, Supabase SSR patterns rarely break)
