# Phase 4: Driver Management - Research

**Researched:** 2026-02-14
**Domain:** Invite-based driver provisioning, user management, and account lifecycle with Clerk and Next.js Server Actions
**Confidence:** HIGH

## Summary

Phase 4 implements invite-based driver account provisioning on top of the existing multi-tenant authentication system (Phase 2) and follows the CRUD patterns established in truck management (Phase 3). The critical difference from truck management is that drivers are users with authentication credentials, not just database entities. This requires coordinating between Clerk (authentication), database (User table), and email delivery (invitations).

**Critical insight:** Clerk provides two distinct invitation flows: (1) Application Invitations for B2C apps where users accept invites before signing up, and (2) Organization Invitations for B2B multi-tenant apps. DriveCommand is a **multi-tenant B2B app with custom tenant model**, not using Clerk Organizations. We need Application Invitations combined with manual User record creation and role assignment via publicMetadata/privateMetadata, following the existing pattern from the Phase 1 webhook (see `/api/webhooks/clerk/route.ts`).

**Deactivation vs. Deletion:** Prior decision specifies hard deletes for v1 (ROADMAP.md). However, for users with authentication credentials, deactivation is the safer pattern: it prevents login while preserving audit trails and foreign key references (route assignments, maintenance records). Recommendation: implement deactivation via `isActive` boolean field (follows existing Tenant pattern), defer hard deletion to later phase.

**Primary recommendation:** Use Clerk's `createInvitation()` Backend API to generate invite emails, store pending invitations in new `DriverInvitation` table, create User record on successful sign-up via webhook listener, set role to DRIVER in publicMetadata and link to tenant via privateMetadata, implement deactivation via `isActive` boolean field on User model, use same CRUD patterns as truck management (Zod schemas, Server Actions, TanStack Table list view), and integrate Resend + react-email for custom invitation templates (Clerk's default emails lack branding customization).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Clerk Invitations API | Latest (2026) | Generate invite links and send emails | Official Clerk Backend SDK `createInvitation()` method; handles invite generation, expiry (30 days default), and email delivery |
| React 19 | ^19.0.0 (installed) | UI with form hooks | Same as Phase 3—`useActionState` for driver forms |
| Next.js 16 | ^16.0.0 (installed) | Server Actions for CRUD | Same as Phase 3—Server Actions for invite/edit/deactivate operations |
| Zod | ^4.3.6 (installed) | Schema validation | Same as Phase 3—validate driver input (email, name, license number) |
| Prisma 7 | ^7.4.0 (installed) | ORM with RLS | Same as Phase 3—User model already exists, extend with driver fields |
| PostgreSQL 17 | 17 (production) | Database | Existing User table + new DriverInvitation table for tracking pending invites |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Table | ^8.21.3 (installed) | Driver list view | Same as truck list—sortable/filterable driver table with deactivate action |
| Resend | ^4.0+ (NEW) | Email delivery service | Custom branded invitation emails; free tier: 3,000 emails/month from verified sender |
| react-email | ^3.0+ (NEW) | Email template components | Type-safe React components for email templates; integrates with Resend |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Clerk Invitations | Manual token generation + email | Clerk handles invite lifecycle (expiry, tracking, security), email delivery via Clerk's provider; manual approach requires implementing token generation, expiry tracking, secure verification, and email infrastructure |
| Resend | SendGrid or Postmark | Resend: developer-friendly, React Email integration, modern API ($0.004/email after free tier); SendGrid: enterprise scale, more features, dated API; Postmark: deliverability focus, fewer features, cleaner API |
| Application Invitations | Clerk Organizations | Organizations: built-in multi-tenancy but requires adopting Clerk's org model (conflicts with custom Tenant table and existing RLS architecture); Application Invitations: flexible, works with custom tenant model, requires more manual coordination |
| Deactivation (isActive) | Hard delete | Deactivation preserves audit trails, prevents orphaned foreign keys (route assignments), allows reactivation; hard delete is simpler but loses history and breaks referential integrity if driver has assigned routes |
| react-email | Plain HTML strings | react-email: type-safe components, reusable layouts, hot reload in dev; plain HTML: error-prone, no type safety, harder to maintain |

