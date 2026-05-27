---
phase: quick-408
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/407b-verify-jwt-claim-key.ts
autonomous: true

must_haves:
  truths:
    - "Script signs in to Supabase Auth as owner@test.com and decodes the JWT payload"
    - "Script signs in to Supabase Auth as owner_b@test.com and decodes the JWT payload"
    - "Script prints the full decoded JWT payload as JSON (2-space indent) for each account"
    - "Script prints four explicit key checks per account: payload.tenantId, payload.tenant_id, payload.app_metadata?.tenantId, payload.app_metadata?.tenant_id"
    - "Script prints a canonical policy expression verdict per account (one of the 6 known cases)"
    - "Script never logs the raw access_token string"
    - "Script signs out cleanly and exits 0 on success, non-zero on auth failure"
  artifacts:
    - path: "apps/web/scripts/audit/407b-verify-jwt-claim-key.ts"
      provides: "Read-only JWT claim shape diagnostic"
      contains: "signInWithPassword"
  key_links:
    - from: "apps/web/scripts/audit/407b-verify-jwt-claim-key.ts"
      to: "@supabase/supabase-js"
      via: "createClient with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY"
      pattern: "createClient.*SUPABASE_URL.*SUPABASE_ANON_KEY"
---

<objective>
Build a read-only diagnostic script that proves — by live JWT decode — the exact key name and location the RLS policies must reference for tenant scoping.

Purpose: Quick-407 confirmed `app_metadata.tenantId` is populated on the auth user record. We now need an end-to-end live test: sign in, fetch a real session, decode the JWT, and verify which of the four candidate keys (`tenantId` / `tenant_id`, top-level / nested under `app_metadata`) actually appears in the access token. This output drives the canonical RLS policy expression we will commit.

Output: `apps/web/scripts/audit/407b-verify-jwt-claim-key.ts` — a single tsx-runnable script. No persistence, no data mutation, no findings doc.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/scripts/audit/406b-resolve-blockers.ts
@apps/web/scripts/seed-qa-accounts.ts
@apps/web/src/lib/supabase/admin.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create 407b-verify-jwt-claim-key.ts JWT claim shape diagnostic</name>
  <files>apps/web/scripts/audit/407b-verify-jwt-claim-key.ts</files>
  <action>
Create a single TypeScript file at `apps/web/scripts/audit/407b-verify-jwt-claim-key.ts` that performs a live JWT decode diagnostic for two QA accounts.

**Header block (file-level JSDoc):**
Mirror the style of `406b-resolve-blockers.ts`. State:
- Purpose: confirm the exact claim key name + location (tenantId vs tenant_id; top-level vs app_metadata) used in live Supabase access tokens
- Guard-rails: read-only — no INSERT/UPDATE/DELETE/ALTER; only `signInWithPassword` + `signOut`. Never logs the raw access_token.
- Run command: `npx tsx --env-file=.env.local scripts/audit/407b-verify-jwt-claim-key.ts` (from apps/web/)

**Imports:**
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
```
Do NOT import Prisma — this script does not touch the database.

**Setup:**
- Read `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. If either is missing, `console.error` a clear message and `process.exit(1)`.
- Create a Supabase client with `{ auth: { autoRefreshToken: false, persistSession: false } }` — this matches `apps/web/src/lib/supabase/admin.ts` but uses the **anon key** (not service role) because we are signing in as a real user.

**Types — strict mode, no implicit `any`:**
```ts
interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  tenantId?: string;
  tenant_id?: string;
  app_metadata?: {
    tenantId?: string;
    tenant_id?: string;
    [key: string]: unknown;
  };
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AccountCheck {
  email: string;
  topLevel_tenantId: string | undefined;
  topLevel_tenant_id: string | undefined;
  appMeta_tenantId: string | undefined;
  appMeta_tenant_id: string | undefined;
  verdict: string;
}
```

**JWT decode helper (pure function, no external dep):**
```ts
function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT: expected 3 parts');
  const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
  const json = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(json) as JwtPayload;
}
```

**Verdict helper — return exactly one of the 6 canonical cases:**
```ts
function computeVerdict(p: JwtPayload): string {
  const t1 = typeof p.tenantId === 'string' && p.tenantId.length > 0;
  const t2 = typeof p.tenant_id === 'string' && p.tenant_id.length > 0;
  const t3 = typeof p.app_metadata?.tenantId === 'string' && p.app_metadata.tenantId.length > 0;
  const t4 = typeof p.app_metadata?.tenant_id === 'string' && p.app_metadata.tenant_id.length > 0;

  if (t1) return "CASE 1 — top-level 'tenantId' present. Use: (auth.jwt() ->> 'tenantId')::uuid";
  if (t2) return "CASE 2 — top-level 'tenant_id' present. Use: (auth.jwt() ->> 'tenant_id')::uuid";
  if (t3) return "CASE 3 — app_metadata.tenantId present. Use: (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid";
  if (t4) return "CASE 4 — app_metadata.tenant_id present. Use: (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid";
  if (p.app_metadata) return 'CASE 5 — app_metadata exists but contains no tenant key. RLS cannot scope by JWT claim — block release.';
  return 'CASE 6 — no app_metadata and no tenant claim anywhere. RLS cannot scope by JWT claim — block release.';
}
```

