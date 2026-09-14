/**
 * quick-601 (B3) — the provisioning path runs under the tenant GUC, not the bypass.
 *
 * WHAT THIS PINS
 * --------------
 * Sign-up, email confirmation and onboarding hydration were nine
 * `set_config('app.bypass_rls', 'on', TRUE)` sites across six files. They are now
 * zero, and every transaction on the path declares `app.current_tenant_id`
 * instead. The database half is proven by `scripts/audit/601-provisioning-verify.ts`
 * against staging as `app_user`; this is the source half, and the two catch
 * different classes (quick-549's rule — a row assertion cannot see a file being
 * edited back, and a source scan cannot see a policy being dropped).
 *
 * THE INVARIANTS
 * --------------
 *   1. NO provisioning-path file contains the bypass `set_config`. Reinstating one
 *      would re-hide the failures this task exists to close, and it is a
 *      one-line, routine-looking edit.
 *   2. Every provisioning transaction sets the tenant GUC, and does it through
 *      `setTransactionTenantId` — not by hand. The GUC name and its
 *      transaction scope are written down in exactly ONE place, and a hand-rolled
 *      copy is how nine literals became nine different literals last time.
 *   3. `provisionTenant` mints the tenant id in the application and passes it as
 *      `id:` to `tenant.create`. This is the whole mechanism: three separate
 *      policy checks need the GUC to already hold the new id when the INSERT runs,
 *      and a database-generated id cannot be known in time.
 *   4. The three global reads go through their SQL functions, and the raw
 *      cross-tenant queries they replaced are gone.
 *
 * ANTI-VACUITY, because the failure mode of a bad file read is GREEN, not red
 * (quick-546):
 *   - every file must be found and be non-trivially long, asserted before any
 *     content claim is made;
 *   - a positive counter-assertion pins that the bypass literal IS still findable
 *     elsewhere in the tree, so invariant 1 cannot pass by the search being broken;
 *   - line endings are normalised. `core.autocrlf=true` with no `.gitattributes`
 *     means the working tree is CRLF and the index is LF.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

const BYPASS_SET_CONFIG = "set_config('app.bypass_rls'";
const GUC_HELPER = 'setTransactionTenantId';

/** Every file quick-601 moved off the bypass. */
const PROVISIONING_PATH_FILES = [
  'lib/onboarding/provision-tenant.ts',
  'lib/onboarding/hydrate-tenant.ts',
  'lib/onboarding/confirm-tenant-email.ts',
  'lib/onboarding/onboarding-flags.ts',
  'app/onboarding/welcome/page.tsx',
  'app/(auth)/sign-up/actions.tsx',
  'app/api/email-confirm/[token]/route.ts',
  'lib/db/repositories/tenant.repository.ts',
] as const;

/** Files that must call the shared GUC helper (the page delegates to lib/onboarding). */
const FILES_THAT_SET_THE_GUC = [
  'lib/onboarding/provision-tenant.ts',
  'lib/onboarding/hydrate-tenant.ts',
  'lib/onboarding/confirm-tenant-email.ts',
  'lib/onboarding/onboarding-flags.ts',
  'app/(auth)/sign-up/actions.tsx',
  'lib/db/repositories/tenant.repository.ts',
] as const;

/** A real file here is hundreds of bytes; 200 catches a truncated or empty read. */
const MIN_FILE_BYTES = 200;

function read(relPath: string): string {
  return readFileSync(join(SRC, relPath), 'utf8').replace(/\r\n/g, '\n');
}

describe('quick-601 — the provisioning path runs under the tenant GUC', () => {
  describe('the files are actually being read', () => {
    it.each(PROVISIONING_PATH_FILES)('%s is found and non-trivial', (relPath) => {
      const source = read(relPath);
      expect(source.length).toBeGreaterThan(MIN_FILE_BYTES);
    });
  });

  describe('invariant 1 — no bypass flag on the provisioning path', () => {
    it.each(PROVISIONING_PATH_FILES)('%s does not set app.bypass_rls', (relPath) => {
      expect(read(relPath)).not.toContain(BYPASS_SET_CONFIG);
    });

    it('COUNTER-ASSERTION: the bypass literal is still findable elsewhere, so the search works', () => {
      // If this ever goes to zero the whole migration is done and this assertion
      // should be revisited deliberately — not deleted to make a run green.
      const stillUsingBypass = read('lib/auth/supabase.ts');
      expect(stillUsingBypass).toContain(BYPASS_SET_CONFIG);
    });
  });

  describe('invariant 2 — the GUC is set through the one helper', () => {
    it.each(FILES_THAT_SET_THE_GUC)('%s calls setTransactionTenantId', (relPath) => {
      expect(read(relPath)).toContain(`${GUC_HELPER}(`);
    });

    it('no provisioning-path file hand-rolls the tenant set_config', () => {
      for (const relPath of PROVISIONING_PATH_FILES) {
        expect(read(relPath)).not.toContain("set_config('app.current_tenant_id'");
      }
    });

    it('the helper writes the GUC at TRANSACTION scope, and says so in one place', () => {
      const helper = read('lib/db/tenant-guc.ts');
      expect(helper.length).toBeGreaterThan(MIN_FILE_BYTES);
      expect(helper).toContain("set_config('app.current_tenant_id'");
      expect(helper).toContain('TRUE');
      // Session scope here would leave a pooled connection pinned to a tenant a
      // rolled-back sign-up never finished creating.
      expect(helper).not.toContain('${tenantId}, false');
    });
  });

  describe('invariant 3 — the tenant id is minted in the application', () => {
    const source = read('lib/onboarding/provision-tenant.ts');

    it('imports randomUUID', () => {
      expect(source).toMatch(/import \{ randomUUID \} from 'crypto'/);
    });

    it('declares the id in the GUC BEFORE tenant.create, not after', () => {
      const gucAt = source.indexOf(`${GUC_HELPER}(tx, tenantId)`);
      const createAt = source.indexOf('tx.tenant.create(');
      expect(gucAt).toBeGreaterThan(-1);
      expect(createAt).toBeGreaterThan(-1);
      expect(gucAt).toBeLessThan(createAt);
    });

    it('passes the minted id into tenant.create', () => {
      expect(source).toMatch(/data:\s*\{\s*\n\s*id: tenantId,/);
    });
  });

  describe('invariant 4 — the global reads go through their SQL functions', () => {
    it('provision-tenant uses provisioning_email_taken and provisioning_next_slug', () => {
      const source = read('lib/onboarding/provision-tenant.ts');
      expect(source).toContain('provisioning_email_taken(');
      expect(source).toContain('provisioning_next_slug(');
      // The Prisma reads they replaced returned zero rows silently under a
      // tenant-scoped role — the email guard stopped guarding and the slug loop
      // exited on its first iteration.
      expect(source).not.toContain('tx.user.findFirst(');
      expect(source).not.toContain('tx.tenant.findFirst(');
    });

    it('generateVehicleIds uses carrier_max_vehicle_id, not a raw carrier_trucks read', () => {
      const source = read('lib/carrier/fleet-trucks.ts');
      expect(source).toContain('carrier_max_vehicle_id(');
      expect(source).not.toContain('FROM carrier_trucks WHERE vehicle_id LIKE');
    });
  });
});