**Installation:**
```bash
npm install resend react-email
npm install -D @react-email/components
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (owner)/
│   │   ├── drivers/
│   │   │   ├── page.tsx                    # Driver list view
│   │   │   ├── invite/
│   │   │   │   └── page.tsx                # Invite driver form
│   │   │   └── [id]/
│   │   │       ├── page.tsx                # View driver details
│   │   │       └── edit/
│   │   │           └── page.tsx            # Edit driver info
│   │   └── actions/
│   │       └── drivers.ts                  # Server actions for driver CRUD + invite
│   ├── api/
│   │   └── webhooks/
│   │       └── clerk/
│   │           └── route.ts                # Extend webhook to handle driver invites
├── lib/
│   ├── db/
│   │   └── repositories/
│   │       └── driver.repository.ts        # User repository for driver role queries
│   ├── validations/
│   │   └── driver.schemas.ts               # Zod schemas for driver data
│   ├── email/
│   │   ├── client.ts                       # Resend client initialization
│   │   └── templates/
│   │       └── driver-invitation.tsx       # react-email template
└── components/
    └── drivers/
        ├── driver-form.tsx                  # Reusable form component
        └── driver-list.tsx                  # TanStack Table component
```

### Pattern 1: Clerk Application Invitations for Driver Provisioning

**What:** Use Clerk's `createInvitation()` Backend API to generate invite links and send emails to drivers. Store invitation metadata in database to track pending invites.

**When to use:** Owner invites a new driver to the tenant. This is the only way drivers should be created (no self-registration).

**Example:**
```typescript
// Source: https://clerk.com/docs/reference/backend/invitations/create-invitation
// app/(owner)/actions/drivers.ts
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { clerkClient } from '@clerk/nextjs/server';
import { requireTenantId, getTenantPrisma } from '@/lib/context/tenant-context';
import { driverInviteSchema } from '@/lib/validations/driver.schemas';
import { revalidatePath } from 'next/cache';

export async function inviteDriver(prevState: any, formData: FormData) {
  // 1. Require OWNER or MANAGER role
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // 2. Parse and validate input
  const rawData = {
    email: formData.get('email') as string,
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    licenseNumber: formData.get('licenseNumber') as string,
  };

  const result = driverInviteSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();

  // 3. Create Clerk invitation
  const clerk = await clerkClient();
  const invitation = await clerk.invitations.createInvitation({
    emailAddress: result.data.email,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite`,
    publicMetadata: {
      role: UserRole.DRIVER,
      // Include driver-specific data to populate User record on sign-up
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      licenseNumber: result.data.licenseNumber,
    },
    privateMetadata: {
      tenantId, // Critical: link invite to current tenant
    },
  });

  // 4. Store invitation in database for tracking
  const prisma = await getTenantPrisma();
  await prisma.driverInvitation.create({
    data: {
      tenantId,
      email: result.data.email,
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      licenseNumber: result.data.licenseNumber,
      clerkInvitationId: invitation.id,
      expiresAt: new Date(invitation.expiresAt!), // Clerk default: 30 days
      status: 'PENDING',
    },
  });

  revalidatePath('/drivers');
  return { success: true, message: `Invitation sent to ${result.data.email}` };
}
```

**Critical:** Invitation must include `tenantId` in `privateMetadata` so webhook knows which tenant to link the new user to.

### Pattern 2: Webhook Extension for Driver Sign-Up

**What:** Extend existing Clerk webhook to handle driver invitation acceptance. When user signs up via invite, create User record with DRIVER role and link to tenant.

**When to use:** Driver clicks invitation link and completes sign-up flow.

**Example:**
```typescript
// Source: https://clerk.com/docs/guides/users/inviting
// app/api/webhooks/clerk/route.ts (extend existing handler)

// Inside POST handler, after user.created event check:
if (evt.type === 'user.created') {
  const { id: clerkUserId, email_addresses, public_metadata, private_metadata } = evt.data;

  const primaryEmail = email_addresses.find((email: any) => email.id === evt.data.primary_email_address_id);
  const email = primaryEmail?.email_address || email_addresses[0]?.email_address;

  if (!email) {
    return NextResponse.json({ error: 'User email is required' }, { status: 400 });
  }

  // Check if this is a driver invitation (has role in publicMetadata)
  const role = public_metadata?.role as string;
  const tenantId = private_metadata?.tenantId as string;

  if (role === 'DRIVER' && tenantId) {
    // Driver invitation flow
    try {
      // Find matching invitation
      const invitation = await prisma.driverInvitation.findFirst({
        where: {
          email,
          tenantId,
          status: 'PENDING',
        },
      });

      if (!invitation) {
        console.error('No pending invitation found for driver:', email);
        return NextResponse.json(
          { error: 'No pending invitation found' },
          { status: 400 }
        );
      }

      // Create User record with DRIVER role
      const user = await prisma.user.create({
        data: {
          clerkUserId,
          email,
          tenantId,
          role: UserRole.DRIVER,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          licenseNumber: invitation.licenseNumber,
          isActive: true,
        },
      });

      // Mark invitation as accepted
      await prisma.driverInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          userId: user.id,
        },
      });

      // Update Clerk metadata
      const client = await clerkClient();
      await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { role: UserRole.DRIVER },
        privateMetadata: { tenantId },
      });

      return NextResponse.json({
        message: 'Driver account created',
        userId: user.id,
      });
    } catch (error) {
      console.error('Error creating driver account:', error);
      return NextResponse.json(
        { error: 'Failed to create driver account' },
        { status: 500 }
      );
    }
  }

  // Otherwise, existing owner provisioning flow...
}
```

**Key insight:** Webhook creates User record and links to tenant using `privateMetadata.tenantId` from invitation.

### Pattern 3: Driver Deactivation (Not Deletion)

**What:** Deactivate driver accounts by setting `isActive = false` on User model. Deactivated drivers cannot log in but records are preserved for audit trails.

**When to use:** Owner needs to revoke driver access (driver left company, suspended, etc.).

**Example:**
```typescript
// app/(owner)/actions/drivers.ts
export async function deactivateDriver(driverId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  // Update User record
  const user = await prisma.user.update({
    where: { id: driverId },
    data: { isActive: false },
  });

  // Revoke Clerk sessions (force logout)
  const clerk = await clerkClient();
  const sessions = await clerk.users.getUserList({
    userId: [user.clerkUserId],
  });

  for (const session of sessions.data[0]?.sessions || []) {
    await clerk.sessions.revokeSession(session.id);
  }

  revalidatePath('/drivers');
  return { success: true, message: 'Driver deactivated' };
}

