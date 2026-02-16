import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { clerkClient } from '@clerk/nextjs/server';

/**
 * Clerk webhook handler for user provisioning
 *
 * Handles user.created events to:
 * 1. Create a new Tenant record
 * 2. Create a User record linked to the tenant with OWNER role
 * 3. Update Clerk user's privateMetadata with tenantId
 *
 * CRITICAL: This handler is IDEMPOTENT - uses upsert to handle duplicate deliveries
 * (Clerk retries failed webhooks, and there's a race condition between webhook and first login)
 */
export async function POST(req: NextRequest) {
  // Get webhook secret from environment
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('Missing CLERK_WEBHOOK_SECRET environment variable');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  // Get Svix headers for signature verification
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // Verify all required headers are present
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: 'Missing Svix headers' },
      { status: 400 }
    );
  }

  // Get request body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: any;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  // Handle user.created event
  if (evt.type === 'user.created') {
    const { id: clerkUserId, email_addresses, public_metadata, private_metadata } = evt.data;

    // Extract user information
    const primaryEmail = email_addresses.find((email: any) => email.id === evt.data.primary_email_address_id);
    const email = primaryEmail?.email_address || email_addresses[0]?.email_address;

    if (!email) {
      console.error('No email found for user:', clerkUserId);
      return NextResponse.json(
        { error: 'User email is required' },
        { status: 400 }
      );
    }

    try {
      // Check if user already exists (idempotency check)
      // Must bypass RLS since User table has FORCE ROW LEVEL SECURITY
      const existingUser = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findUnique({
          where: { clerkUserId },
          include: { tenant: true },
        });
      });

      if (existingUser) {
        console.log('User already exists, skipping tenant creation:', clerkUserId);

        // Ensure Clerk metadata is set (in case webhook was retried after partial success)
        const client = await clerkClient();
        await client.users.updateUserMetadata(clerkUserId, {
          privateMetadata: {
            tenantId: existingUser.tenantId,
          },
          publicMetadata: {
            role: existingUser.role,
          },
        });

        return NextResponse.json(
          { message: 'User already provisioned', tenantId: existingUser.tenantId },
          { status: 200 }
        );
      }

      // Extract metadata to check for driver invitation sign-up
      // Note: tenantId is passed in publicMetadata during invitation creation (inviteDriver action)
      const inviteRole = public_metadata?.role as string | undefined;
      const inviteTenantId = public_metadata?.tenantId as string | undefined;

      // Check if this is a driver invitation sign-up
      if (inviteRole === 'DRIVER' && inviteTenantId) {
        // Driver invitation flow - handle separately
        console.log('Processing driver invitation sign-up:', { clerkUserId, email, tenantId: inviteTenantId });

        try {
          // Find pending invitation (must bypass RLS - DriverInvitation has FORCE ROW LEVEL SECURITY)
          const invitation = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            return tx.driverInvitation.findFirst({
              where: {
                email,
                tenantId: inviteTenantId,
                status: 'PENDING'
              },
            });
          });

          if (!invitation) {
            console.error('No pending invitation found for driver:', { email, tenantId: inviteTenantId });
            return NextResponse.json(
              { error: 'Driver accounts require an invitation' },
              { status: 400 }
            );
          }

          // Check invitation expiry
          if (new Date() > invitation.expiresAt) {
            console.error('Invitation expired:', { email, expiresAt: invitation.expiresAt });
            // Mark as expired (must bypass RLS)
            await prisma.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
              return tx.driverInvitation.update({
                where: { id: invitation.id },
                data: { status: 'EXPIRED' },
              });
            });
            return NextResponse.json(
              { error: 'Invitation has expired' },
              { status: 400 }
            );
          }

          // Create User record with DRIVER role (use transaction to bypass RLS)
          const user = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            return tx.user.create({
              data: {
                clerkUserId,
                email,
                tenantId: inviteTenantId,
                role: 'DRIVER',
                firstName: invitation.firstName,
                lastName: invitation.lastName,
                licenseNumber: invitation.licenseNumber,
                isActive: true,
              },
            });
          });

          // Mark invitation as accepted (must bypass RLS)
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            return tx.driverInvitation.update({
              where: { id: invitation.id },
              data: {
                status: 'ACCEPTED',
                acceptedAt: new Date(),
                userId: user.id
              },
            });
          });

          // Update Clerk metadata for the new driver
          const client = await clerkClient();
          await client.users.updateUserMetadata(clerkUserId, {
            publicMetadata: { role: 'DRIVER' },
            privateMetadata: { tenantId: inviteTenantId },
          });

          console.log('Driver account created successfully:', {
            userId: user.id,
            clerkUserId,
            tenantId: inviteTenantId,
          });

          return NextResponse.json(
            { message: 'Driver account created', userId: user.id },
            { status: 200 }
          );
        } catch (error) {
          console.error('Error creating driver account:', error);
          return NextResponse.json(
            { error: 'Failed to create driver account' },
            { status: 500 }
          );
        }
      }

      // Owner provisioning flow: Create new tenant and user in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Bypass RLS for provisioning (User table has FORCE ROW LEVEL SECURITY)
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: (public_metadata?.companyName as string) || email.split('@')[0] || 'My Company',
            timezone: (public_metadata?.timezone as string) || 'UTC',
          },
        });

        // Create user with OWNER role
        const user = await tx.user.create({
          data: {
            clerkUserId,
            email,
            tenantId: tenant.id,
            role: 'OWNER',
            isActive: true,
          },
        });

        return { tenant, user };
      });

      // Update Clerk user metadata with tenant ID and role
      const client = await clerkClient();
      await client.users.updateUserMetadata(clerkUserId, {
        privateMetadata: {
          tenantId: result.tenant.id,
        },
        publicMetadata: {
          role: 'OWNER',
        },
      });

      console.log('Tenant provisioned successfully:', {
        tenantId: result.tenant.id,
        userId: result.user.id,
        clerkUserId,
      });

      return NextResponse.json(
        {
          message: 'Tenant provisioned successfully',
          tenantId: result.tenant.id,
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error('Error provisioning tenant:', error);
      const subErrors = error?.errors?.map((e: any) => e?.message || String(e)) || [];
      return NextResponse.json(
        {
          error: 'Failed to provision tenant',
          details: error?.message || String(error),
          name: error?.name,
          subErrors,
          code: error?.code,
        },
        { status: 500 }
      );
    }
  }

  // For other event types, just acknowledge receipt
  return NextResponse.json(
    { message: 'Webhook received' },
    { status: 200 }
  );
}
