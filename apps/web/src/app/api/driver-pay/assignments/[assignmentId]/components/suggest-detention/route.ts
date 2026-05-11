import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { suggestDetention } from '@/lib/driver-pay/detention';
import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// GET — detention suggestion preview
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assignmentId } = await params;

  const stopId = req.nextUrl.searchParams.get('stopId');
  if (!stopId) {
    return NextResponse.json(
      { error: 'stopId query parameter is required.' },
      { status: 400 },
    );
  }

  const prisma = await getTenantPrisma();

  // Fetch assignment with its load and contract to get detention rate
  // Note: detentionRatePerHour lives on CarrierContract (not DriverCompensationTemplate)
  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    include: {
      load: {
        include: {
          contract: {
            select: { detentionRatePerHour: true },
          },
        },
      },
    },
  });
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
  }

  // Fetch the CarrierStop — it has arrivedAt, departedAt, freeTimeMinutes
  const stop = await prisma.carrierStop.findFirst({
    where: { id: stopId },
  });
  if (!stop) {
    return NextResponse.json({ error: 'Stop not found.' }, { status: 404 });
  }

  // Missing timestamps — cannot compute detention
  if (!stop.arrivedAt || !stop.departedAt) {
    return NextResponse.json({
      suggestion: null,
      reason: 'Stop has no arrival or departure timestamps.',
    });
  }

  // Determine detention rate: contract rate → org default $25/hr
  const contractRate = assignment.load?.contract?.detentionRatePerHour;
  const detentionRate: Decimal =
    contractRate != null ? new Decimal(contractRate.toString()) : new Decimal('25.00');

  const result = suggestDetention({
    arrivedAt: stop.arrivedAt,
    departedAt: stop.departedAt,
    freeTimeMinutes: stop.freeTimeMinutes ?? 120,
    detentionRate,
  });

  if (result === null) {
    return NextResponse.json({
      suggestion: null,
      reason: 'No detention earned within free time window.',
    });
  }

  return NextResponse.json({
    suggestion: {
      detentionHours: result.detentionHours.toString(),
      detentionRate: result.detentionRate.toString(),
      grossAmount: result.grossAmount.toString(),
    },
  });
}