export async function reactivateDriver(driverId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  await prisma.user.update({
    where: { id: driverId },
    data: { isActive: true },
  });

  revalidatePath('/drivers');
  return { success: true, message: 'Driver reactivated' };
}
```

**Behavior:** Deactivated drivers cannot log in (middleware check), existing sessions are revoked, but User record and foreign key references (route assignments) remain intact.

### Pattern 4: Database Schema Extensions

**What:** Extend existing User model with driver-specific fields, add DriverInvitation table to track pending invites.

**When to use:** Phase 4 implementation.

**Example (Prisma Schema):**
```prisma
// prisma/schema.prisma

model User {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @db.Uuid
  clerkUserId   String   @unique
  email         String
  role          UserRole
  isSystemAdmin Boolean  @default(false)
  isActive      Boolean  @default(true)  // NEW: for deactivation

  // Driver-specific fields (nullable for OWNER/MANAGER roles)
  firstName     String?  // NEW
  lastName      String?  // NEW
  licenseNumber String?  // NEW

  createdAt     DateTime @default(now()) @db.Timestamptz
  updatedAt     DateTime @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([clerkUserId])
  @@index([email])
}

model DriverInvitation {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String   @db.Uuid
  email               String
  firstName           String
  lastName            String
  licenseNumber       String?
  clerkInvitationId   String   @unique  // Clerk invitation ID
  expiresAt           DateTime @db.Timestamptz
  status              InvitationStatus @default(PENDING)
  acceptedAt          DateTime? @db.Timestamptz
  userId              String?  @db.Uuid  // Set when accepted
  createdAt           DateTime @default(now()) @db.Timestamptz
  updatedAt           DateTime @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([email])
  @@index([clerkInvitationId])
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  CANCELLED
}
```

**Rationale:**
- `isActive` on User enables deactivation without deletion
- Driver fields nullable because OWNER/MANAGER roles don't need them
- DriverInvitation table tracks pending invites, links to Clerk invitation ID
- InvitationStatus enum supports future workflows (cancel, expire)

### Pattern 5: Custom Email Templates with Resend + react-email

**What:** Use Resend to send custom branded invitation emails with react-email templates. Alternative to Clerk's default emails (limited customization).

**When to use:** (Optional) If default Clerk emails lack sufficient branding/customization.

**Example:**
```typescript
// Source: https://react.email + https://resend.com/docs/send-with-nextjs
// lib/email/templates/driver-invitation.tsx
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface DriverInvitationEmailProps {
  driverName: string;
  inviteLink: string;
  companyName: string;
}

export const DriverInvitationEmail = ({
  driverName,
  inviteLink,
  companyName,
}: DriverInvitationEmailProps) => (
  <Html>
    <Head />
    <Preview>You've been invited to join {companyName} on DriveCommand</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={heading}>Welcome to DriveCommand!</Text>
        <Text style={paragraph}>
          Hi {driverName},
        </Text>
        <Text style={paragraph}>
          You've been invited to join {companyName}'s fleet management system.
          Click the button below to accept your invitation and set up your driver account.
        </Text>
        <Section style={buttonContainer}>
          <Button style={button} href={inviteLink}>
            Accept Invitation
          </Button>
        </Section>
        <Text style={paragraph}>
          This invitation expires in 30 days.
        </Text>
      </Container>
    </Body>
  </Html>
);