**Per-account routine:**
```ts
async function checkAccount(supabase: SupabaseClient, email: string, password: string): Promise<AccountCheck> {
  console.log(`\n=== Account: ${email} ===`);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error(`AUTH FAILURE for ${email}: ${error?.message ?? 'no session returned'}`);
    throw new Error(`Auth failure for ${email}`);
  }
  const payload = decodeJwtPayload(data.session.access_token);

  console.log('\n--- Decoded JWT payload ---');
  console.log(JSON.stringify(payload, null, 2));

  console.log('\n--- Key checks ---');
  console.log(`  payload.tenantId                  = ${JSON.stringify(payload.tenantId)}`);
  console.log(`  payload.tenant_id                 = ${JSON.stringify(payload.tenant_id)}`);
  console.log(`  payload.app_metadata?.tenantId    = ${JSON.stringify(payload.app_metadata?.tenantId)}`);
  console.log(`  payload.app_metadata?.tenant_id   = ${JSON.stringify(payload.app_metadata?.tenant_id)}`);

  const verdict = computeVerdict(payload);
  console.log(`\n--- Verdict ---\n  ${verdict}`);

  await supabase.auth.signOut();

  return {
    email,
    topLevel_tenantId: payload.tenantId,
    topLevel_tenant_id: payload.tenant_id,
    appMeta_tenantId: payload.app_metadata?.tenantId,
    appMeta_tenant_id: payload.app_metadata?.tenant_id,
    verdict,
  };
}
```

**Main:**
```ts
async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env');
    process.exit(1);
  }
  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const a = await checkAccount(supabase, 'owner@test.com', 'TestPass123!');
  const b = await checkAccount(supabase, 'owner_b@test.com', 'TestPass123!');

  console.log('\n=== Cross-account confirmation ===');
  console.log(`  owner@test.com   verdict: ${a.verdict}`);
  console.log(`  owner_b@test.com verdict: ${b.verdict}`);
  if (a.verdict.split(' — ')[0] === b.verdict.split(' — ')[0]) {
    console.log('  CONFIRMED: both accounts resolve to the same canonical case.');
  } else {
    console.log('  WARNING: accounts resolved to different cases — JWT claim shape is not consistent.');
  }
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

**Critical constraints (re-verify before saving):**
- Do NOT print `data.session.access_token` anywhere — only `JSON.stringify(payload)` is allowed.
- Do NOT use the service role key — we need the actual user JWT, not an admin token.
- TypeScript strict mode: every variable typed, no implicit `any`, optional chaining used correctly.
- Exit code: 0 on full success, 1 on auth failure or missing env. The `main().catch` handler must `process.exit(1)`.
- Use `Buffer.from(..., 'base64')` for decode — Node-native, no extra dependency.
  </action>
  <verify>
From apps/web/:
1. `npx tsc --noEmit scripts/audit/407b-verify-jwt-claim-key.ts` — passes with no errors (strict mode clean).
2. `npx tsx --env-file=.env.local scripts/audit/407b-verify-jwt-claim-key.ts` — runs end-to-end, prints two `=== Account: ... ===` blocks, each with a decoded payload, 4 key checks, and a verdict line.
3. Output contains the literal string `CASE ` followed by a digit 1-6 for both accounts.
4. Output does NOT contain the substring `eyJ` (base64 JWT header marker) — confirming the access_token was never logged.
5. Process exit code is 0.
  </verify>
  <done>
Script file exists at `apps/web/scripts/audit/407b-verify-jwt-claim-key.ts`, passes `tsc --noEmit`, runs cleanly against both QA accounts, prints the canonical RLS policy expression verdict for each, and exits 0. The user has the exact claim path needed to write the RLS policy.
  </done>
</task>

</tasks>

<verification>
Run the script after creation:
```bash
cd apps/web
npx tsc --noEmit scripts/audit/407b-verify-jwt-claim-key.ts
npx tsx --env-file=.env.local scripts/audit/407b-verify-jwt-claim-key.ts
```
Both commands must succeed. The second prints two account blocks ending in matching `CASE N — ...` verdicts.
</verification>

<success_criteria>
- File exists: `apps/web/scripts/audit/407b-verify-jwt-claim-key.ts`
- `tsc --noEmit` passes (strict mode)
- Live run signs in as both `owner@test.com` and `owner_b@test.com` (TestPass123!) and prints decoded payloads
- All 4 key checks printed per account
- One of 6 canonical verdicts printed per account
- Raw access_token is never logged
- Process exits 0 on success, non-zero on auth failure
- No database writes, no file writes, no persistence
</success_criteria>

<output>
After completion, create `.planning/quick/408-407b-verify-jwt-claim-key-ts-decode-live/408-SUMMARY.md` with:
- The canonical verdict reported for each account
- The exact policy expression string the user should now use in RLS migrations
- Confirmation that both accounts resolved to the same case
</output>
