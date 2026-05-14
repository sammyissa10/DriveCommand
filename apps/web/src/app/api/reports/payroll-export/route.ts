/**
 * POST /api/reports/payroll-export
 *
 * Streams a payroll export file (CSV) or zip (when employmentType=BOTH)
 * for the selected settlements. ADMIN (OWNER or SYSTEM_ADMIN) only.
 *
 * Request body:
 *   { format: ExportFormat; employmentType: 'W2_EMPLOYEE'|'OWNER_OPERATOR_1099'|'BOTH'; settlementIds: string[] }
 *
 * Responses:
 *   200 — streamed CSV or zip file
 *   400 — Zod validation error
 *   401 — not authenticated
 *   403 — non-ADMIN role
 *   422 — DRAFT settlements included or missing employmentTypeSnapshot
 *   500 — reconciliation error or unexpected server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Readable, PassThrough } from 'node:stream';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { getExporter, PayrollExportReconciliationError } from '@/lib/driver-pay/exporters/index';
import type { SettlementWithLines } from '@/lib/driver-pay/exporters/index';
import type { PrismaClient } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const Body = z.object({
  format: z.enum(['generic_csv', 'quickbooks', 'adp', 'gusto']),
  employmentType: z.enum(['W2_EMPLOYEE', 'OWNER_OPERATOR_1099', 'BOTH']),
  settlementIds: z.array(z.string().uuid()).min(1).max(500),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminRole(role: string): boolean {
  const r = role.toUpperCase();
  return r === UserRole.OWNER || r === UserRole.SYSTEM_ADMIN;
}

/**
 * Parse deductions snapshot from settlement.notes JSON.
 * Returns empty array if notes is null/invalid.
 */
function parseDeductionsSnapshot(
  notes: string | null,
): Array<{ deductionId: string; description: string; amount: string; type: string }> {
  if (!notes) return [];
  try {
    const parsed: unknown = JSON.parse(notes);
    if (
      parsed &&
      typeof parsed === 'object' &&
      '_deductionsApplied' in parsed &&
      Array.isArray((parsed as { _deductionsApplied: unknown[] })._deductionsApplied)
    ) {
      const arr = (parsed as { _deductionsApplied: unknown[] })._deductionsApplied;
      return arr.filter(
        (item): item is { deductionId: string; description: string; amount: string; type: string } =>
          item !== null &&
          typeof item === 'object' &&
          'deductionId' in item &&
          typeof (item as Record<string, unknown>).deductionId === 'string',
      ).map((item) => ({
        deductionId: (item as { deductionId: string }).deductionId,
        description: String((item as Record<string, unknown>).description ?? ''),
        amount: String((item as Record<string, unknown>).amount ?? '0'),
        type: String((item as Record<string, unknown>).type ?? ''),
      }));
    }
  } catch {
    // Malformed JSON — return empty
  }
  return [];
}

/**
 * Convert a Node Readable to a Web ReadableStream for NextResponse.
 */
function nodeReadableToWebStream(readable: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      readable.on('data', (chunk: Buffer | string) => {
        controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      readable.on('end', () => controller.close());
      readable.on('error', (err) => controller.error(err));
    },
    cancel() {
      readable.destroy();
    },
  });
}