// Styles omitted for brevity
```

```typescript
// lib/email/client.ts
import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendDriverInvitation({
  email,
  driverName,
  inviteLink,
  companyName,
}: {
  email: string;
  driverName: string;
  inviteLink: string;
  companyName: string;
}) {
  const { data, error } = await resend.emails.send({
    from: 'DriveCommand <noreply@drivecommand.app>',
    to: email,
    subject: `You've been invited to join ${companyName}`,
    react: DriverInvitationEmail({ driverName, inviteLink, companyName }),
  });

  if (error) {
    console.error('Failed to send invitation email:', error);
    throw new Error('Failed to send invitation email');
  }

  return data;
}
```

**Tradeoff:** Clerk's default emails are simpler (no email infrastructure needed), but Resend + react-email provides full control over branding, styling, and content. For v1, Clerk's default emails are sufficient; add custom emails in later phase if branding requirements increase.

### Anti-Patterns to Avoid

- **No auth checks in driver invite action:** Same as truck management—server actions are public POST endpoints, always check `requireRole(['OWNER', 'MANAGER'])` first.
- **Creating drivers without invitations:** Drivers should never self-register or be created manually—only via invitation flow to enforce owner-controlled provisioning.
- **Hard deleting drivers with assigned routes:** Deleting a driver breaks foreign key references to Route assignments; use deactivation via `isActive` instead.
- **Not revoking Clerk sessions on deactivation:** Setting `isActive = false` in database doesn't prevent login until Clerk sessions are revoked; must call Clerk API to revoke sessions.
- **Storing sensitive driver data in Clerk metadata:** License numbers, phone numbers, addresses should be in database (encrypted at rest), not Clerk metadata (limited encryption guarantees).
- **Not tracking invitation expiry:** Clerk invitations expire after 30 days; sync expiry to database and show status in UI to avoid confusion.
- **Manual email verification for invited users:** Clerk handles email verification during sign-up; don't add duplicate verification logic.
- **Not validating email uniqueness:** Before creating invitation, check if email already exists as a user in the tenant (prevent duplicate invites).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Invitation tokens + expiry | Custom JWT/UUID tokens with expiry tracking | Clerk `createInvitation()` API | Clerk handles token generation, expiry (30 days), secure verification, email delivery; manual approach requires implementing cryptographically secure tokens, expiry cron jobs, and email infrastructure |
| Email delivery infrastructure | Direct SMTP integration (Nodemailer) | Resend or Clerk's built-in emails | Email deliverability is complex (SPF, DKIM, DMARC records, IP reputation, bounce handling); Resend handles infrastructure for $0.004/email |
| Session revocation on deactivation | Manual session tracking and invalidation | Clerk Backend API `revokeSession()` | Clerk manages session lifecycle; manual revocation requires tracking sessions, handling edge cases (multiple devices, token refresh) |
| Driver license validation | Custom regex for license number formats | Permissive validation (alphanumeric) | License formats vary by state/country; strict validation causes false rejections; defer validation to external DMV API if needed |

**Key insight:** Clerk provides invitation infrastructure (token generation, expiry, email) out of the box. Don't rebuild authentication primitives—coordinate between Clerk (auth), database (User records), and email (notifications).

## Common Pitfalls

### Pitfall 1: Driver Self-Registration Bypasses Invite System

**What goes wrong:** Driver discovers sign-up page and creates account without invitation. New user has no tenant association, causing errors or security breach (cross-tenant access).

**Why it happens:**
- Public sign-up flow exists for owners (Phase 2)
- No validation that driver sign-ups must come from invitations
- Middleware doesn't check invitation status before allowing sign-up

**How to avoid:**
1. Disable public sign-up for driver role: modify Clerk sign-up flow to require invitation token
2. Webhook validation: check `publicMetadata.role` in webhook; reject if DRIVER role but no matching invitation
3. UI/UX: hide sign-up button in driver portal, only show sign-in
4. Middleware: block `/sign-up` for users with `?invitation=` query param (driver flow) unless valid invitation exists

**Warning signs:**
- Driver users without `tenantId` in database
- Webhook errors: "No pending invitation found for driver"
- Support requests: "Driver can't access fleet data after signing up"

**Example (Webhook validation):**
```typescript
// In webhook handler
if (role === 'DRIVER') {
  const invitation = await prisma.driverInvitation.findFirst({
    where: { email, status: 'PENDING' },
  });

  if (!invitation) {
    // Reject driver sign-up without invitation
    return NextResponse.json(
      { error: 'Driver accounts require invitation' },
      { status: 403 }
    );
  }
}
```

### Pitfall 2: Not Revoking Clerk Sessions on Deactivation

**What goes wrong:** Owner deactivates driver in database (`isActive = false`), but driver remains logged in for hours/days until session expires naturally. Deactivated driver continues accessing fleet data.

**Why it happens:**
- Database update doesn't automatically invalidate Clerk sessions
- Middleware checks `isActive` but existing sessions bypass middleware (cached)
- No explicit session revocation in deactivation action

**How to avoid:**
1. Call Clerk's `revokeSession()` API immediately after setting `isActive = false`
2. Revoke ALL sessions for the user (user may be logged in on multiple devices)
3. Consider adding middleware check: query database for `isActive` status on every request (performance tradeoff)
4. Show confirmation: "Driver deactivated and logged out from all devices"

**Warning signs:**
- Deactivated drivers still accessing app
- No Clerk API calls in deactivation action
- Session revocation errors in logs

**Example:**
```typescript
// GOOD: Revoke sessions on deactivation
const user = await prisma.user.update({
  where: { id: driverId },
  data: { isActive: false },
});

