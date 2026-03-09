/**
 * One-off script: resend invitation emails for all PENDING invitations.
 * Uses Gmail SMTP (new email infrastructure).
 * Run: npx tsx scripts/resend-pending-invitations.ts
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';
import { render } from '@react-email/render';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const GMAIL_USER = process.env.GMAIL_USER!;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD!;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error('❌  GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env.local');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD.replace(/\s/g, ''),
  },
});

async function main() {
  // Fetch all pending invitations with tenant info
  const invitations = await prisma.$queryRaw<Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    expiresAt: Date;
    tenantName: string;
  }>>`
    SELECT i.id, i.email, i."firstName", i."lastName", i.role, i."expiresAt", t.name as "tenantName"
    FROM "DriverInvitation" i
    JOIN "Tenant" t ON t.id = i."tenantId"
    WHERE i.status = 'PENDING'
    ORDER BY i."createdAt" DESC
  `;

  if (!invitations.length) {
    console.log('No pending invitations found.');
    return;
  }

  console.log(`Found ${invitations.length} pending invitation(s):\n`);

  for (const inv of invitations) {
    console.log(`  • ${inv.email} — ${inv.tenantName} (${inv.role})`);
  }

  console.log('\nSending emails...\n');

  for (const inv of invitations) {
    const acceptUrl = `${APP_URL}/accept-invitation?id=${inv.id}`;
    const expiresAt = new Date(inv.expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let subject: string;
    let html: string;

    if (inv.role === 'OWNER') {
      const { OwnerInvitationEmail } = await import('../src/emails/owner-invitation');
      subject = `Set up your ${inv.tenantName} account on DriveCommand`;
      html = await render(OwnerInvitationEmail({
        firstName: inv.firstName,
        lastName: inv.lastName,
        organizationName: inv.tenantName,
        acceptUrl,
        expiresAt,
      }));
    } else {
      const { DriverInvitationEmail } = await import('../src/emails/driver-invitation');
      subject = `You're invited to join ${inv.tenantName} on DriveCommand`;
      html = await render(DriverInvitationEmail({
        firstName: inv.firstName,
        lastName: inv.lastName,
        organizationName: inv.tenantName,
        acceptUrl,
        expiresAt,
      }));
    }

    try {
      await transporter.sendMail({
        from: `DriveCommand <${GMAIL_USER}>`,
        to: inv.email,
        subject,
        html,
      });
      console.log(`  ✅  Sent to ${inv.email}`);
    } catch (err: any) {
      console.error(`  ❌  Failed for ${inv.email}: ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main().finally(() => prisma.$disconnect().then(() => pool.end()));
