/**
 * POST /api/driver-pay/settlements/generate
 *
 * Generate DRAFT settlement(s) for one or more drivers over a period.
 * OWNER only. Idempotent via in-memory cache (5-min TTL).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import {
  generateSettlementsBatch,
  SettlementOverlapError,
  type GenerateResult,
} from '@/lib/driver-pay/settlement-generator';

// ---------------------------------------------------------------------------
// Idempotency cache (in-memory, 5-min TTL — acceptable for v1 serverless)
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: unknown;
  expiresAt: number;
}

const idempotencyCache = new Map<string, CacheEntry>();

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (entry.expiresAt < now) idempotencyCache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  driverIds: z.array(z.string().uuid()).min(1).max(50),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  idempotencyKey: z.string().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializeResult(r: GenerateResult) {
  return {
    settlement: {
      id: r.settlement.id,
      tenantId: r.settlement.tenantId,
      driverId: r.settlement.driverId,
      periodStart: r.settlement.periodStart.toISOString(),
      periodEnd: r.settlement.periodEnd.toISOString(),
      status: r.settlement.status,
      grossTaxable: r.settlement.grossTaxable.toFixed(2),
      grossNonTaxable: r.settlement.grossNonTaxable.toFixed(2),
      totalDeductions: r.settlement.totalDeductions.toFixed(2),
      netPay: r.settlement.netPay.toFixed(2),
      settlementReference: r.settlement.settlementReference,
      createdAt: r.settlement.createdAt.toISOString(),
    },
    assignmentCount: r.assignmentCount,
    bonusCount: r.bonusCount,
    deductionCount: r.deductionCount,
    carryoverApplied: r.carryoverApplied.toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. RBAC — OWNER only
  const role = session.role.toUpperCase();
  if (role !== UserRole.OWNER && role !== UserRole.SYSTEM_ADMIN) {
    return NextResponse.json(
      { error: 'Only owners can generate settlements.' },
      { status: 403 },
    );
  }

  // 3. Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation error.' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // 4. Validate period window
  const periodMs = body.periodEnd.getTime() - body.periodStart.getTime();
  if (periodMs <= 0) {
    return NextResponse.json(
      { error: 'periodEnd must be after periodStart.' },
      { status: 400 },
    );
  }
  const maxMs = 31 * 24 * 60 * 60 * 1000;
  if (periodMs > maxMs) {
    return NextResponse.json(
      { error: 'Period window cannot exceed 31 days.' },
      { status: 400 },
    );
  }

  // 5. Idempotency check
  pruneCache();
  const cacheKey = `${session.tenantId}:${body.idempotencyKey}`;
  const cached = idempotencyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.result, {
      headers: { 'X-Idempotent-Replay': 'true' },
    });
  }

  // 6. Generate
  const prisma = await getTenantPrisma();

  let results;
  try {
    results = await generateSettlementsBatch(prisma, {
      tenantId: session.tenantId,
      driverIds: body.driverIds,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      actorUserId: session.userId,
    });
  } catch (err) {
    if (err instanceof SettlementOverlapError) {
      return NextResponse.json(
        {
          error: 'Settlement overlap conflict.',
          results: [],
          conflicts: [{ driverId: err.driverId, reason: err.message, conflictingSettlementId: err.conflictingSettlementId }],
        },
        { status: 409 },
      );
    }
    throw err;
  }

  const responseBody = {
    results: results.results.map(serializeResult),
    conflicts: results.conflicts,
  };

  // 7. Cache with 5-min TTL
  idempotencyCache.set(cacheKey, {
    result: responseBody,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  revalidatePath('/carrier/driver-pay/settlements');

  const status =
    results.results.length === 0 && results.conflicts.length > 0 ? 409 : 200;

  return NextResponse.json(responseBody, { status });
}
