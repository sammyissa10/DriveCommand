import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const Decimal = Prisma.Decimal;

/**
 * POST /api/mobile/owner/profit-predictor
 *
 * Predicts load profitability using lane-specific or fleet average cost-per-mile.
 * Mirrors the logic in apps/web/src/app/(owner)/actions/profit-predictor.ts
 * but adapted for mobile Bearer token auth (no cookie-based requireRole).
 *
 * Body: { origin: string, destination: string, distanceMiles: number, offeredRate: number }
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  let body: { origin?: unknown; destination?: unknown; distanceMiles?: unknown; offeredRate?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { origin, destination, distanceMiles, offeredRate } = body;

  if (
    typeof origin !== 'string' || !origin.trim() ||
    typeof destination !== 'string' || !destination.trim() ||
    typeof distanceMiles !== 'number' || distanceMiles <= 0 ||
    typeof offeredRate !== 'number' || offeredRate < 0
  ) {
    return NextResponse.json(
      { error: 'origin, destination (strings), distanceMiles and offeredRate (positive numbers) are required' },
      { status: 400 }
    );
  }

  const normalizedOrigin = origin.trim().toUpperCase();
  const normalizedDestination = destination.trim().toUpperCase();

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — no cookie session available.
     * SCOPE: Reads only routes/expenses/payments belonging to the authenticated user's tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // ─── Step 1: Lane analytics (last 365 days) ──────────────────────────
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 365);

      const routes = await tx.route.findMany({
        where: {
          tenantId,
          status: 'COMPLETED',
          completedAt: { gte: cutoffDate },
        },
        select: {
          id: true,
          origin: true,
          destination: true,
          startOdometer: true,
          endOdometer: true,
          expenses: {
            where: { deletedAt: null },
            select: { amount: true },
          },
          payments: {
            where: { deletedAt: null },
            select: { amount: true },
          },
        },
      });

      // Aggregate by lane
      const laneMap = new Map<string, {
        origin: string;
        destination: string;
        routeCount: number;
        totalRevenue: Prisma.Decimal;
        totalExpenses: Prisma.Decimal;
        totalMiles: number;
        hasMileage: boolean;
      }>();

      for (const route of routes) {
        const rOrigin = route.origin.trim().toUpperCase();
        const rDest = route.destination.trim().toUpperCase();
        const laneKey = `${rOrigin} -> ${rDest}`;

        const routeExpenses = route.expenses.reduce(
          (sum: Prisma.Decimal, e: { amount: Prisma.Decimal }) => sum.add(new Decimal(e.amount)),
          new Decimal(0)
        );
        const routeRevenue = route.payments.reduce(
          (sum: Prisma.Decimal, p: { amount: Prisma.Decimal }) => sum.add(new Decimal(p.amount)),
          new Decimal(0)
        );

        const hasMileage =
          route.startOdometer !== null &&
          route.endOdometer !== null &&
          route.endOdometer > route.startOdometer;
        const routeMiles = hasMileage ? (route.endOdometer! - route.startOdometer!) : 0;

        const existing = laneMap.get(laneKey);
        if (existing) {
          existing.routeCount += 1;
          existing.totalRevenue = existing.totalRevenue.add(routeRevenue);
          existing.totalExpenses = existing.totalExpenses.add(routeExpenses);
          if (hasMileage) {
            existing.totalMiles += routeMiles;
            existing.hasMileage = true;
          }
        } else {
          laneMap.set(laneKey, {
            origin: rOrigin,
            destination: rDest,
            routeCount: 1,
            totalRevenue: routeRevenue,
            totalExpenses: routeExpenses,
            totalMiles: hasMileage ? routeMiles : 0,
            hasMileage,
          });
        }
      }

      // ─── Step 2: Try lane-specific cost-per-mile ─────────────────────────
      const laneKey = `${normalizedOrigin} -> ${normalizedDestination}`;
      const matchedLane = laneMap.get(laneKey);

      let costPerMileUsed = '0.00';
      let dataSource: 'lane' | 'fleet' | 'none' = 'none';
      let laneRouteCount: number | null = null;

      if (matchedLane && matchedLane.hasMileage && matchedLane.totalMiles > 0) {
        const laneCostPerMile = matchedLane.totalExpenses
          .div(new Decimal(matchedLane.totalMiles))
          .toDecimalPlaces(2);
        costPerMileUsed = laneCostPerMile.toFixed(2);
        dataSource = 'lane';
        laneRouteCount = matchedLane.routeCount;
      } else {
        // ─── Step 3: Fleet average cost-per-mile (90 days) ─────────────────
        const cutoff90 = new Date();
        cutoff90.setDate(cutoff90.getDate() - 90);

        const fleetRoutes = await tx.route.findMany({
          where: {
            tenantId,
            status: 'COMPLETED',
            startOdometer: { not: null },
            endOdometer: { not: null },
            completedAt: { gte: cutoff90 },
          },
          select: {
            startOdometer: true,
            endOdometer: true,
            expenses: {
              where: { deletedAt: null },
              select: { amount: true },
            },
          },
        });

        const costPerMileValues: Prisma.Decimal[] = [];
        for (const r of fleetRoutes) {
          const miles = r.endOdometer! - r.startOdometer!;
          if (miles <= 0) continue;
          const totalExp = r.expenses.reduce(
            (sum: Prisma.Decimal, e: { amount: Prisma.Decimal }) => sum.add(new Decimal(e.amount)),
            new Decimal(0)
          );
          costPerMileValues.push(totalExp.div(miles));
        }

        if (costPerMileValues.length > 0) {
          const sum = costPerMileValues.reduce((acc, v) => acc.add(v), new Decimal(0));
          const avg = sum.div(costPerMileValues.length).toDecimalPlaces(2);
          costPerMileUsed = avg.toFixed(2);
          dataSource = 'fleet';
        }
      }

      // ─── Step 4: Compute prediction ──────────────────────────────────────
      const costPerMile = new Decimal(costPerMileUsed);
      const predictedExpenses = costPerMile.mul(new Decimal(distanceMiles)).toDecimalPlaces(2);
      const rate = new Decimal(offeredRate);
      const predictedProfit = rate.sub(predictedExpenses).toDecimalPlaces(2);
      const predictedMarginPercent = rate.isZero()
        ? 0
        : predictedProfit.div(rate).mul(100).toDecimalPlaces(1).toNumber();

      let recommendation: 'accept' | 'caution' | 'reject';
      if (dataSource === 'none') {
        recommendation = 'caution';
      } else if (predictedMarginPercent >= 15) {
        recommendation = 'accept';
      } else if (predictedMarginPercent >= 0) {
        recommendation = 'caution';
      } else {
        recommendation = 'reject';
      }

      return {
        predictedExpenses: predictedExpenses.toFixed(2),
        predictedProfit: predictedProfit.toFixed(2),
        predictedMarginPercent,
        costPerMileUsed,
        dataSource,
        laneRouteCount,
        offeredRate: rate.toFixed(2),
        distanceMiles,
        recommendation,
      };
    }, TX_OPTIONS);

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/profit-predictor] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
