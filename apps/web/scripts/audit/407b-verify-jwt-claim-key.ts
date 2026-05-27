/**
 * 407b-verify-jwt-claim-key.ts
 *
 * Purpose: Confirm the exact JWT claim key and location that RLS policies must
 * reference for tenant scoping (tenantId vs tenant_id; top-level vs nested in
 * app_metadata). Decodes live Supabase access tokens for two QA accounts and
 * prints a canonical policy expression verdict.
 *
 * GUARD-RAILS — this script performs NO writes:
 *   Only signInWithPassword + signOut. Never logs the raw access_token.
 *   No INSERT, UPDATE, DELETE, ALTER, CREATE, or DROP anywhere in this file.
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/407b-verify-jwt-claim-key.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types — strict mode, no implicit any
// ---------------------------------------------------------------------------

interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  aud?: string | string[];
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

// ---------------------------------------------------------------------------
// JWT decode helper — Node-native Buffer, no external dep, no sig verify
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT: expected 3 parts');
  const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
  const json = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(json) as JwtPayload;
}

// ---------------------------------------------------------------------------
// Verdict helper — returns exactly one of 6 canonical cases
// ---------------------------------------------------------------------------

function computeVerdict(p: JwtPayload): string {
  const t1 = typeof p.tenantId === 'string' && p.tenantId.length > 0;
  const t2 = typeof p.tenant_id === 'string' && p.tenant_id.length > 0;
  const t3 =
    typeof p.app_metadata?.tenantId === 'string' && (p.app_metadata.tenantId as string).length > 0;
  const t4 =
    typeof p.app_metadata?.tenant_id === 'string' &&
    (p.app_metadata.tenant_id as string).length > 0;

  const found: string[] = [];
  if (t1) found.push("POLICY EXPRESSION: (auth.jwt() ->> 'tenantId')::uuid");
  if (t2) found.push("POLICY EXPRESSION: (auth.jwt() ->> 'tenant_id')::uuid");
  if (t3) found.push("POLICY EXPRESSION: (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid");
  if (t4) found.push("POLICY EXPRESSION: (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid");

  if (found.length > 1) return `MULTIPLE LOCATIONS — choose canonical, all found: ${found.join(' | ')}`;
  if (found.length === 1) return found[0];
  return 'NOT FOUND IN JWT — STOP, do not write policies';
}

// ---------------------------------------------------------------------------
// Per-account routine
// ---------------------------------------------------------------------------

async function checkAccount(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<AccountCheck> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Account: ${email}`);
  console.log('='.repeat(60));

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error(`AUTH FAILURE for ${email}: ${error?.message ?? 'no session returned'}`);
    throw new Error(`Auth failure for ${email}`);
  }

  const payload = decodeJwtPayload(data.session.access_token);

  console.log('\n--- Decoded JWT payload ---');
  console.log(JSON.stringify(payload, null, 2));

  console.log('\n--- Key checks ---');
  console.log(
    `  Does payload have key 'tenantId'?                    value: ${payload.tenantId !== undefined ? JSON.stringify(payload.tenantId) : 'NOT PRESENT'}`,
  );
  console.log(
    `  Does payload have key 'tenant_id'?                   value: ${payload.tenant_id !== undefined ? JSON.stringify(payload.tenant_id) : 'NOT PRESENT'}`,
  );
  console.log(
    `  Does payload.app_metadata have key 'tenantId'?       value: ${payload.app_metadata?.tenantId !== undefined ? JSON.stringify(payload.app_metadata.tenantId) : 'NOT PRESENT'}`,
  );
  console.log(
    `  Does payload.app_metadata have key 'tenant_id'?      value: ${payload.app_metadata?.tenant_id !== undefined ? JSON.stringify(payload.app_metadata.tenant_id) : 'NOT PRESENT'}`,
  );

  const verdict = computeVerdict(payload);
  console.log(`\n--- Verdict ---`);
  console.log(`  ${verdict}`);

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error(
      'ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.',
    );
    console.error('Run: npx tsx --env-file=.env.local scripts/audit/407b-verify-jwt-claim-key.ts');
    process.exit(1);
  }

  // Use anon key — we need a real user JWT (not service role), because that is
  // exactly what RLS policies will see at query time.
  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('407b — JWT Claim Shape Diagnostic');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('Signing in as two QA accounts to decode live JWTs...');

  const a = await checkAccount(supabase, 'owner@test.com', 'TestPass123!');
  const b = await checkAccount(supabase, 'owner_b@test.com', 'TestPass123!');

  console.log(`\n${'='.repeat(60)}`);
  console.log('Cross-account confirmation');
  console.log('='.repeat(60));
  console.log(`  owner@test.com   verdict: ${a.verdict}`);
  console.log(`  owner_b@test.com verdict: ${b.verdict}`);

  const caseA = a.verdict.split(' — ')[0];
  const caseB = b.verdict.split(' — ')[0];

  if (caseA === caseB && !caseA.startsWith('NOT FOUND') && !caseA.startsWith('MULTIPLE')) {
    console.log('\n  CONFIRMED: both accounts resolve to the same canonical case.');
    console.log(`  CANONICAL POLICY EXPRESSION TO USE:`);
    // Extract just the POLICY EXPRESSION part from the verdict
    const expr = a.verdict.startsWith('POLICY EXPRESSION:') ? a.verdict : a.verdict;
    console.log(`    ${expr}`);
  } else if (caseA === caseB) {
    console.log('\n  BOTH ACCOUNTS AGREE — but this is a warning case. See verdicts above.');
  } else {
    console.log(
      '\n  WARNING: accounts resolved to different cases — JWT claim shape is NOT consistent.',
    );
    console.log('  This is a bug: tenantId population is inconsistent across users.');
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);
}

main().catch((err: unknown) => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
