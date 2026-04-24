/**
 * tRPC server initialization.
 * Context reads the existing Supabase session (no new auth mechanism).
 * Two procedure bases are exported:
 *   - tenantMemberProcedure: requires authentication (any role)
 *   - adminProcedure: requires OWNER or MANAGER role
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import { getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';

export const createTRPCContext = cache(async (opts: { headers: Headers }) => {
  const session = await getSession();
  return { session, headers: opts.headers };
});

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/**
 * Requires authentication (any role). Exposes tenantId and userId on ctx.
 */
export const tenantMemberProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return opts.next({
    ctx: {
      ...ctx,
      session: ctx.session,
      tenantId: ctx.session.tenantId,
      userId: ctx.session.userId,
    },
  });
});

/**
 * Requires OWNER or MANAGER role. Inherits from tenantMemberProcedure.
 */
export const adminProcedure = tenantMemberProcedure.use(async (opts) => {
  const role = opts.ctx.session.role as UserRole;
  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return opts.next();
});
