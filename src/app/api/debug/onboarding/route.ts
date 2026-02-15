import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Debug endpoint to diagnose onboarding issues.
 * Returns the state of session claims, Clerk user metadata, and DB records.
 * TODO: Remove this endpoint after onboarding is confirmed working.
 */
export async function GET() {
  try {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 1. Session claims
    const sessionPrivateMetadata = sessionClaims?.privateMetadata;
    const sessionPublicMetadata = sessionClaims?.publicMetadata;

    // 2. Direct Clerk API fetch
    let clerkUserMetadata = null;
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      clerkUserMetadata = {
        privateMetadata: user.privateMetadata,
        publicMetadata: user.publicMetadata,
      };
    } catch (e: any) {
      clerkUserMetadata = { error: e.message };
    }

    // 3. Database check (bypass RLS)
    let dbUser = null;
    try {
      dbUser = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findUnique({
          where: { clerkUserId: userId },
          include: { tenant: true },
        });
      });
    } catch (e: any) {
      dbUser = { error: e.message };
    }

    return NextResponse.json({
      clerkUserId: userId,
      sessionClaims: {
        privateMetadata: sessionPrivateMetadata ?? null,
        publicMetadata: sessionPublicMetadata ?? null,
      },
      clerkApiMetadata: clerkUserMetadata,
      dbUser,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
