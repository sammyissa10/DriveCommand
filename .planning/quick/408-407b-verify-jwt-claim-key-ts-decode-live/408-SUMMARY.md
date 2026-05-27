# Quick Task 408 — Summary

**Task:** Create `apps/web/scripts/audit/407b-verify-jwt-claim-key.ts` — live JWT decode diagnostic to confirm exact tenantId claim key for RLS policies

**Status:** COMPLETE — RESULT: GO

---

## Script Output (2026-05-27)

Both QA accounts signed in, decoded, and verified cleanly. Exit code: 0.

### owner@test.com
- `payload.tenantId` — NOT PRESENT (top-level)
- `payload.tenant_id` — NOT PRESENT (top-level)
- `payload.app_metadata.tenantId` — **"73c69018-9047-40d0-9203-631985ca1ccd"** ✓
- `payload.app_metadata.tenant_id` — NOT PRESENT

Verdict: `POLICY EXPRESSION: (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid`

### owner_b@test.com
- `payload.tenantId` — NOT PRESENT (top-level)
- `payload.tenant_id` — NOT PRESENT (top-level)
- `payload.app_metadata.tenantId` — **"2bad9011-032b-4f5c-a736-ba7e6cb60f83"** ✓
- `payload.app_metadata.tenant_id` — NOT PRESENT

Verdict: `POLICY EXPRESSION: (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid`

---

## Cross-Account Confirmation

CONFIRMED: both accounts resolve to the same canonical case.

---

## Canonical RLS Policy Expression

```sql
(auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid
```

**Use this expression in every RLS policy** that needs to scope rows by tenant. Example for a carrier table:

```sql
CREATE POLICY carrier_select_own ON "SomeTable"
  FOR SELECT
  USING (
    "tenantId" = (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid
  );
```

**Why `-> 'app_metadata' ->> 'tenantId'` and not `->> 'tenantId'` directly?**

Supabase Auth passes `app_metadata` as a nested JSON object in the JWT. The claim is at:
```
jwt.app_metadata.tenantId  (camelCase, nested — NOT top-level)
```
The `->` operator extracts the nested JSON object; `->>` then extracts the string value from it.

---

## Artifacts

- Script: `apps/web/scripts/audit/407b-verify-jwt-claim-key.ts`
- tsc --noEmit: clean (pre-existing @types/mdx errors unrelated to this script)
- Run command: `npx tsx --env-file=.env.local scripts/audit/407b-verify-jwt-claim-key.ts` (from apps/web/)