const clerk = await clerkClient();
const sessions = await clerk.users.getUserSessions(user.clerkUserId);
for (const session of sessions) {
  await clerk.sessions.revokeSession(session.id);
}
```

**Source:** [Clerk Sessions API](https://clerk.com/docs/reference/backend/sessions/revoke-session)

### Pitfall 3: Invitation Expiry Not Synced to Database

**What goes wrong:** Clerk invitation expires (30 days default), but database shows `status: PENDING`. Owner sees "invitation sent" in UI but driver can't accept (expired link). No notification that invitation needs resending.

**Why it happens:**
- Database tracks invitation status but not expiry date
- No background job to sync Clerk invitation status to database
- UI doesn't check `expiresAt` field before showing "pending" status

**How to avoid:**
1. Store `expiresAt` in DriverInvitation table when creating invitation
2. UI check: show "EXPIRED" status if `expiresAt < now()` even if status is PENDING
3. Add "Resend Invitation" action for expired invites (creates new Clerk invitation)
4. Background job (optional): nightly cron to mark expired invitations as EXPIRED

**Warning signs:**
- Drivers reporting "invitation link doesn't work"
- Support requests: "resend invitation"
- No expiry tracking in database

**Example (UI status check):**
```typescript
function getInvitationStatus(invitation: DriverInvitation) {
  if (invitation.status === 'ACCEPTED') return 'Accepted';
  if (invitation.status === 'CANCELLED') return 'Cancelled';

  // Check expiry even if status is PENDING
  if (new Date() > invitation.expiresAt) return 'Expired';

  return 'Pending';
}
```

### Pitfall 4: Duplicate Invitations for Same Email

**What goes wrong:** Owner sends multiple invitations to same email address (resending or mistake). Driver receives multiple emails, clicks latest link, but webhook finds wrong invitation (first pending invite, not latest). User creation fails or links to wrong invitation.

**Why it happens:**
- No validation preventing duplicate pending invitations
- Webhook query uses `findFirst()` which returns arbitrary matching record
- Clerk allows multiple invitations to same email

**How to avoid:**
1. Validate email uniqueness before creating invitation: check for existing PENDING invitations
2. Cancel old pending invitations when creating new one (update status to CANCELLED)
3. Webhook query: match by `clerkInvitationId` (unique) not just email
4. UI feedback: "Pending invitation already exists for this email. Resend?"

**Warning signs:**
- Multiple PENDING invitations for same email in database
- Webhook errors: wrong invitation matched
- Driver sign-up creates user with outdated invitation data

**Example:**
```typescript
// GOOD: Cancel old invitations before creating new one
const existingInvitations = await prisma.driverInvitation.findMany({
  where: {
    email: result.data.email,
    tenantId,
    status: 'PENDING',
  },
});

if (existingInvitations.length > 0) {
  // Cancel old pending invitations
  await prisma.driverInvitation.updateMany({
    where: {
      email: result.data.email,
      tenantId,
      status: 'PENDING',
    },
    data: { status: 'CANCELLED' },
  });
}

// Now create new invitation
const invitation = await clerk.invitations.createInvitation({...});
```

### Pitfall 5: License Number Format Too Strict

**What goes wrong:** Validation enforces specific license number format (e.g., "ABC123456") but different states use different formats. Legitimate license numbers rejected, blocking driver onboarding.

**Why it happens:**
- Developer creates regex based on their local state format
- Not researching state/country variations in license format
- Trying to be "helpful" with strict validation

**How to avoid:**
1. Use permissive validation: alphanumeric + common separators (dash, space)
2. Length range: 5-20 characters (accommodates most formats)
3. Don't enforce specific patterns unless tenant specifies jurisdiction
4. Store as-entered, display formatted if needed
5. Consider making license number optional (some tenants don't track)

**Warning signs:**
- License validation regex has strict pattern (e.g., `/^[A-Z]{3}\d{6}$/`)
- Support requests: "Can't enter driver's license number"
- Validation rejects valid licenses from other states

**Example:**
```typescript
// TOO STRICT (don't do this)
licenseNumber: z.string().regex(/^[A-Z]{3}\d{6}$/)

