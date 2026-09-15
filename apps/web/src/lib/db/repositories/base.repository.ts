import { PrismaClient } from '../../../generated/prisma/client';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';

/**
 * Base class for tenant-scoped repositories.
 *
 * ─── quick-610: THIS CLASS USED TO HAND OUT A CLIENT WITH NO GUC ───────────
 *
 * It used to assign `this.db = createTenantClient(tenantId)` in the constructor,
 * and its own comment claimed queries were scoped "via PostgreSQL RLS policies +
 * transaction-local set_config()". Half of that was true and the half that was
 * not is the one that matters: `createTenantClient` applies the `withTenantRLS`
 * argument-injection extension and issues **no `set_config` at all**
 * (`docs/audits/guc-binding.md` §1). So the Prisma-level filter was present and
 * the database-level one was not — the policies consult
 * `current_tenant_id()`, which reads a GUC nothing on this path ever wrote.
 *
 * That was LATENT rather than broken, and the distinction is the whole reason it
 * survived: `prisma.ts` holds `max: 1` and the GUC is SESSION scope, so any
 * earlier request that went through `getTenantPrisma()` left a tenant context on
 * the one pooled connection, and this class silently borrowed it. Correct answers,
 * for a reason no caller controls — and the WRONG tenant's context is just as
 * easy to inherit as the right one.
 *
 * Measured, not reasoned about: on staging as `app_user` with the tripwire armed,
 * a fresh process whose first tenant-touching statement went through this class
 * raised `TC001` (evidence `02-cold-before.md`, site s6).
 *
 * ─── WHY A LAZY ACCESSOR AND NOT A CONSTRUCTOR ASSIGNMENT ──────────────────
 *
 * `getTenantPrismaForOrg` is ASYNC — it awaits `assertRoleBootGuard()` and then
 * the `set_config` — and a constructor cannot await. The alternative shape, an
 * async static factory, was rejected: it makes construction async and so rewrites
 * all 22 `new DocumentRepository(tenantId)` call sites, changing what those
 * callers DO rather than only how this class obtains its client. The accessor
 * leaves every one of those 22 sites byte-identical.
 *
 * ─── THE `db` FIELD IS DELETED ON PURPOSE ──────────────────────────────────
 *
 * Not tidiness. With the field gone, every surviving `this.db.` reference is a
 * COMPILE ERROR, so tsc enumerates the methods that still have to be converted.
 * Keeping `db` alongside `client()` would let a method quietly go on using the
 * GUC-less client — which is the exact defect being closed here. Same idiom as
 * the T3/T4 verdict union: make the wrong state unrepresentable rather than
 * writing down a rule a later edit can drop.
 *
 * ─── AND IT IS DELIBERATELY NOT MEMOISED ───────────────────────────────────
 *
 * Every non-transactional statement is an INDEPENDENT pool checkout and the GUC
 * is written at session scope, so caching the resolved client on the instance
 * would re-open the same bug the moment another tenant's statement interleaves
 * between two method calls on one repository object. The cost is one extra
 * round trip per method — named as an accepted cost rather than hidden, and it
 * is the same cost every already-migrated path in this codebase pays.
 *
 * ─── NO `userId` ───────────────────────────────────────────────────────────
 *
 * `createTenantClient(tenantId)` was called here with no `userId`, so the
 * audit-column extension was a no-op. `getTenantPrismaForOrg(tenantId)` is
 * likewise called with none, so `DocumentRepository#create` keeps writing
 * exactly the columns it wrote before. Forwarding a session user here would
 * start populating `createdById`/`updatedById` — a behaviour change wearing the
 * clothes of a routing fix.
 */
export class TenantRepository {
  protected readonly tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * The tenant-scoped client, resolved per call.
   *
   * Sets `app.current_tenant_id` on the pooled connection and applies the same
   * `withTenantRLS` extension the constructor used to apply, so both the Prisma
   * filter and the database policy now agree on the tenant.
   */
  protected async client(): Promise<PrismaClient> {
    return getTenantPrismaForOrg(this.tenantId);
  }
}
