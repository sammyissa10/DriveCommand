-- Create PushToken table for mobile push notification registration
CREATE TABLE IF NOT EXISTS "PushToken" (
  "id"        TEXT        NOT NULL,
  "userId"    UUID        NOT NULL,
  "token"     TEXT        NOT NULL,
  "platform"  TEXT        NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushToken_userId_platform_key" UNIQUE ("userId", "platform"),
  CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PushToken_userId_idx" ON "PushToken"("userId");

-- RLS: users can only access their own push tokens
ALTER TABLE "PushToken" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_isolation_policy ON "PushToken";
CREATE POLICY user_isolation_policy ON "PushToken"
  FOR ALL
  USING ("userId"::text = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS bypass_rls_policy ON "PushToken";
CREATE POLICY bypass_rls_policy ON "PushToken"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