// PERMISSIVE (do this)
licenseNumber: z.string()
  .min(5, 'License number too short')
  .max(20, 'License number too long')
  .regex(/^[A-Z0-9\s\-]+$/i, 'License number contains invalid characters')
  .optional()
```

**Sources:**
- [Driver's license formats by state (US)](https://ntsi.com/drivers-license-format/)
- [International driver's license formats](https://en.wikipedia.org/wiki/Driver%27s_license)

### Pitfall 6: Not Handling Webhook Race Conditions

**What goes wrong:** User accepts invitation and signs up. Webhook fires to create User record. Meanwhile, user logs in before webhook completes. Middleware tries to fetch tenant from User record that doesn't exist yet. App crashes or shows "no tenant" error.

**Why it happens:**
- Clerk's webhook delivery is asynchronous (eventual consistency)
- User login can happen milliseconds after sign-up (before webhook processed)
- Middleware assumes User record always exists for authenticated users

**How to avoid:**
1. Make webhook handler idempotent: use `findFirst` + `create` pattern, not just `create`
2. Middleware fallback: if User record doesn't exist but Clerk user is authenticated, retry after short delay or redirect to "provisioning" page
3. Add loading state: show "Setting up your account..." while webhook processes
4. Webhook priority: configure Clerk to deliver `user.created` webhooks with high priority

**Warning signs:**
- Intermittent "no tenant found" errors on first login
- Race condition errors in webhook logs
- User record created twice (duplicate key error)

**Example (Idempotent webhook):**
```typescript
// GOOD: Check if user exists before creating
const existingUser = await prisma.user.findUnique({
  where: { clerkUserId },
});

if (existingUser) {
  console.log('User already exists (race condition)');
  return NextResponse.json({ message: 'User already exists' });
}

// Create user
const user = await prisma.user.create({...});
```

**Source:** [Webhook best practices](https://clerk.com/docs/integrations/webhooks/overview#best-practices)

## Code Examples

Verified patterns from official sources:

### Complete Driver Invitation Flow

```typescript
// Source: https://clerk.com/docs/reference/backend/invitations/create-invitation
// app/(owner)/actions/drivers.ts
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { clerkClient } from '@clerk/nextjs/server';
import { requireTenantId, getTenantPrisma } from '@/lib/context/tenant-context';
import { driverInviteSchema } from '@/lib/validations/driver.schemas';
import { revalidatePath } from 'next/cache';

