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
import { prisma } from '@/lib/db/prisma';
import { RECIPES, getRecipeByKey } from '@/server/services/workflows/recipes';
import { enableRecipeSchema, disableRecipeSchema } from '@drivecommand/validation';
import type { Prisma } from '@/generated/prisma';

export const triggerRouter = router({
  /** List all pre-built recipes with per-tenant enabled state + play count. */
  listRecipes: adminProcedure.query(async ({ ctx }) => {
    // Load all active PlaybookTrigger rows for this tenant
    const triggers = await prisma.playbookTrigger.findMany({
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

    // Validate playbookId belongs to this tenant
    const playbook = await prisma.playbook.findFirst({
      where: { id: input.playbookId, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!playbook) throw new TRPCError({ code: 'NOT_FOUND', message: 'Playbook not found' });

    // Upsert — one active trigger per (tenantId, recipeKey) by matching on event + playbookId
    const existing = await prisma.playbookTrigger.findFirst({
      where: {
        tenantId: ctx.tenantId,
        triggerEvent: recipe.triggerEvent,
        playbookId: input.playbookId,
      },
    });

    if (existing) {
      return prisma.playbookTrigger.update({
        where: { id: existing.id },
        data: { isActive: true, conditions: recipe.conditions as Prisma.InputJsonValue },
      });
    }

    return prisma.playbookTrigger.create({
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

    // Find all triggers matching this recipe's event for this tenant
    // then filter by conditions client-side (Prisma's Json filter doesn't support deep equality reliably)
    const candidates = await prisma.playbookTrigger.findMany({
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

    const result = await prisma.playbookTrigger.updateMany({
      where: { id: { in: matchingIds } },
      data: { isActive: false },
    });

    return { disabled: result.count };
  }),
});

async function countInstancesForPlaybook(playbookId: string, tenantId: string): Promise<number> {
  return prisma.playbookInstance.count({ where: { playbookId, tenantId } });
}
