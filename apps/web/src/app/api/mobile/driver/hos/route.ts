import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import type { HOSStatus, HOSEntry, HOSData } from '@drivecommand/types';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const VALID_STATUSES: HOSStatus[] = ['OFF_DUTY', 'SLEEPER_BERTH', 'DRIVING', 'ON_DUTY'];

/**
 * GET /api/mobile/driver/hos
 *
 * Returns today's HOS entries for the authenticated driver with calculated
 * clock values (14-hour window, 11-hour drive limit, time in current status).
 *
 * Requires: Authorization: Bearer <token>
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { driverId, tenantId } = auth;

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const data = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Today's UTC boundaries
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setUTCHours(23, 59, 59, 999);

      // Fetch entries: today's entries OR the currently open entry (started before today)
      const rawEntries = await tx.driverHOSEntry.findMany({
        where: {
          driverId,
          tenantId,
          OR: [
            { startTime: { gte: startOfDay, lte: endOfDay } },
            { endTime: null },
          ],
        },
        orderBy: { startTime: 'asc' },
      });

      // Map Prisma records to HOSEntry shape
      const todayEntries: HOSEntry[] = rawEntries.map((e) => ({
        id: e.id,
        tenantId: e.tenantId,
        driverId: e.driverId,
        status: e.status as HOSStatus,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime ? e.endTime.toISOString() : null,
        location: null,
        notes: e.notes ?? null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }));

      // Determine current status from the open entry (endTime IS NULL)
      const openEntry = todayEntries.find((e) => e.endTime == null);
      const currentStatus: HOSStatus = openEntry ? openEntry.status : 'OFF_DUTY';
      const currentStatusSince: string = openEntry
        ? openEntry.startTime
        : startOfDay.toISOString();

      // timeInCurrentStatus: seconds since currentStatusSince
      const currentStatusSinceMs = new Date(currentStatusSince).getTime();
      const timeInCurrentStatus = Math.floor((now.getTime() - currentStatusSinceMs) / 1000);

      // Clock calculations — only count entries that started today
      const todayOnlyEntries = rawEntries.filter(
        (e) => e.startTime >= startOfDay && e.startTime <= endOfDay
      );

      let drivingMinutesToday = 0;
      let onDutyMinutesToday = 0;

      for (const entry of todayOnlyEntries) {
        const entryStart = entry.startTime.getTime();
        const entryEnd = entry.endTime ? entry.endTime.getTime() : now.getTime();
        const durationMinutes = (entryEnd - entryStart) / 1000 / 60;

        if (entry.status === 'DRIVING') {
          drivingMinutesToday += durationMinutes;
          onDutyMinutesToday += durationMinutes;
        } else if (entry.status === 'ON_DUTY') {
          onDutyMinutesToday += durationMinutes;
        }
      }

      // 14-hour window starts from the first non-OFF_DUTY/non-SLEEPER_BERTH entry of the day
      const firstDutyEntry = todayOnlyEntries.find(
        (e) => e.status !== 'OFF_DUTY' && e.status !== 'SLEEPER_BERTH'
      );
      let hoursUntil14Limit = 14;
      if (firstDutyEntry) {
        const windowStartMs = firstDutyEntry.startTime.getTime();
        const windowElapsedHours = (now.getTime() - windowStartMs) / 1000 / 3600;
        hoursUntil14Limit = Math.max(0, 14 - windowElapsedHours);
      }

      const hoursUntil11DriveLimit = Math.max(0, 11 - drivingMinutesToday / 60);

      const hosData: HOSData = {
        currentStatus,
        currentStatusSince,
        timeInCurrentStatus,
        todayEntries,
        drivingMinutesToday,
        onDutyMinutesToday,
        hoursUntil14Limit,
        hoursUntil11DriveLimit,
      };

      return hosData;
    }, TX_OPTIONS);

    return NextResponse.json(data);
  } catch (err) {
    logger.error('[mobile/driver/hos GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/driver/hos
 *
 * Records a duty status change for the authenticated driver.
 * Closes the current open entry and creates a new one with the requested status.
 *
 * Body: { status: HOSStatus, notes?: string }
 * Returns: 201 { entry: HOSEntry }
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { driverId, tenantId } = auth;

  let body: { status?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { status, notes } = body;

  // Validate status
  if (!status || !VALID_STATUSES.includes(status as HOSStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const requestedStatus = status as HOSStatus;
  const notesStr = typeof notes === 'string' ? notes : undefined;

  try {
    const newEntry = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Find the current open entry
      const openEntry = await tx.driverHOSEntry.findFirst({
        where: { driverId, tenantId, endTime: null },
        orderBy: { startTime: 'desc' },
      });

      // Guard against duplicate status
      if (openEntry && openEntry.status === requestedStatus) {
        return null; // signal duplicate
      }

      const now = new Date();

      // Close the open entry if one exists
      if (openEntry) {
        await tx.driverHOSEntry.update({
          where: { id: openEntry.id },
          data: { endTime: now },
        });
      }

      // Create new entry
      const created = await tx.driverHOSEntry.create({
        data: {
          tenantId,
          driverId,
          status: requestedStatus,
          startTime: now,
          notes: notesStr,
        },
      });

      return created;
    }, TX_OPTIONS);

    // Duplicate status — return 400 outside transaction
    if (newEntry === null) {
      return NextResponse.json({ error: 'Already in this status' }, { status: 400 });
    }

    const entry: HOSEntry = {
      id: newEntry.id,
      tenantId: newEntry.tenantId,
      driverId: newEntry.driverId,
      status: newEntry.status as HOSStatus,
      startTime: newEntry.startTime.toISOString(),
      endTime: newEntry.endTime ? newEntry.endTime.toISOString() : null,
      location: null,
      notes: newEntry.notes ?? null,
      createdAt: newEntry.createdAt.toISOString(),
      updatedAt: newEntry.updatedAt.toISOString(),
    };

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    logger.error('[mobile/driver/hos POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
