/**
 * tRPC router for Automation Recipes — spec Section 11.
 *
 * Exposes 3 admin-only procedures:
 *   listRecipes  — all 7 pre-built recipes with per-tenant enabled state + play count
 *   enableRecipe — create or reactivate a PlaybookTrigger for a recipe
 *   disableRecipe — set isActive=false on all matching triggers (no instance mutation)
 *
 * IMPORTANT: fire is NOT exposed as a tRPC procedure.
 * fireEvent is an internal server-side function called from lifecycle hooks only.
 * Exposing it would allow clients to trigger arbitrary automation runs.
 */
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '@/server/api/trpc';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { prisma } from '@/lib/db/prisma'; // kept for user.findMany — platform table
import { RECIPES, getRecipeByKey } from '@/server/services/workflows/recipes';
import {
  enableRecipeSchema,
  disableRecipeSchema,
  createCustomRuleSchema,
  deleteRuleSchema,
} from '@drivecommand/validation';
import type { Prisma } from '@/generated/prisma';

export const triggerRouter = router({
  /** List all pre-built recipes with per-tenant enabled state + play count. */
  listRecipes: adminProcedure.query(async ({ ctx }) => {
    const tenantPrisma = await getTenantPrisma();
    // Load all active PlaybookTrigger rows for this tenant
    const triggers = await tenantPrisma.playbookTrigger.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      include: {
        playbook: { select: { id: true, name: true } },
      },
    });

    // For each recipe, determine if any active PlaybookTrigger matches its triggerEvent + conditions
    return Promise.all(
      RECIPES.map(async (recipe) => {
        const matchingTrigger = triggers.find(
          (t) =>
            t.triggerEvent === recipe.triggerEvent &&
            JSON.stringify(t.conditions ?? {}) === JSON.stringify(recipe.conditions ?? {})
        );
        return {
          key: recipe.key,
          displayName: recipe.displayName,
          sentence: recipe.sentence,
          triggerEvent: recipe.triggerEvent,
          conditions: recipe.conditions,
          suggestedCategory: recipe.suggestedCategory,
          enabled: Boolean(matchingTrigger),
          playbookId: matchingTrigger?.playbookId ?? null,
          playbookName: matchingTrigger?.playbook.name ?? null,
          // "Active X times" counter — count PlaybookInstance rows spawned by this trigger's playbook
          activeCount: matchingTrigger
            ? await countInstancesForPlaybook(matchingTrigger.playbookId, ctx.tenantId)
            : 0,
        };
      })
    );
  }),

  /** Enable a recipe — create or reactivate a PlaybookTrigger linked to the tenant's chosen playbook. */
  enableRecipe: adminProcedure.input(enableRecipeSchema).mutation(async ({ ctx, input }) => {
    const recipe = getRecipeByKey(input.recipeKey);
    if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found' });

    const tenantPrisma = await getTenantPrisma();

    // Validate playbookId belongs to this tenant
    const playbook = await tenantPrisma.playbook.findFirst({
      where: { id: input.playbookId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!playbook) throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' });

    // Upsert — one active trigger per (tenantId, recipeKey) by matching on event + playbookId
    const existing = await tenantPrisma.playbookTrigger.findFirst({
      where: {
        tenantId: ctx.tenantId,
        triggerEvent: recipe.triggerEvent,
        playbookId: input.playbookId,
      },
    });

    if (existing) {
      return tenantPrisma.playbookTrigger.update({
        where: { id: existing.id },
        data: { isActive: true, conditions: recipe.conditions as Prisma.InputJsonValue },
      });
    }

    return tenantPrisma.playbookTrigger.create({
      data: {
        tenantId: ctx.tenantId,
        playbookId: input.playbookId,
        triggerEvent: recipe.triggerEvent,
        conditions: recipe.conditions as Prisma.InputJsonValue,
        isActive: true,
      },
    });
  }),

  /**
   * Disable a recipe — set isActive=false on ALL matching triggers.
   * Does NOT touch existing PlaybookInstance rows (spec Section 4 DoD test 2).
   */
  disableRecipe: adminProcedure.input(disableRecipeSchema).mutation(async ({ ctx, input }) => {
    const recipe = getRecipeByKey(input.recipeKey);
    if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found' });

    const tenantPrisma = await getTenantPrisma();

    // Find all triggers matching this recipe's event for this tenant
    // then filter by conditions client-side (Prisma's Json filter doesn't support deep equality reliably)
    const candidates = await tenantPrisma.playbookTrigger.findMany({
      where: {
        tenantId: ctx.tenantId,
        triggerEvent: recipe.triggerEvent,
      },
      select: { id: true, conditions: true },
    });

    const matchingIds = candidates
      .filter(
        (t) =>
          JSON.stringify(t.conditions ?? {}) === JSON.stringify(recipe.conditions ?? {})
      )
      .map((t) => t.id);

    if (matchingIds.length === 0) {
      return { disabled: 0 };
    }

    const result = await tenantPrisma.playbookTrigger.updateMany({
      where: { id: { in: matchingIds } },
      data: { isActive: false },
    });

    return { disabled: result.count };
  }),

  /**
   * List all custom (non-recipe) PlaybookTrigger rows for this tenant.
   * Custom rules are identified by the { _custom: true } sentinel written into
   * recurringConfig at creation time. This avoids false-negative filtering when
   * a custom rule shares the same triggerEvent + conditions as a built-in recipe
   * (e.g. ON_DISPATCH_CREATE with empty conditions).
   */
  listCustomRules: adminProcedure.query(async ({ ctx }) => {
    const tenantPrisma = await getTenantPrisma();
    const triggers = await tenantPrisma.playbookTrigger.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        playbook: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const customTriggers = triggers.filter((t) => {
      const rc = t.recurringConfig as Record<string, unknown> | null;
      return rc?._custom === true;
    });

    return customTriggers.map((t) => ({
      id: t.id,
      triggerEvent: t.triggerEvent,
      conditions: t.conditions,
      isActive: t.isActive,
      playbookId: t.playbookId,
      playbookName: t.playbook.name,
      createdAt: t.createdAt,
    }));
  }),

  /** Create a custom PlaybookTrigger (not linked to any recipe). */
  createCustomRule: adminProcedure.input(createCustomRuleSchema).mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();

    // Validate playbookId belongs to this tenant
    const playbook = await tenantPrisma.playbook.findFirst({
      where: { id: input.playbookId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!playbook) throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' });

    // Parse conditions from JSON string — keeps schema types simple
    let conditions: Record<string, unknown> = {};
    try {
      if (input.conditions) {
        conditions = JSON.parse(input.conditions) as Record<string, unknown>;
      }
    } catch {
      conditions = {};
    }

    return tenantPrisma.playbookTrigger.create({
      data: {
        tenantId: ctx.tenantId,
        playbookId: input.playbookId,
        triggerEvent: input.triggerEvent,
        conditions: conditions as Prisma.InputJsonValue,
        recurringConfig: { _custom: true } as Prisma.InputJsonValue,
        isActive: true,
      },
    });
  }),

  /** Hard-delete a PlaybookTrigger by ID (custom rules only). */
  deleteRule: adminProcedure.input(deleteRuleSchema).mutation(async ({ ctx, input }) => {
    const tenantPrisma = await getTenantPrisma();

    // Verify ownership before deleting
    const trigger = await tenantPrisma.playbookTrigger.findFirst({
      where: { id: input.triggerId, tenantId: ctx.tenantId },
    });
    if (!trigger) throw new TRPCError({ code: 'NOT_FOUND', message: 'Trigger not found' });

    await tenantPrisma.playbookTrigger.delete({ where: { id: input.triggerId } });
    return { deleted: true };
  }),

  /**
   * Return the most recent 50 trigger-spawned PlaybookInstance rows for this tenant.
   * Used by the Automation Activity feed on /checklists/automation.
   * triggeredBy='trigger' filter matches the index added in migration 20260428100001.
   */
  listActivityLog: adminProcedure.query(async ({ ctx }) => {
    const tenantPrisma = await getTenantPrisma();
    const instances = await tenantPrisma.playbookInstance.findMany({
      where: { tenantId: ctx.tenantId, triggeredBy: 'trigger' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        triggeredEvent: true,
        entityType: true,
        entityId: true,
        playbook: { select: { id: true, name: true } },
      },
    });

    if (instances.length === 0) return [];

    // Resolve entity display names in batched lookups per entityType
    const driverIds = instances.filter((i) => i.entityType === 'DRIVER').map((i) => i.entityId);
    const vehicleIds = instances.filter((i) => i.entityType === 'VEHICLE').map((i) => i.entityId);
    const partnerIds = instances.filter((i) => i.entityType === 'PARTNER').map((i) => i.entityId);
    const dispatchIds = instances.filter((i) => i.entityType === 'DISPATCH').map((i) => i.entityId);

    const [drivers, vehicles, partners, dispatches] = await Promise.all([
      driverIds.length
        ? prisma.user.findMany({
            where: { id: { in: driverIds }, tenantId: ctx.tenantId },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([]),
      vehicleIds.length
        ? tenantPrisma.carrierTruck.findMany({
            where: { id: { in: vehicleIds }, orgId: ctx.tenantId },
            select: { id: true, unitNumber: true, vin: true },
          })
        : Promise.resolve([]),
      partnerIds.length
        ? tenantPrisma.customer.findMany({
            where: { id: { in: partnerIds }, tenantId: ctx.tenantId },
            select: { id: true, companyName: true },
          })
        : Promise.resolve([]),
      dispatchIds.length
        ? tenantPrisma.trip.findMany({
            where: { id: { in: dispatchIds } },
            select: { id: true, status: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const driverMap = new Map(
      drivers.map((d) => [
        d.id,
        [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email,
      ])
    );
    const vehicleMap = new Map(
      vehicles.map((v) => [v.id, v.unitNumber || v.vin || 'Unknown vehicle'])
    );
    const partnerMap = new Map(partners.map((p) => [p.id, p.companyName]));
    const dispatchMap = new Map(
      dispatches.map((d) => [
        d.id,
        `${d.status} dispatch (${new Date(d.createdAt).toLocaleDateString()})`,
      ])
    );

    return instances.map((i) => {
      let entityName: string;
      switch (i.entityType) {
        case 'DRIVER':
          entityName = driverMap.get(i.entityId) ?? 'Unknown driver';
          break;
        case 'VEHICLE':
          entityName = vehicleMap.get(i.entityId) ?? 'Unknown vehicle';
          break;
        case 'PARTNER':
          entityName = partnerMap.get(i.entityId) ?? 'Unknown partner';
          break;
        case 'DISPATCH':
          entityName = dispatchMap.get(i.entityId) ?? 'Unknown dispatch';
          break;
        default:
          entityName = 'Unknown';
      }

      return {
        id: i.id,
        createdAt: i.createdAt,
        triggerEvent: i.triggeredEvent,       // e.g. ON_DRIVER_CREATE
        playbookId: i.playbook.id,
        playbookName: i.playbook.name,
        entityType: i.entityType,
        entityName,
      };
    });
  }),
});

async function countInstancesForPlaybook(playbookId: string, tenantId: string): Promise<number> {
  const tenantPrisma = await getTenantPrisma();
  return tenantPrisma.playbookInstance.count({ where: { playbookId, tenantId } });
}