export async function inviteDriver(prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    email: formData.get('email') as string,
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    licenseNumber: formData.get('licenseNumber') as string,
  };

  const result = driverInviteSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Check for existing user or pending invitation
  const existingUser = await prisma.user.findFirst({
    where: {
      email: result.data.email,
      tenantId,
    },
  });

  if (existingUser) {
    return { error: { email: ['A driver with this email already exists'] } };
  }

  // Cancel any pending invitations
  await prisma.driverInvitation.updateMany({
    where: {
      email: result.data.email,
      tenantId,
      status: 'PENDING',
    },
    data: { status: 'CANCELLED' },
  });

  // Create Clerk invitation
  const clerk = await clerkClient();
  const invitation = await clerk.invitations.createInvitation({
    emailAddress: result.data.email,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite`,
    publicMetadata: {
      role: UserRole.DRIVER,
      firstName: result.data.firstName,
      lastName: result.data.lastName,
    },
    privateMetadata: {
      tenantId,
    },
  });

  // Store invitation in database
  await prisma.driverInvitation.create({
    data: {
      tenantId,
      email: result.data.email,
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      licenseNumber: result.data.licenseNumber,
      clerkInvitationId: invitation.id,
      expiresAt: new Date(invitation.expiresAt!),
      status: 'PENDING',
    },
  });

  revalidatePath('/drivers');
  return { success: true, message: `Invitation sent to ${result.data.email}` };
}

export async function listDrivers() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  return prisma.user.findMany({
    where: {
      role: UserRole.DRIVER,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deactivateDriver(driverId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  const user = await prisma.user.update({
    where: { id: driverId },
    data: { isActive: false },
  });

  // Revoke all Clerk sessions
  const clerk = await clerkClient();
  const sessions = await clerk.users.getUserSessions(user.clerkUserId);
  for (const session of sessions) {
    await clerk.sessions.revokeSession(session.id);
  }

  revalidatePath('/drivers');
  return { success: true };
}

export async function updateDriver(driverId: string, prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    licenseNumber: formData.get('licenseNumber') as string,
  };

  const result = driverUpdateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const prisma = await getTenantPrisma();
  await prisma.user.update({
    where: { id: driverId },
    data: result.data,
  });

  revalidatePath('/drivers');
  revalidatePath(`/drivers/${driverId}`);
  return { success: true };
}
```

### Zod Validation Schemas

```typescript
// lib/validations/driver.schemas.ts
import { z } from 'zod';

export const driverInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  licenseNumber: z.string()
    .min(5, 'License number too short')
    .max(20, 'License number too long')
    .regex(/^[A-Z0-9\s\-]+$/i, 'License number contains invalid characters')
    .optional(),
});

export const driverUpdateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  licenseNumber: z.string()
    .min(5, 'License number too short')
    .max(20, 'License number too long')
    .regex(/^[A-Z0-9\s\-]+$/i, 'License number contains invalid characters')
    .optional(),
});

export type DriverInvite = z.infer<typeof driverInviteSchema>;
export type DriverUpdate = z.infer<typeof driverUpdateSchema>;
```

### Driver List Component with TanStack Table

```typescript
// Source: https://tanstack.com/table/latest
// components/drivers/driver-list.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import type { User } from '@/generated/prisma/client';

interface DriverListProps {
  drivers: User[];
  onDeactivate: (id: string) => void;
}

export function DriverList({ drivers, onDeactivate }: DriverListProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const handleDeactivate = (id: string, name: string) => {
    if (window.confirm(`Deactivate driver ${name}? They will be logged out immediately.`)) {
      onDeactivate(id);
    }
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'firstName',
      header: 'First Name',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'lastName',
      header: 'Last Name',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: 'licenseNumber',
      header: 'License Number',
      cell: (info) => info.getValue() || '—',
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: (info) => {
        const isActive = info.getValue() as boolean;
        return (
          <span className={isActive ? 'text-green-600' : 'text-red-600'}>
            {isActive ? 'Active' : 'Deactivated'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Link
            href={`/drivers/${row.original.id}`}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            View
          </Link>
          <Link
            href={`/drivers/${row.original.id}/edit`}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Edit
          </Link>
          {row.original.isActive ? (
            <button
              onClick={() => handleDeactivate(
                row.original.id,
                `${row.original.firstName} ${row.original.lastName}`
              )}
              className="text-red-600 hover:text-red-800 font-medium"
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() => {/* reactivate action */}}
              className="text-green-600 hover:text-green-800 font-medium"
            >
              Reactivate
            </button>
          )}
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: drivers,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (drivers.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">
          No drivers yet. Invite your first driver to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          type="text"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search drivers..."
          className="w-full max-w-md border border-gray-300 rounded-md px-4 py-2"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left text-sm font-medium text-gray-500 uppercase px-6 py-3"
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? 'cursor-pointer select-none'
                            : ''
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? ' ↑' : ''}
                        {header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| Manual invite tokens | Clerk Invitations API | Clerk v5+ (2024) | Eliminates custom token generation, expiry tracking, secure verification; Clerk handles invite lifecycle |
| SMTP email sending | Email APIs (Resend, Postmark) | 2024+ mainstream | Eliminates SMTP server management, IP reputation issues, bounce handling; pay per email instead of server costs |
| HTML string templates | react-email components | 2024+ | Type-safe email templates, component reuse, hot reload in dev, better maintainability |
| Hard delete users | Soft delete with `isActive` flag | Industry best practice | Preserves audit trails, prevents orphaned foreign keys, allows reactivation; required for compliance (GDPR, SOC2) |
| Custom session management | Clerk session management | Clerk core feature | Automatic session lifecycle, multi-device support, revocation API; no need to build session tracking |

**Deprecated/outdated:**
- **Manual JWT invitation tokens:** Clerk handles token generation and verification securely
- **Direct SMTP with Nodemailer:** Email APIs (Resend, SendGrid) provide better deliverability and infrastructure
- **Hard deleting users immediately:** Soft delete is safer for users with foreign key relationships (route assignments, maintenance records)
- **Clerk Organizations for multi-tenancy:** DriveCommand uses custom Tenant model with RLS; Organizations would conflict with existing architecture

## Open Questions

1. **Custom email templates vs. Clerk defaults**
   - What we know: Clerk sends default invitation emails; Resend + react-email enables custom branding
   - What's unclear: Is default Clerk email branding acceptable for v1, or is custom branding required?
   - Recommendation: **Start with Clerk default emails** (simpler, no email infrastructure needed); add Resend + react-email in later phase if branding requirements increase

2. **Driver profile fields extensibility**
   - What we know: Phase 4 requires firstName, lastName, licenseNumber
   - What's unclear: Will tenants need additional driver fields (phone, address, certifications, emergency contact)?
   - Recommendation: **Start with core fields only** (name, email, license); add extensible JSONB `driverMetadata` field in later phase if custom fields are requested

3. **Invitation resend vs. new invitation**
   - What we know: Clerk invitations expire after 30 days
   - What's unclear: Should "resend" action reuse existing invitation or create new one?
   - Recommendation: **Create new invitation** (simplifies tracking, avoids Clerk API complexity); cancel old invitation and create fresh one with new expiry

4. **Driver license verification**
   - What we know: Basic license number field with permissive validation
   - What's unclear: Should we integrate with DMV APIs to verify license validity?
   - Recommendation: **Manual entry for v1**—DMV APIs are expensive and complex; defer automated verification to later phase if compliance requires it

5. **Multi-role users (driver who is also manager)**
   - What we know: User model has single `role` field (enum)
   - What's unclear: Can a user be both MANAGER and DRIVER?
   - Recommendation: **Single role for v1**—simplifies authorization logic; if multi-role is needed, migrate to role array or junction table in later phase

## Sources

### Primary (HIGH confidence)

- [Clerk: Invite users to your application](https://clerk.com/docs/guides/users/inviting) - Official Clerk invitation guide (updated Feb 9, 2026)
- [Clerk Backend API: createInvitation()](https://clerk.com/docs/reference/backend/invitations/create-invitation) - Official API reference
- [Clerk: Build custom Organization invitation flow](https://clerk.com/docs/guides/development/custom-flows/organizations/manage-organization-invitations) - Custom invitation patterns
- [WorkOS: Deletion vs. Deactivation](https://workos.com/docs/authkit/users-organizations/organizations/when-to-use-deletion-vs-deactivation) - Best practices for user lifecycle
- [Resend: Send emails with Next.js](https://resend.com/docs/send-with-nextjs) - Official integration guide
- [React Email Documentation](https://react.email) - Official component library
- [TanStack Table](https://tanstack.com/table/latest) - Headless table library (used in Phase 3)
- [Next.js Server Actions](https://nextjs.org/docs/app/getting-started/updating-data) - Official CRUD guide (Phase 3 pattern)

### Secondary (MEDIUM confidence)

- [Choosing the Right Email Service: SendGrid, Resend, Postmark](https://bahroze.substack.com/p/choosing-the-right-email-service) - Email service comparison
- [5 Best Email APIs: Flexibility Comparison [2026]](https://mailtrap.io/blog/email-api-flexibility/) - Email API comparison
- [Resend vs SendGrid Comparison (2026)](https://forwardemail.net/en/blog/resend-vs-sendgrid-email-service-comparison) - Developer perspective
- [How to Create and Send Email Templates Using React Email and Resend](https://www.freecodecamp.org/news/create-and-send-email-templates-using-react-email-and-resend-in-nextjs/) - Practical tutorial
- [Soft delete vs hard delete: choose the right data lifecycle](https://appmaster.io/blog/soft-delete-vs-hard-delete) - Data lifecycle patterns
- [Fleet Management Best Practices](https://www.uschamber.com/co/run/technology/fleet-management-best-practices) - Driver management context
- [Driver Behavior Monitoring: Complete Fleet Safety Guide 2026](https://oxmaint.com/industries/fleet-management/driver-behavior-monitoring-complete-fleet-safety-guide-2026) - Fleet management trends

### Tertiary (LOW confidence - needs validation)

- [Driver's license formats by state](https://ntsi.com/drivers-license-format/) - License validation reference
- [International driver's license formats](https://en.wikipedia.org/wiki/Driver%27s_license) - Global license patterns

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - Clerk Invitations API verified from official docs (Feb 2026), Resend and react-email are production-ready
- Architecture: **HIGH** - Invitation flow follows official Clerk patterns, database schema extends existing User model, Server Actions follow Phase 3 patterns
- Pitfalls: **HIGH** - Session revocation documented in Clerk API, invitation expiry from Clerk defaults, deactivation best practices from WorkOS
- Code examples: **HIGH** - All patterns sourced from official Clerk, Resend, and TanStack Table documentation

**Research date:** 2026-02-14
**Valid until:** 2026-03-16 (30 days—Clerk Invitations API and email services are stable, patterns unlikely to change significantly)

**Key risk areas requiring validation during planning:**
1. Webhook race condition handling—test user login immediately after sign-up to verify User record exists
2. Session revocation timing—confirm Clerk sessions are revoked before user can make another request
3. Invitation expiry tracking—verify database `expiresAt` syncs correctly with Clerk invitation expiry
4. Email deliverability—test Clerk default emails in production environment (spam filters, deliverability)
5. License number validation permissiveness—verify regex accepts real-world license formats from multiple states