function buildFilename(format: string, empType: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `payroll_${format}_${empType}_${date}.${ext}`;
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

  // 2. RBAC — ADMIN (OWNER or SYSTEM_ADMIN) only
  if (!isAdminRole(session.role)) {
    return NextResponse.json(
      { error: 'Forbidden: ADMIN role required for payroll export' },
      { status: 403 },
    );
  }

  // 3. Parse + validate body
  let body: z.infer<typeof Body>;
  try {
    const raw: unknown = await req.json();
    body = Body.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request body', details: err instanceof z.ZodError ? err.issues : String(err) },
      { status: 400 },
    );
  }

  const { format, employmentType, settlementIds } = body;

  // 4. Tenant-scoped prisma
  const prisma = await getTenantPrisma();

  // 5. Fetch settlements
  const dbSettlements = await prisma.driverSettlement.findMany({
    where: {
      id: { in: settlementIds },
      tenantId: session.tenantId,
      deletedAt: null,
    },
    include: {
      driver: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
    },
  });

  // 6. Validate — no DRAFTs, no missing snapshots
  const draftIds = dbSettlements
    .filter((s) => s.status === 'DRAFT')
    .map((s) => s.id);
  if (draftIds.length > 0) {
    return NextResponse.json(
      { error: 'Cannot export DRAFT settlements. Finalize them first.', draftIds },
      { status: 422 },
    );
  }

  const missingSnapshotIds = dbSettlements
    .filter((s) => s.employmentTypeSnapshot === null)
    .map((s) => s.id);
  if (missingSnapshotIds.length > 0) {
    return NextResponse.json(
      {
        error: 'Cannot export settlements without employment type snapshot. Re-finalize them.',
        unfinalizedIds: missingSnapshotIds,
      },
      { status: 422 },
    );
  }

  // 7. Fetch pay components for all settlements via assignment linkage
  const assignmentIds = await prisma.loadDriverAssignment.findMany({
    where: {
      settlementId: { in: settlementIds },
      tenantId: session.tenantId,
      deletedAt: null,
    },
    select: { id: true, settlementId: true },
  });

  const assignmentIdList = assignmentIds.map((a) => a.id);
  const assignmentToSettlement = new Map(
    assignmentIds.map((a) => [a.id, a.settlementId ?? '']),
  );

  const [allPayComponents, allBonuses] = await Promise.all([
    prisma.loadPayComponent.findMany({
      where: { assignmentId: { in: assignmentIdList }, tenantId: session.tenantId, deletedAt: null },
    }),
    (prisma as unknown as PrismaClient).driverBonus.findMany({
      where: { settlementId: { in: settlementIds }, tenantId: session.tenantId, deletedAt: null },
    }),
  ]);

  // Group by settlementId
  const componentsBySettlement = new Map<string, typeof allPayComponents>();
  for (const component of allPayComponents) {
    const sid = assignmentToSettlement.get(component.assignmentId) ?? '';
    if (!sid) continue;
    if (!componentsBySettlement.has(sid)) componentsBySettlement.set(sid, []);
    componentsBySettlement.get(sid)!.push(component);
  }

  const bonusesBySettlement = new Map<string, typeof allBonuses>();
  for (const bonus of allBonuses) {
    if (!bonus.settlementId) continue;
    if (!bonusesBySettlement.has(bonus.settlementId)) bonusesBySettlement.set(bonus.settlementId, []);
    bonusesBySettlement.get(bonus.settlementId)!.push(bonus);
  }

  // 8. Build SettlementWithLines array
  const allSettlements: SettlementWithLines[] = dbSettlements.map((s) => ({
    settlement: s as SettlementWithLines['settlement'],
    payComponents: componentsBySettlement.get(s.id) ?? [],
    bonuses: bonusesBySettlement.get(s.id) ?? [],
    deductionsSnapshot: parseDeductionsSnapshot(s.notes),
  }));

  // 9. Split by employmentTypeSnapshot
  const w2Settlements = allSettlements.filter(
    (s) => s.settlement.employmentTypeSnapshot === 'W2_EMPLOYEE',
  );
  const c1099Settlements = allSettlements.filter(
    (s) => s.settlement.employmentTypeSnapshot === 'OWNER_OPERATOR_1099',
  );

  const exporter = getExporter(format);

  // 10. Write audit log BEFORE streaming response (cannot await after stream starts)
  try {
    await (prisma as unknown as PrismaClient).driverPayAuditLog.create({
      data: {
        tenantId: session.tenantId,
        entityType: 'PayrollExport',
        entityId: session.userId,
        action: 'payroll:exported',
        previousValue: null as unknown as Parameters<PrismaClient['driverPayAuditLog']['create']>[0]['data']['previousValue'],
        newValue: {
          format,
          employmentType,
          settlementCount: dbSettlements.length,
          settlementIds,
          w2Count: w2Settlements.length,
          c1099Count: c1099Settlements.length,
        } as unknown as Parameters<PrismaClient['driverPayAuditLog']['create']>[0]['data']['newValue'],
        actorId: session.userId,
        createdBy: session.userId,
      },
    });
  } catch (auditErr) {
    console.error('[payroll-export] Failed to write audit log:', auditErr);
    // Don't block export on audit failure — log and continue
  }

  // 11. Build response
  try {
    if (employmentType === 'BOTH') {
      // Zip two streams together
      // archiver is CommonJS — use createRequire for Turbopack + vitest compatibility
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const archiverCreate = (require('archiver') as typeof import('archiver'));
      const archive = archiverCreate('zip');
      const passThrough = new PassThrough();
      archive.pipe(passThrough);

      const w2Stream = exporter.build(w2Settlements);
      const c1099Stream = exporter.build(c1099Settlements);

      archive.append(w2Stream, { name: `w2.${exporter.fileExtension}` });
      archive.append(c1099Stream, { name: `1099.${exporter.fileExtension}` });

      void archive.finalize();

      const filename = buildFilename(format, 'both', 'zip');
      return new NextResponse(nodeReadableToWebStream(passThrough), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Transfer-Encoding': 'chunked',
        },
      });
    } else {
      // Single-type export
      const filtered =
        employmentType === 'W2_EMPLOYEE' ? w2Settlements : c1099Settlements;
      const stream = exporter.build(filtered);
      const filename = buildFilename(format, employmentType, exporter.fileExtension);

      return new NextResponse(nodeReadableToWebStream(stream), {
        status: 200,
        headers: {
          'Content-Type': exporter.mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Transfer-Encoding': 'chunked',
        },
      });
    }
  } catch (err) {
    if (err instanceof PayrollExportReconciliationError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
