-- Remove Clerk authentication fields and add password-based auth

-- Step 1: Add passwordHash column to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- Step 2: Drop clerkUserId index and unique constraint from User
DROP INDEX IF EXISTS "User_clerkUserId_idx";
DROP INDEX IF EXISTS "User_clerkUserId_key";

-- Step 3: Drop clerkUserId column from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "clerkUserId";

-- Step 4: Drop clerkInvitationId index and unique constraint from DriverInvitation
DROP INDEX IF EXISTS "DriverInvitation_clerkInvitationId_idx";
DROP INDEX IF EXISTS "DriverInvitation_clerkInvitationId_key";

-- Step 5: Drop clerkInvitationId column from DriverInvitation
ALTER TABLE "DriverInvitation" DROP COLUMN IF EXISTS "clerkInvitationId";

-- Step 6: Add unique constraint on email per tenant
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_tenantId_key" ON "User"("email", "tenantId");

-- Step 7: Update demo owner email if it uses the old format
UPDATE "User" SET "email" = 'demo@drivecommand.com' WHERE "email" = 'owner@drivecommand.demo' AND "role" = 'OWNER';

-- Step 8: Set password hash for existing users so they can log in
-- demo1234 hashed with bcrypt (12 rounds)
UPDATE "User" SET "passwordHash" = '$2b$12$vjCUdUpGwN49xDTddiGzd.8WCjUK55AdoG35JCfqhA6eQghl33tde' WHERE "passwordHash" IS NULL;
